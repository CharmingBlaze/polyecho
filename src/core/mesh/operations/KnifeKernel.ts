import * as THREE from 'three'
import { ScreenGeometry, type ViewQuadrant } from '../../geometry/ScreenGeometry'
import { EditableMesh } from '../MeshKernel'
import { surfaceTriangles, perspectiveEdgeParameter } from '../../geometry/SurfaceGeometry'
import { TopologyOps } from './TopologyOps'
import { AttributeInterpolator } from '../attributes/AttributeInterpolator'

export type KnifeTargetType = 'VERTEX' | 'EDGE' | 'FACE' | 'MIDPOINT'

export interface KnifePoint {
  world: THREE.Vector3
  screen: THREE.Vector2
  targetType: KnifeTargetType
  vertexId?: number
  edgeId?: number
  faceId?: number
  edgeT?: number
  background?: boolean
}

export interface KnifeCutOptions {
  cutThrough: boolean
  camera: THREE.Camera
  viewportRect: DOMRect | { left: number; top: number; width: number; height: number }
  quadrant?: ViewQuadrant
  objectMatrix?: THREE.Matrix4
}

export class KnifeKernel {
  static snapScreenToAngle(from: THREE.Vector2, to: THREE.Vector2, snapDegrees: number): THREE.Vector2 {
    const delta = to.clone().sub(from)
    if (delta.lengthSq() < 1) return to.clone()
    const step = (Math.max(1, snapDegrees) * Math.PI) / 180
    const snapped = Math.round(Math.atan2(delta.y, delta.x) / step) * step
    return from.clone().add(new THREE.Vector2(Math.cos(snapped), Math.sin(snapped)).multiplyScalar(delta.length()))
  }

  static applyCuts(mesh: EditableMesh, cuts: KnifePoint[] | KnifePoint[][], options: KnifeCutOptions) {
    if (!cuts || cuts.length === 0) return
    const chains: KnifePoint[][] = Array.isArray(cuts[0])
      ? (cuts as KnifePoint[][])
      : [cuts as KnifePoint[]]

    for (const points of chains) {
      if (points.length < 2) continue
      this.embedInteriorChains(mesh, points)
      const resolved = this.resolvePointsToVertices(mesh, points, options)
      this.cutThroughPolyline(mesh, points, resolved, options)
    }

    mesh.recalculateNormals()
  }

  private static strokeDirection(points: KnifePoint[], index: number): THREE.Vector3 | undefined {
    const here = points[index]?.world
    const other = points[index + 1]?.world ?? points[index - 1]?.world
    if (!here || !other) return undefined
    const dir = other.clone().sub(here)
    return dir.lengthSq() > 1e-12 ? dir : undefined
  }

  /**
   * Where the stroke leaves this point's face, found on screen like the edge crossings in
   * `cutThroughPolyline`. A chord aimed there meets the crossing vertex exactly.
   * The 3D direction to a click on another face dips into the mesh and misses it.
   */
  private static crossingDirection(
    mesh: EditableMesh,
    points: KnifePoint[],
    index: number,
    options: KnifeCutOptions
  ): THREE.Vector3 | undefined {
    const here = points[index]!
    const face = here.faceId !== undefined ? mesh.faces.get(here.faceId) : undefined
    if (!face) return undefined
    const matrix = options.objectMatrix ?? new THREE.Matrix4()
    const project = (p: THREE.Vector3) =>
      ScreenGeometry.worldToScreen(p.clone().applyMatrix4(matrix), options.camera, options.viewportRect, options.quadrant)
    for (const other of [points[index + 1], points[index - 1]]) {
      if (!other || (other.targetType === 'FACE' && !other.background && other.faceId === here.faceId)) continue
      let best: { along: number; point: THREE.Vector3 } | null = null
      const n = face.vertexIds.length
      for (let i = 0; i < n; i++) {
        const p = mesh.vertices.get(face.vertexIds[i]!)!.position
        const q = mesh.vertices.get(face.vertexIds[(i + 1) % n]!)!.position
        const hit = ScreenGeometry.intersectSegments2D(here.screen, other.screen, project(p), project(q))
        if (!hit.hit || hit.tA < 1e-6 || hit.tA > 1 + 1e-6) continue
        if (best && hit.tA >= best.along) continue
        const t = perspectiveEdgeParameter(hit.tB, p.clone().applyMatrix4(matrix), q.clone().applyMatrix4(matrix), options.camera)
        if (Number.isFinite(t)) best = { along: hit.tA, point: p.clone().lerp(q, t) }
      }
      if (!best) continue
      const dir = best.point.sub(here.world)
      if (dir.lengthSq() > 1e-12) return dir
    }
    return undefined
  }

