import * as THREE from 'three'
import { EditableMesh, MeshEdge, MeshFace } from '../MeshKernel'
import { HalfEdgeTopology } from '../HalfEdgeTopology'

export interface InsetOptions {
  thickness: number
  depth?: number
  outset?: boolean
  /** When true, inset each face separately (Blender `I` while modal). */
  individual?: boolean
  /**
   * When true (Blender default), mesh-border edges of the region are inset.
   * When false, those edges rail (Blender `B`).
   */
  boundary?: boolean
}

export interface InsetResult {
  mesh: EditableMesh
  insetFaceIds: number[]
  insetVertexIds: number[]
}

interface VertLoop {
  vertexIds: number[]
  closed: boolean
}

export class InsetKernel {
  static insetFaces(mesh: EditableMesh, faceIds: number[], options: InsetOptions): InsetResult {
    const valid = faceIds.filter(id => mesh.faces.has(id))
    const allInsetFaceIds: number[] = []
    const allInsetVertexIds: number[] = []

    if (valid.length === 0) {
      return { mesh, insetFaceIds: [], insetVertexIds: [] }
    }

    const thickness = Math.max(0, options.thickness)
    const depth = options.depth ?? 0
    const outset = !!options.outset
    const useBoundary = options.boundary !== false

    if (options.individual) {
      for (const fId of valid) {
        const res = this.insetRegion(mesh, [fId], thickness, depth, outset, true)
        allInsetFaceIds.push(...res.insetFaceIds)
        allInsetVertexIds.push(...res.insetVertexIds)
      }
    } else {
      for (const comp of HalfEdgeTopology.connectedFaceComponents(mesh, valid)) {
        const res = this.insetRegion(mesh, comp, thickness, depth, outset, useBoundary)
        allInsetFaceIds.push(...res.insetFaceIds)
        allInsetVertexIds.push(...res.insetVertexIds)
      }
    }

    mesh.recalculateNormals()
    return {
      mesh,
      insetFaceIds: allInsetFaceIds,
      insetVertexIds: allInsetVertexIds
    }
  }

