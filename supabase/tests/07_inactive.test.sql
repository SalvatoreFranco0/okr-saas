-- Piano 6.2, caso 7: membership disattivata e organizzazione disattivata = nessun accesso.
-- my_access() considera solo membership attive in organizzazioni attive.
--
-- UUID: Alfa e..01, Beta e..02; alfa_viewer_roma d..06 (sede Roma, team Prodotto);
-- OKR 4..01 (senza sede) e 4..03 (Roma) sono quelli che il viewer vede da attivo.
begin;
select plan(26);

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
-- 1. Controllo: da attivo il viewer vede la sua organizzazione e scrive commenti
-- ===========================================================================
select tests.authenticate_as_aal('alfa_viewer_roma', 'aal1');
select is((select count(*)::int from public.organizations), 1, 'viewer attivo: vede Alfa');
select is((select count(*)::int from public.okrs), 2, 'viewer attivo: vede 2 OKR (senza sede + Roma)');
select lives_ok(
  $$ insert into public.comments (organization_id, okr_id, user_id, content)
     values ('e0000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
             'd0000000-0000-4000-8000-000000000006', 'Commento da attivo') $$,
  'viewer attivo: puo'' commentare un OKR visibile');

-- ===========================================================================
-- 2. Membership disattivata
-- ===========================================================================
reset role;
select set_config('request.jwt.claims', '', true);
update public.memberships set is_active = false
 where organization_id = 'e0000000-0000-4000-8000-000000000001'
   and user_id = 'd0000000-0000-4000-8000-000000000006';

select tests.authenticate_as_aal('alfa_viewer_roma', 'aal1');
select is_empty($$ select id from public.organizations $$, 'viewer disattivato: nessuna organizzazione');
select is_empty($$ select id from public.okrs $$, 'viewer disattivato: nessun OKR');
select is_empty($$ select id from public.periods $$, 'viewer disattivato: nessun periodo');
select is_empty($$ select id from public.locations $$, 'viewer disattivato: nessuna sede');
select is_empty($$ select id from public.teams $$, 'viewer disattivato: nessun team');
select is_empty($$ select id from public.memberships $$, 'viewer disattivato: nemmeno la propria membership');
select is_empty($$ select user_id from public.membership_locations $$, 'viewer disattivato: nessuna sede assegnata visibile');
select is_empty($$ select team_id from public.team_members $$, 'viewer disattivato: nessun membro di team');
select is_empty($$ select id from public.key_results $$, 'viewer disattivato: nessun KR');
select is_empty($$ select id from public.actions $$, 'viewer disattivato: nessuna azione');
select is_empty($$ select id from public.profiles where id <> auth.uid() $$,
  'viewer disattivato: nessun profilo dei pari');
select is_empty($$ select organization_id from public.v_okr_summary $$, 'viewer disattivato: vista v_okr_summary vuota');
select is((public.dashboard_stats('e0000000-0000-4000-8000-000000000001') ->> 'total')::int, 0,
  'viewer disattivato: dashboard_stats non conta OKR');
select is(private.my_access(), '{}'::jsonb, 'viewer disattivato: mappa dei permessi vuota');
select throws_ok(
  $$ insert into public.comments (organization_id, okr_id, user_id, content)
     values ('e0000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
             'd0000000-0000-4000-8000-000000000006', 'Commento da disattivato') $$,
  '42501', null, 'viewer disattivato: non puo'' piu'' commentare');

-- ===========================================================================
-- 3. Organizzazione disattivata: nessun membro vede nulla (membership di nuovo attiva)
-- ===========================================================================
reset role;
select set_config('request.jwt.claims', '', true);
update public.memberships set is_active = true
 where organization_id = 'e0000000-0000-4000-8000-000000000001'
   and user_id = 'd0000000-0000-4000-8000-000000000006';
update public.organizations set is_active = false
 where id = 'e0000000-0000-4000-8000-000000000001';

