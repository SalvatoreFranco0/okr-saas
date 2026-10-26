import { supabase } from '../lib/supabase';
import type { ExportKr, ExportOkr } from '../lib/csv';
import type { ExportSource } from '../lib/exportRunner';
import { filteredOkrQuery, type OkrFilters } from './okr.service';

export { collectExport, ExportCancelled, EXPORT_MAX_ROWS, EXPORT_PAGE_SIZE } from '../lib/exportRunner';
export type { ExportProgress, ExportResult, ExportSource } from '../lib/exportRunner';

const OKR_COLUMNS = 'id, title, objective, status, priority, progress_percentage, period_id, location_id, team_id, start_date, end_date, tags';
const KR_COLUMNS = 'okr_id, title, unit, initial_metric, target_metric, current_metric, weight, status';

/** Sorgente reale: stessi filtri della lista (`filteredOkrQuery`), ordine stabile per non perdere o duplicare righe tra le pagine. */
export function supabaseSource(orgId: string, filters: OkrFilters): ExportSource {
  return {
    async page(offset, limit) {
      const { data, error, count } = await filteredOkrQuery(orgId, filters, OKR_COLUMNS)
        .order('updated_at', { ascending: false })
        .order('id')
        .range(offset, offset + limit - 1);
      if (error) throw error;
      return { rows: (data ?? []) as unknown as ExportOkr[], total: count ?? 0 };
    },
    async krs(okrIds) {
      const { data, error } = await supabase
        .from('key_results')
        .select(KR_COLUMNS)
        .eq('organization_id', orgId)
        .in('okr_id', okrIds)
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as ExportKr[];
    },
  };
}

/** Avvia il download di un file di testo nel browser (Blob, nessun dato inviato a terzi). */
export function downloadTextFile(name: string, content: string, mime = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
