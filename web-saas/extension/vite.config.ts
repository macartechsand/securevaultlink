/**
 * Build of the browser extension (Manifest V3, Chrome and Edge): `npm run build:ext`.
 * Output: web-saas/dist-extension (load it unpacked, or zip it for the stores).
 *
 * - Shares web-saas/src (crypto, items, services) instead of duplicating it.
 * - Swaps web-saas/src/lib/supabase.ts for extension/src/supabase.ts (chrome.storage session).
 * - Writes manifest.json. Network access (connect-src) is only the Supabase project. Phase 2 adds a
 *   content script on http/https pages (login suggestions and "save password"), which needs host
 *   access to pages to fill from the in-page menu; see docs/product/browser-extension.md.
 */
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { type Plugin, defineConfig, loadEnv } from 'vite'

const here = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(here, '..')
const sharedClient = resolve(appRoot, 'src/lib/supabase.ts')
const extensionClient = resolve(here, 'src/supabase.ts')

/**
 * emptyOutDir deletes the output folder before writing. A mistyped --outDir (for example the app
 * folder itself) would erase source files, so only folders named dist* are accepted.
 */
function guardOutDir(): Plugin {
  return {
    name: 'securelink-guard-outdir',
    configResolved(config) {
      const out = resolve(config.root, config.build.outDir)
      if (!basename(out).startsWith('dist') || out === appRoot || appRoot.startsWith(out)) {
        throw new Error(`Refusing to build into ${out}: the output folder must be a dist* folder.`)
      }
    },
  }
}

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

/**
 * Public key that fixes the extension ID (mcljapeloopnadipmhmojkmbjjgbpdij) for unpacked installs, so
 * the OAuth redirect https://<id>.chromiumapp.org/ is stable. Store packages are built with
 * `--mode store`, which drops it (the stores assign their own ID and key).
 */
const manifestKey = JSON.parse(readFileSync(resolve(here, 'manifest-key.json'), 'utf8')) as { key: string; id: string }

/** The content script is loaded as a classic script: an import statement would break it silently. */
function contentScriptIsStandalone(): Plugin {
  return {
    name: 'securelink:content-standalone',
    generateBundle(_options, bundle) {
      const chunk = bundle['content.js']
      if (chunk && chunk.type === 'chunk' && (chunk.imports.length || /^s*import[s{*]/m.test(chunk.code))) {
        throw new Error(`content.js imports other chunks (${chunk.imports.join(', ')}); keep src/content.ts self-contained.`)
      }
    },
  }
}

function manifest(env: Record<string, string>, testHosts: boolean, store: boolean): Plugin {
  const supabaseUrl = env.VITE_SUPABASE_URL
  if (!supabaseUrl) throw new Error('VITE_SUPABASE_URL is required to build the extension')
  const supabaseOrigin = new URL(supabaseUrl).origin
  const pkg = { version: '0.2.0' }
  return {
    name: 'securelink:manifest',
    generateBundle() {
      const json = {
        manifest_version: 3,
        name: 'SecureLink Vault',
        short_name: 'SecureLink',
        description: 'Preenche logins do seu cofre SecureLink com criptografia de ponta a ponta.',
        version: pkg.version,
        ...(store ? {} : { key: manifestKey.key }),
        minimum_chrome_version: '116',
        action: { default_popup: 'popup.html', default_title: 'SecureLink Vault' },
        background: { service_worker: 'background.js', type: 'module' },
        icons: { '16': 'icons/icon-192.png', '48': 'icons/icon-192.png', '128': 'icons/icon-192.png' },
        permissions: ['storage', 'activeTab', 'scripting', 'alarms', 'idle', 'offscreen', 'clipboardWrite', 'identity'],
        // The Supabase project, plus web pages: filling from the in-page menu happens after a click
        // inside the extension's own frame, which does not grant activeTab.
        host_permissions: [`${supabaseOrigin}/*`, 'http://*/*', 'https://*/*', ...(testHosts ? ['http://localhost/*', 'http://127.0.0.1/*'] : [])],
        content_scripts: [{ matches: ['http://*/*', 'https://*/*'], js: ['content.js'], all_frames: true, run_at: 'document_idle' }],
        // The menu and the save bar are extension pages framed by the content script. Only these two
        // pages (and their bundles) can be loaded by sites; the popup cannot. Static URLs on purpose:
        // the background checks the exact sender page (accepted cost: a site can detect the extension).
        web_accessible_resources: [{ resources: ['inline.html', 'save.html', 'assets/*'], matches: ['http://*/*', 'https://*/*'] }],
        commands: {
          'fill-login': {
            suggested_key: { default: 'Ctrl+Shift+L', mac: 'Command+Shift+L' },
            description: 'Preencher o login deste site',
          },
        },
        content_security_policy: {
          // frame-ancestors: the in-page menu and save bar are framed by web pages; every other
          // extension page is not web-accessible, so sites cannot frame it anyway.
          extension_pages: `script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self' http: https:; connect-src ${supabaseOrigin}`,
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
    plugins: [guardOutDir(), swapSupabaseClient(), react(), manifest(env, testHosts, mode === 'store'), contentScriptIsStandalone()],
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
          inline: resolve(here, 'inline.html'),
          save: resolve(here, 'save.html'),
          content: resolve(here, 'src/content.ts'),
        },
        output: {
          // content.js runs as a classic script: it must not import shared chunks (checked after the build).
          entryFileNames: (chunk) => (chunk.name === 'background' || chunk.name === 'content' ? `${chunk.name}.js` : 'assets/[name]-[hash].js'),
        },
      },
    },
  }
})
