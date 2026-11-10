// Off-site backup of a SecureVault project: database (roles, schema, data incl. auth) + Storage
// objects + manifest, packed and encrypted with a passphrase. Runs on the operator's machine; nothing
// is sent anywhere except the reads from Supabase and one "system.backup" audit event.
//
// Requirements: Node 20+, Docker running (used by `supabase db dump`), tar (built into Windows 10+).
// Environment (set in the shell session only; never write them to a file in the repo):
//   SUPABASE_DB_URL            postgres connection string of the project (Session pooler, with password)
//   SUPABASE_URL               https://<ref>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY  service role key (Storage export, audit head, backup event)
//   BACKUP_PASSPHRASE          >= 16 characters; keep it in the owner's vault AND on paper
//   BACKUP_NO_PUBLIC_TIMESTAMP optional: 1 skips the OpenTimestamps stamp of the audit anchor
//
//   node scripts/backup/backup.mjs [outDir]      default outDir: ~/SecureVaultBackups
//
// The data stays end-to-end encrypted inside the dump (vault items, keys and files are ciphertext),
// but the dump also holds e-mails, password hashes of the accounts and metadata: that is why the
// whole archive is encrypted again here.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { appendFile, mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { encryptFile } from './crypt.mjs';
import { stampFile } from './timestamp.mjs';

const BUCKET = 'vault-files';
const env = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`Set ${k} in this shell session first (see the header of this script).`);
  return v;
};

const dbUrl = env('SUPABASE_DB_URL');
const apiUrl = env('SUPABASE_URL').replace(/\/$/, '');
const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
env('BACKUP_PASSPHRASE');
const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

const sha256 = (file) =>
  new Promise((resolve, reject) => {
    const h = createHash('sha256');
    createReadStream(file).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });

async function api(path, init = {}) {
  const res = await fetch(`${apiUrl}${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path.split('?')[0]}: HTTP ${res.status}`);
  return res;
}

async function listAll(prefix = '') {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await api(`/storage/v1/object/list/${BUCKET}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }),
    });
    const page = await res.json();
    for (const e of page) {
      const path = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.id === null) out.push(...(await listAll(path)));
      else out.push({ path, size: e.metadata?.size ?? null });
    }
    if (page.length < 1000) return out;
  }
}

// npx (from the running Node install, no shell of ours, so the URL is passed literally) resolves the
// Supabase CLI, which runs pg_dump inside Docker.
const npxCli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');
function dump(file, extra) {
  execFileSync(process.execPath, [npxCli, '--yes', 'supabase', 'db', 'dump', '--db-url', dbUrl, '-f', file, ...extra], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
}

const outDir = process.argv[2] ?? join(homedir(), 'SecureVaultBackups');
await mkdir(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const work = await mkdtemp(join(outDir, `.work-${stamp}-`));
const name = `securevault-${stamp}`;

try {
  console.log('1/5 Database dump (roles, schema, data)…');
  dump(join(work, 'roles.sql'), ['--role-only']);
  dump(join(work, 'schema.sql'), []);
  dump(join(work, 'data.sql'), ['--use-copy', '--data-only']);

  console.log('2/5 Storage objects (already end-to-end encrypted)…');
  const objects = await listAll();
  for (const [i, o] of objects.entries()) {
    const res = await api(`/storage/v1/object/${BUCKET}/${o.path.split('/').map(encodeURIComponent).join('/')}`);
    const target = join(work, 'storage', ...o.path.split('/'));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, Buffer.from(await res.arrayBuffer()), { mode: 0o600 });
    if ((i + 1) % 50 === 0) console.log(`   ${i + 1}/${objects.length}`);
  }

  console.log('3/5 Audit chain head and manifest…');
  const head = (await (await api('/rest/v1/audit_events?select=chain_seq,row_hash,created_at&order=chain_seq.desc.nullslast&limit=1')).json())[0] ?? null;
  const files = {};
  for (const f of ['roles.sql', 'schema.sql', 'data.sql']) files[f] = { sha256: await sha256(join(work, f)), bytes: (await stat(join(work, f))).size };
  const manifest = {
    format: 'securevault-backup/1',
    created_at: new Date().toISOString(),
    project: new URL(apiUrl).hostname.split('.')[0],
    files,
    storage: { bucket: BUCKET, objects: objects.length, bytes: objects.reduce((s, o) => s + (o.size ?? 0), 0) },
    audit_head: head,
  };
  await writeFile(join(work, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log('4/5 Packing and encrypting…');
  // Relative names with cwd: GNU tar (Git Bash) would read "C:\..." as a remote host.
  const tarFile = join(work, `${name}.tar`);
  execFileSync('tar', ['-cf', `${name}.tar`, 'manifest.json', 'roles.sql', 'schema.sql', 'data.sql', ...(objects.length ? ['storage'] : [])], { cwd: work });
  const encFile = join(outDir, `${name}.svbk`);
  await encryptFile(tarFile, encFile);
  const encHash = await sha256(encFile);
  await writeFile(join(outDir, `${name}.svbk.sha256`), `${encHash}  ${name}.svbk\n`);

  console.log('5/5 Recording the backup in the audit log…');
  await api('/rest/v1/audit_events', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({
      user_id: null,
      event: 'system.backup',
      source: 'server',
      details: { file: `${name}.svbk`, sha256: encHash, objects: objects.length, audit_seq: head?.chain_seq ?? null },
    }),
  });

  // External anchor of the audit chain: a plain, non-sensitive line (sequence + hash) kept OUTSIDE
  // the database. verify-anchors.mjs later proves the chain was not rewritten since this point.
  if (head) {
    const anchor =
      JSON.stringify({ at: manifest.created_at, project: manifest.project, seq: head.chain_seq, hash: head.row_hash, backup: `${name}.svbk` }) + '\n';
    await appendFile(join(outDir, 'audit-anchors.jsonl'), anchor);
    // Public, independent timestamp (OpenTimestamps): only the SHA-256 of this file leaves the machine.
    if (process.env.BACKUP_NO_PUBLIC_TIMESTAMP !== '1') {
      const anchorFile = join(outDir, `audit-anchor-${head.chain_seq}.json`);
      await writeFile(anchorFile, anchor);
      const stamp = await stampFile(anchorFile);
      console.log(
        stamp.ok
          ? `Anchor timestamped by ${stamp.ok} public calendar(s): ${anchorFile}.ots ("ots upgrade" in a few hours adds the Bitcoin proof).`
          : `Public timestamp unavailable (${stamp.failed.length} calendar(s) failed); the local anchor is still valid.`,
      );
    }
  }

  console.log(`\nDone: ${encFile}`);
  console.log(`SHA-256: ${encHash}`);
  console.log(`Audit head: #${head?.chain_seq ?? '-'} ${head?.row_hash ?? '(chain not enabled yet)'}`);
  console.log('Copy the .svbk file, audit-anchors.jsonl and the audit-anchor-*.json(.ots) files to a second location (external disk or another cloud). Test a restore monthly.');
} finally {
  await rm(work, { recursive: true, force: true });
}
