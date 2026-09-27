import type { MeshObject } from '../../types/mesh'
import { computeFaceNormal } from '../../utils/math'
import { undirectedEdgeId } from './EdgeUtils'
import { DEFAULT_AUTO_SMOOTH_ANGLE } from './MeshShading'

function edgeFaces(mesh: MeshObject): Map<string, number[]> {
  const map = new Map<string, number[]>()
  mesh.faces.forEach((face, index) => {
    const ids = face.vertexIds
    for (let i = 0; i < ids.length; i++) {
      const key = undirectedEdgeId(ids[i], ids[(i + 1) % ids.length])
      const list = map.get(key)
      if (list) list.push(index)
      else map.set(key, [index])
    }
  })
  return map
}

/** Edges that belong to exactly one face. */
export function boundaryEdgeIds(mesh: MeshObject): string[] {
  return [...edgeFaces(mesh).entries()].filter(([, faces]) => faces.length === 1).map(([id]) => id)
}

/** Edges shared by three or more faces. Boundary edges stay on Select Boundary. */
export function nonManifoldEdgeIds(mesh: MeshObject): string[] {
  return [...edgeFaces(mesh).entries()].filter(([, faces]) => faces.length >= 3).map(([id]) => id)
}

/**
 * Interior edges whose face normals differ by more than `angleDeg`,
 * plus any edge already marked sharp.
 */
export function sharpEdgeIds(mesh: MeshObject, angleDeg = mesh.autoSmoothAngle ?? DEFAULT_AUTO_SMOOTH_ANGLE): string[] {
  const marked = new Set(mesh.sharpEdgeIds ?? [])
  const faces = edgeFaces(mesh)
  const normals = mesh.faces.map(face => {
    const positions = face.vertexIds.map(id => mesh.vertices.find(vertex => vertex.id === id)?.position).filter((p): p is NonNullable<typeof p> => !!p)
    return positions.length >= 3 ? computeFaceNormal(positions) : { x: 0, y: 1, z: 0 }
  })
  const limit = Math.cos(angleDeg * Math.PI / 180)
  const ids: string[] = []
  for (const [id, faceIndexes] of faces) {
    if (marked.has(id)) {
      ids.push(id)
      continue
    }
    if (faceIndexes.length !== 2) continue
    const a = normals[faceIndexes[0]]
    const b = normals[faceIndexes[1]]
    const dot = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z))
    if (dot < limit) ids.push(id)
  }
  return ids
}
