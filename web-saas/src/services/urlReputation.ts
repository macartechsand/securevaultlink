import { supabase } from '../lib/supabase';
import { normalizeUrl } from '../lib/urlCheck';

export type UrlReputation =
  | { status: 'unsafe'; threats: string[] }
  | { status: 'no-known-threats' }
  | { status: 'error'; message: string };

const UNAVAILABLE: UrlReputation = { status: 'error', message: 'Reputation check is unavailable right now.' };
const BATCH = 50;

type ResultRow = { url: string; status: string; threats?: string[] };

/**
 * Asks the `check-url` Edge Function (Google Safe Browsing). URLs are sent to the backend and the
 * provider only on an explicit user action (save, security check). "No known threats" is not a guarantee.
 * Returns a map keyed by the original input string.
 */
export async function checkUrlsReputation(inputs: string[]): Promise<Map<string, UrlReputation>> {
  const results = new Map<string, UrlReputation>();
  const normalized = new Map<string, string[]>(); // normalized url -> original inputs
  for (const input of new Set(inputs)) {
    const url = normalizeUrl(input)?.toString();
    if (!url) continue;
    normalized.set(url, [...(normalized.get(url) ?? []), input]);
  }

  const urls = [...normalized.keys()];
  for (let i = 0; i < urls.length; i += BATCH) {
    const chunk = urls.slice(i, i + BATCH);
    const { data, error } = await supabase.functions.invoke('check-url', { body: { urls: chunk } });
    const rows: ResultRow[] | undefined = error ? undefined : data?.results;
    for (const url of chunk) {
      const row = rows?.find((r) => r.url === url);
      const value: UrlReputation = !row
        ? UNAVAILABLE
        : row.status === 'unsafe'
          ? { status: 'unsafe', threats: row.threats ?? [] }
          : row.status === 'no-known-threats'
            ? { status: 'no-known-threats' }
            : UNAVAILABLE;
      for (const input of normalized.get(url) ?? []) results.set(input, value);
    }
  }
  return results;
}

export async function checkUrlReputation(url: string): Promise<UrlReputation> {
  return (await checkUrlsReputation([url])).get(url) ?? { status: 'error', message: 'Enter a valid http(s) address.' };
}
