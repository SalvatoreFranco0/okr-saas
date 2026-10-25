import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/authStore';

// Segnaposto: la dashboard vera (dashboard_stats) è la Fase 6.
export function Dashboard() {
  const { t } = useTranslation();
  const profile = useAuthStore((s) => s.profile);
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">
        {t('dashboard.welcome', { name: profile?.first_name ?? profile?.email ?? '' })}
      </h1>
      <p className="text-gray-500 mt-2">{t('dashboard.soon')}</p>
    </div>
  );
}
