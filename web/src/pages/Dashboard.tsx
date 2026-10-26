import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAuthStore } from '../stores/authStore';
import { useCurrentOrg } from '../hooks/useCurrentOrg';
import { getDashboardStats, listAtRisk, type DashboardFilters } from '../services/dashboard.service';
import { listLocations, listPeriods, listTeams } from '../services/lookups.service';
import { statusChartData, type StatsOkr } from '../lib/dashboardStats';
import { errorKey } from '../lib/errors';
import { PriorityBadge, ProgressBar, StatusBadge } from '../components/okr/badges';
import { inputCls } from '../components/ui/Field';
import type { Enums } from '../types/database';

function Kpi({ label, value, testId }: { label: string; value: string | number; testId: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-3xl font-bold text-gray-900 mt-1 tabular-nums" data-testid={testId}>{value}</p>
    </div>
  );
}

function OkrRow({ base, o }: { base: string; o: StatsOkr }) {
  return (
    <li className="py-2 flex flex-wrap items-center gap-2 justify-between">
      <Link to={`${base}/${o.id}`} className="text-sm font-medium text-primary-700 hover:underline">{o.title}</Link>
      <div className="flex items-center gap-2">
        <StatusBadge status={o.status as Enums<'okr_status'>} />
        {o.priority && <PriorityBadge priority={o.priority as Enums<'priority'>} />}
        <div className="w-36"><ProgressBar value={o.progress_percentage} /></div>
      </div>
    </li>
  );
}

