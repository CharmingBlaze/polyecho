import { describe, expect, it } from 'vitest'
import { placeOriginAtBoundsCenter } from './MeshOrigin'
import type { MeshObject } from '../../types/mesh'

function boxAt(min: number, max: number): MeshObject {
  const corners = [
    [min, min, min],
    [max, min, min],
    [max, max, min],
    [min, max, min],
    [min, min, max],
    [max, min, max],
    [max, max, max],
    [min, max, max]
  ]
  return {
    id: 'm',
    name: 'Block',
    visible: true,
    locked: false,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    materialId: 'default_material',
    shadeMode: 'flat',
    vertices: corners.map((p, i) => ({
      id: `v${i}`,
      position: { x: p[0], y: p[1], z: p[2] }
    })),
    faces: []
  }
}

describe('placeOriginAtBoundsCenter', () => {
  it('puts the origin at the AABB center and keeps world corners', () => {
    const mesh = boxAt(2, 6)
    expect(placeOriginAtBoundsCenter(mesh)).toBe(true)
    expect(mesh.position.x).toBeCloseTo(4)
    expect(mesh.position.y).toBeCloseTo(4)
    expect(mesh.position.z).toBeCloseTo(4)
    const xs = mesh.vertices.map(v => v.position.x)
    expect(Math.min(...xs)).toBeCloseTo(-2)
    expect(Math.max(...xs)).toBeCloseTo(2)
  })

  it('no-ops when the origin is already centered', () => {
    const mesh = boxAt(-1, 1)
    expect(placeOriginAtBoundsCenter(mesh)).toBe(false)
    expect(mesh.position).toEqual({ x: 0, y: 0, z: 0 })
  })
})
