import { describeUserAgent } from '../lib/posture'
import { isNativeShell } from '../lib/nativeShell'
import { supabase } from '../lib/supabase'
import { type UsageAction, type UsageRecord, decryptUsage, encryptUsage } from '../lib/usage'

export type UsageRow = { item_id: string; ciphertext: string; iv: string; used_at: string }

/** Own usage rows (the server only returns rows of Premium-recorded uses; Free users have none). */
export async function fetchUsageRows(): Promise<UsageRow[]> {
  const { data, error } = await supabase.from('item_usage').select('item_id, ciphertext, iv, used_at')
  if (error) return []
  return (data ?? []) as UsageRow[]
}

export async function decryptUsageRows(rows: UsageRow[], keys: Map<string, Uint8Array<ArrayBuffer>>, userId: string) {
  const out = new Map<string, UsageRecord>()
  for (const row of rows) {
    const k = keys.get(row.item_id)
    if (!k) continue
    const rec = await decryptUsage(k, row.item_id, userId, row)
    if (rec) out.set(row.item_id, rec)
  }
  return out
}

/** Records a use from the web app or the Android app. Errors are ignored (never blocks the action). */
export async function recordUsage(itemId: string, itemKey: Uint8Array<ArrayBuffer>, userId: string, action: UsageAction, host = ''): Promise<UsageRecord | null> {
  const rec: UsageRecord = {
    at: new Date().toISOString(),
    action,
    host,
    client: isNativeShell() ? 'app' : 'web',
    device: describeUserAgent(navigator.userAgent),
  }
  try {
    const blob = await encryptUsage(itemKey, itemId, userId, rec)
    const { error } = await supabase.from('item_usage').upsert({ item_id: itemId, ...blob }, { onConflict: 'item_id,user_id' })
    return error ? null : rec
  } catch {
    return null
  }
}
