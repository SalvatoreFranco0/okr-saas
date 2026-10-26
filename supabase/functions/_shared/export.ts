// Export di un tenant (portabilita') e decisioni della purge. Modulo PURO: le query le fa il
// runtime seguendo EXPORT_TABLES; qui elenco delle tabelle, limiti, conteggi e precondizioni.

import { ApiError } from './errors.ts';

export const EXPORT_SCHEMA_VERSION = 1;
/** Righe per pagina (= max_rows di PostgREST in config.toml). */
export const EXPORT_PAGE_SIZE = 1000;
/** Limite di sicurezza sul totale delle righe esportate in una risposta. */
export const EXPORT_MAX_ROWS = 100_000;
/** Id per richiesta nei filtri `in (...)` (lunghezza dell'URL). */
export const ID_BATCH_SIZE = 200;

export interface ExportTableSpec {
  table: string;
  /** Colonna che lega la riga all'organizzazione. */
  orgColumn: string;
  /** Chiave stabile e univoca per la paginazione (la chiave primaria). */
  orderBy: readonly string[];
}

/** Tutte le tabelle del tenant (quelle con organization_id e cascata da organizations). */
export const EXPORT_TABLES: readonly ExportTableSpec[] = [
  { table: 'organizations', orgColumn: 'id', orderBy: ['id'] },
  { table: 'periods', orgColumn: 'organization_id', orderBy: ['id'] },
  { table: 'locations', orgColumn: 'organization_id', orderBy: ['id'] },
  { table: 'teams', orgColumn: 'organization_id', orderBy: ['id'] },
  { table: 'team_members', orgColumn: 'organization_id', orderBy: ['team_id', 'user_id'] },
  { table: 'memberships', orgColumn: 'organization_id', orderBy: ['id'] },
  { table: 'membership_locations', orgColumn: 'organization_id', orderBy: ['user_id', 'location_id'] },
  { table: 'okrs', orgColumn: 'organization_id', orderBy: ['id'] },
  { table: 'key_results', orgColumn: 'organization_id', orderBy: ['id'] },
  { table: 'key_result_updates', orgColumn: 'organization_id', orderBy: ['id'] },
  { table: 'actions', orgColumn: 'organization_id', orderBy: ['id'] },
  { table: 'okr_alignments', orgColumn: 'organization_id', orderBy: ['id'] },
  { table: 'okr_progress_history', orgColumn: 'organization_id', orderBy: ['id'] },
  { table: 'comments', orgColumn: 'organization_id', orderBy: ['id'] },
  { table: 'audit_logs', orgColumn: 'organization_id', orderBy: ['id'] },
  { table: 'support_sessions', orgColumn: 'organization_id', orderBy: ['id'] },
];

/** Colonne di public.profiles esportate per i membri (whitelist). */
export const EXPORT_PROFILE_COLUMNS = ['id', 'first_name', 'last_name', 'email', 'locale'] as const;

export type ExportTables = Record<string, Record<string, unknown>[]>;

/** 413 export_too_large oltre il limite. */
export function assertExportSize(totalRows: number, max = EXPORT_MAX_ROWS): void {
  if (totalRows > max) throw new ApiError('export_too_large');
}

/** Intervallo [from, to] (inclusivo, come .range() di supabase-js) della pagina `page` (0-based). */
export function pageRange(page: number, pageSize = EXPORT_PAGE_SIZE): { from: number; to: number } {
  return { from: page * pageSize, to: page * pageSize + pageSize - 1 };
}

/** Una pagina piu' corta di pageSize e' l'ultima. */
export function isLastPage(rowsInPage: number, pageSize = EXPORT_PAGE_SIZE): boolean {
  return rowsInPage < pageSize;
}

export function chunk<T>(items: readonly T[], size = ID_BATCH_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** user_id distinti delle membership, ordinati. */
export function memberUserIds(memberships: readonly { user_id?: unknown }[]): string[] {
  const ids = new Set<string>();
  for (const m of memberships) if (typeof m.user_id === 'string') ids.add(m.user_id.toLowerCase());
  return [...ids].sort();
}

export function countRows(tables: ExportTables): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [name, rows] of Object.entries(tables)) counts[name] = rows.length;
  return counts;
}

