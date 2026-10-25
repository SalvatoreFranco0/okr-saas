import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !key) {
  throw new Error('Configurazione mancante: imposta VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY in .env.local');
}

// Solo chiave publishable: i permessi reali sono nella RLS.
export const supabase = createClient<Database>(url, key);
