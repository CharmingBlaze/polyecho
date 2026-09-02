import * as THREE from 'three'
import { EditableMesh } from '../MeshKernel'
import { MeshTopologyService } from '../MeshTopologyService'

export type DrawViewKind = 'persp' | 'top' | 'front' | 'right'

export interface DrawPlane {
  origin: THREE.Vector3
  normal: THREE.Vector3
  axisU: THREE.Vector3
  axisV: THREE.Vector3
}

export class PolyDrawKernel {
  static planeForView(kind: DrawViewKind, origin?: THREE.Vector3): DrawPlane {
    let plane: DrawPlane
    if (kind === 'right') {
      plane = {
        origin: new THREE.Vector3(0, 0, 0),
        normal: new THREE.Vector3(1, 0, 0),
        axisU: new THREE.Vector3(0, 0, 1),
        axisV: new THREE.Vector3(0, 1, 0)
      }
    } else if (kind === 'top') {
      plane = {
        origin: new THREE.Vector3(0, 0, 0),
        normal: new THREE.Vector3(0, 1, 0),
        axisU: new THREE.Vector3(1, 0, 0),
        axisV: new THREE.Vector3(0, 0, -1)
      }
    } else {
      plane = {
        origin: new THREE.Vector3(0, 0, 0),
        normal: new THREE.Vector3(0, 0, 1),
        axisU: new THREE.Vector3(1, 0, 0),
        axisV: new THREE.Vector3(0, 1, 0)
      }
    }
    if (origin) plane.origin.copy(origin)
    return plane
  }

  /** Billboard through `origin`, facing the camera — the 3D sketch plane. */
  static viewPlane(camera: THREE.Camera, origin: THREE.Vector3): DrawPlane {
    const n = new THREE.Vector3()
    camera.getWorldDirection(n)
    if (n.lengthSq() < 1e-10) n.set(0, 0, 1)
    else n.normalize()
    return this.planeFromHit(origin, n.clone().negate())
  }

  static rebaseOrigin(plane: DrawPlane, origin: THREE.Vector3): DrawPlane {
    return {
      origin: origin.clone(),
      normal: plane.normal.clone(),
      axisU: plane.axisU.clone(),
      axisV: plane.axisV.clone()
    }
  }

  static normalTowardViewer(normal: THREE.Vector3, viewDir: THREE.Vector3): THREE.Vector3 {
    const n = normal.clone()
    if (n.lengthSq() < 1e-10) n.set(0, 1, 0)
    else n.normalize()
    if (n.dot(viewDir) > 0) n.negate()
    return n
  }

  /** Camera-space points in front of a persp/ortho camera have z < 0. */
  static isInFrontOfCamera(world: THREE.Vector3, camera: THREE.Camera): boolean {
    const z = world.clone().applyMatrix4(camera.matrixWorldInverse).z
    return z < -1e-4
  }

  static planeFromHit(point: THREE.Vector3, normal: THREE.Vector3): DrawPlane {
    const n = normal.clone()
    if (n.lengthSq() < 1e-10) n.set(0, 1, 0)
    else n.normalize()
    const up = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
    const axisU = up.clone().cross(n)
    if (axisU.lengthSq() < 1e-10) axisU.set(1, 0, 0)
    else axisU.normalize()
    const axisV = n.clone().cross(axisU).normalize()
    return { origin: point.clone(), normal: n, axisU, axisV }
  }

  static intersectPlane(ray: THREE.Ray, plane: DrawPlane): THREE.Vector3 | null {
    const denom = ray.direction.dot(plane.normal)
    if (Math.abs(denom) < 1e-8) return null
    const t = plane.origin.clone().sub(ray.origin).dot(plane.normal) / denom
    if (!isFinite(t) || t < 1e-4) return null
    return ray.origin.clone().addScaledVector(ray.direction, t)
  }

  /** True when the hit is grazing or flies off to infinity (horizon ground). */
  static isUnreliableHit(ray: THREE.Ray, plane: DrawPlane, camera: THREE.Camera): boolean {
    const hit = this.intersectPlane(ray, plane)
    if (!hit) return true
    const focus = Math.max(1, camera.position.distanceTo(plane.origin))
    return hit.distanceTo(ray.origin) > Math.max(48, focus * 8)
  }

  static snapOnPlane(point: THREE.Vector3, plane: DrawPlane, gridSize: number): THREE.Vector3 {
    const rel = point.clone().sub(plane.origin)
    const u = rel.dot(plane.axisU)
    const v = rel.dot(plane.axisV)
    const size = gridSize > 0 ? gridSize : 0.5
    const su = Math.round(u / size) * size
    const sv = Math.round(v / size) * size
    return plane.origin.clone()
      .addScaledVector(plane.axisU, su)
      .addScaledVector(plane.axisV, sv)
  }

  static newellNormal(points: THREE.Vector3[]): THREE.Vector3 {
    const n = new THREE.Vector3()
    for (let i = 0; i < points.length; i++) {
      const a = points[i]
      const b = points[(i + 1) % points.length]
      n.x += (a.y - b.y) * (a.z + b.z)
      n.y += (a.z - b.z) * (a.x + b.x)
      n.z += (a.x - b.x) * (a.y + b.y)
    }
    if (n.lengthSq() < 1e-12) return new THREE.Vector3(0, 1, 0)
    return n.normalize()
  }

