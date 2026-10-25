-- Caso 2 (piano 6.2): alfa_viewer_roma (viewer, sede Roma, team Prodotto) in Alfa.
-- Vede OKR senza sede + Roma; non vede Milano, eliminati, Beta; non scrive nulla di dominio.
-- Convenzione: UUID del seed (vedi supabase/seed.sql). Gli update/delete negati dalla RLS non
-- danno errore ma toccano 0 righe: si contano con GET DIAGNOSTICS.
begin;
select plan(35);

select tests.authenticate_as_aal('alfa_viewer_roma', 'aal1');

-- Lettura
select results_eq($$select id from public.organizations$$,
  $$values ('e0000000-0000-4000-8000-000000000001'::uuid)$$,
  'vede solo la propria organizzazione');
select set_eq($$select id from public.okrs$$,
  $$values ('40000000-0000-4000-8000-000000000001'::uuid), ('40000000-0000-4000-8000-000000000003'::uuid)$$,
  'vede solo OKR senza sede e di Roma (non Milano, non eliminati)');
select is_empty($$select 1 from public.okrs where organization_id = 'e0000000-0000-4000-8000-000000000002'$$,
  'non vede OKR di Beta');
select set_eq($$select id from public.key_results$$,
  $$values ('50000000-0000-4000-8000-000000000001'::uuid), ('50000000-0000-4000-8000-000000000004'::uuid)$$,
  'KR ereditati dagli OKR visibili');
select set_eq($$select id from public.actions$$,
  $$values ('60000000-0000-4000-8000-000000000001'::uuid), ('60000000-0000-4000-8000-000000000003'::uuid)$$,
  'azioni ereditate dai KR visibili');
select set_eq($$select distinct okr_id from public.okr_progress_history$$,
  $$values ('40000000-0000-4000-8000-000000000001'::uuid), ('40000000-0000-4000-8000-000000000003'::uuid)$$,
  'storico avanzamento solo degli OKR visibili');

-- Scrittura OKR / KR / azioni negata
select throws_ok($$insert into public.okrs (organization_id, period_id, owner_id, title, objective)
  values ('e0000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
          'd0000000-0000-4000-8000-000000000006', 't', 'o')$$,
  '42501', null, 'non puo'' creare OKR');
do $$ declare n int; begin
  update public.okrs set title = 'x' where id = '40000000-0000-4000-8000-000000000003';
  get diagnostics n = row_count; perform set_config('t.n', n::text, true);
end $$;
select is(current_setting('t.n')::int, 0, 'non puo'' modificare un OKR visibile');
select throws_ok($$delete from public.okrs where id = '40000000-0000-4000-8000-000000000003'$$,
  '42501', null, 'non puo'' eliminare OKR (nessun privilegio DELETE)');
select throws_ok($$insert into public.key_results (organization_id, okr_id, title, target_metric)
  values ('e0000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000003', 'kr', 10)$$,
  '42501', null, 'non puo'' creare KR');
do $$ declare n int; begin
  update public.key_results set title = 'x' where id = '50000000-0000-4000-8000-000000000004';
  get diagnostics n = row_count; perform set_config('t.n', n::text, true);
end $$;
select is(current_setting('t.n')::int, 0, 'non puo'' modificare un KR');
do $$ declare n int; begin
  delete from public.key_results where id = '50000000-0000-4000-8000-000000000004';
  get diagnostics n = row_count; perform set_config('t.n', n::text, true);
end $$;
select is(current_setting('t.n')::int, 0, 'non puo'' eliminare un KR');
select throws_ok($$insert into public.actions (organization_id, key_result_id, title)
  values ('e0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000004', 'a')$$,
  '42501', null, 'non puo'' creare azioni');
do $$ declare n int; begin
  update public.actions set title = 'x' where id = '60000000-0000-4000-8000-000000000003';
  get diagnostics n = row_count; perform set_config('t.n', n::text, true);
end $$;
select is(current_setting('t.n')::int, 0, 'non puo'' modificare un''azione');
do $$ declare n int; begin
  delete from public.actions where id = '60000000-0000-4000-8000-000000000003';
  get diagnostics n = row_count; perform set_config('t.n', n::text, true);
end $$;
select is(current_setting('t.n')::int, 0, 'non puo'' eliminare un''azione');

