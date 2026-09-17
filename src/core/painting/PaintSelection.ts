import type { PixelBuffer } from './PixelCanvas'
import type { PixelPoint } from './StrokePath'

export interface PaintRect { x: number; y: number; w: number; h: number }

export function marqueeRect(a: PixelPoint, b: PixelPoint): PaintRect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x) + 1, h: Math.abs(a.y - b.y) + 1 }
}

export function containsPixel(rect: PaintRect, p: PixelPoint) {
  return p.x >= rect.x && p.y >= rect.y && p.x < rect.x + rect.w && p.y < rect.y + rect.h
}

export function translateSelection(rect: PaintRect, dx: number, dy: number, width: number, height: number): PaintRect {
  return { ...rect, x: Math.max(0, Math.min(width - rect.w, rect.x + Math.round(dx))), y: Math.max(0, Math.min(height - rect.h, rect.y + Math.round(dy))) }
}

export function copySelectedPixels(buffer: PixelBuffer, rect: PaintRect): ImageData {
  return buffer.activeLayer!.ctx.getImageData(rect.x, rect.y, rect.w, rect.h)
}

/** Move from an immutable snapshot so overlapping source/destination pixels survive. */
export function moveSelectedPixels(buffer: PixelBuffer, source: PaintRect, destination: PaintRect) {
  const pixels = copySelectedPixels(buffer, source)
  const ctx = buffer.activeLayer!.ctx
  ctx.clearRect(source.x, source.y, source.w, source.h)
  ctx.putImageData(pixels, destination.x, destination.y)
  buffer.commitLayers()
}

export function flipSelectedPixels(buffer: PixelBuffer, rect: PaintRect, axis: 'x' | 'y') {
  const source = copySelectedPixels(buffer, rect)
  const result = new ImageData(rect.w, rect.h)
  for (let y = 0; y < rect.h; y++) {
    for (let x = 0; x < rect.w; x++) {
      const sx = axis === 'x' ? rect.w - 1 - x : x
      const sy = axis === 'y' ? rect.h - 1 - y : y
      const index = (sy * rect.w + sx) * 4
      result.data.set(source.data.subarray(index, index + 4), (y * rect.w + x) * 4)
    }
  }
  buffer.activeLayer!.ctx.putImageData(result, rect.x, rect.y)
  buffer.commitLayers()
}

/** Constrain even ImageData-based tools (fill/shade) which ignore canvas clipping. */
export function paintWithinSelection(buffer: PixelBuffer, rect: PaintRect | null, paint: () => void) {
  if (!rect) { paint(); return }
  const ctx = buffer.activeLayer!.ctx
  const strips = [
    { x: 0, y: 0, w: buffer.width, h: rect.y },
    { x: 0, y: rect.y + rect.h, w: buffer.width, h: buffer.height - rect.y - rect.h },
    { x: 0, y: rect.y, w: rect.x, h: rect.h },
    { x: rect.x + rect.w, y: rect.y, w: buffer.width - rect.x - rect.w, h: rect.h },
  ].filter(r => r.w > 0 && r.h > 0).map(r => ({ ...r, pixels: ctx.getImageData(r.x, r.y, r.w, r.h) }))
  const deferred = buffer.compositeDeferred
  buffer.suspendComposite()
  try { paint() } finally {
    for (const strip of strips) ctx.putImageData(strip.pixels, strip.x, strip.y)
    buffer.compositeDeferred = deferred
    buffer.commitLayers()
  }
}
