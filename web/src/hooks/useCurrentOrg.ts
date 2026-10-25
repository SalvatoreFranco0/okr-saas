import { useParams } from 'react-router-dom';
import { useAuthStore, type OrgMembership, type OrgRole } from '../stores/authStore';

export const CAN_WRITE_OKR: OrgRole[] = ['admin', 'manager_okr', 'team_lead'];

/** Organizzazione attiva, ricavata dallo slug nell'URL (mai da uno stato globale). */
export function useCurrentOrg(): { org: OrgMembership | null; role: OrgRole | null } {
  const { orgSlug } = useParams();
  const org = useAuthStore((s) => s.orgs.find((o) => o.slug === orgSlug)) ?? null;
  return { org, role: org?.role ?? null };
}