-- Stessa query di conteggio per ogni membro di Alfa.
select tests.authenticate_as_aal('alfa_admin', 'aal1');
select is(
  (select count(*)::int from public.organizations) + (select count(*)::int from public.okrs)
  + (select count(*)::int from public.periods) + (select count(*)::int from public.locations)
  + (select count(*)::int from public.teams) + (select count(*)::int from public.memberships)
  + (select count(*)::int from public.key_results) + (select count(*)::int from public.actions)
  + (select count(*)::int from public.audit_logs)
  + (select count(*)::int from public.profiles where id <> auth.uid()),
  0, 'Alfa disattivata: alfa_admin non vede nulla');
select is(private.my_access(), '{}'::jsonb, 'Alfa disattivata: mappa dei permessi di alfa_admin vuota');
select throws_ok(
  $$ insert into public.locations (organization_id, name)
     values ('e0000000-0000-4000-8000-000000000001', 'Firenze') $$,
  '42501', null, 'Alfa disattivata: alfa_admin non crea sedi');

reset role;
select tests.authenticate_as_aal('alfa_manager', 'aal1');
select is(
  (select count(*)::int from public.organizations) + (select count(*)::int from public.okrs)
  + (select count(*)::int from public.periods) + (select count(*)::int from public.locations)
  + (select count(*)::int from public.teams) + (select count(*)::int from public.memberships)
  + (select count(*)::int from public.key_results) + (select count(*)::int from public.actions)
  + (select count(*)::int from public.audit_logs)
  + (select count(*)::int from public.profiles where id <> auth.uid()),
  0, 'Alfa disattivata: alfa_manager non vede nulla');

reset role;
select tests.authenticate_as_aal('alfa_tl_milano', 'aal1');
select is(
  (select count(*)::int from public.organizations) + (select count(*)::int from public.okrs)
  + (select count(*)::int from public.periods) + (select count(*)::int from public.locations)
  + (select count(*)::int from public.teams) + (select count(*)::int from public.memberships)
  + (select count(*)::int from public.key_results) + (select count(*)::int from public.actions)
  + (select count(*)::int from public.audit_logs)
  + (select count(*)::int from public.profiles where id <> auth.uid()),
  0, 'Alfa disattivata: alfa_tl_milano non vede nulla');

reset role;
select tests.authenticate_as_aal('alfa_tl_senza_sede', 'aal1');
select is(
  (select count(*)::int from public.organizations) + (select count(*)::int from public.okrs)
  + (select count(*)::int from public.periods) + (select count(*)::int from public.locations)
  + (select count(*)::int from public.teams) + (select count(*)::int from public.memberships)
  + (select count(*)::int from public.key_results) + (select count(*)::int from public.actions)
  + (select count(*)::int from public.audit_logs)
  + (select count(*)::int from public.profiles where id <> auth.uid()),
  0, 'Alfa disattivata: alfa_tl_senza_sede non vede nulla');

reset role;
select tests.authenticate_as_aal('alfa_viewer_roma', 'aal1');
select is(
  (select count(*)::int from public.organizations) + (select count(*)::int from public.okrs)
  + (select count(*)::int from public.periods) + (select count(*)::int from public.locations)
  + (select count(*)::int from public.teams) + (select count(*)::int from public.memberships)
  + (select count(*)::int from public.key_results) + (select count(*)::int from public.actions)
  + (select count(*)::int from public.audit_logs)
  + (select count(*)::int from public.profiles where id <> auth.uid()),
  0, 'Alfa disattivata: alfa_viewer_roma (membership attiva) non vede nulla');

-- Controllo: Beta, attiva, non e' toccata.
reset role;
select tests.authenticate_as_aal('beta_admin', 'aal1');
select is((select count(*)::int from public.organizations), 1, 'Beta attiva: beta_admin vede ancora la sua organizzazione');

select * from finish();
rollback;
