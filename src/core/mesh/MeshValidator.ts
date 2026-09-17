import type { EditableMesh } from './MeshKernel'
import { polygonAreaVector } from '../geometry/PolygonGeometry'
import { GeometryTolerance } from '../geometry/GeometryTolerance'

export interface MeshValidationResult {
  valid: boolean
  brokenHalfEdges: number[]
  nonManifoldEdges: number[]
  orphanVertices: number[]
  zeroAreaFaces: number[]
  invalidVertices: number[]
  invalidEdges: number[]
  invalidFaces: number[]
  duplicateEdges: number[]
  duplicateFaces: number[]
  boundaryEdges: number[]
  zeroLengthEdges: number[]
  flippedEdges: number[]
  nonPlanarFaces: number[]
}

// Adjacency lists here are tiny (valence ~4-8), so scanning beats allocating a
// Set per call: validate invokes this twice per vertex and twice per edge.
const sameIds = (a: number[], b: number[]) => {
  const n = a.length
  if (n !== b.length) return false
  for (let i = 0; i < n; i++) {
    const id = a[i]!
    if (!b.includes(id)) return false
    for (let j = i + 1; j < n; j++) if (a[j] === id) return false
  }
  return true
}

export class MeshValidator {
  static validate(mesh: EditableMesh): MeshValidationResult {
    const r: MeshValidationResult = {
      valid: true, brokenHalfEdges: [], nonManifoldEdges: [], orphanVertices: [], zeroAreaFaces: [],
      invalidVertices: [], invalidEdges: [], invalidFaces: [], duplicateEdges: [], duplicateFaces: [],
      boundaryEdges: [], zeroLengthEdges: [], flippedEdges: [], nonPlanarFaces: [],
    }
    const vertexEdges = new Map<number, number[]>()
    const vertexFaces = new Map<number, number[]>()
    const edgeFaces = new Map<number, number[]>()
    const edgeHalves = new Map<number, number[]>()
    const append = (map: Map<number, number[]>, key: number, id: number) => {
      const ids = map.get(key) ?? []; ids.push(id); map.set(key, ids)
    }
    for (const [id, edge] of mesh.edges) {
      append(vertexEdges, edge.v1, id); append(vertexEdges, edge.v2, id)
    }
    for (const [id, face] of mesh.faces) {
      for (const v of new Set(face.vertexIds)) append(vertexFaces, v, id)
      for (const e of new Set(face.edgeIds)) append(edgeFaces, e, id)
    }
    for (const [id, he] of mesh.halfEdges) append(edgeHalves, he.edgeId, id)
    for (const [id, v] of mesh.vertices) {
      if (!v.edgeIds.length && !v.faceIds.length) r.orphanVertices.push(id)
      if (v.id !== id || ![v.position.x, v.position.y, v.position.z].every(Number.isFinite) ||
          !sameIds(v.edgeIds, vertexEdges.get(id) ?? []) || !sameIds(v.faceIds, vertexFaces.get(id) ?? [])) r.invalidVertices.push(id)
    }
    const edgeKeys = new Set<string>()
    for (const [id, e] of mesh.edges) {
      const key = [e.v1, e.v2].sort((a, b) => a - b).join(',')
      if (edgeKeys.has(key)) r.duplicateEdges.push(id)
      edgeKeys.add(key)
      const a = mesh.vertices.get(e.v1), b = mesh.vertices.get(e.v2)
      if (!a || !b || e.v1 === e.v2 || e.id !== id ||
          !sameIds(e.faceIds, edgeFaces.get(id) ?? []) || !sameIds(e.halfEdgeIds, edgeHalves.get(id) ?? [])) r.invalidEdges.push(id)
      if (a && b && a.position.distanceToSquared(b.position) === 0) r.zeroLengthEdges.push(id)
      if (e.faceIds.length === 1) r.boundaryEdges.push(id)
      if (e.faceIds.length > 2) r.nonManifoldEdges.push(id)
      if (e.halfEdgeIds.length === 2) {
        const [h, t] = e.halfEdgeIds.map(i => mesh.halfEdges.get(i))
        if (h && t && h.vertexId === t.vertexId) r.flippedEdges.push(id)
        else if (h && t && (h.twinId !== t.id || t.twinId !== h.id)) r.brokenHalfEdges.push(h.id, t.id)
      }
    }
    for (const [id, h] of mesh.halfEdges) {
      const next = mesh.halfEdges.get(h.nextId), prev = mesh.halfEdges.get(h.prevId)
      const face = mesh.faces.get(h.faceId), edge = mesh.edges.get(h.edgeId)
      let broken = h.id !== id || !mesh.vertices.has(h.vertexId) || !face || !edge ||
        !next || next.prevId !== id || next.faceId !== h.faceId || !prev || prev.nextId !== id || prev.faceId !== h.faceId ||
        !face.halfEdgeIds.includes(id) || !edge.halfEdgeIds.includes(id)
      if (edge && next && !((edge.v1 === h.vertexId && edge.v2 === next.vertexId) || (edge.v2 === h.vertexId && edge.v1 === next.vertexId))) broken = true
      if (h.twinId !== null) {
        const twin = mesh.halfEdges.get(h.twinId)
        if (!twin || twin.id === id || twin.twinId !== id || twin.edgeId !== h.edgeId ||
            twin.faceId === h.faceId || twin.vertexId !== next?.vertexId || mesh.halfEdges.get(twin.nextId)?.vertexId !== h.vertexId) broken = true
      }
      if (broken) r.brokenHalfEdges.push(id)
    }
    const faceKeys = new Set<string>()
    for (const [id, f] of mesh.faces) {
      const n = f.vertexIds.length
      // Canonical cyclic order, allowing reversed winding without conflating different loops.
      const rotations = (ids: number[]) => ids.map((_, i) => [...ids.slice(i), ...ids.slice(0, i)].join(','))
      const key = [...rotations(f.vertexIds), ...rotations([...f.vertexIds].reverse())].sort()[0]
      if (faceKeys.has(key)) r.duplicateFaces.push(id)
      faceKeys.add(key)
      if (f.id !== id || n < 3 || new Set(f.vertexIds).size !== n || f.edgeIds.length !== n || f.halfEdgeIds.length !== n ||
          new Set(f.halfEdgeIds).size !== n || f.uvs.length !== n || f.uvs.some(uv => !Number.isFinite(uv.x) || !Number.isFinite(uv.y)) ||
          f.halfEdgeIds.some((hid, i) => {
            const h = mesh.halfEdges.get(hid)
            return !h || h.faceId !== id || h.vertexId !== f.vertexIds[i] || h.edgeId !== f.edgeIds[i] ||
              h.nextId !== f.halfEdgeIds[(i + 1) % n] || h.prevId !== f.halfEdgeIds[(i + n - 1) % n]
          })) r.invalidFaces.push(id)
      const points = f.vertexIds.map(v => mesh.vertices.get(v)?.position)
      if (n < 3 || points.some(p => !p || ![p.x, p.y, p.z].every(Number.isFinite))) { r.zeroAreaFaces.push(id); continue }
      const ps = points as import('three').Vector3[]
      const scale = Math.max(...ps.map(p => p.distanceToSquared(ps[0])))
      if (scale === 0 || polygonAreaVector(ps).lengthSq() <= scale * scale * GeometryTolerance.normal ** 2) r.zeroAreaFaces.push(id)
      else if (!mesh.getFacePlanarity(id).planar) r.nonPlanarFaces.push(id)
    }
    r.brokenHalfEdges = [...new Set(r.brokenHalfEdges)]
    // Open boundaries, loose vertices and non-manifold incidence are diagnostics.
    r.valid = [r.brokenHalfEdges, r.invalidVertices, r.invalidEdges, r.invalidFaces,
      r.zeroAreaFaces, r.duplicateEdges, r.duplicateFaces].every(ids => ids.length === 0)
    return r
  }
}

export function assertMeshValid(mesh: EditableMesh): void {
  const result = MeshValidator.validate(mesh)
  if (!result.valid) throw new Error(`Invalid mesh: ${JSON.stringify(result)}`)
}
