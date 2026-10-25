-- Piano 6.2, caso 6: superadmin.
-- Con aal2 e senza sessione di supporto non vede dati di dominio, ma legge organizations,
-- platform_admins e support_sessions (policy dedicate, piano 5.6). Con una sessione attiva su
-- Alfa diventa 'admin' di Alfa (non di Beta) e le sue scritture finiscono in audit_logs
-- marcate con support_session. Sessione scaduta o chiusa: nessun accesso. aal1: nessun
-- accesso privilegiato, nemmeno con sessione attiva.
--
-- UUID: superadmin d..01; Alfa e..01 (5 OKR, 5 KR, 4 azioni nel seed), Beta e..02.
-- Sessioni create qui: a..61 (Beta, chiusa) e a..62 (Alfa).
-- Vincoli di support_sessions: expires_at > started_at, expires_at <= started_at + 4h,
-- ended_at >= started_at. now() e' costante nella transazione.
begin;
select plan(31);

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

-- Una sessione gia' chiusa su Beta: rende significativa la lettura di support_sessions.
insert into public.support_sessions (id, platform_admin_id, organization_id, reason, started_at, expires_at, ended_at)
values ('a0000000-0000-4000-8000-000000000061', 'd0000000-0000-4000-8000-000000000001',
        'e0000000-0000-4000-8000-000000000002', 'Ticket chiuso su Beta',
        now() - interval '2 hours', now() + interval '1 hour', now() - interval '1 hour');

-- ===========================================================================
-- 1. aal2, nessuna sessione attiva
-- ===========================================================================
select tests.authenticate_as_aal('superadmin', 'aal2');

select is_empty($$ select id from public.okrs $$, 'superadmin senza sessione: nessun OKR');
select is_empty($$ select id from public.key_results $$, 'superadmin senza sessione: nessun KR');
select is_empty($$ select id from public.actions $$, 'superadmin senza sessione: nessuna azione');
select is_empty($$ select id from public.memberships $$, 'superadmin senza sessione: nessuna membership');
select is_empty($$ select id from public.periods $$, 'superadmin senza sessione: nessun periodo');
select is_empty($$ select id from public.audit_logs $$, 'superadmin senza sessione: nessuna riga di audit');
select is((select count(*)::int from public.organizations), 2,
  'superadmin aal2: legge tutte le organizzazioni (policy dedicata)');
select is((select count(*)::int from public.platform_admins), 1,
  'superadmin aal2: legge platform_admins');
select is((select count(*)::int from public.support_sessions), 1,
  'superadmin aal2: legge support_sessions');

with u as (
  update public.okrs set title = 'Senza sessione'
   where id = '40000000-0000-4000-8000-000000000001'
  returning 1)
select is(count(*)::int, 0, 'superadmin senza sessione: update di un OKR non tocca righe') from u;

select is(private.my_access(), '{}'::jsonb, 'superadmin senza sessione: mappa dei permessi vuota');

-- ===========================================================================
-- 2. Sessione di supporto attiva su Alfa
-- ===========================================================================
reset role;
select set_config('request.jwt.claims', '', true);
insert into public.support_sessions (id, platform_admin_id, organization_id, reason, started_at, expires_at)
values ('a0000000-0000-4000-8000-000000000062', 'd0000000-0000-4000-8000-000000000001',
        'e0000000-0000-4000-8000-000000000001', 'Ticket 1234: verifica OKR', now(), now() + interval '1 hour');

select tests.authenticate_as_aal('superadmin', 'aal2');

select is((select count(*)::int from public.okrs where organization_id = 'e0000000-0000-4000-8000-000000000001'),
  5, 'superadmin in supporto: legge tutti gli OKR di Alfa (anche eliminati, come un admin)');
select is((select count(*)::int from public.key_results where organization_id = 'e0000000-0000-4000-8000-000000000001'),
  5, 'superadmin in supporto: legge i KR di Alfa');
select is((select count(*)::int from public.actions where organization_id = 'e0000000-0000-4000-8000-000000000001'),
  4, 'superadmin in supporto: legge le azioni di Alfa');
select is(
  (select count(*)::int from public.okrs where organization_id = 'e0000000-0000-4000-8000-000000000002')
  + (select count(*)::int from public.key_results where organization_id = 'e0000000-0000-4000-8000-000000000002')
  + (select count(*)::int from public.actions where organization_id = 'e0000000-0000-4000-8000-000000000002'),
  0, 'superadmin in supporto su Alfa: nessun dato di dominio di Beta');
