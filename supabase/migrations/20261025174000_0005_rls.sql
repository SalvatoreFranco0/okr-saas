-- 0005: RLS e privilegi (piano 5.6).
-- * enable + force RLS su tutte le tabelle di public (ribadito qui, idempotente).
-- * Policy solo "to authenticated"; nessuna policy e nessun privilegio per anon.
-- * Pattern: private.role_of((select private.my_access()), organization_id). La subquery
--   scalare diventa un InitPlan: la mappa dei permessi si calcola una volta per query.
-- * my_access() considera solo membership attive (o sessione di supporto attiva con aal2):
--   role_of(...) is not null equivale a "membership attiva" (regola trasversale).
-- * INSERT ha solo WITH CHECK (Postgres non ammette USING); UPDATE ha sempre USING + WITH CHECK.
-- * Ricorsione: le policy di tabelle figlie leggono okrs/key_results con una subquery EXISTS
--   (soggetta alla RLS del padre, che non referenzia le figlie) oppure tramite funzioni
--   SECURITY DEFINER che bypassano la RLS. Nessun ciclo tra policy.
-- * Nessuna policy DELETE su organizations, periods, locations, teams, memberships,
--   membership_locations, okrs: si disattivano / soft delete. La purge e' del service_role.
-- comments e audit_logs hanno le loro policy in 0006, dove vengono create.

-- ---------------------------------------------------------------------------
-- RLS abilitata e forzata (gia' fatto alla creazione; ripetuto per esplicitezza)
-- ---------------------------------------------------------------------------
alter table public.organizations        enable row level security;
alter table public.organizations        force  row level security;
alter table public.platform_admins      enable row level security;
alter table public.platform_admins      force  row level security;
alter table public.support_sessions     enable row level security;
alter table public.support_sessions     force  row level security;
alter table public.profiles             enable row level security;
alter table public.profiles             force  row level security;
alter table public.periods              enable row level security;
alter table public.periods              force  row level security;
alter table public.locations            enable row level security;
alter table public.locations            force  row level security;
alter table public.teams                enable row level security;
alter table public.teams                force  row level security;
alter table public.memberships          enable row level security;
alter table public.memberships          force  row level security;
alter table public.membership_locations enable row level security;
alter table public.membership_locations force  row level security;
alter table public.team_members         enable row level security;
alter table public.team_members         force  row level security;
alter table public.okrs                 enable row level security;
alter table public.okrs                 force  row level security;
alter table public.key_results          enable row level security;
alter table public.key_results          force  row level security;
alter table public.actions              enable row level security;
alter table public.actions              force  row level security;
alter table public.okr_alignments       enable row level security;
alter table public.okr_alignments       force  row level security;
alter table public.okr_progress_history enable row level security;
alter table public.okr_progress_history force  row level security;
alter table public.key_result_updates   enable row level security;
alter table public.key_result_updates   force  row level security;

-- ---------------------------------------------------------------------------
-- Privilegi: niente ad anon; ad authenticated solo cio' che le policy possono consentire.
-- (Supabase concede ALL per default privileges: si azzera e si concede in modo esplicito.)
-- ---------------------------------------------------------------------------
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all tables    in schema public from authenticated;

grant select                         on public.organizations        to authenticated;
-- Lettura riservata al super-admin con aal2 (vedi policy); nessuna scrittura client.
grant select                         on public.platform_admins      to authenticated;
grant select                         on public.support_sessions     to authenticated;
-- profiles: email e id non sono modificabili dal client (email segue auth.users).
grant select                         on public.profiles             to authenticated;
grant update (first_name, last_name, locale) on public.profiles     to authenticated;
grant select, insert, update         on public.periods              to authenticated;
grant select, insert, update         on public.locations            to authenticated;
grant select, insert, update         on public.teams                to authenticated;
grant select, insert, update, delete on public.team_members         to authenticated;
-- memberships e membership_locations: solo lettura; le scritture passano dalle Edge Functions.
grant select                         on public.memberships          to authenticated;
grant select                         on public.membership_locations to authenticated;
-- okrs: niente DELETE (soft delete con deleted_at).
grant select, insert, update         on public.okrs                 to authenticated;
grant select, insert, update, delete on public.key_results          to authenticated;
grant select, insert, update, delete on public.actions              to authenticated;
grant select, insert, update, delete on public.okr_alignments       to authenticated;
-- Scritte solo dai trigger.
grant select                         on public.okr_progress_history to authenticated;
grant select                         on public.key_result_updates   to authenticated;

-- ---------------------------------------------------------------------------
-- organizations: lettura delle proprie; il super-admin (aal2) le legge tutte per gestirle.
-- Scritture solo da Edge Functions (service_role).
-- ---------------------------------------------------------------------------
drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations
  for select to authenticated
  using (
    (select private.my_access()) ? (id::text)
    or (select private.is_platform_admin())
  );

-- ---------------------------------------------------------------------------
-- platform_admins, support_sessions: lettura solo al super-admin con aal2 (piano 5.6,
-- "policy proprie del super-admin"); nessuna policy di scrittura.
-- ---------------------------------------------------------------------------
drop policy if exists platform_admins_select on public.platform_admins;
create policy platform_admins_select on public.platform_admins
  for select to authenticated
  using ((select private.is_platform_admin()));

drop policy if exists support_sessions_select on public.support_sessions;
create policy support_sessions_select on public.support_sessions
  for select to authenticated
  using ((select private.is_platform_admin()));

-- ---------------------------------------------------------------------------
-- profiles: lettura del proprio e dei membri delle proprie organizzazioni; modifica del proprio.
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or id in (select private.org_peer_ids())
  );

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- periods: lettura a tutti i membri; scrittura Admin/Manager; niente DELETE.
-- ---------------------------------------------------------------------------
drop policy if exists periods_select on public.periods;
create policy periods_select on public.periods
  for select to authenticated
  using (private.role_of((select private.my_access()), organization_id) is not null);

