import { useTranslation } from 'react-i18next';

/** Errore di un'operazione; sul conflitto di versione offre "Ricarica" per rileggere i dati. */
export function ErrorNote({ errorKey, onReload }: { errorKey: string | null; onReload?: () => void }) {
  const { t } = useTranslation();
  if (!errorKey) return null;
  return (
    <p role="alert" className="text-sm text-danger-500">
      {t(errorKey)}
      {errorKey === 'errors.conflict' && onReload && (
        <button type="button" onClick={onReload} className="ml-2 underline">
          {t('okr.reload')}
        </button>
      )}
    </p>
  );
}
