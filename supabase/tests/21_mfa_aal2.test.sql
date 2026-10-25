-- Migrazione 0009: con un fattore MFA verificato serve un JWT aal2 per accedere ai dati.
-- private.my_access() ignora le membership se l'utente ha in auth.mfa_factors un fattore con
-- status 'verified' e il claim aal non e' 'aal2'. La sessione di supporto del super-admin
-- (gia' vincolata ad aal2 da is_platform_admin) e is_platform_admin() non cambiano.
--
-- I fattori si inseriscono come postgres dentro la transazione (rollback finale). Il seed non
-- crea fattori MFA: tutti gli altri test girano con utenti senza fattori.
-- UUID: superadmin d..01, alfa_admin d..02, alfa_manager d..03, alfa_tl_milano d..04,
-- alfa_tl_senza_sede d..05, alfa_viewer_roma d..06; Alfa e..01 (5 OKR nel seed).
-- Fattori creati qui: b1..01-b1..05. Sessione di supporto: a..81 (Alfa).
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
-- 0. Forma della funzione invariata e seed senza fattori
-- ===========================================================================
select ok(
  (select prosecdef and provolatile = 's' from pg_proc where oid = 'private.my_access()'::regprocedure)
  and has_function_privilege('authenticated', 'private.my_access()', 'EXECUTE')
  and not has_function_privilege('anon', 'private.my_access()', 'EXECUTE'),
  'my_access: ancora security definer, stable, eseguibile solo da authenticated');
select is_empty(
  $$ select 1 from auth.mfa_factors f join auth.users u on u.id = f.user_id
      where u.email like '%@test.local' $$,
  'il seed non crea fattori MFA (gli altri test non sono influenzati)');

-- ===========================================================================
-- 1. alfa_admin senza fattori, aal1: accesso invariato
-- ===========================================================================
select tests.authenticate_as_aal('alfa_admin', 'aal1');
select is((select count(*)::int from public.organizations), 1, 'senza fattori, aal1: vede Alfa');
select is(private.my_access() -> 'e0000000-0000-4000-8000-000000000001' ->> 'role', 'admin',
  'senza fattori, aal1: ruolo admin su Alfa');

-- ===========================================================================
-- 2. Fattore verificato per alfa_admin, non verificato per alfa_manager
-- ===========================================================================
reset role;
select set_config('request.jwt.claims', '', true);
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
values
  ('b1000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002',
   'TOTP alfa_admin', 'totp', 'verified', now(), now(), 'SEGRETODITESTNONREALE01'),
  ('b1000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000003',
   'TOTP alfa_manager', 'totp', 'unverified', now(), now(), 'SEGRETODITESTNONREALE02');

-- alfa_admin con fattore verificato e JWT aal1: nessun accesso
select tests.authenticate_as_aal('alfa_admin', 'aal1');
select is(private.my_access(), '{}'::jsonb, 'fattore verificato, aal1: mappa dei permessi vuota');
select is_empty($$ select id from public.organizations $$, 'fattore verificato, aal1: nessuna organizzazione');
select is_empty($$ select id from public.okrs $$, 'fattore verificato, aal1: nessun OKR');
select is_empty($$ select id from public.key_results $$, 'fattore verificato, aal1: nessun KR');
select is_empty($$ select id from public.memberships $$, 'fattore verificato, aal1: nessuna membership');
select is_empty($$ select id from public.periods $$, 'fattore verificato, aal1: nessun periodo');
select is_empty($$ select id from public.profiles where id <> auth.uid() $$,
  'fattore verificato, aal1: nessun profilo dei pari');
select is((select count(*)::int from public.profiles where id = auth.uid()), 1,
  'fattore verificato, aal1: resta leggibile solo il proprio profilo');
select is_empty($$ select 1 from public.org_member_directory('e0000000-0000-4000-8000-000000000001') $$,
  'fattore verificato, aal1: rubrica dei membri vuota');
select is((public.dashboard_stats('e0000000-0000-4000-8000-000000000001') ->> 'total')::int, 0,
  'fattore verificato, aal1: dashboard_stats non conta OKR');
select throws_ok(
  $$ insert into public.okrs (organization_id, period_id, owner_id, title, objective)
     values ('e0000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
             'd0000000-0000-4000-8000-000000000002', 'MFA aal1', 'o') $$,
  '42501', null, 'fattore verificato, aal1: non crea OKR');
do $$ declare n int; begin
  update public.okrs set title = 'MFA aal1' where id = '40000000-0000-4000-8000-000000000001';
  get diagnostics n = row_count; perform set_config('t.n', n::text, true);
end $$;
select is(current_setting('t.n')::int, 0, 'fattore verificato, aal1: non modifica OKR');

-- Claim aal assente (JWT senza aal): trattato come non aal2
reset role;
select tests.authenticate_as('alfa_admin');
select is(private.my_access(), '{}'::jsonb, 'fattore verificato, claim aal assente: mappa vuota');

-- ===========================================================================
-- 3. Stesso utente con aal2: accesso pieno
-- ===========================================================================
reset role;
select tests.authenticate_as_aal('alfa_admin', 'aal2');
select is(private.my_access() -> 'e0000000-0000-4000-8000-000000000001' ->> 'role', 'admin',
  'fattore verificato, aal2: ruolo admin su Alfa');
select is((select count(*)::int from public.organizations), 1, 'fattore verificato, aal2: vede Alfa');
select is((select count(*)::int from public.okrs), 5, 'fattore verificato, aal2: vede i 5 OKR di Alfa');
select is((select count(*)::int from public.memberships), 5, 'fattore verificato, aal2: vede le 5 membership di Alfa');
-- Sede Roma: cosi' l'OKR nuovo non cambia cio' che vedono i Team Lead nei casi 5 e 6.
select lives_ok(
  $$ insert into public.okrs (organization_id, period_id, location_id, owner_id, title, objective)
     values ('e0000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
             '10000000-0000-4000-8000-000000000002',
             'd0000000-0000-4000-8000-000000000002', 'MFA aal2', 'o') $$,
  'fattore verificato, aal2: crea OKR');

-- ===========================================================================
-- 4. Fattore NON verificato, aal1: accesso invariato
-- ===========================================================================
reset role;
select tests.authenticate_as_aal('alfa_manager', 'aal1');
select is(private.my_access() -> 'e0000000-0000-4000-8000-000000000001' ->> 'role', 'manager_okr',
  'fattore non verificato, aal1: ruolo manager_okr su Alfa');
select is((select count(*)::int from public.okrs where organization_id = 'e0000000-0000-4000-8000-000000000001'),
  6, 'fattore non verificato, aal1: vede gli OKR di Alfa (5 del seed + quello creato sopra)');

-- ===========================================================================
-- 5. Il fattore verificato di un ALTRO utente non influisce
-- ===========================================================================
reset role;
select tests.authenticate_as_aal('alfa_tl_senza_sede', 'aal1');
select is(private.my_access() -> 'e0000000-0000-4000-8000-000000000001' ->> 'role', 'team_lead',
  'utente senza fattori, aal1 (altri utenti con fattori verificati): ruolo invariato');
select set_eq($$ select id from public.okrs $$,
  $$ values ('40000000-0000-4000-8000-000000000001'::uuid) $$,
  'utente senza fattori, aal1: vede gli stessi OKR di sempre (solo quello senza sede)');

-- ===========================================================================
-- 6. Viewer e Team Lead con fattore verificato
-- ===========================================================================
reset role;
select set_config('request.jwt.claims', '', true);
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
values
  ('b1000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000004',
   'TOTP alfa_tl_milano', 'totp', 'verified', now(), now(), 'SEGRETODITESTNONREALE03'),
  ('b1000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000006',
   'TOTP alfa_viewer_roma', 'totp', 'verified', now(), now(), 'SEGRETODITESTNONREALE04');

select tests.authenticate_as_aal('alfa_viewer_roma', 'aal1');
select is(private.my_access(), '{}'::jsonb, 'viewer con fattore verificato, aal1: mappa vuota');
select is_empty($$ select id from public.okrs $$, 'viewer con fattore verificato, aal1: nessun OKR');
select is_empty($$ select id from public.organizations $$, 'viewer con fattore verificato, aal1: nessuna organizzazione');

reset role;
select tests.authenticate_as_aal('alfa_tl_milano', 'aal1');
select is(private.my_access(), '{}'::jsonb, 'team lead con fattore verificato, aal1: mappa vuota');
select is_empty($$ select id from public.okrs $$, 'team lead con fattore verificato, aal1: nessun OKR');

reset role;
select tests.authenticate_as_aal('alfa_tl_milano', 'aal2');
select set_eq($$ select id from public.okrs $$,
  $$ values ('40000000-0000-4000-8000-000000000001'::uuid), ('40000000-0000-4000-8000-000000000002'::uuid),
            ('40000000-0000-4000-8000-000000000005'::uuid) $$,
  'team lead con fattore verificato, aal2: vede di nuovo senza sede + Milano');

-- ===========================================================================
-- 7. Super-admin con fattore verificato e sessione di supporto attiva
-- ===========================================================================
reset role;
select set_config('request.jwt.claims', '', true);
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
values ('b1000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000001',
        'TOTP superadmin', 'totp', 'verified', now(), now(), 'SEGRETODITESTNONREALE05');
insert into public.support_sessions (id, platform_admin_id, organization_id, reason, started_at, expires_at)
values ('a0000000-0000-4000-8000-000000000081', 'd0000000-0000-4000-8000-000000000001',
        'e0000000-0000-4000-8000-000000000001', 'Ticket 8001: verifica MFA', now(), now() + interval '1 hour');

select tests.authenticate_as_aal('superadmin', 'aal2');
select is(private.my_access() -> 'e0000000-0000-4000-8000-000000000001',
  '{"role": "admin", "locations": [], "teams": [], "support": true}'::jsonb,
  'superadmin aal2 con fattore verificato: la sessione di supporto funziona come prima');
select is((select count(*)::int from public.okrs where organization_id = 'e0000000-0000-4000-8000-000000000001'),
  6, 'superadmin in supporto, aal2: legge gli OKR di Alfa');

-- ===========================================================================
-- 8. is_platform_admin() invariato
-- ===========================================================================
select is(private.is_platform_admin(), true, 'is_platform_admin: superadmin aal2 = true');

reset role;
select tests.authenticate_as_aal('superadmin', 'aal1');
select is(private.is_platform_admin(), false, 'is_platform_admin: superadmin aal1 = false');
select is(private.my_access(), '{}'::jsonb, 'superadmin aal1 con sessione attiva: mappa vuota (invariato)');

reset role;
select tests.authenticate_as_aal('alfa_admin', 'aal2');
select is(private.is_platform_admin(), false, 'is_platform_admin: un admin di organizzazione aal2 = false');

reset role;
select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
