/**
 * Reports unexpected app errors to the user's own audit log ("client.error") so support can
 * troubleshoot without asking for screenshots. Messages are scrubbed of anything that could be
 * personal or secret, truncated, and rate limited. Never pass vault data here.
 */
import { logClientEvent } from '../services/auditService'

const MAX_REPORTS_PER_PAGE = 5
let reported = 0
const seen = new Set<string>()

export function scrubMessage(message: string) {
  return message
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>')
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '<jwt>')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<id>')
    .replace(/[A-Za-z0-9+/_=-]{24,}/g, '<redacted>')
    .replace(/\d{6,}/g, '<number>')
    .slice(0, 200)
}

export function reportError(error: unknown, where: string) {
  if (reported >= MAX_REPORTS_PER_PAGE) return
  const raw = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  const message = scrubMessage(raw)
  const key = `${where}|${message}`
  if (seen.has(key)) return
  seen.add(key)
  reported += 1
  logClientEvent('client.error', undefined, { where: where.slice(0, 40), message, app: import.meta.env.MODE })
}

export function installErrorReporter() {
  window.addEventListener('error', (e) => reportError(e.error ?? e.message, 'window.error'))
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason, 'unhandledrejection'))
}
