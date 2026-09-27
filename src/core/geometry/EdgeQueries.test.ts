import { describe, expect, it } from 'vitest'
import type { MeshObject } from '../../types/mesh'
import { createCube, createPlane } from './Primitives'
import { boundaryEdgeIds, nonManifoldEdgeIds, sharpEdgeIds } from './EdgeQueries'

describe('EdgeQueries', () => {
  it('finds the border of a plane and the creases of a cube', () => {
    const plane = createPlane('Plane', 2)
    expect(boundaryEdgeIds(plane)).toHaveLength(4)
    expect(nonManifoldEdgeIds(plane)).toHaveLength(0)
    const cube = createCube('Cube', 2)
    expect(boundaryEdgeIds(cube)).toHaveLength(0)
    expect(sharpEdgeIds(cube, 30).length).toBe(12)
    expect(sharpEdgeIds(cube, 180)).toHaveLength(0)
  })

  it('finds an edge used by three faces', () => {
    const vertex = (id: string, x: number, y: number, z: number) => ({ id, position: { x, y, z } })
    const mesh: MeshObject = {
      id: 'fan',
      name: 'Fan',
      visible: true,
      locked: false,
      materialId: 'default_material',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      vertices: [vertex('a', 0, 0, 0), vertex('b', 1, 0, 0), vertex('c', 0, 1, 0), vertex('d', 0, 0, 1), vertex('e', 0, -1, 0)],
      faces: [
        { id: 'f0', vertexIds: ['a', 'b', 'c'], uvs: [], materialIndex: 0 },
        { id: 'f1', vertexIds: ['a', 'b', 'd'], uvs: [], materialIndex: 0 },
        { id: 'f2', vertexIds: ['a', 'b', 'e'], uvs: [], materialIndex: 0 }
      ]
    }
    expect(nonManifoldEdgeIds(mesh)).toHaveLength(1)
    expect(nonManifoldEdgeIds(mesh)[0]).toContain('a')
    expect(nonManifoldEdgeIds(mesh)[0]).toContain('b')
  })
})
