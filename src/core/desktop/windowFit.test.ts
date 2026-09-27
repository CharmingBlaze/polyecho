import { describe, expect, it } from 'vitest'
import { fitWindowBounds, minimumSizeFor, needsRefit } from '../../../electron/windowFit.mjs'

const laptop = { x: 0, y: 0, width: 1092, height: 614 }
const desk = { x: 0, y: 0, width: 1920, height: 1040 }

describe('window fit', () => {
  it('shrinks the minimum so a scaled laptop work area can hold the window', () => {
    expect(minimumSizeFor(laptop)).toEqual({ width: 960, height: 560 })
    expect(minimumSizeFor({ x: 0, y: 0, width: 800, height: 500 })).toEqual({ width: 800, height: 500 })
    expect(minimumSizeFor(desk).width).toBe(960)
  })

  it('pulls a window that was saved on another monitor back onto this one', () => {
    const fitted = fitWindowBounds(
      { x: 4000, y: 200, width: 1440, height: 900 },
      laptop,
      minimumSizeFor(laptop)
    )
    expect(fitted.x).toBeGreaterThanOrEqual(0)
    expect(fitted.y).toBeGreaterThanOrEqual(0)
    expect(fitted.x + fitted.width).toBeLessThanOrEqual(laptop.width)
    expect(fitted.y + fitted.height).toBeLessThanOrEqual(laptop.height)
    expect(fitted.width).toBeLessThanOrEqual(laptop.width)
  })

  it('keeps a normal desktop window where the user left it', () => {
    const saved = { x: 80, y: 40, width: 1440, height: 900 }
    expect(fitWindowBounds(saved, desk, minimumSizeFor(desk))).toEqual(saved)
    expect(needsRefit(saved, desk)).toBe(false)
  })

  it('asks for a refit when the title bar is off-screen', () => {
    expect(needsRefit({ x: -2000, y: 40, width: 1440, height: 900 }, desk)).toBe(true)
    expect(needsRefit({ x: 40, y: 40, width: 2400, height: 900 }, desk)).toBe(true)
  })
})
