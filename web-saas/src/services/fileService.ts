import {
  FILE_CHUNK_SIZE,
  type FileMetadata,
  createTransferKeys,
  decryptFileContent,
  decryptFileMetadata,
  encryptFileContent,
  encryptFileMetadata,
  generateFileKey,
  generateUserKeyPair,
  openSealedFileKey,
  openTransferKey,
  sealFileKeyForRecipient,
  unwrapFileKeyForOwner,
  unwrapUserPrivateKey,
  wrapFileKeyForOwner,
} from '../lib/crypto';
import { supabase } from '../lib/supabase';

export const BUCKET = 'vault-files';
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const QUOTA_BYTES = 100 * 1024 * 1024;
export const TRANSFER_MAX_DAYS = 7;

export class FileServiceError extends Error {}

const fail = (action: string, error?: { message: string } | null): never => {
  throw new FileServiceError(`${action} failed${error?.message ? `: ${error.message}` : ''}`);
};

export type KeyContext = { dek: CryptoKey; userId: string };
export type UserKeyPair = { publicKey: string; privateKey: CryptoKey };

type FileRow = {
  id: string;
  owner_id: string;
  kind: 'vault' | 'transfer';
  status: string;
  chunk_size: number;
  size_bytes: number;
  encrypted_meta: string;
  wrapped_key: string;
  storage_path: string;
  expires_at: string | null;
  created_at: string;
};

export type VaultFile = {
  id: string;
  kind: 'vault' | 'transfer';
  meta: FileMetadata;
  sizeBytes: number;
  chunkSize: number;
  storagePath: string;
  createdAt: string;
  expiresAt: string | null;
};

export type SharedFile = VaultFile & { shareId: string; ownerEmail: string; sealedKey: string };

export type FileShare = { id: string; recipientEmail?: string; recipientId: string; createdAt: string };

export type Transfer = {
  id: string;
  fileId: string;
  fileName: string;
  maxDownloads: number;
  downloadCount: number;
  revoked: boolean;
  expiresAt: string;
  hasPassword: boolean;
};

const FILE_COLUMNS =
  'id, owner_id, kind, status, chunk_size, size_bytes, encrypted_meta, wrapped_key, storage_path, expires_at, created_at';

/* ------------------------------------------------------------------ key pair */

/** Loads the user's sharing key pair, creating it on first use. */
export async function ensureUserKeyPair({ dek, userId }: KeyContext): Promise<UserKeyPair> {
  const { data, error } = await supabase
    .from('user_keys')
    .select('public_key, wrapped_private_key')
    .maybeSingle<{ public_key: string; wrapped_private_key: string }>();
  if (error) fail('Loading sharing keys', error);
  if (data) {
    return { publicKey: data.public_key, privateKey: await unwrapUserPrivateKey(dek, userId, data.wrapped_private_key) };
  }
  const pair = await generateUserKeyPair(dek, userId);
  const { error: insertError } = await supabase
    .from('user_keys')
    .insert({ public_key: pair.publicKey, wrapped_private_key: pair.wrappedPrivateKey });
  if (insertError) fail('Creating sharing keys', insertError);
  return { publicKey: pair.publicKey, privateKey: await unwrapUserPrivateKey(dek, userId, pair.wrappedPrivateKey) };
}

/* ------------------------------------------------------------------ helpers */

function toVaultFile(row: FileRow, meta: FileMetadata): VaultFile {
  return {
    id: row.id,
    kind: row.kind,
    meta,
    sizeBytes: row.size_bytes,
    chunkSize: row.chunk_size,
    storagePath: row.storage_path,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

async function downloadObject(path: string): Promise<Uint8Array<ArrayBuffer>> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) fail('Downloading file', error);
  return new Uint8Array(await data!.arrayBuffer());
}

/** Replaces path separators, reserved and control characters in a (decrypted, untrusted) file name. */
export function safeFileName(name: string) {
  const cleaned = [...name].map((ch) => (ch.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(ch) ? '_' : ch)).join('');
  return cleaned.trim().slice(0, 200) || 'download';
}

