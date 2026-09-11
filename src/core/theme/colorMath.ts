/** Hex color math for the theme engine. No Vue. */

export function parseHex(hex: string): [number, number, number] | null {
  const h = hex.replace('#', '').trim()
  if (h.length === 3 && /^[0-9a-f]{3}$/i.test(h)) {
    return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)]
  }
  if (h.length !== 6 || /[^0-9a-f]/i.test(h)) return null
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

export function toHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

function srgbLin(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

export function luminance(hex: string): number {
  const rgb = parseHex(hex)
  if (!rgb) return 0
  return 0.2126 * srgbLin(rgb[0]) + 0.7152 * srgbLin(rgb[1]) + 0.0722 * srgbLin(rgb[2])
}

export function contrastRatio(a: string, b: string): number {
  const hi = Math.max(luminance(a), luminance(b))
  const lo = Math.min(luminance(a), luminance(b))
  return (hi + 0.05) / (lo + 0.05)
}

export function mixHex(a: string, b: string, t: number): string {
  const A = parseHex(a)
  const B = parseHex(b)
  if (!A || !B) return a
  return toHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t)
}

export function rgbDist(a: string, b: string): number {
  const A = parseHex(a)
  const B = parseHex(b)
  if (!A || !B) return 999
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2])
}

export function onColor(bg: string): string {
  return contrastRatio(bg, '#f8f8f8') >= contrastRatio(bg, '#161616') ? '#f8f8f8' : '#161616'
}

export function bestOnSurfaces(preferred: string, surfaces: string[], fallbacks: string[]): string {
  const pool = [preferred, ...fallbacks]
  let best = pool[0]
  let score = -1
  for (const c of pool) {
    const s = Math.min(...surfaces.map((bg) => contrastRatio(c, bg)))
    if (s > score) {
      score = s
      best = c
    }
  }
  return best
}

export function withAlpha(hex: string, alpha: number): string {
  const rgb = parseHex(hex)
  if (!rgb) return `rgba(0, 0, 0, ${alpha})`
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`
}

export function isHexColor(value: string): boolean {
  return parseHex(value) !== null
}

export function darkenHex(hex: string, factor = 0.72): string {
  const rgb = parseHex(hex)
  if (!rgb) return hex
  const d = (n: number) => Math.max(0, Math.round(n * factor))
  return toHex(d(rgb[0]), d(rgb[1]), d(rgb[2]))
}
