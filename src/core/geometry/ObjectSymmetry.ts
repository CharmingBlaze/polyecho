import type { MeshObject } from '../../types/mesh'

export type SymmetryAxis = 'x' | 'y' | 'z'

/** Mirror local verts through the object origin and keep winding CCW. */
export function flipMeshGeometry(mesh: MeshObject, axis: SymmetryAxis): void {
  for (const v of mesh.vertices) {
    v.position[axis] = -v.position[axis]
  }
  for (const f of mesh.faces) {
    f.vertexIds.reverse()
    if (f.uvs) f.uvs.reverse()
  }
}

export function wrapDegrees(value: number): number {
  if (!Number.isFinite(value)) return 0
  let d = value % 360
  if (d > 180) d -= 360
  if (d <= -180) d += 360
  return d
}

export function addObjectRotation(mesh: MeshObject, axis: SymmetryAxis, degrees: number): void {
  mesh.rotation[axis] = wrapDegrees(mesh.rotation[axis] + degrees)
}
