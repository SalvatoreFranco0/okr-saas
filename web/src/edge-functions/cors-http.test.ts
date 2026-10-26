import { describe, expect, it, vi } from 'vitest';
import { corsHeaders, isOriginAllowed, parseAllowedOrigins } from '../../../supabase/functions/_shared/cors.ts';
import { ApiError } from '../../../supabase/functions/_shared/errors.ts';
import { bearerToken, createHandler } from '../../../supabase/functions/_shared/http.ts';

const ALLOWED = parseAllowedOrigins('https://app.example.com, http://localhost:5173/ ,,*');

describe('parseAllowedOrigins', () => {
  it('scarta voci vuote e jolly, normalizza slash finale e maiuscole', () => {
    expect(ALLOWED).toEqual(['https://app.example.com', 'http://localhost:5173']);
    expect(parseAllowedOrigins('HTTPS://App.Example.com/')).toEqual(['https://app.example.com']);
  });
  it('secret assente o solo "*" = nessuna origine', () => {
    expect(parseAllowedOrigins(undefined)).toEqual([]);
    expect(parseAllowedOrigins('')).toEqual([]);
    expect(parseAllowedOrigins('*')).toEqual([]);
    expect(parseAllowedOrigins('https://*.example.com')).toEqual([]);
  });
});

describe('corsHeaders', () => {
  it('origine ammessa: Allow-Origin uguale all\'origine, mai "*"', () => {
    const h = corsHeaders('https://app.example.com', ALLOWED);
    expect(h['Access-Control-Allow-Origin']).toBe('https://app.example.com');
    expect(h['Access-Control-Allow-Methods']).toBe('POST, OPTIONS');
    expect(h['Access-Control-Allow-Headers']).toContain('authorization');
    expect(h.Vary).toBe('Origin');
  });
  it('origine non ammessa o assente: nessun Allow-Origin', () => {
    for (const o of ['https://evil.example.com', 'https://app.example.com.evil.io', 'null', null, undefined]) {
      const h = corsHeaders(o, ALLOWED);
      expect(h['Access-Control-Allow-Origin']).toBeUndefined();
      expect(h.Vary).toBe('Origin');
    }
  });
  it('mai "*" in nessun header, nemmeno con "*" nel secret', () => {
    const h = corsHeaders('https://x.example.com', parseAllowedOrigins('*'));
    expect(Object.values(h)).not.toContain('*');
    expect(isOriginAllowed('https://x.example.com', parseAllowedOrigins('*'))).toBe(false);
  });
});

describe('bearerToken', () => {
  it('estrae il token solo da "Bearer <token>"', () => {
    expect(bearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
    expect(bearerToken('bearer abc')).toBe('abc');
    expect(bearerToken('Basic abc')).toBeNull();
    expect(bearerToken('Bearer ')).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });
});

describe('createHandler', () => {
  const ok = createHandler({
    name: 't',
    allowedOrigins: ALLOWED,
    log: () => {},
    handle: async ({ body, token }) => ({ echo: body, token }),
  });
  const post = (init: { origin?: string; auth?: string | null; body?: string; method?: string }) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (init.origin) headers.Origin = init.origin;
    if (init.auth !== null) headers.Authorization = init.auth ?? 'Bearer tok';
    return new Request('https://fn.example.com/t', {
      method: init.method ?? 'POST',
      headers,
      body: init.method === 'OPTIONS' || init.method === 'GET' ? undefined : (init.body ?? '{"a":1}'),
    });
  };

  it('OPTIONS da origine ammessa: 204 con Allow-Origin', async () => {
    const res = await ok(post({ method: 'OPTIONS', origin: 'https://app.example.com' }));
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com');
  });
  it('OPTIONS da origine non ammessa: nessun Allow-Origin', async () => {
    const res = await ok(post({ method: 'OPTIONS', origin: 'https://evil.example.com' }));
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
  it('POST valido: 200 JSON con header CORS', async () => {
    const res = await ok(post({ origin: 'https://app.example.com' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com');
    expect(await res.json()).toEqual({ echo: { a: 1 }, token: 'tok' });
  });
  it('origine non ammessa: 403 forbidden', async () => {
    const res = await ok(post({ origin: 'https://evil.example.com' }));
    expect(res.status).toBe(403);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(await res.json()).toEqual({ error: { code: 'forbidden', message: expect.any(String) } });
  });
  it('senza Authorization: 401 unauthorized', async () => {
    const res = await ok(post({ auth: null }));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe('unauthorized');
  });
  it('metodo diverso da POST: 405', async () => {
    const res = await ok(post({ method: 'GET' }));
    expect(res.status).toBe(405);
  });
  it('body non JSON: 400 invalid_input', async () => {
    const res = await ok(post({ body: 'non json' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('invalid_input');
  });
  it('rate_limited: 429 con Retry-After', async () => {
    const h = createHandler({
      name: 't', allowedOrigins: ALLOWED, log: () => {},
      handle: async () => { throw new ApiError('rate_limited', { retryAfter: 120.2 }); },
    });
    const res = await h(post({}));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('121');
  });
  it('errore inatteso: 500 internal senza dettagli, log senza messaggio', async () => {
    const log = vi.fn();
    const h = createHandler({
      name: 't', allowedOrigins: ALLOWED, log,
      handle: async () => { throw Object.assign(new Error('mario.rossi@example.com secret-token'), { code: 'XX000' }); },
    });
    const res = await h(post({}));
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain('mario.rossi');
    expect(JSON.parse(text)).toEqual({ error: { code: 'internal', message: 'Errore interno.' } });
    const logged = log.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).not.toContain('@');
    expect(logged).not.toContain('secret-token');
  });
  it('ApiError internal con messaggio custom: il messaggio non esce', async () => {
    const h = createHandler({
      name: 't', allowedOrigins: ALLOWED, log: () => {},
      handle: async () => { throw new ApiError('internal', { message: 'dettaglio SQL' }); },
    });
    const res = await h(post({}));
    expect((await res.json()).error.message).toBe('Errore interno.');
  });
});
