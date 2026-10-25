import { useTranslation } from 'react-i18next';
import type { Enums } from '../../types/database';

const statusColors: Record<Enums<'okr_status'>, string> = {
  in_pianificazione: 'bg-gray-100 text-gray-700',
  attivo: 'bg-primary-100 text-primary-700',
  in_pausa: 'bg-warning-100 text-warning-600',
  completato: 'bg-success-100 text-success-600',
  non_raggiunto: 'bg-danger-100 text-danger-600',
};

const priorityColors: Record<Enums<'priority'>, string> = {
  bassa: 'bg-gray-100 text-gray-600',
  media: 'bg-primary-100 text-primary-600',
  alta: 'bg-warning-100 text-warning-600',
  critica: 'bg-danger-100 text-danger-600',
};

export function StatusBadge({ status }: { status: Enums<'okr_status'> }) {
  const { t } = useTranslation();
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[status]}`}>{t(`okrStatus.${status}`)}</span>;
}

export function PriorityBadge({ priority }: { priority: Enums<'priority'> }) {
  const { t } = useTranslation();
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${priorityColors[priority]}`}>{t(`priority.${priority}`)}</span>;
}

export function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center gap-2">
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 flex-1 min-w-16 bg-gray-200 rounded-full overflow-hidden"
      >
        <div className="h-full bg-primary-600" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-600 tabular-nums w-12 text-right">{pct.toFixed(1)}%</span>
    </div>
  );
}
