import type { MeshObject } from '../../types/mesh'
import * as THREE from 'three'
import { meshObjectWorldMatrix } from './MeshTransform'
import { surfaceTriangles } from './SurfaceGeometry'
import { addObjectRotation, flipMeshGeometry, type SymmetryAxis } from './ObjectSymmetry'

export type SnapTarget = 'grid' | 'vertex' | 'edge' | 'face'

/** Reflect local vertex positions through the plane `axis = offset` and flip winding. */
export function reflectMeshAcrossPlane(mesh: MeshObject, axis: SymmetryAxis, offset = 0): void {
  if (!Number.isFinite(offset) || Math.abs(offset) < 1e-8) {
    flipMeshGeometry(mesh, axis)
    return
  }
  for (const vertex of mesh.vertices) {
    vertex.position[axis] = offset * 2 - vertex.position[axis]
  }
  for (const face of mesh.faces) {
    face.vertexIds.reverse()
    if (face.uvs) face.uvs.reverse()
  }
}

/** Move an object's position along one axis. `step` is the copy index, starting at 1. */
export function offsetObjectAlong(mesh: MeshObject, axis: SymmetryAxis, distance: number, step: number): void {
  mesh.position[axis] += distance * step
}

/** Spin a copy around the object origin. `count` is the full ring, including the original. */
export function rotateObjectAround(mesh: MeshObject, axis: SymmetryAxis, index: number, count: number): void {
  const steps = Math.max(2, Math.round(count))
  addObjectRotation(mesh, axis, (360 / steps) * index)
}

/**
 * Geometry to draw or export for a linked duplicate.
 * The instance keeps its own transform. Vertex data stays on the source.
 */
export function resolveInstanceMesh(
  mesh: MeshObject,
  lookup: (id: string) => MeshObject | undefined,
  seen: Set<string> = new Set()
): MeshObject {
  if (!mesh.instanceOf || seen.has(mesh.id)) return mesh
  seen.add(mesh.id)
  const source = lookup(mesh.instanceOf)
  if (!source || source.id === mesh.id) return mesh
  const root = resolveInstanceMesh(source, lookup, seen)
  return {
    ...mesh,
    vertices: root.vertices,
    faces: root.faces,
    seamEdgeIds: root.seamEdgeIds,
    sharpEdgeIds: root.sharpEdgeIds,
    shadeMode: root.shadeMode,
    autoSmoothAngle: root.autoSmoothAngle
  }
}

/** Snap an object's origin to the grid, or to geometry on the other objects. */
export function snapObjectPosition(
  mesh: MeshObject,
  others: MeshObject[],
  mode: SnapTarget,
  gridSize = 0.1,
  lookup: (id: string) => MeshObject | undefined = () => undefined
): void {
  if (mode === 'grid') {
    const step = Number.isFinite(gridSize) && gridSize > 0 ? gridSize : 0.1
    mesh.position.x = Math.round(mesh.position.x / step) * step
    mesh.position.y = Math.round(mesh.position.y / step) * step
    mesh.position.z = Math.round(mesh.position.z / step) * step
    return
  }
  const origin = new THREE.Vector3(mesh.position.x, mesh.position.y, mesh.position.z)
  const target = mode === 'vertex'
    ? nearestWorldVertex(others, origin, lookup)
    : mode === 'edge'
      ? nearestWorldEdgeCenter(others, origin, lookup)
      : nearestWorldFacePoint(others, origin, lookup)
  if (!target) return
  mesh.position.x = target.x
  mesh.position.y = target.y
  mesh.position.z = target.z
}

function worldPoints(mesh: MeshObject, lookup: (id: string) => MeshObject | undefined): THREE.Vector3[] {
  const matrix = meshObjectWorldMatrix(mesh)
  const source = resolveInstanceMesh(mesh, lookup)
  return source.vertices.map(vertex => new THREE.Vector3(vertex.position.x, vertex.position.y, vertex.position.z).applyMatrix4(matrix))
}

