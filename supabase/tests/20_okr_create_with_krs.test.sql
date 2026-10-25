-- Migrazione 0008: public.okr_create_with_krs(p_okr jsonb, p_krs jsonb) returns uuid.
-- SECURITY INVOKER: decidono le policy di okrs/key_results e i trigger (periodo chiuso,
-- autore, avanzamento). Un errore in qualunque KR annulla anche l'OKR (una sola chiamata).
--
-- UUID (seed): Alfa e..01, Beta e..02; periodi Alfa 3..01 aperto, 3..02 chiuso; sedi Alfa
-- Milano 1..01; team Prodotto 2..01; utenti d..02 alfa_admin, d..04 alfa_tl_milano (Milano,
-- Prodotto), d..05 alfa_tl_senza_sede, d..06 alfa_viewer_roma, d..07 beta_admin.
-- Gli OKR creati qui si riconoscono dal titolo ('RPC ...').
begin;
select plan(30);

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
-- 1. Cataloghi e anon
-- ===========================================================================
select ok(
  not (select prosecdef from pg_proc where oid = 'public.okr_create_with_krs(jsonb, jsonb)'::regprocedure)
  and has_function_privilege('authenticated', 'public.okr_create_with_krs(jsonb, jsonb)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.okr_create_with_krs(jsonb, jsonb)', 'EXECUTE'),
  'okr_create_with_krs: security invoker, eseguibile da authenticated e non da anon');

select tests.clear_authentication();
select throws_ok(
  $$ select public.okr_create_with_krs(
       '{"organization_id":"e0000000-0000-4000-8000-000000000001","period_id":"30000000-0000-4000-8000-000000000001","owner_id":"d0000000-0000-4000-8000-000000000002","title":"RPC anon","objective":"o"}'::jsonb,
       '[{"title":"k","target_metric":10}]'::jsonb) $$,
  '42501', null, 'anon: okr_create_with_krs non eseguibile');
reset role;
select set_config('request.jwt.claims', '', true);

-- ===========================================================================
-- 2. Admin: OKR + 2 KR, avanzamento calcolato dai trigger
-- ===========================================================================
-- KR1: 0 -> 100, attuale 50, peso 100 (50%); KR2: 0 -> 10, attuale 10, peso 300 (100%).
-- Media pesata: (50*100 + 100*300) / 400 = 87.5. KR1 prova anche a forzare l'org di Beta.
select tests.authenticate_as_aal('alfa_admin', 'aal1');
do $$ begin
  perform set_config('t.okr_admin', public.okr_create_with_krs(
    '{"organization_id":"e0000000-0000-4000-8000-000000000001",
      "period_id":"30000000-0000-4000-8000-000000000001",
      "location_id":null,
      "team_id":null,
      "owner_id":"d0000000-0000-4000-8000-000000000002",
      "title":"RPC admin",
      "objective":"Obiettivo creato via RPC",
      "description":null,
      "priority":"alta",
      "start_date":"2026-10-01",
      "end_date":"2026-12-31",
      "tags":["crescita","q4"],
      "notes":"nota"}'::jsonb,
    '[{"title":"KR1","initial_metric":0,"target_metric":100,"current_metric":50,"weight":100,
       "organization_id":"e0000000-0000-4000-8000-000000000002"},
      {"title":"KR2","description":"secondo","unit":"clienti","target_metric":10,"current_metric":10,"weight":300}]'::jsonb
  )::text, true);
exception when others then
  perform set_config('t.okr_admin', 'ERRORE ' || sqlstate || ' ' || sqlerrm, true);
end $$;

select is(
  (select id::text from public.okrs where title = 'RPC admin'),
  current_setting('t.okr_admin'),
  'admin: OKR creato e la funzione restituisce il suo id');
