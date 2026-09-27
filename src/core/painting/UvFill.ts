import type { MeshObject, UV } from '../../types/mesh'
import { findUvIslands } from '../uv/UVIslands'

/** Same mapping as the paint canvas and the 3D texture stamp. */
export function uvToTexel(u: number, v: number, width: number, height: number): { x: number; y: number } {
  const safeU = Number.isFinite(u) ? Math.max(0, Math.min(1, u)) : 0
  const safeV = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0
  return {
    x: Math.min(width - 1, Math.floor(safeU * width)),
    y: Math.min(height - 1, Math.floor((1 - safeV) * height))
  }
}

function uvCorner(uv: UV, width: number, height: number) {
  const u = Number.isFinite(uv.u) ? uv.u : 0
  const v = Number.isFinite(uv.v) ? uv.v : 0
  return { x: u * width, y: (1 - v) * height }
}

function pointInPolygon(x: number, y: number, poly: { x: number; y: number }[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!
    const b = poly[j]!
    const crosses = (a.y > y) !== (b.y > y)
    if (!crosses) continue
    const t = (y - a.y) / (b.y - a.y)
    if (x < a.x + (b.x - a.x) * t) inside = !inside
  }
  return inside
}

function plotLine(
  a: { x: number; y: number },
  b: { x: number; y: number },
  width: number,
  height: number,
  mask: Uint8Array
) {
  let x0 = Math.round(a.x)
  let y0 = Math.round(a.y)
  const x1 = Math.round(b.x)
  const y1 = Math.round(b.y)
  const dx = Math.abs(x1 - x0)
  const dy = Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx - dy
  for (let guard = 0; guard < width + height + dx + dy + 4; guard++) {
    if (x0 >= 0 && y0 >= 0 && x0 < width && y0 < height) mask[y0 * width + x0] = 1
    if (x0 === x1 && y0 === y1) break
    const e2 = 2 * err
    if (e2 > -dy) { err -= dy; x0 += sx }
    if (e2 < dx) { err += dx; y0 += sy }
  }
}

function coverPolygon(points: { x: number; y: number }[], width: number, height: number, mask: Uint8Array) {
  if (points.length < 3) return
  let minX = width
  let minY = height
  let maxX = 0
  let maxY = 0
  for (const p of points) {
    minX = Math.min(minX, Math.floor(p.x))
    minY = Math.min(minY, Math.floor(p.y))
    maxX = Math.max(maxX, Math.ceil(p.x) - 1)
    maxY = Math.max(maxY, Math.ceil(p.y) - 1)
  }
  minX = Math.max(0, minX)
  minY = Math.max(0, minY)
  maxX = Math.min(width - 1, maxX)
  maxY = Math.min(height - 1, maxY)
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (pointInPolygon(x + 0.5, y + 0.5, points)) mask[y * width + x] = 1
    }
  }
  for (let i = 0; i < points.length; i++) {
    plotLine(points[i]!, points[(i + 1) % points.length]!, width, height, mask)
  }
}

function facePolygon(mesh: MeshObject, faceIndex: number, width: number, height: number) {
  const face = mesh.faces[faceIndex]
  if (!face || face.uvs.length < 3) return null
  return face.uvs.map(uv => uvCorner(uv, width, height))
}

/** Pixels covered by one face. Empty when that face has no UV polygon. */
export function uvFaceMask(mesh: MeshObject, width: number, height: number, faceId: string): Uint8Array | null {
  const index = mesh.faces.findIndex(face => face.id === faceId)
  if (index < 0) return null
  const poly = facePolygon(mesh, index, width, height)
  if (!poly) return null
  const mask = new Uint8Array(width * height)
  coverPolygon(poly, width, height, mask)
  return mask.some(bit => bit) ? mask : null
}

/**
 * Pixels of the UV island under a canvas click. A click in the gutter
 * between islands returns null so the fill cannot flood the whole sheet.
 */
export function uvIslandMaskAt(
  mesh: MeshObject,
  width: number,
  height: number,
  x: number,
  y: number
): Uint8Array | null {
  const px = Math.floor(x)
  const py = Math.floor(y)
  if (px < 0 || py < 0 || px >= width || py >= height) return null
  let hit = -1
  for (let i = 0; i < mesh.faces.length; i++) {
    const poly = facePolygon(mesh, i, width, height)
    if (!poly) continue
    if (pointInPolygon(px + 0.5, py + 0.5, poly)) hit = i
  }
  if (hit < 0) return null
  const island = findUvIslands(mesh).find(group => group.includes(hit)) ?? [hit]
  const mask = new Uint8Array(width * height)
  for (const index of island) {
    const poly = facePolygon(mesh, index, width, height)
    if (poly) coverPolygon(poly, width, height, mask)
  }
  mask[py * width + px] = 1
  return mask
}