export function totalRows(counts: Record<string, number>): number {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

export interface ExportPayload {
  exported_at: string;
  organization_id: string;
  schema_version: number;
  tables: ExportTables;
  counts: Record<string, number>;
}

export function buildExportPayload(organizationId: string, tables: ExportTables, now: Date): ExportPayload {
  return {
    exported_at: now.toISOString(),
    organization_id: organizationId,
    schema_version: EXPORT_SCHEMA_VERSION,
    tables,
    counts: countRows(tables),
  };
}

// ---------------------------------------------------------------------------
// Chi puo' esportare
// ---------------------------------------------------------------------------

export type ExportAccess = 'org_admin' | 'support';

/** Admin attivo dell'org, oppure super-admin (aal2) con sessione di supporto attiva sull'org. */
export function decideExportAccess(p: {
  isOrgAdmin: boolean;
  isPlatformAdmin: boolean;
  hasActiveSupportSession: boolean;
}): ExportAccess {
  if (p.isOrgAdmin) return 'org_admin';
  if (p.isPlatformAdmin && p.hasActiveSupportSession) return 'support';
  throw new ApiError('forbidden');
}

// ---------------------------------------------------------------------------
// Purge
// ---------------------------------------------------------------------------

/** Finestra entro cui deve esistere un export (riga org.export in platform_audit_logs). */
export const PURGE_EXPORT_WINDOW_MS = 24 * 60 * 60 * 1000;

export function purgeExportWindowStart(now: Date, windowMs = PURGE_EXPORT_WINDOW_MS): string {
  return new Date(now.getTime() - windowMs).toISOString();
}

export interface PurgePreconditions {
  /** platform_admins visibile col client del chiamante (aal2). */
  isPlatformAdmin: boolean;
  /** Sessione di supporto attiva letta col client del chiamante. */
  userSessionActive: boolean;
  /** La stessa verifica ripetuta col service client. */
  serviceSessionActive: boolean;
  /** Slug dell'organizzazione; null = organizzazione inesistente. */
  orgSlug: string | null;
  confirmSlug: string;
  /** created_at degli export (org.export) recenti dell'organizzazione. */
  exportCreatedAt: readonly string[];
  now: Date;
}

/**
 * Primo motivo di rifiuto (nell'ordine: super-admin, sessione, organizzazione, slug, export),
 * oppure null se la purge puo' procedere.
 */
export function purgeRefusal(p: PurgePreconditions): ApiError | null {
  if (!p.isPlatformAdmin) return new ApiError('forbidden');
  if (!p.userSessionActive || !p.serviceSessionActive) return new ApiError('forbidden');
  if (p.orgSlug === null) return new ApiError('not_found');
  if (p.confirmSlug !== p.orgSlug) return new ApiError('confirmation_mismatch');
  const from = p.now.getTime() - PURGE_EXPORT_WINDOW_MS;
  const recent = p.exportCreatedAt.some((t) => {
    const ms = Date.parse(t);
    return Number.isFinite(ms) && ms >= from && ms <= p.now.getTime();
  });
  if (!recent) return new ApiError('export_required');
  return null;
}

export function assertPurgeAllowed(p: PurgePreconditions): void {
  const refusal = purgeRefusal(p);
  if (refusal) throw refusal;
}

/**
 * Membri dell'organizzazione che dopo la purge non hanno piu' membership attive altrove
 * (restano in auth.users senza accesso a nulla).
 * @param otherActiveMemberships membership attive degli stessi utenti in ALTRE organizzazioni.
 */
export function countOrphanUsers(
  memberIds: readonly string[],
  otherActiveMemberships: readonly { user_id: string; organization_id: string; is_active: boolean }[],
  organizationId: string,
): number {
  const org = organizationId.toLowerCase();
  const covered = new Set(
    otherActiveMemberships
      .filter((m) => m.is_active === true && m.organization_id.toLowerCase() !== org)
      .map((m) => m.user_id.toLowerCase()),
  );
  const members = new Set(memberIds.map((id) => id.toLowerCase()));
  return [...members].filter((id) => !covered.has(id)).length;
}
