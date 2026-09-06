import * as THREE from 'three'
import { EditableMesh, MeshFace, MeshVertex } from './MeshKernel'
import { TopologyOps } from './operations/TopologyOps'
import { MergeKernel } from './operations/MergeKernel'

export interface MergeResult {
  mergedVertexCount: number
  removedEdgeCount: number
  removedFaceCount: number
}

export interface CleanupResult {
  removedVertices: number
  removedEdges: number
  removedFaces: number
}

export class MeshTopologyService {
  // =========================================================================
  // 1. DELETE
  // =========================================================================

  /**
   * Delete selected faces while preserving non-orphaned vertices/edges.
   */
  static deleteFaces(mesh: EditableMesh, faceIds: number[]): void {
    const fIdSet = new Set(faceIds)
    const affectedVertIds = new Set<number>()

    for (const fId of faceIds) {
      const face = mesh.faces.get(fId)
      if (face) {
        face.vertexIds.forEach(v => affectedVertIds.add(v))
        mesh.removeFace(fId)
      }
    }

    // Cleanup orphan edges (edges that have 0 remaining faces)
    for (const [eId, edge] of Array.from(mesh.edges.entries())) {
      edge.faceIds = edge.faceIds.filter(id => !fIdSet.has(id))
      if (edge.faceIds.length === 0) {
        mesh.removeEdge(eId)
      }
    }

    // Cleanup orphan vertices (vertices that have 0 remaining edges)
    for (const vId of affectedVertIds) {
      const vert = mesh.vertices.get(vId)
      if (vert && vert.edgeIds.length === 0) {
        mesh.removeVertex(vId)
      }
    }
  }

  /**
   * Delete selected edges and any faces that depend on them.
   */
  static deleteEdges(mesh: EditableMesh, edgeIds: number[]): void {
    const facesToDelete = new Set<number>()

    for (const eId of edgeIds) {
      const edge = mesh.edges.get(eId)
      if (edge) {
        edge.faceIds.forEach(f => facesToDelete.add(f))
      }
    }

    this.deleteFaces(mesh, Array.from(facesToDelete))

    for (const eId of edgeIds) {
      mesh.removeEdge(eId)
    }
  }

  /**
   * Delete selected vertices, connected edges, and connected faces.
   */
  static deleteVertices(mesh: EditableMesh, vertexIds: number[]): void {
    const vIdSet = new Set(vertexIds)
    const facesToDelete = new Set<number>()

    for (const [fId, face] of mesh.faces) {
      if (face.vertexIds.some(v => vIdSet.has(v))) {
        facesToDelete.add(fId)
      }
    }

    this.deleteFaces(mesh, Array.from(facesToDelete))

    for (const vId of vertexIds) {
      mesh.removeVertex(vId)
    }
  }

  // =========================================================================
  // 2. DISSOLVE
  // =========================================================================

