// Normalizza il JSON di `dashboard_stats` (jsonb: nessun tipo generato) e prepara i dati dei grafici.

export const STATUS_ORDER = ['in_pianificazione', 'attivo', 'in_pausa', 'completato', 'non_raggiunto'] as const;
export type StatusKey = (typeof STATUS_ORDER)[number];

export interface StatsOkr {
  id: string;
  title: string;
  status: string;
  priority?: string;
  progress_percentage: number;
  updated_at?: string;
  end_date?: string | null;
}

export interface DashboardStats {
  total: number;
  avgProgress: number;
  byStatus: Record<StatusKey, number>;
  latest: StatsOkr[];
  critical: StatsOkr[];
}

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
};

function okrs(v: unknown): StatsOkr[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && typeof (x as { id?: unknown }).id === 'string')
    .map((x) => ({
      id: String(x.id),
      title: String(x.title ?? ''),
      status: String(x.status ?? ''),
      priority: typeof x.priority === 'string' ? x.priority : undefined,
      progress_percentage: num(x.progress_percentage),
      updated_at: typeof x.updated_at === 'string' ? x.updated_at : undefined,
      end_date: typeof x.end_date === 'string' ? x.end_date : null,
    }));
}

export function parseDashboardStats(raw: unknown): DashboardStats {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const by = (r.by_status && typeof r.by_status === 'object' ? r.by_status : {}) as Record<string, unknown>;
  const byStatus = Object.fromEntries(STATUS_ORDER.map((s) => [s, num(by[s])])) as Record<StatusKey, number>;
  return { total: num(r.total), avgProgress: num(r.avg_progress), byStatus, latest: okrs(r.latest), critical: okrs(r.critical) };
}

export interface StatusDatum {
  status: StatusKey;
  count: number;
}

/** Una voce per stato, nell'ordine del ciclo di vita (anche con conteggio 0: la tabella alternativa resta completa). */
export function statusChartData(byStatus: Record<StatusKey, number>): StatusDatum[] {
  return STATUS_ORDER.map((status) => ({ status, count: byStatus[status] }));
}
