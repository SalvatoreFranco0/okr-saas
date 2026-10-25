// Regola del blocco MFA (solo UX). Logica pura, testata in mfaGate.test.ts.
//
// NOTA DI SICUREZZA: a livello aal1 il client NON può sapere con certezza se l'utente è super-admin,
// perché la policy `platform_admins_select` mostra la riga solo con aal2. `platformAdminHint`
// (app_metadata.platform_admin, scrivibile solo dal backend privilegiato) è soltanto un indizio
// per la UX. La barriera reale è la RLS: `private.is_platform_admin()` richiede aal2, quindi un
// super-admin senza TOTP verificato in questa sessione non ottiene alcun privilegio anche se
// aggirasse questo blocco nel browser.

export type Aal = 'aal1' | 'aal2';
export type MfaGateResult = 'ok' | 'verify' | 'enroll';

export interface MfaGateInput {
  aal: Aal | null;
  /** Livello raggiungibile con i fattori registrati: aal2 se esiste un TOTP verificato. */
  nextAal: Aal | null;
  platformAdminHint: boolean;
  isPlatformAdmin: boolean;
}

/**
 * - 'ok': nessun blocco.
 * - 'verify': esiste un TOTP verificato ma la sessione non è aal2 → chiedere il codice.
 * - 'enroll': super-admin (indizio o certezza) senza alcun TOTP verificato → obbligare l'attivazione.
 */
export function mfaGate({ aal, nextAal, platformAdminHint, isPlatformAdmin }: MfaGateInput): MfaGateResult {
  if (aal === 'aal2') return 'ok';
  if (nextAal === 'aal2') return 'verify';
  if (platformAdminHint || isPlatformAdmin) return 'enroll';
  return 'ok';
}
