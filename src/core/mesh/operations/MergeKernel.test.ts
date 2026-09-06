import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createCube } from '../../geometry/Primitives'
import { MeshBridge } from '../MeshBridge'
import { MergeKernel } from './MergeKernel'

describe('MergeKernel', () => {
  it('welds two verts onto the first id and keeps UVs aligned', () => {
    const cube = createCube('Cube', 2)
    const { mesh, strToNumVertId } = MeshBridge.meshObjectToEditableMesh(cube)
    const a = strToNumVertId.get(cube.vertices[0].id)!
    const b = strToNumVertId.get(cube.vertices[1].id)!
    const before = mesh.vertices.size
    const keep = MergeKernel.mergeVertices(mesh, [a, b], new THREE.Vector3(0, 0, 0), a)
    expect(keep).toBe(a)
    expect(mesh.vertices.size).toBe(before - 1)
    expect(mesh.vertices.has(a)).toBe(true)
    expect(mesh.vertices.has(b)).toBe(false)
    for (const face of mesh.faces.values()) {
      expect(face.uvs.length).toBe(face.vertexIds.length)
    }
  })
})
