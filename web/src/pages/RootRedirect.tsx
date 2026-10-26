import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/authStore';
import { readLastOrgSlug } from '../lib/orgMemory';
import { FullPageMessage } from '../components/auth/ProtectedRoute';

/** "/" → ultima organizzazione usata (se ancora valida) o la prima disponibile. */
export function RootRedirect() {
  const { t } = useTranslation();
  const orgs = useAuthStore((s) => s.orgs);
  const isPlatformAdmin = useAuthStore((s) => s.isPlatformAdmin);
  const signOut = useAuthStore((s) => s.signOut);

  if (orgs.length === 0 && isPlatformAdmin) return <Navigate to="/platform" replace />;
  if (orgs.length === 0) {
    return (
      <FullPageMessage>
        <div>
          <p className="mb-4">{t('org.none')}</p>
          <button onClick={() => void signOut()} className="text-primary-600 hover:underline text-sm">
            {t('nav.logout')}
          </button>
        </div>
      </FullPageMessage>
    );
  }
  const last = readLastOrgSlug();
  const target = orgs.find((o) => o.slug === last) ?? orgs[0];
  return <Navigate to={`/o/${target.slug}/dashboard`} replace />;
}
