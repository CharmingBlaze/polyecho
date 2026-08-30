import { Palette } from '../types/texture'

export const DEFAULT_PALETTES: Palette[] = [
  {
    id: 'psx-classic',
    name: 'PSX Classic 16',
    colors: [
      '#000000', '#1d2b53', '#7e2553', '#008751',
      '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8',
      '#ff004d', '#ffa300', '#ffec27', '#00e436',
      '#29adff', '#83769c', '#ff77a8', '#ffccaa'
    ]
  },
  {
    id: 'endesga-32',
    name: 'EDG 32 Retro',
    colors: [
      '#be4a2f', '#d77643', '#ead4aa', '#e4a672',
      '#b86f50', '#733e39', '#3e2731', '#a22633',
      '#e43b44', '#f77622', '#feae34', '#fee761',
      '#63c74d', '#3e8948', '#265c42', '#193c3e',
      '#124e89', '#0099db', '#2ce8f5', '#ffffff',
      '#c0cbdc', '#8b9bb4', '#5a6988', '#3a4466',
      '#262b44', '#181425', '#ff0044', '#68386c',
      '#b55088', '#f6757a', '#e8b796', '#c28569'
    ]
  },
  {
    id: 'gameboy',
    name: 'GameBoy 4-Green',
    colors: [
      '#0f380f', '#306230', '#8bac0f', '#9bbc0f'
    ]
  },
  {
    id: 'cyberpunk-16',
    name: 'Cyber Neon 16',
    colors: [
      '#0d0221', '#0f084b', '#26408b', '#0d6efd',
      '#05d9e8', '#005670', '#01012b', '#d1f7ff',
      '#ff2a6d', '#990033', '#ff6584', '#05ffa1',
      '#f9f871', '#ffc837', '#ffffff', '#22222b'
    ]
  },
  {
    id: 'monochrome',
    name: 'PSX Grayscale 8',
    colors: [
      '#000000', '#222222', '#444444', '#666666',
      '#888888', '#aaaaaa', '#cccccc', '#ffffff'
    ]
  }
]

export interface RGB {
  r: number
  g: number
  b: number
}

export function hexToRgb(hex: string): RGB {
  let cleanHex = hex.replace('#', '')
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map(c => c + c).join('')
  }
  const num = parseInt(cleanHex, 16)
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  }
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  return '#' + [clamp(r), clamp(g), clamp(b)].map(x => x.toString(16).padStart(2, '0')).join('')
}

export function findClosestPaletteColor(rgb: RGB, paletteHexList: string[]): string {
  let closestHex = paletteHexList[0] || '#ffffff'
  let minDistance = Infinity

  for (const hex of paletteHexList) {
    const palRgb = hexToRgb(hex)
    // Weighted Euclidean distance (human eye sensitivity: G > R > B)
    const dr = rgb.r - palRgb.r
    const dg = rgb.g - palRgb.g
    const db = rgb.b - palRgb.b
    const dist = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11

    if (dist < minDistance) {
      minDistance = dist
      closestHex = hex
    }
  }

  return closestHex
}

export function snapColorToPalette(hex: string, paletteHexList: string[]): string {
  if (!paletteHexList || paletteHexList.length === 0) return hex
  return findClosestPaletteColor(hexToRgb(hex), paletteHexList)
}

/**
 * Quantizes standard 24-bit RGB888 color to retro 15-bit PS1/SNES RGB555 (32 levels per channel)
 */
export function snapToPSXColor(hex: string): string {
  const rgb = hexToRgb(hex)
  const r5 = Math.round((rgb.r / 255) * 31)
  const g5 = Math.round((rgb.g / 255) * 31)
  const b5 = Math.round((rgb.b / 255) * 31)
  const r8 = Math.round((r5 / 31) * 255)
  const g8 = Math.round((g5 / 31) * 255)
  const b8 = Math.round((b5 / 31) * 255)
  return rgbToHex(r8, g8, b8)
}

// 4x4 Bayer Dithering Matrix
export const BAYER_MATRIX_4x4 = [
  [ 0,  8,  2, 10],
  [12,  4, 14,  6],
  [ 3, 11,  1,  9],
  [15,  7, 13,  5]
]

export function getBayerOffset(x: number, y: number, spread = 32): number {
  const bx = Math.abs(x) % 4
  const by = Math.abs(y) % 4
  const val = BAYER_MATRIX_4x4[by][bx] / 16.0 - 0.5
  return val * spread
}