  private static resolvePointsToVertices(mesh: EditableMesh, points: KnifePoint[], options?: KnifeCutOptions): number[] {
    const byEdge = new Map<number, { t: number; index: number }[]>()
    const resolved: Array<number | null> = points.map(() => null)
    const surface: number[] = []

    points.forEach((pt, index) => {
      if (pt.background) {
        resolved[index] = -1
        return
      }
      if (pt.targetType === 'VERTEX' && pt.vertexId !== undefined && mesh.vertices.has(pt.vertexId)) {
        resolved[index] = pt.vertexId
        return
      }
      if ((pt.targetType === 'EDGE' || pt.targetType === 'MIDPOINT') && pt.edgeId !== undefined) {
        const t = Math.max(0.00001, Math.min(0.99999, pt.edgeT ?? 0.5))
        const list = byEdge.get(pt.edgeId) ?? []
        list.push({ t, index })
        byEdge.set(pt.edgeId, list)
        return
      }
      surface.push(index)
    })

    // Face directions are measured on the untouched face, before edge snaps split it.
    const directions = new Map(surface.map(index => [
      index,
      (options && this.crossingDirection(mesh, points, index, options)) ?? this.strokeDirection(points, index),
    ]))

    const jobs: { v1: number; v2: number; hits: { t: number; index: number }[] }[] = []
    for (const [edgeId, hits] of byEdge) {
      const edge = mesh.edges.get(edgeId)
      if (!edge) continue
      jobs.push({ v1: edge.v1, v2: edge.v2, hits })
    }
    for (const job of jobs) {
      const liveId = this.findEdgeId(mesh, job.v1, job.v2)
      if (liveId === null) continue
      const created = this.splitEdgeAtParameters(mesh, liveId, job.hits.map((h) => h.t))
      for (const hit of job.hits) {
        const id = created.get(this.tKey(hit.t))
        if (id !== undefined) resolved[hit.index] = id
      }
    }

    // After edge snaps, so a chord that ends on a snap reuses that vertex.
    for (const index of surface) {
      const pt = points[index]!
      resolved[index] = this.insertSurfaceVertex(mesh, pt.world, pt.faceId, directions.get(index))
    }

    return resolved.map((id, i) => {
      const pt = points[i]!
      if (pt.background) return -1
      if (id !== null && id >= 0) return id
      if (pt.targetType === 'FACE') return -1
      return this.insertSurfaceVertex(mesh, pt.world, pt.faceId, this.strokeDirection(points, i)) ?? -1
    })
  }

  /**
   * Several clicks inside one face become one chord, with every point on that edge.
   * Two separate chords would meet sideways and leave a triangle.
   */
  private static embedInteriorChains(mesh: EditableMesh, points: KnifePoint[]) {
    let i = 0
    while (i < points.length) {
      const faceId = points[i]?.faceId
      const interior = (point: KnifePoint | undefined) =>
        !!point && point.targetType === 'FACE' && !point.background && point.faceId === faceId && faceId !== undefined
      if (!interior(points[i])) { i++; continue }
      let j = i + 1
      while (interior(points[j])) j++
      if (j - i >= 2 && faceId !== undefined) {
        const ids = this.embedPointsOnOneChord(mesh, faceId, points.slice(i, j).map(point => point.world))
        if (ids) {
          ids.forEach((id, k) => {
            points[i + k]!.targetType = 'VERTEX'
            points[i + k]!.vertexId = id
          })
        }
      }
      i = j
    }
  }

