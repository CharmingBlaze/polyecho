import * as THREE from 'three'

export interface MeshVertex {
  id: number
  position: THREE.Vector3
  edgeIds: number[]
  faceIds: number[]
}

export interface MeshEdge {
  id: number
  v1: number
  v2: number
  halfEdgeIds: number[]
  faceIds: number[]
}

export interface MeshHalfEdge {
  id: number
  vertexId: number      // Origin vertex
  faceId: number        // Adjacent face
  nextId: number        // Next half-edge in face loop
  prevId: number        // Previous half-edge in face loop
  twinId: number | null // Opposite half-edge on neighboring face
  edgeId: number        // Parent edge
}

export interface MeshFace {
  id: number
  vertexIds: number[]
  edgeIds: number[]
  halfEdgeIds: number[]
  normal: THREE.Vector3
  uvs: THREE.Vector2[]
  materialIndex: number
  color?: string
}

export interface MeshSnapshot {
  vertices: { id: number; position: { x: number; y: number; z: number }; edgeIds: number[]; faceIds: number[] }[]
  edges: { id: number; v1: number; v2: number; halfEdgeIds: number[]; faceIds: number[] }[]
  halfEdges: { id: number; vertexId: number; faceId: number; nextId: number; prevId: number; twinId: number | null; edgeId: number }[]
  faces: { id: number; vertexIds: number[]; edgeIds: number[]; halfEdgeIds: number[]; normal: { x: number; y: number; z: number }; uvs: { x: number; y: number }[]; materialIndex: number; color?: string }[]
  nextVertexId: number
  nextEdgeId: number
  nextHalfEdgeId: number
  nextFaceId: number
}

export class EditableMesh {
  vertices = new Map<number, MeshVertex>()
  edges = new Map<number, MeshEdge>()
  halfEdges = new Map<number, MeshHalfEdge>()
  faces = new Map<number, MeshFace>()

  private nextVertexId = 1
  private nextEdgeId = 1
  private nextHalfEdgeId = 1
  private nextFaceId = 1

  // Stable ID generators
  allocVertexId(): number { return this.nextVertexId++ }
  allocEdgeId(): number { return this.nextEdgeId++ }
  allocHalfEdgeId(): number { return this.nextHalfEdgeId++ }
  allocFaceId(): number { return this.nextFaceId++ }

  // ----------------------------------------------------
  // Primitive Vertex/Edge/Face Management
  // ----------------------------------------------------
  addVertex(pos: THREE.Vector3, customId?: number): MeshVertex {
    const id = customId !== undefined ? customId : this.allocVertexId()
    if (id >= this.nextVertexId) this.nextVertexId = id + 1

    const v: MeshVertex = {
      id,
      position: pos.clone(),
      edgeIds: [],
      faceIds: []
    }
    this.vertices.set(id, v)
    return v
  }

  removeVertex(id: number) {
    const v = this.vertices.get(id)
    if (!v) return

    // Remove connected faces
    const fIds = [...v.faceIds]
    for (const fId of fIds) {
      this.removeFace(fId)
    }

    // Remove connected edges
    const eIds = [...v.edgeIds]
    for (const eId of eIds) {
      this.removeEdge(eId)
    }

    this.vertices.delete(id)
  }

  getOrCreateEdge(v1: number, v2: number): MeshEdge {
    const minV = Math.min(v1, v2)
    const maxV = Math.max(v1, v2)

    for (const e of this.edges.values()) {
      if (e.v1 === minV && e.v2 === maxV) {
        return e
      }
    }

    const id = this.allocEdgeId()
    const edge: MeshEdge = {
      id,
      v1: minV,
      v2: maxV,
      halfEdgeIds: [],
      faceIds: []
    }
    this.edges.set(id, edge)

    const vert1 = this.vertices.get(v1)
    const vert2 = this.vertices.get(v2)
    if (vert1 && !vert1.edgeIds.includes(id)) vert1.edgeIds.push(id)
    if (vert2 && !vert2.edgeIds.includes(id)) vert2.edgeIds.push(id)

    return edge
  }

  removeEdge(id: number) {
    const e = this.edges.get(id)
    if (!e) return

    const v1 = this.vertices.get(e.v1)
    const v2 = this.vertices.get(e.v2)
    if (v1) v1.edgeIds = v1.edgeIds.filter(eid => eid !== id)
    if (v2) v2.edgeIds = v2.edgeIds.filter(eid => eid !== id)

    for (const heId of e.halfEdgeIds) {
      this.halfEdges.delete(heId)
    }

    this.edges.delete(id)
  }

