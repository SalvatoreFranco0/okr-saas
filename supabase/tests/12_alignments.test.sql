-- Piano 6.2, caso 12: allineamenti senza cicli.
-- Trigger t50_prevent_cycle -> private.okr_alignments_prevent_cycle(): errcode 23514,
-- hint alignment_cycle. Auto-allineamento: CHECK okr_alignments_no_self. Duplicato: UNIQUE
-- okr_alignments_pair_key.
--
-- Concorrenza (A->B e B->A in due transazioni): NON coperta in pgTAP. Servirebbero due
-- sessioni (dblink) con commit reali, che lascerebbero dati permanenti nel database di test e
-- romperebbero l'isolamento a rollback degli altri file; inoltre dblink non e' installato e
-- richiederebbe credenziali di connessione nel test. Si verifica invece la struttura: la
-- funzione prende pg_advisory_xact_lock PRIMA della visita ricorsiva ed e' security definer
-- (vede tutti gli archi, anche quelli nascosti dalla RLS).
--
-- UUID: Alfa e..01; OKR 4..01 (A), 4..02 (B), 4..03 (C) di Alfa, periodo aperto.
-- Seed: un allineamento 4..01 -> 4..02.
begin;
select plan(12);

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

select tests.authenticate_as_aal('alfa_admin', 'aal1');

-- A -> B esiste: B -> A chiuderebbe un ciclo.
select throws_ok(
  $$ insert into public.okr_alignments (organization_id, parent_okr_id, child_okr_id)
     values ('e0000000-0000-4000-8000-000000000001',
             '40000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001') $$,
  '23514', 'Allineamento non valido: creerebbe un ciclo tra OKR',
  'ciclo A->B->A rifiutato');

select lives_ok(
  $$ insert into public.okr_alignments (organization_id, parent_okr_id, child_okr_id)
     values ('e0000000-0000-4000-8000-000000000001',
             '40000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000003') $$,
  'B -> C accettato (catena A->B->C senza cicli)');

select throws_ok(
  $$ insert into public.okr_alignments (organization_id, parent_okr_id, child_okr_id)
     values ('e0000000-0000-4000-8000-000000000001',
             '40000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000001') $$,
  '23514', 'Allineamento non valido: creerebbe un ciclo tra OKR',
  'ciclo lungo A->B->C->A rifiutato');

select throws_ok(
  $$ insert into public.okr_alignments (organization_id, parent_okr_id, child_okr_id)
     values ('e0000000-0000-4000-8000-000000000001',
             '40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001') $$,
  '23514', 'new row for relation "okr_alignments" violates check constraint "okr_alignments_no_self"',
  'auto-allineamento rifiutato dal CHECK okr_alignments_no_self');

select throws_ok(
  $$ insert into public.okr_alignments (organization_id, parent_okr_id, child_okr_id)
     values ('e0000000-0000-4000-8000-000000000001',
             '40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002') $$,
  '23505', null, 'allineamento duplicato rifiutato (unique)');

-- Ciclo creato con un UPDATE: A->B diventa C->B, con B->C esistente.
select throws_ok(
  $$ update public.okr_alignments
        set parent_okr_id = '40000000-0000-4000-8000-000000000003'
      where parent_okr_id = '40000000-0000-4000-8000-000000000001'
        and child_okr_id = '40000000-0000-4000-8000-000000000002' $$,
  '23514', 'Allineamento non valido: creerebbe un ciclo tra OKR',
  'ciclo creato con un update rifiutato');

-- Il trigger vale anche per il backend (bypassa la RLS ma non il trigger).
reset role;
select set_config('request.jwt.claims', '', true);
select throws_ok(
  $$ insert into public.okr_alignments (organization_id, parent_okr_id, child_okr_id)
     values ('e0000000-0000-4000-8000-000000000001',
             '40000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000001') $$,
  '23514', 'Allineamento non valido: creerebbe un ciclo tra OKR',
  'postgres: ciclo rifiutato anche per il backend');

select set_eq(
  $$ select parent_okr_id, child_okr_id from public.okr_alignments
      where organization_id = 'e0000000-0000-4000-8000-000000000001' $$,
  $$ values ('40000000-0000-4000-8000-000000000001'::uuid, '40000000-0000-4000-8000-000000000002'::uuid),
            ('40000000-0000-4000-8000-000000000002'::uuid, '40000000-0000-4000-8000-000000000003'::uuid) $$,
  'restano solo gli allineamenti validi (A->B, B->C)');

-- Struttura anti-concorrenza (la prova a due sessioni non e' coperta, vedi intestazione).
select has_trigger('public', 'okr_alignments', 't50_prevent_cycle',
  'trigger anti-ciclo presente su okr_alignments');
select ok(
  position('pg_advisory_xact_lock' in pg_get_functiondef('private.okr_alignments_prevent_cycle()'::regprocedure)) > 0,
  'okr_alignments_prevent_cycle prende pg_advisory_xact_lock');
select ok(
  position('pg_advisory_xact_lock' in pg_get_functiondef('private.okr_alignments_prevent_cycle()'::regprocedure))
  < position('with recursive' in lower(pg_get_functiondef('private.okr_alignments_prevent_cycle()'::regprocedure))),
  'il lock e'' preso prima della visita ricorsiva degli archi');
select ok(
  (select prosecdef from pg_proc where oid = 'private.okr_alignments_prevent_cycle()'::regprocedure),
  'okr_alignments_prevent_cycle e'' security definer (vede tutti gli archi)');

select * from finish();
rollback;
