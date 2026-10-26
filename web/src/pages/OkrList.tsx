import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronLeft, ChevronRight, Eye, Filter, Pencil, Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import { useCurrentOrg } from '../hooks/useCurrentOrg';
import { useMyAccess } from '../hooks/useMyAccess';
import { listKeyResultsForOkrs, listOkrs, setOkrDeleted, type OkrFilters, type OkrListRow } from '../services/okr.service';
import { listLocations, listPeriods, listTeams } from '../services/lookups.service';
import { canCreateOkr, canDeleteOkr, canEditOkr, canManageArchive } from '../lib/permissions';
import { errorKey } from '../lib/errors';
import { OKR_STATUSES, PRIORITIES } from '../schemas/okr';
import { PriorityBadge, ProgressBar, StatusBadge } from '../components/okr/badges';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ExportCsvButton } from '../components/okr/ExportCsvButton';
import { Banner, btnPrimary, inputCls } from '../components/ui/Field';

const PAGE_SIZE = 10;

/** Lista OKR (o archivio degli eliminati con `archived`): ricerca, filtri e paginazione lato server. */
export function OkrList({ archived = false }: { archived?: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { org } = useCurrentOrg();
  const orgId = org!.id;
  const base = `/o/${org!.slug}/okrs`;
  const { access } = useMyAccess();

  const [filters, setFilters] = useState<OkrFilters>({ page: 1, pageSize: PAGE_SIZE, archived });
  const [searchInput, setSearchInput] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [toDelete, setToDelete] = useState<OkrListRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setFilters((f) => (f.search === searchInput ? f : { ...f, search: searchInput, page: 1 })), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const listQ = useQuery({ queryKey: ['okrs', orgId, filters], queryFn: () => listOkrs(orgId, filters), placeholderData: (p) => p });
  const periodsQ = useQuery({ queryKey: ['periods', orgId], queryFn: () => listPeriods(orgId) });
  const locationsQ = useQuery({ queryKey: ['locations', orgId], queryFn: () => listLocations(orgId) });
  const teamsQ = useQuery({ queryKey: ['teams', orgId], queryFn: () => listTeams(orgId) });

  const rows = listQ.data?.rows ?? [];
  const total = listQ.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const expandedIds = rows.filter((r) => expanded.has(r.id)).map((r) => r.id);
  const krQ = useQuery({
    queryKey: ['okrs', orgId, 'krs', expandedIds],
    queryFn: () => listKeyResultsForOkrs(orgId, expandedIds),
    enabled: expandedIds.length > 0,
  });
  const periodClosed = (id: string) => !!periodsQ.data?.find((p) => p.id === id)?.is_closed;

  const mutation = useMutation({
    mutationFn: (v: { okr: OkrListRow; deleted: boolean }) => setOkrDeleted(orgId, v.okr.id, v.okr.version, v.deleted),
    onSuccess: async () => {
      setToDelete(null);
      await queryClient.invalidateQueries({ queryKey: ['okrs', orgId] });
    },
    onError: (err) => {
      setToDelete(null);
      setActionError(errorKey(err));
    },
  });

  const set = (patch: Partial<OkrFilters>) => setFilters((f) => ({ ...f, ...patch, page: 1 }));
  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  if (archived && !canManageArchive(access)) return <Banner tone="danger">{t('errors.forbidden')}</Banner>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-gray-900">{archived ? t('okr.archiveTitle') : t('okr.listTitle')}</h1>
        <div className="flex gap-2 items-start">
          <ExportCsvButton
            orgId={orgId}
            filters={filters}
            periods={periodsQ.data ?? []}
            locations={locationsQ.data ?? []}
            teams={teamsQ.data ?? []}
          />
          {!archived && canManageArchive(access) && (
            <Link to={`${base}/archive`} className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
              {t('okr.archive')}
            </Link>
          )}
          {!archived && canCreateOkr(access) && (
            <Link to={`${base}/new`} className={`${btnPrimary} inline-flex items-center gap-2`}>
              <Plus className="w-4 h-4" />
              {t('okr.new')}
            </Link>
          )}
        </div>
      </div>

      {actionError && <p role="alert" className="text-sm text-danger-500">{t(actionError)}</p>}

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t('okr.search')}
            aria-label={t('okr.search')}
            className={`${inputCls} pl-9`}
          />
        </div>
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          className={`px-3 py-2 border rounded-lg text-sm flex items-center gap-1 ${showFilters ? 'border-primary-500 text-primary-600' : 'border-gray-300 text-gray-600'}`}
        >
          <Filter className="w-4 h-4" /> {t('okr.filters')}
        </button>
      </div>

      {showFilters && (
        <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-2 bg-white border border-gray-200 rounded-xl p-3">
          <select aria-label={t('okr.status')} value={filters.status ?? ''} onChange={(e) => set({ status: e.target.value as OkrFilters['status'] })} className={inputCls}>
            <option value="">{t('okr.allStatuses')}</option>
            {OKR_STATUSES.map((s) => <option key={s} value={s}>{t(`okrStatus.${s}`)}</option>)}
          </select>
          <select aria-label={t('okr.priority')} value={filters.priority ?? ''} onChange={(e) => set({ priority: e.target.value as OkrFilters['priority'] })} className={inputCls}>
            <option value="">{t('okr.allPriorities')}</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}
          </select>
          <select aria-label={t('okr.period')} value={filters.periodId ?? ''} onChange={(e) => set({ periodId: e.target.value })} className={inputCls}>
            <option value="">{t('okr.allPeriods')}</option>
            {(periodsQ.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select aria-label={t('okr.location')} value={filters.locationId ?? ''} onChange={(e) => set({ locationId: e.target.value })} className={inputCls}>
            <option value="">{t('okr.allLocations')}</option>
            <option value="none">{t('okr.orgLevel')}</option>
            {(locationsQ.data ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select aria-label={t('okr.team')} value={filters.teamId ?? ''} onChange={(e) => set({ teamId: e.target.value })} className={inputCls}>
            <option value="">{t('okr.allTeams')}</option>
            {(teamsQ.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </div>
      )}

      {listQ.isLoading && <p className="text-gray-500">{t('app.loading')}</p>}
      {listQ.error && <p role="alert" className="text-danger-500">{t(errorKey(listQ.error))}</p>}
      {listQ.data && rows.length === 0 && <p className="text-gray-500">{archived ? t('okr.archiveEmpty') : t('okr.empty')}</p>}

      {rows.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-4 py-3 font-medium">{t('okr.title')}</th>
                <th className="px-4 py-3 font-medium">{t('okr.priority')}</th>
                <th className="px-4 py-3 font-medium">{t('okr.progress')}</th>
                <th className="px-4 py-3 font-medium text-right">{t('app.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((o) => {
                const open = expanded.has(o.id);
                const closed = periodClosed(o.period_id);
                const editable = canEditOkr(access, { ...o, owner_id: o.owner_id }, closed);
                return (
                  <Fragment key={o.id}>
                    <tr className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-2">
                          <button
                            type="button"
                            onClick={() => toggle(o.id)}
                            aria-expanded={open}
                            aria-label={open ? t('okr.collapse') : t('okr.expand')}
                            className="mt-0.5 text-gray-400 hover:text-gray-700"
                          >
                            <ChevronDown className={`w-4 h-4 transition-transform ${open ? '' : '-rotate-90'}`} />
                          </button>
                          <div>
                            <Link to={`${base}/${o.id}`} className="font-medium text-gray-900 hover:text-primary-700">{o.title}</Link>
                            <div className="mt-1"><StatusBadge status={o.status} /></div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3"><PriorityBadge priority={o.priority} /></td>
                      <td className="px-4 py-3 w-56"><ProgressBar value={o.progress_percentage} /></td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Link to={`${base}/${o.id}`} title={t('okr.view')} aria-label={t('okr.view')} className="p-1.5 text-gray-500 hover:text-primary-700 rounded">
                            <Eye className="w-4 h-4" />
                          </Link>
                          {!archived && editable && (
                            <Link to={`${base}/${o.id}/edit`} title={t('okr.edit')} aria-label={t('okr.edit')} className="p-1.5 text-gray-500 hover:text-primary-700 rounded">
                              <Pencil className="w-4 h-4" />
                            </Link>
                          )}
                          {!archived && canDeleteOkr(access) && (
                            <button type="button" onClick={() => setToDelete(o)} title={t('okr.delete')} aria-label={t('okr.delete')} className="p-1.5 text-gray-500 hover:text-danger-500 rounded">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                          {archived && canDeleteOkr(access) && (
                            <button
                              type="button"
                              onClick={() => mutation.mutate({ okr: o, deleted: false })}
                              disabled={mutation.isPending}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-primary-700 border border-primary-200 rounded hover:bg-primary-50"
                            >
                              <RotateCcw className="w-3.5 h-3.5" /> {t('okr.restore')}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {open && (
                      <tr className="bg-gray-50">
                        <td colSpan={4} className="px-10 py-3">
                          {krQ.isLoading && <p className="text-gray-500">{t('app.loading')}</p>}
                          {krQ.data && krQ.data.filter((k) => k.okr_id === o.id).length === 0 && (
                            <p className="text-gray-500">{t('okr.noKr')}</p>
                          )}
                          <ul className="space-y-2">
                            {(krQ.data ?? []).filter((k) => k.okr_id === o.id).map((k) => (
                              <li key={k.id} className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-gray-800">{k.title}</span>
                                <span className="text-xs text-gray-500 tabular-nums">
                                  {k.current_metric} / {k.target_metric} {k.unit} · {t(`krStatus.${k.status}`)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>{t('okr.total', { count: total })}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={filters.page <= 1}
              onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
              aria-label={t('okr.prev')}
              className="p-1.5 border border-gray-300 rounded disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span>{t('okr.page', { page: filters.page, pages })}</span>
            <button
              type="button"
              disabled={filters.page >= pages}
              onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
              aria-label={t('okr.next')}
              className="p-1.5 border border-gray-300 rounded disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={toDelete !== null}
        title={t('okr.deleteTitle')}
        message={t('okr.deleteText', { title: toDelete?.title ?? '' })}
        confirmText={t('okr.delete')}
        cancelText={t('app.cancel')}
        isLoading={mutation.isPending}
        onConfirm={() => toDelete && mutation.mutate({ okr: toDelete, deleted: true })}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
