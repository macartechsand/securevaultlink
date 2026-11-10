// Public, independent timestamp of an audit anchor with OpenTimestamps (docs/product/innovation.md 9.3).
//
// Only the SHA-256 of the anchor file leaves the machine. Public calendars aggregate it into a Bitcoin
// transaction within hours; afterwards anyone can prove, without trusting SecureLink, that the anchor
// (sequence + hash of the audit chain) already existed at that time:
//   pip install opentimestamps-client
//   ots upgrade audit-anchor-<seq>.json.ots     (a few hours later: pulls the Bitcoin proof)
//   ots verify  audit-anchor-<seq>.json.ots     (needs the .json next to it)
//
// The .ots file is the standard format: header, file hash (SHA-256) and the merged answers of every
// calendar that responded (each one alone is enough to verify).
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

export const CALENDARS = [
  'https://a.pool.opentimestamps.org',
  'https://b.pool.opentimestamps.org',
  'https://a.pool.eternitywall.com',
];

// "\x00OpenTimestamps\x00\x00Proof\x00" + magic, version 1, then the file-hash operation (0x08 = SHA-256).
const HEADER = Buffer.from('004f70656e54696d657374616d7073000050726f6f6600bf89e2e884e89294', 'hex');
const VERSION = Buffer.from([0x01]);
const OP_SHA256 = Buffer.from([0x08]);
const FORK = Buffer.from([0xff]);

async function submit(calendar, digest, timeoutMs) {
  const res = await fetch(`${calendar}/digest`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/vnd.opentimestamps.v1', 'user-agent': 'securelink-backup' },
    body: digest,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = Buffer.from(await res.arrayBuffer());
  if (body.length < 8 || body.length > 10_000) throw new Error('unexpected answer');
  return body;
}

/** Builds the .ots bytes from the file digest and the calendars' answers (merged as forks). */
export function buildOts(digest, answers) {
  const parts = [HEADER, VERSION, OP_SHA256, digest];
  answers.forEach((answer, i) => {
    if (i < answers.length - 1) parts.push(FORK);
    parts.push(answer);
  });
  return Buffer.concat(parts);
}

/** Stamps `path`, writing `path.ots`. Never throws: returns which calendars answered. */
export async function stampFile(path, { calendars = CALENDARS, timeoutMs = 15_000 } = {}) {
  const digest = createHash('sha256').update(await readFile(path)).digest();
  const results = await Promise.allSettled(calendars.map((c) => submit(c, digest, timeoutMs)));
  const answers = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  const failed = calendars.filter((_, i) => results[i].status === 'rejected');
  if (answers.length) await writeFile(`${path}.ots`, buildOts(digest, answers));
  return { digest: digest.toString('hex'), ok: answers.length, failed };
}
