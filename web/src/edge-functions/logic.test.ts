import { describe, expect, it } from 'vitest';
import { buildAuditRow } from '../../../supabase/functions/_shared/audit.ts';
import { ApiError } from '../../../supabase/functions/_shared/errors.ts';
import {
  decideInviteBranch,
  inviteStatus,
  isEmailExistsError,
  isInviteAccepted,
  setPasswordRedirect,
} from '../../../supabase/functions/_shared/invite.ts';
import { assertActiveOrgAdmin, isActiveOrgAdmin, type MembershipRow } from '../../../supabase/functions/_shared/permissions.ts';
import {
  assertRateLimit,
  decideRateLimit,
  RATE_LIMIT_MAX,
  rateLimitWindowStart,
} from '../../../supabase/functions/_shared/rateLimit.ts';
import { mapApplyMemberError } from '../../../supabase/functions/_shared/rpcErrors.ts';

const ORG = 'a0000000-0000-4000-8000-000000000001';
const OTHER_ORG = 'a0000000-0000-4000-8000-000000000002';
const ME = 'd0000000-0000-4000-8000-000000000002';
const TARGET = 'd0000000-0000-4000-8000-000000000009';

describe('decideInviteBranch', () => {
  it('email nuova -> invito', () => {
    expect(decideInviteBranch(null, null)).toEqual({ kind: 'invite_new' });
    expect(inviteStatus({ kind: 'invite_new' })).toBe('invited');
  });
  it('utente esistente non membro -> solo membership (added)', () => {
    const b = decideInviteBranch(TARGET, null);
    expect(b).toEqual({ kind: 'add', userId: TARGET });
    expect(inviteStatus(b)).toBe('added');
  });
  it('membro disattivato -> riattivazione', () => {
    const b = decideInviteBranch(TARGET, { is_active: false });
    expect(b).toEqual({ kind: 'reactivate', userId: TARGET });
    expect(inviteStatus(b)).toBe('reactivated');
  });
  it('membro gia\' attivo -> 409 already_member', () => {
    const b = decideInviteBranch(TARGET, { is_active: true });
    expect(b.kind).toBe('already_member');
    expect(() => inviteStatus(b)).toThrowError(expect.objectContaining({ code: 'already_member', status: 409 }));
  });
});

describe('invito accettato / email esistente / redirect', () => {
  it('isInviteAccepted', () => {
    expect(isInviteAccepted({ email_confirmed_at: null, last_sign_in_at: null })).toBe(false);
    expect(isInviteAccepted({})).toBe(false);
    expect(isInviteAccepted({ email_confirmed_at: '2026-01-01T00:00:00Z' })).toBe(true);
    expect(isInviteAccepted({ last_sign_in_at: '2026-01-01T00:00:00Z' })).toBe(true);
  });
  it('isEmailExistsError', () => {
    expect(isEmailExistsError({ code: 'email_exists', status: 422 })).toBe(true);
    expect(isEmailExistsError({ status: 422, message: 'A user with this email address has already been registered' })).toBe(true);
    expect(isEmailExistsError({ status: 500, message: 'boom' })).toBe(false);
    expect(isEmailExistsError(null)).toBe(false);
  });
  it('setPasswordRedirect', () => {
    expect(setPasswordRedirect('https://app.example.com')).toBe('https://app.example.com/set-password');
    expect(setPasswordRedirect('https://app.example.com/')).toBe('https://app.example.com/set-password');
    for (const bad of [undefined, '', 'non un url', 'javascript:alert(1)']) {
      expect(() => setPasswordRedirect(bad)).toThrowError(expect.objectContaining({ code: 'internal' }));
    }
  });
});

describe('rate limit', () => {
  const now = new Date('2026-10-26T12:00:00.000Z');
  // n righe distribuite negli ultimi 50 minuti, la piu' vecchia 50 minuti fa.
  const rows = (n: number) => Array.from({ length: n }, (_, i) => new Date(now.getTime() - (50 - i) * 60_000).toISOString());

  it('limite = 20', () => expect(RATE_LIMIT_MAX).toBe(20));
  it('19 -> consentito', () => {
    expect(decideRateLimit(rows(19), now)).toEqual({ allowed: true });
    expect(() => assertRateLimit(rows(19), now)).not.toThrow();
  });
  it('20 -> 429 con Retry-After', () => {
    // Le 20 righe vanno da -50 a -31 min: la 20a piu' recente e' quella di -50 min, esce tra 10 min.
    expect(decideRateLimit(rows(20), now)).toEqual({ allowed: false, retryAfterSeconds: 600 });
    expect(() => assertRateLimit(rows(20), now)).toThrowError(expect.objectContaining({ code: 'rate_limited', status: 429, retryAfter: 600 }));
  });
  it('21 -> 429 (Retry-After dalla 20a piu\' recente)', () => {
    // 21 righe da -50 a -30 min: la 20a piu' recente e' a -49 min -> 11 min.
    expect(decideRateLimit(rows(21), now)).toEqual({ allowed: false, retryAfterSeconds: 660 });
  });
  it('righe fuori finestra non contano', () => {
    const old = Array.from({ length: 30 }, () => new Date(now.getTime() - 61 * 60_000).toISOString());
    expect(decideRateLimit([...old, ...rows(19)], now)).toEqual({ allowed: true });
  });
  it('inizio finestra = un\'ora prima', () => {
    expect(rateLimitWindowStart(now)).toBe('2026-10-26T11:00:00.000Z');
  });
});

