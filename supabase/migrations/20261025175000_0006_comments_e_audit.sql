-- 0006: tabelle predisposte (comments) e audit (piano 5.7).
-- * comments: visibilita' come l'OKR, scrittura per tutti i ruoli (anche Viewer). Non usata
--   dalla UI in V1.
-- * audit_logs: popolata gia' in V1 dal trigger private.audit_row_change(); lettura solo
--   Admin/Manager; nessuna policy e nessun privilegio di scrittura per i client (immutabile).

-- ---------------------------------------------------------------------------
-- comments
-- ---------------------------------------------------------------------------
create table if not exists public.comments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  okr_id          uuid not null,
  -- uuid tecnico senza FK verso memberships: puo' scrivere anche il super-admin in supporto.
  -- Il valore e' sempre auth.uid() (trigger t20_set_author).
  user_id         uuid not null,
  content         text not null check (length(btrim(content)) between 1 and 5000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint comments_okr_fkey foreign key (okr_id, organization_id)
    references public.okrs (id, organization_id) on delete cascade
);
create index if not exists comments_org_okr_idx on public.comments (organization_id, okr_id, created_at);
create index if not exists comments_okr_idx on public.comments (okr_id);

alter table public.comments enable row level security;
alter table public.comments force  row level security;
revoke all on table public.comments from anon, authenticated;
grant select, insert, delete      on public.comments to authenticated;
grant update (content)            on public.comments to authenticated;

-- Autore sempre dal JWT: il client non puo' firmare a nome di altri.
create or replace function private.comments_set_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is not null then
    new.user_id := v_uid;
  end if;
  return new;
end;
$$;
revoke execute on function private.comments_set_author() from public, anon, authenticated;

create or replace trigger t10_forbid_tenant_change before update on public.comments
  for each row execute function private.forbid_tenant_change();
create or replace trigger t20_set_author before insert on public.comments
  for each row execute function private.comments_set_author();
create or replace trigger t30_set_updated_at before insert or update on public.comments
  for each row execute function private.set_updated_at();

drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments
  for select to authenticated
  using (
    exists (select 1 from public.okrs o
             where o.id = comments.okr_id
               and o.organization_id = comments.organization_id)
  );

drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and private.role_of((select private.my_access()), organization_id) is not null
    and exists (select 1 from public.okrs o
                 where o.id = comments.okr_id
                   and o.organization_id = comments.organization_id)
  );

-- Modifica solo dei propri commenti su OKR ancora visibili.
drop policy if exists comments_update_own on public.comments;
create policy comments_update_own on public.comments
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and private.role_of((select private.my_access()), organization_id) is not null
  )
  with check (
    user_id = (select auth.uid())
    and private.role_of((select private.my_access()), organization_id) is not null
    and exists (select 1 from public.okrs o
                 where o.id = comments.okr_id
                   and o.organization_id = comments.organization_id)
  );

-- Cancellazione: i propri, oppure Admin/Manager per moderazione.
drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments
  for delete to authenticated
  using (
    (user_id = (select auth.uid())
     and private.role_of((select private.my_access()), organization_id) is not null)
    or private.role_of((select private.my_access()), organization_id) in ('admin', 'manager_okr')
  );

-- ---------------------------------------------------------------------------
-- audit_logs
-- ---------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id              uuid primary key default gen_random_uuid(),
  -- cascade da organizations: la purge del tenant elimina anche il suo audit.
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- uuid tecnici senza FK: l'audit deve sopravvivere all'anonimizzazione/eliminazione
  -- dell'utente e non dipende dall'esistenza dell'OKR.
  user_id         uuid null,
  okr_id          uuid null,
  entity          text not null check (length(entity) between 1 and 100),
  entity_id       uuid null,
  action          text not null check (length(action) between 1 and 100),
  details         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists audit_logs_org_created_idx on public.audit_logs (organization_id, created_at desc);
create index if not exists audit_logs_org_okr_idx on public.audit_logs (organization_id, okr_id) where okr_id is not null;
-- Rate limit delle Edge Functions: conteggio delle righe recenti per utente e azione.
create index if not exists audit_logs_org_user_action_idx on public.audit_logs (organization_id, user_id, action, created_at desc);

alter table public.audit_logs enable row level security;
alter table public.audit_logs force  row level security;
revoke all on table public.audit_logs from anon, authenticated;
grant select on public.audit_logs to authenticated;

drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (private.role_of((select private.my_access()), organization_id) in ('admin', 'manager_okr'));
-- Nessuna policy di insert/update/delete: le righe le scrivono solo il trigger (definer) e
-- le Edge Functions (service_role).

