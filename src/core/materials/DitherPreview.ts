import type { DitherPattern, Material } from '../../types/texture'
import { getDitherMatrixValue } from '../../utils/dithering'
import { defaultGradient, paintGradient, paintMaterialAlbedo, resolveMaterialFill } from './MaterialFill'

export type DitherPreviewSource = 'material' | 'ramp' | 'color' | 'gradient' | 'image'

export const DITHER_PATTERN_OPTIONS: Array<{ id: DitherPattern; label: string; hint: string }> = [
  { id: 'bayer4x4', label: 'Bayer 4×4', hint: 'Classic ordered grid. Good default.' },
  { id: 'bayer8x8', label: 'Bayer 8×8', hint: 'Finer grid, smoother ramps.' },
  { id: 'bayer2x2', label: 'Bayer 2×2', hint: 'Chunky 4-level steps.' },
  { id: 'bayer16x16', label: 'Bayer 16×16', hint: 'Very fine ordered matrix.' },
  { id: 'bluenoise', label: 'Blue noise', hint: 'Organic speckle, less grid.' },
  { id: 'halftone', label: 'Halftone', hint: 'Print-style clustered dots.' },
  { id: 'dots', label: 'Dot screen', hint: 'Larger halftone dots.' },
  { id: 'checker', label: 'Checker', hint: 'Saturn-style weave.' },
  { id: 'crosshatch', label: 'Crosshatch', hint: 'Ink hatch lines.' },
  { id: 'horizontal_lines', label: 'Scanlines', hint: 'CRT horizontal bars.' },
  { id: 'vertical_lines', label: 'Columns', hint: 'Vertical bars.' },
  { id: 'diagonal', label: 'Diagonal', hint: 'Stipple bands.' },
  { id: 'snes', label: 'SNES', hint: 'Coarse 15-bit Bayer.' },
  { id: 'saturn_mesh', label: 'Saturn mesh', hint: 'Every other pixel drop.' },
  { id: 'dreamcast', label: 'Dreamcast', hint: 'Fine Bayer plus noise.' },
  { id: 'gba', label: 'GBA', hint: 'Blocky LCD steps.' },
  { id: 'rgb_shift', label: 'RGB phase', hint: 'Per-channel Bayer offset.' },
  { id: 'noise', label: 'White noise', hint: 'Random grain.' }
]

export const COLOR_DEPTH_OPTIONS: Array<{ value: number; label: string; hint: string }> = [
  { value: 0, label: 'Full color', hint: 'Dither only, no palette squeeze' },
  { value: 32, label: 'PS1 15-bit', hint: '32 levels per channel' },
  { value: 16, label: '12-bit', hint: 'Genesis / N64-ish steps' },
  { value: 8, label: '256 colors', hint: '8 levels per channel' },
  { value: 4, label: '16 colors', hint: 'Very posterized' },
  { value: 2, label: 'Black & white', hint: 'Two tones' }
]

export function colorDepthLabel(depth: number | undefined): string {
  return COLOR_DEPTH_OPTIONS.find(option => option.value === (depth ?? 32))?.label || 'PS1 15-bit'
}

export interface OrderedDitherOptions {
  pattern?: string
  ditherLevel?: number
  colorDepth?: number
  scale?: number
  channel?: 'luma' | 'rgb' | 'alpha'
  contrast?: number
  /** Preview-only: draw a checker where alpha is punched out. Bake keeps real transparency. */
  checkerForTransparent?: boolean
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

export function applyOrderedDither(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options: OrderedDitherOptions = {}
): void {
  const pattern = options.pattern || 'bayer4x4'
  const intensity = (options.ditherLevel ?? 32) / 32
  const quant = (options.colorDepth ?? 32) > 0 ? (options.colorDepth ?? 32) : 255
  const scale = Math.max(1, Math.floor(options.scale ?? 1))
  const channel = options.channel || 'rgb'
  const contrast = typeof options.contrast === 'number' ? options.contrast : 1
  const checkerForTransparent = options.checkerForTransparent !== false
  const shift = pattern === 'rgb_shift' && channel === 'rgb'

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const sx = Math.floor(x / scale)
      const sy = Math.floor(y / scale)
      const ditherR = getDitherMatrixValue(sx, sy, shift ? 'bayer4x4' : pattern)
      const ditherG = shift ? getDitherMatrixValue(sx + 1, sy, 'bayer4x4') : ditherR
      const ditherB = shift ? getDitherMatrixValue(sx, sy + 1, 'bayer4x4') : ditherR
      const offsetR = (ditherR * intensity * contrast) / Math.max(1, quant)
      const offsetG = (ditherG * intensity * contrast) / Math.max(1, quant)
      const offsetB = (ditherB * intensity * contrast) / Math.max(1, quant)

      let r = data[i] / 255
      let g = data[i + 1] / 255
      let b = data[i + 2] / 255
      let a = data[i + 3] / 255

      if (channel === 'alpha') {
        const luma = 0.299 * r + 0.587 * g + 0.114 * b
        a = (ditherR + 0.5) < luma ? 1 : 0
      } else if (channel === 'luma') {
        const luma = 0.299 * r + 0.587 * g + 0.114 * b
        const dithered = clamp01(luma + offsetG)
        const ratio = luma > 0.001 ? dithered / luma : 1
        r = clamp01(r * ratio)
        g = clamp01(g * ratio)
        b = clamp01(b * ratio)
      } else {
        r = clamp01(r + offsetR)
        g = clamp01(g + offsetG)
        b = clamp01(b + offsetB)
      }

      if (quant < 255 && channel !== 'alpha') {
        r = Math.floor(r * quant + 0.5) / quant
        g = Math.floor(g * quant + 0.5) / quant
        b = Math.floor(b * quant + 0.5) / quant
      }

      if (a <= 0.001) {
        if (checkerForTransparent) {
          const check = ((Math.floor(x / 6) + Math.floor(y / 6)) % 2) === 0
          const bg = check ? 42 : 22
          data[i] = bg
          data[i + 1] = bg
          data[i + 2] = bg
          data[i + 3] = 255
        } else {
          data[i + 3] = 0
        }
      } else {
        data[i] = Math.round(r * 255)
        data[i + 1] = Math.round(g * 255)
        data[i + 2] = Math.round(b * 255)
        data[i + 3] = 255
      }
    }
  }
}

