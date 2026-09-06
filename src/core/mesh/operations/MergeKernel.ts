import * as THREE from 'three'
import { EditableMesh } from '../MeshKernel'

function remapFaceLoop(
  vertexIds: number[],
  uvs: THREE.Vector2[],
  mapId: (id: number) => number
): { vertexIds: number[]; uvs: THREE.Vector2[] } {
  const mapped = vertexIds.map(mapId)
  const nextIds: number[] = []
  const nextUvs: THREE.Vector2[] = []
  for (let i = 0; i < mapped.length; i++) {
    if (mapped[i] === mapped[(i + 1) % mapped.length]) continue
    nextIds.push(mapped[i])
    nextUvs.push(uvs[i]?.clone() ?? new THREE.Vector2())
  }
  return { vertexIds: nextIds, uvs: nextUvs }
}

export class MergeKernel {
  /**
   * Merges vertices onto one survivor (default: first id) at `targetPosition`.
   * Rewires faces, drops collapsed corners, and keeps UVs aligned.
   */
  static mergeVertices(
    mesh: EditableMesh,
    vertexIds: number[],
    targetPosition: THREE.Vector3,
    keepId?: number
  ): number {
    if (vertexIds.length === 0) return 0

    const targetId = keepId ?? vertexIds[0]
    const targetVert = mesh.vertices.get(targetId)
    if (!targetVert) return 0
    targetVert.position.copy(targetPosition)

    const vertSet = new Set(vertexIds)

    for (const [fId, face] of [...mesh.faces]) {
      if (!face.vertexIds.some(vid => vertSet.has(vid))) continue

      const loop = remapFaceLoop(face.vertexIds, face.uvs, vid => (vertSet.has(vid) ? targetId : vid))
      const matIdx = face.materialIndex
      const color = face.color
      mesh.removeFace(fId)
      if (loop.vertexIds.length >= 3) {
        mesh.addFace(loop.vertexIds, loop.uvs, matIdx, color, fId)
      }
    }

    for (const vid of vertexIds) {
      if (vid !== targetId) mesh.removeVertex(vid)
    }

    mesh.recalculateNormals()
    return targetId
  }

  /**
   * Welds vertices within `threshold`. Optional `onlyIds` limits the candidates.
   */
  static mergeByDistance(mesh: EditableMesh, threshold = 0.001, onlyIds?: number[]): number {
    const allow = onlyIds && onlyIds.length > 0 ? new Set(onlyIds) : null
    const vertices = Array.from(mesh.vertices.values()).filter(v => !allow || allow.has(v.id))
    const merged = new Set<number>()
    let mergeCount = 0

    for (let i = 0; i < vertices.length; i++) {
      const vA = vertices[i]
      if (merged.has(vA.id) || !mesh.vertices.has(vA.id)) continue

      const cluster: number[] = [vA.id]
      for (let j = i + 1; j < vertices.length; j++) {
        const vB = vertices[j]
        if (merged.has(vB.id) || !mesh.vertices.has(vB.id)) continue
        if (vA.position.distanceTo(vB.position) <= threshold) {
          cluster.push(vB.id)
          merged.add(vB.id)
        }
      }

      if (cluster.length > 1) {
        const live = mesh.vertices.get(vA.id)
        if (!live) continue
        this.mergeVertices(mesh, cluster, live.position.clone(), vA.id)
        mergeCount += cluster.length - 1
      }
    }

    return mergeCount
  }
}
