import * as THREE from 'three'
import { EditableMesh } from '../MeshKernel'
import { MeshValidator } from '../MeshValidator'
import { TopologyOps } from './TopologyOps'
import { DissolveKernel } from './DissolveKernel'
import { PolyDrawKernel } from './PolyDrawKernel'
import { polygonAreaVector } from '../../geometry/PolygonGeometry'

export interface SketchHit {
  faceId: number
  distance: number
}

/**
 * SketchUp-style face cuts and push/pull cleanup on the half-edge mesh.
 * A rectangle drawn on a face becomes a quad, and the surrounding surface is
 * split into quads (game topology) instead of a triangle fan.
 */
export class BlockoutSketchKernel {
  static rectangle(a: THREE.Vector3, b: THREE.Vector3, origin: THREE.Vector3, axisU: THREE.Vector3, axisV: THREE.Vector3): THREE.Vector3[] {
    const au = a.clone().sub(origin).dot(axisU)
    const av = a.clone().sub(origin).dot(axisV)
    const bu = b.clone().sub(origin).dot(axisU)
    const bv = b.clone().sub(origin).dot(axisV)
    const at = (u: number, v: number) => origin.clone().addScaledVector(axisU, u).addScaledVector(axisV, v)
    return [at(au, av), at(bu, av), at(bu, bv), at(au, bv)]
  }

  /**
   * If `faceId` is a triangle paired with one coplanar triangle, dissolve the
   * shared edge and return the quad. Pulling a lone triangle is what spikes the mesh.
   */
  static quadHost(mesh: EditableMesh, faceId: number): number | null {
    const face = mesh.faces.get(faceId)
    if (!face) return null
    if (face.vertexIds.length !== 3) return faceId
    mesh.recalculateNormals()
    for (const edgeId of face.edgeIds) {
      const edge = mesh.edges.get(edgeId)
      if (!edge || edge.faceIds.length !== 2) continue
      const otherId = edge.faceIds[0] === faceId ? edge.faceIds[1] : edge.faceIds[0]
      const other = otherId != null ? mesh.faces.get(otherId) : undefined
      if (!other || other.vertexIds.length !== 3) continue
      if (face.normal.dot(other.normal) < 0.999) continue
      const unique = new Set([...face.vertexIds, ...other.vertexIds])
      if (unique.size !== 4) continue
      const before = new Set(mesh.faces.keys())
      if (!DissolveKernel.dissolveEdge(mesh, edgeId)) continue
      const created = [...mesh.faces.values()].filter(next => !before.has(next.id) && next.vertexIds.length >= 4)
      if (created[0]) return created[0].id
    }
    return faceId
  }

