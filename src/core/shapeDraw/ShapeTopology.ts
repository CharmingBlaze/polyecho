import * as THREE from 'three'
import { EditableMesh } from '../mesh/MeshKernel'
import { PolyDrawKernel } from '../mesh/operations/PolyDrawKernel'


const orient = (a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
const key = (a: number, b: number) => a < b ? `${a}:${b}` : `${b}:${a}`

export function depthSampler(side: THREE.Vector2[] | null, outline: THREE.Vector2[]) {
  if (!side) return (_height: number) => ({ span: 1, centre: 0 })
  if (side.length > 512 || side.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) throw new Error('Simplify the side profile and check its points.')
  const error = PolyDrawKernel.loopError(side.map(p => new THREE.Vector3(p.x, p.y, 0)))
  if (error) throw new Error(`Side profile: ${error}`)
  const min = Math.min(...side.map(p => p.y)), max = Math.max(...side.map(p => p.y))
  if (min > Math.min(...outline.map(p => p.y)) + 1e-7 || max < Math.max(...outline.map(p => p.y)) - 1e-7) throw new Error('Extend the side profile to cover the full height of the front outline.')
  return (height: number) => {
    const y = THREE.MathUtils.clamp(height, min + (max - min) * 1e-7, max - (max - min) * 1e-7)
    const hits: number[] = []
    side.forEach((a, i) => {
      const b = side[(i + 1) % side.length]
      if ((a.y > y) !== (b.y > y)) hits.push(a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y))
    })
    hits.sort((a, b) => a - b)
    if (hits.length !== 2) throw new Error('The side profile has multiple depth intervals. Split this into separate shapes.')
    return { span: Math.max(0.001, hits[1] - hits[0]), centre: (hits[0] + hits[1]) / 2 }
  }
}

export function triangleQuality(a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2) {
  return Math.abs(orient(a, b, c)) * 2 * Math.sqrt(3) / Math.max(1e-20, a.distanceToSquared(b) + b.distanceToSquared(c) + c.distanceToSquared(a))
}

function isPlanarConvexQuad(mesh: EditableMesh, ids: number[]) {
  const points = ids.map(id => mesh.vertices.get(id)!.position)
  const n = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0]))
  const scale = Math.max(...points.map(p => p.distanceTo(points[0])), 1e-8)
  if (n.lengthSq() < scale ** 4 * 1e-14) return false
  n.normalize()
  if (Math.abs(points[3].clone().sub(points[0]).dot(n)) > scale * 1e-6) return false
  return points.every((a, i) => points[(i + 1) % 4].clone().sub(a).cross(points[(i + 2) % 4].clone().sub(points[(i + 1) % 4])).dot(n) > scale * scale * 1e-10)
}

export function addSurfacePatch(mesh: EditableMesh, ids: number[]) {
  const faces = ids.length === 4 && !isPlanarConvexQuad(mesh, ids) ? [[ids[0], ids[1], ids[2]], [ids[0], ids[2], ids[3]]] : [ids]
  faces.forEach(face => mesh.addFace(face, face.map(() => new THREE.Vector2()), 0))
}

/** Only merge coplanar convex pairs. Curved or twisted patches keep their explicit diagonal. */
export function mergePlanarPairs(mesh: EditableMesh) {
  for (const edge of [...mesh.edges.values()]) {
    if (edge.faceIds.length !== 2) continue
    const a = mesh.faces.get(edge.faceIds[0]), b = mesh.faces.get(edge.faceIds[1])
    if (!a || !b || a.vertexIds.length !== 3 || b.vertexIds.length !== 3) continue
    const idx = a.vertexIds.findIndex((v, i) => (v === edge.v1 && a.vertexIds[(i + 1) % 3] === edge.v2) || (v === edge.v2 && a.vertexIds[(i + 1) % 3] === edge.v1))
    if (idx < 0) continue
    const first = a.vertexIds[idx], second = a.vertexIds[(idx + 1) % 3], third = a.vertexIds[(idx + 2) % 3], fourth = b.vertexIds.find(v => v !== first && v !== second)!
    const quad = [third, first, fourth, second]
    if (!isPlanarConvexQuad(mesh, quad)) continue
    mesh.removeFace(a.id); mesh.removeFace(b.id); addSurfacePatch(mesh, quad)
  }
}

