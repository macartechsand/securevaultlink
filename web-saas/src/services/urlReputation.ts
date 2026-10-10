import { supabase } from '../lib/supabase';

export type UrlReputation =
  | { status: 'unsafe'; threats: string[] }
  | { status: 'no-known-threats' }
  | { status: 'error'; message: string };

/**
 * Asks the `check-url` Edge Function (Google Safe Browsing). The URL is sent to the backend and the
 * provider only when the user explicitly requests the check. "No known threats" is not a guarantee.
 */
export async function checkUrlReputation(url: string): Promise<UrlReputation> {
  const { data, error } = await supabase.functions.invoke('check-url', { body: { url } });
  if (error || !data) return { status: 'error', message: 'Reputation check is unavailable right now.' };
  if (data.status === 'unsafe') return { status: 'unsafe', threats: data.threats ?? [] };
  if (data.status === 'no-known-threats') return { status: 'no-known-threats' };
  return { status: 'error', message: 'Reputation check is unavailable right now.' };
}