drop policy if exists periods_insert on public.periods;
create policy periods_insert on public.periods
  for insert to authenticated
  with check (private.role_of((select private.my_access()), organization_id) in ('admin', 'manager_okr'));

drop policy if exists periods_update on public.periods;
create policy periods_update on public.periods
  for update to authenticated
  using (private.role_of((select private.my_access()), organization_id) in ('admin', 'manager_okr'))
  with check (private.role_of((select private.my_access()), organization_id) in ('admin', 'manager_okr'));

-- ---------------------------------------------------------------------------
-- locations: lettura a tutti i membri; scrittura solo Admin; niente DELETE (is_active).
-- ---------------------------------------------------------------------------
drop policy if exists locations_select on public.locations;
create policy locations_select on public.locations
  for select to authenticated
  using (private.role_of((select private.my_access()), organization_id) is not null);

drop policy if exists locations_insert on public.locations;
create policy locations_insert on public.locations
  for insert to authenticated
  with check (private.role_of((select private.my_access()), organization_id) = 'admin');

drop policy if exists locations_update on public.locations;
create policy locations_update on public.locations
  for update to authenticated
  using (private.role_of((select private.my_access()), organization_id) = 'admin')
  with check (private.role_of((select private.my_access()), organization_id) = 'admin');

-- ---------------------------------------------------------------------------
-- teams: lettura a tutti i membri; scrittura Admin/Manager; niente DELETE (is_active).
-- ---------------------------------------------------------------------------
drop policy if exists teams_select on public.teams;
create policy teams_select on public.teams
  for select to authenticated
  using (private.role_of((select private.my_access()), organization_id) is not null);

drop policy if exists teams_insert on public.teams;
create policy teams_insert on public.teams
  for insert to authenticated
  with check (private.role_of((select private.my_access()), organization_id) in ('admin', 'manager_okr'));

drop policy if exists teams_update on public.teams;
create policy teams_update on public.teams
  for update to authenticated
  using (private.role_of((select private.my_access()), organization_id) in ('admin', 'manager_okr'))
  with check (private.role_of((select private.my_access()), organization_id) in ('admin', 'manager_okr'));

-- ---------------------------------------------------------------------------
-- team_members: CRUD Admin/Manager (non e' un dato di privilegio; integrita' dalle FK composte).
-- ---------------------------------------------------------------------------
drop policy if exists team_members_select on public.team_members;
create policy team_members_select on public.team_members
  for select to authenticated
  using (private.role_of((select private.my_access()), organization_id) is not null);

drop policy if exists team_members_insert on public.team_members;
create policy team_members_insert on public.team_members
  for insert to authenticated
  with check (private.role_of((select private.my_access()), organization_id) in ('admin', 'manager_okr'));

drop policy if exists team_members_update on public.team_members;
create policy team_members_update on public.team_members
  for update to authenticated
  using (private.role_of((select private.my_access()), organization_id) in ('admin', 'manager_okr'))
  with check (private.role_of((select private.my_access()), organization_id) in ('admin', 'manager_okr'));


