// I/O di export e purge di un tenant (Deno, supabase-js, SOLO service client). Elenco delle
// tabelle, limiti e decisioni in ../_shared/export.ts.

import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError, safeErrorTag } from '../_shared/errors.ts';
import {
  assertExportSize,
  chunk,
  EXPORT_MAX_ROWS,
  EXPORT_PROFILE_COLUMNS,
  EXPORT_TABLES,
  type ExportTables,
  type ExportTableSpec,
  isLastPage,
  memberUserIds,
  pageRange,
  purgeExportWindowStart,
} from '../_shared/export.ts';
import { logSafe } from './context.ts';

type Row = Record<string, unknown>;

function fail(what: string, error: unknown): never {
  logSafe(`${what}: ${safeErrorTag(error)}`);
  throw new ApiError('internal');
}

/**
 * Tutte le righe di una tabella del tenant, a pagine ordinate per chiave stabile.
 * `budget` = righe ancora ammesse prima di superare EXPORT_MAX_ROWS (413 appena superato,
 * senza leggere oltre).
 */
async function readAllRows(svc: SupabaseClient, spec: ExportTableSpec, organizationId: string, budget: number): Promise<Row[]> {
  const rows: Row[] = [];
  for (let page = 0; ; page++) {
    const { from, to } = pageRange(page);
    let q = svc.from(spec.table).select('*').eq(spec.orgColumn, organizationId);
    for (const col of spec.orderBy) q = q.order(col, { ascending: true });
    const { data, error } = await q.range(from, to);
    if (error) fail(`export ${spec.table}`, error);
    const batch = (data ?? []) as Row[];
    rows.push(...batch);
    assertExportSize(rows.length, budget);
    if (isLastPage(batch.length)) return rows;
  }
}

/** Profili (solo colonne in whitelist) dei membri dell'organizzazione. */
async function readMemberProfiles(svc: SupabaseClient, userIds: readonly string[]): Promise<Row[]> {
  const out: Row[] = [];
  for (const ids of chunk(userIds)) {
    const { data, error } = await svc
      .from('profiles')
      .select(EXPORT_PROFILE_COLUMNS.join(', '))
      .in('id', ids)
      .order('id', { ascending: true });
    if (error) fail('export profiles', error);
    out.push(...((data ?? []) as unknown as Row[]));
  }
  return out;
}

/** Tutte le tabelle del tenant + profiles dei membri. 413 export_too_large oltre EXPORT_MAX_ROWS. */
export async function readTenantTables(svc: SupabaseClient, organizationId: string): Promise<ExportTables> {
  const tables: ExportTables = {};
  let total = 0;
  for (const spec of EXPORT_TABLES) {
    const rows = await readAllRows(svc, spec, organizationId, EXPORT_MAX_ROWS - total);
    tables[spec.table] = rows;
    total += rows.length;
  }
  const profiles = await readMemberProfiles(svc, memberUserIds(tables.memberships ?? []));
  assertExportSize(total + profiles.length);
  tables.profiles = profiles;
  return tables;
}

/** Conteggio righe per tabella del tenant (count esatto, nessun dato letto). */
export async function countTenantRows(svc: SupabaseClient, organizationId: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const spec of EXPORT_TABLES) {
    const { count, error } = await svc
      .from(spec.table)
      .select('*', { count: 'exact', head: true })
      .eq(spec.orgColumn, organizationId);
    if (error) fail(`count ${spec.table}`, error);
    counts[spec.table] = count ?? 0;
  }
  return counts;
}

/** user_id di tutti i membri (attivi o no) dell'organizzazione. */
export async function readMemberIds(svc: SupabaseClient, organizationId: string): Promise<string[]> {
  const rows: { user_id: string }[] = [];
  for (let page = 0; ; page++) {
    const { from, to } = pageRange(page);
    const { data, error } = await svc
      .from('memberships')
      .select('user_id')
      .eq('organization_id', organizationId)
      .order('user_id', { ascending: true })
      .range(from, to);
    if (error) fail('purge memberships', error);
    const batch = (data ?? []) as { user_id: string }[];
    rows.push(...batch);
    if (isLastPage(batch.length)) return memberUserIds(rows);
  }
}

/** Membership attive degli utenti indicati in organizzazioni diverse da organizationId. */
export async function readOtherActiveMemberships(
  svc: SupabaseClient,
  userIds: readonly string[],
  organizationId: string,
): Promise<{ user_id: string; organization_id: string; is_active: boolean }[]> {
  const out: { user_id: string; organization_id: string; is_active: boolean }[] = [];
  for (const ids of chunk(userIds)) {
    // Si pagina: un lotto di utenti puo' avere piu' di EXPORT_PAGE_SIZE membership attive altrove.
    for (let page = 0; ; page++) {
      const { from, to } = pageRange(page);
      const { data, error } = await svc
        .from('memberships')
        .select('user_id, organization_id, is_active')
        .in('user_id', ids)
        .neq('organization_id', organizationId)
        .eq('is_active', true)
        .order('id', { ascending: true })
        .range(from, to);
      if (error) fail('purge other memberships', error);
      const batch = (data ?? []) as { user_id: string; organization_id: string; is_active: boolean }[];
      out.push(...batch);
      if (isLastPage(batch.length)) break;
    }
  }
  return out;
}

/** created_at degli export (org.export) dell'organizzazione nelle ultime 24 ore. */
export async function readRecentExports(svc: SupabaseClient, organizationId: string, now: Date): Promise<string[]> {
  const { data, error } = await svc
    .from('platform_audit_logs')
    .select('created_at')
    .eq('organization_id', organizationId)
    .eq('action', 'org.export')
    .gte('created_at', purgeExportWindowStart(now))
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) fail('purge recent exports', error);
  return ((data ?? []) as { created_at: string }[]).map((r) => r.created_at);
}
