import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Target, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';

interface LoginData {
  email: string;
  password: string;
}

export function Login() {
  const { t } = useTranslation();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginData>();
  const session = useAuthStore((s) => s.session);
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/';
  if (session) return <Navigate to={from} replace />;

  const onSubmit = async (data: LoginData) => {
    setError(false);
    const { error: authError } = await supabase.auth.signInWithPassword(data);
    // Messaggio unico per qualunque errore: nessuna enumerazione di email.
    if (authError) setError(true);
    else navigate(from, { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="w-14 h-14 bg-primary-600 rounded-xl flex items-center justify-center">
              <Target className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{t('app.name')}</h1>
          <p className="text-gray-500 mt-1">{t('auth.loginTitle')}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          {error && (
            <div role="alert" className="mb-4 p-3 bg-danger-50 border border-danger-100 text-danger-500 rounded-lg text-sm">
              {t('auth.genericError')}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">{t('auth.email')}</label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                {...register('email', { required: t('auth.emailRequired') })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors"
              />
              {errors.email && <p className="mt-1 text-sm text-danger-500">{errors.email.message}</p>}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">{t('auth.password')}</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  {...register('password', { required: t('auth.passwordRequired') })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label={t('auth.password')}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <p className="mt-1 text-sm text-danger-500">{errors.password.message}</p>}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {isSubmitting ? t('auth.loggingIn') : t('auth.login')}
            </button>
          </form>

          <p className="text-center text-sm mt-4">
            <Link to="/forgot-password" className="text-primary-600 hover:underline">{t('auth.forgot')}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