/** Saves decrypted bytes. Always served as octet-stream so nothing is rendered inside the app origin. */
export function saveToDisk(bytes: Uint8Array<ArrayBuffer>, name: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = safeFileName(name);
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/* ------------------------------------------------------------------ own files */

async function uploadEncrypted(
  ctx: KeyContext,
  file: File,
  kind: 'vault' | 'transfer',
  expiresAt: string | null,
): Promise<{ file: VaultFile; fileKey: Uint8Array<ArrayBuffer> }> {
  if (file.size > MAX_FILE_BYTES) throw new FileServiceError('Files can have at most 25 MB on the free plan.');
  const id = crypto.randomUUID();
  const fileKey = generateFileKey();
  const meta: FileMetadata = { name: file.name, type: file.type || 'application/octet-stream', size: file.size };
  const ciphertext = await encryptFileContent(fileKey, id, new Uint8Array(await file.arrayBuffer()));
  const storagePath = `${ctx.userId}/${id}`;

  const { error: rowError } = await supabase.from('vault_files').insert({
    id,
    kind,
    chunk_size: FILE_CHUNK_SIZE,
    size_bytes: ciphertext.length,
    encrypted_meta: await encryptFileMetadata(fileKey, id, meta),
    wrapped_key: await wrapFileKeyForOwner(ctx.dek, ctx.userId, id, fileKey),
    storage_path: storagePath,
    expires_at: expiresAt,
  });
  if (rowError) fail('Preparing upload', rowError);

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, new Blob([ciphertext], { type: 'application/octet-stream' }), {
      contentType: 'application/octet-stream',
      upsert: false,
    });
  if (uploadError) {
    await supabase.from('vault_files').delete().eq('id', id);
    fail('Uploading file', uploadError);
  }

  const { data: status, error: finalizeError } = await supabase.rpc('finalize_vault_file', { p_file_id: id });
  if (finalizeError || status !== 'ready') {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    await supabase.from('vault_files').delete().eq('id', id);
    fail('Verifying upload', finalizeError ?? { message: 'size mismatch' });
  }

  return {
    file: {
      id,
      kind,
      meta,
      sizeBytes: ciphertext.length,
      chunkSize: FILE_CHUNK_SIZE,
      storagePath,
      createdAt: new Date().toISOString(),
      expiresAt,
    },
    fileKey,
  };
}

export async function uploadVaultFile(ctx: KeyContext, file: File): Promise<VaultFile> {
  return (await uploadEncrypted(ctx, file, 'vault', null)).file;
}

/** Lists the caller's own ready files (vault and transfer uploads), with decrypted names. */
export async function listOwnFiles(ctx: KeyContext): Promise<{ files: VaultFile[]; undecryptable: number }> {
  const { data, error } = await supabase
    .from('vault_files')
    .select(FILE_COLUMNS)
    .eq('owner_id', ctx.userId)
    .eq('status', 'ready')
    .order('created_at', { ascending: false })
    .returns<FileRow[]>();
  if (error) fail('Loading files', error);
  const files: VaultFile[] = [];
  let undecryptable = 0;
  for (const row of data ?? []) {
    try {
      const key = await unwrapFileKeyForOwner(ctx.dek, ctx.userId, row.id, row.wrapped_key);
      files.push(toVaultFile(row, await decryptFileMetadata(key, row.id, row.encrypted_meta)));
    } catch {
      undecryptable += 1;
    }
  }
  return { files, undecryptable };
}

export async function downloadOwnFile(ctx: KeyContext, file: VaultFile) {
  const { data, error } = await supabase
    .from('vault_files')
    .select('wrapped_key')
    .eq('id', file.id)
    .single<{ wrapped_key: string }>();
  if (error || !data) fail('Loading file key', error);
  const key = await unwrapFileKeyForOwner(ctx.dek, ctx.userId, file.id, data!.wrapped_key);
  const plain = await decryptFileContent(key, file.id, await downloadObject(file.storagePath), file.chunkSize);
  saveToDisk(plain, file.meta.name);
}

export async function deleteFile(file: VaultFile) {
  const { error: storageError } = await supabase.storage.from(BUCKET).remove([file.storagePath]);
  if (storageError) fail('Deleting file', storageError);
  const { error } = await supabase.from('vault_files').delete().eq('id', file.id);
  if (error) fail('Deleting file record', error);
}

