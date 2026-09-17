import * as THREE from 'three'
import { EditableMesh } from '../MeshKernel'
import { AttributeInterpolator } from '../attributes/AttributeInterpolator'
import { DissolveKernel } from './DissolveKernel'
import { ExtrudeKernel } from './ExtrudeKernel'
import { MergeKernel } from './MergeKernel'
import { MeshTopologyService } from '../MeshTopologyService'
import { TopologyOps } from './TopologyOps'
import { bevelEdges } from './EdgeBevelKernel'
import { LoopCutKernel } from './LoopCutKernel'
import { KnifeKernel } from './KnifeKernel'

function rewriteFace(mesh: EditableMesh, faceId: number, map: (id: number) => number): boolean {
  const face = mesh.faces.get(faceId)
  if (!face) return false
  const ids = face.vertexIds.map(map)
  const uvs = face.uvs.map(uv => uv.clone())
  return !!mesh.replaceFace(faceId, ids, uvs, face.materialIndex, face.color)
}

function dupVertex(mesh: EditableMesh, id: number): number {
  const src = mesh.vertices.get(id)
  if (!src) return id
  const copy = mesh.addVertex(src.position.clone())
  AttributeInterpolator.copyVertex(src, copy)
  return copy.id
}

function floodFaces(mesh: EditableMesh, start: number, blocked: Set<number>): Set<number> {
  const seen = new Set<number>()
  const stack = [start]
  while (stack.length) {
    const id = stack.pop()!
    if (seen.has(id)) continue
    seen.add(id)
    const face = mesh.faces.get(id)
    if (!face) continue
    for (const eId of face.edgeIds) {
      if (blocked.has(eId)) continue
      const edge = mesh.edges.get(eId)
      if (!edge) continue
      for (const fId of edge.faceIds) if (!seen.has(fId)) stack.push(fId)
    }
  }
  return seen
}

function boundaryEdges(mesh: EditableMesh): number[] {
  return [...mesh.edges.values()].filter(e => e.faceIds.length === 1).map(e => e.id)
}

/** Closed loops of vertex ids from boundary (or selected) edges. */
export function edgeLoopsFromIds(mesh: EditableMesh, edgeIds: number[]): number[][] {
  const unused = new Set(edgeIds.filter(id => mesh.edges.has(id)))
  const loops: number[][] = []
  while (unused.size) {
    const start = mesh.edges.get([...unused][0])!
    unused.delete(start.id)
    const loop = [start.v1, start.v2]
    let guard = 0
    while (guard++ < mesh.edges.size + 2) {
      const tail = loop[loop.length - 1]
      let next: { id: number; other: number } | undefined
      for (const id of unused) {
        const e = mesh.edges.get(id)
        if (!e) continue
        if (e.v1 === tail) { next = { id, other: e.v2 }; break }
        if (e.v2 === tail) { next = { id, other: e.v1 }; break }
      }
      if (!next) break
      unused.delete(next.id)
      if (next.other === loop[0]) break
      loop.push(next.other)
    }
    if (loop.length >= 2) loops.push(loop)
  }
  return loops
}

export class MeshEditOps {
  static dissolveFaces(mesh: EditableMesh, faceIds: number[]): number {
    const set = new Set(faceIds.filter(id => mesh.faces.has(id)))
    if (set.size < 2) return 0
    const internal: number[] = []
    for (const edge of mesh.edges.values()) {
      if (edge.faceIds.length === 2 && set.has(edge.faceIds[0]!) && set.has(edge.faceIds[1]!)) {
        internal.push(edge.id)
      }
    }
    let n = 0
    for (const id of internal) {
      if (DissolveKernel.dissolveEdge(mesh, id)) n++
    }
    return n
  }

  static flipEdges(mesh: EditableMesh, edgeIds: number[]): number {
    let n = 0
    for (const id of edgeIds) {
      if (MeshTopologyService.flipEdge(mesh, id)) n++
    }
    return n
  }