  addFace(vertexIds: number[], uvs?: THREE.Vector2[], materialIndex = 0, color?: string, customId?: number): MeshFace | null {
    if (vertexIds.length < 3) return null

    // Validate vertex existence
    for (const vid of vertexIds) {
      if (!this.vertices.has(vid)) return null
    }

    const faceId = customId !== undefined ? customId : this.allocFaceId()
    if (faceId >= this.nextFaceId) this.nextFaceId = faceId + 1

    const edgeIds: number[] = []
    const halfEdgeIds: number[] = []

    // Allocate half edges for the face loop
    const n = vertexIds.length
    for (let i = 0; i < n; i++) {
      const vFrom = vertexIds[i]
      const vTo = vertexIds[(i + 1) % n]
      const edge = this.getOrCreateEdge(vFrom, vTo)
      if (!edgeIds.includes(edge.id)) edgeIds.push(edge.id)
      if (!edge.faceIds.includes(faceId)) edge.faceIds.push(faceId)

      const heId = this.allocHalfEdgeId()
      halfEdgeIds.push(heId)

      const he: MeshHalfEdge = {
        id: heId,
        vertexId: vFrom,
        faceId,
        nextId: 0,
        prevId: 0,
        twinId: null,
        edgeId: edge.id
      }
      this.halfEdges.set(heId, he)
      edge.halfEdgeIds.push(heId)
    }

    // Link next and prev in loop
    for (let i = 0; i < n; i++) {
      const he = this.halfEdges.get(halfEdgeIds[i])!
      he.nextId = halfEdgeIds[(i + 1) % n]
      he.prevId = halfEdgeIds[(i - 1 + n) % n]
    }

    // Register face with vertices
    for (const vid of vertexIds) {
      const v = this.vertices.get(vid)
      if (v && !v.faceIds.includes(faceId)) {
        v.faceIds.push(faceId)
      }
    }

    // Calculate initial face normal
    const v0 = this.vertices.get(vertexIds[0])!.position
    const v1 = this.vertices.get(vertexIds[1])!.position
    const v2 = this.vertices.get(vertexIds[2])!.position
    const normal = new THREE.Vector3()
      .crossVectors(v1.clone().sub(v0), v2.clone().sub(v0))
      .normalize()

    const defaultUvs = uvs || vertexIds.map((_, idx) => new THREE.Vector2(idx === 1 || idx === 2 ? 1 : 0, idx >= 2 ? 1 : 0))

    const face: MeshFace = {
      id: faceId,
      vertexIds: [...vertexIds],
      edgeIds,
      halfEdgeIds,
      normal,
      uvs: defaultUvs.map(u => u.clone()),
      materialIndex,
      color
    }

    this.faces.set(faceId, face)

    // Rebuild twins for this face's edges
    this.updateTwinsForEdges(edgeIds)

    return face
  }

  removeFace(id: number) {
    const f = this.faces.get(id)
    if (!f) return

    for (const vid of f.vertexIds) {
      const v = this.vertices.get(vid)
      if (v) v.faceIds = v.faceIds.filter(fid => fid !== id)
    }

    for (const heId of f.halfEdgeIds) {
      const he = this.halfEdges.get(heId)
      if (he) {
        if (he.twinId !== null) {
          const twin = this.halfEdges.get(he.twinId)
          if (twin) twin.twinId = null
        }
        const edge = this.edges.get(he.edgeId)
        if (edge) {
          edge.halfEdgeIds = edge.halfEdgeIds.filter(hid => hid !== heId)
          edge.faceIds = edge.faceIds.filter(fid => fid !== id)
          if (edge.faceIds.length === 0) {
            this.removeEdge(edge.id)
          }
        }
        this.halfEdges.delete(heId)
      }
    }

    this.faces.delete(id)
  }

  private updateTwinsForEdges(edgeIds: number[]) {
    for (const eId of edgeIds) {
      const edge = this.edges.get(eId)
      if (!edge || edge.halfEdgeIds.length < 2) continue

      const [he1Id, he2Id] = edge.halfEdgeIds
      const he1 = this.halfEdges.get(he1Id)
      const he2 = this.halfEdges.get(he2Id)
      if (he1 && he2) {
        he1.twinId = he2Id
        he2.twinId = he1Id
      }
    }
  }

