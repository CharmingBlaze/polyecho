import type { MeshObject, UV } from '../../types/mesh'
import { expandFacesToIslands, expandWeldedUvEdges, findUvIslands } from './UVIslands'

export interface UvCorner { faceIndex: number; vertIndex: number }
export type UvSelectionMode = 'vertex' | 'edge' | 'face' | 'island'
export function selectedUvCorners(mesh: MeshObject, mode: UvSelectionMode, faces: number[], vertices: UvCorner[], edges: { faceIndex: number; edgeIndex: number }[]): UvCorner[] {
  let corners: UvCorner[]
  if (mode === 'vertex') corners = vertices
  else if (mode === 'edge') corners = expandWeldedUvEdges(mesh, edges.filter(e => !!mesh.faces[e.faceIndex]?.uvs[e.edgeIndex])).flatMap(e => [
    { faceIndex: e.faceIndex, vertIndex: e.edgeIndex },
    { faceIndex: e.faceIndex, vertIndex: (e.edgeIndex + 1) % mesh.faces[e.faceIndex].uvs.length }
  ])
  else corners = (mode === 'island' ? expandFacesToIslands(mesh, faces) : faces).flatMap(faceIndex =>
    mesh.faces[faceIndex]?.uvs.map((_, vertIndex) => ({ faceIndex, vertIndex })) ?? [])
  const seen = new Set<string>()
  return corners.filter(c => {
    const key = `${c.faceIndex}:${c.vertIndex}`
    if (seen.has(key) || !mesh.faces[c.faceIndex]?.uvs[c.vertIndex]) return false
    seen.add(key)
    return true
  })
}

export function uvBounds(mesh: MeshObject, corners: UvCorner[]) {
  const points = corners.map(c => mesh.faces[c.faceIndex]?.uvs[c.vertIndex]).filter((p): p is UV => !!p && Number.isFinite(p.u) && Number.isFinite(p.v))
  if (!points.length) return null
  let minU = Infinity, minV = Infinity, maxU = -Infinity, maxV = -Infinity
  for (const p of points) {
    minU = Math.min(minU, p.u); maxU = Math.max(maxU, p.u)
    minV = Math.min(minV, p.v); maxV = Math.max(maxV, p.v)
  }
  return { minU, minV, maxU, maxV, cU: (minU + maxU) / 2, cV: (minV + maxV) / 2, width: maxU - minU, height: maxV - minV }
}

export interface UvTransform {
  moveU?: number; moveV?: number; scaleU?: number; scaleV?: number; angle?: number
  pivot?: 'selection' | 'islands' | 'tile'
  width: number; height: number
}

/** Calculate first, commit later: callers can record undo only when something changes. */
export function transformUvCorners(mesh: MeshObject, corners: UvCorner[], options: UvTransform, pinned: (c: UvCorner) => boolean = () => false) {
  const groups = options.pivot === 'islands'
    ? findUvIslands(mesh).map(island => { const ids = new Set(island); return corners.filter(c => ids.has(c.faceIndex)) })
    : [corners]
  const edits: (UvCorner & UV)[] = []
  const { moveU = 0, moveV = 0, scaleU = 1, scaleV = 1, angle = 0, width, height } = options
  if (![moveU, moveV, scaleU, scaleV, angle, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return edits
  const radians = angle * Math.PI / 180, cos = Math.cos(radians), sin = Math.sin(radians)
  for (const group of groups) {
    const bounds = uvBounds(mesh, group)
    if (!bounds) continue
    const pivot = options.pivot === 'tile' ? { cU: .5, cV: .5 } : bounds
    for (const c of group) {
      if (pinned(c)) continue
      const p = mesh.faces[c.faceIndex].uvs[c.vertIndex]
      const x = (p.u - pivot.cU) * width * scaleU, y = (p.v - pivot.cV) * height * scaleV
      const u = pivot.cU + (x * cos - y * sin) / width + moveU
      const v = pivot.cV + (x * sin + y * cos) / height + moveV
      if (Number.isFinite(u) && Number.isFinite(v) && (Math.abs(u - p.u) > 1e-12 || Math.abs(v - p.v) > 1e-12)) edits.push({ ...c, u, v })
    }
  }
  return edits
}

/** Smooth interior welded UV nodes; island borders, unselected nodes and pins stay fixed. */
export function relaxUvCorners(mesh: MeshObject, corners: UvCorner[], iterations = 10, pinned: (c: UvCorner) => boolean = () => false) {
  const selected = new Set(corners.map(c => `${c.faceIndex}:${c.vertIndex}`))
  const islandIds = new Map<number, number>()
  findUvIslands(mesh).forEach((island, i) => island.forEach(f => islandIds.set(f, i)))
  const seamIds = new Set(mesh.seamEdgeIds ?? [])
  const nodes = new Map<string, { uv: UV; corners: UvCorner[]; neighbors: Set<string>; fixed: boolean }>()
  const edges = new Map<string, { a: string; b: string; count: number }>()
  const key = (f: number, v: number) => {
    const face = mesh.faces[f], uv = face.uvs[v]
    return `${islandIds.get(f)}:${face.vertexIds[v]}:${Math.round(uv.u * 1e7)}:${Math.round(uv.v * 1e7)}`
  }
  mesh.faces.forEach((face, f) => face.uvs.forEach((uv, v) => {
    const k = key(f, v), c = { faceIndex: f, vertIndex: v }
    let node = nodes.get(k)
    if (!node) { node = { uv: { ...uv }, corners: [], neighbors: new Set(), fixed: false }; nodes.set(k, node) }
    node.corners.push(c)
    const id = face.vertexIds[v], before = face.vertexIds[(v + face.vertexIds.length - 1) % face.vertexIds.length], after = face.vertexIds[(v + 1) % face.vertexIds.length]
    node.fixed ||= !selected.has(`${f}:${v}`) || pinned(c) || seamIds.has([id, before].sort().join('_')) || seamIds.has([id, after].sort().join('_'))
    const b = key(f, (v + 1) % face.uvs.length), edgeKey = [k, b].sort().join('|')
    const edge = edges.get(edgeKey)
    if (edge) edge.count++
    else edges.set(edgeKey, { a: k, b, count: 1 })
  }))
  for (const { a, b, count } of edges.values()) {
    nodes.get(a)!.neighbors.add(b); nodes.get(b)!.neighbors.add(a)
    if (count !== 2) { nodes.get(a)!.fixed = true; nodes.get(b)!.fixed = true }
  }
  for (let i = 0; i < Math.min(100, Math.max(0, iterations)); i++) {
    const updates = new Map<string, UV>()
    for (const [k, n] of nodes) {
      if (n.fixed || !n.neighbors.size) continue
      let u = 0, v = 0
      for (const other of n.neighbors) { u += nodes.get(other)!.uv.u; v += nodes.get(other)!.uv.v }
      updates.set(k, { u: (n.uv.u + u / n.neighbors.size) / 2, v: (n.uv.v + v / n.neighbors.size) / 2 })
    }
    for (const [k, uv] of updates) nodes.get(k)!.uv = uv
  }
  return [...nodes.values()].filter(n => !n.fixed).flatMap(n => n.corners.map(c => ({ ...c, ...n.uv })))
}
