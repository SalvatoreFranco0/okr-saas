// Logica pura di invito e reinvio. Modulo PURO.

import { ApiError } from './errors.ts';

export type InviteBranch =
  | { kind: 'invite_new' }
  | { kind: 'add'; userId: string }
  | { kind: 'reactivate'; userId: string }
  | { kind: 'already_member'; userId: string };

/**
 * @param existingUserId id dell'utente con quella email (da public.profiles), null se non registrato.
 * @param membership membership dell'utente nell'organizzazione, null se non esiste.
 * Un utente registrato non riceve mai inviteUserByEmail (fallirebbe): solo membership + sedi.
 */
export function decideInviteBranch(
  existingUserId: string | null,
  membership: { is_active: boolean } | null,
): InviteBranch {
  if (!existingUserId) return { kind: 'invite_new' };
  if (!membership) return { kind: 'add', userId: existingUserId };
  if (membership.is_active) return { kind: 'already_member', userId: existingUserId };
  return { kind: 'reactivate', userId: existingUserId };
}

export function inviteStatus(branch: InviteBranch): 'invited' | 'added' | 'reactivated' {
  switch (branch.kind) {
    case 'invite_new':
      return 'invited';
    case 'add':
      return 'added';
    case 'reactivate':
      return 'reactivated';
    case 'already_member':
      throw new ApiError('already_member');
  }
}

/** Campi di auth.users rilevanti (User di supabase-js). */
export interface AuthUserLike {
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
  last_sign_in_at?: string | null;
}

/** Invito accettato = email confermata o almeno un login. */
export function isInviteAccepted(user: AuthUserLike): boolean {
  return Boolean(user.email_confirmed_at || user.confirmed_at || user.last_sign_in_at);
}

interface AuthErrorLike {
  code?: unknown;
  status?: unknown;
  message?: unknown;
}

/** inviteUserByEmail fallito perche' l'email e' gia' registrata (es. corsa con un'altra richiesta). */
export function isEmailExistsError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as AuthErrorLike;
  if (e.code === 'email_exists' || e.code === 'user_already_exists') return true;
  return (
    (e.status === 422 || e.status === 400) &&
    typeof e.message === 'string' &&
    /already (been )?registered|already exists/i.test(e.message)
  );
}

/** Limite di invio email di Supabase Auth (SMTP) superato. */
export function isAuthRateLimitError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as AuthErrorLike;
  return e.status === 429 || e.code === 'over_email_send_rate_limit';
}

/**
 * URL di redirect dell'email di invito: SITE_URL + '/set-password'. SITE_URL deve essere un
 * URL http(s) assoluto; altrimenti e' un errore di configurazione (500 internal).
 */
export function setPasswordRedirect(siteUrl: string | undefined | null): string {
  if (!siteUrl) throw new ApiError('internal');
  let u: URL;
  try {
    u = new URL(siteUrl.trim());
  } catch {
    throw new ApiError('internal');
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new ApiError('internal');
  return `${u.origin}${u.pathname.replace(/\/+$/, '')}/set-password`;
}
