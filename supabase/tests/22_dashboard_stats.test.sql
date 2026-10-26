-- Migrazione 0010: public.dashboard_stats(p_org, p_period, p_location, p_team) con filtri.
-- SECURITY INVOKER: decide la RLS di okrs; p_org e i filtri restringono soltanto.
--
-- Atteso dal seed (OKR non eliminati, avanzamento calcolato dai KR):
--   Alfa 4..01  Q4 (3..01)  senza sede   senza team     attivo  alta   25.0
--        4..02  Q4          Milano 1..01 Prodotto 2..01  attivo  media  75.0 (KR 50% e 100%)
--        4..03  Q4          Roma   1..02 Vendite  2..02  attivo  media  40.0
--        4..04  Q4          Milano       -              ELIMINATO (mai contato)
--        4..05  Q3 (3..02)  Milano       Prodotto       attivo  media  60.0
--   Beta 4..06  Q4 (3..03)  Torino 1..03 Ricerca  2..04  attivo  media  30.0
-- alfa_viewer_roma (sede Roma) vede solo 4..01 (senza sede) e 4..03 (Roma).
-- Nessun OKR del seed ha priorita' 'critica': i critici si provano con fixture alla fine
-- (4..40 critica attiva, 4..41 critica completata, entrambe Q4 Roma senza team).
begin;
select plan(38);

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
-- 1. Cataloghi: firma, nessun overload residuo, invoker, privilegi
-- ===========================================================================
select hasnt_function('public', 'dashboard_stats', array['uuid', 'uuid'],
  'la vecchia firma dashboard_stats(uuid, uuid) non esiste piu''');
select is(
  (select count(*)::int
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'dashboard_stats'),
  1, 'esiste una sola dashboard_stats (nessun overload ambiguo)');
select ok(
  (select not p.prosecdef
          and p.provolatile = 's'
          and l.lanname = 'sql'
          and p.prorettype = 'jsonb'::regtype
          and 'search_path=""' = any (coalesce(p.proconfig, '{}'::text[]))
     from pg_proc p join pg_language l on l.oid = p.prolang
    where p.oid = 'public.dashboard_stats(uuid, uuid, uuid, uuid)'::regprocedure),
  'dashboard_stats(uuid x4): security invoker, stable, sql, jsonb, search_path vuoto');
select ok(
  has_function_privilege('authenticated', 'public.dashboard_stats(uuid, uuid, uuid, uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.dashboard_stats(uuid, uuid, uuid, uuid)', 'EXECUTE'),
  'execute solo ad authenticated, non ad anon');

-- ===========================================================================
-- 2. anon
-- ===========================================================================
select tests.clear_authentication();
select throws_ok(
  $$ select public.dashboard_stats('e0000000-0000-4000-8000-000000000001'::uuid, null::uuid, null::uuid, null::uuid) $$,
  '42501', null, 'anon: dashboard_stats non eseguibile');
reset role;
select set_config('request.jwt.claims', '', true);

-- ===========================================================================
-- 3. Viewer di Roma: solo gli OKR visibili (senza sede + Roma), mai Milano
-- ===========================================================================
select tests.authenticate_as_aal('alfa_viewer_roma', 'aal1');
select is((public.dashboard_stats('e0000000-0000-4000-8000-000000000001') ->> 'total')::int, 2,
  'viewer Roma: total 2 (4..01 senza sede, 4..03 Roma)');
select set_eq(
  $$ select (e ->> 'id')::uuid
       from jsonb_array_elements(public.dashboard_stats('e0000000-0000-4000-8000-000000000001') -> 'latest') e $$,
  $$ values ('40000000-0000-4000-8000-000000000001'::uuid), ('40000000-0000-4000-8000-000000000003'::uuid) $$,
  'viewer Roma: latest contiene solo 4..01 e 4..03 (nessun OKR di Milano)');
select is((public.dashboard_stats('e0000000-0000-4000-8000-000000000001') ->> 'avg_progress')::numeric, 32.5::numeric,
  'viewer Roma: avg_progress 32.5 ((25 + 40) / 2)');
select is(public.dashboard_stats('e0000000-0000-4000-8000-000000000001') -> 'by_status', '{"attivo": 2}'::jsonb,
  'viewer Roma: by_status {attivo: 2}');
select is((public.dashboard_stats('e0000000-0000-4000-8000-000000000001', null,
            '10000000-0000-4000-8000-000000000001') ->> 'total')::int, 0,
  'viewer Roma con filtro sede Milano: total 0 (il filtro non allarga la RLS)');
