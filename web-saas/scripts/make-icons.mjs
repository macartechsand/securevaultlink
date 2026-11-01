// Renders the app icons (PNG) for the PWA manifest and iOS home screen, without dependencies.
// Usage: node scripts/make-icons.mjs  (writes into public/icons/)
import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const OUT = new URL('../public/icons/', import.meta.url)

// Shield from Icon.tsx (24-unit grid): M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z
function cubic(p0, p1, p2, p3, n = 24) {
  const pts = []
  for (let i = 1; i <= n; i++) {
    const t = i / n
    const u = 1 - t
    pts.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ])
  }
  return pts
}
const SHIELD = [[12, 3], [5, 6], [5, 12], ...cubic([5, 12], [5, 16.5], [8, 19.5], [12, 21]), ...cubic([12, 21], [16, 19.5], [19, 16.5], [19, 12]), [19, 6]]
const CHECK = [[9, 12], [11, 14], [15, 10]]

function inPolygon(x, y, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
function distToSegment(x, y, [ax, ay], [bx, by]) {
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy))
}

const TOP = [0x82, 0xa6, 0xff]
const BOTTOM = [0x3a, 0x5f, 0xd9]
const WHITE = [255, 255, 255]

/** Returns the RGBA color at a point in unit space [0,1]². `rounded` keeps transparent corners. */
function sample(u, v, rounded) {
  if (rounded) {
    const r = 0.22
    const cx = Math.min(Math.max(u, r), 1 - r)
    const cy = Math.min(Math.max(v, r), 1 - r)
    if (Math.hypot(u - cx, v - cy) > r) return null
  }
  // Shield fills 56% of the height, centered (inside the maskable safe zone).
  const scale = 0.56 / 18
  const gx = (u - 0.5) / scale + 12
  const gy = (v - 0.5) / scale + 12
  const bg = TOP.map((c, i) => Math.round(c + (BOTTOM[i] - c) * v))
  if (inPolygon(gx, gy, SHIELD)) {
    const onCheck = Math.min(distToSegment(gx, gy, CHECK[0], CHECK[1]), distToSegment(gx, gy, CHECK[1], CHECK[2])) < 1.1
    return onCheck ? BOTTOM : WHITE
  }
  return bg
}

function render(size, rounded) {
  const ss = 4
  const rows = []
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4)
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let sy = 0; sy < ss; sy++)
        for (let sx = 0; sx < ss; sx++) {
          const c = sample((x + (sx + 0.5) / ss) / size, (y + (sy + 0.5) / ss) / size, rounded)
          if (c) {
            r += c[0]; g += c[1]; b += c[2]; a += 255
          }
        }
      const n = ss * ss
      const o = 1 + x * 4
      const cov = a / n
      row[o] = cov ? Math.round((r / n) * (255 / cov)) : 0
      row[o + 1] = cov ? Math.round((g / n) * (255 / cov)) : 0
      row[o + 2] = cov ? Math.round((b / n) * (255 / cov)) : 0
      row[o + 3] = Math.round(cov)
    }
    rows.push(row)
  }
  return png(size, Buffer.concat(rows))
}

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function png(size, raw) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync(OUT, { recursive: true })
for (const [name, size, rounded] of [
  ['icon-192.png', 192, true],
  ['icon-512.png', 512, true],
  ['maskable-512.png', 512, false],
  ['apple-touch-icon.png', 180, false],
]) {
  writeFileSync(new URL(name, OUT), render(size, rounded))
  console.log('wrote', name)
}
