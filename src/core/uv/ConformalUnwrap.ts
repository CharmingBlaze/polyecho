import { MeshObject, UV, Vector3D } from '../../types/mesh'
import { undirectedEdgeId } from '../geometry/EdgeUtils'

/**
 * Least-squares conformal maps (Lévy et al. 2002) for one chart of faces.
 * Charts are cut by seams at the corner level, so a seam that only slits an
 * island still opens it. Tube-like charts (several boundary loops, no handles)
 * are cut along the shortest path between loops so they unroll into one strip.
 */

export interface ConformalOptions {
  /** Cut charts with several boundary loops into a disk before solving. */
  allowCuts?: boolean
  /** Reject an automatically cut chart whose area-weighted stretch exceeds this factor. */
  maxCutStretch?: number
  /** `faceId:vertexId` corners whose current UVs are held fixed. */
  pins?: Set<string>
}

export interface ConformalResult {
  /**
   * Per-face corner UVs. Unpinned charts are in world units, aligned to their
   * minimum-area rectangle at the origin; pinned charts are in final UV space.
   */
  uvs: Map<number, UV[]>
  /** Area-weighted mean of max(r, 1/r) where r is UV/3D area per triangle. 1 is perfect. NaN when pinned twice or more. */
  stretch: number
  /** True when pins placed the chart; it must not be offset or packed. */
  pinned: boolean
}

interface Chart {
  faces: number[]
  corner: number[][]
  positions: Vector3D[]
  vertexIds: string[]
}

interface ChartTopology {
  edges: Map<string, { a: number; b: number; count: number }>
  boundaryLoops: number[][]
  euler: number
}

class UnionFind {
  parent: Int32Array
  constructor(n: number) {
    this.parent = new Int32Array(n)
    for (let i = 0; i < n; i++) this.parent[i] = i
  }
  find(i: number): number {
    while (this.parent[i] !== i) {
      this.parent[i] = this.parent[this.parent[i]]
      i = this.parent[i]
    }
    return i
  }
  union(a: number, b: number) {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) this.parent[rb] = ra
  }
}

function buildChart(mesh: MeshObject, faces: number[], cuts: Set<string>, positions: Map<string, Vector3D>): Chart {
  const offsets: number[] = []
  let total = 0
  for (const fi of faces) {
    offsets.push(total)
    total += mesh.faces[fi].vertexIds.length
  }
  const uf = new UnionFind(total)
  const edgeUses = new Map<string, Array<{ local: number; c: number }>>()
  faces.forEach((fi, local) => {
    const ids = mesh.faces[fi].vertexIds
    for (let c = 0; c < ids.length; c++) {
      const key = undirectedEdgeId(ids[c], ids[(c + 1) % ids.length])
      const list = edgeUses.get(key)
      if (list) list.push({ local, c })
      else edgeUses.set(key, [{ local, c }])
    }
  })

  for (const [key, uses] of edgeUses) {
    if (uses.length !== 2 || cuts.has(key)) continue
    const [A, B] = uses
    if (A.local === B.local) continue
    const idsA = mesh.faces[faces[A.local]].vertexIds
    const idsB = mesh.faces[faces[B.local]].vertexIds
    const nA = idsA.length
    const nB = idsB.length
    const a0 = A.c, a1 = (A.c + 1) % nA
    const b0 = B.c, b1 = (B.c + 1) % nB
    if (idsA[a0] === idsB[b1] && idsA[a1] === idsB[b0]) {
      uf.union(offsets[A.local] + a0, offsets[B.local] + b1)
      uf.union(offsets[A.local] + a1, offsets[B.local] + b0)
    } else if (idsA[a0] === idsB[b0] && idsA[a1] === idsB[b1]) {
      uf.union(offsets[A.local] + a0, offsets[B.local] + b0)
      uf.union(offsets[A.local] + a1, offsets[B.local] + b1)
    }
  }

  const rootIndex = new Map<number, number>()
  const chartPositions: Vector3D[] = []
  const vertexIds: string[] = []
  const corner = faces.map((fi, local) => mesh.faces[fi].vertexIds.map((id, c) => {
    const root = uf.find(offsets[local] + c)
    let index = rootIndex.get(root)
    if (index === undefined) {
      index = chartPositions.length
      rootIndex.set(root, index)
      chartPositions.push(positions.get(id) ?? { x: 0, y: 0, z: 0 })
      vertexIds.push(id)
    }
    return index
  }))
  return { faces, corner, positions: chartPositions, vertexIds }
}

