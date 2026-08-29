import * as THREE from 'three'
import { EditableMesh, MeshFace } from '../MeshKernel'
import { AttributeInterpolator } from '../attributes/AttributeInterpolator'

export interface SplitEdgeResult {
  newVertexId: number
  edgeAId: number
  edgeBId: number
}

export interface SplitFaceResult {
  face1: MeshFace
  face2: MeshFace
  connectingEdgeId: number
}

export class TopologyOps {
  /**
   * Splits an edge at parameter t (0 < t < 1), creating new vertex N and replacing the edge.
   */
  static splitEdge(mesh: EditableMesh, edgeId: number, t = 0.5): SplitEdgeResult | null {
    const edge = mesh.edges.get(edgeId)
    if (!edge) return null

    const vA = edge.v1
    const vB = edge.v2
    const posA = mesh.vertices.get(vA)?.position
    const posB = mesh.vertices.get(vB)?.position
    if (!posA || !posB) return null

    // 1. Create new interpolated vertex
    const newPos = posA.clone().lerp(posB, t)
    const newV = mesh.addVertex(newPos)
    const newVId = newV.id

    // 2. Identify all adjacent faces
    const adjFaceIds = [...edge.faceIds]

    // 3. For each adjacent face, insert newVId into vertexIds and interpolate UV
    for (const fId of adjFaceIds) {
      const face = mesh.faces.get(fId)
      if (!face) continue

      const n = face.vertexIds.length
      const newVertIds: number[] = []
      const newUvs: THREE.Vector2[] = []

      for (let i = 0; i < n; i++) {
        const curV = face.vertexIds[i]
        const nextV = face.vertexIds[(i + 1) % n]
        newVertIds.push(curV)
        newUvs.push(face.uvs[i]?.clone() || new THREE.Vector2())

        if ((curV === vA && nextV === vB) || (curV === vB && nextV === vA)) {
          const uvInterp = AttributeInterpolator.interpolateEdgeUV(
            face,
            curV,
            nextV,
            curV === vA ? t : 1 - t
          )
          newVertIds.push(newVId)
          newUvs.push(uvInterp)
        }
      }

      const matIdx = face.materialIndex
      const color = face.color

      mesh.removeFace(fId)
      mesh.addFace(newVertIds, newUvs, matIdx, color, fId)
    }

    // 4. Remove old edge and build two new sub-edges
    mesh.removeEdge(edgeId)
    const edgeA = mesh.getOrCreateEdge(vA, newVId)
    const edgeB = mesh.getOrCreateEdge(newVId, vB)

    mesh.recalculateNormals()

    return {
      newVertexId: newVId,
      edgeAId: edgeA.id,
      edgeBId: edgeB.id
    }
  }

  /**
   * Splits a face across two non-adjacent vertices, producing two new faces sharing a new edge.
   */
  static splitFace(mesh: EditableMesh, faceId: number, vertexA: number, vertexB: number): SplitFaceResult | null {
    const face = mesh.faces.get(faceId)
    if (!face || face.vertexIds.length < 4) return null

    const idxA = face.vertexIds.indexOf(vertexA)
    const idxB = face.vertexIds.indexOf(vertexB)
    if (idxA === -1 || idxB === -1 || idxA === idxB) return null

    const n = face.vertexIds.length
    // Vertices must not be directly adjacent
    if ((idxA + 1) % n === idxB || (idxB + 1) % n === idxA) return null

    const iStart = Math.min(idxA, idxB)
    const iEnd = Math.max(idxA, idxB)

    // Build face 1 loop: [iStart .. iEnd]
    const loop1Verts: number[] = []
    const loop1Uvs: THREE.Vector2[] = []
    for (let i = iStart; i <= iEnd; i++) {
      loop1Verts.push(face.vertexIds[i])
      loop1Uvs.push(face.uvs[i]?.clone() || new THREE.Vector2())
    }

    // Build face 2 loop: [iEnd .. n-1, 0 .. iStart]
    const loop2Verts: number[] = []
    const loop2Uvs: THREE.Vector2[] = []
    for (let i = iEnd; i < n; i++) {
      loop2Verts.push(face.vertexIds[i])
      loop2Uvs.push(face.uvs[i]?.clone() || new THREE.Vector2())
    }
    for (let i = 0; i <= iStart; i++) {
      loop2Verts.push(face.vertexIds[i])
      loop2Uvs.push(face.uvs[i]?.clone() || new THREE.Vector2())
    }

    const matIdx = face.materialIndex
    const color = face.color

    mesh.removeFace(faceId)

    const f1 = mesh.addFace(loop1Verts, loop1Uvs, matIdx, color)
    const f2 = mesh.addFace(loop2Verts, loop2Uvs, matIdx, color)
    const connectingEdge = mesh.getOrCreateEdge(vertexA, vertexB)

    mesh.recalculateNormals()

    if (!f1 || !f2) return null

    return {
      face1: f1,
      face2: f2,
      connectingEdgeId: connectingEdge.id
    }
  }

