// admin-start-support-session: un super-admin (aal2) apre una sessione di supporto (max 4 ore)
// su un'organizzazione attiva. Idempotente: se ha gia' una sessione attiva su quell'org la
// restituisce. Audit: audit_logs del tenant (senza motivazione) + platform_audit_logs (con).

import { ApiError, safeErrorTag } from '../_shared/errors.ts';
import { createHandler } from '../_shared/http.ts';
import { pickActiveSupportSession, supportSessionWindow, type SupportSessionRow } from '../_shared/platform.ts';
import { parseInput, startSupportSessionSchema } from '../_shared/schemas.ts';
import { allowedOrigins, getCaller, logSafe, serviceClient } from '../_runtime/context.ts';
import {
  getOrganization,
  queryActiveSupportSessions,
  requirePlatformAdmin,
  writePlatformAudit,
  writeSupportAudit,
} from '../_runtime/platform.ts';

const NAME = 'admin-start-support-session';

function sessionResponse(s: SupportSessionRow, reused: boolean) {
  return {
    status: reused ? ('existing' as const) : ('started' as const),
    support_session: {
      id: s.id,
      organization_id: s.organization_id,
      started_at: s.started_at,
      expires_at: s.expires_at,
    },
  };
}

Deno.serve(
  createHandler({
    name: NAME,
    allowedOrigins: allowedOrigins(),
    log: logSafe,
    handle: async ({ body, authorization, token }) => {
      const input = parseInput(startSupportSessionSchema, body);
      const caller = await getCaller(authorization, token);
      await requirePlatformAdmin(caller);

      const svc = serviceClient();
      const org = await getOrganization(svc, input.organization_id);
      if (!org) throw new ApiError('not_found'); // anche un'organizzazione disattivata: serve per purgarla

      const now = new Date();
      const existing = pickActiveSupportSession(
        await queryActiveSupportSessions(caller.userClient, caller.id, { organizationId: org.id }, now),
        caller.id,
        org.id,
        now,
      );
      if (existing) return sessionResponse(existing, true);

      const { data, error } = await svc
        .from('support_sessions')
        .insert({
          platform_admin_id: caller.id,
          organization_id: org.id,
          reason: input.reason,
          ...supportSessionWindow(now, input.duration_minutes),
        })
        .select('id, platform_admin_id, organization_id, started_at, expires_at, ended_at')
        .single();
      if (error || !data) {
        logSafe(`${NAME}: insert sessione ${safeErrorTag(error)}`);
        throw new ApiError('internal');
      }
      const session = data as SupportSessionRow;

      // La motivazione e' tracciata SOLO qui: senza questa riga la sessione non resta aperta.
      try {
        await writePlatformAudit(
          svc,
          {
            actorId: caller.id,
            organizationId: org.id,
            organizationSlug: org.slug,
            action: 'support.start',
            details: {
              support_session_id: session.id,
              reason: input.reason,
              duration_minutes: input.duration_minutes,
              expires_at: session.expires_at,
            },
          },
          { required: true },
        );
      } catch (err) {
        const { error: endErr } = await svc
          .from('support_sessions')
          .update({ ended_at: new Date().toISOString() })
          .eq('id', session.id);
        if (endErr) logSafe(`${NAME}: compensazione chiusura sessione fallita ${safeErrorTag(endErr)}`);
        throw err;
      }

      await writeSupportAudit(svc, {
        organizationId: org.id,
        actorId: caller.id,
        supportSessionId: session.id,
        action: 'support.start',
        details: { reason_length: input.reason.length, expires_at: session.expires_at },
      });
      return sessionResponse(session, false);
    },
  }),
);