  /**
   * Dissolves an edge shared by two adjacent faces, merging them into one larger polygon.
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

    // Check normal compatibility
    if (face1.normal.dot(face2.normal) < 0.2) {
      return false
    }

    const verts1 = face1.vertexIds
    const n1 = verts1.length
    const idxA = verts1.indexOf(vA)

    const mergedVerts: number[] = []
    for (let i = 0; i < n1; i++) {
      mergedVerts.push(verts1[(idxA + i) % n1])
    }

    const verts2 = face2.vertexIds
    const otherFace2Verts = verts2.filter(vid => vid !== vA && vid !== vB)

    const finalVerts: number[] = []
    for (const v of mergedVerts) {
      finalVerts.push(v)
      if (v === vB) {
        finalVerts.push(...otherFace2Verts)
      }
    }

    const matIdx = face1.materialIndex
    const color = face1.color

    mesh.removeFace(f1Id)
    mesh.removeFace(f2Id)
    mesh.removeEdge(edgeId)

    mesh.addFace(finalVerts, undefined, matIdx, color)
    mesh.recalculateNormals()
    return true
  }

  /**
   * Dissolves a vertex lying along collinear edges, merging the edges into one.
   */
  static dissolveVertex(mesh: EditableMesh, vertexId: number): boolean {
    const vert = mesh.vertices.get(vertexId)
    if (!vert || vert.edgeIds.length !== 2) return false

    const [e1Id, e2Id] = vert.edgeIds
    const e1 = mesh.edges.get(e1Id)
    const e2 = mesh.edges.get(e2Id)
    if (!e1 || !e2) return false

    const other1 = e1.v1 === vertexId ? e1.v2 : e1.v1
    const other2 = e2.v1 === vertexId ? e2.v2 : e2.v1

    for (const [fId, face] of [...mesh.faces]) {
      const idx = face.vertexIds.indexOf(vertexId)
      if (idx < 0) continue
      const nextIds = face.vertexIds.filter((_, i) => i !== idx)
      const nextUvs = face.uvs.filter((_, i) => i !== idx)
      const matIdx = face.materialIndex
      const color = face.color
      mesh.removeFace(fId)
      if (nextIds.length >= 3) {
        mesh.addFace(nextIds, nextUvs, matIdx, color, fId)
      }
    }

    mesh.removeEdge(e1Id)
    mesh.removeEdge(e2Id)
    const leftover = mesh.vertices.get(vertexId)
    if (leftover) {
      leftover.faceIds = []
      leftover.edgeIds = []
      mesh.vertices.delete(vertexId)
    }
    if (mesh.vertices.has(other1) && mesh.vertices.has(other2)) {
      mesh.getOrCreateEdge(other1, other2)
    }
    mesh.recalculateNormals()
    return true
  }

  // =========================================================================
  // 3. MERGE VERTICES
  // =========================================================================

  /**
   * Merges selected vertices at Center (centroid), First, or Last.
   */
  static mergeVertices(mesh: EditableMesh, vertexIds: number[], mode: 'CENTER' | 'FIRST' | 'LAST' = 'CENTER'): number {
    if (vertexIds.length < 2) return vertexIds[0] || 0

    const targetPos = new THREE.Vector3()
    let keepId = vertexIds[0]

    if (mode === 'CENTER') {
      for (const id of vertexIds) {
        const v = mesh.vertices.get(id)
        if (v) targetPos.add(v.position)
      }
      targetPos.divideScalar(vertexIds.length)
    } else if (mode === 'FIRST') {
      const first = mesh.vertices.get(vertexIds[0])
      if (first) targetPos.copy(first.position)
    } else {
      const last = mesh.vertices.get(vertexIds[vertexIds.length - 1])
      if (last) targetPos.copy(last.position)
      keepId = vertexIds[vertexIds.length - 1]
    }

    return MergeKernel.mergeVertices(mesh, vertexIds, targetPos, keepId)
  }

  /**
   * Spatial hash grid based O(N) Merge by Distance (Weld).
   */
  static mergeByDistance(mesh: EditableMesh, vertexIds: number[] = [], threshold = 0.005): MergeResult {
    const initialVertCount = mesh.vertices.size
    const initialEdgeCount = mesh.edges.size
    const initialFaceCount = mesh.faces.size
    MergeKernel.mergeByDistance(mesh, threshold, vertexIds.length > 0 ? vertexIds : undefined)
    return {
      mergedVertexCount: initialVertCount - mesh.vertices.size,
      removedEdgeCount: initialEdgeCount - mesh.edges.size,
      removedFaceCount: initialFaceCount - mesh.faces.size
    }
  }

  // =========================================================================
  // 4. SPLIT EDGE & SUBDIVIDE
  // =========================================================================

