import { describe, expect, it } from 'vitest'
import type { Face, MeshObject } from '../../types/mesh'
import { mapSelectedFacesToTile } from './TileMapping'
import { stampFacesToRegion } from './TilesetStamp'
describe('Tile face mapping', () => {
  const face = (id: string) => ({ id, uvs: [{ u: 0, v: 0 }, { u: 1, v: 0 }, { u: 1, v: 1 }, { u: 0, v: 1 }] }) as Face
  it('maps selected faces inside top-row tile with pixel inset and leaves other faces intact', () => {
    const faces = [face('a'), face('b')]
    const untouched = structuredClone(faces[1])
    expect(mapSelectedFacesToTile(faces, ['a'], 64, 64, 2, 2, 1, { individual: true, inset: .5, rotation: 0, flip: false })).toBe(1)
    expect(faces[0].uvs[0]).toEqual({ u: 32.5 / 64, v: 32.5 / 64 })
    expect(faces[0].uvs[2]).toEqual({ u: 63.5 / 64, v: 63.5 / 64 })
    expect(faces[1]).toEqual(untouched)
  })
  it('never treats an empty face selection as the whole object', () => {
    const faces = [face('a')], original = structuredClone(faces)
    expect(mapSelectedFacesToTile(faces, [], 64, 64, 2, 2, 0, { individual: true, inset: 0, rotation: 1, flip: true })).toBe(0)
    expect(faces).toEqual(original)
  })
  it('rotates and mirrors UVs without changing the atlas pixels', () => {
    const faces = [face('a')]
    mapSelectedFacesToTile(faces, ['a'], 64, 64, 2, 2, 0, { individual: true, inset: 0, rotation: 1, flip: true })
    expect(faces[0].uvs[0]).toEqual({ u: 0, v: .5 })
    expect(faces[0].uvs[2]).toEqual({ u: .5, v: 1 })
  })
})

describe('Tileset stamp', () => {
  it('creates missing UVs then maps only the requested faces', () => {
    const mesh = {
      locked: false,
      faces: [
        { id: 'a', vertexIds: ['0', '1', '2', '3'], uvs: [] },
        { id: 'b', vertexIds: ['4', '5', '6', '7'], uvs: [{ u: 0, v: 0 }, { u: 1, v: 0 }, { u: 1, v: 1 }, { u: 0, v: 1 }] }
      ]
    } as MeshObject
    const originalB = structuredClone(mesh.faces[1])
    expect(stampFacesToRegion(mesh, ['a'], { width: 32, height: 32 }, { x: 16, y: 0, width: 16, height: 16 }, {
      individual: true, inset: 0, rotation: 0, flip: false
    })).toBe(1)
    expect(mesh.faces[0].uvs).toHaveLength(4)
    expect(mesh.faces[0].uvs[0].u).toBeGreaterThanOrEqual(0.5)
    expect(mesh.faces[1]).toEqual(originalB)
  })
})
