// Deletes every stored object (Supabase Storage and R2) owned by a user. Table rows go away with the
// auth.users cascade; objects would not, so this runs BEFORE the account (or vault) is deleted.
// Used by `account` (self-service deletion / vault reset) and `admin` (administrator deletion).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { r2Configured, r2Fetch } from './r2.ts'

export async function deleteUserFiles(admin: SupabaseClient, userId: string): Promise<{ ok: boolean; count: number }> {
  const { data: files, error } = await admin.from('vault_files').select('storage_path, storage_backend').eq('owner_id', userId)
  if (error) return { ok: false, count: 0 }
  const supabasePaths = (files ?? []).filter((f) => f.storage_backend !== 'r2').map((f) => f.storage_path)
  for (let i = 0; i < supabasePaths.length; i += 100) {
    const { error: removeError } = await admin.storage.from('vault-files').remove(supabasePaths.slice(i, i + 100))
    if (removeError) return { ok: false, count: files?.length ?? 0 }
  }
  // Same behavior as before the refactor: without R2 credentials those objects cannot be reached here.
  const r2Files = r2Configured ? (files ?? []).filter((x) => x.storage_backend === 'r2') : []
  for (const f of r2Files) {
    const res = await r2Fetch(f.storage_path, 'DELETE').catch(() => null)
    if (!res || (!res.ok && res.status !== 404)) return { ok: false, count: files?.length ?? 0 }
  }
  return { ok: true, count: files?.length ?? 0 }
}
