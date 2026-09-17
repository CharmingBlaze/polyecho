import * as THREE from 'three'
import type { MeshObject, Vector3D } from '../../types/mesh'
import { EditableMesh } from '../mesh/MeshKernel'
import { PolyDrawKernel } from '../mesh/operations/PolyDrawKernel'
import { refineInterior, improveTriangles, addSurfacePatch, mergePlanarPairs, depthSampler } from './ShapeTopology'
import { quadGridVolume } from './QuadGrid'

export type ShapeStyle = 'flat' | 'rounded' | 'inflated' | 'blocky' | 'organic' | 'hard-surface'
export interface ShapePoint { x: number; y: number; smooth?: boolean }
export interface ShapeRecipe {
  version: 1
  points: ShapePoint[]
  sections?: { at: number; points: ShapePoint[] }[]
  holes?: ShapePoint[][]
  frontBias?: number
  symmetry?: 'none' | 'x' | 'y'
  /** Depth coordinates are normalized by depth; vertical coordinates share the front profile. */
  sideProfile?: ShapePoint[]
  topology?: 'auto' | 'triangles' | 'quad-grid'
  origin: Vector3D
  axisU: Vector3D
  axisV: Vector3D
  depth: number
  roundness: number
  density: 0 | 1 | 2
  style: ShapeStyle
  kind?: 'outline' | 'path' | 'loft'
  /** End radius as a fraction of the starting radius. */
  taper?: number
}
export interface ShapeSource {
  recipe: ShapeRecipe
  /** Detect component edits before allowing regeneration to replace mesh data. */
  evaluatedSignature: string
}
export const cloneRecipe = (recipe: ShapeRecipe): ShapeRecipe => JSON.parse(JSON.stringify(recipe))
export const vector = (p: Vector3D) => new THREE.Vector3(p.x, p.y, p.z)

export function geometrySignature(mesh: Pick<MeshObject, 'vertices' | 'faces'>): string {
  let hash = 2166136261
  const data = JSON.stringify([
    mesh.vertices.map(v => [v.id, v.position.x, v.position.y, v.position.z, v.color, v.boneWeights]),
    mesh.faces.map(f => [f.id, f.vertexIds, f.uvs, f.materialIndex]),
  ])
  for (let i = 0; i < data.length; i++) hash = Math.imul(hash ^ data.charCodeAt(i), 16777619)
  return `${data.length}:${hash >>> 0}`
}

export function shapeSourceIsCurrent(mesh: MeshObject): boolean {
  return !!mesh.shapeSource && mesh.shapeSource.recipe.version === 1 &&
    mesh.shapeSource.evaluatedSignature === geometrySignature(mesh)
}

