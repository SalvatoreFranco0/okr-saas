import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useCurrentOrg } from '../../hooks/useCurrentOrg';
import { createLocation, listLocationsAdmin, updateLocation } from '../../services/admin.service';
import { fieldErrors, locationSchema } from '../../schemas/admin';
import { orNull } from '../../schemas/okr';
import { errorKey } from '../../lib/errors';
import { Banner, Field, btnPrimary, btnSecondary, inputCls } from '../../components/ui/Field';

const EMPTY = { name: '', address: '' };

/** Sedi: creazione, modifica e disattivazione (solo Admin; le sedi non si cancellano). */
export function Locations() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { org } = useCurrentOrg();
  const orgId = org!.id;
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);

  const listQ = useQuery({ queryKey: ['locations', orgId, 'admin'], queryFn: () => listLocationsAdmin(orgId) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['locations', orgId] });

  const save = useMutation({
    mutationFn: (d: typeof EMPTY) =>
      editing ? updateLocation(orgId, editing, { name: d.name, address: orNull(d.address) }) : createLocation(orgId, d),
    onSuccess: async () => {
      setForm(EMPTY);
      setEditing(null);
      setActionError(null);
      await refresh();
    },
    onError: (e) => setActionError(errorKey(e)),
  });
  const toggle = useMutation({
    mutationFn: (v: { id: string; is_active: boolean }) => updateLocation(orgId, v.id, { is_active: v.is_active }),
    onSuccess: async () => {
      setActionError(null);
      await refresh();
    },
    onError: (e) => setActionError(errorKey(e)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = locationSchema.safeParse(form);
    if (!r.success) {
      setErrors(fieldErrors(r.error));
      return;
    }
    setErrors({});
    save.mutate(r.data);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">{t('admin.locations.title')}</h1>
      <p className="text-sm text-gray-500">{t('admin.locations.help')}</p>
      {actionError && <Banner tone="danger">{t(actionError)}</Banner>}

      <form onSubmit={submit} className="bg-white border border-gray-200 rounded-xl p-4 grid sm:grid-cols-3 gap-3 items-end" noValidate>
        <Field id="l_name" label={t('admin.name')} error={errors.name}>
          <input id="l_name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={inputCls} maxLength={100} />
        </Field>
        <Field id="l_address" label={t('admin.locations.address')} error={errors.address}>
          <input id="l_address" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} className={inputCls} maxLength={300} />
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
              <th className="px-4 py-3 font-medium">{t('admin.locations.address')}</th>
              <th className="px-4 py-3 font-medium">{t('admin.state')}</th>
              <th className="px-4 py-3 font-medium text-right">{t('app.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(listQ.data ?? []).map((l) => (
              <tr key={l.id}>
                <td className="px-4 py-3 font-medium text-gray-900">{l.name}</td>
                <td className="px-4 py-3 text-gray-600">{l.address ?? '—'}</td>
                <td className="px-4 py-3">{l.is_active ? t('admin.active') : t('admin.inactive')}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button type="button" className={btnSecondary} onClick={() => { setEditing(l.id); setForm({ name: l.name, address: l.address ?? '' }); setErrors({}); }}>
                      {t('okr.edit')}
                    </button>
                    <button type="button" className={btnSecondary} disabled={toggle.isPending} onClick={() => toggle.mutate({ id: l.id, is_active: !l.is_active })}>
                      {l.is_active ? t('admin.deactivate') : t('admin.activate')}
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