  private static embedPointsOnOneChord(mesh: EditableMesh, faceId: number, worlds: THREE.Vector3[]): number[] | null {
    const face = mesh.faces.get(faceId)
    if (!face || worlds.length < 2 || face.vertexIds.length < 4) return null
    const dir = worlds[worlds.length - 1]!.clone().sub(worlds[0]!)
    if (dir.lengthSq() < 1e-12) return null
    const verts = [...face.vertexIds]
    const positions = verts.map(id => mesh.vertices.get(id)!.position)
    const chord = this.chordAcrossFace(positions, face.normal, worlds[0]!, dir)
    if (!chord) return null
    const boundaryVertex = (hit: { edge: number; edgeT: number }) => {
      const a = verts[hit.edge]!
      const b = verts[(hit.edge + 1) % verts.length]!
      if (hit.edgeT <= 1e-4) return a
      if (hit.edgeT >= 1 - 1e-4) return b
      const edgeId = this.findEdgeId(mesh, a, b)
      if (edgeId === null) return null
      const edge = mesh.edges.get(edgeId)!
      const t = edge.v1 === a ? hit.edgeT : 1 - hit.edgeT
      return this.splitEdgeAtParameters(mesh, edgeId, [t]).get(this.tKey(t)) ?? null
    }
    const endA = boundaryVertex(chord.neg)
    const endB = boundaryVertex(chord.pos)
    if (endA == null || endB == null || endA === endB) return null
    if (!TopologyOps.splitFaceUnchecked(mesh, faceId, endA, endB)) return null
    // The chord's ends are the new corners. Extra clicks stay on that edge and are not inserted,
    // or each click would turn the two quads into n-gons.
    const along = dir.dot(worlds[worlds.length - 1]!.clone().sub(worlds[0]!))
    const startId = along >= 0 ? endA : endB
    const endId = along >= 0 ? endB : endA
    return worlds.map((_, index) => index === 0 ? startId : endId)
  }

  /**
   * Put a cut vertex on the surface: reuse a nearby vert, split an edge, or poke the face.
   */
  static insertSurfaceVertex(
    mesh: EditableMesh,
    position: THREE.Vector3,
    preferredFaceId?: number,
    direction?: THREE.Vector3
  ): number | null {
    const snapEps = 1e-8
    for (const [id, v] of mesh.vertices) {
      if (v.position.distanceToSquared(position) <= snapEps) return id
    }

    const onFace = this.closestSurfaceFace(mesh, position, preferredFaceId)
    if (onFace) {
      const edgeHit = this.closestFaceEdge(mesh, onFace.faceId, onFace.point)
      if (edgeHit && edgeHit.distance * edgeHit.distance <= Math.max(snapEps, edgeHit.lengthSq * 1e-6)) {
        const t = Math.max(0.00001, Math.min(0.99999, edgeHit.t))
        const created = this.splitEdgeAtParameters(mesh, edgeHit.edgeId, [t])
        const id = created.get(this.tKey(t))
        if (id !== undefined) return id
      }
      const poked = this.pokeFaceAt(mesh, onFace.faceId, onFace.point, direction)
      if (poked !== null) return poked
      const face = mesh.faces.get(onFace.faceId)
      // A quad or n-gon that cannot take one chord stays intact. Fanning it writes the fill diagonals as edges.
      if (face && face.vertexIds.length > 3) return null
    }

    return mesh.addVertex(position.clone()).id
  }

  private static closestSurfaceFace(
    mesh: EditableMesh,
    position: THREE.Vector3,
    preferredFaceId?: number
  ): { faceId: number; point: THREE.Vector3 } | null {
    const tri = new THREE.Triangle()
    const closest = new THREE.Vector3()
    let bestFaceId = -1
    let bestPoint = new THREE.Vector3()
    let bestDist = Infinity

    const consider = (faceId: number) => {
      const face = mesh.faces.get(faceId)
      if (!face || face.vertexIds.length < 3) return
      const positions = face.vertexIds.map(id => mesh.vertices.get(id)!.position)
      for (const [a, b, c] of surfaceTriangles(positions)) {
        tri.set(positions[a], positions[b], positions[c])
        tri.closestPointToPoint(position, closest)
        const dist = closest.distanceToSquared(position)
        if (dist < bestDist) {
          bestDist = dist
          bestFaceId = faceId
          bestPoint.copy(closest)
        }
      }
    }

    if (preferredFaceId !== undefined && mesh.faces.has(preferredFaceId)) consider(preferredFaceId)
    if (bestDist > 1e-6) {
      for (const fId of mesh.faces.keys()) {
        if (fId === preferredFaceId) continue
        consider(fId)
      }
    }
    if (bestFaceId < 0) return null
    return { faceId: bestFaceId, point: bestPoint.clone() }
  }

