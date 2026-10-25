import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { authService } from '../services/auth.service';
import type { LoginData } from '../services/auth.service';
import { Target, Eye, EyeOff } from 'lucide-react';

export function Login() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginData>();
  const { login } = useAuthStore();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const onSubmit = async (data: LoginData) => {
    try {
      setError('');
      const res = await authService.login(data);
      login(res.data.user, res.data.accessToken);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Errore di accesso');
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
          <h1 className="text-2xl font-bold text-gray-900">OKR Manager</h1>
          <p className="text-gray-500 mt-1">Accedi al tuo account</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          {error && (
            <div className="mb-4 p-3 bg-danger-50 border border-danger-100 text-danger-500 rounded-lg text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                {...register('email', { required: 'Email obbligatoria' })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors"
                placeholder="email@esempio.com"
              />
              {errors.email && <p className="mt-1 text-sm text-danger-500">{errors.email.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  {...register('password', { required: 'Password obbligatoria' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors pr-10"
                  placeholder="La tua password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
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
              {isSubmitting ? 'Accesso in corso...' : 'Accedi'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-4">
            Non hai un account?{' '}
            <Link to="/register" className="text-primary-600 hover:underline font-medium">
              Registrati
            </Link>
          </p>
        </div>

        <div className="mt-6 p-4 bg-white rounded-xl border border-gray-200 text-sm text-gray-500">
          <p className="font-medium text-gray-700 mb-2">Account di test:</p>
          <div className="space-y-1">
            <p>Admin: admin@okr.local / password123</p>
            <p>Manager: manager@okr.local / password123</p>
            <p>Viewer: viewer@okr.local / password123</p>
            <p>Team Lead: teamlead@okr.local / password123</p>
          </div>
        </div>
      </div>
    </div>
  );
}
