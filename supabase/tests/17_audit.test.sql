-- Piano 6.2, caso 17: audit.
-- private.audit_row_change() (trigger t90_audit, AFTER ROW) scrive in audit_logs:
--   entity = nome della tabella; action = insert | update | delete, e per okrs soft_delete /
--   restore quando cambia deleted_at; entity_id = id (per membership_locations: user_id);
--   okr_id = id (okrs), okr_id (key_results), child_okr_id (okr_alignments), OKR del KR
--   (actions), null altrove; user_id = auth.uid() (null per il backend).
--   In update details = {changes: {campo: {old, new}}} senza i campi esclusi (created_at,
--   updated_at, created_by, updated_by, version, progress_percentage, last_updated_at): se
--   cambiano solo quelli NON viene scritta alcuna riga. In insert/delete details = {row: ...}
--   senza i campi esclusi.
-- Lettura: solo Admin/Manager della stessa organizzazione. Scrittura: nessun client.
--
-- UUID: Alfa e..01, Beta e..02; d..02 alfa_admin, d..03 alfa_manager, d..04 tl_milano,
-- d..05 tl_senza_sede, d..06 viewer_roma, d..07 beta_admin, d..01 superadmin.
-- Oggetti creati qui (prefisso f1..f7): X1 okr f1..01, K1/K2 KR f2..01/f2..02, A1 azione
-- f3..01, AL1 allineamento f4..01, L1 sede f5..01, T1 team f6..01, P1 periodo f7..01.
begin;
select plan(28);

do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure
      from pg_proc p
      join pg_depend d on d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
      join pg_extension e on e.oid = d.refobjid and e.extname = 'pgtap'
     where not (has_function_privilege('anon', p.oid, 'EXECUTE')
                and has_function_privilege('authenticated', p.oid, 'EXECUTE')
                and has_function_privilege('service_role', p.oid, 'EXECUTE'))
  loop
    begin
      execute format('grant execute on function %s to anon, authenticated, service_role', f);
    exception when others then null;
    end;
  end loop;
end $$;

-- ===========================================================================
-- 1. Modifiche ai dati come alfa_admin (istruzioni semplici: se fallissero, il file fallisce)
-- ===========================================================================
select tests.authenticate_as_aal('alfa_admin', 'aal1');

insert into public.okrs (id, organization_id, period_id, owner_id, title, objective)
values ('f1000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002',
        'Audit OKR', 'Obiettivo audit');
update public.okrs set title = 'Audit OKR 2' where id = 'f1000000-0000-4000-8000-000000000001';
-- Update che cambia solo campi esclusi (version, updated_at): nessuna riga di audit.
update public.okrs set title = title where id = 'f1000000-0000-4000-8000-000000000001';

-- KR: l'insert ricalcola progress_percentage dell'OKR (solo campo escluso: nessuna riga okrs).
insert into public.key_results (id, organization_id, okr_id, title, target_metric, current_metric)
values ('f2000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001',
        'f1000000-0000-4000-8000-000000000001', 'K1', 100, 50);
update public.key_results set title = 'K1 bis' where id = 'f2000000-0000-4000-8000-000000000001';
insert into public.key_results (id, organization_id, okr_id, title, target_metric, current_metric)
values ('f2000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001',
        'f1000000-0000-4000-8000-000000000001', 'K2', 10, 0);
-- Check-in: cambia current_metric (registrato) e last_updated_at (escluso).
do $$ begin perform public.kr_check_in('f2000000-0000-4000-8000-000000000002', 5, 'nota di prova'); end $$;

insert into public.actions (id, organization_id, key_result_id, title)
values ('f3000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001',
        'f2000000-0000-4000-8000-000000000002', 'A1');
update public.actions set is_completed = true where id = 'f3000000-0000-4000-8000-000000000001';
delete from public.actions where id = 'f3000000-0000-4000-8000-000000000001';
delete from public.key_results where id = 'f2000000-0000-4000-8000-000000000001';

insert into public.okr_alignments (id, organization_id, parent_okr_id, child_okr_id)
values ('f4000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001',
        'f1000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000003');