/** A planar, boundary-preserving shell. Interior refinement supplies real volume. */
export function generateShape(recipe: ShapeRecipe): EditableMesh {
  if (recipe.version !== 1 || !Array.isArray(recipe.points) || recipe.points.length < (recipe.kind === 'path' ? 2 : 3) || recipe.points.length > 256) {
    throw new Error('Draw a closed outline with 3–256 points.')
  }
  if (![recipe.depth, recipe.roundness, ...recipe.points.flatMap(p => [p.x, p.y]),
    ...[recipe.origin, recipe.axisU, recipe.axisV].flatMap(p => p ? [p.x, p.y, p.z] : [NaN])].every(Number.isFinite)) {
    throw new Error('The shape contains an invalid coordinate.')
  }
  if (recipe.depth < 0.001 || recipe.depth > 1000 || recipe.roundness < 0 || recipe.roundness > 1 ||
    ![0, 1, 2].includes(recipe.density) || !['flat', 'rounded', 'inflated', 'blocky', 'organic', 'hard-surface'].includes(recipe.style)) {
    throw new Error('Choose valid depth, form, and detail settings.')
  }
  const u = vector(recipe.axisU), v = vector(recipe.axisV), origin = vector(recipe.origin)
  if (Math.abs(u.length() - 1) > 1e-4 || Math.abs(v.length() - 1) > 1e-4 || Math.abs(u.dot(v)) > 1e-4) {
    throw new Error('The drawing plane is invalid.')
  }
  const normal = u.clone().cross(v).normalize()
  if (recipe.kind && !['outline', 'path', 'loft'].includes(recipe.kind)) throw new Error('Unknown drawing type.')
  if (recipe.kind === 'path') return generatePath(recipe, u, v, origin, normal)
  if (recipe.kind === 'loft') return generateLoft(recipe)
  let outline = sampleOutline(mirroredOutline(recipe))
  const error = PolyDrawKernel.loopError(outline.map(p => new THREE.Vector3(p.x, p.y, 0)))
  if (error) throw new Error(error)
  if (THREE.ShapeUtils.isClockWise(outline)) outline = outline.reverse()
  if ((recipe.holes?.length ?? 0) > 8) throw new Error('Use at most eight holes per outline.')
  const holes = (recipe.holes ?? []).map(source => {
    if (source.length < 3 || source.length > 128 || source.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) throw new Error('Finish each hole with at least three valid points.')
    let hole = sampleOutline(source)
    const error = PolyDrawKernel.loopError(hole.map(p => new THREE.Vector3(p.x, p.y, 0)))
    if (error) throw new Error(`Hole: ${error}`)
    if (!THREE.ShapeUtils.isClockWise(hole)) hole = hole.reverse()
    if (hole.some(p => !inside(p, outline)) || loopsIntersect(hole, outline)) throw new Error('Keep each hole fully inside the outer outline.')
    return hole
  })
  for (let i = 0; i < holes.length; i++) for (let j = i + 1; j < holes.length; j++) {
    if (loopsIntersect(holes[i], holes[j]) || inside(holes[i][0], holes[j]) || inside(holes[j][0], holes[i])) throw new Error('Separate overlapping or nested holes.')
  }
  const curved = recipe.style !== 'flat' && recipe.style !== 'hard-surface'
  const depthAt = depthSampler(recipe.sideProfile?.length ? sampleOutline(recipe.sideProfile) : null, outline)
  if (recipe.topology !== 'triangles' && !holes.length) {
    const grid = quadGridVolume(recipe, outline, depthAt)
    if (grid) return grid
  }
  if (recipe.topology === 'quad-grid') throw new Error('This silhouette needs separate patches. Use Auto, or split it into paths and sections for cleaner quad flow.')
  const loops = [outline, ...holes]
  const points = loops.flat().map(p => p.clone())
  let tris = triangulateBoundary(outline, holes)
  if (!tris.length) throw new Error('This outline cannot be filled. Check its corners.')
  const boundary = new Set(points.map((_, i) => i))
  let offset = 0
  const boundaryEdges = new Set<string>()
  for (const loop of loops) {
    loop.forEach((_, i) => boundaryEdges.add(edgeKey(offset + i, offset + (i + 1) % loop.length)))
    offset += loop.length
  }
  if (curved || recipe.sideProfile?.length) refineInterior(points, tris, boundaryEdges, recipe.density)
  else improveTriangles(points, tris, boundaryEdges)
  const distances = points.map((p, i) => boundary.has(i) ? 0 : Math.min(...loops.flatMap(loop => loop.map((a, j) => {
    const b = loop[(j + 1) % loop.length], ab = b.clone().sub(a)
    const t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1)
    return p.distanceTo(a.clone().addScaledVector(ab, t))
  }))))
  const maxDistance = Math.max(...distances, 1e-8)
  const mesh = new EditableMesh()
  const front: number[] = [], back: number[] = []
  const bias = recipe.frontBias ?? 0
  if (!Number.isFinite(bias) || Math.abs(bias) > 0.9) throw new Error('Keep front/back balance between −90% and 90%.')
  points.forEach((p, i) => {
    const d = distances[i] / maxDistance
    const profile = recipe.style === 'blocky' ? Math.min(1, d * 3)
      : recipe.style === 'inflated' ? Math.pow(d, 0.65) : recipe.style === 'organic' ? Math.sin(d * Math.PI / 2) : Math.sqrt(d * (2 - d))
    const section = depthAt(p.y)
    const half = recipe.depth * section.span / 2 * (curved ? 1 - recipe.roundness + recipe.roundness * (0.12 + 0.88 * profile) : 1)
    const base = origin.clone().addScaledVector(u, p.x).addScaledVector(v, p.y).addScaledVector(normal, section.centre * recipe.depth)
    front.push(mesh.addVertex(base.clone().addScaledVector(normal, half * (1 + bias))).id)
    back.push(mesh.addVertex(base.clone().addScaledVector(normal, -half * (1 - bias))).id)
  })
  const add = (ids: number[], uv: THREE.Vector2[]) => mesh.addFace(ids, uv, 0)
  for (const tri of tris) {
    add(tri.map(i => front[i]), tri.map(i => points[i].clone()))
    add([...tri].reverse().map(i => back[i]), [...tri].reverse().map(i => points[i].clone()))
  }
  // Recover directed boundary edges from cap winding, including refined samples.
  for (const tri of tris) for (let j = 0; j < 3; j++) {
    const a = tri[j], b = tri[(j + 1) % 3]
    if (!boundaryEdges.has(edgeKey(a, b))) continue
    add([front[b], front[a], back[a], back[b]], [new THREE.Vector2(1, 1), new THREE.Vector2(0, 1), new THREE.Vector2(0, 0), new THREE.Vector2(1, 0)])
  }
  if (recipe.topology !== 'triangles') mergePlanarPairs(mesh)
  mesh.recalculateNormals()
  PolyDrawKernel.applyBoxUvs(mesh)
  return mesh
}

