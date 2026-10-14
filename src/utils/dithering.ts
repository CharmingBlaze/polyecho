import type { DitherPattern } from '../types/texture'

export interface DitherPreset {
  id: string
  name: string
  pattern: DitherPattern
  ditherLevel: number // 4 to 64
  colorDepth: number // 0 (24-bit), 32 (15-bit PSX), 16 (12-bit), 8 (8-bit), 4 (4-bit), 2 (1-bit)
  scale: number // 1 to 4
  space?: 'screen' | 'uv' | 'world'
  channel?: 'luma' | 'rgb' | 'alpha'
  contrast?: number
  description: string
}

export interface DitherLookGroup {
  id: string
  label: string
  presetIds: string[]
}

export const DITHER_PRESETS: DitherPreset[] = [
  {
    id: 'psx-15bit',
    name: 'PS1 15-bit',
    pattern: 'bayer4x4',
    ditherLevel: 32,
    colorDepth: 32,
    scale: 1,
    space: 'screen',
    channel: 'rgb',
    description: 'PlayStation 1 RGB555 ordered dither'
  },
  {
    id: 'saturn-mesh',
    name: 'Saturn mesh',
    pattern: 'saturn_mesh',
    ditherLevel: 48,
    colorDepth: 32,
    scale: 1,
    space: 'screen',
    channel: 'rgb',
    description: 'Saturn VDP1 checker stipple, the mesh-transparency weave'
  },
  {
    id: 'saturn-15bit',
    name: 'Saturn 15-bit',
    pattern: 'bayer4x4',
    ditherLevel: 28,
    colorDepth: 32,
    scale: 1,
    space: 'screen',
    channel: 'rgb',
    description: 'Saturn high-color ordered dither without the mesh dropout'
  },
  {
    id: 'dreamcast-16',
    name: 'Dreamcast 16-bit',
    pattern: 'dreamcast',
    ditherLevel: 16,
    colorDepth: 32,
    scale: 1,
    space: 'screen',
    channel: 'luma',
    description: 'PowerVR fine ordered dither for 16-bit framebuffer modes'
  },
  {
    id: 'genesis-12bit',
    name: 'Mega Drive',
    pattern: 'bayer4x4',
    ditherLevel: 32,
    colorDepth: 16,
    scale: 1,
    space: 'screen',
    channel: 'rgb',
    description: 'Genesis 9-bit color stepped with a 4×4 matrix'
  },
  {
    id: 'snes-15bit',
    name: 'SNES',
    pattern: 'snes',
    ditherLevel: 36,
    colorDepth: 32,
    scale: 1,
    space: 'screen',
    channel: 'rgb',
    description: 'Chunky 15-bit Bayer, the Super Nintendo gradient weave'
  },
  {
    id: 'n64-coverage',
    name: 'N64',
    pattern: 'bluenoise',
    ditherLevel: 24,
    colorDepth: 16,
    scale: 1,
    space: 'screen',
    channel: 'rgb',
    description: 'Coverage-style noise for N64 16-bit framebuffers'
  },
  {
    id: 'gba-lcd',
    name: 'GBA',
    pattern: 'gba',
    ditherLevel: 40,
    colorDepth: 32,
    scale: 2,
    space: 'screen',
    channel: 'rgb',
    description: 'Game Boy Advance LCD, coarse 15-bit blocks'
  },
  {
    id: 'rgb-shift',
    name: 'RGB phase',
    pattern: 'rgb_shift',
    ditherLevel: 32,
    colorDepth: 32,
    scale: 1,
    space: 'screen',
    channel: 'rgb',
    description: 'Per-channel Bayer phase, the chromatic console gradient'
  },
  {
    id: 'smooth-halftone-8x8',
    name: 'Smooth Halftone 8x8',
    pattern: 'bayer8x8',
    ditherLevel: 32,
    colorDepth: 24,
    scale: 1,
    space: 'screen',
    channel: 'luma',
    description: '64-level fine gradient matrix for soft, smooth transitions'
  },
  {
    id: 'gameboy-2bit',
    name: 'GameBoy 2-Bit Classic',
    pattern: 'bayer4x4',
    ditherLevel: 48,
    colorDepth: 4,
    scale: 2,
    space: 'screen',
    channel: 'luma',
    description: '4-level coarse LCD matrix with high contrast stepping'
  },
  {
    id: 'macintosh-1bit',
    name: 'Mac 1-Bit Noir',
    pattern: 'bayer8x8',
    ditherLevel: 64,
    colorDepth: 2,
    scale: 1,
    space: 'screen',
    channel: 'luma',
    description: 'High-contrast Apple Macintosh 1-bit monochrome display'
  },
  {
    id: 'coarse-micro-2x2',
    name: 'PC-98 Micro 2x2',
    pattern: 'bayer2x2',
    ditherLevel: 42,
    colorDepth: 8,
    scale: 2,
    space: 'uv',
    channel: 'rgb',
    description: 'Low-fi 4-level micro crosshatch for retro PC-98 pixel art'
  },
  {
    id: 'manga-halftone-dots',
    name: 'Manga Screen Tone',
    pattern: 'halftone',
    ditherLevel: 40,
    colorDepth: 6,
    scale: 2,
    space: 'screen',
    channel: 'luma',
    description: 'Clustered dot halftone screen tones used in print manga'
  },
  {
    id: 'comic-crosshatch',
    name: 'Comic Crosshatch',
    pattern: 'crosshatch',
    ditherLevel: 38,
    colorDepth: 8,
    scale: 2,
    space: 'uv',
    channel: 'luma',
    description: '45-degree diagonal hatching simulating hand-drawn pencil ink'
  },
  {
    id: 'blue-noise-film',
    name: 'Blue Noise Stochastic',
    pattern: 'bluenoise',
    ditherLevel: 28,
    colorDepth: 16,
    scale: 1,
    space: 'screen',
    channel: 'luma',
    description: 'Organic high-frequency blue noise without grid repetition'
  },
  {
    id: 'crt-interlaced',
    name: 'CRT Interlaced Scan',
    pattern: 'horizontal_lines',
    ditherLevel: 36,
    colorDepth: 16,
    scale: 2,
    space: 'screen',
    channel: 'rgb',
    description: 'Horizontal scanline raster beam interlacing'
  },
  {
    id: 'screen-door-alpha',
    name: 'Screen door',
    pattern: 'bayer4x4',
    ditherLevel: 64,
    colorDepth: 0,
    scale: 1,
    space: 'screen',
    channel: 'alpha',
    description: 'Hardware stipple transparency'
  },
  {
    id: 'checker-50',
    name: 'Checker',
    pattern: 'checker',
    ditherLevel: 36,
    colorDepth: 8,
    scale: 2,
    space: 'screen',
    channel: 'luma',
    description: 'Alternating checker weave'
  },
  {
    id: 'diagonal-bands',
    name: 'Diagonal',
    pattern: 'diagonal',
    ditherLevel: 36,
    colorDepth: 16,
    scale: 1,
    space: 'screen',
    channel: 'luma',
    description: 'Diagonal bands used for stippled gradients'
  },
  {
    id: 'dot-screen',
    name: 'Dot screen',
    pattern: 'dots',
    ditherLevel: 40,
    colorDepth: 8,
    scale: 1,
    space: 'screen',
    channel: 'luma',
    description: 'Clustered halftone dots, larger than the print screen'
  }
]

