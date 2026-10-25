import { describe, expect, it } from 'vitest';
import { mfaGate, type Aal, type MfaGateResult } from './mfaGate';

type Case = [aal: Aal | null, nextAal: Aal | null, hint: boolean, admin: boolean, expected: MfaGateResult];

// Tutte le combinazioni di aal/nextAal (incluso null) × indizio × flag autorevole.
const cases: Case[] = [
  // Sessione aal2: mai bloccata.
  ['aal2', 'aal2', false, false, 'ok'],
  ['aal2', 'aal2', true, false, 'ok'],
  ['aal2', 'aal2', false, true, 'ok'],
  ['aal2', 'aal2', true, true, 'ok'],
  ['aal2', 'aal1', false, false, 'ok'],
  ['aal2', 'aal1', true, true, 'ok'],
  ['aal2', null, true, false, 'ok'],
  // TOTP verificato ma non usato in questa sessione: verifica, per chiunque.
  ['aal1', 'aal2', false, false, 'verify'],
  ['aal1', 'aal2', true, false, 'verify'],
  ['aal1', 'aal2', false, true, 'verify'],
  ['aal1', 'aal2', true, true, 'verify'],
  [null, 'aal2', false, false, 'verify'],
  // Nessun TOTP verificato: utente normale libero, super-admin obbligato ad attivarlo.
  ['aal1', 'aal1', false, false, 'ok'],
  ['aal1', 'aal1', true, false, 'enroll'],
  ['aal1', 'aal1', false, true, 'enroll'],
  ['aal1', 'aal1', true, true, 'enroll'],
  ['aal1', null, false, false, 'ok'],
  ['aal1', null, true, false, 'enroll'],
  [null, null, false, false, 'ok'],
  [null, null, true, false, 'enroll'],
  [null, 'aal1', false, true, 'enroll'],
];

describe('mfaGate', () => {
  it.each(cases)('aal=%s nextAal=%s hint=%s admin=%s → %s', (aal, nextAal, platformAdminHint, isPlatformAdmin, expected) => {
    expect(mfaGate({ aal, nextAal, platformAdminHint, isPlatformAdmin })).toBe(expected);
  });
});
