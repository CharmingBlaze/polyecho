import { describe, expect, it } from 'vitest'
import { canvasDragZoomFactor, zoomAroundPoint } from './useCanvasLightwaveNav'

describe('zoomAroundPoint', () => {
  it('keeps the origin pixel fixed when the zoom changes', () => {
    const next = zoomAroundPoint({ x: 40, y: 20 }, 2, 100, 80, 4)
    expect(next.zoom).toBe(4)
    expect(next.pan.x).toBeCloseTo(100 - (100 - 40) * 2)
    expect(next.pan.y).toBeCloseTo(80 - (80 - 20) * 2)
  })

  it('leaves the pan unchanged when the zoom does not change', () => {
    const next = zoomAroundPoint({ x: 10, y: 12 }, 3, 50, 50, 3)
    expect(next.pan).toEqual({ x: 10, y: 12 })
  })
})

describe('canvasDragZoomFactor', () => {
  it('makes a short pen stroke a clear zoom without leaping', () => {
    const short = canvasDragZoomFactor(24)
    const stroke = canvasDragZoomFactor(50)
    expect(short).toBeGreaterThan(0.68)
    expect(short).toBeLessThan(0.78)
    expect(stroke).toBeGreaterThan(0.45)
    expect(stroke).toBeLessThan(0.55)
    expect(canvasDragZoomFactor(-50)).toBeCloseTo(1 / stroke)
    expect(canvasDragZoomFactor(24, true)).toBeCloseTo(1 / short)
  })
})