  /**
   * Subdivides a quad face into (parameters.length + 1) quads along two opposite edges.
   */
  static subdivideQuadWithParallelCuts(
    mesh: EditableMesh,
    faceId: number,
    edgeAId: number,
    edgeBId: number,
    cutParameters: number[]
  ): MeshFace[] {
    const face = mesh.faces.get(faceId)
    if (!face || face.vertexIds.length !== 4) return []

    const edgeA = mesh.edges.get(edgeAId)
    const edgeB = mesh.edges.get(edgeBId)
    if (!edgeA || !edgeB) return []

    // Ensure edgeA and edgeB are oriented consistently along face loop
    const verts = face.vertexIds
    const uvs = face.uvs
    const matIdx = face.materialIndex
    const color = face.color

    // Find vertices on edgeA and edgeB
    const vA1 = verts[0]
    const vA2 = verts[1]
    const vB1 = verts[3]
    const vB2 = verts[2]

    const posA1 = mesh.vertices.get(vA1)?.position
    const posA2 = mesh.vertices.get(vA2)?.position
    const posB1 = mesh.vertices.get(vB1)?.position
    const posB2 = mesh.vertices.get(vB2)?.position
    if (!posA1 || !posA2 || !posB1 || !posB2) return []

    // Generate cut vertices along side A (vA1 -> vA2) and side B (vB1 -> vB2)
    const sideAVertIds: number[] = [vA1]
    const sideAUvs: THREE.Vector2[] = [uvs[0].clone()]

    const sideBVertIds: number[] = [vB1]
    const sideBUvs: THREE.Vector2[] = [uvs[3].clone()]

    const sortedParams = [...cutParameters].sort((a, b) => a - b)

    for (const t of sortedParams) {
      const posA = posA1.clone().lerp(posA2, t)
      const uvA = uvs[0].clone().lerp(uvs[1], t)
      const newVA = mesh.addVertex(posA)
      sideAVertIds.push(newVA.id)
      sideAUvs.push(uvA)

      const posB = posB1.clone().lerp(posB2, t)
      const uvB = uvs[3].clone().lerp(uvs[2], t)
      const newVB = mesh.addVertex(posB)
      sideBVertIds.push(newVB.id)
      sideBUvs.push(uvB)
    }

    sideAVertIds.push(vA2)
    sideAUvs.push(uvs[1].clone())

    sideBVertIds.push(vB2)
    sideBUvs.push(uvs[2].clone())

    mesh.removeFace(faceId)

    const newFaces: MeshFace[] = []
    const count = sideAVertIds.length - 1

    for (let i = 0; i < count; i++) {
      const qVerts = [
        sideAVertIds[i],
        sideAVertIds[i + 1],
        sideBVertIds[i + 1],
        sideBVertIds[i]
      ]
      const qUvs = [
        sideAUvs[i],
        sideAUvs[i + 1],
        sideBUvs[i + 1],
        sideBUvs[i]
      ]

      const qFace = mesh.addFace(qVerts, qUvs, matIdx, color)
      if (qFace) newFaces.push(qFace)
    }

    mesh.recalculateNormals()
    return newFaces
  }
}
