import * as THREE from 'three'
import { EditableMesh } from '../MeshKernel'
import { mergePlanarPairs } from '../../shapeDraw/ShapeTopology'
import { surfaceTriangles } from '../../geometry/SurfaceGeometry'

export type BooleanOp = 'union' | 'difference' | 'intersect'

const EPS = 1e-6

interface Poly {
  vertices: THREE.Vector3[]
  uvs: THREE.Vector2[]
  materialIndex: number
}

function planeOf(poly: Poly): THREE.Plane {
  return new THREE.Plane().setFromCoplanarPoints(poly.vertices[0], poly.vertices[1], poly.vertices[2])
}

function triangulate(mesh: EditableMesh): Poly[] {
  const out: Poly[] = []
  for (const face of mesh.faces.values()) {
    const pts = face.vertexIds.map(id => mesh.vertices.get(id)!.position.clone())
    const uvs = face.vertexIds.map((_, i) => face.uvs[i]?.clone() ?? new THREE.Vector2())
    for (const tri of surfaceTriangles(pts)) {
      out.push({
        vertices: tri.map(i => pts[i].clone()),
        uvs: tri.map(i => uvs[i].clone()),
        materialIndex: face.materialIndex
      })
    }
  }
  return out
}

function lerpPoly(poly: Poly, i: number, j: number, t: number): { p: THREE.Vector3; uv: THREE.Vector2 } {
  return {
    p: poly.vertices[i].clone().lerp(poly.vertices[j], t),
    uv: poly.uvs[i].clone().lerp(poly.uvs[j], t)
  }
}

function splitPoly(poly: Poly, plane: THREE.Plane): { f: Poly[]; b: Poly[]; cf: Poly[]; cb: Poly[] } {
  const types = poly.vertices.map(v => {
    const d = plane.distanceToPoint(v)
    return d > EPS ? 1 : d < -EPS ? -1 : 0
  })
  const pos = types.filter(t => t > 0).length
  const neg = types.filter(t => t < 0).length
  if (!pos && !neg) {
    return plane.normal.dot(planeOf(poly).normal) > 0
      ? { f: [], b: [], cf: [poly], cb: [] }
      : { f: [], b: [], cf: [], cb: [poly] }
  }
  if (!neg) return { f: [poly], b: [], cf: [], cb: [] }
  if (!pos) return { f: [], b: [poly], cf: [], cb: [] }

  const fv: THREE.Vector3[] = [], fu: THREE.Vector2[] = []
  const bv: THREE.Vector3[] = [], bu: THREE.Vector2[] = []
  for (let i = 0; i < poly.vertices.length; i++) {
    const j = (i + 1) % poly.vertices.length
    const ti = types[i], tj = types[j]
    if (ti !== -1) { fv.push(poly.vertices[i].clone()); fu.push(poly.uvs[i].clone()) }
    if (ti !== 1) { bv.push(poly.vertices[i].clone()); bu.push(poly.uvs[i].clone()) }
    if ((ti === 1 && tj === -1) || (ti === -1 && tj === 1)) {
      const di = plane.distanceToPoint(poly.vertices[i])
      const dj = plane.distanceToPoint(poly.vertices[j])
      const t = di / (di - dj)
      const hit = lerpPoly(poly, i, j, t)
      fv.push(hit.p.clone()); fu.push(hit.uv.clone())
      bv.push(hit.p.clone()); bu.push(hit.uv.clone())
    }
  }
  const front = fv.length >= 3 ? [{ vertices: fv, uvs: fu, materialIndex: poly.materialIndex }] : []
  const back = bv.length >= 3 ? [{ vertices: bv, uvs: bu, materialIndex: poly.materialIndex }] : []
  return { f: front, b: back, cf: [], cb: [] }
}

class Node {
  plane: THREE.Plane
  polygons: Poly[] = []
  front: Node | null = null
  back: Node | null = null

  constructor(polygons: Poly[]) {
    this.plane = planeOf(polygons[0])
    this.build(polygons)
  }

  clone(): Node {
    const node = Object.create(Node.prototype) as Node
    node.plane = this.plane.clone()
    node.polygons = this.polygons.map(p => ({
      vertices: p.vertices.map(v => v.clone()),
      uvs: p.uvs.map(u => u.clone()),
      materialIndex: p.materialIndex
    }))
    node.front = this.front?.clone() ?? null
    node.back = this.back?.clone() ?? null
    return node
  }

  invert() {
    for (const p of this.polygons) {
      p.vertices.reverse()
      p.uvs.reverse()
    }
    this.plane.negate()
    this.front?.invert()
    this.back?.invert()
    const t = this.front
    this.front = this.back
    this.back = t
  }

  clipPolygons(polygons: Poly[]): Poly[] {
    if (!this.plane) return polygons.slice()
    let f: Poly[] = [], b: Poly[] = []
    for (const poly of polygons) {
      const parts = splitPoly(poly, this.plane)
      f.push(...parts.f, ...parts.cf)
      b.push(...parts.b, ...parts.cb)
    }
    if (this.front) f = this.front.clipPolygons(f)
    if (this.back) b = this.back.clipPolygons(b)
    else b = []
    return f.concat(b)
  }

  clipTo(node: Node) {
    this.polygons = node.clipPolygons(this.polygons)
    this.front?.clipTo(node)
    this.back?.clipTo(node)
  }

  all(): Poly[] {
    return this.polygons.concat(this.front?.all() ?? [], this.back?.all() ?? [])
  }

