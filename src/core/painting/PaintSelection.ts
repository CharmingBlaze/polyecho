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

export function copySelectedPixels(buffer: PixelBuffer, rect: PaintRect, mask?: Uint8Array | null): ImageData {
  const image = buffer.activeLayer!.ctx.getImageData(rect.x, rect.y, rect.w, rect.h)
  if (mask && mask.length === rect.w * rect.h) {
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) image.data[i * 4 + 3] = 0
    }
  }
  return image
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

export interface ColorSelection {
  rect: PaintRect
  /** 1 = selected, packed row-major inside `rect`. */
  mask: Uint8Array
}

function sameColor(data: Uint8ClampedArray, index: number, r: number, g: number, b: number, a: number) {
  return data[index] === r && data[index + 1] === g && data[index + 2] === b && data[index + 3] === a
}

/** Exact-color selection. Connected limits the pick to pixels touching the click. */
export function selectPixelsByColor(buffer: PixelBuffer, x: number, y: number, connected: boolean): ColorSelection | null {
  const layer = buffer.activeLayer
  if (!layer || x < 0 || y < 0 || x >= buffer.width || y >= buffer.height) return null
  const data = layer.ctx.getImageData(0, 0, buffer.width, buffer.height).data
  const origin = (y * buffer.width + x) * 4
  const r = data[origin]
  const g = data[origin + 1]
  const b = data[origin + 2]
  const a = data[origin + 3]
  const chosen: number[] = []
  if (!connected) {
    for (let i = 0; i < data.length; i += 4) {
      if (sameColor(data, i, r, g, b, a)) chosen.push(i / 4)
    }
  } else {
    const seen = new Uint8Array(buffer.width * buffer.height)
    const stack = [y * buffer.width + x]
    seen[stack[0]] = 1
    while (stack.length) {
      const pixel = stack.pop()!
      chosen.push(pixel)
      const px = pixel % buffer.width
      const py = (pixel - px) / buffer.width
      const neighbors = [
        [px - 1, py],
        [px + 1, py],
        [px, py - 1],
        [px, py + 1]
      ]
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || ny < 0 || nx >= buffer.width || ny >= buffer.height) continue
        const next = ny * buffer.width + nx
        if (seen[next]) continue
        if (!sameColor(data, next * 4, r, g, b, a)) continue
        seen[next] = 1
        stack.push(next)
      }
    }
  }
  if (!chosen.length) return null
  let minX = buffer.width
  let minY = buffer.height
  let maxX = 0
  let maxY = 0
  for (const pixel of chosen) {
    const px = pixel % buffer.width
    const py = (pixel - px) / buffer.width
    if (px < minX) minX = px
    if (py < minY) minY = py
    if (px > maxX) maxX = px
    if (py > maxY) maxY = py
  }
  const rect = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
  const mask = new Uint8Array(rect.w * rect.h)
  for (const pixel of chosen) {
    const px = pixel % buffer.width
    const py = (pixel - px) / buffer.width
    mask[(py - rect.y) * rect.w + (px - rect.x)] = 1
  }
  return { rect, mask }
}

/** Constrain even ImageData-based tools (fill/shade) which ignore canvas clipping. */
export function paintWithinSelection(
  buffer: PixelBuffer,
  rect: PaintRect | null,
  paint: () => void,
  mask?: Uint8Array | null
) {
  if (!rect) { paint(); return }
  const ctx = buffer.activeLayer!.ctx
  const strips = [
    { x: 0, y: 0, w: buffer.width, h: rect.y },
    { x: 0, y: rect.y + rect.h, w: buffer.width, h: buffer.height - rect.y - rect.h },
    { x: 0, y: rect.y, w: rect.x, h: rect.h },
    { x: rect.x + rect.w, y: rect.y, w: buffer.width - rect.x - rect.w, h: rect.h },
  ].filter(r => r.w > 0 && r.h > 0).map(r => ({ ...r, pixels: ctx.getImageData(r.x, r.y, r.w, r.h) }))
  const masked = Boolean(mask && mask.length === rect.w * rect.h)
  const inside = masked ? ctx.getImageData(rect.x, rect.y, rect.w, rect.h) : null
  const deferred = buffer.compositeDeferred
  buffer.suspendComposite()
  try { paint() } finally {
    for (const strip of strips) ctx.putImageData(strip.pixels, strip.x, strip.y)
    if (inside && mask) {
      const after = ctx.getImageData(rect.x, rect.y, rect.w, rect.h)
      for (let i = 0; i < mask.length; i++) {
        if (mask[i]) continue
        const offset = i * 4
        after.data[offset] = inside.data[offset]
        after.data[offset + 1] = inside.data[offset + 1]
        after.data[offset + 2] = inside.data[offset + 2]
        after.data[offset + 3] = inside.data[offset + 3]
      }
      ctx.putImageData(after, rect.x, rect.y)
    }
    buffer.compositeDeferred = deferred
    buffer.commitLayers()
  }
}

