-- Migrazione 0012: public.platform_audit_logs (audit della piattaforma, append-only).
-- * Catalogo: RLS abilitata e forzata, nessuna FK (sopravvive alla purge), colonne, indici,
--   policy (solo select per il super-admin con aal2), trigger append-only.
-- * Lettura: anon negato (42501); Admin di Alfa (anche aal2) e viewer: zero righe; super-admin
--   con aal2: tutte le righe; super-admin con aal1: zero righe.
-- * Scrittura: insert solo da service_role; authenticated (anche super-admin) negato (42501).
-- * Append-only: update/delete/truncate rifiutati a tutti. Per i client e per service_role
--   prima di tutto dai privilegi (42501 "permission denied"); per postgres, e per service_role
--   con privilegi concessi apposta nel test, dal trigger (42501 con il messaggio della 0012).
-- * Purge: dopo "delete from organizations" di Alfa (come in 18_purge_tenant) le righe con
--   organization_id di Alfa restano. Tutto il file e' una transazione annullata dal rollback.
--
-- UUID: Alfa e..01 (slug alfa), Beta e..02 (slug beta); superadmin d..01.
-- Righe create qui: f2400000-...-01, -02 (Alfa), -03 (Beta), -04 (nessuna organizzazione).
begin;
select plan(39);

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
-- 1. Catalogo
-- ===========================================================================
select ok(
  (select c.relrowsecurity and c.relforcerowsecurity
     from pg_class c where c.oid = 'public.platform_audit_logs'::regclass),
  'platform_audit_logs: RLS abilitata e forzata');

select is_empty(
  $$ select conname::text from pg_constraint
      where conrelid = 'public.platform_audit_logs'::regclass and contype = 'f' $$,
  'platform_audit_logs: nessuna FK (ne'' verso organizations ne'' verso utenti)');

select set_eq(
  $$ select a.attname::text, format_type(a.atttypid, a.atttypmod), a.attnotnull
       from pg_attribute a
      where a.attrelid = 'public.platform_audit_logs'::regclass
        and a.attnum > 0 and not a.attisdropped $$,
  $$ values ('id', 'uuid', true),
            ('actor_id', 'uuid', false),
            ('organization_id', 'uuid', false),
            ('organization_slug', 'text', false),
            ('action', 'text', true),
            ('details', 'jsonb', true),
            ('created_at', 'timestamp with time zone', true) $$,
  'platform_audit_logs: colonne, tipi e not null');

select set_eq(
  $$ select indexname::text from pg_indexes
      where schemaname = 'public' and tablename = 'platform_audit_logs' $$,
  $$ values ('platform_audit_logs_pkey'), ('platform_audit_logs_created_idx'),
            ('platform_audit_logs_org_created_idx') $$,
  'platform_audit_logs: pk e indici (created_at desc) e (organization_id, created_at desc)');

select set_eq(
  $$ select policyname::text, cmd::text, roles::text, permissive::text
       from pg_policies
      where schemaname = 'public' and tablename = 'platform_audit_logs' $$,
  $$ values ('platform_audit_logs_select', 'SELECT', '{authenticated}', 'PERMISSIVE') $$,
  'platform_audit_logs: una sola policy, select per authenticated (nessuna di scrittura)');

select set_eq(
  $$ select t.tgname::text, t.tgenabled::text, p.oid::regprocedure::text
       from pg_trigger t
       join pg_proc p on p.oid = t.tgfoid
      where t.tgrelid = 'public.platform_audit_logs'::regclass
        and not t.tgisinternal $$,
  $$ values ('t10_append_only', 'O', 'private.platform_audit_logs_append_only()'),
            ('t10_append_only_truncate', 'O', 'private.platform_audit_logs_append_only()') $$,
  'platform_audit_logs: trigger append-only (update/delete e truncate) presenti e abilitati');

select ok(
  (select not p.prosecdef
          and 'search_path=""' = any (coalesce(p.proconfig, '{}'::text[]))
     from pg_proc p where p.oid = 'private.platform_audit_logs_append_only()'::regprocedure)
  and not has_function_privilege('anon', 'private.platform_audit_logs_append_only()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.platform_audit_logs_append_only()', 'EXECUTE')
  and not has_function_privilege('service_role', 'private.platform_audit_logs_append_only()', 'EXECUTE'),
  'platform_audit_logs_append_only: invoker, search_path vuoto, execute revocato');

