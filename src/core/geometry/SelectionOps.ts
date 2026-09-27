import type { MeshObject } from '../../types/mesh'
import { getMeshEdges, undirectedEdgeId } from './EdgeUtils'
import type { ComponentMode } from './SelectionConversion'

/** Component selection in one select mode. Only the array for that mode is read or written. */
export interface ComponentSelection { vertices: string[]; edges: string[]; faces: string[] }

const empty = (): ComponentSelection => ({ vertices: [], edges: [], faces: [] })

function ringEdges(ids: string[]) {
  return ids.map((id, i) => undirectedEdgeId(id, ids[(i + 1) % ids.length]))
}

/** Vertices joined by a face edge. */
function vertexNeighbours(mesh: MeshObject) {
  const out = new Map<string, Set<string>>()
  const link = (a: string, b: string) => {
    if (!out.has(a)) out.set(a, new Set())
    out.get(a)!.add(b)
  }
  for (const face of mesh.faces) {
    const n = face.vertexIds.length
    for (let i = 0; i < n; i++) {
      const a = face.vertexIds[i], b = face.vertexIds[(i + 1) % n]
      link(a, b)
      link(b, a)
    }
  }
  return out
}

function edgeVertices(mesh: MeshObject, edgeIds: string[]) {
  const wanted = new Set(edgeIds)
  const verts = new Set<string>()
  for (const e of getMeshEdges(mesh)) if (wanted.has(e.id)) { verts.add(e.v1); verts.add(e.v2) }
  return verts
}

function edgesWithin(mesh: MeshObject, verts: Set<string>) {
  return getMeshEdges(mesh).filter(e => verts.has(e.v1) && verts.has(e.v2)).map(e => e.id)
}

/** Vertices of every face that touches a selected vertex (Blender Select More, face step). */
function growVertices(mesh: MeshObject, verts: Set<string>) {
  const out = new Set(verts)
  for (const face of mesh.faces) {
    if (face.vertexIds.some(id => verts.has(id))) face.vertexIds.forEach(id => out.add(id))
  }
  return out
}

/** Drop selected vertices that share a face with an unselected vertex (Blender Select Less). */
function shrinkVertices(mesh: MeshObject, verts: Set<string>) {
  const out = new Set(verts)
  for (const face of mesh.faces) {
    if (face.vertexIds.some(id => !verts.has(id))) face.vertexIds.forEach(id => out.delete(id))
  }
  return out
}

/** Ctrl+Numpad+ */
export function selectMore(mesh: MeshObject, mode: ComponentMode, sel: ComponentSelection): ComponentSelection {
  const out = empty()
  if (mode === 'vertex') out.vertices = [...growVertices(mesh, new Set(sel.vertices))]
  else if (mode === 'edge') out.edges = edgesWithin(mesh, growVertices(mesh, edgeVertices(mesh, sel.edges)))
  else {
    const picked = new Set(sel.faces)
    const verts = new Set(mesh.faces.filter(f => picked.has(f.id)).flatMap(f => f.vertexIds))
    out.faces = mesh.faces.filter(f => picked.has(f.id) || f.vertexIds.some(id => verts.has(id))).map(f => f.id)
  }
  return out
}

/** Ctrl+Numpad- */
export function selectLess(mesh: MeshObject, mode: ComponentMode, sel: ComponentSelection): ComponentSelection {
  const out = empty()
  if (mode === 'vertex') {
    const kept = shrinkVertices(mesh, new Set(sel.vertices))
    out.vertices = sel.vertices.filter(id => kept.has(id))
  } else if (mode === 'edge') {
    const kept = shrinkVertices(mesh, edgeVertices(mesh, sel.edges))
    const edges = new Set(edgesWithin(mesh, kept))
    out.edges = sel.edges.filter(id => edges.has(id))
  } else {
    const picked = new Set(sel.faces)
    const outside = new Set(mesh.faces.filter(f => !picked.has(f.id)).flatMap(f => f.vertexIds))
    const kept = new Set(mesh.faces.filter(f => picked.has(f.id) && !f.vertexIds.some(id => outside.has(id))).map(f => f.id))
    out.faces = sel.faces.filter(id => kept.has(id))
  }
  return out
}