  static maxPlaneDeviation(points: THREE.Vector3[]): number {
    if (points.length < 3) return 0
    const n = this.newellNormal(points)
    const o = points[0]
    let max = 0
    for (const p of points) {
      max = Math.max(max, Math.abs(p.clone().sub(o).dot(n)))
    }
    return max
  }

  static isPlanarLoop(points: THREE.Vector3[]): boolean {
    if (points.length < 3) return false
    let span = 0
    for (let i = 0; i < points.length; i++) {
      span = Math.max(span, points[i].distanceTo(points[(i + 1) % points.length]))
    }
    const slop = Math.max(0.05, span * 0.04)
    return this.maxPlaneDeviation(points) <= slop
  }

  /** Project the loop onto its own plane so the texture isn't a stretched atlas triangle. */
  static planarUvs(points: THREE.Vector3[]): THREE.Vector2[] {
    if (points.length === 0) return []
    const n = this.newellNormal(points)
    const up = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
    let axisU = up.clone().cross(n)
    if (axisU.lengthSq() < 1e-10) axisU = new THREE.Vector3(1, 0, 0)
    else axisU.normalize()
    const axisV = n.clone().cross(axisU).normalize()
    const us = points.map(p => p.dot(axisU))
    const vs = points.map(p => p.dot(axisV))
    const minU = Math.min(...us)
    const minV = Math.min(...vs)
    const du = Math.max(1e-6, Math.max(...us) - minU)
    const dv = Math.max(1e-6, Math.max(...vs) - minV)
    const scale = Math.max(du, dv)
    return points.map((_, i) => new THREE.Vector2((us[i] - minU) / scale, (vs[i] - minV) / scale))
  }

  /** Reverse the loop when it faces into the scene so thickness starts toward the camera. */
  static orientLoopTowardViewer(points: THREE.Vector3[], viewDir: THREE.Vector3): THREE.Vector3[] {
    if (points.length < 3) return points
    const n = this.newellNormal(points)
    if (n.dot(viewDir) > 0) return [...points].reverse()
    return points
  }

  static flipPlane(plane: DrawPlane): DrawPlane {
    return {
      origin: plane.origin.clone(),
      normal: plane.normal.clone().negate(),
      axisU: plane.axisU.clone().negate(),
      axisV: plane.axisV.clone()
    }
  }

  /** Shift-draw: lock the next point to 45° steps on the plane from `from`. */
  static constrainFromLast(from: THREE.Vector3, hover: THREE.Vector3, plane: DrawPlane, gridSize: number): THREE.Vector3 {
    const rel = hover.clone().sub(from)
    const u = rel.dot(plane.axisU)
    const v = rel.dot(plane.axisV)
    const len = Math.hypot(u, v)
    if (len < 1e-8) return this.snapOnPlane(hover, plane, gridSize)
    const step = Math.PI / 4
    const ang = Math.round(Math.atan2(v, u) / step) * step
    const p = from.clone()
      .addScaledVector(plane.axisU, Math.cos(ang) * len)
      .addScaledVector(plane.axisV, Math.sin(ang) * len)
    return this.snapOnPlane(p, plane, gridSize)
  }

  static createPlanarFace(mesh: EditableMesh, points: THREE.Vector3[]): number | null {
    if (points.length < 3) return null

    const unique: THREE.Vector3[] = []
    for (const p of points) {
      const last = unique[unique.length - 1]
      if (last && last.distanceToSquared(p) < 1e-10) continue
      unique.push(p.clone())
    }
    if (unique.length >= 3 && unique[0].distanceToSquared(unique[unique.length - 1]) < 1e-10) {
      unique.pop()
    }
    if (unique.length < 3) return null

    const vertexIds = unique.map(p => mesh.addVertex(p).id)
    const normal = new THREE.Vector3()
    for (let i = 0; i < unique.length; i++) {
      const a = unique[i]
      const b = unique[(i + 1) % unique.length]
      normal.x += (a.y - b.y) * (a.z + b.z)
      normal.y += (a.z - b.z) * (a.x + b.x)
      normal.z += (a.x - b.x) * (a.y + b.y)
    }
    if (normal.lengthSq() < 1e-10) return null
    normal.normalize()

    const expected = new THREE.Vector3()
      .subVectors(unique[1], unique[0])
      .cross(new THREE.Vector3().subVectors(unique[2], unique[0]))
    if (expected.dot(normal) < 0) {
      vertexIds.reverse()
    }

    const ordered = vertexIds.map(id => mesh.vertices.get(id)!.position)
    return MeshTopologyService.fillBoundary(mesh, vertexIds, PolyDrawKernel.planarUvs(ordered))
  }

  /**
   * Extrude remaps the drawn face onto the new cap. A lone face would stay open
   * on the draw plane — add the original loop back so the block is a closed solid.
   */
  static capDrawBase(mesh: EditableMesh, baseVertexIds: number[]): void {
    if (baseVertexIds.length < 3) return
    const reversed = [...baseVertexIds].reverse()
    MeshTopologyService.fillBoundary(mesh, reversed)
    mesh.recalculateNormals()
  }
}
