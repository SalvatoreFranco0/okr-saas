import api from '../lib/axios';

export const adminService = {
  getKeyResults: (page = 1, limit = 20) =>
    api.get(`/admin/key-results?page=${page}&limit=${limit}`),
  updateKeyResult: (id: string, data: Record<string, unknown>) =>
    api.patch(`/admin/key-results/${id}`, data),

  getActions: (page = 1, limit = 20) =>
    api.get(`/admin/actions?page=${page}&limit=${limit}`),
  updateAction: (id: string, data: Record<string, unknown>) =>
    api.patch(`/admin/actions/${id}`, data),
};
