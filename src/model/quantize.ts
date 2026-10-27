import { SCHEMA_VERSION, SHAPE } from './config'
import type { PersistedModel } from './types'

/**
 * Compact share format for the URL fragment (#m=...): per-tensor symmetric
 * int8 quantisation (scale = max|v| / 127), base64url encoded.
 * Layout: 'S' 'W' version I H O | u32 examples | u32 normCount | i8 lastAction |
 *         then for each tensor: f32 scale, i8[n]
 * Tensors: W1, b1, W2, b2, norm mean, norm std, markov counts.
 * Lossy: values are recovered to within scale/2 per element.
 */
const MAGIC = [0x53, 0x57]

function quant(values: ArrayLike<number>): { scale: number; q: Int8Array } {
  let m = 0
  for (let i = 0; i < values.length; i++) m = Math.max(m, Math.abs(values[i]))
  const scale = m > 0 ? m / 127 : 1
  const q = new Int8Array(values.length)
  for (let i = 0; i < values.length; i++) q[i] = Math.max(-127, Math.min(127, Math.round(values[i] / scale)))
  return { scale, q }
}

export function toBase64Url(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
export function fromBase64Url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4))
  const out = new Uint8Array(b.length)
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i)
  return out
}

export function encodeFragment(m: PersistedModel): string {
  const count = m.normStats.count
  const std = m.normStats.m2.map((v) => (count > 1 ? Math.sqrt(Math.max(0, v / (count - 1))) : 0))
  const tensors = [m.weights.W1, m.weights.b1, m.weights.W2, m.weights.b2, m.normStats.mean, std, m.markov.counts].map(quant)
  const size = 6 + 4 + 4 + 1 + tensors.reduce((a, t) => a + 4 + t.q.length, 0)
  const buf = new ArrayBuffer(size)
  const dv = new DataView(buf)
  const u8 = new Uint8Array(buf)
  let o = 0
  u8[o++] = MAGIC[0]; u8[o++] = MAGIC[1]; u8[o++] = SCHEMA_VERSION
  u8[o++] = SHAPE.inputs; u8[o++] = SHAPE.hidden; u8[o++] = SHAPE.outputs
  dv.setUint32(o, m.examples >>> 0, true); o += 4
  dv.setUint32(o, count >>> 0, true); o += 4
  dv.setInt8(o, m.lastAction ?? -1); o += 1
  for (const t of tensors) {
    dv.setFloat32(o, t.scale, true); o += 4
    u8.set(new Uint8Array(t.q.buffer), o); o += t.q.length
  }
  return toBase64Url(u8)
}

export function decodeFragment(s: string, base: PersistedModel): PersistedModel {
  const u8 = fromBase64Url(s)
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
  let o = 0
  if (u8[o++] !== MAGIC[0] || u8[o++] !== MAGIC[1]) throw new Error('fragment: bad magic')
  const ver = u8[o++]
  if (ver !== SCHEMA_VERSION) throw new Error(`fragment: version ${ver}`)
  const I = u8[o++], H = u8[o++], O = u8[o++]
  if (I !== SHAPE.inputs || H !== SHAPE.hidden || O !== SHAPE.outputs) throw new Error('fragment: shape mismatch')
  const examples = dv.getUint32(o, true); o += 4
  const count = dv.getUint32(o, true); o += 4
  const last = dv.getInt8(o); o += 1
  const read = (n: number): number[] => {
    if (o + 4 + n > u8.length) throw new Error('fragment: truncated')
    const scale = dv.getFloat32(o, true); o += 4
    const out: number[] = []
    for (let i = 0; i < n; i++) out.push(dv.getInt8(o + i) * scale)
    o += n
    return out
  }
  const W1 = read(H * I), b1 = read(H), W2 = read(O * H), b2 = read(O)
  const mean = read(I), std = read(I), counts = read(O * O)
  return {
    schemaVersion: SCHEMA_VERSION,
    weights: { W1, b1, W2, b2 },
    normStats: { count, mean, m2: std.map((sd) => sd * sd * Math.max(0, count - 1)) },
    markov: { ...base.markov, counts },
    updatedAt: Date.now(),
    examples,
    lastAction: last < 0 ? null : last,
    acc: { markov: [], mlp: [] },
  }
}

/** Extract `m=` from a location hash like "#m=abc" or "#foo&m=abc". */
export function fragmentParam(hash: string): string | null {
  const h = hash.startsWith('#') ? hash.slice(1) : hash
  for (const part of h.split('&')) if (part.startsWith('m=')) return part.slice(2) || null
  return null
}
