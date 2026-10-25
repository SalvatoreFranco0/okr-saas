-- Piano 6.2, caso 1: anon non legge ne' scrive nulla, nessuna funzione di public/private
-- eseguibile, schema private irraggiungibile.
-- Nota "RPC": private non e' tra gli schemi esposti (supabase/config.toml, [api].schemas =
-- public, graphql_public): non e' verificabile da SQL; qui si verifica che anon non abbia
-- nemmeno USAGE su private, quindi non lo raggiungerebbe neanche se venisse esposto per errore.
begin;
select plan(15);

-- pgTAP deve essere eseguibile dai ruoli simulati: la 0001 toglie per default EXECUTE a PUBLIC
-- sulle funzioni create da postgres. Si concede solo dove manca; il rollback finale lo annulla.
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
-- Privilegi (cataloghi)
-- ---------------------------------------------------------------------------
select is_empty(
  $$ select c.relname::text
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind in ('r', 'p', 'v', 'm')
        and (has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
             or has_any_column_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, REFERENCES')) $$,
  'anon non ha privilegi su nessuna tabella o vista di public'
);

select is_empty(
  $$ select p.oid::regprocedure::text
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and has_function_privilege('anon', p.oid, 'EXECUTE') $$,
  'nessuna funzione di public e'' eseguibile da anon'
);

select is_empty(
  $$ select p.oid::regprocedure::text
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'private'
        and has_function_privilege('anon', p.oid, 'EXECUTE') $$,
  'nessuna funzione di private e'' eseguibile da anon'
);

select ok(
  not has_schema_privilege('anon', 'private', 'USAGE')
  and not has_schema_privilege('anon', 'private', 'CREATE'),
  'anon non ha USAGE ne'' CREATE sullo schema private'
);

-- ---------------------------------------------------------------------------
-- Prova pratica come anon su TUTTE le relazioni di public
-- ---------------------------------------------------------------------------
-- Per ogni tabella: select, insert, update, delete, truncate; per ogni vista: select (sulle
-- viste non aggiornabili il rewriter darebbe un errore diverso dal permesso negato, e i
-- privilegi delle viste sono gia' verificati sopra). Ogni tentativo deve fallire con 42501:
-- gli esiti diversi finiscono in un GUC che poi si confronta con la stringa vuota.
select tests.clear_authentication();

do $$
declare
  r       record;
  v_col   text;
  v_op    text;
  v_sql   text;
  v_leaks text := '';
  v_n     int  := 0;
begin
  for r in
    select c.oid, c.oid::regclass::text as rel, c.relkind
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p', 'v', 'm')
     order by c.relname
  loop
    v_n := v_n + 1;
    select a.attname into v_col
      from pg_attribute a
     where a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped
     order by a.attnum
     limit 1;
    foreach v_op in array
      case when r.relkind in ('r', 'p')
           then array['select', 'insert', 'update', 'delete', 'truncate']
           else array['select'] end
    loop
      v_sql := case v_op
        when 'select'   then format('select 1 from %s limit 1', r.rel)
        when 'insert'   then format('insert into %s default values', r.rel)
        when 'update'   then format('update %s set %I = %I', r.rel, v_col, v_col)
        when 'delete'   then format('delete from %s', r.rel)
        when 'truncate' then format('truncate %s', r.rel)
      end;
      begin
        execute v_sql;
        v_leaks := v_leaks || format('%s:%s=ESEGUITO; ', r.rel, v_op);
      exception
        when insufficient_privilege then null;
        when others then
          v_leaks := v_leaks || format('%s:%s=%s; ', r.rel, v_op, sqlstate);
      end;
    end loop;
  end loop;
  perform set_config('test.anon_leaks', v_leaks, true);
  perform set_config('test.anon_relations', v_n::text, true);
end $$;

-- Prove esplicite sulle tabelle piu' sensibili (stesso ruolo anon).
select throws_ok($$ select * from public.okrs $$, '42501', null, 'anon: select su okrs negata');
select throws_ok($$ select * from public.organizations $$, '42501', null, 'anon: select su organizations negata');
select throws_ok(
  $$ insert into public.organizations (name, slug) values ('Intrusa', 'intrusa') $$,
  '42501', null, 'anon: insert su organizations negata');
select throws_ok(
  $$ update public.memberships set role = 'admin' $$,
  '42501', null, 'anon: update su memberships negato');
select throws_ok($$ delete from public.audit_logs $$, '42501', null, 'anon: delete su audit_logs negato');
select throws_ok($$ select * from public.v_org_members $$, '42501', null, 'anon: select sulla vista v_org_members negata');

-- Funzioni: RPC di public e funzioni di private.
select throws_ok(
  $$ select public.dashboard_stats('e0000000-0000-4000-8000-000000000001'::uuid) $$,
  '42501', null, 'anon: dashboard_stats non eseguibile');
select throws_ok(
  $$ select public.kr_check_in('50000000-0000-4000-8000-000000000001'::uuid, 1) $$,
  '42501', null, 'anon: kr_check_in non eseguibile');
select throws_ok(
  $$ select private.my_access() $$,
  '42501', null, 'anon: private.my_access() irraggiungibile (nessun USAGE su private)');

reset role;
select set_config('request.jwt.claims', '', true);

select is(current_setting('test.anon_leaks'), '',
  'anon: ogni select/insert/update/delete/truncate su ogni relazione di public fallisce con 42501');
select cmp_ok(current_setting('test.anon_relations')::int, '>=', 21,
  'la prova pratica ha coperto tutte le relazioni di public (almeno 18 tabelle + 3 viste)');

select * from finish();
rollback;
