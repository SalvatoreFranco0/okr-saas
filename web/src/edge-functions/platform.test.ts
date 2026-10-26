import { describe, expect, it } from 'vitest';
import { ApiError, ERROR_STATUS } from '../../../supabase/functions/_shared/errors.ts';
import {
  assertExportSize,
  buildExportPayload,
  chunk,
  countOrphanUsers,
  decideExportAccess,
  EXPORT_MAX_ROWS,
  EXPORT_PAGE_SIZE,
  EXPORT_TABLES,
  isLastPage,
  memberUserIds,
  pageRange,
  purgeExportWindowStart,
  purgeRefusal,
  assertPurgeAllowed,
  totalRows,
  type PurgePreconditions,
} from '../../../supabase/functions/_shared/export.ts';
import {
  assertPlatformAdmin,
  isActiveSupportSession,
  isPlatformAdminRow,
  isUniqueViolation,
  pickActiveSupportSession,
  quarterPeriod,
  supportSessionWindow,
  type SupportSessionRow,
} from '../../../supabase/functions/_shared/platform.ts';
import { buildPlatformAuditRow, buildSupportAuditRow } from '../../../supabase/functions/_shared/platformAudit.ts';
import {
  createOrganizationSchema,
  endSupportSessionSchema,
  exportOrganizationSchema,
  parseInput,
  purgeOrganizationSchema,
  startSupportSessionSchema,
} from '../../../supabase/functions/_shared/schemas.ts';

const ORG = 'e0000000-0000-4000-8000-000000000001';
const OTHER_ORG = 'e0000000-0000-4000-8000-000000000002';
const SA = 'd0000000-0000-4000-8000-000000000001';
const OTHER_SA = 'd0000000-0000-4000-8000-000000000009';
const SESSION = 'a0000000-0000-4000-8000-000000000181';
const NOW = new Date('2026-10-26T12:00:00.000Z');

function expectCode(fn: () => unknown, code: string, status: number) {
  expect(fn).toThrowError(expect.objectContaining({ code, status }));
}

describe('nuovi codici di errore', () => {
  it.each([
    ['slug_taken', 409],
    ['confirmation_mismatch', 409],
    ['export_required', 409],
    ['export_too_large', 413],
  ] as const)('%s -> %d', (code, status) => {
    expect(ERROR_STATUS[code]).toBe(status);
    expect(new ApiError(code).status).toBe(status);
  });
});

describe('quarterPeriod', () => {
  it.each([
    ['2026-10-26T12:00:00Z', 'Q4 2026', '2026-10-01', '2026-12-31'],
    ['2026-01-01T00:00:00Z', 'Q1 2026', '2026-01-01', '2026-03-31'],
    ['2028-02-29T10:00:00Z', 'Q1 2028', '2028-01-01', '2028-03-31'],
    ['2026-04-01T00:00:00Z', 'Q2 2026', '2026-04-01', '2026-06-30'],
    ['2026-06-30T23:59:59Z', 'Q2 2026', '2026-04-01', '2026-06-30'],
    ['2026-07-15T00:00:00Z', 'Q3 2026', '2026-07-01', '2026-09-30'],
    ['2026-12-31T23:59:59.999Z', 'Q4 2026', '2026-10-01', '2026-12-31'],
  ])('%s -> %s', (iso, name, start, end) => {
    expect(quarterPeriod(new Date(iso))).toEqual({ name, start_date: start, end_date: end });
  });
});

describe('super-admin (riga platform_admins visibile solo con aal2)', () => {
  it('riga del chiamante -> ok', () => {
    expect(isPlatformAdminRow([{ user_id: SA }], SA)).toBe(true);
    expect(isPlatformAdminRow([{ user_id: SA.toUpperCase() }], SA)).toBe(true);
    expect(() => assertPlatformAdmin([{ user_id: SA }], SA)).not.toThrow();
  });
  it.each([
    ['nessuna riga (aal1 o non super-admin)', []],
    ['risposta nulla', null],
    ['riga di un altro utente', [{ user_id: OTHER_SA }]],
  ])('%s -> 403', (_l, rows) => {
    expect(isPlatformAdminRow(rows, SA)).toBe(false);
    expectCode(() => assertPlatformAdmin(rows, SA), 'forbidden', 403);
  });
});