select results_eq(
  $$ select organization_id, owner_id, created_by, priority::text, status::text, tags,
            start_date, end_date, location_id, notes
       from public.okrs where title = 'RPC admin' $$,
  $$ values ('e0000000-0000-4000-8000-000000000001'::uuid, 'd0000000-0000-4000-8000-000000000002'::uuid,
             'd0000000-0000-4000-8000-000000000002'::uuid, 'alta'::text, 'in_pianificazione'::text,
             array['crescita', 'q4']::text[], '2026-10-01'::date, '2026-12-31'::date, null::uuid, 'nota'::text) $$,
  'admin: campi dell''OKR letti dal jsonb; created_by dal trigger, status di default');
select results_eq(
  $$ select k.title, k.organization_id, k.unit, k.initial_metric, k.target_metric, k.current_metric, k.weight
       from public.key_results k
       join public.okrs o on o.id = k.okr_id
      where o.title = 'RPC admin'
      order by k.title $$,
  $$ values ('KR1'::text, 'e0000000-0000-4000-8000-000000000001'::uuid, '%'::text, 0::numeric, 100::numeric, 50::numeric, 100::numeric),
            ('KR2'::text, 'e0000000-0000-4000-8000-000000000001'::uuid, 'clienti'::text, 0::numeric, 10::numeric, 10::numeric, 300::numeric) $$,
  'admin: 2 KR creati con i default della tabella; organization_id sempre quello dell''OKR');
select is(
  (select progress_percentage from public.okrs where title = 'RPC admin'),
  87.5::numeric(5,1), 'admin: avanzamento calcolato dai KR (media pesata 87.5)');
select is(
  (select count(*)::int from public.okr_progress_history h
     join public.okrs o on o.id = h.okr_id
    where o.title = 'RPC admin'),
  1, 'admin: una riga di storico avanzamento per il nuovo OKR');

-- ===========================================================================
-- 3. Atomicita': un KR non valido annulla anche l'OKR
-- ===========================================================================
select throws_ok(
  $$ select public.okr_create_with_krs(
       '{"organization_id":"e0000000-0000-4000-8000-000000000001","period_id":"30000000-0000-4000-8000-000000000001","owner_id":"d0000000-0000-4000-8000-000000000002","title":"RPC KR non valido","objective":"o"}'::jsonb,
       '[{"title":"valido","target_metric":10},{"title":"senza target"}]'::jsonb) $$,
  '23502', null, 'KR con target_metric nullo: errore not null');
select is((select count(*)::int from public.okrs where title = 'RPC KR non valido'), 0,
  'KR non valido: l''OKR non resta creato');
select is((select count(*)::int from public.key_results where title in ('valido', 'senza target')), 0,
  'KR non valido: nessun KR resta creato');

-- ===========================================================================
-- 4. Validazione di p_krs (22023)
-- ===========================================================================
select throws_ok(
  $$ select public.okr_create_with_krs(
       '{"organization_id":"e0000000-0000-4000-8000-000000000001","period_id":"30000000-0000-4000-8000-000000000001","owner_id":"d0000000-0000-4000-8000-000000000002","title":"RPC vuoto","objective":"o"}'::jsonb,
       '[]'::jsonb) $$,
  '22023', null, 'array di KR vuoto: 22023');
select throws_ok(
  $$ select public.okr_create_with_krs(
       '{"organization_id":"e0000000-0000-4000-8000-000000000001","period_id":"30000000-0000-4000-8000-000000000001","owner_id":"d0000000-0000-4000-8000-000000000002","title":"RPC troppi","objective":"o"}'::jsonb,
       (select jsonb_agg(jsonb_build_object('title', 'k' || g, 'target_metric', 10)) from generate_series(1, 21) g)) $$,
  '22023', null, '21 KR: 22023');
select throws_ok(
  $$ select public.okr_create_with_krs(
       '{"organization_id":"e0000000-0000-4000-8000-000000000001","period_id":"30000000-0000-4000-8000-000000000001","owner_id":"d0000000-0000-4000-8000-000000000002","title":"RPC oggetto","objective":"o"}'::jsonb,
       '{"title":"k","target_metric":10}'::jsonb) $$,
  '22023', null, 'p_krs non array: 22023');