function chartTopology(chart: Chart): ChartTopology {
  const edges = new Map<string, { a: number; b: number; count: number }>()
  for (const ring of chart.corner) {
    for (let c = 0; c < ring.length; c++) {
      const a = ring[c]
      const b = ring[(c + 1) % ring.length]
      if (a === b) continue
      const key = a < b ? `${a},${b}` : `${b},${a}`
      const e = edges.get(key)
      if (e) e.count++
      else edges.set(key, { a: Math.min(a, b), b: Math.max(a, b), count: 1 })
    }
  }
  const uf = new UnionFind(chart.positions.length)
  const onBoundary = new Set<number>()
  for (const e of edges.values()) {
    if (e.count !== 1) continue
    uf.union(e.a, e.b)
    onBoundary.add(e.a)
    onBoundary.add(e.b)
  }
  const loops = new Map<number, number[]>()
  for (const v of onBoundary) {
    const root = uf.find(v)
    const list = loops.get(root)
    if (list) list.push(v)
    else loops.set(root, [v])
  }
  return {
    edges,
    boundaryLoops: Array.from(loops.values()),
    euler: chart.positions.length - edges.size + chart.faces.length
  }
}

function dist(a: Vector3D, b: Vector3D): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}

/** Shortest edge paths joining every boundary loop to the first, as 3D edge keys. */
function loopJoiningCuts(chart: Chart, topo: ChartTopology): string[] {
  const n = chart.positions.length
  const adjacency: Array<Array<{ to: number; w: number }>> = Array.from({ length: n }, () => [])
  for (const e of topo.edges.values()) {
    const w = dist(chart.positions[e.a], chart.positions[e.b])
    adjacency[e.a].push({ to: e.b, w })
    adjacency[e.b].push({ to: e.a, w })
  }
  const loopOf = new Int32Array(n).fill(-1)
  topo.boundaryLoops.forEach((loop, i) => loop.forEach(v => { loopOf[v] = i }))

  const joined = new Set<number>([0])
  const cuts: string[] = []
  while (joined.size < topo.boundaryLoops.length) {
    const d = new Float64Array(n).fill(Infinity)
    const prev = new Int32Array(n).fill(-1)
    const done = new Uint8Array(n)
    for (let v = 0; v < n; v++) if (loopOf[v] >= 0 && joined.has(loopOf[v])) d[v] = 0
    let target = -1
    for (;;) {
      let best = -1
      for (let v = 0; v < n; v++) if (!done[v] && d[v] < Infinity && (best < 0 || d[v] < d[best])) best = v
      if (best < 0) break
      done[best] = 1
      if (loopOf[best] >= 0 && !joined.has(loopOf[best])) { target = best; break }
      for (const { to, w } of adjacency[best]) {
        if (d[best] + w < d[to]) { d[to] = d[best] + w; prev[to] = best }
      }
    }
    if (target < 0) break
    for (let v = target; prev[v] >= 0; v = prev[v]) {
      cuts.push(undirectedEdgeId(chart.vertexIds[v], chart.vertexIds[prev[v]]))
    }
    joined.add(loopOf[target])
  }
  return cuts
}