export const DITHER_LOOK_GROUPS: DitherLookGroup[] = [
  { id: 'sega', label: 'Sega', presetIds: ['saturn-mesh', 'saturn-15bit', 'dreamcast-16', 'genesis-12bit'] },
  { id: 'nintendo', label: 'Nintendo', presetIds: ['snes-15bit', 'n64-coverage', 'gba-lcd', 'gameboy-2bit'] },
  { id: 'sony', label: 'Sony', presetIds: ['psx-15bit', 'rgb-shift'] },
  {
    id: 'more',
    label: 'More',
    presetIds: [
      'smooth-halftone-8x8',
      'manga-halftone-dots',
      'dot-screen',
      'comic-crosshatch',
      'diagonal-bands',
      'blue-noise-film',
      'crt-interlaced',
      'checker-50',
      'macintosh-1bit',
      'coarse-micro-2x2',
      'screen-door-alpha'
    ]
  }
]

export function ditherPresetsInGroup(group: DitherLookGroup): DitherPreset[] {
  return group.presetIds
    .map(id => DITHER_PRESETS.find(preset => preset.id === id))
    .filter((preset): preset is DitherPreset => !!preset)
}

// ----------------------------------------------------------------------------
// BAYER & PATTERN MATRICES
// ----------------------------------------------------------------------------
const BAYER_2X2 = [
  [0, 2],
  [3, 1]
]

const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5]
]

// Clustered Dot Halftone Matrix 4x4
const CLUSTERED_HALFTONE_4X4 = [
  [11, 4, 6, 12],
  [3, 0, 1, 7],
  [9, 2, 5, 10],
  [15, 8, 14, 13]
]

