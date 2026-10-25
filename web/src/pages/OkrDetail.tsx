import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { useCurrentOrg } from '../hooks/useCurrentOrg';
import { useMyAccess } from '../hooks/useMyAccess';
import {
  getOkr, listActions, listKeyResultsForOkrs, listKrUpdates, setOkrDeleted,
} from '../services/okr.service';
import { listLocations, listMembers, listPeriods, listTeams } from '../services/lookups.service';
import { canDeleteOkr, canEditOkr, isReadOnlyBecauseClosed } from '../lib/permissions';
import { errorKey } from '../lib/errors';
import { PriorityBadge, ProgressBar, StatusBadge } from '../components/okr/badges';
import { KeyResultCard } from '../components/okr/KeyResultCard';
import { AlignmentsSection } from '../components/okr/AlignmentsSection';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorNote } from '../components/ui/ErrorNote';
import { Banner, btnPrimary, btnSecondary } from '../components/ui/Field';

export function OkrDetail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id = '' } = useParams();
  const { org } = useCurrentOrg();
  const orgId = org!.id;
  const base = `/o/${org!.slug}/okrs`;
  const { access } = useMyAccess();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [opError, setOpError] = useState<string | null>(null);

  const okrQ = useQuery({ queryKey: ['okr', orgId, id], queryFn: () => getOkr(orgId, id) });
  const krQ = useQuery({ queryKey: ['okr', orgId, id, 'krs'], queryFn: () => listKeyResultsForOkrs(orgId, [id]) });
  const krIds = (krQ.data ?? []).map((k) => k.id);
  const actionsQ = useQuery({ queryKey: ['okr', orgId, id, 'actions', krIds], queryFn: () => listActions(orgId, krIds), enabled: krQ.isSuccess });
  const updatesQ = useQuery({ queryKey: ['okr', orgId, id, 'updates', krIds], queryFn: () => listKrUpdates(orgId, krIds), enabled: krQ.isSuccess });
  const periodsQ = useQuery({ queryKey: ['periods', orgId], queryFn: () => listPeriods(orgId) });
  const locationsQ = useQuery({ queryKey: ['locations', orgId], queryFn: () => listLocations(orgId) });
  const teamsQ = useQuery({ queryKey: ['teams', orgId], queryFn: () => listTeams(orgId) });
  const membersQ = useQuery({ queryKey: ['members', orgId], queryFn: () => listMembers(orgId) });

  const reload = async () => {
    await queryClient.invalidateQueries({ queryKey: ['okr', orgId, id] });
    await queryClient.invalidateQueries({ queryKey: ['okrs', orgId] });
  };

  const deleteMutation = useMutation({
    mutationFn: (deleted: boolean) => setOkrDeleted(orgId, okrQ.data!.id, okrQ.data!.version, deleted),
    onSuccess: async (_d, deleted) => {
      setConfirmDelete(false);
      await queryClient.invalidateQueries({ queryKey: ['okrs', orgId] });
      if (deleted) navigate(base);
      else await reload();
    },
    onError: (err) => {
      setConfirmDelete(false);
      setOpError(errorKey(err));
    },
  });

  const okr = okrQ.data;
  if (okrQ.isLoading) return <p className="text-gray-500">{t('app.loading')}</p>;
  if (okrQ.error) return <p role="alert" className="text-danger-500">{t(errorKey(okrQ.error))}</p>;
  if (!okr) return <p className="text-gray-500">{t('okr.notFound')}</p>;

  const period = periodsQ.data?.find((p) => p.id === okr.period_id);
  const closed = !!period?.is_closed;
  const deleted = okr.deleted_at !== null;
  const members = membersQ.data ?? [];
  const canEdit = !deleted && canEditOkr(access, okr, closed);
  const owner = members.find((m) => m.user_id === okr.owner_id);

  return (
    <div className="max-w-4xl space-y-5">
      <Link to={base} className="text-sm text-primary-600 hover:underline">← {t('okr.listTitle')}</Link>

      {deleted && <Banner tone="danger">{t('okr.deletedBanner')}</Banner>}
      {isReadOnlyBecauseClosed(access, closed) && <Banner>{t('okr.closedBanner')}</Banner>}

      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-bold text-gray-900">{okr.title}</h1>
          <div className="flex gap-2">
            {canEdit && (
              <Link to={`${base}/${okr.id}/edit`} className={`${btnSecondary} inline-flex items-center gap-1`}>
                <Pencil className="w-4 h-4" /> {t('okr.edit')}
              </Link>
            )}
            {!deleted && canDeleteOkr(access) && (
              <button type="button" onClick={() => setConfirmDelete(true)} className={`${btnSecondary} inline-flex items-center gap-1 text-danger-600`}>
                <Trash2 className="w-4 h-4" /> {t('okr.delete')}
              </button>
            )}
            {deleted && canDeleteOkr(access) && (
              <button type="button" onClick={() => deleteMutation.mutate(false)} disabled={deleteMutation.isPending} className={`${btnPrimary} inline-flex items-center gap-1`}>
                <RotateCcw className="w-4 h-4" /> {t('okr.restore')}
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          <StatusBadge status={okr.status} />
          <PriorityBadge priority={okr.priority} />
          {period && <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700">{period.name}</span>}
          {okr.location_id && <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700">{locationsQ.data?.find((l) => l.id === okr.location_id)?.name}</span>}
          {okr.team_id && <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700">{teamsQ.data?.find((x) => x.id === okr.team_id)?.name}</span>}
          {okr.tags.map((tag) => <span key={tag} className="px-2 py-0.5 rounded-full text-xs bg-primary-50 text-primary-700">#{tag}</span>)}
        </div>
        <p className="text-gray-700 mt-3 whitespace-pre-wrap">{okr.objective}</p>
        {okr.description && <p className="text-gray-600 mt-2 whitespace-pre-wrap text-sm">{okr.description}</p>}
        <p className="text-sm text-gray-500 mt-2">
          {t('okr.owner')}: {owner ? [owner.first_name, owner.last_name].filter(Boolean).join(' ') : '—'}
          {(okr.start_date || okr.end_date) && ` · ${okr.start_date ?? ''} → ${okr.end_date ?? ''}`}
        </p>
        <div className="mt-3 max-w-sm"><ProgressBar value={okr.progress_percentage} /></div>
        <div className="mt-2"><ErrorNote errorKey={opError} onReload={() => void reload()} /></div>
      </div>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">{t('okr.keyResults')}</h2>
        {krQ.isLoading && <p className="text-gray-500">{t('app.loading')}</p>}
        {krQ.error && <p role="alert" className="text-danger-500">{t(errorKey(krQ.error))}</p>}
        {krQ.data?.length === 0 && <p className="text-gray-500">{t('okr.noKr')}</p>}
        <div className="space-y-3">
          {(krQ.data ?? []).map((kr) => (
            <KeyResultCard
              key={`${kr.id}-${kr.version}`}
              kr={kr}
              orgId={orgId}
              canEdit={canEdit}
              members={members}
              actions={(actionsQ.data ?? []).filter((a) => a.key_result_id === kr.id)}
              updates={(updatesQ.data ?? []).filter((u) => u.key_result_id === kr.id)}
              onChanged={reload}
            />
          ))}
        </div>
      </section>

      <AlignmentsSection orgId={orgId} orgSlug={org!.slug} okr={okr} canEdit={canEdit} />

      <ConfirmDialog
        isOpen={confirmDelete}
        title={t('okr.deleteTitle')}
        message={t('okr.deleteText', { title: okr.title })}
        confirmText={t('okr.delete')}
        cancelText={t('app.cancel')}
        isLoading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate(true)}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
