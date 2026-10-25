-- 0003: dominio OKR (piano 5.4).
-- Tabelle: okrs, key_results, actions, okr_alignments, okr_progress_history, key_result_updates.
-- Trigger generici (immutabilita', autore, date, version) e anti-ciclo degli allineamenti.
--
-- Spostati in 0004 per ordine di dipendenza (servono my_access/role_of definite li'):
--   * blocco periodi chiusi (private.enforce_open_period);
--   * blocco di progress_percentage, ricalcolo avanzamento, key_result_updates.
--
-- FK: composte con organization_id (5.1). Cascade SOLO lungo okrs -> key_results -> actions
-- e verso okrs per allineamenti/storici (la cancellazione fisica di un OKR avviene solo nella
-- purge del tenant); tutto il resto e' NO ACTION. Mai SET NULL sulle chiavi composte.
-- created_by/updated_by: uuid tecnici senza FK (il super-admin in supporto non e' membro e un
-- ON DELETE SET NULL verso auth.users violerebbe l'immutabilita' di created_by).

-- ---------------------------------------------------------------------------
-- okrs
-- ---------------------------------------------------------------------------
create table if not exists public.okrs (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  period_id           uuid not null,
  location_id         uuid null,
  team_id             uuid null,
  owner_id            uuid not null,
  title               text not null check (length(btrim(title)) between 1 and 300),
  description         text null check (description is null or length(description) <= 5000),
  objective           text not null check (length(btrim(objective)) between 1 and 2000),
  start_date          date null,
  end_date            date null,
  status              public.okr_status not null default 'in_pianificazione',
  progress_percentage numeric(5,1) not null default 0
                      check (progress_percentage between 0 and 100),
  priority            public.priority not null default 'media',
  tags                text[] not null default '{}',
  notes               text null check (notes is null or length(notes) <= 5000),
  version             integer not null default 1,
  created_by          uuid null,
  updated_by          uuid null,
  deleted_at          timestamptz null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint okrs_id_org_key unique (id, organization_id),
  constraint okrs_dates_check check (end_date >= start_date),
  constraint okrs_period_fkey foreign key (period_id, organization_id)
    references public.periods (id, organization_id),
  -- MATCH SIMPLE: con location_id/team_id null la FK non si applica (OKR di organizzazione).
  constraint okrs_location_fkey foreign key (location_id, organization_id)
    references public.locations (id, organization_id),
  constraint okrs_team_fkey foreign key (team_id, organization_id)
    references public.teams (id, organization_id),
  constraint okrs_owner_fkey foreign key (organization_id, owner_id)
    references public.memberships (organization_id, user_id)
);

create index if not exists okrs_org_status_idx on public.okrs (organization_id, status) where deleted_at is null;
create index if not exists okrs_org_location_idx on public.okrs (organization_id, location_id);
create index if not exists okrs_org_team_idx on public.okrs (organization_id, team_id);
create index if not exists okrs_org_period_idx on public.okrs (organization_id, period_id);
create index if not exists okrs_owner_idx on public.okrs (owner_id);
create index if not exists okrs_tags_gin_idx on public.okrs using gin (tags);
-- gin_trgm_ops non qualificato: pg_trgm puo' stare in public o in extensions a seconda di come
-- e' stata creata; il search_path delle migrazioni Supabase include entrambi.
create index if not exists okrs_search_trgm_idx on public.okrs
  using gin (lower(title || ' ' || coalesce(description, '')) gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- key_results
-- ---------------------------------------------------------------------------
create table if not exists public.key_results (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  okr_id          uuid not null,
  title           text not null check (length(btrim(title)) between 1 and 300),
  description     text null check (description is null or length(description) <= 5000),
  initial_metric  numeric not null default 0,
  target_metric   numeric not null,
  current_metric  numeric not null default 0,
  unit            text not null default '%' check (length(unit) <= 30),
  weight          numeric not null default 100 check (weight >= 0),
  status          public.kr_status not null default 'non_iniziato',
  last_updated_at timestamptz null,
  version         integer not null default 1,
  created_by      uuid null,
  updated_by      uuid null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint key_results_id_org_key unique (id, organization_id),
  constraint key_results_okr_fkey foreign key (okr_id, organization_id)
    references public.okrs (id, organization_id) on delete cascade
);
create index if not exists key_results_okr_idx on public.key_results (okr_id);
create index if not exists key_results_org_idx on public.key_results (organization_id, okr_id);

-- ---------------------------------------------------------------------------
-- actions
-- ---------------------------------------------------------------------------
create table if not exists public.actions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  key_result_id   uuid not null,
  title           text not null check (length(btrim(title)) between 1 and 300),
  description     text null check (description is null or length(description) <= 5000),
  due_date        date null,
  assignee_id     uuid null,
  is_completed    boolean not null default false,
  version         integer not null default 1,
  created_by      uuid null,
  updated_by      uuid null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint actions_id_org_key unique (id, organization_id),
  constraint actions_key_result_fkey foreign key (key_result_id, organization_id)
    references public.key_results (id, organization_id) on delete cascade,
  constraint actions_assignee_fkey foreign key (organization_id, assignee_id)
    references public.memberships (organization_id, user_id)
);
create index if not exists actions_key_result_idx on public.actions (key_result_id);
create index if not exists actions_org_assignee_idx on public.actions (organization_id, assignee_id);

-- ---------------------------------------------------------------------------
-- okr_alignments
-- ---------------------------------------------------------------------------
create table if not exists public.okr_alignments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  parent_okr_id   uuid not null,
  child_okr_id    uuid not null,
  created_by      uuid null,
  updated_by      uuid null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint okr_alignments_pair_key unique (parent_okr_id, child_okr_id),
  constraint okr_alignments_no_self check (parent_okr_id <> child_okr_id),
  constraint okr_alignments_parent_fkey foreign key (parent_okr_id, organization_id)
    references public.okrs (id, organization_id) on delete cascade,
  constraint okr_alignments_child_fkey foreign key (child_okr_id, organization_id)
    references public.okrs (id, organization_id) on delete cascade
);
create index if not exists okr_alignments_org_child_idx on public.okr_alignments (organization_id, child_okr_id);
create index if not exists okr_alignments_child_idx on public.okr_alignments (child_okr_id);

-- ---------------------------------------------------------------------------
-- okr_progress_history: una riga per OKR per giorno, scritta solo da recalc_okr_progress
-- ---------------------------------------------------------------------------
create table if not exists public.okr_progress_history (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  okr_id              uuid not null,
  progress_percentage numeric(5,1) not null check (progress_percentage between 0 and 100),
  recorded_on         date not null,
  recorded_at         timestamptz not null default now(),
  constraint okr_progress_history_day_key unique (okr_id, recorded_on),
  constraint okr_progress_history_okr_fkey foreign key (okr_id, organization_id)
    references public.okrs (id, organization_id) on delete cascade
);
create index if not exists okr_progress_history_org_idx on public.okr_progress_history (organization_id, recorded_on);

-- ---------------------------------------------------------------------------
-- key_result_updates: check-in, scritta solo dal trigger su key_results (0004)
-- ---------------------------------------------------------------------------
create table if not exists public.key_result_updates (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  key_result_id   uuid not null,
  old_value       numeric null,
  new_value       numeric null,
  note            text null check (note is null or length(note) <= 2000),
  -- uuid tecnico senza FK: puo' essere un super-admin in supporto o null (backend).
  user_id         uuid null,
  created_at      timestamptz not null default now(),
  constraint key_result_updates_kr_fkey foreign key (key_result_id, organization_id)
    references public.key_results (id, organization_id) on delete cascade
);
create index if not exists key_result_updates_kr_idx on public.key_result_updates (key_result_id, created_at desc);
create index if not exists key_result_updates_org_idx on public.key_result_updates (organization_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS forzata subito e privilegi client revocati (policy e grant in 0005)
-- ---------------------------------------------------------------------------
alter table public.okrs                 enable row level security;
alter table public.okrs                 force  row level security;
alter table public.key_results          enable row level security;
alter table public.key_results          force  row level security;
alter table public.actions              enable row level security;
alter table public.actions              force  row level security;
alter table public.okr_alignments       enable row level security;
alter table public.okr_alignments       force  row level security;
alter table public.okr_progress_history enable row level security;
alter table public.okr_progress_history force  row level security;
alter table public.key_result_updates   enable row level security;
alter table public.key_result_updates   force  row level security;

revoke all on table
  public.okrs, public.key_results, public.actions, public.okr_alignments,
  public.okr_progress_history, public.key_result_updates
from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Trigger generici
-- ---------------------------------------------------------------------------
create or replace trigger t10_forbid_tenant_change before update on public.okrs
  for each row execute function private.forbid_tenant_change();
create or replace trigger t20_set_actor_columns before insert or update on public.okrs
  for each row execute function private.set_actor_columns();
create or replace trigger t30_set_updated_at before insert or update on public.okrs
  for each row execute function private.set_updated_at();
create or replace trigger t40_bump_version before insert or update on public.okrs
  for each row execute function private.bump_version();

create or replace trigger t10_forbid_tenant_change before update on public.key_results
  for each row execute function private.forbid_tenant_change();
create or replace trigger t20_set_actor_columns before insert or update on public.key_results
  for each row execute function private.set_actor_columns();
create or replace trigger t30_set_updated_at before insert or update on public.key_results
  for each row execute function private.set_updated_at();
create or replace trigger t40_bump_version before insert or update on public.key_results
  for each row execute function private.bump_version();

create or replace trigger t10_forbid_tenant_change before update on public.actions
  for each row execute function private.forbid_tenant_change();
create or replace trigger t20_set_actor_columns before insert or update on public.actions
  for each row execute function private.set_actor_columns();
create or replace trigger t30_set_updated_at before insert or update on public.actions
  for each row execute function private.set_updated_at();
create or replace trigger t40_bump_version before insert or update on public.actions
  for each row execute function private.bump_version();

create or replace trigger t10_forbid_tenant_change before update on public.okr_alignments
  for each row execute function private.forbid_tenant_change();
create or replace trigger t20_set_actor_columns before insert or update on public.okr_alignments
  for each row execute function private.set_actor_columns();
create or replace trigger t30_set_updated_at before insert or update on public.okr_alignments
  for each row execute function private.set_updated_at();

-- Lo storico viene aggiornato (upsert) dal ricalcolo: l'immutabilita' protegge okr_id/org.
create or replace trigger t10_forbid_tenant_change before update on public.okr_progress_history
  for each row execute function private.forbid_tenant_change();

-- ---------------------------------------------------------------------------
-- Anti-ciclo sugli allineamenti
-- ---------------------------------------------------------------------------
-- Un OKR non puo' diventare discendente di se stesso: inserire parent -> child e' vietato se
-- parent e' gia' raggiungibile scendendo da child.
-- * Advisory lock di transazione per organizzazione (namespace 1001, chiave hashtext(org))
--   PRIMA della visita: serializza due transazioni concorrenti (A->B e B->A) che,
--   singolarmente, non vedrebbero il ciclo. Dopo il lock, in READ COMMITTED la query
--   successiva usa uno snapshot nuovo e vede l'arco gia' committato dall'altra.
--   La forma a due chiavi evita collisioni con altri advisory lock basati sull'org.
-- * SECURITY DEFINER: la visita deve vedere TUTTI gli archi, anche quelli tra OKR che
--   l'utente non puo' leggere per RLS, altrimenti un ciclo potrebbe chiudersi "di nascosto".
-- * UNION (non UNION ALL) rende la ricorsione finita anche su dati inattesi.
-- * In update si esclude l'arco che si sta modificando (new.id) dalla visita.
create or replace function private.okr_alignments_prevent_cycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(1001, hashtext(new.organization_id::text));

  if exists (
    with recursive descendants (okr_id) as (
      select a.child_okr_id
        from public.okr_alignments a
       where a.parent_okr_id = new.child_okr_id
         and a.id <> new.id
      union
      select a.child_okr_id
        from public.okr_alignments a
        join descendants d on a.parent_okr_id = d.okr_id
       where a.id <> new.id
    )
    select 1 from descendants where okr_id = new.parent_okr_id
  ) then
    raise exception 'Allineamento non valido: creerebbe un ciclo tra OKR'
      using errcode = '23514', hint = 'alignment_cycle';
  end if;

  return new;
end;
$$;
revoke execute on function private.okr_alignments_prevent_cycle() from public, anon, authenticated;

create or replace trigger t50_prevent_cycle
  before insert or update of parent_okr_id, child_okr_id on public.okr_alignments
  for each row execute function private.okr_alignments_prevent_cycle();
