import * as THREE from 'three'
import { EditableMesh, MeshFace } from '../MeshKernel'
import { HalfEdgeTopology } from '../HalfEdgeTopology'
import { KnifeKernel } from './KnifeKernel'
import { TopologyOps } from './TopologyOps'

export interface LoopCutResult {
  mesh: EditableMesh
  newEdgeIds: number[]
  newVertexIds: number[]
}

export interface LoopCutPreviewSegment {
  p1: THREE.Vector3
  p2: THREE.Vector3
}

interface CutPair {
  face: MeshFace
  vA0: number
  vA1: number
  vB0: number
  vB1: number
  edgeA: number
  edgeB: number
  aV1: number
  aV2: number
  bV1: number
  bV2: number
}

export class LoopCutKernel {
  static ringEdges(mesh: EditableMesh, startEdgeId: number): number[] {
    return HalfEdgeTopology.findEdgeRing(mesh, startEdgeId)
  }

  static previewSegments(
    mesh: EditableMesh,
    startEdgeId: number,
    parameters: number[]
  ): LoopCutPreviewSegment[] {
    const ring = this.ringEdges(mesh, startEdgeId)
    const pairs = this.cutPairs(mesh, ring)
    const pairedFaces = new Set(pairs.map((p) => p.face.id))
    const params = this.normalizedParams(parameters)
    const segments: LoopCutPreviewSegment[] = []

    for (const pair of pairs) {
      const pA0 = mesh.vertices.get(pair.vA0)?.position
      const pA1 = mesh.vertices.get(pair.vA1)?.position
      const pB0 = mesh.vertices.get(pair.vB0)?.position
      const pB1 = mesh.vertices.get(pair.vB1)?.position
      if (!pA0 || !pA1 || !pB0 || !pB1) continue
      for (const t of params) {
        segments.push({
          p1: pA0.clone().lerp(pA1, t),
          p2: pB0.clone().lerp(pB1, t),
        })
      }
    }

    const ringSet = new Set(ring)
    for (const eId of ring) {
      const edge = mesh.edges.get(eId)
      if (!edge) continue
      const p1 = mesh.vertices.get(edge.v1)?.position
      const p2 = mesh.vertices.get(edge.v2)?.position
      if (!p1 || !p2) continue
      for (const fId of edge.faceIds) {
        if (pairedFaces.has(fId)) continue
        const face = mesh.faces.get(fId)
        if (!face) continue
        const far = this.unpairedPreviewTarget(mesh, face, eId, ringSet)
        if (!far) continue
        for (const t of params) {
          segments.push({
            p1: p1.clone().lerp(p2, t),
            p2: far.clone(),
          })
        }
      }
    }

    return segments
  }

  /**
   * Split a ring of edges (quad belts, even n-gons, or a single tri edge) with shared vertices.
   */
  static cutLoop(mesh: EditableMesh, startEdgeId: number, parameters: number[] | number = 0.5): LoopCutResult {
    const params = this.normalizedParams(Array.isArray(parameters) ? parameters : [parameters])
    const ring = this.ringEdges(mesh, startEdgeId)
    const pairs = this.cutPairs(mesh, ring)

    const newVertexIds: number[] = []
    const newEdgeIds: number[] = []
    const cutsOnEnds = new Map<string, number[]>()

    const endKey = (a: number, b: number) => `${Math.min(a, b)}:${Math.max(a, b)}`
    const ringEnds: { v1: number; v2: number }[] = []
    for (const eId of ring) {
      const edge = mesh.edges.get(eId)
      if (edge) ringEnds.push({ v1: edge.v1, v2: edge.v2 })
    }

    for (const ends of ringEnds) {
      const liveId = this.findEdgeId(mesh, ends.v1, ends.v2)
      if (liveId === null) continue
      const created = KnifeKernel.splitEdgeAtParameters(mesh, liveId, params)
      const ids = params.map((t) => created.get(KnifeKernel.tKey(t))).filter((id): id is number => id !== undefined)
      cutsOnEnds.set(endKey(ends.v1, ends.v2), ids)
      newVertexIds.push(...ids)
    }

    for (const pair of pairs) {
      const cutsA = this.cutsAlongWalk(pair.aV1, pair.aV2, pair.vA0, pair.vA1, cutsOnEnds.get(endKey(pair.aV1, pair.aV2)) ?? [])
      const cutsB = this.cutsAlongWalk(pair.bV1, pair.bV2, pair.vB0, pair.vB1, cutsOnEnds.get(endKey(pair.bV1, pair.bV2)) ?? [])
      if (cutsA.length !== params.length || cutsB.length !== params.length) continue
      for (let i = 0; i < params.length; i++) {
        const a = cutsA[i]!
        const b = cutsB[i]!
        const faceId = this.sharedFace(mesh, a, b)
        if (faceId === null) continue
        const split = TopologyOps.splitFace(mesh, faceId, a, b)
        if (split) newEdgeIds.push(split.connectingEdgeId)
      }
    }

    mesh.recalculateNormals()
    return {
      mesh,
      newEdgeIds: [...new Set(newEdgeIds)],
      newVertexIds,
    }
  }