/**
 * Ctrl+L: everything connected to the selection. Faces connect through shared edges, not a
 * single shared corner, so two cubes touching at one vertex stay separate (Blender).
 */
export function selectLinked(
  mesh: MeshObject,
  mode: ComponentMode,
  sel: ComponentSelection,
  options: { delimitSeams?: boolean } = {}
): ComponentSelection {
  const out = empty()
  if (mode === 'face') {
    const seams = new Set(options.delimitSeams ? mesh.seamEdgeIds ?? [] : [])
    const byEdge = new Map<string, string[]>()
    for (const face of mesh.faces) {
      for (const id of ringEdges(face.vertexIds)) {
        if (!byEdge.has(id)) byEdge.set(id, [])
        byEdge.get(id)!.push(face.id)
      }
    }
    const faceById = new Map(mesh.faces.map(f => [f.id, f]))
    const seen = new Set(sel.faces.filter(id => faceById.has(id)))
    const queue = [...seen]
    while (queue.length) {
      const face = faceById.get(queue.pop()!)!
      for (const edge of ringEdges(face.vertexIds)) {
        if (seams.has(edge)) continue
        for (const other of byEdge.get(edge) ?? []) {
          if (!seen.has(other)) { seen.add(other); queue.push(other) }
        }
      }
    }
    out.faces = mesh.faces.filter(f => seen.has(f.id)).map(f => f.id)
    return out
  }
  const neighbours = vertexNeighbours(mesh)
  const start = mode === 'vertex' ? new Set(sel.vertices) : edgeVertices(mesh, sel.edges)
  const seen = new Set(start)
  const queue = [...start]
  while (queue.length) {
    for (const next of neighbours.get(queue.pop()!) ?? []) {
      if (!seen.has(next)) { seen.add(next); queue.push(next) }
    }
  }
  if (mode === 'vertex') out.vertices = mesh.vertices.filter(v => seen.has(v.id)).map(v => v.id)
  else out.edges = edgesWithin(mesh, seen)
  return out
}

/** Ctrl+I */
export function selectInverse(mesh: MeshObject, mode: ComponentMode, sel: ComponentSelection): ComponentSelection {
  const out = empty()
  if (mode === 'vertex') {
    const picked = new Set(sel.vertices)
    out.vertices = mesh.vertices.filter(v => !picked.has(v.id)).map(v => v.id)
  } else if (mode === 'edge') {
    const picked = new Set(sel.edges)
    out.edges = getMeshEdges(mesh).filter(e => !picked.has(e.id)).map(e => e.id)
  } else {
    const picked = new Set(sel.faces)
    out.faces = mesh.faces.filter(f => !picked.has(f.id)).map(f => f.id)
  }
  return out
}

/** Every id in each array for `mode` (Select All). The other arrays are empty. */
export function selectEverything(mesh: MeshObject, mode: ComponentMode): ComponentSelection {
  return selectInverse(mesh, mode, empty())
}

/** Drop ids that no longer exist on `mesh`. Order is kept, so the last id stays the active one. */
export function pruneSelection(mesh: MeshObject, sel: ComponentSelection): ComponentSelection {
  const verts = new Set(mesh.vertices.map(v => v.id))
  const faces = new Set(mesh.faces.map(f => f.id))
  const edges = sel.edges.length ? new Set(getMeshEdges(mesh).map(e => e.id)) : new Set<string>()
  return {
    vertices: sel.vertices.filter(id => verts.has(id)),
    edges: sel.edges.filter(id => edges.has(id)),
    faces: sel.faces.filter(id => faces.has(id)),
  }
}
