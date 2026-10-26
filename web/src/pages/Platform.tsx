import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useAuthStore } from '../stores/authStore';
import {
  createOrganization, endSupportSession, exportOrganization, listPlatformOrgs, purgeOrganization, startSupportSession,
  type PlatformOrg,
} from '../services/platform.service';
import { functionErrorKey } from '../services/members.service';
import { downloadTextFile } from '../services/export.service';
import { errorKey } from '../lib/errors';
import { fieldErrors } from '../schemas/admin';
import { Banner, Field, btnPrimary, btnSecondary, inputCls } from '../components/ui/Field';
import { ConfirmDialog } from '../components/ConfirmDialog';

const createSchema = z.object({
  name: z.string().trim().min(1, 'validation.required').max(200, 'validation.tooLong'),
  slug: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,62}$/, 'validation.slug'),
  first_admin_email: z.string().trim().toLowerCase().max(254, 'validation.tooLong').default('')
    .refine((v) => v === '' || z.email().safeParse(v).success, 'validation.email'),
});

const formatTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** Piattaforma (solo super-admin con aal2): organizzazioni, sessioni di supporto, export e purge. Le scritture sono Edge Functions. */
export function Platform() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const isPlatformAdmin = useAuthStore((s) => s.isPlatformAdmin);
  const orgs = useAuthStore((s) => s.orgs);
  const reload = useAuthStore((s) => s.reload);

  const [form, setForm] = useState({ name: '', slug: '', first_admin_email: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null);
  const [supportFor, setSupportFor] = useState<PlatformOrg | null>(null);
  const [reason, setReason] = useState('');
  const [purgeFor, setPurgeFor] = useState<PlatformOrg | null>(null);
  const [confirmSlug, setConfirmSlug] = useState('');

  const listQ = useQuery({ queryKey: ['platform-orgs'], queryFn: listPlatformOrgs, enabled: isPlatformAdmin });

  const fail = (e: unknown) => setMessage({ tone: 'danger', text: t(functionErrorKey(e) ?? errorKey(e)) });
  const refresh = async () => {
    await reload();
    await qc.invalidateQueries({ queryKey: ['platform-orgs'] });
  };
  const sessionOf = (o: PlatformOrg) => orgs.find((x) => x.id === o.id)?.support;

  const create = useMutation({
    mutationFn: () => {
      const d = createSchema.parse(form);
      return createOrganization({ name: d.name, slug: d.slug, ...(d.first_admin_email ? { first_admin_email: d.first_admin_email } : {}) });
    },
    onSuccess: async () => {
      setForm({ name: '', slug: '', first_admin_email: '' });
      setMessage({ tone: 'info', text: t('platform.created') });
      await refresh();
    },
    onError: fail,
  });
  const start = useMutation({
    mutationFn: (o: PlatformOrg) => startSupportSession(o.id, reason.trim()),
    onSuccess: async () => {
      setSupportFor(null);
      setReason('');
      setMessage({ tone: 'info', text: t('platform.sessionStarted') });
      await refresh();
    },
    onError: fail,
  });
  const end = useMutation({
    mutationFn: (sessionId: string) => endSupportSession(sessionId),
    onSuccess: async () => {
      setMessage({ tone: 'info', text: t('platform.sessionEnded') });
      await refresh();
    },
    onError: fail,
  });
  const exp = useMutation({
    mutationFn: async (o: PlatformOrg) => {
      const data = await exportOrganization(o.id);
      downloadTextFile(`export-${o.slug}-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json');
    },
    onSuccess: () => setMessage({ tone: 'info', text: t('platform.exported') }),
    onError: fail,
  });
  const purge = useMutation({
    mutationFn: (o: PlatformOrg) => purgeOrganization(o.id, confirmSlug),
    onSuccess: async (r) => {
      setPurgeFor(null);
      setConfirmSlug('');
      setMessage({ tone: 'info', text: t('platform.purged', { count: r.orphan_users }) });
      await refresh();
    },
    onError: (e) => {
      setPurgeFor(null);
      fail(e);
    },
  });

  const submitCreate = (e: FormEvent) => {
    e.preventDefault();
    const r = createSchema.safeParse(form);
    if (!r.success) {
      setErrors(fieldErrors(r.error));
      return;
    }
    setErrors({});
    setMessage(null);
    create.mutate();
  };

  if (!isPlatformAdmin) return <Navigate to="/" replace />;

  return (
    <div className="max-w-5xl mx-auto p-4 lg:p-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-gray-900">{t('platform.title')}</h1>
        {orgs.length > 0 && (
          <Link to={`/o/${orgs[0].slug}/dashboard`} className="text-sm text-primary-700 hover:underline">{t('platform.backToApp')}</Link>
        )}
      </div>
      <p className="text-sm text-gray-500">{t('platform.help')}</p>
      {message && <Banner tone={message.tone}>{message.text}</Banner>}

      <form onSubmit={submitCreate} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3" noValidate aria-label={t('platform.newOrg')}>
        <h2 className="text-base font-semibold text-gray-900">{t('platform.newOrg')}</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          <Field id="o_name" label={t('admin.name')} error={errors.name}>
            <input id="o_name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={inputCls} maxLength={200} />
          </Field>
          <Field id="o_slug" label={t('platform.slug')} error={errors.slug}>
            <input id="o_slug" value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase() }))} className={inputCls} maxLength={63} />
          </Field>
          <Field id="o_admin" label={t('platform.firstAdmin')} error={errors.first_admin_email}>
            <input id="o_admin" type="email" value={form.first_admin_email} onChange={(e) => setForm((f) => ({ ...f, first_admin_email: e.target.value }))} className={inputCls} maxLength={254} />
          </Field>
        </div>
        <button type="submit" disabled={create.isPending} className={btnPrimary}>{t('platform.create')}</button>
      </form>

      {listQ.error && <p role="alert" className="text-danger-500">{t(errorKey(listQ.error))}</p>}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-3 font-medium">{t('admin.name')}</th>
              <th className="px-4 py-3 font-medium">{t('platform.slug')}</th>
              <th className="px-4 py-3 font-medium">{t('admin.state')}</th>
              <th className="px-4 py-3 font-medium text-right">{t('app.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(listQ.data ?? []).map((o) => {
              const sup = sessionOf(o);
              return (
                <tr key={o.id}>
                  <td className="px-4 py-3 font-medium text-gray-900">{o.name}</td>
                  <td className="px-4 py-3 text-gray-600">{o.slug}</td>
                  <td className="px-4 py-3">
                    {o.is_active ? t('admin.active') : t('admin.inactive')}
                    {sup && <span className="ml-2 px-2 py-0.5 rounded-full bg-warning-100 text-warning-600 text-xs">{t('platform.supportUntil', { time: formatTime(sup.expiresAt) })}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2 flex-wrap">
                      {sup ? (
                        <>
                          <Link to={`/o/${o.slug}/dashboard`} className={btnSecondary}>{t('platform.open')}</Link>
                          <button type="button" className={btnSecondary} disabled={exp.isPending} onClick={() => exp.mutate(o)}>{t('platform.export')}</button>
                          <button type="button" className={btnSecondary} disabled={end.isPending} onClick={() => end.mutate(sup.sessionId)}>{t('platform.endSession')}</button>
                          <button type="button" className="px-4 py-2 border border-danger-500 text-danger-600 rounded-lg text-sm hover:bg-danger-50" onClick={() => { setPurgeFor(o); setConfirmSlug(''); }}>
                            {t('platform.purge')}
                          </button>
                        </>
                      ) : (
                        <button type="button" className={btnSecondary} onClick={() => { setSupportFor(o); setReason(''); }}>{t('platform.startSession')}</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {supportFor && (
        <section className="bg-white border border-gray-200 rounded-xl p-4 space-y-3" aria-label={t('platform.startSessionFor', { name: supportFor.name })}>
          <h2 className="text-base font-semibold text-gray-900">{t('platform.startSessionFor', { name: supportFor.name })}</h2>
          <p className="text-sm text-gray-500">{t('platform.sessionHelp')}</p>
          <Field id="s_reason" label={t('platform.reason')}>
            <textarea id="s_reason" value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} rows={3} maxLength={500} />
          </Field>
          <div className="flex gap-2">
            <button type="button" className={btnPrimary} disabled={reason.trim().length < 10 || start.isPending} onClick={() => start.mutate(supportFor)}>
              {t('platform.startSession')}
            </button>
            <button type="button" className={btnSecondary} onClick={() => setSupportFor(null)}>{t('app.cancel')}</button>
          </div>
        </section>
      )}

      <ConfirmDialog
        isOpen={!!purgeFor}
        title={t('platform.purgeTitle', { name: purgeFor?.name ?? '' })}
        message={
          <div className="space-y-3 text-left">
            <p>{t('platform.purgeWarning')}</p>
            <Field id="p_slug" label={t('platform.purgeType', { slug: purgeFor?.slug ?? '' })}>
              <input id="p_slug" value={confirmSlug} onChange={(e) => setConfirmSlug(e.target.value)} className={inputCls} autoComplete="off" />
            </Field>
          </div>
        }
        confirmText={t('platform.purge')}
        cancelText={t('app.cancel')}
        isLoading={purge.isPending}
        onConfirm={() => {
          if (purgeFor && confirmSlug === purgeFor.slug) purge.mutate(purgeFor);
        }}
        onCancel={() => setPurgeFor(null)}
      />
    </div>
  );
}