select throws_ok(
  $$ select public.okr_create_with_krs(
       '{"organization_id":"e0000000-0000-4000-8000-000000000001","period_id":"30000000-0000-4000-8000-000000000001","owner_id":"d0000000-0000-4000-8000-000000000002","title":"RPC null","objective":"o"}'::jsonb,
       null) $$,
  '22023', null, 'p_krs nullo: 22023');
select throws_ok(
  $$ select public.okr_create_with_krs(
       '{"organization_id":"e0000000-0000-4000-8000-000000000001","period_id":"30000000-0000-4000-8000-000000000001","owner_id":"d0000000-0000-4000-8000-000000000002","title":"RPC scalare","objective":"o"}'::jsonb,
       '[1]'::jsonb) $$,
  '22023', null, 'KR non oggetto: 22023');
select is((select count(*)::int from public.okrs where title like 'RPC %' and title <> 'RPC admin'), 0,
  'input non valido: nessun OKR creato');

-- Con 20 KR (limite superiore) la creazione riesce.
select lives_ok(
  $$ select public.okr_create_with_krs(
       '{"organization_id":"e0000000-0000-4000-8000-000000000001","period_id":"30000000-0000-4000-8000-000000000001","owner_id":"d0000000-0000-4000-8000-000000000002","title":"RPC venti","objective":"o"}'::jsonb,
       (select jsonb_agg(jsonb_build_object('title', 'k' || g, 'target_metric', 10)) from generate_series(1, 20) g)) $$,
  '20 KR: creazione riuscita');
select is(
  (select count(*)::int from public.key_results k join public.okrs o on o.id = k.okr_id where o.title = 'RPC venti'),
  20, '20 KR: tutti creati');

-- ===========================================================================
-- 5. Viewer
-- ===========================================================================
reset role;
select tests.authenticate_as_aal('alfa_viewer_roma', 'aal1');
select throws_ok(
  $$ select public.okr_create_with_krs(
       '{"organization_id":"e0000000-0000-4000-8000-000000000001","period_id":"30000000-0000-4000-8000-000000000001","location_id":"10000000-0000-4000-8000-000000000002","owner_id":"d0000000-0000-4000-8000-000000000006","title":"RPC viewer","objective":"o"}'::jsonb,
       '[{"title":"k","target_metric":10}]'::jsonb) $$,
  '42501', null, 'viewer: non crea OKR');

-- ===========================================================================
-- 6. Team Lead
-- ===========================================================================
reset role;
select tests.authenticate_as_aal('alfa_tl_milano', 'aal1');
do $$ begin
  perform set_config('t.okr_tl', public.okr_create_with_krs(
    '{"organization_id":"e0000000-0000-4000-8000-000000000001",
      "period_id":"30000000-0000-4000-8000-000000000001",
      "location_id":"10000000-0000-4000-8000-000000000001",
      "team_id":"20000000-0000-4000-8000-000000000001",
      "owner_id":"d0000000-0000-4000-8000-000000000004",
      "title":"RPC team lead",
      "objective":"o"}'::jsonb,
    '[{"title":"KR tl","initial_metric":0,"target_metric":4,"current_metric":1}]'::jsonb
  )::text, true);
exception when others then
  perform set_config('t.okr_tl', 'ERRORE ' || sqlstate || ' ' || sqlerrm, true);
end $$;
select is(
  (select id::text from public.okrs where title = 'RPC team lead'),
  current_setting('t.okr_tl'),
  'team lead: crea un OKR proprio a Milano nel proprio team');
select is(
  (select progress_percentage from public.okrs where title = 'RPC team lead'),
  25.0::numeric(5,1), 'team lead: KR creato e avanzamento calcolato (25%)');

