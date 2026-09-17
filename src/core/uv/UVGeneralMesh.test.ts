import { describe, expect, it } from 'vitest'
import { createCube, createSphere, createCylinder, createCone, createPlane } from '../geometry/Primitives'
import { smartUvProject, packUVIslands } from '../geometry/UVUnwrap'
import { findUvIslands } from './UVIslands'
import { packUvRectangles } from './UVRectPacking'

describe('general mesh unwrap and packing', () => {
  for (const [name, build] of [
    ['cube', () => createCube()], ['sphere', () => createSphere('sphere', 2, 12, 20)],
    ['cylinder', () => createCylinder('cylinder', 1, 3, 20)], ['cone', () => createCone('cone', 1, 3, 20)]
  ] as const) {
    it(`unwraps an offset ${name} into separated, finite islands on a rectangular texture`, () => {
      const mesh = build()
      mesh.vertices.forEach(v => { v.position.x += 17; v.position.y -= 9; v.position.z *= 1.7 })
      // Imported normals may be stale; the projection must use geometry.
      mesh.faces.forEach(f => { f.normal = { x: 0, y: 1, z: 0 } })
      const result = smartUvProject(mesh, { textureSize: 256, textureHeight: 128, marginPixels: 2 })
      expect(result.vertices).toEqual(mesh.vertices)
      for (const f of result.faces) {
        expect(f.uvs).toHaveLength(f.vertexIds.length)
        for (const p of f.uvs) {
          expect(Number.isFinite(p.u) && Number.isFinite(p.v)).toBe(true)
          expect(p.u).toBeGreaterThanOrEqual(2 / 256 - 1e-7)
          expect(p.u).toBeLessThanOrEqual(1 - 2 / 256 + 1e-7)
          expect(p.v).toBeGreaterThanOrEqual(2 / 128 - 1e-7)
          expect(p.v).toBeLessThanOrEqual(1 - 2 / 128 + 1e-7)
        }
      }
      const boxes = findUvIslands(result).map(island => {
        const uvs = island.flatMap(i => result.faces[i].uvs)
        return { x: Math.min(...uvs.map(p => p.u)), y: Math.min(...uvs.map(p => p.v)), r: Math.max(...uvs.map(p => p.u)), t: Math.max(...uvs.map(p => p.v)) }
      })
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j]
        expect(a.r <= b.x + 1e-7 || b.r <= a.x + 1e-7 || a.t <= b.y + 1e-7 || b.t <= a.y + 1e-7).toBe(true)
      }
    })
  }
  it('preserves pixel proportions during rectangular texture packing', () => {
    const mesh = createPlane()
    mesh.faces[0].uvs = [{ u: 0, v: 0 }, { u: .25, v: 0 }, { u: .25, v: .5 }, { u: 0, v: .5 }]
    const packed = packUVIslands(mesh, 2, 256, undefined, 128)
    const uv = packed.faces[0].uvs
    const edge = (a: number, b: number) => Math.hypot((uv[a].u - uv[b].u) * 256, (uv[a].v - uv[b].v) * 128)
    expect(edge(0, 1)).toBeCloseTo(edge(1, 2))
  })
  it('leaves unselected faces unchanged with mixed triangles and n-gons', () => {
    const mesh = createCylinder('mixed', 1, 2, 7)
    const f = mesh.faces[0]
    f.vertexIds = f.vertexIds.slice(0, 3); f.uvs = f.uvs.slice(0, 3)
    const result = smartUvProject(mesh, { onlyFaceIndices: [0, 1], textureSize: 128 })
    expect(result.faces.slice(2)).toEqual(mesh.faces.slice(2))
    expect(result.faces[0].uvs).toHaveLength(3)
  })
  it('reuses free space and keeps margins between varied rectangles', () => {
    const boxes = [{ w: 50, h: 30 }, { w: 20, h: 40 }, { w: 15, h: 20 }, { w: 12, h: 10 }]
    const packed = packUvRectangles(boxes, 100, 80, 2, 1)!
    expect(packed).toHaveLength(4)
    for (let i = 0; i < packed.length; i++) for (let j = i + 1; j < packed.length; j++) {
      const a = packed[i], b = packed[j]
      expect(a.x + a.w + 2 <= b.x || b.x + b.w + 2 <= a.x || a.y + a.h + 2 <= b.y || b.y + b.h + 2 <= a.y).toBe(true)
    }
    expect(packUvRectangles(boxes, 4, 4, 2, 1)).toBeNull()
  })
})
