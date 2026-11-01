// Restore (or restore drill) of an off-site backup made by backup.mjs.
//
//   node scripts/backup/restore.mjs <file.svbk> <outDir>
//       Decrypts, checks every hash in the manifest and extracts. Touches no project.
//
//   node scripts/backup/restore.mjs <file.svbk> <outDir> --apply
//       Also loads the database and the Storage objects into a TARGET project:
//         TARGET_DB_URL, TARGET_SUPABASE_URL, TARGET_SERVICE_ROLE_KEY
//       The target must be a NEW, empty project (restore drill or disaster recovery). Restoring onto
//       the project the backup came from is refused unless --allow-same-project is also passed.
//
// BACKUP_PASSPHRASE must be set. Docker must be running for --apply (psql runs in a container).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { decryptFile } from './crypt.mjs';

const [input, outArg, ...flags] = process.argv.slice(2);
if (!input || !outArg) {
  console.error('usage: node restore.mjs <file.svbk> <outDir> [--apply] [--allow-same-project]');
  process.exit(2);
}
const out = resolve(outArg);
const apply = flags.includes('--apply');

const sha256 = (file) =>
  new Promise((ok, fail) => {
    const h = createHash('sha256');
    createReadStream(file).on('data', (d) => h.update(d)).on('end', () => ok(h.digest('hex'))).on('error', fail);
  });

async function walk(dir) {
  const found = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) found.push(...(await walk(p)));
    else found.push(p);
  }
  return found;
}

await mkdir(out, { recursive: true });
const tarFile = join(out, 'backup.tar');
console.log('1/3 Decrypting (the authentication tag is checked before anything is extracted)…');
await decryptFile(input, tarFile);
// Relative names with cwd: GNU tar (Git Bash) would read "C:\..." as a remote host.
execFileSync('tar', ['-xf', 'backup.tar'], { cwd: out });
await rm(tarFile);

console.log('2/3 Checking the manifest…');
const manifest = JSON.parse(await readFile(join(out, 'manifest.json'), 'utf8'));
for (const [f, meta] of Object.entries(manifest.files)) {
  if ((await sha256(join(out, f))) !== meta.sha256) throw new Error(`${f}: hash does not match the manifest`);
}
const storageDir = join(out, 'storage');
const objects = await stat(storageDir).then(() => walk(storageDir), () => []);
if (objects.length !== manifest.storage.objects) throw new Error(`storage: ${objects.length} objects, manifest says ${manifest.storage.objects}`);
console.log(`   ok: project ${manifest.project}, ${manifest.created_at}, ${objects.length} files, audit head #${manifest.audit_head?.chain_seq ?? '-'}`);

if (!apply) {
  console.log(`3/3 Extracted to ${out}. Nothing was loaded (use --apply with a TARGET project for a drill).`);
  process.exit(0);
}

const need = (k) => {
  if (!process.env[k]) throw new Error(`Set ${k} for --apply.`);
  return process.env[k];
};
const targetDb = need('TARGET_DB_URL');
const targetApi = need('TARGET_SUPABASE_URL').replace(/\/$/, '');
const targetKey = need('TARGET_SERVICE_ROLE_KEY');
const targetRef = new URL(targetApi).hostname.split('.')[0];
if (targetRef === manifest.project && !flags.includes('--allow-same-project')) {
  throw new Error('The target is the project this backup came from. Use a new project, or pass --allow-same-project in a real incident.');
}

console.log('3/3 Loading into the target project…');
// Same order Supabase documents for CLI restores: roles, schema, then data with triggers disabled.
execFileSync('docker', [
  'run', '--rm', '-v', `${out}:/backup:ro`, 'postgres:17-alpine',
  'psql', '--single-transaction', '--variable', 'ON_ERROR_STOP=1', '--dbname', targetDb,
  '--file', '/backup/roles.sql', '--file', '/backup/schema.sql',
  '--command', 'SET session_replication_role = replica', '--file', '/backup/data.sql',
], { stdio: 'inherit' });

const headers = { apikey: targetKey, Authorization: `Bearer ${targetKey}`, 'x-upsert': 'true' };
for (const [i, file] of objects.entries()) {
  const path = relative(storageDir, file).split(sep).map(encodeURIComponent).join('/');
  const res = await fetch(`${targetApi}/storage/v1/object/${manifest.storage.bucket}/${path}`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/octet-stream' },
    body: await readFile(file),
  });
  if (!res.ok) throw new Error(`upload ${path}: HTTP ${res.status}`);
  if ((i + 1) % 50 === 0) console.log(`   ${i + 1}/${objects.length}`);
}
console.log('Done. Now open the app against the target project, unlock a test vault and run "Verificar log de auditoria".');
