/**
 * Encrypted vault export / import and CSV import from other password managers.
 * The export is encrypted in the browser with a password chosen at export time (PBKDF2-SHA256 600k
 * + AES-256-GCM). The server never sees it. CSV files are parsed in memory only.
 */
import { fromBase64, toBase64 } from './crypto/encoding'
import { KDF_ITERATIONS } from './crypto/vaultCrypto'
import { LIMITS, type SecuredItemData, emptyItem, normalizeItem, normalizeTags } from './items'

export const EXPORT_FORMAT = 'securevault-export'
const encoder = new TextEncoder()
const decoder = new TextDecoder()
const AAD = encoder.encode('securevault:export:v1')

export type ExportPayload = {
  exportedAt: string
  items: (SecuredItemData & { createdAt?: string })[]
  folders: { id: string; name: string }[]
}

export class ExportError extends Error {}

async function exportKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, material, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ])
}

export async function encryptExport(payload: ExportPayload, password: string): Promise<string> {
  if (password.length < 12) throw new ExportError('Use uma senha de exportação com pelo menos 12 caracteres.')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await exportKey(password, salt, KDF_ITERATIONS)
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: AAD }, key, encoder.encode(JSON.stringify(payload)))
  return JSON.stringify(
    {
      format: EXPORT_FORMAT,
      version: 1,
      kdf: { algorithm: 'PBKDF2-SHA256', iterations: KDF_ITERATIONS, salt: toBase64(salt) },
      iv: toBase64(iv),
      ciphertext: toBase64(new Uint8Array(ct)),
    },
    null,
    1,
  )
}

export async function decryptExport(fileText: string, password: string): Promise<ExportPayload> {
  let file: { format?: string; version?: number; kdf?: { iterations?: number; salt?: string }; iv?: string; ciphertext?: string }
  try {
    file = JSON.parse(fileText)
  } catch {
    throw new ExportError('Arquivo inválido: não é um backup do SecureLink Vault.')
  }
  if (file.format !== EXPORT_FORMAT || file.version !== 1 || !file.kdf?.salt || !file.iv || !file.ciphertext) {
    throw new ExportError('Arquivo inválido: não é um backup do SecureLink Vault.')
  }
  const iterations = Number(file.kdf.iterations)
  if (!Number.isInteger(iterations) || iterations < 600_000 || iterations > 5_000_000) throw new ExportError('Parâmetros do backup inválidos.')
  try {
    const key = await exportKey(password, fromBase64(file.kdf.salt), iterations)
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(file.iv), additionalData: AAD }, key, fromBase64(file.ciphertext))
    const payload = JSON.parse(decoder.decode(pt)) as ExportPayload
    return {
      exportedAt: String(payload.exportedAt ?? ''),
      items: (Array.isArray(payload.items) ? payload.items : []).map((i) => normalizeItem(i)),
      folders: (Array.isArray(payload.folders) ? payload.folders : []).filter((f) => f && typeof f.name === 'string'),
    }
  } catch (err) {
    if (err instanceof ExportError) throw err
    throw new ExportError('Senha do backup incorreta ou arquivo corrompido.')
  }
}

/* ------------------------------------------------------------------ CSV import */

/** RFC 4180-style CSV parser (quotes, escaped quotes, CRLF, commas or semicolons). */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, '')
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? ''
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === delimiter) {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++
      row.push(field)
      if (row.some((f) => f.trim() !== '')) rows.push(row)
      row = []
      field = ''
    } else field += ch
  }
  row.push(field)
  if (row.some((f) => f.trim() !== '')) rows.push(row)
  return rows
}

// Header aliases used by Chrome/Edge, Firefox, Bitwarden, 1Password and LastPass exports.
const COLUMNS: Record<keyof Pick<SecuredItemData, 'title' | 'url' | 'username' | 'password' | 'notes'> | 'folder' | 'totp', string[]> = {
  title: ['name', 'title', 'nome', 'título', 'titulo'],
  url: ['url', 'login_uri', 'website', 'site', 'origin', 'hostname'],
  username: ['username', 'login_username', 'login', 'user', 'email', 'usuário', 'usuario'],
  password: ['password', 'login_password', 'senha'],
  notes: ['note', 'notes', 'extra', 'comments', 'notas'],
  folder: ['folder', 'grouping', 'pasta', 'group'],
  totp: ['totp', 'login_totp', 'otpauth'],
}

export type CsvImport = { items: SecuredItemData[]; skipped: number; folders: string[]; source: string }

export function itemsFromCsv(text: string): CsvImport {
  const rows = parseCsv(text)
  if (rows.length < 2) throw new ExportError('CSV vazio ou sem cabeçalho.')
  const header = rows[0].map((h) => h.trim().toLowerCase())
  const col = (key: keyof typeof COLUMNS) => header.findIndex((h) => COLUMNS[key].includes(h))
  const idx = { title: col('title'), url: col('url'), username: col('username'), password: col('password'), notes: col('notes'), folder: col('folder'), totp: col('totp') }
  if (idx.password < 0) throw new ExportError('Não encontrei a coluna de senha no CSV (ex.: "password", "login_password" ou "senha").')
  const source = header.includes('login_password') ? 'Bitwarden' : header.includes('grouping') ? 'LastPass' : header.includes('origin') || header.includes('httprealm') ? 'Firefox' : 'Chrome/Edge/genérico'

  const items: SecuredItemData[] = []
  const folders = new Set<string>()
  let skipped = 0
  for (const r of rows.slice(1, 5001)) {
    const get = (i: number) => (i >= 0 ? (r[i] ?? '').trim() : '')
    const password = get(idx.password)
    const url = get(idx.url)
    if (!password) {
      skipped++
      continue
    }
    let title = get(idx.title)
    if (!title) {
      try {
        title = new URL(url.includes('://') ? url : `https://${url}`).hostname
      } catch {
        title = get(idx.username) || 'Item importado'
      }
    }
    const folder = get(idx.folder)
    if (folder) folders.add(folder)
    const totp = get(idx.totp)
    const item: SecuredItemData = {
      ...emptyItem('login'),
      title: title.slice(0, LIMITS.title),
      username: get(idx.username),
      password,
      url,
      notes: get(idx.notes).slice(0, LIMITS.notes),
      tags: normalizeTags(['importado', ...(folder ? [folder] : [])]),
      customFields: totp ? [{ id: crypto.randomUUID(), label: 'TOTP', value: totp, hidden: true }] : [],
      passwordUpdatedAt: null,
    }
    items.push(item)
  }
  return { items, skipped, folders: [...folders], source }
}
