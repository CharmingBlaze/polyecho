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

    const vA = edge.v1
    const vB = edge.v2
    const verts1 = face1.vertexIds
    const n1 = verts1.length
    const idxA = verts1.indexOf(vA)
    if (idxA < 0) return false

    const loop1: number[] = []
    const uvs1: THREE.Vector2[] = []
    for (let i = 0; i < n1; i++) {
      const idx = (idxA + i) % n1
      loop1.push(verts1[idx])
      uvs1.push(face1.uvs[idx]?.clone() ?? new THREE.Vector2())
    }

    const verts2 = face2.vertexIds
    const otherVerts2: number[] = []
    const otherUvs2: THREE.Vector2[] = []
    for (let i = 0; i < verts2.length; i++) {
      const vid = verts2[i]
      if (vid === vA || vid === vB) continue
      otherVerts2.push(vid)
      otherUvs2.push(face2.uvs[i]?.clone() ?? new THREE.Vector2())
    }

    const finalVerts: number[] = []
    const finalUvs: THREE.Vector2[] = []
    for (let i = 0; i < loop1.length; i++) {
      finalVerts.push(loop1[i])
      finalUvs.push(uvs1[i])
      if (loop1[i] === vB) {
        finalVerts.push(...otherVerts2)
        finalUvs.push(...otherUvs2)
      }
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
