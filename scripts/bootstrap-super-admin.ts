// Bootstrap del super-admin e dell'organizzazione iniziale (piano 10.3). Idempotente.
//
// Uso (Node >= 22, nessuna dipendenza da installare). Il service_role NON va salvato in nessun file e
// non va scritto nella riga di comando (resterebbe nella cronologia della shell). In PowerShell:
//   $env:SUPABASE_URL = "https://<ref>.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY = Read-Host -MaskInput "service_role"   # digitata a video, non registrata
//   node --experimental-strip-types scripts/bootstrap-super-admin.ts `
//     --email persona@example.com --org-name "Azienda" --org-slug azienda `
//     --site-url https://<app> --confirm-host <ref>.supabase.co [--first-name Nome --last-name Cognome]
//   Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY
//
// Cosa fa, in quest'ordine, saltando i passi già fatti:
//   1. trova l'utente per email oppure lo invita (email per impostare la password); un utente esistente ma
//      mai confermato e mai invitato NON viene promosso (possibile pre-registrazione di terzi);
//   2. imposta app_metadata.platform_admin = true (indizio UX per il blocco MFA: la barriera reale è la RLS);
//   3. inserisce la riga in public.platform_admins;
//   4. crea l'organizzazione (se esiste con altri membri e l'utente non ne fa già parte, si ferma) e,
//      se manca, il periodo del trimestre corrente;
//   5. crea la membership `admin` tramite public.admin_apply_member.
// Dopo il primo login l'utente attiva il TOTP dalla pagina Sicurezza (obbligatorio per i privilegi di super-admin).
//
// Sicurezza: la chiave arriva solo dall'ambiente del processo, non viene mai stampata né scritta; si accetta
// solo https (o localhost); --confirm-host deve coincidere con l'host di SUPABASE_URL e, per le chiavi in
// formato JWT, il claim `ref` deve corrispondere al progetto. Gli errori mostrano stato e codice, mai il corpo.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}$/;

interface Args {
  email: string;
  orgName: string;
  orgSlug: string;
  confirmHost: string;
  siteUrl: string;
  firstName?: string;
  lastName?: string;
}

/** URL di redirect dell'invito: origin + '/set-password' (solo http/https assoluti). */
function setPasswordRedirect(siteUrl: string): string {
  const u = new URL(siteUrl.trim());
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('--site-url deve essere un URL http(s)');
  return `${u.origin}${u.pathname.replace(/\/+$/, '')}/set-password`;
}

function parseArgs(argv: string[]): Args {
  const map = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`Argomento non riconosciuto: ${a}`);
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) throw new Error(`Manca il valore di ${a}`);
    map.set(a.slice(2), v);
    i++;
  }
  const need = (k: string) => {
    const v = map.get(k);
    if (!v) throw new Error(`Manca --${k}`);
    return v;
  };
  const email = need('email').trim().toLowerCase();
  const orgSlug = need('org-slug').trim();
  const orgName = need('org-name').trim();
  const siteUrl = need('site-url').trim();
  if (!EMAIL_RE.test(email)) throw new Error('Email non valida');
  if (!SLUG_RE.test(orgSlug)) throw new Error('org-slug non valido (minuscole, numeri e trattini, 2-63 caratteri)');
  if (orgName.length < 1 || orgName.length > 200) throw new Error('org-name deve avere 1-200 caratteri');
  setPasswordRedirect(siteUrl); // valida
  return {
    email, orgName, orgSlug, siteUrl,
    confirmHost: need('confirm-host').trim(),
    firstName: map.get('first-name'),
    lastName: map.get('last-name'),
  };
}

interface ApiResult<T> {
  status: number;
  data: T;
}

class Api {
  base: string;
  key: string;
  constructor(base: string, key: string) {
    this.base = base;
    this.key = key;
  }

