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
  static planeForView(kind: DrawViewKind): DrawPlane {
    if (kind === 'right') {
      return {
        origin: new THREE.Vector3(0, 0, 0),
        normal: new THREE.Vector3(1, 0, 0),
        axisU: new THREE.Vector3(0, 0, 1),
        axisV: new THREE.Vector3(0, 1, 0)
      }
    }
    if (kind === 'top') {
      return {
        origin: new THREE.Vector3(0, 0, 0),
        normal: new THREE.Vector3(0, 1, 0),
        axisU: new THREE.Vector3(1, 0, 0),
        axisV: new THREE.Vector3(0, 0, -1)
      }
    }
    return {
      origin: new THREE.Vector3(0, 0, 0),
      normal: new THREE.Vector3(0, 0, 1),
      axisU: new THREE.Vector3(1, 0, 0),
      axisV: new THREE.Vector3(0, 1, 0)
    }
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
    if (!isFinite(t)) return null
    return ray.origin.clone().addScaledVector(ray.direction, t)
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

    return MeshTopologyService.fillBoundary(mesh, vertexIds)
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
