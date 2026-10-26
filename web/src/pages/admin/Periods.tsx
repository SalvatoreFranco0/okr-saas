import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useCurrentOrg } from '../../hooks/useCurrentOrg';
import { createPeriod, listPeriodsAdmin, updatePeriod } from '../../services/admin.service';
import { fieldErrors, periodSchema } from '../../schemas/admin';
import { errorKey } from '../../lib/errors';
import { Banner, Field, btnPrimary, btnSecondary, inputCls } from '../../components/ui/Field';

const EMPTY = { name: '', start_date: '', end_date: '' };

/** Periodi: creazione, modifica e chiusura/riapertura (Admin e Manager; la RLS impone gli stessi ruoli). */
export function Periods() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { org } = useCurrentOrg();
  const orgId = org!.id;
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);

  const listQ = useQuery({ queryKey: ['periods', orgId, 'admin'], queryFn: () => listPeriodsAdmin(orgId) });
  const refresh = () =>
    Promise.all([qc.invalidateQueries({ queryKey: ['periods', orgId] }), qc.invalidateQueries({ queryKey: ['okrs', orgId] })]);

  const save = useMutation({
    mutationFn: (d: typeof EMPTY) => (editing ? updatePeriod(orgId, editing, d) : createPeriod(orgId, d)),
    onSuccess: async () => {
      setForm(EMPTY);
      setEditing(null);
      setActionError(null);
      await refresh();
    },
    onError: (e) => setActionError(errorKey(e)),
  });
  const toggle = useMutation({
    mutationFn: (v: { id: string; is_closed: boolean }) => updatePeriod(orgId, v.id, { is_closed: v.is_closed }),
    onSuccess: async () => {
      setActionError(null);
      await refresh();
    },
    onError: (e) => setActionError(errorKey(e)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = periodSchema.safeParse(form);
    if (!r.success) {
      setErrors(fieldErrors(r.error));
      return;
    }
    setErrors({});
    save.mutate(r.data);
  };
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">{t('admin.periods.title')}</h1>
      <p className="text-sm text-gray-500">{t('admin.periods.help')}</p>
      {actionError && <Banner tone="danger">{t(actionError)}</Banner>}

      <form onSubmit={submit} className="bg-white border border-gray-200 rounded-xl p-4 grid sm:grid-cols-4 gap-3 items-end" noValidate>
        <Field id="p_name" label={t('admin.name')} error={errors.name}>
          <input id="p_name" value={form.name} onChange={set('name')} className={inputCls} maxLength={100} />
        </Field>
        <Field id="p_start" label={t('okr.startDate')} error={errors.start_date}>
          <input id="p_start" type="date" value={form.start_date} onChange={set('start_date')} className={inputCls} />
        </Field>
        <Field id="p_end" label={t('okr.endDate')} error={errors.end_date}>
          <input id="p_end" type="date" value={form.end_date} onChange={set('end_date')} className={inputCls} />
        </Field>
        <div className="flex gap-2">
          <button type="submit" disabled={save.isPending} className={btnPrimary}>{editing ? t('app.save') : t('admin.add')}</button>
          {editing && (
            <button type="button" className={btnSecondary} onClick={() => { setEditing(null); setForm(EMPTY); setErrors({}); }}>
              {t('app.cancel')}
            </button>
          )}
        </div>
      </form>

      {listQ.error && <p role="alert" className="text-danger-500">{t(errorKey(listQ.error))}</p>}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-3 font-medium">{t('admin.name')}</th>
              <th className="px-4 py-3 font-medium">{t('admin.periods.range')}</th>
              <th className="px-4 py-3 font-medium">{t('admin.state')}</th>
              <th className="px-4 py-3 font-medium text-right">{t('app.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(listQ.data ?? []).map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                <td className="px-4 py-3 text-gray-600">{p.start_date} → {p.end_date}</td>
                <td className="px-4 py-3">{p.is_closed ? t('admin.periods.closed') : t('admin.periods.open')}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      className={btnSecondary}
                      onClick={() => { setEditing(p.id); setForm({ name: p.name, start_date: p.start_date, end_date: p.end_date }); setErrors({}); }}
                    >
                      {t('okr.edit')}
                    </button>
                    <button type="button" className={btnSecondary} disabled={toggle.isPending} onClick={() => toggle.mutate({ id: p.id, is_closed: !p.is_closed })}>
                      {p.is_closed ? t('admin.periods.reopen') : t('admin.periods.close')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
