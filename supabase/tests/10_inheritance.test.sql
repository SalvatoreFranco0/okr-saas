-- Caso 10 (piano 6.2): KR, azioni e allineamenti seguono i permessi dell'OKR padre, per ogni ruolo.
-- O1 = senza sede (owner admin); O2 = Milano/Prodotto (owner tl_milano); O3 = Roma/Vendite.
-- Fixture: O11 e O12 = Milano/Prodotto, owner tl_milano (modificabili dal TL di Milano).
begin;
select plan(26);

insert into public.okrs (id, organization_id, period_id, location_id, team_id, owner_id, title, objective)
values
  ('40000000-0000-4000-8000-000000000011', 'e0000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000004', 'O11', 'o'),
  ('40000000-0000-4000-8000-000000000012', 'e0000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000004', 'O12', 'o');

-- ---------------------------------------------------------------------------
-- admin
-- ---------------------------------------------------------------------------
select tests.authenticate_as_aal('alfa_admin', 'aal1');
select lives_ok($$insert into public.key_results (organization_id, okr_id, title, target_metric)
  values ('e0000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', 'kr', 10)$$,
  'admin: KR su OKR di Milano');
select lives_ok($$insert into public.key_results (organization_id, okr_id, title, target_metric)
  values ('e0000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'kr', 10)$$,
  'admin: KR su OKR senza sede');
select lives_ok($$insert into public.actions (organization_id, key_result_id, title)
  values ('e0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002', 'a')$$,
  'admin: azione');
select lives_ok($$insert into public.okr_alignments (organization_id, parent_okr_id, child_okr_id)
  values ('e0000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000011')$$,
  'admin: allineamento');

-- ---------------------------------------------------------------------------
-- manager
-- ---------------------------------------------------------------------------
reset role;
select tests.authenticate_as_aal('alfa_manager', 'aal1');
select lives_ok($$insert into public.key_results (organization_id, okr_id, title, target_metric)
  values ('e0000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000003', 'kr', 10)$$,
  'manager: KR su OKR di Roma');
select lives_ok($$insert into public.actions (organization_id, key_result_id, title)
  values ('e0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000004', 'a')$$,
  'manager: azione');
select lives_ok($$insert into public.okr_alignments (organization_id, parent_okr_id, child_okr_id)
  values ('e0000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000012')$$,
  'manager: allineamento');

-- ---------------------------------------------------------------------------
-- team lead di Milano
-- ---------------------------------------------------------------------------
reset role;
select tests.authenticate_as_aal('alfa_tl_milano', 'aal1');
select lives_ok($$insert into public.key_results (organization_id, okr_id, title, target_metric)
  values ('e0000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', 'kr', 10)$$,
  'tl: KR su OKR modificabile');
select throws_ok($$insert into public.key_results (organization_id, okr_id, title, target_metric)
  values ('e0000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'kr', 10)$$,
  '42501', null, 'tl: niente KR su OKR senza sede');
select throws_ok($$insert into public.key_results (organization_id, okr_id, title, target_metric)
  values ('e0000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000003', 'kr', 10)$$,
  '42501', null, 'tl: niente KR su OKR di Roma');
select lives_ok($$insert into public.actions (organization_id, key_result_id, title)
  values ('e0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002', 'a')$$,
  'tl: azione su KR di OKR modificabile');
select throws_ok($$insert into public.actions (organization_id, key_result_id, title)
  values ('e0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'a')$$,
  '42501', null, 'tl: niente azione su KR di OKR non modificabile');
select lives_ok($$insert into public.okr_alignments (organization_id, parent_okr_id, child_okr_id)
  values ('e0000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000011', '40000000-0000-4000-8000-000000000012')$$,
  'tl: allineamento tra due OKR che puo'' modificare');
select throws_ok($$insert into public.okr_alignments (organization_id, parent_okr_id, child_okr_id)
  values ('e0000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000012')$$,
  '42501', null, 'tl: niente allineamento con un OKR che non puo'' modificare');
do $$ declare n int; begin
  delete from public.okr_alignments
   where parent_okr_id = '40000000-0000-4000-8000-000000000001' and child_okr_id = '40000000-0000-4000-8000-000000000002';
  get diagnostics n = row_count; perform set_config('t.n', n::text, true);
end $$;
select is(current_setting('t.n')::int, 0, 'tl: non elimina un allineamento con un OKR non modificabile');
do $$ declare n int; begin
  update public.key_results set title = 'Hack' where id = '50000000-0000-4000-8000-000000000001';
  get diagnostics n = row_count; perform set_config('t.n', n::text, true);
end $$;
select is(current_setting('t.n')::int, 0, 'tl: non modifica un KR di un OKR non modificabile');
do $$ declare n int; begin
  delete from public.key_results where id = '50000000-0000-4000-8000-000000000001';
  get diagnostics n = row_count; perform set_config('t.n', n::text, true);
end $$;
select is(current_setting('t.n')::int, 0, 'tl: non elimina un KR di un OKR non modificabile');

-- ---------------------------------------------------------------------------
-- viewer di Roma: sola lettura
-- ---------------------------------------------------------------------------
reset role;
select tests.authenticate_as_aal('alfa_viewer_roma', 'aal1');
select throws_ok($$insert into public.key_results (organization_id, okr_id, title, target_metric)
  values ('e0000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'kr', 10)$$,
  '42501', null, 'viewer: niente KR neanche su OKR visibile');
select throws_ok($$insert into public.okr_alignments (organization_id, parent_okr_id, child_okr_id)
  values ('e0000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000003')$$,
  '42501', null, 'viewer: niente allineamenti');
select is_empty($$select 1 from public.okr_alignments$$,
  'viewer: vede gli allineamenti solo se vede entrambi gli OKR (qui nessuno)');

-- ---------------------------------------------------------------------------
-- team lead senza sede: vede solo O1, che non puo' modificare
-- ---------------------------------------------------------------------------
reset role;
select tests.authenticate_as_aal('alfa_tl_senza_sede', 'aal1');
do $$ declare n int; begin
  update public.key_results set title = 'Hack' where id = '50000000-0000-4000-8000-000000000001';
  get diagnostics n = row_count; perform set_config('t.n', n::text, true);
end $$;
select is(current_setting('t.n')::int, 0, 'tl senza sede: non modifica il KR di un OKR senza sede');
select throws_ok($$insert into public.key_results (organization_id, okr_id, title, target_metric)
  values ('e0000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'kr', 10)$$,
  '42501', null, 'tl senza sede: niente KR su OKR senza sede');
select is_empty($$select 1 from public.okr_alignments$$, 'tl senza sede: nessun allineamento visibile');

-- ---------------------------------------------------------------------------
-- admin di Beta: niente su Alfa
-- ---------------------------------------------------------------------------
reset role;
select tests.authenticate_as_aal('beta_admin', 'aal1');
select throws_ok($$insert into public.key_results (organization_id, okr_id, title, target_metric)
  values ('e0000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', 'kr', 10)$$,
  '42501', null, 'beta: niente KR su OKR di Alfa');
select is_empty($$select 1 from public.key_results where organization_id = 'e0000000-0000-4000-8000-000000000001'$$,
  'beta: non legge KR di Alfa');
select is_empty($$select 1 from public.okr_alignments where organization_id = 'e0000000-0000-4000-8000-000000000001'$$,
  'beta: non legge allineamenti di Alfa');

select * from finish();
rollback;
