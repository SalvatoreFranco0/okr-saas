import { describe, expect, it } from 'vitest';
import { CSV_BOM, cellToString, escapeCell, neutralizeCell, okrsToRows, toCsv, toCsvRow, type ExportKr, type ExportLabels, type ExportOkr } from './csv';

describe('neutralizeCell (CSV injection)', () => {
  it.each(['=1+1', '+SUM(A1)', '-2+3', '@cmd', '\tx', '\rx', '\nx', "=HYPERLINK(\"http://x\";\"y\")"])('prefissa %j', (v) => {
    expect(neutralizeCell(v)).toBe(`'${v}`);
  });
  it.each(['ciao', 'a=b', 'x-y', '', ' =spazio', "'gia"])('lascia %j', (v) => {
    expect(neutralizeCell(v)).toBe(v);
  });
});

describe('cellToString', () => {
  it('numeri con virgola decimale, anche negativi, senza apice', () => {
    expect(cellToString(12.5)).toBe('12,5');
    expect(cellToString(-3)).toBe('-3');
  });
  it('null, undefined e non finiti sono vuoti', () => {
    expect(cellToString(null)).toBe('');
    expect(cellToString(undefined)).toBe('');
    expect(cellToString(NaN)).toBe('');
    expect(cellToString(Infinity)).toBe('');
  });
  it('testo che inizia con - è neutralizzato', () => {
    expect(cellToString('-5')).toBe("'-5");
  });
});

describe('escapeCell / toCsvRow', () => {
  it('quota separatore, virgolette e a capo', () => {
    expect(escapeCell('a;b')).toBe('"a;b"');
    expect(escapeCell('di "x"')).toBe('"di ""x"""');
    expect(escapeCell('a\nb')).toBe('"a\nb"');
    expect(escapeCell('semplice')).toBe('semplice');
  });
  it('la neutralizzazione avviene prima del quoting', () => {
    expect(toCsvRow(['=A1;B1'])).toBe('"\'=A1;B1"');
  });
  it('unisce con ;', () => {
    expect(toCsvRow(['a', 1.5, null, 'b'])).toBe('a;1,5;;b');
  });
});

describe('toCsv', () => {
  it('BOM iniziale, CRLF, riga finale, molte righe', () => {
    const rows = Array.from({ length: 2500 }, (_, i) => [`r${i}`, i]);
    const out = toCsv(['nome', 'n'], rows);
    expect(out.startsWith(CSV_BOM + 'nome;n\r\n')).toBe(true);
    expect(out.endsWith('\r\n')).toBe(true);
    expect(out.split('\r\n')).toHaveLength(2500 + 2);
  });
});

const labels: ExportLabels = {
  header: [],
  status: (s) => `S:${s}`,
  krStatus: (s) => `K:${s}`,
  weight: 'peso',
  priority: (p) => `P:${p}`,
  orgLevel: 'Organizzazione',
  periods: new Map([['p1', 'Q4']]),
  locations: new Map([['l1', 'Milano']]),
  teams: new Map([['t1', 'Vendite']]),
};
const okr = (o: Partial<ExportOkr>): ExportOkr => ({
  id: 'o1', title: 'T', objective: 'Ob', status: 'attivo', priority: 'alta', progress_percentage: 50,
  period_id: 'p1', location_id: null, team_id: null, start_date: null, end_date: '2026-12-31', tags: ['a', 'b'], ...o,
});
const kr = (o: Partial<ExportKr>): ExportKr => ({
  okr_id: 'o1', title: 'KR1', unit: '%', initial_metric: 0, target_metric: 10, current_metric: 5, weight: 1, status: 'on_track', ...o,
});

describe('okrsToRows', () => {
  it('una riga per OKR con KR raccolti e nomi risolti', () => {
    const rows = okrsToRows([okr({ location_id: 'l1', team_id: 't1' }), okr({ id: 'o2', title: '=EVIL()' })], [kr({}), kr({ title: 'KR2', okr_id: 'o1' })], labels);
    expect(rows).toHaveLength(2);
    expect(rows[0][6]).toBe('Milano');
    expect(rows[0][7]).toBe('Vendite');
    expect(rows[0][10]).toBe('a, b');
    expect(rows[0][11]).toBe(2);
    expect(rows[0][12]).toBe('KR1 (5/10 %, peso 1, K:on_track) | KR2 (5/10 %, peso 1, K:on_track)');
    expect(rows[1][6]).toBe('Organizzazione');
    expect(rows[1][11]).toBe(0);
  });
  it('titoli con formula escono neutralizzati nel CSV', () => {
    const csv = toCsv(['t'], okrsToRows([okr({ title: '=EVIL()' })], [kr({ title: '@SUM(1)' })], labels).map((r) => [r[0], r[12]]));
    expect(csv).toContain("'=EVIL()");
    expect(csv).toContain("'@SUM(1)");
  });
});
