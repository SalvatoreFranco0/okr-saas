-- 0010: dashboard_stats con i filtri della dashboard (piano 5.8 / fase 6: periodo, sede, team).
--
-- Sostituisce public.dashboard_stats(p_org uuid, p_period uuid default null) della 0007 con
-- public.dashboard_stats(p_org, p_period, p_location, p_team), tutti i filtri default null
-- (null = nessun filtro). Stessa forma del JSON: total, avg_progress, by_status, latest, critical.
--
-- Retrocompatibilita': le chiamate esistenti dashboard_stats(org) e dashboard_stats(org, period)
-- (posizionali o con argomenti nominati, come fa PostgREST) risolvono sulla nuova firma grazie ai
-- default. La vecchia firma (uuid, uuid) viene eliminata PRIMA di creare la nuova: le due insieme
-- renderebbero ambigue le chiamate con 1 o 2 argomenti (errore 42725).
--
-- Sicurezza invariata: SECURITY INVOKER (eredita la RLS di okrs del chiamante), search_path
-- vuoto, nessuna security definer. p_org, p_period, p_location e p_team non sono
-- autorizzazioni: restringono soltanto le righe che la RLS lascia gia' vedere.
-- Filtro su location_id/team_id per uguaglianza: con un filtro attivo gli OKR senza sede
-- (o senza team) restano esclusi.

drop function if exists public.dashboard_stats(uuid, uuid);

create or replace function public.dashboard_stats(
  p_org      uuid,
  p_period   uuid default null,
  p_location uuid default null,
  p_team     uuid default null
)
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
       and (p_period   is null or o.period_id   = p_period)
       and (p_location is null or o.location_id = p_location)
       and (p_team     is null or o.team_id     = p_team)
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
revoke execute on function public.dashboard_stats(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.dashboard_stats(uuid, uuid, uuid, uuid) to authenticated;
