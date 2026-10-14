import type { Material, MaterialFill, MaterialGradient, MaterialGradientStop } from '../../types/texture'
import { hexToRgb, rgbToHex } from '../../utils/color'

export interface MaterialSurface {
  fill: MaterialFill
  /** Solid color, or the image tint. Gradients ignore this and use their stops. */
  color: string
  textureId: string | null
  gradient: MaterialGradient | null
}

export function defaultGradient(color = '#38bdf8'): MaterialGradient {
  return {
    kind: 'linear',
    angle: 90,
    stops: [
      { color, offset: 0 },
      { color: '#0f172a', offset: 1 }
    ]
  }
}

export function resolveMaterialFill(mat?: Pick<Material, 'fill' | 'textureId'> | null): MaterialFill {
  if (mat?.fill === 'solid' || mat?.fill === 'gradient' || mat?.fill === 'image') return mat.fill
  return mat?.textureId ? 'image' : 'solid'
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

const GRADIENT_KINDS: MaterialGradient['kind'][] = ['linear', 'radial', 'angle', 'reflected', 'diamond']

export function normalizeGradientKind(kind?: string | null): MaterialGradient['kind'] {
  return GRADIENT_KINDS.includes(kind as MaterialGradient['kind']) ? kind as MaterialGradient['kind'] : 'linear'
}

export function normalizeGradient(gradient?: MaterialGradient | null, fallbackColor = '#ffffff'): MaterialGradient {
  const kind = normalizeGradientKind(gradient?.kind)
  const angle = Number.isFinite(gradient?.angle) ? ((gradient!.angle % 360) + 360) % 360 : 90
  const raw = (gradient?.stops || []).filter(stop => typeof stop?.color === 'string' && stop.color.length > 0)
  const stops: MaterialGradientStop[] = (raw.length >= 2 ? raw : defaultGradient(fallbackColor).stops)
    .map(stop => {
      const next: MaterialGradientStop = { color: stop.color, offset: clamp01(stop.offset) }
      if (typeof stop.opacity === 'number') next.opacity = clamp01(stop.opacity)
      if (typeof stop.midpoint === 'number') next.midpoint = clamp(stop.midpoint, 0.13, 0.87)
      return next
    })
    .sort((a, b) => a.offset - b.offset)
  if (stops.length === 1) stops.push({ color: stops[0].color, offset: 1 })
  return { kind, angle, stops }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function stopOpacity(stop: MaterialGradientStop): number {
  return typeof stop.opacity === 'number' ? clamp01(stop.opacity) : 1
}

function mixChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t)
}

