import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CheckSquare, Pencil, Square, Trash2 } from 'lucide-react';
import { errorKey } from '../../lib/errors';
import {
  actionSchema, KR_STATUSES, keyResultSchema,
  type ActionData, type ActionInput, type KeyResultData, type KeyResultInput,
} from '../../schemas/okr';
import {
  createAction, deleteAction, deleteKeyResult, krCheckIn, updateAction, updateKeyResult,
  type Action, type KeyResult,
} from '../../services/okr.service';
import { memberName, type Member } from '../../services/lookups.service';
import { ConfirmDialog } from '../ConfirmDialog';
import { ErrorNote } from '../ui/ErrorNote';
import { Field, btnPrimary, btnSecondary, inputCls } from '../ui/Field';

interface UpdateRow {
  id: string;
  key_result_id: string;
  old_value: number | null;
  new_value: number | null;
  note: string | null;
  created_at: string;
}

interface Props {
  kr: KeyResult;
  actions: Action[];
  updates: UpdateRow[];
  members: Member[];
  orgId: string;
  canEdit: boolean;
  /** Rilegge l'OKR (KR, azioni, avanzamento calcolato dal database). */
  onChanged: () => Promise<unknown> | void;
}

/** Esegue un'operazione, poi ricarica; gli errori diventano una chiave i18n. */
function useOp(onChanged: Props['onChanged']) {
  const [error, setError] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => {
      await fn();
    },
    onSuccess: async () => {
      setError(null);
      await onChanged();
    },
    onError: (err) => setError(errorKey(err)),
  });
  return { error, run: (fn: () => Promise<unknown>) => m.mutateAsync(fn).then(() => true, () => false), pending: m.isPending, reload: () => void onChanged() };
}

function CheckInForm({ kr, canEdit, op }: { kr: KeyResult; canEdit: boolean; op: ReturnType<typeof useOp> }) {
  const { t } = useTranslation();
  const [value, setValue] = useState(String(kr.current_metric));
  const [note, setNote] = useState('');
  if (!canEdit) return null;
  const valid = value.trim() !== '' && Number.isFinite(Number(value));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void op.run(() => krCheckIn(kr.id, Number(value), note.trim())).then((ok) => ok && setNote(''));
      }}
      className="mt-3 flex flex-wrap items-end gap-2"
    >
      <div>
        <label className="block text-xs text-gray-600 mb-1">{t('okr.krCurrent')} ({kr.unit})</label>
        <input type="number" step="any" value={value} onChange={(e) => setValue(e.target.value)} className="w-28 px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
      </div>
      <div className="flex-1 min-w-40">
        <label className="block text-xs text-gray-600 mb-1">{t('okr.checkInNote')}</label>
        <input value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
      </div>
      <button type="submit" disabled={!valid || op.pending} className={btnPrimary}>{t('okr.checkIn')}</button>
    </form>
  );
}

function KrEditForm({ kr, op, onClose }: { kr: KeyResult; op: ReturnType<typeof useOp>; onClose: () => void }) {
  const { t } = useTranslation();
  const { register, handleSubmit, formState: { errors } } = useForm<KeyResultInput, unknown, KeyResultData>({
    resolver: zodResolver(keyResultSchema),
    defaultValues: {
      title: kr.title, description: kr.description ?? '', unit: kr.unit, initial_metric: kr.initial_metric,
      target_metric: kr.target_metric, weight: kr.weight, status: kr.status,
    },
  });
  const msg = (m?: string) => (m ? <p className="mt-1 text-sm text-danger-500">{t(m)}</p> : null);
  return (
    <form
      onSubmit={handleSubmit((d) => void op.run(() => updateKeyResult(kr.organization_id, kr.id, kr.version, d)).then((ok) => ok && onClose()))}
      className="space-y-3"
      noValidate
    >
      <Field label={t('okr.krTitle')} error={errors.title?.message}>
        <input {...register('title')} className={inputCls} />
      </Field>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Field label={t('okr.krUnit')}><input {...register('unit')} className={inputCls} /></Field>
        <Field label={t('okr.krInitial')} error={errors.initial_metric?.message}>
          <input type="number" step="any" {...register('initial_metric')} className={inputCls} />
        </Field>
        <Field label={t('okr.krTarget')}><input type="number" step="any" {...register('target_metric')} className={inputCls} />{msg(errors.target_metric?.message)}</Field>
        <Field label={t('okr.krWeight')} error={errors.weight?.message}>
          <input type="number" step="any" min="0" {...register('weight')} className={inputCls} />
        </Field>
        <Field label={t('okr.krStatus')}>
          <select {...register('status')} className={inputCls}>
            {KR_STATUSES.map((s) => <option key={s} value={s}>{t(`krStatus.${s}`)}</option>)}
          </select>
        </Field>
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={op.pending} className={btnPrimary}>{t('app.save')}</button>
        <button type="button" onClick={onClose} className={btnSecondary}>{t('app.cancel')}</button>
      </div>
    </form>
  );
}

