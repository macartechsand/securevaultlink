/**
 * Build of the browser extension (Manifest V3, Chrome and Edge): `npm run build:ext`.
 * Output: web-saas/dist-extension (load it unpacked, or zip it for the stores).
 *
 * - Shares web-saas/src (crypto, items, services) instead of duplicating it.
 * - Swaps web-saas/src/lib/supabase.ts for extension/src/supabase.ts (chrome.storage session).
 * - Writes manifest.json with the Supabase project as the only host permission.
 */
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { type Plugin, defineConfig, loadEnv } from 'vite'

const here = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(here, '..')
const sharedClient = resolve(appRoot, 'src/lib/supabase.ts')
const extensionClient = resolve(here, 'src/supabase.ts')

function swapSupabaseClient(): Plugin {
  return {
    name: 'securelink:swap-supabase-client',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer || !/supabase$/.test(source)) return null
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
      if (resolved && resolve(resolved.id) === sharedClient) return extensionClient
      return null
    },
  }
}

function manifest(env: Record<string, string>, testHosts: boolean): Plugin {
  const supabaseUrl = env.VITE_SUPABASE_URL
  if (!supabaseUrl) throw new Error('VITE_SUPABASE_URL is required to build the extension')
  const supabaseOrigin = new URL(supabaseUrl).origin
  const pkg = { version: '0.1.0' }
  return {
    name: 'securelink:manifest',
    generateBundle() {
      const json = {
        manifest_version: 3,
        name: 'SecureLink Vault',
        short_name: 'SecureLink',
        description: 'Preenche logins do seu cofre SecureLink com criptografia de ponta a ponta.',
        version: pkg.version,
        minimum_chrome_version: '116',
        action: { default_popup: 'popup.html', default_title: 'SecureLink Vault' },
        background: { service_worker: 'background.js', type: 'module' },
        icons: { '16': 'icons/icon-192.png', '48': 'icons/icon-192.png', '128': 'icons/icon-192.png' },
        permissions: ['storage', 'activeTab', 'scripting', 'alarms', 'idle', 'offscreen', 'clipboardWrite'],
        // Only the Supabase project. Pages are reached through activeTab (a user gesture), never in the background.
        host_permissions: [`${supabaseOrigin}/*`, ...(testHosts ? ['http://localhost/*', 'http://127.0.0.1/*'] : [])],
        commands: {
          'fill-login': {
            suggested_key: { default: 'Ctrl+Shift+L', mac: 'Command+Shift+L' },
            description: 'Preencher o login deste site',
          },
        },
        content_security_policy: {
          extension_pages: `script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; connect-src ${supabaseOrigin}`,
        },
      }
      this.emitFile({ type: 'asset', fileName: 'manifest.json', source: JSON.stringify(json, null, 2) })
    },
    writeBundle(options) {
      const out = options.dir!
      mkdirSync(resolve(out, 'icons'), { recursive: true })
      for (const f of ['icon-192.png', 'icon-512.png']) copyFileSync(resolve(appRoot, 'public/icons', f), resolve(out, 'icons', f))
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, appRoot, 'VITE_')
  // `--mode test-hosts` adds localhost to the host permissions, only for the end-to-end test build.
  const testHosts = mode === 'test-hosts'
  return {
    root: here,
    envDir: appRoot,
    publicDir: false,
    plugins: [swapSupabaseClient(), react(), manifest(env, testHosts)],
    build: {
      outDir: resolve(appRoot, testHosts ? 'dist-extension-test' : 'dist-extension'),
      emptyOutDir: true,
      // No inline scripts or eval: the MV3 CSP forbids them anyway.
      modulePreload: false,
      sourcemap: false,
      rollupOptions: {
        input: {
          popup: resolve(here, 'popup.html'),
          offscreen: resolve(here, 'offscreen.html'),
          background: resolve(here, 'src/background.ts'),
        },
        output: {
          entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
        },
      },
    },
  }
})
