-- 0007: viste e RPC per dashboard e report (piano 5.8).
-- Tutte SECURITY INVOKER: ereditano la RLS di chi chiama. Nessuna funzione security definer.
-- Il parametro p_org non e' mai un'autorizzazione: filtra soltanto; l'accesso lo decide la RLS.

-- ---------------------------------------------------------------------------
-- v_okr_summary: conteggi per stato, priorita', periodo, sede, team
-- ---------------------------------------------------------------------------
create or replace view public.v_okr_summary with (security_invoker = true) as
select o.organization_id,
       o.period_id,
       o.location_id,
       o.team_id,
       o.status,
       o.priority,
       count(*)                           as okr_count,
       round(avg(o.progress_percentage), 1) as avg_progress
  from public.okrs o
 where o.deleted_at is null
 group by o.organization_id, o.period_id, o.location_id, o.team_id, o.status, o.priority;

-- ---------------------------------------------------------------------------
-- v_okr_at_risk: OKR attivi con un KR at_risk, oppure in scadenza entro 14 giorni
-- con avanzamento basso (< 50%)
-- ---------------------------------------------------------------------------
create or replace view public.v_okr_at_risk with (security_invoker = true) as
select o.organization_id,
       o.id as okr_id,
       o.title,
       o.owner_id,
       o.period_id,
       o.location_id,
       o.team_id,
       o.priority,
       o.progress_percentage,
       o.end_date,
       exists (select 1 from public.key_results k
                where k.okr_id = o.id
                  and k.organization_id = o.organization_id
                  and k.status = 'at_risk')                                   as has_at_risk_kr,
       (o.end_date is not null
        and o.end_date <= current_date + 14
        and o.progress_percentage < 50)                                       as due_soon_low_progress
  from public.okrs o
 where o.deleted_at is null
   and o.status = 'attivo'
   and (
        exists (select 1 from public.key_results k
                 where k.okr_id = o.id
                   and k.organization_id = o.organization_id
                   and k.status = 'at_risk')
        or (o.end_date is not null
            and o.end_date <= current_date + 14
            and o.progress_percentage < 50)
   );

-- ---------------------------------------------------------------------------
-- v_org_members: membri con ruolo, sedi, stato, email e nome (tabella utenti della UI)
-- La visibilita' segue la RLS di memberships/profiles: Admin e Manager vedono tutti,
-- gli altri ruoli solo se stessi.
-- ---------------------------------------------------------------------------
create or replace view public.v_org_members with (security_invoker = true) as
select m.organization_id,
       m.user_id,
       m.role,
       m.is_active,
       p.email,
       p.first_name,
       p.last_name,
       coalesce(
         (select array_agg(ml.location_id order by ml.location_id)
            from public.membership_locations ml
           where ml.organization_id = m.organization_id
             and ml.user_id = m.user_id),
         '{}'::uuid[])                                  as location_ids
  from public.memberships m
  left join public.profiles p on p.id = m.user_id;

-- ---------------------------------------------------------------------------
-- dashboard_stats: totali, avanzamento medio, OKR per stato, ultimi 5 aggiornati, critici
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_stats(p_org uuid, p_period uuid default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with base as (
    select o.*
      from public.okrs o
     where o.organization_id = p_org
       and o.deleted_at is null
       and (p_period is null or o.period_id = p_period)
  )
  select jsonb_build_object(
    'total',        (select count(*) from base),
    'avg_progress', (select coalesce(round(avg(progress_percentage), 1), 0) from base),
    'by_status',    (select coalesce(jsonb_object_agg(s.status, s.n), '{}'::jsonb)
                       from (select status, count(*) as n from base group by status) s),
    'latest',       (select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb)
                       from (select id, title, status, priority, progress_percentage, updated_at
                               from base order by updated_at desc limit 5) l),
    'critical',     (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
                       from (select id, title, status, progress_percentage, end_date
                               from base
                              where priority = 'critica'
                                and status not in ('completato', 'non_raggiunto')
                              order by end_date nulls last, updated_at desc
                              limit 10) c)
  );
$$;
revoke execute on function public.dashboard_stats(uuid, uuid) from public, anon;
grant execute on function public.dashboard_stats(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Privilegi: nessuno ad anon; lettura ad authenticated (la RLS sottostante decide cosa vede)
-- ---------------------------------------------------------------------------
revoke all on public.v_okr_summary, public.v_okr_at_risk, public.v_org_members from anon, authenticated;
grant select on public.v_okr_summary, public.v_okr_at_risk, public.v_org_members to authenticated;
