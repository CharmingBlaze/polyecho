import type { Face } from '../../types/mesh'
import { uvIslandBounds } from './AtlasCells'
import { tileBounds } from '../painting/TilePixels'

export function mapSelectedFacesToTile(faces: Face[], ids: string[], width: number, height: number, cols: number, rows: number, index: number, options: { individual: boolean; inset: number; rotation: number; flip: boolean }) {
  return mapSelectedFacesToRegion(faces, ids, width, height, tileBounds(width, height, cols, rows, index), options)
}

export function mapSelectedFacesToRegion(faces: Face[], ids: string[], width: number, height: number, tile: { x: number; y: number; width: number; height: number }, options: { individual: boolean; inset: number; rotation: number; flip: boolean }) {
  const selected = faces.filter(f => ids.includes(f.id) && f.uvs?.length)
  if (!selected.length) return 0
  const inset = Math.max(0, Math.min(Number(options.inset) || 0, (Math.min(tile.width, tile.height) - 1) / 2))
  const groups = options.individual ? selected.map(f => [f]) : [selected]
  for (const group of groups) {
    const bounds = uvIslandBounds(group.flatMap(f => f.uvs))
    for (const face of group) for (const uv of face.uvs) {
      let u = (uv.u - bounds.minU) / bounds.width, v = (uv.v - bounds.minV) / bounds.height
      if (options.flip) u = 1 - u
      for (let turn = 0; turn < options.rotation; turn++) [u, v] = [v, 1 - u]
      uv.u = (tile.x + inset + u * (tile.width - inset * 2)) / width
      uv.v = 1 - (tile.y + tile.height - inset - v * (tile.height - inset * 2)) / height
    }
  }
  return selected.length
}
