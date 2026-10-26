-- Migrazione 0011: public.admin_apply_member(p_org, p_user, p_role, p_is_active,
-- p_location_ids, p_actor). SECURITY INVOKER, execute SOLO a service_role (Edge Functions).
--
-- Come si simula service_role: tests.authenticate_as_service_role() (SET ROLE service_role
-- locale alla transazione, claims azzerati) + claims '{"role":"service_role"}', come li
-- imposta PostgREST con la chiave service_role. Si torna a postgres con reset role.
-- service_role su Supabase ha BYPASSRLS e i privilegi di tabella su public: e' lo stesso
-- contesto della Edge Function.
--
-- Codici di errore con hint: tests.err_of(sql) esegue la stringa come il ruolo corrente e
-- restituisce 'sqlstate:hint' (o 'ok'), cosi' si verificano sia l'errcode sia l'hint.
--
-- UUID (seed): Alfa e..01 (sedi Milano 1..01, Roma 1..02), Beta e..02 (sede Torino 1..03).
-- Utenti: d..01 superadmin (nessuna membership), d..02 alfa_admin (unico Admin di Alfa),
-- d..03 alfa_manager, d..04 alfa_tl_milano (Milano), d..05 alfa_tl_senza_sede,
-- d..06 alfa_viewer_roma (Roma), d..07 beta_admin (unico Admin di Beta, Torino).
begin;
select plan(45);

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

-- Helper locale al test (sparisce col rollback). SECURITY INVOKER: gira come il ruolo corrente.
create function tests.err_of(p_sql text)
returns text
language plpgsql
as $$
declare
  v_state text;
  v_hint  text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics v_state = returned_sqlstate, v_hint = pg_exception_hint;
  return v_state || ':' || coalesce(v_hint, '');
end;
$$;
grant execute on function tests.err_of(text) to service_role;

-- Stato usato dal controllo di idempotenza (letto come postgres).
create temp view idem_state as
select m.role::text as role,
       m.is_active,
       m.updated_at,
       (select array_agg(ml.location_id order by ml.location_id)
          from public.membership_locations ml
         where ml.organization_id = m.organization_id and ml.user_id = m.user_id) as locs,
       (select count(*) from public.audit_logs a
         where a.organization_id = 'e0000000-0000-4000-8000-000000000001') as n_audit
  from public.memberships m
 where m.organization_id = 'e0000000-0000-4000-8000-000000000001'
   and m.user_id = 'd0000000-0000-4000-8000-000000000005';

-- ===========================================================================
-- 1. Cataloghi: firma, invoker, privilegi
-- ===========================================================================
-- Confronto per oid dei tipi e per nomi: indipendente dal search_path della sessione.
select ok(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'admin_apply_member') = 1
  and (select p.proargnames = array['p_org', 'p_user', 'p_role', 'p_is_active', 'p_location_ids', 'p_actor']
         from pg_proc p
        where p.oid = 'public.admin_apply_member(uuid, uuid, public.org_role, boolean, uuid[], uuid)'::regprocedure),
  'admin_apply_member: una sola firma (uuid, uuid, org_role, boolean, uuid[], uuid) con i nomi p_*');
select ok(
  (select not p.prosecdef
          and p.provolatile = 'v'
          and l.lanname = 'plpgsql'
          and p.prorettype = 'void'::regtype
          and p.pronargdefaults = 2
          and 'search_path=""' = any (coalesce(p.proconfig, '{}'::text[]))
     from pg_proc p join pg_language l on l.oid = p.prolang
    where p.oid = 'public.admin_apply_member(uuid, uuid, public.org_role, boolean, uuid[], uuid)'::regprocedure),
  'admin_apply_member: security invoker, volatile, plpgsql, void, 2 default, search_path vuoto');
select ok(
  has_function_privilege('service_role', 'public.admin_apply_member(uuid, uuid, public.org_role, boolean, uuid[], uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.admin_apply_member(uuid, uuid, public.org_role, boolean, uuid[], uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.admin_apply_member(uuid, uuid, public.org_role, boolean, uuid[], uuid)', 'EXECUTE'),
  'execute a service_role; ne'' anon ne'' authenticated');
select is_empty(
  $$ select a.grantee
       from pg_proc p, aclexplode(p.proacl) a
      where p.oid = 'public.admin_apply_member(uuid, uuid, public.org_role, boolean, uuid[], uuid)'::regprocedure
        and a.privilege_type = 'EXECUTE'
        and a.grantee = 0 $$,
  'nessun execute a PUBLIC');

