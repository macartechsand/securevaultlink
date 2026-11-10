// Builds the web app for PRODUCTION, proves the bundle talks only to the production project, and
// publishes it to the production Netlify site WITHOUT letting Netlify rebuild it.
//
// Why: `netlify deploy` runs the [build] command of netlify.toml first (npm run build), which reads
// web-saas/.env.local = DEVELOPMENT and silently replaces the production bundle. That happened on
// 2026-11-04 and 2026-11-05. This script always passes --no-build and checks the bundle twice
// (before publishing, and the live site after).
//
// Requirements: Supabase CLI logged in (reads the public anon key), Netlify CLI logged in.
//
//   node scripts/deploy-prod-site.mjs            build + verify + publish + verify live
//   node scripts/deploy-prod-site.mjs --dry-run  build + verify only
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROD_REF = 'exglsdylytdjwrlmyptk';
const DEV_REF = 'sueemdqyhwnmbqokpefz';
const SITE_ID = '074110e2-19ba-4fdc-82f8-ad7a5d7cab4f';
const SITE_URL = 'https://securelinkvault.netlify.app';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const web = join(root, 'web-saas');
const dist = join(web, 'dist');
const dryRun = process.argv.includes('--dry-run');
// npx from the running Node install: no shell, so arguments are passed literally (no PowerShell splitting).
const npx = (args, opts = {}) =>
  execFileSync(process.execPath, [join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js'), '--yes', ...args], opts);

function fail(msg) {
  console.error(`\nREFUSED: ${msg}`);
  process.exit(1);
}

/** Checks a set of { name, text } files: production ref present, no dev ref, only the prod anon JWT. */
function verify(files, where) {
  let prod = 0;
  const roles = new Set();
  for (const { name, text } of files) {
    if (text.includes(DEV_REF)) fail(`${where}: ${name} references the DEVELOPMENT project.`);
    if (text.includes(PROD_REF)) prod += 1;
    for (const m of text.matchAll(/eyJ[\w-]+\.([\w-]+)\.[\w-]+/g)) {
      try {
        const p = JSON.parse(Buffer.from(m[1], 'base64url').toString());
        roles.add(`${p.ref}/${p.role}`);
      } catch {
        /* not a JWT */
      }
    }
  }
  if (prod === 0) fail(`${where}: no file references the production project.`);
  const bad = [...roles].filter((r) => r !== `${PROD_REF}/anon`);
  if (bad.length) fail(`${where}: unexpected keys in the bundle: ${bad.join(', ')}`);
  console.log(`   ok (${where}): production project in ${prod} file(s), no development reference, keys: ${[...roles].join(', ') || 'none'}`);
}

console.log('1/4 Reading the public anon key of production…');
const keys = JSON.parse(npx(['supabase', 'projects', 'api-keys', '--project-ref', PROD_REF, '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
const anon = keys.find((k) => k.name === 'anon')?.api_key;
if (!anon) fail('could not read the anon key (is the Supabase CLI logged in?).');

console.log('2/4 Building web-saas with the production settings…');
// Process variables win over .env.local in Vite, so .env.local (development) is ignored here.
npx(['vite', 'build', '--outDir', dist, '--emptyOutDir'], {
  cwd: web,
  stdio: ['ignore', 'ignore', 'inherit'],
  env: { ...process.env, VITE_SUPABASE_URL: `https://${PROD_REF}.supabase.co`, VITE_SUPABASE_ANON_KEY: anon },
});

console.log('3/4 Checking every file of the bundle…');
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
verify(
  walk(dist).filter((f) => /\.(js|html|json|webmanifest)$/.test(f)).map((f) => ({ name: f.slice(dist.length + 1), text: readFileSync(f, 'utf8') })),
  'local bundle',
);

if (dryRun) {
  console.log('\nDry run: nothing published.');
  process.exit(0);
}

console.log('4/4 Publishing (--no-build, so Netlify cannot replace the bundle) and checking the live site…');
npx(['netlify-cli', 'deploy', '--prod', '--no-build', '--dir', dist, '--site', SITE_ID, '--message', 'production build (deploy-prod-site.mjs)'], {
  cwd: root,
  stdio: 'inherit',
});
const html = await (await fetch(`${SITE_URL}/`, { cache: 'no-store' })).text();
const live = [{ name: 'index.html', text: html }];
for (const [, path] of html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.js)"/g)) {
  live.push({ name: path, text: await (await fetch(`${SITE_URL}${path}`, { cache: 'no-store' })).text() });
}
verify(live, 'live site');
console.log(`\nDone: ${SITE_URL} talks only to production.`);