select throws_ok(
  $$ select public.okr_create_with_krs(
       '{"organization_id":"e0000000-0000-4000-8000-000000000001","period_id":"30000000-0000-4000-8000-000000000001","owner_id":"d0000000-0000-4000-8000-000000000004","title":"RPC tl senza sede","objective":"o"}'::jsonb,
       '[{"title":"k","target_metric":10}]'::jsonb) $$,
  '42501', null, 'team lead: non crea un OKR senza sede');
select throws_ok(
  $$ select public.okr_create_with_krs(
       '{"organization_id":"e0000000-0000-4000-8000-000000000001","period_id":"30000000-0000-4000-8000-000000000001","location_id":"10000000-0000-4000-8000-000000000001","owner_id":"d0000000-0000-4000-8000-000000000003","title":"RPC tl owner altrui","objective":"o"}'::jsonb,
       '[{"title":"k","target_metric":10}]'::jsonb) $$,
  '42501', null, 'team lead: non crea un OKR con owner altrui');
select throws_ok(
  $$ select public.okr_create_with_krs(
       '{"organization_id":"e0000000-0000-4000-8000-000000000001","period_id":"30000000-0000-4000-8000-000000000002","location_id":"10000000-0000-4000-8000-000000000001","owner_id":"d0000000-0000-4000-8000-000000000004","title":"RPC tl periodo chiuso","objective":"o"}'::jsonb,
       '[{"title":"k","target_metric":10}]'::jsonb) $$,
  '42501', null, 'team lead: non crea un OKR in un periodo chiuso');
select is(
  (select count(*)::int from public.okrs
    where title in ('RPC tl senza sede', 'RPC tl owner altrui', 'RPC tl periodo chiuso')),
  0, 'team lead: i tentativi rifiutati non lasciano OKR');

reset role;
select tests.authenticate_as_aal('alfa_tl_senza_sede', 'aal1');
select throws_ok(
  $$ select public.okr_create_with_krs(
       '{"organization_id":"e0000000-0000-4000-8000-000000000001","period_id":"30000000-0000-4000-8000-000000000001","owner_id":"d0000000-0000-4000-8000-000000000005","title":"RPC tl nessuna sede","objective":"o"}'::jsonb,
       '[{"title":"k","target_metric":10}]'::jsonb) $$,
  '42501', null, 'team lead senza sedi: non crea OKR');

-- ===========================================================================
-- 7. Cross-tenant: admin di Beta con organization_id di Alfa
-- ===========================================================================
reset role;
select tests.authenticate_as_aal('beta_admin', 'aal1');
select throws_ok(
  $$ select public.okr_create_with_krs(
       '{"organization_id":"e0000000-0000-4000-8000-000000000001","period_id":"30000000-0000-4000-8000-000000000001","owner_id":"d0000000-0000-4000-8000-000000000007","title":"RPC cross-tenant","objective":"o"}'::jsonb,
       '[{"title":"k","target_metric":10}]'::jsonb) $$,
  '42501', null, 'admin di Beta: non crea OKR in Alfa');
select throws_ok(
  $$ select public.okr_create_with_krs(
       '{"organization_id":"e0000000-0000-4000-8000-000000000001","period_id":"30000000-0000-4000-8000-000000000001","owner_id":"d0000000-0000-4000-8000-000000000002","title":"RPC cross-tenant 2","objective":"o"}'::jsonb,
       '[{"title":"k","target_metric":10}]'::jsonb) $$,
  '42501', null, 'admin di Beta: non crea OKR in Alfa nemmeno con un owner membro di Alfa');

-- Verifica finale come backend (vede tutto, nessuna RLS).
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select count(*)::int from public.okrs
    where title in ('RPC cross-tenant', 'RPC cross-tenant 2', 'RPC viewer', 'RPC tl nessuna sede', 'RPC anon')),
  0, 'nessun OKR creato dai tentativi negati (anon, viewer, team lead senza sede, cross-tenant)');
select is(
  (select count(*)::int from public.okrs where title like 'RPC %'),
  3, 'restano solo gli OKR creati con successo (admin, 20 KR, team lead)');

select * from finish();
rollback;
