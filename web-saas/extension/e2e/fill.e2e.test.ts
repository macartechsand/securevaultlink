/// <reference types="node" />
/**
 * End-to-end test of the extension in a real browser (Microsoft Edge, Chromium) against the
 * Supabase DEVELOPMENT project and test account A (same throw-away account as the integration tests).
 *
 *   npm run build:ext:test && npm run test:ext:e2e
 *
 * Replaces A's vault profile with a random master password (as session.integration does), creates
 * two logins, then drives the extension through the same messages the popup sends.
 */
import { existsSync } from 'node:fs'
import { type Server, createServer } from 'node:http'
import { resolve } from 'node:path'
import puppeteer, { type Browser, type Page } from 'puppeteer-core'
import { loadEnv } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createVault } from '../../src/lib/crypto'
import { emptyItem } from '../../src/lib/items'
import { supabase } from '../../src/lib/supabase'
import * as ops from '../../src/state/itemOps'
import * as vault from '../../src/services/vaultService'

const env = { ...loadEnv('test', process.cwd(), ''), ...process.env } as Record<string, string | undefined>
const EDGE = env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const EXT_DIR = resolve(process.cwd(), 'dist-extension-test')
const configured = Boolean(env.TEST_USER_A_EMAIL && env.TEST_USER_A_PASSWORD && existsSync(EDGE) && existsSync(EXT_DIR))
const MASTER = `Teste-Mestra-${crypto.randomUUID()}`
const SITE_PASSWORD = `pw-${crypto.randomUUID()}`
const PORT = 47311

const LOGIN_PAGE = `<!doctype html><html><body>
<form id="f"><input id="user" type="email" autocomplete="username"><input id="pass" type="password" autocomplete="current-password"><button>Entrar</button></form>
<script>window.inputEvents=0;document.addEventListener('input',()=>window.inputEvents++,true)</script></body></html>`
const FRAME_PAGE = `<!doctype html><html><body><p>Topo sem formulário</p>
<iframe id="ext" src="http://127.0.0.1:${PORT}/login" width="400" height="200"></iframe></body></html>`

type Msg = Record<string, unknown>

