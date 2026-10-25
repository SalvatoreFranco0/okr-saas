-- 0008: rubrica dei membri e creazione atomica di un OKR con i suoi Key Result (fase 5).
-- Retrocompatibile (solo oggetti nuovi) e idempotente (create or replace).
--
-- 1. private.member_directory(p_org) + wrapper public.org_member_directory(p_org)
--    Serve ai selettori "owner"/"assegnatario" della UI. La RLS di memberships fa vedere
--    l'elenco completo solo ad Admin/Manager; Team Lead e Viewer vedono solo se stessi, ma
--    devono poter scegliere un owner/assegnatario tra i colleghi. Si espone quindi SOLO il
--    minimo: user_id, nome, cognome, ruolo dei membri ATTIVI. Niente email, sedi o team.
--    * La funzione che legge le tabelle e' SECURITY DEFINER in private (bypassa la RLS) e
--      restituisce righe solo se il chiamante ha un ruolo nell'organizzazione secondo
--      my_access() (membership attiva in org attiva, o sessione di supporto con aal2).
--      Altrimenti zero righe: p_org non e' mai un'autorizzazione.
--    * Il wrapper in public e' SECURITY INVOKER (in public non esistono security definer,
--      controllo in 00_inventory) e serve solo a renderla raggiungibile come RPC.
--
-- 2. public.okr_create_with_krs(p_okr jsonb, p_krs jsonb) returns uuid
--    Crea OKR + KR in un'unica chiamata, quindi in un'unica transazione: se un KR non e'
--    valido l'OKR non resta creato. SECURITY INVOKER: decidono le policy (okrs_insert,
--    key_results_insert) e i trigger esistenti (periodo chiuso, autore, version,
--    avanzamento). progress_percentage non si scrive: lo calcolano i trigger dei KR.

-- ---------------------------------------------------------------------------
-- Rubrica dei membri
-- ---------------------------------------------------------------------------
create or replace function private.member_directory(p_org uuid)
returns table (user_id uuid, first_name text, last_name text, role public.org_role)
language sql
stable
security definer
set search_path = ''
as $$
  -- left join: il profilo puo' mancare (handle_new_auth_user non blocca mai la creazione
  -- dell'utente); il membro resta selezionabile, con nome e cognome nulli.
  select m.user_id, p.first_name, p.last_name, m.role
    from public.memberships m
    left join public.profiles p on p.id = m.user_id
   where m.organization_id = p_org
     and m.is_active
     and private.role_of((select private.my_access()), p_org) is not null
   order by p.last_name nulls last, p.first_name nulls last, m.user_id;
$$;
revoke execute on function private.member_directory(uuid) from public, anon;
grant execute on function private.member_directory(uuid) to authenticated;

create or replace function public.org_member_directory(p_org uuid)
returns table (user_id uuid, first_name text, last_name text, role public.org_role)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.member_directory(p_org);
$$;
revoke execute on function public.org_member_directory(uuid) from public, anon;
grant execute on function public.org_member_directory(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Creazione atomica OKR + KR
-- ---------------------------------------------------------------------------
-- p_okr: { organization_id, period_id, location_id?, team_id?, owner_id, title, objective,
--          description?, priority?, status?, start_date?, end_date?, tags?: [text], notes? }
-- p_krs: [ { title, description?, unit?, initial_metric?, target_metric, weight?,
--            current_metric? }, ... ] con 1..20 elementi.
-- Default come la tabella: priority 'media', tags '{}', unit '%', initial_metric 0,
-- current_metric 0, weight 100. status: default della tabella (in_pianificazione) se assente o vuoto.
-- organization_id dei KR = quello dell'OKR (eventuali valori nei KR sono ignorati).
-- I campi facoltativi (location_id, team_id, priority, start_date, end_date) accettano
-- assenza, null JSON o stringa vuota come "nessun valore".
-- Errori: 22023 per input malformato; 42501 da RLS/periodo chiuso; 23502/23514/22P02 dai
-- vincoli e dai cast. Qualunque errore annulla l'intera chiamata.
-- L'id dell'OKR e' generato qui e non con RETURNING: INSERT ... RETURNING richiederebbe
-- anche il passaggio della policy SELECT sulla riga nuova, che non e' una regola di creazione.
create or replace function public.okr_create_with_krs(p_okr jsonb, p_krs jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_okr_id uuid := gen_random_uuid();
  v_org    uuid;
  v_n      integer;
  v_tags   text[];
begin
  if p_okr is null or jsonb_typeof(p_okr) <> 'object' then
    raise exception 'p_okr deve essere un oggetto JSON' using errcode = '22023';
  end if;
  if p_krs is null or jsonb_typeof(p_krs) <> 'array' then
    raise exception 'p_krs deve essere un array JSON' using errcode = '22023';
  end if;
  v_n := jsonb_array_length(p_krs);
  if v_n < 1 or v_n > 20 then
    raise exception 'Servono da 1 a 20 Key Result (ricevuti %)', v_n using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_krs) as e (kr) where jsonb_typeof(e.kr) <> 'object') then
    raise exception 'Ogni Key Result deve essere un oggetto JSON' using errcode = '22023';
  end if;

  if p_okr -> 'tags' is null or jsonb_typeof(p_okr -> 'tags') = 'null' then
    v_tags := '{}'::text[];
  elsif jsonb_typeof(p_okr -> 'tags') = 'array' then
    select coalesce(array_agg(t.tag order by t.ord), '{}'::text[])
      into v_tags
      from jsonb_array_elements_text(p_okr -> 'tags') with ordinality as t (tag, ord);
  else
    raise exception 'tags deve essere un array di testo' using errcode = '22023';
  end if;

  v_org := (p_okr ->> 'organization_id')::uuid;

  insert into public.okrs (
    id, organization_id, period_id, location_id, team_id, owner_id,
    title, objective, description, priority, status, start_date, end_date, tags, notes
  ) values (
    v_okr_id,
    v_org,
    (p_okr ->> 'period_id')::uuid,
    nullif(p_okr ->> 'location_id', '')::uuid,
    nullif(p_okr ->> 'team_id', '')::uuid,
    (p_okr ->> 'owner_id')::uuid,
    p_okr ->> 'title',
    p_okr ->> 'objective',
    p_okr ->> 'description',
    coalesce(nullif(p_okr ->> 'priority', '')::public.priority, 'media'::public.priority),
    coalesce(nullif(p_okr ->> 'status', '')::public.okr_status, 'in_pianificazione'::public.okr_status),
    nullif(p_okr ->> 'start_date', '')::date,
    nullif(p_okr ->> 'end_date', '')::date,
    v_tags,
    p_okr ->> 'notes'
  );

  -- Un solo INSERT per tutti i KR: il trigger di statement ricalcola l'avanzamento una volta.
  insert into public.key_results (
    organization_id, okr_id, title, description, unit,
    initial_metric, target_metric, current_metric, weight
  )
  select v_org,
         v_okr_id,
         k.kr ->> 'title',
         k.kr ->> 'description',
         coalesce(k.kr ->> 'unit', '%'),
         coalesce((k.kr ->> 'initial_metric')::numeric, 0),
         (k.kr ->> 'target_metric')::numeric,
         coalesce((k.kr ->> 'current_metric')::numeric, 0),
         coalesce((k.kr ->> 'weight')::numeric, 100)
    from jsonb_array_elements(p_krs) with ordinality as k (kr, ord)
   order by k.ord;

  return v_okr_id;
end;
$$;
revoke execute on function public.okr_create_with_krs(jsonb, jsonb) from public, anon;
grant execute on function public.okr_create_with_krs(jsonb, jsonb) to authenticated;