-- ===========================================================================
-- 2. anon e authenticated (anche Admin e super-admin) negati
-- ===========================================================================
select tests.clear_authentication();
select throws_ok(
  $$ select public.admin_apply_member('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000006', 'admin', true) $$,
  '42501', null, 'anon: admin_apply_member non eseguibile');
reset role;
select set_config('request.jwt.claims', '', true);

select tests.authenticate_as_aal('alfa_admin', 'aal1');
select throws_ok(
  $$ select public.admin_apply_member('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000006', 'admin', true) $$,
  '42501', null, 'admin di Alfa (authenticated): admin_apply_member non eseguibile');
reset role;
select set_config('request.jwt.claims', '', true);

select tests.authenticate_as_aal('superadmin', 'aal2');
select throws_ok(
  $$ select public.admin_apply_member('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'admin', true) $$,
  '42501', null, 'super-admin con aal2 (authenticated): admin_apply_member non eseguibile');
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select role::text from public.memberships
    where organization_id = 'e0000000-0000-4000-8000-000000000001'
      and user_id = 'd0000000-0000-4000-8000-000000000006'),
  'viewer', 'dopo i tentativi negati il viewer di Roma e'' ancora viewer');

-- ===========================================================================
-- 3. service_role: nuova membership con sedi (deduplicate)
-- ===========================================================================
select tests.authenticate_as_service_role();
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select lives_ok(
  $$ select public.admin_apply_member(
       'e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'viewer', true,
       array['10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002',
             '10000000-0000-4000-8000-000000000001']::uuid[]) $$,
  'service_role: crea la membership di d..01 in Alfa con sedi Milano, Roma, Milano');
select ok(
  exists (select 1 from public.memberships
           where organization_id = 'e0000000-0000-4000-8000-000000000001'
             and user_id = 'd0000000-0000-4000-8000-000000000001'
             and role = 'viewer' and is_active),
  'd..01: membership viewer attiva in Alfa');
select set_eq(
  $$ select location_id from public.membership_locations
      where organization_id = 'e0000000-0000-4000-8000-000000000001'
        and user_id = 'd0000000-0000-4000-8000-000000000001' $$,
  $$ values ('10000000-0000-4000-8000-000000000001'::uuid), ('10000000-0000-4000-8000-000000000002'::uuid) $$,
  'd..01: sedi Milano e Roma (il duplicato non crea errori ne'' righe doppie)');

-- ===========================================================================
-- 4. Cambio ruolo con p_location_ids null: sedi invariate
-- ===========================================================================
select lives_ok(
  $$ select public.admin_apply_member(
       'e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'team_lead', true,
       null, 'd0000000-0000-4000-8000-000000000002') $$,
  'service_role: d..01 diventa team_lead (attore d..02, sedi null)');
select is(
  (select role::text from public.memberships
    where organization_id = 'e0000000-0000-4000-8000-000000000001'
      and user_id = 'd0000000-0000-4000-8000-000000000001'),
  'team_lead', 'd..01: ruolo aggiornato a team_lead');
select set_eq(
  $$ select location_id from public.membership_locations
      where organization_id = 'e0000000-0000-4000-8000-000000000001'
        and user_id = 'd0000000-0000-4000-8000-000000000001' $$,
  $$ values ('10000000-0000-4000-8000-000000000001'::uuid), ('10000000-0000-4000-8000-000000000002'::uuid) $$,
  'p_location_ids null: sedi di d..01 invariate (Milano, Roma)');

-- ===========================================================================
-- 5. Sostituzione delle sedi
-- ===========================================================================
select lives_ok(
  $$ select public.admin_apply_member(
       'e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'team_lead', true,
       array['10000000-0000-4000-8000-000000000002']::uuid[], 'd0000000-0000-4000-8000-000000000002') $$,
  'service_role: sedi di d..01 sostituite con la sola Roma');
select set_eq(
  $$ select location_id from public.membership_locations
      where organization_id = 'e0000000-0000-4000-8000-000000000001'
        and user_id = 'd0000000-0000-4000-8000-000000000001' $$,
  $$ values ('10000000-0000-4000-8000-000000000002'::uuid) $$,
  'd..01: ora solo Roma');
select lives_ok(
  $$ select public.admin_apply_member(
       'e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'team_lead', true,
       array[]::uuid[]) $$,
  'service_role: array vuoto = nessuna sede');