select is((public.dashboard_stats('e0000000-0000-4000-8000-000000000001', null, null,
            '20000000-0000-4000-8000-000000000002') ->> 'total')::int, 1,
  'viewer Roma con filtro team Vendite: total 1 (4..03)');
select is((public.dashboard_stats('e0000000-0000-4000-8000-000000000001', null, null,
            '20000000-0000-4000-8000-000000000001') ->> 'total')::int, 0,
  'viewer Roma con filtro team Prodotto: total 0 (gli OKR Prodotto sono di Milano)');
select is((public.dashboard_stats('e0000000-0000-4000-8000-000000000001',
            '30000000-0000-4000-8000-000000000002') ->> 'total')::int, 0,
  'viewer Roma con periodo Q3: total 0 (4..05 e'' di Milano)');

-- ===========================================================================
-- 4. Admin di Alfa: tutto Alfa (eliminati esclusi) e filtri coerenti col seed
-- ===========================================================================
reset role;
select set_config('request.jwt.claims', '', true);
select tests.authenticate_as_aal('alfa_admin', 'aal1');
select is((public.dashboard_stats('e0000000-0000-4000-8000-000000000001') ->> 'total')::int, 4,
  'admin Alfa: total 4 (4..04 eliminato escluso)');
select set_eq(
  $$ select (e ->> 'id')::uuid
       from jsonb_array_elements(public.dashboard_stats('e0000000-0000-4000-8000-000000000001') -> 'latest') e $$,
  $$ values ('40000000-0000-4000-8000-000000000001'::uuid), ('40000000-0000-4000-8000-000000000002'::uuid),
            ('40000000-0000-4000-8000-000000000003'::uuid), ('40000000-0000-4000-8000-000000000005'::uuid) $$,
  'admin Alfa: latest contiene 4..01, 4..02, 4..03, 4..05');
select is((public.dashboard_stats('e0000000-0000-4000-8000-000000000001') ->> 'avg_progress')::numeric, 50.0::numeric,
  'admin Alfa: avg_progress 50.0 ((25 + 75 + 40 + 60) / 4)');
select is(public.dashboard_stats('e0000000-0000-4000-8000-000000000001') -> 'by_status', '{"attivo": 4}'::jsonb,
  'admin Alfa: by_status {attivo: 4}');
select is(public.dashboard_stats('e0000000-0000-4000-8000-000000000001') -> 'critical', '[]'::jsonb,
  'admin Alfa: nessun OKR critico nel seed');
select is((public.dashboard_stats('e0000000-0000-4000-8000-000000000001',
            '30000000-0000-4000-8000-000000000001') ->> 'total')::int, 3,
  'admin Alfa, periodo Q4: total 3');
select is((public.dashboard_stats('e0000000-0000-4000-8000-000000000001',
            '30000000-0000-4000-8000-000000000002') ->> 'total')::int, 1,
  'admin Alfa, periodo Q3 (chiuso): total 1 (4..05)');
select is((public.dashboard_stats('e0000000-0000-4000-8000-000000000001', null,
            '10000000-0000-4000-8000-000000000001') ->> 'total')::int, 2,
  'admin Alfa, sede Milano: total 2 (4..02, 4..05; 4..04 eliminato escluso)');
select is((public.dashboard_stats('e0000000-0000-4000-8000-000000000001', null,
            '10000000-0000-4000-8000-000000000001') ->> 'avg_progress')::numeric, 67.5::numeric,
  'admin Alfa, sede Milano: avg_progress 67.5');
select is((public.dashboard_stats('e0000000-0000-4000-8000-000000000001', null,
            '10000000-0000-4000-8000-000000000002') ->> 'total')::int, 1,
  'admin Alfa, sede Roma: total 1 (4..03; l''OKR senza sede non rientra nel filtro)');
select is((public.dashboard_stats('e0000000-0000-4000-8000-000000000001', null, null,
            '20000000-0000-4000-8000-000000000001') ->> 'total')::int, 2,
  'admin Alfa, team Prodotto: total 2 (4..02, 4..05)');
select is((public.dashboard_stats('e0000000-0000-4000-8000-000000000001', null, null,
            '20000000-0000-4000-8000-000000000003') ->> 'total')::int, 0,
  'admin Alfa, team Operations (vuoto): total 0');