  /** Reverse faces that point toward the mesh centroid so winding faces outward. */
  static recalculateOutside(mesh: EditableMesh): number {
    const center = new THREE.Vector3()
    let count = 0
    for (const v of mesh.vertices.values()) {
      center.add(v.position)
      count++
    }
    if (count === 0) return 0
    center.multiplyScalar(1 / count)
    let flipped = 0
    for (const face of mesh.faces.values()) {
      const mid = new THREE.Vector3()
      for (const id of face.vertexIds) mid.add(mesh.vertices.get(id)!.position)
      mid.multiplyScalar(1 / face.vertexIds.length)
      const outward = mid.clone().sub(center)
      if (outward.lengthSq() < 1e-12) continue
      if (face.normal.dot(outward) < 0) {
        mesh.reverseFace(face.id)
        flipped++
      }
    }
    mesh.recalculateNormals()
    return flipped
  }

  static connectVertexPath(mesh: EditableMesh, vertexIds: number[]): number {
    const ids = vertexIds.filter(id => mesh.vertices.has(id))
    if (ids.length < 2) return 0
    let n = 0
    for (let i = 0; i < ids.length - 1; i++) {
      if (mesh.findEdge(ids[i], ids[i + 1])) continue
      if (MeshTopologyService.connectVertices(mesh, ids[i], ids[i + 1])) n++
    }
    if (ids.length > 2 && !mesh.findEdge(ids[0], ids[ids.length - 1])) {
      const shared = [...mesh.faces.values()].some(f => f.vertexIds.includes(ids[0]) && f.vertexIds.includes(ids[ids.length - 1]))
      if (shared && MeshTopologyService.connectVertices(mesh, ids[0], ids[ids.length - 1])) n++
    }
    return n
  }

  static trisToQuads(mesh: EditableMesh, faceIds?: number[]): number {
    const allow = faceIds?.length ? new Set(faceIds) : null
    const candidates = [...mesh.edges.values()].filter(e => {
      if (e.faceIds.length !== 2) return false
      const a = mesh.faces.get(e.faceIds[0]!), b = mesh.faces.get(e.faceIds[1]!)
      if (!a || !b || a.vertexIds.length !== 3 || b.vertexIds.length !== 3) return false
      if (allow && (!allow.has(a.id) || !allow.has(b.id))) return false
      if (a.normal.dot(b.normal) < 0.85) return false
      return true
    })
    let n = 0
    for (const edge of candidates) {
      if (!mesh.edges.has(edge.id)) continue
      if (DissolveKernel.dissolveEdge(mesh, edge.id)) n++
    }
    return n
  }

  static makePlanarFaces(mesh: EditableMesh, faceIds: number[]): number {
    const faces = faceIds.map(id => mesh.faces.get(id)).filter((f): f is NonNullable<typeof f> => !!f)
    if (!faces.length) return 0
    const normal = new THREE.Vector3()
    const origin = new THREE.Vector3()
    let n = 0
    for (const face of faces) {
      normal.add(face.normal)
      for (const id of face.vertexIds) {
        origin.add(mesh.vertices.get(id)!.position)
        n++
      }
    }
    if (n === 0) return 0
    origin.multiplyScalar(1 / n)
    if (normal.lengthSq() < 1e-10) normal.set(0, 1, 0)
    else normal.normalize()
    const verts = new Set(faces.flatMap(f => f.vertexIds))
    for (const id of verts) {
      const v = mesh.vertices.get(id)!
      const delta = v.position.clone().sub(origin).dot(normal)
      v.position.addScaledVector(normal, -delta)
    }
    mesh.recalculateNormals()
    return verts.size
  }

  static fillHoles(mesh: EditableMesh): number[] {
    const created: number[] = []
    for (const loop of edgeLoopsFromIds(mesh, boundaryEdges(mesh))) {
      if (loop.length < 3) continue
      const id = MeshTopologyService.fillBoundary(mesh, loop)
      if (id != null) created.push(id)
    }
    mesh.recalculateNormals()
    return created
  }

