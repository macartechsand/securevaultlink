/**
 * Reads the result of chrome.identity.launchWebAuthFlow. Accepts only a redirect back to this
 * extension's own https://<id>.chromiumapp.org/ address and returns the one-time PKCE code.
 */
export class OAuthCallbackError extends Error {}

export function oauthCodeFrom(resultUrl: string | undefined, redirectUrl: string): string {
  if (!resultUrl) throw new OAuthCallbackError('O login foi cancelado.');
  let result: URL;
  let expected: URL;
  try {
    result = new URL(resultUrl);
    expected = new URL(redirectUrl);
  } catch {
    throw new OAuthCallbackError('Resposta de login inválida.');
  }
  if (result.origin !== expected.origin || expected.protocol !== 'https:' || !expected.hostname.endsWith('.chromiumapp.org')) {
    throw new OAuthCallbackError('Resposta de login de origem inesperada.');
  }
  const query = result.searchParams;
  const hash = new URLSearchParams(result.hash.slice(1));
  const failure = query.get('error_description') ?? hash.get('error_description') ?? query.get('error') ?? hash.get('error');
  if (failure) throw new OAuthCallbackError(failure.replace(/\+/g, ' '));
  const code = query.get('code');
  if (!code || !/^[A-Za-z0-9._~-]{8,512}$/.test(code)) throw new OAuthCallbackError('O provedor não devolveu um código de login.');
  return code;
}
