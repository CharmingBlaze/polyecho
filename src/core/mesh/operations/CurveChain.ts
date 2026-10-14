import * as THREE from 'three'
import { EditableMesh } from '../MeshKernel'

/**
 * Bend a vertex chain into a round arc. `amount` is a fraction of the chain
 * length: 0 leaves the selection alone, 0.5 bows the middle by half the length.
 * Endpoints stay put. Drag back through 0 to bow the other way.
 */
export class CurveChain {
  static apply(
    mesh: EditableMesh,
    vertexIds: number[],
    amount: number,
    viewRight = new THREE.Vector3(1, 0, 0),
    viewUp = new THREE.Vector3(0, 1, 0)
  ): number {
    if (!Number.isFinite(amount) || Math.abs(amount) < 1e-8) return 0
    const ids = [...new Set(vertexIds)].filter(id => mesh.vertices.has(id))
    if (ids.length < 3) return 0
    const selected = new Set(ids)
    const adj = new Map<number, number[]>()
    for (const id of ids) adj.set(id, [])
    let links = 0
    for (const id of ids) {
      const neighbors = new Set<number>()
      for (const edgeId of mesh.vertices.get(id)!.edgeIds) {
        const edge = mesh.edges.get(edgeId)
        if (!edge) continue
        const other = edge.v1 === id ? edge.v2 : edge.v1
        if (selected.has(other)) neighbors.add(other)
      }
      adj.set(id, [...neighbors])
      links += neighbors.size
    }

    const groups = links === 0 ? [this.sortLoose(mesh, ids)] : this.chains(ids, adj)
    let moved = 0
    for (const chain of groups) {
      if (!chain || chain.ids.length < 3) continue
      moved += chain.closed
        ? this.roundLoop(mesh, chain.ids, amount)
        : this.bendChain(mesh, chain.ids, amount, viewRight, viewUp)
    }
    if (moved) mesh.recalculateNormals()
    return moved
  }

  private static chains(ids: number[], adj: Map<number, number[]>): { ids: number[]; closed: boolean }[] {
    const pending = new Set(ids)
    const groups: { ids: number[]; closed: boolean }[] = []
    while (pending.size) {
      const start = pending.values().next().value as number
      const seen = new Set<number>()
      const stack = [start]
      while (stack.length) {
        const id = stack.pop()!
        if (seen.has(id)) continue
        seen.add(id)
        pending.delete(id)
        for (const next of adj.get(id) ?? []) if (!seen.has(next)) stack.push(next)
      }
      const nodes = [...seen]
      const degree = (id: number) => (adj.get(id) ?? []).length
      const closed = nodes.length >= 3 && nodes.every(id => degree(id) === 2)
      const ends = nodes.filter(id => degree(id) <= 1)
      const ordered = [ends[0] ?? nodes[0]]
      let prev = -1
      let current = ordered[0]
      while (ordered.length < nodes.length) {
        const next = (adj.get(current) ?? []).find(id => id !== prev)
        if (next == null || next === ordered[0]) break
        ordered.push(next)
        prev = current
        current = next
      }
      if (ordered.length >= 3) groups.push({ ids: ordered, closed })
    }
    return groups
  }

  private static sortLoose(mesh: EditableMesh, ids: number[]): { ids: number[]; closed: boolean } {
    const points = ids.map(id => mesh.vertices.get(id)!.position)
    const center = new THREE.Vector3()
    for (const p of points) center.add(p)
    center.multiplyScalar(1 / points.length)
    let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0
    for (const p of points) {
      const d = p.clone().sub(center)
      xx += d.x * d.x; xy += d.x * d.y; xz += d.x * d.z
      yy += d.y * d.y; yz += d.y * d.z; zz += d.z * d.z
    }
    const axis = xx >= yy && xx >= zz
      ? new THREE.Vector3(1, 0, 0)
      : yy >= zz ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1)
    const ordered = ids
      .map(id => ({ id, t: mesh.vertices.get(id)!.position.dot(axis) }))
      .sort((a, b) => a.t - b.t)
      .map(entry => entry.id)
    return { ids: ordered, closed: false }
  }

  private static bendChain(
    mesh: EditableMesh,
    ids: number[],
    amount: number,
    viewRight: THREE.Vector3,
    viewUp: THREE.Vector3
  ): number {
    const points = ids.map(id => mesh.vertices.get(id)!.position.clone())
    const start = points[0]
    const end = points[points.length - 1]
    const chord = end.clone().sub(start)
    const length = chord.length()
    if (length < 1e-8) return 0
    const tangent = chord.clone().multiplyScalar(1 / length)
    const bow = new THREE.Vector3()
    for (let i = 1; i < points.length - 1; i++) {
      const rel = points[i].clone().sub(start)
      bow.add(rel.addScaledVector(tangent, -rel.dot(tangent)))
    }
    const axis = bow.lengthSq() > (length * 0.02) ** 2 ? bow.normalize() : this.screenPerp(tangent, viewRight, viewUp)
    const travel = [0]
    for (let i = 1; i < points.length; i++) travel.push(travel[i - 1] + points[i].distanceTo(points[i - 1]))
    const total = travel[travel.length - 1] || length
    const sag = amount * length
    for (let i = 1; i < ids.length - 1; i++) {
      const t = travel[i] / total
      mesh.vertices.get(ids[i])!.position.addScaledVector(axis, Math.sin(Math.PI * t) * sag)
    }
    return ids.length - 2
  }

  /** Pull a closed loop toward equal radii so a lumpy ring becomes round. */
  private static roundLoop(mesh: EditableMesh, ids: number[], amount: number): number {
    const points = ids.map(id => mesh.vertices.get(id)!.position)
    const center = new THREE.Vector3()
    for (const p of points) center.add(p)
    center.multiplyScalar(1 / points.length)
    const radii = points.map(p => p.distanceTo(center))
    const mean = radii.reduce((sum, r) => sum + r, 0) / radii.length
    if (mean < 1e-8) return 0
    const k = THREE.MathUtils.clamp(amount, -1, 1)
    for (let i = 0; i < ids.length; i++) {
      const dir = points[i].clone().sub(center)
      if (dir.lengthSq() < 1e-12) continue
      const desired = THREE.MathUtils.lerp(radii[i], mean, k)
      points[i].copy(center).add(dir.normalize().multiplyScalar(Math.max(0, desired)))
    }
    return ids.length
  }

  private static screenPerp(tangent: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3): THREE.Vector3 {
    const sx = tangent.dot(right)
    const sy = tangent.dot(up)
    const side = right.clone().multiplyScalar(-sy).addScaledVector(up, sx)
    if (side.lengthSq() < 1e-10) {
      const fallback = new THREE.Vector3().crossVectors(tangent, up)
      return fallback.lengthSq() > 1e-10 ? fallback.normalize() : new THREE.Vector3(0, 1, 0)
    }
    return side.normalize()
  }
}