  async call<T>(method: string, path: string, body?: unknown, extra: Record<string, string> = {}): Promise<ApiResult<T>> {
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: {
        apikey: this.key,
        authorization: `Bearer ${this.key}`,
        'content-type': 'application/json',
        ...extra,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    return { status: res.status, data: data as T };
  }
}

/** Codice d'errore sicuro da mostrare (PostgREST: code/hint; GoTrue: error_code). Mai il messaggio né il corpo. */
function errCode(data: unknown): string {
  const d = (data ?? {}) as { code?: unknown; hint?: unknown; error_code?: unknown };
  const parts = [d.code, d.error_code, d.hint].filter((x): x is string => typeof x === 'string' && x.length < 60);
  return parts.length ? ` ${parts.join(' ')}` : '';
}

function fail(msg: string): never {
  console.error(`Errore: ${msg}`);
  process.exit(1);
}

function failHttp(what: string, r: ApiResult<unknown>): never {
  return fail(`${what} (HTTP ${r.status}${errCode(r.data)})`);
}

const quarterPeriod = (d: Date) => {
  const q = Math.floor(d.getUTCMonth() / 3);
  const y = d.getUTCFullYear();
  const start = new Date(Date.UTC(y, q * 3, 1));
  const end = new Date(Date.UTC(y, q * 3 + 3, 0));
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  return { name: `Q${q + 1} ${y}`, start_date: iso(start), end_date: iso(end) };
};

/** Per le chiavi JWT: ruolo service_role e progetto coerente con l'URL. Le chiavi in altro formato non si ispezionano. */
function checkKeyMatchesProject(key: string, hostname: string): void {
  const parts = key.split('.');
  if (parts.length !== 3) return;
  let claims: { role?: string; ref?: string };
  try {
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return;
  }
  if (claims.role && claims.role !== 'service_role') fail('la chiave non è una service_role');
  if (claims.ref && !hostname.startsWith(`${claims.ref}.`)) fail('la chiave appartiene a un altro progetto');
}

interface AuthUser {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
  last_sign_in_at?: string | null;
  invited_at?: string | null;
}

async function main() {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    return fail((e as Error).message);
  }
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return fail("imposta SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nell'ambiente del processo");
  const parsed = new URL(url);
  const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (parsed.protocol !== 'https:' && !isLocal) return fail('SUPABASE_URL deve usare https');
  if (parsed.host !== args.confirmHost) {
    return fail(`--confirm-host (${args.confirmHost}) non coincide con l'host di SUPABASE_URL (${parsed.host})`);
  }
  checkKeyMatchesProject(key, parsed.hostname);

  const api = new Api(url, key);
  const redirect = `?redirect_to=${encodeURIComponent(setPasswordRedirect(args.siteUrl))}`;
  const invite = () =>
    api.call<{ id?: string }>('POST', `/auth/v1/invite${redirect}`, {
      email: args.email,
      data: { first_name: args.firstName ?? '', last_name: args.lastName ?? '' },
    });
  console.log(`Progetto: ${parsed.host}`);

  // 1. Utente: cerca per email (pagine da 200), altrimenti invita.
  let existing: AuthUser | null = null;
  for (let page = 1; page <= 50 && !existing; page++) {
    const r = await api.call<{ users?: AuthUser[] }>('GET', `/auth/v1/admin/users?page=${page}&per_page=200`);
    if (r.status !== 200) failHttp('elenco utenti non disponibile', r);
    const users = r.data.users ?? [];
    existing = users.find((u) => u.email?.toLowerCase() === args.email) ?? null;
    if (users.length < 200) break;
  }
  let userId: string;
  if (existing) {
    userId = existing.id;
    const never = !existing.email_confirmed_at && !existing.last_sign_in_at;
    if (never) {
      if (!existing.invited_at) {
        return fail("l'utente esiste ma non è confermato né invitato (forse registrato da terzi): verifica a mano, non lo promuovo");
      }
      const r = await invite();
      if (r.status !== 200) failHttp('reinvio non riuscito', r);
      console.log("Utente: invito non ancora accettato, l'ho reinviato");
    } else {
      console.log('Utente: già registrato, lo riuso');
    }
  } else {
    const r = await invite();
    if (r.status !== 200 || !r.data.id) failHttp('invito non riuscito', r);
    userId = r.data.id as string;
    console.log('Utente: creato, invito inviato per email');
  }

