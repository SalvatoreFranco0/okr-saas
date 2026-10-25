-- Piano 6.2, caso 8: iniezione cross-tenant.
-- Le FK composte con organization_id devono reggere per TUTTI, anche per il backend che
-- bypassa la RLS (sezione 1, postgres: errore 23503). Per i client la RLS puo' scattare
-- prima della FK: WITH CHECK viene valutato prima dei vincoli e le FK sono controllate a fine
-- statement. Quindi per i client si asserisce l'errore REALE di ciascun caso:
--   * 42501 quando la policy (can_edit_okr/can_edit_kr/has_location) rifiuta gia' la riga;
--   * 23503 quando la policy passa (l'admin/manager di Alfa scrive in Alfa) e a fermare
--     l'iniezione e' la FK composta.
-- In entrambi i casi nessuna riga viene creata (sezione 5).
--
-- UUID: Alfa e..01, Beta e..02. Beta: periodo 3..03, sede 1..03, team 2..04, OKR 4..06,
-- KR 5..06, beta_admin d..07 (non membro di Alfa). Alfa: periodo 3..01, sedi 1..01/1..02,
-- team 2..01, OKR 4..01, KR 5..01, alfa_admin d..02, alfa_viewer_roma d..06.
-- Gli id dei tentativi iniziano con f8 (verificati alla fine).
begin;
select plan(39);

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
-- 1. Backend (postgres, RLS bypassata): solo le FK composte proteggono
-- ===========================================================================
select throws_ok(
  $$ insert into public.key_results (id, organization_id, okr_id, title, target_metric)
     values ('f8000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001',
             '40000000-0000-4000-8000-000000000006', 'XT', 10) $$,
  '23503', null, 'postgres: KR di Alfa su OKR di Beta -> FK composta');
select throws_ok(
  $$ insert into public.key_results (id, organization_id, okr_id, title, target_metric)
     values ('f8000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000002',
             '40000000-0000-4000-8000-000000000001', 'XT', 10) $$,
  '23503', null, 'postgres: KR di Beta su OKR di Alfa -> FK composta');
select throws_ok(
  $$ insert into public.actions (id, organization_id, key_result_id, title)
     values ('f8000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000001',
             '50000000-0000-4000-8000-000000000006', 'XT') $$,
  '23503', null, 'postgres: azione di Alfa su KR di Beta -> FK composta');
select throws_ok(
  $$ insert into public.okr_alignments (id, organization_id, parent_okr_id, child_okr_id)
     values ('f8000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-000000000001',
             '40000000-0000-4000-8000-000000000006', '40000000-0000-4000-8000-000000000001') $$,
  '23503', null, 'postgres: allineamento con padre di Beta -> FK composta');
select throws_ok(
  $$ insert into public.okr_alignments (id, organization_id, parent_okr_id, child_okr_id)
     values ('f8000000-0000-4000-8000-000000000005', 'e0000000-0000-4000-8000-000000000001',
             '40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000006') $$,
  '23503', null, 'postgres: allineamento con figlio di Beta -> FK composta');
select throws_ok(
  $$ insert into public.team_members (organization_id, team_id, user_id)
     values ('e0000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000004',
             'd0000000-0000-4000-8000-000000000006') $$,
  '23503', null, 'postgres: team_members di Alfa su team di Beta -> FK composta');
select throws_ok(
  $$ insert into public.team_members (organization_id, team_id, user_id)
     values ('e0000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
             'd0000000-0000-4000-8000-000000000007') $$,
  '23503', null, 'postgres: team_members di Alfa con utente non membro -> FK composta');
select throws_ok(
  $$ insert into public.membership_locations (organization_id, user_id, location_id)
     values ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000006',
             '10000000-0000-4000-8000-000000000003') $$,
  '23503', null, 'postgres: membership_locations di Alfa con sede di Beta -> FK composta');
select throws_ok(
  $$ insert into public.membership_locations (organization_id, user_id, location_id)
     values ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000007',
             '10000000-0000-4000-8000-000000000001') $$,
  '23503', null, 'postgres: membership_locations di Alfa per utente non membro -> FK composta');
select throws_ok(
  $$ insert into public.okrs (id, organization_id, period_id, owner_id, title, objective)
     values ('f8000000-0000-4000-8000-000000000010', 'e0000000-0000-4000-8000-000000000001',
             '30000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000002', 'XT', 'XT') $$,
  '23503', null, 'postgres: OKR di Alfa con periodo di Beta -> FK composta');
select throws_ok(
  $$ insert into public.okrs (id, organization_id, period_id, location_id, owner_id, title, objective)
     values ('f8000000-0000-4000-8000-000000000011', 'e0000000-0000-4000-8000-000000000001',
             '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003',
             'd0000000-0000-4000-8000-000000000002', 'XT', 'XT') $$,
  '23503', null, 'postgres: OKR di Alfa con sede di Beta -> FK composta');
