import * as THREE from 'three'
import { polygonAreaVector, polygonPlanarity } from '../geometry/PolygonGeometry'

export interface MeshVertex {
  id: number
  documentId?: string
  color?: string
  boneWeights?: Record<string, number>
  position: THREE.Vector3
  edgeIds: number[]
  faceIds: number[]
}

export interface MeshEdge {
  id: number
  seam?: boolean
  sharp?: boolean
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
  documentId?: string
  vertexIds: number[]
  edgeIds: number[]
  halfEdgeIds: number[]
  normal: THREE.Vector3
  uvs: THREE.Vector2[]
  materialIndex: number
  color?: string
}

export interface MeshSnapshot {
  vertices: { id: number; documentId?: string; color?: string; boneWeights?: Record<string, number>; position: { x: number; y: number; z: number }; edgeIds: number[]; faceIds: number[] }[]
  edges: { id: number; seam?: boolean; sharp?: boolean; v1: number; v2: number; halfEdgeIds: number[]; faceIds: number[] }[]
  halfEdges: { id: number; vertexId: number; faceId: number; nextId: number; prevId: number; twinId: number | null; edgeId: number }[]
  faces: { id: number; documentId?: string; vertexIds: number[]; edgeIds: number[]; halfEdgeIds: number[]; normal: { x: number; y: number; z: number }; uvs: { x: number; y: number }[]; materialIndex: number; color?: string }[]
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
  private edgeByVertices = new Map<string, number>()

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
    if (this.vertices.has(id)) throw new Error(`Vertex ${id} already exists`)
    if (![pos.x, pos.y, pos.z].every(Number.isFinite)) throw new Error('Vertex position must be finite')
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

  getOrCreateEdge(v1: number, v2: number, customId?: number): MeshEdge {
    if (v1 === v2 || !this.vertices.has(v1) || !this.vertices.has(v2)) throw new Error('An edge needs two existing, distinct vertices')
    const minV = Math.min(v1, v2)
    const maxV = Math.max(v1, v2)

    const key = `${minV},${maxV}`
    const existingId = this.edgeByVertices.get(key)
    if (existingId !== undefined) return this.edges.get(existingId)!

    const id = customId ?? this.allocEdgeId()
    if (this.edges.has(id)) throw new Error(`Edge ${id} already exists`)
    if (id >= this.nextEdgeId) this.nextEdgeId = id + 1
    const edge: MeshEdge = {
      id,
      v1: minV,
      v2: maxV,
      halfEdgeIds: [],
      faceIds: []
    }
    this.edges.set(id, edge)
    this.edgeByVertices.set(key, id)

    const vert1 = this.vertices.get(v1)
    const vert2 = this.vertices.get(v2)
    if (vert1 && !vert1.edgeIds.includes(id)) vert1.edgeIds.push(id)
    if (vert2 && !vert2.edgeIds.includes(id)) vert2.edgeIds.push(id)

    return edge
  }

  removeEdge(id: number) {
    const e = this.edges.get(id)
    if (!e) return

    // Deleting an edge also deletes its incident faces, never just their loops.
    for (const faceId of [...e.faceIds]) this.removeFace(faceId)

    const v1 = this.vertices.get(e.v1)
    const v2 = this.vertices.get(e.v2)
    if (v1) v1.edgeIds = v1.edgeIds.filter(eid => eid !== id)
    if (v2) v2.edgeIds = v2.edgeIds.filter(eid => eid !== id)

    for (const heId of e.halfEdgeIds) {
      this.halfEdges.delete(heId)
    }

    this.edges.delete(id)
    this.edgeByVertices.delete(`${e.v1},${e.v2}`)
  }

