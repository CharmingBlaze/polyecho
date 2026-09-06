import { describe, expect, it } from 'vitest'
import { createCube } from '../geometry/Primitives'
import { MeshBridge } from './MeshBridge'
import { MeshValidator } from './MeshValidator'

describe('MeshBridge', () => {
  it('round-trips a cube with matching face UV lengths', () => {
    const cube = createCube('Cube', 2)
    const { mesh, numToStrVertId, numToStrFaceId } = MeshBridge.meshObjectToEditableMesh(cube)
    const valid = MeshValidator.validate(mesh)
    expect(valid.valid).toBe(true)
    expect(valid.brokenHalfEdges).toHaveLength(0)

    const back = MeshBridge.editableMeshToMeshObject(mesh, cube, numToStrVertId, numToStrFaceId)
    expect(back.vertices).toHaveLength(cube.vertices.length)
    expect(back.faces).toHaveLength(cube.faces.length)
    for (const face of back.faces) {
      expect(face.uvs.length).toBe(face.vertexIds.length)
      expect(face.vertexIds.length).toBe(4)
    }
  })
})