export type SelectionCombine = 'replace' | 'add' | 'subtract' | 'intersect'

export interface PixelSelection {
  rect: PaintRect
  /** Null means every pixel in `rect` is selected. */
  mask: Uint8Array | null
}

function clipRect(rect: PaintRect, width: number, height: number): PaintRect | null {
  const x0 = Math.max(0, rect.x)
  const y0 = Math.max(0, rect.y)
  const x1 = Math.min(width, rect.x + rect.w)
  const y1 = Math.min(height, rect.y + rect.h)
  if (x1 <= x0 || y1 <= y0) return null
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

function covers(sel: PixelSelection | null, x: number, y: number) {
  if (!sel) return false
  const r = sel.rect
  if (x < r.x || y < r.y || x >= r.x + r.w || y >= r.y + r.h) return false
  if (!sel.mask) return true
  return sel.mask[(y - r.y) * r.w + (x - r.x)] === 1
}

function pack(bits: Array<{ x: number; y: number }>): PixelSelection | null {
  if (!bits.length) return null
  let minX = bits[0]!.x
  let minY = bits[0]!.y
  let maxX = minX
  let maxY = minY
  for (const p of bits) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  const rect = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
  if (bits.length === rect.w * rect.h) return { rect, mask: null }
  const mask = new Uint8Array(rect.w * rect.h)
  for (const p of bits) mask[(p.y - minY) * rect.w + (p.x - minX)] = 1
  return { rect, mask }
}

function selectionBits(sel: PixelSelection | null): Array<{ x: number; y: number }> {
  if (!sel) return []
  const bits: Array<{ x: number; y: number }> = []
  const r = sel.rect
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      if (!sel.mask || sel.mask[(y - r.y) * r.w + (x - r.x)] === 1) bits.push({ x, y })
    }
  }
  return bits
}

/** Combine a rectangle or a masked pick (magic wand) with the current selection. */
export function combineMaskedSelection(
  current: PixelSelection | null,
  next: PixelSelection,
  mode: SelectionCombine,
  width: number,
  height: number
): PixelSelection | null {
  if (mode === 'replace' || !current) return pack(selectionBits(next).filter(p => p.x >= 0 && p.y >= 0 && p.x < width && p.y < height))
  const had = new Set(selectionBits(current).map(p => `${p.x},${p.y}`))
  const inside = new Set(selectionBits(next).map(p => `${p.x},${p.y}`))
  const bits: Array<{ x: number; y: number }> = []
  const consider = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    const key = `${x},${y}`
    const a = had.has(key)
    const b = inside.has(key)
    const keep = mode === 'add' ? a || b : mode === 'subtract' ? a && !b : a && b
    if (keep) bits.push({ x, y })
  }
  for (const p of selectionBits(current)) consider(p.x, p.y)
  for (const p of selectionBits(next)) consider(p.x, p.y)
  return pack(bits)
}

/** Photoshop-style marquee combine. A plain replaced rectangle stays mask-free. */
export function combineSelection(
  current: PixelSelection | null,
  next: PaintRect,
  mode: SelectionCombine,
  width: number,
  height: number
): PixelSelection | null {
  const clipped = clipRect(next, width, height)
  if (!clipped) return mode === 'replace' ? null : current
  if (mode === 'replace' || !current) return { rect: clipped, mask: null }
  const x0 = Math.min(current.rect.x, clipped.x)
  const y0 = Math.min(current.rect.y, clipped.y)
  const x1 = Math.max(current.rect.x + current.rect.w, clipped.x + clipped.w)
  const y1 = Math.max(current.rect.y + current.rect.h, clipped.y + clipped.h)
  const bits: Array<{ x: number; y: number }> = []
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const inside = x >= clipped.x && y >= clipped.y && x < clipped.x + clipped.w && y < clipped.y + clipped.h
      const had = covers(current, x, y)
      const keep = mode === 'add' ? had || inside
        : mode === 'subtract' ? had && !inside
        : had && inside
      if (keep) bits.push({ x, y })
    }
  }
  return pack(bits)
}

/** Slide the outline. Pixels that leave the canvas are dropped. */
export function offsetSelection(sel: PixelSelection, dx: number, dy: number, width: number, height: number): PixelSelection | null {
  const bits: Array<{ x: number; y: number }> = []
  const r = sel.rect
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      if (sel.mask && sel.mask[(y - r.y) * r.w + (x - r.x)] !== 1) continue
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      bits.push({ x: nx, y: ny })
    }
  }
  return pack(bits)
}

export function invertPixelSelection(sel: PixelSelection | null, width: number, height: number): PixelSelection | null {
  const bits: Array<{ x: number; y: number }> = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!covers(sel, x, y)) bits.push({ x, y })
    }
  }
  return pack(bits)
}