  static limitedDissolve(mesh: EditableMesh, angleDeg = 5): number {
    const minDot = Math.cos(THREE.MathUtils.degToRad(Math.max(0, angleDeg)))
    const ids = [...mesh.edges.values()]
      .filter(e => e.faceIds.length === 2)
      .filter(e => {
        const a = mesh.faces.get(e.faceIds[0]!), b = mesh.faces.get(e.faceIds[1]!)
        return !!a && !!b && a.normal.dot(b.normal) >= minDot
      })
      .map(e => e.id)
    let n = 0
    for (const id of ids) {
      if (!mesh.edges.has(id)) continue
      if (DissolveKernel.dissolveEdge(mesh, id)) n++
    }
    for (const [id, v] of [...mesh.vertices]) {
      if (v.edgeIds.length === 2) MeshTopologyService.dissolveVertex(mesh, id)
    }
    return n
  }

  static deleteOnlyFaces(mesh: EditableMesh, faceIds: number[]): void {
    for (const id of faceIds) mesh.removeFace(id)
    mesh.recalculateNormals()
  }

  static deleteOnlyEdges(mesh: EditableMesh, edgeIds: number[]): void {
    const faces = new Set<number>()
    for (const id of edgeIds) {
      const e = mesh.edges.get(id)
      if (e) e.faceIds.forEach(f => faces.add(f))
    }
    for (const f of faces) mesh.removeFace(f, true)
    for (const id of edgeIds) {
      const e = mesh.edges.get(id)
      if (e && e.faceIds.length === 0) mesh.removeEdge(id)
    }
    for (const [id, v] of [...mesh.vertices]) {
      if (v.faceIds.length === 0 && v.edgeIds.length === 0) mesh.removeVertex(id)
    }
    mesh.recalculateNormals()
  }

  /** Duplicate verts along a cut so faces on one side disconnect (manifold-with-boundary, no wire edges). */
  static ripEdges(mesh: EditableMesh, edgeIds: number[]): number[] {
    const cut = new Set(edgeIds.filter(id => mesh.edges.get(id)?.faceIds.length === 2))
    if (!cut.size) return []
    const start = mesh.edges.get([...cut][0])!
    const seed = start.faceIds[0]
    const other = start.faceIds[1]
    const flooded = seed !== undefined ? floodFaces(mesh, seed, cut) : new Set<number>()
    const separating = other === undefined || !flooded.has(other)
    const moving = new Set<number>()
    if (separating) {
      const otherFlood = other !== undefined ? floodFaces(mesh, other, cut) : new Set<number>()
      const use = flooded.size <= otherFlood.size ? flooded : otherFlood
      for (const id of use) moving.add(id)
    } else {
      for (const id of cut) {
        const e = mesh.edges.get(id)
        if (e && e.faceIds[1] !== undefined) moving.add(e.faceIds[1])
      }
    }
    if (!moving.size && start.faceIds[0] !== undefined) moving.add(start.faceIds[0])
    const cutVerts = new Set<number>()
    for (const id of cut) {
      const e = mesh.edges.get(id)!
      cutVerts.add(e.v1)
      cutVerts.add(e.v2)
    }
    const dup = new Map<number, number>()
    for (const id of cutVerts) dup.set(id, dupVertex(mesh, id))
    for (const fId of moving) rewriteFace(mesh, fId, vid => dup.get(vid) ?? vid)
    mesh.recalculateNormals()
    return [...dup.values()]
  }

  static ripFill(mesh: EditableMesh, edgeIds: number[]): number[] {
    const before = new Set(boundaryEdges(mesh))
    this.ripEdges(mesh, edgeIds)
    const fresh = boundaryEdges(mesh).filter(id => !before.has(id))
    const loops = edgeLoopsFromIds(mesh, fresh)
    if (loops.length >= 2 && loops[0].length === loops[1].length) {
      MeshTopologyService.bridgeLoops(mesh, loops[0], [...loops[1]].reverse())
    }
    return [...mesh.faces.keys()]
  }

  /** Disconnect selected faces from neighbors while keeping them in this object. */
  static splitFaces(mesh: EditableMesh, faceIds: number[]): number[] {
    const selected = new Set(faceIds.filter(id => mesh.faces.has(id)))
    if (!selected.size) return []
    const border = new Set<number>()
    for (const fId of selected) {
      const face = mesh.faces.get(fId)!
      for (const vid of face.vertexIds) {
        const v = mesh.vertices.get(vid)!
        if (v.faceIds.some(id => !selected.has(id))) border.add(vid)
      }
    }
    const dup = new Map<number, number>()
    for (const id of border) dup.set(id, dupVertex(mesh, id))
    for (const fId of selected) rewriteFace(mesh, fId, vid => dup.get(vid) ?? vid)
    mesh.recalculateNormals()
    return [...dup.values(), ...[...selected].flatMap(id => mesh.faces.get(id)?.vertexIds ?? [])]
  }

