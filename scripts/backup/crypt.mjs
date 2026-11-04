// Passphrase encryption for off-site backups: scrypt (N=2^17, r=8, p=1) -> AES-256-GCM, streamed.
// File layout: "SVBK1" | salt (16) | nonce (12) | ciphertext | tag (16).
// Decryption writes to a temporary file and only renames it after the tag verifies.
//
//   node scripts/backup/crypt.mjs encrypt <in> <out>     (passphrase from BACKUP_PASSPHRASE)
//   node scripts/backup/crypt.mjs decrypt <in> <out>
//   node scripts/backup/crypt.mjs self-test
import { createCipheriv, createDecipheriv, randomBytes, scrypt as scryptCb } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { open, rename, rm, writeFile, readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);
const MAGIC = Buffer.from('SVBK1');
const HEADER = MAGIC.length + 16 + 12;
const TAG = 16;

function passphrase() {
  const p = process.env.BACKUP_PASSPHRASE ?? '';
  if (p.length < 16) throw new Error('BACKUP_PASSPHRASE must be set and have at least 16 characters.');
  return p;
}

const deriveKey = (pass, salt) => scrypt(pass, salt, 32, { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 });

export async function encryptFile(input, output, pass = passphrase()) {
  const salt = randomBytes(16);
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', await deriveKey(pass, salt), nonce);
  cipher.setAAD(MAGIC);
  const out = createWriteStream(output, { mode: 0o600 });
  out.write(Buffer.concat([MAGIC, salt, nonce]));
  await pipeline(createReadStream(input), cipher, out, { end: false });
  await new Promise((resolve, reject) => out.end(cipher.getAuthTag(), (e) => (e ? reject(e) : resolve())));
}

export async function decryptFile(input, output, pass = passphrase()) {
  // Size and reads come from the same open handle (no check-then-open race on the path).
  const fh = await open(input, 'r');
  const { size } = await fh.stat();
  if (size < HEADER + TAG) {
    await fh.close();
    throw new Error('Not a SecureVault backup file.');
  }
  const head = Buffer.alloc(HEADER);
  const tag = Buffer.alloc(TAG);
  await fh.read(head, 0, HEADER, 0);
  await fh.read(tag, 0, TAG, size - TAG);
  await fh.close();
  if (!head.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Not a SecureVault backup file.');
  const salt = head.subarray(MAGIC.length, MAGIC.length + 16);
  const nonce = head.subarray(MAGIC.length + 16, HEADER);
  const decipher = createDecipheriv('aes-256-gcm', await deriveKey(pass, salt), nonce);
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(tag);
  const partial = `${output}.partial`;
  try {
    await pipeline(createReadStream(input, { start: HEADER, end: size - TAG - 1 }), decipher, createWriteStream(partial, { mode: 0o600 }));
  } catch {
    await rm(partial, { force: true });
    throw new Error('Decryption failed: wrong passphrase or the file was modified.');
  }
  await rename(partial, output);
}

async function selfTest() {
  const dir = await mkdtemp(join(tmpdir(), 'svbk-'));
  const plain = join(dir, 'plain.bin');
  const data = randomBytes(3 * 1024 * 1024 + 7);
  await writeFile(plain, data);
  const pass = 'self-test passphrase 0123456789';
  await encryptFile(plain, join(dir, 'enc'), pass);
  await decryptFile(join(dir, 'enc'), join(dir, 'dec'), pass);
  if (!(await readFile(join(dir, 'dec'))).equals(data)) throw new Error('round trip mismatch');
  let rejected = 0;
  await decryptFile(join(dir, 'enc'), join(dir, 'bad'), 'wrong passphrase 0123456789').catch(() => (rejected += 1));
  const enc = await readFile(join(dir, 'enc'));
  enc[HEADER + 100] ^= 1;
  await writeFile(join(dir, 'tampered'), enc);
  await decryptFile(join(dir, 'tampered'), join(dir, 'bad2'), pass).catch(() => (rejected += 1));
  await rm(dir, { recursive: true, force: true });
  if (rejected !== 2) throw new Error('wrong passphrase or tampering was not rejected');
  console.log('crypt self-test: ok (round trip, wrong passphrase rejected, tampering rejected)');
}

if (process.argv[1]?.endsWith('crypt.mjs')) {
  const [cmd, a, b] = process.argv.slice(2);
  const run = cmd === 'encrypt' ? () => encryptFile(a, b) : cmd === 'decrypt' ? () => decryptFile(a, b) : cmd === 'self-test' ? selfTest : null;
  if (!run) {
    console.error('usage: node crypt.mjs encrypt|decrypt <in> <out> | self-test');
    process.exit(2);
  }
  run().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
