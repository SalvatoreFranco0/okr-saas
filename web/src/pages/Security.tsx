import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck, ShieldOff, ArrowLeft, LogOut } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { mfaGate } from '../lib/mfaGate';
import { ConfirmDialog } from '../components/ConfirmDialog';

const SVG_PREFIX = 'data:image/svg+xml;utf-8,';

/**
 * supabase-js restituisce il QR come `data:image/svg+xml;utf-8,<svg ...>` non codificato.
 * Lo ricodifichiamo con encodeURIComponent (caratteri come `#` romperebbero l'URI) e lo usiamo
 * SOLO come `src` di un <img>: l'SVG non entra mai nel DOM (niente innerHTML), quindi
 * eventuali script al suo interno non vengono eseguiti. Richiede `img-src data:` nella CSP.
 */
function qrSrc(qr: string): string | null {
  if (qr.startsWith(SVG_PREFIX)) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr.slice(SVG_PREFIX.length))}`;
  if (qr.startsWith('<svg')) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}`;
  return null;
}

/** Ricarica authStore (aal, nextAal, isPlatformAdmin) dopo un cambio dei fattori o della sessione. */
async function reloadAuth() {
  await useAuthStore.getState().reload();
}

function useFactors(userId: string | undefined) {
  return useQuery({
    queryKey: ['mfa-factors', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      return data;
    },
  });
}

function CodeForm({ busy, error, onSubmit }: { busy: boolean; error: string | null; onSubmit: (code: string) => void }) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const valid = /^\d{6}$/.test(code);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (valid && !busy) onSubmit(code);
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <label htmlFor="totp-code" className="block text-sm font-medium text-gray-700">{t('security.code')}</label>
      <input
        id="totp-code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        className="w-40 px-3 py-2 border border-gray-300 rounded-lg tracking-widest text-center focus:ring-2 focus:ring-primary-500 outline-none"
      />
      {error && <p role="alert" className="text-sm text-danger-500">{error}</p>}
      <div>
        <button
          type="submit"
          disabled={!valid || busy}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
        >
          {busy ? t('app.loading') : t('security.verify')}
        </button>
      </div>
    </form>
  );
}

/** Verifica del codice per un TOTP già attivo (porta la sessione da aal1 ad aal2). */
function VerifyTotp({ factorId }: { factorId: string }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verify = async (code: string) => {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    if (err) {
      setError(t('security.invalidCode'));
      setBusy(false);
      return;
    }
    // verify salva già una sessione aal2; reload aggiorna aal/isPlatformAdmin nello store.
    await reloadAuth();
    setBusy(false);
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">{t('security.verifyText')}</p>
      <CodeForm busy={busy} error={error} onSubmit={(c) => void verify(c)} />
    </div>
  );
}

interface Enrollment {
  factorId: string;
  qr: string | null;
  secret: string;
}

