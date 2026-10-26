// Righe di public.audit_logs scritte dalle funzioni admin (con service_role). Modulo PURO.
// details e' costruito per whitelist: l'email non ci finisce mai, nemmeno per errore.

export type AdminAuditAction =
  | 'admin.invite'
  | 'admin.resend_invite'
  | 'admin.update_member'
  | 'admin.remove_member';

export interface AdminAuditDetailsInput {
  target_user_id: string;
  role?: string;
  is_active?: boolean;
  /** null = sedi invariate. */
  location_ids?: readonly string[] | null;
  /** Esito dell'invito (invited/added/reactivated). */
  status?: string;
}

export interface AuditLogInsert {
  organization_id: string;
  user_id: string;
  okr_id: null;
  entity: 'membership';
  entity_id: null;
  action: AdminAuditAction;
  details: Record<string, unknown>;
}

export function buildAuditRow(params: {
  organizationId: string;
  actorId: string;
  action: AdminAuditAction;
  details: AdminAuditDetailsInput;
}): AuditLogInsert {
  const d = params.details;
  const details: Record<string, unknown> = { target_user_id: d.target_user_id };
  if (d.role !== undefined) details.role = d.role;
  if (d.is_active !== undefined) details.is_active = d.is_active;
  if (d.location_ids !== undefined) details.location_ids = d.location_ids === null ? null : [...d.location_ids];
  if (d.status !== undefined) details.status = d.status;
  return {
    organization_id: params.organizationId,
    user_id: params.actorId,
    okr_id: null,
    entity: 'membership',
    entity_id: null,
    action: params.action,
    details,
  };
}