  private static normalizedParams(parameters: number[]): number[] {
    const unique = [...new Set(parameters.map((t) => Math.max(0.01, Math.min(0.99, t))))]
    unique.sort((a, b) => a - b)
    return unique.length > 0 ? unique : [0.5]
  }

  private static cutsAlongWalk(
    edgeV1: number,
    edgeV2: number,
    vFrom: number,
    vTo: number,
    cutsV1ToV2: number[]
  ): number[] {
    if (edgeV1 === vFrom && edgeV2 === vTo) return [...cutsV1ToV2]
    if (edgeV1 === vTo && edgeV2 === vFrom) return [...cutsV1ToV2].reverse()
    return []
  }

  private static sharedFace(mesh: EditableMesh, a: number, b: number): number | null {
    const va = mesh.vertices.get(a)
    if (!va) return null
    for (const fId of va.faceIds) {
      const face = mesh.faces.get(fId)
      if (face?.vertexIds.includes(b)) return fId
    }
    return null
  }

  private static unpairedPreviewTarget(
    mesh: EditableMesh,
    face: MeshFace,
    edgeId: number,
    ringSet: Set<number>
  ): THREE.Vector3 | null {
    const verts = face.vertexIds
    const n = verts.length
    let side = -1
    for (let i = 0; i < n; i++) {
      const id = this.findEdgeId(mesh, verts[i]!, verts[(i + 1) % n]!)
      if (id === edgeId) {
        side = i
        break
      }
    }
    if (side < 0) return null

    if (n === 3) {
      const opp = mesh.vertices.get(verts[(side + 2) % 3]!)?.position
      return opp?.clone() ?? null
    }

    const centroid = new THREE.Vector3()
    let count = 0
    for (let i = 0; i < n; i++) {
      const id = this.findEdgeId(mesh, verts[i]!, verts[(i + 1) % n]!)
      if (id !== null && ringSet.has(id)) continue
      const p = mesh.vertices.get(verts[i]!)?.position
      if (!p) continue
      centroid.add(p)
      count++
    }
    if (count === 0) return null
    return centroid.multiplyScalar(1 / count)
  }

  private static cutPairs(mesh: EditableMesh, ringEdgeIds: number[]): CutPair[] {
    const ringSet = new Set(ringEdgeIds)
    const pairs: CutPair[] = []
    const visited = new Set<number>()

    for (const eId of ringEdgeIds) {
      const edge = mesh.edges.get(eId)
      if (!edge) continue
      for (const fId of edge.faceIds) {
        if (visited.has(fId)) continue
        const face = mesh.faces.get(fId)
        if (!face) continue
        visited.add(fId)

        const n = face.vertexIds.length
        if (n < 4 || n % 2 !== 0) continue
        const verts = face.vertexIds
        const ringSides: number[] = []
        for (let i = 0; i < n; i++) {
          const sideId = this.findEdgeId(mesh, verts[i]!, verts[(i + 1) % n]!)
          if (sideId !== null && ringSet.has(sideId)) ringSides.push(i)
        }
        if (ringSides.length !== 2) continue
        const i0 = ringSides[0]!
        const i1 = ringSides[1]!
        const half = n / 2
        if ((i0 + half) % n !== i1 && (i1 + half) % n !== i0) continue

        const vA0 = verts[i0]!
        const vA1 = verts[(i0 + 1) % n]!
        const vB0 = verts[(i0 + half + 1) % n]!
        const vB1 = verts[(i0 + half) % n]!
        const edgeA = this.findEdgeId(mesh, vA0, vA1)
        const edgeB = this.findEdgeId(mesh, vB0, vB1)
        const eA = edgeA !== null ? mesh.edges.get(edgeA) : undefined
        const eB = edgeB !== null ? mesh.edges.get(edgeB) : undefined
        if (edgeA === null || edgeB === null || !eA || !eB) continue
        pairs.push({
          face,
          vA0,
          vA1,
          vB0,
          vB1,
          edgeA,
          edgeB,
          aV1: eA.v1,
          aV2: eA.v2,
          bV1: eB.v1,
          bV2: eB.v2,
        })
      }
    }
    return pairs
  }

  private static findEdgeId(mesh: EditableMesh, a: number, b: number): number | null {
    const minV = Math.min(a, b)
    const maxV = Math.max(a, b)
    for (const edge of mesh.edges.values()) {
      if (edge.v1 === minV && edge.v2 === maxV) return edge.id
    }
    return null
  }
}
