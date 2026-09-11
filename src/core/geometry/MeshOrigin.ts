import type { MeshObject } from '../../types/mesh'

/**
 * Move the object origin to the local AABB center without changing world geometry.
 * Matches inspector Origin → Center. No-ops on an empty mesh.
 */
export function placeOriginAtBoundsCenter(mesh: MeshObject): boolean {
  if (mesh.vertices.length === 0) return false

  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity

  for (const v of mesh.vertices) {
    const p = v.position
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
    if (p.z < minZ) minZ = p.z
    if (p.z > maxZ) maxZ = p.z
  }

  const dx = (minX + maxX) / 2
  const dy = (minY + maxY) / 2
  const dz = (minZ + maxZ) / 2
  if (dx === 0 && dy === 0 && dz === 0) return false

  for (const v of mesh.vertices) {
    v.position.x -= dx
    v.position.y -= dy
    v.position.z -= dz
  }
  mesh.position.x += dx
  mesh.position.y += dy
  mesh.position.z += dz
  return true
}
