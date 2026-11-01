import type { Strength } from './health/passwordHealth'

/** Stored category values stay stable (English keys); only the labels are localized. */
export const CATEGORY_LABELS: Record<string, string> = {
  Work: 'Trabalho',
  Finance: 'Finanças',
  Social: 'Redes sociais',
  Personal: 'Pessoal',
  Other: 'Outros',
}

export const CATEGORIES = Object.keys(CATEGORY_LABELS)

export const categoryLabel = (value: string) => CATEGORY_LABELS[value] ?? value

export const STRENGTH_LABELS: Record<Strength, string> = { Weak: 'Fraca', Medium: 'Média', Strong: 'Forte' }

export const strengthBadge = (s: Strength) => (s === 'Strong' ? 'badge--ok' : s === 'Medium' ? 'badge--warn' : 'badge--danger')