  addFace(vertexIds: number[], uvs?: THREE.Vector2[], materialIndex = 0, color?: string, customId?: number): MeshFace | null {
    if (vertexIds.length < 3 || new Set(vertexIds).size !== vertexIds.length) return null
    if (customId !== undefined && this.faces.has(customId)) return null
    if (uvs && (uvs.length !== vertexIds.length || uvs.some(uv => !Number.isFinite(uv.x) || !Number.isFinite(uv.y)))) return null

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
    const normal = polygonAreaVector(vertexIds.map(id => this.vertices.get(id)!.position)).normalize()

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

  /** Replace a polygon while retaining surviving edge identities and flags. */
  replaceFace(id: number, vertexIds: number[], uvs: THREE.Vector2[], materialIndex?: number, color?: string): MeshFace | null {
    const old = this.faces.get(id)
    if (!old || vertexIds.length < 3 || new Set(vertexIds).size !== vertexIds.length ||
        vertexIds.some(v => !this.vertices.has(v)) || uvs.length !== vertexIds.length ||
        uvs.some(uv => !Number.isFinite(uv.x) || !Number.isFinite(uv.y))) return null
    this.removeFace(id, true)
    const face = this.addFace(vertexIds, uvs, materialIndex ?? old.materialIndex, color ?? old.color, id)!
    face.documentId = old.documentId
    for (const edgeId of old.edgeIds) {
      if (this.edges.get(edgeId)?.faceIds.length === 0) this.removeEdge(edgeId)
    }
    return face
  }

  removeFace(id: number, preserveEdges = false) {
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
          if (edge.faceIds.length === 0 && !preserveEdges) {
            this.removeEdge(edge.id)
          }
        }
        this.halfEdges.delete(heId)
      }
    }

    this.faces.delete(id)
    this.updateTwinsForEdges(f.edgeIds)
  }

  private updateTwinsForEdges(edgeIds: number[]) {
    for (const eId of edgeIds) {
      const edge = this.edges.get(eId)
      if (!edge) continue
      for (const id of edge.halfEdgeIds) this.halfEdges.get(id)!.twinId = null
      // A non-manifold fan has no unique twin. Keep radial incidence on the edge.
      if (edge.halfEdgeIds.length !== 2) continue
      const [a, b] = edge.halfEdgeIds.map(id => this.halfEdges.get(id)!)
      if (a.vertexId === this.halfEdges.get(b.nextId)?.vertexId &&
          b.vertexId === this.halfEdges.get(a.nextId)?.vertexId) {
        a.twinId = b.id
        b.twinId = a.id
      }
    }
  }

  recalculateNormals() {
    for (const face of this.faces.values()) {
      const points = face.vertexIds.map(id => this.vertices.get(id)?.position)
      if (points.every((p): p is THREE.Vector3 => !!p)) face.normal.copy(polygonAreaVector(points).normalize())
    }
  }

  getFacePlanarity(faceId: number) {
    const face = this.faces.get(faceId)
    if (!face) throw new Error(`Unknown face ${faceId}`)
    return polygonPlanarity(face.vertexIds.map(id => this.vertices.get(id)!.position))
  }

  /** Reverse the loop in place, preserving edge, face and corner identities. */
  reverseFace(faceId: number) {
    const face = this.faces.get(faceId)
    if (!face) return
    const oldEdges = [...face.edgeIds]
    face.vertexIds.reverse()
    face.uvs.reverse()
    face.halfEdgeIds.reverse()
    const n = face.vertexIds.length
    face.edgeIds = face.vertexIds.map((_, i) => oldEdges[(n - 2 - i + n) % n])
    for (const edgeId of oldEdges) {
      const edge = this.edges.get(edgeId)!
      edge.halfEdgeIds = edge.halfEdgeIds.filter(id => this.halfEdges.get(id)?.faceId !== faceId)
    }
    for (let i = 0; i < n; i++) {
      const he = this.halfEdges.get(face.halfEdgeIds[i])!
      he.nextId = face.halfEdgeIds[(i + 1) % n]
      he.prevId = face.halfEdgeIds[(i + n - 1) % n]
      he.edgeId = face.edgeIds[i]
      this.edges.get(he.edgeId)!.halfEdgeIds.push(he.id)
    }
    this.updateTwinsForEdges(oldEdges)
    face.normal.negate()
  }

  // ----------------------------------------------------
  // Snapshot & Rollback System (Transactional Undo)
  // ----------------------------------------------------
  createSnapshot(): MeshSnapshot {
    return {
      vertices: Array.from(this.vertices.values()).map(v => ({
        id: v.id,
        documentId: v.documentId,
        color: v.color,
        boneWeights: v.boneWeights ? { ...v.boneWeights } : undefined,
        position: { x: v.position.x, y: v.position.y, z: v.position.z },
        edgeIds: [...v.edgeIds],
        faceIds: [...v.faceIds]
      })),
      edges: Array.from(this.edges.values()).map(e => ({
        id: e.id,
        seam: e.seam,
        sharp: e.sharp,
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
        documentId: f.documentId,
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
    this.edgeByVertices.clear()
    this.halfEdges.clear()
    this.faces.clear()

    for (const sv of snapshot.vertices) {
      this.vertices.set(sv.id, {
        id: sv.id,
        documentId: sv.documentId,
        color: sv.color,
        boneWeights: sv.boneWeights ? { ...sv.boneWeights } : undefined,
        position: new THREE.Vector3(sv.position.x, sv.position.y, sv.position.z),
        edgeIds: [...sv.edgeIds],
        faceIds: [...sv.faceIds]
      })
    }

    for (const se of snapshot.edges) {
      this.edgeByVertices.set(`${Math.min(se.v1, se.v2)},${Math.max(se.v1, se.v2)}`, se.id)
      this.edges.set(se.id, {
        id: se.id,
        seam: se.seam,
        sharp: se.sharp,
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
        documentId: sf.documentId,
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
