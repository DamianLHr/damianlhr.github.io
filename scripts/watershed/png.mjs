// Minimal PNG writer. Node ships zlib, so encoding a PNG is just chunk framing
// plus a CRC — no dependency needed, and it means the bake can emit images that
// are both browser-decodable and directly viewable.

import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

/**
 * @param {string} path
 * @param {number} w
 * @param {number} h
 * @param {Uint8Array} pixels  channels interleaved, row-major
 * @param {number} channels    1 = grey, 3 = RGB, 4 = RGBA
 */
export function writePNG(path, w, h, pixels, channels = 3) {
  const colorType = channels === 1 ? 0 : channels === 3 ? 2 : 6
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = colorType
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  // one filter byte (0 = None) per scanline
  const stride = w * channels
  const raw = Buffer.alloc((stride + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0
    Buffer.from(pixels.buffer, pixels.byteOffset + y * stride, stride).copy(
      raw,
      y * (stride + 1) + 1,
    )
  }

  writeFileSync(
    path,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  )
}

/**
 * Pack terrain into one RGB image the browser can decode with a canvas:
 *   R,G — height at 16-bit precision (65536 steps is far past what the mesh or
 *         the eye can resolve, and the low byte still compresses reasonably)
 *   B   — a second 8-bit field, used for discharge
 *
 * 24-bit height was the obvious first move but its lowest byte is essentially
 * noise, which PNG cannot compress at all — this is a third smaller for detail
 * nobody can see.
 */
export function packTerrain(height, extra, w, h) {
  const out = new Uint8Array(w * h * 3)
  for (let i = 0; i < w * h; i++) {
    const q = Math.round(Math.max(0, Math.min(1, height[i])) * 65535)
    out[i * 3] = (q >> 8) & 0xff
    out[i * 3 + 1] = q & 0xff
    out[i * 3 + 2] = Math.round(Math.max(0, Math.min(1, extra[i])) * 255)
  }
  return out
}
