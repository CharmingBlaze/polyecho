import type { MeshObject, UV } from '../../types/mesh'
import { expandFacesToIslands, expandWeldedUvEdges, findUvIslands } from './UVIslands'

export interface UvCorner { faceIndex: number; vertIndex: number }
export type UvSelectionMode = 'vertex' | 'edge' | 'face' | 'island'

/** Click: Shift/Ctrl toggles. A plain click keeps a selection when the hit is already inside it. */
export function clickSelection<T>(existing: T[], incoming: T[], additive: boolean, key: (item: T) => string): T[] {
  if (incoming.length === 0) return existing
  const incomingKeys = new Set(incoming.map(key))
  const have = new Set(existing.map(key))
  const allOn = [...incomingKeys].every(k => have.has(k))
  if (additive) {
    if (allOn) return existing.filter(item => !incomingKeys.has(key(item)))
    const next = [...existing]
    for (const item of incoming) {
      const k = key(item)
      if (!have.has(k)) {
        have.add(k)
        next.push(item)
      }
    }
    return next
  }
  if (allOn) return existing
  return [...incoming]
}

/** Box select replaces, or unions when Shift/Ctrl is held. */
export function extendSelection<T>(existing: T[], incoming: T[], additive: boolean, key: (item: T) => string): T[] {
  if (!additive) return [...incoming]
  const have = new Set(existing.map(key))
  const next = [...existing]
  for (const item of incoming) {
    const k = key(item)
    if (!have.has(k)) {
      have.add(k)
      next.push(item)
    }
  }
  return next
}

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

function weldedUvNodes(mesh: MeshObject, corners: UvCorner[]) {
  const selected = new Set(corners.map(c => `${c.faceIndex}:${c.vertIndex}`))
  const nodes = new Map<string, { u: number; v: number; corners: UvCorner[] }>()
  const links: [string, string][] = []
  const keyOf = (faceIndex: number, vertIndex: number) => {
    const face = mesh.faces[faceIndex]
    const uv = face.uvs[vertIndex]
    return `${face.vertexIds[vertIndex]}:${Math.round(uv.u * 1e6)}:${Math.round(uv.v * 1e6)}`
  }
  for (const corner of corners) {
    const face = mesh.faces[corner.faceIndex]
    const uv = face?.uvs[corner.vertIndex]
    if (!uv) continue
    const key = keyOf(corner.faceIndex, corner.vertIndex)
    let node = nodes.get(key)
    if (!node) {
      node = { u: uv.u, v: uv.v, corners: [] }
      nodes.set(key, node)
    }
    node.corners.push(corner)
  }
  mesh.faces.forEach((face, faceIndex) => {
    for (let i = 0; i < face.uvs.length; i++) {
      const next = (i + 1) % face.uvs.length
      if (!selected.has(`${faceIndex}:${i}`) || !selected.has(`${faceIndex}:${next}`)) continue
      links.push([keyOf(faceIndex, i), keyOf(faceIndex, next)])
    }
  })
  return { nodes, links }
}

/** Project each selected UV chain onto the line between its two farthest points. */
export function straightenUvCorners(mesh: MeshObject, corners: UvCorner[], pinned: (c: UvCorner) => boolean = () => false) {
  const { nodes, links } = weldedUvNodes(mesh, corners)
  const neighbors = new Map<string, Set<string>>()
  for (const key of nodes.keys()) neighbors.set(key, new Set())
  for (const [a, b] of links) {
    if (!nodes.has(a) || !nodes.has(b) || a === b) continue
    neighbors.get(a)!.add(b)
    neighbors.get(b)!.add(a)
  }
  const seen = new Set<string>()
  const edits: (UvCorner & UV)[] = []
  for (const start of nodes.keys()) {
    if (seen.has(start)) continue
    const chain: string[] = []
    const stack = [start]
    seen.add(start)
    while (stack.length) {
      const key = stack.pop()!
      chain.push(key)
      for (const next of neighbors.get(key) ?? []) {
        if (!seen.has(next)) {
          seen.add(next)
          stack.push(next)
        }
      }
    }
    if (chain.length < 3) continue
    let farA = chain[0]
    let farB = chain[1]
    let best = -1
    for (const a of chain) {
      for (const b of chain) {
        const du = nodes.get(a)!.u - nodes.get(b)!.u
        const dv = nodes.get(a)!.v - nodes.get(b)!.v
        const d = du * du + dv * dv
        if (d > best) {
          best = d
          farA = a
          farB = b
        }
      }
    }
    const a = nodes.get(farA)!
    const b = nodes.get(farB)!
    const abU = b.u - a.u
    const abV = b.v - a.v
    const len2 = abU * abU + abV * abV
    if (len2 < 1e-12) continue
    for (const key of chain) {
      const node = nodes.get(key)!
      const t = ((node.u - a.u) * abU + (node.v - a.v) * abV) / len2
      const u = a.u + abU * t
      const v = a.v + abV * t
      for (const corner of node.corners) {
        if (pinned(corner)) continue
        const current = mesh.faces[corner.faceIndex]?.uvs[corner.vertIndex]
        if (!current || (Math.abs(current.u - u) < 1e-8 && Math.abs(current.v - v) < 1e-8)) continue
        edits.push({ ...corner, u, v })
      }
    }
  }
  return edits
}

/** Reflect selected corners across the middle of the 0–1 texture. */
export function mirrorUvCorners(mesh: MeshObject, corners: UvCorner[], axis: 'u' | 'v', pinned: (c: UvCorner) => boolean = () => false) {
  const edits: (UvCorner & UV)[] = []
  for (const corner of corners) {
    if (pinned(corner)) continue
    const current = mesh.faces[corner.faceIndex]?.uvs[corner.vertIndex]
    if (!current) continue
    const u = axis === 'u' ? 1 - current.u : current.u
    const v = axis === 'v' ? 1 - current.v : current.v
    if (Math.abs(u - current.u) < 1e-8 && Math.abs(v - current.v) < 1e-8) continue
    edits.push({ ...corner, u, v })
  }
  return edits
}

/** Inspect stays closed until there is a UV selection, and stays closed if the user dismissed it. */
export function uvInspectAfterSelection(
  cornerCount: number,
  showPrecision: boolean,
  inspectDismissed: boolean,
): { showPrecision: boolean; inspectDismissed: boolean } {
  if (cornerCount === 0) return { showPrecision: false, inspectDismissed: false }
  if (inspectDismissed) return { showPrecision, inspectDismissed: true }
  return { showPrecision: true, inspectDismissed: false }
}

export function uvInspectToggled(currentlyOpen: boolean): { showPrecision: boolean; inspectDismissed: boolean } {
  const showPrecision = !currentlyOpen
  return { showPrecision, inspectDismissed: !showPrecision }
}
