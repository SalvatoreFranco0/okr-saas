-- Piano 6.2, caso 5: alfa_admin.
-- Gestisce sedi/team/periodi/team_members di Alfa; non legge ne' scrive Beta; non crea
-- organizzazioni; non scrive su memberships/membership_locations (ne' si promuove); la regola
-- dell'ultimo Admin vale anche per il backend privilegiato (trigger t15_keep_last_admin).
--
-- UUID del seed (vedi supabase/seed.sql):
--   Alfa e..01, Beta e..02; utenti d..02 alfa_admin, d..03 alfa_manager, d..04 alfa_tl_milano,
--   d..06 alfa_viewer_roma, d..07 beta_admin, d..01 superadmin.
--   Sedi 1..01 Milano, 1..02 Roma, 1..03 Torino (Beta). Team 2..03 Operations, 2..04 Ricerca (Beta).
--   Periodi 3..01 Alfa Q4, 3..03 Beta Q4. OKR 4..06, KR 5..06, Azione 6..05 di Beta.
-- Cambi di ruolo: "reset role" + claims vuoti = backend postgres (is_trusted_backend vero).
begin;
select plan(58);

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

-- Una sessione di supporto (su Alfa) esiste, cosi' "0 righe" in support_sessions e' significativo.
insert into public.support_sessions (id, platform_admin_id, organization_id, reason, started_at, expires_at)
values ('a0000000-0000-4000-8000-000000000051', 'd0000000-0000-4000-8000-000000000001',
        'e0000000-0000-4000-8000-000000000001', 'Ticket di prova 05', now(), now() + interval '1 hour');

-- ===========================================================================
-- A. alfa_admin gestisce sedi, team, periodi e team_members di Alfa
-- ===========================================================================
select tests.authenticate_as_aal('alfa_admin', 'aal1');

select lives_ok(
  $$ insert into public.locations (id, organization_id, name)
     values ('10000000-0000-4000-8000-0000000000a1', 'e0000000-0000-4000-8000-000000000001', 'Napoli') $$,
  'admin: crea una sede in Alfa');

with u as (
  update public.locations set address = 'Via Dante 1'
   where id = '10000000-0000-4000-8000-000000000001'
  returning 1)
select is(count(*)::int, 1, 'admin: modifica una sede di Alfa') from u;

with u as (
  update public.locations set is_active = false
   where id = '10000000-0000-4000-8000-0000000000a1'
  returning 1)
select is(count(*)::int, 1, 'admin: disattiva una sede di Alfa') from u;

select is(
  (select is_active from public.locations where id = '10000000-0000-4000-8000-0000000000a1'),
  false, 'admin: la sede risulta disattivata');

select lives_ok(
  $$ insert into public.teams (id, organization_id, name)
     values ('20000000-0000-4000-8000-0000000000a1', 'e0000000-0000-4000-8000-000000000001', 'Marketing') $$,
  'admin: crea un team in Alfa');

with u as (
  update public.teams set description = 'Team operativo'
   where id = '20000000-0000-4000-8000-000000000003'
  returning 1)
select is(count(*)::int, 1, 'admin: modifica un team di Alfa') from u;

with u as (
  update public.teams set is_active = false
   where id = '20000000-0000-4000-8000-0000000000a1'
  returning 1)
select is(count(*)::int, 1, 'admin: disattiva un team di Alfa') from u;

select lives_ok(
  $$ insert into public.periods (id, organization_id, name, start_date, end_date)
     values ('30000000-0000-4000-8000-0000000000a1', 'e0000000-0000-4000-8000-000000000001',
             'Q1 2027', '2027-01-01', '2027-03-31') $$,
  'admin: crea un periodo in Alfa');

with u as (
  update public.periods set is_closed = true
   where id = '30000000-0000-4000-8000-0000000000a1'
  returning 1)
select is(count(*)::int, 1, 'admin: chiude un periodo di Alfa') from u;

select lives_ok(
  $$ insert into public.team_members (organization_id, team_id, user_id)
     values ('e0000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003',
             'd0000000-0000-4000-8000-000000000006') $$,
  'admin: aggiunge un membro a un team di Alfa');

with d as (
  delete from public.team_members
   where team_id = '20000000-0000-4000-8000-000000000003'
     and user_id = 'd0000000-0000-4000-8000-000000000006'
  returning 1)
select is(count(*)::int, 1, 'admin: rimuove un membro da un team di Alfa') from d;

-- ===========================================================================
-- B. alfa_admin non legge nulla di Beta
-- ===========================================================================
select is_empty($$ select id from public.organizations where id = 'e0000000-0000-4000-8000-000000000002' $$,
  'admin Alfa: non vede l''organizzazione Beta');
select is_empty($$ select id from public.okrs where organization_id = 'e0000000-0000-4000-8000-000000000002' $$,
  'admin Alfa: non vede gli OKR di Beta');
select is_empty($$ select id from public.key_results where organization_id = 'e0000000-0000-4000-8000-000000000002' $$,
  'admin Alfa: non vede i KR di Beta');
select is_empty($$ select id from public.actions where organization_id = 'e0000000-0000-4000-8000-000000000002' $$,
  'admin Alfa: non vede le azioni di Beta');
select is_empty($$ select id from public.memberships where organization_id = 'e0000000-0000-4000-8000-000000000002' $$,
  'admin Alfa: non vede le membership di Beta');
select is_empty($$ select user_id from public.membership_locations where organization_id = 'e0000000-0000-4000-8000-000000000002' $$,
  'admin Alfa: non vede le sedi dei membri di Beta');
select is_empty($$ select id from public.periods where organization_id = 'e0000000-0000-4000-8000-000000000002' $$,
  'admin Alfa: non vede i periodi di Beta');
select is_empty($$ select id from public.locations where organization_id = 'e0000000-0000-4000-8000-000000000002' $$,
  'admin Alfa: non vede le sedi di Beta');
select is_empty($$ select id from public.teams where organization_id = 'e0000000-0000-4000-8000-000000000002' $$,
  'admin Alfa: non vede i team di Beta');
select is_empty($$ select team_id from public.team_members where organization_id = 'e0000000-0000-4000-8000-000000000002' $$,
  'admin Alfa: non vede i membri dei team di Beta');
select is_empty($$ select id from public.profiles where id = 'd0000000-0000-4000-8000-000000000007' $$,
  'admin Alfa: non vede il profilo di beta_admin');
select is_empty($$ select id from public.audit_logs where organization_id = 'e0000000-0000-4000-8000-000000000002' $$,
  'admin Alfa: non vede l''audit di Beta');

-- ===========================================================================
-- C. alfa_admin non scrive su Beta
-- ===========================================================================
select throws_ok(
  $$ insert into public.locations (organization_id, name)
     values ('e0000000-0000-4000-8000-000000000002', 'Intrusa') $$,
  '42501', null, 'admin Alfa: non crea sedi in Beta');
select throws_ok(
  $$ insert into public.periods (organization_id, name, start_date, end_date)
     values ('e0000000-0000-4000-8000-000000000002', 'Intruso', '2027-01-01', '2027-03-31') $$,
  '42501', null, 'admin Alfa: non crea periodi in Beta');
select throws_ok(
  $$ insert into public.teams (organization_id, name)
     values ('e0000000-0000-4000-8000-000000000002', 'Intruso') $$,
  '42501', null, 'admin Alfa: non crea team in Beta');
select throws_ok(
  $$ insert into public.team_members (organization_id, team_id, user_id)
     values ('e0000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000004',
             'd0000000-0000-4000-8000-000000000007') $$,
  '42501', null, 'admin Alfa: non scrive team_members di Beta');
select throws_ok(
  $$ insert into public.okrs (organization_id, period_id, owner_id, title, objective)
     values ('e0000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003',
             'd0000000-0000-4000-8000-000000000007', 'Intruso', 'Intruso') $$,
  '42501', null, 'admin Alfa: non crea OKR in Beta');
select throws_ok(
  $$ insert into public.key_results (organization_id, okr_id, title, target_metric)
     values ('e0000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000006', 'Intruso', 10) $$,
  '42501', null, 'admin Alfa: non crea KR in Beta');

with u as (
  update public.okrs set title = 'Manomesso'
   where id = '40000000-0000-4000-8000-000000000006'
  returning 1)
select is(count(*)::int, 0, 'admin Alfa: update di un OKR di Beta non tocca righe') from u;

with u as (
  update public.locations set name = 'Manomessa'
   where id = '10000000-0000-4000-8000-000000000003'
  returning 1)
select is(count(*)::int, 0, 'admin Alfa: update di una sede di Beta non tocca righe') from u;

with d as (
  delete from public.actions where id = '60000000-0000-4000-8000-000000000005'
  returning 1)
select is(count(*)::int, 0, 'admin Alfa: delete di un''azione di Beta non tocca righe') from d;

with d as (
  delete from public.team_members where organization_id = 'e0000000-0000-4000-8000-000000000002'
  returning 1)
select is(count(*)::int, 0, 'admin Alfa: delete di team_members di Beta non tocca righe') from d;

-- ===========================================================================
-- D. Organizzazioni: nessuna creazione o modifica dal client
-- ===========================================================================
select throws_ok(
  $$ insert into public.organizations (name, slug) values ('Gamma', 'gamma') $$,
  '42501', null, 'admin: non puo'' creare organizzazioni');
select throws_ok(
  $$ update public.organizations set name = 'Alfa rinominata'
      where id = 'e0000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'admin: non puo'' modificare la propria organizzazione');

-- ===========================================================================
-- E. memberships / membership_locations: nessuna scrittura diretta (privilegi)
-- ===========================================================================
select throws_ok(
  $$ insert into public.memberships (organization_id, user_id, role)
     values ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'admin') $$,
  '42501', null, 'admin: insert su memberships negato');
select throws_ok(
  $$ update public.memberships set role = 'admin'
      where user_id = 'd0000000-0000-4000-8000-000000000004' $$,
  '42501', null, 'admin: update su memberships (promozione di un TL) negato');
select throws_ok(
  $$ delete from public.memberships where user_id = 'd0000000-0000-4000-8000-000000000006' $$,
  '42501', null, 'admin: delete su memberships negato');
select throws_ok(
  $$ insert into public.membership_locations (organization_id, user_id, location_id)
     values ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000004',
             '10000000-0000-4000-8000-000000000002') $$,
  '42501', null, 'admin: insert su membership_locations negato');
