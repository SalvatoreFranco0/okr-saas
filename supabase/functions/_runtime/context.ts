// I/O condiviso delle funzioni admin (Deno): variabili d'ambiente, client Supabase, verifica del
// chiamante, rate limit, RPC admin_apply_member, audit. NON e' un modulo puro (Deno.env,
// supabase-js): le decisioni stanno in ../_shared/*.ts, qui solo le chiamate.
// Le cartelle che iniziano con "_" non vengono distribuite come funzioni.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { buildAuditRow, type AdminAuditAction, type AdminAuditDetailsInput } from '../_shared/audit.ts';
import { ApiError, safeErrorTag } from '../_shared/errors.ts';
import { isActiveOrgAdmin, type MembershipRow } from '../_shared/permissions.ts';
import { assertRateLimit, RATE_LIMIT_MAX, RATE_LIMITED_ACTIONS, rateLimitWindowStart } from '../_shared/rateLimit.ts';
import { mapApplyMemberError } from '../_shared/rpcErrors.ts';
import type { OrgRole } from '../_shared/schemas.ts';
import { parseAllowedOrigins } from '../_shared/cors.ts';

/** Log sicuro: solo stringhe costruite dal codice (mai email, token, messaggi grezzi). */
export function logSafe(line: string): void {
  console.error(line);
}

/** Variabile d'ambiente obbligatoria; se manca e' un errore di configurazione (500, si logga solo il nome). */
export function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) {
    logSafe(`config: variabile ${name} mancante`);
    throw new ApiError('internal');
  }
  return v;
}

export function allowedOrigins(): string[] {
  return parseAllowedOrigins(Deno.env.get('ALLOWED_ORIGINS'));
}

const NO_SESSION = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } as const;

export interface Caller {
  id: string;
  /** Client con il JWT del chiamante: tutte le sue query passano dalla RLS. */
  userClient: SupabaseClient;
}

/** Verifica il JWT con Supabase Auth (non basta decodificarlo) e restituisce il chiamante. */
export async function getCaller(authorization: string, token: string): Promise<Caller> {
  const userClient = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authorization } },
    auth: NO_SESSION,
  });
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data?.user) throw new ApiError('unauthorized');
  return { id: data.user.id, userClient };
}

/**
 * 403 se il chiamante non e' Admin attivo di organizationId. La lettura usa il client del
 * chiamante: se la RLS non mostra la membership (aal1 con TOTP attivo, org di altri, membership
 * disattivata) la riga non c'e' e la risposta e' 403.
 */
export async function requireOrgAdmin(caller: Caller, organizationId: string): Promise<void> {
  if (!(await isOrgAdmin(caller, organizationId))) throw new ApiError('forbidden');
}

/** Come requireOrgAdmin, ma restituisce l'esito invece di lanciare (errore di lettura = false). */
export async function isOrgAdmin(caller: Caller, organizationId: string): Promise<boolean> {
  const { data, error } = await caller.userClient
    .from('memberships')
    .select('organization_id, user_id, role, is_active')
    .eq('organization_id', organizationId)
    .eq('user_id', caller.id)
    .eq('is_active', true);
  if (error) {
    logSafe(`requireOrgAdmin: ${safeErrorTag(error)}`);
    return false;
  }
  return isActiveOrgAdmin(data as MembershipRow[] | null, organizationId, caller.id);
}

export function serviceClient(): SupabaseClient {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: NO_SESSION,
  });
}

/** 429 se il chiamante ha gia' fatto RATE_LIMIT_MAX inviti/reinvii nell'ultima ora in questa org. */
export async function enforceInviteRateLimit(
  svc: SupabaseClient,
  organizationId: string,
  callerId: string,
): Promise<void> {
  const now = new Date();
  const { data, error } = await svc
    .from('audit_logs')
    .select('created_at')
    .eq('organization_id', organizationId)
    .eq('user_id', callerId)
    .in('action', [...RATE_LIMITED_ACTIONS])
    .gte('created_at', rateLimitWindowStart(now))
    .order('created_at', { ascending: false })
    .limit(RATE_LIMIT_MAX);
  if (error) {
    logSafe(`rateLimit: ${safeErrorTag(error)}`);
    throw new ApiError('internal');
  }
  assertRateLimit(((data ?? []) as { created_at: string }[]).map((r) => r.created_at), now);
}

export interface CurrentMembership {
  role: OrgRole;
  is_active: boolean;
}

/** Membership (attiva o no) di userId in organizationId, letta con service_role. */
export async function getMembership(
  svc: SupabaseClient,
  organizationId: string,
  userId: string,
): Promise<CurrentMembership | null> {
  const { data, error } = await svc
    .from('memberships')
    .select('role, is_active')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    logSafe(`getMembership: ${safeErrorTag(error)}`);
    throw new ApiError('internal');
  }
  return (data as CurrentMembership | null) ?? null;
}

/** public.admin_apply_member (0011); errori mappati da mapApplyMemberError. */
export async function applyMember(
  svc: SupabaseClient,
  args: {
    organizationId: string;
    userId: string;
    role: OrgRole;
    isActive: boolean;
    /** null = sedi invariate. */
    locationIds: string[] | null;
    actorId: string;
  },
): Promise<void> {
  const { error } = await svc.rpc('admin_apply_member', {
    p_org: args.organizationId,
    p_user: args.userId,
    p_role: args.role,
    p_is_active: args.isActive,
    p_location_ids: args.locationIds,
    p_actor: args.actorId,
  });
  if (error) {
    const mapped = mapApplyMemberError(error);
    if (mapped.code === 'internal') logSafe(`admin_apply_member: ${safeErrorTag(error)}`);
    throw mapped;
  }
}

/**
 * Riga di audit dell'operazione riuscita. Se l'insert fallisce l'operazione e' comunque
 * avvenuta (e il trigger t90_audit ha gia' registrato la modifica della riga): si logga e si
 * risponde con successo, per non far ripetere al client un'operazione gia' fatta.
 */
export async function writeAudit(
  svc: SupabaseClient,
  params: { organizationId: string; actorId: string; action: AdminAuditAction; details: AdminAuditDetailsInput },
): Promise<void> {
  const { error } = await svc.from('audit_logs').insert(buildAuditRow(params));
  if (error) logSafe(`audit ${params.action}: insert fallito ${safeErrorTag(error)}`);
}