function nearestWorldVertex(meshes: MeshObject[], point: THREE.Vector3, lookup: (id: string) => MeshObject | undefined): THREE.Vector3 | null {
  let best: THREE.Vector3 | null = null
  let bestD = Infinity
  for (const mesh of meshes) {
    for (const position of worldPoints(mesh, lookup)) {
      const d = position.distanceToSquared(point)
      if (d < bestD) {
        bestD = d
        best = position
      }
    }
  }
  return best
}

function nearestWorldEdgeCenter(meshes: MeshObject[], point: THREE.Vector3, lookup: (id: string) => MeshObject | undefined): THREE.Vector3 | null {
  let best: THREE.Vector3 | null = null
  let bestD = Infinity
  for (const mesh of meshes) {
    const drawn = resolveInstanceMesh(mesh, lookup)
    const matrix = meshObjectWorldMatrix(mesh)
    const byId = new Map(drawn.vertices.map(vertex => [vertex.id, new THREE.Vector3(vertex.position.x, vertex.position.y, vertex.position.z).applyMatrix4(matrix)]))
    for (const face of drawn.faces) {
      const n = face.vertexIds.length
      for (let i = 0; i < n; i++) {
        const a = byId.get(face.vertexIds[i])
        const b = byId.get(face.vertexIds[(i + 1) % n])
        if (!a || !b) continue
        const mid = a.clone().add(b).multiplyScalar(0.5)
        const d = mid.distanceToSquared(point)
        if (d < bestD) {
          bestD = d
          best = mid
        }
      }
    }
  }
  return best
}

function nearestWorldFacePoint(meshes: MeshObject[], point: THREE.Vector3, lookup: (id: string) => MeshObject | undefined): THREE.Vector3 | null {
  let best: THREE.Vector3 | null = null
  let bestD = Infinity
  for (const mesh of meshes) {
    const drawn = resolveInstanceMesh(mesh, lookup)
    const matrix = meshObjectWorldMatrix(mesh)
    const byId = new Map(drawn.vertices.map(vertex => [vertex.id, new THREE.Vector3(vertex.position.x, vertex.position.y, vertex.position.z).applyMatrix4(matrix)]))
    for (const face of drawn.faces) {
      const points = face.vertexIds.map(id => byId.get(id)).filter((p): p is THREE.Vector3 => !!p)
      for (const tri of surfaceTriangles(points)) {
        const [ia, ib, ic] = tri
        if (ia === undefined || ib === undefined || ic === undefined) continue
        const a = points[ia]
        const b = points[ib]
        const c = points[ic]
        if (!a || !b || !c) continue
        const hit = closestPointOnTriangle(point, a, b, c)
        const d = hit.distanceToSquared(point)
        if (d < bestD) {
          bestD = d
          best = hit
        }
      }
    }
  }
  return best
}

function closestPointOnTriangle(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): THREE.Vector3 {
  const ab = b.clone().sub(a)
  const ac = c.clone().sub(a)
  const ap = p.clone().sub(a)
  const d1 = ab.dot(ap)
  const d2 = ac.dot(ap)
  if (d1 <= 0 && d2 <= 0) return a.clone()
  const bp = p.clone().sub(b)
  const d3 = ab.dot(bp)
  const d4 = ac.dot(bp)
  if (d3 >= 0 && d4 <= d3) return b.clone()
  const vc = d1 * d4 - d3 * d2
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return a.clone().addScaledVector(ab, d1 / (d1 - d3))
  const cp = p.clone().sub(c)
  const d5 = ab.dot(cp)
  const d6 = ac.dot(cp)
  if (d6 >= 0 && d5 <= d6) return c.clone()
  const vb = d5 * d2 - d1 * d6
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return a.clone().addScaledVector(ac, d2 / (d2 - d6))
  const va = d3 * d6 - d5 * d4
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    return b.clone().addScaledVector(c.clone().sub(b), (d4 - d3) / ((d4 - d3) + (d5 - d6)))
  }
  const denom = 1 / (va + vb + vc)
  return a.clone().addScaledVector(ab, vb * denom).addScaledVector(ac, vc * denom)
}
