// Mappa gli errori di PostgREST/Postgres su chiavi i18n (sotto "errors.*"), senza esporre il testo del DB.

/** Update con `version` obsoleta: la riga è cambiata (o non è modificabile) e l'update non ha toccato nulla. */
export class ConflictError extends Error {
  constructor() {
    super('conflict');
    this.name = 'ConflictError';
  }
}

interface PgLikeError {
  code?: string;
  message?: string;
  hint?: string | null;
}

export function errorKey(err: unknown): string {
  if (err instanceof ConflictError) return 'errors.conflict';
  const e = err as PgLikeError | null;
  // Gli hint li impostano i trigger del database (migrazioni 0003 e 0004).
  switch (e?.hint) {
    case 'period_closed':
      return 'errors.periodClosed';
    case 'alignment_cycle':
      return 'errors.alignmentCycle';
    case 'last_admin':
      return 'errors.lastAdmin';
    default:
      break;
  }
  switch (e?.code) {
    case '42501':
      return 'errors.forbidden';
    case '40001':
    case 'PGRST116':
      return 'errors.conflict';
    case '23505':
      return 'errors.duplicate';
    case '23503':
      return 'errors.reference';
    case '22004':
      return 'errors.valueRequired';
    case '23514':
    case '22023':
      return 'errors.invalid';
    default:
      break;
  }
  if (e?.message && /failed to fetch|networkerror/i.test(e.message)) return 'errors.network';
  return 'errors.generic';
}

/** Ripulisce il testo di ricerca per i filtri PostgREST `.or()`: via separatori e caratteri jolly di LIKE. */
export function sanitizeSearch(input: string): string {
  return input.replace(/[,()"\\*%_]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
}
