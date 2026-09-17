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
      const resolved = points.map(point => point.background ? -1 : this.resolvePointsToVertices(mesh, [point])[0])

      this.cutThroughPolyline(mesh, points, resolved, options)
    }

    mesh.recalculateNormals()
  }

  private static resolvePointsToVertices(mesh: EditableMesh, points: KnifePoint[]): number[] {
    const byEdge = new Map<number, { t: number; index: number }[]>()
    const resolved: Array<number | null> = points.map(() => null)

    points.forEach((pt, index) => {
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
      resolved[index] = this.insertSurfaceVertex(mesh, pt.world, pt.faceId)
    })

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

    return resolved.map((id, i) => {
      if (id !== null) return id
      return this.insertSurfaceVertex(mesh, points[i]!.world, points[i]!.faceId)
    })
  }

  /**
   * Put a cut vertex on the surface: reuse a nearby vert, split an edge, or poke the face.
   */
  static insertSurfaceVertex(mesh: EditableMesh, position: THREE.Vector3, preferredFaceId?: number): number {
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
      const poked = this.pokeFaceAt(mesh, onFace.faceId, onFace.point)
      if (poked !== null) return poked
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

  private static pokeFaceAt(mesh: EditableMesh, faceId: number, position: THREE.Vector3): number | null {
    const face = mesh.faces.get(faceId)
    if (!face || face.vertexIds.length < 3) return null
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
    const normal = face.normal
    const fanIsInside = positions.every((p, i) => p.clone().sub(position).cross(positions[(i + 1) % positions.length].clone().sub(position)).dot(normal) > 1e-12)
    const addWedge = (a: number, b: number) => {
      if (positions[a].clone().sub(position).cross(positions[b].clone().sub(position)).lengthSq() < 1e-20) return
      mesh.addFace([verts[a], verts[b], cId], [uvs[a], uvs[b], uvC.clone()], matIdx, color)
    }
    if (fanIsInside) {
      for (let i = 0; i < verts.length; i++) addWedge(i, (i + 1) % verts.length)
    } else {
      // Preserve regions outside the containing triangle on concave polygons.
      for (const indices of triangles) {
        let [a, b, c] = indices
        if (positions[b].clone().sub(positions[a]).cross(positions[c].clone().sub(positions[a])).dot(normal) < 0) [b, c] = [c, b]
        triangle.set(positions[a], positions[b], positions[c])
        if (triangle.containsPoint(position)) {
          addWedge(a, b); addWedge(b, c); addWedge(c, a)
        } else mesh.addFace([verts[a], verts[b], verts[c]], [uvs[a], uvs[b], uvs[c]], matIdx, color)
      }
    }
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
      const jobs = [...mesh.edges.values()].flatMap(edge => {
        const p = mesh.vertices.get(edge.v1)!.position, q = mesh.vertices.get(edge.v2)!.position
        const hit = ScreenGeometry.intersectSegments2D(a.screen, b.screen, project(p), project(q))
        if (!hit.hit || hit.tA < -1e-7 || hit.tA > 1 + 1e-7) return []
        const t = perspectiveEdgeParameter(hit.tB, p.clone().applyMatrix4(matrix), q.clone().applyMatrix4(matrix), options.camera)
        if (!Number.isFinite(t) || !visible(p.clone().lerp(q, t))) return []
        return [{ a: edge.v1, b: edge.v2, t, along: hit.tA, faces: [...edge.faceIds] }]
      })
      for (const job of jobs) {
        let id: number | undefined = job.t < 1e-5 ? job.a : job.t > 1 - 1e-5 ? job.b : undefined
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
