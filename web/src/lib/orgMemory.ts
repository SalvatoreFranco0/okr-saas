// Ultima organizzazione usata: serve solo al reindirizzamento iniziale, mai come fonte di verità
// (l'organizzazione attiva viene sempre dall'URL).
const KEY = 'okr.lastOrgSlug';

export function readLastOrgSlug(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function writeLastOrgSlug(slug: string): void {
  try {
    localStorage.setItem(KEY, slug);
  } catch {
    // storage non disponibile: si ignora
  }
}