select throws_ok(
  $$ insert into public.okrs (id, organization_id, period_id, team_id, owner_id, title, objective)
     values ('f8000000-0000-4000-8000-000000000012', 'e0000000-0000-4000-8000-000000000001',
             '30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000004',
             'd0000000-0000-4000-8000-000000000002', 'XT', 'XT') $$,
  '23503', null, 'postgres: OKR di Alfa con team di Beta -> FK composta');
select throws_ok(
  $$ insert into public.okrs (id, organization_id, period_id, owner_id, title, objective)
     values ('f8000000-0000-4000-8000-000000000013', 'e0000000-0000-4000-8000-000000000001',
             '30000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000007', 'XT', 'XT') $$,
  '23503', null, 'postgres: OKR di Alfa con owner non membro (beta_admin) -> FK composta');
select throws_ok(
  $$ insert into public.actions (id, organization_id, key_result_id, title, assignee_id)
     values ('f8000000-0000-4000-8000-000000000014', 'e0000000-0000-4000-8000-000000000001',
             '50000000-0000-4000-8000-000000000001', 'XT', 'd0000000-0000-4000-8000-000000000007') $$,
  '23503', null, 'postgres: azione di Alfa con assignee non membro (beta_admin) -> FK composta');
select throws_ok(
  $$ insert into public.comments (id, organization_id, okr_id, user_id, content)
     values ('f8000000-0000-4000-8000-000000000015', 'e0000000-0000-4000-8000-000000000001',
             '40000000-0000-4000-8000-000000000006', 'd0000000-0000-4000-8000-000000000002', 'XT') $$,
  '23503', null, 'postgres: commento di Alfa su OKR di Beta -> FK composta');

-- ===========================================================================
-- 2. alfa_admin
-- ===========================================================================
select tests.authenticate_as_aal('alfa_admin', 'aal1');

-- Qui la policy rifiuta gia' (can_edit_okr/can_edit_kr non trovano il padre in Alfa).
select throws_ok(
  $$ insert into public.key_results (id, organization_id, okr_id, title, target_metric)
     values ('f8000000-0000-4000-8000-000000000021', 'e0000000-0000-4000-8000-000000000001',
             '40000000-0000-4000-8000-000000000006', 'XT', 10) $$,
  '42501', null, 'admin: KR di Alfa su OKR di Beta rifiutato (RLS prima della FK)');
select throws_ok(
  $$ insert into public.actions (id, organization_id, key_result_id, title)
     values ('f8000000-0000-4000-8000-000000000022', 'e0000000-0000-4000-8000-000000000001',
             '50000000-0000-4000-8000-000000000006', 'XT') $$,
  '42501', null, 'admin: azione di Alfa su KR di Beta rifiutata (RLS prima della FK)');
select throws_ok(
  $$ insert into public.okr_alignments (id, organization_id, parent_okr_id, child_okr_id)
     values ('f8000000-0000-4000-8000-000000000023', 'e0000000-0000-4000-8000-000000000001',
             '40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000006') $$,
  '42501', null, 'admin: allineamento verso un OKR di Beta rifiutato (RLS prima della FK)');
-- Qui la policy passa (admin di Alfa che scrive in Alfa): ferma la FK composta.
select throws_ok(
  $$ insert into public.team_members (organization_id, team_id, user_id)
     values ('e0000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000004',
             'd0000000-0000-4000-8000-000000000006') $$,
  '23503', null, 'admin: team_members con team di Beta -> FK composta');
select throws_ok(
  $$ insert into public.team_members (organization_id, team_id, user_id)
     values ('e0000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
             'd0000000-0000-4000-8000-000000000007') $$,
  '23503', null, 'admin: team_members con utente non membro -> FK composta');
-- membership_locations: nessun privilegio di scrittura per i client.
select throws_ok(
  $$ insert into public.membership_locations (organization_id, user_id, location_id)
     values ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000006',
             '10000000-0000-4000-8000-000000000003') $$,
  '42501', null, 'admin: membership_locations con sede di Beta rifiutato (nessun privilegio)');
select throws_ok(
  $$ insert into public.okrs (id, organization_id, period_id, owner_id, title, objective)
     values ('f8000000-0000-4000-8000-000000000024', 'e0000000-0000-4000-8000-000000000001',
             '30000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000002', 'XT', 'XT') $$,
  '23503', null, 'admin: OKR con periodo di Beta -> FK composta');
select throws_ok(
  $$ insert into public.okrs (id, organization_id, period_id, location_id, owner_id, title, objective)
     values ('f8000000-0000-4000-8000-000000000025', 'e0000000-0000-4000-8000-000000000001',
             '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003',
             'd0000000-0000-4000-8000-000000000002', 'XT', 'XT') $$,
  '23503', null, 'admin: OKR con sede di Beta -> FK composta');
select throws_ok(
  $$ insert into public.okrs (id, organization_id, period_id, team_id, owner_id, title, objective)
     values ('f8000000-0000-4000-8000-000000000026', 'e0000000-0000-4000-8000-000000000001',
             '30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000004',
             'd0000000-0000-4000-8000-000000000002', 'XT', 'XT') $$,
  '23503', null, 'admin: OKR con team di Beta -> FK composta');
