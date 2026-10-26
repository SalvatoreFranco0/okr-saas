import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AppLayout } from './components/layout/AppLayout';
import { ProtectedRoute, RoleGuard } from './components/auth/ProtectedRoute';
import { Login } from './pages/Login';
import { ForgotPassword } from './pages/ForgotPassword';
import { SetPassword } from './pages/SetPassword';
import { RootRedirect } from './pages/RootRedirect';
import { Security } from './pages/Security';
import { Dashboard } from './pages/Dashboard';
import { OkrList } from './pages/OkrList';
import { OkrForm } from './pages/OkrForm';
import { OkrDetail } from './pages/OkrDetail';
import { UserManual } from './pages/UserManual';
import { CAN_WRITE_OKR } from './hooks/useCurrentOrg';
import { Periods } from './pages/admin/Periods';
import { Locations } from './pages/admin/Locations';
import { Teams } from './pages/admin/Teams';
import { useAuthStore } from './stores/authStore';
import { isLocale } from './i18n';

function App() {
  const { i18n } = useTranslation();
  const locale = useAuthStore((s) => s.profile?.locale);

  // Lingua iniziale da profiles.locale.
  useEffect(() => {
    if (isLocale(locale) && i18n.language !== locale) void i18n.changeLanguage(locale);
  }, [locale, i18n]);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/set-password" element={<SetPassword />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/security" element={<Security />} />
        <Route path="/o/:orgSlug" element={<AppLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="okrs" element={<OkrList />} />
          <Route path="okrs/archive" element={<OkrList archived />} />
          <Route
            path="okrs/new"
            element={
              <RoleGuard roles={CAN_WRITE_OKR}>
                <OkrForm />
              </RoleGuard>
            }
          />
          <Route path="okrs/:id" element={<OkrDetail />} />
          <Route
            path="okrs/:id/edit"
            element={
              <RoleGuard roles={CAN_WRITE_OKR}>
                <OkrForm />
              </RoleGuard>
            }
          />
          <Route path="periods" element={<RoleGuard roles={['admin', 'manager_okr']}><Periods /></RoleGuard>} />
          <Route path="locations" element={<RoleGuard roles={['admin']}><Locations /></RoleGuard>} />
          <Route path="teams" element={<RoleGuard roles={['admin', 'manager_okr']}><Teams /></RoleGuard>} />
          <Route path="manual" element={<UserManual />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
