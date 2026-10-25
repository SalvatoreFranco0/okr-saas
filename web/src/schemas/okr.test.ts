import { describe, expect, it } from 'vitest';
import { okrCreateSchema, checkInSchema } from './okr';

const valid = {
  title: 'Crescere',
  objective: 'Aumentare i ricavi',
  period_id: 'p1',
  priority: 'media',
  keyResults: [{ title: 'Ricavi', unit: '€', initial_metric: '0', target_metric: '100' }],
};

describe('okrCreateSchema', () => {
  it('accetta un OKR valido e converte i numeri', () => {
    const r = okrCreateSchema.parse(valid);
    expect(r.keyResults[0].target_metric).toBe(100);
  });
  it('rifiuta titolo vuoto o oltre 300 caratteri', () => {
    expect(okrCreateSchema.safeParse({ ...valid, title: '   ' }).success).toBe(false);
    expect(okrCreateSchema.safeParse({ ...valid, title: 'x'.repeat(301) }).success).toBe(false);
  });
  it('richiede 1-2 key result', () => {
    expect(okrCreateSchema.safeParse({ ...valid, keyResults: [] }).success).toBe(false);
    const kr = valid.keyResults[0];
    expect(okrCreateSchema.safeParse({ ...valid, keyResults: [kr, kr, kr] }).success).toBe(false);
  });
  it('rifiuta KR con valore iniziale uguale all’obiettivo e unità troppo lunga', () => {
    const same = { ...valid.keyResults[0], target_metric: '0' };
    expect(okrCreateSchema.safeParse({ ...valid, keyResults: [same] }).success).toBe(false);
    const unit = { ...valid.keyResults[0], unit: 'x'.repeat(31) };
    expect(okrCreateSchema.safeParse({ ...valid, keyResults: [unit] }).success).toBe(false);
  });
});

describe('checkInSchema', () => {
  it('richiede un numero e limita la nota a 2000 caratteri', () => {
    expect(checkInSchema.safeParse({ value: 'abc' }).success).toBe(false);
    expect(checkInSchema.safeParse({ value: '42' }).success).toBe(true);
    expect(checkInSchema.safeParse({ value: 1, note: 'x'.repeat(2001) }).success).toBe(false);
  });
});
