import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';

export function ForgotPassword() {
  const { t } = useTranslation();
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<{ email: string }>();
  const [sent, setSent] = useState(false);

  const onSubmit = async ({ email }: { email: string }) => {
    // Esito ignorato: la risposta è sempre la stessa, per non rivelare quali email esistono.
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/set-password` });
    setSent(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h1 className="text-xl font-bold text-gray-900 mb-2">{t('auth.forgotTitle')}</h1>
        {sent ? (
          <p role="status" className="text-sm text-gray-600">{t('auth.linkSent')}</p>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <p className="text-sm text-gray-600">{t('auth.forgotText')}</p>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">{t('auth.email')}</label>
              <input
                id="email"
                type="email"
                required
                {...register('email', { required: true })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50"
            >
              {t('auth.sendLink')}
            </button>
          </form>
        )}
        <p className="text-center text-sm mt-4">
          <Link to="/login" className="text-primary-600 hover:underline">{t('auth.backToLogin')}</Link>
        </p>
      </div>
    </div>
  );
}
