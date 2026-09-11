import * as THREE from 'three'
import { EditableMesh } from '../MeshKernel'
import { MeshTopologyService } from '../MeshTopologyService'

export type DrawViewKind = 'persp' | 'top' | 'front' | 'right'

export interface DrawPlane {
  origin: THREE.Vector3
  normal: THREE.Vector3
  axisU: THREE.Vector3
  axisV: THREE.Vector3
}

export class PolyDrawKernel {
  static planeForView(kind: DrawViewKind, origin?: THREE.Vector3): DrawPlane {
    let plane: DrawPlane
    if (kind === 'right') {
      plane = {
        origin: new THREE.Vector3(0, 0, 0),
        normal: new THREE.Vector3(1, 0, 0),
        axisU: new THREE.Vector3(0, 0, 1),
        axisV: new THREE.Vector3(0, 1, 0)
      }
    } else if (kind === 'top') {
      plane = {
        origin: new THREE.Vector3(0, 0, 0),
        normal: new THREE.Vector3(0, 1, 0),
        axisU: new THREE.Vector3(1, 0, 0),
        axisV: new THREE.Vector3(0, 0, -1)
      }
    } else {
      plane = {
        origin: new THREE.Vector3(0, 0, 0),
        normal: new THREE.Vector3(0, 0, 1),
        axisU: new THREE.Vector3(1, 0, 0),
        axisV: new THREE.Vector3(0, 1, 0)
      }
    }
    if (origin) plane.origin.copy(origin)
    return plane
  }

  /** Billboard through `origin`, facing the camera — the 3D sketch plane. */
  static viewPlane(camera: THREE.Camera, origin: THREE.Vector3): DrawPlane {
    const n = new THREE.Vector3()
    camera.getWorldDirection(n)
    if (n.lengthSq() < 1e-10) n.set(0, 0, 1)
    else n.normalize()
    return this.planeFromHit(origin, n.clone().negate())
  }

  static rebaseOrigin(plane: DrawPlane, origin: THREE.Vector3): DrawPlane {
    return {
      origin: origin.clone(),
      normal: plane.normal.clone(),
      axisU: plane.axisU.clone(),
      axisV: plane.axisV.clone()
    }
  }

  static normalTowardViewer(normal: THREE.Vector3, viewDir: THREE.Vector3): THREE.Vector3 {
    const n = normal.clone()
    if (n.lengthSq() < 1e-10) n.set(0, 1, 0)
    else n.normalize()
    if (n.dot(viewDir) > 0) n.negate()
    return n
  }

  /** Camera-space points in front of a persp/ortho camera have z < 0. */
  static isInFrontOfCamera(world: THREE.Vector3, camera: THREE.Camera): boolean {
    const z = world.clone().applyMatrix4(camera.matrixWorldInverse).z
    return z < -1e-4
  }

  static planeFromHit(point: THREE.Vector3, normal: THREE.Vector3): DrawPlane {
    const n = normal.clone()
    if (n.lengthSq() < 1e-10) n.set(0, 1, 0)
    else n.normalize()
    const up = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
    const axisU = up.clone().cross(n)
    if (axisU.lengthSq() < 1e-10) axisU.set(1, 0, 0)
    else axisU.normalize()
    const axisV = n.clone().cross(axisU).normalize()
    return { origin: point.clone(), normal: n, axisU, axisV }
  }

  static intersectPlane(ray: THREE.Ray, plane: DrawPlane): THREE.Vector3 | null {
    const denom = ray.direction.dot(plane.normal)
    if (Math.abs(denom) < 1e-8) return null
    const t = plane.origin.clone().sub(ray.origin).dot(plane.normal) / denom
    if (!isFinite(t) || t < 1e-4) return null
    return ray.origin.clone().addScaledVector(ray.direction, t)
  }

  /** True when the hit is grazing or flies off to infinity (horizon ground). */
  static isUnreliableHit(ray: THREE.Ray, plane: DrawPlane, camera: THREE.Camera): boolean {
    const hit = this.intersectPlane(ray, plane)
    if (!hit) return true
    const focus = Math.max(1, camera.position.distanceTo(plane.origin))
    return hit.distanceTo(ray.origin) > Math.max(48, focus * 8)
  }

