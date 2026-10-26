// Involucro HTTP comune delle funzioni admin: CORS, metodo, JSON, Authorization, mappatura
// degli errori in `{ error: { code, message } }`. Modulo PURO (usa solo Request/Response
// standard): gli index.ts lo usano con Deno.serve, i test con Vitest.

import { corsHeaders, isOriginAllowed } from './cors.ts';
import { ApiError, errorBody, safeErrorTag } from './errors.ts';

export function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export function errorResponse(err: ApiError, headers: Record<string, string> = {}): Response {
  const h = { ...headers };
  if (err.code === 'rate_limited' && err.retryAfter !== undefined) {
    h['Retry-After'] = String(Math.max(1, Math.ceil(err.retryAfter)));
  }
  return jsonResponse(err.status, errorBody(err), h);
}

/** Token dall'header `Authorization: Bearer <jwt>`; null se assente o malformato. */
export function bearerToken(header: string | null | undefined): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(\S+)\s*$/i.exec(header);
  return m ? m[1] : null;
}

export interface HandlerContext {
  req: Request;
  /** Body JSON gia' decodificato (ancora da validare con Zod). */
  body: unknown;
  /** JWT del chiamante (senza "Bearer "). */
  token: string;
  /** Header Authorization originale, da inoltrare al client "come utente". */
  authorization: string;
}

export interface HandlerOptions {
  allowedOrigins: readonly string[];
  handle: (ctx: HandlerContext) => Promise<unknown>;
  /** Logger: riceve solo stringhe sicure (mai email, token, messaggi di errore grezzi). */
  log?: (line: string) => void;
  /** Nome della funzione, per i log. */
  name: string;
}

/**
 * Costruisce l'handler `(Request) => Response`:
 * - OPTIONS: 204 con gli header CORS (Allow-Origin solo per origini ammesse);
 * - richiesta con header Origin non ammesso: 403 (difesa in profondita', oltre al blocco del browser);
 * - solo POST, body JSON, Authorization Bearer obbligatorio (verify_jwt lo ha gia' verificato
 *   al gateway; qui serve il token per identificare il chiamante);
 * - ApiError -> risposta con il suo codice; qualunque altro errore -> 500 `internal` senza dettagli.
 */
export function createHandler(opts: HandlerOptions): (req: Request) => Promise<Response> {
  const log = opts.log ?? ((line: string) => console.error(line));
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get('Origin');
    const cors = corsHeaders(origin, opts.allowedOrigins);

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    try {
      if (origin && !isOriginAllowed(origin, opts.allowedOrigins)) {
        throw new ApiError('forbidden');
      }
      if (req.method !== 'POST') throw new ApiError('method_not_allowed');

      const authorization = req.headers.get('Authorization') ?? '';
      const token = bearerToken(authorization);
      if (!token) throw new ApiError('unauthorized');

      let body: unknown;
      try {
        body = await req.json();
      } catch {
        throw new ApiError('invalid_input', { message: 'Body JSON non valido.' });
      }

      const result = await opts.handle({ req, body, token, authorization });
      return jsonResponse(200, result, cors);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status >= 500) log(`${opts.name}: ${err.code}`);
        return errorResponse(err, cors);
      }
      log(`${opts.name}: unhandled ${safeErrorTag(err)}`);
      return errorResponse(new ApiError('internal'), cors);
    }
  };
}
