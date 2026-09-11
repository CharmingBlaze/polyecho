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
  static blockoutMaximized: 'none' | 'front' | 'side' | 'persp' = 'none'
  static blockoutFrontCollapsed = false
  static blockoutSideCollapsed = false
  static blockoutPerspCollapsed = false
  /** Restore-strip width for a minimized Blockout pane (chrome only, no 3D). */
  static COLLAPSED_PX = 40

  static tripleCols(total: number) {
    const max = ScreenGeometry.blockoutMaximized
    if (max === 'front') return { front: total, side: 0, persp: 0, xSide: total, xPersp: total }
    if (max === 'side') return { front: 0, side: total, persp: 0, xSide: 0, xPersp: total }
    if (max === 'persp') return { front: 0, side: 0, persp: total, xSide: 0, xPersp: 0 }

    const fc = ScreenGeometry.blockoutFrontCollapsed
    const sc = ScreenGeometry.blockoutSideCollapsed
    const pc = ScreenGeometry.blockoutPerspCollapsed
    if (fc || sc || pc) {
      return ScreenGeometry.collapsedTripleCols(total, fc, sc, pc)
    }

    const f = Math.max(0, ScreenGeometry.blockoutFrontFrac)
    const s = Math.max(0, ScreenGeometry.blockoutSideFrac)
    const p = Math.max(0, 1 - f - s)
    if (f >= 0.995) return { front: total, side: 0, persp: 0, xSide: total, xPersp: total }
    if (s >= 0.995) return { front: 0, side: total, persp: 0, xSide: 0, xPersp: total }
    if (p >= 0.995) return { front: 0, side: 0, persp: total, xSide: 0, xPersp: 0 }

    let front = Math.max(0, Math.round(total * f))
    let side = Math.max(0, Math.round(total * s))
    let persp = total - front - side
    if (persp < 0) {
      persp = 0
      side = Math.max(0, total - front)
    }
    return { front, side, persp, xSide: front, xPersp: front + side }
  }

  private static collapsedTripleCols(
    total: number,
    fc: boolean,
    sc: boolean,
    pc: boolean
  ) {
    const strip = Math.min(ScreenGeometry.COLLAPSED_PX, Math.max(28, Math.floor(total / 12)))
    const nCollapsed = (fc ? 1 : 0) + (sc ? 1 : 0) + (pc ? 1 : 0)
    const rest = Math.max(0, total - nCollapsed * strip)
    const f = Math.max(0, ScreenGeometry.blockoutFrontFrac)
    const s = Math.max(0, ScreenGeometry.blockoutSideFrac)
    const p = Math.max(0, 1 - f - s)
    const wf = fc ? 0 : Math.max(f, 1e-6)
    const ws = sc ? 0 : Math.max(s, 1e-6)
    const wp = pc ? 0 : Math.max(p, 1e-6)
    const open = wf + ws + wp || 1

    const shares: { key: 'front' | 'side' | 'persp'; w: number }[] = []
    if (!fc) shares.push({ key: 'front', w: wf })
    if (!sc) shares.push({ key: 'side', w: ws })
    if (!pc) shares.push({ key: 'persp', w: wp })

    let front = fc ? strip : 0
    let side = sc ? strip : 0
    let persp = pc ? strip : 0
    let used = 0
    shares.forEach((share, i) => {
      const px = i === shares.length - 1 ? rest - used : Math.round(rest * (share.w / open))
      used += px
      if (share.key === 'front') front = px
      else if (share.key === 'side') side = px
      else persp = px
    })
    return { front, side, persp, xSide: front, xPersp: front + side }
  }

  /**
   * CSS pixel size used by `renderer.setSize` / `setViewport`.
   * Prefer this over `getBoundingClientRect().width` — browser zoom and
   * subpixels make those differ, which throws Poly Draw / Poly Build off.
   */
  static viewSize(el: HTMLElement): { width: number; height: number } {
    const r = el.getBoundingClientRect()
    return {
      width: el.clientWidth || Math.max(1, r.width),
      height: el.clientHeight || Math.max(1, r.height)
    }
  }

  /**
   * Window-space pointer → same pixel space as `viewSize` / WebGL viewports.
   */
  static pointerInView(client: ScreenPoint, el: HTMLElement): ScreenPoint {
    const r = el.getBoundingClientRect()
    const { width, height } = ScreenGeometry.viewSize(el)
    if (r.width < 1 || r.height < 1) return { x: 0, y: 0 }
    return {
      x: ((client.x - r.left) / r.width) * width,
      y: ((client.y - r.top) / r.height) * height
    }
  }

  static overlayRect(el: HTMLElement): { left: number; top: number; width: number; height: number } {
    const { width, height } = ScreenGeometry.viewSize(el)
    return { left: 0, top: 0, width, height }
  }

  static rayFromClient(
    client: ScreenPoint,
    camera: THREE.Camera,
    el: HTMLElement,
    quadrant?: ViewQuadrant
  ): THREE.Ray {
    return ScreenGeometry.screenToRay(
      ScreenGeometry.pointerInView(client, el),
      camera,
      ScreenGeometry.overlayRect(el),
      quadrant
    )
  }

  static worldToOverlay(
    worldPos: THREE.Vector3,
    camera: THREE.Camera,
    el: HTMLElement,
    quadrant?: ViewQuadrant
  ): THREE.Vector2 {
    return ScreenGeometry.worldToScreen(worldPos, camera, ScreenGeometry.overlayRect(el), quadrant)
  }

  static isInPane(client: ScreenPoint, el: HTMLElement, quadrant?: ViewQuadrant): boolean {
    const p = ScreenGeometry.pointerInView(client, el)
    const pane = ScreenGeometry.paneRect(ScreenGeometry.overlayRect(el), quadrant)
    if (pane.width < 2 || pane.height < 2) return true
    return (
      p.x >= pane.left &&
      p.x <= pane.left + pane.width &&
      p.y >= pane.top &&
      p.y <= pane.top + pane.height
    )
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
      const pane =
        quadrant === 'col_front' ? { left, top, width: cols.front, height }
        : quadrant === 'col_side' ? { left: left + cols.xSide, top, width: cols.side, height }
        : { left: left + cols.xPersp, top, width: cols.persp, height }
      // Maximized (or collapsed) panes can report 0 width for the hidden columns.
      // A zero-width NDC divide puts Poly Draw / placement off the cursor.
      if (pane.width < 2) return { left, top, width, height }
      return pane
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

  /** World-space dashed rubber-band for Poly Draw / Poly Build. */
  static dashedPreviewLine(positions: number[], color: number): THREE.LineSegments {
    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    const mat = new THREE.LineDashedMaterial({
      color,
      dashSize: 0.07,
      gapSize: 0.045,
      depthTest: false
    })
    const line = new THREE.LineSegments(geom, mat)
    line.computeLineDistances()
    line.renderOrder = 80
    line.userData.ignorePick = true
    return line
  }
}
