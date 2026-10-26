import { supabase } from '../lib/supabase';
import { parseDashboardStats, type DashboardStats } from '../lib/dashboardStats';

export interface DashboardFilters {
  periodId?: string;
  locationId?: string;
  teamId?: string;
}

export interface AtRiskRow {
  okr_id: string;
  title: string;
  progress_percentage: number;
  end_date: string | null;
  has_at_risk_kr: boolean;
  due_soon_low_progress: boolean;
}

/** Numeri calcolati dal database (RPC `security invoker`: la RLS decide cosa entra nei conteggi). */
export async function getDashboardStats(orgId: string, f: DashboardFilters): Promise<DashboardStats> {
  const { data, error } = await supabase.rpc('dashboard_stats', {
    p_org: orgId,
    p_period: f.periodId || undefined,
    p_location: f.locationId || undefined,
    p_team: f.teamId || undefined,
  });
  if (error) throw error;
  return parseDashboardStats(data);
}

/** OKR a rischio (vista `v_okr_at_risk`, soglia di avanzamento basso definita nel database) con gli stessi filtri. */
export async function listAtRisk(orgId: string, f: DashboardFilters): Promise<{ rows: AtRiskRow[]; total: number }> {
  let q = supabase
    .from('v_okr_at_risk')
    .select('okr_id, title, progress_percentage, end_date, has_at_risk_kr, due_soon_low_progress', { count: 'exact' })
    .eq('organization_id', orgId);
  if (f.periodId) q = q.eq('period_id', f.periodId);
  if (f.locationId) q = q.eq('location_id', f.locationId);
  if (f.teamId) q = q.eq('team_id', f.teamId);
  const { data, error, count } = await q.order('end_date', { ascending: true, nullsFirst: false }).limit(20);
  if (error) throw error;
  return { rows: (data ?? []) as AtRiskRow[], total: count ?? 0 };
}
