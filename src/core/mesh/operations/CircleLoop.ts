import * as THREE from 'three'
import { EditableMesh } from '../MeshKernel'

/**
 * LoopTools-style Circle. A selected vertex loop is flattened onto its best-fit
 * plane and spaced evenly on one circle, so a rough hole becomes a clean cylinder rim.
 */
export class CircleLoop {
  /** Vertices on the outline of a face selection. Interior verts of a patch stay put. */
  static outlineVertexIds(mesh: EditableMesh, faceIds: number[]): number[] {
    const use = new Map<string, { n: number; a: number; b: number }>()
    for (const faceId of faceIds) {
      const face = mesh.faces.get(faceId)
      if (!face) continue
      const ids = face.vertexIds
      for (let i = 0; i < ids.length; i++) {
        const a = ids[i]
        const b = ids[(i + 1) % ids.length]
        const key = a < b ? `${a}:${b}` : `${b}:${a}`
        const row = use.get(key) ?? { n: 0, a, b }
        row.n++
        use.set(key, row)
      }
    }
    const verts = new Set<number>()
    for (const row of use.values()) {
      if (row.n !== 1) continue
      verts.add(row.a)
      verts.add(row.b)
    }
    return [...verts]
  }

  /** @returns how many vertices moved */
  static circleVertices(mesh: EditableMesh, vertexIds: number[]): number {
    const ids = [...new Set(vertexIds)].filter(id => mesh.vertices.has(id))
    if (ids.length < 3) return 0
    const selected = new Set(ids)
    const adj = new Map<number, number[]>()
    for (const id of ids) adj.set(id, [])
    for (const id of ids) {
      const v = mesh.vertices.get(id)!
      const neighbors = new Set<number>()
      for (const edgeId of v.edgeIds) {
        const edge = mesh.edges.get(edgeId)
        if (!edge) continue
        const other = edge.v1 === id ? edge.v2 : edge.v1
        if (selected.has(other)) neighbors.add(other)
      }
      adj.set(id, [...neighbors])
    }

    const pending = new Set(ids)
    let moved = 0
    while (pending.size) {
      const component = this.component(pending.values().next().value as number, adj)
      for (const id of component) pending.delete(id)
      const loop = this.orderLoop(component, adj)
      if (!loop || loop.ids.length < 3) continue
      moved += this.fit(mesh, loop.ids, loop.closed, loop.angular)
    }
    if (moved) mesh.recalculateNormals()
    return moved
  }

  private static component(start: number, adj: Map<number, number[]>): Set<number> {
    const seen = new Set<number>()
    const stack = [start]
    while (stack.length) {
      const id = stack.pop()!
      if (seen.has(id)) continue
      seen.add(id)
      for (const next of adj.get(id) ?? []) {
        if (!seen.has(next)) stack.push(next)
      }
    }
    return seen
  }

  private static orderLoop(component: Set<number>, adj: Map<number, number[]>): { ids: number[]; closed: boolean; angular: boolean } | null {
    const nodes = [...component]
    const degree = (id: number) => (adj.get(id) ?? []).filter(next => component.has(next)).length
    if (nodes.some(id => degree(id) > 2)) return { ids: nodes, closed: true, angular: true }
    const ends = nodes.filter(id => degree(id) <= 1)
    const start = ends[0] ?? nodes[0]
    const ordered = [start]
    let prev = -1
    let current = start
    while (ordered.length <= nodes.length) {
      const next = (adj.get(current) ?? []).find(id => id !== prev && component.has(id))
      if (next == null) break
      if (next === start && ordered.length >= 3) return { ids: ordered, closed: true, angular: false }
      if (ordered.includes(next)) break
      ordered.push(next)
      prev = current
      current = next
    }
    if (ordered.length < 3) return null
    return { ids: ordered, closed: false, angular: false }
  }

