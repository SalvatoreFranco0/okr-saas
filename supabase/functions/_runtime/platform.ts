// I/O delle funzioni di piattaforma (Deno, supabase-js): super-admin, organizzazioni, sessioni
// di supporto, audit di piattaforma. Le decisioni stanno in ../_shared/platform.ts e
// ../_shared/platformAudit.ts.

import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError, safeErrorTag } from '../_shared/errors.ts';
import { isPlatformAdminRow, type SupportSessionRow } from '../_shared/platform.ts';
import {
  buildPlatformAuditRow,
  buildSupportAuditRow,
  type PlatformAuditAction,
  type PlatformAuditDetailsInput,
  type SupportAuditAction,
} from '../_shared/platformAudit.ts';
import { type Caller, logSafe } from './context.ts';

/**
 * Super-admin = riga in platform_admins visibile col client del CHIAMANTE. La policy
 * platform_admins_select (0005) usa private.is_platform_admin(), che richiede aal2: con aal1
 * la riga non e' visibile. Errore di lettura = non super-admin (403).
 */
export async function isPlatformAdmin(caller: Caller): Promise<boolean> {
  const { data, error } = await caller.userClient.from('platform_admins').select('user_id').eq('user_id', caller.id);
  if (error) {
    logSafe(`requirePlatformAdmin: ${safeErrorTag(error)}`);
    return false;
  }
  return isPlatformAdminRow(data as { user_id: string }[] | null, caller.id);
}

export async function requirePlatformAdmin(caller: Caller): Promise<void> {
  if (!(await isPlatformAdmin(caller))) throw new ApiError('forbidden');
}

export interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
}

/** Organizzazione letta con service_role; null se non esiste. */
export async function getOrganization(svc: SupabaseClient, organizationId: string): Promise<OrganizationRow | null> {
  const { data, error } = await svc
    .from('organizations')
    .select('id, name, slug, is_active')
    .eq('id', organizationId)
    .maybeSingle();
  if (error) {
    logSafe(`getOrganization: ${safeErrorTag(error)}`);
    throw new ApiError('internal');
  }
  return (data as OrganizationRow | null) ?? null;
}

const SESSION_COLUMNS = 'id, platform_admin_id, organization_id, started_at, expires_at, ended_at';

/**
 * Sessioni ATTIVE del super-admin (stesso criterio di my_access: ended_at null,
 * started_at <= now < expires_at), filtrate per organizzazione o per id. Con il client
 * dell'utente la RLS (aal2) decide gia' la visibilita'; con il service client e' la
 * riverifica. Il chiamante ricontrolla le righe con pickActiveSupportSession.
 */
export async function queryActiveSupportSessions(
  client: SupabaseClient,
  platformAdminId: string,
  filter: { organizationId: string } | { sessionId: string },
  now: Date,
): Promise<SupportSessionRow[]> {
  const nowIso = now.toISOString();
  let q = client
    .from('support_sessions')
    .select(SESSION_COLUMNS)
    .eq('platform_admin_id', platformAdminId)
    .is('ended_at', null)
    .lte('started_at', nowIso)
    .gt('expires_at', nowIso);
  q = 'organizationId' in filter ? q.eq('organization_id', filter.organizationId) : q.eq('id', filter.sessionId);
  const { data, error } = await q;
  if (error) {
    logSafe(`support_sessions: ${safeErrorTag(error)}`);
    throw new ApiError('internal');
  }
  return (data ?? []) as SupportSessionRow[];
}

/**
 * Riga in platform_audit_logs. required = true: se l'insert fallisce la funzione risponde 500
 * (usato dove la riga e' una garanzia: prova dell'export, inizio della purge, motivazione della
 * sessione); altrimenti si logga e basta.
 */
export async function writePlatformAudit(
  svc: SupabaseClient,
  params: {
    actorId: string;
    organizationId: string;
    organizationSlug: string | null;
    action: PlatformAuditAction;
    details?: PlatformAuditDetailsInput;
  },
  opts: { required: boolean },
): Promise<void> {
  const { error } = await svc.from('platform_audit_logs').insert(buildPlatformAuditRow(params));
  if (!error) return;
  logSafe(`platform audit ${params.action}: insert fallito ${safeErrorTag(error)}`);
  if (opts.required) throw new ApiError('internal');
}

/** Riga in public.audit_logs del tenant per inizio/fine della sessione di supporto (best effort). */
export async function writeSupportAudit(
  svc: SupabaseClient,
  params: {
    organizationId: string;
    actorId: string;
    supportSessionId: string;
    action: SupportAuditAction;
    details: { reason_length?: number; expires_at?: string; ended_at?: string };
  },
): Promise<void> {
  const { error } = await svc.from('audit_logs').insert(buildSupportAuditRow(params));
  if (error) logSafe(`audit ${params.action}: insert fallito ${safeErrorTag(error)}`);
}