  private static closestFaceEdge(
    mesh: EditableMesh,
    faceId: number,
    point: THREE.Vector3
  ): { edgeId: number; t: number; distance: number; lengthSq: number } | null {
    const face = mesh.faces.get(faceId)
    if (!face) return null
    let best: { edgeId: number; t: number; distance: number; lengthSq: number } | null = null
    const n = face.vertexIds.length
    const tmp = new THREE.Vector3()
    for (let i = 0; i < n; i++) {
      const a = mesh.vertices.get(face.vertexIds[i]!)?.position
      const b = mesh.vertices.get(face.vertexIds[(i + 1) % n]!)?.position
      if (!a || !b) continue
      const ab = b.clone().sub(a)
      const lengthSq = ab.lengthSq()
      if (lengthSq < 1e-14) continue
      const t = Math.max(0, Math.min(1, tmp.copy(point).sub(a).dot(ab) / lengthSq))
      const dist = tmp.copy(a).addScaledVector(ab, t).distanceTo(point)
      const edgeId = this.findEdgeId(mesh, face.vertexIds[i]!, face.vertexIds[(i + 1) % n]!)
      if (edgeId === null) continue
      if (!best || dist < best.distance) best = { edgeId, t, distance: dist, lengthSq }
    }
    return best
  }

  /**
   * Drop a point on a face. A quad (or larger face) is split by one chord through
   * the point, so the rest of the face stays intact. A triangle has to become three triangles.
   */
  private static pokeFaceAt(
    mesh: EditableMesh,
    faceId: number,
    position: THREE.Vector3,
    direction?: THREE.Vector3
  ): number | null {
    const face = mesh.faces.get(faceId)
    if (!face || face.vertexIds.length < 3) return null
    if (face.vertexIds.length === 3) return this.fanPointIntoTriangles(mesh, faceId, position)
    return this.embedPointOnChord(mesh, faceId, position, direction)
  }

  /** One chord through the point. A quad becomes two quads instead of four triangles. */
  private static embedPointOnChord(
    mesh: EditableMesh,
    faceId: number,
    position: THREE.Vector3,
    preferred?: THREE.Vector3
  ): number | null {
    const face = mesh.faces.get(faceId)
    if (!face) return null
    const verts = [...face.vertexIds]
    const positions = verts.map(id => mesh.vertices.get(id)!.position)
    const chord = this.chordAcrossFace(positions, face.normal, position, preferred)
    if (!chord) return null

    const boundaryVertex = (hit: { edge: number; edgeT: number }) => {
      const a = verts[hit.edge]
      const b = verts[(hit.edge + 1) % verts.length]
      if (hit.edgeT <= 1e-4) return a
      if (hit.edgeT >= 1 - 1e-4) return b
      const edgeId = this.findEdgeId(mesh, a, b)
      if (edgeId === null) return null
      const edge = mesh.edges.get(edgeId)!
      const t = edge.v1 === a ? hit.edgeT : 1 - hit.edgeT
      return this.splitEdgeAtParameters(mesh, edgeId, [t]).get(this.tKey(t)) ?? null
    }
    const endA = boundaryVertex(chord.neg)
    const endB = boundaryVertex(chord.pos)
    if (endA == null || endB == null || endA === endB) return null
    if (!TopologyOps.splitFaceUnchecked(mesh, faceId, endA, endB)) return null
    // In a stroke the chord is the cut: return the end the stroke heads toward, so the next
    // segment starts from that crossing. A vertex at the click would turn both halves into n-gons.
    if (preferred) return endB
    // A quad's chord is the whole edge, for the same reason.
    if (verts.length === 4) return endA

    // A lone point (Knife Project) needs a vertex where it was placed.
    const edgeId = this.findEdgeId(mesh, endA, endB)
    if (edgeId === null) return endA
    const edge = mesh.edges.get(edgeId)!
    const pA = mesh.vertices.get(edge.v1)!.position
    const pB = mesh.vertices.get(edge.v2)!.position
    const ab = pB.clone().sub(pA)
    const denom = ab.lengthSq()
    if (denom < 1e-12) return edge.v1
    const t = THREE.MathUtils.clamp(position.clone().sub(pA).dot(ab) / denom, 0, 1)
    if (t <= 1e-4) return edge.v1
    if (t >= 1 - 1e-4) return edge.v2
    return this.splitEdgeAtParameters(mesh, edgeId, [t]).get(this.tKey(t)) ?? null
  }

