// admin-resend-invite: un Admin attivo rinnova l'invito di un membro che non l'ha ancora accettato.

import { ApiError, safeErrorTag } from '../_shared/errors.ts';
import { createHandler } from '../_shared/http.ts';
import { isAuthRateLimitError, isInviteAccepted, setPasswordRedirect } from '../_shared/invite.ts';
import { parseInput, resendInviteSchema } from '../_shared/schemas.ts';
import {
  allowedOrigins,
  enforceInviteRateLimit,
  getCaller,
  getMembership,
  logSafe,
  requireEnv,
  requireOrgAdmin,
  serviceClient,
  writeAudit,
} from '../_runtime/context.ts';

Deno.serve(
  createHandler({
    name: 'admin-resend-invite',
    allowedOrigins: allowedOrigins(),
    log: logSafe,
    handle: async ({ body, authorization, token }) => {
      const input = parseInput(resendInviteSchema, body);
      const caller = await getCaller(authorization, token);
      await requireOrgAdmin(caller, input.organization_id);

      const svc = serviceClient();
      await enforceInviteRateLimit(svc, input.organization_id, caller.id);

      // Il bersaglio deve appartenere a QUESTA organizzazione: un Admin non puo' reinviare
      // inviti a utenti di altre organizzazioni.
      const membership = await getMembership(svc, input.organization_id, input.user_id);
      if (!membership) throw new ApiError('not_found');

      const { data, error } = await svc.auth.admin.getUserById(input.user_id);
      if (error || !data?.user) {
        if (error && error.status !== 404) logSafe(`admin-resend-invite: getUserById ${safeErrorTag(error)}`);
        throw new ApiError('not_found');
      }
      const user = data.user;
      if (isInviteAccepted(user)) throw new ApiError('already_accepted');
      if (!user.email) {
        logSafe('admin-resend-invite: utente senza email');
        throw new ApiError('internal');
      }

      const redirectTo = setPasswordRedirect(requireEnv('SITE_URL'));
      const { error: invErr } = await svc.auth.admin.inviteUserByEmail(user.email, { redirectTo });
      if (invErr) {
        if (isAuthRateLimitError(invErr)) throw new ApiError('rate_limited', { retryAfter: 3600 });
        logSafe(`admin-resend-invite: inviteUserByEmail ${safeErrorTag(invErr)}`);
        throw new ApiError('internal');
      }

      await writeAudit(svc, {
        organizationId: input.organization_id,
        actorId: caller.id,
        action: 'admin.resend_invite',
        details: { target_user_id: input.user_id, role: membership.role, is_active: membership.is_active },
      });
      return { status: 'resent' as const };
    },
  }),
);
