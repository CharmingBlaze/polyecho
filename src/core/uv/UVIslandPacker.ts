import { MeshObject } from '../../types/mesh'

interface IslandBounds {
  faceIndices: number[]
  minU: number
  maxU: number
  minV: number
  maxV: number
  width: number
  height: number
}

/**
 * Packs multiple disjoint UV islands into the 0..1 UV bounding square with padding.
 */
export class UVIslandPacker {
  /**
   * Packs all UV faces on the mesh into the 0..1 UV canvas with configurable margin padding.
   */
  static packIslands(mesh: MeshObject, padding = 0.02): void {
    if (!mesh || mesh.faces.length === 0) return

    // 1. Group connected faces into UV islands based on shared UV vertices
    const numFaces = mesh.faces.length
    const visited = new Uint8Array(numFaces)
    const islands: IslandBounds[] = []

    for (let fIdx = 0; fIdx < numFaces; fIdx++) {
      if (visited[fIdx]) continue

      const islandFaceIndices: number[] = []
      const queue: number[] = [fIdx]
      visited[fIdx] = 1

      while (queue.length > 0) {
        const curr = queue.pop()!
        islandFaceIndices.push(curr)
        const faceA = mesh.faces[curr]

        for (let other = 0; other < numFaces; other++) {
          if (visited[other]) continue
          const faceB = mesh.faces[other]

          // Check if faces share an edge in 3D
          let sharedVerts = 0
          for (const vA of faceA.vertexIds) {
            if (faceB.vertexIds.includes(vA)) sharedVerts++
          }

          if (sharedVerts >= 2) {
            visited[other] = 1
            queue.push(other)
          }
        }
      }

      // Calculate island bounds
      let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity
      for (const idx of islandFaceIndices) {
        for (const uv of mesh.faces[idx].uvs) {
          if (uv.u < minU) minU = uv.u
          if (uv.u > maxU) maxU = uv.u
          if (uv.v < minV) minV = uv.v
          if (uv.v > maxV) maxV = uv.v
        }
      }

      const width = Math.max(0.001, maxU - minU)
      const height = Math.max(0.001, maxV - minV)

      islands.push({
        faceIndices: islandFaceIndices,
        minU,
        maxU,
        minV,
        maxV,
        width,
        height
      })
    }

    if (islands.length === 0) return

    // 2. Sort islands by descending height (First-Fit Decreasing shelf algorithm)
    islands.sort((a, b) => b.height - a.height)

    // Shelf packing
    let curX = padding
    let curY = padding
    let rowH = 0
    let maxOverallX = 0
    let maxOverallY = 0

    const placements: { island: IslandBounds; targetX: number; targetY: number }[] = []

    for (const island of islands) {
      if (curX + island.width + padding > 1.0) {
        // Move to next shelf / row
        curX = padding
        curY += rowH + padding
        rowH = 0
      }

      placements.push({ island, targetX: curX, targetY: curY })
      curX += island.width + padding
      rowH = Math.max(rowH, island.height)

      maxOverallX = Math.max(maxOverallX, curX)
      maxOverallY = Math.max(maxOverallY, curY + rowH)
    }

    // Uniform scale to fit within 0..1 if layout overflows
    const maxDim = Math.max(maxOverallX, maxOverallY, 1.0)
    const scaleFactor = 1.0 / maxDim

    // 3. Apply transformed UVs to all faces
    for (const p of placements) {
      const island = p.island
      const ox = p.targetX * scaleFactor
      const oy = p.targetY * scaleFactor
      const isScale = scaleFactor

      for (const fIdx of island.faceIndices) {
        const face = mesh.faces[fIdx]
        face.uvs = face.uvs.map(uv => ({
          u: Number((ox + (uv.u - island.minU) * isScale).toFixed(4)),
          v: Number((oy + (uv.v - island.minV) * isScale).toFixed(4))
        }))
      }
    }
  }
}
