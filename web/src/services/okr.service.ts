import { supabase } from '../lib/supabase';
import type { OkrCreateData } from '../schemas/okr';

// Ogni query passa l'organizzazione in modo esplicito oltre alla RLS (difesa in profondità).

export async function listOkrs(orgId: string) {
  const { data, error } = await supabase
    .from('okrs')
    .select('id, title, status, priority, progress_percentage, owner_id, period_id, updated_at')
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return data;
}

export async function listPeriods(orgId: string) {
  const { data, error } = await supabase
    .from('periods')
    .select('id, name, start_date, end_date, is_closed')
    .eq('organization_id', orgId)
    .order('start_date', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getOkr(orgId: string, id: string) {
  const { data, error } = await supabase
    .from('okrs')
    .select('*')
    .eq('organization_id', orgId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listKeyResults(orgId: string, okrId: string) {
  const { data, error } = await supabase
    .from('key_results')
    .select('*')
    .eq('organization_id', orgId)
    .eq('okr_id', okrId)
    .order('created_at');
  if (error) throw error;
  return data;
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
  return data;
}

/**
 * Crea l'OKR e poi i suoi KR (due richieste, non atomiche: se la seconda fallisce l'OKR resta senza KR
 * e l'errore viene mostrato). L'avanzamento non si scrive mai dal client: lo calcola il trigger.
 */
export async function createOkr(orgId: string, ownerId: string, input: OkrCreateData) {
  const { data: okr, error } = await supabase
    .from('okrs')
    .insert({
      organization_id: orgId,
      owner_id: ownerId,
      period_id: input.period_id,
      title: input.title,
      objective: input.objective,
      priority: input.priority,
    })
    .select('id')
    .single();
  if (error) throw error;

  const { error: krError } = await supabase.from('key_results').insert(
    input.keyResults.map((kr) => ({
      organization_id: orgId,
      okr_id: okr.id,
      title: kr.title,
      unit: kr.unit,
      initial_metric: kr.initial_metric,
      target_metric: kr.target_metric,
      current_metric: kr.initial_metric,
    })),
  );
  if (krError) throw krError;
  return okr.id;
}

export async function krCheckIn(krId: string, value: number, note?: string) {
  const { data, error } = await supabase.rpc('kr_check_in', {
    p_kr: krId,
    p_value: value,
    p_note: note || undefined,
  });
  if (error) throw error;
  return data;
}