function ActionForm({ kr, members, op }: { kr: KeyResult; members: Member[]; op: ReturnType<typeof useOp> }) {
  const { t } = useTranslation();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<ActionInput, unknown, ActionData>({
    resolver: zodResolver(actionSchema),
    defaultValues: { title: '', description: '', due_date: '', assignee_id: '' },
  });
  return (
    <form
      onSubmit={handleSubmit((d) => void op.run(() => createAction(kr.organization_id, kr.id, d)).then((ok) => ok && reset()))}
      className="mt-2 grid sm:grid-cols-[1fr_9rem_10rem_auto] gap-2 items-start"
      noValidate
    >
      <div>
        <input aria-label={t('okr.actionTitle')} placeholder={t('okr.actionTitle')} {...register('title')} className={inputCls} />
        {errors.title?.message && <p className="mt-1 text-sm text-danger-500">{t(errors.title.message)}</p>}
      </div>
      <input type="date" aria-label={t('okr.dueDate')} {...register('due_date')} className={inputCls} />
      <select aria-label={t('okr.assignee')} {...register('assignee_id')} className={inputCls}>
        <option value="">{t('okr.unassigned')}</option>
        {members.map((m) => <option key={m.user_id} value={m.user_id}>{memberName(m)}</option>)}
      </select>
      <button type="submit" disabled={op.pending} className={btnPrimary}>{t('okr.addAction')}</button>
    </form>
  );
}

export function KeyResultCard({ kr, actions, updates, members, orgId, canEdit, onChanged }: Props) {
  const { t } = useTranslation();
  const op = useOp(onChanged);
  const [editing, setEditing] = useState(false);
  const [confirmKr, setConfirmKr] = useState(false);
  const [actionToDelete, setActionToDelete] = useState<Action | null>(null);
  const done = actions.filter((a) => a.is_completed).length;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      {editing ? (
        <KrEditForm kr={kr} op={op} onClose={() => setEditing(false)} />
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <p className="font-medium text-gray-900">{kr.title}</p>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-xs text-gray-500 mr-2">{t(`krStatus.${kr.status}`)}</span>
              {canEdit && (
                <>
                  <button type="button" onClick={() => setEditing(true)} title={t('okr.krEdit')} aria-label={t('okr.krEdit')} className="p-1.5 text-gray-500 hover:text-primary-700 rounded">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => setConfirmKr(true)} title={t('okr.krDelete')} aria-label={t('okr.krDelete')} className="p-1.5 text-gray-500 hover:text-danger-500 rounded">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>
          <p className="text-sm text-gray-600 mt-1 tabular-nums">
            {kr.initial_metric} → {kr.current_metric} / {kr.target_metric} {kr.unit} · {t('okr.krWeight')} {kr.weight}
          </p>
        </>
      )}

      <CheckInForm key={`${kr.id}-${kr.current_metric}`} kr={kr} canEdit={canEdit && !editing} op={op} />

      <div className="mt-4">
        <p className="text-sm font-medium text-gray-700">
          {t('okr.actions')} <span className="text-gray-400">({done}/{actions.length})</span>
        </p>
        <ul className="mt-1 divide-y divide-gray-100">
          {actions.map((a) => (
            <li key={a.id} className="py-1.5 flex items-center gap-2 text-sm">
              <button
                type="button"
                disabled={!canEdit || op.pending}
                onClick={() => void op.run(() => updateAction(orgId, a.id, a.version, { is_completed: !a.is_completed }))}
                aria-label={a.title}
                aria-pressed={a.is_completed}
                className="text-gray-500 disabled:cursor-default"
              >
                {a.is_completed ? <CheckSquare className="w-4 h-4 text-success-500" /> : <Square className="w-4 h-4" />}
              </button>
              <span className={`flex-1 ${a.is_completed ? 'line-through text-gray-400' : 'text-gray-800'}`}>{a.title}</span>
              {a.due_date && <span className="text-xs text-gray-500">{a.due_date}</span>}
              <span className="text-xs text-gray-500">{a.assignee_id ? memberName(members.find((m) => m.user_id === a.assignee_id)) : t('okr.unassigned')}</span>
              {canEdit && (
                <button type="button" onClick={() => setActionToDelete(a)} aria-label={t('okr.delete')} title={t('okr.delete')} className="p-1 text-gray-400 hover:text-danger-500">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
        {canEdit && <ActionForm kr={kr} members={members} op={op} />}
      </div>

      {updates.length > 0 && (
        <details className="mt-3">
          <summary className="text-sm text-gray-600 cursor-pointer">{t('okr.history')} ({updates.length})</summary>
          <ul className="mt-1 text-xs text-gray-600 space-y-0.5">
            {updates.map((u) => (
              <li key={u.id} className="flex flex-wrap gap-x-3">
                <span className="text-gray-500">{new Date(u.created_at).toLocaleString()}</span>
                <span className="tabular-nums">{u.old_value ?? '—'} → {u.new_value ?? '—'}</span>
                {u.note && <span>{u.note}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="mt-2"><ErrorNote errorKey={op.error} onReload={op.reload} /></div>

      <ConfirmDialog
        isOpen={confirmKr}
        title={t('okr.krDeleteTitle')}
        message={t('okr.krDeleteText', { title: kr.title })}
        confirmText={t('okr.delete')}
        cancelText={t('app.cancel')}
        isLoading={op.pending}
        onConfirm={() => void op.run(() => deleteKeyResult(orgId, kr.id)).then(() => setConfirmKr(false))}
        onCancel={() => setConfirmKr(false)}
      />
      <ConfirmDialog
        isOpen={actionToDelete !== null}
        title={t('okr.actionDeleteTitle')}
        message={actionToDelete?.title ?? ''}
        confirmText={t('okr.delete')}
        cancelText={t('app.cancel')}
        isLoading={op.pending}
        onConfirm={() => actionToDelete && void op.run(() => deleteAction(orgId, actionToDelete.id)).then(() => setActionToDelete(null))}
        onCancel={() => setActionToDelete(null)}
      />
    </div>
  );
}
