import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Unlink } from 'lucide-react';
import {
  addAlignment, listAlignmentCandidates, listAlignments, listOkrTitles, removeAlignment, type Okr,
} from '../../services/okr.service';
import { errorKey } from '../../lib/errors';
import { ErrorNote } from '../ui/ErrorNote';
import { btnSecondary, inputCls } from '../ui/Field';
import { ProgressBar } from './badges';

interface Props {
  orgId: string;
  orgSlug: string;
  okr: Okr;
  canEdit: boolean;
}

/** Allineamenti dell'OKR: OKR superiori (padre) e collegati (figli) dello stesso periodo. */
export function AlignmentsSection({ orgId, orgSlug, okr, canEdit }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const key = ['okr', orgId, okr.id, 'alignments'];
  const [error, setError] = useState<string | null>(null);
  const [parentPick, setParentPick] = useState('');
  const [childPick, setChildPick] = useState('');

  const alignQ = useQuery({ queryKey: key, queryFn: () => listAlignments(orgId, okr.id) });
  const alignments = alignQ.data ?? [];
  const relatedIds = [...new Set(alignments.flatMap((a) => [a.parent_okr_id, a.child_okr_id]))].filter((x) => x !== okr.id);
  const titlesQ = useQuery({
    queryKey: [...key, 'titles', relatedIds],
    queryFn: () => listOkrTitles(orgId, relatedIds),
    enabled: alignQ.isSuccess && relatedIds.length > 0,
  });
  const candidatesQ = useQuery({
    queryKey: ['okr', orgId, okr.id, 'candidates', okr.period_id],
    queryFn: () => listAlignmentCandidates(orgId, okr.period_id, okr.id),
    enabled: canEdit,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: key });
  const mutation = useMutation({
    mutationFn: (fn: () => Promise<void>) => fn(),
    onSuccess: async () => {
      setError(null);
      setParentPick('');
      setChildPick('');
      await refresh();
    },
    onError: (err) => setError(errorKey(err)),
  });

  const info = (id: string) => titlesQ.data?.find((x) => x.id === id);
  const parents = alignments.filter((a) => a.child_okr_id === okr.id);
  const children = alignments.filter((a) => a.parent_okr_id === okr.id);
  const taken = new Set(relatedIds);
  const candidates = (candidatesQ.data ?? []).filter((c) => !taken.has(c.id));

  const list = (items: typeof parents, otherKey: 'parent_okr_id' | 'child_okr_id') =>
    items.length === 0 ? (
      <p className="text-sm text-gray-500">{t('okr.none')}</p>
    ) : (
      <ul className="space-y-2">
        {items.map((a) => {
          const other = info(a[otherKey]);
          return (
            <li key={a.id} className="flex items-center gap-3 text-sm">
              {other ? (
                <Link to={`/o/${orgSlug}/okrs/${other.id}`} className="flex-1 text-gray-900 hover:text-primary-700">{other.title}</Link>
              ) : (
                <span className="flex-1 text-gray-400">…</span>
              )}
              {other && <div className="w-32"><ProgressBar value={other.progress_percentage} /></div>}
              {canEdit && (
                <button
                  type="button"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate(() => removeAlignment(orgId, a.id))}
                  title={t('okr.unlink')}
                  aria-label={t('okr.unlink')}
                  className="p-1 text-gray-400 hover:text-danger-500"
                >
                  <Unlink className="w-4 h-4" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    );

  const picker = (value: string, set: (v: string) => void, label: string, onLink: () => void) => (
    <div className="flex flex-wrap gap-2 mt-2">
      <select aria-label={label} value={value} onChange={(e) => set(e.target.value)} className={`${inputCls} max-w-xs`}>
        <option value="">{label}</option>
        {candidates.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
      </select>
      <button type="button" disabled={!value || mutation.isPending} onClick={onLink} className={btnSecondary}>
        {t('okr.link')}
      </button>
    </div>
  );

  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 mb-3">{t('okr.alignments')}</h2>
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">{t('okr.parents')}</p>
          {list(parents, 'parent_okr_id')}
          {canEdit && picker(parentPick, setParentPick, t('okr.addParent'), () => mutation.mutate(() => addAlignment(orgId, parentPick, okr.id)))}
        </div>
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">{t('okr.children')}</p>
          {list(children, 'child_okr_id')}
          {canEdit && picker(childPick, setChildPick, t('okr.addChild'), () => mutation.mutate(() => addAlignment(orgId, okr.id, childPick)))}
        </div>
        <ErrorNote errorKey={error} onReload={() => void refresh()} />
      </div>
    </section>
  );
}
