import { describe, expect, it } from 'vitest'
import { PixelBuffer } from './PixelCanvas'

describe('PixelBuffer', () => {
  it('paints a pixel, composites, and clones the color', () => {
    const buf = new PixelBuffer(8, 8)
    buf.clear('#000000')
    buf.drawBrush(2, 3, '#ff3366', 1, 1, 'square', true)
    expect(buf.getPixelHex(2, 3).toLowerCase()).toBe('#ff3366')
    const copy = buf.clone()
    expect(copy.getPixelHex(2, 3).toLowerCase()).toBe('#ff3366')
    copy.drawBrush(2, 3, '#00ff00', 1, 1, 'square', true)
    expect(buf.getPixelHex(2, 3).toLowerCase()).toBe('#ff3366')
  })
})
