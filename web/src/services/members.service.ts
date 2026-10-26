import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Enums } from '../types/database';

// Le scritture su memberships passano SOLO dalle Edge Functions admin (il client ha solo SELECT).
// Le funzioni verificano di nuovo chi chiama: qui si invoca soltanto, con il JWT della sessione.

export type OrgRole = Enums<'org_role'>;

export interface OrgMemberRow {
  user_id: string;
  role: OrgRole;
  is_active: boolean;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  location_ids: string[];
}

/** Membri dell'organizzazione con ruolo, sedi e stato (vista `v_org_members`: la RLS decide chi la legge). */
export async function listOrgMembers(orgId: string): Promise<OrgMemberRow[]> {
  const { data, error } = await supabase
    .from('v_org_members')
    .select('user_id, role, is_active, email, first_name, last_name, location_ids')
    .eq('organization_id', orgId)
    .order('last_name', { nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as OrgMemberRow[];
}

/** Errore restituito da una Edge Function: codice stabile (`{ error: { code } }`) e stato HTTP. */
export class FunctionError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number) {
    super(code);
    this.name = 'FunctionError';
    this.code = code;
    this.status = status;
  }
}

/** Codici noti delle funzioni admin → chiave i18n. Qualunque altro codice ricade su `errors.generic`. */
const KNOWN = new Set([
  'unauthorized', 'forbidden', 'not_found', 'already_member', 'already_accepted', 'last_admin',
  'self_change', 'rate_limited', 'invalid_input', 'invalid_reference', 'slug_taken',
  'confirmation_mismatch', 'export_required', 'export_too_large',
]);

export function functionErrorKey(err: unknown): string | null {
  if (!(err instanceof FunctionError)) return null;
  return KNOWN.has(err.code) ? `errors.fn.${err.code}` : 'errors.generic';
}

export async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const res = error.context as Response;
      let code = 'internal';
      try {
        const j = (await res.json()) as { error?: { code?: string } };
        code = j.error?.code ?? code;
      } catch {
        // risposta non JSON: resta "internal"
      }
      throw new FunctionError(code, res.status);
    }
    throw error;
  }
  return data as T;
}

export interface InviteInput {
  email: string;
  first_name?: string;
  last_name?: string;
  role: OrgRole;
  location_ids: string[];
}

export const inviteUser = (orgId: string, d: InviteInput) =>
  invoke<{ status: 'invited' | 'added' | 'reactivated'; user_id: string }>('admin-invite-user', { organization_id: orgId, ...d });

export const resendInvite = (orgId: string, userId: string) =>
  invoke<{ status: 'resent' }>('admin-resend-invite', { organization_id: orgId, user_id: userId });

export const updateMember = (orgId: string, userId: string, patch: { role?: OrgRole; is_active?: boolean; location_ids?: string[] }) =>
  invoke<{ status: string }>('admin-update-member', { organization_id: orgId, user_id: userId, ...patch });

export const removeMember = (orgId: string, userId: string) =>
  invoke<{ status: string }>('admin-remove-member', { organization_id: orgId, user_id: userId });
