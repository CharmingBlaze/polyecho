import type { MeshObject } from '../../types/mesh'
import { ensureMeshUVs } from '../geometry/UVUnwrap'
import { mapSelectedFacesToRegion } from './TileMapping'

export function stampFacesToRegion(
  mesh: MeshObject,
  faceIds: string[],
  image: { width: number; height: number },
  region: { x: number; y: number; width: number; height: number },
  options: { individual: boolean; inset: number; rotation: number; flip: boolean }
) {
  if (!faceIds.length || mesh.locked) return 0
  ensureMeshUVs(mesh)
  const corners = [{ u: 0, v: 0 }, { u: 1, v: 0 }, { u: 1, v: 1 }, { u: 0, v: 1 }]
  for (const face of mesh.faces) {
    if (!faceIds.includes(face.id)) continue
    if (!face.uvs || face.uvs.length !== face.vertexIds.length) {
      face.uvs = face.vertexIds.map((_, index) => ({ ...corners[index % corners.length] }))
    }
  }
  return mapSelectedFacesToRegion(mesh.faces, faceIds, image.width, image.height, region, options)
}
