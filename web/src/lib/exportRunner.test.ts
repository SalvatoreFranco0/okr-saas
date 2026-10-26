import { describe, expect, it, vi } from 'vitest';
import type { ExportKr, ExportOkr } from './csv';
import { collectExport, ExportCancelled, type ExportSource } from './exportRunner';

const mk = (n: number): ExportOkr[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `o${i}`, title: `t${i}`, objective: '', status: 'attivo', priority: 'alta', progress_percentage: 0,
    period_id: 'p', location_id: null, team_id: null, start_date: null, end_date: null, tags: [],
  }));

function source(total: number): ExportSource & { pages: number[][]; krCalls: number } {
  const all = mk(total);
  const s = {
    pages: [] as number[][],
    krCalls: 0,
    async page(offset: number, limit: number) {
      s.pages.push([offset, limit]);
      return { rows: all.slice(offset, offset + limit), total };
    },
    async krs(ids: string[]): Promise<ExportKr[]> {
      s.krCalls++;
      return ids.map((id) => ({ okr_id: id, title: 'k', unit: '', initial_metric: 0, target_metric: 1, current_metric: 0, weight: 1, status: 'on_track' }));
    },
  };
  return s;
}

describe('collectExport', () => {
  it('scarica più pagine (2500 righe, blocchi da 1000) e i KR a blocchi da 100', async () => {
    const s = source(2500);
    const onProgress = vi.fn();
    const r = await collectExport(s, { onProgress });
    expect(r.okrs).toHaveLength(2500);
    expect(r.truncated).toBe(false);
    expect(s.pages).toEqual([[0, 1000], [1000, 1000], [2000, 1000]]);
    expect(s.krCalls).toBe(25);
    expect(r.krs).toHaveLength(2500);
    expect(onProgress).toHaveBeenLastCalledWith({ loaded: 2500, total: 2500 });
  });
  it('applica il limite massimo e segnala il troncamento', async () => {
    const s = source(2500);
    const r = await collectExport(s, { max: 1500 });
    expect(r.okrs).toHaveLength(1500);
    expect(r.truncated).toBe(true);
    expect(r.total).toBe(2500);
    expect(s.pages).toEqual([[0, 1000], [1000, 500]]);
  });
  it('filtro vuoto: nessuna riga, nessuna richiesta KR', async () => {
    const s = source(0);
    const r = await collectExport(s);
    expect(r.okrs).toEqual([]);
    expect(s.krCalls).toBe(0);
  });
  it('si ferma se annullato', async () => {
    const s = source(5000);
    const ac = new AbortController();
    const p = collectExport(s, { signal: ac.signal, onProgress: () => ac.abort() });
    await expect(p).rejects.toBeInstanceOf(ExportCancelled);
  });
});
