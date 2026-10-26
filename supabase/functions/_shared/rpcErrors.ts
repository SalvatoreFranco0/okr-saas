// Mappa gli errori di public.admin_apply_member (migrazione 0011) sui codici delle funzioni.
// Modulo PURO.
//   hint self_change (42501)          -> 403 self_change
//   hint last_admin  (P0001, trigger) -> 409 last_admin
//   P0002 (org inesistente/disattivata) -> 404 not_found
//   23503 (sede/utente non valido)    -> 400 invalid_reference
//   qualunque altro                   -> 500 internal (nessun dettaglio esposto)

import { ApiError } from './errors.ts';

export interface PgLikeError {
  code?: string | null;
  hint?: string | null;
  message?: string | null;
}

export function mapApplyMemberError(err: PgLikeError | null | undefined): ApiError {
  switch (err?.hint) {
    case 'self_change':
      return new ApiError('self_change');
    case 'last_admin':
      return new ApiError('last_admin');
    default:
      break;
  }
  switch (err?.code) {
    case 'P0002':
      return new ApiError('not_found');
    case '23503':
      return new ApiError('invalid_reference');
    default:
      return new ApiError('internal');
  }
}
