// admin-remove-member: un Admin attivo disattiva (non cancella) la membership di un membro,
// mantenendo ruolo e sedi. Ultimo Admin e auto-disattivazione li blocca admin_apply_member (0011).

import { ApiError } from '../_shared/errors.ts';
import { createHandler } from '../_shared/http.ts';
import { parseInput, removeMemberSchema } from '../_shared/schemas.ts';
import {
  allowedOrigins,
  applyMember,
  getCaller,
  getMembership,
  logSafe,
  requireOrgAdmin,
  serviceClient,
  writeAudit,
} from '../_runtime/context.ts';

Deno.serve(
  createHandler({
    name: 'admin-remove-member',
    allowedOrigins: allowedOrigins(),
    log: logSafe,
    handle: async ({ body, authorization, token }) => {
      const input = parseInput(removeMemberSchema, body);
      const caller = await getCaller(authorization, token);
      await requireOrgAdmin(caller, input.organization_id);

      const svc = serviceClient();
      const current = await getMembership(svc, input.organization_id, input.user_id);
      if (!current) throw new ApiError('not_found');

      await applyMember(svc, {
        organizationId: input.organization_id,
        userId: input.user_id,
        role: current.role,
        isActive: false,
        locationIds: null, // sedi invariate
        actorId: caller.id,
      });

      await writeAudit(svc, {
        organizationId: input.organization_id,
        actorId: caller.id,
        action: 'admin.remove_member',
        details: { target_user_id: input.user_id, role: current.role, is_active: false },
      });
      return { status: 'removed' as const };
    },
  }),
);
