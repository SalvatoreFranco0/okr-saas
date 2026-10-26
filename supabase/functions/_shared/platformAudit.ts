// Righe di audit delle funzioni di piattaforma. Modulo PURO.
// * public.platform_audit_logs (0012): insert-only per service_role, senza FK verso
//   organizations, quindi sopravvive alla purge (e' la traccia di export e cancellazioni).
// * public.audit_logs dell'organizzazione: inizio/fine delle sessioni di supporto, visibili
//   agli Admin del tenant.
// details per WHITELIST: mai email, mai contenuti del tenant (solo id, conteggi, date). La
// motivazione completa della sessione di supporto va solo in platform_audit_logs.

export type PlatformAuditAction =
  | 'org.create'
  | 'support.start'
  | 'support.end'
  | 'org.export'
  | 'org.purge.start'
  | 'org.purge.done';

export interface PlatformAuditDetailsInput {
  period_id?: string;
  first_admin_user_id?: string;
  first_admin_status?: string;
  support_session_id?: string;
  /** Solo support.start. */
  reason?: string;
  duration_minutes?: number;
  expires_at?: string;
  ended_at?: string;
  /** Chi ha esportato: Admin dell'org o super-admin in supporto. */
  access?: string;
  counts?: Record<string, number>;
  total_rows?: number;
  orphan_users?: number;
}

export interface PlatformAuditLogInsert {
  actor_id: string;
  organization_id: string;
  organization_slug: string | null;
  action: PlatformAuditAction;
  details: Record<string, unknown>;
}

const STRING_KEYS = [
  'period_id',
  'first_admin_user_id',
  'first_admin_status',
  'support_session_id',
  'expires_at',
  'ended_at',
  'access',
] as const;
const NUMBER_KEYS = ['duration_minutes', 'total_rows', 'orphan_users'] as const;

/** Conteggi: solo nomi tabella "sicuri" e valori interi non negativi. */
function sanitizeCounts(counts: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(counts)) {
    if (/^[a-z_]{1,63}$/.test(k) && Number.isInteger(v) && v >= 0) out[k] = v;
  }
  return out;
}

export function buildPlatformAuditRow(params: {
  actorId: string;
  organizationId: string;
  organizationSlug: string | null;
  action: PlatformAuditAction;
  details?: PlatformAuditDetailsInput;
}): PlatformAuditLogInsert {
  const d = params.details ?? {};
  const details: Record<string, unknown> = {};
  for (const k of STRING_KEYS) if (typeof d[k] === 'string') details[k] = d[k];
  for (const k of NUMBER_KEYS) if (typeof d[k] === 'number' && Number.isFinite(d[k])) details[k] = d[k];
  if (d.counts !== undefined) details.counts = sanitizeCounts(d.counts);
  if (params.action === 'support.start' && typeof d.reason === 'string') details.reason = d.reason;
  return {
    actor_id: params.actorId,
    organization_id: params.organizationId,
    organization_slug: params.organizationSlug,
    action: params.action,
    details,
  };
}

export type SupportAuditAction = 'support.start' | 'support.end';

export interface SupportAuditLogInsert {
  organization_id: string;
  user_id: string;
  okr_id: null;
  entity: 'support_session';
  entity_id: string;
  action: SupportAuditAction;
  details: Record<string, unknown>;
}

/** Riga in public.audit_logs del tenant: niente motivazione, solo lunghezza e date. */
export function buildSupportAuditRow(params: {
  organizationId: string;
  actorId: string;
  supportSessionId: string;
  action: SupportAuditAction;
  details: { reason_length?: number; expires_at?: string; ended_at?: string };
}): SupportAuditLogInsert {
  const d = params.details;
  const details: Record<string, unknown> = {};
  if (typeof d.reason_length === 'number') details.reason_length = d.reason_length;
  if (typeof d.expires_at === 'string') details.expires_at = d.expires_at;
  if (typeof d.ended_at === 'string') details.ended_at = d.ended_at;
  return {
    organization_id: params.organizationId,
    user_id: params.actorId,
    okr_id: null,
    entity: 'support_session',
    entity_id: params.supportSessionId,
    action: params.action,
    details,
  };
}
