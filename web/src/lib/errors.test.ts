import { describe, expect, it } from 'vitest';
import { errorKey } from './errors';

describe('errorKey', () => {
  it('mappa 42501 (RLS) su errors.forbidden', () => {
    expect(errorKey({ code: '42501', message: 'new row violates row-level security policy' })).toBe('errors.forbidden');
  });
  it('mappa i conflitti di concorrenza', () => {
    expect(errorKey({ code: '40001' })).toBe('errors.conflict');
    expect(errorKey({ code: 'PGRST116' })).toBe('errors.conflict');
  });
  it('riconosce gli errori di rete', () => {
    expect(errorKey(new TypeError('Failed to fetch'))).toBe('errors.network');
  });
  it('ricade su errors.generic senza esporre il testo del DB', () => {
    expect(errorKey({ code: '23505', message: 'duplicate key value' })).toBe('errors.generic');
    expect(errorKey(null)).toBe('errors.generic');
  });
});
