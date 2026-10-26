import { describe, expect, it } from 'vitest';
import { parseDashboardStats, statusChartData } from './dashboardStats';

describe('parseDashboardStats', () => {
  it('legge la forma della RPC', () => {
    const s = parseDashboardStats({
      total: 4,
      avg_progress: '50.0',
      by_status: { attivo: 3, completato: 1 },
      latest: [{ id: 'a', title: 'T', status: 'attivo', priority: 'alta', progress_percentage: 25, updated_at: '2026-10-25T10:00:00Z' }],
      critical: [{ id: 'b', title: 'C', status: 'attivo', progress_percentage: 10, end_date: '2026-12-31' }],
    });
    expect(s.total).toBe(4);
    expect(s.avgProgress).toBe(50);
    expect(s.byStatus).toEqual({ in_pianificazione: 0, attivo: 3, in_pausa: 0, completato: 1, non_raggiunto: 0 });
    expect(s.latest[0].priority).toBe('alta');
    expect(s.critical[0].end_date).toBe('2026-12-31');
  });
  it.each([null, undefined, 'x', 5, []])('input non valido %j -> tutto a zero', (v) => {
    const s = parseDashboardStats(v);
    expect(s.total).toBe(0);
    expect(s.latest).toEqual([]);
    expect(Object.values(s.byStatus).every((n) => n === 0)).toBe(true);
  });
  it('scarta voci senza id e valori non numerici', () => {
    const s = parseDashboardStats({ total: 'abc', latest: [{ title: 'senza id' }, { id: 'x', progress_percentage: 'zzz' }] });
    expect(s.total).toBe(0);
    expect(s.latest).toHaveLength(1);
    expect(s.latest[0].progress_percentage).toBe(0);
  });
});

describe('statusChartData', () => {
  it('ordine del ciclo di vita e zeri inclusi', () => {
    const d = statusChartData({ in_pianificazione: 0, attivo: 3, in_pausa: 0, completato: 1, non_raggiunto: 0 });
    expect(d.map((x) => x.status)).toEqual(['in_pianificazione', 'attivo', 'in_pausa', 'completato', 'non_raggiunto']);
    expect(d.map((x) => x.count)).toEqual([0, 3, 0, 1, 0]);
  });
});
