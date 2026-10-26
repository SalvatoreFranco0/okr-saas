import { describe, expect, it } from 'vitest';
import { fieldErrors, locationSchema, periodSchema, teamSchema } from './admin';

describe('periodSchema', () => {
  it('accetta date coerenti', () => {
    expect(periodSchema.safeParse({ name: 'Q1 2027', start_date: '2027-01-01', end_date: '2027-03-31' }).success).toBe(true);
  });
  it('rifiuta fine prima dell\'inizio', () => {
    const r = periodSchema.safeParse({ name: 'Q1', start_date: '2027-03-31', end_date: '2027-01-01' });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error).end_date).toBe('validation.dateOrder');
  });
  it('rifiuta nome vuoto o troppo lungo', () => {
    expect(periodSchema.safeParse({ name: '  ', start_date: '2027-01-01', end_date: '2027-01-02' }).success).toBe(false);
    expect(periodSchema.safeParse({ name: 'x'.repeat(101), start_date: '2027-01-01', end_date: '2027-01-02' }).success).toBe(false);
  });
});

describe('locationSchema / teamSchema', () => {
  it('limiti di lunghezza come nel database', () => {
    expect(locationSchema.safeParse({ name: 'Milano', address: 'x'.repeat(300) }).success).toBe(true);
    expect(locationSchema.safeParse({ name: 'Milano', address: 'x'.repeat(301) }).success).toBe(false);
    expect(teamSchema.safeParse({ name: 'Prodotto', description: 'x'.repeat(2001) }).success).toBe(false);
  });
  it('trim del nome', () => {
    const r = teamSchema.parse({ name: '  Vendite  ' });
    expect(r.name).toBe('Vendite');
    expect(r.description).toBe('');
  });
});
