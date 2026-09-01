import * as THREE from 'three'

export type ViewQuadrant =
  | 'main'
  | 'top_left'
  | 'top_right'
  | 'bottom_left'
  | 'bottom_right'
  | 'col_front'
  | 'col_side'
  | 'col_persp'

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
  static blockoutFrontFrac = 1 / 3
  static blockoutSideFrac = 1 / 3

  static tripleCols(total: number) {
    let front = Math.max(1, Math.round(total * ScreenGeometry.blockoutFrontFrac))
    let side = Math.max(1, Math.round(total * ScreenGeometry.blockoutSideFrac))
    let persp = total - front - side
    if (persp < 1) {
      persp = 1
      side = Math.max(1, total - front - persp)
    }
    return { front, side, persp, xSide: front, xPersp: front + side }
  }

  /**
   * Projects a 3D world position into 2D viewport pixel coordinates.
   */
  static worldToScreen(
    worldPos: THREE.Vector3,
    camera: THREE.Camera,
    viewportRect: DOMRect | { left: number; top: number; width: number; height: number },
    quadrant?: ViewQuadrant
  ): THREE.Vector2 {
    const pane = ScreenGeometry.paneRect(viewportRect, quadrant)
    const proj = worldPos.clone().project(camera)
    const x = (proj.x * 0.5 + 0.5) * pane.width + pane.left
    const y = (-(proj.y * 0.5) + 0.5) * pane.height + pane.top
    return new THREE.Vector2(x, y)
  }

  /**
   * Casts a 2D viewport screen coordinate into a normalized 3D ray.
   */
  static screenToRay(
    screenPos: ScreenPoint,
    camera: THREE.Camera,
    viewportRect: DOMRect | { left: number; top: number; width: number; height: number },
    quadrant?: ViewQuadrant
  ): THREE.Ray {
    const pane = ScreenGeometry.paneRect(viewportRect, quadrant)

    const ndcX = ((screenPos.x - pane.left) / pane.width) * 2 - 1
    const ndcY = -((screenPos.y - pane.top) / pane.height) * 2 + 1
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera)
    return raycaster.ray
  }

  static paneRect(
    viewportRect: DOMRect | { left: number; top: number; width: number; height: number },
    quadrant?: ViewQuadrant
  ): { left: number; top: number; width: number; height: number } {
    const left = viewportRect.left
    const top = viewportRect.top
    const width = viewportRect.width
    const height = viewportRect.height

    if (quadrant === 'col_front' || quadrant === 'col_side' || quadrant === 'col_persp') {
      const cols = ScreenGeometry.tripleCols(width)
      if (quadrant === 'col_front') return { left, top, width: cols.front, height }
      if (quadrant === 'col_side') return { left: left + cols.xSide, top, width: cols.side, height }
      return { left: left + cols.xPersp, top, width: cols.persp, height }
    }
    if (quadrant === 'top_left') {
      return { left, top, width: width / 2, height: height / 2 }
    }
    if (quadrant === 'top_right') {
      return { left: left + width / 2, top, width: width / 2, height: height / 2 }
    }
    if (quadrant === 'bottom_left') {
      return { left, top: top + height / 2, width: width / 2, height: height / 2 }
    }
    if (quadrant === 'bottom_right') {
      return { left: left + width / 2, top: top + height / 2, width: width / 2, height: height / 2 }
    }
    return { left, top, width, height }
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