/** Attivazione di un nuovo TOTP: enroll → QR/chiave → challenge+verify. */
function EnrollTotp({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
  const { t } = useTranslation();
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      // Rimuove i fattori rimasti a metà (enroll senza verify) prima di crearne uno nuovo.
      const { data: list, error: listErr } = await supabase.auth.mfa.listFactors();
      if (listErr) throw listErr;
      for (const f of list.all.filter((x) => x.status === 'unverified')) {
        const { error: unErr } = await supabase.auth.mfa.unenroll({ factorId: f.id });
        if (unErr) throw unErr;
      }
      const { data, error: enrollErr } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
      if (enrollErr) throw enrollErr;
      setEnrollment({ factorId: data.id, qr: qrSrc(data.totp.qr_code), secret: data.totp.secret });
    } catch {
      setError(t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (code: string) => {
    if (!enrollment) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrollment.factorId, code });
    if (err) {
      setError(t('security.invalidCode'));
      setBusy(false);
      return;
    }
    await reloadAuth();
    setBusy(false);
    setEnrollment(null);
    onDone();
  };

  const cancel = async () => {
    if (enrollment) await supabase.auth.mfa.unenroll({ factorId: enrollment.factorId }); // best effort
    setEnrollment(null);
    onCancel?.();
  };

  if (!enrollment) {
    return (
      <div className="space-y-3">
        {error && <p role="alert" className="text-sm text-danger-500">{error}</p>}
        <button
          type="button"
          onClick={() => void start()}
          disabled={busy}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
        >
          {busy ? t('app.loading') : t('security.enable')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">{t('security.scanQr')}</p>
      {enrollment.qr && (
        <img src={enrollment.qr} alt={t('security.qrAlt')} width={192} height={192} className="w-48 h-48 border border-gray-200 rounded-lg bg-white" />
      )}
      <div>
        <label htmlFor="totp-secret" className="block text-sm text-gray-600 mb-1">{t('security.secretLabel')}</label>
        <input
          id="totp-secret"
          readOnly
          value={enrollment.secret}
          onFocus={(e) => e.currentTarget.select()}
          autoComplete="off"
          spellCheck={false}
          className="w-full max-w-sm px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm bg-gray-50"
        />
      </div>
      <CodeForm busy={busy} error={error} onSubmit={(c) => void verify(c)} />
      <button type="button" onClick={() => void cancel()} className="text-sm text-gray-500 hover:underline">
        {t('app.cancel')}
      </button>
    </div>
  );
}

/**
 * Pagina Sicurezza. Usata anche dal blocco MFA di ProtectedRoute: quando il gate è attivo mostra
 * solo la verifica del codice (TOTP già attivo) o l'attivazione obbligatoria, più "Esci".
 */
export function Security() {
  const { t } = useTranslation();
  const userId = useAuthStore((s) => s.session?.user.id);
  const aal = useAuthStore((s) => s.aal);
  const nextAal = useAuthStore((s) => s.nextAal);
  const platformAdminHint = useAuthStore((s) => s.platformAdminHint);
  const isPlatformAdmin = useAuthStore((s) => s.isPlatformAdmin);
  const signOut = useAuthStore((s) => s.signOut);
  const gate = mfaGate({ aal, nextAal, platformAdminHint, isPlatformAdmin });

  const factors = useFactors(userId);
  const verified = factors.data?.totp ?? [];
  const [enrolling, setEnrolling] = useState(false);
  const [toRemove, setToRemove] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  // Solo UX: anche se aggirato, un super-admin senza aal2 non ha privilegi (RLS).
  const removeBlocked = platformAdminHint || isPlatformAdmin;

  const refresh = async () => {
    await reloadAuth();
    await factors.refetch();
  };

  const remove = async () => {
    if (!toRemove) return;
    setRemoving(true);
    setRemoveError(null);
    const { error } = await supabase.auth.mfa.unenroll({ factorId: toRemove });
    if (error) {
      setRemoveError(t('errors.generic'));
    } else {
      // Il JWT conserva aal2 finché non viene rinnovato: refresh per riallineare aal/nextAal.
      await supabase.auth.refreshSession();
      await refresh();
    }
    setRemoving(false);
    setToRemove(null);
  };

  let body;
  if (factors.isLoading) {
    body = <p className="text-sm text-gray-500">{t('app.loading')}</p>;
  } else if (factors.isError) {
    body = <p role="alert" className="text-sm text-danger-500">{t('errors.generic')}</p>;
  } else if (gate === 'verify') {
    body = verified[0] ? <VerifyTotp factorId={verified[0].id} /> : <p className="text-sm text-danger-500">{t('errors.generic')}</p>;
  } else if (gate === 'enroll') {
    body = <EnrollTotp onDone={() => void refresh()} />;
  } else if (verified.length > 0) {
    body = (
      <div className="space-y-3">
        <p className="flex items-center gap-2 text-sm font-medium text-success-600">
          <ShieldCheck className="w-5 h-5" /> {t('security.statusLabel')} {t('security.enabled')}
        </p>
        {removeError && <p role="alert" className="text-sm text-danger-500">{removeError}</p>}
        {removeBlocked ? (
          <p className="text-sm text-gray-600">{t('security.removeBlocked')}</p>
        ) : (
          <button
            type="button"
            onClick={() => setToRemove(verified[0].id)}
            className="px-4 py-2 border border-danger-500 text-danger-600 rounded-lg text-sm font-medium hover:bg-danger-50"
          >
            {t('security.remove')}
          </button>
        )}
      </div>
    );
  } else {
    body = (
      <div className="space-y-3">
        <p className="flex items-center gap-2 text-sm font-medium text-gray-600">
          <ShieldOff className="w-5 h-5" /> {t('security.statusLabel')} {t('security.disabled')}
        </p>
        {enrolling ? (
          <EnrollTotp onDone={() => { setEnrolling(false); void refresh(); }} onCancel={() => setEnrolling(false)} />
        ) : (
          <button
            type="button"
            onClick={() => setEnrolling(true)}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
          >
            {t('security.enable')}
          </button>
        )}
      </div>
    );
  }

  const gated = gate !== 'ok';

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-xl mx-auto space-y-4">
        {!gated && (
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-primary-600 hover:underline">
            <ArrowLeft className="w-4 h-4" /> {t('security.backToApp')}
          </Link>
        )}
        <h1 className="text-2xl font-bold text-gray-900">{gated ? t('security.mfaRequiredTitle') : t('security.title')}</h1>
        {gated && (
          <p className="text-sm text-gray-600">
            {gate === 'enroll' ? t('security.enrollRequiredText') : t('security.mfaRequiredText')}
          </p>
        )}
        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">{t('security.mfaTitle')}</h2>
          <p className="text-sm text-gray-600">{t('security.mfaIntro')}</p>
          {body}
        </section>
        {gated && (
          <button
            type="button"
            onClick={() => void signOut()}
            className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
          >
            <LogOut className="w-4 h-4" /> {t('nav.logout')}
          </button>
        )}
      </div>

      <ConfirmDialog
        isOpen={toRemove !== null}
        title={t('security.removeConfirmTitle')}
        message={t('security.removeConfirmText')}
        confirmText={t('security.remove')}
        cancelText={t('app.cancel')}
        isLoading={removing}
        onConfirm={() => void remove()}
        onCancel={() => setToRemove(null)}
      />
    </div>
  );
}
