import { AlertCircle } from 'lucide-react';
import type { ReactNode } from 'react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: ReactNode;
  confirmText?: string;
  cancelText?: string;
  isDangerous?: boolean;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = 'Elimina',
  cancelText = 'Annulla',
  isDangerous = true,
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40 animate-in fade-in duration-200" onClick={onCancel} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm animate-in zoom-in-95 duration-200">
        <div className="bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden">
          <div className="p-6">
            <div className="flex items-start gap-4">
              <div className={`p-2.5 rounded-lg ${isDangerous ? 'bg-danger-100' : 'bg-warning-100'}`}>
                <AlertCircle className={`w-6 h-6 ${isDangerous ? 'text-danger-600' : 'text-warning-600'}`} />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
                <p className="text-sm text-gray-600 mt-2">{message}</p>
              </div>
            </div>
          </div>
          <div className="flex gap-3 px-6 py-4 bg-gray-50 border-t border-gray-200">
            <button
              onClick={onCancel}
              disabled={isLoading}
              className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {cancelText}
            </button>
            <button
              onClick={onConfirm}
              disabled={isLoading}
              className={`flex-1 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 ${
                isDangerous
                  ? 'bg-danger-600 hover:bg-danger-700'
                  : 'bg-primary-600 hover:bg-primary-700'
              }`}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Elaborazione...
                </span>
              ) : (
                confirmText
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