export function usedBytes(files: VaultFile[]) {
  return files.reduce((sum, f) => sum + f.sizeBytes, 0);
}

/* ------------------------------------------------------------------ sharing */

export async function findRecipient(email: string): Promise<{ userId: string; publicKey: string } | null> {
  const { data, error } = await supabase.rpc('find_share_recipient', { p_email: email });
  if (error) fail('Looking up recipient', error);
  const row = (data as { user_id: string; public_key: string }[] | null)?.[0];
  return row ? { userId: row.user_id, publicKey: row.public_key } : null;
}

export async function shareFile(ctx: KeyContext, file: VaultFile, recipient: { userId: string; publicKey: string }) {
  const { data, error } = await supabase
    .from('vault_files')
    .select('wrapped_key')
    .eq('id', file.id)
    .single<{ wrapped_key: string }>();
  if (error || !data) fail('Loading file key', error);
  const key = await unwrapFileKeyForOwner(ctx.dek, ctx.userId, file.id, data!.wrapped_key);
  const sealed = await sealFileKeyForRecipient(recipient.publicKey, key, file.id, recipient.userId);
  const { error: insertError } = await supabase
    .from('file_shares')
    .insert({ file_id: file.id, recipient_id: recipient.userId, sealed_key: sealed });
  if (insertError) {
    if (insertError.code === '23505') throw new FileServiceError('This file is already shared with that person.');
    fail('Sharing file', insertError);
  }
}

export async function listSharesForFile(fileId: string): Promise<FileShare[]> {
  const { data, error } = await supabase
    .from('file_shares')
    .select('id, recipient_id, recipient_email, created_at')
    .eq('file_id', fileId)
    .returns<{ id: string; recipient_id: string; recipient_email: string | null; created_at: string }[]>();
  if (error) fail('Loading shares', error);
  return (data ?? []).map((s) => ({
    id: s.id,
    recipientId: s.recipient_id,
    recipientEmail: s.recipient_email ?? undefined,
    createdAt: s.created_at,
  }));
}

/** Removes a share (owner revokes, or recipient removes it from their list). */
export async function removeShare(shareId: string) {
  const { error } = await supabase.from('file_shares').delete().eq('id', shareId);
  if (error) fail('Removing share', error);
}

export async function listSharedWithMe(ctx: KeyContext, keys: UserKeyPair): Promise<{ files: SharedFile[]; undecryptable: number }> {
  const { data, error } = await supabase
    .from('file_shares')
    .select(`id, owner_email, sealed_key, vault_files!inner(${FILE_COLUMNS})`)
    .eq('recipient_id', ctx.userId)
    .order('created_at', { ascending: false });
  if (error) fail('Loading shared files', error);
  const files: SharedFile[] = [];
  let undecryptable = 0;
  for (const share of (data ?? []) as unknown as { id: string; owner_email: string | null; sealed_key: string; vault_files: FileRow }[]) {
    const row = share.vault_files;
    if (row.status !== 'ready') continue;
    try {
      const key = await openSealedFileKey(keys.privateKey, keys.publicKey, share.sealed_key, row.id, ctx.userId);
      const meta = await decryptFileMetadata(key, row.id, row.encrypted_meta);
      files.push({ ...toVaultFile(row, meta), shareId: share.id, ownerEmail: share.owner_email ?? 'unknown', sealedKey: share.sealed_key });
    } catch {
      undecryptable += 1;
    }
  }
  return { files, undecryptable };
}

export async function downloadSharedFile(ctx: KeyContext, keys: UserKeyPair, file: SharedFile) {
  const key = await openSealedFileKey(keys.privateKey, keys.publicKey, file.sealedKey, file.id, ctx.userId);
  const plain = await decryptFileContent(key, file.id, await downloadObject(file.storagePath), file.chunkSize);
  saveToDisk(plain, file.meta.name);
}

/* ------------------------------------------------------------------ transfers */

