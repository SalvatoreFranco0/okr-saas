import { useAuthStore } from '../../stores/authStore';
import { authService } from '../../services/auth.service';
import { useNavigate } from 'react-router-dom';
import { Menu, LogOut, User } from 'lucide-react';

interface TopBarProps {
  onMenuClick: () => void;
}

const roleLabels: Record<string, string> = {
  ADMIN: 'Amministratore',
  MANAGER_OKR: 'Manager OKR',
  VIEWER: 'Viewer',
  TEAM_LEAD: 'Team Lead',
};

export function TopBar({ onMenuClick }: TopBarProps) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await authService.logout();
    } catch {
      // ignore
    }
    logout();
    navigate('/login');
  };

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-6">
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100"
      >
        <Menu className="w-5 h-5" />
      </button>

      <div className="flex-1" />

      {user && (
        <div className="flex items-center gap-4">
          <div className="hidden sm:block text-right">
            <p className="text-sm font-medium text-gray-900">
              {user.firstName} {user.lastName}
            </p>
            <p className="text-xs text-gray-500">{roleLabels[user.role]}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center">
              <User className="w-4 h-4" />
            </div>
            <button
              onClick={handleLogout}
              className="p-2 text-gray-400 hover:text-danger-500 rounded-lg hover:bg-gray-100 transition-colors"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