select is(private.my_access() -> 'e0000000-0000-4000-8000-000000000001' ->> 'role', 'admin',
  'superadmin in supporto: ruolo admin su Alfa');
select is((private.my_access() -> 'e0000000-0000-4000-8000-000000000001' ->> 'support')::boolean, true,
  'superadmin in supporto: flag support = true');

with u as (
  update public.okrs set title = 'Corretto dal supporto'
   where id = '40000000-0000-4000-8000-000000000001'
  returning 1)
select is(count(*)::int, 1, 'superadmin in supporto: modifica un OKR di Alfa') from u;

with u as (
  update public.periods set name = 'Q4 2026 (supporto)'
   where id = '30000000-0000-4000-8000-000000000001'
  returning 1)
select is(count(*)::int, 1, 'superadmin in supporto: modifica un periodo di Alfa') from u;

reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select count(*)::int from public.audit_logs
    where organization_id = 'e0000000-0000-4000-8000-000000000001'
      and entity = 'okrs'
      and entity_id = '40000000-0000-4000-8000-000000000001'
      and action = 'update'
      and user_id = 'd0000000-0000-4000-8000-000000000001'
      and details ->> 'support_session' = 'a0000000-0000-4000-8000-000000000062'),
  1, 'audit: la modifica dell''OKR in supporto e'' registrata con support_session');
select is(
  (select count(*)::int from public.audit_logs
    where organization_id = 'e0000000-0000-4000-8000-000000000001'
      and entity = 'periods'
      and entity_id = '30000000-0000-4000-8000-000000000001'
      and action = 'update'
      and user_id = 'd0000000-0000-4000-8000-000000000001'
      and details ->> 'support_session' = 'a0000000-0000-4000-8000-000000000062'),
  1, 'audit: la modifica del periodo in supporto e'' registrata con support_session');

-- ===========================================================================
-- 3. Sessione scaduta (started_at nel passato per rispettare i CHECK)
-- ===========================================================================
update public.support_sessions
   set started_at = now() - interval '5 hours',
       expires_at = now() - interval '1 hour'
 where id = 'a0000000-0000-4000-8000-000000000062';

select tests.authenticate_as_aal('superadmin', 'aal2');
select is_empty($$ select id from public.okrs $$, 'sessione scaduta: nessun OKR');
select is_empty($$ select id from public.key_results $$, 'sessione scaduta: nessun KR');
select is(private.my_access(), '{}'::jsonb, 'sessione scaduta: mappa dei permessi vuota');

-- ===========================================================================
-- 4. Sessione chiusa (ended_at valorizzato, non ancora scaduta)
-- ===========================================================================
reset role;
select set_config('request.jwt.claims', '', true);
update public.support_sessions
   set started_at = now(),
       expires_at = now() + interval '1 hour',
       ended_at   = now()
 where id = 'a0000000-0000-4000-8000-000000000062';

select tests.authenticate_as_aal('superadmin', 'aal2');
select is_empty($$ select id from public.okrs $$, 'sessione chiusa: nessun OKR');
select is(private.my_access(), '{}'::jsonb, 'sessione chiusa: mappa dei permessi vuota');

-- ===========================================================================
-- 5. aal1 con sessione di nuovo attiva: nessun accesso privilegiato
-- ===========================================================================
reset role;
select set_config('request.jwt.claims', '', true);
update public.support_sessions
   set ended_at = null
 where id = 'a0000000-0000-4000-8000-000000000062';

select tests.authenticate_as_aal('superadmin', 'aal1');
select is_empty($$ select id from public.organizations $$, 'superadmin aal1: nessuna organizzazione');
select is_empty($$ select id from public.okrs $$, 'superadmin aal1 con sessione attiva: nessun OKR');
select is_empty($$ select user_id from public.platform_admins $$, 'superadmin aal1: platform_admins non leggibile');
select is_empty($$ select id from public.support_sessions $$, 'superadmin aal1: support_sessions non leggibile');
select is(private.my_access(), '{}'::jsonb, 'superadmin aal1 con sessione attiva: mappa dei permessi vuota');

select * from finish();
rollback;
