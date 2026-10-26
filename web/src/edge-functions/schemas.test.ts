import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../supabase/functions/_shared/errors.ts';
import {
  inviteUserSchema,
  parseInput,
  removeMemberSchema,
  resendInviteSchema,
  updateMemberSchema,
} from '../../../supabase/functions/_shared/schemas.ts';

const ORG = 'a0000000-0000-4000-8000-000000000001';
const USER = 'd0000000-0000-4000-8000-000000000002';
const LOC = 'b0000000-0000-4000-8000-000000000001';

function expectInvalid(fn: () => unknown) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).code).toBe('invalid_input');
    expect((e as ApiError).status).toBe(400);
    return e as ApiError;
  }
  throw new Error('atteso invalid_input');
}

describe('inviteUserSchema', () => {
  it('normalizza l\'email (trim + minuscolo) e applica location_ids = [] di default', () => {
    const r = parseInput(inviteUserSchema, { organization_id: ORG, email: '  Mario.Rossi@Example.COM ', role: 'viewer' });
    expect(r.email).toBe('mario.rossi@example.com');
    expect(r.location_ids).toEqual([]);
    expect(r.first_name).toBeUndefined();
  });
  it('nomi: trim, stringa vuota = assente', () => {
    const r = parseInput(inviteUserSchema, {
      organization_id: ORG, email: 'a@b.it', role: 'admin', first_name: '  Mario ', last_name: '', location_ids: [LOC, LOC],
    });
    expect(r.first_name).toBe('Mario');
    expect(r.last_name).toBeUndefined();
    expect(r.location_ids).toEqual([LOC]);
  });
  it('accetta tutti i ruoli e uuid non RFC (come Postgres)', () => {
    for (const role of ['admin', 'manager_okr', 'team_lead', 'viewer']) {
      expect(parseInput(inviteUserSchema, { organization_id: '11111111-1111-1111-1111-111111111111', email: 'a@b.it', role }).role).toBe(role);
    }
  });
  it.each([
    ['email mancante', { organization_id: ORG, role: 'viewer' }],
    ['email non valida', { organization_id: ORG, email: 'non-una-email', role: 'viewer' }],
    ['ruolo sconosciuto', { organization_id: ORG, email: 'a@b.it', role: 'owner' }],
    ['org non uuid', { organization_id: 'abc', email: 'a@b.it', role: 'viewer' }],
    ['sede non uuid', { organization_id: ORG, email: 'a@b.it', role: 'viewer', location_ids: ['x'] }],
    ['sede nulla', { organization_id: ORG, email: 'a@b.it', role: 'viewer', location_ids: [null] }],
    ['campo extra (identita\' dal body)', { organization_id: ORG, email: 'a@b.it', role: 'viewer', actor_id: USER }],
    ['nome troppo lungo', { organization_id: ORG, email: 'a@b.it', role: 'viewer', first_name: 'x'.repeat(101) }],
    ['body non oggetto', 'ciao'],
    ['body nullo', null],
  ])('rifiuta: %s', (_label, body) => {
    expectInvalid(() => parseInput(inviteUserSchema, body));
  });
  it('il messaggio di errore non contiene i valori (email)', () => {
    const e = expectInvalid(() => parseInput(inviteUserSchema, { organization_id: ORG, email: 'mario@@example.com', role: 'x' }));
    expect(e.message).not.toContain('mario');
    expect(e.message).toContain('email');
  });
});

describe('resend/remove schema', () => {
  it('validi', () => {
    expect(parseInput(resendInviteSchema, { organization_id: ORG, user_id: USER })).toEqual({ organization_id: ORG, user_id: USER });
    expect(parseInput(removeMemberSchema, { organization_id: ORG, user_id: USER })).toEqual({ organization_id: ORG, user_id: USER });
  });
  it('non validi', () => {
    expectInvalid(() => parseInput(resendInviteSchema, { organization_id: ORG }));
    expectInvalid(() => parseInput(removeMemberSchema, { organization_id: ORG, user_id: 'x' }));
    expectInvalid(() => parseInput(removeMemberSchema, { organization_id: ORG, user_id: USER, role: 'admin' }));
  });
});

describe('updateMemberSchema', () => {
  it('accetta un solo campo alla volta', () => {
    expect(parseInput(updateMemberSchema, { organization_id: ORG, user_id: USER, role: 'team_lead' }).role).toBe('team_lead');
    expect(parseInput(updateMemberSchema, { organization_id: ORG, user_id: USER, is_active: false }).is_active).toBe(false);
    expect(parseInput(updateMemberSchema, { organization_id: ORG, user_id: USER, location_ids: [] }).location_ids).toEqual([]);
  });
  it('rifiuta l\'assenza di campi da modificare', () => {
    expectInvalid(() => parseInput(updateMemberSchema, { organization_id: ORG, user_id: USER }));
  });
  it('rifiuta tipi sbagliati', () => {
    expectInvalid(() => parseInput(updateMemberSchema, { organization_id: ORG, user_id: USER, is_active: 'false' }));
    expectInvalid(() => parseInput(updateMemberSchema, { organization_id: ORG, user_id: USER, role: 'superadmin' }));
  });
});
