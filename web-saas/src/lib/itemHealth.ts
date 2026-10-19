import type { PwnedResult } from './health/pwned'
import { analyzeHealth, passwordStrength, type Strength } from './health/passwordHealth'
import { STALE_PASSWORD_DAYS, hasCheckablePassword, passwordAgeDays, rotationDueInDays } from './items'
import type { VaultItem } from '../state/itemOps'
import type { UrlReputation } from '../services/urlReputation'

export type RiskFlag = 'weak' | 'reused' | 'exposed' | 'stale' | 'due' | 'unsafe'

export const RISK_LABELS: Record<RiskFlag, string> = {
  weak: 'Senha fraca',
  reused: 'Senha reutilizada',
  exposed: 'Senha vazada',
  stale: 'Senha antiga (mais de 1 ano)',
  due: 'Troca programada vencida',
  unsafe: 'Site perigoso',
}

export type ItemHealth = {
  strengthById: Map<string, Strength>
  risksById: Map<string, RiskFlag[]>
  reusedGroups: string[][]
  checkable: number
  counts: Record<RiskFlag, number>
}

/** Risk flags per item, computed only from real data (strength, reuse, HIBP and Safe Browsing results, age). */
export function computeItemHealth(
  items: VaultItem[],
  pwnedById: Map<string, PwnedResult>,
  siteById: Map<string, UrlReputation>,
  now = Date.now(),
): ItemHealth {
  const checkable = items.filter((i) => hasCheckablePassword(i.data))
  const report = analyzeHealth(
    checkable.map((i) => ({ id: i.id, password: i.data.password, title: i.data.title, username: i.data.username })),
  )
  const reused = new Set(report.reused)
  const strengthById = new Map<string, Strength>()
  const risksById = new Map<string, RiskFlag[]>()
  const counts: Record<RiskFlag, number> = { weak: 0, reused: 0, exposed: 0, stale: 0, due: 0, unsafe: 0 }

  for (const item of items) {
    const flags: RiskFlag[] = []
    if (hasCheckablePassword(item.data)) {
      const strength = passwordStrength(item.data.password, [item.data.title, item.data.username])
      strengthById.set(item.id, strength)
      if (strength === 'Weak') flags.push('weak')
      if (reused.has(item.id)) flags.push('reused')
      const pwned = pwnedById.get(item.id)
      if (pwned?.status === 'ok' && pwned.count > 0) flags.push('exposed')
      if (passwordAgeDays(item.data, item.createdAt, now) > STALE_PASSWORD_DAYS) flags.push('stale')
    }
    const due = rotationDueInDays(item.data, item.createdAt, now)
    if (due !== null && due < 0 && (item.data.type === 'login' || item.data.type === 'secret')) flags.push('due')
    if (siteById.get(item.id)?.status === 'unsafe') flags.push('unsafe')
    flags.forEach((f) => (counts[f] += 1))
    risksById.set(item.id, flags)
  }
  return { strengthById, risksById, reusedGroups: report.reusedGroups, checkable: checkable.length, counts }
}
