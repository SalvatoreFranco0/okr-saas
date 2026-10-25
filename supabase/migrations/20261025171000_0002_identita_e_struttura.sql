-- 0002: identita' e struttura (piano 5.1, 5.3).
-- Tabelle: organizations, platform_admins, support_sessions, profiles, periods, locations,
-- teams, memberships, membership_locations, team_members.
-- Helper generici in private: is_trusted_backend, forbid_tenant_change, set_actor_columns,
-- set_updated_at, bump_version. Trigger profilo su auth.users. Trigger anti-ultimo-Admin.
--
-- Scelte trasversali:
-- * RLS abilitata e FORZATA gia' alla creazione (senza policy = nessun accesso): se una
--   migrazione successiva fallisse, le tabelle non resterebbero aperte ad authenticated
--   (Supabase concede ALL ad authenticated per default privileges). Le policy arrivano in 0005.
-- * Tutti i privilegi su queste tabelle sono revocati ad anon e authenticated; 0005 concede
--   ad authenticated solo cio' che serve.
-- * Tutte le funzioni trigger sono SECURITY DEFINER con search_path vuoto: cosi' le chiamate
--   annidate a funzioni di private funzionano anche quando il trigger scatta per ruoli senza
--   USAGE su private (service_role, supabase_auth_admin). Una funzione "returns trigger" non
--   e' invocabile direttamente, quindi questo non espone nulla.

-- ---------------------------------------------------------------------------
-- pg_trgm fuori da public
-- ---------------------------------------------------------------------------
-- La 0001 l'ha creata in public (primo schema del search_path). La spostiamo in extensions
-- (convenzione Supabase) cosi' public contiene solo oggetti dell'app e le funzioni
-- dell'estensione non sono candidate a diventare RPC. Nulla la usa ancora (l'indice
-- trigram e' in 0003, dove gin_trgm_ops si risolve via search_path che include extensions).
alter extension pg_trgm set schema extensions;

-- ---------------------------------------------------------------------------
-- Helper: contesto "backend fidato"
-- ---------------------------------------------------------------------------
-- Vero quando chi esegue NON e' un client (anon/authenticated): service_role dalle Edge
-- Functions, postgres in migrazioni/seed/purge. Si basa sul GUC "role" (impostato da
-- PostgREST con SET ROLE e non alterato da SECURITY DEFINER) e sul claim role del JWT,
-- non su current_user, che dentro una funzione security definer vale il proprietario.
create or replace function private.is_trusted_backend()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_setting('role') not in ('authenticated', 'anon')
     and coalesce(auth.jwt() ->> 'role', '') not in ('authenticated', 'anon');
$$;
revoke execute on function private.is_trusted_backend() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helper trigger generici
-- ---------------------------------------------------------------------------

-- Immutabilita' di id, organization_id, created_at, created_by (solo le colonne presenti
-- nella tabella: il confronto via jsonb rende la funzione riusabile ovunque).
-- Eccezione: backend fidato (service_role/postgres), come previsto dal piano per la purge.
-- Nota: la purge del tenant e' un DELETE a cascata, che non attiva trigger di UPDATE;
-- l'eccezione serve solo a procedure amministrative esplicite.
create or replace function private.forbid_tenant_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := to_jsonb(old);
  v_new jsonb := to_jsonb(new);
  k text;
begin
  if private.is_trusted_backend() then
    return new;
  end if;
  foreach k in array array['id', 'organization_id', 'created_at', 'created_by'] loop
    if v_old ? k and (v_new -> k) is distinct from (v_old -> k) then
      raise exception 'La colonna % di % non e'' modificabile', k, tg_table_name
        using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;
revoke execute on function private.forbid_tenant_change() from public, anon, authenticated;

-- created_by/updated_by sempre da auth.uid(): il client non li puo' impostare.
-- Senza utente (backend fidato, seed) si mantengono i valori forniti.
create or replace function private.set_actor_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    if v_uid is not null then
      new.created_by := v_uid;
      new.updated_by := v_uid;
    end if;
  else
    new.updated_by := coalesce(v_uid, new.updated_by);
  end if;
  return new;
end;
$$;
revoke execute on function private.set_actor_columns() from public, anon, authenticated;

