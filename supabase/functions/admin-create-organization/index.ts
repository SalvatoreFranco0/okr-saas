// admin-create-organization: un super-admin (aal2) crea un'organizzazione con il periodo del
// trimestre corrente e, se indicato, invita il primo Admin (stessa logica di admin-invite-user).
// Se periodo o invito falliscono l'organizzazione appena creata (vuota) viene eliminata.

import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError, safeErrorTag } from '../_shared/errors.ts';
import { createHandler } from '../_shared/http.ts';
import { isUniqueViolation, quarterPeriod } from '../_shared/platform.ts';
import { createOrganizationSchema, parseInput } from '../_shared/schemas.ts';
import { allowedOrigins, getCaller, logSafe, serviceClient, writeAudit } from '../_runtime/context.ts';
import { inviteMember, type InviteMemberResult } from '../_runtime/invite.ts';
import { requirePlatformAdmin, writePlatformAudit } from '../_runtime/platform.ts';

const NAME = 'admin-create-organization';

/** Compensazione: elimina l'organizzazione creata in QUESTA chiamata (cascata sui pochi figli). */
async function dropNewOrganization(svc: SupabaseClient, organizationId: string): Promise<void> {
  const { error } = await svc.from('organizations').delete().eq('id', organizationId);
  if (error) logSafe(`${NAME}: compensazione delete organizzazione fallita ${safeErrorTag(error)}`);
}

Deno.serve(
  createHandler({
    name: NAME,
    allowedOrigins: allowedOrigins(),
    log: logSafe,
    handle: async ({ body, authorization, token }) => {
      const input = parseInput(createOrganizationSchema, body);
      const caller = await getCaller(authorization, token);
      await requirePlatformAdmin(caller);

      const svc = serviceClient();
      const { data: org, error: orgErr } = await svc
        .from('organizations')
        .insert({ name: input.name, slug: input.slug })
        .select('id, slug')
        .single();
      if (orgErr || !org) {
        if (orgErr && isUniqueViolation(orgErr)) throw new ApiError('slug_taken');
        logSafe(`${NAME}: insert organizzazione ${safeErrorTag(orgErr)}`);
        throw new ApiError('internal');
      }
      const organizationId = (org as { id: string }).id;

      let periodId: string;
      let firstAdmin: InviteMemberResult | null = null;
      try {
        const { data: period, error: perErr } = await svc
          .from('periods')
          .insert({ organization_id: organizationId, ...quarterPeriod(new Date()) })
          .select('id')
          .single();
        if (perErr || !period) {
          logSafe(`${NAME}: insert periodo ${safeErrorTag(perErr)}`);
          throw new ApiError('internal');
        }
        periodId = (period as { id: string }).id;

        if (input.first_admin_email) {
          firstAdmin = await inviteMember(
            svc,
            {
              organization_id: organizationId,
              email: input.first_admin_email,
              first_name: input.first_admin_first_name,
              last_name: input.first_admin_last_name,
              role: 'admin',
              location_ids: [],
            },
            caller.id,
            NAME,
          );
        }
      } catch (err) {
        await dropNewOrganization(svc, organizationId);
        throw err;
      }

      if (firstAdmin) {
        await writeAudit(svc, {
          organizationId,
          actorId: caller.id,
          action: 'admin.invite',
          details: {
            target_user_id: firstAdmin.user_id,
            role: 'admin',
            is_active: true,
            location_ids: [],
            status: firstAdmin.status,
          },
        });
      }
      await writePlatformAudit(
        svc,
        {
          actorId: caller.id,
          organizationId,
          organizationSlug: input.slug,
          action: 'org.create',
          details: {
            period_id: periodId,
            ...(firstAdmin ? { first_admin_user_id: firstAdmin.user_id, first_admin_status: firstAdmin.status } : {}),
          },
        },
        { required: false },
      );

      return {
        status: 'created' as const,
        organization_id: organizationId,
        slug: input.slug,
        period_id: periodId,
        first_admin: firstAdmin,
      };
    },
  }),
);
