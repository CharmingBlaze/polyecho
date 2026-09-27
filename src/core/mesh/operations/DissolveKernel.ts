import * as THREE from 'three'
import { EditableMesh } from '../MeshKernel'

export class DissolveKernel {
  /**
   * Dissolves an edge between two adjacent faces, merging them into one polygon.
   */
  static dissolveEdge(mesh: EditableMesh, edgeId: number): boolean {
    const edge = mesh.edges.get(edgeId)
    if (!edge || edge.faceIds.length !== 2) return false

    const [f1Id, f2Id] = edge.faceIds
    const face1 = mesh.faces.get(f1Id)
    const face2 = mesh.faces.get(f2Id)
    if (!face1 || !face2) return false

    // face1 runs p→q across the edge and face2 runs q→p. The merged loop is face1 from q
    // round to p, then face2 from after p up to (not including) q.
    const verts1 = face1.vertexIds
    const n1 = verts1.length
    let iP = -1
    for (let i = 0; i < n1; i++) {
      const a = verts1[i], b = verts1[(i + 1) % n1]
      if ((a === edge.v1 && b === edge.v2) || (a === edge.v2 && b === edge.v1)) { iP = i; break }
    }
    if (iP < 0) return false
    const p = verts1[iP]
    const q = verts1[(iP + 1) % n1]

    const verts2 = face2.vertexIds
    const n2 = verts2.length
    const jP = verts2.indexOf(p)
    if (jP < 0 || verts2[(jP + n2 - 1) % n2] !== q) return false

    const finalVerts: number[] = []
    const finalUvs: THREE.Vector2[] = []
    for (let k = 0; k < n1; k++) {
      const idx = (iP + 1 + k) % n1
      finalVerts.push(verts1[idx])
      finalUvs.push(face1.uvs[idx]?.clone() ?? new THREE.Vector2())
    }
    for (let k = 1; k < n2 - 1; k++) {
      const idx = (jP + k) % n2
      finalVerts.push(verts2[idx])
      finalUvs.push(face2.uvs[idx]?.clone() ?? new THREE.Vector2())
    }

    const matIdx = face1.materialIndex
    const color = face1.color

    mesh.removeFace(f1Id)
    mesh.removeFace(f2Id)
    mesh.removeEdge(edgeId)

    if (finalVerts.length < 3) return false
    mesh.addFace(finalVerts, finalUvs, matIdx, color)
    mesh.recalculateNormals()
    return true
  }

  static findEdgeId(mesh: EditableMesh, v1: number, v2: number): number | null {
    for (const edge of mesh.edges.values()) {
      if ((edge.v1 === v1 && edge.v2 === v2) || (edge.v1 === v2 && edge.v2 === v1)) {
        return edge.id
      }
    }
    return null
  }
}