delete from public.okr_alignments where id = 'f4000000-0000-4000-8000-000000000001';

update public.okrs set deleted_at = now() where id = 'f1000000-0000-4000-8000-000000000001';
update public.okrs set deleted_at = null  where id = 'f1000000-0000-4000-8000-000000000001';

insert into public.locations (id, organization_id, name)
values ('f5000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'Bologna');
update public.locations set address = 'Via Indipendenza 1' where id = 'f5000000-0000-4000-8000-000000000001';
update public.locations set name = name where id = 'f5000000-0000-4000-8000-000000000001';

insert into public.teams (id, organization_id, name)
values ('f6000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'Audit team');
update public.teams set is_active = false where id = 'f6000000-0000-4000-8000-000000000001';

insert into public.periods (id, organization_id, name, start_date, end_date)
values ('f7000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001',
        'Q2 2027', '2027-04-01', '2027-06-30');
update public.periods set is_closed = true where id = 'f7000000-0000-4000-8000-000000000001';

-- ===========================================================================
-- 2. Verifica delle righe di audit (da postgres)
-- ===========================================================================
reset role;
select set_config('request.jwt.claims', '', true);

select results_eq(
  $$ select action from public.audit_logs
      where entity = 'okrs' and entity_id = 'f1000000-0000-4000-8000-000000000001'
      order by action $$,
  $$ values ('insert'), ('restore'), ('soft_delete'), ('update') $$,
  'okrs: insert, un solo update (no-op e ricalcoli esclusi), soft_delete e restore dedicati');

select is_empty(
  $$ select id from public.audit_logs
      where entity = 'okrs' and entity_id = 'f1000000-0000-4000-8000-000000000001'
        and (organization_id <> 'e0000000-0000-4000-8000-000000000001'
             or user_id is distinct from 'd0000000-0000-4000-8000-000000000002'
             or okr_id is distinct from 'f1000000-0000-4000-8000-000000000001') $$,
  'okrs: organization_id, user_id e okr_id corretti su ogni riga');

select is(
  (select array_agg(k order by k)
     from public.audit_logs a, jsonb_object_keys(a.details -> 'changes') as k
    where a.entity = 'okrs' and a.entity_id = 'f1000000-0000-4000-8000-000000000001'
      and a.action = 'update'),
  array['title'],
  'okrs update: details contiene solo il campo cambiato (title), non i campi tecnici');

select ok(
  (select details -> 'row' ->> 'title' = 'Audit OKR'
          and not ((details -> 'row') ?| array['created_at', 'updated_at', 'created_by', 'updated_by',
                                               'version', 'progress_percentage'])
     from public.audit_logs
    where entity = 'okrs' and entity_id = 'f1000000-0000-4000-8000-000000000001'
      and action = 'insert'),
  'okrs insert: details.row contiene la riga senza i campi esclusi');

select ok(
  (select (details -> 'changes') ? 'deleted_at'
     from public.audit_logs
    where entity = 'okrs' and entity_id = 'f1000000-0000-4000-8000-000000000001'
      and action = 'soft_delete'),
  'okrs soft_delete: details registra deleted_at');

select results_eq(
  $$ select action, okr_id, user_id from public.audit_logs
      where entity = 'key_results' and entity_id = 'f2000000-0000-4000-8000-000000000001'
        and organization_id = 'e0000000-0000-4000-8000-000000000001'
      order by action $$,
  $$ values ('delete', 'f1000000-0000-4000-8000-000000000001'::uuid, 'd0000000-0000-4000-8000-000000000002'::uuid),
            ('insert', 'f1000000-0000-4000-8000-000000000001'::uuid, 'd0000000-0000-4000-8000-000000000002'::uuid),
            ('update', 'f1000000-0000-4000-8000-000000000001'::uuid, 'd0000000-0000-4000-8000-000000000002'::uuid) $$,
  'key_results: insert/update/delete con okr_id dell''OKR padre e utente corretto');

select results_eq(
  $$ select action from public.audit_logs
      where entity = 'key_results' and entity_id = 'f2000000-0000-4000-8000-000000000002'
      order by action $$,
  $$ values ('insert'), ('update') $$,
  'key_results: il check-in genera un update');

select is(
  (select array_agg(k order by k)
     from public.audit_logs a, jsonb_object_keys(a.details -> 'changes') as k
    where a.entity = 'key_results' and a.entity_id = 'f2000000-0000-4000-8000-000000000002'
      and a.action = 'update'),
  array['current_metric'],
  'check-in: details contiene current_metric e non last_updated_at/version');

select results_eq(
  $$ select action, okr_id, user_id from public.audit_logs
      where entity = 'actions' and entity_id = 'f3000000-0000-4000-8000-000000000001'
        and organization_id = 'e0000000-0000-4000-8000-000000000001'
      order by action $$,
  $$ values ('delete', 'f1000000-0000-4000-8000-000000000001'::uuid, 'd0000000-0000-4000-8000-000000000002'::uuid),
            ('insert', 'f1000000-0000-4000-8000-000000000001'::uuid, 'd0000000-0000-4000-8000-000000000002'::uuid),
            ('update', 'f1000000-0000-4000-8000-000000000001'::uuid, 'd0000000-0000-4000-8000-000000000002'::uuid) $$,
  'actions: insert/update/delete con okr_id ricavato dal KR');

select results_eq(
  $$ select action, okr_id, user_id from public.audit_logs
      where entity = 'okr_alignments' and entity_id = 'f4000000-0000-4000-8000-000000000001'
        and organization_id = 'e0000000-0000-4000-8000-000000000001'
      order by action $$,
  $$ values ('delete', '40000000-0000-4000-8000-000000000003'::uuid, 'd0000000-0000-4000-8000-000000000002'::uuid),
            ('insert', '40000000-0000-4000-8000-000000000003'::uuid, 'd0000000-0000-4000-8000-000000000002'::uuid) $$,
  'okr_alignments: insert/delete con okr_id = OKR figlio');

select results_eq(
  $$ select action, okr_id, user_id from public.audit_logs
      where entity = 'locations' and entity_id = 'f5000000-0000-4000-8000-000000000001'
        and organization_id = 'e0000000-0000-4000-8000-000000000001'
      order by action $$,
  $$ values ('insert', null::uuid, 'd0000000-0000-4000-8000-000000000002'::uuid),
            ('update', null::uuid, 'd0000000-0000-4000-8000-000000000002'::uuid) $$,
  'locations: insert e un solo update (l''update senza modifiche reali non genera righe)');

select results_eq(
  $$ select action, user_id from public.audit_logs
      where entity = 'teams' and entity_id = 'f6000000-0000-4000-8000-000000000001'
        and organization_id = 'e0000000-0000-4000-8000-000000000001'
      order by action $$,
  $$ values ('insert', 'd0000000-0000-4000-8000-000000000002'::uuid),
            ('update', 'd0000000-0000-4000-8000-000000000002'::uuid) $$,
  'teams: insert e update registrati');

select results_eq(
  $$ select action, user_id from public.audit_logs
      where entity = 'periods' and entity_id = 'f7000000-0000-4000-8000-000000000001'
        and organization_id = 'e0000000-0000-4000-8000-000000000001'
      order by action $$,
  $$ values ('insert', 'd0000000-0000-4000-8000-000000000002'::uuid),
            ('update', 'd0000000-0000-4000-8000-000000000002'::uuid) $$,
  'periods: insert e update registrati');

select ok(
  (select count(*) from public.audit_logs where organization_id = 'e0000000-0000-4000-8000-000000000002') > 0,
  'esistono righe di audit di Beta (dal seed): il test di isolamento e'' significativo');

-- ===========================================================================
-- 3. Chi legge l'audit
-- ===========================================================================
select tests.authenticate_as_aal('alfa_admin', 'aal1');
select ok((select count(*) from public.audit_logs where organization_id = 'e0000000-0000-4000-8000-000000000001') > 0,
  'admin: legge l''audit di Alfa');
select is((select count(*)::int from public.audit_logs where organization_id = 'e0000000-0000-4000-8000-000000000002'), 0,
  'admin Alfa: non vede l''audit di Beta');

-- Nessun client puo' scrivere su audit_logs (nessun privilegio).
select throws_ok(
  $$ insert into public.audit_logs (organization_id, entity, action)
     values ('e0000000-0000-4000-8000-000000000001', 'okrs', 'falso') $$,
  '42501', null, 'admin: insert su audit_logs negato');
select throws_ok(
  $$ update public.audit_logs set action = 'manomesso' $$,
  '42501', null, 'admin: update su audit_logs negato');
select throws_ok(
  $$ delete from public.audit_logs $$,
  '42501', null, 'admin: delete su audit_logs negato');
select throws_ok(
  $$ truncate public.audit_logs $$,
  '42501', null, 'admin: truncate su audit_logs negato');

reset role;
select tests.authenticate_as_aal('alfa_manager', 'aal1');
select ok((select count(*) from public.audit_logs where organization_id = 'e0000000-0000-4000-8000-000000000001') > 0,
  'manager: legge l''audit di Alfa');

reset role;
select tests.authenticate_as_aal('alfa_tl_milano', 'aal1');
select is_empty($$ select id from public.audit_logs $$, 'team lead: nessuna riga di audit visibile');

reset role;
select tests.authenticate_as_aal('alfa_viewer_roma', 'aal1');
select is_empty($$ select id from public.audit_logs $$, 'viewer: nessuna riga di audit visibile');
select throws_ok(
  $$ delete from public.audit_logs $$,
  '42501', null, 'viewer: delete su audit_logs negato');

reset role;
select tests.authenticate_as_aal('beta_admin', 'aal1');
select is((select count(*)::int from public.audit_logs where organization_id = 'e0000000-0000-4000-8000-000000000001'), 0,
  'admin Beta: non vede l''audit di Alfa');

-- ===========================================================================
-- 4. Modifiche ai permessi dal backend (service_role e postgres): user_id null
-- ===========================================================================
reset role;
select tests.authenticate_as_service_role();
update public.memberships set role = 'manager_okr'
 where organization_id = 'e0000000-0000-4000-8000-000000000001'
   and user_id = 'd0000000-0000-4000-8000-000000000006';
insert into public.memberships (organization_id, user_id, role)
values ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'viewer');
insert into public.membership_locations (organization_id, user_id, location_id)
values ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000005',
        '10000000-0000-4000-8000-000000000001');

