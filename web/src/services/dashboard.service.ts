import api from '../lib/axios';

export const dashboardService = {
  getStats: () => api.get('/dashboard/stats'),
};