function edgeKey(a: number, b: number) { return a < b ? `${a}:${b}` : `${b}:${a}` }

function inside(p: THREE.Vector2, loop: THREE.Vector2[]) {
  let result = false
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const a = loop[i], b = loop[j]
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) result = !result
  }
  return result
}
function loopsIntersect(a: THREE.Vector2[], b: THREE.Vector2[]) {
  const cross = (p: THREE.Vector2, q: THREE.Vector2, r: THREE.Vector2) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) {
    const p = a[i], q = a[(i + 1) % a.length], r = b[j], s = b[(j + 1) % b.length]
    if (Math.max(p.x, q.x) < Math.min(r.x, s.x) || Math.max(r.x, s.x) < Math.min(p.x, q.x) || Math.max(p.y, q.y) < Math.min(r.y, s.y) || Math.max(r.y, s.y) < Math.min(p.y, q.y)) continue
    if (cross(p, q, r) * cross(p, q, s) <= 1e-12 && cross(r, s, p) * cross(r, s, q) <= 1e-12) return true
  }
  return false
}

/** Earcut can omit collinear boundary samples; restore them so side walls share every cap edge. */
function triangulateBoundary(outline: THREE.Vector2[], holes: THREE.Vector2[][] = []) {
  const points = [outline, ...holes].flat()
  const triangles = THREE.ShapeUtils.triangulateShape(outline, holes)
  const used = new Set(triangles.flat())
  const tolerance = Math.max(1e-10, new THREE.Box2().setFromPoints(points).getSize(new THREE.Vector2()).length() * 1e-8)
  points.forEach((p, id) => {
    if (used.has(id)) return
    for (let i = 0; i < triangles.length; i++) for (let edge = 0; edge < 3; edge++) {
      const tri = triangles[i], a = tri[edge], b = tri[(edge + 1) % 3], c = tri[(edge + 2) % 3]
      const ab = points[b].clone().sub(points[a]), t = p.clone().sub(points[a]).dot(ab) / ab.lengthSq()
      if (t <= 0 || t >= 1 || points[a].clone().addScaledVector(ab, t).distanceTo(p) > tolerance) continue
      triangles.splice(i, 1, [a, id, c], [id, b, c]); used.add(id); return
    }
    throw new Error('A boundary point could not be connected. Simplify this outline.')
  })
  return triangles
}