  static snapOnPlane(point: THREE.Vector3, plane: DrawPlane, gridSize: number): THREE.Vector3 {
    const rel = point.clone().sub(plane.origin)
    const u = rel.dot(plane.axisU)
    const v = rel.dot(plane.axisV)
    const size = gridSize > 0 ? gridSize : 0.5
    const su = Math.round(u / size) * size
    const sv = Math.round(v / size) * size
    return plane.origin.clone()
      .addScaledVector(plane.axisU, su)
      .addScaledVector(plane.axisV, sv)
  }

  static newellNormal(points: THREE.Vector3[]): THREE.Vector3 {
    const n = new THREE.Vector3()
    for (let i = 0; i < points.length; i++) {
      const a = points[i]
      const b = points[(i + 1) % points.length]
      n.x += (a.y - b.y) * (a.z + b.z)
      n.y += (a.z - b.z) * (a.x + b.x)
      n.z += (a.x - b.x) * (a.y + b.y)
    }
    if (n.lengthSq() < 1e-12) return new THREE.Vector3(0, 1, 0)
    return n.normalize()
  }

  static maxPlaneDeviation(points: THREE.Vector3[]): number {
    if (points.length < 3) return 0
    const n = this.newellNormal(points)
    const o = points[0]
    let max = 0
    for (const p of points) {
      max = Math.max(max, Math.abs(p.clone().sub(o).dot(n)))
    }
    return max
  }

  static isPlanarLoop(points: THREE.Vector3[]): boolean {
    if (points.length < 3) return false
    let span = 0
    for (let i = 0; i < points.length; i++) {
      span = Math.max(span, points[i].distanceTo(points[(i + 1) % points.length]))
    }
    const slop = Math.max(0.05, span * 0.04)
    return this.maxPlaneDeviation(points) <= slop
  }

  /** Project the loop onto its own plane so the texture isn't a stretched atlas triangle. */
  static planarUvs(points: THREE.Vector3[]): THREE.Vector2[] {
    if (points.length === 0) return []
    const n = this.newellNormal(points)
    const up = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
    let axisU = up.clone().cross(n)
    if (axisU.lengthSq() < 1e-10) axisU = new THREE.Vector3(1, 0, 0)
    else axisU.normalize()
    const axisV = n.clone().cross(axisU).normalize()
    const us = points.map(p => p.dot(axisU))
    const vs = points.map(p => p.dot(axisV))
    const minU = Math.min(...us)
    const minV = Math.min(...vs)
    const du = Math.max(1e-6, Math.max(...us) - minU)
    const dv = Math.max(1e-6, Math.max(...vs) - minV)
    const scale = Math.max(du, dv)
    return points.map((_, i) => new THREE.Vector2((us[i] - minU) / scale, (vs[i] - minV) / scale))
  }

  /** Reverse the loop when it faces into the scene so thickness starts toward the camera. */
  static orientLoopTowardViewer(points: THREE.Vector3[], viewDir: THREE.Vector3): THREE.Vector3[] {
    if (points.length < 3) return points
    const n = this.newellNormal(points)
    if (n.dot(viewDir) > 0) return [...points].reverse()
    return points
  }

  static flipPlane(plane: DrawPlane): DrawPlane {
    return {
      origin: plane.origin.clone(),
      normal: plane.normal.clone().negate(),
      axisU: plane.axisU.clone().negate(),
      axisV: plane.axisV.clone()
    }
  }

  /** Shift-draw: lock the next point to 45° steps on the plane from `from`. */
  static constrainFromLast(from: THREE.Vector3, hover: THREE.Vector3, plane: DrawPlane, gridSize: number): THREE.Vector3 {
    const rel = hover.clone().sub(from)
    const u = rel.dot(plane.axisU)
    const v = rel.dot(plane.axisV)
    const len = Math.hypot(u, v)
    if (len < 1e-8) return this.snapOnPlane(hover, plane, gridSize)
    const step = Math.PI / 4
    const ang = Math.round(Math.atan2(v, u) / step) * step
    const p = from.clone()
      .addScaledVector(plane.axisU, Math.cos(ang) * len)
      .addScaledVector(plane.axisV, Math.sin(ang) * len)
    return this.snapOnPlane(p, plane, gridSize)
  }