select is(
  (select count(*)::int from public.membership_locations
    where organization_id = 'e0000000-0000-4000-8000-000000000001'
      and user_id = 'd0000000-0000-4000-8000-000000000001'),
  0, 'd..01: nessuna sede');

-- ===========================================================================
-- 6. Sede di un'altra organizzazione: FK composta, chiamata annullata per intero
-- ===========================================================================
select throws_ok(
  $$ select public.admin_apply_member(
       'e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000006', 'team_lead', true,
       array['10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003']::uuid[]) $$,
  '23503', null, 'sede di Beta (Torino) per un membro di Alfa: violazione della FK composta');
select is(
  (select role::text from public.memberships
    where organization_id = 'e0000000-0000-4000-8000-000000000001'
      and user_id = 'd0000000-0000-4000-8000-000000000006'),
  'viewer', 'chiamata fallita: il ruolo del viewer di Roma non e'' cambiato');
select set_eq(
  $$ select location_id from public.membership_locations
      where organization_id = 'e0000000-0000-4000-8000-000000000001'
        and user_id = 'd0000000-0000-4000-8000-000000000006' $$,
  $$ values ('10000000-0000-4000-8000-000000000002'::uuid) $$,
  'chiamata fallita: le sedi del viewer di Roma restano solo Roma');
select is(
  (select count(*)::int from public.membership_locations
    where location_id = '10000000-0000-4000-8000-000000000003'),
  1, 'Torino resta assegnata solo a beta_admin');

-- ===========================================================================
-- 7. Auto-modifica: ruolo e disattivazione propri rifiutati (hint self_change)
-- ===========================================================================
select is(
  tests.err_of($$ select public.admin_apply_member(
       'e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000003', 'viewer', true,
       null, 'd0000000-0000-4000-8000-000000000003') $$),
  '42501:self_change', 'p_actor = p_user: cambiare il proprio ruolo e'' rifiutato (42501, self_change)');
select is(
  tests.err_of($$ select public.admin_apply_member(
       'e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000003', 'manager_okr', false,
       null, 'd0000000-0000-4000-8000-000000000003') $$),
  '42501:self_change', 'p_actor = p_user: disattivare la propria membership e'' rifiutato (42501, self_change)');
select ok(
  exists (select 1 from public.memberships
           where organization_id = 'e0000000-0000-4000-8000-000000000001'
             and user_id = 'd0000000-0000-4000-8000-000000000003'
             and role = 'manager_okr' and is_active),
  'dopo i rifiuti d..03 e'' ancora manager_okr attivo');
select lives_ok(
  $$ select public.admin_apply_member(
       'e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000003', 'manager_okr', true,
       array['10000000-0000-4000-8000-000000000001']::uuid[], 'd0000000-0000-4000-8000-000000000003') $$,
  'p_actor = p_user con ruolo e stato invariati: modificare le proprie sedi e'' consentito');
select lives_ok(
  $$ select public.admin_apply_member(
       'e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000003', 'viewer', true,
       null, 'd0000000-0000-4000-8000-000000000002') $$,
  'p_actor diverso (d..02): il cambio di ruolo di d..03 passa');
select lives_ok(
  $$ select public.admin_apply_member(
       'e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000003', 'manager_okr', false,
       null, null) $$,
  'p_actor null: la disattivazione di d..03 passa');
select ok(
  exists (select 1 from public.memberships
           where organization_id = 'e0000000-0000-4000-8000-000000000001'
             and user_id = 'd0000000-0000-4000-8000-000000000003'
             and role = 'manager_okr' and not is_active),
  'd..03: manager_okr disattivato');
select set_eq(
  $$ select location_id from public.membership_locations
      where organization_id = 'e0000000-0000-4000-8000-000000000001'
        and user_id = 'd0000000-0000-4000-8000-000000000003' $$,
  $$ values ('10000000-0000-4000-8000-000000000001'::uuid) $$,
  'd..03: la sede Milano impostata prima e'' rimasta (p_location_ids null)');

-- ===========================================================================
-- 8. Ultimo Admin: il trigger t15_keep_last_admin non si aggira
-- ===========================================================================
select is(
  tests.err_of($$ select public.admin_apply_member(
       'e0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000007', 'viewer', true) $$),
  'P0001:last_admin', 'declassare l''unico Admin di Beta: P0001, last_admin');