describe('sessioni di supporto', () => {
  const s = (over: Partial<SupportSessionRow> = {}): SupportSessionRow => ({
    id: SESSION,
    platform_admin_id: SA,
    organization_id: ORG,
    started_at: '2026-10-26T11:00:00.000Z',
    expires_at: '2026-10-26T13:00:00.000Z',
    ended_at: null,
    ...over,
  });
  it('attiva: non chiusa, iniziata, non scaduta, del super-admin, sull\'org', () => {
    expect(isActiveSupportSession(s(), SA, ORG, NOW)).toBe(true);
  });
  it.each([
    ['chiusa', s({ ended_at: '2026-10-26T11:30:00.000Z' })],
    ['scaduta', s({ expires_at: '2026-10-26T11:59:59.000Z' })],
    ['scade esattamente ora', s({ expires_at: NOW.toISOString() })],
    ['non ancora iniziata', s({ started_at: '2026-10-26T12:00:01.000Z' })],
    ['di un altro super-admin', s({ platform_admin_id: OTHER_SA })],
    ['su un\'altra org', s({ organization_id: OTHER_ORG })],
    ['date non valide', s({ expires_at: 'boh' })],
  ])('%s -> non attiva', (_l, row) => {
    expect(isActiveSupportSession(row, SA, ORG, NOW)).toBe(false);
    expect(pickActiveSupportSession([row], SA, ORG, NOW)).toBeNull();
  });
  it('pick: la sessione attiva con scadenza piu\' lontana', () => {
    const a = s({ id: 'a', expires_at: '2026-10-26T12:30:00.000Z' });
    const b = s({ id: 'b', expires_at: '2026-10-26T15:00:00.000Z' });
    expect(pickActiveSupportSession([a, b, s({ id: 'c', ended_at: NOW.toISOString() })], SA, ORG, NOW)?.id).toBe('b');
    expect(pickActiveSupportSession(null, SA, ORG, NOW)).toBeNull();
    expect(pickActiveSupportSession([], SA, ORG, NOW)).toBeNull();
  });
  it('finestra: started_at = now, expires_at = now + durata', () => {
    expect(supportSessionWindow(NOW, 240)).toEqual({
      started_at: '2026-10-26T12:00:00.000Z',
      expires_at: '2026-10-26T16:00:00.000Z',
    });
    expect(supportSessionWindow(NOW, 1).expires_at).toBe('2026-10-26T12:01:00.000Z');
  });
});