  static createPlanarFace(mesh: EditableMesh, points: THREE.Vector3[]): number | null {
    return this.createPlanarCaps(mesh, points)?.faceIds[0] ?? null
  }

  /**
   * Fills the silhouette as convex quads/tris. A single concave n-gon fans
   * from vert 0 and draws a diagonal “cut” across the notch.
   */
  static createPlanarCaps(
    mesh: EditableMesh,
    points: THREE.Vector3[]
  ): { faceIds: number[]; outlineVertIds: number[] } | null {
    const unique = this.uniqueLoop(points)
    if (unique.length < 3) return null

    // Validate before allocating anything; a rejected sketch must leave no loose verts.
    const loops = this.tessellateLoopIndices(unique)
    if (loops.length === 0) return null
    const vertexIds = unique.map(p => mesh.addVertex(p).id)
    const uvs = this.planarUvs(unique)
    const faceIds: number[] = []
    for (const loop of loops) {
      const vids = loop.map(i => vertexIds[i])
      const id = MeshTopologyService.fillBoundary(mesh, vids, loop.map(i => uvs[i]))
      if (id != null) faceIds.push(id)
    }
    if (faceIds.length === 0) return null
    return { faceIds, outlineVertIds: vertexIds }
  }

  /** Fill an existing vertex loop as convex quads/tris (same tessellation as Poly Draw). */
  static fillExistingLoop(mesh: EditableMesh, vertexIds: number[], reverseStandalone = false): number[] {
    const plan = this.planExistingLoop(mesh, vertexIds, reverseStandalone)
    if (plan.error) return []
    const uvs = this.planarUvs(vertexIds.map(id => mesh.vertices.get(id)!.position))
    const uvById = new Map(vertexIds.map((id, i) => [id, uvs[i]]))
    const faceIds: number[] = []
    for (const vids of plan.loops) {
      const id = MeshTopologyService.fillBoundary(mesh, vids, vids.map(id => uvById.get(id)!))
      if (id != null) faceIds.push(id)
    }
    if (faceIds.length > 0) mesh.recalculateNormals()
    return faceIds
  }

  /** Preflight every new face together, then orient against shared boundary edges. */
  static planExistingLoop(mesh: EditableMesh, ids: number[], reverseStandalone = false): { loops: number[][]; error: string | null } {
    const fail = (error: string) => ({ loops: [], error })
    if (new Set(ids).size !== ids.length || ids.some(id => !mesh.vertices.has(id))) {
      return fail('Use each vertex only once in the outline.')
    }
    const points = ids.map(id => mesh.vertices.get(id)!.position)
    const error = this.loopError(points)
    if (error) return fail(error)
    const loops = this.tessellateLoopIndices(points).map(loop => loop.map(i => ids[i]))
    if (!loops.length) return fail('The outline could not be filled. Adjust its corners.')
    const key = (a: number, b: number) => a < b ? `${a}_${b}` : `${b}_${a}`
    const existing = new Map([...mesh.edges.values()].map(e => [key(e.v1, e.v2), e]))
    const counts = new Map<string, number>()
    let reverse: boolean | undefined
    for (const loop of loops) {
      if ([...mesh.faces.values()].some(f => f.vertexIds.length === loop.length && f.vertexIds.every(id => loop.includes(id)))) {
        return fail('This face already exists.')
      }
      for (let i = 0; i < loop.length; i++) {
        const a = loop[i], b = loop[(i + 1) % loop.length]
        const k = key(a, b)
        const edge = existing.get(k)
        const count = (counts.get(k) ?? 0) + 1
        counts.set(k, count)
        if (count + (edge?.faceIds.length ?? 0) > 2) return fail('An edge would have more than two faces. Use an open boundary.')
        if (edge?.faceIds.length === 1) {
          const face = mesh.faces.get(edge.faceIds[0])!
          const sameDirection = face.vertexIds[(face.vertexIds.indexOf(a) + 1) % face.vertexIds.length] === b
          if (reverse !== undefined && reverse !== sameDirection) return fail('Neighboring faces have conflicting winding. Fix their normals first.')
          reverse = sameDirection
        }
      }
    }
    return { loops: (reverse ?? reverseStandalone) ? loops.map(loop => [...loop].reverse()) : loops, error: null }
  }

