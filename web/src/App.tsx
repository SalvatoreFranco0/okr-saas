import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Dashboard } from './pages/Dashboard';
import { OkrList } from './pages/OkrList';
import { OkrDetail } from './pages/OkrDetail';
import { OkrForm } from './pages/OkrForm';
import { UserManagement } from './pages/UserManagement';
import { DatabaseManagement } from './pages/DatabaseManagement';
import { UserManual } from './pages/UserManual';

function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Protected routes */}
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/okrs" element={<OkrList />} />
        <Route path="/okrs/new" element={
          <ProtectedRoute roles={['ADMIN', 'MANAGER_OKR', 'TEAM_LEAD']}>
            <OkrForm />
          </ProtectedRoute>
        } />
        <Route path="/okrs/:id" element={<OkrDetail />} />
        <Route path="/okrs/:id/edit" element={
          <ProtectedRoute roles={['ADMIN', 'MANAGER_OKR', 'TEAM_LEAD']}>
            <OkrForm />
          </ProtectedRoute>
        } />
        <Route path="/users" element={
          <ProtectedRoute roles={['ADMIN']}>
            <UserManagement />
          </ProtectedRoute>
        } />
        <Route path="/database" element={
          <ProtectedRoute roles={['ADMIN']}>
            <DatabaseManagement />
          </ProtectedRoute>
        } />
        <Route path="/manual" element={<UserManual />} />
      </Route>

      {/* Redirect */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;
