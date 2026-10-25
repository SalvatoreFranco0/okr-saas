import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore, type OrgRole } from '../../stores/authStore';
import { useCurrentOrg } from '../../hooks/useCurrentOrg';

export function FullPageMessage({ children }: { children: ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center text-gray-500 px-4 text-center">{children}</div>;
}

/** Richiede una sessione. Solo UX: l'accesso ai dati è deciso dalla RLS. */
export function ProtectedRoute() {
  const { t } = useTranslation();
  const status = useAuthStore((s) => s.status);
  const session = useAuthStore((s) => s.session);
  const location = useLocation();

  if (status === 'loading') return <FullPageMessage>{t('app.loading')}</FullPageMessage>;
  if (!session) return <Navigate to="/login" state={{ from: location }} replace />;
  return <Outlet />;
}

/** Guardia per ruolo nell'organizzazione corrente (solo UX: la barriera reale è la RLS). */
export function RoleGuard({ roles, children }: { roles: OrgRole[]; children: ReactNode }) {
  const { role } = useCurrentOrg();
  if (!role || !roles.includes(role)) return <Navigate to=".." replace relative="path" />;
  return <>{children}</>;
}