  static offsetEdgeLoop(mesh: EditableMesh, startEdgeId: number, factor = 0.25): number[] {
    const t = THREE.MathUtils.clamp(factor, 0.02, 0.48)
    const result = LoopCutKernel.cutLoop(mesh, startEdgeId, [t, 1 - t])
    return result.newEdgeIds
  }

  static bisect(mesh: EditableMesh, plane: THREE.Plane, fill = true, clearInner = true): number[] {
    const splits: { edgeId: number; t: number }[] = []
    for (const edge of [...mesh.edges.values()]) {
      const a = mesh.vertices.get(edge.v1)!.position
      const b = mesh.vertices.get(edge.v2)!.position
      const da = plane.distanceToPoint(a)
      const db = plane.distanceToPoint(b)
      if (da === 0 || db === 0) continue
      if (da * db >= 0) continue
      const t = da / (da - db)
      if (t > 0.001 && t < 0.999) splits.push({ edgeId: edge.id, t })
    }
    const onPlane = new Set<number>()
    for (const split of splits) {
      const live = mesh.edges.get(split.edgeId)
      if (!live) continue
      const result = TopologyOps.splitEdge(mesh, live.id, split.t)
      if (result) onPlane.add(result.newVertexId)
    }
    for (const v of mesh.vertices.values()) {
      if (Math.abs(plane.distanceToPoint(v.position)) < 1e-6) onPlane.add(v.id)
    }
    for (const face of [...mesh.faces.values()]) {
      const ids = face.vertexIds.filter(id => onPlane.has(id))
      if (ids.length === 2 && !mesh.findEdge(ids[0], ids[1])) {
        TopologyOps.splitFace(mesh, face.id, ids[0], ids[1])
      }
    }
    if (clearInner) {
      for (const face of [...mesh.faces.values()]) {
        const mid = new THREE.Vector3()
        for (const id of face.vertexIds) mid.add(mesh.vertices.get(id)!.position)
        mid.multiplyScalar(1 / face.vertexIds.length)
        if (plane.distanceToPoint(mid) < -1e-6) mesh.removeFace(face.id)
      }
    }
    const created: number[] = []
    if (fill) {
      created.push(...this.fillHoles(mesh))
    }
    mesh.recalculateNormals()
    return created
  }

  static knifeProject(
    mesh: EditableMesh,
    polylines: THREE.Vector3[][],
    objectMatrix?: THREE.Matrix4
  ): void {
    const inv = objectMatrix ? objectMatrix.clone().invert() : new THREE.Matrix4()
    for (const line of polylines) {
      if (line.length < 2) continue
      const ids: number[] = []
      for (const world of line) {
        const local = world.clone().applyMatrix4(inv)
        ids.push(KnifeKernel.insertSurfaceVertex(mesh, local))
      }
      for (let i = 0; i < ids.length - 1; i++) {
        if (ids[i] === ids[i + 1]) continue
        if (mesh.findEdge(ids[i], ids[i + 1])) continue
        MeshTopologyService.connectVertices(mesh, ids[i], ids[i + 1])
      }
    }
    mesh.recalculateNormals()
  }

  static vertexBevel(mesh: EditableMesh, vertexIds: number[], width: number, segments = 1): void {
    const verts = new Set(vertexIds)
    const edges = [...mesh.edges.values()]
      .filter(e => verts.has(e.v1) || verts.has(e.v2))
      .map(e => e.id)
    const manifold = edges.filter(id => (mesh.edges.get(id)?.faceIds.length ?? 0) === 2)
    const boundary = edges.filter(id => (mesh.edges.get(id)?.faceIds.length ?? 0) === 1)
    if (manifold.length) bevelEdges(mesh, manifold, { width, segments, clampOverlap: true })
    if (boundary.length) this.bevelBoundaryEdges(mesh, boundary, width)
  }