describe('mapApplyMemberError', () => {
  it.each([
    [{ code: '42501', hint: 'self_change' }, 'self_change', 403],
    [{ code: 'P0001', hint: 'last_admin' }, 'last_admin', 409],
    [{ code: 'P0002', hint: 'org_not_found' }, 'not_found', 404],
    [{ code: 'P0002', hint: 'org_inactive' }, 'not_found', 404],
    [{ code: '23503' }, 'invalid_reference', 400],
    [{ code: '22004' }, 'internal', 500],
    [{ code: '42501' }, 'internal', 500],
    [{ code: 'P0001', message: 'altro trigger' }, 'internal', 500],
    [null, 'internal', 500],
  ])('%j -> %s', (err, code, status) => {
    const e = mapApplyMemberError(err);
    expect(e).toBeInstanceOf(ApiError);
    expect(e.code).toBe(code);
    expect(e.status).toBe(status);
  });
});

describe('permessi: solo Admin attivo dell\'organizzazione indicata', () => {
  const m = (over: Partial<MembershipRow>): MembershipRow => ({
    organization_id: ORG, user_id: ME, role: 'admin', is_active: true, ...over,
  });
  it('Admin attivo dell\'org -> ok', () => {
    expect(isActiveOrgAdmin([m({})], ORG, ME)).toBe(true);
    expect(() => assertActiveOrgAdmin([m({})], ORG, ME)).not.toThrow();
  });
  it.each([
    ['Admin di un\'altra org', [m({ organization_id: OTHER_ORG })]],
    ['Manager OKR', [m({ role: 'manager_okr' })]],
    ['Team Lead', [m({ role: 'team_lead' })]],
    ['Viewer', [m({ role: 'viewer' })]],
    ['membership disattivata', [m({ is_active: false })]],
    ['nessuna membership visibile (RLS)', []],
    ['risposta nulla', null],
    ['riga di un altro utente', [m({ user_id: TARGET })]],
  ])('%s -> 403', (_label, rows) => {
    expect(isActiveOrgAdmin(rows, ORG, ME)).toBe(false);
    expect(() => assertActiveOrgAdmin(rows, ORG, ME)).toThrowError(expect.objectContaining({ code: 'forbidden', status: 403 }));
  });
});

describe('buildAuditRow', () => {
  it('riga completa, entity membership, senza email', () => {
    const row = buildAuditRow({
      organizationId: ORG,
      actorId: ME,
      action: 'admin.invite',
      details: { target_user_id: TARGET, role: 'viewer', is_active: true, location_ids: ['l1'], status: 'invited' },
    });
    expect(row).toEqual({
      organization_id: ORG,
      user_id: ME,
      okr_id: null,
      entity: 'membership',
      entity_id: null,
      action: 'admin.invite',
      details: { target_user_id: TARGET, role: 'viewer', is_active: true, location_ids: ['l1'], status: 'invited' },
    });
  });
  it('campi estranei (email) passati per errore non finiscono nei details', () => {
    const details = { target_user_id: TARGET, role: 'admin', email: 'mario.rossi@example.com' } as unknown as Parameters<typeof buildAuditRow>[0]['details'];
    const row = buildAuditRow({ organizationId: ORG, actorId: ME, action: 'admin.update_member', details });
    expect(JSON.stringify(row)).not.toContain('@');
    expect(row.details).not.toHaveProperty('email');
  });
  it('location_ids null = sedi invariate, campi assenti omessi', () => {
    const row = buildAuditRow({
      organizationId: ORG, actorId: ME, action: 'admin.remove_member',
      details: { target_user_id: TARGET, location_ids: null },
    });
    expect(row.details).toEqual({ target_user_id: TARGET, location_ids: null });
  });
  it.each(['admin.invite', 'admin.resend_invite', 'admin.update_member', 'admin.remove_member'] as const)('azione %s', (action) => {
    expect(buildAuditRow({ organizationId: ORG, actorId: ME, action, details: { target_user_id: TARGET } }).action).toBe(action);
  });
});
