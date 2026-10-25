-- Caso 15 (piano 6.2): sedi, team e periodi non si eliminano (nessun privilegio/policy DELETE);
-- le FK composte sono NO ACTION, quindi nemmeno il backend elimina una riga ancora referenziata.
begin;
select plan(12);

-- Backend privilegiato: le FK impediscono la cancellazione fisica di righe referenziate.
select throws_ok($$delete from public.locations where id = '10000000-0000-4000-8000-000000000001'$$,
  '23503', null, 'FK: una sede referenziata non si elimina nemmeno dal backend');
select throws_ok($$delete from public.teams where id = '20000000-0000-4000-8000-000000000001'$$,
  '23503', null, 'FK: un team con membri/OKR non si elimina');
select throws_ok($$delete from public.periods where id = '30000000-0000-4000-8000-000000000001'$$,
  '23503', null, 'FK: un periodo con OKR non si elimina');
select throws_ok($$delete from public.memberships where user_id = 'd0000000-0000-4000-8000-000000000006'$$,
  '23503', null, 'FK: una membership referenziata non si elimina');

-- Client: nessun privilegio DELETE
select tests.authenticate_as_aal('alfa_admin', 'aal1');
select throws_ok($$delete from public.locations where id = '10000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'admin: niente DELETE su locations');
select throws_ok($$delete from public.teams where id = '20000000-0000-4000-8000-000000000003'$$,
  '42501', null, 'admin: niente DELETE su teams');
select throws_ok($$delete from public.periods where id = '30000000-0000-4000-8000-000000000002'$$,
  '42501', null, 'admin: niente DELETE su periods');
select throws_ok($$delete from public.memberships where user_id = 'd0000000-0000-4000-8000-000000000006'$$,
  '42501', null, 'admin: niente DELETE su memberships');
select throws_ok($$delete from public.membership_locations where user_id = 'd0000000-0000-4000-8000-000000000006'$$,
  '42501', null, 'admin: niente DELETE su membership_locations');
select throws_ok($$delete from public.okrs where id = '40000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'admin: niente DELETE su okrs (solo soft delete)');
select throws_ok($$delete from public.organizations where id = 'e0000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'admin: niente DELETE su organizations');
select throws_ok($$update public.organizations set name = 'Hack' where id = 'e0000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'admin: niente UPDATE su organizations');

select * from finish();
rollback;
