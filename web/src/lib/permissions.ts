// Permessi lato interfaccia (matrice 5.6). Servono solo a mostrare o nascondere i pulsanti:
// la barriera reale è la RLS. Le regole replicano private.tl_can_write_okr / can_edit_okr.
import type { OrgRole } from '../stores/authStore';

export interface MyAccess {
  role: OrgRole | null;
  userId: string;
  locationIds: string[];
  teamIds: string[];
}

export interface OkrScope {
  owner_id: string;
  team_id: string | null;
  location_id: string | null;
  deleted_at: string | null;
}

const isAdminLike = (role: OrgRole | null) => role === 'admin' || role === 'manager_okr';

/** Può vedere l'archivio degli eliminati e ripristinare/eliminare (soft delete). */
export function canManageArchive(a: MyAccess): boolean {
  return isAdminLike(a.role);
}

/** Admin/Manager sempre; il Team Lead solo se ha almeno una sede (la creazione la richiede). */
export function canCreateOkr(a: MyAccess): boolean {
  return isAdminLike(a.role) || (a.role === 'team_lead' && a.locationIds.length > 0);
}

/**
 * Modifica di OKR, KR, Azioni e Allineamenti dell'OKR. Admin/Manager sempre (anche in periodo chiuso);
 * il Team Lead solo su OKR non eliminati, in periodo aperto, con sede tra le proprie e
 * (owner = lui oppure team tra i propri). Gli OKR senza sede non sono suoi. Viewer mai.
 */
export function canEditOkr(a: MyAccess, okr: OkrScope, periodClosed: boolean): boolean {
  if (isAdminLike(a.role)) return true;
  if (a.role !== 'team_lead') return false;
  if (periodClosed || okr.deleted_at) return false;
  if (!okr.location_id || !a.locationIds.includes(okr.location_id)) return false;
  return okr.owner_id === a.userId || (okr.team_id !== null && a.teamIds.includes(okr.team_id));
}

/** Eliminazione (soft) e ripristino: solo Admin/Manager. */
export function canDeleteOkr(a: MyAccess): boolean {
  return isAdminLike(a.role);
}

/** Banner di sola lettura: periodo chiuso e l'utente non è Admin/Manager. */
export function isReadOnlyBecauseClosed(a: MyAccess, periodClosed: boolean): boolean {
  return periodClosed && !isAdminLike(a.role);
}

// --- Amministrazione (Fase 7). Solo UX: le scritture le decide la RLS o le Edge Functions. ---
export type AdminSection = 'periods' | 'locations' | 'teams' | 'users';

/** Periodi e team: Admin e Manager. Sedi e utenti: solo Admin (policy RLS 0005 e Edge Functions). */
export function canManageSection(role: OrgRole | null, section: AdminSection): boolean {
  if (section === 'periods' || section === 'teams') return isAdminLike(role);
  return role === 'admin';
}
