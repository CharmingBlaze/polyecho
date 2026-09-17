import * as THREE from 'three'
import { EditableMesh } from '../mesh/MeshKernel'
import { PolyDrawKernel } from '../mesh/operations/PolyDrawKernel'
import type { ShapeRecipe } from './ShapeRecipe'

const cross = (a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)

/** Four boundary chains drive a transfinite quad patch. No central pole or radial fan. */
export function quadGridVolume(recipe: ShapeRecipe, outline: THREE.Vector2[], depthAt: (height: number) => { span: number; centre: number } = () => ({ span: 1, centre: 0 })): EditableMesh | null {
  if (outline.length < 4) return null
  const bounds = new THREE.Box2().setFromPoints(outline), size = bounds.getSize(new THREE.Vector2())
  if (size.x < 1e-8 || size.y < 1e-8) return null
  const normalized = outline.map(p => p.clone().sub(bounds.min).divide(size))
  // Bottom-left, bottom-right, top-right, top-left, in positive winding.
  const scores = [
    normalized.map(p => -p.x - p.y), normalized.map(p => p.x - p.y),
    normalized.map(p => p.x + p.y), normalized.map(p => -p.x + p.y),
  ]
  const candidates = scores.map(values => values.map((score, i) => ({ score, i })).sort((a, b) => b.score - a.score).slice(0, 3))
  let best: number[] | null = null, bestScore = -Infinity
  for (const a of candidates[0]) for (const b of candidates[1]) for (const c of candidates[2]) for (const d of candidates[3]) {
    const offsets = [b.i, c.i, d.i].map(i => (i - a.i + outline.length) % outline.length)
    if (!(offsets[0] > 0 && offsets[0] < offsets[1] && offsets[1] < offsets[2])) continue
    const score = a.score + b.score + c.score + d.score
    if (score > bestScore) { bestScore = score; best = [a.i, b.i, c.i, d.i] }
  }
  if (!best) return null
  const chain = (start: number, end: number) => {
    const points = [outline[start]]
    for (let i = (start + 1) % outline.length; i !== end; i = (i + 1) % outline.length) points.push(outline[i])
    points.push(outline[end]); return points
  }
  const [bl, br, tr, tl] = best
  const curves = [chain(bl, br), chain(tl, bl).reverse(), chain(tr, tl).reverse(), chain(br, tr)]
  const parameterize = (points: THREE.Vector2[]) => {
    const lengths = [0]
    for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + points[i].distanceTo(points[i - 1]))
    const total = lengths[lengths.length - 1]
    return { points, knots: lengths.map(l => l / total) }
  }
  const [bottom, left, top, right] = curves.map(parameterize)
  const sample = (curve: ReturnType<typeof parameterize>, t: number) => {
    if (t >= 1) return curve.points[curve.points.length - 1].clone()
    let index = curve.knots.findIndex((k, i) => i < curve.points.length - 1 && t >= k && t < curve.knots[i + 1])
    if (index < 0) index = 0
    return curve.points[index].clone().lerp(curve.points[index + 1], (t - curve.knots[index]) / (curve.knots[index + 1] - curve.knots[index]))
  }
  const spacing = Math.max(size.x, size.y) / [2, 4, 6][recipe.density]
  const knots = (a: number[], b: number[], count: number) => {
    // Match nearby landmarks on opposing chains rather than creating two almost identical rows.
    // Reparameterization retains the exact corner position on BOTH boundaries.
    const entries = [a, b].flatMap((chain, side) => chain.slice(1, -1).map((t, i) => ({ t, side, index: i + 1 }))).sort((x, y) => x.t - y.t)
    const groups: typeof entries[] = []
    for (const entry of entries) {
      const last = groups[groups.length - 1]
      if (last && entry.t - last[0].t < 0.12 && !last.some(item => item.side === entry.side)) last.push(entry)
      else groups.push([entry])
    }
    const result = [0, ...groups.map(group => {
      const t = group.reduce((sum, item) => sum + item.t, 0) / group.length
      group.forEach(item => { (item.side === 0 ? a : b)[item.index] = t })
      return t
    }), 1]
    for (let i = 1; i < count; i++) {
      const t = i / count
      if (result.every(k => Math.abs(k - t) > Math.min(0.1, 0.3 / count))) result.push(t)
    }
    return result.sort((x, y) => x - y)
  }
  // Rounded parts are a series of full cross-sections, including the end rows.
  // Four spans give a broad face and chamfered shoulders at the lowest detail;
  // two spans would turn each section into a diamond.
  const hasEndCap = (curve: ReturnType<typeof parameterize>) => {
    const delta = curve.points[curve.points.length - 1].clone().sub(curve.points[0])
    return Math.abs(delta.x) > 2 * Math.abs(delta.y)
  }
  // A silhouette drawn with pointed ends (e.g. a mirrored diamond) must retain
  // those points, rather than inventing an arbitrary tilted cross-section axis.
  const sectionVolume = ['rounded', 'blocky', 'organic'].includes(recipe.style) && hasEndCap(bottom) && hasEndCap(top)
  const us = knots(bottom.knots, top.knots, Math.max(sectionVolume ? 4 : 2, Math.round(size.x / spacing)))
  const vs = knots(left.knots, right.knots, Math.max(2, Math.round(size.y / spacing)))
  if (us.length * vs.length > 4096) return null
  const columns = us.length, rows = vs.length, planar: THREE.Vector2[] = []
  for (const t of vs) for (const s of us) {
    const p = sample(bottom, s).multiplyScalar(1 - t).addScaledVector(sample(top, s), t)
      .addScaledVector(sample(left, t), 1 - s).addScaledVector(sample(right, t), s)
      .addScaledVector(outline[bl], -(1 - s) * (1 - t)).addScaledVector(outline[br], -s * (1 - t))
      .addScaledVector(outline[tl], -(1 - s) * t).addScaledVector(outline[tr], -s * t)
    planar.push(p)
  }
  const faces: number[][] = []
  const epsilon = size.x * size.y * 1e-12
  for (let y = 0; y < rows - 1; y++) for (let x = 0; x < columns - 1; x++) {
    const a = y * columns + x, ids = [a, a + 1, a + columns + 1, a + columns]
    // Reject folded or concave cells. An injective boundary plus positive cells yields a valid patch.
    if (!ids.every((id, i) => cross(planar[id], planar[ids[(i + 1) % 4]], planar[ids[(i + 2) % 4]]) > epsilon)) return null
    const lengths = ids.map((id, i) => planar[id].distanceTo(planar[ids[(i + 1) % 4]]))
    if (Math.max(...lengths) / Math.min(...lengths) > 30) return null
    faces.push(ids)
  }
  const boundary: number[] = []
  for (let x = 0; x < columns; x++) boundary.push(x)
  for (let y = 1; y < rows; y++) boundary.push(y * columns + columns - 1)
  for (let x = columns - 2; x >= 0; x--) boundary.push((rows - 1) * columns + x)
  for (let y = rows - 2; y > 0; y--) boundary.push(y * columns)
  const boundarySet = new Set(boundary)
  const distance = planar.map((p, i) => boundarySet.has(i) ? 0 : Math.min(...outline.map((a, j) => {
    const b = outline[(j + 1) % outline.length], delta = b.clone().sub(a)
    return p.distanceTo(a.clone().addScaledVector(delta, THREE.MathUtils.clamp(p.clone().sub(a).dot(delta) / delta.lengthSq(), 0, 1)))
  })))
  const maxDistance = Math.max(...distance, 1e-8)
  const mesh = new EditableMesh(), front: number[] = [], back: number[] = []
  const origin = new THREE.Vector3(recipe.origin.x, recipe.origin.y, recipe.origin.z)
  const u = new THREE.Vector3(recipe.axisU.x, recipe.axisU.y, recipe.axisU.z), v = new THREE.Vector3(recipe.axisV.x, recipe.axisV.y, recipe.axisV.z), n = u.clone().cross(v)
  const bias = recipe.frontBias ?? 0
  if (!Number.isFinite(bias) || Math.abs(bias) > 0.9) throw new Error('Keep front/back balance between −90% and 90%.')
  planar.forEach((p, i) => {
    // Distance to the entire outline collapses the top/bottom into thin seams.
    // Round across the width only, leaving complete end caps for limb/torso parts.
    // Inflated deliberately retains its pillow-like falloff in both directions.
    const s = us[i % columns]
    const d = sectionVolume ? Math.min(1, Math.min(s, 1 - s) * 4) : distance[i] / maxDistance
    const profile = recipe.style === 'blocky' ? Math.min(1, d * 3) : recipe.style === 'inflated' ? d ** 0.65 : Math.sqrt(d * (2 - d))
    const curved = recipe.style !== 'flat' && recipe.style !== 'hard-surface'
    const depth = depthAt(p.y)
    const z = recipe.depth * depth.span / 2 * (curved ? 1 - recipe.roundness + recipe.roundness * (0.12 + 0.88 * profile) : 1)
    const base = origin.clone().addScaledVector(u, p.x).addScaledVector(v, p.y).addScaledVector(n, depth.centre * recipe.depth)
    front.push(mesh.addVertex(base.clone().addScaledVector(n, z * (1 + bias))).id)
    back.push(mesh.addVertex(base.clone().addScaledVector(n, -z * (1 - bias))).id)
  })
  const add = (ids: number[]) => mesh.addFace(ids, ids.map(() => new THREE.Vector2()), 0)
  for (const face of faces) {
    add(face.map(i => front[i])); add([...face].reverse().map(i => back[i]))
  }
  for (let i = 0; i < boundary.length; i++) {
    const a = boundary[i], b = boundary[(i + 1) % boundary.length]
    add([front[b], front[a], back[a], back[b]])
  }
  mesh.recalculateNormals(); PolyDrawKernel.applyBoxUvs(mesh)
  return mesh
}
