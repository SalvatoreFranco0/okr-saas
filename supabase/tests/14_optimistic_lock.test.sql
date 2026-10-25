-- Caso 14 (piano 6.2): concorrenza ottimistica. Un update con `version` obsoleta non tocca righe;
-- la version e' gestita dal trigger (il client non la imposta) e il ricalcolo non la incrementa.
begin;
select plan(12);

select tests.authenticate_as_aal('alfa_admin', 'aal1');

-- OKR (O1)
do $$ declare n int; begin
  update public.okrs set title = 'v2' where id = '40000000-0000-4000-8000-000000000001' and version = 1;
  get diagnostics n = row_count; perform set_config('t.n', n::text, true);
end $$;
select is(current_setting('t.n')::int, 1, 'okr: update con version corrente: 1 riga');
select is((select version from public.okrs where id = '40000000-0000-4000-8000-000000000001'), 2,
  'okr: la version e'' incrementata');
do $$ declare n int; begin
  update public.okrs set title = 'stale' where id = '40000000-0000-4000-8000-000000000001' and version = 1;
  get diagnostics n = row_count; perform set_config('t.n', n::text, true);
end $$;
select is(current_setting('t.n')::int, 0, 'okr: update con version obsoleta: 0 righe');
select is((select title from public.okrs where id = '40000000-0000-4000-8000-000000000001'), 'v2',
  'okr: il valore obsoleto non e'' stato scritto');

-- KR (5..01, su O1)
do $$ declare n int; begin
  update public.key_results set title = 'k2' where id = '50000000-0000-4000-8000-000000000001' and version = 1;
  get diagnostics n = row_count; perform set_config('t.n', n::text, true);
end $$;
select is(current_setting('t.n')::int, 1, 'kr: update con version corrente');
do $$ declare n int; begin
  update public.key_results set title = 'stale' where id = '50000000-0000-4000-8000-000000000001' and version = 1;
  get diagnostics n = row_count; perform set_config('t.n', n::text, true);
end $$;
select is(current_setting('t.n')::int, 0, 'kr: update con version obsoleta');

-- Azione (6..01)
do $$ declare n int; begin
  update public.actions set title = 'a2' where id = '60000000-0000-4000-8000-000000000001' and version = 1;
  get diagnostics n = row_count; perform set_config('t.n', n::text, true);
end $$;
select is(current_setting('t.n')::int, 1, 'azione: update con version corrente');
do $$ declare n int; begin
  update public.actions set title = 'stale' where id = '60000000-0000-4000-8000-000000000001' and version = 1;
  get diagnostics n = row_count; perform set_config('t.n', n::text, true);
end $$;
select is(current_setting('t.n')::int, 0, 'azione: update con version obsoleta');

-- Il client non puo' scegliere la version
select lives_ok($$update public.okrs set version = 99 where id = '40000000-0000-4000-8000-000000000001' and version = 2$$,
  'okr: update che prova a impostare version = 99');
select is((select version from public.okrs where id = '40000000-0000-4000-8000-000000000001'), 3,
  'okr: la version resta old + 1, non 99');

-- Il ricalcolo dell'avanzamento (update derivato) non incrementa la version dell'OKR
do $$ begin
  update public.key_results set current_metric = 60 where id = '50000000-0000-4000-8000-000000000001';
end $$;
select is((select progress_percentage from public.okrs where id = '40000000-0000-4000-8000-000000000001'),
  60.0::numeric(5,1), 'il check-in ha ricalcolato l''avanzamento dell''OKR');
select is((select version from public.okrs where id = '40000000-0000-4000-8000-000000000001'), 3,
  'il ricalcolo derivato non incrementa la version dell''OKR');

select * from finish();
rollback;
