import { describe, expect, it } from 'vitest'
import type { MeshObject } from '../../types/mesh'
import { addObjectRotation, flipMeshGeometry, wrapDegrees } from './ObjectSymmetry'

function quad(): MeshObject {
  return {
    id: 'm',
    name: 'Q',
    visible: true,
    locked: false,
    position: { x: 1, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    materialId: 'default_material',
    shadeMode: 'flat',
    vertices: [
      { id: 'a', position: { x: 1, y: 0, z: 0 } },
      { id: 'b', position: { x: 2, y: 0, z: 0 } },
      { id: 'c', position: { x: 2, y: 1, z: 0 } },
      { id: 'd', position: { x: 1, y: 1, z: 0 } }
    ],
    faces: [{
      id: 'f',
      vertexIds: ['a', 'b', 'c', 'd'],
      uvs: [
        { u: 0, v: 0 },
        { u: 1, v: 0 },
        { u: 1, v: 1 },
        { u: 0, v: 1 }
      ],
      materialIndex: 0
    }]
  }
}

describe('ObjectSymmetry', () => {
  it('flips X through the origin and reverses winding', () => {
    const mesh = quad()
    flipMeshGeometry(mesh, 'x')
    expect(mesh.vertices[0].position.x).toBe(-1)
    expect(mesh.faces[0].vertexIds).toEqual(['d', 'c', 'b', 'a'])
    expect(mesh.faces[0].uvs[0]).toEqual({ u: 0, v: 1 })
  })

  it('adds object rotation in degrees', () => {
    const mesh = quad()
    addObjectRotation(mesh, 'y', 90)
    expect(mesh.rotation.y).toBe(90)
    addObjectRotation(mesh, 'y', 90)
    expect(wrapDegrees(mesh.rotation.y)).toBe(180)
  })
})
