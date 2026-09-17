import { describe, expect, it } from 'vitest'
import { visitStrokePixels, type PixelPoint } from './StrokePath'

describe('continuous paint strokes', () => {
  it('stamps a click once and does not repaint stationary pixels', () => {
    const points: number[][] = []
    const visit = (x: number, y: number) => points.push([x, y])
    visitStrokePixels(null, { x: 2, y: 3 }, visit)
    visitStrokePixels({ x: 2, y: 3 }, { x: 2, y: 3 }, visit)
    expect(points).toEqual([[2, 3]])
  })
  it.each([[8, 3], [3, 8], [-8, 3], [3, -8], [-8, -3], [-3, -8], [0, 8], [8, 0]])('fills fast strokes toward %i,%i without gaps', (x, y) => {
    const points: PixelPoint[] = [{ x: 0, y: 0 }]
    visitStrokePixels(points[0], { x, y }, (px, py) => points.push({ x: px, y: py }))
    expect(points.at(-1)).toEqual({ x, y })
    expect(points).toHaveLength(Math.max(Math.abs(x), Math.abs(y)) + 1)
    points.slice(1).forEach((p, i) => {
      expect(Math.max(Math.abs(p.x - points[i].x), Math.abs(p.y - points[i].y))).toBe(1)
    })
  })
})