  // 2. Indizio UX per il blocco MFA (non concede alcun accesso).
  const meta = await api.call('PUT', `/auth/v1/admin/users/${userId}`, { app_metadata: { platform_admin: true } });
  if (meta.status !== 200) failHttp('aggiornamento app_metadata non riuscito', meta);

  // 3. platform_admins (idempotente).
  const pa = await api.call('POST', '/rest/v1/platform_admins?on_conflict=user_id', { user_id: userId }, { prefer: 'resolution=ignore-duplicates,return=minimal' });
  if (pa.status !== 201 && pa.status !== 200 && pa.status !== 204) failHttp('platform_admins non aggiornata', pa);
  console.log('Super-admin: registrato');

  // 4. Organizzazione: nuova, oppure esistente solo se è già "sua" o se è vuota e con lo stesso nome.
  const slugQ = encodeURIComponent(args.orgSlug);
  const found = await api.call<{ id: string; name: string }[]>('GET', `/rest/v1/organizations?slug=eq.${slugQ}&select=id,name`);
  if (found.status !== 200) failHttp('ricerca organizzazione non riuscita', found);
  let orgId = found.data[0]?.id;
  if (orgId) {
    const mine = await api.call<unknown[]>('GET', `/rest/v1/memberships?organization_id=eq.${orgId}&user_id=eq.${userId}&role=eq.admin&select=user_id&limit=1`);
    if (mine.status !== 200) failHttp('lettura membership non riuscita', mine);
    if (mine.data.length === 0) {
      if (found.data[0].name !== args.orgName) return fail("lo slug è già usato da un'altra organizzazione: non la riuso");
      const others = await api.call<unknown[]>('GET', `/rest/v1/memberships?organization_id=eq.${orgId}&select=user_id&limit=1`);
      if (others.status !== 200) failHttp('lettura membership non riuscita', others);
      if (others.data.length > 0) return fail('organizzazione esistente con altri membri: non la riuso (userebbe un accesso senza sessione di supporto)');
    }
    console.log('Organizzazione: esiste già, la riuso');
  } else {
    const created = await api.call<{ id: string }[]>('POST', '/rest/v1/organizations', { name: args.orgName, slug: args.orgSlug }, { prefer: 'return=representation' });
    if (created.status !== 201 || !created.data[0]?.id) failHttp('creazione organizzazione non riuscita', created);
    orgId = created.data[0].id;
    console.log('Organizzazione: creata');
  }
  // Periodo iniziale: indipendente dal ramo, così un'esecuzione interrotta si completa al rilancio.
  const hasPeriod = await api.call<unknown[]>('GET', `/rest/v1/periods?organization_id=eq.${orgId}&select=id&limit=1`);
  if (hasPeriod.status !== 200) failHttp('lettura periodi non riuscita', hasPeriod);
  if (hasPeriod.data.length === 0) {
    const p = await api.call('POST', '/rest/v1/periods', { organization_id: orgId, ...quarterPeriod(new Date()) }, { prefer: 'return=minimal' });
    if (p.status !== 201) failHttp('creazione periodo iniziale non riuscita', p);
    console.log('Periodo: creato (trimestre corrente)');
  }

  // 5. Membership Admin (atomica, idempotente).
  const m = await api.call('POST', '/rest/v1/rpc/admin_apply_member', { p_org: orgId, p_user: userId, p_role: 'admin', p_is_active: true });
  if (m.status !== 200 && m.status !== 204) failHttp('membership non creata', m);
  console.log('Membership: admin');
  console.log('Fatto. Al primo accesso attiva il TOTP da Sicurezza (obbligatorio per i privilegi di super-admin).');
}

main().catch((e) => {
  // Mai stampare l'errore grezzo: in Node alcune eccezioni di rete includono i dati della richiesta.
  fail(e instanceof TypeError ? 'errore di rete o URL non valido' : 'errore inatteso');
});
