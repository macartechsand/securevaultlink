// Builds the browser extension for PRODUCTION and proves it talks only to the production project and
// opens the production web app. Output:
//   web-saas/dist-extension-prod/                       load it unpacked (edge://extensions or chrome://extensions)
//   ~/.securelink-prod/securelink-extension-prod.zip    the same folder zipped, to send to beta users
//
// web-saas/dist-extension (npm run build:ext) is the DEVELOPMENT build. Both builds have the same
// extension ID, so the browser can have only one of them loaded at a time.
//
// Requirements: Supabase CLI logged in (reads the public anon key).
//
//   node scripts/build-prod-extension.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROD_REF = 'exglsdylytdjwrlmyptk';
const DEV_REF = 'sueemdqyhwnmbqokpefz';
const PROD_APP = 'https://securelinkvault.netlify.app';
const DEV_APP = 'https://securelinkvaultdev.netlify.app';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const web = join(root, 'web-saas');
const out = join(web, 'dist-extension-prod');
const zip = join(homedir(), '.securelink-prod', 'securelink-extension-prod.zip');
// npx from the running Node install: no shell, so arguments are passed literally (no PowerShell splitting).
const npx = (args, opts = {}) =>
  execFileSync(process.execPath, [join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js'), '--yes', ...args], opts);
const fail = (msg) => {
  console.error(`\nREFUSED: ${msg}`);
  process.exit(1);
};

console.log('1/4 Reading the public anon key of production…');
const keys = JSON.parse(npx(['supabase', 'projects', 'api-keys', '--project-ref', PROD_REF, '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
const anon = keys.find((k) => k.name === 'anon')?.api_key;
if (!anon) fail('could not read the anon key (is the Supabase CLI logged in?).');

console.log('2/4 Building the extension with the production settings…');
// Process variables win over .env.local in Vite, so .env.local (development) is ignored here.
npx(['vite', 'build', '-c', 'extension/vite.config.ts', '--outDir', out, '--emptyOutDir'], {
  cwd: web,
  stdio: ['ignore', 'ignore', 'inherit'],
  env: { ...process.env, VITE_SUPABASE_URL: `https://${PROD_REF}.supabase.co`, VITE_SUPABASE_ANON_KEY: anon, VITE_WEB_APP_URL: PROD_APP },
});

console.log('3/4 Checking the package…');
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
const texts = walk(out).filter((f) => /\.(js|html|json)$/.test(f)).map((f) => readFileSync(f, 'utf8'));
const all = texts.join('\n');
if (all.includes(DEV_REF)) fail('the package references the DEVELOPMENT project.');
if (all.includes(DEV_APP)) fail('the package opens the DEVELOPMENT web app.');
if (!all.includes(PROD_REF)) fail('the package does not reference the production project.');
if (!all.includes(PROD_APP)) fail('the package does not open the production web app.');
const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'));
// Phase 2: web pages (in-page menu and save bar) + the production Supabase project, nothing else.
const hosts = manifest.host_permissions ?? [];
const expectedHosts = [`https://${PROD_REF}.supabase.co/*`, 'http://*/*', 'https://*/*'];
if (hosts.length !== expectedHosts.length || !expectedHosts.every((h) => hosts.includes(h))) fail(`unexpected host permissions: ${hosts.join(', ')}`);
const csp = manifest.content_security_policy?.extension_pages ?? '';
if (!csp.endsWith(`connect-src https://${PROD_REF}.supabase.co`)) fail(`unexpected network policy: ${csp}`);
for (const m of all.matchAll(/eyJ[\w-]+\.([\w-]+)\.[\w-]+/g)) {
  let p = null;
  try {
    p = JSON.parse(Buffer.from(m[1], 'base64url').toString());
  } catch {
    continue;
  }
  if (p.ref !== PROD_REF || p.role !== 'anon') fail(`unexpected key in the package: ${p.ref}/${p.role}`);
}
console.log(`   ok: network only ${expectedHosts[0]}, opens ${PROD_APP}, version ${manifest.version}`);

console.log('4/4 Zipping…');
if (existsSync(zip)) rmSync(zip);
execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Compress-Archive -Path '${out}\\*' -DestinationPath '${zip}'`], { stdio: 'inherit' });
console.log(`\nDone.\n  Load unpacked: ${out}\n  Send to users: ${zip}`);