  recalculateNormals() {
    for (const face of this.faces.values()) {
      if (face.vertexIds.length < 3) continue
      const v0 = this.vertices.get(face.vertexIds[0])?.position
      const v1 = this.vertices.get(face.vertexIds[1])?.position
      const v2 = this.vertices.get(face.vertexIds[2])?.position
      if (v0 && v1 && v2) {
        face.normal.crossVectors(v1.clone().sub(v0), v2.clone().sub(v0)).normalize()
      }
    }
  }

  // ----------------------------------------------------
  // Snapshot & Rollback System (Transactional Undo)
  // ----------------------------------------------------
  createSnapshot(): MeshSnapshot {
    return {
      vertices: Array.from(this.vertices.values()).map(v => ({
        id: v.id,
        position: { x: v.position.x, y: v.position.y, z: v.position.z },
        edgeIds: [...v.edgeIds],
        faceIds: [...v.faceIds]
      })),
      edges: Array.from(this.edges.values()).map(e => ({
        id: e.id,
        v1: e.v1,
        v2: e.v2,
        halfEdgeIds: [...e.halfEdgeIds],
        faceIds: [...e.faceIds]
      })),
      halfEdges: Array.from(this.halfEdges.values()).map(h => ({
        id: h.id,
        vertexId: h.vertexId,
        faceId: h.faceId,
        nextId: h.nextId,
        prevId: h.prevId,
        twinId: h.twinId,
        edgeId: h.edgeId
      })),
      faces: Array.from(this.faces.values()).map(f => ({
        id: f.id,
        vertexIds: [...f.vertexIds],
        edgeIds: [...f.edgeIds],
        halfEdgeIds: [...f.halfEdgeIds],
        normal: { x: f.normal.x, y: f.normal.y, z: f.normal.z },
        uvs: f.uvs.map(u => ({ x: u.x, y: u.y })),
        materialIndex: f.materialIndex,
        color: f.color
      })),
      nextVertexId: this.nextVertexId,
      nextEdgeId: this.nextEdgeId,
      nextHalfEdgeId: this.nextHalfEdgeId,
      nextFaceId: this.nextFaceId
    }
  }

  restoreSnapshot(snapshot: MeshSnapshot) {
    this.vertices.clear()
    this.edges.clear()
    this.halfEdges.clear()
    this.faces.clear()

    for (const sv of snapshot.vertices) {
      this.vertices.set(sv.id, {
        id: sv.id,
        position: new THREE.Vector3(sv.position.x, sv.position.y, sv.position.z),
        edgeIds: [...sv.edgeIds],
        faceIds: [...sv.faceIds]
      })
    }

    for (const se of snapshot.edges) {
      this.edges.set(se.id, {
        id: se.id,
        v1: se.v1,
        v2: se.v2,
        halfEdgeIds: [...se.halfEdgeIds],
        faceIds: [...se.faceIds]
      })
    }

    for (const sh of snapshot.halfEdges) {
      this.halfEdges.set(sh.id, {
        id: sh.id,
        vertexId: sh.vertexId,
        faceId: sh.faceId,
        nextId: sh.nextId,
        prevId: sh.prevId,
        twinId: sh.twinId,
        edgeId: sh.edgeId
      })
    }

    for (const sf of snapshot.faces) {
      this.faces.set(sf.id, {
        id: sf.id,
        vertexIds: [...sf.vertexIds],
        edgeIds: [...sf.edgeIds],
        halfEdgeIds: [...sf.halfEdgeIds],
        normal: new THREE.Vector3(sf.normal.x, sf.normal.y, sf.normal.z),
        uvs: sf.uvs.map(u => new THREE.Vector2(u.x, u.y)),
        materialIndex: sf.materialIndex,
        color: sf.color
      })
    }

    this.nextVertexId = snapshot.nextVertexId
    this.nextEdgeId = snapshot.nextEdgeId
    this.nextHalfEdgeId = snapshot.nextHalfEdgeId
    this.nextFaceId = snapshot.nextFaceId
  }

  clone(): EditableMesh {
    const copy = new EditableMesh()
    copy.restoreSnapshot(this.createSnapshot())
    return copy
  }
}
