import * as THREE from 'three'
import { EditableMesh, MeshFace, MeshVertex } from './MeshKernel'

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

    // Rewire all faces using this vertex
    for (const [, face] of mesh.faces) {
      if (face.vertexIds.includes(vertexId)) {
        face.vertexIds = face.vertexIds.filter(v => v !== vertexId)
      }
    }

    mesh.removeEdge(e1Id)
    mesh.removeEdge(e2Id)
    mesh.removeVertex(vertexId)
    mesh.getOrCreateEdge(other1, other2)
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

    let targetPos = new THREE.Vector3()
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
      keepId = vertexIds[0]
    } else if (mode === 'LAST') {
      const last = mesh.vertices.get(vertexIds[vertexIds.length - 1])
      if (last) targetPos.copy(last.position)
      keepId = vertexIds[vertexIds.length - 1]
    }

    const keepVert = mesh.vertices.get(keepId)
    if (keepVert) {
      keepVert.position.copy(targetPos)
    }

    const vertSet = new Set(vertexIds)

    // Rewire all faces
    for (const [fId, face] of Array.from(mesh.faces.entries())) {
      if (face.vertexIds.some(vid => vertSet.has(vid))) {
        const newVertIds: number[] = []
        for (const vid of face.vertexIds) {
          const mappedId = vertSet.has(vid) ? keepId : vid
          if (newVertIds.length === 0 || newVertIds[newVertIds.length - 1] !== mappedId) {
            newVertIds.push(mappedId)
          }
        }
        if (newVertIds.length > 1 && newVertIds[newVertIds.length - 1] === newVertIds[0]) {
          newVertIds.pop()
        }

        const uvs = [...face.uvs]
        const matIdx = face.materialIndex
        const color = face.color

        mesh.removeFace(fId)

        if (newVertIds.length >= 3) {
          mesh.addFace(newVertIds, uvs, matIdx, color, fId)
        }
      }
    }

    // Remove merged original vertices
    for (const vid of vertexIds) {
      if (vid !== keepId) {
        mesh.removeVertex(vid)
      }
    }

    mesh.recalculateNormals()
    return keepId
  }

  /**
   * Spatial hash grid based O(N) Merge by Distance (Weld).
   */
  static mergeByDistance(mesh: EditableMesh, vertexIds: number[] = [], threshold = 0.005): MergeResult {
    const candidates = vertexIds.length > 0 
      ? vertexIds.map(id => mesh.vertices.get(id)).filter((v): v is MeshVertex => v !== undefined)
      : Array.from(mesh.vertices.values())

    const initialVertCount = mesh.vertices.size
    const initialEdgeCount = mesh.edges.size
    const initialFaceCount = mesh.faces.size

    const cellSize = Math.max(threshold, 0.001)
    const grid = new Map<string, MeshVertex[]>()

    const getKey = (p: THREE.Vector3) => 
      `${Math.floor(p.x / cellSize)},${Math.floor(p.y / cellSize)},${Math.floor(p.z / cellSize)}`

    for (const v of candidates) {
      const key = getKey(v.position)
      const list = grid.get(key) || []
      list.push(v)
      grid.set(key, list)
    }

    const merged = new Set<number>()

    for (const vA of candidates) {
      if (merged.has(vA.id)) continue

      const cx = Math.floor(vA.position.x / cellSize)
      const cy = Math.floor(vA.position.y / cellSize)
      const cz = Math.floor(vA.position.z / cellSize)

      const cluster: number[] = [vA.id]

      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dz = -1; dz <= 1; dz++) {
            const key = `${cx + dx},${cy + dy},${cz + dz}`
            const neighbors = grid.get(key)
            if (!neighbors) continue

            for (const vB of neighbors) {
              if (vB.id === vA.id || merged.has(vB.id)) continue
              if (vA.position.distanceTo(vB.position) <= threshold) {
                cluster.push(vB.id)
                merged.add(vB.id)
              }
            }
          }
        }
      }

      if (cluster.length > 1) {
        this.mergeVertices(mesh, cluster, 'FIRST')
      }
    }

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

    const verts = targetFace.vertexIds
    const idxA = verts.indexOf(vAId)
    const idxB = verts.indexOf(vBId)

    const face1Verts: number[] = []
    let curr = idxA
    while (curr !== idxB) {
      face1Verts.push(verts[curr])
      curr = (curr + 1) % verts.length
    }
    face1Verts.push(vBId)

    const face2Verts: number[] = []
    curr = idxB
    while (curr !== idxA) {
      face2Verts.push(verts[curr])
      curr = (curr + 1) % verts.length
    }
    face2Verts.push(vAId)

    if (face1Verts.length < 3 || face2Verts.length < 3) return false

    const matIdx = targetFace.materialIndex
    const color = targetFace.color

    mesh.removeFace(targetFace.id)
    mesh.addFace(face1Verts, undefined, matIdx, color)
    mesh.addFace(face2Verts, undefined, matIdx, color)
    mesh.getOrCreateEdge(vAId, vBId)
    mesh.recalculateNormals()
    return true
  }

  /**
   * Subdivides a quad face into 4 quads.
   */
  static subdivideQuadFace(mesh: EditableMesh, faceId: number): boolean {
    const face = mesh.faces.get(faceId)
    if (!face || face.vertexIds.length !== 4) return false

    const [v0Id, v1Id, v2Id, v3Id] = face.vertexIds
    const v0 = mesh.vertices.get(v0Id)!
    const v1 = mesh.vertices.get(v1Id)!
    const v2 = mesh.vertices.get(v2Id)!
    const v3 = mesh.vertices.get(v3Id)!

    const mid01 = mesh.addVertex(v0.position.clone().lerp(v1.position, 0.5)).id
    const mid12 = mesh.addVertex(v1.position.clone().lerp(v2.position, 0.5)).id
    const mid23 = mesh.addVertex(v2.position.clone().lerp(v3.position, 0.5)).id
    const mid30 = mesh.addVertex(v3.position.clone().lerp(v0.position, 0.5)).id

    const centerPos = v0.position.clone().add(v1.position).add(v2.position).add(v3.position).multiplyScalar(0.25)
    const centerId = mesh.addVertex(centerPos).id

    const matIdx = face.materialIndex
    const color = face.color

    mesh.removeFace(faceId)

    mesh.addFace([v0Id, mid01, centerId, mid30], undefined, matIdx, color)
    mesh.addFace([mid01, v1Id, mid12, centerId], undefined, matIdx, color)
    mesh.addFace([centerId, mid12, v2Id, mid23], undefined, matIdx, color)
    mesh.addFace([mid30, centerId, mid23, v3Id], undefined, matIdx, color)

    mesh.recalculateNormals()
    return true
  }

  // =========================================================================
  // 5. FILL FACE & BRIDGE EDGES
  // =========================================================================

  /**
   * Creates a new polygon face from a closed boundary loop of vertices.
   */
  static fillBoundary(mesh: EditableMesh, vertexIds: number[]): number | null {
    if (vertexIds.length < 3) return null

    const positions = vertexIds.map(id => mesh.vertices.get(id)?.position).filter(Boolean) as THREE.Vector3[]
    if (positions.length < 3) return null

    const normal = new THREE.Vector3()
    for (let i = 0; i < positions.length; i++) {
      const current = positions[i]
      const next = positions[(i + 1) % positions.length]
      normal.x += (current.y - next.y) * (current.z + next.z)
      normal.y += (current.z - next.z) * (current.x + next.x)
      normal.z += (current.x - next.x) * (current.y + next.y)
    }
    normal.normalize()

    const newFace = mesh.addFace(vertexIds)
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
      const a1 = loopA[i]
      const a2 = loopA[next]
      const b1 = loopB[i]
      const b2 = loopB[next]

      mesh.addFace([a1, a2, b2, b1])
    }

    mesh.recalculateNormals()
    return true
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
