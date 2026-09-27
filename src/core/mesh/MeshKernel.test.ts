import { describe, expect, it } from 'vitest'
import { Vector2 } from 'three'
import { createCube } from '../geometry/Primitives'
import { MeshBridge } from './MeshBridge'
import { MeshTopologyService } from './MeshTopologyService'

describe('EditableMesh snapshots', () => {
  it('restoreSnapshot puts a moved vertex back', () => {
    const cube = createCube('Cube', 2)
    const { mesh } = MeshBridge.meshObjectToEditableMesh(cube)
    const first = [...mesh.vertices.values()][0]
    const snap = mesh.createSnapshot()
    const origin = first.position.clone()
    first.position.set(99, 99, 99)
    mesh.restoreSnapshot(snap)
    const restored = mesh.vertices.get(first.id)!
    expect(restored.position.x).toBeCloseTo(origin.x)
    expect(restored.position.y).toBeCloseTo(origin.y)
    expect(restored.position.z).toBeCloseTo(origin.z)
  })
})

describe('face loops and corners', () => {
  it('stores one corner per loop slot and shares that UV with the face cache', () => {
    const { mesh } = MeshBridge.meshObjectToEditableMesh(createCube('Cube', 2))
    expect(mesh.corners.size).toBe(24)
    for (const face of mesh.faces.values()) {
      const loop = mesh.walkFace(face.id)
      expect(loop.map(he => he.vertexId)).toEqual(face.vertexIds)
      expect(face.uvs).toHaveLength(loop.length)
      loop.forEach((he, i) => {
        expect(face.uvs[i]).toBe(mesh.corners.get(he.cornerId)!.uv)
      })
    }
  })

  it('writes UVs onto the corner and names those corners on the fill triangles', () => {
    const { mesh } = MeshBridge.meshObjectToEditableMesh(createCube('Cube', 2))
    const face = [...mesh.faces.values()][0]!
    expect(mesh.setFaceUvs(face.id, [
      new Vector2(0.1, 0.2),
      new Vector2(0.3, 0.2),
      new Vector2(0.3, 0.4),
      new Vector2(0.1, 0.4),
    ])).toBe(true)
    const loop = mesh.walkFace(face.id)
    expect(mesh.corners.get(loop[0]!.cornerId)!.uv.x).toBeCloseTo(0.1)
    const tris = mesh.fillTriangles(face.id)
    expect(tris).toHaveLength(2)
    expect(new Set(tris.flatMap(tri => tri.cornerIds)).size).toBe(4)
    expect(tris.every(tri => tri.vertexIds.length === 3)).toBe(true)
  })

  it('publishes corner UVs into the document and reads them back', () => {
    const cube = createCube('Cube', 2)
    const bridged = MeshBridge.meshObjectToEditableMesh(cube)
    const face = [...bridged.mesh.faces.values()][0]!
    meshSet(bridged.mesh, face.id)
    const saved = MeshBridge.editableMeshToMeshObject(bridged.mesh, cube, bridged.numToStrVertId, bridged.numToStrFaceId)
    const again = MeshBridge.meshObjectToEditableMesh(saved)
    const restored = [...again.mesh.faces.values()].find(f => f.documentId === face.documentId)!
    expect(again.mesh.walkFace(restored.id)[0] && again.mesh.corners.get(again.mesh.walkFace(restored.id)[0]!.cornerId)!.uv.x).toBeCloseTo(0.25)
  })

  it('rebuilds corners from the face cache when a snapshot has none', () => {
    const { mesh } = MeshBridge.meshObjectToEditableMesh(createCube('Cube', 2))
    const snap = mesh.createSnapshot()
    delete snap.corners
    mesh.restoreSnapshot(snap)
    expect(mesh.corners.size).toBe(24)
    const face = [...mesh.faces.values()][0]!
    const loop = mesh.walkFace(face.id)
    expect(face.uvs[0]).toBe(mesh.corners.get(loop[0]!.cornerId)!.uv)
    expect(face.uvs[0]!.x).toBeCloseTo(snap.faces.find(f => f.id === face.id)!.uvs[0]!.x)
  })

  it('keeps the half-edge walk, the cache, and the corners aligned after an edge split', () => {
    const { mesh } = MeshBridge.meshObjectToEditableMesh(createCube('Cube', 2))
    const edge = [...mesh.edges.values()][0]!
    MeshTopologyService.splitEdge(mesh, edge.id, 0.25)
    for (const face of mesh.faces.values()) {
      const loop = mesh.walkFace(face.id)
      expect(loop.map(he => he.vertexId)).toEqual(face.vertexIds)
      expect(face.uvs).toHaveLength(loop.length)
      for (const he of loop) expect(mesh.corners.get(he.cornerId)?.faceId).toBe(face.id)
    }
  })
})

function meshSet(mesh: import('./MeshKernel').EditableMesh, faceId: number) {
  const face = mesh.faces.get(faceId)!
  const uvs = face.uvs.map((uv, i) => new Vector2(i === 0 ? 0.25 : uv.x, uv.y))
  mesh.setFaceUvs(faceId, uvs)
}
