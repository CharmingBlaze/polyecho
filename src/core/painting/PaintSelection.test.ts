import { describe, expect, it } from 'vitest'
import { PixelBuffer } from './PixelCanvas'
import { marqueeRect, translateSelection, moveSelectedPixels, flipSelectedPixels, paintWithinSelection, copySelectedPixels } from './PaintSelection'

describe('pixel selections', () => {
  it('includes both drag endpoints and clamps movement at the canvas edges', () => {
    const rect = marqueeRect({ x: 4, y: 3 }, { x: 2, y: 1 })
    expect(rect).toEqual({ x: 2, y: 1, w: 3, h: 3 })
    expect(translateSelection(rect, 100, -100, 8, 8)).toEqual({ x: 5, y: 0, w: 3, h: 3 })
  })
  it('moves overlapping pixels without smearing and keeps other layers untouched', () => {
    const pb = new PixelBuffer(8, 8)
    pb.clear('#112233')
    const base = pb.activeLayer!
    pb.addLayer('Details')
    pb.setPixel(1, 1, '#ff0000')
    pb.setPixel(2, 1, '#00ff00')
    moveSelectedPixels(pb, { x: 1, y: 1, w: 2, h: 1 }, { x: 2, y: 1, w: 2, h: 1 })
    expect(pb.getPixelHex(1, 1)).toBe('#112233')
    expect(pb.getPixelHex(2, 1)).toBe('#ff0000')
    expect(pb.getPixelHex(3, 1)).toBe('#00ff00')
    expect([...base.ctx.getImageData(2, 1, 1, 1).data]).toEqual([17, 34, 51, 255])
  })
  it('keeps brush and flood fill edits inside the selected area', () => {
    const pb = new PixelBuffer(8, 8)
    pb.clear('#112233')
    const rect = { x: 2, y: 2, w: 2, h: 2 }
    paintWithinSelection(pb, rect, () => pb.drawBrush(2, 2, '#ffffff', 6))
    expect(pb.getPixelHex(1, 2)).toBe('#112233')
    expect(pb.getPixelHex(2, 2)).toBe('#ffffff')
    expect(pb.getPixelHex(4, 2)).toBe('#112233')
    paintWithinSelection(pb, rect, () => pb.floodFill(0, 0, '#ff0000'))
    expect(pb.getPixelHex(0, 0)).toBe('#112233')
    expect(pb.getPixelHex(2, 2)).toBe('#ffffff')
  })
  it('flips selected pixels and copies only the active layer including transparency', () => {
    const pb = new PixelBuffer(4, 4)
    pb.clear('#112233')
    pb.addLayer('Details')
    pb.setPixel(0, 0, '#ff0000')
    const rect = { x: 0, y: 0, w: 2, h: 1 }
    const copied = copySelectedPixels(pb, rect)
    expect(copied.data[7]).toBe(0)
    flipSelectedPixels(pb, rect, 'x')
    expect(pb.getPixelHex(0, 0)).toBe('#112233')
    expect(pb.getPixelHex(1, 0)).toBe('#ff0000')
    expect([...copied.data.slice(0, 4)]).toEqual([255, 0, 0, 255])
  })
  it('restores pixels outside the mask and compositing state even when an edit fails', () => {
    const pb = new PixelBuffer(4, 4)
    pb.clear('#112233')
    expect(() => paintWithinSelection(pb, { x: 1, y: 1, w: 1, h: 1 }, () => {
      pb.clear('#ffffff')
      throw new Error('failed')
    })).toThrow('failed')
    expect(pb.getPixelHex(0, 0)).toBe('#112233')
    expect(pb.compositeDeferred).toBe(false)
  })
})

describe('paint layers and pixel edges', () => {
  it('leaves a new layer transparent and preserves an empty layer after erasing', () => {
    const pb = new PixelBuffer(8, 8)
    pb.clear('#123456')
    const top = pb.addLayer('Details')
    pb.ensureDrawable()
    expect(top.ctx.getImageData(0, 0, 1, 1).data[3]).toBe(0)
    pb.drawBrush(0, 0, '#ffffff')
    expect(top.ctx.getImageData(4, 4, 1, 1).data[3]).toBe(0)
    pb.erase(0, 0)
    pb.ensureDrawable()
    expect(top.ctx.getImageData(0, 0, 1, 1).data[3]).toBe(0)
    expect(pb.getPixelHex(0, 0)).toBe('#123456')
  })
  it('reorders layers and clones the resulting stack for history', () => {
    const pb = new PixelBuffer(4, 4)
    pb.clear('#ff0000')
    const top = pb.addLayer('Green')
    pb.clear('#00ff00')
    expect(pb.moveLayer(top.id, 1)).toBe(false)
    expect(pb.moveLayer(top.id, -1)).toBe(true)
    expect(pb.getPixelHex(0, 0)).toBe('#ff0000')
    const clone = pb.clone()
    expect(clone.layers[0].name).toBe('Green')
    expect(clone.activeLayerId).toBe(top.id)
  })
  it('draws round pixel brushes and circles without partial alpha edges', () => {
    const pb = new PixelBuffer(16, 16)
    pb.drawBrush(4, 4, '#ffffff', 6, 1, 'circle')
    const data = pb.activeLayer!.ctx.getImageData(0, 0, 16, 16).data
    expect(data[(1 * 16 + 1) * 4 + 3]).toBe(0)
    expect(data[(4 * 16 + 4) * 4 + 3]).toBe(255)
    for (let i = 3; i < data.length; i += 4) expect([0, 255]).toContain(data[i])
    pb.clear()
    pb.drawCircle(8, 8, 3, '#ffffff', 1, false)
    expect(pb.activeLayer!.ctx.getImageData(8, 8, 1, 1).data[3]).toBe(0)
    expect(pb.activeLayer!.ctx.getImageData(11, 8, 1, 1).data[3]).toBe(255)
  })
})
