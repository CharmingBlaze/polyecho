import { PixelBuffer, type BufferLayer } from './PixelCanvas'

export interface SavedPaintLayer {
  id: string
  name: string
  visible: boolean
  opacity: number
  blendMode: BufferLayer['blendMode']
  dataUrl: string
}

export function serializePaintLayers(buffer?: PixelBuffer): { layers?: SavedPaintLayer[]; activeLayerId?: string } {
  if (!buffer) return {}
  return {
    activeLayerId: buffer.activeLayerId,
    layers: buffer.layers.map(layer => ({
      id: layer.id, name: layer.name, visible: layer.visible, opacity: layer.opacity,
      blendMode: layer.blendMode, dataUrl: layer.canvas.toDataURL('image/png'),
    })),
  }
}

/** Decode all layers before replacing the stack, retaining the flattened image for legacy readers. */
export async function restorePaintLayers(buffer: PixelBuffer, layers: SavedPaintLayer[], activeLayerId?: string) {
  const restored = await Promise.all(layers.map(async saved => {
    const layerBuffer = new PixelBuffer(buffer.width, buffer.height)
    await layerBuffer.loadFromDataURL(saved.dataUrl, false)
    const layer = layerBuffer.activeLayer!
    layer.id = saved.id
    layer.name = saved.name
    layer.visible = saved.visible !== false
    layer.opacity = Number.isFinite(saved.opacity) ? Math.max(0, Math.min(1, saved.opacity)) : 1
    layer.blendMode = ['normal', 'multiply', 'screen', 'overlay', 'additive'].includes(saved.blendMode) ? saved.blendMode : 'normal'
    return layer
  }))
  if (!restored.length) return
  buffer.layers = restored
  buffer.activeLayerId = restored.some(l => l.id === activeLayerId) ? activeLayerId! : restored[restored.length - 1].id
  buffer.composite()
}