select throws_ok(
  $$ update public.membership_locations set location_id = '10000000-0000-4000-8000-000000000002'
      where user_id = 'd0000000-0000-4000-8000-000000000004' $$,
  '42501', null, 'admin: update su membership_locations negato');
select throws_ok(
  $$ delete from public.membership_locations where user_id = 'd0000000-0000-4000-8000-000000000006' $$,
  '42501', null, 'admin: delete su membership_locations negato');
select throws_ok(
  $$ insert into public.platform_admins (user_id) values ('d0000000-0000-4000-8000-000000000002') $$,
  '42501', null, 'admin: non puo'' iscriversi tra i platform_admins');

-- ===========================================================================
-- F. Tabelle di piattaforma: invisibili all'admin di un tenant
-- ===========================================================================
select is_empty($$ select user_id from public.platform_admins $$,
  'admin: platform_admins non leggibile (0 righe)');
select is_empty($$ select id from public.support_sessions $$,
  'admin: support_sessions non leggibile (0 righe, anche sulla propria organizzazione)');

-- Auto-promozione di un ruolo basso.
reset role;
select tests.authenticate_as_aal('alfa_viewer_roma', 'aal1');
select throws_ok(
  $$ update public.memberships set role = 'admin' where user_id = auth.uid() $$,
  '42501', null, 'viewer: non puo'' promuoversi ad admin');

