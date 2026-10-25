import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore, type OrgRole } from '../../stores/authStore';
import { useCurrentOrg } from '../../hooks/useCurrentOrg';
import { mfaGate } from '../../lib/mfaGate';
import { Security } from '../../pages/Security';

export function FullPageMessage({ children }: { children: ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center text-gray-500 px-4 text-center">{children}</div>;
}

/**
 * Richiede una sessione e applica il blocco MFA. Solo UX: l'accesso ai dati è deciso dalla RLS.
 *
 * Blocco MFA (vedi lib/mfaGate.ts): se la sessione non è aal2 e l'utente ha un TOTP verificato
 * (nextAal === 'aal2'), oppure è super-admin secondo `platformAdminHint`, non si renderizza
 * nessuna route figlia: al loro posto si mostra la pagina Sicurezza in modalità "verifica" o
 * "attivazione obbligatoria" con il pulsante Esci. Nessun redirect (l'URL resta quello richiesto,
 * /security compreso), quindi nessun loop: appena lo store passa ad aal2 si vede la route richiesta.
 *
 * NOTA DI SICUREZZA: a aal1 il client non può sapere con certezza se l'utente è super-admin
 * (la policy platform_admins_select richiede aal2). `platformAdminHint` (app_metadata.platform_admin,
 * scrivibile solo dal backend privilegiato) è solo un indizio UX; la barriera reale è la RLS,
 * perché private.is_platform_admin() richiede aal2.
 */
export function ProtectedRoute() {
  const { t } = useTranslation();
  const status = useAuthStore((s) => s.status);
  const session = useAuthStore((s) => s.session);
  const gate = useAuthStore((s) =>
    mfaGate({ aal: s.aal, nextAal: s.nextAal, platformAdminHint: s.platformAdminHint, isPlatformAdmin: s.isPlatformAdmin }),
  );
  const location = useLocation();

  if (status === 'loading') return <FullPageMessage>{t('app.loading')}</FullPageMessage>;
  if (!session) return <Navigate to="/login" state={{ from: location }} replace />;
  if (gate !== 'ok') return <Security />;
  return <Outlet />;
}

/** Guardia per ruolo nell'organizzazione corrente (solo UX: la barriera reale è la RLS). */
export function RoleGuard({ roles, children }: { roles: OrgRole[]; children: ReactNode }) {
  const { role } = useCurrentOrg();
  if (!role || !roles.includes(role)) return <Navigate to=".." replace relative="path" />;
  return <>{children}</>;
}
