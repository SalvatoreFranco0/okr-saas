// Bootstrap del super-admin e dell'organizzazione iniziale (piano 10.3). Idempotente.
//
// Uso (Node >= 22, nessuna dipendenza da installare; il service_role NON va salvato in nessun file):
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<chiave> \
//   node --experimental-strip-types scripts/bootstrap-super-admin.ts \
//     --email persona@example.com --org-name "Azienda" --org-slug azienda \
//     --confirm-host <ref>.supabase.co [--site-url https://app.example.com] [--first-name Nome --last-name Cognome]
//
// Cosa fa, in quest'ordine, saltando i passi già fatti:
//   1. trova l'utente per email oppure lo invita (email per impostare la password);
//   2. imposta app_metadata.platform_admin = true (indizio UX per il blocco MFA: la barriera reale è la RLS);
//   3. inserisce la riga in public.platform_admins;
//   4. crea l'organizzazione (e, se nuova, un periodo del trimestre corrente);
//   5. crea la membership `admin` tramite public.admin_apply_member.
// Dopo il primo login l'utente attiva il TOTP dalla pagina Sicurezza (obbligatorio per i privilegi di super-admin).
//
// Sicurezza: la chiave arriva solo dall'ambiente del processo, non viene mai stampata né scritta; lo script
// rifiuta di partire se --confirm-host non coincide con l'host di SUPABASE_URL (protegge da un URL sbagliato).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}$/;

interface Args {
  email: string;
  orgName: string;
  orgSlug: string;
  confirmHost: string;
  siteUrl?: string;
  firstName?: string;
  lastName?: string;
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
  if (!EMAIL_RE.test(email)) throw new Error('Email non valida');
  if (!SLUG_RE.test(orgSlug)) throw new Error('org-slug non valido (minuscole, numeri e trattini, 2-63 caratteri)');
  if (orgName.length < 1 || orgName.length > 200) throw new Error('org-name deve avere 1-200 caratteri');
  return {
    email, orgName, orgSlug,
    confirmHost: need('confirm-host').trim(),
    siteUrl: map.get('site-url'),
    firstName: map.get('first-name'),
    lastName: map.get('last-name'),
  };
}

class Api {
  constructor(private base: string, private key: string) {}

  async call<T>(method: string, path: string, body?: unknown, extra: Record<string, string> = {}): Promise<{ status: number; data: T }> {
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
      data = text;
    }
    return { status: res.status, data: data as T };
  }
}

function fail(msg: string): never {
  console.error(`Errore: ${msg}`);
  process.exit(1);
}

const quarterPeriod = (d: Date) => {
  const q = Math.floor(d.getUTCMonth() / 3);
  const y = d.getUTCFullYear();
  const start = new Date(Date.UTC(y, q * 3, 1));
  const end = new Date(Date.UTC(y, q * 3 + 3, 0));
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  return { name: `Q${q + 1} ${y}`, start_date: iso(start), end_date: iso(end) };
};

async function main() {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    fail((e as Error).message);
  }
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) fail('imposta SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nell\'ambiente del processo');
  const host = new URL(url).host;
  if (host !== args.confirmHost) fail(`--confirm-host (${args.confirmHost}) non coincide con l'host di SUPABASE_URL (${host})`);

  const api = new Api(url, key);
  console.log(`Progetto: ${host}`);

  // 1. Utente: cerca per email (pagine da 200), altrimenti invita.
  let userId: string | null = null;
  for (let page = 1; page <= 50 && !userId; page++) {
    const r = await api.call<{ users?: { id: string; email?: string }[] }>('GET', `/auth/v1/admin/users?page=${page}&per_page=200`);
    if (r.status !== 200) fail(`elenco utenti non disponibile (HTTP ${r.status})`);
    const users = r.data.users ?? [];
    userId = users.find((u) => u.email?.toLowerCase() === args.email)?.id ?? null;
    if (users.length < 200) break;
  }
  if (userId) {
    console.log('Utente: già registrato, lo riuso');
  } else {
    const redirect = args.siteUrl ? `?redirect_to=${encodeURIComponent(`${args.siteUrl.replace(/\/+$/, '')}/set-password`)}` : '';
    const r = await api.call<{ id?: string }>('POST', `/auth/v1/invite${redirect}`, {
      email: args.email,
      data: { first_name: args.firstName ?? '', last_name: args.lastName ?? '' },
    });
    if (r.status !== 200 || !r.data.id) fail(`invito non riuscito (HTTP ${r.status})`);
    userId = r.data.id;
    console.log('Utente: creato, invito inviato per email');
  }

  // 2. Indizio UX per il blocco MFA (non concede alcun accesso).
  const meta = await api.call('PUT', `/auth/v1/admin/users/${userId}`, { app_metadata: { platform_admin: true } });
  if (meta.status !== 200) fail(`aggiornamento app_metadata non riuscito (HTTP ${meta.status})`);

  // 3. platform_admins (idempotente).
  const pa = await api.call('POST', '/rest/v1/platform_admins?on_conflict=user_id', { user_id: userId }, { prefer: 'resolution=ignore-duplicates,return=minimal' });
  if (pa.status !== 201 && pa.status !== 200 && pa.status !== 204) fail(`platform_admins non aggiornata (HTTP ${pa.status})`);
  console.log('Super-admin: registrato');

  // 4. Organizzazione.
  const found = await api.call<{ id: string }[]>('GET', `/rest/v1/organizations?slug=eq.${encodeURIComponent(args.orgSlug)}&select=id`);
  if (found.status !== 200) fail(`ricerca organizzazione non riuscita (HTTP ${found.status})`);
  let orgId = found.data[0]?.id;
  if (orgId) {
    console.log('Organizzazione: esiste già, la riuso');
  } else {
    const created = await api.call<{ id: string }[]>('POST', '/rest/v1/organizations', { name: args.orgName, slug: args.orgSlug }, { prefer: 'return=representation' });
    if (created.status !== 201 || !created.data[0]?.id) fail(`creazione organizzazione non riuscita (HTTP ${created.status})`);
    orgId = created.data[0].id;
    const p = await api.call('POST', '/rest/v1/periods', { organization_id: orgId, ...quarterPeriod(new Date()) }, { prefer: 'return=minimal' });
    if (p.status !== 201) fail(`creazione periodo iniziale non riuscita (HTTP ${p.status})`);
    console.log('Organizzazione: creata con il periodo del trimestre corrente');
  }

  // 5. Membership Admin (atomica, idempotente).
  const m = await api.call('POST', '/rest/v1/rpc/admin_apply_member', { p_org: orgId, p_user: userId, p_role: 'admin', p_is_active: true });
  if (m.status !== 200 && m.status !== 204) fail(`membership non creata (HTTP ${m.status})`);
  console.log('Membership: admin');
  console.log('Fatto. Al primo accesso attiva il TOTP da Sicurezza (obbligatorio per i privilegi di super-admin).');
}

void main();