  private static chordAcrossFace(
    positions: THREE.Vector3[],
    normal: THREE.Vector3,
    origin: THREE.Vector3,
    preferred?: THREE.Vector3
  ): { neg: { edge: number; edgeT: number }; pos: { edge: number; edgeT: number } } | null {
    const n = positions.length
    const dirs: THREE.Vector3[] = []
    if (preferred && preferred.lengthSq() > 1e-12) dirs.push(preferred.clone().normalize())
    else {
      for (let i = 0; i < n; i++) {
        const dir = positions[(i + 1) % n].clone().sub(positions[i])
        if (dir.lengthSq() > 1e-12) dirs.push(dir.normalize())
      }
      if (dirs[0]) dirs.push(normal.clone().cross(dirs[0]).normalize())
    }

    let best: { neg: { edge: number; edgeT: number }; pos: { edge: number; edgeT: number }; score: number } | null = null
    for (const dir of dirs) {
      if (dir.lengthSq() < 1e-12) continue
      const hits = this.lineHits(positions, origin, dir, normal)
      const pos = hits.filter(hit => hit.lineT > 1e-5).sort((a, b) => a.lineT - b.lineT)[0]
      const neg = hits.filter(hit => hit.lineT < -1e-5).sort((a, b) => b.lineT - a.lineT)[0]
      if (!pos || !neg || pos.edge === neg.edge) continue
      const adjacent = (pos.edge + 1) % n === neg.edge || (neg.edge + 1) % n === pos.edge
      const offCentre = Math.abs(pos.lineT + neg.lineT) / (pos.lineT - neg.lineT)
      const score = (n === 4 && adjacent ? 0 : 2) - offCentre
      if (!best || score > best.score) best = { neg, pos, score }
    }
    if (!best || (!preferred && n === 4 && best.score < 1)) return null
    return { neg: best.neg, pos: best.pos }
  }

  private static lineHits(
    positions: THREE.Vector3[],
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    normal: THREE.Vector3
  ): { edge: number; edgeT: number; lineT: number }[] {
    const axisU = dir.clone().normalize()
    const axisV = normal.clone().cross(axisU)
    if (axisV.lengthSq() < 1e-12) return []
    axisV.normalize()
    const flat = (p: THREE.Vector3) => new THREE.Vector2(p.clone().sub(origin).dot(axisU), p.clone().sub(origin).dot(axisV))
    const hits: { edge: number; edgeT: number; lineT: number }[] = []
    for (let i = 0; i < positions.length; i++) {
      const a = flat(positions[i])
      const b = flat(positions[(i + 1) % positions.length])
      const dy = b.y - a.y
      if (Math.abs(dy) < 1e-8) continue
      const rawT = -a.y / dy
      if (rawT < -1e-5 || rawT > 1 + 1e-5) continue
      const edgeT = THREE.MathUtils.clamp(rawT, 0, 1)
      if (Math.abs(a.y + dy * edgeT) > 1e-4) continue
      hits.push({ edge: i, edgeT, lineT: a.x + (b.x - a.x) * edgeT })
    }
    return hits
  }

