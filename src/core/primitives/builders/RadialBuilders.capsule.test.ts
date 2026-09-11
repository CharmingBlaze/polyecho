import { describe, expect, it } from 'vitest'
import { CapsuleBuilder } from './RadialBuilders'

function bounds(mesh: ReturnType<CapsuleBuilder['create']>) {
  let minY = Infinity
  let maxY = -Infinity
  let maxR = 0
  for (const v of mesh.vertices.values()) {
    minY = Math.min(minY, v.position.y)
    maxY = Math.max(maxY, v.position.y)
    maxR = Math.max(maxR, Math.hypot(v.position.x, v.position.z))
  }
  return { minY, maxY, maxR }
}

describe('CapsuleBuilder', () => {
  it('builds a watertight low-poly capsule taller than a bipyramid of cones', () => {
    const mesh = new CapsuleBuilder().create({ radius: 0.5, height: 2, segments: 8, rings: 3 })
    expect(mesh.faces.size).toBeGreaterThan(16)
    for (const f of mesh.faces.values()) {
      expect(f.vertexIds.length).toBeGreaterThanOrEqual(3)
      for (const id of f.vertexIds) {
        expect(mesh.vertices.has(id)).toBe(true)
      }
    }
    const { minY, maxY, maxR } = bounds(mesh)
    expect(maxY - minY).toBeCloseTo(2, 4)
    expect(maxR).toBeCloseTo(0.5, 4)
  })

  it('uses length as a total-height alias', () => {
    const mesh = new CapsuleBuilder().create({ radius: 0.25, length: 1.5, segments: 6, rings: 2 })
    const { minY, maxY } = bounds(mesh)
    expect(maxY - minY).toBeCloseTo(1.5, 4)
  })

  it('clamps shorter than 2*radius to a sphere-like capsule', () => {
    const mesh = new CapsuleBuilder().create({ radius: 1, height: 0.05, segments: 8, rings: 3 })
    const { minY, maxY, maxR } = bounds(mesh)
    expect(maxY - minY).toBeCloseTo(2, 3)
    expect(maxR).toBeCloseTo(1, 3)
  })
})