  private static insetRegion(
    mesh: EditableMesh,
    faceIds: number[],
    thickness: number,
    depth: number,
    outset: boolean,
    useBoundary: boolean
  ): InsetResult {
    const sel = new Set(faceIds)
    const regionNormal = HalfEdgeTopology.computeRegionNormal(mesh, faceIds)

    const boundaryEdges: MeshEdge[] = []
    for (const edge of HalfEdgeTopology.findRegionBoundaryEdges(mesh, faceIds)) {
      const isMeshBorder = edge.faceIds.length === 1
      if (!useBoundary && isMeshBorder) continue
      boundaryEdges.push(edge)
    }

    if (boundaryEdges.length === 0) {
      return { mesh, insetFaceIds: [...faceIds], insetVertexIds: [] }
    }

    const loops = this.loopsFromEdges(mesh, boundaryEdges)
    const oldToNew = new Map<number, number>()
    const newVertexIds: number[] = []

    const avgLen = this.averageBoundaryLength(mesh, boundaryEdges)
    const uvPull = avgLen > 1e-6 ? Math.min(0.45, thickness / avgLen) : 0

    for (const loop of loops) {
      this.orientLoop(mesh, loop, regionNormal)
      const n = loop.vertexIds.length
      if (n < 2) continue

      for (let i = 0; i < n; i++) {
        const vid = loop.vertexIds[i]
        if (oldToNew.has(vid)) continue

        const rail = !loop.closed && (i === 0 || i === n - 1)
        if (rail) continue

        const prev = mesh.vertices.get(loop.vertexIds[(i - 1 + n) % n])!.position
        const curr = mesh.vertices.get(vid)!.position
        const next = mesh.vertices.get(loop.vertexIds[(i + 1) % n])!.position
        const nrm = this.vertexRegionNormal(mesh, vid, sel, regionNormal)
        let pos = this.evenOffsetCorner(prev, curr, next, nrm, outset ? -thickness : thickness)
        if (Math.abs(depth) > 1e-8) {
          pos = pos.clone().addScaledVector(nrm, depth)
        }
        const nv = mesh.addVertex(pos)
        oldToNew.set(vid, nv.id)
        newVertexIds.push(nv.id)
      }
    }

    const rimEdges = boundaryEdges.filter(e => oldToNew.has(e.v1) || oldToNew.has(e.v2))
    for (const edge of rimEdges) {
      const vA_old = edge.v1
      const vB_old = edge.v2
      const vA_new = oldToNew.get(vA_old) ?? vA_old
      const vB_new = oldToNew.get(vB_old) ?? vB_old
      if (vA_new === vA_old && vB_new === vB_old) continue

      let selFaceId = edge.faceIds.find(fid => sel.has(fid))
      const selFace = selFaceId != null ? mesh.faces.get(selFaceId) : null
      let forward = true
      let uvA = new THREE.Vector2(0, 0)
      let uvB = new THREE.Vector2(1, 0)
      if (selFace) {
        const idxA = selFace.vertexIds.indexOf(vA_old)
        const idxB = selFace.vertexIds.indexOf(vB_old)
        const fn = selFace.vertexIds.length
        if (idxA !== -1 && idxB !== -1) {
          forward = (idxA + 1) % fn === idxB
          uvA = (selFace.uvs[idxA] || uvA).clone()
          uvB = (selFace.uvs[idxB] || uvB).clone()
        }
      }
      const uvAIn = uvA.clone().lerp(this.uvCentroid(selFace), uvPull)
      const uvBIn = uvB.clone().lerp(this.uvCentroid(selFace), uvPull)

      if (forward) {
        mesh.addFace(
          [vA_old, vB_old, vB_new, vA_new],
          [uvA, uvB, uvBIn, uvAIn],
          selFace?.materialIndex ?? 0,
          selFace?.color
        )
      } else {
        mesh.addFace(
          [vB_old, vA_old, vA_new, vB_new],
          [uvB, uvA, uvAIn, uvBIn],
          selFace?.materialIndex ?? 0,
          selFace?.color
        )
      }
    }

    const insetFaceIds: number[] = []
    for (const fId of faceIds) {
      const face = mesh.faces.get(fId)
      if (!face) continue
      const newFaceVerts = face.vertexIds.map(id => oldToNew.get(id) ?? id)
      const changed = newFaceVerts.some((id, i) => id !== face.vertexIds[i])
      if (!changed) {
        insetFaceIds.push(fId)
        continue
      }
      const uvC = this.uvCentroid(face)
      const uvs = face.uvs.map((uv, i) => {
        const pulled = uv.clone().lerp(uvC, uvPull)
        return oldToNew.has(face.vertexIds[i]) ? pulled : uv.clone()
      })
      const matIdx = face.materialIndex
      const color = face.color
      mesh.removeFace(fId)
      const cap = mesh.addFace(newFaceVerts, uvs, matIdx, color, fId)
      if (cap) insetFaceIds.push(cap.id)
    }

    return { mesh, insetFaceIds, insetVertexIds: newVertexIds }
  }

  private static uvCentroid(face: MeshFace | null | undefined): THREE.Vector2 {
    const c = new THREE.Vector2()
    if (!face || face.uvs.length === 0) return c
    for (const uv of face.uvs) c.add(uv)
    return c.multiplyScalar(1 / face.uvs.length)
  }

  private static averageBoundaryLength(mesh: EditableMesh, edges: MeshEdge[]): number {
    if (edges.length === 0) return 0
    let sum = 0
    for (const e of edges) {
      const a = mesh.vertices.get(e.v1)?.position
      const b = mesh.vertices.get(e.v2)?.position
      if (a && b) sum += a.distanceTo(b)
    }
    return sum / edges.length
  }

  private static vertexRegionNormal(
    mesh: EditableMesh,
    vertId: number,
    sel: Set<number>,
    fallback: THREE.Vector3
  ): THREE.Vector3 {
    const n = new THREE.Vector3()
    const v = mesh.vertices.get(vertId)
    if (!v) return fallback.clone()
    for (const fId of v.faceIds) {
      if (!sel.has(fId)) continue
      const f = mesh.faces.get(fId)
      if (f) n.add(f.normal)
    }
    if (n.lengthSq() < 1e-10) return fallback.clone()
    return n.normalize()
  }

