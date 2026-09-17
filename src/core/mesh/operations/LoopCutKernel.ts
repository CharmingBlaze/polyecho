import * as THREE from 'three'
import { EditableMesh } from '../MeshKernel'
import { KnifeKernel } from './KnifeKernel'
import { TopologyOps } from './TopologyOps'

export interface LoopCutResult { mesh: EditableMesh; newEdgeIds: number[]; newVertexIds: number[] }
export interface LoopCutPreviewSegment { p1: THREE.Vector3; p2: THREE.Vector3 }
interface RingEdge { id: number; from: number; to: number }
interface RingLayout { edges: Map<number, RingEdge>; pairs: { a: RingEdge; b: RingEdge }[] }

export class LoopCutKernel {
  /** Carry a consistent direction through opposite quad edges, independent of vertex ids. */
  private static layout(mesh: EditableMesh, startEdgeId: number): RingLayout {
    const edges = new Map<number, RingEdge>()
    const pairs: RingLayout['pairs'] = []
    const start = mesh.edges.get(startEdgeId)
    if (!start || start.faceIds.length > 2) return { edges, pairs }
    const queue: RingEdge[] = [{ id: start.id, from: start.v1, to: start.v2 }]
    edges.set(start.id, queue[0])
    const visited = new Set<number>()
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const a = queue[cursor]
      for (const faceId of mesh.edges.get(a.id)!.faceIds) {
        if (visited.has(faceId)) continue
        const face = mesh.faces.get(faceId)
        if (!face || face.vertexIds.length !== 4) continue
        const vs = face.vertexIds
        const i = vs.findIndex((v, j) => (v === a.from && vs[(j+1)%4] === a.to) || (v === a.to && vs[(j+1)%4] === a.from))
        if (i < 0) continue
        const forward = vs[i] === a.from
        const from = vs[(i + (forward ? 3 : 2)) % 4]
        const to = vs[(i + (forward ? 2 : 3)) % 4]
        const opposite = mesh.findEdge(from, to)
        if (!opposite || opposite.faceIds.length > 2) continue
        visited.add(faceId)
        let b = edges.get(opposite.id)
        // A twisted/nonorientable ring has no consistent slide direction.
        if (b && b.from !== from) return { edges: new Map(), pairs: [] }
        if (!b) { b = { id: opposite.id, from, to }; edges.set(b.id,b); queue.push(b) }
        pairs.push({a,b})
      }
    }
    return pairs.length ? { edges, pairs } : { edges: new Map(), pairs: [] }
  }

  static ringEdges(mesh: EditableMesh, startEdgeId: number): number[] {
    return [...this.layout(mesh,startEdgeId).edges.keys()]
  }

  static previewSegments(mesh: EditableMesh, startEdgeId: number, parameters: number[]): LoopCutPreviewSegment[] {
    const { pairs } = this.layout(mesh,startEdgeId)
    const params = this.normalizedParams(parameters)
    const point = (edge: RingEdge, t: number) => mesh.vertices.get(edge.from)!.position.clone().lerp(mesh.vertices.get(edge.to)!.position,t)
    return pairs.flatMap(({a,b}) => params.map(t => ({p1:point(a,t),p2:point(b,t)})))
  }

  static cutLoop(mesh: EditableMesh, startEdgeId: number, parameters: number[] | number = 0.5): LoopCutResult {
    const params = this.normalizedParams(Array.isArray(parameters) ? parameters : [parameters])
    const { edges, pairs } = this.layout(mesh,startEdgeId)
    const newVertexIds: number[] = [], newEdgeIds: number[] = []
    const cuts = new Map<number, number[]>()
    for (const edge of edges.values()) {
      const live = mesh.findEdge(edge.from, edge.to)
      if (!live) continue
      const localParams = params.map(t => live.v1 === edge.from ? t : 1-t)
      const inserted = KnifeKernel.splitEdgeAtParameters(mesh,live.id,localParams)
      const ids = localParams.map(t => inserted.get(KnifeKernel.tKey(t))!)
      cuts.set(edge.id,ids); newVertexIds.push(...ids)
    }
    for (const {a,b} of pairs) {
      const first = cuts.get(a.id), second = cuts.get(b.id)
      if (!first || !second) continue
      for (let i = 0; i < params.length; i++) {
        const faceId = mesh.vertices.get(first[i])!.faceIds.find(id => mesh.faces.get(id)?.vertexIds.includes(second[i]))
        if (faceId === undefined) continue
        const split = TopologyOps.splitFaceUnchecked(mesh,faceId,first[i],second[i])
        if (split) newEdgeIds.push(split.connectingEdgeId)
      }
    }
    mesh.recalculateNormals()
    return {mesh,newVertexIds,newEdgeIds}
  }

  private static normalizedParams(parameters: number[]): number[] {
    const values = parameters.filter(Number.isFinite).map(t => Number(Math.max(0.001,Math.min(0.999,t)).toFixed(6)))
    return values.length ? [...new Set(values)].sort((a,b)=>a-b) : [0.5]
  }
}
