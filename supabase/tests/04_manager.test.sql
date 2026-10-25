-- Caso 4 (piano 6.2): alfa_manager (manager_okr) in Alfa.
-- Vede tutte le sedi e gli eliminati, fa soft delete, gestisce periodi e team, non tocca Beta,
-- non scrive memberships; legge l'audit.
begin;
select plan(21);

select tests.authenticate_as_aal('alfa_manager', 'aal1');

select set_eq($$select id from public.okrs$$,
  $$values ('40000000-0000-4000-8000-000000000001'::uuid), ('40000000-0000-4000-8000-000000000002'::uuid),
           ('40000000-0000-4000-8000-000000000003'::uuid), ('40000000-0000-4000-8000-000000000004'::uuid),
           ('40000000-0000-4000-8000-000000000005'::uuid)$$,
  'vede tutti gli OKR di Alfa, anche eliminati e di ogni sede');
select is_empty($$select 1 from public.okrs where organization_id = 'e0000000-0000-4000-8000-000000000002'$$,
  'non vede OKR di Beta');
select is_empty($$select 1 from public.key_results where organization_id = 'e0000000-0000-4000-8000-000000000002'$$,
  'non vede KR di Beta');
select results_eq($$select id from public.organizations$$,
  $$values ('e0000000-0000-4000-8000-000000000001'::uuid)$$, 'vede solo Alfa');

-- Soft delete e ripristino
do $$ declare n int; begin
  update public.okrs set deleted_at = now() where id = '40000000-0000-4000-8000-000000000003';
  get diagnostics n = row_count; perform set_config('t.n', n::text, true);
end $$;
select is(current_setting('t.n')::int, 1, 'fa soft delete di un OKR');
do $$ declare n int; begin
  update public.okrs set deleted_at = null where id = '40000000-0000-4000-8000-000000000004';
  get diagnostics n = row_count; perform set_config('t.n', n::text, true);
end $$;
select is(current_setting('t.n')::int, 1, 'ripristina un OKR eliminato');
select throws_ok($$delete from public.okrs where id = '40000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'non elimina fisicamente (nessun privilegio DELETE)');

-- Scrittura sul dominio, anche in sede non propria e senza sede
select lives_ok($$insert into public.okrs (organization_id, period_id, location_id, owner_id, title, objective)
  values ('e0000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
          '10000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000004', 'Roma per TL', 'o')$$,
  'crea un OKR a Roma con owner un altro membro');
do $$ declare n int; begin
  update public.okrs set title = 'Aggiornato' where id = '40000000-0000-4000-8000-000000000001';
  get diagnostics n = row_count; perform set_config('t.n', n::text, true);
end $$;
select is(current_setting('t.n')::int, 1, 'modifica un OKR senza sede');
select lives_ok($$insert into public.key_results (organization_id, okr_id, title, target_metric)
  values ('e0000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000003', 'kr', 10)$$,
  'crea un KR su un OKR di qualunque sede');
select lives_ok($$insert into public.actions (organization_id, key_result_id, title)
  values ('e0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000004', 'a')$$,
  'crea un''azione');

-- Periodi e team: CRUD senza delete; sedi in sola lettura
select lives_ok($$insert into public.periods (organization_id, name, start_date, end_date)
  values ('e0000000-0000-4000-8000-000000000001', 'Q1 2027', '2027-01-01', '2027-03-31')$$,
  'crea un periodo');
select lives_ok($$update public.periods set is_closed = true where name = 'Q1 2027'$$, 'chiude un periodo');
select throws_ok($$delete from public.periods where name = 'Q1 2027'$$, '42501', null, 'non elimina periodi');
select lives_ok($$insert into public.teams (organization_id, name)
  values ('e0000000-0000-4000-8000-000000000001', 'Nuovo team')$$, 'crea un team');
select lives_ok($$insert into public.team_members (organization_id, team_id, user_id)
  values ('e0000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003',
          'd0000000-0000-4000-8000-000000000006')$$,
  'gestisce i membri dei team');
select throws_ok($$insert into public.locations (organization_id, name)
  values ('e0000000-0000-4000-8000-000000000001', 'Napoli')$$,
  '42501', null, 'non crea sedi (solo Admin)');

-- Membership: lettura di tutte, nessuna scrittura
select is((select count(*)::int from public.memberships), 5, 'legge le membership di Alfa');
select throws_ok($$update public.memberships set role = 'admin' where user_id = 'd0000000-0000-4000-8000-000000000003'$$,
  '42501', null, 'non si promuove ad admin');

-- Audit
select cmp_ok((select count(*)::int from public.audit_logs), '>', 0, 'legge l''audit di Alfa');
select is_empty($$select 1 from public.audit_logs where organization_id = 'e0000000-0000-4000-8000-000000000002'$$,
  'non legge l''audit di Beta');

select * from finish();
rollback;