  /**
   * Splits an edge at parameter t [0..1] and returns the newly created vertex ID.
   */
  static splitEdge(mesh: EditableMesh, edgeId: number, t = 0.5): number {
    const edge = mesh.edges.get(edgeId)
    if (!edge) return -1

    const v1 = mesh.vertices.get(edge.v1)
    const v2 = mesh.vertices.get(edge.v2)
    if (!v1 || !v2) return -1

    const newPos = v1.position.clone().lerp(v2.position, t)
    const newVert = mesh.addVertex(newPos)

    for (const fId of edge.faceIds) {
      const face = mesh.faces.get(fId)
      if (!face) continue

      const idx1 = face.vertexIds.indexOf(edge.v1)
      const idx2 = face.vertexIds.indexOf(edge.v2)

      if (idx1 !== -1 && idx2 !== -1) {
        const insertIdx = (idx1 === 0 && idx2 === face.vertexIds.length - 1) 
          ? face.vertexIds.length 
          : (idx2 === 0 && idx1 === face.vertexIds.length - 1)
          ? face.vertexIds.length
          : Math.max(idx1, idx2)

        face.vertexIds.splice(insertIdx, 0, newVert.id)

        if (face.uvs.length >= 2) {
          const uv1 = face.uvs[idx1] || new THREE.Vector2(0, 0)
          const uv2 = face.uvs[idx2] || new THREE.Vector2(1, 1)
          const newUV = new THREE.Vector2(
            uv1.x + (uv2.x - uv1.x) * t,
            uv1.y + (uv2.y - uv1.y) * t
          )
          face.uvs.splice(insertIdx, 0, newUV)
        }
      }
    }

    mesh.removeEdge(edgeId)
    mesh.getOrCreateEdge(edge.v1, newVert.id)
    mesh.getOrCreateEdge(newVert.id, edge.v2)
    return newVert.id
  }

  /**
   * Connects two vertices on a shared face, splitting the face into two.
   */
  static connectVertices(mesh: EditableMesh, vAId: number, vBId: number): boolean {
    if (vAId === vBId) return false

    let targetFace: MeshFace | null = null
    for (const [, face] of mesh.faces) {
      if (face.vertexIds.includes(vAId) && face.vertexIds.includes(vBId)) {
        targetFace = face
        break
      }
    }
    if (!targetFace || targetFace.vertexIds.length < 4) return false
    return !!TopologyOps.splitFace(mesh, targetFace.id, vAId, vBId)
  }

  /**
   * Subdivides a tri into 4 tris or a quad into 4 quads. Returns new face ids.
   */
  static subdivideFace(mesh: EditableMesh, faceId: number): number[] {
    const face = mesh.faces.get(faceId)
    if (!face) return []

    const verts = face.vertexIds
    const uvAt = (i: number) => face.uvs[i]?.clone() ?? new THREE.Vector2()
    const midUv = (i: number, j: number) => uvAt(i).add(uvAt(j)).multiplyScalar(0.5)
    const matIdx = face.materialIndex
    const color = face.color
    const added: number[] = []

    if (verts.length === 4) {
      const [v0, v1, v2, v3] = verts
      const p0 = mesh.vertices.get(v0)?.position
      const p1 = mesh.vertices.get(v1)?.position
      const p2 = mesh.vertices.get(v2)?.position
      const p3 = mesh.vertices.get(v3)?.position
      if (!p0 || !p1 || !p2 || !p3) return []

      const mid01 = mesh.addVertex(p0.clone().lerp(p1, 0.5)).id
      const mid12 = mesh.addVertex(p1.clone().lerp(p2, 0.5)).id
      const mid23 = mesh.addVertex(p2.clone().lerp(p3, 0.5)).id
      const mid30 = mesh.addVertex(p3.clone().lerp(p0, 0.5)).id
      const center = mesh.addVertex(p0.clone().add(p1).add(p2).add(p3).multiplyScalar(0.25)).id
      const uv0 = uvAt(0)
      const uv1 = uvAt(1)
      const uv2 = uvAt(2)
      const uv3 = uvAt(3)
      const uvC = uv0.clone().add(uv1).add(uv2).add(uv3).multiplyScalar(0.25)
      const uv01 = midUv(0, 1)
      const uv12 = midUv(1, 2)
      const uv23 = midUv(2, 3)
      const uv30 = midUv(3, 0)

      mesh.removeFace(faceId)
      const faces = [
        mesh.addFace([v0, mid01, center, mid30], [uv0, uv01, uvC, uv30], matIdx, color),
        mesh.addFace([mid01, v1, mid12, center], [uv01, uv1, uv12, uvC], matIdx, color),
        mesh.addFace([center, mid12, v2, mid23], [uvC, uv12, uv2, uv23], matIdx, color),
        mesh.addFace([mid30, center, mid23, v3], [uv30, uvC, uv23, uv3], matIdx, color)
      ]
      for (const f of faces) {
        if (f) added.push(f.id)
      }
      mesh.recalculateNormals()
      return added
    }

    if (verts.length === 3) {
      const [v0, v1, v2] = verts
      const p0 = mesh.vertices.get(v0)?.position
      const p1 = mesh.vertices.get(v1)?.position
      const p2 = mesh.vertices.get(v2)?.position
      if (!p0 || !p1 || !p2) return []

      const mid01 = mesh.addVertex(p0.clone().lerp(p1, 0.5)).id
      const mid12 = mesh.addVertex(p1.clone().lerp(p2, 0.5)).id
      const mid20 = mesh.addVertex(p2.clone().lerp(p0, 0.5)).id
      const uv0 = uvAt(0)
      const uv1 = uvAt(1)
      const uv2 = uvAt(2)
      const uv01 = midUv(0, 1)
      const uv12 = midUv(1, 2)
      const uv20 = midUv(2, 0)

      mesh.removeFace(faceId)
      const faces = [
        mesh.addFace([v0, mid01, mid20], [uv0, uv01, uv20], matIdx, color),
        mesh.addFace([mid01, v1, mid12], [uv01, uv1, uv12], matIdx, color),
        mesh.addFace([mid20, mid12, v2], [uv20, uv12, uv2], matIdx, color),
        mesh.addFace([mid01, mid12, mid20], [uv01, uv12, uv20], matIdx, color)
      ]
      for (const f of faces) {
        if (f) added.push(f.id)
      }
      mesh.recalculateNormals()
      return added
    }

    return []
  }