  static bevelBoundaryEdges(mesh: EditableMesh, edgeIds: number[], width: number): void {
    const w = Math.max(1e-6, width)
    for (const eId of edgeIds) {
      const edge = mesh.edges.get(eId)
      if (!edge || edge.faceIds.length !== 1) continue
      const face = mesh.faces.get(edge.faceIds[0]!)
      if (!face) continue
      const a = mesh.vertices.get(edge.v1)!.position
      const b = mesh.vertices.get(edge.v2)!.position
      const dir = b.clone().sub(a)
      if (dir.lengthSq() < 1e-12) continue
      const inward = face.normal.clone().cross(dir).normalize()
      if (inward.lengthSq() < 1e-12) continue
      const nA = mesh.addVertex(a.clone().addScaledVector(inward, w))
      const nB = mesh.addVertex(b.clone().addScaledVector(inward, w))
      AttributeInterpolator.copyVertex(mesh.vertices.get(edge.v1)!, nA)
      AttributeInterpolator.copyVertex(mesh.vertices.get(edge.v2)!, nB)
      const idxA = face.vertexIds.indexOf(edge.v1)
      const nextIsB = face.vertexIds[(idxA + 1) % face.vertexIds.length] === edge.v2
      const ids = [...face.vertexIds]
      const uvs = face.uvs.map(uv => uv.clone())
      const i = nextIsB ? idxA : face.vertexIds.indexOf(edge.v2)
      const insertAt = i + 1
      ids.splice(insertAt, 0, nextIsB ? nA.id : nB.id, nextIsB ? nB.id : nA.id)
      uvs.splice(insertAt, 0, uvs[i]?.clone() ?? new THREE.Vector2(), uvs[(i + 1) % uvs.length]?.clone() ?? new THREE.Vector2())
      mesh.replaceFace(face.id, ids, uvs, face.materialIndex, face.color)
      mesh.addFace(
        nextIsB ? [edge.v1, edge.v2, nB.id, nA.id] : [edge.v2, edge.v1, nA.id, nB.id],
        undefined,
        face.materialIndex,
        face.color
      )
    }
    mesh.recalculateNormals()
  }

  static bridgeLoopsAdvanced(
    mesh: EditableMesh,
    loopA: number[],
    loopB: number[],
    segments = 1,
    twist = 0
  ): number[] {
    if (loopA.length < 2 || loopA.length !== loopB.length) return []
    const n = loopA.length
    const shift = ((Math.round(twist) % n) + n) % n
    const b = loopB.map((_, i) => loopB[(i + shift) % n]!)
    const rings = [loopA]
    const segs = Math.max(1, Math.min(16, Math.round(segments)))
    for (let s = 1; s < segs; s++) {
      const t = s / segs
      rings.push(loopA.map((id, i) => {
        const p = mesh.vertices.get(id)!.position.clone().lerp(mesh.vertices.get(b[i]!)!.position, t)
        return mesh.addVertex(p).id
      }))
    }
    rings.push(b)
    const created: number[] = []
    for (let r = 0; r < rings.length - 1; r++) {
      const a = rings[r], c = rings[r + 1]
      for (let i = 0; i < n; i++) {
        const id = MeshTopologyService.bridgeTwoEdges(mesh, a[i], a[(i + 1) % n], c[i], c[(i + 1) % n], false)
        if (id != null) created.push(id)
      }
    }
    mesh.recalculateNormals()
    return created
  }