function Panel({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  return (
    <section className="bg-white border border-gray-200 rounded-xl p-4" data-testid={testId}>
      <h2 className="text-base font-semibold text-gray-900 mb-2">{title}</h2>
      {children}
    </section>
  );
}

export function Dashboard() {
  const { t } = useTranslation();
  const profile = useAuthStore((s) => s.profile);
  const { org } = useCurrentOrg();
  const orgId = org!.id;
  const base = `/o/${org!.slug}/okrs`;
  const [filters, setFilters] = useState<DashboardFilters>({});
  const [showTable, setShowTable] = useState(false);

  const periodsQ = useQuery({ queryKey: ['periods', orgId], queryFn: () => listPeriods(orgId) });
  const locationsQ = useQuery({ queryKey: ['locations', orgId], queryFn: () => listLocations(orgId) });
  const teamsQ = useQuery({ queryKey: ['teams', orgId], queryFn: () => listTeams(orgId) });
  const statsQ = useQuery({
    queryKey: ['okrs', orgId, 'dashboard', filters],
    queryFn: () => getDashboardStats(orgId, filters),
    placeholderData: (p) => p,
  });
  const riskQ = useQuery({
    queryKey: ['okrs', orgId, 'at-risk', filters],
    queryFn: () => listAtRisk(orgId, filters),
    placeholderData: (p) => p,
  });

  const stats = statsQ.data;
  const chart = stats ? statusChartData(stats.byStatus).map((d) => ({ ...d, label: t(`okrStatus.${d.status}`) })) : [];
  const set = (patch: Partial<DashboardFilters>) => setFilters((f) => ({ ...f, ...patch }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {t('dashboard.welcome', { name: profile?.first_name ?? profile?.email ?? '' })}
        </h1>
        <p className="text-gray-500 mt-1">{t('dashboard.subtitle')}</p>
      </div>

      <div className="grid sm:grid-cols-3 gap-2 bg-white border border-gray-200 rounded-xl p-3">
        <select aria-label={t('okr.period')} value={filters.periodId ?? ''} onChange={(e) => set({ periodId: e.target.value })} className={inputCls}>
          <option value="">{t('okr.allPeriods')}</option>
          {(periodsQ.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select aria-label={t('okr.location')} value={filters.locationId ?? ''} onChange={(e) => set({ locationId: e.target.value })} className={inputCls}>
          <option value="">{t('okr.allLocations')}</option>
          {(locationsQ.data ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <select aria-label={t('okr.team')} value={filters.teamId ?? ''} onChange={(e) => set({ teamId: e.target.value })} className={inputCls}>
          <option value="">{t('okr.allTeams')}</option>
          {(teamsQ.data ?? []).map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
        </select>
      </div>
      {(filters.locationId || filters.teamId) && <p className="text-xs text-gray-500">{t('dashboard.filterNote')}</p>}

      {(statsQ.error || riskQ.error) && (
        <p role="alert" className="text-sm text-danger-500">{t(errorKey(statsQ.error ?? riskQ.error))}</p>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label={t('dashboard.total')} value={stats?.total ?? '–'} testId="kpi-total" />
        <Kpi label={t('dashboard.avgProgress')} value={stats ? `${stats.avgProgress.toFixed(1)}%` : '–'} testId="kpi-avg" />
        <Kpi label={t('dashboard.critical')} value={stats?.critical.length ?? '–'} testId="kpi-critical" />
        <Kpi label={t('dashboard.atRisk')} value={riskQ.data?.total ?? '–'} testId="kpi-at-risk" />
      </div>

      <Panel title={t('dashboard.byStatus')} testId="panel-by-status">
        {stats && stats.total === 0 ? (
          <p className="text-sm text-gray-500">{t('dashboard.empty')}</p>
        ) : (
          <>
            <div
              role="img"
              aria-label={t('dashboard.chartAlt', { summary: chart.map((d) => `${d.label}: ${d.count}`).join(', ') })}
              className="h-56"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} width={32} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#2563eb" isAnimationActive={false}>
                    <LabelList dataKey="count" position="top" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <button type="button" onClick={() => setShowTable((v) => !v)} aria-expanded={showTable} className="mt-2 text-sm text-primary-700 hover:underline">
              {showTable ? t('dashboard.hideTable') : t('dashboard.showTable')}
            </button>
            {showTable && (
              <table className="mt-2 text-sm w-full max-w-md" data-testid="table-by-status">
                <caption className="sr-only">{t('dashboard.byStatus')}</caption>
                <thead>
                  <tr className="text-left text-gray-500">
                    <th scope="col" className="py-1">{t('okr.status')}</th>
                    <th scope="col" className="py-1 text-right">{t('dashboard.count')}</th>
                  </tr>
                </thead>
                <tbody>
                  {chart.map((d) => (
                    <tr key={d.status} className="border-t border-gray-100">
                      <th scope="row" className="py-1 font-normal text-left">{d.label}</th>
                      <td className="py-1 text-right tabular-nums">{d.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </Panel>

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title={t('dashboard.criticalTitle')} testId="panel-critical">
          {stats && stats.critical.length === 0 ? (
            <p className="text-sm text-gray-500">{t('dashboard.noCritical')}</p>
          ) : (
            <ul className="divide-y divide-gray-100">{(stats?.critical ?? []).map((o) => <OkrRow key={o.id} base={base} o={o} />)}</ul>
          )}
        </Panel>
        <Panel title={t('dashboard.atRiskTitle')} testId="panel-at-risk">
          {riskQ.data && riskQ.data.rows.length === 0 ? (
            <p className="text-sm text-gray-500">{t('dashboard.noAtRisk')}</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {(riskQ.data?.rows ?? []).map((r) => (
                <li key={r.okr_id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                  <Link to={`${base}/${r.okr_id}`} className="text-sm font-medium text-primary-700 hover:underline">{r.title}</Link>
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    {r.has_at_risk_kr && <span className="px-2 py-0.5 rounded-full bg-danger-100 text-danger-600">{t('dashboard.reasonKr')}</span>}
                    {r.due_soon_low_progress && <span className="px-2 py-0.5 rounded-full bg-warning-100 text-warning-600">{t('dashboard.reasonDue')}</span>}
                    <div className="w-32"><ProgressBar value={r.progress_percentage} /></div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title={t('dashboard.latestTitle')} testId="panel-latest">
        {stats && stats.latest.length === 0 ? (
          <p className="text-sm text-gray-500">{t('dashboard.empty')}</p>
        ) : (
          <ul className="divide-y divide-gray-100">{(stats?.latest ?? []).map((o) => <OkrRow key={o.id} base={base} o={o} />)}</ul>
        )}
      </Panel>
    </div>
  );
}
