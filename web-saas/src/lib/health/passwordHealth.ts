import { ZxcvbnFactory } from '@zxcvbn-ts/core'
import * as common from '@zxcvbn-ts/language-common'

export type Strength = 'Weak' | 'Medium' | 'Strong'

const zxcvbn = new ZxcvbnFactory({
  dictionary: { ...common.dictionary },
  graphs: common.adjacencyGraphs,
})

/** Strength from zxcvbn (0-4) mapped to the three labels shown in the UI. */
export function passwordStrength(password: string, userInputs: string[] = []): Strength {
  if (!password) return 'Weak'
  const { score } = zxcvbn.check(password.slice(0, 128), userInputs)
  if (score >= 4) return 'Strong'
  if (score >= 3) return 'Medium'
  return 'Weak'
}

export type HealthEntry = { id: string; password: string; title: string; username: string }

export type HealthReport = {
  total: number
  weak: string[]
  medium: string[]
  strong: string[]
  /** Groups (size >= 2) of entry ids sharing the same password. */
  reusedGroups: string[][]
  reused: string[]
}

export function analyzeHealth(entries: HealthEntry[]): HealthReport {
  const weak: string[] = []
  const medium: string[] = []
  const strong: string[] = []
  const byPassword = new Map<string, string[]>()

  for (const entry of entries) {
    const strength = passwordStrength(entry.password, [entry.title, entry.username])
    ;(strength === 'Weak' ? weak : strength === 'Medium' ? medium : strong).push(entry.id)
    if (entry.password) {
      const group = byPassword.get(entry.password) ?? []
      group.push(entry.id)
      byPassword.set(entry.password, group)
    }
  }

  const reusedGroups = [...byPassword.values()].filter((group) => group.length > 1)
  return {
    total: entries.length,
    weak,
    medium,
    strong,
    reusedGroups,
    reused: reusedGroups.flat(),
  }
}
