import * as THREE from 'three'
import { ScreenGeometry, type ViewQuadrant } from '../../geometry/ScreenGeometry'
import { EditableMesh } from '../MeshKernel'
import { TopologyOps } from './TopologyOps'

export type KnifeTargetType = 'VERTEX' | 'EDGE' | 'FACE' | 'MIDPOINT'

export interface KnifePoint {
  world: THREE.Vector3
  screen: THREE.Vector2
  targetType: KnifeTargetType
  vertexId?: number
  edgeId?: number
  faceId?: number
  edgeT?: number
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

  static applyCuts(mesh: EditableMesh, points: KnifePoint[], options: KnifeCutOptions) {
    if (points.length < 2) return
    const resolved = this.resolvePointsToVertices(mesh, points)

    if (options.cutThrough) {
      this.cutThroughPolyline(mesh, points, resolved, options)
    } else {
      this.connectSurfacePolyline(mesh, resolved)
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
        const t = Math.max(0.01, Math.min(0.99, pt.edgeT ?? 0.5))
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
        const t = Math.max(0.01, Math.min(0.99, edgeHit.t))
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
      const p0 = mesh.vertices.get(face.vertexIds[0]!)?.position
      if (!p0) return
      for (let i = 1; i < face.vertexIds.length - 1; i++) {
        const p1 = mesh.vertices.get(face.vertexIds[i]!)?.position
        const p2 = mesh.vertices.get(face.vertexIds[i + 1]!)?.position
        if (!p1 || !p2) continue
        tri.set(p0, p1, p2)
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
    const uvC = new THREE.Vector2()
    for (const uv of uvs) uvC.add(uv)
    uvC.multiplyScalar(1 / Math.max(1, uvs.length))
    const cId = mesh.addVertex(position.clone()).id
    mesh.removeFace(faceId)
    for (let i = 0; i < verts.length; i++) {
      mesh.addFace(
        [verts[i]!, verts[(i + 1) % verts.length]!, cId],
        [uvs[i]!, uvs[(i + 1) % verts.length]!, uvC.clone()],
        matIdx,
        color
      )
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

    const unique = [...new Set(parameters.map((t) => this.tKey(Math.max(0.01, Math.min(0.99, t)))))]
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
      mesh.removeFace(fId)
      mesh.addFace(newVertIds, newUvs, matIdx, color, fId)
    }

    mesh.removeEdge(edgeId)
    let prev = vA
    for (const id of newIds) {
      mesh.getOrCreateEdge(prev, id)
      prev = id
    }
    mesh.getOrCreateEdge(prev, vB)
    return out
  }

  private static connectSurfacePolyline(mesh: EditableMesh, vertexIds: number[]) {
    for (let i = 0; i < vertexIds.length - 1; i++) {
      this.splitSharedFace(mesh, vertexIds[i]!, vertexIds[i + 1]!)
    }
  }

  private static splitSharedFace(mesh: EditableMesh, vA: number, vB: number) {
    if (vA === vB) return
    for (const [fId, face] of mesh.faces) {
      if (face.vertexIds.includes(vA) && face.vertexIds.includes(vB)) {
        TopologyOps.splitFace(mesh, fId, vA, vB)
        return
      }
    }
  }

  private static cutThroughPolyline(
    mesh: EditableMesh,
    points: KnifePoint[],
    resolved: number[],
    options: KnifeCutOptions
  ) {
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]!
      const b = points[i + 1]!
      const chain: number[] = [resolved[i]!]
      const hits: { tA: number; edgeId: number; tEdge: number }[] = []

      for (const [eId, edge] of mesh.edges) {
        const p1 = mesh.vertices.get(edge.v1)?.position
        const p2 = mesh.vertices.get(edge.v2)?.position
        if (!p1 || !p2) continue
        const w1 = options.objectMatrix ? p1.clone().applyMatrix4(options.objectMatrix) : p1
        const w2 = options.objectMatrix ? p2.clone().applyMatrix4(options.objectMatrix) : p2
        const s1 = ScreenGeometry.worldToScreen(w1, options.camera, options.viewportRect, options.quadrant)
        const s2 = ScreenGeometry.worldToScreen(w2, options.camera, options.viewportRect, options.quadrant)
        const hit = ScreenGeometry.intersectSegments2D(a.screen, b.screen, s1, s2)
        if (!hit.hit) continue
        if (hit.tA <= 0.02 || hit.tA >= 0.98) continue
        if (hit.tB <= 0.02 || hit.tB >= 0.98) continue
        hits.push({ tA: hit.tA, edgeId: eId, tEdge: hit.tB })
      }

      hits.sort((x, y) => x.tA - y.tA)
      const jobs: { tA: number; v1: number; v2: number; tEdge: number }[] = []
      for (const hit of hits) {
        const edge = mesh.edges.get(hit.edgeId)
        if (!edge) continue
        jobs.push({ tA: hit.tA, v1: edge.v1, v2: edge.v2, tEdge: hit.tEdge })
      }

      const createdByEnds = new Map<string, Map<string, number>>()
      const endKey = (a: number, b: number) => `${Math.min(a, b)}:${Math.max(a, b)}`
      const grouped = new Map<string, number[]>()
      for (const job of jobs) {
        const k = endKey(job.v1, job.v2)
        const list = grouped.get(k) ?? []
        list.push(job.tEdge)
        grouped.set(k, list)
      }
      for (const [k, ts] of grouped) {
        const [v1, v2] = k.split(':').map(Number)
        const liveId = this.findEdgeId(mesh, v1!, v2!)
        if (liveId === null) continue
        createdByEnds.set(k, this.splitEdgeAtParameters(mesh, liveId, ts))
      }

      for (const job of jobs) {
        const created = createdByEnds.get(endKey(job.v1, job.v2))
        const id = created?.get(this.tKey(job.tEdge))
        if (id !== undefined) chain.push(id)
      }
      chain.push(resolved[i + 1]!)

      for (let c = 0; c < chain.length - 1; c++) {
        this.splitSharedFace(mesh, chain[c]!, chain[c + 1]!)
      }
    }
  }

  static tKey(t: number): string {
    return (Math.round(t * 1e5) / 1e5).toFixed(5)
  }
}
