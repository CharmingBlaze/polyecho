import * as THREE from 'three'
import { ModalOperator, OperatorContext } from '../ModalOperator'
import { ScreenGeometry } from '../../geometry/ScreenGeometry'
import { KnifeKernel, type KnifePoint, type KnifeTargetType } from '../../mesh/operations/KnifeKernel'
import { perspectiveEdgeParameter, surfaceTriangles } from '../../geometry/SurfaceGeometry'
import { MeshValidator } from '../../mesh/MeshValidator'
import { adoptEditMeshUnderPointer, copyObjectMatrix } from '../adoptEditMesh'

export type { KnifePoint, KnifeTargetType }

export class KnifeOperator extends ModalOperator {
  readonly name = 'Knife'

  /** Completed independent cut chains in the current session. */
  public completedChains: KnifePoint[][] = []
  /** Current active in-progress cut chain. */
  public currentChain: KnifePoint[] = []

  /** Backwards compatibility accessor for tests and callers expecting `points`. */
  public get points(): KnifePoint[] {
    return this.currentChain
  }
  public set points(val: KnifePoint[]) {
    this.currentChain = val
  }

  public currentHoverPoint: KnifePoint | null = null
  /** Overlay-pixel cursor used for the rubber-band — stays on the pointer. */
  public cursorOverlay = new THREE.Vector2()
  public error = ''
  public axisLock: 'X' | 'Y' | 'Z' | null = null
  private lastShift = false
  private lastCtrl = false
  private redoStates: { chains: KnifePoint[][]; current: KnifePoint[] }[] = []
  public cutThrough = false
  public angleSnapping = false
  public snapAngleDegrees = 45

  /** Whether the pointer is currently hovering near the starting point of the active chain to close the loop. */
  public isLoopClosing = false

  /** Real-time measurement text for overlay (distance and angle). */
  public measurementText = ''
  public segmentLength = 0
  public segmentAngleDeg = 0

  /** Angle snapping visual guideline (start/end in overlay space). */
  public guideRay: { x1: number; y1: number; x2: number; y2: number } | null = null

  private objectWorld = new THREE.Matrix4()
  private objectInv = new THREE.Matrix4()

  begin(ctx: OperatorContext, startPointer: { x: number; y: number }) {
    super.begin(ctx, startPointer)
    this.completedChains = []
    this.currentChain = []
    this.currentHoverPoint = null
    this.isLoopClosing = false
    this.measurementText = ''
    this.guideRay = null
    copyObjectMatrix(ctx, this.objectWorld, this.objectInv)
    this.cursorOverlay.set(0, 0)
    this.cutThrough = false
    this.angleSnapping = false

    this.resolveHoverTarget({ x: startPointer.x, y: startPointer.y }, false, false)
  }

  pointerMove(event: PointerEvent) {
    this.currentMouse = { x: event.clientX, y: event.clientY }
    this.lastShift = event.shiftKey; this.lastCtrl = event.ctrlKey
    this.resolveHoverTarget(this.currentMouse, event.shiftKey, event.ctrlKey)
    this.updateStatus()
  }

  keyDown(event: KeyboardEvent): boolean {
    const key = event.key.toLowerCase()

    if (!event.ctrlKey && !event.metaKey && ['x', 'y', 'z'].includes(key)) {
      event.preventDefault()
      this.axisLock = this.axisLock === key.toUpperCase() ? null : key.toUpperCase() as 'X' | 'Y' | 'Z'
      this.resolveHoverTarget(this.currentMouse, this.lastShift, this.lastCtrl); this.updateStatus(); return true
    }
    if (this.angleSnapping && (/^[0-9.]$/.test(key) || key === 'backspace' && this.numericInput.active)) {
      event.preventDefault(); this.numericInput.handleKey(event.key)
      const degrees = this.numericInput.getValue()
      if (degrees !== null && degrees > 0 && degrees <= 180) this.setSnapAngle(degrees)
      return true
    }
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && key === 'z') {
      event.preventDefault(); this.redoPoint(); return true
    }
    if (key === 'c') {
      event.preventDefault()
      this.toggleCutThrough()
      return true
    }
    if (key === 'a') {
      event.preventDefault()
      this.toggleAngleSnap()
      return true
    }
    if (key === 'e') {
      event.preventDefault()
      this.newCut()
      return true
    }
    if (((event.ctrlKey || event.metaKey) && key === 'z') || key === 'backspace') {
      event.preventDefault()
      this.undoPoint()
      return true
    }
    if (key === 'enter' || key === ' ') {
      event.preventDefault()
      this.confirm()
      return true
    }
    if (key === 'escape') {
      event.preventDefault()
      this.cancel()
      return true
    }

