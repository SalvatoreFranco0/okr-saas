-- Piano 6.2, caso 9: immutabilita' e colonne d'autore.
-- private.forbid_tenant_change() (trigger t10) rifiuta con 42501 ogni modifica di id,
-- organization_id, created_at, created_by (solo le colonne presenti nella tabella) a chiunque
-- non sia backend fidato. Eccezione per il backend (postgres/service_role): prevista dal piano
-- 5.1 per le procedure di purge; qui si verifica che anche cosi' le FK composte impediscano di
-- spostare un record in un altro tenant.
-- private.set_actor_columns() (t20) forza created_by/updated_by = auth.uid();
-- private.set_updated_at() (t30) forza created_at = now() in insert per i client.
-- Per i ruoli senza permesso di update (viewer) la RLS filtra: nessun errore, 0 righe.
--
-- UUID: Alfa e..01, Beta e..02; d..02 alfa_admin, d..03 alfa_manager, d..04 alfa_tl_milano,
-- d..06 alfa_viewer_roma, d..07 beta_admin (usato come "autore falso"), d..01 superadmin.
-- OKR 4..01 (senza sede), 4..02 (Milano, owner tl_milano), 4..03 (Roma); KR 5..01, 5..02, 5..04;
-- azioni 6..01, 6..03; allineamento 4..01 -> 4..02; periodo 3..01; sede 1..01; team 2..01.
begin;
select plan(46);

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

-- Sessione di supporto attiva del superadmin su Alfa (sezione 5).
insert into public.support_sessions (id, platform_admin_id, organization_id, reason, started_at, expires_at)
values ('a0000000-0000-4000-8000-000000000091', 'd0000000-0000-4000-8000-000000000001',
        'e0000000-0000-4000-8000-000000000001', 'Ticket di prova 09', now(), now() + interval '1 hour');

-- ===========================================================================
-- 1. alfa_admin: id, organization_id, created_at, created_by immutabili su ogni tabella
-- ===========================================================================
select tests.authenticate_as_aal('alfa_admin', 'aal1');

