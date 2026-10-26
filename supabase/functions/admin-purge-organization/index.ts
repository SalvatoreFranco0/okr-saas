// admin-purge-organization: eliminazione DEFINITIVA di un tenant (unico percorso di
// cancellazione fisica dei dati di dominio). Precondizioni (purgeRefusal): super-admin aal2,
// sessione di supporto attiva sull'org (client utente E service client), conferma dello slug,
// export negli ultimi 24 ore. Poi DELETE da organizations a cascata (come pgTAP 18).
// Gli utenti restano in auth.users; quelli senza altre membership attive sono contati.

import { ApiError, safeErrorTag } from '../_shared/errors.ts';
import { assertPurgeAllowed, countOrphanUsers, totalRows } from '../_shared/export.ts';
import { createHandler } from '../_shared/http.ts';
import { pickActiveSupportSession } from '../_shared/platform.ts';
import { parseInput, purgeOrganizationSchema } from '../_shared/schemas.ts';
import { allowedOrigins, getCaller, logSafe, serviceClient } from '../_runtime/context.ts';
import { getOrganization, isPlatformAdmin, queryActiveSupportSessions, writePlatformAudit } from '../_runtime/platform.ts';
import { countTenantRows, readMemberIds, readOtherActiveMemberships, readRecentExports } from '../_runtime/tenant.ts';

const NAME = 'admin-purge-organization';

Deno.serve(
  createHandler({
    name: NAME,
    allowedOrigins: allowedOrigins(),
    log: logSafe,
    handle: async ({ body, authorization, token }) => {
      const input = parseInput(purgeOrganizationSchema, body);
      const caller = await getCaller(authorization, token);
      const orgId = input.organization_id;
      const now = new Date();

      // (a) super-admin aal2: senza, nessun'altra lettura.
      const platformAdmin = await isPlatformAdmin(caller);
      if (!platformAdmin) throw new ApiError('forbidden');

      // (b) sessione attiva col client dell'utente, (b') riverificata col service client.
      const userSession = pickActiveSupportSession(
        await queryActiveSupportSessions(caller.userClient, caller.id, { organizationId: orgId }, now),
        caller.id,
        orgId,
        now,
      );
      const svc = serviceClient();
      const serviceSession = pickActiveSupportSession(
        await queryActiveSupportSessions(svc, caller.id, { organizationId: orgId }, now),
        caller.id,
        orgId,
        now,
      );
      const org = await getOrganization(svc, orgId);

      // (c) slug, (d) export recente.
      assertPurgeAllowed({
        isPlatformAdmin: platformAdmin,
        userSessionActive: userSession !== null,
        serviceSessionActive: serviceSession !== null,
        orgSlug: org?.slug ?? null,
        confirmSlug: input.confirm_slug,
        exportCreatedAt: await readRecentExports(svc, orgId, now),
        now,
      });
      // Gia' garantiti da assertPurgeAllowed; il controllo serve al type narrowing.
      if (!org || !serviceSession) throw new ApiError('internal');
      const slug = org.slug;

      // Conteggi e utenti orfani PRIMA della delete.
      const counts = await countTenantRows(svc, orgId);
      const memberIds = await readMemberIds(svc, orgId);
      const orphanUsers = countOrphanUsers(memberIds, await readOtherActiveMemberships(svc, memberIds, orgId), orgId);

      // Traccia obbligatoria prima di cancellare (sopravvive alla purge: nessuna FK).
      await writePlatformAudit(
        svc,
        {
          actorId: caller.id,
          organizationId: orgId,
          organizationSlug: slug,
          action: 'org.purge.start',
          details: { support_session_id: serviceSession.id, counts, total_rows: totalRows(counts) },
        },
        { required: true },
      );

      const { data, error } = await svc.from('organizations').delete().eq('id', orgId).select('id');
      if (error) {
        logSafe(`${NAME}: delete organizzazione ${safeErrorTag(error)}`);
        throw new ApiError('internal');
      }
      if (((data ?? []) as unknown[]).length === 0) throw new ApiError('not_found'); // purge concorrente

      await writePlatformAudit(
        svc,
        {
          actorId: caller.id,
          organizationId: orgId,
          organizationSlug: slug,
          action: 'org.purge.done',
          details: { orphan_users: orphanUsers },
        },
        { required: false },
      );
      return { status: 'purged' as const, orphan_users: orphanUsers };
    },
  }),
);
