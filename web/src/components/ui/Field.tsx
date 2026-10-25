import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export const inputCls =
  'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none disabled:bg-gray-100 disabled:text-gray-500';

export const btnPrimary =
  'px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50';
export const btnSecondary = 'px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50';

/** Etichetta + controllo + messaggio di errore (la chiave i18n arriva dallo schema Zod). */
export function Field({ id, label, error, children }: { id?: string; label: string; error?: string; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      {children}
      {error && <p className="mt-1 text-sm text-danger-500">{t(error)}</p>}
    </div>
  );
}

export function Banner({ tone = 'warning', children }: { tone?: 'warning' | 'danger' | 'info'; children: ReactNode }) {
  const cls = {
    warning: 'bg-warning-50 border-warning-100 text-warning-600',
    danger: 'bg-danger-50 border-danger-100 text-danger-600',
    info: 'bg-primary-50 border-primary-100 text-primary-700',
  }[tone];
  return (
    <div role="status" className={`p-3 border rounded-lg text-sm ${cls}`}>
      {children}
    </div>
  );
}
