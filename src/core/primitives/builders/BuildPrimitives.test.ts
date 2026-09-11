import { describe, expect, it } from 'vitest'
import { TubeBuilder } from './RadialBuilders'
import { ArchBuilder, StairsBuilder, WallBuilder } from './BuildBuilders'

function bounds(mesh: { vertices: Map<number, { position: { x: number; y: number; z: number } }> }) {
  let minY = Infinity
  let maxY = -Infinity
  let minX = Infinity
  let maxX = -Infinity
  let maxR = 0
  for (const v of mesh.vertices.values()) {
    minY = Math.min(minY, v.position.y)
    maxY = Math.max(maxY, v.position.y)
    minX = Math.min(minX, v.position.x)
    maxX = Math.max(maxX, v.position.x)
    maxR = Math.max(maxR, Math.hypot(v.position.x, v.position.z))
  }
  return { minY, maxY, minX, maxX, maxR }
}

describe('TubeBuilder', () => {
  it('uses CAD radius as the outer wall', () => {
    const mesh = new TubeBuilder().create({ radius: 1, height: 2, sides: 8 })
    const { maxR, minY, maxY } = bounds(mesh)
    expect(maxR).toBeCloseTo(1, 4)
    expect(maxY - minY).toBeCloseTo(2, 4)
    expect(mesh.faces.size).toBe(8 * 4)
  })
})

describe('WallBuilder', () => {
  it('uses footprint width/depth when length/thickness are omitted', () => {
    const mesh = new WallBuilder().create({ length: 0 as unknown as number, thickness: 0 as unknown as number, height: 2, width: 3, depth: 0.25 })
    const { minX, maxX } = bounds(mesh)
    expect(maxX - minX).toBeCloseTo(3, 4)
  })
})

describe('StairsBuilder', () => {
  it('builds solid steps sitting on y=0', () => {
    const mesh = new StairsBuilder().create({ width: 1, totalRun: 2, totalHeight: 1, steps: 4 })
    const { minY, maxY } = bounds(mesh)
    expect(minY).toBeCloseTo(0, 4)
    expect(maxY).toBeCloseTo(1, 4)
    expect(mesh.faces.size).toBeGreaterThan(8)
  })
})

describe('ArchBuilder', () => {
  it('is a Roman archway, not a solid box', () => {
    const mesh = new ArchBuilder().create({
      width: 2,
      depth: 0.4,
      height: 2.5,
      openingWidth: 1.1,
      openingHeight: 1.8,
      segments: 8
    })
    expect(mesh.faces.size).toBeGreaterThan(6)
    const { minY, maxY, minX, maxX } = bounds(mesh)
    expect(minY).toBeCloseTo(0, 3)
    expect(maxY).toBeGreaterThan(2)
    expect(maxX - minX).toBeCloseTo(2, 3)
    const nearCenterHigh = [...mesh.vertices.values()].some(
      v => Math.abs(v.position.x) < 0.15 && v.position.y > 1.2 && v.position.y < 2.2
    )
    const nearCenterLow = [...mesh.vertices.values()].some(
      v => Math.abs(v.position.x) < 0.2 && v.position.y < 0.2
    )
    expect(nearCenterHigh).toBe(true)
    expect(nearCenterLow).toBe(false)
  })
})
