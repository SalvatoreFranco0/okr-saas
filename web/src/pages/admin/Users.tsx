import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useCurrentOrg } from '../../hooks/useCurrentOrg';
import { useAuthStore } from '../../stores/authStore';
import {
  functionErrorKey, inviteUser, listOrgMembers, removeMember, resendInvite, updateMember, type OrgMemberRow, type OrgRole,
} from '../../services/members.service';
import { listLocationsAdmin } from '../../services/admin.service';
import { errorKey } from '../../lib/errors';
import { fieldErrors } from '../../schemas/admin';
import { Banner, Field, btnPrimary, btnSecondary, inputCls } from '../../components/ui/Field';

const ROLES: OrgRole[] = ['admin', 'manager_okr', 'team_lead', 'viewer'];

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, 'validation.required').max(254, 'validation.tooLong').pipe(z.email('validation.email')),
  first_name: z.string().trim().max(100, 'validation.tooLong').default(''),
  last_name: z.string().trim().max(100, 'validation.tooLong').default(''),
  role: z.enum(['admin', 'manager_okr', 'team_lead', 'viewer']),
});

interface LocationOption {
  id: string;
  name: string;
  is_active: boolean;
}

const flip = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

function LocationChecks({ locations, value, onChange }: { locations: LocationOption[]; value: string[]; onChange: (v: string[]) => void }) {
  const { t } = useTranslation();
  return (
    <fieldset className="flex flex-wrap gap-3">
      <legend className="text-sm font-medium text-gray-700 mb-1">{t('admin.users.locations')}</legend>
      {locations.filter((l) => l.is_active || value.includes(l.id)).map((l) => (
        <label key={l.id} className="flex items-center gap-1 text-sm text-gray-700">
          <input type="checkbox" checked={value.includes(l.id)} onChange={() => onChange(flip(value, l.id))} />
          {l.name}
        </label>
      ))}
      {locations.length === 0 && <span className="text-sm text-gray-500">—</span>}
    </fieldset>
  );
}

const displayName = (m: OrgMemberRow) => [m.first_name, m.last_name].filter(Boolean).join(' ') || '—';

