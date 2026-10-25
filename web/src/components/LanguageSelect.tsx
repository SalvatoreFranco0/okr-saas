import { useTranslation } from 'react-i18next';
import { LOCALES, isLocale } from '../i18n';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';

/** Cambia lingua e la salva in profiles.locale (la RLS consente di modificare solo il proprio profilo). */
export function LanguageSelect() {
  const { t, i18n } = useTranslation();
  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);

  const change = async (lng: string) => {
    if (!isLocale(lng)) return;
    await i18n.changeLanguage(lng);
    if (!profile) return;
    const { data } = await supabase.from('profiles').update({ locale: lng }).eq('id', profile.id).select().single();
    if (data) setProfile(data);
  };

  return (
    <select
      aria-label={t('profile.language')}
      value={isLocale(i18n.language) ? i18n.language : 'it'}
      onChange={(e) => void change(e.target.value)}
      className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 bg-white"
    >
      {LOCALES.map((l) => (
        <option key={l} value={l}>
          {l.toUpperCase()}
        </option>
      ))}
    </select>
  );
}