  private static fit(mesh: EditableMesh, ids: number[], closed: boolean, angular: boolean): number {
    const points = ids.map(id => mesh.vertices.get(id)!.position.clone())
    const center = new THREE.Vector3()
    for (const p of points) center.add(p)
    center.multiplyScalar(1 / points.length)

    let normal = new THREE.Vector3()
    if (!angular) {
      for (let i = 0; i < points.length; i++) {
        normal.add(points[i].clone().sub(center).cross(points[(i + 1) % points.length].clone().sub(center)))
      }
    }
    if (normal.lengthSq() < 1e-10) normal = this.planeNormal(points, center)
    if (normal.lengthSq() < 1e-10) return 0
    normal.normalize()

    const axisU = Math.abs(normal.dot(new THREE.Vector3(1, 0, 0))) > 0.9
      ? new THREE.Vector3(0, 1, 0).cross(normal)
      : new THREE.Vector3(1, 0, 0).cross(normal)
    axisU.normalize()
    const axisV = normal.clone().cross(axisU).normalize()
    const flat = points.map(p => {
      const d = p.clone().sub(center)
      return new THREE.Vector2(d.dot(axisU), d.dot(axisV))
    })
    let radius = 0
    for (const p of flat) radius += p.length()
    radius /= flat.length
    if (radius < 1e-8) return 0

    const place = (angle: number, id: number) => {
      mesh.vertices.get(id)!.position
        .copy(center)
        .addScaledVector(axisU, Math.cos(angle) * radius)
        .addScaledVector(axisV, Math.sin(angle) * radius)
    }

    if (!closed) {
      const unwrapped = [Math.atan2(flat[0].y, flat[0].x)]
      for (let i = 1; i < flat.length; i++) {
        let delta = Math.atan2(flat[i].y, flat[i].x) - Math.atan2(flat[i - 1].y, flat[i - 1].x)
        if (delta > Math.PI) delta -= Math.PI * 2
        if (delta < -Math.PI) delta += Math.PI * 2
        unwrapped.push(unwrapped[i - 1] + delta)
      }
      const span = unwrapped[unwrapped.length - 1] - unwrapped[0]
      for (let i = 0; i < ids.length; i++) place(unwrapped[0] + span * (i / (ids.length - 1)), ids[i])
      return ids.length
    }

    const order = angular ? this.angularOrder(ids, flat) : ids
    const first = flat[ids.indexOf(order[0])]
    const start = Math.atan2(first.y, first.x)
    let wind = 0
    const angles = order.map(id => {
      const p = flat[ids.indexOf(id)]
      return Math.atan2(p.y, p.x)
    })
    for (let i = 0; i < angles.length; i++) {
      let delta = angles[(i + 1) % angles.length] - angles[i]
      if (delta > Math.PI) delta -= Math.PI * 2
      if (delta < -Math.PI) delta += Math.PI * 2
      wind += delta
    }
    const sign = wind >= 0 ? 1 : -1
    const step = (Math.PI * 2) / order.length
    for (let i = 0; i < order.length; i++) place(start + sign * i * step, order[i])
    return order.length
  }

  private static angularOrder(ids: number[], flat: THREE.Vector2[]): number[] {
    return ids
      .map((id, index) => ({ id, angle: Math.atan2(flat[index].y, flat[index].x) }))
      .sort((a, b) => a.angle - b.angle)
      .map(entry => entry.id)
  }

  private static planeNormal(points: THREE.Vector3[], center: THREE.Vector3): THREE.Vector3 {
    let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0
    for (const p of points) {
      const d = p.clone().sub(center)
      xx += d.x * d.x
      xy += d.x * d.y
      xz += d.x * d.z
      yy += d.y * d.y
      yz += d.y * d.z
      zz += d.z * d.z
    }
    const rows = [
      new THREE.Vector3(xx, xy, xz),
      new THREE.Vector3(xy, yy, yz),
      new THREE.Vector3(xz, yz, zz)
    ]
    const a = rows[0].clone().cross(rows[1])
    if (a.lengthSq() > 1e-12) return a
    return rows[0].clone().cross(rows[2])
  }
}