function paintGrayRamp(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const image = ctx.createImageData(width, height)
  const data = image.data
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = x / Math.max(1, width - 1)
      const v = Math.round(t * 255)
      const i = (y * width + x) * 4
      data[i] = v
      data[i + 1] = v
      data[i + 2] = v
      data[i + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
}

export function paintDitherSource(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  mat: Material,
  source: DitherPreviewSource,
  image?: CanvasImageSource | null
) {
  if (source === 'ramp') {
    paintGrayRamp(ctx, width, height)
    return
  }
  if (source === 'color') {
    ctx.fillStyle = mat.color || '#ffffff'
    ctx.fillRect(0, 0, width, height)
    return
  }
  if (source === 'gradient') {
    paintGradient(ctx, width, height, mat.gradient || defaultGradient(mat.color), mat.color)
    return
  }
  if (source === 'image' && image) {
    ctx.fillStyle = mat.color || '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.save()
    ctx.globalCompositeOperation = 'multiply'
    ctx.drawImage(image, 0, 0, width, height)
    ctx.restore()
    return
  }
  if (source === 'image') {
    paintGrayRamp(ctx, width, height)
    return
  }
  paintMaterialAlbedo(ctx, width, height, mat, image)
}

export function paintDitherPreview(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  mat: Material,
  options: {
    source?: DitherPreviewSource
    split?: boolean
    image?: CanvasImageSource | null
    checkerForTransparent?: boolean
  } = {}
) {
  const w = Math.max(2, Math.round(width))
  const h = Math.max(2, Math.round(height))
  const source = options.source || 'material'
  ctx.clearRect(0, 0, w, h)
  paintDitherSource(ctx, w, h, mat, source, options.image ?? null)
  if (!mat.dither) return

  const pixels = ctx.getImageData(0, 0, w, h)
  applyOrderedDither(pixels.data, w, h, {
    pattern: mat.ditherPattern,
    ditherLevel: mat.ditherLevel,
    colorDepth: mat.colorDepth,
    scale: mat.ditherScale,
    channel: mat.ditherChannel,
    contrast: mat.ditherContrast,
    checkerForTransparent: options.checkerForTransparent
  })

  if (options.split) {
    const original = ctx.getImageData(0, 0, w, h)
    const mid = Math.floor(w / 2)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < mid; x++) {
        const i = (y * w + x) * 4
        pixels.data[i] = original.data[i]
        pixels.data[i + 1] = original.data[i + 1]
        pixels.data[i + 2] = original.data[i + 2]
        pixels.data[i + 3] = original.data[i + 3]
      }
    }
  }
  ctx.putImageData(pixels, 0, 0)
}

/** Full-size dithered pixels for baking into a texture (no split, real alpha). */
export function rasterizeDitheredFill(
  mat: Material,
  width: number,
  height: number,
  source: DitherPreviewSource,
  image?: CanvasImageSource | null
): ImageData {
  const w = Math.max(2, Math.round(width))
  const h = Math.max(2, Math.round(height))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return new ImageData(w, h)
  paintDitherPreview(ctx, w, h, { ...mat, dither: true }, {
    source,
    split: false,
    image: image ?? null,
    checkerForTransparent: false
  })
  return ctx.getImageData(0, 0, w, h)
}

export function suggestedPreviewSource(mat: Material): DitherPreviewSource {
  const fill = resolveMaterialFill(mat)
  if (fill === 'gradient') return 'gradient'
  if (fill === 'image') return 'image'
  return 'color'
}