/** Utenti dell'organizzazione (solo Admin): invito, reinvio, ruolo, sedi e attivazione. Le scritture sono Edge Functions. */
export function Users() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { org } = useCurrentOrg();
  const orgId = org!.id;
  const me = useAuthStore((s) => s.session?.user.id);

  const [invite, setInvite] = useState({ email: '', first_name: '', last_name: '', role: 'viewer' as OrgRole });
  const [inviteLocs, setInviteLocs] = useState<string[]>([]);
  const [inviteErrors, setInviteErrors] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<OrgMemberRow | null>(null);
  const [editRole, setEditRole] = useState<OrgRole>('viewer');
  const [editLocs, setEditLocs] = useState<string[]>([]);
  const [message, setMessage] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null);

  const membersQ = useQuery({ queryKey: ['org-members', orgId], queryFn: () => listOrgMembers(orgId) });
  const locationsQ = useQuery({ queryKey: ['locations', orgId, 'admin'], queryFn: () => listLocationsAdmin(orgId) });
  const locations = locationsQ.data ?? [];
  const locName = (id: string) => locations.find((l) => l.id === id)?.name ?? '?';

  const fail = (e: unknown) => setMessage({ tone: 'danger', text: t(functionErrorKey(e) ?? errorKey(e)) });
  const done = async (text: string) => {
    setMessage({ tone: 'info', text });
    await qc.invalidateQueries({ queryKey: ['org-members', orgId] });
    await qc.invalidateQueries({ queryKey: ['members', orgId] });
  };

  const inviteM = useMutation({
    mutationFn: () => inviteUser(orgId, { ...inviteSchema.parse(invite), location_ids: inviteLocs }),
    onSuccess: async (r) => {
      setInvite({ email: '', first_name: '', last_name: '', role: 'viewer' });
      setInviteLocs([]);
      await done(t(`admin.users.result.${r.status}`));
    },
    onError: fail,
  });
  const resendM = useMutation({ mutationFn: (userId: string) => resendInvite(orgId, userId), onSuccess: () => done(t('admin.users.result.resent')), onError: fail });
  const toggleM = useMutation({
    mutationFn: (m: OrgMemberRow) => (m.is_active ? removeMember(orgId, m.user_id) : updateMember(orgId, m.user_id, { is_active: true })),
    onSuccess: () => done(t('admin.users.result.updated')),
    onError: fail,
  });
  const editM = useMutation({
    mutationFn: (m: OrgMemberRow) => updateMember(orgId, m.user_id, { role: editRole, location_ids: editLocs }),
    onSuccess: async () => {
      setEditing(null);
      await done(t('admin.users.result.updated'));
    },
    onError: fail,
  });

  const submitInvite = (e: FormEvent) => {
    e.preventDefault();
    const r = inviteSchema.safeParse(invite);
    if (!r.success) {
      setInviteErrors(fieldErrors(r.error));
      return;
    }
    setInviteErrors({});
    setMessage(null);
    inviteM.mutate();
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">{t('admin.users.title')}</h1>
      <p className="text-sm text-gray-500">{t('admin.users.help')}</p>
      {message && <Banner tone={message.tone}>{message.text}</Banner>}

      <form onSubmit={submitInvite} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3" noValidate aria-label={t('admin.users.invite')}>
        <h2 className="text-base font-semibold text-gray-900">{t('admin.users.invite')}</h2>
        <div className="grid sm:grid-cols-4 gap-3">
          <Field id="u_email" label={t('auth.email')} error={inviteErrors.email}>
            <input id="u_email" type="email" value={invite.email} onChange={(e) => setInvite((f) => ({ ...f, email: e.target.value }))} className={inputCls} maxLength={254} />
          </Field>
          <Field id="u_first" label={t('profile.name')} error={inviteErrors.first_name}>
            <input id="u_first" value={invite.first_name} onChange={(e) => setInvite((f) => ({ ...f, first_name: e.target.value }))} className={inputCls} maxLength={100} />
          </Field>
          <Field id="u_last" label={t('admin.users.lastName')} error={inviteErrors.last_name}>
            <input id="u_last" value={invite.last_name} onChange={(e) => setInvite((f) => ({ ...f, last_name: e.target.value }))} className={inputCls} maxLength={100} />
          </Field>
          <Field id="u_role" label={t('profile.role')}>
            <select id="u_role" value={invite.role} onChange={(e) => setInvite((f) => ({ ...f, role: e.target.value as OrgRole }))} className={inputCls}>
              {ROLES.map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}
            </select>
          </Field>
        </div>
        <LocationChecks locations={locations} value={inviteLocs} onChange={setInviteLocs} />
        <button type="submit" disabled={inviteM.isPending} className={btnPrimary}>{t('admin.users.sendInvite')}</button>
      </form>

      {membersQ.error && <p role="alert" className="text-danger-500">{t(errorKey(membersQ.error))}</p>}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-3 font-medium">{t('admin.name')}</th>
              <th className="px-4 py-3 font-medium">{t('auth.email')}</th>
              <th className="px-4 py-3 font-medium">{t('profile.role')}</th>
              <th className="px-4 py-3 font-medium">{t('admin.users.locations')}</th>
              <th className="px-4 py-3 font-medium">{t('admin.state')}</th>
              <th className="px-4 py-3 font-medium text-right">{t('app.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(membersQ.data ?? []).map((m) => {
              const self = m.user_id === me;
              return (
                <tr key={m.user_id} className={m.is_active ? '' : 'text-gray-400'}>
                  <td className="px-4 py-3 font-medium">{displayName(m)}</td>
                  <td className="px-4 py-3">{m.email ?? '—'}</td>
                  <td className="px-4 py-3">{t(`roles.${m.role}`)}</td>
                  <td className="px-4 py-3">{m.location_ids.length ? m.location_ids.map(locName).join(', ') : '—'}</td>
                  <td className="px-4 py-3">{m.is_active ? t('admin.active') : t('admin.inactive')}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2 flex-wrap">
                      <button type="button" className={btnSecondary} onClick={() => { setEditing(m); setEditRole(m.role); setEditLocs(m.location_ids); }}>
                        {t('okr.edit')}
                      </button>
                      <button type="button" className={btnSecondary} disabled={resendM.isPending || !m.is_active} onClick={() => resendM.mutate(m.user_id)}>
                        {t('admin.users.resend')}
                      </button>
                      <button type="button" className={btnSecondary} disabled={toggleM.isPending || (self && m.is_active)} onClick={() => toggleM.mutate(m)}>
                        {m.is_active ? t('admin.deactivate') : t('admin.activate')}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <section className="bg-white border border-gray-200 rounded-xl p-4 space-y-3" aria-label={t('admin.users.editTitle', { name: displayName(editing) })}>
          <h2 className="text-base font-semibold text-gray-900">{t('admin.users.editTitle', { name: displayName(editing) })}</h2>
          <Field id="e_role" label={t('profile.role')}>
            <select
              id="e_role"
              value={editRole}
              disabled={editing.user_id === me}
              onChange={(e) => setEditRole(e.target.value as OrgRole)}
              className={`${inputCls} max-w-xs`}
            >
              {ROLES.map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}
            </select>
          </Field>
          {editing.user_id === me && <p className="text-xs text-gray-500">{t('admin.users.selfRole')}</p>}
          <LocationChecks locations={locations} value={editLocs} onChange={setEditLocs} />
          <div className="flex gap-2">
            <button type="button" className={btnPrimary} disabled={editM.isPending} onClick={() => editM.mutate(editing)}>{t('app.save')}</button>
            <button type="button" className={btnSecondary} onClick={() => setEditing(null)}>{t('app.cancel')}</button>
          </div>
        </section>
      )}
    </div>
  );
}