/** Constrained quality flips. The outline and hole edges are never changed. */
export function improveTriangles(points: THREE.Vector2[], triangles: number[][], constrained: Set<string>, passes = 8) {
  for (let pass = 0; pass < passes; pass++) {
    const edges = new Map<string, { face: number; a: number; b: number; c: number }[]>()
    triangles.forEach((tri, face) => tri.forEach((a, i) => {
      const b = tri[(i + 1) % 3], k = key(a, b)
      if (constrained.has(k)) return
      const entries = edges.get(k) ?? []
      entries.push({ face, a, b, c: tri[(i + 2) % 3] }); edges.set(k, entries)
    }))
    const touched = new Set<number>()
    let changed = false
    for (const pair of edges.values()) {
      if (pair.length !== 2) continue
      const [first, second] = pair
      if (touched.has(first.face) || touched.has(second.face)) continue
      const { a, b, c } = first, d = second.c
      if (c === d || constrained.has(key(c, d))) continue
      if (orient(points[c], points[d], points[b]) <= 1e-12 || orient(points[d], points[c], points[a]) <= 1e-12) continue
      const before = Math.min(triangleQuality(points[a], points[b], points[c]), triangleQuality(points[b], points[a], points[d]))
      const after = Math.min(triangleQuality(points[c], points[d], points[b]), triangleQuality(points[d], points[c], points[a]))
      if (after <= before + 1e-6) continue
      triangles[first.face] = [c, d, b]; triangles[second.face] = [d, c, a]
      touched.add(first.face); touched.add(second.face); changed = true
    }
    if (!changed) break
  }
}

/** Spend the density budget on interior coverage, rather than subdividing every face. */
export function refineInterior(points: THREE.Vector2[], triangles: number[][], boundaryEdges: Set<string>, density: number) {
  const boundaryCount = points.length
  const budget = Math.min(192, Math.max(1, Math.ceil(boundaryCount * 0.4 * [1, 2, 4][density])))
  improveTriangles(points, triangles, boundaryEdges)
  for (let insert = 0; insert < budget; insert++) {
    let largest = -1, area = 0
    triangles.forEach((tri, i) => {
      const candidate = Math.abs(orient(points[tri[0]], points[tri[1]], points[tri[2]]))
      if (candidate > area) { area = candidate; largest = i }
    })
    if (largest < 0 || area < 1e-12) break
    const [a, b, c] = triangles[largest], id = points.length
    points.push(points[a].clone().add(points[b]).add(points[c]).multiplyScalar(1 / 3))
    triangles.splice(largest, 1, [a, b, id], [b, c, id], [c, a, id])
    improveTriangles(points, triangles, boundaryEdges, 3)
  }
  improveTriangles(points, triangles, boundaryEdges)
  // Relax only interior samples, and only when all incident triangles improve.
  const incident = points.map(() => [] as number[]), neighbours = points.map(() => new Set<number>())
  triangles.forEach((tri, id) => tri.forEach(a => {
    incident[a].push(id); tri.forEach(b => { if (a !== b) neighbours[a].add(b) })
  }))
  for (let pass = 0; pass < 5; pass++) for (let i = boundaryCount; i < points.length; i++) {
    if (!neighbours[i].size) continue
    const target = [...neighbours[i]].reduce((sum, j) => sum.add(points[j]), new THREE.Vector2()).divideScalar(neighbours[i].size)
    const before = Math.min(...incident[i].map(id => { const [a, b, c] = triangles[id]; return triangleQuality(points[a], points[b], points[c]) }))
    const original = points[i].clone(); points[i].lerp(target, 0.5)
    const valid = incident[i].every(id => { const [a, b, c] = triangles[id]; return orient(points[a], points[b], points[c]) > 1e-12 && triangleQuality(points[a], points[b], points[c]) >= before - 1e-8 })
    if (!valid) points[i].copy(original)
  }
  improveTriangles(points, triangles, boundaryEdges)
}
