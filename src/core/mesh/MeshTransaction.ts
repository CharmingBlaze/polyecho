import type { EditableMesh, MeshSnapshot } from './MeshKernel'
import { MeshValidator, type MeshValidationResult } from './MeshValidator'

/** Element identity is scoped to its scene object, including future multi-edit. */
export interface MeshElementRef {
  objectId: string
  kind: 'vertex' | 'edge' | 'face' | 'corner'
  elementId: number
}

export interface MeshChange {
  topologyChanged: boolean
  positionsChanged: boolean
  attributesChanged: boolean
  createdVertices: number[]
  deletedVertices: number[]
  createdEdges: number[]
  deletedEdges: number[]
  createdFaces: number[]
  deletedFaces: number[]
}

export type MeshEditResult<T> =
  | { success: true; value: T; change: MeshChange }
  | { success: false; code: 'invalid-topology' | 'operation-failed'; reason: string; validation?: MeshValidationResult }

export function describeMeshChange(before: MeshSnapshot, after: MeshSnapshot): MeshChange {
  const added = (a: { id: number }[], b: { id: number }[]) => {
    const ids = new Set(a.map(v => v.id))
    return b.filter(v => !ids.has(v.id)).map(v => v.id)
  }
  const topology = (s: MeshSnapshot) => JSON.stringify([
    s.vertices.map(v => v.id), s.edges.map(e => [e.id, e.v1, e.v2]),
    s.faces.map(f => [f.id, f.vertexIds, f.halfEdgeIds]), s.halfEdges,
  ])
  const positions = (s: MeshSnapshot) => JSON.stringify(s.vertices.map(v => [v.id, v.position]))
  const attributes = (s: MeshSnapshot) => JSON.stringify([
    s.vertices.map(v => [v.id, v.color, v.boneWeights]),
    s.edges.map(e => [e.id, e.seam, e.sharp]), s.faces.map(f => [f.id, f.uvs, f.materialIndex, f.color]),
  ])
  return {
    topologyChanged: topology(before) !== topology(after),
    positionsChanged: positions(before) !== positions(after),
    attributesChanged: attributes(before) !== attributes(after),
    createdVertices: added(before.vertices, after.vertices), deletedVertices: added(after.vertices, before.vertices),
    createdEdges: added(before.edges, after.edges), deletedEdges: added(after.edges, before.edges),
    createdFaces: added(before.faces, after.faces), deletedFaces: added(after.faces, before.faces),
  }
}

/** Synchronous atomic boundary: intermediate previews may be degenerate; commits may not. */
export function editMesh<T>(mesh: EditableMesh, operation: (mesh: EditableMesh) => T): MeshEditResult<T> {
  const before = mesh.createSnapshot()
  try {
    const value = operation(mesh)
    mesh.recalculateNormals()
    const validation = MeshValidator.validate(mesh)
    if (!validation.valid) {
      mesh.restoreSnapshot(before)
      return { success: false, code: 'invalid-topology', reason: 'The edit would leave invalid mesh topology.', validation }
    }
    const change = describeMeshChange(before, mesh.createSnapshot())
    return { success: true, value, change }
  } catch (error) {
    mesh.restoreSnapshot(before)
    return { success: false, code: 'operation-failed', reason: error instanceof Error ? error.message : String(error) }
  }
}