  /** Drop a closed loop onto a face. An interior rectangle becomes its own quad and splits the parent into quads. */
  static embedLoop(mesh: EditableMesh, faceId: number, points: THREE.Vector3[]): { innerFaceId: number; vertexIds: number[] } | { error: string } {
    const face = mesh.faces.get(faceId)
    if (!face || points.length < 3) return { error: 'Draw at least three corners on a face.' }
    const snap = mesh.createSnapshot()
    const fail = (error: string) => {
      mesh.restoreSnapshot(snap)
      return { error }
    }
    try {
      const hostId = this.quadHost(mesh, faceId)
      const host = hostId != null ? mesh.faces.get(hostId) : undefined
      if (!host) return fail('That face could not be prepared.')
      const basis = this.faceBasis(mesh, host.id)
      if (!basis) return fail('That face has no area.')
      const outerIds = [...host.vertexIds]
      const outerUv = host.uvs.map(uv => uv?.clone() ?? new THREE.Vector2())
      const outer2 = outerIds.map(id => this.to2(mesh.vertices.get(id)!.position, basis))
      if (this.signedArea(outer2) < 0) {
        outerIds.reverse()
        outer2.reverse()
        outerUv.reverse()
      }
      const flat = points.map(p => this.projectToBasis(p, basis))
      if (PolyDrawKernel.loopError(flat)) return fail('The drawn shape crosses itself or has no area.')
      const hole2 = flat.map(p => this.to2(p, basis))
      for (const p of hole2) {
        if (!this.pointInPoly(p, outer2) || this.edgeDistance(p, outer2) < 1e-4) {
          return fail('Draw the shape inside the face, not across its border.')
        }
      }
      const cells = this.splitPolygon(outer2, hole2)
      const innerCenter = this.centroid2(hole2)
      const innerCell = cells
        .filter(cell => this.pointInPoly(innerCenter, cell))
        .sort((a, b) => Math.abs(this.signedArea(a)) - Math.abs(this.signedArea(b)))[0]
      if (!innerCell) return fail('The face could not be split.')

      const material = host.materialIndex
      const color = host.color
      const weld: { p: THREE.Vector2; id: number; uv: THREE.Vector2 }[] = []
      const remember = (p: THREE.Vector2, id: number, uv: THREE.Vector2) => {
        const existing = weld.find(entry => entry.p.distanceToSquared(p) < 1e-8)
        if (existing) return existing
        const entry = { p: p.clone(), id, uv }
        weld.push(entry)
        return entry
      }
      outer2.forEach((p, i) => remember(p, outerIds[i], outerUv[i] ?? new THREE.Vector2()))
      const pending = new Map<number, { t: number; p: THREE.Vector2 }[]>()
      for (const cell of cells) {
        for (const p of cell) {
          const on = this.onOuterEdge(p, outer2)
          if (!on || on.t <= 1e-4 || on.t >= 1 - 1e-4) continue
          const vA = outerIds[on.index]
          const vB = outerIds[(on.index + 1) % outerIds.length]
          const edge = mesh.findEdge(vA, vB)
          if (!edge) return fail('The face border could not be split.')
          const t = edge.v1 === vA ? on.t : 1 - on.t
          const list = pending.get(edge.id) ?? []
          if (list.some(hit => Math.abs(hit.t - t) < 1e-4)) continue
          list.push({ t, p: p.clone() })
          pending.set(edge.id, list)
        }
      }
      for (const [edgeId, hits] of pending) {
        hits.sort((a, b) => a.t - b.t)
        let current = edgeId
        let covered = 0
        for (const hit of hits) {
          const local = (hit.t - covered) / (1 - covered)
          if (local <= 1e-4 || local >= 1 - 1e-4) continue
          const split = TopologyOps.splitEdge(mesh, current, local)
          if (!split) return fail('The face border could not be split.')
          remember(hit.p, split.newVertexId, this.uvOnFace(hit.p, outer2, outerUv))
          current = split.edgeBId
          covered = hit.t
        }
      }
      const vertexIds = hole2.map((p, i) => remember(p, mesh.addVertex(flat[i]).id, this.uvOnFace(p, outer2, outerUv)).id)
      const vertFor = (p: THREE.Vector2) => {
        const found = weld.find(entry => entry.p.distanceToSquared(p) < 1e-8)
        if (found) return found
        const uv = this.uvOnFace(p, outer2, outerUv)
        return remember(p, mesh.addVertex(this.from2(p, basis)).id, uv)
      }
      const loopIds = (cell: THREE.Vector2[]) => {
        const used = new Set<number>()
        const ids: number[] = []
        const uvs: THREE.Vector2[] = []
        for (const p of cell) {
          const entry = vertFor(p)
          if (used.has(entry.id)) continue
          used.add(entry.id)
          ids.push(entry.id)
          uvs.push(entry.uv.clone())
        }
        return { ids, uvs }
      }
      mesh.removeFace(host.id)
      let innerFaceId = -1
      for (const cell of cells) {
        const loop = loopIds(cell)
        if (loop.ids.length < 3) continue
        const positions = loop.ids.map(id => mesh.vertices.get(id)!.position)
        if (polygonAreaVector(positions).lengthSq() < 1e-12) continue
        if (polygonAreaVector(positions).dot(basis.normal) < 0) {
          loop.ids.reverse()
          loop.uvs.reverse()
        }
        const added = mesh.addFace(loop.ids, loop.uvs, material, color)
        if (!added) return fail('The cut overlapped an existing face.')
        if (cell === innerCell) innerFaceId = added.id
      }
      if (innerFaceId < 0 || !mesh.faces.has(innerFaceId)) return fail('The new face could not be added.')
      mesh.recalculateNormals()
      if (!MeshValidator.validate(mesh).valid) return fail('The cut would break the mesh.')
      return { innerFaceId, vertexIds }
    } catch (error) {
      return fail(error instanceof Error ? error.message : 'The face could not be split.')
    }
  }

