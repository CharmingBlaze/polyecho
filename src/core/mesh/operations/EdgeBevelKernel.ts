import * as THREE from 'three'
import { EditableMesh } from '../MeshKernel'
import type { BevelOptions, BevelResult } from './BevelKernel'
import { MeshValidator } from '../MeshValidator'

/** Chamfer selected manifold edges, preserving neighboring face connectivity. */
export function bevelEdges(mesh: EditableMesh, edgeIds: number[], options: BevelOptions): BevelResult {
  const snapshot = mesh.createSnapshot()
  const wasClosed = [...mesh.edges.values()].every(e => e.faceIds.length === 2)
  const result = buildBevel(mesh, edgeIds, options)
  if (!MeshValidator.validate(mesh).valid || (wasClosed && [...mesh.edges.values()].some(e => e.faceIds.length !== 2))) {
    mesh.restoreSnapshot(snapshot)
    return { mesh, beveledFaceIds: [], beveledVertexIds: [], error: 'This corner cannot be beveled cleanly. Try a smaller width or fewer edges.' }
  }
  return result
}

function buildBevel(mesh: EditableMesh, edgeIds: number[], options: BevelOptions): BevelResult {
  const result: BevelResult = { mesh, beveledFaceIds: [], beveledVertexIds: [] }
  if (!Number.isFinite(options.width) || options.width <= 1e-9) return result
  const edges = [...new Set(edgeIds)].flatMap(id => {
    const e = mesh.edges.get(id)
    return e && e.faceIds.length === 2 ? [{ ...e, faceIds: [...e.faceIds] }] : []
  })
  if (!edges.length) return { ...result, error: 'Select an edge shared by two faces to bevel.' }
  const selected = new Set(edges.map(e => e!.id))
  const affected = new Set(edges.flatMap(e => [e!.v1, e!.v2]))
  const faces = [...mesh.faces.values()].filter(f => f.vertexIds.some(id => affected.has(id)))
  const shortest = Math.min(...faces.flatMap(f => f.edgeIds.map(id => {
    const e = mesh.edges.get(id)!; return mesh.vertices.get(e.v1)!.position.distanceTo(mesh.vertices.get(e.v2)!.position)
  })))
  const width = options.clampOverlap === false ? options.width : Math.min(options.width, shortest * 0.2)
  const segments = Math.max(1, Math.min(8, Math.round(options.segments || 1)))
  const profile = THREE.MathUtils.clamp(options.profile ?? 0, 0, 1)
  const corners = new Map<string, number>()
  const onEdge = new Map<string, number>()
  const atVertex = new Map<number, Set<number>>()
  const register = (old: number, id: number) => {
    const ids = atVertex.get(old) ?? new Set<number>(); ids.add(id); atVertex.set(old, ids)
  }
  const make = (old: number, p: THREE.Vector3) => {
    const existing = [...(atVertex.get(old) ?? [])].find(id => mesh.vertices.get(id)!.position.distanceToSquared(p) < shortest * shortest * 1e-16)
    if (existing !== undefined) return existing
    const id = mesh.addVertex(p).id; register(old, id); result.beveledVertexIds.push(id); return id
  }
  for (const face of faces) {
    face.vertexIds.forEach((id, i) => {
      const n = face.vertexIds.length, before = face.edgeIds[(i + n - 1) % n], after = face.edgeIds[i]
      const a = selected.has(before), b = selected.has(after)
      if (!a && !b) return
      const p = mesh.vertices.get(id)!.position
      const incoming = p.clone().sub(mesh.vertices.get(face.vertexIds[(i + n - 1) % n])!.position).normalize()
      const outgoing = mesh.vertices.get(face.vertexIds[(i + 1) % n])!.position.clone().sub(p).normalize()
      const na = face.normal.clone().cross(incoming).normalize(), nb = face.normal.clone().cross(outgoing).normalize()
      const dot = na.dot(nb), denominator = 1 - dot * dot
      let delta: THREE.Vector3
      if (denominator < 1e-10) delta = na.clone().multiplyScalar(a ? width : 0)
      else {
        const da = a ? width : 0, db = b ? width : 0
        delta = na.clone().multiplyScalar((da - dot * db) / denominator).addScaledVector(nb, (db - dot * da) / denominator)
      }
      // Acute corners cannot be allowed to shoot beyond their neighboring edges.
      delta.clampLength(0, shortest * 0.4)
      const next = make(id, p.clone().add(delta))
      corners.set(`${face.id}:${id}`, next)
      if (!a) onEdge.set(`${before}:${id}`, next)
      if (!b) onEdge.set(`${after}:${id}`, next)
    })
  }
  // Replace the original faces. Unselected faces receive the new cut endpoints
  // on their boundary, so partial edge selections leave no T-junctions.
  for (const face of faces) {
    const ids: number[] = [], uvs: THREE.Vector2[] = []
    face.vertexIds.forEach((old, i) => {
      const corner = corners.get(`${face.id}:${old}`), n = face.vertexIds.length
      const append = (id: number) => {
        if (ids[ids.length - 1] !== id) { ids.push(id); uvs.push(face.uvs[i]?.clone() ?? new THREE.Vector2()) }
      }
      if (corner !== undefined) append(corner)
      else {
        const incoming = onEdge.get(`${face.edgeIds[(i + n - 1) % n]}:${old}`)
        const outgoing = onEdge.get(`${face.edgeIds[i]}:${old}`)
        if (incoming !== undefined) append(incoming)
        if (incoming === undefined || outgoing === undefined) append(old)
        if (outgoing !== undefined) append(outgoing)
      }
    })
    mesh.removeFace(face.id)
    mesh.addFace(ids, uvs, face.materialIndex, face.color, face.id)
  }
  for (const edge of edges) {
    const e = edge!, f = faces.find(face => face.id === e.faceIds[0])!, other = e.faceIds[1]
    const index = f.vertexIds.indexOf(e.v1), forward = f.vertexIds[(index + 1) % f.vertexIds.length] === e.v2
    const a = forward ? e.v1 : e.v2, b = forward ? e.v2 : e.v1
    const a0 = corners.get(`${f.id}:${a}`)!, b0 = corners.get(`${f.id}:${b}`)!
    const a1 = corners.get(`${other}:${a}`)!, b1 = corners.get(`${other}:${b}`)!
    let prevA = a0, prevB = b0
    for (let s = 1; s <= segments; s++) {
      const t = s / segments
      const sample = (old: number, first: number, last: number) => {
        if (s === segments) return last
        const p = mesh.vertices.get(first)!.position.clone().lerp(mesh.vertices.get(last)!.position, t)
        // Profile zero is a straight chamfer; round approaches the old edge.
        const bulge = Math.sin(Math.PI * t) * (profile <= 0.5 ? profile : 1 - 3 * (profile - 0.5))
        p.lerp(mesh.vertices.get(old)!.position, bulge)
        return make(old, p)
      }
      const nextA = sample(a, a0, a1), nextB = sample(b, b0, b1)
      const strip = mesh.addFace([prevB, prevA, nextA, nextB], [new THREE.Vector2(1, (s - 1) / segments), new THREE.Vector2(0, (s - 1) / segments), new THREE.Vector2(0, t), new THREE.Vector2(1, t)], f.materialIndex, f.color)
      if (strip) result.beveledFaceIds.push(strip.id)
      prevA = nextA; prevB = nextB
    }
  }
  // Close only the small boundary loops created around affected corners.
  for (const [old, vertices] of atVertex) {
    const boundary = [...mesh.halfEdges.values()].filter(h => h.twinId === null && vertices.has(h.vertexId) && vertices.has(mesh.halfEdges.get(h.nextId)!.vertexId))
    if (boundary.length < 3) continue
    const loop = [boundary[0].vertexId], used = new Set<number>()
    let next = boundary[0]
    while (!used.has(next.id)) {
      used.add(next.id)
      const end = mesh.halfEdges.get(next.nextId)!.vertexId
      if (end === loop[0]) break
      loop.push(end)
      const found = boundary.find(h => h.vertexId === end && !used.has(h.id))
      if (!found) break
      next = found
    }
    if (used.size !== boundary.length || mesh.halfEdges.get(next.nextId)!.vertexId !== loop[0]) continue
    const source = faces.find(f => f.vertexIds.includes(old))!
    const cap = mesh.addFace(loop.reverse(), undefined, source.materialIndex, source.color)
    if (cap) result.beveledFaceIds.push(cap.id)
  }
  for (const id of affected) {
    const v = mesh.vertices.get(id)
    if (v && !v.faceIds.length && !v.edgeIds.length) mesh.removeVertex(id)
  }
  mesh.recalculateNormals()
  return result
}
