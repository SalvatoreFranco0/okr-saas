-- Caso 11 (piano 6.2 e 5.5): calcolo dell'avanzamento, storico, check-in, blocco di progress_percentage.
-- Le fixture sono create come backend privilegiato (nessun JWT). Dopo un authenticate_as va usato
-- clear_authentication() + reset role, altrimenti il claim role=authenticated resta nel GUC.
begin;
select plan(30);

insert into public.okrs (id, organization_id, period_id, owner_id, title, objective)
select ('40000000-0000-4000-8000-0000000000' || n)::uuid, 'e0000000-0000-4000-8000-000000000001',
       '30000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002', 'P' || n, 'o'
from (values ('20'), ('21'), ('22'), ('23'), ('24'), ('25'), ('26'), ('28'), ('29')) v(n);

-- Nessun KR -> 0
select is((select progress_percentage from public.okrs where id = '40000000-0000-4000-8000-000000000020'),
  0::numeric(5,1), 'nessun KR: avanzamento 0');

-- Un KR al 50%
insert into public.key_results (id, organization_id, okr_id, title, initial_metric, target_metric, current_metric, weight)
values ('50000000-0000-4000-8000-0000000000a1', 'e0000000-0000-4000-8000-000000000001',
        '40000000-0000-4000-8000-000000000020', 'a1', 0, 100, 50, 100);
select is((select progress_percentage from public.okrs where id = '40000000-0000-4000-8000-000000000020'),
  50.0::numeric(5,1), 'un KR al 50%: avanzamento 50');

-- Pesi diversi: (50*100 + 100*300) / 400 = 87.5
insert into public.key_results (id, organization_id, okr_id, title, initial_metric, target_metric, current_metric, weight)
values ('50000000-0000-4000-8000-0000000000a2', 'e0000000-0000-4000-8000-000000000001',
        '40000000-0000-4000-8000-000000000020', 'a2', 0, 100, 100, 300);
select is((select progress_percentage from public.okrs where id = '40000000-0000-4000-8000-000000000020'),
  87.5::numeric(5,1), 'pesi diversi: media pesata');

-- Valore sopra il target: la percentuale del KR e' limitata a 100
update public.key_results set current_metric = 500 where id = '50000000-0000-4000-8000-0000000000a2';
select is((select progress_percentage from public.okrs where id = '40000000-0000-4000-8000-000000000020'),
  87.5::numeric(5,1), 'KR oltre il target: limitato a 100 nella media');
insert into public.key_results (organization_id, okr_id, title, initial_metric, target_metric, current_metric)
values ('e0000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000021', 'b1', 0, 100, 200);
select is((select progress_percentage from public.okrs where id = '40000000-0000-4000-8000-000000000021'),
  100.0::numeric(5,1), 'unico KR oltre il target: 100');

-- Storico: una riga per OKR per giorno, aggiornata
select is((select count(*)::int from public.okr_progress_history where okr_id = '40000000-0000-4000-8000-000000000020'),
  1, 'storico: una sola riga per OKR e per giorno nonostante piu'' ricalcoli');
select is((select progress_percentage from public.okr_progress_history where okr_id = '40000000-0000-4000-8000-000000000020'),
  87.5::numeric(5,1), 'storico: la riga del giorno ha l''ultimo valore');

-- target = initial
insert into public.key_results (id, organization_id, okr_id, title, initial_metric, target_metric, current_metric)
values ('50000000-0000-4000-8000-0000000000c1', 'e0000000-0000-4000-8000-000000000001',
        '40000000-0000-4000-8000-000000000022', 'c1', 50, 50, 50);
select is((select progress_percentage from public.okrs where id = '40000000-0000-4000-8000-000000000022'),
  100.0::numeric(5,1), 'target = initial e current >= target: 100');
update public.key_results set current_metric = 40 where id = '50000000-0000-4000-8000-0000000000c1';
select is((select progress_percentage from public.okrs where id = '40000000-0000-4000-8000-000000000022'),
  0.0::numeric(5,1), 'target = initial e current < target: 0');

-- Metrica decrescente: da 100 a 0, ora 25 -> 75%
insert into public.key_results (organization_id, okr_id, title, initial_metric, target_metric, current_metric)
values ('e0000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000023', 'd1', 100, 0, 25);
select is((select progress_percentage from public.okrs where id = '40000000-0000-4000-8000-000000000023'),
  75.0::numeric(5,1), 'metrica decrescente');

-- Somma dei pesi 0 -> 0
insert into public.key_results (organization_id, okr_id, title, initial_metric, target_metric, current_metric, weight)
values ('e0000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000024', 'e1', 0, 100, 100, 0);
select is((select progress_percentage from public.okrs where id = '40000000-0000-4000-8000-000000000024'),
  0.0::numeric(5,1), 'somma dei pesi 0: avanzamento 0');

-- Spostamento di un KR tra OKR: ricalcola entrambi
insert into public.key_results (id, organization_id, okr_id, title, initial_metric, target_metric, current_metric)
values ('50000000-0000-4000-8000-0000000000f1', 'e0000000-0000-4000-8000-000000000001',
        '40000000-0000-4000-8000-000000000025', 'f1', 0, 100, 100);
select is((select progress_percentage from public.okrs where id = '40000000-0000-4000-8000-000000000025'),
  100.0::numeric(5,1), 'prima dello spostamento l''OKR di origine e'' al 100');
