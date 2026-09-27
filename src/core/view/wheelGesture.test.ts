import { describe, expect, it } from 'vitest'
import { CANVAS_WHEEL_ZOOM_GAIN, classifyWheel, wheelPanDelta, wheelZoomFactor } from './wheelGesture'

const sample = {
  deltaX: 0,
  deltaY: 100,
  deltaMode: 0,
  ctrlKey: false,
  shiftKey: false
}

describe('wheel gesture', () => {
  it('zooms on a mouse wheel and on pinch', () => {
    expect(classifyWheel(sample)).toBe('zoom')
    expect(classifyWheel({ ...sample, ctrlKey: true, deltaX: 20 })).toBe('zoom')
  })

  it('pans on a two-finger swipe and on shift+wheel', () => {
    expect(classifyWheel({ ...sample, deltaX: 14, deltaY: 6 })).toBe('pan')
    expect(classifyWheel({ ...sample, shiftKey: true })).toBe('pan')
    expect(wheelPanDelta({ ...sample, shiftKey: true, deltaY: 40 })).toEqual({ x: 40, y: 0 })
    expect(wheelPanDelta({ ...sample, deltaX: 8, deltaY: 3 })).toEqual({ x: 8, y: 3 })
  })

  it('uses a small step for trackpad pixels and a notch-sized step for a mouse wheel', () => {
    const notch = wheelZoomFactor(100, 0, false)
    const flick = wheelZoomFactor(8, 0, false)
    expect(notch).toBeGreaterThan(0.84)
    expect(notch).toBeLessThan(0.9)
    expect(flick).toBeGreaterThan(0.98)
    expect(flick).toBeLessThan(1)
    expect(wheelZoomFactor(-100, 0, false)).toBeGreaterThan(1.1)
    expect(wheelZoomFactor(100, 0, true)).toBeGreaterThan(1.1)
  })

  it('uses a gentler step on the 2D canvas than in the 3D view', () => {
    const canvas = wheelZoomFactor(100, 0, false, CANVAS_WHEEL_ZOOM_GAIN)
    const viewport = wheelZoomFactor(100, 0, false)
    expect(canvas).toBeGreaterThan(0.92)
    expect(canvas).toBeLessThan(0.95)
    expect(canvas).toBeGreaterThan(viewport)
  })
})
