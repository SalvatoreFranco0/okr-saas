import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userService, teamService } from '../services/user.service';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { UserPlus, ToggleLeft, ToggleRight, Building2, X, Trash2, KeyRound } from 'lucide-react';

const roleLabels: Record<string, string> = {
  ADMIN: 'Amministratore',
  MANAGER_OKR: 'Manager OKR',
  VIEWER: 'Viewer',
  TEAM_LEAD: 'Team Lead',
};

const roleColors: Record<string, string> = {
  ADMIN: 'bg-danger-100 text-danger-600',
  MANAGER_OKR: 'bg-primary-100 text-primary-600',
  VIEWER: 'bg-gray-100 text-gray-600',
  TEAM_LEAD: 'bg-warning-100 text-warning-600',
};

export function UserManagement() {
  const queryClient = useQueryClient();
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState<{ open: boolean; userId?: string; userName?: string }>({ open: false });
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; userId?: string; userName?: string }>({ open: false });
  const [createForm, setCreateForm] = useState({ email: '', password: '', firstName: '', lastName: '', role: 'VIEWER' });
  const [newPassword, setNewPassword] = useState('');
  const [createError, setCreateError] = useState('');
  const [resetError, setResetError] = useState('');

  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => userService.getAll().then(r => r.data),
  });

  const { data: teams } = useQuery({
    queryKey: ['teams'],
    queryFn: () => teamService.getAll().then(r => r.data),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => userService.updateRole(id, role),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (id: string) => userService.toggleActive(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  const assignTeamMutation = useMutation({
    mutationFn: ({ userId, teamId }: { userId: string; teamId: string }) =>
      userService.assignTeam(userId, teamId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setShowTeamModal(false);
    },
  });

  const removeTeamMutation = useMutation({
    mutationFn: ({ userId, teamId }: { userId: string; teamId: string }) =>
      userService.removeFromTeam(userId, teamId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  const createUserMutation = useMutation({
    mutationFn: () => userService.create(createForm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setShowCreateModal(false);
      setCreateForm({ email: '', password: '', firstName: '', lastName: '', role: 'VIEWER' });
      setCreateError('');
    },
    onError: (err: any) => {
      setCreateError(err?.response?.data?.message || 'Errore nella creazione utente');
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (id: string) => userService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setDeleteDialog({ open: false });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      userService.resetPassword(id, password),
    onSuccess: () => {
      setShowResetModal({ open: false });
      setNewPassword('');
      setResetError('');
    },
    onError: (err: any) => {
      setResetError(err?.response?.data?.message || 'Errore nel reset password');
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestione Utenti</h1>
          <p className="text-gray-500 text-sm">{users?.length || 0} utenti registrati</p>
        </div>
        <button
          onClick={() => { setShowCreateModal(true); setCreateError(''); }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors text-sm"
        >
          <UserPlus className="w-4 h-4" /> Nuovo Utente
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Utente</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Ruolo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Team</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Stato</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users?.map((u: any) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{u.firstName} {u.lastName}</p>
                    <p className="text-xs text-gray-500">{u.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={u.role}
                      onChange={(e) => updateRoleMutation.mutate({ id: u.id, role: e.target.value })}
                      className={`text-xs font-medium px-2 py-1 rounded-full border-0 outline-none cursor-pointer ${roleColors[u.role]}`}
                    >
                      {Object.entries(roleLabels).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {u.teams?.map((ut: any) => (
                        <span
                          key={ut.team.id}
                          className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full"
                        >
                          {ut.team.name}
                          <button
                            onClick={() => removeTeamMutation.mutate({ userId: u.id, teamId: ut.team.id })}
                            className="hover:text-danger-500"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                      <button
                        onClick={() => { setSelectedUser(u.id); setShowTeamModal(true); }}
                        className="text-xs text-primary-600 hover:text-primary-700"
                      >
                        + Team
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleActiveMutation.mutate(u.id)}
                      className={`flex items-center gap-1 text-xs font-medium ${u.isActive ? 'text-success-500' : 'text-gray-400'}`}
                    >
                      {u.isActive ? (
                        <><ToggleRight className="w-5 h-5" /> Attivo</>
                      ) : (
                        <><ToggleLeft className="w-5 h-5" /> Inattivo</>
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => { setSelectedUser(u.id); setShowTeamModal(true); }}
                        className="p-1.5 text-gray-400 hover:text-primary-600 rounded md:hidden"
                        title="Assegna team"
                      >
                        <Building2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setShowResetModal({ open: true, userId: u.id, userName: `${u.firstName} ${u.lastName}` });
                          setNewPassword('');
                          setResetError('');
                        }}
                        className="p-1.5 text-gray-400 hover:text-warning-600 rounded"
                        title="Reset password"
                      >
                        <KeyRound className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteDialog({ open: true, userId: u.id, userName: `${u.firstName} ${u.lastName}` })}
                        className="p-1.5 text-gray-400 hover:text-danger-500 rounded"
                        title="Elimina utente"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Team Assignment Modal */}
      {showTeamModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Assegna Team</h3>
            <div className="space-y-2">
              {teams?.map((t: any) => (
                <button
                  key={t.id}
                  onClick={() => selectedUser && assignTeamMutation.mutate({ userId: selectedUser, teamId: t.id })}
                  className="w-full text-left px-3 py-2 border border-gray-200 rounded-lg hover:bg-primary-50 hover:border-primary-300 text-sm"
                >
                  {t.name}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowTeamModal(false)}
              className="mt-4 w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 text-sm"
            >
              Chiudi
            </button>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Nuovo Utente</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Nome *</label>
                  <input
                    value={createForm.firstName}
                    onChange={(e) => setCreateForm(f => ({ ...f, firstName: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Cognome *</label>
                  <input
                    value={createForm.lastName}
                    onChange={(e) => setCreateForm(f => ({ ...f, lastName: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Email *</label>
                <input
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Password *</label>
                <input
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm(f => ({ ...f, password: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Ruolo</label>
                <select
                  value={createForm.role}
                  onChange={(e) => setCreateForm(f => ({ ...f, role: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                >
                  {Object.entries(roleLabels).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              {createError && <p className="text-xs text-danger-600">{createError}</p>}
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => createUserMutation.mutate()}
                disabled={!createForm.email || !createForm.password || !createForm.firstName || !createForm.lastName || createUserMutation.isPending}
                className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
              >
                {createUserMutation.isPending ? 'Creazione...' : 'Crea Utente'}
              </button>
              <button
                onClick={() => { setShowCreateModal(false); setCreateError(''); }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-600 text-sm hover:bg-gray-50"
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showResetModal.open && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Reset Password</h3>
            <p className="text-sm text-gray-500 mb-4">{showResetModal.userName}</p>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nuova password *</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimo 6 caratteri"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
            {resetError && <p className="text-xs text-danger-600 mt-2">{resetError}</p>}
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => showResetModal.userId && resetPasswordMutation.mutate({ id: showResetModal.userId, password: newPassword })}
                disabled={newPassword.length < 6 || resetPasswordMutation.isPending}
                className="flex-1 px-4 py-2 bg-warning-600 text-white rounded-lg text-sm font-medium hover:bg-warning-700 disabled:opacity-50"
              >
                {resetPasswordMutation.isPending ? 'Salvataggio...' : 'Reimposta Password'}
              </button>
              <button
                onClick={() => { setShowResetModal({ open: false }); setResetError(''); }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-600 text-sm hover:bg-gray-50"
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete User Dialog */}
      <ConfirmDialog
        isOpen={deleteDialog.open}
        title="Elimina Utente"
        message={`Sei sicuro di voler eliminare l'utente "${deleteDialog.userName}"? Questa azione è irreversibile.`}
        confirmText="Elimina"
        cancelText="Annulla"
        isDangerous
        isLoading={deleteUserMutation.isPending}
        onConfirm={() => deleteDialog.userId && deleteUserMutation.mutate(deleteDialog.userId)}
        onCancel={() => setDeleteDialog({ open: false })}
      />
    </div>
  );
}