/** Planar centreline sweep with shared quad rings and closed ends. */
function generatePath(recipe: ShapeRecipe, u: THREE.Vector3, v: THREE.Vector3, origin: THREE.Vector3, normal: THREE.Vector3) {
  const taper = recipe.taper ?? 1
  if (!Number.isFinite(taper) || taper < 0.05 || taper > 2) throw new Error('End thickness must be between 5% and 200%.')
  const centres = recipe.points.map(p => origin.clone().addScaledVector(u, p.x).addScaledVector(v, p.y))
  const lengths = [0]
  for (let i = 1; i < centres.length; i++) {
    const length = centres[i].distanceTo(centres[i - 1])
    if (length < 1e-4) throw new Error('Separate adjacent path points.')
    lengths.push(lengths[i - 1] + length)
  }
  const sides = recipe.style === 'blocky' || recipe.style === 'hard-surface' ? 4 : [6, 8, 12][recipe.density]
  const mesh = new EditableMesh()
  const rings = centres.map((centre, i) => {
    const incoming = centre.clone().sub(centres[Math.max(0, i - 1)]).normalize()
    const outgoing = centres[Math.min(centres.length - 1, i + 1)].clone().sub(centre).normalize()
    if (i > 0 && i < centres.length - 1 && incoming.dot(outgoing) < -0.8) throw new Error('This path doubles back. Spread the bend points apart.')
    const tangent = incoming.add(outgoing).normalize()
    const across = normal.clone().cross(tangent).normalize()
    const radius = recipe.depth / 2 * THREE.MathUtils.lerp(1, taper, lengths[i] / lengths[lengths.length - 1])
    return Array.from({ length: sides }, (_, j) => {
      const angle = j / sides * Math.PI * 2
      return mesh.addVertex(centre.clone().addScaledVector(across, Math.cos(angle) * radius).addScaledVector(normal, Math.sin(angle) * radius)).id
    })
  })
  const add = (ids: number[]) => addSurfacePatch(mesh, ids)
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < sides; j++) {
    const k = (j + 1) % sides
    add([rings[i][j], rings[i][k], rings[i + 1][k], rings[i + 1][j]])
  }
  for (const end of [0, rings.length - 1]) {
    const centre = mesh.addVertex(centres[end]).id
    for (let j = 0; j < sides; j++) {
      const ids = [centre, rings[end][j], rings[end][(j + 1) % sides]]
      add(end === 0 ? ids.reverse() : ids)
    }
  }
  mesh.recalculateNormals()
  PolyDrawKernel.applyBoxUvs(mesh)
  return mesh
}

/** Corner arcs are derived from anchors, so smoothing never destroys the source. */
export function sampleOutline(source: ShapePoint[]): THREE.Vector2[] {
  return source.flatMap((p, i) => {
    if (!p.smooth) return [new THREE.Vector2(p.x, p.y)]
    const prev = source[(i + source.length - 1) % source.length], next = source[(i + 1) % source.length]
    const a = new THREE.Vector2(p.x * 0.8 + prev.x * 0.2, p.y * 0.8 + prev.y * 0.2)
    const b = new THREE.Vector2(p.x * 0.8 + next.x * 0.2, p.y * 0.8 + next.y * 0.2)
    const c = new THREE.Vector2(p.x, p.y)
    return [0, 1 / 3, 2 / 3, 1].map(t => a.clone().multiplyScalar((1 - t) ** 2).addScaledVector(c, 2 * t * (1 - t)).addScaledVector(b, t * t))
  })
}

