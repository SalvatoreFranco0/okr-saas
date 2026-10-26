import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import { okrsToRows, toCsv, type ExportLabels } from '../../lib/csv';
import { ExportCancelled, collectExport, downloadTextFile, supabaseSource, EXPORT_MAX_ROWS, type ExportProgress } from '../../services/export.service';
import type { OkrFilters } from '../../services/okr.service';
import { errorKey } from '../../lib/errors';

interface Lookup {
  id: string;
  name: string;
}

/** Esporta in CSV tutte le pagine del filtro attivo (a blocchi, con avanzamento e limite massimo). */
export function ExportCsvButton({
  orgId, filters, periods, locations, teams,
}: {
  orgId: string;
  filters: OkrFilters;
  periods: Lookup[];
  locations: Lookup[];
  teams: Lookup[];
}) {
  const { t } = useTranslation();
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [message, setMessage] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const running = progress !== null;

  const run = async () => {
    const ac = new AbortController();
    abort.current = ac;
    setMessage(null);
    setProgress({ loaded: 0, total: 0 });
    try {
      const result = await collectExport(supabaseSource(orgId, filters), { signal: ac.signal, onProgress: setProgress });
      const labels: ExportLabels = {
        header: [],
        status: (s) => t(`okrStatus.${s}`),
        krStatus: (s) => t(`krStatus.${s}`),
        weight: t('export.weight'),
        priority: (p) => t(`priority.${p}`),
        orgLevel: t('export.orgLevel'),
        periods: new Map(periods.map((x) => [x.id, x.name])),
        locations: new Map(locations.map((x) => [x.id, x.name])),
        teams: new Map(teams.map((x) => [x.id, x.name])),
      };
      const header = [
        t('okr.title'), t('okr.objective'), t('okr.status'), t('okr.priority'), t('export.progress'), t('okr.period'),
        t('okr.location'), t('okr.team'), t('okr.startDate'), t('okr.endDate'), t('export.tags'), t('export.krCount'), t('okr.keyResults'),
      ];
      const csv = toCsv(header, okrsToRows(result.okrs, result.krs, labels));
      const stamp = new Date().toISOString().slice(0, 10);
      downloadTextFile(`okr-${filters.archived ? 'archivio-' : ''}${stamp}.csv`, csv);
      setMessage(
        result.truncated
          ? { tone: 'info', text: t('export.truncated', { max: EXPORT_MAX_ROWS, total: result.total }) }
          : { tone: 'info', text: t('export.done', { count: result.okrs.length }) },
      );
    } catch (err) {
      if (!(err instanceof ExportCancelled)) setMessage({ tone: 'error', text: t(errorKey(err)) });
    } finally {
      abort.current = null;
      setProgress(null);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      {running ? (
        <div className="flex items-center gap-2">
          <progress
            className="w-32"
            max={progress.total || undefined}
            value={progress.total ? progress.loaded : undefined}
            aria-label={t('export.progressLabel')}
          />
          <span className="text-xs text-gray-600 tabular-nums">{progress.loaded}/{progress.total || '…'}</span>
          <button type="button" onClick={() => abort.current?.abort()} className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
            {t('app.cancel')}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={run}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 inline-flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          {t('export.button')}
        </button>
      )}
      {message && (
        <p role={message.tone === 'error' ? 'alert' : 'status'} className={`text-xs ${message.tone === 'error' ? 'text-danger-500' : 'text-gray-600'}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
