import * as THREE from 'three'
import { EditableMesh } from '../MeshKernel'

export type StraightenDirection = 'horizontal' | 'vertical'

/**
 * Straighten a selection. An edge or a loose set of vertices becomes one
 * straight line: level (horizontal) or upright (vertical). A face or a
 * closed loop keeps its shape and is laid flat or stood up in a vertical plane.
 */
export class Straighten {
  static apply(mesh: EditableMesh, vertexIds: number[], direction: StraightenDirection): number {
    const ids = [...new Set(vertexIds)].filter(id => mesh.vertices.has(id))
    if (ids.length < 2) return 0
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

    const groups = links === 0 ? [ids] : this.components(ids, adj).filter(group => group.length >= 2)
    let moved = 0
    for (const group of groups) {
      const surface = links > 0 && this.isSurface(group, adj)
      if (direction === 'horizontal') moved += surface ? this.level(mesh, group) : this.horizontalLine(mesh, group)
      else moved += surface ? this.verticalPlane(mesh, group) : this.verticalLine(mesh, group)
    }
    if (moved) mesh.recalculateNormals()
    return moved
  }

  private static components(ids: number[], adj: Map<number, number[]>): number[][] {
    const pending = new Set(ids)
    const groups: number[][] = []
    while (pending.size) {
      const start = pending.values().next().value as number
      const seen = new Set<number>()
      const stack = [start]
      while (stack.length) {
        const id = stack.pop()!
        if (seen.has(id)) continue
        seen.add(id)
        pending.delete(id)
        for (const next of adj.get(id) ?? []) {
          if (!seen.has(next)) stack.push(next)
        }
      }
      groups.push([...seen])
    }
    return groups
  }

  private static isSurface(group: number[], adj: Map<number, number[]>): boolean {
    const degree = (id: number) => (adj.get(id) ?? []).length
    if (group.some(id => degree(id) > 2)) return true
    return group.every(id => degree(id) === 2)
  }

  private static positions(mesh: EditableMesh, ids: number[]): THREE.Vector3[] {
    return ids.map(id => mesh.vertices.get(id)!.position)
  }

  private static centroid(points: THREE.Vector3[]): THREE.Vector3 {
    const center = new THREE.Vector3()
    for (const p of points) center.add(p)
    return center.multiplyScalar(1 / points.length)
  }

  /** Level every vertex. A face stays wide; only the height is unified. */
  private static level(mesh: EditableMesh, ids: number[]): number {
    const points = this.positions(mesh, ids)
    const y = this.centroid(points).y
    for (const p of points) p.y = y
    return ids.length
  }

  /** Crooked chain → one straight, level line along its ground direction. */
  private static horizontalLine(mesh: EditableMesh, ids: number[]): number {
    const points = this.positions(mesh, ids)
    const center = this.centroid(points)
    const dir = this.groundDirection(points, center)
    const y = center.y
    for (const p of points) {
      const t = (p.x - center.x) * dir.x + (p.z - center.z) * dir.y
      p.x = center.x + dir.x * t
      p.y = y
      p.z = center.z + dir.y * t
    }
    return ids.length
  }

  /** Crooked chain → a vertical line. Heights stay, the lean is removed. */
  private static verticalLine(mesh: EditableMesh, ids: number[]): number {
    const points = this.positions(mesh, ids)
    const center = this.centroid(points)
    for (const p of points) {
      p.x = center.x
      p.z = center.z
    }
    return ids.length
  }

  /** Stand a face up. Width and height stay; the tilt toward the camera is removed. */
  private static verticalPlane(mesh: EditableMesh, ids: number[]): number {
    const points = this.positions(mesh, ids)
    const center = this.centroid(points)
    const along = this.groundDirection(points, center)
    const normal = new THREE.Vector2(-along.y, along.x)
    for (const p of points) {
      const side = (p.x - center.x) * normal.x + (p.z - center.z) * normal.y
      p.x -= normal.x * side
      p.z -= normal.y * side
    }
    return ids.length
  }

  private static groundDirection(points: THREE.Vector3[], center: THREE.Vector3): THREE.Vector2 {
    let xx = 0
    let xz = 0
    let zz = 0
    for (const p of points) {
      const x = p.x - center.x
      const z = p.z - center.z
      xx += x * x
      xz += x * z
      zz += z * z
    }
    if (xx + zz < 1e-12) return new THREE.Vector2(1, 0)
    const angle = 0.5 * Math.atan2(2 * xz, xx - zz)
    const dir = new THREE.Vector2(Math.cos(angle), Math.sin(angle))
    return dir.lengthSq() > 1e-12 ? dir.normalize() : new THREE.Vector2(1, 0)
  }
}
