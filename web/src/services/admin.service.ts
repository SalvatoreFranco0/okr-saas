import { supabase } from '../lib/supabase';
import { orNull } from '../schemas/okr';
import type { LocationData, PeriodData, TeamData } from '../schemas/admin';

// Periodi, sedi e team si scrivono direttamente dal client: le policy RLS (0005) decidono chi può
// (periodi e team: Admin/Manager; sedi: solo Admin). Ogni query passa l'organizzazione in modo esplicito.

export async function listPeriodsAdmin(orgId: string) {
  const { data, error } = await supabase
    .from('periods')
    .select('id, name, start_date, end_date, is_closed')
    .eq('organization_id', orgId)
    .order('start_date', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createPeriod(orgId: string, d: PeriodData): Promise<void> {
  const { error } = await supabase.from('periods').insert({ organization_id: orgId, ...d });
  if (error) throw error;
}

export async function updatePeriod(orgId: string, id: string, patch: Partial<PeriodData> & { is_closed?: boolean }): Promise<void> {
  const { data, error } = await supabase.from('periods').update(patch).eq('organization_id', orgId).eq('id', id).select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('not_found');
}

export async function listLocationsAdmin(orgId: string) {
  const { data, error } = await supabase
    .from('locations')
    .select('id, name, address, is_active')
    .eq('organization_id', orgId)
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export async function createLocation(orgId: string, d: LocationData): Promise<void> {
  const { error } = await supabase.from('locations').insert({ organization_id: orgId, name: d.name, address: orNull(d.address) });
  if (error) throw error;
}

export async function updateLocation(orgId: string, id: string, patch: { name?: string; address?: string | null; is_active?: boolean }): Promise<void> {
  const { data, error } = await supabase.from('locations').update(patch).eq('organization_id', orgId).eq('id', id).select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('not_found');
}

export async function listTeamsAdmin(orgId: string) {
  const { data, error } = await supabase
    .from('teams')
    .select('id, name, description, is_active')
    .eq('organization_id', orgId)
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export async function createTeam(orgId: string, d: TeamData): Promise<void> {
  const { error } = await supabase.from('teams').insert({ organization_id: orgId, name: d.name, description: orNull(d.description) });
  if (error) throw error;
}

export async function updateTeam(orgId: string, id: string, patch: { name?: string; description?: string | null; is_active?: boolean }): Promise<void> {
  const { data, error } = await supabase.from('teams').update(patch).eq('organization_id', orgId).eq('id', id).select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('not_found');
}

export async function listTeamMembers(orgId: string, teamId: string): Promise<string[]> {
  const { data, error } = await supabase.from('team_members').select('user_id').eq('organization_id', orgId).eq('team_id', teamId);
  if (error) throw error;
  return (data ?? []).map((r) => r.user_id);
}

export async function addTeamMember(orgId: string, teamId: string, userId: string): Promise<void> {
  const { error } = await supabase.from('team_members').insert({ organization_id: orgId, team_id: teamId, user_id: userId });
  if (error) throw error;
}

export async function removeTeamMember(orgId: string, teamId: string, userId: string): Promise<void> {
  const { error } = await supabase.from('team_members').delete().eq('organization_id', orgId).eq('team_id', teamId).eq('user_id', userId);
  if (error) throw error;
}
