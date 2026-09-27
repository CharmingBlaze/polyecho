import { describe, expect, it } from 'vitest'
import type { MeshObject } from '../../types/mesh'
import { PixelBuffer } from './PixelCanvas'
import { uvFaceMask, uvIslandMaskAt } from './UvFill'

function sheet(): MeshObject {
  const face = (id: string, u0: number, v0: number, u1: number, v1: number) => ({
    id,
    vertexIds: [`${id}a`, `${id}b`, `${id}c`, `${id}d`],
    uvs: [{ u: u0, v: v0 }, { u: u1, v: v0 }, { u: u1, v: v1 }, { u: u0, v: v1 }],
    materialIndex: 0
  })
  return {
    id: 'm',
    name: 'M',
    vertices: [],
    faces: [
      face('a', 0, 0.5, 0.5, 1),
      face('b', 0.5, 0, 1, 0.5)
    ],
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    visible: true,
    locked: false,
    materialId: 'default_material'
  } as MeshObject
}

describe('UV paint bucket', () => {
  it('fills the clicked island and leaves the other island and the gutter alone', () => {
    const mesh = sheet()
    const pb = new PixelBuffer(8, 8)
    pb.clear('#ffffff')
    const mask = uvIslandMaskAt(mesh, 8, 8, 1, 1)
    expect(mask).toBeTruthy()
    pb.floodFill(1, 1, '#3366aa', mask)
    expect(pb.getPixelHex(1, 1)).toBe('#3366aa')
    expect(pb.getPixelHex(6, 6)).toBe('#ffffff')
    expect(pb.getPixelHex(1, 6)).toBe('#ffffff')
    expect(uvIslandMaskAt(mesh, 8, 8, 1, 6)).toBeNull()
  })

  it('stops at a different color inside the face, and a 3D face fill stays on that face', () => {
    const mesh = sheet()
    const pb = new PixelBuffer(8, 8)
    pb.clear('#ffffff')
    pb.setPixel(2, 1, '#ff0000')
    const island = uvIslandMaskAt(mesh, 8, 8, 1, 1)!
    pb.floodFill(1, 1, '#3366aa', island)
    expect(pb.getPixelHex(2, 1)).toBe('#ff0000')
    expect(pb.getPixelHex(0, 0)).toBe('#3366aa')

    const face = uvFaceMask(mesh, 8, 8, 'b')!
    expect(face[6 * 8 + 6]).toBe(1)
    expect(face[1]).toBe(0)
    pb.floodFill(6, 6, '#112233', face)
    expect(pb.getPixelHex(6, 6)).toBe('#112233')
    expect(pb.getPixelHex(0, 0)).toBe('#3366aa')
  })
})