export function mirroredOutline(recipe: ShapeRecipe): ShapePoint[] {
  const axis = recipe.symmetry
  if (!axis || axis === 'none') return recipe.points
  if (axis !== 'x' && axis !== 'y') throw new Error('Choose a valid drawing symmetry axis.')
  if (recipe.points.length < 3) return recipe.points
  const source = recipe.points.map(p => ({ ...p }))
  source[0][axis] = 0; source[source.length - 1][axis] = 0
  const middle = source.slice(1, -1)
  if (middle.some(p => p[axis] < -1e-8) && middle.some(p => p[axis] > 1e-8)) throw new Error('Draw the half-outline on one side of the symmetry line.')
  return [...source, ...middle.reverse().map(p => ({ ...p, [axis]: -p[axis] }))]
}

function generateLoft(recipe: ShapeRecipe): EditableMesh {
  const sections = [{ at: 0, points: recipe.points }, ...(recipe.sections ?? [{ at: 1, points: recipe.points }])]
  if (sections.length < 2 || sections.length > 16 || sections.some(s => !Number.isFinite(s.at) || s.points.length < 3 || s.points.length > 256)) {
    throw new Error('Use 2–16 closed sections with 3–256 points each.')
  }
  for (let i = 1; i < sections.length; i++) if (sections[i].at - sections[i - 1].at < 0.001) throw new Error('Keep sections separated and in order.')
  const loops = sections.map(section => {
    if (section.points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) throw new Error('The section contains an invalid point.')
    let points = sampleOutline(section.points)
    const error = PolyDrawKernel.loopError(points.map(p => new THREE.Vector3(p.x, p.y, 0)))
    if (error) throw new Error(`Section: ${error}`)
    if (THREE.ShapeUtils.isClockWise(points)) points = [points[0], ...points.slice(1).reverse()]
    const lengths = [0]
    points.forEach((p, i) => lengths.push(lengths[i] + p.distanceTo(points[(i + 1) % points.length])))
    return { points, knots: lengths.map(l => l / lengths[lengths.length - 1]) }
  })
  const knots = [...new Set(loops.flatMap(l => l.knots.slice(0, -1)))].sort((a, b) => a - b)
    .filter((k, i, values) => i === 0 || k - values[i - 1] > 1e-6)
  if (knots.length > 1024) throw new Error('Simplify the section outlines before lofting.')
  const mesh = new EditableMesh(), origin = vector(recipe.origin), u = vector(recipe.axisU), v = vector(recipe.axisV), normal = u.clone().cross(v).normalize()
  const sampled = loops.map(loop => knots.map(k => {
    let edge = loop.knots.findIndex((start, i) => i < loop.points.length && k >= start && k < loop.knots[i + 1])
    if (edge < 0) edge = loop.points.length - 1
    const t = (k - loop.knots[edge]) / (loop.knots[edge + 1] - loop.knots[edge])
    return loop.points[edge].clone().lerp(loop.points[(edge + 1) % loop.points.length], THREE.MathUtils.clamp(t, 0, 1))
  }))
  const rings = sampled.map((points, i) => points.map(p => mesh.addVertex(origin.clone().addScaledVector(u, p.x).addScaledVector(v, p.y).addScaledVector(normal, sections[i].at * recipe.depth)).id))
  for (let i = 1; i < rings.length; i++) for (let j = 0; j < knots.length; j++) {
    const next = (j + 1) % knots.length
    for (const ids of [[rings[i - 1][j], rings[i - 1][next], rings[i][next]], [rings[i - 1][j], rings[i][next], rings[i][j]]]) mesh.addFace(ids, ids.map(() => new THREE.Vector2()), 0)
  }
  for (const end of [0, rings.length - 1]) for (const tri of triangulateBoundary(sampled[end])) {
    const ids = tri.map(j => rings[end][j]); if (end === 0) ids.reverse()
    mesh.addFace(ids, ids.map(() => new THREE.Vector2()), 0)
  }
  mergePlanarPairs(mesh)
  mesh.recalculateNormals(); PolyDrawKernel.applyBoxUvs(mesh)
  return mesh
}