-- ===========================================================================
-- 2. service_role scrive (e legge: BYPASSRLS)
-- ===========================================================================
select tests.authenticate_as_service_role();
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select lives_ok(
  $$ insert into public.platform_audit_logs (id, actor_id, organization_id, organization_slug, action, details)
     values ('f2400000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
             'e0000000-0000-4000-8000-000000000001', 'alfa', 'support_session_start', '{"reason":"Ticket 1"}'),
            ('f2400000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001',
             'e0000000-0000-4000-8000-000000000001', 'alfa', 'org_purge', '{}'),
            ('f2400000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000001',
             'e0000000-0000-4000-8000-000000000002', 'beta', 'org_deactivate', '{}'),
            ('f2400000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000001',
             null, null, 'platform_admin_add', default) $$,
  'service_role: inserisce righe di audit della piattaforma');
select is((select count(*)::int from public.platform_audit_logs), 4,
  'service_role: legge le righe inserite');
select throws_ok(
  $$ insert into public.platform_audit_logs (action) values ('') $$,
  '23514', null, 'service_role: action vuota rifiutata dal check');

reset role;
select set_config('request.jwt.claims', '', true);

select ok(
  (select details = '{}'::jsonb and created_at is not null and organization_id is null
     from public.platform_audit_logs where id = 'f2400000-0000-4000-8000-000000000004'),
  'default: details = {} e created_at valorizzato; organization_id puo'' essere null');

-- ===========================================================================
-- 3. anon
-- ===========================================================================
select tests.clear_authentication();
select throws_ok($$ select * from public.platform_audit_logs $$,
  '42501', null, 'anon: select su platform_audit_logs negata');
select throws_ok(
  $$ insert into public.platform_audit_logs (action) values ('falso') $$,
  '42501', null, 'anon: insert su platform_audit_logs negato');
reset role;
select set_config('request.jwt.claims', '', true);

-- ===========================================================================
-- 4. Admin di Alfa (anche con aal2) e viewer: nessun accesso
-- ===========================================================================
select tests.authenticate_as_aal('alfa_admin', 'aal2');
select is_empty($$ select id from public.platform_audit_logs $$,
  'admin Alfa (aal2): nessuna riga visibile, nemmeno quelle di Alfa');
select throws_ok(
  $$ insert into public.platform_audit_logs (organization_id, action)
     values ('e0000000-0000-4000-8000-000000000001', 'falso') $$,
  '42501', null, 'admin Alfa: insert negato');
select throws_ok($$ update public.platform_audit_logs set action = 'manomesso' $$,
  '42501', null, 'admin Alfa: update negato');
select throws_ok($$ delete from public.platform_audit_logs $$,
  '42501', null, 'admin Alfa: delete negato');
select throws_ok($$ truncate public.platform_audit_logs $$,
  '42501', null, 'admin Alfa: truncate negato');
reset role;
select set_config('request.jwt.claims', '', true);

select tests.authenticate_as_aal('alfa_viewer_roma', 'aal1');
select is_empty($$ select id from public.platform_audit_logs $$,
  'viewer: nessuna riga visibile');
select throws_ok($$ delete from public.platform_audit_logs $$,
  '42501', null, 'viewer: delete negato');
reset role;
select set_config('request.jwt.claims', '', true);

-- ===========================================================================
-- 5. Super-admin: legge solo con aal2, non scrive mai
-- ===========================================================================
select tests.authenticate_as_aal('superadmin', 'aal2');
select set_eq(
  $$ select id from public.platform_audit_logs $$,
  $$ values ('f2400000-0000-4000-8000-000000000001'::uuid), ('f2400000-0000-4000-8000-000000000002'::uuid),
            ('f2400000-0000-4000-8000-000000000003'::uuid), ('f2400000-0000-4000-8000-000000000004'::uuid) $$,
  'superadmin aal2: legge tutte le righe (di ogni organizzazione e senza organizzazione)');
select throws_ok(
  $$ insert into public.platform_audit_logs (action) values ('falso') $$,
  '42501', null, 'superadmin aal2: insert negato (scrive solo service_role)');
select throws_ok($$ update public.platform_audit_logs set action = 'manomesso' $$,
  '42501', null, 'superadmin aal2: update negato');
reset role;
select set_config('request.jwt.claims', '', true);