-- ---------------------------------------------------------------------------
-- memberships, membership_locations: SOLO lettura (Admin/Manager tutte, gli altri la propria).
-- Nessuna policy di scrittura per nessun ruolo client: niente auto-promozione.
-- ---------------------------------------------------------------------------
drop policy if exists memberships_select on public.memberships;
create policy memberships_select on public.memberships
  for select to authenticated
  using (
    private.role_of((select private.my_access()), organization_id) in ('admin', 'manager_okr')
    or (
      user_id = (select auth.uid())
      and private.role_of((select private.my_access()), organization_id) is not null
    )
  );

drop policy if exists membership_locations_select on public.membership_locations;
create policy membership_locations_select on public.membership_locations
  for select to authenticated
  using (
    private.role_of((select private.my_access()), organization_id) in ('admin', 'manager_okr')
    or (
      user_id = (select auth.uid())
      and private.role_of((select private.my_access()), organization_id) is not null
    )
  );

-- ---------------------------------------------------------------------------
-- okrs
-- ---------------------------------------------------------------------------
-- Lettura: Admin/Manager tutti (anche eliminati); Team Lead e Viewer i non eliminati senza
-- sede o in una delle proprie sedi.
drop policy if exists okrs_select on public.okrs;
create policy okrs_select on public.okrs
  for select to authenticated
  using (
    private.role_of((select private.my_access()), organization_id) in ('admin', 'manager_okr')
    or (
      private.role_of((select private.my_access()), organization_id) is not null
      and deleted_at is null
      and (location_id is null
           or private.has_location((select private.my_access()), organization_id, location_id))
    )
  );

-- Creazione: Admin/Manager sempre; Team Lead solo con owner = se stesso, sede tra le proprie,
-- team nullo o di cui e' membro, non eliminato. Il periodo aperto lo impone enforce_open_period.
drop policy if exists okrs_insert on public.okrs;
create policy okrs_insert on public.okrs
  for insert to authenticated
  with check (
    private.role_of((select private.my_access()), organization_id) in ('admin', 'manager_okr')
    or (
      private.role_of((select private.my_access()), organization_id) = 'team_lead'
      and deleted_at is null
      and owner_id = (select auth.uid())
      and location_id is not null
      and private.has_location((select private.my_access()), organization_id, location_id)
      and (team_id is null
           or private.has_team((select private.my_access()), organization_id, team_id))
    )
  );

-- Modifica: Admin/Manager sempre; Team Lead solo OKR propri o del proprio team con sede tra le
-- proprie, non eliminati, sia prima (USING) sia dopo (WITH CHECK) la modifica.
drop policy if exists okrs_update on public.okrs;
create policy okrs_update on public.okrs
  for update to authenticated
  using (
    private.role_of((select private.my_access()), organization_id) in ('admin', 'manager_okr')
    or (
      deleted_at is null
      and private.tl_can_write_okr((select private.my_access()), organization_id, owner_id, team_id, location_id)
    )
  )
  with check (
    private.role_of((select private.my_access()), organization_id) in ('admin', 'manager_okr')
    or (
      deleted_at is null
      and private.tl_can_write_okr((select private.my_access()), organization_id, owner_id, team_id, location_id)
    )
  );

-- Soft delete: deleted_at modificabile solo da Admin/Manager (anche in supporto) o dal
-- backend fidato. Difesa in profondita' rispetto alle policy (che gia' lo impediscono al TL).
create or replace function private.okrs_guard_soft_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
       (tg_op = 'INSERT' and new.deleted_at is not null)
       or (tg_op = 'UPDATE' and new.deleted_at is distinct from old.deleted_at)
     )
     and not private.is_trusted_backend()
     and coalesce(private.role_of(private.my_access(), new.organization_id) in ('admin', 'manager_okr'), false) = false
  then
    raise exception 'Solo Admin e Manager OKR possono eliminare o ripristinare un OKR'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function private.okrs_guard_soft_delete() from public, anon, authenticated;

create or replace trigger t60_guard_soft_delete before insert or update on public.okrs
  for each row execute function private.okrs_guard_soft_delete();

-- ---------------------------------------------------------------------------
-- key_results: lettura come l'OKR padre (EXISTS soggetto alla RLS di okrs);
-- scrittura solo se si puo' modificare l'OKR padre. In UPDATE, USING valuta il vecchio
-- okr_id e WITH CHECK il nuovo: lo spostamento richiede i permessi su entrambi.
-- ---------------------------------------------------------------------------
drop policy if exists key_results_select on public.key_results;
create policy key_results_select on public.key_results
  for select to authenticated
  using (
    exists (select 1 from public.okrs o
             where o.id = key_results.okr_id
               and o.organization_id = key_results.organization_id)
  );

