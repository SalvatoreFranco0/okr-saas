import { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { FullPageMessage } from '../auth/ProtectedRoute';
import { useCurrentOrg } from '../../hooks/useCurrentOrg';
import { writeLastOrgSlug } from '../../lib/orgMemory';
import { useAuthStore } from '../../stores/authStore';
import { endSupportSession } from '../../services/platform.service';
import { queryClient } from '../../lib/queryClient';

/** Layout di un'organizzazione: risolve lo slug dell'URL tra le organizzazioni dell'utente. */
export function AppLayout() {
  const { t } = useTranslation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { org } = useCurrentOrg();
  const navigate = useNavigate();
  const reload = useAuthStore((s) => s.reload);
  const endSession = useMutation({
    mutationFn: (sessionId: string) => endSupportSession(sessionId),
    onSuccess: async () => {
      // Nessun dato dell'organizzazione deve restare in cache dopo la fine della sessione.
      queryClient.clear();
      await reload();
      navigate('/platform');
    },
  });

  useEffect(() => {
    if (org) writeLastOrgSlug(org.slug);
  }, [org]);

  if (!org) return <FullPageMessage>{t('org.notFound')}</FullPageMessage>;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        {org.support && (
          <div role="status" className="bg-warning-100 text-warning-600 border-b border-warning-100 px-4 py-2 text-sm flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">
              {t('platform.banner', { name: org.name, time: new Date(org.support.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })}
            </span>
            <button
              type="button"
              disabled={endSession.isPending}
              onClick={() => endSession.mutate(org.support!.sessionId)}
              className="px-3 py-1 border border-current rounded-lg text-xs font-medium hover:bg-warning-50"
            >
              {t('platform.endSession')}
            </button>
          </div>
        )}
        <TopBar onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 bg-gray-50">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