-- ===========================================================================
-- G. Verifiche da postgres: Beta intatta
-- ===========================================================================
reset role;
select set_config('request.jwt.claims', '', true);

select is((select title from public.okrs where id = '40000000-0000-4000-8000-000000000006'),
  'Beta: OKR Torino', 'Beta: titolo dell''OKR invariato');
select is((select count(*)::int from public.actions where id = '60000000-0000-4000-8000-000000000005'),
  1, 'Beta: l''azione esiste ancora');
select is((select name from public.locations where id = '10000000-0000-4000-8000-000000000003'),
  'Torino', 'Beta: nome della sede invariato');
select is((select count(*)::int from public.team_members where organization_id = 'e0000000-0000-4000-8000-000000000002'),
  1, 'Beta: team_members invariati');

-- ===========================================================================
-- H. Ultimo Admin: vale anche per il backend privilegiato (postgres e service_role)
-- ===========================================================================
-- beta_admin (d..07) e' l'unico Admin attivo di Beta.
select throws_ok(
  $$ update public.memberships set role = 'viewer'
      where organization_id = 'e0000000-0000-4000-8000-000000000002'
        and user_id = 'd0000000-0000-4000-8000-000000000007' $$,
  'P0001', 'L''organizzazione resterebbe senza un Admin attivo',
  'postgres: declassare l''unico Admin attivo di Beta fallisce');

