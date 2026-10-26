import { supabase } from '../lib/supabase';
import { invoke } from './members.service';

// Funzioni di piattaforma (solo super-admin con aal2, tranne l'export che è anche dell'Admin dell'organizzazione).
// Le funzioni verificano di nuovo chi chiama: qui si invoca soltanto, con il JWT della sessione.

export interface PlatformOrg {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
}

/** Tutte le organizzazioni: la RLS le mostra così solo al super-admin con aal2. */
export async function listPlatformOrgs(): Promise<PlatformOrg[]> {
  const { data, error } = await supabase.from('organizations').select('id, name, slug, is_active').order('name');
  if (error) throw error;
  return data ?? [];
}

export interface CreateOrgInput {
  name: string;
  slug: string;
  first_admin_email?: string;
  first_admin_first_name?: string;
  first_admin_last_name?: string;
}

export const createOrganization = (d: CreateOrgInput) =>
  invoke<{ status: 'created'; organization_id: string; slug: string; period_id: string }>('admin-create-organization', { ...d });

export const startSupportSession = (organizationId: string, reason: string) =>
  invoke<{ status: 'started' | 'existing'; support_session: { id: string; expires_at: string } }>(
    'admin-start-support-session',
    { organization_id: organizationId, reason },
  );

export const endSupportSession = (supportSessionId: string) =>
  invoke<{ status: 'ended' }>('admin-end-support-session', { support_session_id: supportSessionId });

export const exportOrganization = (organizationId: string) =>
  invoke<{ exported_at: string; counts: Record<string, number> } & Record<string, unknown>>('admin-export-organization', {
    organization_id: organizationId,
  });

export const purgeOrganization = (organizationId: string, confirmSlug: string) =>
  invoke<{ status: 'purged'; orphan_users: number }>('admin-purge-organization', {
    organization_id: organizationId,
    confirm_slug: confirmSlug,
  });