  /** Subdivides a quad face into 4 quads. */
  static subdivideQuadFace(mesh: EditableMesh, faceId: number): boolean {
    return this.subdivideFace(mesh, faceId).length === 4
  }

  // =========================================================================
  // 5. FILL FACE & BRIDGE EDGES
  // =========================================================================

  /**
   * Creates a new polygon face from a closed boundary loop of vertices.
   */
  static fillBoundary(mesh: EditableMesh, vertexIds: number[], uvs?: THREE.Vector2[]): number | null {
    if (vertexIds.length < 3) return null

    const positions = vertexIds.map(id => mesh.vertices.get(id)?.position).filter(Boolean) as THREE.Vector3[]
    if (positions.length < 3) return null

    const sorted = [...vertexIds].sort((a, b) => a - b).join(',')
    for (const face of mesh.faces.values()) {
      if (face.vertexIds.length === vertexIds.length && [...face.vertexIds].sort((a, b) => a - b).join(',') === sorted) {
        return null
      }
    }

    const normal = new THREE.Vector3()
    for (let i = 0; i < positions.length; i++) {
      const current = positions[i]
      const next = positions[(i + 1) % positions.length]
      normal.x += (current.y - next.y) * (current.z + next.z)
      normal.y += (current.z - next.z) * (current.x + next.x)
      normal.z += (current.x - next.x) * (current.y + next.y)
    }
    normal.normalize()

    const newFace = mesh.addFace(vertexIds, uvs)
    if (newFace) {
      newFace.normal.copy(normal)
      return newFace.id
    }
    return null
  }

  /**
   * Bridges two equal-length open loops of vertices with a quad strip.
   */
  static bridgeLoops(mesh: EditableMesh, loopA: number[], loopB: number[]): boolean {
    if (loopA.length < 2 || loopA.length !== loopB.length) return false

    const count = loopA.length
    for (let i = 0; i < count; i++) {
      const next = (i + 1) % count
      this.bridgeTwoEdges(mesh, loopA[i], loopA[next], loopB[i], loopB[next], false)
    }

    mesh.recalculateNormals()
    return true
  }

