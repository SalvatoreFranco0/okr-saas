import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Menu, LogOut, User } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useCurrentOrg } from '../../hooks/useCurrentOrg';
import { queryClient } from '../../lib/queryClient';
import { LanguageSelect } from '../LanguageSelect';

interface TopBarProps {
  onMenuClick: () => void;
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const orgs = useAuthStore((s) => s.orgs);
  const signOut = useAuthStore((s) => s.signOut);
  const { org, role } = useCurrentOrg();

  const switchOrg = (slug: string) => {
    // Nessun dato di un'organizzazione deve restare in cache per un'altra.
    queryClient.clear();
    navigate(`/o/${slug}/dashboard`);
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || profile?.email || '';

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-6 gap-3">
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100"
        aria-label="Menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      <div className="flex-1">
        {orgs.length > 1 && org && (
          <select
            aria-label={t('org.select')}
            value={org.slug}
            onChange={(e) => switchOrg(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 bg-white"
          >
            {orgs.map((o) => (
              <option key={o.id} value={o.slug}>
                {o.name}
              </option>
            ))}
          </select>
        )}
        {orgs.length === 1 && org && <span className="text-sm font-medium text-gray-700">{org.name}</span>}
      </div>

      <LanguageSelect />

      <div className="flex items-center gap-4">
        <div className="hidden sm:block text-right">
          <p className="text-sm font-medium text-gray-900">{fullName}</p>
          {role && <p className="text-xs text-gray-500">{t(`roles.${role}`)}</p>}
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center">
            <User className="w-4 h-4" />
          </div>
          <button
            onClick={handleLogout}
            className="p-2 text-gray-400 hover:text-danger-500 rounded-lg hover:bg-gray-100 transition-colors"
            title={t('nav.logout')}
            aria-label={t('nav.logout')}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
