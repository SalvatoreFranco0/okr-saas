import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../stores/authStore';
import { useCurrentOrg } from './useCurrentOrg';
import { getMyScope } from '../services/lookups.service';
import type { MyAccess } from '../lib/permissions';

/** Ruolo, sedi e team dell'utente nell'organizzazione corrente. `ready` è false finché le sedi non sono note. */
export function useMyAccess(): { access: MyAccess; ready: boolean } {
  const { org, role } = useCurrentOrg();
  const userId = useAuthStore((s) => s.session?.user.id ?? '');
  const needsScope = role === 'team_lead';
  const q = useQuery({
    queryKey: ['my-scope', org?.id, userId],
    queryFn: () => getMyScope(org!.id, userId),
    enabled: !!org && !!userId && needsScope,
  });
  return {
    access: { role, userId, locationIds: q.data?.locationIds ?? [], teamIds: q.data?.teamIds ?? [] },
    ready: !needsScope || q.isSuccess,
  };
}
