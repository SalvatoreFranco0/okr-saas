import { supabase } from '../lib/supabase';
import { ConflictError, sanitizeSearch } from '../lib/errors';
import { orNull, parseTags, type ActionData, type KeyResultData, type OkrCreateData, type OkrEditData } from '../schemas/okr';
import type { Enums, Tables } from '../types/database';

// Ogni query passa l'organizzazione in modo esplicito oltre alla RLS (difesa in profondità).
// Gli update inviano la `version` letta: se non toccano righe è un conflitto (ConflictError).

export type Okr = Tables<'okrs'>;
export type KeyResult = Tables<'key_results'>;
export type Action = Tables<'actions'>;
export type Alignment = Tables<'okr_alignments'>;

export interface OkrFilters {
  page: number;
  pageSize: number;
  search?: string;
  status?: Enums<'okr_status'> | '';
  priority?: Enums<'priority'> | '';
  periodId?: string;
  locationId?: string;
  teamId?: string;
  /** true = archivio (solo eliminati). */
  archived?: boolean;
}

const LIST_COLUMNS =
  'id, title, status, priority, progress_percentage, owner_id, period_id, location_id, team_id, version, deleted_at, updated_at';
export type OkrListRow = Pick<
  Okr,
  | 'id' | 'title' | 'status' | 'priority' | 'progress_percentage' | 'owner_id' | 'period_id'
  | 'location_id' | 'team_id' | 'version' | 'deleted_at' | 'updated_at'
>;

/** Query base con i filtri della lista (condivisa da lista ed export CSV). Il chiamante aggiunge ordine e intervallo. */
export function filteredOkrQuery<C extends string>(orgId: string, f: OkrFilters, columns: C) {
  let q = supabase.from('okrs').select(columns, { count: 'exact' }).eq('organization_id', orgId);
  q = f.archived ? q.not('deleted_at', 'is', null) : q.is('deleted_at', null);
  if (f.status) q = q.eq('status', f.status);
  if (f.priority) q = q.eq('priority', f.priority);
  if (f.periodId) q = q.eq('period_id', f.periodId);
  if (f.locationId === 'none') q = q.is('location_id', null);
  else if (f.locationId) q = q.eq('location_id', f.locationId);
  if (f.teamId) q = q.eq('team_id', f.teamId);
  const s = f.search ? sanitizeSearch(f.search) : '';
  if (s) q = q.or(`title.ilike.*${s}*,description.ilike.*${s}*`);
  return q;
}

export async function listOkrs(orgId: string, f: OkrFilters): Promise<{ rows: OkrListRow[]; total: number }> {
  const q = filteredOkrQuery(orgId, f, LIST_COLUMNS);
  const from = (f.page - 1) * f.pageSize;
  const { data, error, count } = await q.order('updated_at', { ascending: false }).range(from, from + f.pageSize - 1);
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0 };
}

export async function listKeyResultsForOkrs(orgId: string, okrIds: string[]): Promise<KeyResult[]> {
  if (!okrIds.length) return [];
  const { data, error } = await supabase
    .from('key_results')
    .select('*')
    .eq('organization_id', orgId)
    .in('okr_id', okrIds)
    .order('created_at');
  if (error) throw error;
  return data ?? [];
}

