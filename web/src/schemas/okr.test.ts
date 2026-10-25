import { describe, expect, it } from 'vitest';
import { actionSchema, checkInSchema, okrCreateSchema, okrEditSchema, orNull, parseTags } from './okr';

const kr = { title: 'Ricavi', unit: '€', initial_metric: '0', target_metric: '100' };
const valid = {
  title: 'Crescere',
  objective: 'Aumentare i ricavi',
  period_id: 'p1',
  owner_id: 'u1',
  priority: 'media',
  keyResults: [kr],
};

describe('okrCreateSchema', () => {
  it('accetta un OKR valido, converte i numeri e applica i default', () => {
    const r = okrCreateSchema.parse(valid);
    expect(r.keyResults[0].target_metric).toBe(100);
    expect(r.keyResults[0].weight).toBe(100);
    expect(r.keyResults[0].status).toBe('non_iniziato');
    expect(r.location_id).toBe('');
    expect(r.status).toBe('in_pianificazione');
  });
  it('rifiuta titolo vuoto o oltre 300 caratteri', () => {
    expect(okrCreateSchema.safeParse({ ...valid, title: '   ' }).success).toBe(false);
    expect(okrCreateSchema.safeParse({ ...valid, title: 'x'.repeat(301) }).success).toBe(false);
  });
  it('richiede da 1 a 20 key result', () => {
    expect(okrCreateSchema.safeParse({ ...valid, keyResults: [] }).success).toBe(false);
    expect(okrCreateSchema.safeParse({ ...valid, keyResults: Array(21).fill(kr) }).success).toBe(false);
    expect(okrCreateSchema.safeParse({ ...valid, keyResults: Array(20).fill(kr) }).success).toBe(true);
  });
  it('rifiuta KR con iniziale = obiettivo, unità troppo lunga o peso negativo', () => {
    expect(okrCreateSchema.safeParse({ ...valid, keyResults: [{ ...kr, target_metric: '0' }] }).success).toBe(false);
    expect(okrCreateSchema.safeParse({ ...valid, keyResults: [{ ...kr, unit: 'x'.repeat(31) }] }).success).toBe(false);
    expect(okrCreateSchema.safeParse({ ...valid, keyResults: [{ ...kr, weight: '-1' }] }).success).toBe(false);
  });
  it('rifiuta date incoerenti', () => {
    expect(okrCreateSchema.safeParse({ ...valid, start_date: '2026-12-31', end_date: '2026-10-01' }).success).toBe(false);
    expect(okrCreateSchema.safeParse({ ...valid, start_date: '2026-10-01', end_date: '2026-12-31' }).success).toBe(true);
  });
});

describe('okrEditSchema', () => {
  it('non richiede key result', () => {
    const edit = { ...valid, keyResults: undefined };
    expect(okrEditSchema.safeParse(edit).success).toBe(true);
  });
  it('limita descrizione e note a 5000 caratteri', () => {
    const edit = { ...valid, keyResults: undefined };
    expect(okrEditSchema.safeParse({ ...edit, description: 'x'.repeat(5001) }).success).toBe(false);
    expect(okrEditSchema.safeParse({ ...edit, notes: 'x'.repeat(5001) }).success).toBe(false);
  });
});

describe('checkInSchema e actionSchema', () => {
  it('check-in: numero obbligatorio, nota max 2000', () => {
    expect(checkInSchema.safeParse({ value: 'abc' }).success).toBe(false);
    expect(checkInSchema.safeParse({ value: '42' }).success).toBe(true);
    expect(checkInSchema.safeParse({ value: 1, note: 'x'.repeat(2001) }).success).toBe(false);
  });
  it('azione: titolo obbligatorio', () => {
    expect(actionSchema.safeParse({ title: ' ' }).success).toBe(false);
    expect(actionSchema.safeParse({ title: 'Chiamare il cliente' }).success).toBe(true);
  });
});

describe('orNull e parseTags', () => {
  it('orNull converte vuoti in null', () => {
    expect(orNull('')).toBeNull();
    expect(orNull('  ')).toBeNull();
    expect(orNull(undefined)).toBeNull();
    expect(orNull('abc')).toBe('abc');
  });
  it('parseTags ripulisce, deduplica e limita', () => {
    expect(parseTags(' a, b ,,a,c ')).toEqual(['a', 'b', 'c']);
    expect(parseTags('')).toEqual([]);
    expect(parseTags(Array.from({ length: 30 }, (_, i) => `t${i}`).join(','))).toHaveLength(20);
  });
});
