-- Caso 3 (piano 6.2): alfa_tl_milano (team_lead, sede Milano, team Prodotto) e
-- alfa_tl_senza_sede (team_lead, nessuna sede, team Vendite).
begin;
select plan(28);

-- Fixture come backend privilegiato: un OKR di Milano di un altro owner, fuori dal team del TL.
insert into public.okrs (id, organization_id, period_id, location_id, team_id, owner_id, title, objective)
values ('40000000-0000-4000-8000-000000000010', 'e0000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000002',
        'Milano altrui', 'fuori dal team');

-- ---------------------------------------------------------------------------
-- alfa_tl_milano
-- ---------------------------------------------------------------------------
select tests.authenticate_as_aal('alfa_tl_milano', 'aal1');

select set_eq($$select id from public.okrs$$,
  $$values ('40000000-0000-4000-8000-000000000001'::uuid), ('40000000-0000-4000-8000-000000000002'::uuid),
           ('40000000-0000-4000-8000-000000000005'::uuid), ('40000000-0000-4000-8000-000000000010'::uuid)$$,
  'vede senza sede + Milano (non Roma, non eliminati, non Beta)');

-- Creazione
select lives_ok($$insert into public.okrs (organization_id, period_id, location_id, team_id, owner_id, title, objective)
  values ('e0000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
          '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
          'd0000000-0000-4000-8000-000000000004', 'Mio', 'o')$$,
  'crea un OKR proprio a Milano nel proprio team');
select lives_ok($$insert into public.okrs (organization_id, period_id, location_id, owner_id, title, objective)
  values ('e0000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
          '10000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000004', 'Mio2', 'o')$$,
  'crea un OKR proprio a Milano senza team');
select throws_ok($$insert into public.okrs (organization_id, period_id, location_id, owner_id, title, objective)
  values ('e0000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
          '10000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000004', 'Roma', 'o')$$,
  '42501', null, 'non crea un OKR a Roma');
select throws_ok($$insert into public.okrs (organization_id, period_id, location_id, owner_id, title, objective)
  values ('e0000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
          '10000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000003', 'Altrui', 'o')$$,
  '42501', null, 'non crea un OKR con owner altrui');
select throws_ok($$insert into public.okrs (organization_id, period_id, owner_id, title, objective)
  values ('e0000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
          'd0000000-0000-4000-8000-000000000004', 'Senza sede', 'o')$$,
  '42501', null, 'non crea un OKR senza sede');
select throws_ok($$insert into public.okrs (organization_id, period_id, location_id, team_id, owner_id, title, objective)
  values ('e0000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
          '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002',
          'd0000000-0000-4000-8000-000000000004', 'Team altrui', 'o')$$,
  '42501', null, 'non crea un OKR in un team di cui non e'' membro');
select throws_ok($$insert into public.okrs (organization_id, period_id, location_id, owner_id, title, objective)
  values ('e0000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003',
          '10000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000004', 'Beta', 'o')$$,
  '42501', null, 'non crea OKR in Beta');

-- Modifica
do $$ declare n int; begin
  update public.okrs set title = 'Aggiornato' where id = '40000000-0000-4000-8000-000000000002';
  get diagnostics n = row_count; perform set_config('t.n', n::text, true);
end $$;
select is(current_setting('t.n')::int, 1, 'modifica un OKR del proprio team');
do $$ declare n int; begin
  update public.okrs set title = 'Hack' where id = '40000000-0000-4000-8000-000000000010';
  get diagnostics n = row_count; perform set_config('t.n', n::text, true);
end $$;
select is(current_setting('t.n')::int, 0, 'non modifica un OKR altrui fuori dal proprio team');
do $$ declare n int; begin
  update public.okrs set title = 'Hack' where id = '40000000-0000-4000-8000-000000000001';
  get diagnostics n = row_count; perform set_config('t.n', n::text, true);