  static spin(
    mesh: EditableMesh,
    vertexIds: number[],
    origin: THREE.Vector3,
    axis: THREE.Vector3,
    steps: number,
    angleDeg: number
  ): void {
    const profile = vertexIds.filter(id => mesh.vertices.has(id))
    if (profile.length < 2) return
    const count = Math.max(2, Math.min(64, Math.round(steps)))
    const axisN = axis.clone().normalize()
    const q = new THREE.Quaternion()
    const rings: number[][] = [profile]
    for (let s = 1; s <= count; s++) {
      const t = s / count
      q.setFromAxisAngle(axisN, THREE.MathUtils.degToRad(angleDeg) * t)
      rings.push(profile.map(id => {
        const p = mesh.vertices.get(id)!.position.clone().sub(origin).applyQuaternion(q).add(origin)
        const v = mesh.addVertex(p)
        AttributeInterpolator.copyVertex(mesh.vertices.get(id)!, v)
        return v.id
      }))
    }
    const closed = Math.abs(Math.abs(angleDeg) - 360) < 0.5
    const ringCount = closed ? rings.length - 1 : rings.length
    for (let r = 0; r < ringCount - 1; r++) {
      const a = rings[r]
      const b = rings[r + 1]
      for (let i = 0; i < a.length - 1; i++) {
        MeshTopologyService.bridgeTwoEdges(mesh, a[i], a[i + 1], b[i], b[i + 1], false)
      }
    }
    if (closed) {
      MergeKernel.mergeByDistance(mesh, 1e-5, [...rings[0], ...rings[rings.length - 1]])
    }
    mesh.recalculateNormals()
  }

  static extrudeManifold(mesh: EditableMesh, faceIds: number[]): ReturnType<typeof ExtrudeKernel.extrude> {
    return ExtrudeKernel.extrude(mesh, { faceIds, individual: false })
  }

  /**
   * After a region extrude has been translated, dissolve side walls that lie on
   * neighboring faces and weld coinciding verts so overlapping interiors vanish.
   */
  static cleanupManifoldExtrude(mesh: EditableMesh, capFaceIds: number[], newVertexIds: number[]): void {
    const cap = new Set(capFaceIds.filter(id => mesh.faces.has(id)))
    const neu = new Set(newVertexIds.filter(id => mesh.vertices.has(id)))
    if (!cap.size || !neu.size) return
    mesh.recalculateNormals()
    const dissolve: number[] = []
    for (const face of mesh.faces.values()) {
      if (cap.has(face.id)) continue
      const hasNew = face.vertexIds.some(id => neu.has(id))
      const hasOld = face.vertexIds.some(id => !neu.has(id))
      if (!hasNew || !hasOld) continue
      for (const eId of face.edgeIds) {
        const edge = mesh.edges.get(eId)
        if (!edge || edge.faceIds.length !== 2) continue
        const otherId = edge.faceIds[0] === face.id ? edge.faceIds[1] : edge.faceIds[0]
        if (otherId === undefined || cap.has(otherId)) continue
        const other = mesh.faces.get(otherId)
        if (other && face.normal.dot(other.normal) > 0.985) {
          dissolve.push(eId)
          break
        }
      }
    }
    for (const id of dissolve) {
      if (mesh.edges.has(id)) DissolveKernel.dissolveEdge(mesh, id)
    }
    const weld = new Set<number>(neu)
    for (const id of neu) {
      const v = mesh.vertices.get(id)
      if (!v) continue
      for (const other of mesh.vertices.values()) {
        if (other.id === id) continue
        if (v.position.distanceToSquared(other.position) < 1e-8) weld.add(other.id)
      }
    }
    if (weld.size) MergeKernel.mergeByDistance(mesh, 1e-4, [...weld])
    mesh.recalculateNormals()
  }

  static solidifyFaces(mesh: EditableMesh, faceIds: number[], thickness: number): void {
    const selected = new Set(faceIds.filter(id => mesh.faces.has(id)))
    if (!selected.size || Math.abs(thickness) < 1e-8) return
    const vertIds = new Set<number>()
    for (const id of selected) mesh.faces.get(id)!.vertexIds.forEach(v => vertIds.add(v))
    const normals = new Map<number, THREE.Vector3>()
    for (const id of vertIds) {
      const acc = new THREE.Vector3()
      const v = mesh.vertices.get(id)!
      for (const fId of v.faceIds) {
        if (!selected.has(fId)) continue
        acc.add(mesh.faces.get(fId)!.normal)
      }
      if (acc.lengthSq() < 1e-10) acc.set(0, 1, 0)
      else acc.normalize()
      normals.set(id, acc)
    }
    const shell = new Map<number, number>()
    for (const id of vertIds) {
      const v = mesh.vertices.get(id)!
      const nv = mesh.addVertex(v.position.clone().addScaledVector(normals.get(id)!, thickness))
      AttributeInterpolator.copyVertex(v, nv)
      shell.set(id, nv.id)
    }
    for (const fId of selected) {
      const face = mesh.faces.get(fId)!
      const ids = face.vertexIds.map(id => shell.get(id)!)
      mesh.addFace(ids, face.uvs.map(uv => uv.clone()), face.materialIndex, face.color)
    }
    for (const id of selected) {
      const face = mesh.faces.get(id)!
      for (let i = 0; i < face.vertexIds.length; i++) {
        const a = face.vertexIds[i]
        const b = face.vertexIds[(i + 1) % face.vertexIds.length]
        const edge = mesh.findEdge(a, b)
        const other = edge?.faceIds.find(f => f !== id)
        if (other !== undefined && selected.has(other)) continue
        MeshTopologyService.bridgeTwoEdges(mesh, a, b, shell.get(b)!, shell.get(a)!, false)
      }
    }
    mesh.recalculateNormals()
  }

