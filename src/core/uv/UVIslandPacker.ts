import { MeshObject } from '../../types/mesh'
import { packUVIslands } from '../geometry/UVUnwrap'

/**
 * Packs disjoint UV islands into the 0..1 tile.
 * Island membership uses shared 3D edges that are welded in UV space.
 */
export class UVIslandPacker {
  static packIslands(mesh: MeshObject, padding = 0.02): void {
    if (!mesh || mesh.faces.length === 0) return
    const packed = packUVIslands(mesh, Math.round(padding * 64), 64)
    mesh.faces = packed.faces
  }
}
