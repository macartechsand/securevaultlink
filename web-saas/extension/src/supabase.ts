/**
 * Replaces web-saas/src/lib/supabase.ts inside the extension build (see the alias plugin in
 * extension/vite.config.ts), so every shared service talks to Supabase through this client.
 *
 * The auth session (refresh token) is kept in chrome.storage.local, the extension's equivalent of
 * the web app's localStorage. It never holds vault keys or items.
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

const chromeStorage = {
  getItem: async (key: string) => ((await chrome.storage.local.get(key))[key] as string | undefined) ?? null,
  setItem: (key: string, value: string) => chrome.storage.local.set({ [key]: value }),
  removeItem: (key: string) => chrome.storage.local.remove(key),
};

export const supabase = createClient(supabaseUrl || 'http://localhost:54321', supabaseAnonKey || 'missing-anon-key', {
  auth: {
    storage: chromeStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});
