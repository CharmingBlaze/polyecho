import { MeshObject, UV, Vector3D } from '../../types/mesh'
import { computeFaceNormal } from '../../utils/math'

interface UVIsland {
  faceIndices: number[]
}

/**
 * Splits mesh into UV islands separated by marked seams, and unfolds each island cleanly into 2D UV space.
 */
export class SeamUnwrapper {
  /**
   * Unwraps all faces of the mesh according to marked seams in mesh.seamEdgeIds.
   */
  static unwrapMesh(mesh: MeshObject): void {
    if (!mesh || mesh.faces.length === 0) return

    const seamSet = new Set<string>(mesh.seamEdgeIds || [])

    // Helper to get normalized edge key between two vertex IDs
    const getEdgeKey = (v1: string, v2: string) => (v1 < v2 ? `${v1}_${v2}` : `${v2}_${v1}`)

    // 1. Build adjacency graph between faces across non-seam shared edges
    const numFaces = mesh.faces.length
    const visited = new Uint8Array(numFaces)
    const islands: UVIsland[] = []

    // Map each edge to the face indices sharing it
    const edgeToFaces = new Map<string, number[]>()
    for (let fIdx = 0; fIdx < numFaces; fIdx++) {
      const face = mesh.faces[fIdx]
      const n = face.vertexIds.length
      for (let i = 0; i < n; i++) {
        const v1 = face.vertexIds[i]
        const v2 = face.vertexIds[(i + 1) % n]
        const eKey = getEdgeKey(v1, v2)
        if (!edgeToFaces.has(eKey)) {
          edgeToFaces.set(eKey, [])
        }
        edgeToFaces.get(eKey)!.push(fIdx)
      }
    }

    // 2. Flood-fill to find connected islands partitioned by seams
    for (let fIdx = 0; fIdx < numFaces; fIdx++) {
      if (visited[fIdx]) continue

      const islandFaces: number[] = []
      const queue: number[] = [fIdx]
      visited[fIdx] = 1

      while (queue.length > 0) {
        const currIdx = queue.pop()!
        islandFaces.push(currIdx)
        const face = mesh.faces[currIdx]
        const n = face.vertexIds.length

        for (let i = 0; i < n; i++) {
          const v1 = face.vertexIds[i]
          const v2 = face.vertexIds[(i + 1) % n]
          const eKey = getEdgeKey(v1, v2)

          // If this edge is a marked seam, do not cross it
          if (seamSet.has(eKey)) continue

          const neighbors = edgeToFaces.get(eKey) || []
          for (const nbIdx of neighbors) {
            if (!visited[nbIdx]) {
              visited[nbIdx] = 1
              queue.push(nbIdx)
            }
          }
        }
      }

      islands.push({ faceIndices: islandFaces })
    }

    // 3. Unfold each island into 2D planar space
    const vertMap = new Map<string, Vector3D>()
    for (const v of mesh.vertices) {
      vertMap.set(v.id, v.position)
    }

    for (const island of islands) {
      this.unwrapIsland(mesh, island, vertMap)
    }
  }

  private static unwrapIsland(mesh: MeshObject, island: UVIsland, vertMap: Map<string, Vector3D>): void {
    if (island.faceIndices.length === 0) return

    // Calculate average normal for the island
    let avgNx = 0, avgNy = 0, avgNz = 0
    for (const fIdx of island.faceIndices) {
      const face = mesh.faces[fIdx]
      const faceVerts = face.vertexIds.map(id => vertMap.get(id)!).filter(Boolean)
      if (faceVerts.length >= 3) {
        const fn = face.normal || computeFaceNormal(faceVerts)
        avgNx += fn.x
        avgNy += fn.y
        avgNz += fn.z
      }
    }
    const len = Math.hypot(avgNx, avgNy, avgNz) || 1
    const normal = { x: avgNx / len, y: avgNy / len, z: avgNz / len }

    // Create 2D projection basis vectors tangent to normal
    let tangent: Vector3D = { x: 1, y: 0, z: 0 }
    if (Math.abs(normal.x) > 0.9) {
      tangent = { x: 0, y: 1, z: 0 }
    }
    // Gram-Schmidt orthogonalization
    const dot = tangent.x * normal.x + tangent.y * normal.y + tangent.z * normal.z
    tangent = {
      x: tangent.x - dot * normal.x,
      y: tangent.y - dot * normal.y,
      z: tangent.z - dot * normal.z
    }
    const tLen = Math.hypot(tangent.x, tangent.y, tangent.z) || 1
    tangent = { x: tangent.x / tLen, y: tangent.y / tLen, z: tangent.z / tLen }

    // Bitangent = normal x tangent
    const bitangent: Vector3D = {
      x: normal.y * tangent.z - normal.z * tangent.y,
      y: normal.z * tangent.x - normal.x * tangent.z,
      z: normal.x * tangent.y - normal.y * tangent.x
    }

    // Project vertices of all faces in the island to local 2D coordinates
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity

    for (const fIdx of island.faceIndices) {
      const face = mesh.faces[fIdx]
      const uvs: UV[] = []

      for (const vId of face.vertexIds) {
        const p = vertMap.get(vId) || { x: 0, y: 0, z: 0 }
        const u = p.x * tangent.x + p.y * tangent.y + p.z * tangent.z
        const v = p.x * bitangent.x + p.y * bitangent.y + p.z * bitangent.z
        uvs.push({ u, v })

        if (u < minU) minU = u
        if (u > maxU) maxU = u
        if (v < minV) minV = v
        if (v > maxV) maxV = v
      }
      face.uvs = uvs
    }

    // Normalize island UVs into a reasonable 0..1 range with uniform aspect ratio
    const width = maxU - minU || 1
    const height = maxV - minV || 1
    const maxDim = Math.max(width, height)

    for (const fIdx of island.faceIndices) {
      const face = mesh.faces[fIdx]
      face.uvs = face.uvs.map(uv => ({
        u: Number(((uv.u - minU) / maxDim).toFixed(4)),
        v: Number(((uv.v - minV) / maxDim).toFixed(4))
      }))
    }
  }
}