describe('isUniqueViolation', () => {
  it('23505 -> slug gia\' usato', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});

describe('schemi delle funzioni di piattaforma', () => {
  it('createOrganization: minimo valido, nome trim', () => {
    expect(parseInput(createOrganizationSchema, { name: '  Acme  ', slug: 'acme' })).toEqual({ name: 'Acme', slug: 'acme' });
  });
  it('createOrganization: primo Admin con email normalizzata', () => {
    const r = parseInput(createOrganizationSchema, {
      name: 'Acme', slug: 'acme-srl', first_admin_email: ' Mario@Example.COM ', first_admin_first_name: 'Mario', first_admin_last_name: '',
    });
    expect(r.first_admin_email).toBe('mario@example.com');
    expect(r.first_admin_first_name).toBe('Mario');
    expect(r.first_admin_last_name).toBeUndefined();
  });
  it.each([
    ['nome vuoto', { name: '   ', slug: 'acme' }],
    ['nome > 200', { name: 'x'.repeat(201), slug: 'acme' }],
    ['slug maiuscolo', { name: 'A', slug: 'Acme' }],
    ['slug di 1 carattere', { name: 'A', slug: 'a' }],
    ['slug che inizia con -', { name: 'A', slug: '-acme' }],
    ['slug > 63', { name: 'A', slug: 'a'.repeat(64) }],
    ['slug con spazio', { name: 'A', slug: 'ac me' }],
    ['email non valida', { name: 'A', slug: 'acme', first_admin_email: 'non-una-email' }],
    ['nome del primo Admin senza email', { name: 'A', slug: 'acme', first_admin_first_name: 'Mario' }],
    ['campo sconosciuto', { name: 'A', slug: 'acme', plan: 'pro' }],
    ['identita\' dal body', { name: 'A', slug: 'acme', actor_id: SA }],
  ])('createOrganization: %s -> 400', (_l, body) => {
    expectCode(() => parseInput(createOrganizationSchema, body), 'invalid_input', 400);
  });
  it('createOrganization: l\'errore non contiene l\'email', () => {
    try {
      parseInput(createOrganizationSchema, { name: 'A', slug: 'acme', first_admin_email: 'mario@@example.com' });
    } catch (e) {
      expect((e as ApiError).message).not.toContain('mario');
      return;
    }
    throw new Error('atteso invalid_input');
  });

  it('startSupportSession: default 240 minuti, reason trim', () => {
    const r = parseInput(startSupportSessionSchema, { organization_id: ORG, reason: '  Ticket #1234 utente  ' });
    expect(r).toEqual({ organization_id: ORG, reason: 'Ticket #1234 utente', duration_minutes: 240 });
  });
  it.each([
    ['reason < 10 dopo trim', { organization_id: ORG, reason: '   corta    ' }],
    ['reason > 500', { organization_id: ORG, reason: 'x'.repeat(501) }],
    ['durata 0', { organization_id: ORG, reason: 'Ticket #1234 utente', duration_minutes: 0 }],
    ['durata 241', { organization_id: ORG, reason: 'Ticket #1234 utente', duration_minutes: 241 }],
    ['durata non intera', { organization_id: ORG, reason: 'Ticket #1234 utente', duration_minutes: 1.5 }],
    ['org non uuid', { organization_id: 'x', reason: 'Ticket #1234 utente' }],
    ['campo sconosciuto', { organization_id: ORG, reason: 'Ticket #1234 utente', platform_admin_id: SA }],
  ])('startSupportSession: %s -> 400', (_l, body) => {
    expectCode(() => parseInput(startSupportSessionSchema, body), 'invalid_input', 400);
  });

  it('endSupportSession / export / purge: strict', () => {
    expect(parseInput(endSupportSessionSchema, { support_session_id: SESSION })).toEqual({ support_session_id: SESSION });
    expect(parseInput(exportOrganizationSchema, { organization_id: ORG })).toEqual({ organization_id: ORG });
    expect(parseInput(purgeOrganizationSchema, { organization_id: ORG, confirm_slug: 'alfa' })).toEqual({ organization_id: ORG, confirm_slug: 'alfa' });
    expectCode(() => parseInput(endSupportSessionSchema, { support_session_id: SESSION, organization_id: ORG }), 'invalid_input', 400);
    expectCode(() => parseInput(exportOrganizationSchema, { organization_id: ORG, user_id: SA }), 'invalid_input', 400);
    expectCode(() => parseInput(purgeOrganizationSchema, { organization_id: ORG }), 'invalid_input', 400);
    expectCode(() => parseInput(purgeOrganizationSchema, { organization_id: ORG, confirm_slug: '' }), 'invalid_input', 400);
  });
  it('purge: confirm_slug non viene normalizzato', () => {
    expect(parseInput(purgeOrganizationSchema, { organization_id: ORG, confirm_slug: ' Alfa ' }).confirm_slug).toBe(' Alfa ');
  });
});

describe('export', () => {
  it('copre tutte le tabelle del tenant, ognuna con chiave di ordinamento', () => {
    expect(EXPORT_TABLES.map((t) => t.table).sort()).toEqual([
      'actions', 'audit_logs', 'comments', 'key_result_updates', 'key_results', 'locations',
      'membership_locations', 'memberships', 'okr_alignments', 'okr_progress_history', 'okrs',
      'organizations', 'periods', 'support_sessions', 'team_members', 'teams',
    ]);
    for (const t of EXPORT_TABLES) expect(t.orderBy.length).toBeGreaterThan(0);
    expect(EXPORT_TABLES.find((t) => t.table === 'organizations')?.orgColumn).toBe('id');
  });
  it('paginazione da 1000', () => {
    expect(EXPORT_PAGE_SIZE).toBe(1000);
    expect(pageRange(0)).toEqual({ from: 0, to: 999 });
    expect(pageRange(2)).toEqual({ from: 2000, to: 2999 });
    expect(isLastPage(1000)).toBe(false);
    expect(isLastPage(999)).toBe(true);
    expect(isLastPage(0)).toBe(true);
  });
  it('limite di righe -> 413', () => {
    expect(() => assertExportSize(EXPORT_MAX_ROWS)).not.toThrow();
    expectCode(() => assertExportSize(EXPORT_MAX_ROWS + 1), 'export_too_large', 413);
    expectCode(() => assertExportSize(11, 10), 'export_too_large', 413);
  });
  it('chunk e memberUserIds', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 2)).toEqual([]);
    expect(memberUserIds([{ user_id: 'B' }, { user_id: 'a' }, { user_id: 'b' }, { user_id: null }])).toEqual(['a', 'b']);
  });
  it('payload con conteggi', () => {
    const p = buildExportPayload(ORG, { organizations: [{ id: ORG }], okrs: [{}, {}], comments: [] }, NOW);
    expect(p).toEqual({
      exported_at: '2026-10-26T12:00:00.000Z',
      organization_id: ORG,
      schema_version: 1,
      tables: { organizations: [{ id: ORG }], okrs: [{}, {}], comments: [] },
      counts: { organizations: 1, okrs: 2, comments: 0 },
    });
    expect(totalRows(p.counts)).toBe(3);
  });
  it('accesso: Admin dell\'org o super-admin con sessione', () => {
    expect(decideExportAccess({ isOrgAdmin: true, isPlatformAdmin: false, hasActiveSupportSession: false })).toBe('org_admin');
    expect(decideExportAccess({ isOrgAdmin: false, isPlatformAdmin: true, hasActiveSupportSession: true })).toBe('support');
    expectCode(() => decideExportAccess({ isOrgAdmin: false, isPlatformAdmin: true, hasActiveSupportSession: false }), 'forbidden', 403);
    expectCode(() => decideExportAccess({ isOrgAdmin: false, isPlatformAdmin: false, hasActiveSupportSession: true }), 'forbidden', 403);
    expectCode(() => decideExportAccess({ isOrgAdmin: false, isPlatformAdmin: false, hasActiveSupportSession: false }), 'forbidden', 403);
  });
});