  /** Reject crossings, repeated corners and collapsed outlines in normalized plane space. */
  static loopError(points: THREE.Vector3[]): string | null {
    if (points.length < 3) return 'Add at least three corners.'
    if (points.some(p => !Number.isFinite(p.x + p.y + p.z))) return 'The outline contains an invalid point.'
    const box = new THREE.Box3().setFromPoints(points)
    const scale = box.getSize(new THREE.Vector3()).length()
    if (scale === 0) return 'The outline has no area.'
    const normalized = points.map(p => p.clone().sub(points[0]).divideScalar(scale))
    const normal = new THREE.Vector3()
    for (let i = 0; i < normalized.length; i++) normal.add(normalized[i].clone().cross(normalized[(i + 1) % normalized.length]))
    if (normal.length() < 1e-10) return 'The outline crosses itself or has no area.'
    const plane = this.planeFromHit(new THREE.Vector3(), normal.normalize())
    const p2 = normalized.map(p => new THREE.Vector2(p.dot(plane.axisU), p.dot(plane.axisV)))
    const cross = (a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
    const on = (a: THREE.Vector2, b: THREE.Vector2, p: THREE.Vector2) => Math.abs(cross(a, b, p)) < 1e-10 && p.x >= Math.min(a.x, b.x) - 1e-10 && p.x <= Math.max(a.x, b.x) + 1e-10 && p.y >= Math.min(a.y, b.y) - 1e-10 && p.y <= Math.max(a.y, b.y) + 1e-10
    for (let i = 0; i < p2.length; i++) {
      const a = p2[i], b = p2[(i + 1) % p2.length]
      const prev = p2[(i + p2.length - 1) % p2.length]
      if (on(prev, a, b) || on(a, b, prev)) return 'The outline doubles back along an edge.'
      for (let j = i + 1; j < p2.length; j++) {
        if (a.distanceToSquared(p2[j]) < 1e-16) return 'Two corners occupy the same position.'
        if (j === i + 1 || (i === 0 && j === p2.length - 1)) continue
        const c = p2[j], d = p2[(j + 1) % p2.length]
        if ((cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) || on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b)) return 'The outline crosses itself. Move or undo a corner.'
      }
    }
    return null
  }

  /**
   * Extrude remaps the drawn face onto the new cap. A lone face would stay open
   * on the draw plane — add the original loop back so the block is a closed solid.
   */
  static capDrawBase(mesh: EditableMesh, baseVertexIds: number[]): void {
    if (baseVertexIds.length < 3) return
    const reversed = [...baseVertexIds].reverse()
    const pts = reversed.map(id => mesh.vertices.get(id)!.position.clone())
    for (const loop of this.tessellateLoopIndices(pts)) {
      const vids = loop.map(i => reversed[i])
      const facePts = loop.map(i => pts[i])
      MeshTopologyService.fillBoundary(mesh, vids, PolyDrawKernel.planarUvs(facePts))
    }
    mesh.recalculateNormals()
  }

  static uniqueLoop(points: THREE.Vector3[]): THREE.Vector3[] {
    const unique: THREE.Vector3[] = []
    for (const p of points) {
      const last = unique[unique.length - 1]
      if (last && last.distanceToSquared(p) < 1e-10) continue
      unique.push(p.clone())
    }
    if (unique.length >= 3 && unique[0].distanceToSquared(unique[unique.length - 1]) < 1e-10) {
      unique.pop()
    }
    return unique
  }

