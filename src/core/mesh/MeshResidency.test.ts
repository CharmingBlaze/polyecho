import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { createCube } from '../geometry/Primitives'
import { getMeshEdges } from '../geometry/EdgeUtils'
import { MeshBridge } from './MeshBridge'
import { MeshRepository } from './MeshRepository'
import { editMesh } from './MeshTransaction'
import { MeshValidator } from './MeshValidator'
import { TopologyOps } from './operations/TopologyOps'
import { ExtrudeKernel } from './operations/ExtrudeKernel'
import { KnifeKernel } from './operations/KnifeKernel'

describe('resident kernel identity and attributes', () => {
  it('round-trips IDs, colors, weights, seams and materials without caller maps', () => {
    const document = createCube('Weighted', 2)
    document.vertices.forEach((v, i) => { v.id = `vertex_${i}_stable`; v.color = '#ff8040'; v.boneWeights = { bone: 1 } })
    // Rebuild the fixture face references after assigning intentionally underscored IDs.
    const original = createCube('Source', 2)
    document.faces.forEach((face, i) => {
      face.vertexIds = original.faces[i].vertexIds.map(id => document.vertices[original.vertices.findIndex(v => v.id === id)].id)
      face.materialIndex = 3
    })
    document.seamEdgeIds = [getMeshEdges(document)[0].id]
    const bridge = MeshBridge.meshObjectToEditableMesh(document)
    const back = MeshBridge.editableMeshToMeshObject(bridge.mesh.clone(), document)
    expect(back.vertices).toEqual(document.vertices)
    expect(back.faces.map(f => [f.id, f.vertexIds, f.uvs, f.materialIndex])).toEqual(document.faces.map(f => [f.id, f.vertexIds, f.uvs, f.materialIndex]))
    expect(back.seamEdgeIds).toEqual(document.seamEdgeIds)
    back.vertices[0].boneWeights!.bone = 0
    expect(bridge.mesh.vertices.values().next().value!.boneWeights).toEqual({ bone: 1 })
  })

  it.each(['single', 'multiple'])('propagates seams, sharp flags and normalized weights through %s edge splits', kind => {
    const document = createCube('Cube', 2)
    const { mesh } = MeshBridge.meshObjectToEditableMesh(document)
    const edge = mesh.edges.values().next().value!
    const originalFaces = [...edge.faceIds]
    const unaffected = [...mesh.edges.values()].filter(e => e.id !== edge.id).map(e => e.id)
    edge.seam = edge.sharp = true
    mesh.vertices.get(edge.v1)!.boneWeights = { a: 1 }
    mesh.vertices.get(edge.v2)!.boneWeights = { b: 1 }
    const ids = kind === 'single' ? [TopologyOps.splitEdge(mesh, edge.id, 0.25)!.newVertexId]
      : [...KnifeKernel.splitEdgeAtParameters(mesh, edge.id, [0.25, 0.75]).values()]
    expect(mesh.vertices.get(ids[0])!.boneWeights).toEqual({ a: 0.75, b: 0.25 })
    expect(unaffected.every(id => mesh.edges.has(id))).toBe(true)
    expect([...mesh.edges.values()].filter(e => e.seam && e.sharp)).toHaveLength(ids.length + 1)
    expect(MeshValidator.validate(mesh).valid).toBe(true)
    const back = MeshBridge.editableMeshToMeshObject(mesh, document)
    expect(back.seamEdgeIds).toHaveLength(ids.length + 1)
    const edges = new Set(getMeshEdges(back).map(e => e.id))
    expect(back.seamEdgeIds!.every(id => edges.has(id))).toBe(true)
    const geometry = MeshBridge.editableMeshToThreeGeometry(mesh)
    expect(originalFaces.every(id => geometry.userData.renderMapping.triangleToFace.includes(id))).toBe(true)
    geometry.dispose()
  })

  it('copies extrusion weights independently and preserves cap identity', () => {
    const document = createCube('Cube', 2)
    document.vertices.forEach(v => { v.color = '#ff0000'; v.boneWeights = { root: 1 } })
    const { mesh } = MeshBridge.meshObjectToEditableMesh(document)
    const face = mesh.faces.values().next().value!
    const capId = face.documentId
    const result = editMesh(mesh, () => {
      const extrusion = ExtrudeKernel.extrudeFaces(mesh, [face.id])
      for (const id of extrusion.newVertexIds) mesh.vertices.get(id)!.position.add(extrusion.regionNormal)
      return extrusion
    })
    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.reason)
    for (const id of result.value.newVertexIds) {
      expect(mesh.vertices.get(id)!.boneWeights).toEqual({ root: 1 })
      expect(mesh.vertices.get(id)!.color).toBe('#ff0000')
    }
    expect(mesh.faces.get(face.id)!.documentId).toBe(capId)
  })

  it('reuses the kernel through consecutive previews and imports legacy position edits without renumbering', () => {
    let document = createCube('Cube', 2)
    const repository = new MeshRepository()
    const bridge = repository.acquire(document)
    const edgeIds = [...bridge.mesh.edges.keys()]
    const vertex = bridge.mesh.vertices.values().next().value!
    vertex.position.x += 0.1
    document = MeshBridge.editableMeshToMeshObject(bridge.mesh, document, bridge.numToStrVertId, bridge.numToStrFaceId)
    repository.publish(document, bridge)
    expect(repository.acquire(document)).toBe(bridge)
    document.vertices[0].position.x += 0.2
    const acquired = repository.acquire(document)
    expect(acquired.mesh).toBe(bridge.mesh)
    expect([...acquired.mesh.edges.keys()]).toEqual(edgeIds)
    expect(acquired.strToNumVertId.get(document.vertices[0].id)).toBe(vertex.id)
    expect(acquired.mesh.vertices.get(vertex.id)!.position.x).toBe(document.vertices[0].position.x)
    repository.retain([])
    expect(repository.acquire(document).mesh).not.toBe(bridge.mesh)
  })

  it('rolls attributes, identity and allocations back atomically on failure', () => {
    const { mesh } = MeshBridge.meshObjectToEditableMesh(createCube('Cube', 2))
    const before = mesh.createSnapshot()
    const result = editMesh(mesh, current => {
      const vertex = current.vertices.values().next().value!
      vertex.boneWeights = { changed: 1 }
      current.addVertex(new Vector3())
      current.faces.values().next().value!.uvs.pop()
    })
    expect(result.success).toBe(false)
    expect(mesh.createSnapshot()).toEqual(before)
    expect(mesh.getOrCreateEdge(before.edges[0].v1, before.edges[0].v2).id).toBe(before.edges[0].id)
  })

  it('rejects missing vertices and invalid UVs rather than dropping polygon corners', () => {
    const document = createCube('Cube', 2)
    document.faces[0].vertexIds[0] = 'missing'
    expect(() => MeshBridge.meshObjectToEditableMesh(document)).toThrow(/missing vertex/)
    document.faces[0].vertexIds[0] = document.vertices[0].id
    document.faces[0].uvs.pop()
    expect(() => MeshBridge.meshObjectToEditableMesh(document)).toThrow(/Invalid polygon/)
  })
})