  /** Even-thickness corner: intersect inward-offset adjacent boundary edges. */
  private static evenOffsetCorner(
    prev: THREE.Vector3,
    curr: THREE.Vector3,
    next: THREE.Vector3,
    normal: THREE.Vector3,
    thickness: number
  ): THREE.Vector3 {
    const e0 = prev.clone().sub(curr)
    e0.addScaledVector(normal, -e0.dot(normal))
    const e1 = next.clone().sub(curr)
    e1.addScaledVector(normal, -e1.dot(normal))
    if (e0.lengthSq() < 1e-12 || e1.lengthSq() < 1e-12) {
      return curr.clone()
    }
    const dirIn = curr.clone().sub(prev)
    dirIn.addScaledVector(normal, -dirIn.dot(normal))
    const dirOut = next.clone().sub(curr)
    dirOut.addScaledVector(normal, -dirOut.dot(normal))
    if (dirIn.lengthSq() < 1e-12 || dirOut.lengthSq() < 1e-12) return curr.clone()
    dirIn.normalize()
    dirOut.normalize()

    const inward0 = new THREE.Vector3().crossVectors(normal, dirIn).normalize()
    const inward1 = new THREE.Vector3().crossVectors(normal, dirOut).normalize()
    const p0 = curr.clone().addScaledVector(inward0, thickness)
    const p1 = curr.clone().addScaledVector(inward1, thickness)
    const hit = this.intersectLines(p0, dirIn, p1, dirOut)
    const inwardMean = inward0.clone().add(inward1)
    if (hit) {
      const fromCurr = hit.clone().sub(curr)
      if (inwardMean.lengthSq() < 1e-10 || fromCurr.dot(inwardMean) >= 0) {
        return hit
      }
    }

    if (inwardMean.lengthSq() < 1e-10) {
      return curr.clone().addScaledVector(inward0, thickness)
    }
    inwardMean.normalize()
    const c = Math.max(0.08, Math.abs(inward0.dot(inwardMean)))
    return curr.clone().addScaledVector(inwardMean, thickness / c)
  }

  private static intersectLines(
    p0: THREE.Vector3,
    d0: THREE.Vector3,
    p1: THREE.Vector3,
    d1: THREE.Vector3
  ): THREE.Vector3 | null {
    const u = d0.clone()
    if (u.lengthSq() < 1e-14) return null
    u.normalize()
    const n = new THREE.Vector3().crossVectors(d0, d1)
    if (n.lengthSq() < 1e-14) return null
    n.normalize()
    const v = new THREE.Vector3().crossVectors(n, u).normalize()
    const aDir = new THREE.Vector2(d0.dot(u), d0.dot(v))
    const rel = p1.clone().sub(p0)
    const b0 = new THREE.Vector2(rel.dot(u), rel.dot(v))
    const bDir = new THREE.Vector2(d1.dot(u), d1.dot(v))
    const det = aDir.x * bDir.y - aDir.y * bDir.x
    if (Math.abs(det) < 1e-8) return null
    const t = (b0.x * bDir.y - b0.y * bDir.x) / det
    return p0.clone().addScaledVector(d0, t)
  }

  private static orientLoop(mesh: EditableMesh, loop: VertLoop, regionNormal: THREE.Vector3) {
    const ids = loop.vertexIds
    const n = ids.length
    if (n < 3) return
    let area = 0
    const origin = mesh.vertices.get(ids[0])!.position
    for (let i = 1; i < n - 1; i++) {
      const a = mesh.vertices.get(ids[i])!.position.clone().sub(origin)
      const b = mesh.vertices.get(ids[i + 1])!.position.clone().sub(origin)
      area += new THREE.Vector3().crossVectors(a, b).dot(regionNormal)
    }
    if (area < 0) ids.reverse()
  }

  private static loopsFromEdges(mesh: EditableMesh, edges: MeshEdge[]): VertLoop[] {
    const edgeSet = new Set(edges.map(e => e.id))
    const loops: VertLoop[] = []

    while (edgeSet.size > 0) {
      const firstEdgeId = edgeSet.values().next().value!
      edgeSet.delete(firstEdgeId)
      const firstEdge = mesh.edges.get(firstEdgeId)!
      const loopVertexIds = [firstEdge.v1, firstEdge.v2]
      let currentVert = firstEdge.v2
      let closed = false

      while (!closed && edgeSet.size > 0) {
        let found = false
        for (const candidateId of Array.from(edgeSet)) {
          const candidate = mesh.edges.get(candidateId)!
          if (candidate.v1 === currentVert) {
            loopVertexIds.push(candidate.v2)
            currentVert = candidate.v2
            edgeSet.delete(candidateId)
            found = true
            break
          }
          if (candidate.v2 === currentVert) {
            loopVertexIds.push(candidate.v1)
            currentVert = candidate.v1
            edgeSet.delete(candidateId)
            found = true
            break
          }
        }
        if (!found) break
        if (currentVert === loopVertexIds[0]) closed = true
      }

      if (loopVertexIds.length > 1 && loopVertexIds[loopVertexIds.length - 1] === loopVertexIds[0]) {
        loopVertexIds.pop()
        closed = true
      } else {
        closed = currentVert === loopVertexIds[0]
      }

      loops.push({ vertexIds: loopVertexIds, closed })
    }

    return loops
  }
}