// 8x8 Blue Noise Precomputed Seed Matrix
const BLUE_NOISE_8X8 = [
  [24, 49, 13, 38, 59, 1, 44, 21],
  [10, 36, 61, 2, 27, 47, 18, 56],
  [51, 16, 29, 42, 14, 33, 53, 5],
  [3, 58, 8, 55, 23, 63, 9, 39],
  [32, 20, 46, 17, 35, 6, 48, 26],
  [60, 43, 0, 62, 50, 28, 19, 57],
  [15, 25, 34, 11, 22, 41, 54, 4],
  [45, 52, 7, 40, 57, 12, 31, 37]
]

export function getDitherMatrixValue(x: number, y: number, pattern: string): number {
  const px = Math.floor(x)
  const py = Math.floor(y)

  if (pattern === 'bayer2x2') {
    const v = BAYER_2X2[((py % 2) + 2) % 2][((px % 2) + 2) % 2]
    return (v / 4.0) - 0.5
  }

  if (pattern === 'bayer8x8' || pattern === 'ordered') {
    const pX = ((px % 8) + 8) % 8
    const pY = ((py % 8) + 8) % 8
    const m4 = BAYER_4X4[pY % 4][pX % 4]
    const m2 = BAYER_2X2[Math.floor(pY / 4)][Math.floor(pX / 4)]
    return ((4 * m4 + m2) / 64.0) - 0.5
  }

  if (pattern === 'bayer16x16') {
    const pX = ((px % 16) + 16) % 16
    const pY = ((py % 16) + 16) % 16
    const pX8 = pX % 8
    const pY8 = pY % 8
    const m4 = BAYER_4X4[pY8 % 4][pX8 % 4]
    const m2 = BAYER_2X2[Math.floor(pY8 / 4)][Math.floor(pX8 / 4)]
    const b8 = 4 * m4 + m2
    const m2x2 = BAYER_2X2[Math.floor(pY / 8)][Math.floor(pX / 8)]
    return ((4 * b8 + m2x2) / 256.0) - 0.5
  }

  if (pattern === 'bluenoise') {
    const pX = ((px % 8) + 8) % 8
    const pY = ((py % 8) + 8) % 8
    const v = BLUE_NOISE_8X8[pY][pX]
    return (v / 64.0) - 0.5
  }

  if (pattern === 'halftone') {
    const pX = ((px % 4) + 4) % 4
    const pY = ((py % 4) + 4) % 4
    const v = CLUSTERED_HALFTONE_4X4[pY][pX]
    return (v / 16.0) - 0.5
  }

  if (pattern === 'crosshatch') {
    const line1 = ((px + py) % 4 === 0) ? 0.35 : -0.15
    const line2 = ((px - py + 4000) % 4 === 0) ? 0.35 : -0.15
    return (line1 + line2) * 0.5
  }

  if (pattern === 'horizontal_lines') {
    const isLine = (py % 2 === 0)
    return isLine ? 0.35 : -0.35
  }

  if (pattern === 'vertical_lines') {
    const isLine = (px % 2 === 0)
    return isLine ? 0.35 : -0.35
  }

  if (pattern === 'checker') {
    const isEven = (px + py) % 2 === 0
    return isEven ? 0.35 : -0.35
  }

  if (pattern === 'noise') {
    const n = Math.sin(px * 12.9898 + py * 78.233) * 43758.5453
    return (n - Math.floor(n)) - 0.5
  }

  if (pattern === 'snes') {
    return getDitherMatrixValue(Math.floor(px / 2), Math.floor(py / 2), 'bayer4x4')
  }

  if (pattern === 'saturn_mesh') {
    return (px + py) % 2 === 0 ? 0.5 : -0.5
  }

  if (pattern === 'dreamcast') {
    const bayer = getDitherMatrixValue(px, py, 'bayer8x8')
    const noise = getDitherMatrixValue(px, py, 'bluenoise')
    return bayer * 0.65 + noise * 0.35
  }

  if (pattern === 'gba') {
    return getDitherMatrixValue(Math.floor(px / 2), Math.floor(py / 2), 'bayer2x2')
  }

  if (pattern === 'diagonal') {
    return (Math.floor(px + py) % 4) / 4 - 0.5
  }

  if (pattern === 'dots') {
    return getDitherMatrixValue(Math.floor(px / 2), Math.floor(py / 2), 'halftone')
  }

  if (pattern === 'rgb_shift') {
    return getDitherMatrixValue(px, py, 'bayer4x4')
  }

  // Default bayer4x4
  const v = BAYER_4X4[((py % 4) + 4) % 4][((px % 4) + 4) % 4]
  return (v / 16.0) - 0.5
}

/**
 * Legacy sphere+ramp canvas preview. The Material Dither tab uses `paintDitherPreview` in DitherPreview.ts.
 */