export async function getOkr(orgId: string, id: string): Promise<Okr | null> {
  // Senza filtro su deleted_at: la RLS mostra gli eliminati solo ad Admin/Manager.
  const { data, error } = await supabase.from('okrs').select('*').eq('organization_id', orgId).eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function listActions(orgId: string, krIds: string[]): Promise<Action[]> {
  if (!krIds.length) return [];
  const { data, error } = await supabase
    .from('actions')
    .select('*')
    .eq('organization_id', orgId)
    .in('key_result_id', krIds)
    .order('created_at');
  if (error) throw error;
  return data ?? [];
}

export async function listKrUpdates(orgId: string, krIds: string[]) {
  if (!krIds.length) return [];
  const { data, error } = await supabase
    .from('key_result_updates')
    .select('id, key_result_id, old_value, new_value, note, created_at')
    .eq('organization_id', orgId)
    .in('key_result_id', krIds)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data ?? [];
}

// --- Creazione e modifica OKR -------------------------------------------------

function okrPayload(d: OkrEditData) {
  return {
    title: d.title,
    objective: d.objective,
    description: orNull(d.description),
    period_id: d.period_id,
    location_id: orNull(d.location_id),
    team_id: orNull(d.team_id),
    owner_id: d.owner_id,
    priority: d.priority,
    status: d.status,
    tags: parseTags(d.tags),
    start_date: orNull(d.start_date),
    end_date: orNull(d.end_date),
    notes: orNull(d.notes),
  };
}


/** Crea OKR e KR in una sola transazione (RPC `okr_create_with_krs`, security invoker: decide la RLS). */
export async function createOkr(orgId: string, d: OkrCreateData): Promise<string> {
  const { data, error } = await supabase.rpc('okr_create_with_krs', {
    p_okr: { organization_id: orgId, ...okrPayload(d) },
    p_krs: d.keyResults.map((kr) => ({
      title: kr.title,
      description: orNull(kr.description),
      unit: kr.unit,
      initial_metric: kr.initial_metric,
      target_metric: kr.target_metric,
      current_metric: kr.current_metric ?? kr.initial_metric,
      weight: kr.weight,
    })),
  });
  if (error) throw error;
  return data;
}

export async function updateOkr(orgId: string, id: string, version: number, d: OkrEditData): Promise<void> {
  const { data, error } = await supabase
    .from('okrs')
    .update(okrPayload(d))
    .eq('organization_id', orgId)
    .eq('id', id)
    .eq('version', version)
    .select('id');
  if (error) throw error;
  if (!data?.length) throw new ConflictError();
}

/** Soft delete (solo Admin/Manager: lo impone un trigger) e ripristino. */
export async function setOkrDeleted(orgId: string, id: string, version: number, deleted: boolean): Promise<void> {
  const { data, error } = await supabase
    .from('okrs')
    .update({ deleted_at: deleted ? new Date().toISOString() : null })
    .eq('organization_id', orgId)
    .eq('id', id)
    .eq('version', version)
    .select('id');
  if (error) throw error;
  if (!data?.length) throw new ConflictError();
}

// --- Key Result ---------------------------------------------------------------

export async function createKeyResult(orgId: string, okrId: string, d: KeyResultData): Promise<void> {
  const { error } = await supabase.from('key_results').insert({
    organization_id: orgId,
    okr_id: okrId,
    title: d.title,
    description: orNull(d.description),
    unit: d.unit,
    initial_metric: d.initial_metric,
    target_metric: d.target_metric,
    current_metric: d.current_metric ?? d.initial_metric,
    weight: d.weight,
    status: d.status,
  });
  if (error) throw error;
}

export async function updateKeyResult(orgId: string, id: string, version: number, d: KeyResultData): Promise<void> {
  // Il valore attuale cambia solo con il check-in (lo storico lo registra il trigger).
  const { data, error } = await supabase
    .from('key_results')
    .update({
      title: d.title,
      description: orNull(d.description),
      unit: d.unit,
      initial_metric: d.initial_metric,
      target_metric: d.target_metric,
      weight: d.weight,
      status: d.status,
    })
    .eq('organization_id', orgId)
    .eq('id', id)
    .eq('version', version)
    .select('id');
  if (error) throw error;
  if (!data?.length) throw new ConflictError();
}

export async function deleteKeyResult(orgId: string, id: string): Promise<void> {
  const { data, error } = await supabase.from('key_results').delete().eq('organization_id', orgId).eq('id', id).select('id');
  if (error) throw error;
  if (!data?.length) throw new ConflictError();
}

export async function krCheckIn(krId: string, value: number, note?: string) {
  const { data, error } = await supabase.rpc('kr_check_in', { p_kr: krId, p_value: value, p_note: note || undefined });
  if (error) throw error;
  return data;
}

// --- Azioni -------------------------------------------------------------------

export async function createAction(orgId: string, krId: string, d: ActionData): Promise<void> {
  const { error } = await supabase.from('actions').insert({
    organization_id: orgId,
    key_result_id: krId,
    title: d.title,
    description: orNull(d.description),
    due_date: orNull(d.due_date),
    assignee_id: orNull(d.assignee_id),
  });
  if (error) throw error;
}

export async function updateAction(
  orgId: string,
  id: string,
  version: number,
  patch: Partial<{ title: string; description: string | null; due_date: string | null; assignee_id: string | null; is_completed: boolean }>,
): Promise<void> {
  const { data, error } = await supabase
    .from('actions')
    .update(patch)
    .eq('organization_id', orgId)
    .eq('id', id)
    .eq('version', version)
    .select('id');
  if (error) throw error;
  if (!data?.length) throw new ConflictError();
}

export async function deleteAction(orgId: string, id: string): Promise<void> {
  const { data, error } = await supabase.from('actions').delete().eq('organization_id', orgId).eq('id', id).select('id');
  if (error) throw error;
  if (!data?.length) throw new ConflictError();
}

// --- Allineamenti -------------------------------------------------------------

export async function listAlignments(orgId: string, okrId: string): Promise<Alignment[]> {
  const { data, error } = await supabase
    .from('okr_alignments')
    .select('*')
    .eq('organization_id', orgId)
    .or(`parent_okr_id.eq.${okrId},child_okr_id.eq.${okrId}`);
  if (error) throw error;
  return data ?? [];
}

export async function listOkrTitles(orgId: string, ids: string[]): Promise<Pick<Okr, 'id' | 'title' | 'progress_percentage'>[]> {
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from('okrs')
    .select('id, title, progress_percentage')
    .eq('organization_id', orgId)
    .in('id', ids);
  if (error) throw error;
  return data ?? [];
}

/** OKR dello stesso periodo candidati a un allineamento (la RLS nasconde quelli non visibili). */
export async function listAlignmentCandidates(orgId: string, periodId: string, excludeId: string) {
  const { data, error } = await supabase
    .from('okrs')
    .select('id, title')
    .eq('organization_id', orgId)
    .eq('period_id', periodId)
    .is('deleted_at', null)
    .neq('id', excludeId)
    .order('title')
    .limit(200);
  if (error) throw error;
  return data ?? [];
}

export async function addAlignment(orgId: string, parentId: string, childId: string): Promise<void> {
  const { error } = await supabase
    .from('okr_alignments')
    .insert({ organization_id: orgId, parent_okr_id: parentId, child_okr_id: childId });
  if (error) throw error;
}

export async function removeAlignment(orgId: string, id: string): Promise<void> {
  const { data, error } = await supabase.from('okr_alignments').delete().eq('organization_id', orgId).eq('id', id).select('id');
  if (error) throw error;
  if (!data?.length) throw new ConflictError();
}