drop policy if exists key_results_insert on public.key_results;
create policy key_results_insert on public.key_results
  for insert to authenticated
  with check (private.can_edit_okr(organization_id, okr_id));

drop policy if exists key_results_update on public.key_results;
create policy key_results_update on public.key_results
  for update to authenticated
  using (private.can_edit_okr(organization_id, okr_id))
  with check (private.can_edit_okr(organization_id, okr_id));

drop policy if exists key_results_delete on public.key_results;
create policy key_results_delete on public.key_results
  for delete to authenticated
  using (private.can_edit_okr(organization_id, okr_id));

-- ---------------------------------------------------------------------------
-- actions: come il Key Result padre.
-- ---------------------------------------------------------------------------
drop policy if exists actions_select on public.actions;
create policy actions_select on public.actions
  for select to authenticated
  using (
    exists (select 1 from public.key_results k
             where k.id = actions.key_result_id
               and k.organization_id = actions.organization_id)
  );

drop policy if exists actions_insert on public.actions;
create policy actions_insert on public.actions
  for insert to authenticated
  with check (private.can_edit_kr(organization_id, key_result_id));

drop policy if exists actions_update on public.actions;
create policy actions_update on public.actions
  for update to authenticated
  using (private.can_edit_kr(organization_id, key_result_id))
  with check (private.can_edit_kr(organization_id, key_result_id));

drop policy if exists actions_delete on public.actions;
create policy actions_delete on public.actions
  for delete to authenticated
  using (private.can_edit_kr(organization_id, key_result_id));

-- ---------------------------------------------------------------------------
-- okr_alignments: lettura se entrambi gli OKR sono visibili; scrittura se si possono
-- modificare entrambi (per Admin/Manager can_edit_okr e' sempre vero; Viewer mai).
-- ---------------------------------------------------------------------------
drop policy if exists okr_alignments_select on public.okr_alignments;
create policy okr_alignments_select on public.okr_alignments
  for select to authenticated
  using (
    exists (select 1 from public.okrs p
             where p.id = okr_alignments.parent_okr_id
               and p.organization_id = okr_alignments.organization_id)
    and exists (select 1 from public.okrs c
                 where c.id = okr_alignments.child_okr_id
                   and c.organization_id = okr_alignments.organization_id)
  );

drop policy if exists okr_alignments_insert on public.okr_alignments;
create policy okr_alignments_insert on public.okr_alignments
  for insert to authenticated
  with check (
    private.can_edit_okr(organization_id, parent_okr_id)
    and private.can_edit_okr(organization_id, child_okr_id)
  );

drop policy if exists okr_alignments_update on public.okr_alignments;
create policy okr_alignments_update on public.okr_alignments
  for update to authenticated
  using (
    private.can_edit_okr(organization_id, parent_okr_id)
    and private.can_edit_okr(organization_id, child_okr_id)
  )
  with check (
    private.can_edit_okr(organization_id, parent_okr_id)
    and private.can_edit_okr(organization_id, child_okr_id)
  );

drop policy if exists okr_alignments_delete on public.okr_alignments;
create policy okr_alignments_delete on public.okr_alignments
  for delete to authenticated
  using (
    private.can_edit_okr(organization_id, parent_okr_id)
    and private.can_edit_okr(organization_id, child_okr_id)
  );

-- ---------------------------------------------------------------------------
-- Storici: lettura come l'OKR / KR padre; nessuna policy di scrittura (solo trigger).
-- ---------------------------------------------------------------------------
drop policy if exists okr_progress_history_select on public.okr_progress_history;
create policy okr_progress_history_select on public.okr_progress_history
  for select to authenticated
  using (
    exists (select 1 from public.okrs o
             where o.id = okr_progress_history.okr_id
               and o.organization_id = okr_progress_history.organization_id)
  );

drop policy if exists key_result_updates_select on public.key_result_updates;
create policy key_result_updates_select on public.key_result_updates
  for select to authenticated
  using (
    exists (select 1 from public.key_results k
             where k.id = key_result_updates.key_result_id
               and k.organization_id = key_result_updates.organization_id)
  );

-- ---------------------------------------------------------------------------
-- Verifica: ogni tabella di public ha RLS abilitata e forzata, e anon non ha privilegi.
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

  -- has_table_privilege e non information_schema: quest'ultimo mostra solo i grant di cui il
  -- ruolo corrente e' grantor/grantee e potrebbe nascondere quelli dati da supabase_admin.
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
