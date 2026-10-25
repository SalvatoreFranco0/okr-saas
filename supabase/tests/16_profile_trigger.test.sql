-- Caso 16 (piano 6.2): il trigger di creazione profilo non deve mai bloccare la creazione di un utente.
begin;
select plan(12);

-- Nessun metadato, nessuna email
select lives_ok($$insert into auth.users (id) values ('a1000000-0000-4000-8000-000000000001')$$,
  'utente senza metadati ne'' email: creazione riuscita');
select results_eq($$select locale, first_name, last_name, email from public.profiles
                     where id = 'a1000000-0000-4000-8000-000000000001'$$,
  $$values ('it'::text, null::text, null::text, null::text)$$,
  'profilo creato con i default (locale it)');

-- Locale non valido -> it
select lives_ok($$insert into auth.users (id, email, raw_user_meta_data)
  values ('a1000000-0000-4000-8000-000000000002', 'x2@test.local', '{"locale":"xx"}'::jsonb)$$,
  'utente con locale non valido');
select is((select locale from public.profiles where id = 'a1000000-0000-4000-8000-000000000002'), 'it',
  'locale non valido ripiega su it');

-- Locale en, nome con spazi
select lives_ok($$insert into auth.users (id, email, raw_user_meta_data)
  values ('a1000000-0000-4000-8000-000000000003', 'x3@test.local', '{"locale":"en","first_name":"  Anna  "}'::jsonb)$$,
  'utente con locale en e nome con spazi');
select results_eq($$select locale, first_name from public.profiles where id = 'a1000000-0000-4000-8000-000000000003'$$,
  $$values ('en'::text, 'Anna'::text)$$, 'locale en e nome ripulito');

-- Nome troppo lungo -> troncato a 100
select lives_ok($$insert into auth.users (id, email, raw_user_meta_data)
  values ('a1000000-0000-4000-8000-000000000004', 'x4@test.local', jsonb_build_object('first_name', repeat('a', 500)))$$,
  'utente con nome di 500 caratteri');
select is((select length(first_name) from public.profiles where id = 'a1000000-0000-4000-8000-000000000004'), 100,
  'nome troncato a 100 caratteri');

-- Allineamento email
select lives_ok($$update auth.users set email = 'nuova@test.local' where id = 'a1000000-0000-4000-8000-000000000003'$$,
  'cambio email su auth.users');
select is((select email from public.profiles where id = 'a1000000-0000-4000-8000-000000000003'), 'nuova@test.local',
  'profiles.email segue auth.users');

-- Anche se l'insert del profilo fallisce, l'utente viene creato (errore -> WARNING)
create function public.tmp_fail_profile() returns trigger language plpgsql as $f$
begin raise exception 'errore forzato dal test'; end $f$;
create trigger tmp_fail_profile before insert on public.profiles
  for each row execute function public.tmp_fail_profile();
select lives_ok($$insert into auth.users (id, email) values ('a1000000-0000-4000-8000-000000000005', 'x5@test.local')$$,
  'profilo impossibile da creare: l''utente viene comunque creato');
select is_empty($$select 1 from public.profiles where id = 'a1000000-0000-4000-8000-000000000005'$$,
  '...e il profilo manca (recuperabile dopo)');

select * from finish();
rollback;