select throws_ok(
  $$ insert into public.okrs (id, organization_id, period_id, owner_id, title, objective)
     values ('f8000000-0000-4000-8000-000000000027', 'e0000000-0000-4000-8000-000000000001',
             '30000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000007', 'XT', 'XT') $$,
  '23503', null, 'admin: OKR con owner non membro (beta_admin) -> FK composta');
select throws_ok(
  $$ insert into public.actions (id, organization_id, key_result_id, title, assignee_id)
     values ('f8000000-0000-4000-8000-000000000028', 'e0000000-0000-4000-8000-000000000001',
             '50000000-0000-4000-8000-000000000001', 'XT', 'd0000000-0000-4000-8000-000000000007') $$,
  '23503', null, 'admin: azione con assignee non membro (beta_admin) -> FK composta');

-- ===========================================================================
-- 3. alfa_manager
-- ===========================================================================
reset role;
select tests.authenticate_as_aal('alfa_manager', 'aal1');
select throws_ok(
  $$ insert into public.key_results (id, organization_id, okr_id, title, target_metric)
     values ('f8000000-0000-4000-8000-000000000031', 'e0000000-0000-4000-8000-000000000001',
             '40000000-0000-4000-8000-000000000006', 'XT', 10) $$,
  '42501', null, 'manager: KR di Alfa su OKR di Beta rifiutato');
select throws_ok(
  $$ insert into public.okrs (id, organization_id, period_id, owner_id, title, objective)
     values ('f8000000-0000-4000-8000-000000000032', 'e0000000-0000-4000-8000-000000000001',
             '30000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000007', 'XT', 'XT') $$,
  '23503', null, 'manager: OKR con owner non membro -> FK composta');
select throws_ok(
  $$ insert into public.actions (id, organization_id, key_result_id, title, assignee_id)
     values ('f8000000-0000-4000-8000-000000000033', 'e0000000-0000-4000-8000-000000000001',
             '50000000-0000-4000-8000-000000000001', 'XT', 'd0000000-0000-4000-8000-000000000007') $$,
  '23503', null, 'manager: azione con assignee non membro -> FK composta');

-- ===========================================================================
-- 4. alfa_tl_milano
-- ===========================================================================
reset role;
select tests.authenticate_as_aal('alfa_tl_milano', 'aal1');
select throws_ok(
  $$ insert into public.okrs (id, organization_id, period_id, location_id, owner_id, title, objective)
     values ('f8000000-0000-4000-8000-000000000041', 'e0000000-0000-4000-8000-000000000001',
             '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003',
             'd0000000-0000-4000-8000-000000000004', 'XT', 'XT') $$,
  '42501', null, 'team lead: OKR con sede di Beta rifiutato');
select throws_ok(
  $$ insert into public.key_results (id, organization_id, okr_id, title, target_metric)
     values ('f8000000-0000-4000-8000-000000000042', 'e0000000-0000-4000-8000-000000000001',
             '40000000-0000-4000-8000-000000000006', 'XT', 10) $$,
  '42501', null, 'team lead: KR di Alfa su OKR di Beta rifiutato');
select throws_ok(
  $$ insert into public.actions (id, organization_id, key_result_id, title)
     values ('f8000000-0000-4000-8000-000000000043', 'e0000000-0000-4000-8000-000000000001',
             '50000000-0000-4000-8000-000000000006', 'XT') $$,
  '42501', null, 'team lead: azione di Alfa su KR di Beta rifiutata');

-- ===========================================================================
-- 5. Nessuna riga creata (letto da postgres)
-- ===========================================================================
reset role;
select set_config('request.jwt.claims', '', true);

select is((select count(*)::int from public.okrs where id::text like 'f8%'), 0, 'nessun OKR iniettato');
select is((select count(*)::int from public.key_results where id::text like 'f8%'), 0, 'nessun KR iniettato');
select is((select count(*)::int from public.actions where id::text like 'f8%'), 0, 'nessuna azione iniettata');
select is((select count(*)::int from public.okr_alignments
            where id::text like 'f8%'
               or parent_okr_id = '40000000-0000-4000-8000-000000000006'
               or child_okr_id = '40000000-0000-4000-8000-000000000006'), 0, 'nessun allineamento iniettato');
select is((select count(*)::int from public.team_members
            where organization_id = 'e0000000-0000-4000-8000-000000000001'
              and (team_id = '20000000-0000-4000-8000-000000000004'
                   or user_id = 'd0000000-0000-4000-8000-000000000007')), 0, 'nessun team_members iniettato');
select is((select count(*)::int from public.membership_locations
            where organization_id = 'e0000000-0000-4000-8000-000000000001'
              and (location_id = '10000000-0000-4000-8000-000000000003'
                   or user_id = 'd0000000-0000-4000-8000-000000000007')), 0, 'nessuna membership_locations iniettata');
select is((select count(*)::int from public.comments where id::text like 'f8%'), 0, 'nessun commento iniettato');

select * from finish();
rollback;
