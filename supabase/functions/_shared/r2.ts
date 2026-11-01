// Shared Cloudflare R2 helpers for Edge Functions (S3 API, SigV4 via aws4fetch).
import { AwsClient } from 'npm:aws4fetch@1.0.20'

const accountId = Deno.env.get('R2_ACCOUNT_ID') ?? ''
const bucket = Deno.env.get('R2_BUCKET') ?? ''

export const r2Configured = Boolean(accountId && bucket && Deno.env.get('R2_ACCESS_KEY_ID') && Deno.env.get('R2_SECRET_ACCESS_KEY'))

const client = r2Configured
  ? new AwsClient({
      accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID')!,
      secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY')!,
      service: 's3',
      region: 'auto',
    })
  : null

export const r2ObjectUrl = (path: string) =>
  `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`

export async function r2Presign(method: 'PUT' | 'GET', path: string, seconds: number) {
  if (!client) throw new Error('R2 not configured')
  const url = new URL(r2ObjectUrl(path))
  url.searchParams.set('X-Amz-Expires', String(seconds))
  const headers = method === 'PUT' ? { 'Content-Type': 'application/octet-stream' } : undefined
  const signed = await client.sign(new Request(url, { method, headers }), { aws: { signQuery: true } })
  return signed.url
}

export function r2Fetch(path: string, method: 'HEAD' | 'DELETE') {
  if (!client) throw new Error('R2 not configured')
  return client.fetch(r2ObjectUrl(path), { method })
}
