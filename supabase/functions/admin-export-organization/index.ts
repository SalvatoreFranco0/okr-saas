// admin-export-organization: export JSON di tutti i dati del tenant (portabilita'). Chiamante:
// Admin attivo dell'organizzazione oppure super-admin (aal2) con sessione di supporto attiva.
// La riga org.export in platform_audit_logs (solo conteggi) e' la prova richiesta dalla purge.

import { ApiError } from '../_shared/errors.ts';
import { buildExportPayload, decideExportAccess, totalRows } from '../_shared/export.ts';
import { createHandler } from '../_shared/http.ts';
import { pickActiveSupportSession } from '../_shared/platform.ts';
import { exportOrganizationSchema, parseInput } from '../_shared/schemas.ts';
import { allowedOrigins, getCaller, isOrgAdmin, logSafe, serviceClient } from '../_runtime/context.ts';
import { getOrganization, isPlatformAdmin, queryActiveSupportSessions, writePlatformAudit } from '../_runtime/platform.ts';
import { readTenantTables } from '../_runtime/tenant.ts';

Deno.serve(
  createHandler({
    name: 'admin-export-organization',
    allowedOrigins: allowedOrigins(),
    log: logSafe,
    handle: async ({ body, authorization, token }) => {
      const input = parseInput(exportOrganizationSchema, body);
      const caller = await getCaller(authorization, token);

      const now = new Date();
      const orgAdmin = await isOrgAdmin(caller, input.organization_id);
      let platformAdmin = false;
      let supportSession = false;
      if (!orgAdmin) {
        platformAdmin = await isPlatformAdmin(caller);
        if (platformAdmin) {
          const rows = await queryActiveSupportSessions(
            caller.userClient,
            caller.id,
            { organizationId: input.organization_id },
            now,
          );
          supportSession = pickActiveSupportSession(rows, caller.id, input.organization_id, now) !== null;
        }
      }
      const access = decideExportAccess({
        isOrgAdmin: orgAdmin,
        isPlatformAdmin: platformAdmin,
        hasActiveSupportSession: supportSession,
      });

      const svc = serviceClient();
      const org = await getOrganization(svc, input.organization_id);
      if (!org) throw new ApiError('not_found');

      const payload = buildExportPayload(org.id, await readTenantTables(svc, org.id), now);

      // Obbligatoria: senza traccia dell'export i dati non escono.
      await writePlatformAudit(
        svc,
        {
          actorId: caller.id,
          organizationId: org.id,
          organizationSlug: org.slug,
          action: 'org.export',
          details: { access, counts: payload.counts, total_rows: totalRows(payload.counts) },
        },
        { required: true },
      );
      return payload;
    },
  }),
);
