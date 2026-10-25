-- Seed di test (piano 6.1). SOLO per il Supabase effimero della CI (`supabase db reset`).
-- MAI su dev o prod: `db push` non esegue il seed; non lanciarlo a mano su progetti cloud.
-- La password sotto e' una costante di test, non un segreto.
--
-- UUID fissi, per riferirli nei test (formato <tipo>0000000-0000-4000-8000-00000000000N):
--   d = utenti      e = organizzazioni   1 = sedi   2 = team   3 = periodi
--   4 = OKR         5 = key result       6 = azioni
--
-- Utenti (email <identificatore>@test.local, raw_user_meta_data.test_identifier = identificatore,
-- che e' come tests.authenticate_as li trova):
--   d..01 superadmin        platform admin, nessuna membership
--   d..02 alfa_admin        Alfa, admin
--   d..03 alfa_manager      Alfa, manager_okr
--   d..04 alfa_tl_milano    Alfa, team_lead, sede Milano, team Prodotto
--   d..05 alfa_tl_senza_sede Alfa, team_lead, nessuna sede, team Vendite
--   d..06 alfa_viewer_roma  Alfa, viewer, sede Roma, team Prodotto
--   d..07 beta_admin        Beta, admin
--
-- Alfa (e..01): sedi Milano (1..01) e Roma (1..02); team Prodotto (2..01, membri di Milano e Roma),
-- Vendite (2..02), Operations (2..03, vuoto); periodi "Q4 2026" aperto (3..01) e "Q3 2026" chiuso (3..02).
-- Beta (e..02): sede Torino (1..03), team Ricerca (2..04), periodo "Q4 2026" aperto (3..03).
--
-- OKR Alfa:  4..01 senza sede (owner alfa_admin)      4..02 Milano, team Prodotto (owner alfa_tl_milano)
--            4..03 Roma, team Vendite (owner alfa_manager)  4..04 Milano ELIMINATO (soft)
--            4..05 Milano in periodo CHIUSO (owner alfa_tl_milano, team Prodotto)
-- OKR Beta:  4..06 Torino (owner beta_admin)

-- ---------------------------------------------------------------------------
-- Utenti (il trigger okr_on_auth_user_created crea i profili)
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
  u.ident || '@test.local', extensions.crypt('PasswordSoloPerTest-12345', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('test_identifier', u.ident, 'first_name', u.ident, 'last_name', 'Test', 'locale', 'it'),
  now(), now(), '', '', '', ''
from (values
  ('d0000000-0000-4000-8000-000000000001'::uuid, 'superadmin'),
  ('d0000000-0000-4000-8000-000000000002'::uuid, 'alfa_admin'),
  ('d0000000-0000-4000-8000-000000000003'::uuid, 'alfa_manager'),
  ('d0000000-0000-4000-8000-000000000004'::uuid, 'alfa_tl_milano'),
  ('d0000000-0000-4000-8000-000000000005'::uuid, 'alfa_tl_senza_sede'),
  ('d0000000-0000-4000-8000-000000000006'::uuid, 'alfa_viewer_roma'),
  ('d0000000-0000-4000-8000-000000000007'::uuid, 'beta_admin')
) as u(id, ident);

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       now(), now(), now()
from auth.users u
where u.email like '%@test.local';

insert into public.platform_admins (user_id) values ('d0000000-0000-4000-8000-000000000001');

-- ---------------------------------------------------------------------------
-- Organizzazioni, sedi, team, periodi
-- ---------------------------------------------------------------------------
insert into public.organizations (id, name, slug) values
  ('e0000000-0000-4000-8000-000000000001', 'Alfa', 'alfa'),
  ('e0000000-0000-4000-8000-000000000002', 'Beta', 'beta');

insert into public.locations (id, organization_id, name) values
  ('10000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'Milano'),
  ('10000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', 'Roma'),
  ('10000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000002', 'Torino');

insert into public.teams (id, organization_id, name) values
  ('20000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'Prodotto'),
  ('20000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', 'Vendite'),
  ('20000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000001', 'Operations'),
  ('20000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-000000000002', 'Ricerca');

insert into public.periods (id, organization_id, name, start_date, end_date) values
  ('30000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'Q4 2026', '2026-10-01', '2026-12-31'),
  ('30000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', 'Q3 2026', '2026-07-01', '2026-09-30'),
  ('30000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000002', 'Q4 2026', '2026-10-01', '2026-12-31');

-- ---------------------------------------------------------------------------
-- Membership, sedi e team dei membri
-- ---------------------------------------------------------------------------
insert into public.memberships (organization_id, user_id, role) values
  ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002', 'admin'),
  ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000003', 'manager_okr'),
  ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000004', 'team_lead'),
  ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000005', 'team_lead'),
  ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000006', 'viewer'),
  ('e0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000007', 'admin');

insert into public.membership_locations (organization_id, user_id, location_id) values
  ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000002'),
  ('e0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000003');

-- Prodotto copre due sedi (Milano: tl_milano, Roma: viewer_roma); Vendite ha il TL senza sede.
insert into public.team_members (organization_id, team_id, user_id) values
  ('e0000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000004'),
  ('e0000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000006'),
  ('e0000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000005'),
  ('e0000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000003'),
  ('e0000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000007');

-- ---------------------------------------------------------------------------
-- OKR (4..05 nasce nel periodo aperto, il periodo Q3 viene chiuso a fine seed)
-- ---------------------------------------------------------------------------
insert into public.okrs (id, organization_id, period_id, location_id, team_id, owner_id, title, objective, status, priority, deleted_at)
values
  ('40000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
   null, null, 'd0000000-0000-4000-8000-000000000002', 'Alfa: OKR di organizzazione', 'Obiettivo senza sede', 'attivo', 'alta', null),
  ('40000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000004',
   'Alfa: OKR Milano', 'Obiettivo di Milano', 'attivo', 'media', null),
  ('40000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000003',
   'Alfa: OKR Roma', 'Obiettivo di Roma', 'attivo', 'media', null),
  ('40000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000001', null, 'd0000000-0000-4000-8000-000000000002',
   'Alfa: OKR eliminato', 'Obiettivo eliminato', 'in_pausa', 'bassa', now()),
  ('40000000-0000-4000-8000-000000000005', 'e0000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002',
   '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000004',
   'Alfa: OKR periodo chiuso', 'Obiettivo in periodo chiuso', 'attivo', 'media', null),
  ('40000000-0000-4000-8000-000000000006', 'e0000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003',
   '10000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000007',
   'Beta: OKR Torino', 'Obiettivo di Beta', 'attivo', 'media', null);

insert into public.key_results (id, organization_id, okr_id, title, initial_metric, target_metric, current_metric, weight)
values
  ('50000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'KR org 1', 0, 100, 25, 100),
  ('50000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', 'KR Milano 1', 0, 100, 50, 100),
  ('50000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', 'KR Milano 2', 0, 10, 10, 100),
  ('50000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000003', 'KR Roma 1', 0, 100, 40, 100),
  ('50000000-0000-4000-8000-000000000005', 'e0000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000005', 'KR chiuso 1', 0, 100, 60, 100),
  ('50000000-0000-4000-8000-000000000006', 'e0000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000006', 'KR Beta 1', 0, 100, 30, 100);

insert into public.actions (id, organization_id, key_result_id, title, assignee_id)
values
  ('60000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'Azione org', 'd0000000-0000-4000-8000-000000000002'),
  ('60000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002', 'Azione Milano', 'd0000000-0000-4000-8000-000000000004'),
  ('60000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000004', 'Azione Roma', 'd0000000-0000-4000-8000-000000000003'),
  ('60000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000005', 'Azione periodo chiuso', null),
  ('60000000-0000-4000-8000-000000000005', 'e0000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000006', 'Azione Beta', 'd0000000-0000-4000-8000-000000000007');

-- Un allineamento: l'OKR di organizzazione allinea quello di Milano.
insert into public.okr_alignments (organization_id, parent_okr_id, child_okr_id)
values ('e0000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002');

-- Chiusura del periodo Q3 solo ora: prima il trigger enforce_open_period avrebbe bloccato gli insert.
update public.periods set is_closed = true where id = '30000000-0000-4000-8000-000000000002';
