import { describe, expect, it } from 'vitest'
import { boneDisplayMetrics } from './BoneDisplay'

describe('bone visibility', () => {
  it('keeps small bones and endpoints readable when zoomed out', () => {
    const metrics = boneDisplayMetrics(.01, .02)
    expect(metrics.radial * .15 / .02).toBeCloseTo(2.5)
    expect(metrics.joint / .02).toBeCloseTo(3.5)
    expect(metrics.tip / .02).toBeCloseTo(2.5)
  })
  it('preserves proportional shape when close and honors display size', () => {
    expect(boneDisplayMetrics(2, .001, 1).radial).toBe(1.5)
    expect(boneDisplayMetrics(2, .001, 2).radial).toBe(3)
  })
})