reset role;
select set_config('request.jwt.claims', '', true);
delete from public.membership_locations
 where user_id = 'd0000000-0000-4000-8000-000000000005'
   and location_id = '10000000-0000-4000-8000-000000000001';

select is(
  (select count(*)::int
     from public.audit_logs a
     join public.memberships m
       on m.id = a.entity_id
      and m.organization_id = 'e0000000-0000-4000-8000-000000000001'
      and m.user_id = 'd0000000-0000-4000-8000-000000000006'
    where a.entity = 'memberships'
      and a.action = 'update'
      and a.organization_id = 'e0000000-0000-4000-8000-000000000001'
      and a.user_id is null
      and a.details -> 'changes' -> 'role' ->> 'old' = 'viewer'
      and a.details -> 'changes' -> 'role' ->> 'new' = 'manager_okr'),
  1, 'memberships: il cambio di ruolo dal backend e'' registrato (old/new, user_id null)');

select is(
  (select count(*)::int
     from public.audit_logs a
     join public.memberships m
       on m.id = a.entity_id
      and m.organization_id = 'e0000000-0000-4000-8000-000000000001'
      and m.user_id = 'd0000000-0000-4000-8000-000000000001'
    where a.entity = 'memberships'
      and a.action = 'insert'
      and a.organization_id = 'e0000000-0000-4000-8000-000000000001'),
  1, 'memberships: la nuova membership dal backend e'' registrata');

select results_eq(
  $$ select action from public.audit_logs
      where entity = 'membership_locations'
        and entity_id = 'd0000000-0000-4000-8000-000000000005'
        and organization_id = 'e0000000-0000-4000-8000-000000000001'
      order by action $$,
  $$ values ('delete'), ('insert') $$,
  'membership_locations: insert (service_role) e delete (postgres) registrati, entity_id = user_id');

select * from finish();
rollback;
