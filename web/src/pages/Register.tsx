import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { authService } from '../services/auth.service';
import type { RegisterData } from '../services/auth.service';
import { Target } from 'lucide-react';

export function Register() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<RegisterData>();
  const { login } = useAuthStore();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  const onSubmit = async (data: RegisterData) => {
    try {
      setError('');
      const res = await authService.register(data);
      login(res.data.user, res.data.accessToken);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Errore di registrazione');
    }
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
          <h1 className="text-2xl font-bold text-gray-900">Crea Account</h1>
          <p className="text-gray-500 mt-1">Registrati per accedere al sistema OKR</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          {error && (
            <div className="mb-4 p-3 bg-danger-50 border border-danger-100 text-danger-500 rounded-lg text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                <input
                  {...register('firstName', { required: 'Obbligatorio' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                />
                {errors.firstName && <p className="mt-1 text-xs text-danger-500">{errors.firstName.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cognome</label>
                <input
                  {...register('lastName', { required: 'Obbligatorio' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                />
                {errors.lastName && <p className="mt-1 text-xs text-danger-500">{errors.lastName.message}</p>}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                {...register('email', { required: 'Email obbligatoria' })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              />
              {errors.email && <p className="mt-1 text-sm text-danger-500">{errors.email.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                {...register('password', { required: 'Password obbligatoria', minLength: { value: 6, message: 'Minimo 6 caratteri' } })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              />
              {errors.password && <p className="mt-1 text-sm text-danger-500">{errors.password.message}</p>}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {isSubmitting ? 'Registrazione...' : 'Registrati'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-4">
            Hai gia un account?{' '}
            <Link to="/login" className="text-primary-600 hover:underline font-medium">
              Accedi
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
