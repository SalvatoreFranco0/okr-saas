import { describe, expect, it } from 'vitest';
import { ConflictError, errorKey, sanitizeSearch } from './errors';

describe('errorKey', () => {
  it('mappa 42501 (RLS) su errors.forbidden', () => {
    expect(errorKey({ code: '42501', message: 'new row violates row-level security policy' })).toBe('errors.forbidden');
  });
  it('distingue periodo chiuso, ciclo e ultimo admin dagli hint dei trigger', () => {
    expect(errorKey({ code: '42501', hint: 'period_closed' })).toBe('errors.periodClosed');
    expect(errorKey({ code: '23514', hint: 'alignment_cycle' })).toBe('errors.alignmentCycle');
    expect(errorKey({ code: 'P0001', hint: 'last_admin' })).toBe('errors.lastAdmin');
  });
  it('mappa i conflitti di concorrenza', () => {
    expect(errorKey(new ConflictError())).toBe('errors.conflict');
    expect(errorKey({ code: '40001' })).toBe('errors.conflict');
    expect(errorKey({ code: 'PGRST116' })).toBe('errors.conflict');
  });
  it('mappa duplicati, riferimenti, valore mancante e vincoli', () => {
    expect(errorKey({ code: '23505' })).toBe('errors.duplicate');
    expect(errorKey({ code: '23503' })).toBe('errors.reference');
    expect(errorKey({ code: '22004' })).toBe('errors.valueRequired');
    expect(errorKey({ code: '23514' })).toBe('errors.invalid');
    expect(errorKey({ code: '22023' })).toBe('errors.invalid');
  });
  it('riconosce gli errori di rete', () => {
    expect(errorKey(new TypeError('Failed to fetch'))).toBe('errors.network');
  });
  it('ricade su errors.generic senza esporre il testo del DB', () => {
    expect(errorKey({ code: 'XX000', message: 'internal: tabella segreta' })).toBe('errors.generic');
    expect(errorKey(null)).toBe('errors.generic');
  });
});

describe('sanitizeSearch', () => {
  it('toglie separatori e jolly che romperebbero il filtro', () => {
    expect(sanitizeSearch('a,b(c)"d"\\e*f%g_h')).toBe('a b c d e f g h');
  });
  it('comprime gli spazi e limita la lunghezza', () => {
    expect(sanitizeSearch('  ricavi   2026 ')).toBe('ricavi 2026');
    expect(sanitizeSearch('x'.repeat(300))).toHaveLength(100);
  });
});
