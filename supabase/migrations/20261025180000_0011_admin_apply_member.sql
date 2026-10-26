-- 0011: applicazione atomica delle modifiche a una membership (funzioni admin).
-- Retrocompatibile (solo un oggetto nuovo) e idempotente (create or replace).
--
-- public.admin_apply_member(p_org, p_user, p_role, p_is_active, p_location_ids, p_actor)
-- La usano SOLO le Edge Functions admin (service_role): ruolo, stato e sedi di un membro in
-- un'unica chiamata, quindi in un'unica transazione (niente membership aggiornata con le sedi
-- vecchie se l'insert delle sedi fallisce).
--
-- Sicurezza:
-- * SECURITY INVOKER, search_path vuoto: in public non esistono security definer (controllo
--   in 00_inventory). Gira con i privilegi del chiamante; service_role ha BYPASSRLS su
--   Supabase, quindi la RLS forzata di memberships/membership_locations non lo blocca.
-- * execute revocato a public, anon e authenticated e concesso SOLO a service_role: per i
--   client la funzione non esiste come RPC (PostgREST risponde 42501/404). L'autorizzazione
--   ("il chiamante e' Admin di p_org", rate limit, audit applicativo) e' compito della Edge
--   Function: qui p_actor e' un dato dichiarato dal backend, non un'identita' verificata, e
--   serve solo alla regola anti-auto-modifica.
-- * I trigger esistenti restano in vigore: t15_keep_last_admin (ultimo Admin, hint
--   'last_admin', errcode P0001) scatta anche per service_role e NON viene duplicato ne'
--   aggirato qui; t90_audit registra le righe cambiate (con user_id nullo, perche' sotto
--   service_role auth.uid() e' nullo: l'autore lo registra la Edge Function).
--
-- Comportamento:
-- * Upsert su memberships (conflitto organization_id, user_id): aggiorna role e is_active.
--   L'update avviene solo se qualcosa cambia, cosi' una chiamata ripetuta non tocca la riga
--   (ne' updated_at ne' audit).
-- * p_location_ids null: sedi invariate. Non null: diventano esattamente quelle indicate
--   (deduplicate; array vuoto = nessuna sede). La sostituzione e' differenziale (delete delle
--   sedi non piu' presenti + insert delle mancanti): stesso risultato di delete + insert
--   completi, ma idempotente anche per l'audit.
-- * Sedi di un'altra organizzazione o inesistenti: falliscono per la FK composta
--   membership_locations_location_fkey (location_id, organization_id) con errcode 23503.
--   Volutamente nessun controllo duplicato qui: la garanzia e' il vincolo del database.
-- * p_user senza utente in auth.users: 23503 dalla FK memberships.user_id.
--
-- Errori (tutta la chiamata viene annullata):
-- * 22004  parametro obbligatorio nullo (p_org, p_user, p_role, p_is_active) o sede nulla
--          nell'array.
-- * P0002  organizzazione inesistente (hint 'org_not_found') o disattivata (hint
--          'org_inactive'). P0002 = no_data_found: "il bersaglio non c'e'", distinto dai
--          divieti (42501) cosi' la Edge Function lo mappa su 404.
-- * 42501  hint 'self_change': p_actor = p_user e la chiamata cambierebbe il proprio ruolo o
--          disattiverebbe la propria membership esistente. Modificare le proprie sedi resta
--          consentito. Con p_actor nullo (procedure di backend) la regola non si applica.
-- * P0001  hint 'last_admin' dal trigger t15_keep_last_admin.
-- * 23503  sede di un'altra organizzazione / inesistente, utente inesistente.

create or replace function public.admin_apply_member(
  p_org          uuid,
  p_user         uuid,
  p_role         public.org_role,
  p_is_active    boolean,
  p_location_ids uuid[] default null,
  p_actor        uuid default null
)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_org_active boolean;
  v_cur_role   public.org_role;
  v_exists     boolean := false;
begin
  if p_org is null or p_user is null or p_role is null or p_is_active is null then
    raise exception 'p_org, p_user, p_role e p_is_active sono obbligatori'
      using errcode = '22004';
  end if;
  if p_location_ids is not null and array_position(p_location_ids, null) is not null then
    raise exception 'p_location_ids non puo'' contenere valori nulli'
      using errcode = '22004';
  end if;

  -- Organizzazione esistente e attiva. FOR SHARE: una disattivazione concorrente aspetta la
  -- fine di questa transazione invece di passare in mezzo.
  select o.is_active into v_org_active
    from public.organizations o
   where o.id = p_org
     for share;
  if not found then
    raise exception 'Organizzazione inesistente' using errcode = 'P0002', hint = 'org_not_found';
  end if;
  if not v_org_active then
    raise exception 'Organizzazione disattivata' using errcode = 'P0002', hint = 'org_inactive';
  end if;

  -- Stato attuale della membership, bloccato fino a fine transazione: il controllo
  -- anti-auto-modifica e l'upsert vedono la stessa riga.
  select m.role into v_cur_role
    from public.memberships m
   where m.organization_id = p_org
     and m.user_id = p_user
     for update;
  v_exists := found;

  if p_actor is not null and p_actor = p_user and v_exists
     and (p_role is distinct from v_cur_role or not p_is_active) then
    raise exception 'Non puoi modificare il tuo ruolo ne'' disattivare la tua membership'
      using errcode = '42501', hint = 'self_change';
  end if;

  -- Upsert. Il WHERE evita update a vuoto (idempotenza); il trigger dell'ultimo Admin scatta
  -- sull'update e puo' rifiutarlo (P0001, last_admin).
  insert into public.memberships as m (organization_id, user_id, role, is_active)
  values (p_org, p_user, p_role, p_is_active)
  on conflict (organization_id, user_id) do update
     set role      = excluded.role,
         is_active = excluded.is_active
   where (m.role, m.is_active) is distinct from (excluded.role, excluded.is_active);

  if p_location_ids is not null then
    delete from public.membership_locations ml
     where ml.organization_id = p_org
       and ml.user_id = p_user
       and not (ml.location_id = any (p_location_ids));

    -- Deduplica con DISTINCT; ON CONFLICT sulla PK (user_id, location_id) salta le sedi gia'
    -- presenti. Una sede di un'altra organizzazione viola la FK composta (23503).
    insert into public.membership_locations (organization_id, user_id, location_id)
    select distinct p_org, p_user, l.location_id
      from unnest(p_location_ids) as l (location_id)
    on conflict (user_id, location_id) do nothing;
  end if;
end;
$$;
revoke execute on function public.admin_apply_member(uuid, uuid, public.org_role, boolean, uuid[], uuid)
  from public, anon, authenticated;
grant execute on function public.admin_apply_member(uuid, uuid, public.org_role, boolean, uuid[], uuid)
  to service_role;