function solveLscm(chart: Chart, boundary: number[], fixed?: Map<number, [number, number]>): Float64Array | null {
  const n = chart.positions.length
  if (n < 3 || boundary.length < 2) return null

  let pinned: Map<number, [number, number]>
  if (fixed && fixed.size >= 2) {
    pinned = fixed
  } else {
    let p0 = boundary[0]
    let p1 = p0
    for (let pass = 0; pass < 2; pass++) {
      let best = -1
      for (const v of boundary) {
        const dv = dist(chart.positions[p0], chart.positions[v])
        if (dv > best) { best = dv; p1 = v }
      }
      if (pass === 0) p0 = p1
    }
    const pinDistance = dist(chart.positions[p0], chart.positions[p1])
    if (p0 === p1 || pinDistance < 1e-12) return null
    pinned = new Map<number, [number, number]>([[p0, [0, 0]], [p1, [pinDistance, 0]]])
  }

  const freeIndex = new Int32Array(n).fill(-1)
  let free = 0
  for (let v = 0; v < n; v++) if (!pinned.has(v)) freeIndex[v] = free++
  const cols = free * 2

  const rowCols: number[] = []
  const rowVals: number[] = []
  const rowStart: number[] = [0]
  const rhs: number[] = []

  for (const ring of chart.corner) {
    for (let k = 1; k + 1 < ring.length; k++) {
      const tri = [ring[0], ring[k], ring[k + 1]]
      if (tri[0] === tri[1] || tri[1] === tri[2] || tri[0] === tri[2]) continue
      const P = tri.map(v => chart.positions[v])
      const e1 = { x: P[1].x - P[0].x, y: P[1].y - P[0].y, z: P[1].z - P[0].z }
      const e2 = { x: P[2].x - P[0].x, y: P[2].y - P[0].y, z: P[2].z - P[0].z }
      const len1 = Math.hypot(e1.x, e1.y, e1.z)
      const nx = e1.y * e2.z - e1.z * e2.y
      const ny = e1.z * e2.x - e1.x * e2.z
      const nz = e1.x * e2.y - e1.y * e2.x
      const twiceArea = Math.hypot(nx, ny, nz)
      if (len1 < 1e-12 || twiceArea < 1e-14) continue
      const ex = { x: e1.x / len1, y: e1.y / len1, z: e1.z / len1 }
      const ey = {
        x: (ny * ex.z - nz * ex.y) / twiceArea,
        y: (nz * ex.x - nx * ex.z) / twiceArea,
        z: (nx * ex.y - ny * ex.x) / twiceArea
      }
      const X = [0, len1, e2.x * ex.x + e2.y * ex.y + e2.z * ex.z]
      const Y = [0, 0, e2.x * ey.x + e2.y * ey.y + e2.z * ey.z]
      const weight = Math.sqrt(twiceArea / 2)
      const gx: number[] = []
      const gy: number[] = []
      for (let j = 0; j < 3; j++) {
        const k1 = (j + 1) % 3
        const k2 = (j + 2) % 3
        gx.push((Y[k1] - Y[k2]) / twiceArea * weight)
        gy.push((X[k2] - X[k1]) / twiceArea * weight)
      }
      // Cauchy-Riemann residuals: u_x - v_y = 0 and u_y + v_x = 0.
      for (const [cu, cv] of [[gx, gy.map(g => -g)], [gy, gx]] as const) {
        let b = 0
        for (let j = 0; j < 3; j++) {
          const pin = pinned.get(tri[j])
          if (pin) {
            b -= cu[j] * pin[0] + cv[j] * pin[1]
          } else {
            rowCols.push(freeIndex[tri[j]] * 2, freeIndex[tri[j]] * 2 + 1)
            rowVals.push(cu[j], cv[j])
          }
        }
        rowStart.push(rowCols.length)
        rhs.push(b)
      }
    }
  }
  const rows = rhs.length
  if (rows === 0) return null

  const colScale = new Float64Array(cols)
  for (let i = 0; i < rowCols.length; i++) colScale[rowCols[i]] += rowVals[i] * rowVals[i]
  for (let c = 0; c < cols; c++) colScale[c] = colScale[c] > 0 ? 1 / Math.sqrt(colScale[c]) : 0
  const vals = new Float64Array(rowVals.length)
  for (let i = 0; i < rowVals.length; i++) vals[i] = rowVals[i] * colScale[rowCols[i]]

  const mul = (x: Float64Array, out: Float64Array) => {
    for (let r = 0; r < rows; r++) {
      let s = 0
      for (let i = rowStart[r]; i < rowStart[r + 1]; i++) s += vals[i] * x[rowCols[i]]
      out[r] = s
    }
  }
  const mulT = (y: Float64Array, out: Float64Array) => {
    out.fill(0)
    for (let r = 0; r < rows; r++) {
      const yr = y[r]
      if (yr === 0) continue
      for (let i = rowStart[r]; i < rowStart[r + 1]; i++) out[rowCols[i]] += vals[i] * yr
    }
  }

  // CGLS on the column-scaled least-squares system.
  const x = new Float64Array(cols)
  const r = Float64Array.from(rhs)
  const s = new Float64Array(cols)
  const q = new Float64Array(rows)
  mulT(r, s)
  const p = Float64Array.from(s)
  let gamma = 0
  for (let i = 0; i < cols; i++) gamma += s[i] * s[i]
  const gamma0 = gamma
  const maxIterations = Math.min(20000, Math.max(400, cols * 4))
  for (let it = 0; it < maxIterations && gamma > gamma0 * 1e-22 && gamma > 1e-30; it++) {
    mul(p, q)
    let qq = 0
    for (let i = 0; i < rows; i++) qq += q[i] * q[i]
    if (qq <= 0) break
    const alpha = gamma / qq
    for (let i = 0; i < cols; i++) x[i] += alpha * p[i]
    for (let i = 0; i < rows; i++) r[i] -= alpha * q[i]
    mulT(r, s)
    let next = 0
    for (let i = 0; i < cols; i++) next += s[i] * s[i]
    const beta = next / gamma
    gamma = next
    for (let i = 0; i < cols; i++) p[i] = s[i] + beta * p[i]
  }

  const uv = new Float64Array(n * 2)
  for (let v = 0; v < n; v++) {
    const pin = pinned.get(v)
    if (pin) {
      uv[v * 2] = pin[0]
      uv[v * 2 + 1] = pin[1]
    } else {
      const f = freeIndex[v]
      uv[v * 2] = x[f * 2] * colScale[f * 2]
      uv[v * 2 + 1] = x[f * 2 + 1] * colScale[f * 2 + 1]
    }
    if (!Number.isFinite(uv[v * 2]) || !Number.isFinite(uv[v * 2 + 1])) return null
  }
  return uv
}

