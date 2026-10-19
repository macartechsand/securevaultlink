export type GeneratorOptions = {
  length: number
  uppercase: boolean
  numbers: boolean
  symbols: boolean
}

const LOWER = 'abcdefghijkmnopqrstuvwxyz'
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const NUMBERS = '23456789'
const SYMBOLS = '!@#$%^&*()_+-=[]{}'

/** Uniform random integer in [0, max) using rejection sampling (no modulo bias). */
export function randomInt(max: number): number {
  if (!Number.isInteger(max) || max <= 0 || max > 0xffffffff) throw new RangeError('invalid max')
  const limit = Math.floor(0x100000000 / max) * max
  const buf = new Uint32Array(1)
  for (;;) {
    globalThis.crypto.getRandomValues(buf)
    if (buf[0] < limit) return buf[0] % max
  }
}

export function generatePassword(options: GeneratorOptions): string {
  const sets = [LOWER]
  if (options.uppercase) sets.push(UPPER)
  if (options.numbers) sets.push(NUMBERS)
  if (options.symbols) sets.push(SYMBOLS)
  const length = Math.min(Math.max(Math.trunc(options.length), sets.length), 128)
  const alphabet = sets.join('')

  // One character from every selected set, the rest from the full alphabet.
  const chars = sets.map((set) => set[randomInt(set.length)])
  while (chars.length < length) chars.push(alphabet[randomInt(alphabet.length)])

  // Fisher-Yates shuffle with the CSPRNG.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}
