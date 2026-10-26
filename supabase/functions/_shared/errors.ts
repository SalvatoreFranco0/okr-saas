// Errori delle Edge Functions admin: codici stabili (il frontend li mappa su chiavi i18n in
// web/src/services/members.service.ts) e stato HTTP fisso per codice.
// Modulo PURO: nessun Deno.*, nessun import esterno.

export const ERROR_STATUS = {
  invalid_input: 400,
  invalid_reference: 400,
  unauthorized: 401,
  forbidden: 403,
  self_change: 403,
  not_found: 404,
  method_not_allowed: 405,
  already_member: 409,
  already_accepted: 409,
  last_admin: 409,
  slug_taken: 409,
  confirmation_mismatch: 409,
  export_required: 409,
  export_too_large: 413,
  rate_limited: 429,
  internal: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

/** Messaggi generici: non contengono mai dati dell'utente ne' dettagli interni (SQL, stack). */
const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  invalid_input: 'Dati non validi.',
  invalid_reference: 'Riferimento non valido (sede o utente inesistente o di un\'altra organizzazione).',
  unauthorized: 'Autenticazione richiesta.',
  forbidden: 'Operazione non consentita.',
  self_change: 'Non puoi modificare il tuo ruolo ne\' disattivare la tua membership.',
  not_found: 'Elemento non trovato.',
  method_not_allowed: 'Metodo non consentito.',
  already_member: 'L\'utente e\' gia\' membro attivo dell\'organizzazione.',
  already_accepted: 'L\'invito e\' gia\' stato accettato.',
  last_admin: 'L\'organizzazione deve avere almeno un Admin attivo.',
  slug_taken: 'Lo slug e\' gia\' usato da un\'altra organizzazione.',
  confirmation_mismatch: 'Lo slug di conferma non corrisponde a quello dell\'organizzazione.',
  export_required: 'Serve un export dell\'organizzazione nelle ultime 24 ore prima della cancellazione.',
  export_too_large: 'L\'organizzazione contiene troppi dati per un export in un\'unica risposta.',
  rate_limited: 'Troppe richieste: riprova piu\' tardi.',
  internal: 'Errore interno.',
};

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  /** Secondi per l'header Retry-After (solo rate_limited). */
  readonly retryAfter?: number;

  constructor(code: ErrorCode, opts: { message?: string; retryAfter?: number } = {}) {
    super(opts.message ?? DEFAULT_MESSAGES[code]);
    this.name = 'ApiError';
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.retryAfter = opts.retryAfter;
  }
}

export interface ErrorBody {
  error: { code: ErrorCode; message: string };
}

export function errorBody(err: ApiError): ErrorBody {
  // Per internal il messaggio e' sempre quello generico, qualunque cosa sia stata passata.
  const message = err.code === 'internal' ? DEFAULT_MESSAGES.internal : err.message;
  return { error: { code: err.code, message } };
}

/**
 * Descrizione sicura da loggare per un errore qualsiasi: solo nome, codice e stato, mai il
 * messaggio (puo' contenere email o valori dell'input) ne' token.
 */
export function safeErrorTag(err: unknown): string {
  if (err === null || typeof err !== 'object') return typeof err;
  const e = err as { name?: unknown; code?: unknown; status?: unknown };
  const parts: string[] = [];
  if (typeof e.name === 'string') parts.push(e.name);
  if (typeof e.code === 'string' || typeof e.code === 'number') parts.push(`code=${e.code}`);
  if (typeof e.status === 'number') parts.push(`status=${e.status}`);
  return parts.length > 0 ? parts.join(' ') : 'unknown_error';
}