  /** A triangle cannot hold an interior point as a quad. */
  private static fanPointIntoTriangles(mesh: EditableMesh, faceId: number, position: THREE.Vector3): number | null {
    const face = mesh.faces.get(faceId)
    if (!face) return null
    const verts = [...face.vertexIds]
    const uvs = face.uvs.map((uv) => uv.clone())
    const matIdx = face.materialIndex
    const color = face.color
    const positions = verts.map(id => mesh.vertices.get(id)!.position)
    const triangles = surfaceTriangles(positions)
    const barycentric = new THREE.Vector3()
    const triangle = new THREE.Triangle()
    const uvC = new THREE.Vector2()
    for (const [a, b, c] of triangles) {
      triangle.set(positions[a], positions[b], positions[c])
      if (!triangle.containsPoint(position)) continue
      triangle.getBarycoord(position, barycentric)
      uvC.copy(uvs[a]).multiplyScalar(barycentric.x).addScaledVector(uvs[b], barycentric.y).addScaledVector(uvs[c], barycentric.z)
      break
    }
    const cId = mesh.addVertex(position.clone()).id
    mesh.removeFace(faceId)
    const addWedge = (a: number, b: number) => {
      if (positions[a].clone().sub(position).cross(positions[b].clone().sub(position)).lengthSq() < 1e-20) return
      mesh.addFace([verts[a], verts[b], cId], [uvs[a], uvs[b], uvC.clone()], matIdx, color)
    }
    for (let i = 0; i < verts.length; i++) addWedge(i, (i + 1) % verts.length)
    return cId
  }

  private static findEdgeId(mesh: EditableMesh, a: number, b: number): number | null {
    const minV = Math.min(a, b)
    const maxV = Math.max(a, b)
    for (const edge of mesh.edges.values()) {
      if (edge.v1 === minV && edge.v2 === maxV) return edge.id
    }
    return null
  }

  static splitEdgeAtParameters(mesh: EditableMesh, edgeId: number, parameters: number[]): Map<string, number> {
    const out = new Map<string, number>()
    const edge = mesh.edges.get(edgeId)
    if (!edge) return out
    if (parameters.some(t => !Number.isFinite(t))) return out

    const unique = [...new Set(parameters.map((t) => this.tKey(Math.max(0.00001, Math.min(0.99999, t)))))]
      .map((k) => Number(k))
      .sort((a, b) => a - b)
    if (unique.length === 0) return out

    const vA = edge.v1
    const vB = edge.v2
    const posA = mesh.vertices.get(vA)?.position
    const posB = mesh.vertices.get(vB)?.position
    if (!posA || !posB) return out

    const newIds: number[] = []
    for (const t of unique) {
      const v = mesh.addVertex(posA.clone().lerp(posB, t))
      AttributeInterpolator.interpolateVertex(mesh.vertices.get(vA)!, mesh.vertices.get(vB)!, v, t)
      newIds.push(v.id)
      out.set(this.tKey(t), v.id)
    }

    const adjFaceIds = [...edge.faceIds]
    for (const fId of adjFaceIds) {
      const face = mesh.faces.get(fId)
      if (!face) continue
      const newVertIds: number[] = []
      const newUvs: THREE.Vector2[] = []
      const n = face.vertexIds.length
      for (let i = 0; i < n; i++) {
        const curV = face.vertexIds[i]
        const nextV = face.vertexIds[(i + 1) % n]
        newVertIds.push(curV)
        newUvs.push(face.uvs[i]?.clone() || new THREE.Vector2())
        if ((curV === vA && nextV === vB) || (curV === vB && nextV === vA)) {
          const along = curV === vA ? newIds : [...newIds].reverse()
          const uvA = face.uvs[i]?.clone() || new THREE.Vector2()
          const uvB = face.uvs[(i + 1) % n]?.clone() || new THREE.Vector2()
          const ts = curV === vA ? unique : [...unique].reverse()
          along.forEach((vid, idx) => {
            const t = curV === vA ? ts[idx]! : 1 - ts[idx]!
            newVertIds.push(vid)
            newUvs.push(uvA.clone().lerp(uvB, t))
          })
        }
      }
      const matIdx = face.materialIndex
      const color = face.color
      mesh.replaceFace(fId, newVertIds, newUvs, matIdx, color)
    }

    mesh.removeEdge(edgeId)
    let prev = vA
    for (const id of newIds) {
      const segment = mesh.getOrCreateEdge(prev, id)
      segment.seam = edge.seam
      segment.sharp = edge.sharp
      prev = id
    }
    const segment = mesh.getOrCreateEdge(prev, vB)
    segment.seam = edge.seam
    segment.sharp = edge.sharp
    return out
  }

