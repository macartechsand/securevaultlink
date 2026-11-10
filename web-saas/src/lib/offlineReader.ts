/**
 * Offline backup reader (contingency): a single self-contained HTML page that opens an encrypted
 * export (lib/vaultExport.ts) with its export password, without the SecureLink servers, the app or
 * internet access. Users keep it next to their backups for the day the service is unreachable.
 *
 * The page carries its own CSP with connect-src 'none', so it cannot send anything anywhere, and it
 * renders with textContent only (no HTML from the backup is ever interpreted).
 *
 * The two functions below are embedded in the page with Function.prototype.toString, so they must be
 * self-contained: no imports, no closures over module scope, only browser globals.
 */

export type StandaloneBackup = {
  exportedAt: string
  items: Record<string, unknown>[]
  folders: { id: string; name: string }[]
}

/** Same format and checks as decryptExport (vaultExport.ts), written without imports. */
export async function openBackupStandalone(fileText: string, password: string): Promise<StandaloneBackup> {
  const invalid = 'Arquivo inválido: não é um backup do SecureLink Vault.'
  const enc = new TextEncoder()
  const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
  let file: { format?: string; version?: number; kdf?: { iterations?: number; salt?: string }; iv?: string; ciphertext?: string }
  try {
    file = JSON.parse(fileText)
  } catch {
    throw new Error(invalid)
  }
  if (!file || file.format !== 'securevault-export' || file.version !== 1 || !file.kdf?.salt || !file.iv || !file.ciphertext) throw new Error(invalid)
  const iterations = Number(file.kdf.iterations)
  if (!Number.isInteger(iterations) || iterations < 600_000 || iterations > 5_000_000) throw new Error('Parâmetros do backup inválidos.')
  let plain: ArrayBuffer
  try {
    const material = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt: b64(file.kdf.salt), iterations },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt'],
    )
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(file.iv), additionalData: enc.encode('securevault:export:v1') }, key, b64(file.ciphertext))
  } catch {
    throw new Error('Senha do backup incorreta ou arquivo corrompido.')
  }
  const payload = JSON.parse(new TextDecoder().decode(plain)) as { exportedAt?: unknown; items?: unknown; folders?: unknown }
  return {
    exportedAt: String(payload.exportedAt ?? ''),
    items: Array.isArray(payload.items) ? (payload.items as Record<string, unknown>[]) : [],
    folders: Array.isArray(payload.folders) ? (payload.folders as { id: string; name: string }[]) : [],
  }
}

