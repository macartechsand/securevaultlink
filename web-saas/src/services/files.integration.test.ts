/// <reference types="node" />
/**
 * File vault isolation tests against the Supabase DEVELOPMENT project
 * (requires migration 20261011000000_file_vault.sql). Same variables as rls.integration.test.ts,
 * read from the shell or from web-saas/.env.test.local (git-ignored). Throw-away accounts only.
 *
 *   npm test -- files.integration
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loadEnv } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const fileEnv = loadEnv('test', process.cwd(), '')
const env: Record<string, string | undefined> = {
  ...fileEnv,
  ...process.env,
  SUPABASE_TEST_URL: process.env.SUPABASE_TEST_URL || fileEnv.SUPABASE_TEST_URL || fileEnv.VITE_SUPABASE_URL,
  SUPABASE_TEST_ANON_KEY:
    process.env.SUPABASE_TEST_ANON_KEY || fileEnv.SUPABASE_TEST_ANON_KEY || fileEnv.VITE_SUPABASE_ANON_KEY,
}
const configured = [
  'SUPABASE_TEST_URL',
  'SUPABASE_TEST_ANON_KEY',
  'TEST_USER_A_EMAIL',
  'TEST_USER_A_PASSWORD',
  'TEST_USER_B_EMAIL',
  'TEST_USER_B_PASSWORD',
].every((key) => Boolean(env[key]))

const BUCKET = 'vault-files'
const newClient = () =>
  createClient(env.SUPABASE_TEST_URL!, env.SUPABASE_TEST_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

async function login(email: string, password: string) {
  const client = newClient()
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error || !data.user) throw new Error(`test login failed: ${error?.message}`)
  return { client, userId: data.user.id }
}

// Opaque test bytes standing in for ciphertext (the server never sees real content anyway).
const BODY = new Uint8Array(64).fill(7)

async function createReadyFile(owner: { client: SupabaseClient; userId: string }, kind: 'vault' | 'transfer' = 'vault') {
  const id = crypto.randomUUID()
  const path = `${owner.userId}/${id}`
  const row = {
    id,
    kind,
    chunk_size: 1048576,
    size_bytes: BODY.length,
    encrypted_meta: 'dGVzdA==',
    wrapped_key: 'dGVzdA==',
    storage_path: path,
    expires_at: kind === 'transfer' ? new Date(Date.now() + 3600_000).toISOString() : null,
  }
  const insert = await owner.client.from('vault_files').insert(row)
  if (insert.error) throw new Error(`insert failed: ${insert.error.message}`)
  const upload = await owner.client.storage
    .from(BUCKET)
    .upload(path, new Blob([BODY], { type: 'application/octet-stream' }), { contentType: 'application/octet-stream' })
  if (upload.error) throw new Error(`upload failed: ${upload.error.message}`)
  const fin = await owner.client.rpc('finalize_vault_file', { p_file_id: id })
  if (fin.error || fin.data !== 'ready') throw new Error(`finalize failed: ${fin.error?.message ?? fin.data}`)
  return { id, path }
}

describe.skipIf(!configured)('file vault isolation (dev project)', () => {
  let a: { client: SupabaseClient; userId: string }
  let b: { client: SupabaseClient; userId: string }
  const created: { id: string; path: string }[] = []

  beforeAll(async () => {
    a = await login(env.TEST_USER_A_EMAIL!, env.TEST_USER_A_PASSWORD!)
    b = await login(env.TEST_USER_B_EMAIL!, env.TEST_USER_B_PASSWORD!)
  })

  afterAll(async () => {
    if (!a) return
    await a.client.storage.from(BUCKET).remove(created.map((f) => f.path))
    await a.client.from('vault_files').delete().in('id', created.map((f) => f.id))
  })

  it('owner uploads, finalizes and downloads their file', async () => {
    const file = await createReadyFile(a)
    created.push(file)
    const { data, error } = await a.client.storage.from(BUCKET).download(file.path)
    expect(error).toBeNull()
    expect(new Uint8Array(await data!.arrayBuffer())).toEqual(BODY)
  })

  it('another user cannot read, download, overwrite or delete it', async () => {
    const file = created[0]
    const row = await b.client.from('vault_files').select('id').eq('id', file.id)
    expect(row.data ?? []).toEqual([])
    const dl = await b.client.storage.from(BUCKET).download(file.path)
    expect(dl.data).toBeNull()
    const signed = await b.client.storage.from(BUCKET).createSignedUrl(file.path, 60)
    expect(signed.data).toBeNull()
    await b.client.storage.from(BUCKET).remove([file.path])
    await b.client.from('vault_files').delete().eq('id', file.id)
    const still = await a.client.storage.from(BUCKET).download(file.path)
    expect(still.error).toBeNull()
  })

  it("a user cannot upload into someone else's folder or skip the pending row", async () => {
    const foreign = await b.client.storage
      .from(BUCKET)
      .upload(`${a.userId}/${crypto.randomUUID()}`, new Blob([BODY]), { contentType: 'application/octet-stream' })
    expect(foreign.error).not.toBeNull()
    const orphan = await b.client.storage
      .from(BUCKET)
      .upload(`${b.userId}/${crypto.randomUUID()}`, new Blob([BODY]), { contentType: 'application/octet-stream' })
    expect(orphan.error).not.toBeNull()
  })

  it('rejects rows created as ready, as another owner, or over the per-file limit', async () => {
    const base = { kind: 'vault', chunk_size: 1048576, encrypted_meta: 'x', wrapped_key: 'x' }
    const asReady = crypto.randomUUID()
    const r1 = await a.client.from('vault_files').insert({ ...base, id: asReady, status: 'ready', size_bytes: 64, storage_path: `${a.userId}/${asReady}` })
    expect(r1.error).not.toBeNull()
    const forged = crypto.randomUUID()
    const r2 = await b.client.from('vault_files').insert({ ...base, id: forged, owner_id: a.userId, size_bytes: 64, storage_path: `${a.userId}/${forged}` })
    expect(r2.error).not.toBeNull()
    const huge = crypto.randomUUID()
    const r3 = await a.client.from('vault_files').insert({ ...base, id: huge, size_bytes: 200 * 1024 * 1024, storage_path: `${a.userId}/${huge}` })
    expect(r3.error).not.toBeNull()
  })

  it('owners cannot bypass finalize or the quota by editing protected columns', async () => {
    const id = crypto.randomUUID()
    const path = `${a.userId}/${id}`
    created.push({ id, path })
    const ins = await a.client.from('vault_files').insert({ id, kind: 'vault', chunk_size: 1048576, size_bytes: 64, encrypted_meta: 'x', wrapped_key: 'x', storage_path: path })
    expect(ins.error).toBeNull()
    expect((await a.client.from('vault_files').update({ status: 'ready' }).eq('id', id)).error).not.toBeNull()
    expect((await a.client.from('vault_files').update({ size_bytes: 16 }).eq('id', id)).error).not.toBeNull()
    expect((await a.client.from('vault_files').update({ owner_id: b.userId }).eq('id', id)).error).not.toBeNull()
    const row = await a.client.from('vault_files').select('status, size_bytes').eq('id', id).single()
    expect(row.data).toEqual({ status: 'pending', size_bytes: 64 })
  })

  it('a finalize with a mismatched size is rejected', async () => {
    const id = crypto.randomUUID()
    const path = `${a.userId}/${id}`
    created.push({ id, path })
    await a.client.from('vault_files').insert({ id, kind: 'vault', chunk_size: 1048576, size_bytes: 16, encrypted_meta: 'x', wrapped_key: 'x', storage_path: path })
    await a.client.storage.from(BUCKET).upload(path, new Blob([BODY]), { contentType: 'application/octet-stream' })
    const fin = await a.client.rpc('finalize_vault_file', { p_file_id: id })
    expect(fin.data).toBe('rejected')
  })

  it('sharing grants the recipient access to that file only, and revoking removes it', async () => {
    const file = created[0]
    const other = await createReadyFile(a)
    created.push(other)

    // B cannot create a share for A's file.
    const forged = await b.client.from('file_shares').insert({ file_id: file.id, recipient_id: b.userId, owner_id: a.userId, sealed_key: 'x' })
    expect(forged.error).not.toBeNull()

    const share = await a.client.from('file_shares').insert({ file_id: file.id, recipient_id: b.userId, sealed_key: 'c2VhbGVk' }).select('id, owner_email, recipient_email').single()
    expect(share.error).toBeNull()
    expect(share.data?.owner_email).toBe(env.TEST_USER_A_EMAIL)
    expect(share.data?.recipient_email).toBe(env.TEST_USER_B_EMAIL)

    const row = await b.client.from('vault_files').select('id').eq('id', file.id)
    expect(row.data).toEqual([{ id: file.id }])
    const dl = await b.client.storage.from(BUCKET).download(file.path)
    expect(dl.error).toBeNull()

    // Not the other file.
    const dlOther = await b.client.storage.from(BUCKET).download(other.path)
    expect(dlOther.data).toBeNull()
    // Recipient cannot delete the owner's object.
    await b.client.storage.from(BUCKET).remove([file.path])
    expect((await a.client.storage.from(BUCKET).download(file.path)).error).toBeNull()

    await a.client.from('file_shares').delete().eq('id', share.data!.id)
    expect((await b.client.storage.from(BUCKET).download(file.path)).data).toBeNull()
  })

  it('transfers are private to the owner and downloads are only claimable by the backend', async () => {
    const file = await createReadyFile(a, 'transfer')
    created.push(file)
    const id = crypto.randomUUID()
    const t = await a.client.from('transfers').insert({
      id,
      file_id: file.id,
      wrapped_key: 'x',
      max_downloads: 2,
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
    })
    expect(t.error).toBeNull()

    expect((await b.client.from('transfers').select('id').eq('id', id)).data ?? []).toEqual([])
    expect((await newClient().from('transfers').select('id').eq('id', id)).data ?? []).toEqual([])

    // Owner cannot tamper with the download counter; only `revoked` is updatable.
    const bump = await a.client.from('transfers').update({ download_count: 0, max_downloads: 20 }).eq('id', id)
    expect(bump.error).not.toBeNull()

    // claim_transfer_download is service-role only.
    expect((await a.client.rpc('claim_transfer_download', { p_id: id })).error).not.toBeNull()
    expect((await newClient().rpc('claim_transfer_download', { p_id: id })).error).not.toBeNull()

    // Expiry longer than 7 days is refused.
    const tooLong = await a.client.from('transfers').insert({
      id: crypto.randomUUID(),
      file_id: file.id,
      wrapped_key: 'x',
      max_downloads: 1,
      expires_at: new Date(Date.now() + 8 * 24 * 3600_000).toISOString(),
    })
    expect(tooLong.error).not.toBeNull()
  })

  it('recipient lookup never returns the caller and is closed to anonymous users', async () => {
    const self = await a.client.rpc('find_share_recipient', { p_email: env.TEST_USER_A_EMAIL })
    expect(self.data ?? []).toEqual([])
    const anon = await newClient().rpc('find_share_recipient', { p_email: env.TEST_USER_A_EMAIL })
    expect(anon.error).not.toBeNull()
  })
})