/** Canvas/CSS color, including opacity. */
export function stopCssColor(stop: MaterialGradientStop): string {
  const rgb = hexToRgb(stop.color || '#ffffff')
  const alpha = stopOpacity(stop)
  if (alpha >= 0.999) return rgbToHex(rgb.r, rgb.g, rgb.b)
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha.toFixed(3)})`
}

export interface ExpandedStop {
  offset: number
  color: string
  opacity: number
}

/** Color stops plus Illustrator midpoints (the 50% blend shifted along the span). */
export function expandGradientStops(gradient?: MaterialGradient | null, fallbackColor = '#ffffff'): ExpandedStop[] {
  const g = normalizeGradient(gradient, fallbackColor)
  const out: ExpandedStop[] = []
  for (let i = 0; i < g.stops.length; i++) {
    const stop = g.stops[i]
    out.push({ offset: stop.offset, color: stop.color, opacity: stopOpacity(stop) })
    const next = g.stops[i + 1]
    if (!next) continue
    const mid = stop.midpoint ?? 0.5
    if (Math.abs(mid - 0.5) < 0.001) continue
    const span = next.offset - stop.offset
    if (span <= 0.0001) continue
    out.push({
      offset: stop.offset + span * mid,
      color: rgbToHex(
        mixChannel(hexToRgb(stop.color).r, hexToRgb(next.color).r, 0.5),
        mixChannel(hexToRgb(stop.color).g, hexToRgb(next.color).g, 0.5),
        mixChannel(hexToRgb(stop.color).b, hexToRgb(next.color).b, 0.5)
      ),
      opacity: stopOpacity(stop) + (stopOpacity(next) - stopOpacity(stop)) * 0.5
    })
  }
  out.sort((a, b) => a.offset - b.offset)
  return out
}

export function sampleGradient(gradient: MaterialGradient | null | undefined, t: number, fallbackColor = '#ffffff'): { color: string; opacity: number } {
  const stops = expandGradientStops(gradient, fallbackColor)
  const pos = clamp01(t)
  if (pos <= stops[0].offset) return { color: stops[0].color, opacity: stops[0].opacity }
  const last = stops[stops.length - 1]
  if (pos >= last.offset) return { color: last.color, opacity: last.opacity }
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i]
    const b = stops[i + 1]
    if (pos < a.offset || pos > b.offset) continue
    const span = b.offset - a.offset
    const u = span <= 0.0001 ? 0 : (pos - a.offset) / span
    const ca = hexToRgb(a.color)
    const cb = hexToRgb(b.color)
    return {
      color: rgbToHex(mixChannel(ca.r, cb.r, u), mixChannel(ca.g, cb.g, u), mixChannel(ca.b, cb.b, u)),
      opacity: a.opacity + (b.opacity - a.opacity) * u
    }
  }
  return { color: stops[0].color, opacity: stops[0].opacity }
}

export function reverseGradient(gradient: MaterialGradient): MaterialGradient {
  const g = normalizeGradient(gradient)
  const stops = g.stops.map((stop, index) => {
    const next: MaterialGradientStop = {
      color: stop.color,
      offset: clamp01(1 - stop.offset)
    }
    if (typeof stop.opacity === 'number') next.opacity = stop.opacity
    if (index > 0) next.midpoint = clamp(1 - (g.stops[index - 1].midpoint ?? 0.5), 0.13, 0.87)
    return next
  })
  stops.sort((a, b) => a.offset - b.offset)
  return { kind: g.kind, angle: g.angle, stops }
}

export function resolveMaterialSurface(mat?: Material | null): MaterialSurface {
  const fill = resolveMaterialFill(mat)
  const color = mat?.color || '#ffffff'
  if (fill === 'gradient') {
    return {
      fill,
      color: '#ffffff',
      textureId: null,
      gradient: normalizeGradient(mat?.gradient, color)
    }
  }
  if (fill === 'image') {
    return {
      fill,
      color,
      textureId: mat?.textureId || null,
      gradient: null
    }
  }
  return { fill: 'solid', color, textureId: null, gradient: null }
}

export function gradientKey(gradient: MaterialGradient): string {
  const g = normalizeGradient(gradient)
  const stops = g.stops.map(stop => {
    const mid = (stop.midpoint ?? 0.5).toFixed(4)
    const alpha = (typeof stop.opacity === 'number' ? stop.opacity : 1).toFixed(4)
    return `${stop.offset.toFixed(4)}:${stop.color.toLowerCase()}:${mid}:${alpha}`
  }).join('|')
  return `${g.kind}:${g.angle.toFixed(2)}:${stops}`
}

export function materialFillKey(mat: Material): string {
  const surface = resolveMaterialSurface(mat)
  if (surface.fill === 'gradient' && surface.gradient) return `gradient:${gradientKey(surface.gradient)}`
  if (surface.fill === 'image') return `image:${surface.textureId || ''}:${surface.color}`
  return `solid:${surface.color}`
}

function rampStopsCss(gradient?: MaterialGradient | null, fallbackColor = '#ffffff'): string {
  return expandGradientStops(gradient, fallbackColor)
    .map(stop => `${stopCssColor({ color: stop.color, offset: stop.offset, opacity: stop.opacity })} ${(stop.offset * 100).toFixed(2)}%`)
    .join(', ')
}

/** Left-to-right ramp for the editor bar. Angle is not applied here. */
export function gradientRampCss(gradient?: MaterialGradient | null, fallbackColor = '#ffffff'): string {
  return `linear-gradient(to right, ${rampStopsCss(gradient, fallbackColor)})`
}

export function reflectedStopsCss(gradient?: MaterialGradient | null, fallbackColor = '#ffffff'): string {
  const expanded = expandGradientStops(gradient, fallbackColor)
  const mirrored = [
    ...expanded.map(stop => ({ ...stop, offset: stop.offset * 0.5 })),
    ...expanded.slice(1).map(stop => ({ ...stop, offset: 1 - stop.offset * 0.5 }))
  ].sort((a, b) => a.offset - b.offset)
  return mirrored
    .map(stop => `${stopCssColor({ color: stop.color, offset: stop.offset, opacity: stop.opacity })} ${(stop.offset * 100).toFixed(2)}%`)
    .join(', ')
}

/** CSS preview that matches `paintGradient` (0° is left to right). */
export function gradientCss(gradient?: MaterialGradient | null, fallbackColor = '#ffffff'): string {
  const g = normalizeGradient(gradient, fallbackColor)
  const stops = rampStopsCss(g, fallbackColor)
  if (g.kind === 'radial') return `radial-gradient(circle, ${stops})`
  if (g.kind === 'diamond') return `radial-gradient(closest-side, ${stops})`
  if (g.kind === 'angle') return `conic-gradient(from ${g.angle}deg, ${stops})`
  if (g.kind === 'reflected') return `linear-gradient(${g.angle + 90}deg, ${reflectedStopsCss(g, fallbackColor)})`
  return `linear-gradient(${g.angle + 90}deg, ${stops})`
}

/** 0–1 along the ramp for a UV / preview square. */
export function gradientParameter(gradient: MaterialGradient, u: number, v: number): number {
  const g = normalizeGradient(gradient)
  const x = u - 0.5
  const y = v - 0.5
  if (g.kind === 'radial') return clamp01(Math.hypot(x, y) * 2)
  if (g.kind === 'diamond') return clamp01(Math.max(Math.abs(x), Math.abs(y)) * 2)
  if (g.kind === 'angle') {
    const deg = ((Math.atan2(y, x) * 180) / Math.PI - g.angle + 360) % 360
    return deg / 360
  }
  const rad = (g.angle * Math.PI) / 180
  const linear = clamp01(((x * Math.cos(rad) + y * Math.sin(rad)) / Math.SQRT2) + 0.5)
  if (g.kind === 'reflected') return 1 - Math.abs(2 * linear - 1)
  return linear
}

export function createGradientCanvas(gradient: MaterialGradient | null | undefined, size = 128, fallbackColor = '#ffffff'): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  const px = Math.max(2, Math.round(size))
  canvas.width = px
  canvas.height = px
  const ctx = canvas.getContext('2d')
  if (ctx) paintGradient(ctx, px, px, gradient, fallbackColor)
  return canvas
}

export function paintGradient(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  gradient?: MaterialGradient | null,
  fallbackColor = '#ffffff'
) {
  const g = normalizeGradient(gradient, fallbackColor)
  if (g.kind === 'angle' || g.kind === 'diamond') {
    paintSampledGradient(ctx, width, height, g, fallbackColor)
    return
  }
  const ramp = g.kind === 'radial'
    ? ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.min(width, height) / 2)
    : linearRamp(ctx, width, height, g.angle)
  const stops = g.kind === 'reflected'
    ? expandGradientStops({ ...g, kind: 'linear', stops: remapReflectedStops(g.stops) }, fallbackColor)
    : expandGradientStops(g, fallbackColor)
  for (const stop of stops) {
    ramp.addColorStop(Math.min(1, Math.max(0, stop.offset)), stopCssColor({ color: stop.color, offset: stop.offset, opacity: stop.opacity }))
  }
  ctx.fillStyle = ramp
  ctx.fillRect(0, 0, width, height)
}

function remapReflectedStops(stops: MaterialGradientStop[]): MaterialGradientStop[] {
  const left = stops.map(stop => ({ ...stop, offset: stop.offset * 0.5 }))
  const right = stops.slice(1).map(stop => ({ ...stop, offset: 1 - stop.offset * 0.5 }))
  return [...left, ...right].sort((a, b) => a.offset - b.offset)
}

function paintSampledGradient(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  gradient: MaterialGradient,
  fallbackColor: string
) {
  const image = ctx.createImageData(width, height)
  const data = image.data
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sampled = sampleGradient(gradient, gradientParameter(gradient, (x + 0.5) / width, (y + 0.5) / height), fallbackColor)
      const rgb = hexToRgb(sampled.color)
      const i = (y * width + x) * 4
      data[i] = rgb.r
      data[i + 1] = rgb.g
      data[i + 2] = rgb.b
      data[i + 3] = Math.round(255 * sampled.opacity)
    }
  }
  ctx.putImageData(image, 0, 0)
}

function linearRamp(ctx: CanvasRenderingContext2D, width: number, height: number, angleDeg: number): CanvasGradient {
  const rad = (angleDeg * Math.PI) / 180
  const cx = width / 2
  const cy = height / 2
  const len = Math.hypot(width, height) / 2
  const dx = Math.cos(rad) * len
  const dy = Math.sin(rad) * len
  return ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy)
}

/** Lambert term for a unit-disk sphere. `nx`/`ny` are -1…1 from the disk center. */
export function sphereShade(nx: number, ny: number): number | null {
  const r2 = nx * nx + ny * ny
  if (r2 > 1) return null
  const nz = Math.sqrt(Math.max(0, 1 - r2))
  const ndotl = Math.max(0, nx * -0.35 + ny * -0.55 + nz * 0.76)
  return 0.16 + 0.84 * ndotl
}

export function paintMaterialAlbedo(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  mat: Material,
  image?: CanvasImageSource | null
) {
  const surface = resolveMaterialSurface(mat)
  if (surface.fill === 'gradient' && surface.gradient) {
    paintGradient(ctx, width, height, surface.gradient, mat.color)
    return
  }
  if (surface.fill === 'image' && image) {
    ctx.fillStyle = surface.color || '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.save()
    ctx.globalCompositeOperation = 'multiply'
    ctx.drawImage(image, 0, 0, width, height)
    ctx.restore()
    return
  }
  ctx.fillStyle = surface.color || '#ffffff'
  ctx.fillRect(0, 0, width, height)
}

/** Lit preview sphere. Viewport still owns the real shader; this matches fill color / gradient / image. */
export function paintMaterialSwatch(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  mat: Material,
  image?: CanvasImageSource | null
) {
  const w = Math.max(2, Math.round(width))
  const h = Math.max(2, Math.round(height))
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#0b0d12'
  ctx.fillRect(0, 0, w, h)
  paintMaterialAlbedo(ctx, w, h, mat, image)

  const pixels = ctx.getImageData(0, 0, w, h)
  const data = pixels.data
  const cx = (w - 1) / 2
  const cy = (h - 1) / 2
  const radius = Math.min(cx, cy)
  const unlit = mat.shading === 'unlit' || mat.shading === 'solid'
  const opacity = typeof mat.opacity === 'number' ? Math.min(1, Math.max(0, mat.opacity)) : 1

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x - cx) / radius
      const ny = (y - cy) / radius
      const shade = sphereShade(nx, ny)
      const i = (y * w + x) * 4
      if (shade == null) {
        data[i] = 11
        data[i + 1] = 13
        data[i + 2] = 18
        data[i + 3] = 255
        continue
      }
      const lit = unlit ? 0.42 + 0.58 * shade : shade
      data[i] = Math.min(255, Math.round(data[i] * lit))
      data[i + 1] = Math.min(255, Math.round(data[i + 1] * lit))
      data[i + 2] = Math.min(255, Math.round(data[i + 2] * lit))
      data[i + 3] = Math.round(255 * opacity)
    }
  }
  ctx.putImageData(pixels, 0, 0)
}
