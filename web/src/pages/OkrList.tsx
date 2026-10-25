import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { CAN_WRITE_OKR, useCurrentOrg } from '../hooks/useCurrentOrg';
import { listOkrs } from '../services/okr.service';
import { errorKey } from '../lib/errors';
import { PriorityBadge, ProgressBar, StatusBadge } from '../components/okr/badges';

export function OkrList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { org, role } = useCurrentOrg();
  const orgId = org!.id;

  const { data, isLoading, error } = useQuery({
    queryKey: ['okrs', orgId],
    queryFn: () => listOkrs(orgId),
  });

  const canCreate = !!role && CAN_WRITE_OKR.includes(role);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">{t('okr.listTitle')}</h1>
        {canCreate && (
          <button
            onClick={() => navigate('new')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
          >
            <Plus className="w-4 h-4" />
            {t('okr.new')}
          </button>
        )}
      </div>

      {isLoading && <p className="text-gray-500">{t('app.loading')}</p>}
      {error && <p role="alert" className="text-danger-500">{t(errorKey(error))}</p>}
      {data && data.length === 0 && <p className="text-gray-500">{t('okr.empty')}</p>}

      {data && data.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-4 py-3 font-medium">{t('okr.title')}</th>
                <th className="px-4 py-3 font-medium">{t('okr.priority')}</th>
                <th className="px-4 py-3 font-medium">{t('okr.progress')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.map((o) => (
                <tr key={o.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link to={o.id} className="font-medium text-gray-900 hover:text-primary-700">{o.title}</Link>
                    <div className="mt-1"><StatusBadge status={o.status} /></div>
                  </td>
                  <td className="px-4 py-3"><PriorityBadge priority={o.priority} /></td>
                  <td className="px-4 py-3 w-56"><ProgressBar value={o.progress_percentage} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