-- okrs
select throws_ok($$ update public.okrs set id = gen_random_uuid() where id = '40000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'admin: okrs.id immutabile');
select throws_ok($$ update public.okrs set organization_id = 'e0000000-0000-4000-8000-000000000002' where id = '40000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'admin: okrs.organization_id immutabile');
select throws_ok($$ update public.okrs set created_at = now() - interval '1 year' where id = '40000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'admin: okrs.created_at immutabile');
select throws_ok($$ update public.okrs set created_by = 'd0000000-0000-4000-8000-000000000007' where id = '40000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'admin: okrs.created_by immutabile');
-- key_results
select throws_ok($$ update public.key_results set id = gen_random_uuid() where id = '50000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'admin: key_results.id immutabile');
select throws_ok($$ update public.key_results set organization_id = 'e0000000-0000-4000-8000-000000000002' where id = '50000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'admin: key_results.organization_id immutabile');
select throws_ok($$ update public.key_results set created_at = now() - interval '1 year' where id = '50000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'admin: key_results.created_at immutabile');
select throws_ok($$ update public.key_results set created_by = 'd0000000-0000-4000-8000-000000000007' where id = '50000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'admin: key_results.created_by immutabile');
-- actions
select throws_ok($$ update public.actions set id = gen_random_uuid() where id = '60000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'admin: actions.id immutabile');
select throws_ok($$ update public.actions set organization_id = 'e0000000-0000-4000-8000-000000000002' where id = '60000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'admin: actions.organization_id immutabile');
select throws_ok($$ update public.actions set created_at = now() - interval '1 year' where id = '60000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'admin: actions.created_at immutabile');
select throws_ok($$ update public.actions set created_by = 'd0000000-0000-4000-8000-000000000007' where id = '60000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'admin: actions.created_by immutabile');
-- okr_alignments (seed: 4..01 -> 4..02, id casuale)
select throws_ok($$ update public.okr_alignments set id = gen_random_uuid()
                    where parent_okr_id = '40000000-0000-4000-8000-000000000001' and child_okr_id = '40000000-0000-4000-8000-000000000002' $$,
  '42501', null, 'admin: okr_alignments.id immutabile');
select throws_ok($$ update public.okr_alignments set organization_id = 'e0000000-0000-4000-8000-000000000002'
                    where parent_okr_id = '40000000-0000-4000-8000-000000000001' and child_okr_id = '40000000-0000-4000-8000-000000000002' $$,
  '42501', null, 'admin: okr_alignments.organization_id immutabile');
select throws_ok($$ update public.okr_alignments set created_at = now() - interval '1 year'
                    where parent_okr_id = '40000000-0000-4000-8000-000000000001' and child_okr_id = '40000000-0000-4000-8000-000000000002' $$,
  '42501', null, 'admin: okr_alignments.created_at immutabile');
select throws_ok($$ update public.okr_alignments set created_by = 'd0000000-0000-4000-8000-000000000007'
                    where parent_okr_id = '40000000-0000-4000-8000-000000000001' and child_okr_id = '40000000-0000-4000-8000-000000000002' $$,
  '42501', null, 'admin: okr_alignments.created_by immutabile');
-- periods (nessuna colonna created_by)
select throws_ok($$ update public.periods set id = gen_random_uuid() where id = '30000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'admin: periods.id immutabile');
select throws_ok($$ update public.periods set organization_id = 'e0000000-0000-4000-8000-000000000002' where id = '30000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'admin: periods.organization_id immutabile');
select throws_ok($$ update public.periods set created_at = now() - interval '1 year' where id = '30000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'admin: periods.created_at immutabile');
-- locations
select throws_ok($$ update public.locations set id = gen_random_uuid() where id = '10000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'admin: locations.id immutabile');
select throws_ok($$ update public.locations set organization_id = 'e0000000-0000-4000-8000-000000000002' where id = '10000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'admin: locations.organization_id immutabile');
select throws_ok($$ update public.locations set created_at = now() - interval '1 year' where id = '10000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'admin: locations.created_at immutabile');
-- teams
select throws_ok($$ update public.teams set id = gen_random_uuid() where id = '20000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'admin: teams.id immutabile');
select throws_ok($$ update public.teams set organization_id = 'e0000000-0000-4000-8000-000000000002' where id = '20000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'admin: teams.organization_id immutabile');
select throws_ok($$ update public.teams set created_at = now() - interval '1 year' where id = '20000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'admin: teams.created_at immutabile');

-- Colonne d'autore impostate dal client: sovrascritte con auth.uid() (e created_at con now()).
insert into public.okrs (id, organization_id, period_id, owner_id, title, objective,
                         created_by, updated_by, created_at)
values ('f9000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002',
        'Autore forzato', 'Autore forzato',
        'd0000000-0000-4000-8000-000000000007', 'd0000000-0000-4000-8000-000000000007', '2000-01-01');
select is((select created_by from public.okrs where id = 'f9000000-0000-4000-8000-000000000001'),
  'd0000000-0000-4000-8000-000000000002'::uuid, 'insert OKR: created_by forzato dal client sostituito con auth.uid()');
select is((select updated_by from public.okrs where id = 'f9000000-0000-4000-8000-000000000001'),
  'd0000000-0000-4000-8000-000000000002'::uuid, 'insert OKR: updated_by forzato dal client sostituito con auth.uid()');
select is((select created_at from public.okrs where id = 'f9000000-0000-4000-8000-000000000001'),
  now(), 'insert OKR: created_at retrodatato dal client sostituito con now()');

update public.okrs
   set title = 'Titolo aggiornato', updated_by = 'd0000000-0000-4000-8000-000000000007'
 where id = '40000000-0000-4000-8000-000000000001';
select is((select updated_by from public.okrs where id = '40000000-0000-4000-8000-000000000001'),
  'd0000000-0000-4000-8000-000000000002'::uuid, 'update OKR: updated_by forzato dal client sostituito con auth.uid()');

insert into public.actions (id, organization_id, key_result_id, title, created_by, updated_by)
values ('f9000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000001',
        '50000000-0000-4000-8000-000000000001', 'Azione con autore forzato',
        'd0000000-0000-4000-8000-000000000007', 'd0000000-0000-4000-8000-000000000007');
select is((select created_by from public.actions where id = 'f9000000-0000-4000-8000-000000000003'),
  'd0000000-0000-4000-8000-000000000002'::uuid, 'insert azione: created_by forzato sostituito con auth.uid()');

insert into public.okr_alignments (id, organization_id, parent_okr_id, child_okr_id, created_by, updated_by)
values ('f9000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-000000000001',
        '40000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000001',
        'd0000000-0000-4000-8000-000000000007', 'd0000000-0000-4000-8000-000000000007');
select is((select created_by from public.okr_alignments where id = 'f9000000-0000-4000-8000-000000000004'),
  'd0000000-0000-4000-8000-000000000002'::uuid, 'insert allineamento: created_by forzato sostituito con auth.uid()');

insert into public.periods (id, organization_id, name, start_date, end_date, created_at)
values ('f9000000-0000-4000-8000-000000000005', 'e0000000-0000-4000-8000-000000000001',
        'Q2 2027', '2027-04-01', '2027-06-30', '2000-01-01');
select is((select created_at from public.periods where id = 'f9000000-0000-4000-8000-000000000005'),
  now(), 'insert periodo: created_at retrodatato dal client sostituito con now()');

-- ===========================================================================
-- 2. alfa_manager
-- ===========================================================================
reset role;
select tests.authenticate_as_aal('alfa_manager', 'aal1');
select throws_ok($$ update public.okrs set organization_id = 'e0000000-0000-4000-8000-000000000002' where id = '40000000-0000-4000-8000-000000000003' $$,
  '42501', null, 'manager: okrs.organization_id immutabile');
select throws_ok($$ update public.key_results set created_by = 'd0000000-0000-4000-8000-000000000007' where id = '50000000-0000-4000-8000-000000000004' $$,
  '42501', null, 'manager: key_results.created_by immutabile');

update public.actions
   set title = 'Azione Roma aggiornata', updated_by = 'd0000000-0000-4000-8000-000000000007'
 where id = '60000000-0000-4000-8000-000000000003';
select is((select updated_by from public.actions where id = '60000000-0000-4000-8000-000000000003'),
  'd0000000-0000-4000-8000-000000000003'::uuid, 'update azione (manager): updated_by forzato sostituito con auth.uid()');

-- ===========================================================================
-- 3. alfa_tl_milano (sul proprio OKR 4..02, che puo' modificare)
-- ===========================================================================
reset role;
select tests.authenticate_as_aal('alfa_tl_milano', 'aal1');
select throws_ok($$ update public.okrs set organization_id = 'e0000000-0000-4000-8000-000000000002' where id = '40000000-0000-4000-8000-000000000002' $$,
  '42501', null, 'team lead: okrs.organization_id immutabile anche sul proprio OKR');
select throws_ok($$ update public.okrs set created_at = now() - interval '1 year' where id = '40000000-0000-4000-8000-000000000002' $$,
  '42501', null, 'team lead: okrs.created_at immutabile anche sul proprio OKR');
select throws_ok($$ update public.key_results set created_by = 'd0000000-0000-4000-8000-000000000007' where id = '50000000-0000-4000-8000-000000000002' $$,
  '42501', null, 'team lead: key_results.created_by immutabile');

insert into public.key_results (id, organization_id, okr_id, title, target_metric, created_by, updated_by)
values ('f9000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001',
        '40000000-0000-4000-8000-000000000002', 'KR con autore forzato', 10,
        'd0000000-0000-4000-8000-000000000007', 'd0000000-0000-4000-8000-000000000007');
select is((select created_by from public.key_results where id = 'f9000000-0000-4000-8000-000000000002'),
  'd0000000-0000-4000-8000-000000000004'::uuid, 'insert KR (team lead): created_by forzato sostituito con auth.uid()');
select is((select updated_by from public.key_results where id = 'f9000000-0000-4000-8000-000000000002'),
  'd0000000-0000-4000-8000-000000000004'::uuid, 'insert KR (team lead): updated_by forzato sostituito con auth.uid()');

-- ===========================================================================
-- 4. alfa_viewer_roma: nessun permesso di update -> 0 righe, nessuna modifica
-- ===========================================================================
reset role;
select tests.authenticate_as_aal('alfa_viewer_roma', 'aal1');
with u as (
  update public.okrs set organization_id = 'e0000000-0000-4000-8000-000000000002'
   where id = '40000000-0000-4000-8000-000000000001'
  returning 1)
select is(count(*)::int, 0, 'viewer: update di organization_id non tocca righe') from u;

-- ===========================================================================
-- 5. superadmin in sessione di supporto (ruolo admin): stesse regole
-- ===========================================================================
reset role;
select tests.authenticate_as_aal('superadmin', 'aal2');
select throws_ok($$ update public.okrs set created_by = 'd0000000-0000-4000-8000-000000000007' where id = '40000000-0000-4000-8000-000000000003' $$,
  '42501', null, 'superadmin in supporto: okrs.created_by immutabile');

-- ===========================================================================
-- 6. Backend fidato: eccezione del trigger, ma le FK composte reggono
-- ===========================================================================
reset role;
select set_config('request.jwt.claims', '', true);
select is((select organization_id from public.okrs where id = '40000000-0000-4000-8000-000000000001'),
  'e0000000-0000-4000-8000-000000000001'::uuid, 'dopo il tentativo del viewer l''OKR e'' ancora di Alfa');

select tests.authenticate_as_service_role();
-- Comportamento reale di forbid_tenant_change: il backend fidato e' esente (piano 5.1).
select lives_ok(
  $$ update public.periods set created_at = '2020-01-01' where id = '30000000-0000-4000-8000-000000000003' $$,
  'service_role: esente dal trigger di immutabilita'' (eccezione per la purge, piano 5.1)');
-- Anche esente dal trigger, non puo' spostare un OKR in un altro tenant: le FK composte
-- (periodo, owner, KR figli) lo impediscono.
select throws_ok(
  $$ update public.okrs set organization_id = 'e0000000-0000-4000-8000-000000000002'
      where id = '40000000-0000-4000-8000-000000000001' $$,
  '23503', null, 'service_role: spostare un OKR in Beta viola le FK composte');

reset role;
select set_config('request.jwt.claims', '', true);
select is((select created_at from public.periods where id = '30000000-0000-4000-8000-000000000003'),
  '2020-01-01'::timestamptz, 'service_role: la modifica di created_at e'' stata applicata');

select * from finish();
rollback;