-- updated_at a ogni update. In insert forza anche created_at/updated_at a now() per i
-- client (altrimenti potrebbero retrodatare un record); il backend fidato puo' fornirli
-- (seed, import).
create or replace function private.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if private.is_trusted_backend() then
      new.created_at := coalesce(new.created_at, now());
      new.updated_at := coalesce(new.updated_at, now());
    else
      new.created_at := now();
      new.updated_at := now();
    end if;
  else
    new.updated_at := now();
  end if;
  return new;
end;
$$;
revoke execute on function private.set_updated_at() from public, anon, authenticated;

-- Concorrenza ottimistica: version = 1 in insert, +1 a ogni update del client.
-- Gli update generati da altri trigger (pg_trigger_depth() > 1, es. il ricalcolo di
-- progress_percentage dopo un check-in) NON incrementano la version: sono dati derivati e
-- non devono far fallire per "conflitto" chi sta modificando il form dell'OKR.
create or replace function private.bump_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.version := 1;
  elsif pg_trigger_depth() > 1 then
    new.version := old.version;
  else
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;
revoke execute on function private.bump_version() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------------
create table if not exists public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) between 1 and 200),
  slug       text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  plan       text not null default 'internal',
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- platform_admins: nessun accesso client in scrittura; letto via private.is_platform_admin()
-- ---------------------------------------------------------------------------
create table if not exists public.platform_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- support_sessions: scritta solo dalla Edge Function admin-start-support-session
-- ---------------------------------------------------------------------------
create table if not exists public.support_sessions (
  id                uuid primary key default gen_random_uuid(),
  -- cascade: se un super-admin viene revocato, le sue sessioni spariscono e con loro
  -- l'accesso; la traccia resta in audit_logs.
  platform_admin_id uuid not null references public.platform_admins (user_id) on delete cascade,
  organization_id   uuid not null references public.organizations (id) on delete cascade,
  reason            text not null check (length(reason) >= 10),
  started_at        timestamptz not null default now(),
  expires_at        timestamptz not null,
  ended_at          timestamptz null,
  created_at        timestamptz not null default now(),
  constraint support_sessions_max_4h check (expires_at <= started_at + interval '4 hours'),
  constraint support_sessions_expires_after_start check (expires_at > started_at),
  constraint support_sessions_ended_after_start check (ended_at is null or ended_at >= started_at)
);
-- Ricerca delle sessioni attive in my_access().
create index if not exists support_sessions_active_idx
  on public.support_sessions (platform_admin_id, organization_id, expires_at)
  where ended_at is null;
