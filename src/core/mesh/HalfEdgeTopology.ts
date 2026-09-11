import * as THREE from 'three'
import { EditableMesh, MeshEdge } from './MeshKernel'

export interface BoundaryEdgeLoop {
  edgeIds: number[]
  orderedVertexIds: number[]
}

export class HalfEdgeTopology {
  /**
   * Identifies all boundary edges belonging to a set of selected faces.
   * An edge is a boundary edge if it is adjacent to exactly one selected face.
   */
  static findRegionBoundaryEdges(mesh: EditableMesh, selectedFaceIds: number[]): MeshEdge[] {
    const selFaceSet = new Set(selectedFaceIds)
    const boundaryEdges: MeshEdge[] = []

    for (const edge of mesh.edges.values()) {
      let count = 0
      for (const fId of edge.faceIds) {
        if (selFaceSet.has(fId)) {
          count++
        }
      }
      if (count === 1) {
        boundaryEdges.push(edge)
      }
    }

    return boundaryEdges
  }

  /**
   * Sorts boundary edges into contiguous oriented vertex loops for extrusion/inset.
   */
  static extractOrientedBoundaryLoops(mesh: EditableMesh, selectedFaceIds: number[]): BoundaryEdgeLoop[] {
    const boundaryEdges = this.findRegionBoundaryEdges(mesh, selectedFaceIds)
    const edgeSet = new Set(boundaryEdges.map(e => e.id))
    const loops: BoundaryEdgeLoop[] = []

    while (edgeSet.size > 0) {
      const firstEdgeId = edgeSet.values().next().value!
      edgeSet.delete(firstEdgeId)

      const firstEdge = mesh.edges.get(firstEdgeId)!
      const loopEdgeIds: number[] = [firstEdgeId]
      const loopVertexIds: number[] = [firstEdge.v1, firstEdge.v2]

      let currentVert = firstEdge.v2
      let isClosed = false

      while (!isClosed && edgeSet.size > 0) {
        let foundNext = false
        for (const candidateEdgeId of Array.from(edgeSet)) {
          const candidate = mesh.edges.get(candidateEdgeId)!
          if (candidate.v1 === currentVert) {
            loopEdgeIds.push(candidateEdgeId)
            loopVertexIds.push(candidate.v2)
            currentVert = candidate.v2
            edgeSet.delete(candidateEdgeId)
            foundNext = true
            break
          } else if (candidate.v2 === currentVert) {
            loopEdgeIds.push(candidateEdgeId)
            loopVertexIds.push(candidate.v1)
            currentVert = candidate.v1
            edgeSet.delete(candidateEdgeId)
            foundNext = true
            break
          }
        }

        if (!foundNext || currentVert === loopVertexIds[0]) {
          isClosed = true
        }
      }

      // Remove last duplicate vertex if closed
      if (loopVertexIds.length > 1 && loopVertexIds[loopVertexIds.length - 1] === loopVertexIds[0]) {
        loopVertexIds.pop()
      }

      loops.push({
        edgeIds: loopEdgeIds,
        orderedVertexIds: loopVertexIds
      })
    }

    return loops
  }

  /**
   * Computes the area-weighted average normal of a region of faces.
   */
  static computeRegionNormal(mesh: EditableMesh, faceIds: number[]): THREE.Vector3 {
    const totalNormal = new THREE.Vector3()

    for (const fId of faceIds) {
      const face = mesh.faces.get(fId)
      if (!face || face.vertexIds.length < 3) continue

      const p0 = mesh.vertices.get(face.vertexIds[0])?.position
      const p1 = mesh.vertices.get(face.vertexIds[1])?.position
      const p2 = mesh.vertices.get(face.vertexIds[2])?.position

      if (p0 && p1 && p2) {
        const vA = p1.clone().sub(p0)
        const vB = p2.clone().sub(p0)
        const cross = new THREE.Vector3().crossVectors(vA, vB)
        const area = cross.length() * 0.5
        if (area > 0.000001) {
          totalNormal.add(cross.normalize().multiplyScalar(area))
        }
      }
    }

    if (totalNormal.lengthSq() < 0.0001) {
      return new THREE.Vector3(0, 1, 0)
    }

    return totalNormal.normalize()
  }