  static symmetrize(mesh: EditableMesh, axis: 'x' | 'y' | 'z', threshold = 1e-4): void {
    const negative: number[] = []
    for (const face of mesh.faces.values()) {
      const mid = new THREE.Vector3()
      for (const id of face.vertexIds) mid.add(mesh.vertices.get(id)!.position)
      mid.multiplyScalar(1 / face.vertexIds.length)
      if (mid[axis] < -threshold) negative.push(face.id)
    }
    for (const id of negative) mesh.removeFace(id)
    for (const v of mesh.vertices.values()) {
      if (Math.abs(v.position[axis]) < threshold) v.position[axis] = 0
    }
    const keepFaces = [...mesh.faces.values()].filter(f => {
      const mid = new THREE.Vector3()
      for (const id of f.vertexIds) mid.add(mesh.vertices.get(id)!.position)
      mid.multiplyScalar(1 / f.vertexIds.length)
      return mid[axis] > threshold
    })
    const map = new Map<number, number>()
    for (const face of keepFaces) {
      for (const id of face.vertexIds) {
        if (map.has(id)) continue
        const src = mesh.vertices.get(id)!
        if (Math.abs(src.position[axis]) <= threshold) {
          map.set(id, id)
          continue
        }
        const p = src.position.clone()
        p[axis] *= -1
        const nv = mesh.addVertex(p)
        AttributeInterpolator.copyVertex(src, nv)
        map.set(id, nv.id)
      }
      const ids = [...face.vertexIds].reverse().map(id => map.get(id)!)
      const uvs = [...face.uvs].reverse().map(uv => uv.clone())
      mesh.addFace(ids, uvs, face.materialIndex, face.color)
    }
    MergeKernel.mergeByDistance(mesh, threshold)
    this.recalculateOutside(mesh)
  }

  static connectedFaceGroups(mesh: EditableMesh): number[][] {
    const remaining = new Set(mesh.faces.keys())
    const groups: number[][] = []
    while (remaining.size) {
      const start = [...remaining][0]!
      const group = floodFaces(mesh, start, new Set())
      groups.push([...group])
      for (const id of group) remaining.delete(id)
    }
    return groups
  }

  static shrinkFatten(mesh: EditableMesh, vertexIds: number[], distance: number): void {
    const ids = vertexIds.filter(id => mesh.vertices.has(id))
    for (const id of ids) {
      const v = mesh.vertices.get(id)!
      const n = new THREE.Vector3()
      for (const fId of v.faceIds) n.add(mesh.faces.get(fId)!.normal)
      if (n.lengthSq() < 1e-10) continue
      v.position.addScaledVector(n.normalize(), distance)
    }
    mesh.recalculateNormals()
  }

  static smoothVertices(mesh: EditableMesh, vertexIds: number[], factor = 0.5): void {
    const ids = vertexIds.filter(id => mesh.vertices.has(id))
    const next = new Map<number, THREE.Vector3>()
    for (const id of ids) {
      const v = mesh.vertices.get(id)!
      const acc = new THREE.Vector3()
      let n = 0
      for (const eId of v.edgeIds) {
        const e = mesh.edges.get(eId)!
        const other = e.v1 === id ? e.v2 : e.v1
        acc.add(mesh.vertices.get(other)!.position)
        n++
      }
      if (!n) continue
      acc.multiplyScalar(1 / n)
      next.set(id, v.position.clone().lerp(acc, THREE.MathUtils.clamp(factor, 0, 1)))
    }
    for (const [id, p] of next) mesh.vertices.get(id)!.position.copy(p)
    mesh.recalculateNormals()
  }

