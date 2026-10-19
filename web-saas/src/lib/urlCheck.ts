/** Local URL checks. Remote reputation lookups go through a backend function (never from the browser). */

/** True for "scheme:..." but not for "host:port". */
function hasScheme(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value) && !/^[^/:?#]+:\d+(?:[/?#]|$)/.test(value)
}

/** Normalizes user input to an absolute http(s) URL, or null if it is not a safe web URL. */
export function normalizeUrl(input: string): URL | null {
  const value = input.trim()
  if (!value) return null
  const candidate = hasScheme(value) ? value : `https://${value}`
  try {
    const url = new URL(candidate)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (!url.hostname) return null
    return url
  } catch {
    return null
  }
}

/** Href that is safe to render in an anchor; undefined when the URL is not http(s). */
export function safeHref(input: string): string | undefined {
  return normalizeUrl(input)?.toString()
}

export type UrlFinding = { code: string; message: string; severity: 'low' | 'medium' | 'high' }

const SUSPICIOUS_TLDS = new Set(['zip', 'mov', 'tk', 'ml', 'ga', 'cf', 'gq', 'top', 'xyz', 'click'])

export function analyzeUrl(input: string): { valid: boolean; findings: UrlFinding[] } {
  const value = input.trim()
  const scheme = hasScheme(value) ? /^([^:]+):/.exec(value)?.[1]?.toLowerCase() : undefined
  if (scheme && scheme !== 'http' && scheme !== 'https') {
    return {
      valid: false,
      findings: [{ code: 'bad-scheme', message: `Esquema "${scheme}:" não permitido`, severity: 'high' }],
    }
  }
  const url = normalizeUrl(value)
  if (!url) {
    return { valid: false, findings: [{ code: 'invalid', message: 'Endereço web inválido', severity: 'high' }] }
  }

  const findings: UrlFinding[] = []
  const host = url.hostname.toLowerCase()

  if (url.protocol === 'http:') {
    findings.push({ code: 'no-https', message: 'Conexão sem criptografia (http)', severity: 'medium' })
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[')) {
    findings.push({ code: 'ip-host', message: 'O endereço usa um IP em vez de um domínio', severity: 'high' })
  }
  if (host.split('.').some((label) => label.startsWith('xn--'))) {
    findings.push({ code: 'punycode', message: 'O domínio usa caracteres parecidos com outros (punycode)', severity: 'high' })
  }
  if (url.username || url.password) {
    findings.push({ code: 'credentials-in-url', message: 'O endereço contém usuário ou senha embutidos', severity: 'high' })
  }
  const tld = host.split('.').pop() ?? ''
  if (SUSPICIOUS_TLDS.has(tld)) {
    findings.push({ code: 'suspicious-tld', message: `Domínio termina em ".${tld}", muito usado em golpes`, severity: 'low' })
  }
  if (host.split('.').length > 4) {
    findings.push({ code: 'many-subdomains', message: 'Quantidade incomum de subdomínios', severity: 'low' })
  }
  return { valid: true, findings }
}
