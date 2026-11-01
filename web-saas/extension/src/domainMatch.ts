/**
 * Decides whether a saved login may be offered or filled on a page. This is the extension's main
 * anti-phishing control: a wrong answer here hands a password to the wrong site.
 *
 * Rules (docs/product/browser-extension.md, section 5):
 *  - compare the registrable domain (eTLD+1, public suffix list embedded by tldts, private suffixes
 *    such as github.io count as public so tenants never match each other);
 *  - IP addresses and single-label hosts (localhost) need the exact host and port;
 *  - an https item is never offered on an http page;
 *  - URLs with embedded credentials or non-web schemes never match.
 */
import { parse } from 'tldts'
import { normalizeUrl } from '../../src/lib/urlCheck'

export type MatchKind = 'exact' | 'domain' | 'none'

export type PageInfo = {
  url: URL
  /** Registrable domain, or the full host for IPs and single-label hosts. */
  site: string
  /** True when the comparison must be host-and-port exact (IPs, localhost). */
  exactOnly: boolean
}

/** Parses a page or item URL. Returns null for anything that is not a plain http(s) web address. */
export function pageInfo(input: string): PageInfo | null {
  const url = normalizeUrl(input)
  if (!url || url.username || url.password) return null
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  const parsed = parse(host, { allowPrivateDomains: true })
  if (parsed.isIp || host.startsWith('[')) return { url, site: host, exactOnly: true }
  if (!parsed.domain) {
    // localhost and other single-label hosts; also hosts that are a public suffix themselves.
    return { url, site: host, exactOnly: true }
  }
  return { url, site: parsed.domain.replace(/^www\./, ''), exactOnly: false }
}

const hostPort = (url: URL) => `${url.hostname.toLowerCase().replace(/\.$/, '')}:${url.port || (url.protocol === 'https:' ? '443' : '80')}`
const bareHost = (url: URL) => url.hostname.toLowerCase().replace(/\.$/, '').replace(/^www\./, '')

/** How a saved item URL relates to the current page URL. */
export function matchItem(itemUrl: string, pageUrl: string): MatchKind {
  const item = pageInfo(itemUrl)
  const page = pageInfo(pageUrl)
  if (!item || !page) return 'none'
  if (item.url.protocol === 'https:' && page.url.protocol !== 'https:') return 'none'
  if (item.exactOnly || page.exactOnly) {
    return hostPort(item.url) === hostPort(page.url) ? 'exact' : 'none'
  }
  if (item.site !== page.site) return 'none'
  return bareHost(item.url) === bareHost(page.url) ? 'exact' : 'domain'
}

/** Whether a frame may receive a fill for a page: same registrable domain (or exact host for IPs). */
export function sameSite(frameUrl: string, pageUrl: string): boolean {
  const frame = pageInfo(frameUrl)
  const page = pageInfo(pageUrl)
  if (!frame || !page) return false
  if (frame.exactOnly || page.exactOnly) return hostPort(frame.url) === hostPort(page.url)
  return frame.site === page.site
}