update public.key_results set okr_id = '40000000-0000-4000-8000-000000000026'
 where id = '50000000-0000-4000-8000-0000000000f1';
select is((select progress_percentage from public.okrs where id = '40000000-0000-4000-8000-000000000025'),
  0.0::numeric(5,1), 'spostamento: l''OKR di origine e'' ricalcolato');
select is((select progress_percentage from public.okrs where id = '40000000-0000-4000-8000-000000000026'),
  100.0::numeric(5,1), 'spostamento: l''OKR di destinazione e'' ricalcolato');

-- Update massivo: un solo ricalcolo per OKR (conteggio degli upsert nello storico)
insert into public.key_results (organization_id, okr_id, title, initial_metric, target_metric, current_metric)
select 'e0000000-0000-4000-8000-000000000001', o.okr, 'm' || g, 0, 100, 0
  from (values ('40000000-0000-4000-8000-000000000028'::uuid), ('40000000-0000-4000-8000-000000000029'::uuid)) o(okr)
 cross join generate_series(1, 5) g;
create temp table hist_calls (okr uuid);
create function public.tmp_hist_count() returns trigger language plpgsql as $f$
begin insert into pg_temp.hist_calls values (new.okr_id); return null; end $f$;
create trigger tmp_hist_count after insert or update on public.okr_progress_history
  for each row execute function public.tmp_hist_count();
update public.key_results set current_metric = 50
 where okr_id in ('40000000-0000-4000-8000-000000000028', '40000000-0000-4000-8000-000000000029');
select is((select count(*)::int from hist_calls), 2, 'update di 10 KR su 2 OKR: 2 ricalcoli, non 10');
select is((select progress_percentage from public.okrs where id = '40000000-0000-4000-8000-000000000028'),
  50.0::numeric(5,1), 'update massivo: avanzamento corretto');
select is((select count(*)::int from pg_trigger
            where tgrelid = 'public.key_results'::regclass and tgname like 't80_recalc%'
              and (tgtype & 1) = 0 and not tgisinternal),
  3, 'i tre trigger di ricalcolo sono a livello di statement');

-- progress_percentage non modificabile
select throws_ok($$update public.okrs set progress_percentage = 10 where id = '40000000-0000-4000-8000-000000000020'$$,
  '42501', null, 'modifica diretta di progress_percentage rifiutata (anche per il backend)');
select tests.authenticate_as_aal('alfa_admin', 'aal1');
select throws_ok($$update public.okrs set progress_percentage = 10 where id = '40000000-0000-4000-8000-000000000020'$$,
  '42501', null, 'modifica diretta di progress_percentage rifiutata a un Admin');
select lives_ok($$insert into public.okrs (id, organization_id, period_id, owner_id, title, objective, progress_percentage)
  values ('40000000-0000-4000-8000-000000000030', 'e0000000-0000-4000-8000-000000000001',
          '30000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002', 'x', 'o', 80)$$,
  'insert con progress_percentage del client: accettato...');
select is((select progress_percentage from public.okrs where id = '40000000-0000-4000-8000-000000000030'),
  0.0::numeric(5,1), '...ma il valore del client e'' ignorato (0)');

-- Check-in con nota (KR 5..02 = 50 su OKR Milano)
select lives_ok($$select * from public.kr_check_in('50000000-0000-4000-8000-000000000002', 80, 'nota di test')$$,
  'check-in tramite RPC');
select results_eq($$select old_value, new_value, note, user_id from public.key_result_updates
                     where key_result_id = '50000000-0000-4000-8000-000000000002'$$,
  $$values (50::numeric, 80::numeric, 'nota di test'::text, 'd0000000-0000-4000-8000-000000000002'::uuid)$$,
  'key_result_updates registra valori, nota e autore');
select ok((select last_updated_at from public.key_results where id = '50000000-0000-4000-8000-000000000002') is not null,
  'last_updated_at valorizzato dal check-in');
select lives_ok($$select * from public.kr_check_in('50000000-0000-4000-8000-000000000002', 80)$$,
  'check-in con lo stesso valore');
select is((select count(*)::int from public.key_result_updates where key_result_id = '50000000-0000-4000-8000-000000000002'),
  1, 'stesso valore: nessuna nuova riga in key_result_updates');
update public.key_results set current_metric = 90 where id = '50000000-0000-4000-8000-000000000002';
select is((select note from public.key_result_updates where new_value = 90), null::text,
  'la nota del check-in precedente non viene ereditata da un update successivo');

-- Chi non puo' modificare l'OKR non fa check-in
select tests.clear_authentication();
reset role;
select tests.authenticate_as_aal('alfa_viewer_roma', 'aal1');
select throws_ok($$select * from public.kr_check_in('50000000-0000-4000-8000-000000000004', 10)$$,
  '42501', null, 'un Viewer non puo'' fare check-in');

-- Storici: nessuna scrittura dai client
reset role;
select tests.authenticate_as_aal('alfa_admin', 'aal1');
select throws_ok($$insert into public.okr_progress_history (organization_id, okr_id, progress_percentage, recorded_on)
  values ('e0000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', 10, current_date - 1)$$,
  '42501', null, 'un Admin non scrive okr_progress_history');
select throws_ok($$insert into public.key_result_updates (organization_id, key_result_id, new_value)
  values ('e0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002', 1)$$,
  '42501', null, 'un Admin non scrive key_result_updates');

select * from finish();
rollback;