  static shear(mesh: EditableMesh, vertexIds: number[], axis: 'x' | 'y' | 'z', along: 'x' | 'y' | 'z', factor: number, origin: THREE.Vector3): void {
    if (axis === along) return
    for (const id of vertexIds) {
      const v = mesh.vertices.get(id)
      if (!v) continue
      v.position[along] += (v.position[axis] - origin[axis]) * factor
    }
    mesh.recalculateNormals()
  }

  static toSphere(mesh: EditableMesh, vertexIds: number[], factor: number, center: THREE.Vector3): void {
    const ids = vertexIds.filter(id => mesh.vertices.has(id))
    if (!ids.length) return
    let radius = 0
    for (const id of ids) radius += mesh.vertices.get(id)!.position.distanceTo(center)
    radius /= ids.length
    const t = THREE.MathUtils.clamp(factor, 0, 1)
    for (const id of ids) {
      const v = mesh.vertices.get(id)!
      const dir = v.position.clone().sub(center)
      if (dir.lengthSq() < 1e-12) dir.set(0, 1, 0)
      const target = center.clone().add(dir.normalize().multiplyScalar(radius))
      v.position.lerp(target, t)
    }
    mesh.recalculateNormals()
  }

  static randomizeVertices(mesh: EditableMesh, vertexIds: number[], amount: number, seed = 1): void {
    let s = seed || 1
    const rand = () => {
      s = (s * 16807) % 2147483647
      return (s - 1) / 2147483646
    }
    for (const id of vertexIds) {
      const v = mesh.vertices.get(id)
      if (!v) continue
      v.position.x += (rand() * 2 - 1) * amount
      v.position.y += (rand() * 2 - 1) * amount
      v.position.z += (rand() * 2 - 1) * amount
    }
    mesh.recalculateNormals()
  }

  static unsubdivide(mesh: EditableMesh): number {
    const dissolve: number[] = []
    for (const edge of mesh.edges.values()) {
      if (edge.faceIds.length !== 2) continue
      const a = mesh.faces.get(edge.faceIds[0]!), b = mesh.faces.get(edge.faceIds[1]!)
      if (!a || !b || a.vertexIds.length !== 4 || b.vertexIds.length !== 4) continue
      const va = mesh.vertices.get(edge.v1)!, vb = mesh.vertices.get(edge.v2)!
      if (va.edgeIds.length !== 4 && vb.edgeIds.length !== 4) continue
      if (va.edgeIds.length === 4 || vb.edgeIds.length === 4) dissolve.push(edge.id)
    }
    let n = 0
    for (const id of dissolve) {
      if (mesh.edges.has(id) && DissolveKernel.dissolveEdge(mesh, id)) n++
    }
    for (const [id, v] of [...mesh.vertices]) {
      if (v.edgeIds.length === 2) MeshTopologyService.dissolveVertex(mesh, id)
    }
    return n
  }

  static decimate(mesh: EditableMesh, ratio = 0.5): number {
    const target = Math.max(4, Math.floor(mesh.vertices.size * THREE.MathUtils.clamp(1 - ratio, 0.05, 0.95)))
    let collapsed = 0
    while (mesh.vertices.size > target) {
      let best: { a: number; b: number; d: number } | null = null
      for (const e of mesh.edges.values()) {
        if (e.faceIds.length === 0) continue
        const d = mesh.vertices.get(e.v1)!.position.distanceToSquared(mesh.vertices.get(e.v2)!.position)
        if (!best || d < best.d) best = { a: e.v1, b: e.v2, d }
      }
      if (!best) break
      const mid = mesh.vertices.get(best.a)!.position.clone().lerp(mesh.vertices.get(best.b)!.position, 0.5)
      MergeKernel.mergeVertices(mesh, [best.a, best.b], mid, best.a)
      collapsed++
      if (collapsed > mesh.vertices.size + 8) break
    }
    return collapsed
  }
}