function convexHull(points: Array<[number, number]>): Array<[number, number]> {
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (pts.length < 3) return pts
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: Array<[number, number]> = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: Array<[number, number]> = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1))
}

/** Rotate 2D points in place so their bounding box is the minimum-area one, landscape, at the origin. */
export function alignToMinimumRectangle(uv: Float64Array) {
  const count = uv.length / 2
  if (count === 0) return
  const points: Array<[number, number]> = []
  for (let i = 0; i < count; i++) points.push([uv[i * 2], uv[i * 2 + 1]])
  const hull = convexHull(points)
  let bestAngle = 0
  let bestArea = Infinity
  let bestWide = true
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i]
    const b = hull[(i + 1) % hull.length]
    const angle = -Math.atan2(b[1] - a[1], b[0] - a[0])
    const c = Math.cos(angle)
    const s = Math.sin(angle)
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const p of hull) {
      const x = p[0] * c - p[1] * s
      const y = p[0] * s + p[1] * c
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
    const area = (maxX - minX) * (maxY - minY)
    if (area < bestArea - 1e-12) {
      bestArea = area
      bestAngle = angle
      bestWide = maxX - minX >= maxY - minY
    }
  }
  if (!bestWide) bestAngle += Math.PI / 2
  const c = Math.cos(bestAngle)
  const s = Math.sin(bestAngle)
  let minX = Infinity, minY = Infinity
  for (let i = 0; i < count; i++) {
    const x = uv[i * 2] * c - uv[i * 2 + 1] * s
    const y = uv[i * 2] * s + uv[i * 2 + 1] * c
    uv[i * 2] = x
    uv[i * 2 + 1] = y
    if (x < minX) minX = x
    if (y < minY) minY = y
  }
  for (let i = 0; i < count; i++) {
    uv[i * 2] -= minX
    uv[i * 2 + 1] -= minY
  }
}

function chartUvs(chart: Chart, uv: Float64Array): Map<number, UV[]> {
  const uvs = new Map<number, UV[]>()
  chart.faces.forEach((fi, local) => {
    uvs.set(fi, chart.corner[local].map(v => ({ u: uv[v * 2], v: uv[v * 2 + 1] })))
  })
  return uvs
}

/** Current UV of each pinned chart vertex, read from the mesh before it is rewritten. */
function chartPins(mesh: MeshObject, chart: Chart, pins?: Set<string>): Map<number, [number, number]> {
  const out = new Map<number, [number, number]>()
  if (!pins || pins.size === 0) return out
  chart.faces.forEach((fi, local) => {
    const face = mesh.faces[fi]
    face.vertexIds.forEach((id, c) => {
      const v = chart.corner[local][c]
      const uv = face.uvs[c]
      if (out.has(v) || !uv || !pins.has(`${face.id}:${id}`)) return
      if (Number.isFinite(uv.u) && Number.isFinite(uv.v)) out.set(v, [uv.u, uv.v])
    })
  })
  return out
}

