-- Piano 6.2, caso 1 (parte strutturale): inventario di RLS, privilegi, policy, funzioni e viste.
-- Questo file fallisce se si rimuove (o si aggiunge senza aggiornarlo) anche una sola policy,
-- un grant o una tabella: e' il controllo richiesto dal "Fatto quando" della fase 3.
-- Gira interamente come postgres: legge solo i cataloghi.
begin;
select plan(16);

-- ---------------------------------------------------------------------------
-- (a) Tabelle di public: elenco esatto e RLS abilitata E forzata su ognuna
-- ---------------------------------------------------------------------------
-- Non si usa tests.rls_enabled: conta anche le viste e non controlla FORCE.
select is_empty(
  $$ select c.relname::text
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind in ('r', 'p')
        and not (c.relrowsecurity and c.relforcerowsecurity) $$,
  'ogni tabella di public ha RLS abilitata e forzata'
);

select set_eq(
  $$ select c.relname::text
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind in ('r', 'p') $$,
  $$ values ('organizations'), ('platform_admins'), ('support_sessions'), ('profiles'),
            ('periods'), ('locations'), ('teams'), ('memberships'), ('membership_locations'),
            ('team_members'), ('okrs'), ('key_results'), ('actions'), ('okr_alignments'),
            ('okr_progress_history'), ('key_result_updates'), ('comments'), ('audit_logs') $$,
  'inventario delle tabelle di public (18): una tabella nuova richiede di aggiornare i test'
);

-- ---------------------------------------------------------------------------
-- (b) Privilegi di anon e authenticated (migrazioni 0005, 0006, 0007)
-- ---------------------------------------------------------------------------
-- has_table_privilege e non information_schema: quest'ultimo mostra solo i grant visibili
-- al ruolo corrente.
select is_empty(
  $$ select c.relname::text
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind in ('r', 'p', 'v', 'm')
        and has_table_privilege('anon', c.oid,
              'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') $$,
  'anon non ha alcun privilegio di tabella su relazioni di public'
);

select is_empty(
  $$ select c.relname::text
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind in ('r', 'p', 'v', 'm')
        and has_any_column_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, REFERENCES') $$,
  'anon non ha alcun privilegio di colonna su relazioni di public'
);

-- Privilegi di tabella di authenticated: elenco esatto, uno per uno.
select set_eq(
  $$ select c.relname::text, p.priv
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
                         ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p (priv)
      where n.nspname = 'public'
        and c.relkind in ('r', 'p', 'v', 'm')
        and has_table_privilege('authenticated', c.oid, p.priv) $$,
  $$ values
       ('organizations', 'SELECT'),
       ('platform_admins', 'SELECT'),
       ('support_sessions', 'SELECT'),
       ('profiles', 'SELECT'),
       ('periods', 'SELECT'), ('periods', 'INSERT'), ('periods', 'UPDATE'),
       ('locations', 'SELECT'), ('locations', 'INSERT'), ('locations', 'UPDATE'),
       ('teams', 'SELECT'), ('teams', 'INSERT'), ('teams', 'UPDATE'),
       ('team_members', 'SELECT'), ('team_members', 'INSERT'), ('team_members', 'UPDATE'), ('team_members', 'DELETE'),
       ('memberships', 'SELECT'),
       ('membership_locations', 'SELECT'),
       ('okrs', 'SELECT'), ('okrs', 'INSERT'), ('okrs', 'UPDATE'),
       ('key_results', 'SELECT'), ('key_results', 'INSERT'), ('key_results', 'UPDATE'), ('key_results', 'DELETE'),
       ('actions', 'SELECT'), ('actions', 'INSERT'), ('actions', 'UPDATE'), ('actions', 'DELETE'),
       ('okr_alignments', 'SELECT'), ('okr_alignments', 'INSERT'), ('okr_alignments', 'UPDATE'), ('okr_alignments', 'DELETE'),
       ('okr_progress_history', 'SELECT'),
       ('key_result_updates', 'SELECT'),
       ('comments', 'SELECT'), ('comments', 'INSERT'), ('comments', 'DELETE'),
       ('audit_logs', 'SELECT'),
       ('v_okr_summary', 'SELECT'),
       ('v_okr_at_risk', 'SELECT'),
       ('v_org_members', 'SELECT') $$,
  'authenticated ha esattamente i privilegi di tabella concessi da 0005/0006/0007'
);

-- Privilegi SOLO di colonna (senza il corrispondente privilegio di tabella).
select set_eq(
  $$ select c.relname::text, a.attname::text, p.priv
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('REFERENCES')) as p (priv)
      where n.nspname = 'public'
        and c.relkind in ('r', 'p', 'v', 'm')
        and has_column_privilege('authenticated', c.oid, a.attnum, p.priv)
        and not has_table_privilege('authenticated', c.oid, p.priv) $$,
  $$ values ('profiles', 'first_name', 'UPDATE'),
            ('profiles', 'last_name', 'UPDATE'),
            ('profiles', 'locale', 'UPDATE'),
            ('comments', 'content', 'UPDATE') $$,
  'authenticated ha solo gli UPDATE di colonna previsti (profiles: nome/cognome/lingua; comments: content)'
);

