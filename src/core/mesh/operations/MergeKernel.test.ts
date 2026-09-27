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
    mesh.vertices.get(a)!.color = '#ff0000'
    mesh.vertices.get(a)!.boneWeights = { a: 1 / 3, b: 1 / 3, c: 1 / 3 }
    mesh.vertices.get(b)!.color = '#0000ff'
    mesh.vertices.get(b)!.boneWeights = { c: 1 / 3, d: 1 / 3, e: 1 / 3 }
    const before = mesh.vertices.size
    const keep = MergeKernel.mergeVertices(mesh, [a, b], new THREE.Vector3(0, 0, 0), a)
    expect(keep).toBe(a)
    expect(mesh.vertices.size).toBe(before - 1)
    expect(mesh.vertices.has(a)).toBe(true)
    expect(mesh.vertices.has(b)).toBe(false)
    const merged = mesh.vertices.get(a)!
    expect(merged.color).toBeTruthy()
    expect(merged.color).not.toBe('#ff0000')
    expect(Object.keys(merged.boneWeights ?? {})).toHaveLength(4)
    expect(Object.values(merged.boneWeights ?? {}).reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1)
    expect(merged.boneWeights?.c).toBeCloseTo(0.4)
    for (const face of mesh.faces.values()) {
      expect(face.uvs.length).toBe(face.vertexIds.length)
    }
  })
})
