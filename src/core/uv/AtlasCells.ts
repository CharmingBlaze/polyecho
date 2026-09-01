import type { Face, UV } from '../../types/mesh'
import type { AtlasGrid } from '../../types/texture'
import { PixelBuffer } from '../painting/PixelCanvas'

export function clampAtlasGrid(cols: number, rows: number): AtlasGrid {
  return {
    cols: Math.max(1, Math.min(32, Math.round(cols) || 1)),
    rows: Math.max(1, Math.min(32, Math.round(rows) || 1))
  }
}

/** UV rect for a cell. Row 0 is the top of the image (high V). */
export function atlasCellUvRect(grid: AtlasGrid, col: number, row: number) {
  const g = clampAtlasGrid(grid.cols, grid.rows)
  const c = Math.max(0, Math.min(g.cols - 1, col))
  const r = Math.max(0, Math.min(g.rows - 1, row))
  const cellW = 1 / g.cols
  const cellH = 1 / g.rows
  return {
    u0: c * cellW,
    u1: (c + 1) * cellW,
    v0: 1 - (r + 1) * cellH,
    v1: 1 - r * cellH
  }
}

export function uvIslandBounds(uvs: UV[]) {
  let minU = Infinity
  let minV = Infinity
  let maxU = -Infinity
  let maxV = -Infinity
  for (const uv of uvs) {
    minU = Math.min(minU, uv.u)
    minV = Math.min(minV, uv.v)
    maxU = Math.max(maxU, uv.u)
    maxV = Math.max(maxV, uv.v)
  }
  const width = Math.max(1e-6, maxU - minU)
  const height = Math.max(1e-6, maxV - minV)
  return { minU, minV, maxU, maxV, width, height }
}

export function mapFacesToAtlasCell(
  faces: Face[],
  faceIds: string[] | null,
  grid: AtlasGrid,
  col: number,
  row: number
): number {
  const targets = faceIds && faceIds.length > 0
    ? faces.filter(f => faceIds.includes(f.id) && f.uvs?.length)
    : faces.filter(f => f.uvs?.length)
  if (targets.length === 0) return 0

  const allUvs = targets.flatMap(f => f.uvs)
  const b = uvIslandBounds(allUvs)
  const cell = atlasCellUvRect(grid, col, row)
  const cellW = cell.u1 - cell.u0
  const cellH = cell.v1 - cell.v0

  for (const face of targets) {
    for (const uv of face.uvs) {
      const nu = (uv.u - b.minU) / b.width
      const nv = (uv.v - b.minV) / b.height
      uv.u = cell.u0 + nu * cellW
      uv.v = cell.v0 + nv * cellH
    }
  }
  return targets.length
}

export function sliceBufferIntoTiles(buffer: PixelBuffer, cols: number, rows: number) {
  const g = clampAtlasGrid(cols, rows)
  const tw = Math.max(1, Math.floor(buffer.width / g.cols))
  const th = Math.max(1, Math.floor(buffer.height / g.rows))
  const tiles: { col: number; row: number; width: number; height: number; buffer: PixelBuffer }[] = []
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      const tile = new PixelBuffer(tw, th)
      tile.ctx.imageSmoothingEnabled = false
      tile.ctx.drawImage(buffer.canvas, c * tw, r * th, tw, th, 0, 0, tw, th)
      tile.syncToActiveLayer()
      tiles.push({ col: c, row: r, width: tw, height: th, buffer: tile })
    }
  }
  return tiles
}
