// admin-end-support-session: un super-admin (aal2) chiude in anticipo una SUA sessione di
// supporto attiva. Audit come l'apertura (support.end).

import { ApiError, safeErrorTag } from '../_shared/errors.ts';
import { createHandler } from '../_shared/http.ts';
import { pickActiveSupportSession, type SupportSessionRow } from '../_shared/platform.ts';
import { endSupportSessionSchema, parseInput } from '../_shared/schemas.ts';
import { allowedOrigins, getCaller, logSafe, serviceClient } from '../_runtime/context.ts';
import {
  getOrganization,
  queryActiveSupportSessions,
  requirePlatformAdmin,
  writePlatformAudit,
  writeSupportAudit,
} from '../_runtime/platform.ts';

const NAME = 'admin-end-support-session';

Deno.serve(
  createHandler({
    name: NAME,
    allowedOrigins: allowedOrigins(),
    log: logSafe,
    handle: async ({ body, authorization, token }) => {
      const input = parseInput(endSupportSessionSchema, body);
      const caller = await getCaller(authorization, token);
      await requirePlatformAdmin(caller);

      // Lettura col client del chiamante: solo sessioni sue, attive, visibili con aal2.
      const now = new Date();
      const rows = await queryActiveSupportSessions(caller.userClient, caller.id, { sessionId: input.support_session_id }, now);
      const found = rows.find((r) => r.id.toLowerCase() === input.support_session_id.toLowerCase());
      const session = found ? pickActiveSupportSession([found], caller.id, found.organization_id, now) : null;
      if (!session) throw new ApiError('not_found');

      // Update condizionato agli stessi criteri: una chiusura concorrente non viene sovrascritta.
      const endedAt = now.toISOString();
      const svc = serviceClient();
      const org = await getOrganization(svc, session.organization_id); // per lo slug nell'audit
      const { data, error } = await svc
        .from('support_sessions')
        .update({ ended_at: endedAt })
        .eq('id', session.id)
        .eq('platform_admin_id', caller.id)
        .is('ended_at', null)
        .gt('expires_at', endedAt)
        .select('id, platform_admin_id, organization_id, started_at, expires_at, ended_at');
      if (error) {
        logSafe(`${NAME}: update sessione ${safeErrorTag(error)}`);
        throw new ApiError('internal');
      }
      const updated = (data ?? []) as SupportSessionRow[];
      if (updated.length === 0) throw new ApiError('not_found');

      await writeSupportAudit(svc, {
        organizationId: session.organization_id,
        actorId: caller.id,
        supportSessionId: session.id,
        action: 'support.end',
        details: { ended_at: endedAt },
      });
      await writePlatformAudit(
        svc,
        {
          actorId: caller.id,
          organizationId: session.organization_id,
          organizationSlug: org?.slug ?? null,
          action: 'support.end',
          details: { support_session_id: session.id, ended_at: endedAt },
        },
        { required: false },
      );
      return { status: 'ended' as const, support_session_id: session.id, ended_at: endedAt };
    },
  }),
);