  /** A line whose ends lie on two different edges splits that face in two. */
  static splitFaceBySegment(mesh: EditableMesh, faceId: number, a: THREE.Vector3, b: THREE.Vector3): number[] | null {
    const face = mesh.faces.get(faceId)
    if (!face) return null
    const hits: { edgeId: number; t: number }[] = []
    for (let i = 0; i < face.vertexIds.length; i++) {
      const v1 = face.vertexIds[i]
      const v2 = face.vertexIds[(i + 1) % face.vertexIds.length]
      const edge = mesh.findEdge(v1, v2)
      const p = mesh.vertices.get(v1)?.position
      const q = mesh.vertices.get(v2)?.position
      if (!edge || !p || !q) continue
      const hit = this.segmentHit(a, b, p, q)
      if (!hit || hit.tEdge <= 0.02 || hit.tEdge >= 0.98 || hit.tSeg < -0.02 || hit.tSeg > 1.02) continue
      if (hits.some(h => h.edgeId === edge.id)) continue
      hits.push({ edgeId: edge.id, t: hit.tEdge })
    }
    if (hits.length !== 2) return null
    const snap = mesh.createSnapshot()
    const first = TopologyOps.splitEdge(mesh, hits[0].edgeId, hits[0].t)
    const second = first && TopologyOps.splitEdge(mesh, hits[1].edgeId, hits[1].t)
    if (!first || !second) {
      mesh.restoreSnapshot(snap)
      return null
    }
    const split = TopologyOps.splitFace(mesh, faceId, first.newVertexId, second.newVertexId)
    if (!split || !MeshValidator.validate(mesh).valid) {
      mesh.restoreSnapshot(snap)
      return null
    }
    mesh.recalculateNormals()
    return [split.face1.id, split.face2.id]
  }

  /** Nearest opposite face along the inward normal, in local units. */
  static inwardLimit(mesh: EditableMesh, faceId: number): SketchHit | null {
    const basis = this.faceBasis(mesh, faceId)
    const face = mesh.faces.get(faceId)
    if (!basis || !face) return null
    const poly = face.vertexIds.map(id => mesh.vertices.get(id)!.position.clone())
    let best: SketchHit | null = null
    for (const [id, other] of mesh.faces) {
      if (id === faceId) continue
      if (other.normal.dot(basis.normal) > -0.5) continue
      const planePoint = mesh.vertices.get(other.vertexIds[0])!.position
      const denom = basis.normal.dot(other.normal)
      if (Math.abs(denom) < 1e-6) continue
      const t = planePoint.clone().sub(basis.center).dot(other.normal) / denom
      if (t >= -1e-4) continue
      const projected = poly.map(p => p.clone().addScaledVector(basis.normal, t))
      const otherBasis = this.faceBasis(mesh, id)
      if (!otherBasis) continue
      const outer = other.vertexIds.map(vid => this.to2(mesh.vertices.get(vid)!.position, otherBasis))
      const hole = projected.map(p => this.to2(p, otherBasis))
      if (this.signedArea(outer) < 0) outer.reverse()
      if (!hole.every(p => this.pointInPoly(p, outer))) continue
      if (!best || t > best.distance) best = { faceId: id, distance: t }
    }
    return best
  }

