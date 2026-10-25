import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { okrService } from '../services/okr.service';
import type { ActionInput } from '../services/okr.service';
import { useAuthStore } from '../stores/authStore';
import { ConfirmDialog } from '../components/ConfirmDialog';
import {
  ArrowLeft,
  Pencil,
  Trash2,
  MessageSquare,
  Send,
  Calendar,
  User as UserIcon,
  Building2,
  Tag,
  CheckSquare,
  Square,
  Plus,
  X,
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

const priorityLabels: Record<string, string> = {
  BASSA: 'Bassa', MEDIA: 'Media', ALTA: 'Alta', CRITICA: 'Critica',
};

const priorityColors: Record<string, string> = {
  BASSA: 'bg-gray-100 text-gray-600',
  MEDIA: 'bg-primary-100 text-primary-600',
  ALTA: 'bg-warning-100 text-warning-600',
  CRITICA: 'bg-danger-100 text-danger-600',
};

const krStatusLabels: Record<string, string> = {
  NON_INIZIATO: 'Non Iniziato',
  IN_PROGRESSO: 'In Progresso',
  ON_TRACK: 'On Track',
  AT_RISK: 'At Risk',
  COMPLETATO: 'Completato',
};

const krStatusColors: Record<string, string> = {
  NON_INIZIATO: 'text-gray-500',
  IN_PROGRESSO: 'text-primary-600',
  ON_TRACK: 'text-success-500',
  AT_RISK: 'text-warning-500',
  COMPLETATO: 'text-success-600',
};

export function OkrDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [comment, setComment] = useState('');
  const [deleteOkrDialog, setDeleteOkrDialog] = useState(false);
  const [deleteKrDialog, setDeleteKrDialog] = useState<{ open: boolean; krId?: string }>({ open: false });
  const [addingActionKrId, setAddingActionKrId] = useState<string | null>(null);
  const [newActionForm, setNewActionForm] = useState<ActionInput>({ title: '' });

  const canEdit = user && ['ADMIN', 'MANAGER_OKR', 'TEAM_LEAD'].includes(user.role);
  const canDelete = user && ['ADMIN', 'MANAGER_OKR'].includes(user.role);
  const canComment = user && user.role !== 'VIEWER';
  const canManageActions = user && ['ADMIN', 'MANAGER_OKR', 'TEAM_LEAD'].includes(user.role);

  const { data: okr, isLoading } = useQuery({
    queryKey: ['okr', id],
    queryFn: () => okrService.getById(id!).then(r => r.data),
    enabled: !!id,
  });

  const addCommentMutation = useMutation({
    mutationFn: () => okrService.addComment(id!, comment),
    onSuccess: () => {
      setComment('');
      queryClient.invalidateQueries({ queryKey: ['okr', id] });
    },
  });

  const deleteOkrMutation = useMutation({
    mutationFn: () => okrService.delete(id!),
    onSuccess: () => {
      navigate('/okrs');
    },
  });

  const deleteKrMutation = useMutation({
    mutationFn: () => okrService.deleteKeyResult(id!, deleteKrDialog.krId!),
    onSuccess: () => {
      setDeleteKrDialog({ open: false });
      queryClient.invalidateQueries({ queryKey: ['okr', id] });
    },
  });

  const createActionMutation = useMutation({
    mutationFn: ({ krId, data }: { krId: string; data: ActionInput }) =>
      okrService.createAction(id!, krId, data),
    onSuccess: () => {
      setAddingActionKrId(null);
      setNewActionForm({ title: '' });
      queryClient.invalidateQueries({ queryKey: ['okr', id] });
    },
  });

  const toggleActionMutation = useMutation({
    mutationFn: ({ krId, actionId, isCompleted }: { krId: string; actionId: string; isCompleted: boolean }) =>
      okrService.updateAction(id!, krId, actionId, { isCompleted }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['okr', id] }),
  });

  const deleteActionMutation = useMutation({
    mutationFn: ({ krId, actionId }: { krId: string; actionId: string }) =>
      okrService.deleteAction(id!, krId, actionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['okr', id] }),
  });

  const handleDeleteOkr = () => {
    deleteOkrMutation.mutate();
  };

  const handleDeleteKr = (krId: string) => {
    setDeleteKrDialog({ open: true, krId });
  };

  const confirmDeleteKr = () => {
    deleteKrMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!okr) {
    return <div className="text-center py-12 text-gray-500">OKR non trovato</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Back + Actions */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/okrs')}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="w-4 h-4" /> Torna alla lista
        </button>
        <div className="flex gap-2">
          {canEdit && (
            <button
              onClick={() => navigate(`/okrs/${id}/edit`)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <Pencil className="w-3.5 h-3.5" /> Modifica
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => setDeleteOkrDialog(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-danger-500 text-danger-500 rounded-lg hover:bg-danger-50"
            >
              <Trash2 className="w-3.5 h-3.5" /> Elimina
            </button>
          )}
        </div>
      </div>

      {/* Header Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{okr.title}</h1>
            <p className="text-gray-600 mt-1">{okr.objective}</p>
          </div>
          <div className="flex gap-2">
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusColors[okr.status]}`}>
              {statusLabels[okr.status]}
            </span>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${priorityColors[okr.priority]}`}>
              {priorityLabels[okr.priority]}
            </span>
          </div>
        </div>

        {okr.description && (
          <p className="text-sm text-gray-600 mb-4">{okr.description}</p>
        )}

        {/* Progress Bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-gray-600">Progresso complessivo</span>
            <span className="font-semibold text-gray-900">{Math.round(okr.progressPercentage)}%</span>
          </div>
          <div className="bg-gray-100 rounded-full h-3">
            <div
              className="bg-primary-600 h-3 rounded-full transition-all"
              style={{ width: `${okr.progressPercentage}%` }}
            />
          </div>
        </div>

        {/* Meta */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div className="flex items-center gap-2 text-gray-600">
            <UserIcon className="w-4 h-4" />
            <span>{okr.owner?.firstName} {okr.owner?.lastName}</span>
          </div>
          {okr.team && (
            <div className="flex items-center gap-2 text-gray-600">
              <Building2 className="w-4 h-4" />
              <span>{okr.team.name}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-gray-600">
            <Calendar className="w-4 h-4" />
            <span>{okr.period}</span>
          </div>
          <div className="flex items-center gap-2 text-gray-600">
            <Calendar className="w-4 h-4" />
            <span>{new Date(okr.startDate).toLocaleDateString('it-IT')} - {new Date(okr.endDate).toLocaleDateString('it-IT')}</span>
          </div>
        </div>

        {okr.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-4">
            {okr.tags.map((tag: string) => (
              <span key={tag} className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                <Tag className="w-3 h-3" /> {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Key Results */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Key Results ({okr.keyResults?.length || 0})
        </h2>
        {okr.keyResults?.length > 0 ? (
          <div className="space-y-4">
            {okr.keyResults.map((kr: any) => {
              const range = kr.targetMetric - kr.initialMetric;
              const progress = range !== 0
                ? Math.min(Math.max(((kr.currentMetric - kr.initialMetric) / range) * 100, 0), 100)
                : 100;
              return (
                <div key={kr.id} className="border border-gray-100 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-medium text-gray-900">{kr.title}</p>
                      {kr.description && <p className="text-xs text-gray-500 mt-0.5">{kr.description}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium ${krStatusColors[kr.status]}`}>
                        {krStatusLabels[kr.status]}
                      </span>
                      {canDelete && (
                        <button
                          onClick={() => handleDeleteKr(kr.id)}
                          className="p-1.5 text-gray-400 hover:text-danger-600 hover:bg-danger-50 rounded-lg transition-colors"
                          title="Elimina Key Result"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          kr.status === 'AT_RISK' ? 'bg-warning-500' :
                          kr.status === 'COMPLETATO' ? 'bg-success-500' : 'bg-primary-600'
                        }`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 whitespace-nowrap">
                      {kr.currentMetric} / {kr.targetMetric} {kr.unit}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>Peso: {kr.weight}%</span>
                    <span>{Math.round(progress)}%</span>
                  </div>

                  {/* Actions */}
                  {(kr.actions?.length > 0 || canManageActions) && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                          Azioni ({kr.actions?.length || 0})
                        </span>
                        {canManageActions && (
                          <button
                            onClick={() => {
                              setAddingActionKrId(addingActionKrId === kr.id ? null : kr.id);
                              setNewActionForm({ title: '' });
                            }}
                            className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700"
                          >
                            <Plus className="w-3.5 h-3.5" /> Aggiungi
                          </button>
                        )}
                      </div>

                      {kr.actions?.map((action: any) => (
                        <div key={action.id} className="flex items-start gap-2 py-1.5 group">
                          <button
                            onClick={() => toggleActionMutation.mutate({
                              krId: kr.id,
                              actionId: action.id,
                              isCompleted: !action.isCompleted,
                            })}
                            disabled={!canManageActions}
                            className="mt-0.5 flex-shrink-0 text-gray-400 hover:text-primary-600 disabled:cursor-default disabled:hover:text-gray-400"
                          >
                            {action.isCompleted
                              ? <CheckSquare className="w-4 h-4 text-success-500" />
                              : <Square className="w-4 h-4" />
                            }
                          </button>
                          <div className="flex-1 min-w-0">
                            <span className={`text-sm ${action.isCompleted ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                              {action.title}
                            </span>
                            {action.description && (
                              <p className="text-xs text-gray-400 truncate">{action.description}</p>
                            )}
                            <div className="flex gap-3 text-xs text-gray-400 mt-0.5">
                              {action.dueDate && (
                                <span>{new Date(action.dueDate).toLocaleDateString('it-IT')}</span>
                              )}
                              {action.assignee && (
                                <span>{action.assignee.firstName} {action.assignee.lastName}</span>
                              )}
                            </div>
                          </div>
                          {canManageActions && (
                            <button
                              onClick={() => deleteActionMutation.mutate({ krId: kr.id, actionId: action.id })}
                              className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-danger-500 flex-shrink-0"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}

                      {addingActionKrId === kr.id && (
                        <div className="mt-2 space-y-2 p-2 bg-gray-50 rounded-lg">
                          <input
                            autoFocus
                            value={newActionForm.title}
                            onChange={(e) => setNewActionForm(f => ({ ...f, title: e.target.value }))}
                            placeholder="Titolo azione *"
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-primary-500 outline-none"
                          />
                          <input
                            value={newActionForm.description || ''}
                            onChange={(e) => setNewActionForm(f => ({ ...f, description: e.target.value }))}
                            placeholder="Descrizione (opzionale)"
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-primary-500 outline-none"
                          />
                          <input
                            type="date"
                            value={newActionForm.dueDate || ''}
                            onChange={(e) => setNewActionForm(f => ({ ...f, dueDate: e.target.value || undefined }))}
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-primary-500 outline-none"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                if (newActionForm.title.trim()) {
                                  createActionMutation.mutate({ krId: kr.id, data: newActionForm });
                                }
                              }}
                              disabled={!newActionForm.title.trim() || createActionMutation.isPending}
                              className="px-3 py-1 bg-primary-600 text-white text-xs rounded hover:bg-primary-700 disabled:opacity-50"
                            >
                              Salva
                            </button>
                            <button
                              onClick={() => setAddingActionKrId(null)}
                              className="px-3 py-1 border border-gray-300 text-gray-600 text-xs rounded hover:bg-gray-50"
                            >
                              Annulla
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-500">Nessun Key Result definito</p>
        )}
      </div>

      {/* Alignments */}
      {(okr.parentAlignments?.length > 0 || okr.childAlignments?.length > 0) && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Allineamenti</h2>
          {okr.parentAlignments?.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-medium text-gray-500 uppercase mb-2">OKR Superiori</p>
              {okr.parentAlignments.map((a: any) => (
                <button
                  key={a.parentOkr.id}
                  onClick={() => navigate(`/okrs/${a.parentOkr.id}`)}
                  className="block text-sm text-primary-600 hover:underline"
                >
                  {a.parentOkr.title}
                </button>
              ))}
            </div>
          )}
          {okr.childAlignments?.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase mb-2">OKR Subordinati</p>
              {okr.childAlignments.map((a: any) => (
                <button
                  key={a.childOkr.id}
                  onClick={() => navigate(`/okrs/${a.childOkr.id}`)}
                  className="block text-sm text-primary-600 hover:underline"
                >
                  {a.childOkr.title}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Comments */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <MessageSquare className="w-5 h-5" /> Commenti ({okr.comments?.length || 0})
        </h2>

        {canComment && (
          <div className="flex gap-2 mb-4">
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && comment.trim() && addCommentMutation.mutate()}
              placeholder="Scrivi un commento..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
            />
            <button
              onClick={() => comment.trim() && addCommentMutation.mutate()}
              disabled={!comment.trim() || addCommentMutation.isPending}
              className="px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        )}

        {okr.comments?.length > 0 ? (
          <div className="space-y-3">
            {okr.comments.map((c: any) => (
              <div key={c.id} className="flex gap-3">
                <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <UserIcon className="w-4 h-4 text-gray-500" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">
                      {c.user?.firstName} {c.user?.lastName}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(c.createdAt).toLocaleDateString('it-IT', {
                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-0.5">{c.content}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">Nessun commento</p>
        )}
      </div>

      {/* Delete OKR Dialog */}
      <ConfirmDialog
        isOpen={deleteOkrDialog}
        title="Elimina OKR"
        message={`Sei sicuro di voler eliminare l'OKR "${okr?.title}"? Questa azione è irreversibile.`}
        confirmText="Elimina OKR"
        cancelText="Annulla"
        isDangerous
        isLoading={deleteOkrMutation.isPending}
        onConfirm={handleDeleteOkr}
        onCancel={() => setDeleteOkrDialog(false)}
      />

      {/* Delete KR Dialog */}
      <ConfirmDialog
        isOpen={deleteKrDialog.open}
        title="Elimina Key Result"
        message={`Sei sicuro di voler eliminare questo Key Result? Questa azione è irreversibile.`}
        confirmText="Elimina KR"
        cancelText="Annulla"
        isDangerous
        isLoading={deleteKrMutation.isPending}
        onConfirm={confirmDeleteKr}
        onCancel={() => setDeleteKrDialog({ open: false })}
      />
    </div>
  );
}
