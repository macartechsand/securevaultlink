// AWS Signature Version 4 (WebCrypto only). Used by the rotate function for IAM and STS calls.
const enc = (s: string) => new TextEncoder().encode(s)
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('')

async function hmac(key: Uint8Array, data: string) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc(data)))
}
export const sha256hex = async (s: string) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', enc(s))))

export type SignInput = {
  method: 'GET' | 'POST'
  host: string
  region: string
  service: string
  /** Already-canonical query string ('' for POST bodies). */
  query: string
  body: string
  contentType: string
  /** YYYYMMDD'T'HHMMSS'Z' */
  amzDate: string
  accessKeyId: string
  secretAccessKey: string
}

/** Returns the Authorization header value for a request signed with headers content-type, host, x-amz-date. */
export async function sigv4Authorization(i: SignInput) {
  const date = i.amzDate.slice(0, 8)
  const signedHeaders = 'content-type;host;x-amz-date'
  const canonical = [
    i.method, '/', i.query,
    `content-type:${i.contentType}\nhost:${i.host}\nx-amz-date:${i.amzDate}\n`,
    signedHeaders, await sha256hex(i.body),
  ].join('\n')
  const scope = `${date}/${i.region}/${i.service}/aws4_request`
  const toSign = ['AWS4-HMAC-SHA256', i.amzDate, scope, await sha256hex(canonical)].join('\n')
  let key = await hmac(enc(`AWS4${i.secretAccessKey}`), date)
  for (const part of [i.region, i.service, 'aws4_request']) key = await hmac(key, part)
  const signature = hex(await hmac(key, toSign))
  return `AWS4-HMAC-SHA256 Credential=${i.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
}
