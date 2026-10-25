-- Piano 10.1 / 5.1: purge di un tenant (seed di base).
-- Come backend (postgres) "delete from organizations where id = Alfa" deve riuscire: cascata
-- da organizations su tutte le tabelle, FK composte NO ACTION controllate a fine statement
-- (quando i figli sono gia' stati cancellati), trigger dell'ultimo Admin che lascia passare
-- perche' l'organizzazione non esiste piu', audit che non scrive per un'organizzazione assente.
-- Dopo: nessuna riga di Alfa in nessuna tabella; Beta identica; utenti e profili intatti.
-- La variante con sessione di supporto, commenti e check-in e' in 18_purge_tenant_extra.
-- (Due file perche' un tenant si cancella una sola volta per transazione e un rollback a
-- savepoint annullerebbe anche i contatori di pgTAP.)
--
-- UUID: Alfa e..01, Beta e..02; i 7 utenti di test d..01-d..07 (email @test.local).
begin;
select plan(23);

-- Conteggi di Beta prima della purge, per confrontarli dopo.
create temp view beta_counts as
select 'actions'::text as tbl, (select count(*) from public.actions where organization_id = 'e0000000-0000-4000-8000-000000000002') as n
union all select 'audit_logs', (select count(*) from public.audit_logs where organization_id = 'e0000000-0000-4000-8000-000000000002')
union all select 'comments', (select count(*) from public.comments where organization_id = 'e0000000-0000-4000-8000-000000000002')
union all select 'key_result_updates', (select count(*) from public.key_result_updates where organization_id = 'e0000000-0000-4000-8000-000000000002')
union all select 'key_results', (select count(*) from public.key_results where organization_id = 'e0000000-0000-4000-8000-000000000002')
union all select 'locations', (select count(*) from public.locations where organization_id = 'e0000000-0000-4000-8000-000000000002')
union all select 'membership_locations', (select count(*) from public.membership_locations where organization_id = 'e0000000-0000-4000-8000-000000000002')
union all select 'memberships', (select count(*) from public.memberships where organization_id = 'e0000000-0000-4000-8000-000000000002')
union all select 'okr_alignments', (select count(*) from public.okr_alignments where organization_id = 'e0000000-0000-4000-8000-000000000002')
union all select 'okr_progress_history', (select count(*) from public.okr_progress_history where organization_id = 'e0000000-0000-4000-8000-000000000002')
union all select 'okrs', (select count(*) from public.okrs where organization_id = 'e0000000-0000-4000-8000-000000000002')
union all select 'organizations', (select count(*) from public.organizations where id = 'e0000000-0000-4000-8000-000000000002')
union all select 'periods', (select count(*) from public.periods where organization_id = 'e0000000-0000-4000-8000-000000000002')
union all select 'support_sessions', (select count(*) from public.support_sessions where organization_id = 'e0000000-0000-4000-8000-000000000002')
union all select 'team_members', (select count(*) from public.team_members where organization_id = 'e0000000-0000-4000-8000-000000000002')
union all select 'teams', (select count(*) from public.teams where organization_id = 'e0000000-0000-4000-8000-000000000002');

create temp table beta_before as select * from beta_counts;

-- Precondizione: Alfa ha righe in tutte le tabelle popolate dal seed.
select is_empty(
  $$ select t.tbl
       from (values
         ('memberships',          (select count(*) from public.memberships          where organization_id = 'e0000000-0000-4000-8000-000000000001')),
         ('membership_locations', (select count(*) from public.membership_locations where organization_id = 'e0000000-0000-4000-8000-000000000001')),
         ('team_members',         (select count(*) from public.team_members         where organization_id = 'e0000000-0000-4000-8000-000000000001')),
         ('teams',                (select count(*) from public.teams                where organization_id = 'e0000000-0000-4000-8000-000000000001')),
         ('locations',            (select count(*) from public.locations            where organization_id = 'e0000000-0000-4000-8000-000000000001')),
         ('periods',              (select count(*) from public.periods              where organization_id = 'e0000000-0000-4000-8000-000000000001')),
         ('okrs',                 (select count(*) from public.okrs                 where organization_id = 'e0000000-0000-4000-8000-000000000001')),
         ('key_results',          (select count(*) from public.key_results          where organization_id = 'e0000000-0000-4000-8000-000000000001')),
         ('actions',              (select count(*) from public.actions              where organization_id = 'e0000000-0000-4000-8000-000000000001')),
         ('okr_alignments',       (select count(*) from public.okr_alignments       where organization_id = 'e0000000-0000-4000-8000-000000000001')),
         ('okr_progress_history', (select count(*) from public.okr_progress_history where organization_id = 'e0000000-0000-4000-8000-000000000001')),
         ('audit_logs',           (select count(*) from public.audit_logs           where organization_id = 'e0000000-0000-4000-8000-000000000001'))
       ) as t (tbl, n)
      where t.n = 0 $$,
  'precondizione: Alfa ha righe in tutte le tabelle popolate dal seed');

-- La purge (backend postgres, nessun claim).
select lives_ok(
  $$ delete from public.organizations where id = 'e0000000-0000-4000-8000-000000000001' $$,
  'postgres: la purge di Alfa (delete da organizations a cascata) riesce');

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
  'audit_logs: nessuna riga di Alfa (nemmeno scritta durante la purge)');
select is((select count(*)::int from public.comments where organization_id = 'e0000000-0000-4000-8000-000000000001'), 0,
  'comments: nessuna riga di Alfa');
select is((select count(*)::int from public.support_sessions where organization_id = 'e0000000-0000-4000-8000-000000000001'), 0,
  'support_sessions: nessuna riga di Alfa');

-- Beta intatta.
select results_eq(
  $$ select tbl, n from beta_counts order by tbl $$,
  $$ select tbl, n from beta_before order by tbl $$,
  'Beta: conteggi di tutte le tabelle identici a prima della purge');
select is((select name from public.organizations where id = 'e0000000-0000-4000-8000-000000000002'), 'Beta',
  'Beta: l''organizzazione esiste ancora');

-- Utenti, profili e platform_admins non toccati.
select is((select count(*)::int from auth.users where email like '%@test.local'), 7,
  'auth.users: i 7 utenti di test esistono ancora');
select is((select count(*)::int from public.profiles p join auth.users u on u.id = p.id
            where u.email like '%@test.local'), 7,
  'profiles: i 7 profili esistono ancora');
select is((select count(*)::int from public.platform_admins where user_id = 'd0000000-0000-4000-8000-000000000001'), 1,
  'platform_admins: il superadmin e'' ancora registrato');

select * from finish();
rollback;
