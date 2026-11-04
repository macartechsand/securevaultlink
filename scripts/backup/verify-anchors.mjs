// Checks the audit chain of a project against the anchors that backup.mjs wrote OUTSIDE the database
// (audit-anchors.jsonl). The in-database check (admin_audit_verify) proves the chain is internally
// consistent; it cannot see a chain that was rewritten end to end by someone with full database
// access. An anchor can: a rewritten chain no longer has the same hash at the anchored sequence.
//
// Environment (shell session only):
//   SUPABASE_URL               https://<ref>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY  service role key (reads audit_events)
//
//   node scripts/backup/verify-anchors.mjs [anchorsFile]   default: ~/SecureVaultBackups/audit-anchors.jsonl
//
// Exit code 0 = every anchor matches (or was removed by the logged retention purge), 1 = mismatch.
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const env = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`Set ${k} in this shell session first (see the header of this script).`);
  return v;
};
const apiUrl = env('SUPABASE_URL').replace(/\/$/, '');
const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
const project = new URL(apiUrl).hostname.split('.')[0];
const file = process.argv[2] ?? join(homedir(), 'SecureVaultBackups', 'audit-anchors.jsonl');

async function rest(path) {
  const res = await fetch(`${apiUrl}/rest/v1/${path}`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
  if (!res.ok) throw new Error(`GET ${path.split('?')[0]}: HTTP ${res.status}`);
  return res.json();
}

const anchors = (await readFile(file, 'utf8'))
  .split('\n')
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l))
  .filter((a) => a.project === project);
// The file is local but untrusted input for the query below: only a positive integer and a hex hash pass.
for (const a of anchors) {
  if (!Number.isSafeInteger(a.seq) || a.seq < 1 || typeof a.hash !== 'string' || !/^[0-9a-f]{64}$/i.test(a.hash)) {
    throw new Error(`Invalid anchor line in ${file}: ${JSON.stringify(a).slice(0, 120)}`);
  }
}
if (anchors.length === 0) {
  console.log(`No anchors for project ${project} in ${file}.`);
  process.exit(0);
}

const [head] = await rest('audit_events?select=chain_seq,row_hash&order=chain_seq.desc.nullslast&limit=1');
const [first] = await rest('audit_events?select=chain_seq&order=chain_seq.asc.nullslast&limit=1');
const purges = await rest("audit_events?select=details&event=eq.system.audit_purged&order=chain_seq.asc");
const purgedUpto = Math.max(0, ...purges.map((p) => Number(p.details?.upto_seq ?? 0)));

let bad = 0;
for (const a of anchors) {
  let verdict;
  if (!head || a.seq > head.chain_seq) {
    verdict = 'MISMATCH: the chain is now shorter than this anchor (events removed or chain replaced)';
  } else if (first && a.seq < first.chain_seq) {
    const purge = purges.find((p) => Number(p.details?.upto_seq) === a.seq);
    verdict =
      a.seq > purgedUpto ? 'MISMATCH: events before the current start are missing without a retention purge'
      : purge && purge.details.anchor !== a.hash ? 'MISMATCH: the logged purge anchor differs from this anchor'
      : 'ok (removed by the logged 365-day retention purge)';
  } else {
    const [row] = await rest(`audit_events?select=row_hash&chain_seq=eq.${a.seq}`);
    verdict = row?.row_hash === a.hash ? 'ok' : 'MISMATCH: different hash at this sequence (chain rewritten)';
  }
  if (verdict.startsWith('MISMATCH')) bad += 1;
  console.log(`#${a.seq} (${a.at}, ${a.backup}): ${verdict}`);
}
console.log(`\nHead now: #${head?.chain_seq ?? '-'}. ${anchors.length} anchor(s) checked, ${bad} mismatch(es).`);
console.log('Also run Administração → Conformidade → "Verificar log de auditoria" for the internal check.');
process.exit(bad ? 1 : 0);
