import { describe, expect, it } from 'vitest'
import { Vector2, Vector3 } from 'three'
import { MeshBuilder } from './MeshBuilder'
import { MeshBridge } from './MeshBridge'
import { assertMeshValid, MeshValidator } from './MeshValidator'
import { editMesh } from './MeshTransaction'
import { TopologyOps } from './operations/TopologyOps'
import { createCube } from '../geometry/Primitives'

const cube = () => MeshBridge.meshObjectToEditableMesh(createCube('Cube', 2)).mesh

describe('mesh integrity', () => {
  it('validates a cube and reports boundary surfaces without rejecting them', () => {
    const mesh = cube()
    expect([mesh.vertices.size, mesh.edges.size, mesh.faces.size]).toEqual([8, 12, 6])
    assertMeshValid(mesh)
    mesh.removeFace([...mesh.faces.keys()][0])
    expect(MeshValidator.validate(mesh).boundaryEdges).toHaveLength(4)
    assertMeshValid(mesh)
  })

  it('deletes incident faces when removing an edge, leaving no dangling loops', () => {
    const mesh = cube()
    mesh.removeEdge([...mesh.edges.keys()][0])
    expect(mesh.faces.size).toBe(4)
    assertMeshValid(mesh)
  })

  it('detects stale references, misordered loops, and missing twins', () => {
    for (const corrupt of [
      (mesh: ReturnType<typeof cube>) => { mesh.vertices.values().next().value!.faceIds.push(999) },
      (mesh: ReturnType<typeof cube>) => { mesh.faces.values().next().value!.vertexIds.reverse() },
      (mesh: ReturnType<typeof cube>) => { mesh.halfEdges.values().next().value!.twinId = null },
      (mesh: ReturnType<typeof cube>) => { mesh.edges.delete(mesh.edges.keys().next().value!) },
    ]) {
      const mesh = cube(); corrupt(mesh)
      expect(MeshValidator.validate(mesh).valid).toBe(false)
    }
  })

  it('reverses winding without replacing corner, edge or face IDs', () => {
    const mesh = cube(), before = mesh.createSnapshot()
    for (const id of mesh.faces.keys()) mesh.reverseFace(id)
    assertMeshValid(mesh)
    expect(MeshValidator.validate(mesh).flippedEdges).toEqual([])
    for (const f of before.faces) {
      const after = mesh.faces.get(f.id)!
      expect(after.normal.dot(new Vector3(f.normal.x, f.normal.y, f.normal.z))).toBeCloseTo(-1)
      expect([...after.halfEdgeIds].sort()).toEqual([...f.halfEdgeIds].sort())
      expect([...after.edgeIds].sort()).toEqual([...f.edgeIds].sort())
    }
  })

  it('rolls back exceptions and invalid mutations, including ID allocators and UVs', () => {
    const mesh = cube(), before = mesh.createSnapshot()
    expect(editMesh(mesh, () => {
      mesh.addVertex(new Vector3(3, 4, 5))
      mesh.halfEdges.clear()
    }).success).toBe(false)
    expect(mesh.createSnapshot()).toEqual(before)
    expect(editMesh(mesh, () => { mesh.faces.clear(); throw new Error('failed') })).toEqual({ success: false, code: 'operation-failed', reason: 'failed' })
    expect(mesh.createSnapshot()).toEqual(before)
  })

  it('splits an edge in all adjacent faces and interpolates separate UV corners', () => {
    const mesh = cube(), edge = mesh.edges.values().next().value!
    const faces = edge.faceIds.map(id => mesh.faces.get(id)!)
    faces.forEach((face, i) => { face.uvs = face.vertexIds.map((_, j) => new Vector2(j + i * 10, i)) })
    const expected = faces.map(f => f.uvs[f.vertexIds.indexOf(edge.v1)].clone().lerp(f.uvs[f.vertexIds.indexOf(edge.v2)], 0.25))
    const result = TopologyOps.splitEdge(mesh, edge.id, 0.25)!
    expect(result).not.toBeNull()
    faces.forEach((face, i) => {
      const f = mesh.faces.get(face.id)!
      expect(f.uvs[f.vertexIds.indexOf(result.newVertexId)]).toEqual(expected[i])
      expect(f.vertexIds).toHaveLength(5)
    })
    assertMeshValid(mesh)
  })

  it('rejects endpoint/out-of-range splits without mutation', () => {
    const mesh = cube(), before = mesh.createSnapshot(), edge = mesh.edges.keys().next().value!
    for (const t of [0, 1, -1, 2, NaN, Infinity]) {
      expect(TopologyOps.splitEdge(mesh, edge, t)).toBeNull()
      expect(mesh.createSnapshot()).toEqual(before)
    }
  })

  it('uses every corner for polygon normals, including collinear leading corners', () => {
    const b = new MeshBuilder()
    const ids = [[0,0,0], [1,0,0], [2,0,0], [2,1,0], [0,1,0]].map(p => b.vertex(new Vector3(...p)))
    const faceId = b.face(ids)
    const mesh = b.build()
    expect(mesh.faces.get(faceId)!.normal.toArray()).toEqual([0,0,1])
    mesh.vertices.get(ids[3])!.position.z = 0.2
    mesh.recalculateNormals()
    expect(mesh.getFacePlanarity(faceId).planar).toBe(false)
    expect(mesh.faces.get(faceId)!.vertexIds).toHaveLength(5)
    assertMeshValid(mesh)
  })

  it('reports non-manifold incidence without inventing a twin', () => {
    const b = new MeshBuilder()
    const ids = [[0,0,0], [1,0,0], [0,1,0], [0,-1,0], [0,0,1]].map(p => b.vertex(new Vector3(...p)))
    b.face([ids[0],ids[1],ids[2]])
    b.face([ids[1],ids[0],ids[3]])
    b.face([ids[0],ids[1],ids[4]])
    const mesh = b.build(), report = MeshValidator.validate(mesh)
    expect(report.valid).toBe(true)
    expect(report.nonManifoldEdges).toHaveLength(1)
    const edge = mesh.edges.get(report.nonManifoldEdges[0])!
    expect(edge.halfEdgeIds.every(id => mesh.halfEdges.get(id)!.twinId === null)).toBe(true)
    mesh.removeFace([...mesh.faces.keys()][2])
    assertMeshValid(mesh)
    expect(edge.halfEdgeIds.every(id => mesh.halfEdges.get(id)!.twinId !== null)).toBe(true)
  })
})