  /**
   * Push a face through the mesh until it meets `backFaceId`, then delete both
   * caps and stitch the walls so the opening stays a hole.
   */
  static punchThrough(mesh: EditableMesh, frontFaceId: number, backFaceId: number): boolean {
    const front = mesh.faces.get(frontFaceId)
    const limit = this.inwardLimit(mesh, frontFaceId)
    if (!front || !limit || limit.faceId !== backFaceId) return false
    const snap = mesh.createSnapshot()
    const frontIds = [...front.vertexIds]
    const projected = frontIds.map(id => mesh.vertices.get(id)!.position.clone().addScaledVector(front.normal, limit.distance))
    const embedded = this.embedLoop(mesh, backFaceId, projected)
    if ('error' in embedded) {
      mesh.restoreSnapshot(snap)
      return false
    }
    const backIds = embedded.vertexIds
    if (!mesh.faces.has(frontFaceId)) {
      mesh.restoreSnapshot(snap)
      return false
    }
    mesh.removeFace(frontFaceId)
    mesh.removeFace(embedded.innerFaceId)
    const center = new THREE.Vector3()
    for (const id of frontIds) center.add(mesh.vertices.get(id)!.position)
    center.multiplyScalar(1 / frontIds.length)
    for (let i = 0; i < frontIds.length; i++) {
      const a = frontIds[i]
      const b = frontIds[(i + 1) % frontIds.length]
      const a2 = backIds[i]
      const b2 = backIds[(i + 1) % backIds.length]
      const forward = [a, b, b2, a2]
      const backward = [a, a2, b2, b]
      const mid = mesh.vertices.get(a)!.position.clone().add(mesh.vertices.get(b)!.position).multiplyScalar(0.5)
      const outward = mid.sub(center)
      const chosen = polygonAreaVector(forward.map(id => mesh.vertices.get(id)!.position)).dot(outward) >= 0 ? forward : backward
      const pos = chosen.map(id => mesh.vertices.get(id)!.position)
      if (!mesh.addFace(chosen, PolyDrawKernel.planarUvs(pos))) {
        mesh.restoreSnapshot(snap)
        return false
      }
    }
    mesh.recalculateNormals()
    if (!MeshValidator.validate(mesh).valid) {
      mesh.restoreSnapshot(snap)
      return false
    }
    return true
  }

  /** Close a one-sided extrusion so a lone drawn face becomes a solid. */
  static sealExtrudedBase(mesh: EditableMesh, baseVertIds: number[], moveDir: THREE.Vector3): number | null {
    if (baseVertIds.length < 3 || baseVertIds.some(id => !mesh.vertices.has(id))) return null
    for (let i = 0; i < baseVertIds.length; i++) {
      const edge = mesh.findEdge(baseVertIds[i], baseVertIds[(i + 1) % baseVertIds.length])
      if (!edge || edge.faceIds.length !== 1) return null
    }
    const positions = baseVertIds.map(id => mesh.vertices.get(id)!.position)
    const ids = polygonAreaVector(positions).dot(moveDir) > 0 ? [...baseVertIds].reverse() : [...baseVertIds]
    const face = mesh.addFace(ids, PolyDrawKernel.planarUvs(ids.map(id => mesh.vertices.get(id)!.position)))
    if (face) mesh.recalculateNormals()
    return face?.id ?? null
  }

  /** Drop an edge between two coplanar faces so a flush extrusion becomes one N-gon. */
  static healCoplanar(mesh: EditableMesh, aroundFaceIds?: number[]): number {
    const allow = aroundFaceIds ? new Set(aroundFaceIds) : null
    const edgeIds = [...mesh.edges.values()].filter(edge => {
      if (edge.faceIds.length !== 2) return false
      if (allow && !edge.faceIds.some(id => allow.has(id))) return false
      const a = mesh.faces.get(edge.faceIds[0]!)
      const b = mesh.faces.get(edge.faceIds[1]!)
      if (!a || !b || a.normal.dot(b.normal) < 0.999) return false
      const points = [...new Set([...a.vertexIds, ...b.vertexIds])].map(id => mesh.vertices.get(id)!.position)
      const area = polygonAreaVector(a.vertexIds.map(id => mesh.vertices.get(id)!.position))
      const scale = Math.max(1e-6, area.length())
      return points.every(p => Math.abs(p.clone().sub(points[0]).dot(a.normal)) <= scale * 1e-4)
    }).map(edge => edge.id)
    let n = 0
    for (const id of edgeIds) {
      if (mesh.edges.has(id) && DissolveKernel.dissolveEdge(mesh, id)) n++
    }
    if (n) mesh.recalculateNormals()
    return n
  }