function currentUvArea(mesh: MeshObject, faces: number[]): number {
  let total = 0
  for (const fi of faces) {
    const uvs = mesh.faces[fi].uvs
    let sum = 0
    for (let i = 0; i < uvs.length; i++) {
      const a = uvs[i], b = uvs[(i + 1) % uvs.length]
      sum += a.u * b.v - b.u * a.v
    }
    total += Math.abs(sum) / 2
  }
  return total
}

function finishChart(chart: Chart, uv: Float64Array, maxStretch: number): { uv: Float64Array; stretch: number } | null {
  let signed = 0
  const tris: Array<{ uvArea: number; area: number }> = []
  for (const ring of chart.corner) {
    for (let k = 1; k + 1 < ring.length; k++) {
      const a = ring[0], b = ring[k], c = ring[k + 1]
      const uvArea = 0.5 * ((uv[b * 2] - uv[a * 2]) * (uv[c * 2 + 1] - uv[a * 2 + 1]) -
        (uv[c * 2] - uv[a * 2]) * (uv[b * 2 + 1] - uv[a * 2 + 1]))
      const pa = chart.positions[a], pb = chart.positions[b], pc = chart.positions[c]
      const e1x = pb.x - pa.x, e1y = pb.y - pa.y, e1z = pb.z - pa.z
      const e2x = pc.x - pa.x, e2y = pc.y - pa.y, e2z = pc.z - pa.z
      const area = 0.5 * Math.hypot(e1y * e2z - e1z * e2y, e1z * e2x - e1x * e2z, e1x * e2y - e1y * e2x)
      signed += uvArea
      tris.push({ uvArea, area })
    }
  }
  if (Math.abs(signed) < 1e-14) return null
  if (signed < 0) {
    for (let i = 0; i < uv.length; i += 2) uv[i] = -uv[i]
    for (const t of tris) t.uvArea = -t.uvArea
    signed = -signed
  }

  let area3d = 0
  let flipped = 0
  let absUv = 0
  for (const t of tris) {
    area3d += t.area
    absUv += Math.abs(t.uvArea)
    if (t.uvArea < 0) flipped += -t.uvArea
  }
  if (area3d <= 0 || flipped > absUv * 0.01) return null

  const scale = Math.sqrt(area3d / signed)
  for (let i = 0; i < uv.length; i++) uv[i] *= scale

  let stretchSum = 0
  for (const t of tris) {
    if (t.area <= 0) continue
    const ratio = Math.max(1e-6, (t.uvArea * scale * scale) / t.area)
    stretchSum += t.area * Math.max(ratio, 1 / ratio)
  }
  const stretch = stretchSum / area3d
  if (stretch > maxStretch) return null

  alignToMinimumRectangle(uv)
  return { uv, stretch }
}

/**
 * Flatten a set of faces with LSCM. Returns null when the chart is closed,
 * has handles, cannot be cut into a disk, or the solve folds over itself;
 * callers segment or project instead.
 */
