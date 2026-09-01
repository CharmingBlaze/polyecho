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
   * Edge Loop traversal: steps across quad faces to find contiguous parallel edge chains.
   */
  static findEdgeLoop(mesh: EditableMesh, startEdgeId: number): number[] {
    const loop: number[] = [startEdgeId]
    const visited = new Set<number>([startEdgeId])

    // Traverse in both half-edge directions
    for (const startHeId of mesh.edges.get(startEdgeId)?.halfEdgeIds || []) {
      let curHe = mesh.halfEdges.get(startHeId)

      while (curHe) {
        const face = mesh.faces.get(curHe.faceId)
        if (!face || face.vertexIds.length !== 4) break // Only quad topology supports pure loops

        // Opposite edge in a quad is next.next
        const next1 = mesh.halfEdges.get(curHe.nextId)
        const next2 = next1 ? mesh.halfEdges.get(next1.nextId) : null
        if (!next2) break

        const oppEdgeId = next2.edgeId
        if (visited.has(oppEdgeId)) break

        loop.push(oppEdgeId)
        visited.add(oppEdgeId)

        // Step through twin to continue into next face
        if (next2.twinId !== null) {
          curHe = mesh.halfEdges.get(next2.twinId)
        } else {
          break
        }
      }
    }

    return loop
  }

  /**
   * Edge Ring traversal: parallel edges traversing across adjacent quad strips.
   */
  static findEdgeRing(mesh: EditableMesh, startEdgeId: number): number[] {
    const ring: number[] = [startEdgeId]
    const visited = new Set<number>([startEdgeId])

    for (const startHeId of mesh.edges.get(startEdgeId)?.halfEdgeIds || []) {
      let curHe = mesh.halfEdges.get(startHeId)

      while (curHe) {
        const face = mesh.faces.get(curHe.faceId)
        if (!face || face.vertexIds.length !== 4) break

        // Next edge in quad ring is next
        const nextHe = mesh.halfEdges.get(curHe.nextId)
        if (!nextHe) break

        const nextEdgeId = nextHe.edgeId
        if (visited.has(nextEdgeId)) break

        ring.push(nextEdgeId)
        visited.add(nextEdgeId)

        if (nextHe.twinId !== null) {
          curHe = mesh.halfEdges.get(nextHe.twinId)
        } else {
          break
        }
      }
    }

    return ring
  }
}