  private static splitPolygon(outer: THREE.Vector2[], hole: THREE.Vector2[]): THREE.Vector2[][] {
    let cells = [outer.map(p => p.clone())]
    for (let i = 0; i < hole.length; i++) {
      const a = hole[i]
      const b = hole[(i + 1) % hole.length]
      const next: THREE.Vector2[][] = []
      for (const cell of cells) next.push(...this.splitConvex(cell, a, b))
      cells = next
    }
    return cells.filter(cell => Math.abs(this.signedArea(cell)) > 1e-10)
  }

  /** Split a convex polygon by the infinite line through a and b. Keeps CCW order. */
  private static splitConvex(poly: THREE.Vector2[], a: THREE.Vector2, b: THREE.Vector2): THREE.Vector2[][] {
    const eps = 1e-8
    const side = (p: THREE.Vector2) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
    const sides = poly.map(side)
    if (!sides.some(s => s > eps) || !sides.some(s => s < -eps)) return [poly]
    const left: THREE.Vector2[] = []
    const right: THREE.Vector2[] = []
    for (let i = 0; i < poly.length; i++) {
      const cur = poly[i]
      const next = poly[(i + 1) % poly.length]
      const sc = sides[i]
      const sn = sides[(i + 1) % poly.length]
      if (sc >= -eps) left.push(cur)
      if (sc <= eps) right.push(cur)
      if ((sc > eps && sn < -eps) || (sc < -eps && sn > eps)) {
        const t = sc / (sc - sn)
        const hit = new THREE.Vector2(cur.x + (next.x - cur.x) * t, cur.y + (next.y - cur.y) * t)
        left.push(hit)
        right.push(hit)
      }
    }
    return [this.cleanPoly(left), this.cleanPoly(right)].filter(cell => cell.length >= 3)
  }

  private static cleanPoly(poly: THREE.Vector2[]): THREE.Vector2[] {
    const unique: THREE.Vector2[] = []
    for (const p of poly) {
      if (unique.length && unique[unique.length - 1].distanceToSquared(p) < 1e-10) continue
      unique.push(p)
    }
    if (unique.length > 1 && unique[0].distanceToSquared(unique[unique.length - 1]) < 1e-10) unique.pop()
    const slim: THREE.Vector2[] = []
    for (let i = 0; i < unique.length; i++) {
      const prev = unique[(i + unique.length - 1) % unique.length]
      const cur = unique[i]
      const next = unique[(i + 1) % unique.length]
      const cross = (cur.x - prev.x) * (next.y - cur.y) - (cur.y - prev.y) * (next.x - cur.x)
      if (Math.abs(cross) < 1e-8 && unique.length > 3) continue
      slim.push(cur)
    }
    return slim.length >= 3 ? slim : unique
  }

  private static centroid2(poly: THREE.Vector2[]): THREE.Vector2 {
    const c = new THREE.Vector2()
    for (const p of poly) c.add(p)
    return c.multiplyScalar(1 / Math.max(1, poly.length))
  }

  private static from2(p: THREE.Vector2, basis: { origin: THREE.Vector3; axisU: THREE.Vector3; axisV: THREE.Vector3 }): THREE.Vector3 {
    return basis.origin.clone().addScaledVector(basis.axisU, p.x).addScaledVector(basis.axisV, p.y)
  }