export async function createTransfer(
  ctx: KeyContext,
  file: File,
  options: { days: number; maxDownloads: number; password: string | null },
): Promise<{ link: string; transfer: Transfer; file: VaultFile }> {
  const days = Math.min(Math.max(Math.trunc(options.days), 1), TRANSFER_MAX_DAYS);
  // A little under the limit so the server-side check (created_at + 7 days) always passes.
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000 - 60_000).toISOString();
  const { file: uploaded, fileKey } = await uploadEncrypted(ctx, file, 'transfer', expiresAt);

  const id = crypto.randomUUID();
  const keys = await createTransferKeys(id, fileKey, options.password || null);
  const { error } = await supabase.from('transfers').insert({
    id,
    file_id: uploaded.id,
    wrapped_key: keys.wrappedFileKey,
    password_salt: keys.passwordSalt,
    max_downloads: options.maxDownloads,
    expires_at: expiresAt,
  });
  if (error) {
    await deleteFile(uploaded).catch(() => undefined);
    fail('Creating transfer', error);
  }
  const link = `${window.location.origin}/?transfer=${id}#k=${keys.linkSecret}`;
  return {
    link,
    file: uploaded,
    transfer: {
      id,
      fileId: uploaded.id,
      fileName: uploaded.meta.name,
      maxDownloads: options.maxDownloads,
      downloadCount: 0,
      revoked: false,
      expiresAt,
      hasPassword: Boolean(options.password),
    },
  };
}

export async function listTransfers(ownFiles: VaultFile[]): Promise<Transfer[]> {
  const { data, error } = await supabase
    .from('transfers')
    .select('id, file_id, max_downloads, download_count, revoked, expires_at, password_salt')
    .order('created_at', { ascending: false })
    .returns<{ id: string; file_id: string; max_downloads: number; download_count: number; revoked: boolean; expires_at: string; password_salt: string | null }[]>();
  if (error) fail('Loading transfers', error);
  return (data ?? []).map((t) => ({
    id: t.id,
    fileId: t.file_id,
    fileName: ownFiles.find((f) => f.id === t.file_id)?.meta.name ?? '(encrypted file)',
    maxDownloads: t.max_downloads,
    downloadCount: t.download_count,
    revoked: t.revoked,
    expiresAt: t.expires_at,
    hasPassword: Boolean(t.password_salt),
  }));
}

export async function revokeTransfer(id: string) {
  const { error } = await supabase.from('transfers').update({ revoked: true }).eq('id', id);
  if (error) fail('Revoking transfer', error);
}

/* ------------------------------------------------------------------ public transfer download */

export type TransferInfo = {
  fileId: string;
  wrappedKey: string;
  passwordSalt: string | null;
  expiresAt: string;
  remainingDownloads: number;
  encryptedMeta: string;
  chunkSize: number;
  size: number;
};

async function callTransfer<T>(body: { id: string; action: 'info' | 'download' }): Promise<T> {
  const { data, error } = await supabase.functions.invoke('transfer', { body });
  if (error) {
    let message = 'This transfer is not available (expired, revoked or used up).';
    try {
      const ctx = (error as { context?: Response }).context;
      const payload = ctx ? await ctx.json() : null;
      if (payload?.error) message = payload.error;
    } catch {
      /* keep default */
    }
    throw new FileServiceError(message);
  }
  return data as T;
}

export function fetchTransferInfo(id: string) {
  return callTransfer<TransferInfo>({ id, action: 'info' });
}

/** Opens the transfer key locally (link secret + optional password) and decrypts the file details. */
export async function unlockTransfer(id: string, linkSecret: string, info: TransferInfo, password: string | null) {
  const fileKey = await openTransferKey(id, linkSecret, info.wrappedKey, password, info.passwordSalt);
  const meta = await decryptFileMetadata(fileKey, info.fileId, info.encryptedMeta);
  return { fileKey, meta };
}

export async function downloadTransfer(id: string, fileKey: Uint8Array<ArrayBuffer>, info: TransferInfo, name: string) {
  const { url } = await callTransfer<{ url: string }>({ id, action: 'download' });
  const response = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!response.ok) throw new FileServiceError('Download failed.');
  const plain = await decryptFileContent(fileKey, info.fileId, new Uint8Array(await response.arrayBuffer()), info.chunkSize);
  saveToDisk(plain, name);
}