export function conformalUnwrapFaces(
  mesh: MeshObject,
  faceIndices: number[],
  seams: Set<string>,
  positions: Map<string, Vector3D>,
  options: ConformalOptions = {}
): ConformalResult | null {
  const faces = faceIndices.filter(fi => (mesh.faces[fi]?.vertexIds.length ?? 0) >= 3)
  if (faces.length === 0) return null
  const cuts = new Set(seams)
  let chart = buildChart(mesh, faces, cuts, positions)
  let topo = chartTopology(chart)
  const loops = topo.boundaryLoops.length
  if (loops === 0) return null
  // Euler characteristic of a genus-0 surface with b boundary loops is 2 - b.
  if (topo.euler !== 2 - loops) return null
  let maxStretch = Infinity
  if (loops > 1) {
    maxStretch = options.maxCutStretch ?? Infinity
    if (!options.allowCuts) return null
    for (const key of loopJoiningCuts(chart, topo)) cuts.add(key)
    chart = buildChart(mesh, faces, cuts, positions)
    topo = chartTopology(chart)
    if (topo.boundaryLoops.length !== 1 || topo.euler !== 1) return null
  }
  const pins = chartPins(mesh, chart, options.pins)
  if (pins.size >= 2) {
    // Pins are hard constraints in final UV space: no rescale, rotate, or pack.
    const uv = solveLscm(chart, topo.boundaryLoops[0], pins)
    return uv ? { uvs: chartUvs(chart, uv), stretch: NaN, pinned: true } : null
  }
  const solved = solveLscm(chart, topo.boundaryLoops[0])
  if (!solved) return null
  const finished = finishChart(chart, solved, maxStretch)
  if (!finished) return null
  const [anchor] = pins
  const previousArea = anchor ? currentUvArea(mesh, faces) : 0
  if (!anchor || previousArea < 1e-12) return { uvs: chartUvs(chart, finished.uv), stretch: finished.stretch, pinned: false }

  // One pin keeps the island's previous UV size and holds that corner still.
  const uv = finished.uv
  let area = 0
  for (const ring of chart.corner) {
    for (let k = 1; k + 1 < ring.length; k++) {
      const a = ring[0], b = ring[k], c = ring[k + 1]
      area += 0.5 * ((uv[b * 2] - uv[a * 2]) * (uv[c * 2 + 1] - uv[a * 2 + 1]) -
        (uv[c * 2] - uv[a * 2]) * (uv[b * 2 + 1] - uv[a * 2 + 1]))
    }
  }
  const scale = area > 1e-14 ? Math.sqrt(previousArea / area) : 1
  const [vertex, [pu, pv]] = anchor
  const du = pu - uv[vertex * 2] * scale
  const dv = pv - uv[vertex * 2 + 1] * scale
  for (let i = 0; i < uv.length; i += 2) {
    uv[i] = uv[i] * scale + du
    uv[i + 1] = uv[i + 1] * scale + dv
  }
  return { uvs: chartUvs(chart, uv), stretch: finished.stretch, pinned: true }
}

function insetPolygon(uvs: UV[]): Array<[number, number]> {
  let cu = 0, cv = 0
  for (const p of uvs) { cu += p.u; cv += p.v }
  cu /= uvs.length
  cv /= uvs.length
  return uvs.map(p => [p.u * 0.98 + cu * 0.02, p.v * 0.98 + cv * 0.02])
}

function segmentsCross(a: [number, number], b: [number, number], c: [number, number], d: [number, number]): boolean {
  const rx = b[0] - a[0], ry = b[1] - a[1]
  const sx = d[0] - c[0], sy = d[1] - c[1]
  const denom = rx * sy - ry * sx
  if (Math.abs(denom) < 1e-14) return false
  const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / denom
  const u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / denom
  return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6
}

function pointInPolygon(p: [number, number], poly: Array<[number, number]>): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j]
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / ((b[1] - a[1]) || 1e-18) + a[0]) inside = !inside
  }
  return inside
}

function centroid2(poly: Array<[number, number]>): [number, number] {
  let x = 0, y = 0
  for (const p of poly) { x += p[0]; y += p[1] }
  return [x / poly.length, y / poly.length]
}

function polygonsOverlap(a: Array<[number, number]>, b: Array<[number, number]>): boolean {
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      if (segmentsCross(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) return true
    }
  }
  return pointInPolygon(centroid2(a), b) || pointInPolygon(centroid2(b), a)
}

/**
 * Walk faces in `order` and keep each one only if its UV polygon does not
 * overlap a face already kept. Shared edges between neighbours do not count.
 * Returns the faces that had to be rejected.
 */