export function renderDitherCanvasPreview(
  canvas: HTMLCanvasElement,
  pattern: string = 'bayer4x4',
  ditherLevel: number = 32,
  colorDepth: number = 32,
  scale: number = 1,
  baseHex: string = '#38bdf8',
  channel: 'luma' | 'rgb' | 'alpha' = 'rgb'
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const w = canvas.width
  const h = canvas.height
  const imgData = ctx.createImageData(w, h)
  const d = imgData.data

  // Parse base color
  let clean = baseHex.replace('#', '')
  if (clean.length === 3) clean = clean.split('').map(c => c + c).join('')
  const num = parseInt(clean || 'ffffff', 16)
  const baseR = (num >> 16) & 255
  const baseG = (num >> 8) & 255
  const baseB = num & 255

  const intensity = ditherLevel / 32
  const quant = colorDepth > 0 ? colorDepth : 255
  const ditherScale = Math.max(1, Math.floor(scale))

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4

      // Generate a smooth lighting gradient (sphere-like in top-left or horizontal ramp in bottom)
      let light: number
      let isAlphaRegion = false

      if (y < h * 0.52) {
        // Shaded sphere preview
        const cx = w * 0.5
        const cy = h * 0.28
        const radius = h * 0.22
        const dx = (x - cx) / radius
        const dy = (y - cy) / radius
        const distSq = dx * dx + dy * dy
        if (distSq <= 1.0) {
          const z = Math.sqrt(1.0 - distSq)
          const lx = 0.5, ly = -0.6, lz = 0.7
          const lLen = Math.sqrt(lx * lx + ly * ly + lz * lz)
          const dot = Math.max(0, (dx * lx + dy * ly + z * lz) / lLen)
          light = 0.15 + dot * 0.9
        } else {
          // Background dark checker
          const bgCheck = (Math.floor(x / 6) + Math.floor(y / 6)) % 2 === 0
          light = bgCheck ? 0.08 : 0.04
          isAlphaRegion = true
        }
      } else {
        // Linear gradient ramp across 0% to 100%
        light = x / w
      }

      const sx = Math.floor(x / ditherScale)
      const sy = Math.floor(y / ditherScale)
      const shift = pattern === 'rgb_shift' && channel === 'rgb'
      const ditherR = getDitherMatrixValue(sx, sy, shift ? 'bayer4x4' : pattern)
      const ditherG = shift ? getDitherMatrixValue(sx + 1, sy, 'bayer4x4') : ditherR
      const ditherB = shift ? getDitherMatrixValue(sx, sy + 1, 'bayer4x4') : ditherR
      const offsetR = (ditherR * intensity) / Math.max(1, quant)
      const offsetG = (ditherG * intensity) / Math.max(1, quant)
      const offsetB = (ditherB * intensity) / Math.max(1, quant)

      let r = (baseR / 255) * light
      let g = (baseG / 255) * light
      let b = (baseB / 255) * light
      let a = 1.0

      if (channel === 'alpha' && !isAlphaRegion) {
        const alphaThreshold = light
        a = (ditherR + 0.5) < alphaThreshold ? 1.0 : 0.0
      } else if (channel === 'luma') {
        const luma = 0.299 * r + 0.587 * g + 0.114 * b
        const ditheredLuma = Math.max(0, Math.min(1, luma + offsetG))
        const lumaRatio = luma > 0.001 ? (ditheredLuma / luma) : 1.0
        r = Math.max(0, Math.min(1, r * lumaRatio))
        g = Math.max(0, Math.min(1, g * lumaRatio))
        b = Math.max(0, Math.min(1, b * lumaRatio))

        if (colorDepth > 0) {
          r = Math.floor(r * quant + 0.5) / quant
          g = Math.floor(g * quant + 0.5) / quant
          b = Math.floor(b * quant + 0.5) / quant
        }
      } else {
        r = Math.max(0, Math.min(1, r + offsetR))
        g = Math.max(0, Math.min(1, g + offsetG))
        b = Math.max(0, Math.min(1, b + offsetB))

        if (colorDepth > 0) {
          r = Math.floor(r * quant + 0.5) / quant
          g = Math.floor(g * quant + 0.5) / quant
          b = Math.floor(b * quant + 0.5) / quant
        }
      }

      if (a === 0.0) {
        const bgCheck = (Math.floor(x / 6) + Math.floor(y / 6)) % 2 === 0
        const bgVal = bgCheck ? 30 : 15
        d[idx] = bgVal
        d[idx + 1] = bgVal
        d[idx + 2] = bgVal
        d[idx + 3] = 255
      } else {
        d[idx] = Math.round(Math.max(0, Math.min(255, r * 255)))
        d[idx + 1] = Math.round(Math.max(0, Math.min(255, g * 255)))
        d[idx + 2] = Math.round(Math.max(0, Math.min(255, b * 255)))
        d[idx + 3] = 255
      }
    }
  }

  ctx.putImageData(imgData, 0, 0)
}