  private static uvOnFace(p: THREE.Vector2, outer: THREE.Vector2[], uvs: THREE.Vector2[]): THREE.Vector2 {
    for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(outer, [])) {
      const bary = this.barycentric(p, outer[i], outer[j], outer[k])
      if (!bary) continue
      const [b0, b1, b2] = bary
      const uv0 = uvs[i] ?? new THREE.Vector2()
      const uv1 = uvs[j] ?? new THREE.Vector2()
      const uv2 = uvs[k] ?? new THREE.Vector2()
      return new THREE.Vector2(
        uv0.x * b0 + uv1.x * b1 + uv2.x * b2,
        uv0.y * b0 + uv1.y * b1 + uv2.y * b2
      )
    }
    return uvs[0]?.clone() ?? new THREE.Vector2()
  }

  private static barycentric(p: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2): [number, number, number] | null {
    const v0 = b.clone().sub(a)
    const v1 = c.clone().sub(a)
    const v2 = p.clone().sub(a)
    const den = v0.x * v1.y - v1.x * v0.y
    if (Math.abs(den) < 1e-12) return null
    const b1 = (v2.x * v1.y - v1.x * v2.y) / den
    const b2 = (v0.x * v2.y - v2.x * v0.y) / den
    const b0 = 1 - b1 - b2
    if (b0 < -1e-4 || b1 < -1e-4 || b2 < -1e-4) return null
    return [b0, b1, b2]
  }

  private static onOuterEdge(p: THREE.Vector2, outer: THREE.Vector2[]): { index: number; t: number } | null {
    for (let i = 0; i < outer.length; i++) {
      const a = outer[i]
      const b = outer[(i + 1) % outer.length]
      const ab = b.clone().sub(a)
      const len = ab.lengthSq()
      if (len < 1e-12) continue
      const t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / len, 0, 1)
      if (a.clone().addScaledVector(ab, t).distanceToSquared(p) > 1e-8) continue
      return { index: i, t }
    }
    return null
  }

  private static faceBasis(mesh: EditableMesh, faceId: number) {
    const face = mesh.faces.get(faceId)
    if (!face || face.vertexIds.length < 3) return null
    const pts = face.vertexIds.map(id => mesh.vertices.get(id)!.position)
    const normal = polygonAreaVector(pts)
    if (normal.lengthSq() < 1e-12) return null
    normal.normalize()
    const origin = pts[0].clone()
    const axisU = pts[1].clone().sub(origin)
    if (axisU.lengthSq() < 1e-12) return null
    axisU.normalize()
    const axisV = normal.clone().cross(axisU).normalize()
    const center = new THREE.Vector3()
    for (const p of pts) center.add(p)
    center.multiplyScalar(1 / pts.length)
    return { origin, normal, axisU, axisV, center }
  }

  private static projectToBasis(p: THREE.Vector3, basis: { origin: THREE.Vector3; normal: THREE.Vector3 }): THREE.Vector3 {
    return p.clone().addScaledVector(basis.normal, -p.clone().sub(basis.origin).dot(basis.normal))
  }

  private static to2(p: THREE.Vector3, basis: { origin: THREE.Vector3; axisU: THREE.Vector3; axisV: THREE.Vector3 }): THREE.Vector2 {
    const d = p.clone().sub(basis.origin)
    return new THREE.Vector2(d.dot(basis.axisU), d.dot(basis.axisV))
  }

  private static signedArea(poly: THREE.Vector2[]): number {
    let area = 0
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]
      const q = poly[(i + 1) % poly.length]
      area += p.x * q.y - q.x * p.y
    }
    return area * 0.5
  }

  private static pointInPoly(p: THREE.Vector2, poly: THREE.Vector2[]): boolean {
    let inside = false
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i]
      const b = poly[j]
      if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
    }
    return inside
  }

  private static edgeDistance(p: THREE.Vector2, poly: THREE.Vector2[]): number {
    let best = Infinity
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]
      const b = poly[(i + 1) % poly.length]
      const ab = b.clone().sub(a)
      const len = ab.lengthSq()
      const t = len < 1e-12 ? 0 : THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / len, 0, 1)
      best = Math.min(best, p.distanceTo(a.clone().addScaledVector(ab, t)))
    }
    return best
  }

  private static segmentHit(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3): { tSeg: number; tEdge: number } | null {
    const ab = b.clone().sub(a)
    const cd = d.clone().sub(c)
    const w = a.clone().sub(c)
    const aa = ab.dot(ab)
    const bb = cd.dot(cd)
    const cc = ab.dot(cd)
    const den = aa * bb - cc * cc
    if (Math.abs(den) < 1e-10) return null
    const dd = ab.dot(w)
    const ee = cd.dot(w)
    const tA = (cc * ee - bb * dd) / den
    const tB = (aa * ee - cc * dd) / den
    const pointA = a.clone().addScaledVector(ab, tA)
    const pointB = c.clone().addScaledVector(cd, tB)
    if (pointA.distanceToSquared(pointB) > 1e-8) return null
    return { tSeg: tA, tEdge: tB }
  }
}