select set_eq(
  $$ select (e ->> 'id')::uuid
       from jsonb_array_elements(public.dashboard_stats('e0000000-0000-4000-8000-000000000001',
              '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
              '20000000-0000-4000-8000-000000000001') -> 'latest') e $$,
  $$ values ('40000000-0000-4000-8000-000000000002'::uuid) $$,
  'admin Alfa, Q4 + Milano + Prodotto: solo 4..02 (filtri in AND)');
select is((public.dashboard_stats('e0000000-0000-4000-8000-000000000001',
            '30000000-0000-4000-8000-000000000001'::uuid) ->> 'total')::int, 3,
  'retrocompatibilita'': chiamata posizionale (org, periodo) come nella 0007');
select is((public.dashboard_stats(p_org => 'e0000000-0000-4000-8000-000000000001',
            p_team => '20000000-0000-4000-8000-000000000002') ->> 'total')::int, 1,
  'argomenti nominati (come PostgREST): org + team Vendite, total 1');
select is((public.dashboard_stats('e0000000-0000-4000-8000-000000000001', null,
            '10000000-0000-4000-8000-000000000003') ->> 'total')::int, 0,
  'admin Alfa con la sede di Beta (Torino) come filtro: total 0');

-- p_org non e' un'autorizzazione
select is((public.dashboard_stats('e0000000-0000-4000-8000-000000000002') ->> 'total')::int, 0,
  'admin Alfa con p_org di Beta: total 0');
select is(public.dashboard_stats('e0000000-0000-4000-8000-000000000002'),
  '{"total": 0, "avg_progress": 0, "by_status": {}, "latest": [], "critical": []}'::jsonb,
  'admin Alfa con p_org di Beta: forma completa, vuota');
select is((public.dashboard_stats(null) ->> 'total')::int, 0,
  'p_org nullo: total 0');

-- ===========================================================================
-- 5. Admin di Beta: non vede Alfa
-- ===========================================================================
reset role;
select set_config('request.jwt.claims', '', true);
select tests.authenticate_as_aal('beta_admin', 'aal1');
select is((public.dashboard_stats('e0000000-0000-4000-8000-000000000001') ->> 'total')::int, 0,
  'admin Beta con p_org di Alfa: total 0');
select is((public.dashboard_stats('e0000000-0000-4000-8000-000000000001',
            '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
            '20000000-0000-4000-8000-000000000001') ->> 'total')::int, 0,
  'admin Beta con p_org e filtri di Alfa: total 0');
select is((public.dashboard_stats('e0000000-0000-4000-8000-000000000002') ->> 'total')::int, 1,
  'admin Beta: la propria organizzazione ha 1 OKR');
select set_eq(
  $$ select (e ->> 'id')::uuid
       from jsonb_array_elements(public.dashboard_stats('e0000000-0000-4000-8000-000000000002') -> 'latest') e $$,
  $$ values ('40000000-0000-4000-8000-000000000006'::uuid) $$,
  'admin Beta: latest contiene solo 4..06');

-- ===========================================================================
-- 6. OKR critici con i filtri (fixture come backend privilegiato)
-- ===========================================================================
reset role;
select set_config('request.jwt.claims', '', true);
insert into public.okrs (id, organization_id, period_id, location_id, owner_id, title, objective, status, priority)
values
  ('40000000-0000-4000-8000-000000000040', 'e0000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000003', 'Critico Roma', 'o', 'attivo', 'critica'),
  ('40000000-0000-4000-8000-000000000041', 'e0000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000003', 'Critico chiuso', 'o', 'completato', 'critica');

select tests.authenticate_as_aal('alfa_viewer_roma', 'aal1');
select set_eq(
  $$ select (e ->> 'id')::uuid
       from jsonb_array_elements(public.dashboard_stats('e0000000-0000-4000-8000-000000000001', null,
              '10000000-0000-4000-8000-000000000002') -> 'critical') e $$,
  $$ values ('40000000-0000-4000-8000-000000000040'::uuid) $$,
  'viewer Roma, sede Roma: critical contiene 4..40 (il completato 4..41 e'' escluso)');

reset role;
select set_config('request.jwt.claims', '', true);
select tests.authenticate_as_aal('alfa_admin', 'aal1');
select is(public.dashboard_stats('e0000000-0000-4000-8000-000000000001', null,
            '10000000-0000-4000-8000-000000000001') -> 'critical', '[]'::jsonb,
  'admin Alfa, sede Milano: i critici di Roma non compaiono');

reset role;
select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
