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
    vertexIds = [...new Set(vertexIds)].filter(id => mesh.vertices.has(id))
    if (vertexIds.length === 0 || ![targetPosition.x, targetPosition.y, targetPosition.z].every(Number.isFinite)) return 0

    const targetId = keepId ?? vertexIds[0]
    const targetVert = mesh.vertices.get(targetId)
    if (!targetVert) return 0
    targetVert.position.copy(targetPosition)

    const vertSet = new Set([...vertexIds, targetId])

    for (const [fId, face] of [...mesh.faces]) {
      if (!face.vertexIds.some(vid => vertSet.has(vid))) continue

      const loop = remapFaceLoop(face.vertexIds, face.uvs, vid => (vertSet.has(vid) ? targetId : vid))
      const matIdx = face.materialIndex
      const color = face.color
      mesh.removeFace(fId)
      // A merge can pinch a polygon at nonadjacent corners. Split it into
      // simple loops instead of writing repeated vertices into one face.
      const split = (ids: number[], uvs: THREE.Vector2[]): { ids: number[]; uvs: THREE.Vector2[] }[] => {
        for (let i = 0; i < ids.length; i++) {
          const j = ids.indexOf(ids[i], i + 1)
          if (j < 0) continue
          return [...split(ids.slice(i, j), uvs.slice(i, j)), ...split([...ids.slice(0, i), ...ids.slice(j)], [...uvs.slice(0, i), ...uvs.slice(j)])]
        }
        return ids.length >= 3 ? [{ ids, uvs }] : []
      }
      split(loop.vertexIds, loop.uvs).forEach((part, i) => mesh.addFace(part.ids, part.uvs, matIdx, color, i === 0 ? fId : undefined))
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
    if (!Number.isFinite(threshold) || threshold < 0) return 0
    const allow = onlyIds ? new Set(onlyIds) : null
    const vertices = [...mesh.vertices.values()].filter(v => !allow || allow.has(v.id))
    const parent = vertices.map((_, i) => i)
    const root = (i: number): number => {
      while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i] }
      return i
    }
    const buckets = new Map<string, number[]>()
    const cell = threshold || 1e-12
    vertices.forEach((v, i) => {
      const xyz = [v.position.x, v.position.y, v.position.z].map(n => Math.floor(n / cell))
      for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
        for (const j of buckets.get(`${xyz[0] + x},${xyz[1] + y},${xyz[2] + z}`) ?? []) {
          if (v.position.distanceToSquared(vertices[j].position) <= threshold * threshold) {
            const a = root(i), b = root(j); parent[Math.max(a, b)] = Math.min(a, b)
          }
        }
      }
      const key = xyz.join(','); const list = buckets.get(key) ?? []; list.push(i); buckets.set(key, list)
    })
    const clusters = new Map<number, number[]>()
    vertices.forEach((v, i) => { const r = root(i), list = clusters.get(r) ?? []; list.push(v.id); clusters.set(r, list) })
    let count = 0
    for (const ids of clusters.values()) if (ids.length > 1) {
      this.mergeVertices(mesh, ids, mesh.vertices.get(ids[0])!.position.clone(), ids[0]); count += ids.length - 1
    }
    return count
  }
}
