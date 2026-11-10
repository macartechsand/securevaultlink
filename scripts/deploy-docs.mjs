#!/usr/bin/env node
/**
 * Builds the documentation portal (VitePress, docs/) and deploys it to its own Netlify site.
 *
 * The portal is deployed from a staging folder OUTSIDE the repository with its own netlify.toml, so the
 * app's netlify.toml (strict CSP for the vault app, build command) never applies to it, and the deploy
 * never builds anything on Netlify (--no-build).
 *
 *   node scripts/deploy-docs.mjs            # build + deploy to production URL of the docs site
 *   node scripts/deploy-docs.mjs --draft    # build + draft deploy (unique preview URL)
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE_ID = '8dc53b9a-bb24-40c4-82bb-f2183dec2d0e'; // securevault-docs-macartech (team portal)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const docs = join(root, 'docs');
const dist = join(docs, '.vitepress', 'dist');
const draft = process.argv.includes('--draft');
const win = process.platform === 'win32';

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: win });
  if (r.status !== 0) throw new Error(`${cmd} ${args[0]} failed (${r.status})`);
}

// Docs pages are static: inline scripts/styles come from VitePress (theme switch) and Mermaid SVGs.
const NETLIFY_TOML = `[build]
  publish = "."
  command = ""

[[headers]]
  for = "/*"
  [headers.values]
    Content-Security-Policy = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'"
    Strict-Transport-Security = "max-age=63072000; includeSubDomains"
    X-Content-Type-Options = "nosniff"
    X-Frame-Options = "DENY"
    Referrer-Policy = "no-referrer"
    Permissions-Policy = "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
    # Internal team portal: keep it out of search engines.
    X-Robots-Tag = "noindex, nofollow"
`;

if (!existsSync(join(docs, 'node_modules', '.bin'))) run('npm', ['ci'], docs);
run('npm', ['run', 'build'], docs);
if (!existsSync(join(dist, 'index.html'))) throw new Error('docs build produced no index.html');

const stage = mkdtempSync(join(tmpdir(), 'sv-docs-'));
try {
  cpSync(dist, stage, { recursive: true });
  writeFileSync(join(stage, 'netlify.toml'), NETLIFY_TOML);
  writeFileSync(join(stage, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
  const args = ['-y', 'netlify-cli', 'deploy', '--no-build', '--dir', '.', '--site', SITE_ID, '--message', 'docs portal (deploy-docs.mjs)'];
  if (!draft) args.push('--prod');
  run('npx', args, stage);
} finally {
  // Best effort: on Windows the CLI can keep a handle on the folder for a moment.
  try {
    rmSync(stage, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  } catch {
    console.warn(`Pasta temporária não removida: ${stage}`);
  }
}