describe('purge: precondizioni', () => {
  const ok: PurgePreconditions = {
    isPlatformAdmin: true,
    userSessionActive: true,
    serviceSessionActive: true,
    orgSlug: 'alfa',
    confirmSlug: 'alfa',
    exportCreatedAt: ['2026-10-26T08:00:00.000Z'],
    now: NOW,
  };
  it('tutte soddisfatte -> nessun rifiuto', () => {
    expect(purgeRefusal(ok)).toBeNull();
    expect(() => assertPurgeAllowed(ok)).not.toThrow();
  });
  it.each([
    ['non super-admin (o aal1)', { isPlatformAdmin: false }, 'forbidden', 403],
    ['nessuna sessione (client utente)', { userSessionActive: false }, 'forbidden', 403],
    ['sessione non confermata dal service client', { serviceSessionActive: false }, 'forbidden', 403],
    ['organizzazione inesistente', { orgSlug: null }, 'not_found', 404],
    ['slug diverso', { confirmSlug: 'beta' }, 'confirmation_mismatch', 409],
    ['slug con maiuscole', { confirmSlug: 'Alfa' }, 'confirmation_mismatch', 409],
    ['slug con spazi', { confirmSlug: ' alfa' }, 'confirmation_mismatch', 409],
    ['nessun export', { exportCreatedAt: [] }, 'export_required', 409],
    ['export di 25 ore fa', { exportCreatedAt: ['2026-10-25T11:00:00.000Z'] }, 'export_required', 409],
    ['export nel futuro', { exportCreatedAt: ['2026-10-26T13:00:00.000Z'] }, 'export_required', 409],
    ['data non valida', { exportCreatedAt: ['boh'] }, 'export_required', 409],
  ] as const)('%s -> %s', (_l, over, code, status) => {
    const r = purgeRefusal({ ...ok, ...over });
    expect(r?.code).toBe(code);
    expect(r?.status).toBe(status);
    expectCode(() => assertPurgeAllowed({ ...ok, ...over }), code, status);
  });
  it('export esattamente 24 ore fa -> ammesso', () => {
    expect(purgeRefusal({ ...ok, exportCreatedAt: ['2026-10-25T12:00:00.000Z'] })).toBeNull();
    expect(purgeExportWindowStart(NOW)).toBe('2026-10-25T12:00:00.000Z');
  });
  it('ordine: il primo motivo vince (super-admin prima di slug ed export)', () => {
    expect(purgeRefusal({ ...ok, isPlatformAdmin: false, confirmSlug: 'x', exportCreatedAt: [] })?.code).toBe('forbidden');
    expect(purgeRefusal({ ...ok, confirmSlug: 'x', exportCreatedAt: [] })?.code).toBe('confirmation_mismatch');
  });
});

