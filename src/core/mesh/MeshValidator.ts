import { EditableMesh } from './MeshKernel'

export interface MeshValidationResult {
  valid: boolean
  brokenHalfEdges: number[]
  nonManifoldEdges: number[]
  orphanVertices: number[]
  zeroAreaFaces: number[]
}

export class MeshValidator {
  static validate(mesh: EditableMesh): MeshValidationResult {
    const brokenHalfEdges: number[] = []
    const nonManifoldEdges: number[] = []
    const orphanVertices: number[] = []
    const zeroAreaFaces: number[] = []

    // Check vertices
    for (const [vId, vertex] of mesh.vertices) {
      if (vertex.faceIds.length === 0 && vertex.edgeIds.length === 0) {
        orphanVertices.push(vId)
      }
    }

    // Check edges
    for (const [eId, edge] of mesh.edges) {
      if (edge.faceIds.length > 2) {
        nonManifoldEdges.push(eId)
      }
    }

    // Check half edges
    for (const [heId, he] of mesh.halfEdges) {
      const nextHe = mesh.halfEdges.get(he.nextId)
      const prevHe = mesh.halfEdges.get(he.prevId)

      if (!nextHe || nextHe.prevId !== heId || !prevHe || prevHe.nextId !== heId) {
        brokenHalfEdges.push(heId)
      }

      if (he.twinId !== null) {
        const twin = mesh.halfEdges.get(he.twinId)
        if (!twin || twin.twinId !== heId) {
          brokenHalfEdges.push(heId)
        }
      }
    }

    // Check faces
    for (const [fId, face] of mesh.faces) {
      if (face.vertexIds.length < 3) {
        zeroAreaFaces.push(fId)
        continue
      }
      const p0 = mesh.vertices.get(face.vertexIds[0])?.position
      const p1 = mesh.vertices.get(face.vertexIds[1])?.position
      const p2 = mesh.vertices.get(face.vertexIds[2])?.position
      if (!p0 || !p1 || !p2) {
        zeroAreaFaces.push(fId)
        continue
      }
      const cross = p1.clone().sub(p0).cross(p2.clone().sub(p0))
      if (cross.lengthSq() < 1e-10) {
        zeroAreaFaces.push(fId)
      }
    }

    const valid = brokenHalfEdges.length === 0 && nonManifoldEdges.length === 0 && zeroAreaFaces.length === 0

    return {
      valid,
      brokenHalfEdges,
      nonManifoldEdges,
      orphanVertices,
      zeroAreaFaces
    }
  }
}
