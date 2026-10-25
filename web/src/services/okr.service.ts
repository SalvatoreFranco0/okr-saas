import api from '../lib/axios';

export interface ActionInput {
  title: string;
  description?: string;
  dueDate?: string;
  assigneeId?: string;
}

export interface ActionUpdate {
  title?: string;
  description?: string;
  dueDate?: string | null;
  assigneeId?: string | null;
  isCompleted?: boolean;
}

export interface OkrFilters {
  page?: number;
  limit?: number;
  status?: string;
  priority?: string;
  period?: string;
  teamId?: string;
  search?: string;
}

export interface KeyResultInput {
  id?: string;
  title: string;
  description?: string;
  initialMetric: number;
  targetMetric: number;
  currentMetric: number;
  unit: string;
  weight: number;
  status: string;
}

export interface OkrInput {
  title: string;
  description?: string;
  objective: string;
  ownerId?: string;
  teamId?: string | null;
  period: string;
  startDate: string;
  endDate: string;
  status?: string;
  priority?: string;
  tags?: string[];
  notes?: string;
  keyResults?: KeyResultInput[];
}

export const okrService = {
  getAll: (filters: OkrFilters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '') params.append(key, String(value));
    });
    return api.get(`/okrs?${params.toString()}`);
  },
  getById: (id: string) => api.get(`/okrs/${id}`),
  create: (data: OkrInput) => api.post('/okrs', data),
  update: (id: string, data: Partial<OkrInput>) => api.put(`/okrs/${id}`, data),
  delete: (id: string) => api.delete(`/okrs/${id}`),

  // Key Results
  deleteKeyResult: (okrId: string, krId: string) => api.delete(`/okrs/${okrId}/key-results/${krId}`),

  // Comments
  getComments: (okrId: string) => api.get(`/okrs/${okrId}/comments`),
  addComment: (okrId: string, content: string) => api.post(`/okrs/${okrId}/comments`, { content }),
  deleteComment: (okrId: string, commentId: string) => api.delete(`/okrs/${okrId}/comments/${commentId}`),

  // Actions
  getActions: (okrId: string, krId: string) => api.get(`/okrs/${okrId}/key-results/${krId}/actions`),
  createAction: (okrId: string, krId: string, data: ActionInput) =>
    api.post(`/okrs/${okrId}/key-results/${krId}/actions`, data),
  updateAction: (okrId: string, krId: string, actionId: string, data: ActionUpdate) =>
    api.patch(`/okrs/${okrId}/key-results/${krId}/actions/${actionId}`, data),
  deleteAction: (okrId: string, krId: string, actionId: string) =>
    api.delete(`/okrs/${okrId}/key-results/${krId}/actions/${actionId}`),
};
