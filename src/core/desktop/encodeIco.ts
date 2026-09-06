import { encodePngRgba } from '../painting/encodePng'

/** PNG-in-ICO (Vista+). Width/height 256 is stored as 0 in the directory entry. */
export function encodeIcoFromPngs(images: Array<{ width: number; height: number; png: Uint8Array }>): Uint8Array {
  const count = images.length
  const header = 6 + 16 * count
  const out = new Uint8Array(header + images.reduce((n, img) => n + img.png.length, 0))
  out[2] = 1
  out[4] = count & 0xff
  out[5] = (count >>> 8) & 0xff
  let offset = header
  for (let i = 0; i < count; i++) {
    const img = images[i]
    const e = 6 + i * 16
    out[e] = img.width >= 256 ? 0 : img.width
    out[e + 1] = img.height >= 256 ? 0 : img.height
    out[e + 4] = 1
    out[e + 6] = 32
    const len = img.png.length
    out[e + 8] = len & 0xff
    out[e + 9] = (len >>> 8) & 0xff
    out[e + 10] = (len >>> 16) & 0xff
    out[e + 11] = (len >>> 24) & 0xff
    out[e + 12] = offset & 0xff
    out[e + 13] = (offset >>> 8) & 0xff
    out[e + 14] = (offset >>> 16) & 0xff
    out[e + 15] = (offset >>> 24) & 0xff
    out.set(img.png, offset)
    offset += len
  }
  return out
}

export function readIcoDirCount(ico: Uint8Array): number {
  if (ico.length < 6) return 0
  if (ico[0] !== 0 || ico[1] !== 0 || ico[2] !== 1 || ico[3] !== 0) return 0
  return ico[4] | (ico[5] << 8)
}

export function pngsFromIconSizes(src: Uint8Array, srcSize: number, sizes: number[]): Array<{ width: number; height: number; png: Uint8Array }> {
  return sizes.map(size => {
    const rgba = downscaleRgba(src, srcSize, size)
    return { width: size, height: size, png: encodePngRgba(size, size, rgba) }
  })
}

export function downscaleRgba(src: Uint8Array, srcSize: number, destSize: number): Uint8Array {
  if (destSize === srcSize) return src
  const out = new Uint8Array(destSize * destSize * 4)
  for (let y = 0; y < destSize; y++) {
    const sy = Math.min(srcSize - 1, Math.floor((y + 0.5) * srcSize / destSize))
    for (let x = 0; x < destSize; x++) {
      const sx = Math.min(srcSize - 1, Math.floor((x + 0.5) * srcSize / destSize))
      const i = (sy * srcSize + sx) * 4
      const o = (y * destSize + x) * 4
      out[o] = src[i]
      out[o + 1] = src[i + 1]
      out[o + 2] = src[i + 2]
      out[o + 3] = src[i + 3]
    }
  }
  return out
}