    return super.keyDown(event)
  }

  handlePointerDown(button: number): boolean {
    if (button === 0) {
      this.resolveHoverTarget(this.currentMouse, this.lastShift, this.lastCtrl)
      this.redoStates = []
      if (this.isLoopClosing && this.currentChain.length >= 2) {
        // Close loop back to the first point of the active chain
        const first = this.currentChain[0]!
        this.currentChain.push({
          ...first,
          world: first.world.clone(),
          screen: first.screen.clone(),
        })
        this.newCut()
        return true
      }

      if (this.currentHoverPoint) {
        const last = this.currentChain[this.currentChain.length - 1]
        if (last && last.screen.distanceTo(this.currentHoverPoint.screen) < 1) return true
        this.currentChain.push({
          ...this.currentHoverPoint,
          world: this.currentHoverPoint.world.clone(),
          screen: this.currentHoverPoint.screen.clone(),
        })
        this.evaluate()
        this.resolveHoverTarget(this.currentMouse, this.lastShift, this.lastCtrl)
        this.updateStatus()
        return true
      }
    } else if (button === 2) {
      // End this chain and retain previous work; Esc cancels the session.
      if (this.currentChain.length) this.newCut()
      else this.cancel()
      return true
    }

    return false
  }

  /**
   * Finalize the current active cut stroke so the user can start a new cut stroke (Blender 'E' key).
   */
  newCut(): boolean {
    if (this.currentChain.length >= 2) {
      this.completedChains.push([...this.currentChain])
      this.currentChain = []
      this.evaluate()
      this.isLoopClosing = false
      this.measurementText = ''
      this.guideRay = null
      this.resolveHoverTarget(this.currentMouse, false, false)
      this.updateStatus()
      return true
    } else if (this.currentChain.length === 1) {
      this.currentChain = []
      this.isLoopClosing = false
      this.measurementText = ''
      this.guideRay = null
      this.resolveHoverTarget(this.currentMouse, false, false)
      this.updateStatus()
      return true
    }
    return false
  }

  /**
   * Undo the last placed cut point, stepping back through completed chains if needed.
   */
  undoPoint(): boolean {
    this.redoStates.push({ chains: this.completedChains.map(c => [...c]), current: [...this.currentChain] })
    if (this.currentChain.length > 0) {
      this.currentChain.pop()
      this.evaluate()
      this.resolveHoverTarget(this.currentMouse, false, false)
      this.updateStatus()
      return true
    }
    if (this.completedChains.length > 0) {
      this.currentChain = this.completedChains.pop()!
      this.evaluate()
      this.resolveHoverTarget(this.currentMouse, false, false)
      this.updateStatus()
      return true
    }
    return false
  }

  redoPoint(): boolean {
    const state = this.redoStates.pop()
    if (!state) return false
    this.completedChains = state.chains; this.currentChain = state.current
    this.evaluate(); this.resolveHoverTarget(this.currentMouse, this.lastShift, this.lastCtrl); this.updateStatus()
    return true
  }

  toggleCutThrough() {
    this.cutThrough = !this.cutThrough
    this.evaluate()
    this.resolveHoverTarget(this.currentMouse, false, false)
    this.updateStatus()
  }

  toggleAngleSnap() {
    this.angleSnapping = !this.angleSnapping
    this.numericInput.reset()
    this.resolveHoverTarget(this.currentMouse, false, false)
    this.updateStatus()
  }

  setSnapAngle(degrees: number) {
    if (!Number.isFinite(degrees) || degrees <= 0 || degrees > 180) return
    this.snapAngleDegrees = degrees
    this.angleSnapping = true
    this.resolveHoverTarget(this.currentMouse, false, false)
    this.updateStatus()
  }

  cycleAngle() {
    const presets = [30, 45, 90]
    const idx = presets.indexOf(this.snapAngleDegrees)
    if (idx === -1 || idx === presets.length - 1) {
      this.snapAngleDegrees = presets[0]!
    } else {
      this.snapAngleDegrees = presets[idx + 1]!
    }
    this.angleSnapping = true
    this.resolveHoverTarget(this.currentMouse, false, false)
    this.updateStatus()
  }

  private mappingEl() {
    return this.ctx.viewportElement
  }

  private overlayPointer(client: { x: number; y: number }) {
    const p = ScreenGeometry.pointerInView(client, this.mappingEl())
    return new THREE.Vector2(p.x, p.y)
  }

  private toWorld(local: THREE.Vector3) {
    return local.clone().applyMatrix4(this.objectWorld)
  }

  private toOverlay(local: THREE.Vector3) {
    return ScreenGeometry.worldToOverlay(
      this.toWorld(local),
      this.ctx.camera,
      this.mappingEl(),
      this.ctx.quadrant
    )
  }

  private localRayFromClient(client: { x: number; y: number }) {
    const worldRay = ScreenGeometry.rayFromClient(client, this.ctx.camera, this.mappingEl(), this.ctx.quadrant)
    const origin = worldRay.origin.clone().applyMatrix4(this.objectInv)
    const dir = worldRay.direction.clone().transformDirection(this.objectInv).normalize()
    return new THREE.Ray(origin, dir)
  }

  private viewportRect() {
    return ScreenGeometry.overlayRect(this.mappingEl())
  }

  relayout() {
    for (const point of [...this.completedChains.flat(), ...this.currentChain]) point.screen.copy(this.toOverlay(point.world))
    this.resolveHoverTarget(this.currentMouse, this.lastShift, this.lastCtrl)
    this.ctx.onUpdatePreview()
  }

  /**
   * Check if a 3D point on the mesh is occluded by front-facing geometry.
   */
  private isOccluded(localPoint: THREE.Vector3): boolean {
    if (this.cutThrough) return false
    const world = this.toWorld(localPoint), ndc = world.clone().project(this.ctx.camera)
    if (ndc.z < -1 || ndc.z > 1) return true
    const caster = new THREE.Raycaster()
    caster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), this.ctx.camera)
    const ray = caster.ray.clone().applyMatrix4(this.objectInv)
    const distance = ray.origin.distanceTo(localPoint)
    const targetDist = distance - Math.max(1e-6, distance * 1e-6)
    const cull = false

    for (const [, face] of this.ctx.mesh.faces) {
      const ids = face.vertexIds
      if (ids.length < 3) continue
      const p0 = this.ctx.mesh.vertices.get(ids[0])?.position
      if (!p0) continue
      const positions = ids.map(id => this.ctx.mesh.vertices.get(id)!.position)
      for (const [a, b, c] of surfaceTriangles(positions)) {
        const p0 = positions[a], p1 = positions[b], p2 = positions[c]
        const hit = ray.intersectTriangle(p0, p1, p2, cull, new THREE.Vector3())
        if (hit) {
          const hitDist = ray.origin.distanceTo(hit)
          if (hitDist < targetDist) return true
        }
      }
    }
    return false
  }

  private resolveHoverTarget(mousePos: { x: number; y: number }, shiftKey: boolean, ctrlKey: boolean) {
    if (this.currentChain.length === 0 && this.completedChains.length === 0) {
      if (adoptEditMeshUnderPointer(this.ctx, mousePos, { vertexPx: 8, edgePx: 28 })) {
        copyObjectMatrix(this.ctx, this.objectWorld, this.objectInv)
        this.initialSnapshot = this.ctx.mesh.createSnapshot()
      }
    }

    if (!ScreenGeometry.isInPane(mousePos, this.mappingEl(), this.ctx.quadrant)) { this.currentHoverPoint = null; return }
    for (const point of [...this.completedChains.flat(), ...this.currentChain]) point.screen.copy(this.toOverlay(point.world))
    let overlay = this.overlayPointer(mousePos)
    const last = this.currentChain[this.currentChain.length - 1]
    this.guideRay = null

    if (this.axisLock && last) {
      const direction = new THREE.Vector3(this.axisLock === 'X' ? 1 : 0, this.axisLock === 'Y' ? 1 : 0, this.axisLock === 'Z' ? 1 : 0)
      const tip = ScreenGeometry.worldToOverlay(this.toWorld(last.world).add(direction), this.ctx.camera, this.mappingEl(), this.ctx.quadrant)
      const delta = tip.sub(last.screen).normalize()
      overlay = last.screen.clone().addScaledVector(delta, overlay.clone().sub(last.screen).dot(delta))
    } else if (this.angleSnapping && last) {
      overlay = KnifeKernel.snapScreenToAngle(last.screen, overlay, this.snapAngleDegrees)
      // Compute guide ray projection across the viewport
      const dir = overlay.clone().sub(last.screen).normalize()
      if (dir.lengthSq() > 0.5) {
        this.guideRay = {
          x1: last.screen.x - dir.x * 2000,
          y1: last.screen.y - dir.y * 2000,
          x2: last.screen.x + dir.x * 2000,
          y2: last.screen.y + dir.y * 2000,
        }
      }
    }
    this.cursorOverlay.copy(overlay)

    // Check loop closure: hovering near the first point of the active chain
    this.isLoopClosing = false
    if (this.currentChain.length >= 3) {
      const first = this.currentChain[0]!
      if (overlay.distanceTo(first.screen) <= 12) {
        this.isLoopClosing = true
        this.currentHoverPoint = {
          ...first,
          world: first.world.clone(),
          screen: first.screen.clone(),
        }
        this.cursorOverlay.copy(first.screen)
        this.computeMeasurements(first.world, first.screen)
        return
      }
    }

    // Blender Modifier Conventions:
    // Ctrl: Ignore snapping (free cut on face)
    // Shift: Snap to edge midpoint
    const ignoreSnapping = ctrlKey
    const forceMidpoint = shiftKey

    const VERTEX_PX = 8
    const EDGE_PX = 9
    const constraintDirection = last && (this.axisLock || this.angleSnapping) ? overlay.clone().sub(last.screen).normalize() : null
    const onConstraint = (point: THREE.Vector2) => !constraintDirection || !last || Math.abs(point.clone().sub(last.screen).cross(constraintDirection)) < 0.5

    if (!ignoreSnapping) {
      // 1. Check Vertex Snapping (unless forceMidpoint is held)
      if (!forceMidpoint) {
        let bestVert: { id: number; dist: number; overlay: THREE.Vector2; world: THREE.Vector3 } | null = null
        for (const [vId, v] of this.ctx.mesh.vertices) {
          const s = this.toOverlay(v.position)
          const dist = overlay.distanceTo(s)
          if (onConstraint(s) && dist <= VERTEX_PX && (!bestVert || dist < bestVert.dist)) {
            // Check occlusion
            if (!this.isOccluded(v.position)) {
              bestVert = { id: vId, dist, overlay: s, world: v.position.clone() }
            }
          }
        }
        if (bestVert) {
          this.currentHoverPoint = {
            world: bestVert.world,
            screen: bestVert.overlay,
            targetType: 'VERTEX',
            vertexId: bestVert.id,
          }
          this.cursorOverlay.copy(bestVert.overlay)
          this.computeMeasurements(bestVert.world, bestVert.overlay)
          return
        }
      }

      // 2. Check Edge Snapping
      let bestEdge: {
        id: number
        dist: number
        t: number
        midpoint: boolean
        world: THREE.Vector3
        overlay: THREE.Vector2
      } | null = null

      for (const [eId, edge] of this.ctx.mesh.edges) {
        const p1 = this.ctx.mesh.vertices.get(edge.v1)?.position
        const p2 = this.ctx.mesh.vertices.get(edge.v2)?.position
        if (!p1 || !p2) continue
        const s1 = this.toOverlay(p1)
        const s2 = this.toOverlay(p2)
        let { distance, t } = ScreenGeometry.distancePointToSegment2D(overlay, s1, s2)
        if (constraintDirection && last) {
          const crossing = ScreenGeometry.intersectSegments2D(last.screen.clone().addScaledVector(constraintDirection, -100000), last.screen.clone().addScaledVector(constraintDirection, 100000), s1, s2)
          if (!crossing.hit) continue
          t = crossing.tB; distance = crossing.point.distanceTo(overlay)
        }
        if (distance > EDGE_PX) continue
        if (bestEdge && distance >= bestEdge.dist) continue

        const midpoint = (forceMidpoint || Math.abs(t - 0.5) < 0.08) && onConstraint(this.toOverlay(p1.clone().lerp(p2, 0.5)))
        const finalT = midpoint ? 0.5 : perspectiveEdgeParameter(t, this.toWorld(p1), this.toWorld(p2), this.ctx.camera)
        const worldPos = p1.clone().lerp(p2, finalT)

        if (!this.isOccluded(worldPos)) {
          bestEdge = {
            id: eId,
            dist: distance,
            t: finalT,
            midpoint,
            world: worldPos,
            overlay: this.toOverlay(worldPos),
          }
        }
      }

      if (bestEdge) {
        this.currentHoverPoint = {
          world: bestEdge.world,
          screen: bestEdge.overlay,
          targetType: bestEdge.midpoint ? 'MIDPOINT' : 'EDGE',
          edgeId: bestEdge.id,
          edgeT: bestEdge.t,
        }
        this.cursorOverlay.copy(bestEdge.overlay)
        this.computeMeasurements(bestEdge.world, bestEdge.overlay)
        return
      }
    }

    // 3. Face Intersections
    const ray = this.localRayFromClient(mousePos)
    if ((this.angleSnapping || this.axisLock) && last) {
      const snappedClient = { x: mousePos.x, y: mousePos.y }
      const el = this.mappingEl()
      const view = ScreenGeometry.viewSize(el)
      const r = el.getBoundingClientRect()
      if (r.width >= 1 && r.height >= 1) {
        snappedClient.x = r.left + (overlay.x / view.width) * r.width
        snappedClient.y = r.top + (overlay.y / view.height) * r.height
      }
      const snappedRay = this.localRayFromClient(snappedClient)
      ray.origin.copy(snappedRay.origin)
      ray.direction.copy(snappedRay.direction)
    }

    let closestDist = Infinity
    let hitFaceId: number | null = null
    let hitPoint: THREE.Vector3 | null = null
    const cull = !this.cutThrough && this.objectWorld.determinant() >= 0

    for (const [fId, face] of this.ctx.mesh.faces) {
      const ids = face.vertexIds
      if (ids.length < 3) continue
      const p0 = this.ctx.mesh.vertices.get(ids[0])?.position
      if (!p0) continue
      const positions = ids.map(id => this.ctx.mesh.vertices.get(id)!.position)
      for (const [a, b, c] of surfaceTriangles(positions)) {
        const p0 = positions[a], p1 = positions[b], p2 = positions[c]
        const hit = ray.intersectTriangle(p0, p1, p2, cull, new THREE.Vector3())
        if (!hit) continue
        const d = ray.origin.distanceTo(hit)
        if (d < closestDist) {
          closestDist = d
          hitFaceId = fId
          hitPoint = hit
        }
      }
    }

    if (hitPoint && hitFaceId !== null) {
      this.currentHoverPoint = {
        world: hitPoint,
        screen: overlay.clone(),
        targetType: 'FACE',
        faceId: hitFaceId,
      }
      this.computeMeasurements(hitPoint, overlay)
      return
    }

    // 4. Background Work Plane fallback
    const worldRay = ray.clone().applyMatrix4(this.objectWorld)
    const planeHit = worldRay.intersectPlane(
      new THREE.Plane().setFromNormalAndCoplanarPoint(
        this.ctx.camera.getWorldDirection(new THREE.Vector3()).negate(),
        this.pivot
      ),
      new THREE.Vector3()
    )
    if (planeHit) {
      const localPlaneHit = planeHit.clone().applyMatrix4(this.objectInv)
      this.currentHoverPoint = {
        world: localPlaneHit,
        screen: overlay.clone(),
        targetType: 'FACE',
        background: true,
      }
      this.computeMeasurements(localPlaneHit, overlay)
    } else {
      this.currentHoverPoint = null
      this.measurementText = ''
    }
  }

  /**
   * Calculate live segment length and angle relative to the previous point.
   */
  private computeMeasurements(curWorld: THREE.Vector3, curScreen: THREE.Vector2) {
    const last = this.currentChain[this.currentChain.length - 1]
    if (!last) {
      this.measurementText = ''
      this.segmentLength = 0
      this.segmentAngleDeg = 0
      return
    }

    const worldP1 = this.toWorld(last.world)
    const worldP2 = this.toWorld(curWorld)
    const len3D = worldP1.distanceTo(worldP2)
    this.segmentLength = len3D

    const dx = curScreen.x - last.screen.x
    const dy = curScreen.y - last.screen.y
    let angleDeg = Math.atan2(-dy, dx) * (180 / Math.PI)
    if (angleDeg < 0) angleDeg += 360
    this.segmentAngleDeg = angleDeg

    const lenStr = len3D < 10 ? len3D.toFixed(3) : len3D.toFixed(2)
    this.measurementText = `${lenStr}m · ${angleDeg.toFixed(1)}°`
  }

  evaluate() {
    this.restoreSnapshot()
    this.error = ''
    const chains = [...this.completedChains, this.currentChain].filter(c => c.length >= 2)
    if (chains.length) {
      // Resolve against world positions; ids from a previous preview may have changed.
      const normalized = chains.map(chain => chain.map(p => ({ ...p, targetType: 'FACE' as const, vertexId: undefined, edgeId: undefined, faceId: undefined })))
      KnifeKernel.applyCuts(this.ctx.mesh, normalized, { cutThrough: this.cutThrough, camera: this.ctx.camera,
        viewportRect: this.viewportRect(), quadrant: this.ctx.quadrant, objectMatrix: this.objectWorld })
      if (!MeshValidator.validate(this.ctx.mesh).valid) {
        this.restoreSnapshot(); this.error = 'This cut would create invalid faces. Undo the last point and adjust the cut.'
      }
    }
    this.ctx.onUpdatePreview()
  }

  confirm() {
    this.evaluate()
    if (this.error || (this.ctx.mesh.faces.size === this.initialSnapshot.faces.length && this.ctx.mesh.vertices.size === this.initialSnapshot.vertices.length)) { this.cancel(); return }
    const edgeKey = (a: number, b: number) => `${Math.min(a,b)}:${Math.max(a,b)}`
    const originalEdges = new Set(this.initialSnapshot.edges.map(e => edgeKey(e.v1,e.v2)))
    const newEdges = [...this.ctx.mesh.edges.values()].filter(e => !originalEdges.has(edgeKey(e.v1,e.v2)))
    this.ctx.selectedVertIds = [...new Set(newEdges.flatMap(e => [e.v1,e.v2]))]
    this.ctx.selectedEdgeIds = newEdges.map(e => e.id)
    this.ctx.selectedFaceIds = []
    super.confirm()
  }

  cancel() {
    this.completedChains = []
    this.currentChain = []
    this.currentHoverPoint = null
    this.isLoopClosing = false
    this.guideRay = null
    this.measurementText = ''
    super.cancel()
  }

  updateStatus() {
    const cut = this.cutThrough ? 'ON' : 'off'
    const ang = this.angleSnapping ? `${this.snapAngleDegrees}°` : 'off'
    const chainInfo = this.completedChains.length > 0 ? ` [${this.completedChains.length} cuts]` : ''
    this.statusText = this.error || `Knife${chainInfo} | Pts: ${this.currentChain.length} | E New Cut | A Angle: ${ang} | C Cut-thru: ${cut} | Ctrl Free · Shift Midpoint | Axis: ${this.axisLock ?? "off"} | X/Y/Z Lock | LMB Add · Enter Confirm · RMB End Stroke`
  }
}
