const PNG_SIG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function adler32(bytes: Uint8Array): number {
  let a = 1
  let b = 0
  for (let i = 0; i < bytes.length; i++) {
    a += bytes[i]
    if (a >= 65521) a -= 65521
    b += a
    if (b >= 65521) b -= 65521
  }
  return ((b << 16) | a) >>> 0
}

function u32be(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff])
}

function concat(parts: Uint8Array[]): Uint8Array {
  let len = 0
  for (const p of parts) len += p.length
  const out = new Uint8Array(len)
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new Uint8Array([type.charCodeAt(0), type.charCodeAt(1), type.charCodeAt(2), type.charCodeAt(3)])
  const crcBody = concat([typeBytes, data])
  return concat([u32be(data.length), crcBody, u32be(crc32(crcBody))])
}

/** zlib-wrapped uncompressed DEFLATE (stored blocks). No extra PNG/deflate dependency. */
function zlibStore(data: Uint8Array): Uint8Array {
  const blocks: Uint8Array[] = [new Uint8Array([0x78, 0x01])]
  const max = 65535
  let offset = 0
  while (offset < data.length || offset === 0 && data.length === 0) {
    const remaining = data.length - offset
    const n = Math.min(max, remaining)
    const last = offset + n >= data.length ? 1 : 0
    const header = new Uint8Array(5)
    header[0] = last
    header[1] = n & 0xff
    header[2] = (n >>> 8) & 0xff
    header[3] = (~n) & 0xff
    header[4] = ((~n) >>> 8) & 0xff
    blocks.push(header, data.subarray(offset, offset + n))
    offset += n
    if (data.length === 0) break
  }
  blocks.push(u32be(adler32(data)))
  return concat(blocks)
}

/** Supplies the IDAT payload: a zlib-wrapped DEFLATE stream over the filtered scanlines. */
export type PngDeflate = (raw: Uint8Array) => Uint8Array

/** 8-bit RGBA PNG from canvas-style pixel bytes (row 0 = top). */
export function encodePngRgba(
  width: number,
  height: number,
  rgba: ArrayLike<number>,
  deflate: PngDeflate = zlibStore
): Uint8Array {
  const stride = width * 4
  const raw = new Uint8Array((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    const row = y * (stride + 1)
    raw[row] = 0
    for (let x = 0; x < stride; x++) raw[row + 1 + x] = rgba[y * stride + x]
  }
  const ihdr = new Uint8Array(13)
  ihdr.set(u32be(width), 0)
  ihdr.set(u32be(height), 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return concat([
    PNG_SIG,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflate(raw)),
    chunk('IEND', new Uint8Array(0))
  ])
}

export function pngFromCanvas(canvas: HTMLCanvasElement): Uint8Array | null {
  const w = canvas.width
  const h = canvas.height
  if (w < 1 || h < 1) return null
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const pixels = ctx.getImageData(0, 0, w, h).data
  return encodePngRgba(w, h, pixels)
}

export function findPngOffset(bytes: Uint8Array): number {
  for (let i = 0; i <= bytes.length - 8; i++) {
    if (
      bytes[i] === 137 && bytes[i + 1] === 80 && bytes[i + 2] === 78 && bytes[i + 3] === 71
      && bytes[i + 4] === 13 && bytes[i + 5] === 10 && bytes[i + 6] === 26 && bytes[i + 7] === 10
    ) return i
  }
  return -1
}

export function readPngIhdr(png: Uint8Array): { width: number; height: number } | null {
  if (findPngOffset(png) !== 0) return null
  const width = (png[16] << 24) | (png[17] << 16) | (png[18] << 8) | png[19]
  const height = (png[20] << 24) | (png[21] << 16) | (png[22] << 8) | png[23]
  return { width, height }
}