-- Membership: solo la propria
select results_eq($$select user_id from public.memberships$$,
  $$values ('d0000000-0000-4000-8000-000000000006'::uuid)$$, 'vede solo la propria membership');
select results_eq($$select user_id from public.membership_locations$$,
  $$values ('d0000000-0000-4000-8000-000000000006'::uuid)$$, 'vede solo le proprie sedi');

-- Struttura: lettura si, scrittura no
select is((select count(*)::int from public.periods), 2, 'legge i periodi di Alfa');
select is((select count(*)::int from public.locations), 2, 'legge le sedi di Alfa');
select is((select count(*)::int from public.teams), 3, 'legge i team di Alfa');
select throws_ok($$insert into public.periods (organization_id, name, start_date, end_date)
  values ('e0000000-0000-4000-8000-000000000001', 'Q1 2027', '2027-01-01', '2027-03-31')$$,
  '42501', null, 'non puo'' creare periodi');
select throws_ok($$insert into public.locations (organization_id, name)
  values ('e0000000-0000-4000-8000-000000000001', 'Napoli')$$,
  '42501', null, 'non puo'' creare sedi');
select throws_ok($$insert into public.teams (organization_id, name)
  values ('e0000000-0000-4000-8000-000000000001', 'Nuovo')$$,
  '42501', null, 'non puo'' creare team');
select throws_ok($$insert into public.team_members (organization_id, team_id, user_id)
  values ('e0000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002',
          'd0000000-0000-4000-8000-000000000006')$$,
  '42501', null, 'non puo'' modificare i membri dei team');

-- Profili
select set_eq($$select id from public.profiles$$,
  $$values ('d0000000-0000-4000-8000-000000000002'::uuid), ('d0000000-0000-4000-8000-000000000003'::uuid),
           ('d0000000-0000-4000-8000-000000000004'::uuid), ('d0000000-0000-4000-8000-000000000005'::uuid),
           ('d0000000-0000-4000-8000-000000000006'::uuid)$$,
  'vede i profili dei membri di Alfa, non quelli di Beta o del super-admin');
do $$ declare n int; begin
  update public.profiles set first_name = 'Nuovo' where id = 'd0000000-0000-4000-8000-000000000006';
  get diagnostics n = row_count; perform set_config('t.n', n::text, true);
end $$;
select is(current_setting('t.n')::int, 1, 'modifica il proprio profilo');
do $$ declare n int; begin
  update public.profiles set first_name = 'Hack' where id = 'd0000000-0000-4000-8000-000000000002';
  get diagnostics n = row_count; perform set_config('t.n', n::text, true);
end $$;
select is(current_setting('t.n')::int, 0, 'non modifica il profilo altrui');
select throws_ok($$update public.profiles set email = 'x@x.it' where id = 'd0000000-0000-4000-8000-000000000006'$$,
  '42501', null, 'non modifica la propria email (privilegio di colonna)');

-- Commenti: scrittura per tutti i ruoli, sugli OKR visibili, autore dal JWT
select lives_ok($$insert into public.comments (organization_id, okr_id, user_id, content)
  values ('e0000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000003',
          'd0000000-0000-4000-8000-000000000002', 'ciao')$$,
  'commenta un OKR visibile (anche firmando a nome di altri)');
select is((select count(*)::int from public.comments where user_id = 'd0000000-0000-4000-8000-000000000002'), 0,
  'l''autore del commento e'' sovrascritto con l''utente del JWT');
select throws_ok($$insert into public.comments (organization_id, okr_id, user_id, content)
  values ('e0000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002',
          'd0000000-0000-4000-8000-000000000006', 'no')$$,
  '42501', null, 'non commenta un OKR che non vede');

-- Tabelle senza accesso
select is_empty($$select 1 from public.audit_logs$$, 'non legge l''audit');
select throws_ok($$insert into public.key_result_updates (organization_id, key_result_id, new_value)
  values ('e0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000004', 1)$$,
  '42501', null, 'non scrive key_result_updates (solo trigger)');
select is_empty($$select 1 from public.platform_admins$$, 'non legge platform_admins');
select is_empty($$select 1 from public.support_sessions$$, 'non legge support_sessions');

select * from finish();
rollback;
