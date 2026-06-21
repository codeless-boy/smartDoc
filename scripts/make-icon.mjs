// One-shot generator: writes build/icon.ico, a 256x256 solid-color Windows icon.
// No image deps; we hand-roll a PNG (zlib-deflated RGBA scanlines) and wrap it
// in an ICO directory. Good enough for electron-builder (which needs >=256x256).
import zlib from 'node:zlib'
import fs from 'node:fs'
import path from 'node:path'

const SIZE = 256
// smartDoc brand indigo (#6366f1) as RGBA
const R = 0x63,
  G = 0x66,
  B = 0xf1,
  A = 0xff

// --- Build raw RGBA scanlines (each row prefixed with filter byte 0) ---
const rowLen = 1 + SIZE * 4
const raw = Buffer.alloc(rowLen * SIZE)
for (let y = 0; y < SIZE; y++) {
  const off = y * rowLen
  raw[off] = 0 // filter: None
  for (let x = 0; x < SIZE; x++) {
    const p = off + 1 + x * 4
    raw[p] = R
    raw[p + 1] = G
    raw[p + 2] = B
    raw[p + 3] = A
  }
}
const idatData = zlib.deflateSync(raw)

// --- PNG chunk helpers ---
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++)
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0) // width
ihdr.writeUInt32BE(SIZE, 4) // height
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // color type RGBA
ihdr[10] = 0 // compression
ihdr[11] = 0 // filter
ihdr[12] = 0 // interlace
const png = Buffer.concat([
  sig,
  chunk('IHDR', ihdr),
  chunk('IDAT', idatData),
  chunk('IEND', Buffer.alloc(0))
])

// --- ICO wrap (single PNG entry) ---
const ico = Buffer.alloc(6 + 16 + png.length)
ico.writeUInt16LE(0, 0) // reserved
ico.writeUInt16LE(1, 2) // type: icon
ico.writeUInt16LE(1, 4) // count
// ICONDIRENTRY
ico[6] = 0 // width 256 (0 means 256)
ico[7] = 0 // height 256
ico[8] = 0 // color count
ico[9] = 0 // reserved
ico.writeUInt16LE(1, 10) // planes
ico.writeUInt16LE(32, 12) // bit count
ico.writeUInt32LE(png.length, 14) // bytes in res
ico.writeUInt32LE(22, 18) // image offset
png.copy(ico, 22)

const out = path.join('build', 'icon.ico')
fs.mkdirSync('build', { recursive: true })
fs.writeFileSync(out, ico)
console.log(`Wrote ${out} (${ico.length} bytes)`)