  private static splitSharedFace(mesh: EditableMesh, vA: number, vB: number) {
    if (vA === vB) return
    // A rejected split can restore the mesh Maps; iterate a stable candidate list.
    for (const [fId, face] of [...mesh.faces]) {
      if (face.vertexIds.includes(vA) && face.vertexIds.includes(vB)) {
        const res = TopologyOps.splitFaceUnchecked(mesh, fId, vA, vB)
        if (res) return
      }
    }
  }

  private static cutThroughPolyline(mesh: EditableMesh, points: KnifePoint[], resolved: number[], options: KnifeCutOptions) {
    const matrix = options.objectMatrix ?? new THREE.Matrix4()
    const inverse = matrix.clone().invert()
    const project = (p: THREE.Vector3) => ScreenGeometry.worldToScreen(p.clone().applyMatrix4(matrix), options.camera, options.viewportRect, options.quadrant)
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1]
      const faceHits = new Map<number, { t: number; id: number }[]>()
      const add = (face: number, t: number, id: number) => {
        const hits = faceHits.get(face) ?? []
        if (!hits.some(h => h.id === id)) hits.push({ t, id })
        faceHits.set(face, hits)
      }
      for (const [id, t] of [[resolved[i], 0], [resolved[i + 1], 1]]) {
        for (const face of mesh.vertices.get(id)?.faceIds ?? []) add(face, t, id)
      }
      const triangles = [...mesh.faces.values()].flatMap(face => {
        const ps = face.vertexIds.map(id => mesh.vertices.get(id)!.position)
        return surfaceTriangles(ps).map(ids => ids.map(id => ps[id]))
      })
      const visible = (point: THREE.Vector3) => {
        if (options.cutThrough) return true
        const world = point.clone().applyMatrix4(matrix)
        const ndc = world.clone().project(options.camera)
        const caster = new THREE.Raycaster(); caster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), options.camera)
        const ray = caster.ray.clone().applyMatrix4(inverse), distance = ray.origin.distanceTo(point)
        return !triangles.some(([p0,p1,p2]) => {
          const hit = ray.intersectTriangle(p0,p1,p2,false,new THREE.Vector3())
          return hit && ray.origin.distanceTo(hit) < distance - Math.max(1e-6, distance * 1e-6)
        })
      }
      const ends = new Set([resolved[i], resolved[i + 1]])
      const jobs = [...mesh.edges.values()].flatMap(edge => {
        // An edge out of this segment's own end vertex (a chord just laid through a click) is not a crossing.
        if (ends.has(edge.v1) || ends.has(edge.v2)) return []
        const p = mesh.vertices.get(edge.v1)!.position, q = mesh.vertices.get(edge.v2)!.position
        const hit = ScreenGeometry.intersectSegments2D(a.screen, b.screen, project(p), project(q))
        if (!hit.hit || hit.tA < -1e-7 || hit.tA > 1 + 1e-7) return []
        const t = perspectiveEdgeParameter(hit.tB, p.clone().applyMatrix4(matrix), q.clone().applyMatrix4(matrix), options.camera)
        if (!Number.isFinite(t) || !visible(p.clone().lerp(q, t))) return []
        return [{ a: edge.v1, b: edge.v2, t, along: hit.tA, faces: [...edge.faceIds] }]
      })
      for (const job of jobs) {
        // A crossing on a vertex the chord or a snap already made reuses it instead of adding a sliver.
        let id: number | undefined = job.t < 1e-4 ? job.a : job.t > 1 - 1e-4 ? job.b : undefined
        if (id === undefined) {
          const edge = this.findEdgeId(mesh, job.a, job.b)
          if (edge === null) continue
          const live = mesh.edges.get(edge)!
          const t = live.v1 === job.a ? job.t : 1 - job.t
          id = this.splitEdgeAtParameters(mesh, edge, [t]).get(this.tKey(t))
        }
        if (id !== undefined) job.faces.forEach(face => add(face, job.along, id!))
      }
      for (const hits of faceHits.values()) {
        hits.sort((x,y) => x.t-y.t)
        for (let j = 0; j < hits.length - 1; j++) this.splitSharedFace(mesh, hits[j].id, hits[j+1].id)
      }
    }
  }

  static tKey(t: number): string {
    return (Math.round(t * 1e5) / 1e5).toFixed(5)
  }
}
