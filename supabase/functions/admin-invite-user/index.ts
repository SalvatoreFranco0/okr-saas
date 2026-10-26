// admin-invite-user: un Admin attivo dell'organizzazione invita un utente (nuovo o gia'
// registrato). Logica decisionale in ../_shared, I/O in ../_runtime/context.ts.

import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError, safeErrorTag } from '../_shared/errors.ts';
import { createHandler } from '../_shared/http.ts';
import {
  decideInviteBranch,
  inviteStatus,
  isAuthRateLimitError,
  isEmailExistsError,
  setPasswordRedirect,
} from '../_shared/invite.ts';
import { inviteUserSchema, parseInput, type InviteUserInput } from '../_shared/schemas.ts';
import {
  allowedOrigins,
  applyMember,
  enforceInviteRateLimit,
  getCaller,
  getMembership,
  logSafe,
  requireEnv,
  requireOrgAdmin,
  serviceClient,
  writeAudit,
} from '../_runtime/context.ts';

type Result = { status: 'invited' | 'added' | 'reactivated'; user_id: string };

async function findUserIdByEmail(svc: SupabaseClient, email: string): Promise<string | null> {
  const { data, error } = await svc.from('profiles').select('id').eq('email', email).maybeSingle();
  if (error) {
    logSafe(`admin-invite-user: lookup profilo ${safeErrorTag(error)}`);
    throw new ApiError('internal');
  }
  return (data as { id: string } | null)?.id ?? null;
}

/** Ramo (a): utente gia' registrato. Mai inviteUserByEmail. */
async function addExistingUser(
  svc: SupabaseClient,
  input: InviteUserInput,
  userId: string,
  callerId: string,
): Promise<Result> {
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
  input: InviteUserInput,
  callerId: string,
): Promise<Result | 'email_exists'> {
  const redirectTo = setPasswordRedirect(requireEnv('SITE_URL'));
  const { data, error } = await svc.auth.admin.inviteUserByEmail(input.email, {
    redirectTo,
    data: { first_name: input.first_name ?? null, last_name: input.last_name ?? null },
  });
  if (error || !data?.user) {
    if (error && isEmailExistsError(error)) return 'email_exists';
    if (error && isAuthRateLimitError(error)) throw new ApiError('rate_limited', { retryAfter: 3600 });
    logSafe(`admin-invite-user: inviteUserByEmail ${safeErrorTag(error)}`);
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
    if (delError) logSafe(`admin-invite-user: compensazione deleteUser fallita ${safeErrorTag(delError)}`);
    throw err;
  }
  return { status: 'invited', user_id: userId };
}

Deno.serve(
  createHandler({
    name: 'admin-invite-user',
    allowedOrigins: allowedOrigins(),
    log: logSafe,
    handle: async ({ body, authorization, token }) => {
      const input = parseInput(inviteUserSchema, body);
      const caller = await getCaller(authorization, token);
      await requireOrgAdmin(caller, input.organization_id);

      const svc = serviceClient();
      await enforceInviteRateLimit(svc, input.organization_id, caller.id);

      let result: Result;
      const existingId = await findUserIdByEmail(svc, input.email);
      if (existingId) {
        result = await addExistingUser(svc, input, existingId, caller.id);
      } else {
        const invited = await inviteNewUser(svc, input, caller.id);
        if (invited === 'email_exists') {
          // Corsa: l'email e' stata registrata tra il lookup e l'invito -> ramo (a), una sola volta.
          const raceId = await findUserIdByEmail(svc, input.email);
          if (!raceId) {
            // Utente in auth.users senza profilo (trigger di creazione fallito): non gestibile qui.
            logSafe('admin-invite-user: email registrata ma profilo assente');
            throw new ApiError('internal');
          }
          result = await addExistingUser(svc, input, raceId, caller.id);
        } else {
          result = invited;
        }
      }

      await writeAudit(svc, {
        organizationId: input.organization_id,
        actorId: caller.id,
        action: 'admin.invite',
        details: {
          target_user_id: result.user_id,
          role: input.role,
          is_active: true,
          location_ids: input.location_ids,
          status: result.status,
        },
      });
      return result;
    },
  }),
);