/** Wires the page: file + password -> list of items, secrets hidden until "Mostrar". */
export function mountOfflineReader(open: typeof openBackupStandalone) {
  const $ = (id: string) => document.getElementById(id) as HTMLElement
  const el = (tag: string, text?: string, cls?: string) => {
    const node = document.createElement(tag)
    if (text !== undefined) node.textContent = text
    if (cls) node.className = cls
    return node
  }
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  const types: Record<string, string> = { login: 'Login', note: 'Nota segura', secret: 'Segredo', card: 'Cartão' }

  const row = (list: HTMLElement, label: string, value: string, secret: boolean) => {
    if (!value) return
    const line = el('div', undefined, 'row')
    line.appendChild(el('span', label, 'label'))
    const val = el('code', secret ? '••••••••' : value)
    line.appendChild(val)
    if (secret) {
      const show = el('button', 'Mostrar')
      show.addEventListener('click', () => {
        const hidden = val.textContent !== value
        val.textContent = hidden ? value : '••••••••'
        show.textContent = hidden ? 'Ocultar' : 'Mostrar'
      })
      line.appendChild(show)
    }
    const copy = el('button', 'Copiar')
    copy.addEventListener('click', () => void navigator.clipboard?.writeText(value))
    line.appendChild(copy)
    list.appendChild(line)
  }

  const render = (data: StandaloneBackup) => {
    const out = $('out')
    out.replaceChildren()
    const folders = new Map(data.folders.map((f) => [f.id, f.name]))
    out.appendChild(el('p', `${data.items.length} item(ns) · backup de ${data.exportedAt ? new Date(data.exportedAt).toLocaleString('pt-BR') : 'data desconhecida'}`, 'muted'))
    const query = el('input') as HTMLInputElement
    query.placeholder = 'Buscar por título, usuário ou site'
    out.appendChild(query)
    const list = el('div')
    out.appendChild(list)
    const draw = () => {
      list.replaceChildren()
      const q = query.value.toLowerCase()
      for (const item of data.items) {
        const hay = `${str(item.title)} ${str(item.username)} ${str(item.url)}`.toLowerCase()
        if (q && !hay.includes(q)) continue
        const card = el('section', undefined, 'card')
        card.appendChild(el('h2', str(item.title) || '(sem título)'))
        const folder = folders.get(str(item.folderId))
        card.appendChild(el('p', [types[str(item.type)] ?? 'Item', folder].filter(Boolean).join(' · '), 'muted'))
        row(card, 'Usuário', str(item.username), false)
        row(card, item.type === 'secret' ? 'Segredo' : 'Senha', str(item.password), true)
        row(card, 'Site', str(item.url), false)
        row(card, 'OTP (segredo)', str(item.otp), true)
        const c = (item.card ?? {}) as Record<string, unknown>
        row(card, 'Titular', str(c.holder), false)
        row(card, 'Número', str(c.number), true)
        row(card, 'Validade', str(c.expiry), false)
        row(card, 'CVV', str(c.cvv), true)
        for (const f of Array.isArray(item.customFields) ? (item.customFields as Record<string, unknown>[]) : []) row(card, str(f.label) || 'Campo', str(f.value), f.hidden === true)
        if (str(item.notes)) card.appendChild(el('pre', str(item.notes)))
        list.appendChild(card)
      }
    }
    query.addEventListener('input', draw)
    draw()
  }

  $('form').addEventListener('submit', (event) => {
    event.preventDefault()
    const file = ($('file') as HTMLInputElement).files?.[0]
    const pw = $('pw') as HTMLInputElement
    const err = $('err')
    err.textContent = ''
    if (!file) {
      err.textContent = 'Escolha o arquivo do backup.'
      return
    }
    err.textContent = 'Abrindo…'
    void file
      .text()
      .then((text) => open(text, pw.value))
      .then((data) => {
        err.textContent = ''
        pw.value = ''
        render(data)
      })
      .catch((e: unknown) => {
        err.textContent = e instanceof Error ? e.message : 'Não foi possível abrir o backup.'
      })
  })
  $('lock').addEventListener('click', () => {
    $('out').replaceChildren()
    ;($('pw') as HTMLInputElement).value = ''
  })
}

const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'"

/** The complete reader page, ready to save as a .html file. */
export function offlineReaderHtml(): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="referrer" content="no-referrer">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Leitor offline de backup</title>
<style>
:root{color-scheme:light dark;--bg:#f6f7f9;--fg:#15181d;--muted:#5d6673;--card:#fff;--line:#d9dde3}
@media (prefers-color-scheme:dark){:root{--bg:#0f1216;--fg:#e8ebef;--muted:#9aa4b1;--card:#171b21;--line:#2a3039}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif}
main{max-width:760px;margin:0 auto;padding:24px 16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin:12px 0}
.card h2{font-size:16px;margin:0}.muted{color:var(--muted);margin:4px 0}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0}.label{min-width:80px;color:var(--muted)}
code{overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0 0}
input,button{font:inherit;padding:8px 10px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--fg)}
input{width:100%;box-sizing:border-box;margin:6px 0}button{cursor:pointer}#err{color:#c0392b;min-height:1.5em}
</style>
</head>
<body>
<main>
<h1>Leitor offline de backup</h1>
<p class="muted">Abre um backup cifrado do SecureLink Vault neste computador, sem internet e sem os servidores do SecureLink. Esta página não envia nada: a rede está bloqueada pela política de segurança dela.</p>
<form id="form" class="card">
<label>Arquivo do backup (.json)<input id="file" type="file" accept=".json,application/json"></label>
<label>Senha da exportação<input id="pw" type="password" autocomplete="off"></label>
<button type="submit">Abrir</button> <button type="button" id="lock">Fechar e limpar</button>
<p id="err" role="alert"></p>
</form>
<div id="out"></div>
</main>
<script>
const openBackupStandalone = ${openBackupStandalone.toString()};
(${mountOfflineReader.toString()})(openBackupStandalone);
</script>
</body>
</html>
`
}
