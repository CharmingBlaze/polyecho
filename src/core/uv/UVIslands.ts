import { MeshObject, UV } from '../../types/mesh'

const UV_EPS = 0.002

function uvsClose(a: UV, b: UV): boolean {
  return Math.abs(a.u - b.u) < UV_EPS && Math.abs(a.v - b.v) < UV_EPS
}

function shareUvEdge(mesh: MeshObject, fAIdx: number, fBIdx: number): boolean {
  const fA = mesh.faces[fAIdx]
  const fB = mesh.faces[fBIdx]
  if (!fA?.uvs || !fB?.uvs) return false
  let shared = 0
  for (const uvA of fA.uvs) {
    for (const uvB of fB.uvs) {
      if (uvsClose(uvA, uvB)) {
        shared++
        break
      }
    }
  }
  return shared >= 2
}

/** Connected components in UV space (shared welded edges). */
export function findUvIslands(mesh: MeshObject): number[][] {
  const faceCount = mesh.faces.length
  const visited = new Uint8Array(faceCount)
  const islands: number[][] = []

  for (let i = 0; i < faceCount; i++) {
    if (visited[i]) continue
    const island: number[] = [i]
    visited[i] = 1
    const queue = [i]

    while (queue.length > 0) {
      const curr = queue.pop()!
      for (let j = 0; j < faceCount; j++) {
        if (!visited[j] && shareUvEdge(mesh, curr, j)) {
          visited[j] = 1
          island.push(j)
          queue.push(j)
        }
      }
    }
    islands.push(island)
  }

  return islands
}

/** Grow a face selection to every UV island that touches it. */
export function expandFacesToIslands(mesh: MeshObject, faceIndices: number[]): number[] {
  if (faceIndices.length === 0) return []
  const seed = new Set(faceIndices)
  const out = new Set<number>()
  for (const island of findUvIslands(mesh)) {
    if (island.some(i => seed.has(i))) {
      island.forEach(i => out.add(i))
    }
  }
  return Array.from(out)
}

export type UvEdgeRef = { faceIndex: number; edgeIndex: number }

/**
 * Include the other face's UV edge when it shares the same 3D verts and
 * the UV corners are already welded. Interior island edges are two loops.
 */
export function expandWeldedUvEdges(mesh: MeshObject, edges: UvEdgeRef[]): UvEdgeRef[] {
  const seen = new Set(edges.map(e => `${e.faceIndex}:${e.edgeIndex}`))
  const out: UvEdgeRef[] = [...edges]

  for (const se of edges) {
    const face = mesh.faces[se.faceIndex]
    if (!face?.uvs || face.vertexIds.length < 2) continue
    const n = face.vertexIds.length
    const v0 = face.vertexIds[se.edgeIndex]
    const v1 = face.vertexIds[(se.edgeIndex + 1) % n]
    const uv0 = face.uvs[se.edgeIndex]
    const uv1 = face.uvs[(se.edgeIndex + 1) % n]
    if (!v0 || !v1 || !uv0 || !uv1) continue

    for (let fi = 0; fi < mesh.faces.length; fi++) {
      if (fi === se.faceIndex) continue
      const other = mesh.faces[fi]
      const m = other.vertexIds.length
      for (let ei = 0; ei < m; ei++) {
        const a = other.vertexIds[ei]
        const b = other.vertexIds[(ei + 1) % m]
        const sameVerts = (a === v0 && b === v1) || (a === v1 && b === v0)
        if (!sameVerts) continue
        const ou0 = other.uvs[ei]
        const ou1 = other.uvs[(ei + 1) % m]
        const welded =
          (uvsClose(ou0, uv0) && uvsClose(ou1, uv1)) ||
          (uvsClose(ou0, uv1) && uvsClose(ou1, uv0))
        if (!welded) continue
        const key = `${fi}:${ei}`
        if (seen.has(key)) continue
        seen.add(key)
        out.push({ faceIndex: fi, edgeIndex: ei })
      }
    }
  }

  return out
}

/**
 * Stitch the island on the other side of a UV edge onto this edge.
 * The selected face stays put; the neighboring island is rigidly moved
 * (translate + rotate + uniform scale) so the shared 3D edge matches in UV.
 */
export function stitchUvEdge(mesh: MeshObject, faceIndex: number, edgeIndex: number): boolean {
  const face = mesh.faces[faceIndex]
  if (!face || face.vertexIds.length < 2 || face.uvs.length < 2) return false

  const n = face.vertexIds.length
  const v0 = face.vertexIds[edgeIndex]
  const v1 = face.vertexIds[(edgeIndex + 1) % n]
  const dest0 = { u: face.uvs[edgeIndex].u, v: face.uvs[edgeIndex].v }
  const dest1 = {
    u: face.uvs[(edgeIndex + 1) % n].u,
    v: face.uvs[(edgeIndex + 1) % n].v
  }

  for (let fi = 0; fi < mesh.faces.length; fi++) {
    if (fi === faceIndex) continue
    const other = mesh.faces[fi]
    const m = other.vertexIds.length
    for (let ei = 0; ei < m; ei++) {
      const a = other.vertexIds[ei]
      const b = other.vertexIds[(ei + 1) % m]
      const same = (a === v0 && b === v1) || (a === v1 && b === v0)
      if (!same) continue

      const q0 = other.uvs[ei]
      const q1 = other.uvs[(ei + 1) % m]
      const target0 = a === v0 ? dest0 : dest1
      const target1 = a === v0 ? dest1 : dest0

      if (uvsClose(q0, target0) && uvsClose(q1, target1)) return false

      const selectedIsland = new Set(expandFacesToIslands(mesh, [faceIndex]))
      const neighborIsland = expandFacesToIslands(mesh, [fi]).filter(i => !selectedIsland.has(i))

      if (neighborIsland.length === 0) {
        q0.u = target0.u
        q0.v = target0.v
        q1.u = target1.u
        q1.v = target1.v
        return true
      }

      const ox = q0.u
      const oy = q0.v
      const fromDx = q1.u - q0.u
      const fromDy = q1.v - q0.v
      const toDx = target1.u - target0.u
      const toDy = target1.v - target0.v
      const fromLen = Math.hypot(fromDx, fromDy) || 1
      const toLen = Math.hypot(toDx, toDy) || 1
      const rot = Math.atan2(toDy, toDx) - Math.atan2(fromDy, fromDx)
      const scale = toLen / fromLen
      const cos = Math.cos(rot)
      const sin = Math.sin(rot)

      for (const mi of neighborIsland) {
        for (const uv of mesh.faces[mi].uvs) {
          const du = uv.u - ox
          const dv = uv.v - oy
          uv.u = target0.u + (du * cos - dv * sin) * scale
          uv.v = target0.v + (du * sin + dv * cos) * scale
        }
      }
      return true
    }
  }

  return false
}
