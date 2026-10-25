-- Migrazione 0008: rubrica dei membri (private.member_directory + public.org_member_directory).
-- Restituisce user_id, nome, cognome e ruolo dei membri ATTIVI di p_org, solo se il chiamante
-- ha un ruolo in quell'organizzazione secondo my_access(); altrimenti zero righe.
--
-- UUID (seed): Alfa e..01 con membri attivi d..02 admin, d..03 manager_okr, d..04 team_lead,
-- d..05 team_lead, d..06 viewer; Beta e..02 con d..07 admin; superadmin d..01 (nessuna
-- membership). Nomi del seed: first_name = identificatore, last_name = 'Test'.
-- Sessione di supporto creata qui: a..71 (Alfa).
begin;
select plan(25);

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
-- 1. Cataloghi: colonne restituite (niente email), security, privilegi
-- ===========================================================================
select is(
  (select array_agg(a.name order by a.ord)
     from pg_proc p,
          unnest(p.proargnames, p.proargmodes) with ordinality as a (name, mode, ord)
    where p.oid = 'public.org_member_directory(uuid)'::regprocedure
      and a.mode = 't'),
  array['user_id', 'first_name', 'last_name', 'role']::text[],
  'org_member_directory restituisce solo user_id, first_name, last_name, role (niente email)');
select is(
  (select array_agg(a.name order by a.ord)
     from pg_proc p,
          unnest(p.proargnames, p.proargmodes) with ordinality as a (name, mode, ord)
    where p.oid = 'private.member_directory(uuid)'::regprocedure
      and a.mode = 't'),
  array['user_id', 'first_name', 'last_name', 'role']::text[],
  'private.member_directory restituisce le stesse colonne');
select ok(
  (select prosecdef from pg_proc where oid = 'private.member_directory(uuid)'::regprocedure)
  and not (select prosecdef from pg_proc where oid = 'public.org_member_directory(uuid)'::regprocedure),
  'member_directory e'' security definer (in private), il wrapper in public e'' security invoker');
