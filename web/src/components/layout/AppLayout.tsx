import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { useAuthStore } from '../../stores/authStore';
import { authService } from '../../services/auth.service';

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { setUser, isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated) {
      authService.getMe().then(({ data }) => {
        setUser(data.user);
      }).catch(() => {
        // Token might be invalid, will be handled by interceptor
      });
    }
  }, [isAuthenticated, setUser]);

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
