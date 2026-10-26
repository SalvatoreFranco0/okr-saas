// Rate limit di inviti e reinvii: massimo 20 per (organizzazione, chiamante) nell'ultima ora,
// contando le righe di public.audit_logs con action in RATE_LIMITED_ACTIONS. Modulo PURO: la
// query la fa il runtime, qui solo la decisione.

import { ApiError } from './errors.ts';

export const RATE_LIMIT_MAX = 20;
export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
export const RATE_LIMITED_ACTIONS = ['admin.invite', 'admin.resend_invite'] as const;

/** Inizio della finestra (ISO) da usare in `created_at >= ...`. */
export function rateLimitWindowStart(now: Date, windowMs = RATE_LIMIT_WINDOW_MS): string {
  return new Date(now.getTime() - windowMs).toISOString();
}

export type RateLimitDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/**
 * @param recentCreatedAt created_at delle righe recenti (bastano le ultime `max`, in qualunque ordine).
 * Oltre il limite, Retry-After = quando la `max`-esima riga piu' recente esce dalla finestra
 * (da quel momento le righe nella finestra tornano sotto `max`).
 */
export function decideRateLimit(
  recentCreatedAt: readonly string[],
  now: Date,
  max = RATE_LIMIT_MAX,
  windowMs = RATE_LIMIT_WINDOW_MS,
): RateLimitDecision {
  const from = now.getTime() - windowMs;
  const times = recentCreatedAt
    .map((t) => Date.parse(t))
    .filter((t) => Number.isFinite(t) && t >= from)
    .sort((a, b) => b - a);
  if (times.length < max) return { allowed: true };
  const pivot = times[max - 1];
  const retryAfterSeconds = Math.max(1, Math.ceil((pivot + windowMs - now.getTime()) / 1000));
  return { allowed: false, retryAfterSeconds };
}

export function assertRateLimit(recentCreatedAt: readonly string[], now: Date): void {
  const d = decideRateLimit(recentCreatedAt, now);
  if (!d.allowed) throw new ApiError('rate_limited', { retryAfter: d.retryAfterSeconds });
}
