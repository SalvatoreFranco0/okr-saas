// Decisione "il chiamante e' Admin attivo dell'organizzazione indicata". Modulo PURO.
// Le righe arrivano da una select su memberships fatta col client "come utente": la RLS
// (incluso il requisito aal2 della 0009) decide gia' cosa e' visibile, quindi nessuna riga
// visibile = 403. Qui si ricontrollano comunque org, utente, stato e ruolo, per non dipendere
// dai filtri della query.

import { ApiError } from './errors.ts';

export interface MembershipRow {
  organization_id: string;
  user_id: string;
  role: string;
  is_active: boolean;
}

export function isActiveOrgAdmin(
  rows: readonly MembershipRow[] | null | undefined,
  organizationId: string,
  callerId: string,
): boolean {
  if (!rows) return false;
  const org = organizationId.toLowerCase();
  const me = callerId.toLowerCase();
  return rows.some(
    (r) =>
      r.organization_id.toLowerCase() === org &&
      r.user_id.toLowerCase() === me &&
      r.is_active === true &&
      r.role === 'admin',
  );
}

export function assertActiveOrgAdmin(
  rows: readonly MembershipRow[] | null | undefined,
  organizationId: string,
  callerId: string,
): void {
  if (!isActiveOrgAdmin(rows, organizationId, callerId)) throw new ApiError('forbidden');
}
