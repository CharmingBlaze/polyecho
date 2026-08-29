import * as THREE from 'three'

export interface ScreenPoint {
  x: number
  y: number
}

export interface Segment2DIntersection {
  hit: boolean
  point: THREE.Vector2
  tA: number // parameter on segment A (0..1)
  tB: number // parameter on segment B (0..1)
}

export class ScreenGeometry {
  /**
   * Projects a 3D world position into 2D viewport pixel coordinates.
   */
  static worldToScreen(
    worldPos: THREE.Vector3,
    camera: THREE.Camera,
    viewportRect: DOMRect | { left: number; top: number; width: number; height: number }
  ): THREE.Vector2 {
    const proj = worldPos.clone().project(camera)
    const x = (proj.x * 0.5 + 0.5) * viewportRect.width + viewportRect.left
    const y = (-(proj.y * 0.5) + 0.5) * viewportRect.height + viewportRect.top
    return new THREE.Vector2(x, y)
  }

  /**
   * Casts a 2D viewport screen coordinate into a normalized 3D ray.
   */
  static screenToRay(
    screenPos: ScreenPoint,
    camera: THREE.Camera,
    viewportRect: DOMRect | { left: number; top: number; width: number; height: number }
  ): THREE.Ray {
    const ndcX = ((screenPos.x - viewportRect.left) / viewportRect.width) * 2 - 1
    const ndcY = -((screenPos.y - viewportRect.top) / viewportRect.height) * 2 + 1
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera)
    return raycaster.ray
  }

  /**
   * Calculates the perpendicular distance from point P to line segment (A -> B).
   */
  static distancePointToSegment2D(
    p: THREE.Vector2,
    a: THREE.Vector2,
    b: THREE.Vector2
  ): { distance: number; t: number; closestPoint: THREE.Vector2 } {
    const ab = b.clone().sub(a)
    const lenSq = ab.lengthSq()

    if (lenSq < 1e-6) {
      return { distance: p.distanceTo(a), t: 0, closestPoint: a.clone() }
    }

    const ap = p.clone().sub(a)
    let t = ap.dot(ab) / lenSq
    t = Math.max(0, Math.min(1, t))

    const closestPoint = a.clone().add(ab.multiplyScalar(t))
    return {
      distance: p.distanceTo(closestPoint),
      t,
      closestPoint
    }
  }

  /**
   * Finds the parametric projection of point P onto segment (A -> B).
   */
  static closestPointParameterOnSegment2D(
    p: THREE.Vector2,
    a: THREE.Vector2,
    b: THREE.Vector2
  ): number {
    const ab = b.clone().sub(a)
    const lenSq = ab.lengthSq()
    if (lenSq < 1e-6) return 0.5

    const ap = p.clone().sub(a)
    const t = ap.dot(ab) / lenSq
    return Math.max(0, Math.min(1, t))
  }

  /**
   * Intersects two 2D line segments (p1 -> p2) and (p3 -> p4).
   */
  static intersectSegments2D(
    p1: THREE.Vector2,
    p2: THREE.Vector2,
    p3: THREE.Vector2,
    p4: THREE.Vector2
  ): Segment2DIntersection {
    const d1 = p2.clone().sub(p1)
    const d2 = p4.clone().sub(p3)

    const cross = d1.x * d2.y - d1.y * d2.x
    if (Math.abs(cross) < 1e-6) {
      return { hit: false, point: new THREE.Vector2(), tA: 0, tB: 0 }
    }

    const dp = p3.clone().sub(p1)
    const tA = (dp.x * d2.y - dp.y * d2.x) / cross
    const tB = (dp.x * d1.y - dp.y * d1.x) / cross

    if (tA >= 0 && tA <= 1 && tB >= 0 && tB <= 1) {
      const intersect = p1.clone().add(d1.multiplyScalar(tA))
      return { hit: true, point: intersect, tA, tB }
    }

    return { hit: false, point: new THREE.Vector2(), tA, tB }
  }
}