/**
 * 2D Error Diffusion: Floyd-Steinberg Dithering
 */
export function applyFloydSteinbergDither(ctx: CanvasRenderingContext2D, w: number, h: number, paletteHexes: string[]) {
  const imgData = ctx.getImageData(0, 0, w, h)
  const d = imgData.data

  const palette = paletteHexes.map(hex => {
    let clean = hex.replace('#', '')
    if (clean.length === 3) clean = clean.split('').map(c => c + c).join('')
    const num = parseInt(clean, 16)
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255]
  })

  function findNearest(r: number, g: number, b: number): number[] {
    let bestDist = Infinity
    let bestColor = palette[0]
    for (const p of palette) {
      const dr = r - p[0]
      const dg = g - p[1]
      const db = b - p[2]
      const dist = dr * dr + dg * dg + db * db
      if (dist < bestDist) {
        bestDist = dist
        bestColor = p
      }
    }
    return bestColor
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4
      const oldR = d[idx]
      const oldG = d[idx + 1]
      const oldB = d[idx + 2]

      const [newR, newG, newB] = findNearest(oldR, oldG, oldB)
      d[idx] = newR
      d[idx + 1] = newG
      d[idx + 2] = newB

      const errR = oldR - newR
      const errG = oldG - newG
      const errB = oldB - newB

      const distribute = (dx: number, dy: number, factor: number) => {
        const nx = x + dx
        const ny = y + dy
        if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
          const nIdx = (ny * w + nx) * 4
          d[nIdx] = Math.max(0, Math.min(255, d[nIdx] + errR * factor))
          d[nIdx + 1] = Math.max(0, Math.min(255, d[nIdx + 1] + errG * factor))
          d[nIdx + 2] = Math.max(0, Math.min(255, d[nIdx + 2] + errB * factor))
        }
      }

      distribute(1, 0, 7 / 16)
      distribute(-1, 1, 3 / 16)
      distribute(0, 1, 5 / 16)
      distribute(1, 1, 1 / 16)
    }
  }

  ctx.putImageData(imgData, 0, 0)
}

/**
 * 2D Error Diffusion: Atkinson Dithering (Macintosh Classic)
 */
export function applyAtkinsonDither(ctx: CanvasRenderingContext2D, w: number, h: number, paletteHexes: string[]) {
  const imgData = ctx.getImageData(0, 0, w, h)
  const d = imgData.data

  const palette = paletteHexes.map(hex => {
    let clean = hex.replace('#', '')
    if (clean.length === 3) clean = clean.split('').map(c => c + c).join('')
    const num = parseInt(clean, 16)
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255]
  })

  function findNearest(r: number, g: number, b: number): number[] {
    let bestDist = Infinity
    let bestColor = palette[0]
    for (const p of palette) {
      const dr = r - p[0]
      const dg = g - p[1]
      const db = b - p[2]
      const dist = dr * dr + dg * dg + db * db
      if (dist < bestDist) {
        bestDist = dist
        bestColor = p
      }
    }
    return bestColor
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4
      const oldR = d[idx]
      const oldG = d[idx + 1]
      const oldB = d[idx + 2]

      const [newR, newG, newB] = findNearest(oldR, oldG, oldB)
      d[idx] = newR
      d[idx + 1] = newG
      d[idx + 2] = newB

      // Atkinson distributes 1/8 to 6 neighbors (retaining 25% error for crisp edges)
      const errR = oldR - newR
      const errG = oldG - newG
      const errB = oldB - newB

      const distribute = (dx: number, dy: number) => {
        const nx = x + dx
        const ny = y + dy
        if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
          const nIdx = (ny * w + nx) * 4
          d[nIdx] = Math.max(0, Math.min(255, d[nIdx] + errR * (1 / 8)))
          d[nIdx + 1] = Math.max(0, Math.min(255, d[nIdx + 1] + errG * (1 / 8)))
          d[nIdx + 2] = Math.max(0, Math.min(255, d[nIdx + 2] + errB * (1 / 8)))
        }
      }

      distribute(1, 0)
      distribute(2, 0)
      distribute(-1, 1)
      distribute(0, 1)
      distribute(1, 1)
      distribute(0, 2)
    }
  }

  ctx.putImageData(imgData, 0, 0)
}