describe.skipIf(!configured)('browser extension end to end (Edge, dev project, account A)', () => {
  let server: Server
  let browser: Browser
  let popup: Page
  const created: string[] = []

  const send = <T = unknown>(msg: Msg) => popup.evaluate((m) => chrome.runtime.sendMessage(m), msg) as Promise<{ ok: boolean; data?: T; error?: string }>
  // Optional screenshots of the popup (EXT_SCREENSHOT_DIR=<folder>) for visual review.
  const shot = async (name: string) => {
    if (!env.EXT_SCREENSHOT_DIR) return
    await popup.setViewport({ width: 380, height: 600 })
    await popup.reload({ waitUntil: 'networkidle0' })
    await new Promise((r) => setTimeout(r, 1500))
    await popup.screenshot({ path: resolve(env.EXT_SCREENSHOT_DIR, `${name}.png`) as `${string}.png` })
  }
  const tabId = (urlPattern: string) =>
    popup.evaluate(async (pattern) => (await chrome.tabs.query({ url: pattern }))[0]?.id ?? -1, urlPattern)

  beforeAll(async () => {
    // Vault for account A with a known master password and two logins.
    const { data, error } = await supabase.auth.signInWithPassword({ email: env.TEST_USER_A_EMAIL!, password: env.TEST_USER_A_PASSWORD! })
    if (error || !data.user) throw new Error(`login failed: ${error?.message}`)
    const userId = data.user.id
    const fresh = await createVault(MASTER)
    if (await vault.fetchProfile()) await vault.updateProfile(userId, fresh.profile)
    else await vault.createProfile(fresh.profile)
    const ctx = { dek: fresh.dek, userId }
    const local = await ops.createItem(ctx, new Map(), {
      ...emptyItem('login'),
      title: 'E2E local',
      username: 'e2e@exemplo.com',
      password: SITE_PASSWORD,
      url: `http://localhost:${PORT}`,
    })
    const bank = await ops.createItem(ctx, new Map(), { ...emptyItem('login'), title: 'E2E banco', username: 'cliente', password: 'outra', url: 'https://banco.exemplo.com.br' })
    created.push(local.id, bank.id)
    await supabase.auth.signOut()

    server = createServer((req, res) => {
      res.setHeader('content-type', 'text/html; charset=utf-8')
      res.end(req.url?.startsWith('/frame') ? FRAME_PAGE : LOGIN_PAGE)
    }).listen(PORT)

    browser = await puppeteer.launch({
      executablePath: EDGE,
      headless: true,
      args: [`--disable-extensions-except=${EXT_DIR}`, `--load-extension=${EXT_DIR}`, '--no-first-run'],
    })
    const worker = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().endsWith('background.js'), { timeout: 15_000 })
    const extId = new URL(worker.url()).host
    popup = await browser.newPage()
    await popup.goto(`chrome-extension://${extId}/popup.html`)
  }, 60_000)

  afterAll(async () => {
    await browser?.close()
    server?.close()
    if (created.length) {
      await supabase.auth.signInWithPassword({ email: env.TEST_USER_A_EMAIL!, password: env.TEST_USER_A_PASSWORD! })
      for (const id of created) await vault.deleteEntry(id).catch(() => undefined)
      await supabase.auth.signOut()
    }
  })

  it('signs in, refuses a wrong master password and unlocks with the right one', async () => {
    await shot('popup-signin')
    expect((await send({ type: 'status' })).data).toMatchObject({ status: 'signed-out', idleMinutes: 10 })
    expect((await send({ type: 'signIn', email: env.TEST_USER_A_EMAIL, password: env.TEST_USER_A_PASSWORD })).ok).toBe(true)
    expect((await send<{ status: string }>({ type: 'status' })).data?.status).toBe('locked')
    const wrong = await send({ type: 'unlock', masterPassword: 'senha-errada-123' })
    expect(wrong.ok).toBe(false)
    expect(wrong.error).toMatch(/incorreta/)
    expect((await send({ type: 'unlock', masterPassword: MASTER })).ok).toBe(true)
    expect((await send<{ status: string }>({ type: 'status' })).data?.status).toBe('unlocked')
  }, 60_000)

  it('lists the matching login first and never sends passwords in the list', async () => {
    const res = await send<{ title: string; match: string; password?: string }[]>({ type: 'list', tabUrl: `http://localhost:${PORT}/login` })
    const list = res.data!.filter((i) => i.title.startsWith('E2E'))
    expect(list.map((i) => [i.title, i.match])).toEqual([
      ['E2E local', 'exact'],
      ['E2E banco', 'none'],
    ])
    expect(JSON.stringify(res.data)).not.toContain(SITE_PASSWORD)
    await shot('popup-vault')
  }, 30_000)

  it('fills the login form of the matching site', async () => {
    const page = await browser.newPage()
    await page.goto(`http://localhost:${PORT}/login`)
    const res = await send<{ ok: boolean }>({ type: 'fill', itemId: created[0], tabId: await tabId(`http://localhost/*`) })
    expect(res.data).toMatchObject({ ok: true, filled: { username: true, password: true } })
    expect(await page.$eval('#user', (e) => (e as HTMLInputElement).value)).toBe('e2e@exemplo.com')
    expect(await page.$eval('#pass', (e) => (e as HTMLInputElement).value)).toBe(SITE_PASSWORD)
    expect(await page.evaluate(() => (window as unknown as { inputEvents: number }).inputEvents)).toBeGreaterThanOrEqual(2)
    await page.close()
  }, 30_000)

  it('asks for confirmation before filling a login on a different site', async () => {
    const page = await browser.newPage()
    await page.goto(`http://127.0.0.1:${PORT}/login`)
    const tab = await tabId('http://127.0.0.1/*')
    const otherHost = await send({ type: 'fill', itemId: created[0], tabId: tab })
    expect(otherHost.data).toMatchObject({ ok: false, needsConfirm: true })
    const otherItem = await send({ type: 'fill', itemId: created[1], tabId: tab })
    expect(otherItem.data).toMatchObject({ ok: false, needsConfirm: true })
    expect(await page.$eval('#pass', (e) => (e as HTMLInputElement).value)).toBe('')
    await page.close()
  }, 30_000)

  it('never fills a third-party iframe', async () => {
    const page = await browser.newPage()
    await page.goto(`http://localhost:${PORT}/frame`)
    await page.waitForSelector('iframe')
    await new Promise((r) => setTimeout(r, 500))
    const res = await send<{ ok: boolean; error?: string }>({ type: 'fill', itemId: created[0], tabId: await tabId('http://localhost/*') })
    expect(res.data).toMatchObject({ ok: false })
    const frame = page.frames().find((f) => f.url().includes('127.0.0.1'))!
    expect(await frame.$eval('#pass', (e) => (e as HTMLInputElement).value)).toBe('')
    await page.close()
  }, 30_000)

  it('rejects requests from web pages and clears keys on lock', async () => {
    const page = await browser.newPage()
    await page.goto(`http://localhost:${PORT}/login`)
    // A web page has no chrome.runtime for this extension (no externally_connectable).
    expect(await page.evaluate(() => typeof (globalThis as { chrome?: { runtime?: { sendMessage?: unknown } } }).chrome?.runtime?.sendMessage)).toBe('undefined')
    await page.close()

    expect((await send({ type: 'lock' })).ok).toBe(true)
    const after = await send({ type: 'list', tabUrl: null })
    expect(after.ok).toBe(false)
    expect(await popup.evaluate(() => chrome.storage.session.get(null))).toEqual({})
    await send({ type: 'signOut' })
  }, 30_000)
})
