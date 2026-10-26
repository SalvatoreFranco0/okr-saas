// I/O dell'invito di un membro (Deno, supabase-js), condiviso da admin-invite-user e
// admin-create-organization (primo Admin). Le decisioni stanno in ../_shared/invite.ts.
// Autorizzazione, rate limit e audit restano compito dell'handler chiamante.

import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError, safeErrorTag } from '../_shared/errors.ts';
import {
  decideInviteBranch,
  inviteStatus,
  isAuthRateLimitError,
  isEmailExistsError,
  setPasswordRedirect,
} from '../_shared/invite.ts';
import type { OrgRole } from '../_shared/schemas.ts';
import { applyMember, getMembership, logSafe, requireEnv } from './context.ts';

export interface InviteMemberInput {
  organization_id: string;
  /** Gia' normalizzata da emailSchema. */
  email: string;
  first_name?: string;
  last_name?: string;
  role: OrgRole;
  location_ids: string[];
}

export type InviteMemberResult = { status: 'invited' | 'added' | 'reactivated'; user_id: string };

async function findUserIdByEmail(svc: SupabaseClient, email: string, logName: string): Promise<string | null> {
  const { data, error } = await svc.from('profiles').select('id').eq('email', email).maybeSingle();
  if (error) {
    logSafe(`${logName}: lookup profilo ${safeErrorTag(error)}`);
    throw new ApiError('internal');
  }
  return (data as { id: string } | null)?.id ?? null;
}

/** Ramo (a): utente gia' registrato. Mai inviteUserByEmail. */
async function addExistingUser(
  svc: SupabaseClient,
  input: InviteMemberInput,
  userId: string,
  callerId: string,
): Promise<InviteMemberResult> {
  const membership = await getMembership(svc, input.organization_id, userId);
  const branch = decideInviteBranch(userId, membership);
  const status = inviteStatus(branch); // already_member -> 409
  await applyMember(svc, {
    organizationId: input.organization_id,
    userId,
    role: input.role,
    isActive: true,
    locationIds: input.location_ids,
    actorId: callerId,
  });
  return { status, user_id: userId };
}

/** Ramo (b): email nuova -> invito + membership; se la membership fallisce l'utente creato si elimina. */
async function inviteNewUser(
  svc: SupabaseClient,
  input: InviteMemberInput,
  callerId: string,
  logName: string,
): Promise<InviteMemberResult | 'email_exists'> {
  const redirectTo = setPasswordRedirect(requireEnv('SITE_URL'));
  const { data, error } = await svc.auth.admin.inviteUserByEmail(input.email, {
    redirectTo,
    data: { first_name: input.first_name ?? null, last_name: input.last_name ?? null },
  });
  if (error || !data?.user) {
    if (error && isEmailExistsError(error)) return 'email_exists';
    if (error && isAuthRateLimitError(error)) throw new ApiError('rate_limited', { retryAfter: 3600 });
    logSafe(`${logName}: inviteUserByEmail ${safeErrorTag(error)}`);
    throw new ApiError('internal');
  }
  const userId = data.user.id;
  try {
    await applyMember(svc, {
      organizationId: input.organization_id,
      userId,
      role: input.role,
      isActive: true,
      locationIds: input.location_ids,
      actorId: callerId,
    });
  } catch (err) {
    // Compensazione: l'utente e' stato creato in QUESTA chiamata, non deve restare orfano.
    const { error: delError } = await svc.auth.admin.deleteUser(userId);
    if (delError) logSafe(`${logName}: compensazione deleteUser fallita ${safeErrorTag(delError)}`);
    throw err;
  }
  return { status: 'invited', user_id: userId };
}

/**
 * Invita `input.email` in `input.organization_id`: utente gia' registrato -> membership + sedi
 * (added/reactivated, 409 already_member se gia' attivo); email nuova -> inviteUserByEmail +
 * membership + sedi (invited). Corsa "email registrata tra lookup e invito" -> ramo (a), una volta.
 * @param logName prefisso dei log (nome della funzione).
 */
export async function inviteMember(
  svc: SupabaseClient,
  input: InviteMemberInput,
  callerId: string,
  logName: string,
): Promise<InviteMemberResult> {
  const existingId = await findUserIdByEmail(svc, input.email, logName);
  if (existingId) return await addExistingUser(svc, input, existingId, callerId);

  const invited = await inviteNewUser(svc, input, callerId, logName);
  if (invited !== 'email_exists') return invited;

  // Corsa: l'email e' stata registrata tra il lookup e l'invito -> ramo (a), una sola volta.
  const raceId = await findUserIdByEmail(svc, input.email, logName);
  if (!raceId) {
    // Utente in auth.users senza profilo (trigger di creazione fallito): non gestibile qui.
    logSafe(`${logName}: email registrata ma profilo assente`);
    throw new ApiError('internal');
  }
  return await addExistingUser(svc, input, raceId, callerId);
}
