export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

export function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function toBase32(bytes: Uint8Array): string {
  let bits = 0
  let acc = 0
  let out = ''
  for (const b of bytes) {
    acc = ((acc << 8) | b) & 0xffff
    bits += 8
    while (bits >= 5) {
      out += BASE32[(acc >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += BASE32[(acc << (5 - bits)) & 31]
  return out
}

export function fromBase32(value: string): Uint8Array<ArrayBuffer> {
  const clean = value.replace(/[\s-]/g, '').toUpperCase()
  let bits = 0
  let acc = 0
  const out: number[] = []
  for (const ch of clean) {
    const idx = BASE32.indexOf(ch)
    if (idx < 0) throw new Error('Invalid recovery key')
    acc = ((acc << 5) | idx) & 0xffff
    bits += 5
    if (bits >= 8) {
      out.push((acc >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return new Uint8Array(out)
}