do $$
declare
  v_state text;
  v_hint  text;
begin
  begin
    update public.memberships set role = 'viewer'
     where organization_id = 'e0000000-0000-4000-8000-000000000002'
       and user_id = 'd0000000-0000-4000-8000-000000000007';
    v_state := 'nessun errore';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_hint = pg_exception_hint;
  end;
  perform set_config('test.last_admin', v_state || ':' || coalesce(v_hint, ''), true);
end $$;
select is(current_setting('test.last_admin'), 'P0001:last_admin',
  'l''errore dell''ultimo Admin ha errcode P0001 e hint last_admin');

select throws_ok(
  $$ update public.memberships set is_active = false
      where organization_id = 'e0000000-0000-4000-8000-000000000002'
        and user_id = 'd0000000-0000-4000-8000-000000000007' $$,
  'P0001', null, 'postgres: disattivare l''unico Admin attivo di Beta fallisce');
select throws_ok(
  $$ delete from public.memberships
      where organization_id = 'e0000000-0000-4000-8000-000000000002'
        and user_id = 'd0000000-0000-4000-8000-000000000007' $$,
  'P0001', null, 'postgres: cancellare l''unico Admin attivo di Beta fallisce');
select throws_ok(
  $$ update public.memberships set organization_id = 'e0000000-0000-4000-8000-000000000001'
      where organization_id = 'e0000000-0000-4000-8000-000000000002'
        and user_id = 'd0000000-0000-4000-8000-000000000007' $$,
  'P0001', null, 'postgres: spostare l''unico Admin di Beta in un''altra organizzazione fallisce');

select tests.authenticate_as_service_role();
select throws_ok(
  $$ update public.memberships set role = 'viewer'
      where organization_id = 'e0000000-0000-4000-8000-000000000002'
        and user_id = 'd0000000-0000-4000-8000-000000000007' $$,
  'P0001', null, 'service_role: declassare l''unico Admin attivo di Beta fallisce');

reset role;
select set_config('request.jwt.claims', '', true);

-- Con un secondo Admin attivo il declassamento riesce.
select lives_ok(
  $$ insert into public.memberships (organization_id, user_id, role)
     values ('e0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000003', 'admin') $$,
  'postgres: aggiunge un secondo Admin a Beta');
select lives_ok(
  $$ update public.memberships set role = 'viewer'
      where organization_id = 'e0000000-0000-4000-8000-000000000002'
        and user_id = 'd0000000-0000-4000-8000-000000000007' $$,
  'postgres: con un secondo Admin attivo il declassamento riesce');
select is(
  (select role from public.memberships
    where organization_id = 'e0000000-0000-4000-8000-000000000002'
      and user_id = 'd0000000-0000-4000-8000-000000000007'),
  'viewer'::public.org_role, 'beta_admin ora e'' viewer');

select * from finish();
rollback;