create index if not exists support_sessions_org_idx
  on public.support_sessions (organization_id, started_at desc);

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  first_name text null check (first_name is null or length(first_name) <= 100),
  last_name  text null check (last_name is null or length(last_name) <= 100),
  email      text null,
  locale     text not null default 'it' check (locale in ('it', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- periods
-- ---------------------------------------------------------------------------
create table if not exists public.periods (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name            text not null check (length(btrim(name)) between 1 and 100),
  start_date      date not null,
  end_date        date not null,
  is_closed       boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint periods_org_name_key unique (organization_id, name),
  constraint periods_id_org_key unique (id, organization_id),
  constraint periods_dates_check check (end_date >= start_date)
);

-- ---------------------------------------------------------------------------
-- locations (sedi)
-- ---------------------------------------------------------------------------
create table if not exists public.locations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name            text not null check (length(btrim(name)) between 1 and 100),
  address         text null check (address is null or length(address) <= 300),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint locations_org_name_key unique (organization_id, name),
  constraint locations_id_org_key unique (id, organization_id)
);

-- ---------------------------------------------------------------------------
-- teams
-- ---------------------------------------------------------------------------
create table if not exists public.teams (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name            text not null check (length(btrim(name)) between 1 and 100),
  description     text null check (description is null or length(description) <= 2000),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint teams_org_name_key unique (organization_id, name),
  constraint teams_id_org_key unique (id, organization_id)
);

-- ---------------------------------------------------------------------------
-- memberships
-- ---------------------------------------------------------------------------
create table if not exists public.memberships (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- NO ACTION verso auth.users: le membership non si cancellano (si disattivano); la
  -- cancellazione di un utente passa dall'anonimizzazione (piano, fase 9).
  user_id         uuid not null references auth.users (id),
  role            public.org_role not null default 'viewer',
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- target delle FK composte (organization_id, user_id) di owner/assignee/team/sedi
  constraint memberships_org_user_key unique (organization_id, user_id)
);
create index if not exists memberships_user_org_active_idx
  on public.memberships (user_id, organization_id) where is_active;

-- ---------------------------------------------------------------------------
-- membership_locations
-- ---------------------------------------------------------------------------
create table if not exists public.membership_locations (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id         uuid not null,
  location_id     uuid not null,
  created_at      timestamptz not null default now(),
  constraint membership_locations_pkey primary key (user_id, location_id),
  -- NO ACTION (mai SET NULL): nella purge le righe spariscono con la cascata da organizations
  -- e il controllo NO ACTION, differito a fine statement, trova gia' tutto cancellato.
  constraint membership_locations_member_fkey foreign key (organization_id, user_id)
    references public.memberships (organization_id, user_id),
  constraint membership_locations_location_fkey foreign key (location_id, organization_id)
    references public.locations (id, organization_id)
);
-- my_access() cerca per (organization_id, user_id); la PK copre gia' le ricerche per user_id.
create index if not exists membership_locations_org_user_idx
  on public.membership_locations (organization_id, user_id);
create index if not exists membership_locations_location_idx
  on public.membership_locations (location_id, organization_id);

-- ---------------------------------------------------------------------------
-- team_members
-- ---------------------------------------------------------------------------
create table if not exists public.team_members (
  team_id         uuid not null,
  user_id         uuid not null,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_at      timestamptz not null default now(),
  constraint team_members_pkey primary key (team_id, user_id),
  constraint team_members_team_fkey foreign key (team_id, organization_id)
    references public.teams (id, organization_id),
  constraint team_members_member_fkey foreign key (organization_id, user_id)
    references public.memberships (organization_id, user_id)
);
create index if not exists team_members_user_idx on public.team_members (user_id);
create index if not exists team_members_org_user_idx on public.team_members (organization_id, user_id);

-- ---------------------------------------------------------------------------
-- RLS forzata subito e privilegi client revocati (policy e grant in 0005)
-- ---------------------------------------------------------------------------
alter table public.organizations        enable row level security;
alter table public.organizations        force  row level security;
alter table public.platform_admins      enable row level security;
alter table public.platform_admins      force  row level security;
alter table public.support_sessions     enable row level security;
alter table public.support_sessions     force  row level security;
alter table public.profiles             enable row level security;
alter table public.profiles             force  row level security;
alter table public.periods              enable row level security;
alter table public.periods              force  row level security;
alter table public.locations            enable row level security;
alter table public.locations            force  row level security;
alter table public.teams                enable row level security;
alter table public.teams                force  row level security;
alter table public.memberships          enable row level security;
alter table public.memberships          force  row level security;
alter table public.membership_locations enable row level security;
alter table public.membership_locations force  row level security;
alter table public.team_members         enable row level security;
alter table public.team_members         force  row level security;

revoke all on table
  public.organizations, public.platform_admins, public.support_sessions, public.profiles,
  public.periods, public.locations, public.teams, public.memberships,
  public.membership_locations, public.team_members
from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Trigger generici. Nomi con prefisso numerico: i trigger BEFORE scattano in ordine
-- alfabetico, cosi' l'ordine e' esplicito (t10 immutabilita', t20 autore, t30 date, t40 version).
-- ---------------------------------------------------------------------------
create or replace trigger t10_forbid_tenant_change before update on public.organizations
  for each row execute function private.forbid_tenant_change();
create or replace trigger t30_set_updated_at before insert or update on public.organizations
  for each row execute function private.set_updated_at();

create or replace trigger t30_set_updated_at before insert or update on public.profiles
  for each row execute function private.set_updated_at();

create or replace trigger t10_forbid_tenant_change before update on public.periods
  for each row execute function private.forbid_tenant_change();
create or replace trigger t30_set_updated_at before insert or update on public.periods
  for each row execute function private.set_updated_at();

create or replace trigger t10_forbid_tenant_change before update on public.locations
  for each row execute function private.forbid_tenant_change();
create or replace trigger t30_set_updated_at before insert or update on public.locations
  for each row execute function private.set_updated_at();

create or replace trigger t10_forbid_tenant_change before update on public.teams
  for each row execute function private.forbid_tenant_change();
create or replace trigger t30_set_updated_at before insert or update on public.teams
  for each row execute function private.set_updated_at();

create or replace trigger t10_forbid_tenant_change before update on public.memberships
  for each row execute function private.forbid_tenant_change();
