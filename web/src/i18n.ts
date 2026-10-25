import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import it from './locales/it.json';
import en from './locales/en.json';

export const LOCALES = ['it', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export function isLocale(value: string | null | undefined): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

void i18n.use(initReactI18next).init({
  resources: { it: { translation: it }, en: { translation: en } },
  lng: 'it',
  fallbackLng: 'it', // le chiavi non ancora tradotte in inglese (completo in Fase 9) ricadono sull'italiano
  interpolation: { escapeValue: false }, // React esegue già l'escape
});

export default i18n;
