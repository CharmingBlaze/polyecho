import * as THREE from 'three'
import { EditableMesh } from '../MeshKernel'
import { HalfEdgeTopology } from '../HalfEdgeTopology'

export interface ExtrudeResult {
  mesh: EditableMesh
  newVertexIds: number[]
  extrudedFaceIds: number[]
  regionNormal: THREE.Vector3
}

export class ExtrudeKernel {
  /**
   * Pure topological region extrusion.
   * Finds boundary edges, duplicates vertices for the cap, creates perimeter side-quads,
   * and updates cap faces in-place without moving geometry.
   */
  static extrudeFaces(mesh: EditableMesh, selectedFaceIds: number[]): ExtrudeResult {
    const regionNormal = HalfEdgeTopology.computeRegionNormal(mesh, selectedFaceIds)
    const boundaryEdges = HalfEdgeTopology.findRegionBoundaryEdges(mesh, selectedFaceIds)

    // Set of all vertices on the boundary
    const boundaryVertIds = new Set<number>()
    for (const edge of boundaryEdges) {
      boundaryVertIds.add(edge.v1)
      boundaryVertIds.add(edge.v2)
    }

    // Map from old boundary vertex ID -> newly created extruded vertex ID
    const oldToNewVertMap = new Map<number, number>()
    const newVertexIds: number[] = []

    for (const oldVId of boundaryVertIds) {
      const oldV = mesh.vertices.get(oldVId)!
      const newV = mesh.addVertex(oldV.position.clone())
      oldToNewVertMap.set(oldVId, newV.id)
      newVertexIds.push(newV.id)
    }

    // For any internal vertices strictly inside the selected face region, clone them too
    const allSelectedFaceVertIds = new Set<number>()
    for (const fId of selectedFaceIds) {
      const face = mesh.faces.get(fId)
      if (face) {
        for (const vid of face.vertexIds) {
          allSelectedFaceVertIds.add(vid)
        }
      }
    }

    for (const vId of allSelectedFaceVertIds) {
      if (!oldToNewVertMap.has(vId)) {
        const oldV = mesh.vertices.get(vId)!
        const newV = mesh.addVertex(oldV.position.clone())
        oldToNewVertMap.set(vId, newV.id)
        newVertexIds.push(newV.id)
      }
    }

    // Create side quad walls for each boundary edge
    const selFaceSet = new Set(selectedFaceIds)
    for (const edge of boundaryEdges) {
      const vA_old = edge.v1
      const vB_old = edge.v2
      const vA_new = oldToNewVertMap.get(vA_old)!
      const vB_new = oldToNewVertMap.get(vB_old)!

      // Find the selected face containing this boundary edge to determine proper winding
      let selFaceId = edge.faceIds.find(fid => selFaceSet.has(fid))
      const selFace = selFaceId ? mesh.faces.get(selFaceId) : null

      let forward = true
      if (selFace) {
        const idxA = selFace.vertexIds.indexOf(vA_old)
        const idxB = selFace.vertexIds.indexOf(vB_old)
        const n = selFace.vertexIds.length
        if (idxA !== -1 && idxB !== -1) {
          if ((idxA + 1) % n === idxB) {
            forward = true
          } else {
            forward = false
          }
        }
      }

      if (forward) {
        // [vA_old, vB_old, vB_new, vA_new]
        mesh.addFace([vA_old, vB_old, vB_new, vA_new])
      } else {
        // [vB_old, vA_old, vA_new, vB_new]
        mesh.addFace([vB_old, vA_old, vA_new, vB_new])
      }
    }

    // Update the selected cap faces so their vertex references point to new extruded vertices
    for (const fId of selectedFaceIds) {
      const face = mesh.faces.get(fId)
      if (face) {
        const newFaceVerts = face.vertexIds.map(oldVId => oldToNewVertMap.get(oldVId) || oldVId)
        const uvs = [...face.uvs]
        const matIdx = face.materialIndex
        const color = face.color

        mesh.removeFace(fId)
        mesh.addFace(newFaceVerts, uvs, matIdx, color, fId)
      }
    }

    mesh.recalculateNormals()

    return {
      mesh,
      newVertexIds,
      extrudedFaceIds: [...selectedFaceIds],
      regionNormal
    }
  }
}
