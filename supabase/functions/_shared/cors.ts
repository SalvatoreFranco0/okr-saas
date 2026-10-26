// CORS delle Edge Functions admin: solo le origini elencate nel secret ALLOWED_ORIGINS
// (separate da virgole). Mai '*'. Modulo PURO.

const ALLOWED_HEADERS = 'authorization, x-client-info, apikey, content-type';
const ALLOWED_METHODS = 'POST, OPTIONS';

function normalizeOrigin(o: string): string {
  return o.trim().replace(/\/+$/, '').toLowerCase();
}

/** Elenco delle origini ammesse. Voci vuote e '*' vengono scartate: con secret assente nessuna origine e' ammessa. */
export function parseAllowedOrigins(raw: string | undefined | null): string[] {
  if (!raw) return [];
  const out = new Set<string>();
  for (const part of raw.split(',')) {
    const o = normalizeOrigin(part);
    if (o === '' || o.includes('*') || o === 'null') continue;
    out.add(o);
  }
  return [...out];
}

export function isOriginAllowed(origin: string | null | undefined, allowed: readonly string[]): boolean {
  if (!origin) return false;
  return allowed.includes(normalizeOrigin(origin));
}

/**
 * Header CORS per la risposta. Con origine ammessa: Allow-Origin = l'origine della richiesta
 * (mai '*'). Con origine non ammessa o assente: nessun Allow-Origin (il browser blocca).
 * Vary: Origin sempre, perche' la risposta dipende dall'origine.
 */
export function corsHeaders(origin: string | null | undefined, allowed: readonly string[]): Record<string, string> {
  const headers: Record<string, string> = { Vary: 'Origin' };
  if (origin && isOriginAllowed(origin, allowed)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Headers'] = ALLOWED_HEADERS;
    headers['Access-Control-Allow-Methods'] = ALLOWED_METHODS;
    headers['Access-Control-Max-Age'] = '86400';
  }
  return headers;
}
