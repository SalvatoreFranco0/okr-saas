// admin-invite-user: un Admin attivo dell'organizzazione invita un utente (nuovo o gia'
// registrato). Logica decisionale in ../_shared, I/O in ../_runtime (invito in invite.ts).

import { createHandler } from '../_shared/http.ts';
import { inviteUserSchema, parseInput } from '../_shared/schemas.ts';
import {
  allowedOrigins,
  enforceInviteRateLimit,
  getCaller,
  logSafe,
  requireOrgAdmin,
  serviceClient,
  writeAudit,
} from '../_runtime/context.ts';
import { inviteMember } from '../_runtime/invite.ts';

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

      const result = await inviteMember(svc, input, caller.id, 'admin-invite-user');

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
