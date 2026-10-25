import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';

/** Raggiunta dai link di invito e di recupero: supabase-js crea la sessione dal link, qui si sceglie la password. */
export function SetPassword() {
  const { t } = useTranslation();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<{ password: string }>();
  const status = useAuthStore((s) => s.status);
  const session = useAuthStore((s) => s.session);
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);

  const onSubmit = async ({ password }: { password: string }) => {
    setFailed(false);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) setFailed(true);
    else navigate('/', { replace: true });
  };

  if (status === 'ready' && !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md bg-white rounded-xl border border-gray-200 p-6 text-center">
          <p className="text-sm text-gray-600 mb-4">{t('auth.invalidLink')}</p>
          <Link to="/forgot-password" className="text-primary-600 hover:underline text-sm">{t('auth.forgotTitle')}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h1 className="text-xl font-bold text-gray-900 mb-1">{t('auth.setPasswordTitle')}</h1>
        <p className="text-sm text-gray-600 mb-4">{t('auth.setPasswordText')}</p>
        {failed && <p role="alert" className="mb-3 text-sm text-danger-500">{t('errors.generic')}</p>}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">{t('auth.newPassword')}</label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              {...register('password', { required: true, minLength: { value: 12, message: t('auth.passwordMin') } })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
            />
            {errors.password && <p className="mt-1 text-sm text-danger-500">{errors.password.message || t('auth.passwordRequired')}</p>}
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50"
          >
            {t('app.save')}
          </button>
        </form>
      </div>
    </div>
  );
}