  private build(polygons: Poly[]) {
    if (!polygons.length) return
    if (!this.plane) this.plane = planeOf(polygons[0])
    const f: Poly[] = [], b: Poly[] = []
    for (const poly of polygons) {
      const parts = splitPoly(poly, this.plane)
      this.polygons.push(...parts.cf, ...parts.cb)
      f.push(...parts.f)
      b.push(...parts.b)
    }
    if (f.length) this.front = new Node(f)
    if (b.length) this.back = new Node(b)
  }
}

function fromMesh(mesh: EditableMesh): Node | null {
  const polys = triangulate(mesh)
  return polys.length ? new Node(polys) : null
}

function intoMesh(mesh: EditableMesh, polys: Poly[]) {
  for (const id of [...mesh.faces.keys()]) mesh.removeFace(id)
  for (const id of [...mesh.vertices.keys()]) {
    const v = mesh.vertices.get(id)
    if (v && v.faceIds.length === 0) mesh.removeVertex(id)
  }
  const key = (p: THREE.Vector3) => `${p.x.toFixed(5)},${p.y.toFixed(5)},${p.z.toFixed(5)}`
  const verts = new Map<string, number>()
  const vert = (p: THREE.Vector3) => {
    const k = key(p)
    const existing = verts.get(k)
    if (existing !== undefined) return existing
    const id = mesh.addVertex(p.clone()).id
    verts.set(k, id)
    return id
  }
  for (const poly of polys) {
    const ids = poly.vertices.map(vert)
    if (new Set(ids).size < 3) continue
    mesh.addFace(ids, poly.uvs.map(u => u.clone()), poly.materialIndex)
  }
  // The cutter runs on triangles. Fold coplanar pairs back into quads so a face does not keep its draw diagonal.
  for (let pass = 0; pass < 8; pass++) {
    const before = mesh.faces.size
    mergePlanarPairs(mesh)
    if (mesh.faces.size === before) break
  }
  weldTJunctions(mesh)
  mesh.recalculateNormals()
}

/**
 * BSP splits one side of an edge and not the other, leaving a vertex on the middle of its
 * neighbour's edge. That is a crack in engines and under deformation. Insert each such vertex
 * into the face loop so both sides share it.
 */
function weldTJunctions(mesh: EditableMesh, eps = 1e-5) {
  for (let pass = 0; pass < 8; pass++) {
    const open = [...mesh.edges.values()].filter(e => e.faceIds.length === 1)
    if (!open.length) return
    const candidates = new Set<number>()
    for (const e of open) { candidates.add(e.v1); candidates.add(e.v2) }
    let changed = false
    const seg = new THREE.Vector3(), rel = new THREE.Vector3()
    for (const edge of open) {
      if (!mesh.edges.has(edge.id) || edge.faceIds.length !== 1) continue
      const face = mesh.faces.get(edge.faceIds[0]!)
      if (!face) continue
      const n = face.vertexIds.length
      const i = face.vertexIds.findIndex((v, k) => {
        const w = face.vertexIds[(k + 1) % n]
        return (v === edge.v1 && w === edge.v2) || (v === edge.v2 && w === edge.v1)
      })
      if (i < 0) continue
      const a = face.vertexIds[i], b = face.vertexIds[(i + 1) % n]
      const pa = mesh.vertices.get(a)!.position, pb = mesh.vertices.get(b)!.position
      seg.subVectors(pb, pa)
      const len2 = seg.lengthSq()
      if (len2 < eps * eps) continue
      const hits: { id: number; t: number }[] = []
      for (const id of candidates) {
        if (id === a || id === b || face.vertexIds.includes(id)) continue
        const p = mesh.vertices.get(id)?.position
        if (!p) continue
        rel.subVectors(p, pa)
        const t = rel.dot(seg) / len2
        if (t <= eps || t >= 1 - eps) continue
        if (rel.addScaledVector(seg, -t).lengthSq() > eps * eps) continue
        hits.push({ id, t })
      }
      if (!hits.length) continue
      hits.sort((x, y) => x.t - y.t)
      const uvA = face.uvs[i]!, uvB = face.uvs[(i + 1) % n]!
      const verts = [...face.vertexIds], uvs = face.uvs.map(uv => uv.clone())
      verts.splice(i + 1, 0, ...hits.map(h => h.id))
      uvs.splice(i + 1, 0, ...hits.map(h => uvA.clone().lerp(uvB, h.t)))
      if (mesh.replaceFace(face.id, verts, uvs)) changed = true
    }
    if (!changed) return
  }
}

export class BooleanKernel {
  static operate(a: EditableMesh, b: EditableMesh, op: BooleanOp): boolean {
    const A = fromMesh(a)
    const B = fromMesh(b)
    if (!A || !B) return false
    if (op === 'union') {
      const a2 = A.clone(), b2 = B.clone()
      a2.clipTo(b2)
      b2.clipTo(a2)
      b2.invert()
      b2.clipTo(a2)
      b2.invert()
      intoMesh(a, a2.all().concat(b2.all()))
    } else if (op === 'difference') {
      const a2 = A.clone(), b2 = B.clone()
      a2.invert()
      a2.clipTo(b2)
      b2.clipTo(a2)
      b2.invert()
      b2.clipTo(a2)
      b2.invert()
      // csg.js merges b into a before the final invert, so b's polygons flip too.
      a2.invert()
      b2.invert()
      intoMesh(a, a2.all().concat(b2.all()))
    } else {
      const a2 = A.clone(), b2 = B.clone()
      a2.invert()
      b2.clipTo(a2)
      b2.invert()
      a2.clipTo(b2)
      b2.clipTo(a2)
      a2.invert()
      b2.invert()
      intoMesh(a, a2.all().concat(b2.all()))
    }
    return a.faces.size > 0
  }
}