-- memberships e membership_locations: SOLO lettura, anche a livello di colonna.
select ok(
  not has_table_privilege('authenticated', 'public.memberships', 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'),
  'memberships: authenticated non ha privilegi di scrittura di tabella'
);
select ok(
  not has_any_column_privilege('authenticated', 'public.memberships', 'INSERT, UPDATE, REFERENCES'),
  'memberships: authenticated non ha privilegi di scrittura di colonna'
);
select ok(
  not has_table_privilege('authenticated', 'public.membership_locations', 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'),
  'membership_locations: authenticated non ha privilegi di scrittura di tabella'
);
select ok(
  not has_any_column_privilege('authenticated', 'public.membership_locations', 'INSERT, UPDATE, REFERENCES'),
  'membership_locations: authenticated non ha privilegi di scrittura di colonna'
);
select ok(
  not has_table_privilege('authenticated', 'public.audit_logs', 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
  and not has_any_column_privilege('authenticated', 'public.audit_logs', 'INSERT, UPDATE, REFERENCES'),
  'audit_logs: authenticated non ha alcun privilegio di scrittura'
);

-- ---------------------------------------------------------------------------
-- (c) Inventario ESATTO delle policy (0005 + 0006): (tabella, policy, comando)
-- ---------------------------------------------------------------------------
select set_eq(
  $$ select tablename::text, policyname::text, cmd::text
       from pg_policies
      where schemaname = 'public' $$,
  $$ values
       ('organizations',        'organizations_select',        'SELECT'),
       ('platform_admins',      'platform_admins_select',      'SELECT'),
       ('support_sessions',     'support_sessions_select',     'SELECT'),
       ('profiles',             'profiles_select',             'SELECT'),
       ('profiles',             'profiles_update_own',         'UPDATE'),
       ('periods',              'periods_select',              'SELECT'),
       ('periods',              'periods_insert',              'INSERT'),
       ('periods',              'periods_update',              'UPDATE'),
       ('locations',            'locations_select',            'SELECT'),
       ('locations',            'locations_insert',            'INSERT'),
       ('locations',            'locations_update',            'UPDATE'),
       ('teams',                'teams_select',                'SELECT'),
       ('teams',                'teams_insert',                'INSERT'),
       ('teams',                'teams_update',                'UPDATE'),
       ('team_members',         'team_members_select',         'SELECT'),
       ('team_members',         'team_members_insert',         'INSERT'),
       ('team_members',         'team_members_update',         'UPDATE'),
       ('team_members',         'team_members_delete',         'DELETE'),
       ('memberships',          'memberships_select',          'SELECT'),
       ('membership_locations', 'membership_locations_select', 'SELECT'),
       ('okrs',                 'okrs_select',                 'SELECT'),
       ('okrs',                 'okrs_insert',                 'INSERT'),
       ('okrs',                 'okrs_update',                 'UPDATE'),
       ('key_results',          'key_results_select',          'SELECT'),
       ('key_results',          'key_results_insert',          'INSERT'),
       ('key_results',          'key_results_update',          'UPDATE'),
       ('key_results',          'key_results_delete',          'DELETE'),
       ('actions',              'actions_select',              'SELECT'),
       ('actions',              'actions_insert',              'INSERT'),
       ('actions',              'actions_update',              'UPDATE'),
       ('actions',              'actions_delete',              'DELETE'),
       ('okr_alignments',       'okr_alignments_select',       'SELECT'),
       ('okr_alignments',       'okr_alignments_insert',       'INSERT'),
       ('okr_alignments',       'okr_alignments_update',       'UPDATE'),
       ('okr_alignments',       'okr_alignments_delete',       'DELETE'),
       ('okr_progress_history', 'okr_progress_history_select', 'SELECT'),
       ('key_result_updates',   'key_result_updates_select',   'SELECT'),
       ('comments',             'comments_select',             'SELECT'),
       ('comments',             'comments_insert',             'INSERT'),
       ('comments',             'comments_update_own',         'UPDATE'),
       ('comments',             'comments_delete',             'DELETE'),
       ('audit_logs',           'audit_logs_select',           'SELECT') $$,
  'inventario esatto delle 42 policy di public (nessuna mancante, nessuna inattesa)'
);

select is_empty(
  $$ select tablename::text, policyname::text
       from pg_policies
      where schemaname = 'public'
        and (roles::text[] <> array['authenticated'] or permissive <> 'PERMISSIVE') $$,
  'tutte le policy di public sono PERMISSIVE e solo "to authenticated" (nessuna per anon/public)'
);

-- ---------------------------------------------------------------------------
-- (d) Nessuna funzione SECURITY DEFINER in public
-- ---------------------------------------------------------------------------
select is_empty(
  $$ select p.oid::regprocedure::text
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.prosecdef $$,
  'nessuna funzione security definer nello schema public'
);

-- ---------------------------------------------------------------------------
-- (e) Viste v_*: elenco e security_invoker = true
-- ---------------------------------------------------------------------------
select set_eq(
  $$ select c.relname::text
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind in ('v', 'm') $$,
  $$ values ('v_okr_summary'), ('v_okr_at_risk'), ('v_org_members') $$,
  'inventario delle viste di public'
);

select is_empty(
  $$ select c.relname::text
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind in ('v', 'm')
        and not ('security_invoker=true' = any (coalesce(c.reloptions, '{}'::text[]))) $$,
  'ogni vista di public ha security_invoker=true'
);

select * from finish();
rollback;
