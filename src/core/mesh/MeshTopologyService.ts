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
   * Blender-style Subdivide: split selected edges once (shared verts), then rebuild
   * fully-split tris/quads as a cuts×cuts grid. Neighbor faces that pick up extra
   * edge verts are tessellated back to tris/quads (no T-junctions).
   */
  static subdivideFaces(
    mesh: EditableMesh,
    faceIds: number[],
    options?: { cuts?: number; smoothness?: number; extraEdgeIds?: number[] }
  ): number[] {
    const cuts = Math.max(1, Math.min(10, Math.round(options?.cuts ?? 1)))
    const smoothness = Math.max(0, Math.min(1, options?.smoothness ?? 0))

    const splitEdgeIds = new Set<number>()
    for (const fId of faceIds) {
      const face = mesh.faces.get(fId)
      if (!face) continue
      for (const eId of face.edgeIds) splitEdgeIds.add(eId)
    }
    for (const eId of options?.extraEdgeIds ?? []) {
      if (mesh.edges.has(eId)) splitEdgeIds.add(eId)
    }
    if (splitEdgeIds.size === 0) return []

    const origCentroids = new Map<number, THREE.Vector3>()
    for (const [fId, face] of mesh.faces) {
      const acc = new THREE.Vector3()
      let n = 0
      for (const vId of face.vertexIds) {
        const p = mesh.vertices.get(vId)?.position
        if (!p) continue
        acc.add(p)
        n++
      }
      if (n > 0) origCentroids.set(fId, acc.multiplyScalar(1 / n))
    }

    type FaceSnap = {
      id: number
      vertexIds: number[]
      uvs: THREE.Vector2[]
      materialIndex: number
      color?: string
      edgeIds: number[]
    }
    const affected = new Map<number, FaceSnap>()
    for (const eId of splitEdgeIds) {
      const edge = mesh.edges.get(eId)
      if (!edge) continue
      for (const fId of edge.faceIds) {
        const face = mesh.faces.get(fId)
        if (!face || affected.has(fId)) continue
        affected.set(fId, {
          id: fId,
          vertexIds: [...face.vertexIds],
          uvs: face.uvs.map(uv => uv.clone()),
          materialIndex: face.materialIndex,
          color: face.color,
          edgeIds: [...face.edgeIds]
        })
      }
    }
    if (affected.size === 0) return []

    const selectedSet = new Set(faceIds.filter(id => affected.has(id)))
    const fullySplit = new Set<number>()
    for (const snap of affected.values()) {
      if (snap.vertexIds.length !== 3 && snap.vertexIds.length !== 4) continue
      if (!snap.edgeIds.every(eId => splitEdgeIds.has(eId))) continue
      if (selectedSet.has(snap.id) || snap.edgeIds.every(eId => splitEdgeIds.has(eId))) {
        fullySplit.add(snap.id)
      }
    }
    // Edge-only: a tri/quad whose every original edge is split still gets a grid.
    for (const snap of affected.values()) {
      if ((snap.vertexIds.length === 3 || snap.vertexIds.length === 4) &&
          snap.edgeIds.length === snap.vertexIds.length &&
          snap.edgeIds.every(eId => splitEdgeIds.has(eId))) {
        fullySplit.add(snap.id)
      }
    }

    const edgeKey = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`)
    const midsFromMin = new Map<string, number[]>()

    for (const eId of splitEdgeIds) {
      const edge = mesh.edges.get(eId)
      if (!edge) continue
      const pA = mesh.vertices.get(edge.v1)?.position
      const pB = mesh.vertices.get(edge.v2)?.position
      if (!pA || !pB) continue

      const centroids: THREE.Vector3[] = []
      for (const fId of edge.faceIds) {
        const c = origCentroids.get(fId)
        if (c) centroids.push(c)
      }
      const pull = new THREE.Vector3()
      if (centroids.length > 0) {
        for (const c of centroids) pull.add(c)
        pull.multiplyScalar(1 / centroids.length)
      }
      const edgeMid = pA.clone().lerp(pB, 0.5)

      const mids: number[] = []
      for (let k = 1; k <= cuts; k++) {
        const t = k / (cuts + 1)
        const linear = pA.clone().lerp(pB, t)
        if (smoothness > 0 && centroids.length > 0) {
          const offset = pull.clone().sub(edgeMid).multiplyScalar(0.5)
          const smooth = linear.clone().add(offset)
          linear.lerp(smooth, smoothness)
        }
        mids.push(mesh.addVertex(linear).id)
      }
      midsFromMin.set(edgeKey(edge.v1, edge.v2), mids)
    }

    const midsFromTo = (a: number, b: number): number[] => {
      const mids = midsFromMin.get(edgeKey(a, b))
      if (!mids || mids.length === 0) return []
      return a < b ? [...mids] : [...mids].reverse()
    }

    const expandLoop = (verts: number[], uvs: THREE.Vector2[]) => {
      const outV: number[] = []
      const outUv: THREE.Vector2[] = []
      const n = verts.length
      for (let i = 0; i < n; i++) {
        const a = verts[i]
        const b = verts[(i + 1) % n]
        const uvA = uvs[i]?.clone() ?? new THREE.Vector2()
        const uvB = uvs[(i + 1) % n]?.clone() ?? new THREE.Vector2()
        outV.push(a)
        outUv.push(uvA)
        const mids = midsFromTo(a, b)
        for (let k = 0; k < mids.length; k++) {
          const t = (k + 1) / (mids.length + 1)
          outV.push(mids[k])
          outUv.push(uvA.clone().lerp(uvB, t))
        }
      }
      return { verts: outV, uvs: outUv }
    }

    const pushFace = (
      verts: number[],
      uvs: THREE.Vector2[],
      matIdx: number,
      color: string | undefined,
      into: number[]
    ) => {
      if (verts.length < 3) return
      const f = mesh.addFace(verts, uvs, matIdx, color)
      if (f) into.push(f.id)
    }

    const tessellateNgon = (
      verts: number[],
      uvs: THREE.Vector2[],
      matIdx: number,
      color: string | undefined,
      into: number[]
    ) => {
      const n = verts.length
      if (n < 3) return
      if (n <= 4) {
        pushFace(verts, uvs, matIdx, color, into)
        return
      }
      if (n === 5) {
        let midIdx = -1
        for (let i = 0; i < n; i++) {
          const a = verts[(i - 1 + n) % n]
          const b = verts[i]
          const c = verts[(i + 1) % n]
          if (midsFromMin.has(edgeKey(a, c)) && midsFromTo(a, c).includes(b)) {
            midIdx = i
            break
          }
        }
        if (midIdx === -1) midIdx = 1
        const prev = (midIdx - 1 + n) % n
        const next = (midIdx + 1) % n
        const far1 = (midIdx + 2) % n
        const far2 = (midIdx + 3) % n
        pushFace(
          [verts[prev], verts[midIdx], verts[far2]],
          [uvs[prev], uvs[midIdx], uvs[far2]],
          matIdx,
          color,
          into
        )
        pushFace(
          [verts[midIdx], verts[next], verts[far1], verts[far2]],
          [uvs[midIdx], uvs[next], uvs[far1], uvs[far2]],
          matIdx,
          color,
          into
        )
        return
      }

      const center = new THREE.Vector3()
      const uvC = new THREE.Vector2()
      for (let i = 0; i < n; i++) {
        const p = mesh.vertices.get(verts[i])?.position
        if (p) center.add(p)
        uvC.add(uvs[i] ?? new THREE.Vector2())
      }
      center.multiplyScalar(1 / n)
      uvC.multiplyScalar(1 / n)
      const cId = mesh.addVertex(center).id
      for (let i = 0; i < n; i++) {
        pushFace(
          [verts[i], verts[(i + 1) % n], cId],
          [uvs[i], uvs[(i + 1) % n], uvC.clone()],
          matIdx,
          color,
          into
        )
      }
    }

    const buildQuadGrid = (snap: FaceSnap, into: number[]) => {
      const [v0, v1, v2, v3] = snap.vertexIds
      const p0 = mesh.vertices.get(v0)?.position
      const p1 = mesh.vertices.get(v1)?.position
      const p2 = mesh.vertices.get(v2)?.position
      const p3 = mesh.vertices.get(v3)?.position
      if (!p0 || !p1 || !p2 || !p3) return
      const uv0 = snap.uvs[0]?.clone() ?? new THREE.Vector2()
      const uv1 = snap.uvs[1]?.clone() ?? new THREE.Vector2()
      const uv2 = snap.uvs[2]?.clone() ?? new THREE.Vector2()
      const uv3 = snap.uvs[3]?.clone() ?? new THREE.Vector2()
      const segs = cuts + 1
      const grid: number[][] = Array.from({ length: segs + 1 }, () => Array(segs + 1).fill(0))
      const uvGrid: THREE.Vector2[][] = Array.from({ length: segs + 1 }, () =>
        Array.from({ length: segs + 1 }, () => new THREE.Vector2())
      )

      const bilinear = (s: number, t: number, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => {
        const ab = a.clone().lerp(b, s)
        const dc = d.clone().lerp(c, s)
        return ab.lerp(dc, t)
      }
      const bilinearUv = (s: number, t: number) => {
        const ab = uv0.clone().lerp(uv1, s)
        const dc = uv3.clone().lerp(uv2, s)
        return ab.lerp(dc, t)
      }

      for (let j = 0; j <= segs; j++) {
        for (let i = 0; i <= segs; i++) {
          const s = i / segs
          const t = j / segs
          uvGrid[i][j] = bilinearUv(s, t)
          const onLeft = i === 0
          const onRight = i === segs
          const onBottom = j === 0
          const onTop = j === segs
          if (onBottom && onLeft) grid[i][j] = v0
          else if (onBottom && onRight) grid[i][j] = v1
          else if (onTop && onRight) grid[i][j] = v2
          else if (onTop && onLeft) grid[i][j] = v3
          else if (onBottom) grid[i][j] = midsFromTo(v0, v1)[i - 1]
          else if (onRight) grid[i][j] = midsFromTo(v1, v2)[j - 1]
          else if (onTop) grid[i][j] = midsFromTo(v3, v2)[i - 1]
          else if (onLeft) grid[i][j] = midsFromTo(v0, v3)[j - 1]
          else {
            const pos = bilinear(s, t, p0, p1, p2, p3)
            if (smoothness > 0) {
              const c = p0.clone().add(p1).add(p2).add(p3).multiplyScalar(0.25)
              pos.lerp(c, smoothness * 0.35)
            }
            grid[i][j] = mesh.addVertex(pos).id
          }
        }
      }

      for (let j = 0; j < segs; j++) {
        for (let i = 0; i < segs; i++) {
          pushFace(
            [grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]],
            [uvGrid[i][j], uvGrid[i + 1][j], uvGrid[i + 1][j + 1], uvGrid[i][j + 1]],
            snap.materialIndex,
            snap.color,
            into
          )
        }
      }
    }

    const buildTriGrid = (snap: FaceSnap, into: number[]) => {
      const [v0, v1, v2] = snap.vertexIds
      const p0 = mesh.vertices.get(v0)?.position
      const p1 = mesh.vertices.get(v1)?.position
      const p2 = mesh.vertices.get(v2)?.position
      if (!p0 || !p1 || !p2) return
      const uv0 = snap.uvs[0]?.clone() ?? new THREE.Vector2()
      const uv1 = snap.uvs[1]?.clone() ?? new THREE.Vector2()
      const uv2 = snap.uvs[2]?.clone() ?? new THREE.Vector2()
      const n = cuts + 1
      const idAt = new Map<string, number>()
      const uvAt = new Map<string, THREE.Vector2>()
      const keyOf = (i: number, j: number) => `${i},${j}`

      for (let i = 0; i <= n; i++) {
        for (let j = 0; j <= n - i; j++) {
          const a = (n - i - j) / n
          const b = j / n
          const c = i / n
          const uv = uv0.clone().multiplyScalar(a).add(uv1.clone().multiplyScalar(b)).add(uv2.clone().multiplyScalar(c))
          uvAt.set(keyOf(i, j), uv)
          let id: number
          if (i === 0 && j === 0) id = v0
          else if (i === 0 && j === n) id = v1
          else if (i === n && j === 0) id = v2
          else if (i === 0) id = midsFromTo(v0, v1)[j - 1]
          else if (j === 0) id = midsFromTo(v0, v2)[i - 1]
          else if (i + j === n) id = midsFromTo(v1, v2)[i - 1]
          else {
            const pos = p0.clone().multiplyScalar(a).add(p1.clone().multiplyScalar(b)).add(p2.clone().multiplyScalar(c))
            id = mesh.addVertex(pos).id
          }
          idAt.set(keyOf(i, j), id)
        }
      }

      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n - i; j++) {
          const a = keyOf(i, j)
          const b = keyOf(i, j + 1)
          const c = keyOf(i + 1, j)
          pushFace(
            [idAt.get(a)!, idAt.get(b)!, idAt.get(c)!],
            [uvAt.get(a)!, uvAt.get(b)!, uvAt.get(c)!],
            snap.materialIndex,
            snap.color,
            into
          )
          if (j + 1 <= n - i - 1) {
            const d = keyOf(i + 1, j + 1)
            if (idAt.has(d)) {
              pushFace(
                [idAt.get(b)!, idAt.get(d)!, idAt.get(c)!],
                [uvAt.get(b)!, uvAt.get(d)!, uvAt.get(c)!],
                snap.materialIndex,
                snap.color,
                into
              )
            }
          }
        }
      }
    }

    const primaryIds: number[] = []
    const neighborIds: number[] = []
    for (const snap of affected.values()) mesh.removeFace(snap.id)

    for (const snap of affected.values()) {
      const into = fullySplit.has(snap.id) || selectedSet.has(snap.id) ? primaryIds : neighborIds
      if (fullySplit.has(snap.id) && snap.vertexIds.length === 4) {
        buildQuadGrid(snap, into)
      } else if (fullySplit.has(snap.id) && snap.vertexIds.length === 3) {
        buildTriGrid(snap, into)
      } else {
        const expanded = expandLoop(snap.vertexIds, snap.uvs)
        if (faceIds.length === 0) {
          // Edge splitting inserts shared boundary vertices without adding
          // unrelated face-centre vertices or a triangle fan.
          const face = mesh.addFace(expanded.verts, expanded.uvs, snap.materialIndex, snap.color, snap.id)
          if (face) into.push(face.id)
        } else tessellateNgon(expanded.verts, expanded.uvs, snap.materialIndex, snap.color, into)
      }
    }

    mesh.recalculateNormals()
    return primaryIds.length > 0 ? primaryIds : neighborIds
  }

  /**
   * Subdivides a tri into 4 tris or a quad into 4 quads. Returns new face ids.
   */
  static subdivideFace(
    mesh: EditableMesh,
    faceId: number,
    options?: { cuts?: number; smoothness?: number }
  ): number[] {
    return this.subdivideFaces(mesh, [faceId], options)
  }

  /** Subdivides a quad face into 4 quads. */
  static subdivideQuadFace(mesh: EditableMesh, faceId: number): boolean {
    return this.subdivideFace(mesh, faceId).length === 4
  }

  /** Blender Poke Faces: centroid vertex fanned to every original edge. */
  static pokeFaces(mesh: EditableMesh, faceIds: number[]): number[] {
    const added: number[] = []
    for (const fId of [...faceIds]) {
      const face = mesh.faces.get(fId)
      if (!face || face.vertexIds.length < 3) continue
      const verts = [...face.vertexIds]
      const uvs = face.uvs.map(uv => uv.clone())
      const matIdx = face.materialIndex
      const color = face.color
      const center = new THREE.Vector3()
      const uvC = new THREE.Vector2()
      for (let i = 0; i < verts.length; i++) {
        const p = mesh.vertices.get(verts[i])?.position
        if (p) center.add(p)
        uvC.add(uvs[i] ?? new THREE.Vector2())
      }
      center.multiplyScalar(1 / verts.length)
      uvC.multiplyScalar(1 / verts.length)
      const cId = mesh.addVertex(center).id
      mesh.removeFace(fId)
      for (let i = 0; i < verts.length; i++) {
        const f = mesh.addFace(
          [verts[i], verts[(i + 1) % verts.length], cId],
          [uvs[i], uvs[(i + 1) % verts.length], uvC.clone()],
          matIdx,
          color
        )
        if (f) added.push(f.id)
      }
    }
    mesh.recalculateNormals()
    return added
  }

  /** Split quads into two triangles (shortest diagonal, like Blender). */
  static triangulateFaces(mesh: EditableMesh, faceIds: number[]): number[] {
    const added: number[] = []
    for (const fId of [...faceIds]) {
      const face = mesh.faces.get(fId)
      if (!face || face.vertexIds.length !== 4) {
        if (face) added.push(fId)
        continue
      }
      const [v0, v1, v2, v3] = face.vertexIds
      const [uv0, uv1, uv2, uv3] = face.uvs.map(uv => uv.clone())
      const p0 = mesh.vertices.get(v0)?.position
      const p1 = mesh.vertices.get(v1)?.position
      const p2 = mesh.vertices.get(v2)?.position
      const p3 = mesh.vertices.get(v3)?.position
      if (!p0 || !p1 || !p2 || !p3) continue
      const d02 = p0.distanceToSquared(p2)
      const d13 = p1.distanceToSquared(p3)
      const matIdx = face.materialIndex
      const color = face.color
      mesh.removeFace(fId)
      if (d02 <= d13) {
        const a = mesh.addFace([v0, v1, v2], [uv0, uv1, uv2], matIdx, color)
        const b = mesh.addFace([v0, v2, v3], [uv0, uv2, uv3], matIdx, color)
        if (a) added.push(a.id)
        if (b) added.push(b.id)
      } else {
        const a = mesh.addFace([v0, v1, v3], [uv0, uv1, uv3], matIdx, color)
        const b = mesh.addFace([v1, v2, v3], [uv1, uv2, uv3], matIdx, color)
        if (a) added.push(a.id)
        if (b) added.push(b.id)
      }
    }
    mesh.recalculateNormals()
    return added
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
        mesh.reverseFace(fId)
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
