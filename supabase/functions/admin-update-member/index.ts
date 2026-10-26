// admin-update-member: un Admin attivo cambia ruolo, stato e/o sedi di un membro. Ultimo Admin
// (trigger t15) e auto-modifica (hint self_change) li garantisce admin_apply_member (0011).

import { ApiError } from '../_shared/errors.ts';
import { createHandler } from '../_shared/http.ts';
import { parseInput, updateMemberSchema } from '../_shared/schemas.ts';
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
    name: 'admin-update-member',
    allowedOrigins: allowedOrigins(),
    log: logSafe,
    handle: async ({ body, authorization, token }) => {
      const input = parseInput(updateMemberSchema, body);
      const caller = await getCaller(authorization, token);
      await requireOrgAdmin(caller, input.organization_id);

      const svc = serviceClient();
      const current = await getMembership(svc, input.organization_id, input.user_id);
      if (!current) throw new ApiError('not_found');

      const role = input.role ?? current.role;
      const isActive = input.is_active ?? current.is_active;
      const locationIds = input.location_ids ?? null; // null = sedi invariate

      await applyMember(svc, {
        organizationId: input.organization_id,
        userId: input.user_id,
        role,
        isActive,
        locationIds,
        actorId: caller.id,
      });

      await writeAudit(svc, {
        organizationId: input.organization_id,
        actorId: caller.id,
        action: 'admin.update_member',
        details: { target_user_id: input.user_id, role, is_active: isActive, location_ids: locationIds },
      });
      return { status: 'updated' as const };
    },
  }),
);