export function findOverlappingFaces(order: number[], uvs: Map<number, UV[]>): Set<number> {
  const rejected = new Set<number>()
  const items = order
    .map(fi => ({ fi, poly: uvs.get(fi) }))
    .filter((item): item is { fi: number; poly: UV[] } => !!item.poly && item.poly.length >= 3)
    .map(({ fi, poly }) => {
      const inset = insetPolygon(poly)
      let minU = Infinity, minV = Infinity, maxU = -Infinity, maxV = -Infinity
      for (const [u, v] of inset) {
        if (u < minU) minU = u
        if (u > maxU) maxU = u
        if (v < minV) minV = v
        if (v > maxV) maxV = v
      }
      return { fi, inset, minU, minV, maxU, maxV }
    })
  if (items.length < 2) return rejected

  let boxArea = 0
  for (const it of items) boxArea += (it.maxU - it.minU) * (it.maxV - it.minV)
  const cell = Math.max(Math.sqrt(boxArea / items.length), 1e-9)
  const grid = new Map<string, number[]>()
  const cellsOf = (it: typeof items[number]) => {
    const keys: string[] = []
    const x0 = Math.floor(it.minU / cell), x1 = Math.floor(it.maxU / cell)
    const y0 = Math.floor(it.minV / cell), y1 = Math.floor(it.maxV / cell)
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) keys.push(`${x},${y}`)
    return keys
  }

  items.forEach((it, index) => {
    const keys = cellsOf(it)
    const tested = new Set<number>()
    for (const key of keys) {
      for (const other of grid.get(key) ?? []) {
        if (tested.has(other)) continue
        tested.add(other)
        const o = items[other]
        if (o.maxU < it.minU || it.maxU < o.minU || o.maxV < it.minV || it.maxV < o.minV) continue
        if (polygonsOverlap(it.inset, o.inset)) {
          rejected.add(it.fi)
          return
        }
      }
    }
    for (const key of keys) {
      const list = grid.get(key)
      if (list) list.push(index)
      else grid.set(key, [index])
    }
  })
  return rejected
}

/**
 * Group faces into charts by mesh adjacency, seams, and normal angle. A face
 * joins only when it is within the limit of both its neighbor and the chart's
 * running average normal, so gentle curves cannot wrap all the way round.
 */
export function clusterFacesByNormal(
  mesh: MeshObject,
  faceIndices: number[],
  normals: Map<number, Vector3D>,
  seams: Set<string>,
  angleLimitDegrees: number
): number[][] {
  const cosLimit = Math.cos(angleLimitDegrees * Math.PI / 180)
  const targetSet = new Set(faceIndices)
  const edgeFaces = new Map<string, number[]>()
  for (const fi of faceIndices) {
    const ids = mesh.faces[fi].vertexIds
    for (let i = 0; i < ids.length; i++) {
      const key = undirectedEdgeId(ids[i], ids[(i + 1) % ids.length])
      const linked = edgeFaces.get(key)
      if (linked) linked.push(fi)
      else edgeFaces.set(key, [fi])
    }
  }
  const neighbors = new Map<number, Array<{ face: number; edge: string }>>()
  for (const fi of faceIndices) neighbors.set(fi, [])
  for (const [edge, linked] of edgeFaces) {
    for (let i = 0; i < linked.length; i++) {
      for (let j = i + 1; j < linked.length; j++) {
        neighbors.get(linked[i])?.push({ face: linked[j], edge })
        neighbors.get(linked[j])?.push({ face: linked[i], edge })
      }
    }
  }

  const visited = new Set<number>()
  const clusters: number[][] = []
  for (const seed of faceIndices) {
    if (visited.has(seed)) continue
    const cluster: number[] = []
    const queue = [seed]
    const seedNormal = normals.get(seed) || { x: 0, y: 1, z: 0 }
    const sum = { ...seedNormal }
    visited.add(seed)
    for (let head = 0; head < queue.length; head++) {
      const current = queue[head]
      cluster.push(current)
      const len = Math.hypot(sum.x, sum.y, sum.z) || 1
      const avg = { x: sum.x / len, y: sum.y / len, z: sum.z / len }
      const local = normals.get(current) || seedNormal
      for (const link of neighbors.get(current) || []) {
        if (!targetSet.has(link.face) || visited.has(link.face) || seams.has(link.edge)) continue
        const candidate = normals.get(link.face) || seedNormal
        if (local.x * candidate.x + local.y * candidate.y + local.z * candidate.z < cosLimit) continue
        if (avg.x * candidate.x + avg.y * candidate.y + avg.z * candidate.z < cosLimit) continue
        visited.add(link.face)
        queue.push(link.face)
        sum.x += candidate.x
        sum.y += candidate.y
        sum.z += candidate.z
      }
    }
    clusters.push(cluster)
  }
  return clusters
}
