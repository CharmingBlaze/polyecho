/** Raster of public/favicon.svg (32×32 viewBox) at a square pixel size. */

type Pt = { x: number; y: number }

function hex(rgb: number): [number, number, number, number] {
  return [(rgb >> 16) & 0xff, (rgb >> 8) & 0xff, rgb & 0xff, 255]
}

function fillPoly(buf: Uint8Array, size: number, pts: Pt[], color: [number, number, number, number]) {
  const xs = pts.map(p => p.x)
  const ys = pts.map(p => p.y)
  const minX = Math.max(0, Math.floor(Math.min(...xs)))
  const maxX = Math.min(size - 1, Math.ceil(Math.max(...xs)))
  const minY = Math.max(0, Math.floor(Math.min(...ys)))
  const maxY = Math.min(size - 1, Math.ceil(Math.max(...ys)))
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (pointInPoly(x + 0.5, y + 0.5, pts)) {
        const i = (y * size + x) * 4
        buf[i] = color[0]
        buf[i + 1] = color[1]
        buf[i + 2] = color[2]
        buf[i + 3] = color[3]
      }
    }
  }
}

function pointInPoly(x: number, y: number, pts: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const yi = pts[i].y
    const yj = pts[j].y
    const xi = pts[i].x
    const xj = pts[j].x
    const hit = (yi > y) !== (yj > y) && (yj - yi) !== 0
      && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (hit) inside = !inside
  }
  return inside
}

function scalePts(pts: Array<[number, number]>, size: number): Pt[] {
  const s = size / 32
  return pts.map(([x, y]) => ({ x: x * s, y: y * s }))
}

/** Matches the crystal/cube mark in `public/favicon.svg`. */
export function rasterizeAppIcon(size: number): Uint8Array {
  const buf = new Uint8Array(size * size * 4)
  const bg = hex(0x111318)
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = bg[0]
    buf[i + 1] = bg[1]
    buf[i + 2] = bg[2]
    buf[i + 3] = 255
  }
  fillPoly(buf, size, scalePts([[16, 2], [29, 9.5], [29, 22.5], [16, 30], [3, 22.5], [3, 9.5]], size), hex(0x1e293b))
  fillPoly(buf, size, scalePts([[16, 4.5], [27, 10.8], [16, 17.2], [5, 10.8]], size), hex(0xf8fafc))
  fillPoly(buf, size, scalePts([[5, 10.8], [16, 17.2], [16, 28], [5, 22]], size), hex(0x334155))
  fillPoly(buf, size, scalePts([[16, 17.2], [27, 10.8], [27, 22], [16, 28]], size), hex(0xf59e0b))
  return buf
}
