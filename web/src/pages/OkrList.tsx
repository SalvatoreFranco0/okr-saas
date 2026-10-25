import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { okrService } from '../services/okr.service';
import type { OkrFilters } from '../services/okr.service';
import { teamService } from '../services/user.service';
import { useAuthStore } from '../stores/authStore';
import {
  Plus, Search, Filter, ChevronLeft, ChevronRight,
  Eye, Pencil, Trash2, ChevronRight as ArrowRight, ChevronDown,
  CheckSquare, Square,
} from 'lucide-react';

const statusLabels: Record<string, string> = {
  IN_PIANIFICAZIONE: 'In Pianificazione',
  ATTIVO: 'Attivo',
  IN_PAUSA: 'In Pausa',
  COMPLETATO: 'Completato',
  NON_RAGGIUNTO: 'Non Raggiunto',
};

const statusColors: Record<string, string> = {
  IN_PIANIFICAZIONE: 'bg-gray-100 text-gray-700',
  ATTIVO: 'bg-primary-100 text-primary-700',
  IN_PAUSA: 'bg-warning-100 text-warning-600',
  COMPLETATO: 'bg-success-100 text-success-600',
  NON_RAGGIUNTO: 'bg-danger-100 text-danger-600',
};

const priorityColors: Record<string, string> = {
  BASSA: 'bg-gray-100 text-gray-600',
  MEDIA: 'bg-primary-100 text-primary-600',
  ALTA: 'bg-warning-100 text-warning-600',
  CRITICA: 'bg-danger-100 text-danger-600',
};

const priorityLabels: Record<string, string> = {
  BASSA: 'Bassa',
  MEDIA: 'Media',
  ALTA: 'Alta',
  CRITICA: 'Critica',
};

const krStatusColors: Record<string, string> = {
  NON_INIZIATO: 'text-gray-500',
  IN_PROGRESSO: 'text-primary-600',
  ON_TRACK: 'text-success-500',
  AT_RISK: 'text-warning-500',
  COMPLETATO: 'text-success-600',
};

