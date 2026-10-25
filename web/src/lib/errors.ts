// Mappa gli errori di PostgREST/Postgres su chiavi i18n (sotto "errors.*"), senza esporre il testo del DB.
export function errorKey(err: unknown): string {
  const e = err as { code?: string; message?: string } | null;
  switch (e?.code) {
    case '42501':
      return 'errors.forbidden';
    case '40001':
    case 'PGRST116':
      return 'errors.conflict';
    default:
      break;
  }
  if (e?.message && /failed to fetch|networkerror/i.test(e.message)) return 'errors.network';
  return 'errors.generic';
}
