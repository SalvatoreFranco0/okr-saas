-- 0012: audit della piattaforma (azioni del super-admin: creazione/disattivazione/purge di
-- organizzazioni, sessioni di supporto, gestione dei platform admin).
-- Retrocompatibile: solo oggetti nuovi; nessuna tabella o funzione esistente viene toccata.
--
-- Scelte:
-- * Tabella separata da audit_logs: audit_logs e' per tenant (FK con cascade verso
--   organizations, letta da Admin/Manager dell'organizzazione) e sparisce con la purge.
--   platform_audit_logs invece deve SOPRAVVIVERE alla purge (deve restare traccia proprio
--   della purge): organization_id e actor_id sono uuid tecnici SENZA FK, e organization_slug
--   conserva il nome leggibile del tenant anche quando la riga di organizations non c'e' piu'.
-- * Lettura solo al super-admin con aal2: policy con (select private.is_platform_admin()),
--   valutata una volta per query, come platform_admins/support_sessions (0005).
-- * Scrittura solo da service_role (Edge Functions admin): grant select, insert e nessun
--   altro privilegio, nemmeno a service_role (Supabase per default concede ALL su ogni nuova
--   tabella di public ad anon, authenticated e service_role: qui si revoca tutto e si
--   concede solo il necessario). Nessuna policy di insert/update/delete: per authenticated
--   l'insert e' comunque negato a livello di privilegio (42501).
-- * Append-only: trigger BEFORE UPDATE OR DELETE e BEFORE TRUNCATE (a livello di statement,
--   quindi scattano anche se lo statement non tocca righe) che sollevano 42501 per CHIUNQUE,
--   anche postgres o service_role con privilegi concessi per errore. Limite noto: il
--   proprietario della tabella (postgres) potrebbe disabilitare o eliminare il trigger con
--   DDL esplicito; questo passa solo da una migrazione revisionata, mai dai client.
-- * La funzione trigger e' SECURITY INVOKER: non legge tabelle ne' chiama altre funzioni di
--   private, quindi non le serve alcun privilegio; i trigger non verificano EXECUTE ne' USAGE
--   sullo schema al momento dell'esecuzione. search_path vuoto ed execute revocato comunque.

-- ---------------------------------------------------------------------------
-- platform_audit_logs
-- ---------------------------------------------------------------------------
create table if not exists public.platform_audit_logs (
  id                uuid primary key default gen_random_uuid(),
  -- uuid tecnici senza FK: la riga deve sopravvivere alla revoca/eliminazione del
  -- super-admin e alla purge del tenant.
  actor_id          uuid null,
  organization_id   uuid null,
  -- Copia dello slug al momento dell'azione: resta leggibile dopo la purge.
  organization_slug text null,
  action            text not null check (length(action) between 1 and 100),
  details           jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);
create index if not exists platform_audit_logs_created_idx
  on public.platform_audit_logs (created_at desc);
create index if not exists platform_audit_logs_org_created_idx
  on public.platform_audit_logs (organization_id, created_at desc);

alter table public.platform_audit_logs enable row level security;
alter table public.platform_audit_logs force  row level security;
revoke all on table public.platform_audit_logs from public, anon, authenticated, service_role;
grant select         on public.platform_audit_logs to authenticated;
grant select, insert on public.platform_audit_logs to service_role;

drop policy if exists platform_audit_logs_select on public.platform_audit_logs;
create policy platform_audit_logs_select on public.platform_audit_logs
  for select to authenticated
  using ((select private.is_platform_admin()));
-- Nessuna policy di insert/update/delete: scrive solo service_role (BYPASSRLS).

-- ---------------------------------------------------------------------------
-- Append-only
-- ---------------------------------------------------------------------------
create or replace function private.platform_audit_logs_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'platform_audit_logs e'' append-only: % non consentito', tg_op
    using errcode = '42501';
end;
$$;
revoke execute on function private.platform_audit_logs_append_only() from public, anon, authenticated, service_role;

create or replace trigger t10_append_only before update or delete on public.platform_audit_logs
  for each statement execute function private.platform_audit_logs_append_only();
create or replace trigger t10_append_only_truncate before truncate on public.platform_audit_logs
  for each statement execute function private.platform_audit_logs_append_only();

-- ---------------------------------------------------------------------------
-- Verifica finale: RLS abilitata e forzata, anon senza privilegi, nessuna FK.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_class c
                  where c.oid = 'public.platform_audit_logs'::regclass
                    and c.relrowsecurity and c.relforcerowsecurity) then
    raise exception 'platform_audit_logs senza RLS abilitata e forzata';
  end if;
  if has_table_privilege('anon', 'public.platform_audit_logs',
                         'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') then
    raise exception 'anon ha privilegi su platform_audit_logs';
  end if;
  if exists (select 1 from pg_constraint
              where conrelid = 'public.platform_audit_logs'::regclass and contype = 'f') then
    raise exception 'platform_audit_logs non deve avere FK (deve sopravvivere alla purge)';
  end if;
end;
$$;
