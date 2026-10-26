import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useCurrentOrg } from '../../hooks/useCurrentOrg';
import {
  addTeamMember, createTeam, listTeamMembers, listTeamsAdmin, removeTeamMember, updateTeam,
} from '../../services/admin.service';
import { listMembers, memberName } from '../../services/lookups.service';
import { fieldErrors, teamSchema } from '../../schemas/admin';
import { orNull } from '../../schemas/okr';
import { errorKey } from '../../lib/errors';
import { Banner, Field, btnPrimary, btnSecondary, inputCls } from '../../components/ui/Field';

const EMPTY = { name: '', description: '' };

/** Team: creazione, modifica, disattivazione e assegnazione dei membri (Admin e Manager). */
export function Teams() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { org } = useCurrentOrg();
  const orgId = org!.id;
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [toAdd, setToAdd] = useState('');

  const listQ = useQuery({ queryKey: ['teams', orgId, 'admin'], queryFn: () => listTeamsAdmin(orgId) });
  const membersQ = useQuery({ queryKey: ['members', orgId], queryFn: () => listMembers(orgId) });
  const teamMembersQ = useQuery({
    queryKey: ['team-members', orgId, selected],
    queryFn: () => listTeamMembers(orgId, selected!),
    enabled: !!selected,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['teams', orgId] });
  const onError = (e: unknown) => setActionError(errorKey(e));

  const save = useMutation({
    mutationFn: (d: typeof EMPTY) =>
      editing ? updateTeam(orgId, editing, { name: d.name, description: orNull(d.description) }) : createTeam(orgId, d),
    onSuccess: async () => {
      setForm(EMPTY);
      setEditing(null);
      setActionError(null);
      await refresh();
    },
    onError,
  });
  const toggle = useMutation({
    mutationFn: (v: { id: string; is_active: boolean }) => updateTeam(orgId, v.id, { is_active: v.is_active }),
    onSuccess: async () => {
      setActionError(null);
      await refresh();
    },
    onError,
  });
  const add = useMutation({
    mutationFn: (userId: string) => addTeamMember(orgId, selected!, userId),
    onSuccess: async () => {
      setToAdd('');
      setActionError(null);
      await qc.invalidateQueries({ queryKey: ['team-members', orgId] });
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (userId: string) => removeTeamMember(orgId, selected!, userId),
    onSuccess: async () => {
      setActionError(null);
      await qc.invalidateQueries({ queryKey: ['team-members', orgId] });
    },
    onError,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = teamSchema.safeParse(form);
    if (!r.success) {
      setErrors(fieldErrors(r.error));
      return;
    }
    setErrors({});
    save.mutate(r.data);
  };

  const members = membersQ.data ?? [];
  const inTeam = new Set(teamMembersQ.data ?? []);
  const selectedTeam = (listQ.data ?? []).find((x) => x.id === selected);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">{t('admin.teams.title')}</h1>
      <p className="text-sm text-gray-500">{t('admin.teams.help')}</p>
      {actionError && <Banner tone="danger">{t(actionError)}</Banner>}

      <form onSubmit={submit} className="bg-white border border-gray-200 rounded-xl p-4 grid sm:grid-cols-3 gap-3 items-end" noValidate>
        <Field id="t_name" label={t('admin.name')} error={errors.name}>
          <input id="t_name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={inputCls} maxLength={100} />
        </Field>
        <Field id="t_desc" label={t('admin.teams.description')} error={errors.description}>
          <input id="t_desc" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className={inputCls} maxLength={2000} />
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
              <th className="px-4 py-3 font-medium">{t('admin.teams.description')}</th>
              <th className="px-4 py-3 font-medium">{t('admin.state')}</th>
              <th className="px-4 py-3 font-medium text-right">{t('app.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(listQ.data ?? []).map((tm) => (
              <tr key={tm.id} className={selected === tm.id ? 'bg-primary-50' : ''}>
                <td className="px-4 py-3 font-medium text-gray-900">{tm.name}</td>
                <td className="px-4 py-3 text-gray-600">{tm.description ?? '—'}</td>
                <td className="px-4 py-3">{tm.is_active ? t('admin.active') : t('admin.inactive')}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2 flex-wrap">
                    <button type="button" className={btnSecondary} onClick={() => setSelected(selected === tm.id ? null : tm.id)}>
                      {t('admin.teams.members')}
                    </button>
                    <button type="button" className={btnSecondary} onClick={() => { setEditing(tm.id); setForm({ name: tm.name, description: tm.description ?? '' }); setErrors({}); }}>
                      {t('okr.edit')}
                    </button>
                    <button type="button" className={btnSecondary} disabled={toggle.isPending} onClick={() => toggle.mutate({ id: tm.id, is_active: !tm.is_active })}>
                      {tm.is_active ? t('admin.deactivate') : t('admin.activate')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && selectedTeam && (
        <section className="bg-white border border-gray-200 rounded-xl p-4 space-y-3" aria-label={t('admin.teams.membersOf', { name: selectedTeam.name })}>
          <h2 className="text-base font-semibold text-gray-900">{t('admin.teams.membersOf', { name: selectedTeam.name })}</h2>
          {teamMembersQ.data && teamMembersQ.data.length === 0 && <p className="text-sm text-gray-500">{t('admin.teams.noMembers')}</p>}
          <ul className="divide-y divide-gray-100">
            {(teamMembersQ.data ?? []).map((uid) => (
              <li key={uid} className="py-2 flex items-center justify-between">
                <span className="text-sm text-gray-900">{memberName(members.find((m) => m.user_id === uid))}</span>
                <button type="button" className={btnSecondary} disabled={remove.isPending} onClick={() => remove.mutate(uid)}>
                  {t('okr.removeKr')}
                </button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2 items-end">
            <div className="flex-1 max-w-xs">
              <Field id="t_add" label={t('admin.teams.addMember')}>
                <select id="t_add" value={toAdd} onChange={(e) => setToAdd(e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  {members.filter((m) => !inTeam.has(m.user_id)).map((m) => (
                    <option key={m.user_id} value={m.user_id}>{memberName(m)}</option>
                  ))}
                </select>
              </Field>
            </div>
            <button type="button" className={btnPrimary} disabled={!toAdd || add.isPending} onClick={() => add.mutate(toAdd)}>
              {t('admin.add')}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
