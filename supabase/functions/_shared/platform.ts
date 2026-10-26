// Decisioni delle funzioni di piattaforma (super-admin): verifica del super-admin, sessioni di
// supporto, periodo iniziale di una nuova organizzazione, errori Postgres. Modulo PURO.

import { ApiError } from './errors.ts';

// ---------------------------------------------------------------------------
// Super-admin
// ---------------------------------------------------------------------------

/**
 * Righe di platform_admins lette col client del CHIAMANTE: la RLS (0005) le mostra solo a un
 * super-admin con JWT aal2, quindi nessuna riga = non super-admin o MFA non verificata.
 * Si ricontrolla comunque che la riga sia del chiamante.
 */
export function isPlatformAdminRow(rows: readonly { user_id: string }[] | null | undefined, callerId: string): boolean {
  if (!rows) return false;
  const me = callerId.toLowerCase();
  return rows.some((r) => typeof r.user_id === 'string' && r.user_id.toLowerCase() === me);
}

export function assertPlatformAdmin(rows: readonly { user_id: string }[] | null | undefined, callerId: string): void {
  if (!isPlatformAdminRow(rows, callerId)) throw new ApiError('forbidden');
}

// ---------------------------------------------------------------------------
// Sessioni di supporto
// ---------------------------------------------------------------------------

export interface SupportSessionRow {
  id: string;
  platform_admin_id: string;
  organization_id: string;
  started_at: string;
  expires_at: string;
  ended_at: string | null;
}

/** Stesso criterio di private.my_access(): non chiusa, iniziata, non scaduta. */
export function isActiveSupportSession(
  row: SupportSessionRow,
  platformAdminId: string,
  organizationId: string,
  now: Date,
): boolean {
  const started = Date.parse(row.started_at);
  const expires = Date.parse(row.expires_at);
  const t = now.getTime();
  return (
    row.platform_admin_id.toLowerCase() === platformAdminId.toLowerCase() &&
    row.organization_id.toLowerCase() === organizationId.toLowerCase() &&
    row.ended_at === null &&
    Number.isFinite(started) &&
    Number.isFinite(expires) &&
    started <= t &&
    t < expires
  );
}

/** La sessione attiva con la scadenza piu' lontana, o null. */
export function pickActiveSupportSession(
  rows: readonly SupportSessionRow[] | null | undefined,
  platformAdminId: string,
  organizationId: string,
  now: Date,
): SupportSessionRow | null {
  if (!rows) return null;
  const active = rows.filter((r) => isActiveSupportSession(r, platformAdminId, organizationId, now));
  if (active.length === 0) return null;
  return active.reduce((a, b) => (Date.parse(b.expires_at) > Date.parse(a.expires_at) ? b : a));
}

/** started_at = now, expires_at = now + durata (il DB vincola a 4 ore). */
export function supportSessionWindow(now: Date, durationMinutes: number): { started_at: string; expires_at: string } {
  return {
    started_at: now.toISOString(),
    expires_at: new Date(now.getTime() + durationMinutes * 60_000).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Periodo iniziale di una nuova organizzazione
// ---------------------------------------------------------------------------

export interface PeriodDraft {
  name: string;
  start_date: string;
  end_date: string;
}

function isoDate(year: number, monthIndex: number, day: number): string {
  return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);
}

/**
 * Trimestre solare che contiene `now` (in UTC), nel formato del seed: "Q4 2026",
 * 2026-10-01 .. 2026-12-31.
 */
export function quarterPeriod(now: Date): PeriodDraft {
  const year = now.getUTCFullYear();
  const q = Math.floor(now.getUTCMonth() / 3); // 0..3
  return {
    name: `Q${q + 1} ${year}`,
    start_date: isoDate(year, q * 3, 1),
    // Giorno 0 del primo mese del trimestre successivo = ultimo giorno del trimestre.
    end_date: isoDate(year, q * 3 + 3, 0),
  };
}

// ---------------------------------------------------------------------------
// Errori Postgres
// ---------------------------------------------------------------------------

/** 23505 = unique_violation (es. organizations.slug gia' usato). */
export function isUniqueViolation(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && (err as { code?: unknown }).code === '23505');
}
