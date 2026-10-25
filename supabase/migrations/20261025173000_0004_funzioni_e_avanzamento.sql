-- 0004: funzioni di supporto alle policy e calcolo avanzamento (piano 5.5).
-- Contiene anche il blocco dei periodi chiusi (piano 5.4), spostato qui perche' dipende da
-- my_access()/role_of().
--
-- Regole:
-- * Le funzioni che leggono tabelle sono SECURITY DEFINER con search_path vuoto: leggono
--   bypassando la RLS (il proprietario postgres ha BYPASSRLS su Supabase), quindi le policy
--   che le usano non generano ricorsione.
-- * Le funzioni pure (role_of, has_location, has_team, tl_can_write_okr) non leggono tabelle
--   e restano SECURITY INVOKER. Sono STABLE e non IMMUTABLE: il cast text -> enum e auth.uid()
--   non sono immutabili.
-- * execute revocato a public/anon; concesso ad authenticated solo dove serve alle policy.

-- ---------------------------------------------------------------------------
-- Super-admin: in platform_admins E con MFA verificata (aal2)
-- ---------------------------------------------------------------------------
create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid());
$$;
revoke execute on function private.is_platform_admin() from public, anon;
grant execute on function private.is_platform_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Mappa dei permessi dell'utente corrente, da valutare UNA volta per query:
--   { "<org>": { "role": "...", "locations": [...], "teams": [...], "support": bool }, ... }
-- * Solo membership attive in organizzazioni attive (un tenant sospeso perde l'accesso).
-- * Sessione di supporto attiva (non chiusa, non scaduta) di un super-admin con aal2:
--   ruolo 'admin', support = true, nessun vincolo di sede/team. Prevale sulla membership.
-- ---------------------------------------------------------------------------
create or replace function private.my_access()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with support as (
    select distinct s.organization_id
      from public.support_sessions s
     where s.platform_admin_id = auth.uid()
       and s.ended_at is null
       and s.started_at <= now()
       and s.expires_at > now()
       and private.is_platform_admin()
  ),
  member as (
    select m.organization_id,
           m.role,
           coalesce((select jsonb_agg(ml.location_id)
                       from public.membership_locations ml
                      where ml.organization_id = m.organization_id
                        and ml.user_id = m.user_id), '[]'::jsonb) as locations,
           coalesce((select jsonb_agg(tm.team_id)
                       from public.team_members tm
                      where tm.organization_id = m.organization_id
                        and tm.user_id = m.user_id), '[]'::jsonb) as teams
      from public.memberships m
      join public.organizations o on o.id = m.organization_id
     where m.user_id = auth.uid()
       and m.is_active
       and o.is_active
       and m.organization_id not in (select organization_id from support)
  )
  select coalesce(jsonb_object_agg(x.org, x.val), '{}'::jsonb)
    from (
      select organization_id::text as org,
             jsonb_build_object('role', role, 'locations', locations, 'teams', teams, 'support', false) as val
        from member
      union all
      select organization_id::text,
             jsonb_build_object('role', 'admin', 'locations', '[]'::jsonb, 'teams', '[]'::jsonb, 'support', true)
        from support
    ) x;
$$;
revoke execute on function private.my_access() from public, anon;
grant execute on function private.my_access() to authenticated;

-- ---------------------------------------------------------------------------
-- Funzioni pure sulla mappa (nessun accesso a tabelle)
-- ---------------------------------------------------------------------------
create or replace function private.role_of(access jsonb, org uuid)
returns public.org_role
language sql
stable
set search_path = ''
as $$
  select (access -> (org::text) ->> 'role')::public.org_role;
$$;
revoke execute on function private.role_of(jsonb, uuid) from public, anon;
grant execute on function private.role_of(jsonb, uuid) to authenticated;

create or replace function private.has_location(access jsonb, org uuid, loc uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(((access -> (org::text)) -> 'locations') ? (loc::text), false);
$$;
revoke execute on function private.has_location(jsonb, uuid, uuid) from public, anon;
grant execute on function private.has_location(jsonb, uuid, uuid) to authenticated;

create or replace function private.has_team(access jsonb, org uuid, tm uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(((access -> (org::text)) -> 'teams') ? (tm::text), false);
$$;
revoke execute on function private.has_team(jsonb, uuid, uuid) from public, anon;
grant execute on function private.has_team(jsonb, uuid, uuid) to authenticated;

-- Regola di modifica di un OKR per il Team Lead (matrice 5.6): OKR proprio o del proprio
-- team, con sede tra le proprie. Gli OKR senza sede sono solo di Admin/Manager.
-- Il periodo aperto e' garantito dal trigger enforce_open_period; deleted_at dalle policy.
create or replace function private.tl_can_write_okr(access jsonb, org uuid, p_owner uuid, p_team uuid, p_loc uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
           private.role_of(access, org) = 'team_lead'
           and p_loc is not null
           and private.has_location(access, org, p_loc)
           and (p_owner = auth.uid()
                or (p_team is not null and private.has_team(access, org, p_team))),
           false);
$$;
revoke execute on function private.tl_can_write_okr(jsonb, uuid, uuid, uuid, uuid) from public, anon;
grant execute on function private.tl_can_write_okr(jsonb, uuid, uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Permesso di modifica dell'OKR padre (usata da policy di KR, Azioni, Allineamenti).
-- Legge la riga dell'OKR bypassando la RLS. Admin/Manager: sempre (anche OKR eliminati).
-- Team Lead: tl_can_write_okr e OKR non eliminato. Viewer: mai.
-- ---------------------------------------------------------------------------
create or replace function private.can_edit_okr(p_org uuid, p_okr uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_access jsonb;
  v_role   public.org_role;
  v_okr    record;
begin
  if p_org is null or p_okr is null then
    return false;
  end if;
  v_access := private.my_access();
  v_role := private.role_of(v_access, p_org);
  if v_role is null or v_role = 'viewer' then
    return false;
  end if;

  select k.owner_id, k.team_id, k.location_id, k.deleted_at
    into v_okr
    from public.okrs k
   where k.id = p_okr and k.organization_id = p_org;
  if not found then
    return false;
  end if;

  if v_role in ('admin', 'manager_okr') then
    return true;
  end if;
  return v_okr.deleted_at is null
     and private.tl_can_write_okr(v_access, p_org, v_okr.owner_id, v_okr.team_id, v_okr.location_id);
end;
$$;
revoke execute on function private.can_edit_okr(uuid, uuid) from public, anon;
grant execute on function private.can_edit_okr(uuid, uuid) to authenticated;

-- Come can_edit_okr, partendo da un Key Result (policy delle Azioni).
create or replace function private.can_edit_kr(p_org uuid, p_kr uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select private.can_edit_okr(p_org, k.okr_id)
       from public.key_results k
      where k.id = p_kr and k.organization_id = p_org),
    false);
$$;
revoke execute on function private.can_edit_kr(uuid, uuid) from public, anon;
grant execute on function private.can_edit_kr(uuid, uuid) to authenticated;

-- Utenti visibili nei profili: membri (attivi o no) delle organizzazioni a cui ho accesso.
-- Restituisce un insieme valutato una volta per query (niente parametri forgiabili).
create or replace function private.org_peer_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct m.user_id
    from public.memberships m
   where (select private.my_access()) ? (m.organization_id::text);
$$;
revoke execute on function private.org_peer_ids() from public, anon;
grant execute on function private.org_peer_ids() to authenticated;

-- ---------------------------------------------------------------------------
-- Blocco periodi chiusi (piano 5.4)
-- ---------------------------------------------------------------------------
-- Su okrs, key_results, actions, okr_alignments: rifiuta insert/update/delete se l'OKR
-- coinvolto (vecchio o nuovo, per gli spostamenti) e' in un periodo chiuso, salvo Admin/
-- Manager OKR (inclusa la sessione di supporto) e backend fidato (seed, purge del tenant).
-- Il DELETE e' coperto in piu' rispetto al piano: togliere un KR/Azione da un periodo
-- chiuso equivale a modificarlo.
create or replace function private.enforce_open_period()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new     jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_old     jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_org     uuid  := coalesce(v_new ->> 'organization_id', v_old ->> 'organization_id')::uuid;
  v_role    public.org_role;
  v_okrs    uuid[];
  v_periods uuid[];
  v_closed  boolean;
begin
  if private.is_trusted_backend() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  v_role := private.role_of(private.my_access(), v_org);
  if v_role in ('admin', 'manager_okr') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_table_name = 'okrs' then
    v_periods := array[(v_new ->> 'period_id')::uuid, (v_old ->> 'period_id')::uuid];
  elsif tg_table_name = 'key_results' then
    v_okrs := array[(v_new ->> 'okr_id')::uuid, (v_old ->> 'okr_id')::uuid];
  elsif tg_table_name = 'actions' then
    select array_agg(k.okr_id) into v_okrs
      from public.key_results k
     where k.organization_id = v_org
       and k.id in ((v_new ->> 'key_result_id')::uuid, (v_old ->> 'key_result_id')::uuid);
  elsif tg_table_name = 'okr_alignments' then
    v_okrs := array[(v_new ->> 'parent_okr_id')::uuid, (v_new ->> 'child_okr_id')::uuid,
                    (v_old ->> 'parent_okr_id')::uuid, (v_old ->> 'child_okr_id')::uuid];
  else
    raise exception 'enforce_open_period: tabella % non gestita', tg_table_name;
  end if;

  if v_okrs is not null then
    select array_agg(k.period_id) into v_periods
      from public.okrs k
     where k.organization_id = v_org and k.id = any (v_okrs);
  end if;

  select exists (
    select 1 from public.periods p
     where p.organization_id = v_org and p.id = any (v_periods) and p.is_closed
  ) into v_closed;

  if v_closed then
    raise exception 'Il periodo e'' chiuso: modifica consentita solo ad Admin e Manager OKR'
      using errcode = '42501', hint = 'period_closed';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke execute on function private.enforce_open_period() from public, anon, authenticated;

create or replace trigger t05_enforce_open_period before insert or update or delete on public.okrs
  for each row execute function private.enforce_open_period();
create or replace trigger t05_enforce_open_period before insert or update or delete on public.key_results
  for each row execute function private.enforce_open_period();
create or replace trigger t05_enforce_open_period before insert or update or delete on public.actions
  for each row execute function private.enforce_open_period();
create or replace trigger t05_enforce_open_period before insert or update or delete on public.okr_alignments
  for each row execute function private.enforce_open_period();

-- ---------------------------------------------------------------------------
-- Ricalcolo avanzamento (formula in docs/calcolo_avanzamento.md; le Azioni non influiscono)
-- ---------------------------------------------------------------------------
-- KR: (current - initial) / (target - initial) * 100 limitato a 0..100 (vale anche per
-- metriche decrescenti); se target = initial: 100 se current >= target, altrimenti 0.
-- OKR: media pesata, 0 senza KR o con somma pesi 0, arrotondata a 1 decimale.
-- Il lock di riga sull'OKR serializza ricalcoli concorrenti. Se l'OKR non esiste piu'
-- (cancellazione fisica nella purge) non fa nulla.
-- Storico: data del giorno in UTC (scelta deterministica, indipendente dal client).
-- Nessun grant ai ruoli client: si usa solo dai trigger.
create or replace function private.recalc_okr_progress(p_okr uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_pct numeric(5,1);
begin
  select k.organization_id into v_org
    from public.okrs k
   where k.id = p_okr
     for update;
  if not found then
    return;
  end if;

  select coalesce(round(sum(s.pct * s.weight) / nullif(sum(s.weight), 0), 1), 0)
    into v_pct
    from (
      select kr.weight,
             case
               when kr.target_metric = kr.initial_metric then
                 case when kr.current_metric >= kr.target_metric then 100 else 0 end
               else
                 greatest(0, least(100,
                   (kr.current_metric - kr.initial_metric)
                   / (kr.target_metric - kr.initial_metric) * 100))
             end as pct
        from public.key_results kr
       where kr.okr_id = p_okr
         and kr.organization_id = v_org
    ) s;

  update public.okrs
     set progress_percentage = v_pct
   where id = p_okr
     and progress_percentage is distinct from v_pct;

  insert into public.okr_progress_history (organization_id, okr_id, progress_percentage, recorded_on, recorded_at)
  values (v_org, p_okr, v_pct, (now() at time zone 'utc')::date, now())
  on conflict (okr_id, recorded_on)
  do update set progress_percentage = excluded.progress_percentage,
                recorded_at         = excluded.recorded_at;
end;
$$;
revoke execute on function private.recalc_okr_progress(uuid) from public, anon, authenticated;

-- Trigger di STATEMENT con tabelle di transizione: un ricalcolo per OKR distinto, non per
-- riga. PostgreSQL non ammette tabelle di transizione su trigger multi-evento ne' con lista
-- di colonne, quindi tre trigger separati sulla stessa funzione, che legge solo le tabelle
-- di transizione dichiarate per l'evento corrente (plpgsql pianifica le query al primo uso,
-- quindi i rami non eseguiti non le referenziano).
-- In update ricalcola solo se cambiano okr_id, metriche o peso, sia il vecchio sia il nuovo
-- OKR (spostamento). Ordine per id: lock acquisiti sempre nello stesso ordine.
create or replace function private.key_results_recalc_stmt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_okr uuid;
begin
  if tg_op = 'INSERT' then
    for v_okr in select distinct n.okr_id from new_rows n order by 1 loop
      perform private.recalc_okr_progress(v_okr);
    end loop;
  elsif tg_op = 'UPDATE' then
    for v_okr in
      select distinct x.okr_id
        from (
          select n.okr_id, o.okr_id as old_okr_id
            from new_rows n
            join old_rows o on o.id = n.id
           where (n.okr_id, n.initial_metric, n.target_metric, n.current_metric, n.weight)
                 is distinct from
                 (o.okr_id, o.initial_metric, o.target_metric, o.current_metric, o.weight)
        ) c
        cross join lateral (values (c.okr_id), (c.old_okr_id)) as x (okr_id)
       order by 1
    loop
      perform private.recalc_okr_progress(v_okr);
    end loop;
  elsif tg_op = 'DELETE' then
    for v_okr in select distinct o.okr_id from old_rows o order by 1 loop
      perform private.recalc_okr_progress(v_okr);
    end loop;
  end if;
  return null;
end;
$$;
revoke execute on function private.key_results_recalc_stmt() from public, anon, authenticated;

create or replace trigger t80_recalc_after_insert
  after insert on public.key_results
  referencing new table as new_rows
  for each statement execute function private.key_results_recalc_stmt();
create or replace trigger t80_recalc_after_update
  after update on public.key_results
  referencing old table as old_rows new table as new_rows
  for each statement execute function private.key_results_recalc_stmt();
create or replace trigger t80_recalc_after_delete
  after delete on public.key_results
  referencing old table as old_rows
  for each statement execute function private.key_results_recalc_stmt();

-- ---------------------------------------------------------------------------
-- Check-in: last_updated_at e riga in key_result_updates quando cambia current_metric
-- ---------------------------------------------------------------------------
-- La nota arriva da app.kr_note (impostata da kr_check_in, locale alla transazione).
-- SECURITY DEFINER: i client non hanno alcun privilegio di scrittura su key_result_updates.
-- Se l'update del KR fallisce dopo (es. WITH CHECK), l'intero statement viene annullato.
create or replace function private.key_results_track_check_in()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.current_metric is distinct from old.current_metric then
    new.last_updated_at := now();
    insert into public.key_result_updates (organization_id, key_result_id, old_value, new_value, note, user_id)
    values (new.organization_id, new.id, old.current_metric, new.current_metric,
            nullif(left(current_setting('app.kr_note', true), 2000), ''),
            auth.uid());
  end if;
  return new;
end;
$$;
revoke execute on function private.key_results_track_check_in() from public, anon, authenticated;

create or replace trigger t50_track_check_in before update on public.key_results
  for each row execute function private.key_results_track_check_in();

-- Spostamento di un KR tra OKR: consentito solo se l'utente puo' modificare entrambi.
-- La policy UPDATE lo garantisce gia' (USING sul vecchio okr_id, WITH CHECK sul nuovo);
-- il trigger e' una difesa in profondita' con un messaggio chiaro.
create or replace function private.key_results_guard_move()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.okr_id is distinct from old.okr_id
     and not private.is_trusted_backend()
     and not (private.can_edit_okr(old.organization_id, old.okr_id)
              and private.can_edit_okr(new.organization_id, new.okr_id)) then
    raise exception 'Spostamento del Key Result non consentito: servono i permessi di modifica su entrambi gli OKR'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function private.key_results_guard_move() from public, anon, authenticated;

create or replace trigger t45_guard_move before update of okr_id on public.key_results
  for each row execute function private.key_results_guard_move();

-- ---------------------------------------------------------------------------
-- progress_percentage e' un dato derivato
-- ---------------------------------------------------------------------------
-- UPDATE: rifiutato se non nasce da un altro trigger (pg_trigger_depth() < 2). Il ricalcolo
-- gira dentro il trigger di statement su key_results (profondita' 1), quindi il suo UPDATE
-- su okrs fa scattare questo trigger a profondita' 2 e passa.
-- INSERT: il valore del client e' ignorato (0); lo calcolano i KR.
create or replace function private.okrs_guard_progress()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if pg_trigger_depth() < 2 then
      new.progress_percentage := 0;
    end if;
  elsif new.progress_percentage is distinct from old.progress_percentage
        and pg_trigger_depth() < 2 then
    raise exception 'progress_percentage e'' calcolato dai Key Result e non e'' modificabile'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function private.okrs_guard_progress() from public, anon, authenticated;

create or replace trigger t50_guard_progress before insert or update on public.okrs
  for each row execute function private.okrs_guard_progress();

-- ---------------------------------------------------------------------------
-- RPC di check-in usata dalla UI
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER: l'update passa dalla RLS di key_results (solo chi puo' modificare l'OKR).
-- La nota viaggia in un GUC locale alla transazione e viene azzerata subito dopo, cosi' un
-- update successivo nella stessa transazione non la eredita.
create or replace function public.kr_check_in(p_kr uuid, p_value numeric, p_note text default null)
returns public.key_results
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_kr public.key_results;
begin
  if p_value is null then
    raise exception 'Valore del check-in obbligatorio' using errcode = '22004';
  end if;

  perform set_config('app.kr_note', coalesce(left(p_note, 2000), ''), true);

  update public.key_results
     set current_metric = p_value
   where id = p_kr
  returning * into v_kr;

  perform set_config('app.kr_note', '', true);

  -- FOUND e' alterato da PERFORM: si controlla il record.
  if v_kr.id is null then
    raise exception 'Key Result inesistente o non modificabile' using errcode = '42501';
  end if;
  return v_kr;
end;
$$;
revoke execute on function public.kr_check_in(uuid, numeric, text) from public, anon;
grant execute on function public.kr_check_in(uuid, numeric, text) to authenticated;
