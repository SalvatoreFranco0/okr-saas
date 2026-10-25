-- 0009: FIX di sicurezza. Chi ha un fattore MFA verificato deve presentare un JWT aal2 per
-- accedere ai dati delle proprie organizzazioni.
--
-- Problema: fino alla 0008 private.my_access() concedeva le membership anche con un JWT aal1.
-- Il gate della UI chiede il TOTP, ma chi ha rubato la password puo' fare login (aal1) e
-- chiamare direttamente l'API REST: la RLS lo lasciava passare, quindi il TOTP era aggirabile.
--
-- Fix: nel CTE "member" le membership valgono solo se
--   * il JWT e' aal2, oppure
--   * l'utente NON ha alcun fattore MFA in stato 'verified' in auth.mfa_factors.
-- Con un fattore verificato e un JWT aal1 la mappa e' vuota ('{}'): nessuna organizzazione,
-- nessun dato di dominio, nessun profilo dei pari (org_peer_ids usa la stessa mappa),
-- nessuna rubrica (member_directory). Resta leggibile solo il proprio profilo
-- (profiles_select: id = auth.uid()), che non dipende da my_access().
--
-- Scelte:
-- * Si considera QUALSIASI fattore verificato, non solo factor_type = 'totp': oggi l'app usa
--   solo TOTP, ma un fattore phone/webauthn verificato porterebbe allo stesso bypass. Non
--   filtrare sul tipo evita anche di dipendere dalle etichette dell'enum auth.factor_type.
--   I fattori 'unverified' (iscrizione iniziata e non completata) NON contano: l'utente non
--   potrebbe ancora raggiungere aal2 e resterebbe chiuso fuori.
-- * La sessione di supporto del super-admin non cambia: richiede gia' is_platform_admin(),
--   cioe' aal2. is_platform_admin() non viene modificata.
-- * Lettura di auth.mfa_factors: la funzione e' SECURITY DEFINER e il proprietario e' il ruolo
--   che esegue le migrazioni (postgres), come per le altre funzioni di private. Su Supabase
--   postgres ha i privilegi sulle tabelle di auth (le stesse su cui seed e test scrivono
--   auth.users) e BYPASSRLS, quindi legge auth.mfa_factors anche se il chiamante
--   (authenticated) non ne ha. search_path vuoto: la tabella e' sempre qualificata.
-- * Prestazioni: la condizione e' una sola NOT EXISTS non correlata con le righe di
--   memberships (dipende solo da auth.uid()), quindi il planner la valuta una volta per
--   chiamata come filtro costante (InitPlan). La mappa stessa si valuta una volta per query
--   tramite (select private.my_access()) nelle policy. La ricerca usa l'indice di GoTrue su
--   auth.mfa_factors(user_id) (mfa_factors_user_id_idx / factor_id_created_at_idx).
--   Il costo aggiunto e' quindi un index scan per query, anche per chi non ha fattori.
-- * Trade-off: chi attiva il TOTP deve completare la verifica a ogni login (aal2) prima di
--   vedere qualunque dato; un token aal1 emesso prima dell'iscrizione al TOTP perde l'accesso
--   appena il fattore diventa verified (al refresh GoTrue emette aal2 solo dopo la verifica).
--   E' il comportamento voluto: il secondo fattore, se presente, e' obbligatorio.
--
-- Tutto il resto e' invariato: stessa forma dell'output, stable, security definer,
-- search_path vuoto, stessi grant/revoke.

create or replace function private.my_access()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with support as (
    select distinct s.organization_id
      from public.support_sessions s
     where s.platform_admin_id = auth.uid()
       and s.ended_at is null
       and s.started_at <= now()
       and s.expires_at > now()
       and private.is_platform_admin()
  ),
  member as (
    select m.organization_id,
           m.role,
           coalesce((select jsonb_agg(ml.location_id)
                       from public.membership_locations ml
                      where ml.organization_id = m.organization_id
                        and ml.user_id = m.user_id), '[]'::jsonb) as locations,
           coalesce((select jsonb_agg(tm.team_id)
                       from public.team_members tm
                      where tm.organization_id = m.organization_id
                        and tm.user_id = m.user_id), '[]'::jsonb) as teams
      from public.memberships m
      join public.organizations o on o.id = m.organization_id
     where m.user_id = auth.uid()
       and m.is_active
       and o.is_active
       and m.organization_id not in (select organization_id from support)
       -- MFA: con un fattore verificato serve un JWT aal2 (vedi intestazione).
       and (
         coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
         or not exists (
           select 1
             from auth.mfa_factors f
            where f.user_id = auth.uid()
              and f.status = 'verified'
         )
       )
  )
  select coalesce(jsonb_object_agg(x.org, x.val), '{}'::jsonb)
    from (
      select organization_id::text as org,
             jsonb_build_object('role', role, 'locations', locations, 'teams', teams, 'support', false) as val
        from member
      union all
      select organization_id::text,
             jsonb_build_object('role', 'admin', 'locations', '[]'::jsonb, 'teams', '[]'::jsonb, 'support', true)
        from support
    ) x;
$$;
revoke execute on function private.my_access() from public, anon;
grant execute on function private.my_access() to authenticated;