select is(
  tests.err_of($$ select public.admin_apply_member(
       'e0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000007', 'admin', false,
       array[]::uuid[], 'd0000000-0000-4000-8000-000000000001') $$),
  'P0001:last_admin', 'disattivare l''unico Admin di Beta (attore diverso): P0001, last_admin');
select ok(
  exists (select 1 from public.memberships
           where organization_id = 'e0000000-0000-4000-8000-000000000002'
             and user_id = 'd0000000-0000-4000-8000-000000000007'
             and role = 'admin' and is_active)
  and (select count(*) from public.membership_locations
        where user_id = 'd0000000-0000-4000-8000-000000000007') = 1,
  'beta_admin: ancora Admin attivo e con la sua sede (la chiamata e'' stata annullata per intero)');
select lives_ok(
  $$ select public.admin_apply_member(
       'e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'admin', true,
       null, 'd0000000-0000-4000-8000-000000000002') $$,
  'Alfa: d..01 promosso Admin');
select lives_ok(
  $$ select public.admin_apply_member(
       'e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002', 'manager_okr', true,
       null, 'd0000000-0000-4000-8000-000000000001') $$,
  'Alfa: con un secondo Admin attivo, d..02 puo'' essere declassato');

-- ===========================================================================
-- 9. Idempotenza: la stessa chiamata due volte lascia lo stesso stato (e nessun audit nuovo)
-- ===========================================================================
select lives_ok(
  $$ select public.admin_apply_member(
       'e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000005', 'viewer', true,
       array['10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001']::uuid[],
       'd0000000-0000-4000-8000-000000000001') $$,
  'idempotenza: prima chiamata su d..05 (viewer, Milano + Roma)');

reset role;
select set_config('request.jwt.claims', '', true);
create temp table idem_1 as select * from idem_state;

select tests.authenticate_as_service_role();
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select lives_ok(
  $$ select public.admin_apply_member(
       'e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000005', 'viewer', true,
       array['10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001']::uuid[],
       'd0000000-0000-4000-8000-000000000001') $$,
  'idempotenza: seconda chiamata identica');

reset role;
select set_config('request.jwt.claims', '', true);
-- updated_at da solo non prova nulla (now() e' fisso nella transazione del test): la prova
-- dell'assenza di scritture e' il numero di righe di audit, che ogni insert/delete/update
-- effettivo su memberships o membership_locations farebbe crescere.
select results_eq(
  $$ select role, is_active, updated_at, locs, n_audit from idem_state $$,
  $$ select role, is_active, updated_at, locs, n_audit from idem_1 $$,
  'idempotenza: ruolo, stato, updated_at, sedi e numero di righe di audit identici dopo la seconda chiamata');
select is(
  (select role || '|' || is_active::text || '|' || array_length(locs, 1)::text from idem_1),
  'viewer|true|2', 'idempotenza: lo stato e'' quello richiesto (viewer attivo, 2 sedi)');

-- ===========================================================================
-- 10. Organizzazione inesistente o disattivata, parametri non validi
-- ===========================================================================
select tests.authenticate_as_service_role();
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select is(
  tests.err_of($$ select public.admin_apply_member(
       'e0000000-0000-4000-8000-000000000099', 'd0000000-0000-4000-8000-000000000002', 'viewer', true) $$),
  'P0002:org_not_found', 'organizzazione inesistente: P0002, org_not_found');
select is(
  tests.err_of($$ select public.admin_apply_member(
       null, 'd0000000-0000-4000-8000-000000000002', 'viewer', true) $$),
  '22004:', 'p_org nullo: 22004');
select is(
  tests.err_of($$ select public.admin_apply_member(
       'e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000006', 'viewer', true,
       array[null]::uuid[]) $$),
  '22004:', 'sede nulla nell''array: 22004');
select throws_ok(
  $$ select public.admin_apply_member(
       'e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000099', 'viewer', true) $$,
  '23503', null, 'utente inesistente in auth.users: violazione di FK');

update public.organizations set is_active = false where id = 'e0000000-0000-4000-8000-000000000002';
select is(
  tests.err_of($$ select public.admin_apply_member(
       'e0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000006', 'viewer', true) $$),
  'P0002:org_inactive', 'organizzazione disattivata: P0002, org_inactive');
select is(
  (select count(*)::int from public.memberships
    where organization_id = 'e0000000-0000-4000-8000-000000000002'
      and user_id = 'd0000000-0000-4000-8000-000000000006'),
  0, 'organizzazione disattivata: nessuna membership creata');

reset role;
select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
