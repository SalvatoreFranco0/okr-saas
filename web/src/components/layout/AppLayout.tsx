import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { FullPageMessage } from '../auth/ProtectedRoute';
import { useCurrentOrg } from '../../hooks/useCurrentOrg';
import { writeLastOrgSlug } from '../../lib/orgMemory';

/** Layout di un'organizzazione: risolve lo slug dell'URL tra le organizzazioni dell'utente. */
export function AppLayout() {
  const { t } = useTranslation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { org } = useCurrentOrg();

  useEffect(() => {
    if (org) writeLastOrgSlug(org.slug);
  }, [org]);

  if (!org) return <FullPageMessage>{t('org.notFound')}</FullPageMessage>;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 bg-gray-50">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
