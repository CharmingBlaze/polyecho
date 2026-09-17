import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PixelBuffer } from './PixelCanvas'
import { serializePaintLayers, restorePaintLayers } from './PaintLayerStorage'
import { ProjectSerializer } from '../project/ProjectSerializer'
import type { ViewportSettings } from '../../types/tools'

// Browser PNG decoding is replaced with lossless in-memory image snapshots.
beforeEach(() => {
  const images = new Map<string, ImageData>()
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(function (this: HTMLCanvasElement) {
    const url = `data:image/png;base64,test${images.size}`
    images.set(url, this.getContext('2d')!.getImageData(0, 0, this.width, this.height))
    return url
  })
  vi.stubGlobal('Image', class {
    constructor() {
      const canvas = document.createElement('canvas') as HTMLCanvasElement & { onload?: () => void; onerror?: () => void }
      Object.defineProperty(canvas, 'src', { set(url: string) {
        const pixels = images.get(url)
        if (!pixels) { queueMicrotask(() => canvas.onerror?.()); return }
        canvas.width = pixels.width
        canvas.height = pixels.height
        canvas.getContext('2d')!.putImageData(pixels, 0, 0)
        queueMicrotask(() => canvas.onload?.())
      } })
      return canvas
    }
  })
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('layered paint persistence', () => {
  it('round-trips layer pixels, transparency, order, names, blend, opacity and active layer through a project file', async () => {
    const source = new PixelBuffer(4, 4)
    source.clear('#123456')
    const detail = source.addLayer('Highlights')
    source.setPixel(1, 1, '#ffffff')
    detail.opacity = 0.4
    detail.blendMode = 'screen'
    detail.visible = false
    source.composite()
    const json = ProjectSerializer.serialize('Layered', [], source.canvas,
      { id: 'p', name: 'P', colors: [] }, [],
      { id: 'a', name: 'A', bones: [], rootBoneIds: [], clips: [], activeClipId: null },
      [], null, 0, {} as ViewportSettings,
      [{ id: 'texture-original-id', name: 'Paint', width: 4, height: 4, pixelBuffer: source }])
    const saved = ProjectSerializer.deserialize(json).textures![0]
    expect(saved.id).toBe('texture-original-id')
    const restored = new PixelBuffer(4, 4)
    await restorePaintLayers(restored, saved.layers!, saved.activeLayerId)
    expect(restored.layers).toHaveLength(2)
    expect(restored.activeLayerId).toBe(detail.id)
    expect(restored.activeLayer).toMatchObject({ name: 'Highlights', visible: false, opacity: 0.4, blendMode: 'screen' })
    expect([...restored.activeLayer!.ctx.getImageData(1, 1, 1, 1).data]).toEqual([255, 255, 255, 255])
    expect(restored.activeLayer!.ctx.getImageData(0, 0, 1, 1).data[3]).toBe(0)
    expect(restored.getPixelHex(1, 1)).toBe('#123456')
  })
  it('does not replace existing pixels when a saved layer cannot decode', async () => {
    const source = new PixelBuffer(4, 4)
    source.clear('#123456')
    const saved = serializePaintLayers(source)
    saved.layers![0].dataUrl = 'bad-image'
    await expect(restorePaintLayers(source, saved.layers!)).rejects.toThrow('Could not decode')
    expect(source.getPixelHex(0, 0)).toBe('#123456')
  })
})