select ok(
  has_function_privilege('authenticated', 'public.org_member_directory(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'private.member_directory(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.org_member_directory(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'private.member_directory(uuid)', 'EXECUTE'),
  'execute solo ad authenticated, non ad anon');

-- ===========================================================================
-- 2. anon
-- ===========================================================================
select tests.clear_authentication();
select throws_ok(
  $$ select * from public.org_member_directory('e0000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'anon: org_member_directory non eseguibile');
select throws_ok(
  $$ select * from private.member_directory('e0000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'anon: private.member_directory irraggiungibile (nessun USAGE su private)');
reset role;
select set_config('request.jwt.claims', '', true);

-- ===========================================================================
-- 3. Membri di Alfa (tutti i ruoli) vedono i membri attivi di Alfa
-- ===========================================================================
select tests.authenticate_as_aal('alfa_viewer_roma', 'aal1');
select set_eq(
  $$ select user_id, first_name, last_name, role::text
       from public.org_member_directory('e0000000-0000-4000-8000-000000000001') $$,
  $$ values ('d0000000-0000-4000-8000-000000000002'::uuid, 'alfa_admin'::text, 'Test'::text, 'admin'::text),
            ('d0000000-0000-4000-8000-000000000003'::uuid, 'alfa_manager', 'Test', 'manager_okr'),
            ('d0000000-0000-4000-8000-000000000004'::uuid, 'alfa_tl_milano', 'Test', 'team_lead'),
            ('d0000000-0000-4000-8000-000000000005'::uuid, 'alfa_tl_senza_sede', 'Test', 'team_lead'),
            ('d0000000-0000-4000-8000-000000000006'::uuid, 'alfa_viewer_roma', 'Test', 'viewer') $$,
  'viewer: vede nome, cognome e ruolo di tutti i membri attivi di Alfa');
select results_eq(
  $$ select user_id from public.memberships $$,
  $$ values ('d0000000-0000-4000-8000-000000000006'::uuid) $$,
  'viewer: la RLS di memberships resta invariata (solo la propria)');
select set_eq(
  $$ select user_id from private.member_directory('e0000000-0000-4000-8000-000000000001') $$,
  $$ select user_id from public.org_member_directory('e0000000-0000-4000-8000-000000000001') $$,
  'viewer: wrapper e funzione privata restituiscono le stesse righe');
select is_empty(
  $$ select 1 from public.org_member_directory('e0000000-0000-4000-8000-000000000002') $$,
  'viewer di Alfa: rubrica di Beta vuota');

reset role;
select tests.authenticate_as_aal('alfa_tl_milano', 'aal1');
select set_eq(
  $$ select user_id from public.org_member_directory('e0000000-0000-4000-8000-000000000001') $$,
  $$ values ('d0000000-0000-4000-8000-000000000002'::uuid), ('d0000000-0000-4000-8000-000000000003'::uuid),
            ('d0000000-0000-4000-8000-000000000004'::uuid), ('d0000000-0000-4000-8000-000000000005'::uuid),
            ('d0000000-0000-4000-8000-000000000006'::uuid) $$,
  'team lead: vede i membri attivi di Alfa');

reset role;
select tests.authenticate_as_aal('alfa_manager', 'aal1');
select set_eq(
  $$ select user_id from public.org_member_directory('e0000000-0000-4000-8000-000000000001') $$,
  $$ values ('d0000000-0000-4000-8000-000000000002'::uuid), ('d0000000-0000-4000-8000-000000000003'::uuid),
            ('d0000000-0000-4000-8000-000000000004'::uuid), ('d0000000-0000-4000-8000-000000000005'::uuid),
            ('d0000000-0000-4000-8000-000000000006'::uuid) $$,
  'manager: vede i membri attivi di Alfa');

reset role;
select tests.authenticate_as_aal('alfa_admin', 'aal1');
select set_eq(
  $$ select user_id from public.org_member_directory('e0000000-0000-4000-8000-000000000001') $$,
  $$ values ('d0000000-0000-4000-8000-000000000002'::uuid), ('d0000000-0000-4000-8000-000000000003'::uuid),
            ('d0000000-0000-4000-8000-000000000004'::uuid), ('d0000000-0000-4000-8000-000000000005'::uuid),
            ('d0000000-0000-4000-8000-000000000006'::uuid) $$,
  'admin: vede i membri attivi di Alfa');
select is_empty(
  $$ select 1 from public.org_member_directory('e0000000-0000-4000-8000-000000000002') $$,
  'admin di Alfa: rubrica di Beta vuota');
select is_empty(
  $$ select 1 from public.org_member_directory(null) $$,
  'p_org nullo: nessuna riga');

-- ===========================================================================
-- 4. Non membri
-- ===========================================================================
reset role;
select tests.authenticate_as_aal('beta_admin', 'aal1');
select is_empty(
  $$ select 1 from public.org_member_directory('e0000000-0000-4000-8000-000000000001') $$,
  'admin di Beta con l''org di Alfa: nessuna riga');
select is_empty(
  $$ select 1 from private.member_directory('e0000000-0000-4000-8000-000000000001') $$,
  'admin di Beta con l''org di Alfa, chiamando direttamente la funzione privata: nessuna riga');
select results_eq(
  $$ select user_id from public.org_member_directory('e0000000-0000-4000-8000-000000000002') $$,
  $$ values ('d0000000-0000-4000-8000-000000000007'::uuid) $$,
  'admin di Beta: la propria rubrica contiene solo i membri di Beta');

reset role;
select tests.authenticate_as_aal('superadmin', 'aal2');
select is_empty(
  $$ select 1 from public.org_member_directory('e0000000-0000-4000-8000-000000000001') $$,
  'superadmin aal2 senza sessione di supporto: nessuna riga');

-- Con sessione di supporto attiva su Alfa il super-admin diventa admin di Alfa (come in my_access).
reset role;
select set_config('request.jwt.claims', '', true);
insert into public.support_sessions (id, platform_admin_id, organization_id, reason, started_at, expires_at)
values ('a0000000-0000-4000-8000-000000000071', 'd0000000-0000-4000-8000-000000000001',
        'e0000000-0000-4000-8000-000000000001', 'Ticket 7001: verifica rubrica', now(), now() + interval '1 hour');

select tests.authenticate_as_aal('superadmin', 'aal2');
select is(
  (select count(*)::int from public.org_member_directory('e0000000-0000-4000-8000-000000000001')),
  5, 'superadmin in supporto su Alfa: vede i 5 membri attivi di Alfa');
select is_empty(
  $$ select 1 from public.org_member_directory('e0000000-0000-4000-8000-000000000002') $$,
  'superadmin in supporto su Alfa: rubrica di Beta vuota');

reset role;
select tests.authenticate_as_aal('superadmin', 'aal1');
select is_empty(
  $$ select 1 from public.org_member_directory('e0000000-0000-4000-8000-000000000001') $$,
  'superadmin aal1 con sessione attiva: nessuna riga');

-- ===========================================================================
-- 5. Membro disattivato
-- ===========================================================================
reset role;
select set_config('request.jwt.claims', '', true);
update public.memberships set is_active = false
 where organization_id = 'e0000000-0000-4000-8000-000000000001'
   and user_id = 'd0000000-0000-4000-8000-000000000006';

select tests.authenticate_as_aal('alfa_viewer_roma', 'aal1');
select is_empty(
  $$ select 1 from public.org_member_directory('e0000000-0000-4000-8000-000000000001') $$,
  'viewer disattivato: nessuna riga');
select is_empty(
  $$ select 1 from private.member_directory('e0000000-0000-4000-8000-000000000001') $$,
  'viewer disattivato, funzione privata: nessuna riga');

reset role;
select tests.authenticate_as_aal('alfa_tl_milano', 'aal1');
select set_eq(
  $$ select user_id from public.org_member_directory('e0000000-0000-4000-8000-000000000001') $$,
  $$ values ('d0000000-0000-4000-8000-000000000002'::uuid), ('d0000000-0000-4000-8000-000000000003'::uuid),
            ('d0000000-0000-4000-8000-000000000004'::uuid), ('d0000000-0000-4000-8000-000000000005'::uuid) $$,
  'il membro disattivato non compare nella rubrica');

reset role;
select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
