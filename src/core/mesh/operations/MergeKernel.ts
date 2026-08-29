import * as THREE from 'three'
import { EditableMesh } from '../MeshKernel'

export class MergeKernel {
  /**
   * Merges multiple vertices into a single target vertex.
   * Rewires all faces referencing merged vertices to target vertex ID,
   * removes duplicate edges and zero-area/degenerate faces.
   */
  static mergeVertices(mesh: EditableMesh, vertexIds: number[], targetPosition: THREE.Vector3): number {
    if (vertexIds.length === 0) return 0

    const targetVert = mesh.addVertex(targetPosition)
    const targetId = targetVert.id
    const vertSet = new Set(vertexIds)

    // Rewire all faces
    for (const [fId, face] of mesh.faces) {
      let needsRewire = false
      for (const vid of face.vertexIds) {
        if (vertSet.has(vid)) {
          needsRewire = true
          break
        }
      }

      if (needsRewire) {
        const newVertIds: number[] = []
        for (const vid of face.vertexIds) {
          const mappedId = vertSet.has(vid) ? targetId : vid
          if (newVertIds.length === 0 || newVertIds[newVertIds.length - 1] !== mappedId) {
            newVertIds.push(mappedId)
          }
        }
        // Remove trailing wrap duplicate
        if (newVertIds.length > 1 && newVertIds[newVertIds.length - 1] === newVertIds[0]) {
          newVertIds.pop()
        }

        const uvs = [...face.uvs]
        const matIdx = face.materialIndex
        const color = face.color

        mesh.removeFace(fId)

        if (newVertIds.length >= 3) {
          mesh.addFace(newVertIds, uvs, matIdx, color, fId)
        }
      }
    }

    // Remove merged original vertices
    for (const vid of vertexIds) {
      if (vid !== targetId) {
        mesh.removeVertex(vid)
      }
    }

    mesh.recalculateNormals()
    return targetId
  }

  /**
   * Merges vertices that are within a distance threshold (Weld).
   */
  static mergeByDistance(mesh: EditableMesh, threshold = 0.001): number {
    const vertices = Array.from(mesh.vertices.values())
    const merged = new Set<number>()
    let mergeCount = 0

    for (let i = 0; i < vertices.length; i++) {
      const vA = vertices[i]
      if (merged.has(vA.id)) continue

      const cluster: number[] = [vA.id]
      for (let j = i + 1; j < vertices.length; j++) {
        const vB = vertices[j]
        if (merged.has(vB.id)) continue

        if (vA.position.distanceTo(vB.position) <= threshold) {
          cluster.push(vB.id)
          merged.add(vB.id)
        }
      }

      if (cluster.length > 1) {
        this.mergeVertices(mesh, cluster, vA.position.clone())
        mergeCount += (cluster.length - 1)
      }
    }

    return mergeCount
  }
}
