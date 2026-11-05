/**
 * Rotation deadlines: every risk found on a credential becomes a date by which it should be changed.
 * Pure functions (the "since" dates are passed in), computed only on the user's device: which items
 * are at risk never leaves the vault.
 *
 *  - exposed (in a known breach) and unsafe (site flagged by Google): 7 days from when it was found;
 *  - weak, reused and stale (> 1 year): 30 days from when it was found;
 *  - scheduled rotation: the date set on the item (interval since the last password change).
 */
import type { RiskFlag } from './itemHealth'
import { passwordAgeDays, rotationDueInDays } from './items'
import type { VaultItem } from '../state/itemOps'

export const DAY_MS = 86_400_000

/** Days to fix each risk, counted from when it was first found on this device. */
export const DEADLINE_DAYS: Record<Exclude<RiskFlag, 'due'>, number> = {
  exposed: 7,
  unsafe: 7,
  weak: 30,
  reused: 30,
  stale: 30,
}

/** Scheduled rotations show up this many days before they are due. */
export const UPCOMING_DAYS = 7
/** "Soon" in summaries and notifications. */
export const SOON_DAYS = 3

/** itemId -> risk -> ISO date when the risk was first seen. */
export type RiskSince = Record<string, Partial<Record<RiskFlag, string>>>

export type Deadline = {
  item: VaultItem
  /** Risks that set a deadline, most urgent first. */
  reasons: RiskFlag[]
  dueAt: number
  /** Whole days left (negative = overdue, 0 = due today). */
  daysLeft: number
}

/** Risks that only appear after the breach/site check (absent until it runs, not "fixed"). */
const CHECK_ONLY: RiskFlag[] = ['exposed', 'unsafe']
const PASSWORD_RISKS: RiskFlag[] = ['exposed', 'weak', 'reused', 'stale']

/**
 * Records when each current risk was first seen and forgets the ones that are gone. Risks that need
 * the breach/site check are kept while that check has not run in this session, unless the password
 * was changed after they were found (changing it is what fixes them).
 */
export function updateRiskSince(
  prev: RiskSince,
  items: VaultItem[],
  risksById: Map<string, RiskFlag[]>,
  checkRan: boolean,
  now = Date.now(),
): RiskSince {
  const next: RiskSince = {}
  const nowIso = new Date(now).toISOString()
  for (const item of items) {
    const before = prev[item.id] ?? {}
    const changedAt = item.data.passwordUpdatedAt ? Date.parse(item.data.passwordUpdatedAt) : 0
    const entry: Partial<Record<RiskFlag, string>> = {}
    for (const flag of risksById.get(item.id) ?? []) {
      if (flag === 'due') continue
      const since = before[flag]
      // A risk seen before the last password change is a new finding now.
      entry[flag] = since && !(PASSWORD_RISKS.includes(flag) && changedAt > Date.parse(since)) ? since : nowIso
    }
    if (!checkRan) {
      for (const flag of CHECK_ONLY) {
        const since = before[flag]
        if (!since || entry[flag]) continue
        if (flag === 'exposed' && changedAt > Date.parse(since)) continue
        entry[flag] = since
      }
    }
    if (Object.keys(entry).length) next[item.id] = entry
  }
  return next
}

const URGENCY: RiskFlag[] = ['exposed', 'unsafe', 'due', 'weak', 'reused', 'stale']

/** Deadlines of every item the user can change, soonest first. */
export function computeDeadlines(items: VaultItem[], since: RiskSince, now = Date.now()): Deadline[] {
  const out: Deadline[] = []
  for (const item of items) {
    if (item.access === 'view') continue
    const candidates: { flag: RiskFlag; at: number }[] = []
    for (const [flag, iso] of Object.entries(since[item.id] ?? {}) as [Exclude<RiskFlag, 'due'>, string][]) {
      const days = DEADLINE_DAYS[flag]
      const t = Date.parse(iso)
      if (days !== undefined && Number.isFinite(t)) candidates.push({ flag, at: t + days * DAY_MS })
    }
    if (item.data.type === 'login' || item.data.type === 'secret') {
      const due = rotationDueInDays(item.data, item.createdAt, now)
      if (due !== null && due <= UPCOMING_DAYS) {
        const age = passwordAgeDays(item.data, item.createdAt, now)
        candidates.push({ flag: 'due', at: now + (item.data.rotationIntervalDays - age) * DAY_MS })
      }
    }
    if (!candidates.length) continue
    const dueAt = Math.min(...candidates.map((c) => c.at))
    const reasons = [...new Set(candidates.map((c) => c.flag))].sort((a, b) => URGENCY.indexOf(a) - URGENCY.indexOf(b))
    out.push({ item, reasons, dueAt, daysLeft: Math.floor((dueAt - now) / DAY_MS) })
  }
  return out.sort((a, b) => a.dueAt - b.dueAt)
}

export type DeadlineSummary = { overdue: number; soon: number; next: Deadline | null }

export function summarizeDeadlines(deadlines: Deadline[]): DeadlineSummary {
  return {
    overdue: deadlines.filter((d) => d.daysLeft < 0).length,
    soon: deadlines.filter((d) => d.daysLeft >= 0 && d.daysLeft <= SOON_DAYS).length,
    next: deadlines[0] ?? null,
  }
}

/** "vence hoje", "vence em 3 dias", "venceu há 2 dias". */
export function deadlineLabel(daysLeft: number): string {
  if (daysLeft < 0) return `venceu há ${-daysLeft} dia${daysLeft === -1 ? '' : 's'}`
  if (daysLeft === 0) return 'vence hoje'
  return `vence em ${daysLeft} dia${daysLeft === 1 ? '' : 's'}`
}

/**
 * Text of the browser notification. Counts only: notifications can show on the lock screen and in
 * the system history, so no item names or sites.
 */
export function notificationText(s: DeadlineSummary): string | null {
  if (!s.overdue && !s.soon) return null
  const parts: string[] = []
  if (s.overdue) parts.push(`${s.overdue} troca${s.overdue > 1 ? 's' : ''} de senha vencida${s.overdue > 1 ? 's' : ''}`)
  if (s.soon) parts.push(`${s.soon} vence${s.soon > 1 ? 'm' : ''} nos próximos ${SOON_DAYS} dias`)
  return `${parts.join(' e ')}. Abra a fila de rotação no SecureLink Vault.`
}
