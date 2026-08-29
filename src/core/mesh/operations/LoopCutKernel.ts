import { EditableMesh } from '../MeshKernel'
import { HalfEdgeTopology } from '../HalfEdgeTopology'

export interface LoopCutResult {
  mesh: EditableMesh
  newEdgeIds: number[]
  newVertexIds: number[]
}

export class LoopCutKernel {
  /**
   * Cuts a continuous quad loop along an edge ring at parameter factor (0 < factor < 1).
   */
  static cutLoop(mesh: EditableMesh, startEdgeId: number, factor = 0.5): LoopCutResult {
    const ringEdgeIds = HalfEdgeTopology.findEdgeRing(mesh, startEdgeId)
    const newEdgeIds: number[] = []
    const newVertexIds: number[] = []

    // Map from cut edge ID -> new interpolated midpoint vertex ID
    const edgeMidpointMap = new Map<number, number>()

    for (const eId of ringEdgeIds) {
      const edge = mesh.edges.get(eId)
      if (!edge) continue

      const p1 = mesh.vertices.get(edge.v1)?.position
      const p2 = mesh.vertices.get(edge.v2)?.position
      if (!p1 || !p2) continue

      const cutPos = p1.clone().lerp(p2, factor)
      const newV = mesh.addVertex(cutPos)
      edgeMidpointMap.set(eId, newV.id)
      newVertexIds.push(newV.id)
    }

    // Split quad faces crossed by the cut
    const visitedFaces = new Set<number>()

    for (const eId of ringEdgeIds) {
      const edge = mesh.edges.get(eId)
      if (!edge) continue

      for (const fId of edge.faceIds) {
        if (visitedFaces.has(fId)) continue
        const face = mesh.faces.get(fId)
        if (!face || face.vertexIds.length !== 4) continue // Quad loop cut

        // Find which two opposite edges in this quad are cut
        const oppEdgesInQuad = face.edgeIds.filter(eid => edgeMidpointMap.has(eid))
        if (oppEdgesInQuad.length === 2) {
          visitedFaces.add(fId)

          const eA = oppEdgesInQuad[0]
          const eB = oppEdgesInQuad[1]
          const vMidA = edgeMidpointMap.get(eA)!
          const vMidB = edgeMidpointMap.get(eB)!

          const origVerts = [...face.vertexIds]
          const matIdx = face.materialIndex
          const color = face.color

          mesh.removeFace(fId)

          // Subdivide quad into two new quads [v0, v1, vMidA, vMidB] and [vMidB, vMidA, v2, v3]
          const q1 = mesh.addFace([origVerts[0], origVerts[1], vMidA, vMidB], undefined, matIdx, color)
          const q2 = mesh.addFace([vMidB, vMidA, origVerts[2], origVerts[3]], undefined, matIdx, color)

          const cutEdge = mesh.getOrCreateEdge(vMidA, vMidB)
          newEdgeIds.push(cutEdge.id)

          if (q1) visitedFaces.add(q1.id)
          if (q2) visitedFaces.add(q2.id)
        }
      }
    }

    mesh.recalculateNormals()

    return {
      mesh,
      newEdgeIds,
      newVertexIds
    }
  }
}
