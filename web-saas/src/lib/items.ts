/** Secured Items model (decrypted shape). Everything here lives inside the encrypted item blob. */
import { categoryLabel } from './labels'

export type ItemType = 'login' | 'note' | 'secret' | 'card'
export type SecretKind = 'api_key' | 'token' | 'ssh_key' | 'certificate' | 'other'

export type CustomField = { id: string; label: string; value: string; hidden: boolean }
export type Attachment = { fileId: string; name: string; size: number }
export type CardData = { holder: string; number: string; expiry: string; cvv: string }

/** Connectors that can rotate an item in one click through the platform API (Edge Function `rotate`). */
export const AUTO_CONNECTOR_IDS = [
  'aws-iam-access-key',
  'aws-iam-console',
  'gcp-service-account-key',
  'entra-app-secret',
  'entra-user',
  'google-workspace-user',
  'gitlab-pat',
  'cloudflare-api-token',
] as const
export type AutoConnectorId = (typeof AUTO_CONNECTOR_IDS)[number]

/** Item type each automatic connector works on. */
export const AUTO_CONNECTOR_ITEM_TYPE: Record<AutoConnectorId, ItemType> = {
  'aws-iam-access-key': 'secret',
  'aws-iam-console': 'login',
  'gcp-service-account-key': 'secret',
  'entra-app-secret': 'secret',
  'entra-user': 'login',
  'google-workspace-user': 'login',
  'gitlab-pat': 'secret',
  'cloudflare-api-token': 'secret',
}

export type AutoRotationConfig = {
  /** gitlab-pat: self-hosted GitLab (default https://gitlab.com). */
  baseUrl?: string
  /** gitlab-pat (default 90), entra-app-secret (default 180): validity of the new credential. */
  expiresInDays?: string
  /** entra-app-secret: Directory (tenant) ID or domain. */
  tenantId?: string
  /** entra-app-secret: platform id of the current secret (filled after the first rotation). */
  keyId?: string
  /**
   * Login connectors: vault item (secret) holding the admin credential that changes the password:
   * aws-iam-console = AWS access key, entra-user = app registration, google-workspace-user = service account JSON.
   */
  adminItemId?: string
  /** google-workspace-user: Workspace admin the service account impersonates (domain-wide delegation). */
  adminEmail?: string
}

/** Login connectors that use an admin credential from another vault item. */
export const ADMIN_LINKED_CONNECTORS: Partial<Record<AutoConnectorId, AdminKeyKind>> = {
  'aws-iam-console': 'aws',
  'entra-user': 'entra',
  'google-workspace-user': 'gcp',
}
export type AdminKeyKind = 'aws' | 'entra' | 'gcp'

/** Which kind of admin credential a secret item holds (by its identifier/value format), if any. */
export function adminKeyKind(d: SecuredItemData): AdminKeyKind | null {
  if (d.type !== 'secret') return null
  const id = d.username.trim()
  if (/^AKIA[A-Z0-9]{16}$/.test(id)) return 'aws'
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return 'entra'
  if (/"type"\s*:\s*"service_account"/.test(d.password) && d.password.includes('private_key')) return 'gcp'
  return null
}

/**
 * Per-item opt-in for automatic rotation. Stored inside the encrypted item. `consentAt` records that
 * the owner accepted that the current credential is sent to the rotation function during a rotation.
 */
export type AutoRotation = {
  connectorId: AutoConnectorId
  consentAt: string
  config: AutoRotationConfig
  lastRotatedAt: string | null
  /** Expiry reported by the platform for the current credential (GitLab, Cloudflare). */
  expiresAt: string | null
}

export type SecuredItemData = {
  type: ItemType
  title: string
  username: string
  /** Login password, or the secret value for `secret` items. */
  password: string
  passwordUpdatedAt: string | null
  /** Scheduled rotation interval in days (0 = off). */
  rotationIntervalDays: number
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
  autoRotation: AutoRotation | null
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
    rotationIntervalDays: 0,
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
    autoRotation: null,
  }
}

/** Keeps the opt-in only on the item type its connector works on. */
const autoRotationFor = (type: ItemType, a: AutoRotation | null) => (a && AUTO_CONNECTOR_ITEM_TYPE[a.connectorId] === type ? a : null)

function normalizeAutoRotation(raw: unknown): AutoRotation | null {
  if (!raw || typeof raw !== 'object') return null
  const a = raw as Record<string, unknown>
  if (!AUTO_CONNECTOR_IDS.includes(a.connectorId as AutoConnectorId) || typeof a.consentAt !== 'string') return null
  const config = (a.config && typeof a.config === 'object' ? a.config : {}) as Record<string, unknown>
  return {
    connectorId: a.connectorId as AutoConnectorId,
    consentAt: a.consentAt,
    config: {
      baseUrl: str(config.baseUrl, 300) || undefined,
      expiresInDays: str(config.expiresInDays, 3) || undefined,
      tenantId: str(config.tenantId, 120) || undefined,
      keyId: str(config.keyId, 64) || undefined,
      adminItemId: str(config.adminItemId, 64) || undefined,
      adminEmail: str(config.adminEmail, 200) || undefined,
    },
    lastRotatedAt: typeof a.lastRotatedAt === 'string' ? a.lastRotatedAt : null,
    expiresAt: typeof a.expiresAt === 'string' ? a.expiresAt : null,
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
    rotationIntervalDays:
      typeof r.rotationIntervalDays === 'number' && r.rotationIntervalDays >= 0 && r.rotationIntervalDays <= 3650
        ? Math.trunc(r.rotationIntervalDays)
        : 0,
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
    autoRotation: autoRotationFor(type, normalizeAutoRotation(r.autoRotation)),
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

/** Days until the scheduled rotation (negative = overdue), or null when no schedule is set. */
export function rotationDueInDays(d: SecuredItemData, createdAt: string, now = Date.now()) {
  if (!d.rotationIntervalDays) return null
  return d.rotationIntervalDays - passwordAgeDays(d, createdAt, now)
}

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
