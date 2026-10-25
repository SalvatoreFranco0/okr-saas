import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';
import type { Tables, Enums } from '../types/database';

export type OrgRole = Enums<'org_role'>;
export type Profile = Tables<'profiles'>;
export interface OrgMembership {
  id: string;
  name: string;
  slug: string;
  role: OrgRole;
}
export type Aal = 'aal1' | 'aal2';

interface AuthState {
  status: 'loading' | 'ready';
  session: Session | null;
  profile: Profile | null;
  orgs: OrgMembership[];
  aal: Aal | null;
  /** Livello raggiungibile con i fattori MFA registrati (aal2 se c'è un TOTP verificato). */
  nextAal: Aal | null;
  /** Autorevole: true solo con aal2 e riga in platform_admins (la RLS la mostra solo così). */
  isPlatformAdmin: boolean;
  /** Solo UX: app_metadata.platform_admin, impostabile solo dal backend privilegiato. Non dà alcun accesso. */
  platformAdminHint: boolean;
  init: () => () => void;
  reload: () => Promise<void>;
  signOut: () => Promise<void>;
  setProfile: (profile: Profile) => void;
}

const EMPTY = { profile: null, orgs: [], aal: null, nextAal: null, isPlatformAdmin: false, platformAdminHint: false };

async function loadUserData(session: Session) {
  const uid = session.user.id;
  const [aalRes, profileRes, membershipsRes, platformRes] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.from('profiles').select('*').eq('id', uid).maybeSingle(),
    supabase.from('memberships').select('organization_id, role').eq('user_id', uid).eq('is_active', true),
    supabase.from('platform_admins').select('user_id').eq('user_id', uid).maybeSingle(),
  ]);

  const memberships = membershipsRes.data ?? [];
  const ids = memberships.map((m) => m.organization_id);
  const orgRows = ids.length
    ? ((await supabase.from('organizations').select('id, name, slug').in('id', ids).eq('is_active', true)).data ?? [])
    : [];
  const orgs: OrgMembership[] = orgRows
    .map((o) => ({ ...o, role: memberships.find((m) => m.organization_id === o.id)!.role }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    profile: profileRes.data ?? null,
    orgs,
    // Se il livello non si può calcolare si chiude in modo prudente: il gate chiede la verifica.
    aal: (aalRes.data?.currentLevel ?? 'aal1') as Aal,
    nextAal: (aalRes.error ? 'aal2' : (aalRes.data?.nextLevel ?? 'aal1')) as Aal,
    isPlatformAdmin: !!platformRes.data,
    platformAdminHint: session.user.app_metadata?.platform_admin === true,
  };
}

// Numero di generazione: ogni cambio di sessione lo incrementa, così la risposta di un caricamento
// ormai superato (utente precedente, logout nel frattempo) non sovrascrive lo stato corrente.
let generation = 0;

export const useAuthStore = create<AuthState>((set, get) => {
  async function apply(session: Session) {
    const gen = ++generation;
    const userData = await loadUserData(session);
    if (gen !== generation) return;
    set({ status: 'ready', session, ...userData });
  }

  return {
    status: 'loading',
    session: null,
    ...EMPTY,

    init: () => {
      // Nessuna chiamata a supabase dentro il callback (rischio di deadlock): la si rimanda.
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        setTimeout(async () => {
          if (!session) {
            generation++;
            queryClient.clear();
            set({ status: 'ready', session: null, ...EMPTY });
            return;
          }
          const previous = get().session?.user.id;
          if (event === 'TOKEN_REFRESHED' && previous === session.user.id) {
            set({ session });
            return;
          }
          if (previous && previous !== session.user.id) {
            // Cambio utente senza SIGNED_OUT (link di invito, altra scheda): nessun dato dell'utente precedente.
            generation++;
            queryClient.clear();
            set({ status: 'loading', session: null, ...EMPTY });
          }
          await apply(session);
        }, 0);
      });
      return () => data.subscription.unsubscribe();
    },

    reload: async () => {
      // Sessione corrente dal client: dopo verify/refresh il JWT (e quindi l'aal) può essere cambiato.
      const { data } = await supabase.auth.getSession();
      const session = data.session ?? get().session;
      if (!session) return;
      await apply(session);
    },

    signOut: async () => {
      generation++;
      await supabase.auth.signOut();
      queryClient.clear();
      set({ session: null, ...EMPTY });
    },

    setProfile: (profile) => set({ profile }),
  };
});

/** Ruolo effettivo nell'organizzazione indicata dallo slug dell'URL. */
export function roleInOrg(orgs: OrgMembership[], slug: string | undefined): OrgRole | null {
  return orgs.find((o) => o.slug === slug)?.role ?? null;
}
