-- Caso 13 (piano 6.2): periodo chiuso. Il Team Lead non modifica nulla negli OKR del periodo chiuso
-- (Q3 2026); Manager e Admin si'. O5 = OKR di Milano in Q3 (owner tl_milano, team Prodotto).
begin;
select plan(14);

-- Fixture come backend: un secondo OKR modificabile dal TL per provare gli allineamenti.
insert into public.okrs (id, organization_id, period_id, location_id, team_id, owner_id, title, objective)
values ('40000000-0000-4000-8000-000000000011', 'e0000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000004', 'O11', 'o');

select tests.authenticate_as_aal('alfa_tl_milano', 'aal1');
select throws_ok($$update public.okrs set title = 'x' where id = '40000000-0000-4000-8000-000000000005'$$,
  '42501', null, 'tl: non modifica un OKR in periodo chiuso');
select throws_ok($$insert into public.key_results (organization_id, okr_id, title, target_metric)
  values ('e0000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000005', 'kr', 10)$$,
  '42501', null, 'tl: non crea KR in periodo chiuso');
select throws_ok($$update public.key_results set title = 'x' where id = '50000000-0000-4000-8000-000000000005'$$,
  '42501', null, 'tl: non modifica KR in periodo chiuso');
select throws_ok($$delete from public.key_results where id = '50000000-0000-4000-8000-000000000005'$$,
  '42501', null, 'tl: non elimina KR in periodo chiuso');
select throws_ok($$insert into public.actions (organization_id, key_result_id, title)
  values ('e0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000005', 'a')$$,
  '42501', null, 'tl: non crea azioni in periodo chiuso');
select throws_ok($$update public.actions set title = 'x' where id = '60000000-0000-4000-8000-000000000004'$$,
  '42501', null, 'tl: non modifica azioni in periodo chiuso');
select throws_ok($$insert into public.okrs (organization_id, period_id, location_id, owner_id, title, objective)
  values ('e0000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002',
          '10000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000004', 'Nuovo', 'o')$$,
  '42501', null, 'tl: non crea un OKR in periodo chiuso');
select throws_ok($$insert into public.okr_alignments (organization_id, parent_okr_id, child_okr_id)
  values ('e0000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000011')$$,
  '42501', null, 'tl: non allinea un OKR in periodo chiuso');
select throws_ok($$update public.okrs set period_id = '30000000-0000-4000-8000-000000000002'
  where id = '40000000-0000-4000-8000-000000000002'$$,
  '42501', null, 'tl: non sposta un OKR dentro un periodo chiuso');

reset role;
select tests.authenticate_as_aal('alfa_manager', 'aal1');
select lives_ok($$update public.okrs set title = 'Manager' where id = '40000000-0000-4000-8000-000000000005'$$,
  'manager: modifica un OKR in periodo chiuso');
select lives_ok($$insert into public.key_results (organization_id, okr_id, title, target_metric)
  values ('e0000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000005', 'kr', 10)$$,
  'manager: crea KR in periodo chiuso');
select lives_ok($$insert into public.actions (organization_id, key_result_id, title)
  values ('e0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000005', 'a')$$,
  'manager: crea azioni in periodo chiuso');
select lives_ok($$update public.periods set is_closed = false where id = '30000000-0000-4000-8000-000000000002'$$,
  'manager: riapre il periodo');

reset role;
select tests.authenticate_as_aal('alfa_tl_milano', 'aal1');
do $$ declare n int; begin
  update public.okrs set title = 'Riaperto' where id = '40000000-0000-4000-8000-000000000005';
  get diagnostics n = row_count; perform set_config('t.n', n::text, true);
end $$;
select is(current_setting('t.n')::int, 1, 'tl: a periodo riaperto modifica di nuovo l''OKR');

select * from finish();
rollback;
