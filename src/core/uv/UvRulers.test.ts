import { describe, expect, it } from 'vitest'
import { formatUvTick, niceUvStep, uvMappedTicks } from './UvRulers'

describe('UvRulers', () => {
  it('picks a readable step for a 0–1 span', () => {
    expect(niceUvStep(1)).toBe(0.2)
    expect(niceUvStep(0.2)).toBe(0.05)
    expect(niceUvStep(4)).toBe(0.5)
  })

  it('places 0 and 1 on a texture that fills the view', () => {
    const ticks = uvMappedTicks(20, 220, 0, 1)
    const zeros = ticks.filter(t => t.uv === 0)
    const ones = ticks.filter(t => t.uv === 1)
    expect(zeros).toHaveLength(1)
    expect(zeros[0]!.pos).toBeCloseTo(20)
    expect(ones).toHaveLength(1)
    expect(ones[0]!.pos).toBeCloseTo(220)
    expect(zeros[0]!.label).toBe('0')
    expect(ones[0]!.label).toBe('1')
  })

  it('inverts V so 1 is at the top of the texture', () => {
    const ticks = uvMappedTicks(10, 110, 1, 0)
    const one = ticks.find(t => t.uv === 1)
    const zero = ticks.find(t => t.uv === 0)
    expect(one?.pos).toBeCloseTo(10)
    expect(zero?.pos).toBeCloseTo(110)
  })

  it('formats unit ticks without leftover zeros', () => {
    expect(formatUvTick(0.5, 0.25)).toBe('0.5')
    expect(formatUvTick(0, 0.25)).toBe('0')
    expect(formatUvTick(0.25, 0.05)).toBe('0.25')
  })
})
