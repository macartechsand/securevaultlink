/** Secured Items model (decrypted shape). Everything here lives inside the encrypted item blob. */
import { categoryLabel } from './labels'

export type ItemType = 'login' | 'note' | 'secret' | 'card'
export type SecretKind = 'api_key' | 'token' | 'ssh_key' | 'certificate' | 'other'

export type CustomField = { id: string; label: string; value: string; hidden: boolean }
export type Attachment = { fileId: string; name: string; size: number }
export type CardData = { holder: string; number: string; expiry: string; cvv: string }

export type SecuredItemData = {
  type: ItemType
  title: string
  username: string
  /** Login password, or the secret value for `secret` items. */
  password: string
  passwordUpdatedAt: string | null
  url: string
  notes: string
  category: string
  folderId: string | null
  tags: string[]
  favorite: boolean
  secretKind: SecretKind
  card: CardData
  customFields: CustomField[]
  attachments: Attachment[]
}

export const LIMITS = {
  title: 120,
  notes: 4000,
  customFields: 10,
  fieldLabel: 60,
  fieldValue: 1000,
  attachments: 10,
  tags: 20,
  tagLength: 32,
  history: 10,
}

export const ITEM_TYPES: { value: ItemType; label: string }[] = [
  { value: 'login', label: 'Login' },
  { value: 'note', label: 'Nota segura' },
  { value: 'secret', label: 'Segredo / chave de API' },
  { value: 'card', label: 'Cartão' },
]

export const SECRET_KINDS: { value: SecretKind; label: string }[] = [
  { value: 'api_key', label: 'Chave de API' },
  { value: 'token', label: 'Token de acesso' },
  { value: 'ssh_key', label: 'Chave SSH' },
  { value: 'certificate', label: 'Certificado / chave privada' },
  { value: 'other', label: 'Outro segredo' },
]

export const typeLabel = (t: ItemType) => ITEM_TYPES.find((x) => x.value === t)?.label ?? t

const str = (v: unknown, max = 10_000) => (typeof v === 'string' ? v.slice(0, max) : '')

export function emptyItem(type: ItemType = 'login'): SecuredItemData {
  return {
    type,
    title: '',
    username: '',
    password: '',
    passwordUpdatedAt: null,
    url: '',
    notes: '',
    category: 'Personal',
    folderId: null,
    tags: [],
    favorite: false,
    secretKind: 'api_key',
    card: { holder: '', number: '', expiry: '', cvv: '' },
    customFields: [],
    attachments: [],
  }
}

/** Accepts v1 entries ({title, username, password, url, notes, category}) and any partial v2 blob. */
export function normalizeItem(raw: unknown): SecuredItemData {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const type = (['login', 'note', 'secret', 'card'] as const).includes(r.type as ItemType) ? (r.type as ItemType) : 'login'
  const base = emptyItem(type)
  const card = (r.card && typeof r.card === 'object' ? r.card : {}) as Record<string, unknown>
  return {
    ...base,
    title: str(r.title, LIMITS.title),
    username: str(r.username, 200),
    password: str(r.password, 10_000),
    passwordUpdatedAt: typeof r.passwordUpdatedAt === 'string' ? r.passwordUpdatedAt : null,
    url: str(r.url, 2048),
    notes: str(r.notes, LIMITS.notes),
    category: str(r.category, 40) || base.category,
    folderId: typeof r.folderId === 'string' ? r.folderId : null,
    tags: Array.isArray(r.tags) ? normalizeTags(r.tags.filter((t): t is string => typeof t === 'string')) : [],
    favorite: r.favorite === true,
    secretKind: SECRET_KINDS.some((k) => k.value === r.secretKind) ? (r.secretKind as SecretKind) : base.secretKind,
    card: { holder: str(card.holder, 100), number: str(card.number, 30), expiry: str(card.expiry, 7), cvv: str(card.cvv, 4) },
    customFields: Array.isArray(r.customFields)
      ? r.customFields.slice(0, LIMITS.customFields).map((f, i) => {
          const field = (f && typeof f === 'object' ? f : {}) as Record<string, unknown>
          return {
            id: str(field.id, 40) || `f${i}`,
            label: str(field.label, LIMITS.fieldLabel),
            value: str(field.value, LIMITS.fieldValue),
            hidden: field.hidden === true,
          }
        })
      : [],
    attachments: Array.isArray(r.attachments)
      ? r.attachments
          .slice(0, LIMITS.attachments)
          .map((a) => (a && typeof a === 'object' ? (a as Record<string, unknown>) : {}))
          .filter((a) => typeof a.fileId === 'string')
          .map((a) => ({ fileId: a.fileId as string, name: str(a.name, 200), size: Number(a.size) || 0 }))
      : [],
  }
}

export function normalizeTags(tags: string[]) {
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of tags) {
    const tag = t.trim().replace(/\s+/g, ' ').slice(0, LIMITS.tagLength)
    const key = tag.toLowerCase()
    if (tag && !seen.has(key)) {
      seen.add(key)
      out.push(tag)
    }
    if (out.length >= LIMITS.tags) break
  }
  return out
}

/** Returns a Portuguese error message, or null when the item is valid. */
export function validateItem(d: SecuredItemData): string | null {
  if (!d.title.trim()) return 'Informe um título.'
  if (d.notes.length > LIMITS.notes) return `As notas podem ter até ${LIMITS.notes} caracteres.`
  if (d.customFields.length > LIMITS.customFields) return `Use no máximo ${LIMITS.customFields} campos personalizados.`
  if (d.customFields.some((f) => !f.label.trim())) return 'Todo campo personalizado precisa de um nome.'
  if (d.attachments.length > LIMITS.attachments) return `Use no máximo ${LIMITS.attachments} anexos por item.`
  if (d.type === 'login' && !d.password) return 'Informe a senha.'
  if (d.type === 'secret' && !d.password) return 'Informe o valor do segredo.'
  if (d.type === 'note' && !d.notes.trim()) return 'Escreva o conteúdo da nota.'
  if (d.type === 'card') {
    const digits = d.card.number.replace(/\D/g, '')
    if (digits.length < 12 || digits.length > 19) return 'Número do cartão inválido.'
    if (d.card.expiry && !/^(0[1-9]|1[0-2])\/\d{2}$/.test(d.card.expiry)) return 'Validade no formato MM/AA.'
    if (d.card.cvv && !/^\d{3,4}$/.test(d.card.cvv)) return 'CVV inválido.'
  }
  return null
}

/** Whether the item has a password that password-health checks apply to. */
export const hasCheckablePassword = (d: SecuredItemData) => d.type === 'login' && Boolean(d.password)

export function maskCard(number: string) {
  const digits = number.replace(/\D/g, '')
  return digits.length >= 4 ? `•••• ${digits.slice(-4)}` : '••••'
}

export function passwordAgeDays(d: SecuredItemData, createdAt: string, now = Date.now()) {
  const since = d.passwordUpdatedAt ?? createdAt
  return Math.floor((now - new Date(since).getTime()) / 86_400_000)
}

export const STALE_PASSWORD_DAYS = 365

/** Free-text search over visible fields (never over hidden custom field values or secrets). */
export function matchesQuery(d: SecuredItemData, query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const haystack = [
    d.title,
    d.username,
    d.url,
    d.notes,
    categoryLabel(d.category),
    typeLabel(d.type),
    ...d.tags,
    ...d.customFields.flatMap((f) => (f.hidden ? [f.label] : [f.label, f.value])),
    ...d.attachments.map((a) => a.name),
  ]
  return haystack.some((v) => v.toLowerCase().includes(q))
}
