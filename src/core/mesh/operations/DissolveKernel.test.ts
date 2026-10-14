import { describe, expect, it } from 'vitest'
import { createCube } from '../../geometry/Primitives'
import { MeshBridge } from '../MeshBridge'
import { DissolveKernel } from './DissolveKernel'

describe('DissolveKernel', () => {
  it('refuses a boundary edge with only one face', () => {
    const { mesh } = MeshBridge.meshObjectToEditableMesh(createCube('Cube', 2))
    const face = [...mesh.faces.values()][0]!
    mesh.removeFace(face.id)
    const boundary = [...mesh.edges.values()].find(edge => edge.faceIds.length === 1)
    expect(boundary).toBeTruthy()
    expect(DissolveKernel.dissolveEdge(mesh, boundary!.id)).toBe(false)
  })

  it('returns false for a missing edge', () => {
    const { mesh } = MeshBridge.meshObjectToEditableMesh(createCube('Cube', 2))
    expect(DissolveKernel.dissolveEdge(mesh, 999999)).toBe(false)
  })
})