select tests.authenticate_as_aal('superadmin', 'aal1');
select is_empty($$ select id from public.platform_audit_logs $$,
  'superadmin aal1: nessuna riga visibile');
reset role;
select set_config('request.jwt.claims', '', true);

-- ===========================================================================
-- 6. Append-only per postgres (proprietario, BYPASSRLS): blocca il trigger
-- ===========================================================================
select throws_ok($$ update public.platform_audit_logs set action = 'manomesso' $$,
  '42501', 'platform_audit_logs e'' append-only: UPDATE non consentito',
  'postgres: update rifiutato dal trigger');
select throws_ok($$ delete from public.platform_audit_logs where id = 'f2400000-0000-4000-8000-000000000001' $$,
  '42501', 'platform_audit_logs e'' append-only: DELETE non consentito',
  'postgres: delete rifiutato dal trigger');
select throws_ok($$ delete from public.platform_audit_logs where false $$,
  '42501', 'platform_audit_logs e'' append-only: DELETE non consentito',
  'postgres: anche un delete che non tocca righe e'' rifiutato (trigger di statement)');
select throws_ok($$ truncate public.platform_audit_logs $$,
  '42501', 'platform_audit_logs e'' append-only: TRUNCATE non consentito',
  'postgres: truncate rifiutato dal trigger');

-- ===========================================================================
-- 7. Append-only per service_role: prima i privilegi, poi (se concessi per errore) il trigger
-- ===========================================================================
select tests.authenticate_as_service_role();
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select throws_ok($$ update public.platform_audit_logs set action = 'manomesso' $$,
  '42501', null, 'service_role: update negato (nessun privilegio)');
select throws_ok($$ delete from public.platform_audit_logs $$,
  '42501', null, 'service_role: delete negato (nessun privilegio)');
select throws_ok($$ truncate public.platform_audit_logs $$,
  '42501', null, 'service_role: truncate negato (nessun privilegio)');
reset role;
select set_config('request.jwt.claims', '', true);

-- Privilegi concessi "per errore" (annullati dal rollback): resta il trigger.
grant update, delete, truncate on public.platform_audit_logs to service_role;

select tests.authenticate_as_service_role();
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select throws_ok($$ update public.platform_audit_logs set action = 'manomesso' $$,
  '42501', 'platform_audit_logs e'' append-only: UPDATE non consentito',
  'service_role con privilegio di update: rifiutato dal trigger');
select throws_ok($$ delete from public.platform_audit_logs $$,
  '42501', 'platform_audit_logs e'' append-only: DELETE non consentito',
  'service_role con privilegio di delete: rifiutato dal trigger');
select throws_ok($$ truncate public.platform_audit_logs $$,
  '42501', 'platform_audit_logs e'' append-only: TRUNCATE non consentito',
  'service_role con privilegio di truncate: rifiutato dal trigger');
reset role;
select set_config('request.jwt.claims', '', true);

select set_eq(
  $$ select id, action from public.platform_audit_logs $$,
  $$ values ('f2400000-0000-4000-8000-000000000001'::uuid, 'support_session_start'),
            ('f2400000-0000-4000-8000-000000000002'::uuid, 'org_purge'),
            ('f2400000-0000-4000-8000-000000000003'::uuid, 'org_deactivate'),
            ('f2400000-0000-4000-8000-000000000004'::uuid, 'platform_admin_add') $$,
  'dopo tutti i tentativi le 4 righe sono intatte');

-- ===========================================================================
-- 8. Purge del tenant Alfa (come 18_purge_tenant): l'audit della piattaforma resta
-- ===========================================================================
select lives_ok(
  $$ delete from public.organizations where id = 'e0000000-0000-4000-8000-000000000001' $$,
  'postgres: la purge di Alfa riesce (platform_audit_logs non la blocca)');
select is((select count(*)::int from public.organizations where id = 'e0000000-0000-4000-8000-000000000001'), 0,
  'organizations: Alfa non esiste piu''');
select is(
  (select count(*)::int from public.platform_audit_logs
    where organization_id = 'e0000000-0000-4000-8000-000000000001'
      and organization_slug = 'alfa'),
  2, 'platform_audit_logs: le 2 righe di Alfa sopravvivono alla purge, con lo slug');
select is((select count(*)::int from public.platform_audit_logs), 4,
  'platform_audit_logs: nessuna riga persa con la purge');

select * from finish();
rollback;