  /** One quad between two edges, oriented by shorter endpoint pairing. */
  static bridgeTwoEdges(
    mesh: EditableMesh,
    a1: number,
    a2: number,
    b1: number,
    b2: number,
    recalc = true
  ): number | null {
    const pa1 = mesh.vertices.get(a1)?.position
    const pa2 = mesh.vertices.get(a2)?.position
    const pb1 = mesh.vertices.get(b1)?.position
    const pb2 = mesh.vertices.get(b2)?.position
    if (!pa1 || !pa2 || !pb1 || !pb2) return null

    const distNormal = pa1.distanceTo(pb1) + pa2.distanceTo(pb2)
    const distCross = pa1.distanceTo(pb2) + pa2.distanceTo(pb1)
    const verts = distNormal <= distCross ? [a1, a2, b2, b1] : [a1, a2, b1, b2]
    const uvs = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(1, 0),
      new THREE.Vector2(1, 1),
      new THREE.Vector2(0, 1)
    ]
    const face = mesh.addFace(verts, uvs)
    if (recalc) mesh.recalculateNormals()
    return face?.id ?? null
  }

  /**
   * Fills a closed even-length boundary: one quad if 4 verts, otherwise a fan to a new center.
   */
  static gridFillBoundary(mesh: EditableMesh, boundary: number[]): number[] {
    if (boundary.length < 4 || boundary.length % 2 !== 0) return []
    const created: number[] = []
    const quadUvs = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(1, 0),
      new THREE.Vector2(1, 1),
      new THREE.Vector2(0, 1)
    ]

    if (boundary.length === 4) {
      const face = mesh.addFace(boundary, quadUvs)
      if (face) created.push(face.id)
      mesh.recalculateNormals()
      return created
    }

    const center = new THREE.Vector3()
    let n = 0
    for (const id of boundary) {
      const p = mesh.vertices.get(id)?.position
      if (!p) continue
      center.add(p)
      n++
    }
    if (n < 4) return []
    center.multiplyScalar(1 / n)
    const centerId = mesh.addVertex(center).id
    const fanUvs = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.5, 0),
      new THREE.Vector2(1, 0),
      new THREE.Vector2(0.5, 0.5)
    ]
    for (let i = 0; i < boundary.length; i += 2) {
      const face = mesh.addFace(
        [boundary[i], boundary[(i + 1) % boundary.length], boundary[(i + 2) % boundary.length], centerId],
        fanUvs
      )
      if (face) created.push(face.id)
    }
    mesh.recalculateNormals()
    return created
  }

  /**
   * Flips diagonal edge between two adjacent triangles (Rotate Edge).
   */
  static flipEdge(mesh: EditableMesh, edgeId: number): boolean {
    const edge = mesh.edges.get(edgeId)
    if (!edge || edge.faceIds.length !== 2) return false

    const [f1Id, f2Id] = edge.faceIds
    const face1 = mesh.faces.get(f1Id)
    const face2 = mesh.faces.get(f2Id)
    if (!face1 || !face2 || face1.vertexIds.length !== 3 || face2.vertexIds.length !== 3) return false

    const vA = edge.v1
    const vB = edge.v2

    const vC = face1.vertexIds.find(id => id !== vA && id !== vB)
    const vD = face2.vertexIds.find(id => id !== vA && id !== vB)
    if (vC === undefined || vD === undefined) return false

    const matIdx = face1.materialIndex
    const color = face1.color

    mesh.removeFace(f1Id)
    mesh.removeFace(f2Id)
    mesh.removeEdge(edgeId)

    mesh.addFace([vC, vB, vD], undefined, matIdx, color)
    mesh.addFace([vD, vA, vC], undefined, matIdx, color)
    mesh.getOrCreateEdge(vC, vD)

    mesh.recalculateNormals()
    return true
  }

  // =========================================================================
  // 6. NORMALS
  // =========================================================================

  /**
   * Flips the normals/winding of target faces.
   */
  static flipNormals(mesh: EditableMesh, faceIds: number[]): void {
    for (const fId of faceIds) {
      const face = mesh.faces.get(fId)
      if (face) {
        face.vertexIds.reverse()
        face.uvs.reverse()
        face.normal.negate()
      }
    }
  }

  static flattenVertices(mesh: EditableMesh, vertexIds: number[], axis: 'x' | 'y' | 'z'): void {
    const verts = vertexIds.map(id => mesh.vertices.get(id)).filter((v): v is MeshVertex => !!v)
    if (verts.length === 0) return
    const avg = verts.reduce((sum, v) => sum + v.position[axis], 0) / verts.length
    for (const v of verts) v.position[axis] = avg
    mesh.recalculateNormals()
  }

  /**
   * Recalculates outward normals for the entire mesh.
   */
  static recalculateNormals(mesh: EditableMesh): void {
    mesh.recalculateNormals()
  }

  // =========================================================================
  // 7. CLEANUP MESH
  // =========================================================================

  /**
   * Safe mesh cleanup: removes zero-length edges, duplicate edges, degenerate faces, orphan vertices.
   */
  static cleanupMesh(mesh: EditableMesh): CleanupResult {
    const initialVerts = mesh.vertices.size
    const initialEdges = mesh.edges.size
    const initialFaces = mesh.faces.size

    for (const [fId, face] of Array.from(mesh.faces.entries())) {
      const uniqueVerts = Array.from(new Set(face.vertexIds))
      if (uniqueVerts.length < 3) {
        mesh.removeFace(fId)
      } else {
        face.vertexIds = uniqueVerts
      }
    }

    for (const [eId, edge] of Array.from(mesh.edges.entries())) {
      const v1 = mesh.vertices.get(edge.v1)
      const v2 = mesh.vertices.get(edge.v2)
      if (!v1 || !v2 || v1.position.distanceTo(v2.position) < 0.00001) {
        mesh.removeEdge(eId)
      }
    }

    const usedVertIds = new Set<number>()
    for (const face of mesh.faces.values()) {
      face.vertexIds.forEach(id => usedVertIds.add(id))
    }
    for (const [vId] of Array.from(mesh.vertices.entries())) {
      if (!usedVertIds.has(vId)) {
        mesh.removeVertex(vId)
      }
    }

    mesh.recalculateNormals()

    return {
      removedVertices: initialVerts - mesh.vertices.size,
      removedEdges: initialEdges - mesh.edges.size,
      removedFaces: initialFaces - mesh.faces.size
    }
  }

  // =========================================================================
  // 8. TOPOLOGY SELECTION HELPERS
  // =========================================================================

  /**
   * Traverses a quad edge loop continuation.
   */
  static selectEdgeLoop(mesh: EditableMesh, startEdgeId: number): number[] {
    const result = new Set<number>([startEdgeId])
    const queue = [startEdgeId]

    while (queue.length > 0) {
      const currEdgeId = queue.shift()!
      const edge = mesh.edges.get(currEdgeId)
      if (!edge) continue

      for (const fId of edge.faceIds) {
        const face = mesh.faces.get(fId)
        if (!face || face.vertexIds.length !== 4) continue

        const verts = face.vertexIds
        const idx1 = verts.indexOf(edge.v1)
        const idx2 = verts.indexOf(edge.v2)
        if (idx1 === -1 || idx2 === -1) continue

        const oppV1 = verts[(idx1 + 2) % 4]
        const oppV2 = verts[(idx2 + 2) % 4]

        for (const [otherEId, otherE] of mesh.edges) {
          if ((otherE.v1 === oppV1 && otherE.v2 === oppV2) || (otherE.v1 === oppV2 && otherE.v2 === oppV1)) {
            if (!result.has(otherEId)) {
              result.add(otherEId)
              queue.push(otherEId)
            }
          }
        }
      }
    }

    return Array.from(result)
  }

  /**
   * Traverses all connected vertices/edges/faces (Select Connected Island).
   */
  static selectConnected(mesh: EditableMesh, startVertexId: number): number[] {
    const visited = new Set<number>([startVertexId])
    const queue = [startVertexId]

    while (queue.length > 0) {
      const curr = queue.shift()!
      const vert = mesh.vertices.get(curr)
      if (!vert) continue

      for (const eId of vert.edgeIds) {
        const edge = mesh.edges.get(eId)
        if (!edge) continue
        const neighbor = edge.v1 === curr ? edge.v2 : edge.v1
        if (!visited.has(neighbor)) {
          visited.add(neighbor)
          queue.push(neighbor)
        }
      }
    }

    return Array.from(visited)
  }
}