  /**
   * Groups selected faces into islands that share an edge (Blender region inset / extrude).
   */
  static connectedFaceComponents(mesh: EditableMesh, faceIds: number[]): number[][] {
    const sel = new Set(faceIds.filter(id => mesh.faces.has(id)))
    const visited = new Set<number>()
    const components: number[][] = []

    for (const start of sel) {
      if (visited.has(start)) continue
      const stack = [start]
      visited.add(start)
      const comp: number[] = []
      while (stack.length) {
        const fId = stack.pop()!
        comp.push(fId)
        const face = mesh.faces.get(fId)
        if (!face) continue
        for (const eId of face.edgeIds) {
          const edge = mesh.edges.get(eId)
          if (!edge) continue
          for (const nId of edge.faceIds) {
            if (sel.has(nId) && !visited.has(nId)) {
              visited.add(nId)
              stack.push(nId)
            }
          }
        }
      }
      components.push(comp)
    }
    return components
  }

  /**
   * Edge loop: consecutive edges along valence-4 vertices.
   */
  static findEdgeLoop(mesh: EditableMesh, startEdgeId: number): number[] {
    const start = mesh.edges.get(startEdgeId)
    if (!start) return []

    const loop: number[] = [startEdgeId]
    const visited = new Set<number>([startEdgeId])

    const walk = (fromEdge: number, fromVertex: number) => {
      let edgeId = fromEdge
      let vertexId = fromVertex
      while (true) {
        const nextId = HalfEdgeTopology.nextLoopEdge(mesh, edgeId, vertexId)
        if (nextId === null || visited.has(nextId)) break
        visited.add(nextId)
        loop.push(nextId)
        const next = mesh.edges.get(nextId)
        if (!next) break
        edgeId = nextId
        vertexId = next.v1 === vertexId ? next.v2 : next.v1
      }
    }

    walk(startEdgeId, start.v1)
    walk(startEdgeId, start.v2)
    return loop
  }

  /** At a valence-4 vertex, the loop continues on the edge that shares no face with `edgeId`. */
  static nextLoopEdge(mesh: EditableMesh, edgeId: number, vertexId: number): number | null {
    const vertex = mesh.vertices.get(vertexId)
    const edge = mesh.edges.get(edgeId)
    if (!vertex || !edge || vertex.edgeIds.length !== 4) return null
    const startFaces = new Set(edge.faceIds)
    for (const candidateId of vertex.edgeIds) {
      if (candidateId === edgeId) continue
      const candidate = mesh.edges.get(candidateId)
      if (!candidate) continue
      if (candidate.faceIds.some((fId) => startFaces.has(fId))) continue
      return candidateId
    }
    return null
  }

  /**
   * Edge ring: opposite sides of even n-gons, walking by face loops (no twin required).
   * Loop Cut splits every edge in this ring.
   */
  static findEdgeRing(mesh: EditableMesh, startEdgeId: number): number[] {
    if (!mesh.edges.has(startEdgeId)) return []
    const ring: number[] = [startEdgeId]
    const visited = new Set<number>([startEdgeId])
    const queue = [startEdgeId]

    while (queue.length > 0) {
      const eId = queue.shift()!
      const edge = mesh.edges.get(eId)
      if (!edge) continue
      for (const fId of edge.faceIds) {
        const face = mesh.faces.get(fId)
        if (!face) continue
        const opp = this.oppositeEdgeOnFace(mesh, face, eId)
        if (opp === null || visited.has(opp)) continue
        visited.add(opp)
        ring.push(opp)
        queue.push(opp)
      }
    }

    return ring
  }

  /** Opposite side of an even n-gon, or null on tris / odd n-gons. */
  static oppositeEdgeOnFace(mesh: EditableMesh, face: { vertexIds: number[] }, edgeId: number): number | null {
    const n = face.vertexIds.length
    if (n < 4 || n % 2 !== 0) return null
    const verts = face.vertexIds
    let side = -1
    for (let i = 0; i < n; i++) {
      const id = this.edgeIdBetween(mesh, verts[i]!, verts[(i + 1) % n]!)
      if (id === edgeId) {
        side = i
        break
      }
    }
    if (side < 0) return null
    const j = (side + n / 2) % n
    return this.edgeIdBetween(mesh, verts[j]!, verts[(j + 1) % n]!)
  }

  private static edgeIdBetween(mesh: EditableMesh, a: number, b: number): number | null {
    const minV = Math.min(a, b)
    const maxV = Math.max(a, b)
    for (const edge of mesh.edges.values()) {
      if (edge.v1 === minV && edge.v2 === maxV) return edge.id
    }
    return null
  }
}