export function OkrList() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const canCreate = user && ['ADMIN', 'MANAGER_OKR', 'TEAM_LEAD'].includes(user.role);
  const canDelete = user && ['ADMIN', 'MANAGER_OKR'].includes(user.role);
  const canManageActions = user && ['ADMIN', 'MANAGER_OKR', 'TEAM_LEAD'].includes(user.role);

  const [filters, setFilters] = useState<OkrFilters>({ page: 1, limit: 10 });
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [expandedOkrs, setExpandedOkrs] = useState<Set<string>>(new Set());
  const [expandedKrs, setExpandedKrs] = useState<Set<string>>(new Set());

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['okrs', filters],
    queryFn: () => okrService.getAll(filters).then(r => r.data),
  });

  const { data: teams } = useQuery({
    queryKey: ['teams'],
    queryFn: () => teamService.getAll().then(r => r.data),
  });

  const handleSearch = () => {
    setFilters(f => ({ ...f, search, page: 1 }));
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Sei sicuro di voler eliminare questo OKR?')) return;
    await okrService.delete(id);
    refetch();
  };

  const toggleOkr = (okrId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedOkrs(prev => {
      const next = new Set(prev);
      if (next.has(okrId)) next.delete(okrId);
      else next.add(okrId);
      return next;
    });
  };

  const toggleKr = (krId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedKrs(prev => {
      const next = new Set(prev);
      if (next.has(krId)) next.delete(krId);
      else next.add(krId);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">OKR</h1>
          <p className="text-gray-500 text-sm">
            {data?.pagination?.total || 0} risultati
          </p>
        </div>
        {canCreate && (
          <button
            onClick={() => navigate('/okrs/new')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> Nuovo OKR
          </button>
        )}
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Cerca per titolo o descrizione..."
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none text-sm"
            />
          </div>
          <button
            onClick={handleSearch}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700"
          >
            Cerca
          </button>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-3 py-2 border rounded-lg text-sm flex items-center gap-1 ${showFilters ? 'border-primary-500 text-primary-600 bg-primary-50' : 'border-gray-300 text-gray-600'}`}
          >
            <Filter className="w-4 h-4" /> Filtri
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-gray-200">
            <select
              value={filters.status || ''}
              onChange={(e) => setFilters(f => ({ ...f, status: e.target.value || undefined, page: 1 }))}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Tutti gli stati</option>
              {Object.entries(statusLabels).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select
              value={filters.priority || ''}
              onChange={(e) => setFilters(f => ({ ...f, priority: e.target.value || undefined, page: 1 }))}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Tutte le priorita</option>
              {Object.entries(priorityLabels).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select
              value={filters.teamId || ''}
              onChange={(e) => setFilters(f => ({ ...f, teamId: e.target.value || undefined, page: 1 }))}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Tutti i team</option>
              {teams?.map((t: any) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin w-6 h-6 border-4 border-primary-600 border-t-transparent rounded-full" />
          </div>
        ) : data?.data?.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="w-8 px-2 py-3"></th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Titolo</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Team</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Stato</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Progresso</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Priorita</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Periodo</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.data.map((okr: any) => {
                  const isOkrExpanded = expandedOkrs.has(okr.id);
                  return (
                    <React.Fragment key={okr.id}>
                      <tr
                        className="hover:bg-gray-50 cursor-pointer transition-colors"
                        onClick={() => navigate(`/okrs/${okr.id}`)}
                      >
                        <td className="px-2 py-3 text-center">
                          <button
                            onClick={(e) => toggleOkr(okr.id, e)}
                            className="p-0.5 text-gray-400 hover:text-primary-600 rounded transition-colors"
                            title={isOkrExpanded ? 'Comprimi' : 'Espandi KR'}
                          >
                            {isOkrExpanded
                              ? <ChevronDown className="w-4 h-4" />
                              : <ArrowRight className="w-4 h-4" />
                            }
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900 truncate max-w-xs">{okr.title}</p>
                          <p className="text-xs text-gray-500">{okr.owner?.firstName} {okr.owner?.lastName}</p>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <span className="text-gray-600">{okr.team?.name || '-'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusColors[okr.status]}`}>
                            {statusLabels[okr.status]}
                          </span>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <div className="flex items-center gap-2 w-28">
                            <div className="flex-1 bg-gray-100 rounded-full h-2">
                              <div
                                className="bg-primary-600 h-2 rounded-full"
                                style={{ width: `${okr.progressPercentage}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-500 w-8">{Math.round(okr.progressPercentage)}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <span className={`text-xs font-medium px-2 py-1 rounded-full ${priorityColors[okr.priority]}`}>
                            {priorityLabels[okr.priority]}
                          </span>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell text-gray-600">
                          {okr.period}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => navigate(`/okrs/${okr.id}`)}
                              className="p-1.5 text-gray-400 hover:text-primary-600 rounded"
                              title="Visualizza"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {canCreate && (
                              <button
                                onClick={() => navigate(`/okrs/${okr.id}/edit`)}
                                className="p-1.5 text-gray-400 hover:text-primary-600 rounded"
                                title="Modifica"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                            )}
                            {canDelete && (
                              <button
                                onClick={(e) => handleDelete(okr.id, e)}
                                className="p-1.5 text-gray-400 hover:text-danger-500 rounded"
                                title="Elimina"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expanded KR rows */}
                      {isOkrExpanded && (
                        <tr key={`${okr.id}-expanded`} className="bg-gray-50/50">
                          <td colSpan={8} className="px-0 py-0">
                            <ExpandedOkrContent
                              okrId={okr.id}
                              expandedKrs={expandedKrs}
                              onToggleKr={toggleKr}
                              canManageActions={!!canManageActions}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500">Nessun OKR trovato</p>
          </div>
        )}

        {/* Pagination */}
        {data?.pagination && data.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              Pagina {data.pagination.page} di {data.pagination.totalPages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setFilters(f => ({ ...f, page: (f.page || 1) - 1 }))}
                disabled={data.pagination.page <= 1}
                className="p-2 border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setFilters(f => ({ ...f, page: (f.page || 1) + 1 }))}
                disabled={data.pagination.page >= data.pagination.totalPages}
                className="p-2 border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ExpandedOkrContent({
  okrId,
  expandedKrs,
  onToggleKr,
  canManageActions,
}: {
  okrId: string;
  expandedKrs: Set<string>;
  onToggleKr: (krId: string, e: React.MouseEvent) => void;
  canManageActions: boolean;
}) {
  const qc = useQueryClient();
  const { data: okr, isLoading } = useQuery({
    queryKey: ['okr', okrId],
    queryFn: () => okrService.getById(okrId).then(r => r.data),
  });

  const toggleActionMutation = useMutation({
    mutationFn: ({ krId, actionId, isCompleted }: { krId: string; actionId: string; isCompleted: boolean }) =>
      okrService.updateAction(okrId, krId, actionId, { isCompleted }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['okr', okrId] }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <div className="animate-spin w-4 h-4 border-2 border-primary-600 border-t-transparent rounded-full" />
        <span className="ml-2 text-xs text-gray-500">Caricamento Key Results...</span>
      </div>
    );
  }

  if (!okr?.keyResults?.length) {
    return <p className="px-8 py-3 text-xs text-gray-400 italic">Nessun Key Result definito</p>;
  }

  return (
    <div className="pl-10 pr-4 py-2 space-y-1">
      {okr.keyResults.map((kr: any) => {
        const isKrExpanded = expandedKrs.has(kr.id);
        const range = kr.targetMetric - kr.initialMetric;
        const progress = range !== 0
          ? Math.min(Math.max(((kr.currentMetric - kr.initialMetric) / range) * 100, 0), 100)
          : 100;
        return (
          <div key={kr.id} className="border border-gray-100 rounded-lg bg-white">
            <div className="flex items-center gap-2 px-3 py-2">
              <button
                onClick={(e) => onToggleKr(kr.id, e)}
                className="p-0.5 text-gray-300 hover:text-primary-500 rounded flex-shrink-0"
              >
                {isKrExpanded
                  ? <ChevronDown className="w-3.5 h-3.5" />
                  : <ArrowRight className="w-3.5 h-3.5" />
                }
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <p className="text-sm font-medium text-gray-800 truncate">{kr.title}</p>
                  <span className={`text-xs flex-shrink-0 ${krStatusColors[kr.status]}`}>
                    {kr.status.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 bg-gray-100 rounded-full h-1.5 max-w-32">
                    <div
                      className="bg-primary-500 h-1.5 rounded-full"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-400">
                    {kr.currentMetric}/{kr.targetMetric} {kr.unit} — {Math.round(progress)}%
                  </span>
                </div>
              </div>
              {kr.actions?.length > 0 && (
                <span className="text-xs text-gray-400 flex-shrink-0">
                  {kr.actions.filter((a: any) => a.isCompleted).length}/{kr.actions.length} azioni
                </span>
              )}
            </div>

            {isKrExpanded && (
              <div className="px-8 pb-2 pt-1 border-t border-gray-50">
                {!kr.actions?.length ? (
                  <p className="text-xs text-gray-400 italic py-1">Nessuna azione definita</p>
                ) : (
                  <div className="space-y-1">
                    {kr.actions.map((action: any) => (
                      <div key={action.id} className="flex items-center gap-2 py-0.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (canManageActions) {
                              toggleActionMutation.mutate({
                                krId: kr.id,
                                actionId: action.id,
                                isCompleted: !action.isCompleted,
                              });
                            }
                          }}
                          disabled={!canManageActions}
                          className="flex-shrink-0 text-gray-400 hover:text-primary-600 disabled:cursor-default disabled:hover:text-gray-400"
                        >
                          {action.isCompleted
                            ? <CheckSquare className="w-3.5 h-3.5 text-success-500" />
                            : <Square className="w-3.5 h-3.5" />
                          }
                        </button>
                        <span className={`text-xs ${action.isCompleted ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                          {action.title}
                        </span>
                        {action.dueDate && (
                          <span className="text-xs text-gray-400 ml-1">
                            ({new Date(action.dueDate).toLocaleDateString('it-IT')})
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