  static isConvexLoop(points: THREE.Vector3[]): boolean {
    if (points.length < 3) return false
    const n = this.newellNormal(points)
    let sign = 0
    for (let i = 0; i < points.length; i++) {
      const a = points[i]
      const b = points[(i + 1) % points.length]
      const c = points[(i + 2) % points.length]
      const cr = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, b))
      const s = Math.sign(cr.dot(n))
      if (s === 0) continue
      if (sign !== 0 && s !== sign) return false
      sign = s
    }
    return true
  }

  /** Ear-clip a planar loop; keep convex quads; merge tris when the quad stays convex. */
  static tessellateLoopIndices(points: THREE.Vector3[]): number[][] {
    const n = points.length
    if (this.loopError(points)) return []
    const span = new THREE.Box3().setFromPoints(points).getSize(new THREE.Vector3()).length()
    points = points.map(p => p.clone().sub(points[0]).divideScalar(span))
    if (n === 3) return [[0, 1, 2]]
    if (n === 4 && this.goodQuad(points)) return [[0, 1, 2, 3]]

    const nrm = this.newellNormal(points)
    const up = Math.abs(nrm.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
    let axisU = up.clone().cross(nrm)
    if (axisU.lengthSq() < 1e-10) axisU = new THREE.Vector3(1, 0, 0)
    else axisU.normalize()
    const axisV = nrm.clone().cross(axisU).normalize()
    const p2 = points.map(p => ({ x: p.dot(axisU), y: p.dot(axisV) }))

    let idx = points.map((_, i) => i)
    let area = 0
    for (let i = 0; i < n; i++) {
      const a = p2[i]
      const b = p2[(i + 1) % n]
      area += a.x * b.y - b.x * a.y
    }
    if (area < 0) idx = idx.reverse()

    const tris: number[][] = []
    let guard = 0
    while (idx.length > 3 && guard++ < n * n) {
      let best = -1
      let quality = -1
      for (let i = 0; i < idx.length; i++) {
        const i0 = idx[(i - 1 + idx.length) % idx.length]
        const i1 = idx[i]
        const i2 = idx[(i + 1) % idx.length]
        if (!this.isEar2d(p2, idx, i0, i1, i2)) continue
        const score = this.triangleQuality(points[i0], points[i1], points[i2])
        if (score > quality) { quality = score; best = i }
      }
      if (best < 0) return []
      tris.push([idx[(best - 1 + idx.length) % idx.length], idx[best], idx[(best + 1) % idx.length]])
      idx.splice(best, 1)
    }
    if (idx.length !== 3 || this.triangleQuality(points[idx[0]], points[idx[1]], points[idx[2]]) < 1e-10) return []
    tris.push([idx[0], idx[1], idx[2]])
    return this.mergeAdjacentTris(tris, points)
  }

  private static triangleQuality(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): number {
    const area2 = b.clone().sub(a).cross(c.clone().sub(a)).length()
    return 2 * Math.sqrt(3) * area2 / (a.distanceToSquared(b) + b.distanceToSquared(c) + c.distanceToSquared(a))
  }

  private static goodQuad(points: THREE.Vector3[]): boolean {
    if (!this.isConvexLoop(points) || this.maxPlaneDeviation(points) > 1e-5) return false
    // Avoid nearly straight corners: these produce slivers when exported as triangles.
    return points.every((p, i) => {
      const a = points[(i + 3) % 4].clone().sub(p).normalize()
      const b = points[(i + 1) % 4].clone().sub(p).normalize()
      return Math.abs(a.dot(b)) < 0.98
    })
  }

  private static isEar2d(
    p2: { x: number; y: number }[],
    idx: number[],
    i0: number,
    i1: number,
    i2: number
  ): boolean {
    const a = p2[i0]
    const b = p2[i1]
    const c = p2[i2]
    const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
    if (cross <= 1e-10) return false
    for (const i of idx) {
      if (i === i0 || i === i1 || i === i2) continue
      if (this.pointInTri2d(p2[i], a, b, c)) return false
    }
    return true
  }

  private static pointInTri2d(
    p: { x: number; y: number },
    a: { x: number; y: number },
    b: { x: number; y: number },
    c: { x: number; y: number }
  ): boolean {
    const d1 = (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y)
    const d2 = (p.x - c.x) * (b.y - c.y) - (b.x - c.x) * (p.y - c.y)
    const d3 = (p.x - a.x) * (c.y - a.y) - (c.x - a.x) * (p.y - a.y)
    const hasNeg = d1 < -1e-10 || d2 < -1e-10 || d3 < -1e-10
    const hasPos = d1 > 1e-10 || d2 > 1e-10 || d3 > 1e-10
    return !(hasNeg && hasPos)
  }

  private static mergeAdjacentTris(tris: number[][], points: THREE.Vector3[]): number[][] {
    const used = new Set<number>()
    const out: number[][] = []
    const candidates: { i: number; j: number; quad: number[]; score: number }[] = []
    for (let i = 0; i < tris.length; i++) {
      for (let j = i + 1; j < tris.length; j++) {
        const quad = this.quadFromTris(tris[i], tris[j], points)
        if (!quad) continue
        const p = quad.map(id => points[id])
        const score = Math.min(this.triangleQuality(p[0], p[1], p[2]), this.triangleQuality(p[0], p[2], p[3]))
        candidates.push({ i, j, quad, score })
      }
    }
    candidates.sort((a, b) => b.score - a.score)
    for (const { i, j, quad } of candidates) {
      if (used.has(i) || used.has(j)) continue
      used.add(i); used.add(j)
      out.push(quad)
    }
    tris.forEach((tri, i) => { if (!used.has(i)) out.push(tri) })
    return out
  }

  private static quadFromTris(a: number[], b: number[], points: THREE.Vector3[]): number[] | null {
    const shared = a.filter(i => b.includes(i))
    if (shared.length !== 2) return null
    const onlyA = a.find(i => !shared.includes(i))
    const onlyB = b.find(i => !shared.includes(i))
    if (onlyA == null || onlyB == null) return null
    const s0 = shared[0]
    const s1 = shared[1]
    const a0 = a.indexOf(s0)
    const a1 = a.indexOf(s1)
    const forward = (a0 + 1) % 3 === a1
    const quad = forward ? [onlyA, s0, onlyB, s1] : [onlyA, s1, onlyB, s0]
    const pts = quad.map(i => points[i])
    if (!this.goodQuad(pts)) return null
    return quad
  }

  /**
   * Shared AABB box projection so extrude walls and both caps use the same
   * texel space. Side quads otherwise each get a full 0–1 copy of the texture.
   */
  static applyBoxUvs(mesh: EditableMesh): void {
    if (mesh.vertices.size === 0 || mesh.faces.size === 0) return
    let minX = Infinity
    let minY = Infinity
    let minZ = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    let maxZ = -Infinity
    for (const v of mesh.vertices.values()) {
      const p = v.position
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.z < minZ) minZ = p.z
      if (p.x > maxX) maxX = p.x
      if (p.y > maxY) maxY = p.y
      if (p.z > maxZ) maxZ = p.z
    }
    const nx = (t: number, a: number, b: number) => {
      const span = b - a
      return span < 1e-8 ? 0.5 : (t - a) / span
    }
    const snx = (t: number, a: number, b: number, positive: boolean) => {
      const u = nx(t, a, b)
      return positive ? u : 1 - u
    }

    mesh.recalculateNormals()
    for (const face of mesh.faces.values()) {
      const pts: THREE.Vector3[] = []
      for (const id of face.vertexIds) {
        const v = mesh.vertices.get(id)
        if (v) pts.push(v.position)
      }
      if (pts.length !== face.vertexIds.length) continue
      const n = face.normal.lengthSq() > 1e-10 ? face.normal : this.newellNormal(pts)
      const ax = Math.abs(n.x)
      const ay = Math.abs(n.y)
      const az = Math.abs(n.z)
      if (ax >= ay && ax >= az) {
        face.uvs = pts.map(p => new THREE.Vector2(snx(p.z, minZ, maxZ, n.x >= 0), nx(p.y, minY, maxY)))
      } else if (ay >= ax && ay >= az) {
        face.uvs = pts.map(p => new THREE.Vector2(nx(p.x, minX, maxX), snx(p.z, minZ, maxZ, n.y >= 0)))
      } else {
        face.uvs = pts.map(p => new THREE.Vector2(snx(p.x, minX, maxX, n.z >= 0), nx(p.y, minY, maxY)))
      }
    }
  }
}