-- ---------------------------------------------------------------------------
-- Trigger di audit
-- ---------------------------------------------------------------------------
-- * details: in update solo i campi cambiati ({campo: {old, new}}); in insert/delete la riga.
--   Esclusi i campi tecnici/derivati: cosi' il ricalcolo di progress_percentage (che tocca
--   solo campi esclusi) non genera righe di rumore a ogni check-in.
-- * Azioni del super-admin in sessione di supporto marcate con support_session (id sessione).
-- * Purge: se l'organizzazione non esiste piu' (DELETE a cascata da organizations) non scrive
--   nulla, altrimenti la FK di audit_logs fallirebbe e bloccherebbe la purge.
-- * Soft delete / ripristino degli OKR registrati come azioni dedicate.
create or replace function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_skip    constant text[] := array['created_at', 'updated_at', 'created_by', 'updated_by',
                                     'version', 'progress_percentage', 'last_updated_at'];
  v_row     jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_old     jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
  v_org     uuid  := (v_row ->> 'organization_id')::uuid;
  v_action  text  := lower(tg_op);
  v_details jsonb;
  v_okr     uuid;
  v_entity  uuid;
  v_session uuid;
begin
  if v_org is null
     or not exists (select 1 from public.organizations o where o.id = v_org) then
    return null;
  end if;

  if tg_op = 'UPDATE' then
    select jsonb_object_agg(n.key, jsonb_build_object('old', o.value, 'new', n.value))
      into v_details
      from jsonb_each(v_row) n
      join jsonb_each(v_old) o on o.key = n.key
     where n.value is distinct from o.value
       and n.key <> all (c_skip);
    if v_details is null then
      return null;
    end if;
    v_details := jsonb_build_object('changes', v_details);

    if tg_table_name = 'okrs' then
      if (v_old ->> 'deleted_at') is null and (v_row ->> 'deleted_at') is not null then
        v_action := 'soft_delete';
      elsif (v_old ->> 'deleted_at') is not null and (v_row ->> 'deleted_at') is null then
        v_action := 'restore';
      end if;
    end if;
  else
    v_details := jsonb_build_object('row', v_row - c_skip);
  end if;

  v_entity := case tg_table_name
                when 'membership_locations' then (v_row ->> 'user_id')::uuid
                else (v_row ->> 'id')::uuid
              end;

  v_okr := case tg_table_name
             when 'okrs'           then (v_row ->> 'id')::uuid
             when 'key_results'    then (v_row ->> 'okr_id')::uuid
             when 'okr_alignments' then (v_row ->> 'child_okr_id')::uuid
           end;
  if tg_table_name = 'actions' then
    select k.okr_id into v_okr
      from public.key_results k
     where k.id = (v_row ->> 'key_result_id')::uuid
       and k.organization_id = v_org;
  end if;

  if coalesce((private.my_access() -> (v_org::text) ->> 'support')::boolean, false) then
    select s.id into v_session
      from public.support_sessions s
     where s.platform_admin_id = auth.uid()
       and s.organization_id = v_org
       and s.ended_at is null
       and s.started_at <= now()
       and s.expires_at > now()
     order by s.started_at desc
     limit 1;
    v_details := v_details || jsonb_build_object('support_session', v_session);
  end if;

  insert into public.audit_logs (organization_id, user_id, okr_id, entity, entity_id, action, details)
  values (v_org, auth.uid(), v_okr, tg_table_name, v_entity, v_action, v_details);

  return null;
end;
$$;
revoke execute on function private.audit_row_change() from public, anon, authenticated;

create or replace trigger t90_audit after insert or update or delete on public.okrs
  for each row execute function private.audit_row_change();
create or replace trigger t90_audit after insert or update or delete on public.key_results
  for each row execute function private.audit_row_change();
create or replace trigger t90_audit after insert or update or delete on public.actions
  for each row execute function private.audit_row_change();
create or replace trigger t90_audit after insert or update or delete on public.okr_alignments
  for each row execute function private.audit_row_change();
create or replace trigger t90_audit after insert or update or delete on public.memberships
  for each row execute function private.audit_row_change();
create or replace trigger t90_audit after insert or update or delete on public.membership_locations
  for each row execute function private.audit_row_change();
create or replace trigger t90_audit after insert or update or delete on public.locations
  for each row execute function private.audit_row_change();
create or replace trigger t90_audit after insert or update or delete on public.teams
  for each row execute function private.audit_row_change();
create or replace trigger t90_audit after insert or update or delete on public.periods
  for each row execute function private.audit_row_change();

-- ---------------------------------------------------------------------------
-- Verifica finale: ogni tabella di public ha RLS abilitata e forzata, anon non ha privilegi.
-- ---------------------------------------------------------------------------
do $$
declare
  v_bad text;
begin
  select string_agg(c.relname, ', ') into v_bad
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind in ('r', 'p')
     and not (c.relrowsecurity and c.relforcerowsecurity);
  if v_bad is not null then
    raise exception 'Tabelle in public senza RLS abilitata e forzata: %', v_bad;
  end if;

  select string_agg(c.relname, ', ') into v_bad
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind in ('r', 'p', 'v', 'm')
     and has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER');
  if v_bad is not null then
    raise exception 'anon ha ancora privilegi su: %', v_bad;
  end if;
end;
$$;