create or replace trigger t30_set_updated_at before insert or update on public.memberships
  for each row execute function private.set_updated_at();

create or replace trigger t10_forbid_tenant_change before update on public.membership_locations
  for each row execute function private.forbid_tenant_change();

create or replace trigger t10_forbid_tenant_change before update on public.team_members
  for each row execute function private.forbid_tenant_change();

-- ---------------------------------------------------------------------------
-- Regola dell'ultimo Admin, applicata nel database
-- ---------------------------------------------------------------------------
-- Rifiuta update/delete che lascerebbero l'organizzazione senza Admin attivi. Vale ANCHE per
-- service_role: e' proprio la garanzia su cui conta la Edge Function admin-update-member.
-- Unica eccezione: l'organizzazione non esiste piu' (purge = DELETE su organizations a
-- cascata; nella stessa transazione la riga padre risulta gia' cancellata quando la cascata
-- arriva alle membership).
-- Concorrenza: advisory lock per organizzazione (namespace 1002) prima del conteggio, cosi'
-- due declassamenti simultanei di due Admin diversi non passano entrambi. In READ COMMITTED
-- la query successiva al lock usa uno snapshot nuovo e vede il commit dell'altra transazione.
-- SECURITY DEFINER: deve contare tutte le membership, indipendentemente dalla RLS.
create or replace function private.memberships_keep_last_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- La riga non era un Admin attivo: nulla da verificare.
  if not (old.role = 'admin' and old.is_active) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  -- Resta Admin attivo nella stessa organizzazione: ok.
  if tg_op = 'UPDATE'
     and new.role = 'admin' and new.is_active
     and new.organization_id = old.organization_id then
    return new;
  end if;
  -- Purge del tenant: l'organizzazione e' gia' stata cancellata.
  if not exists (select 1 from public.organizations o where o.id = old.organization_id) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  perform pg_advisory_xact_lock(1002, hashtext(old.organization_id::text));

  if not exists (
    select 1
      from public.memberships m
     where m.organization_id = old.organization_id
       and m.role = 'admin'
       and m.is_active
       and m.id <> old.id
  ) then
    raise exception 'L''organizzazione resterebbe senza un Admin attivo'
      using errcode = 'P0001', hint = 'last_admin';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke execute on function private.memberships_keep_last_admin() from public, anon, authenticated;

create or replace trigger t15_keep_last_admin before update or delete on public.memberships
  for each row execute function private.memberships_keep_last_admin();

-- ---------------------------------------------------------------------------
-- Profilo creato alla nascita dell'utente in auth.users
-- ---------------------------------------------------------------------------
-- Minimale e NON deve mai fallire: un errore qui bloccherebbe creazione utenti e inviti.
-- Qualunque errore diventa un WARNING (il profilo mancante si recupera dopo).
-- Metadati attesi dall'invito: first_name, last_name, locale ('it'|'en').
create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    insert into public.profiles (id, email, first_name, last_name, locale)
    values (
      new.id,
      new.email,
      nullif(left(btrim(new.raw_user_meta_data ->> 'first_name'), 100), ''),
      nullif(left(btrim(new.raw_user_meta_data ->> 'last_name'), 100), ''),
      case when new.raw_user_meta_data ->> 'locale' in ('it', 'en')
           then new.raw_user_meta_data ->> 'locale' else 'it' end
    )
    on conflict (id) do nothing;
  exception when others then
    raise warning 'handle_new_auth_user: profilo non creato per %: % (%)', new.id, sqlerrm, sqlstate;
  end;
  return new;
end;
$$;
revoke execute on function private.handle_new_auth_user() from public, anon, authenticated;

-- Mantiene profiles.email allineata ad auth.users (stesse garanzie: mai fallire).
create or replace function private.handle_auth_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    update public.profiles set email = new.email where id = new.id;
  exception when others then
    raise warning 'handle_auth_user_email_change: email non allineata per %: % (%)', new.id, sqlerrm, sqlstate;
  end;
  return new;
end;
$$;
revoke execute on function private.handle_auth_user_email_change() from public, anon, authenticated;

drop trigger if exists okr_on_auth_user_created on auth.users;
create trigger okr_on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_auth_user();

drop trigger if exists okr_on_auth_user_email_updated on auth.users;
create trigger okr_on_auth_user_email_updated
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function private.handle_auth_user_email_change();
