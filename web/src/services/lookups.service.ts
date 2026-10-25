import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export async function listPeriods(orgId: string) {
  const { data, error } = await supabase
    .from('periods')
    .select('id, name, start_date, end_date, is_closed')
    .eq('organization_id', orgId)
    .order('start_date', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listLocations(orgId: string) {
  const { data, error } = await supabase
    .from('locations')
    .select('id, name, is_active')
    .eq('organization_id', orgId)
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export async function listTeams(orgId: string) {
  const { data, error } = await supabase
    .from('teams')
    .select('id, name, is_active')
    .eq('organization_id', orgId)
    .order('name');
  if (error) throw error;
  return data ?? [];
}

/** Sedi e team dell'utente corrente nell'organizzazione (per i permessi del Team Lead nell'interfaccia). */
export async function getMyScope(orgId: string, userId: string) {
  const [locs, teams] = await Promise.all([
    supabase.from('membership_locations').select('location_id').eq('organization_id', orgId).eq('user_id', userId),
    supabase.from('team_members').select('team_id').eq('organization_id', orgId).eq('user_id', userId),
  ]);
  if (locs.error) throw locs.error;
  if (teams.error) throw teams.error;
  return {
    locationIds: (locs.data ?? []).map((r) => r.location_id),
    teamIds: (teams.data ?? []).map((r) => r.team_id),
  };
}

export interface Member {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  role: 'admin' | 'manager_okr' | 'team_lead' | 'viewer';
}

// TODO: rimuovere il cast quando web/src/types/database.ts include la RPC 0008 (rigenerato dalla CI).
type RpcResult = PromiseLike<{ data: unknown; error: PostgrestError | null }>;
const rpcUntyped = supabase.rpc.bind(supabase) as unknown as (fn: string, args: Record<string, unknown>) => RpcResult;

/** Membri attivi dell'organizzazione (nome e ruolo, senza email) per i menu responsabile/assegnatario. */
export async function listMembers(orgId: string): Promise<Member[]> {
  const { data, error } = await rpcUntyped('org_member_directory', { p_org: orgId });
  if (error) throw error;
  return (data ?? []) as Member[];
}

export const memberName = (m: Pick<Member, 'first_name' | 'last_name'> | undefined) =>
  m ? [m.first_name, m.last_name].filter(Boolean).join(' ') || '—' : '—';
