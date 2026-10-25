import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useCurrentOrg, CAN_WRITE_OKR } from '../hooks/useCurrentOrg';
import { getOkr, krCheckIn, listKeyResults, listKrUpdates } from '../services/okr.service';
import { errorKey } from '../lib/errors';
import { PriorityBadge, ProgressBar, StatusBadge } from '../components/okr/badges';
import type { Tables } from '../types/database';

function CheckInForm({ kr, orgId, okrId }: { kr: Tables<'key_results'>; orgId: string; okrId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [value, setValue] = useState(String(kr.current_metric));
  const [note, setNote] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const mutation = useMutation({
    mutationFn: () => krCheckIn(kr.id, Number(value), note.trim()),
    onSuccess: async () => {
      setNote('');
      setMessage({ ok: true, text: t('okr.checkInDone') });
      // L'avanzamento lo calcola il trigger: si ricarica, non si calcola nel client.
      await queryClient.invalidateQueries({ queryKey: ['okr', orgId, okrId] });
      await queryClient.invalidateQueries({ queryKey: ['okrs', orgId] });
    },
    onError: (err) => setMessage({ ok: false, text: t(errorKey(err)) }),
  });

  const valid = value.trim() !== '' && Number.isFinite(Number(value));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setMessage(null);
        mutation.mutate();
      }}
      className="mt-3 flex flex-wrap items-end gap-2"
    >
      <div>
        <label className="block text-xs text-gray-600 mb-1">{t('okr.krCurrent')} ({kr.unit})</label>
        <input
          type="number"
          step="any"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-28 px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
        />
      </div>
      <div className="flex-1 min-w-40">
        <label className="block text-xs text-gray-600 mb-1">{t('okr.checkInNote')}</label>
        <input
          value={note}
          maxLength={2000}
          onChange={(e) => setNote(e.target.value)}
          className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={!valid || mutation.isPending}
        className="px-3 py-1.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
      >
        {t('okr.checkIn')}
      </button>
      {message && (
        <p role={message.ok ? 'status' : 'alert'} className={`w-full text-sm ${message.ok ? 'text-success-600' : 'text-danger-500'}`}>
          {message.text}
        </p>
      )}
    </form>
  );
}

export function OkrDetail() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const { org, role } = useCurrentOrg();
  const orgId = org!.id;

  const okrQ = useQuery({ queryKey: ['okr', orgId, id], queryFn: () => getOkr(orgId, id) });
  const krQ = useQuery({ queryKey: ['okr', orgId, id, 'krs'], queryFn: () => listKeyResults(orgId, id) });
  const krIds = (krQ.data ?? []).map((k) => k.id);
  const updQ = useQuery({
    queryKey: ['okr', orgId, id, 'updates', krIds],
    queryFn: () => listKrUpdates(orgId, krIds),
    enabled: krQ.isSuccess,
  });

  const okr = okrQ.data;
  if (okrQ.isLoading) return <p className="text-gray-500">{t('app.loading')}</p>;
  if (okrQ.error) return <p role="alert" className="text-danger-500">{t(errorKey(okrQ.error))}</p>;
  if (!okr) return <p className="text-gray-500">{t('okr.notFound')}</p>;

  const canCheckIn = !!role && CAN_WRITE_OKR.includes(role);

  return (
    <div className="max-w-3xl space-y-5">
      <Link to=".." relative="path" className="text-sm text-primary-600 hover:underline">← {t('okr.listTitle')}</Link>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{okr.title}</h1>
        <div className="flex gap-2 mt-2"><StatusBadge status={okr.status} /><PriorityBadge priority={okr.priority} /></div>
        <p className="text-gray-600 mt-3 whitespace-pre-wrap">{okr.objective}</p>
        <div className="mt-3 max-w-sm"><ProgressBar value={okr.progress_percentage} /></div>
      </div>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">{t('okr.keyResults')}</h2>
        <div className="space-y-3">
          {(krQ.data ?? []).map((kr) => (
            <div key={kr.id} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium text-gray-900">{kr.title}</p>
                <span className="text-xs text-gray-500">{t(`krStatus.${kr.status}`)}</span>
              </div>
              <p className="text-sm text-gray-600 mt-1 tabular-nums">
                {kr.initial_metric} → {kr.current_metric} / {kr.target_metric} {kr.unit}
              </p>
              {canCheckIn && <CheckInForm key={`${kr.id}-${kr.version}`} kr={kr} orgId={orgId} okrId={id} />}
            </div>
          ))}
        </div>
      </section>

      {(updQ.data?.length ?? 0) > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">{t('okr.history')}</h2>
          <ul className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 text-sm">
            {updQ.data!.map((u) => (
              <li key={u.id} className="px-4 py-2 flex flex-wrap gap-x-3 text-gray-700">
                <span className="text-gray-500">{new Date(u.created_at).toLocaleString()}</span>
                <span className="tabular-nums">{u.old_value ?? '—'} → {u.new_value ?? '—'}</span>
                {u.note && <span className="text-gray-500">{u.note}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