describe('purge: utenti orfani', () => {
  const U1 = 'u1', U2 = 'u2', U3 = 'u3';
  it('conta i membri senza altre membership attive', () => {
    const other = [
      { user_id: U1, organization_id: OTHER_ORG, is_active: true },
      { user_id: U2, organization_id: OTHER_ORG, is_active: false }, // disattivata: non conta
      { user_id: U3, organization_id: ORG, is_active: true }, // stessa org: non conta
    ];
    expect(countOrphanUsers([U1, U2, U3], other, ORG)).toBe(2);
    expect(countOrphanUsers([U1, U1], other, ORG)).toBe(0);
    expect(countOrphanUsers([], other, ORG)).toBe(0);
  });
});

describe('audit di piattaforma (whitelist)', () => {
  it('riga completa', () => {
    expect(
      buildPlatformAuditRow({
        actorId: SA, organizationId: ORG, organizationSlug: 'alfa', action: 'org.export',
        details: { access: 'support', counts: { okrs: 3, organizations: 1 }, total_rows: 4 },
      }),
    ).toEqual({
      actor_id: SA, organization_id: ORG, organization_slug: 'alfa', action: 'org.export',
      details: { access: 'support', counts: { okrs: 3, organizations: 1 }, total_rows: 4 },
    });
  });
  it('campi estranei (email, dati del tenant) non entrano nei details', () => {
    const details = {
      orphan_users: 2, email: 'mario@example.com', rows: [{ title: 'segreto' }],
      counts: { okrs: 1, 'x@y': 3, neg: -1, frac: 1.5 },
    } as unknown as Parameters<typeof buildPlatformAuditRow>[0]['details'];
    const row = buildPlatformAuditRow({ actorId: SA, organizationId: ORG, organizationSlug: 'alfa', action: 'org.purge.done', details });
    expect(row.details).toEqual({ orphan_users: 2, counts: { okrs: 1 } });
    expect(JSON.stringify(row)).not.toContain('@');
    expect(JSON.stringify(row)).not.toContain('segreto');
  });
  it('la motivazione entra solo in support.start', () => {
    const reason = 'Ticket #1234 utente bloccato';
    expect(buildPlatformAuditRow({ actorId: SA, organizationId: ORG, organizationSlug: 'alfa', action: 'support.start', details: { reason } }).details).toEqual({ reason });
    expect(buildPlatformAuditRow({ actorId: SA, organizationId: ORG, organizationSlug: 'alfa', action: 'support.end', details: { reason } }).details).toEqual({});
  });
  it('audit del tenant per la sessione: niente motivazione', () => {
    const details = { reason_length: 28, expires_at: '2026-10-26T16:00:00.000Z', reason: 'Ticket #1234 utente bloccato' } as unknown as Parameters<typeof buildSupportAuditRow>[0]['details'];
    expect(buildSupportAuditRow({ organizationId: ORG, actorId: SA, supportSessionId: SESSION, action: 'support.start', details })).toEqual({
      organization_id: ORG, user_id: SA, okr_id: null, entity: 'support_session', entity_id: SESSION, action: 'support.start',
      details: { reason_length: 28, expires_at: '2026-10-26T16:00:00.000Z' },
    });
  });
});
