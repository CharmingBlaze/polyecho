import { describe, expect, it } from 'vitest'
import { encodePngRgba, findPngOffset, readPngIhdr } from './encodePng'
import { PixelBuffer } from './PixelCanvas'

describe('encodePng', () => {
  it('writes a valid 8-bit RGBA PNG', () => {
    const pixels = new Uint8ClampedArray([51, 102, 255, 255])
    const png = encodePngRgba(1, 1, pixels)
    expect(findPngOffset(png)).toBe(0)
    expect(readPngIhdr(png)).toEqual({ width: 1, height: 1 })
  })

  it('encodes a painted PixelBuffer', () => {
    const buf = new PixelBuffer(4, 2)
    buf.clear('#3366ff')
    const png = buf.toPngBytes()
    expect(readPngIhdr(png)).toEqual({ width: 4, height: 2 })
    const data = buf.ctx.getImageData(0, 0, 1, 1).data
    expect([data[0], data[1], data[2], data[3]]).toEqual([0x33, 0x66, 0xff, 255])
  })
})
