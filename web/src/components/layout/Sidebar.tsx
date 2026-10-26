import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LayoutDashboard, Target, BookOpen, ShieldCheck, Building2, X, CalendarRange, MapPin, UsersRound, Users } from 'lucide-react';
import { useCurrentOrg } from '../../hooks/useCurrentOrg';
import { canManageSection } from '../../lib/permissions';
import { useAuthStore } from '../../stores/authStore';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const { t } = useTranslation();
  const { org, role } = useCurrentOrg();
  const isPlatformAdmin = useAuthStore((s) => s.isPlatformAdmin);
  const base = `/o/${org?.slug}`;

  const navItems = [
    { to: `${base}/dashboard`, label: t('nav.dashboard'), icon: LayoutDashboard },
    { to: `${base}/okrs`, label: t('nav.okrs'), icon: Target },
    ...(canManageSection(role, 'users') ? [{ to: `${base}/users`, label: t('nav.users'), icon: Users }] : []),
    ...(canManageSection(role, 'periods') ? [{ to: `${base}/periods`, label: t('nav.periods'), icon: CalendarRange }] : []),
    ...(canManageSection(role, 'locations') ? [{ to: `${base}/locations`, label: t('nav.locations'), icon: MapPin }] : []),
    ...(canManageSection(role, 'teams') ? [{ to: `${base}/teams`, label: t('nav.teams'), icon: UsersRound }] : []),
    { to: `${base}/manual`, label: t('nav.manual'), icon: BookOpen },
    ...(isPlatformAdmin ? [{ to: '/platform', label: t('nav.platform'), icon: Building2 }] : []),
    { to: '/security', label: t('nav.security'), icon: ShieldCheck },
  ];

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={onClose} />}

      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-white border-r border-gray-200 transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:z-auto ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between h-16 px-6 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Target className="w-7 h-7 text-primary-600" />
            <span className="text-lg font-bold text-gray-900">{t('app.name')}</span>
          </div>
          <button onClick={onClose} className="lg:hidden text-gray-500 hover:text-gray-700" aria-label={t('app.cancel')}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="p-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  );
}
