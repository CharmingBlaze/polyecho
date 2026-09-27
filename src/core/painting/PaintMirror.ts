export interface PixelPoint { x: number; y: number }
export interface UvPoint { u: number; v: number }

function samePixel(a: PixelPoint, b: PixelPoint) {
  return a.x === b.x && a.y === b.y
}

/** Texture-space copies of a pixel. U flips left/right, V flips top/bottom. */
export function mirrorPixels(
  x: number,
  y: number,
  width: number,
  height: number,
  mirrorU: boolean,
  mirrorV: boolean
): PixelPoint[] {
  const points: PixelPoint[] = [{ x, y }]
  const flipX = width - 1 - x
  const flipY = height - 1 - y
  if (mirrorU) points.push({ x: flipX, y })
  if (mirrorV) points.push({ x, y: flipY })
  if (mirrorU && mirrorV) points.push({ x: flipX, y: flipY })
  const unique: PixelPoint[] = []
  for (const point of points) {
    if (!unique.some(existing => samePixel(existing, point))) unique.push(point)
  }
  return unique
}

/** Same layout as `mirrorPixels`: index 0 is the original. */
export function mirrorUvs(uv: UvPoint, mirrorU: boolean, mirrorV: boolean): UvPoint[] {
  const points: UvPoint[] = [{ u: uv.u, v: uv.v }]
  if (mirrorU) points.push({ u: 1 - uv.u, v: uv.v })
  if (mirrorV) points.push({ u: uv.u, v: 1 - uv.v })
  if (mirrorU && mirrorV) points.push({ u: 1 - uv.u, v: 1 - uv.v })
  const unique: UvPoint[] = []
  for (const point of points) {
    if (!unique.some(existing => Math.abs(existing.u - point.u) < 1e-6 && Math.abs(existing.v - point.v) < 1e-6)) {
      unique.push(point)
    }
  }
  return unique
}
