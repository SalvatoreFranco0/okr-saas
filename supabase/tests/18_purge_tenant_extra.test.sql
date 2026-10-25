-- Piano 10.1 / 5.1: purge di un tenant con dati aggiuntivi.
-- Come 18_purge_tenant, ma prima Alfa riceve una sessione di supporto attiva, commenti,
-- check-in (key_result_updates, anche via kr_check_in) e un secondo allineamento; la purge
-- viene eseguita dal service_role (il ruolo delle Edge Functions).
--
-- UUID: Alfa e..01, Beta e..02; superadmin d..01, alfa_admin d..02; OKR 4..01-4..03; KR 5..01-5..02.
begin;
select plan(24);

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

-- ---------------------------------------------------------------------------
-- Dati aggiuntivi su Alfa
-- ---------------------------------------------------------------------------
insert into public.support_sessions (id, platform_admin_id, organization_id, reason, started_at, expires_at)
values ('a0000000-0000-4000-8000-000000000181', 'd0000000-0000-4000-8000-000000000001',
        'e0000000-0000-4000-8000-000000000001', 'Ticket prima della purge', now(), now() + interval '1 hour');

-- Check-in dal backend (user_id null).
update public.key_results set current_metric = 70 where id = '50000000-0000-4000-8000-000000000001';

-- Commenti, check-in con nota e allineamento come alfa_admin (percorso client).
select tests.authenticate_as_aal('alfa_admin', 'aal1');
insert into public.comments (organization_id, okr_id, user_id, content)
values ('e0000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
        'd0000000-0000-4000-8000-000000000002', 'Commento prima della purge'),
       ('e0000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002',
        'd0000000-0000-4000-8000-000000000002', 'Secondo commento');
do $$ begin perform public.kr_check_in('50000000-0000-4000-8000-000000000002', 80, 'check-in prima della purge'); end $$;
insert into public.okr_alignments (organization_id, parent_okr_id, child_okr_id)
values ('e0000000-0000-4000-8000-000000000001',
        '40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000003');

reset role;
select set_config('request.jwt.claims', '', true);

select is((select count(*)::int from public.support_sessions where organization_id = 'e0000000-0000-4000-8000-000000000001'), 1,
  'precondizione: Alfa ha una sessione di supporto attiva');
select is((select count(*)::int from public.comments where organization_id = 'e0000000-0000-4000-8000-000000000001'), 2,
  'precondizione: Alfa ha 2 commenti');
select is((select count(*)::int from public.key_result_updates where organization_id = 'e0000000-0000-4000-8000-000000000001'), 2,
  'precondizione: Alfa ha 2 check-in');

-- ---------------------------------------------------------------------------
-- Purge come service_role
-- ---------------------------------------------------------------------------
select tests.authenticate_as_service_role();
select lives_ok(
  $$ delete from public.organizations where id = 'e0000000-0000-4000-8000-000000000001' $$,
  'service_role: la purge di Alfa riesce anche con sessione di supporto, commenti e check-in');

reset role;
select set_config('request.jwt.claims', '', true);

select is((select count(*)::int from public.organizations where id = 'e0000000-0000-4000-8000-000000000001'), 0,
  'organizations: Alfa non esiste piu''');
select is((select count(*)::int from public.memberships where organization_id = 'e0000000-0000-4000-8000-000000000001'), 0,
  'memberships: nessuna riga di Alfa');
select is((select count(*)::int from public.membership_locations where organization_id = 'e0000000-0000-4000-8000-000000000001'), 0,
  'membership_locations: nessuna riga di Alfa');
select is((select count(*)::int from public.team_members where organization_id = 'e0000000-0000-4000-8000-000000000001'), 0,
  'team_members: nessuna riga di Alfa');
select is((select count(*)::int from public.teams where organization_id = 'e0000000-0000-4000-8000-000000000001'), 0,
  'teams: nessuna riga di Alfa');
select is((select count(*)::int from public.locations where organization_id = 'e0000000-0000-4000-8000-000000000001'), 0,
  'locations: nessuna riga di Alfa');
select is((select count(*)::int from public.periods where organization_id = 'e0000000-0000-4000-8000-000000000001'), 0,
  'periods: nessuna riga di Alfa');
select is((select count(*)::int from public.okrs where organization_id = 'e0000000-0000-4000-8000-000000000001'), 0,
  'okrs: nessuna riga di Alfa');
select is((select count(*)::int from public.key_results where organization_id = 'e0000000-0000-4000-8000-000000000001'), 0,
  'key_results: nessuna riga di Alfa');
select is((select count(*)::int from public.actions where organization_id = 'e0000000-0000-4000-8000-000000000001'), 0,
  'actions: nessuna riga di Alfa');
select is((select count(*)::int from public.okr_alignments where organization_id = 'e0000000-0000-4000-8000-000000000001'), 0,
  'okr_alignments: nessuna riga di Alfa');
select is((select count(*)::int from public.okr_progress_history where organization_id = 'e0000000-0000-4000-8000-000000000001'), 0,
  'okr_progress_history: nessuna riga di Alfa');
select is((select count(*)::int from public.key_result_updates where organization_id = 'e0000000-0000-4000-8000-000000000001'), 0,
  'key_result_updates: nessuna riga di Alfa');
select is((select count(*)::int from public.audit_logs where organization_id = 'e0000000-0000-4000-8000-000000000001'), 0,
  'audit_logs: nessuna riga di Alfa');
select is((select count(*)::int from public.comments where organization_id = 'e0000000-0000-4000-8000-000000000001'), 0,
  'comments: nessuna riga di Alfa');
select is((select count(*)::int from public.support_sessions where organization_id = 'e0000000-0000-4000-8000-000000000001'), 0,
  'support_sessions: nessuna riga di Alfa');

-- Beta e utenti intatti.
select is((select count(*)::int from public.okrs where organization_id = 'e0000000-0000-4000-8000-000000000002'), 1,
  'Beta: il suo OKR esiste ancora');
select is((select count(*)::int from auth.users where email like '%@test.local'), 7,
  'auth.users: i 7 utenti di test esistono ancora');
select is((select count(*)::int from public.profiles p join auth.users u on u.id = p.id
            where u.email like '%@test.local'), 7,
  'profiles: i 7 profili esistono ancora');
select is((select count(*)::int from public.platform_admins where user_id = 'd0000000-0000-4000-8000-000000000001'), 1,
  'platform_admins: il superadmin resta registrato (la cascata tocca solo le sue sessioni su Alfa)');

select * from finish();
rollback;