end $$;
select is(current_setting('t.n')::int, 0, 'non modifica un OKR senza sede');
select throws_ok($$update public.okrs set deleted_at = now() where id = '40000000-0000-4000-8000-000000000002'$$,
  '42501', null, 'non puo'' impostare deleted_at');
select throws_ok($$update public.okrs set location_id = '10000000-0000-4000-8000-000000000002'
  where id = '40000000-0000-4000-8000-000000000002'$$,
  '42501', null, 'non puo'' spostare il proprio OKR su una sede non sua (WITH CHECK)');
select throws_ok($$delete from public.okrs where id = '40000000-0000-4000-8000-000000000002'$$,
  '42501', null, 'non elimina OKR (nessun privilegio DELETE)');

-- KR e azioni ereditano
select lives_ok($$insert into public.key_results (organization_id, okr_id, title, target_metric)
  values ('e0000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', 'kr', 10)$$,
  'crea un KR su un OKR che puo'' modificare');
select throws_ok($$insert into public.key_results (organization_id, okr_id, title, target_metric)
  values ('e0000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'kr', 10)$$,
  '42501', null, 'non crea un KR su un OKR senza sede');
select throws_ok($$insert into public.key_results (organization_id, okr_id, title, target_metric)
  values ('e0000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000003', 'kr', 10)$$,
  '42501', null, 'non crea un KR su un OKR che non vede');
select lives_ok($$insert into public.actions (organization_id, key_result_id, title)
  values ('e0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002', 'a')$$,
  'crea un''azione su un KR modificabile');
select throws_ok($$insert into public.actions (organization_id, key_result_id, title)
  values ('e0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'a')$$,
  '42501', null, 'non crea un''azione su un KR di un OKR non modificabile');

-- Membership e struttura: nessuna scrittura
select throws_ok($$insert into public.memberships (organization_id, user_id, role)
  values ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000007', 'viewer')$$,
  '42501', null, 'non crea membership');
select throws_ok($$update public.memberships set role = 'admin' where user_id = 'd0000000-0000-4000-8000-000000000004'$$,
  '42501', null, 'non si promuove ad admin');
select results_eq($$select user_id from public.memberships$$,
  $$values ('d0000000-0000-4000-8000-000000000004'::uuid)$$, 'vede solo la propria membership');
select throws_ok($$insert into public.periods (organization_id, name, start_date, end_date)
  values ('e0000000-0000-4000-8000-000000000001', 'Q1 2027', '2027-01-01', '2027-03-31')$$,
  '42501', null, 'non crea periodi');
select throws_ok($$insert into public.teams (organization_id, name)
  values ('e0000000-0000-4000-8000-000000000001', 'Nuovo')$$,
  '42501', null, 'non crea team');

-- ---------------------------------------------------------------------------
-- alfa_tl_senza_sede
-- ---------------------------------------------------------------------------
reset role;
select tests.authenticate_as_aal('alfa_tl_senza_sede', 'aal1');

select set_eq($$select id from public.okrs$$,
  $$values ('40000000-0000-4000-8000-000000000001'::uuid)$$,
  'senza sedi vede solo gli OKR senza sede');
select throws_ok($$insert into public.okrs (organization_id, period_id, owner_id, title, objective)
  values ('e0000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
          'd0000000-0000-4000-8000-000000000005', 'x', 'o')$$,
  '42501', null, 'senza sedi non crea OKR senza sede');
select throws_ok($$insert into public.okrs (organization_id, period_id, location_id, owner_id, title, objective)
  values ('e0000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
          '10000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000005', 'x', 'o')$$,
  '42501', null, 'senza sedi non crea OKR in una sede');
do $$ declare n int; begin
  update public.okrs set title = 'Hack' where id = '40000000-0000-4000-8000-000000000001';
  get diagnostics n = row_count; perform set_config('t.n', n::text, true);
end $$;
select is(current_setting('t.n')::int, 0, 'senza sedi non modifica OKR');

select * from finish();
rollback;
