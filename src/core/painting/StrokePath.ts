export interface PixelPoint { x: number; y: number }

/** Rasterize a stroke segment, excluding the already painted starting pixel. */
export function visitStrokePixels(from: PixelPoint | null, to: PixelPoint, visit: (x: number, y: number) => void) {
  if (!from) { visit(to.x, to.y); return }
  let { x, y } = from
  const dx = Math.abs(to.x - x), dy = -Math.abs(to.y - y)
  const sx = x < to.x ? 1 : -1, sy = y < to.y ? 1 : -1
  let error = dx + dy
  while (x !== to.x || y !== to.y) {
    const twice = 2 * error
    if (twice >= dy) { error += dy; x += sx }
    if (twice <= dx) { error += dx; y += sy }
    visit(x, y)
  }
}
