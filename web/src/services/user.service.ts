import api from '../lib/axios';

export interface CreateUserInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role?: string;
}

export const userService = {
  getAll: () => api.get('/users'),
  getById: (id: string) => api.get(`/users/${id}`),
  create: (data: CreateUserInput) => api.post('/users', data),
  update: (id: string, data: Record<string, unknown>) => api.put(`/users/${id}`, data),
  delete: (id: string) => api.delete(`/users/${id}`),
  updateRole: (id: string, role: string) => api.patch(`/users/${id}/role`, { role }),
  toggleActive: (id: string) => api.patch(`/users/${id}/toggle-active`),
  resetPassword: (id: string, newPassword: string) => api.patch(`/users/${id}/password`, { newPassword }),
  assignTeam: (id: string, teamId: string) => api.post(`/users/${id}/teams`, { teamId }),
  removeFromTeam: (id: string, teamId: string) => api.delete(`/users/${id}/teams/${teamId}`),
};

export const teamService = {
  getAll: () => api.get('/teams'),
  create: (data: { name: string; description?: string }) => api.post('/teams', data),
  update: (id: string, data: { name: string; description?: string }) => api.put(`/teams/${id}`, data),
  delete: (id: string) => api.delete(`/teams/${id}`),
};
