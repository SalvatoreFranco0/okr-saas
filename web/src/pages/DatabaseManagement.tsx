import { Fragment, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from '../services/admin.service';
import { okrService } from '../services/okr.service';
import type { OkrFilters } from '../services/okr.service';
import { Pencil, Check, X, ChevronLeft, ChevronRight, Plus } from 'lucide-react';

const krStatusOptions = ['NON_INIZIATO', 'IN_PROGRESSO', 'ON_TRACK', 'AT_RISK', 'COMPLETATO'];
const okrStatusOptions = ['IN_PIANIFICAZIONE', 'ATTIVO', 'IN_PAUSA', 'COMPLETATO', 'NON_RAGGIUNTO'];
const okrPriorityOptions = ['BASSA', 'MEDIA', 'ALTA', 'CRITICA'];

type Tab = 'okr' | 'kr' | 'azioni';

export function DatabaseManagement() {
  const [activeTab, setActiveTab] = useState<Tab>('okr');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Record<string, unknown>>({});
  const [editingKr, setEditingKr] = useState<any>(null);
  const [newActionForm, setNewActionForm] = useState({ title: '', dueDate: '' });
  const [okrPage, setOkrPage] = useState(1);
  const [krPage, setKrPage] = useState(1);
  const [actionPage, setActionPage] = useState(1);
  const queryClient = useQueryClient();

  const okrFilters: OkrFilters = { page: okrPage, limit: 20 };
  const { data: okrData, isLoading: okrLoading } = useQuery({
    queryKey: ['admin-okrs', okrPage],
    queryFn: () => okrService.getAll(okrFilters).then(r => r.data),
    enabled: activeTab === 'okr',
  });

  const { data: krData, isLoading: krLoading } = useQuery({
    queryKey: ['admin-krs', krPage],
    queryFn: () => adminService.getKeyResults(krPage).then(r => r.data),
    enabled: activeTab === 'kr',
  });

  const { data: actionData, isLoading: actionLoading } = useQuery({
    queryKey: ['admin-actions', actionPage],
    queryFn: () => adminService.getActions(actionPage).then(r => r.data),
    enabled: activeTab === 'azioni',
  });

  const { data: editingKrActions, isLoading: editingKrActionsLoading } = useQuery({
    queryKey: ['kr-actions', editingKr?.id],
    queryFn: () => okrService.getActions(editingKr.okr.id, editingKr.id).then(r => r.data),
    enabled: activeTab === 'kr' && !!editingKr,
  });

  const updateOkrMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      okrService.update(id, data as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-okrs'] });
      setEditingId(null);
    },
  });

  const updateKrMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      adminService.updateKeyResult(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-krs'] });
      setEditingId(null);
    },
  });

  const updateActionMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      adminService.updateAction(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-actions'] });
      setEditingId(null);
    },
  });

  const createActionMutation = useMutation({
    mutationFn: ({ okrId, krId, data }: { okrId: string; krId: string; data: { title: string; dueDate?: string } }) =>
      okrService.createAction(okrId, krId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kr-actions', editingKr?.id] });
      setNewActionForm({ title: '', dueDate: '' });
    },
  });

  const startEdit = (item: any) => {
    setEditingId(item.id);
    setEditData({ ...item });
  };

  const startKrEdit = (kr: any) => {
    startEdit(kr);
    setEditingKr(kr);
    setNewActionForm({ title: '', dueDate: '' });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData({});
    setEditingKr(null);
    setNewActionForm({ title: '', dueDate: '' });
  };

  const saveEdit = (type: Tab) => {
    if (!editingId) return;
    if (type === 'okr') {
      const { title, objective, description, status, priority, period, notes } = editData as any;
      updateOkrMutation.mutate({ id: editingId, data: { title, objective, description, status, priority, period, notes } });
    } else if (type === 'kr') {
      const { title, description, initialMetric, targetMetric, currentMetric, unit, weight, status } = editData as any;
      updateKrMutation.mutate({ id: editingId, data: { title, description, initialMetric, targetMetric, currentMetric, unit, weight, status } });
    } else {
      const { title, description, dueDate, isCompleted } = editData as any;
      updateActionMutation.mutate({ id: editingId, data: { title, description, dueDate: dueDate || null, isCompleted } });
    }
  };

  const handleAddAction = (kr: any) => {
    if (!newActionForm.title.trim()) return;
    createActionMutation.mutate({
      okrId: kr.okr.id,
      krId: kr.id,
      data: { title: newActionForm.title.trim(), dueDate: newActionForm.dueDate || undefined },
    });
  };

  const Field = ({ field, type = 'text', options }: { field: string; type?: string; options?: string[] }) => {
    return type === 'select' ? (
      <select
        value={String(editData[field] ?? '')}
        onChange={(e) => setEditData(d => ({ ...d, [field]: e.target.value }))}
        className="w-full px-2 py-1 border border-primary-300 rounded text-sm outline-none focus:ring-1 focus:ring-primary-500"
      >
        {options?.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    ) : (
      <input
        type={type}
        value={String(editData[field] ?? '')}
        onChange={(e) => setEditData(d => ({ ...d, [field]: e.target.value }))}
        className="w-full px-2 py-1 border border-primary-300 rounded text-sm outline-none focus:ring-1 focus:ring-primary-500"
      />
    );
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'okr', label: 'OKR' },
    { key: 'kr', label: 'Key Results' },
    { key: 'azioni', label: 'Azioni' },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Database</h1>
        <p className="text-gray-500 text-sm">Visualizza e modifica i dati delle tabelle OKR</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setEditingId(null); setEditingKr(null); setNewActionForm({ title: '', dueDate: '' }); }}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === tab.key
                ? 'bg-white border border-b-white border-gray-200 -mb-px text-primary-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* OKR Tab */}
      {activeTab === 'okr' && (
        <TableWrapper
          isLoading={okrLoading}
          pagination={okrData?.pagination}
          onPageChange={setOkrPage}
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2 font-medium text-gray-600">Titolo</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 hidden lg:table-cell">Stato</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 hidden lg:table-cell">Priorità</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 hidden md:table-cell">Periodo</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 hidden xl:table-cell">Progresso</th>
                <th className="text-right px-3 py-2 font-medium text-gray-600">Azione</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {okrData?.data?.map((okr: any) => (
                <tr key={okr.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2">
                    {editingId === okr.id ? (
                      <Field field="title" />
                    ) : (
                      <p className="font-medium text-gray-900 truncate max-w-xs">{okr.title}</p>
                    )}
                  </td>
                  <td className="px-3 py-2 hidden lg:table-cell">
                    {editingId === okr.id ? (
                      <Field field="status" type="select" options={okrStatusOptions} />
                    ) : (
                      <span className="text-xs text-gray-600">{okr.status}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 hidden lg:table-cell">
                    {editingId === okr.id ? (
                      <Field field="priority" type="select" options={okrPriorityOptions} />
                    ) : (
                      <span className="text-xs text-gray-600">{okr.priority}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 hidden md:table-cell">
                    {editingId === okr.id ? (
                      <Field field="period" />
                    ) : (
                      <span className="text-xs text-gray-600">{okr.period}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 hidden xl:table-cell">
                    <span className="text-xs text-gray-500">{Math.round(okr.progressPercentage)}%</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <EditActions
                      isEditing={editingId === okr.id}
                      isSaving={updateOkrMutation.isPending}
                      onEdit={() => startEdit(okr)}
                      onSave={() => saveEdit('okr')}
                      onCancel={cancelEdit}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrapper>
      )}

      {/* KR Tab */}
      {activeTab === 'kr' && (
        <TableWrapper
          isLoading={krLoading}
          pagination={krData?.pagination}
          onPageChange={setKrPage}
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2 font-medium text-gray-600">Titolo</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 hidden md:table-cell">OKR</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 hidden lg:table-cell">Metrica</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 hidden lg:table-cell">Stato</th>
                <th className="text-right px-3 py-2 font-medium text-gray-600">Azione</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {krData?.data?.map((kr: any) => (
                <Fragment key={kr.id}>
                  <tr className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      {editingId === kr.id ? (
                        <Field field="title" />
                      ) : (
                        <p className="font-medium text-gray-900 truncate max-w-xs">{kr.title}</p>
                      )}
                    </td>
                    <td className="px-3 py-2 hidden md:table-cell">
                      <span className="text-xs text-gray-500 truncate max-w-[200px] block">{kr.okr?.title}</span>
                    </td>
                    <td className="px-3 py-2 hidden lg:table-cell">
                      {editingId === kr.id ? (
                        <div className="flex gap-1 items-center">
                          <Field field="currentMetric" type="number" />
                          <span className="text-gray-400">/</span>
                          <Field field="targetMetric" type="number" />
                          <Field field="unit" />
                        </div>
                      ) : (
                        <span className="text-xs text-gray-600">
                          {kr.currentMetric} / {kr.targetMetric} {kr.unit}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 hidden lg:table-cell">
                      {editingId === kr.id ? (
                        <Field field="status" type="select" options={krStatusOptions} />
                      ) : (
                        <span className="text-xs text-gray-600">{kr.status}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <EditActions
                        isEditing={editingId === kr.id}
                        isSaving={updateKrMutation.isPending}
                        onEdit={() => startKrEdit(kr)}
                        onSave={() => saveEdit('kr')}
                        onCancel={cancelEdit}
                      />
                    </td>
                  </tr>
                  {editingId === kr.id && (
                    <tr>
                      <td colSpan={5} className="px-4 pb-3 pt-0 bg-primary-50/40">
                        <div className="border border-dashed border-primary-200 rounded-lg p-3 space-y-2">
                          <p className="text-xs font-semibold text-primary-700 uppercase tracking-wide">
                            Azioni del KR
                          </p>
                          {editingKrActionsLoading ? (
                            <p className="text-xs text-gray-400">Caricamento azioni...</p>
                          ) : !editingKrActions?.length ? (
                            <p className="text-xs text-gray-400 italic">Nessuna azione presente</p>
                          ) : (
                            <ul className="space-y-1">
                              {editingKrActions.map((action: any) => (
                                <li key={action.id} className="flex items-center gap-2 text-xs">
                                  <span className={`${action.isCompleted ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                                    {action.title}
                                  </span>
                                  {action.dueDate && (
                                    <span className="text-gray-400">
                                      · {new Date(action.dueDate).toLocaleDateString('it-IT')}
                                    </span>
                                  )}
                                  {action.assignee && (
                                    <span className="text-gray-400">
                                      · {action.assignee.firstName} {action.assignee.lastName}
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                          <div className="flex gap-2 items-center pt-1">
                            <input
                              type="text"
                              placeholder="Titolo nuova azione..."
                              value={newActionForm.title}
                              onChange={e => setNewActionForm(f => ({ ...f, title: e.target.value }))}
                              onKeyDown={e => { if (e.key === 'Enter') handleAddAction(kr); }}
                              className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs outline-none focus:ring-1 focus:ring-primary-500"
                            />
                            <input
                              type="date"
                              value={newActionForm.dueDate}
                              onChange={e => setNewActionForm(f => ({ ...f, dueDate: e.target.value }))}
                              className="px-2 py-1 border border-gray-300 rounded text-xs outline-none focus:ring-1 focus:ring-primary-500"
                            />
                            <button
                              onClick={() => handleAddAction(kr)}
                              disabled={!newActionForm.title.trim() || createActionMutation.isPending}
                              className="p-1.5 bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Aggiungi azione"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </TableWrapper>
      )}

      {/* Azioni Tab */}
      {activeTab === 'azioni' && (
        <TableWrapper
          isLoading={actionLoading}
          pagination={actionData?.pagination}
          onPageChange={setActionPage}
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2 font-medium text-gray-600">Titolo</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 hidden md:table-cell">KR / OKR</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 hidden lg:table-cell">Scadenza</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 hidden lg:table-cell">Completata</th>
                <th className="text-right px-3 py-2 font-medium text-gray-600">Azione</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {actionData?.data?.map((action: any) => (
                <tr key={action.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2">
                    {editingId === action.id ? (
                      <Field field="title" />
                    ) : (
                      <p className={`font-medium truncate max-w-xs ${action.isCompleted ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                        {action.title}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2 hidden md:table-cell">
                    <p className="text-xs text-gray-500 truncate max-w-[200px]">{action.keyResult?.title}</p>
                    <p className="text-xs text-gray-400 truncate max-w-[200px]">{action.keyResult?.okr?.title}</p>
                  </td>
                  <td className="px-3 py-2 hidden lg:table-cell">
                    {editingId === action.id ? (
                      <Field field="dueDate" type="date" />
                    ) : (
                      <span className="text-xs text-gray-600">
                        {action.dueDate ? new Date(action.dueDate).toLocaleDateString('it-IT') : '-'}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 hidden lg:table-cell">
                    {editingId === action.id ? (
                      <select
                        value={String(editData.isCompleted)}
                        onChange={(e) => setEditData(d => ({ ...d, isCompleted: e.target.value === 'true' }))}
                        className="px-2 py-1 border border-primary-300 rounded text-sm outline-none"
                      >
                        <option value="false">No</option>
                        <option value="true">Sì</option>
                      </select>
                    ) : (
                      <span className={`text-xs font-medium ${action.isCompleted ? 'text-success-600' : 'text-gray-400'}`}>
                        {action.isCompleted ? 'Sì' : 'No'}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <EditActions
                      isEditing={editingId === action.id}
                      isSaving={updateActionMutation.isPending}
                      onEdit={() => startEdit(action)}
                      onSave={() => saveEdit('azioni')}
                      onCancel={cancelEdit}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrapper>
      )}
    </div>
  );
}

function TableWrapper({
  children,
  isLoading,
  pagination,
  onPageChange,
}: {
  children: React.ReactNode;
  isLoading: boolean;
  pagination?: { page: number; totalPages: number; total: number };
  onPageChange: (p: number) => void;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 bg-white rounded-xl border border-gray-200">
        <div className="animate-spin w-6 h-6 border-4 border-primary-600 border-t-transparent rounded-full" />
      </div>
    );
  }
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">{children}</div>
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
          <p className="text-sm text-gray-500">
            Pagina {pagination.page} di {pagination.totalPages} — {pagination.total} record totali
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="p-2 border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => onPageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="p-2 border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function EditActions({
  isEditing,
  isSaving,
  onEdit,
  onSave,
  onCancel,
}: {
  isEditing: boolean;
  isSaving: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  if (isEditing) {
    return (
      <div className="flex items-center justify-end gap-1">
        <button
          onClick={onSave}
          disabled={isSaving}
          className="p-1.5 text-success-600 hover:bg-success-50 rounded disabled:opacity-50"
          title="Salva"
        >
          <Check className="w-4 h-4" />
        </button>
        <button
          onClick={onCancel}
          className="p-1.5 text-gray-400 hover:bg-gray-100 rounded"
          title="Annulla"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }
  return (
    <button
      onClick={onEdit}
      className="p-1.5 text-gray-400 hover:text-primary-600 rounded"
      title="Modifica"
    >
      <Pencil className="w-4 h-4" />
    </button>
  );
}
