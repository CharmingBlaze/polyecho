import * as THREE from 'three'
import { ModalOperator } from './ModalOperator'
import { ScreenGeometry, type ViewQuadrant } from '../geometry/ScreenGeometry'
import { PolyDrawKernel, DrawPlane, DrawViewKind } from '../mesh/operations/PolyDrawKernel'

interface BuildPoint {
  vertId: number
  isNew: boolean
}

export type PolyBuildHoverKind = 'none' | 'new' | 'existing' | 'close'

const SNAP_PX = 28

export class PolyBuildOperator extends ModalOperator {
  readonly name = 'Poly Build'

  public chain: BuildPoint[] = []
  public screenPoints: THREE.Vector2[] = []
  public hoverScreen: THREE.Vector2 | null = null
  public hoverSnapped = false
  public hoverKind: PolyBuildHoverKind = 'none'
  public canClose = false
  public canFill = false
  public facesMade = 0
  public continueStrip = false
  public previewFaceScreen: THREE.Vector2[] = []
  private lastFaceId: number | null = null

  private plane!: DrawPlane
  private planeLock: DrawViewKind | null = null
  private drawPlaneLocked = false
  private perspMode: 'view' | 'ground' = 'view'
  public hoverWorld: THREE.Vector3 | null = null
  private hoverExistingId: number | null = null
  private previewLine: THREE.Line | null = null
  private previewFill: THREE.Mesh | null = null
  private mapCamera: THREE.Camera | null = null
  private mapQuadrant: ViewQuadrant | undefined
  private sketchMapLocked = false

  begin(ctx: any, startPointer: { x: number; y: number }) {
    super.begin(ctx, startPointer)
    this.chain = []
    this.facesMade = 0
    this.lastFaceId = null
    this.planeLock = null
    this.drawPlaneLocked = false
    this.perspMode = 'view'
    this.sketchMapLocked = false
    this.syncMapping()
    this.seedFromSelection()
    this.resolvePlane()
    this.updateHover(startPointer)
    this.updatePreview()
    this.updateStatus()
  }

  evaluate() {}

  pointerMove(event: PointerEvent) {
    this.currentMouse = { x: event.clientX, y: event.clientY }
    this.isShiftHeld = event.shiftKey
    this.isCtrlHeld = event.ctrlKey
    if (!this.drawPlaneLocked) this.resolvePlane()
    this.syncMapping()
    this.updateHover(this.currentMouse)
    this.updatePreview()
    this.updateStatus()
  }

  relayout() {
    this.updateHover(this.currentMouse)
    this.updatePreview()
    this.updateStatus()
  }

  mappingCamera(): THREE.Camera {
    return this.mapCamera ?? this.ctx.camera
  }

  mappingQuadrant(): ViewQuadrant | undefined {
    return this.mapQuadrant ?? this.ctx.quadrant
  }

  private syncMapping() {
    if (this.sketchMapLocked) return
    this.mapCamera = this.ctx.camera
    this.mapQuadrant = this.ctx.quadrant
    if (this.chain.length > 0) this.sketchMapLocked = true
  }

  handlePointerDown(button: number): boolean {
    if (button === 2) {
      if (this.chain.length > 0) {
        this.undoLast()
        return true
      }
      return false
    }
    if (button !== 0) return false
    if (!this.drawPlaneLocked) this.resolvePlane()
    this.updateHover(this.currentMouse)
    this.placePoint()
    return true
  }

  keyDown(event: KeyboardEvent): boolean {
    const key = event.key.toLowerCase()
    if (event.ctrlKey && key === 'z') {
      event.preventDefault()
      this.undoLast()
      return true
    }
    if (key === 'backspace') {
      event.preventDefault()
      this.undoLast()
      return true
    }
    if (key === 'f' || key === 'c') {
      if (!event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault()
        if (this.tryFillCurrent()) {
          this.ctx.onUpdatePreview()
          this.resolvePlane()
          this.updateHover(this.currentMouse)
          this.updatePreview()
          this.updateStatus()
        }
        return true
      }
    }
    if (key === 'tab' || key === 'r') {
      event.preventDefault()
      this.reverseStrip()
      return true
    }
    if (key === 'enter' || key === ' ') {
      event.preventDefault()
      if (this.tryFillCurrent()) {
        this.ctx.onUpdatePreview()
        this.resolvePlane()
        this.updateHover(this.currentMouse)
        this.updatePreview()
        this.updateStatus()
        return true
      }
      if (this.chain.length >= 3) {
        this.updateStatus()
        return true
      }
      this.confirm()
      return true
    }
    if (key === 'n' && this.chain.length === 0) {
      event.preventDefault()
      if (this.ctx.viewportKind === 'persp' && !this.planeLock) {
        this.perspMode = this.perspMode === 'view' ? 'ground' : 'view'
      }
      this.drawPlaneLocked = false
      this.resolvePlane()
      this.updateHover(this.currentMouse)
      this.updateStatus()
      return true
    }
    if (this.chain.length === 0) {
      if (key === '1') {
        this.planeLock = 'front'
        this.resolvePlane()
        this.updateHover(this.currentMouse)
        this.updateStatus()
        return true
      }
      if (key === '3') {
        this.planeLock = 'right'
        this.resolvePlane()
        this.updateHover(this.currentMouse)
        this.updateStatus()
        return true
      }
      if (key === '7') {
        this.planeLock = 'top'
        this.resolvePlane()
        this.updateHover(this.currentMouse)
        this.updateStatus()
        return true
      }
    }
    if (key === 'x' || key === 'y' || key === 'z') return true
    return super.keyDown(event)
  }

  confirm() {
    this.tryFillCurrent()
    this.disposePreview()
    if (this.ctx.mesh.vertices.size === 0) {
      this.ctx.onCancel()
      return
    }
    this.ctx.onCommit(this.name)
  }

  cancel() {
    this.disposePreview()
    this.restoreSnapshot()
    this.ctx.onCancel()
  }

  updateStatus() {
    const n = this.chain.length
    if (n >= 3) {
      const plan = PolyDrawKernel.planExistingLoop(this.ctx.mesh, this.uniqueChainIds())
      if (plan.error) {
        this.statusText = `${plan.error} · RMB undo · Tab reverse`
        return
      }
      const quads = plan.loops.filter(loop => loop.length === 4).length
      this.statusText = `${quads} quads / ${plan.loops.length - quads} tris · click first / Enter / F to fill · ${this.continueStrip ? 'Continue strip on' : 'Tab reverse'} · ${this.facesMade} faces made`
      return
    }
    if (n === 0) {
      this.statusText = this.hoverKind === 'existing'
        ? 'Start on this vert · or click empty space · two selected verts seed an edge'
        : 'New vert on empty · reuse an old vert · hover a face to draw on it · 1/3/7 lock · N view/ground · MMB orbit'
      return
    }
    const kind = this.hoverKind === 'existing' ? 'on existing vert' : 'new vert'
    if (n === 1) {
      this.statusText = `Started · ${kind} · next point · RMB undo · Tab later reverses the strip`
      return
    }
    if (n === 2) {
      this.statusText = this.facesMade > 0
        ? `Open edge kept · ${kind} · click empty on either side · click the other vert / Tab walks around`
        : `Edge · ${kind} · third = tri · fourth = quad · click the other vert to swap ends`
      return
    }
  }

  fillFromHud(): boolean {
    const ok = this.tryFillCurrent()
    this.ctx.onUpdatePreview()
    this.resolvePlane()
    this.updateHover(this.currentMouse)
    this.updatePreview()
    this.updateStatus()
    return ok
  }

  get canReverse(): boolean {
    return this.chain.length >= 2
  }

  reverseFromHud() {
    this.reverseStrip()
  }

  get chainWorld(): THREE.Vector3[] {
    const out: THREE.Vector3[] = []
    for (const p of this.chain) {
      const w = this.vertWorld(p.vertId)
      if (w) out.push(w)
    }
    return out
  }

  reverseStrip() {
    if (this.chain.length === 2) {
      const prev = this.chain[0].vertId
      const tip = this.chain[1].vertId
      const other = this.otherBoundaryVert(tip, prev)
      if (other != null) {
        this.chain = [{ vertId: tip, isNew: false }, { vertId: other, isNew: false }]
        this.afterChainEdit()
        return
      }
    }
    if (this.chain.length < 2) return
    this.chain.reverse()
    this.afterChainEdit()
  }

  private pivotFromStart() {
    if (this.chain.length !== 2) return
    const start = this.chain[0].vertId
    const tip = this.chain[1].vertId
    const other = this.otherBoundaryVert(start, tip)
    this.chain = other != null
      ? [{ vertId: start, isNew: false }, { vertId: other, isNew: false }]
      : [this.chain[1], this.chain[0]]
    this.afterChainEdit()
  }

  private afterChainEdit() {
    this.updateHover(this.currentMouse)
    this.updatePreview()
    this.updateStatus()
  }

  private otherBoundaryVert(at: number, awayFrom: number): number | null {
    const v = this.ctx.mesh.vertices.get(at)
    if (!v) return null
    const prefer = this.lastFaceId
    const faceIds = prefer != null && v.faceIds.includes(prefer)
      ? [prefer, ...v.faceIds.filter((id: number) => id !== prefer)]
      : v.faceIds
    for (const fId of faceIds) {
      const face = this.ctx.mesh.faces.get(fId)
      if (!face) continue
      const ids = face.vertexIds
      const i = ids.indexOf(at)
      if (i < 0 || !ids.includes(awayFrom)) continue
      const n = ids.length
      const left = ids[(i + n - 1) % n]
      const right = ids[(i + 1) % n]
      const candidate = left === awayFrom ? right : right === awayFrom ? left : null
      if (candidate != null && v.edgeIds.some(id => {
        const edge = this.ctx.mesh.edges.get(id)
        return edge && edge.faceIds.length === 1 && (edge.v1 === candidate || edge.v2 === candidate)
      })) return candidate
    }
    return null
  }

  private seedFromSelection() {
    if (this.ctx.isObjectMode) return
    const sel = this.ctx.selectedVertIds.filter(id => this.ctx.mesh.vertices.has(id))
    if (sel.length < 1 || sel.length > 2) return
    if (sel.length === 1) {
      this.chain = [{ vertId: sel[0], isNew: false }]
      this.syncMapping()
      this.sketchMapLocked = true
      const faceId = this.bestFaceTowardCamera(sel[0])
      if (faceId != null) {
        this.lastFaceId = faceId
        this.lockPlaneToLastFace()
        return
      }
    } else {
      this.chain = [
        { vertId: sel[sel.length - 2], isNew: false },
        { vertId: sel[sel.length - 1], isNew: false }
      ]
    }
    this.drawPlaneLocked = true
    this.syncMapping()
    this.sketchMapLocked = true
    const origin = this.vertWorld(this.chain[0].vertId)
    const shared = this.chain.length === 2 ? this.sharedFaceId(this.chain[0].vertId, this.chain[1].vertId) : null
    if (shared != null && origin) {
      this.lastFaceId = shared
      this.lockPlaneToLastFace()
      return
    }
    const view = this.viewAlignedPlane(origin ?? undefined)
    if (origin) {
      this.plane = {
        origin: origin.clone(),
        normal: view.normal.clone(),
        axisU: view.axisU.clone(),
        axisV: view.axisV.clone()
      }
    }
  }

  private placePoint() {
    if (this.hoverKind === 'close' && this.canClose) {
      this.tryFillCurrent()
      this.ctx.onUpdatePreview()
      this.resolvePlane()
      this.updateHover(this.currentMouse)
      this.updatePreview()
      this.updateStatus()
      return
    }

    const lastId = this.chain[this.chain.length - 1]?.vertId
    const firstId = this.chain[0]?.vertId
    let placedId: number | null = null
    let isNew = false

    if (this.hoverExistingId != null) {
      if (this.hoverExistingId === lastId) return
      if (this.canClose && this.hoverExistingId === firstId) {
        this.tryFillCurrent()
        this.ctx.onUpdatePreview()
        this.resolvePlane()
        this.updateHover(this.currentMouse)
        this.updatePreview()
        this.updateStatus()
        return
      }
      if (this.chain.length === 2 && this.hoverExistingId === firstId) {
        this.pivotFromStart()
        return
      }
      if (this.chain.some(p => p.vertId === this.hoverExistingId)) return
      placedId = this.hoverExistingId
      isNew = false
    } else if (this.hoverWorld) {
      const skip = new Set(this.chain.map(p => p.vertId))
      const near = this.findExistingNearWorld(this.hoverWorld, skip)
      if (near != null && near !== lastId) {
        placedId = near
        isNew = false
      } else {
        const local = this.hoverWorld.clone().applyMatrix4(this.worldToLocal)
        const v = this.ctx.mesh.addVertex(local)
        placedId = v.id
        isNew = true
      }
    }

    if (placedId == null) return
    this.chain.push({ vertId: placedId, isNew })
    this.drawPlaneLocked = true
    this.syncMapping()
    this.sketchMapLocked = true
    if (this.chain.length === 1 && !isNew) {
      const faceId = this.bestFaceTowardCamera(placedId)
      if (faceId != null) {
        this.lastFaceId = faceId
        this.lockPlaneToLastFace()
      }
    }

    this.ctx.onUpdatePreview()
    this.resolvePlane()
    this.updateHover(this.currentMouse)
    this.updatePreview()
    this.updateStatus()
  }

  private uniqueChainIds(): number[] {
    const unique: number[] = []
    for (const p of this.chain) {
      if (!unique.includes(p.vertId)) unique.push(p.vertId)
    }
    return unique
  }

  private loopIsFillable(ids?: number[]): boolean {
    return PolyDrawKernel.planExistingLoop(this.ctx.mesh, ids ?? this.uniqueChainIds()).error === null
  }

  private tryFillCurrent(): boolean {
    const unique = this.uniqueChainIds()
    if (!this.loopIsFillable(unique)) return false

    const worlds: THREE.Vector3[] = []
    for (const id of unique) {
      const w = this.vertWorld(id)
      if (!w) return false
      worlds.push(w)
    }
    const n = PolyDrawKernel.newellNormal(worlds)
    if (n.lengthSq() < 1e-12) return false
    const view = new THREE.Vector3()
    this.ctx.camera.getWorldDirection(view)
    const faceIds = PolyDrawKernel.fillExistingLoop(this.ctx.mesh, unique, n.dot(view) > 0)
    if (faceIds.length === 0) return false
    this.facesMade += faceIds.length
    this.lastFaceId = faceIds[faceIds.length - 1] ?? null
    // The last drawn edge becomes the next patch's starting edge.
    this.chain = this.continueStrip
      ? unique.slice(-2).reverse().map(vertId => ({ vertId, isNew: false }))
      : []
    this.sketchMapLocked = false
    this.lockPlaneToLastFace()
    return true
  }

  private undoLast() {
    const last = this.chain.pop()
    if (last?.isNew) {
      const v = this.ctx.mesh.vertices.get(last.vertId)
      if (v && v.faceIds.length === 0) this.ctx.mesh.removeVertex(last.vertId)
    }
    if (this.chain.length === 0) {
      this.drawPlaneLocked = false
      this.sketchMapLocked = false
    }
    this.ctx.onUpdatePreview()
    if (!this.drawPlaneLocked) this.resolvePlane()
    this.updateHover(this.currentMouse)
    this.updatePreview()
    this.updateStatus()
  }

  private resolvePlane() {
    if (this.drawPlaneLocked) return

    const face = this.pickSceneFace()
    if (face) {
      const view = new THREE.Vector3()
      this.ctx.camera.getWorldDirection(view)
      this.plane = PolyDrawKernel.planeFromHit(face.point, PolyDrawKernel.normalTowardViewer(face.normal, view))
      return
    }

    const origin = this.vertWorld(this.chain[this.chain.length - 1]?.vertId)
      ?? this.meshWorldCentroid()
      ?? this.ctx.orbitTarget?.clone()
      ?? this.ctx.cursorWorld?.clone()
      ?? new THREE.Vector3(0, 0.5, 0)
    this.plane = this.viewAlignedPlane(origin)
  }

  private viewAlignedPlane(origin?: THREE.Vector3): DrawPlane {
    const o = origin ?? new THREE.Vector3(0, 0.5, 0)
    if (this.planeLock) return PolyDrawKernel.planeForView(this.planeLock, o)
    const kind = this.ctx.viewportKind || 'front'
    if (kind === 'persp') {
      if (this.perspMode === 'ground') return PolyDrawKernel.planeForView('top', o)
      return PolyDrawKernel.viewPlane(this.ctx.camera, o)
    }
    return PolyDrawKernel.planeForView(kind, o)
  }

  private lockPlaneToLastFace() {
    if (this.lastFaceId == null) return
    const face = this.ctx.mesh.faces.get(this.lastFaceId)
    if (!face) return
    const pts: THREE.Vector3[] = []
    for (const id of face.vertexIds) {
      const w = this.vertWorld(id)
      if (w) pts.push(w)
    }
    if (pts.length < 3) return
    const view = new THREE.Vector3()
    this.ctx.camera.getWorldDirection(view)
    const origin = this.vertWorld(this.chain[this.chain.length - 1]?.vertId) ?? pts[0]
    this.plane = PolyDrawKernel.planeFromHit(origin, PolyDrawKernel.normalTowardViewer(PolyDrawKernel.newellNormal(pts), view))
    this.drawPlaneLocked = true
  }

  private sharedFaceId(a: number, b: number): number | null {
    const va = this.ctx.mesh.vertices.get(a)
    if (!va) return null
    for (const fId of va.faceIds) {
      const face = this.ctx.mesh.faces.get(fId)
      if (face && face.vertexIds.includes(b)) return fId
    }
    return null
  }

  private bestFaceTowardCamera(vertId: number): number | null {
    const v = this.ctx.mesh.vertices.get(vertId)
    if (!v || v.faceIds.length === 0) return null
    const view = new THREE.Vector3()
    this.ctx.camera.getWorldDirection(view)
    view.transformDirection(this.worldToLocal)
    let best: number | null = null
    let bestDot = -Infinity
    for (const fId of v.faceIds) {
      const face = this.ctx.mesh.faces.get(fId)
      if (!face) continue
      const d = -face.normal.dot(view)
      if (d > bestDot) {
        bestDot = d
        best = fId
      }
    }
    return best
  }

  private meshWorldCentroid(): THREE.Vector3 | null {
    if (this.ctx.mesh.vertices.size === 0) return null
    const mat = this.ctx.objectMatrix ?? new THREE.Matrix4()
    const c = new THREE.Vector3()
    for (const v of this.ctx.mesh.vertices.values()) {
      c.add(v.position.clone().applyMatrix4(mat))
    }
    c.divideScalar(this.ctx.mesh.vertices.size)
    return c
  }

  private snapSize(): number {
    const base = this.ctx.gridSize && this.ctx.gridSize > 0 ? this.ctx.gridSize : 0.5
    if (this.ctx.snapGrid === false) return this.isCtrlHeld ? base : 0.01
    if (this.isCtrlHeld) return base * 0.5
    return base
  }

  private mergeThreshold(): number {
    return Math.max(0.02, this.snapSize() * 0.35)
  }

  private mappingEl(): HTMLElement {
    return this.ctx.viewportElement
  }

  private pointerRay(pointer: { x: number; y: number }): THREE.Ray {
    return ScreenGeometry.rayFromClient(
      pointer,
      this.mappingCamera(),
      this.mappingEl(),
      this.mappingQuadrant()
    )
  }

  private toOverlay(world: THREE.Vector3): THREE.Vector2 {
    return ScreenGeometry.worldToOverlay(world, this.mappingCamera(), this.mappingEl(), this.mappingQuadrant())
  }

  private updateHover(pointer: { x: number; y: number }) {
    if (
      this.sketchMapLocked &&
      this.mappingQuadrant() &&
      !ScreenGeometry.isInPane(pointer, this.mappingEl(), this.mappingQuadrant())
    ) {
      this.hoverKind = 'none'
      this.hoverSnapped = false
      this.hoverWorld = null
      this.hoverScreen = null
      this.hoverExistingId = null
      this.refreshChainScreen()
      return
    }

    const ray = this.pointerRay(pointer)
    const lastId = this.chain[this.chain.length - 1]?.vertId
    const firstId = this.chain[0]?.vertId
    this.canFill = this.loopIsFillable()
    this.canClose = this.canFill && firstId != null && firstId !== lastId

    const near = this.pickExisting(pointer, lastId)
    if (near != null) {
      this.hoverExistingId = near
      this.hoverSnapped = true
      this.hoverKind = this.canClose && near === firstId ? 'close' : 'existing'
      const world = this.vertWorld(near)
      this.hoverWorld = world
      this.hoverScreen = world ? this.toOverlay(world) : null
      this.refreshChainScreen()
      return
    }

    this.hoverExistingId = null
    const surface = this.pickSceneFace()
    let snapped: THREE.Vector3 | null = null
    if (surface) {
      const view = new THREE.Vector3()
      this.ctx.camera.getWorldDirection(view)
      const facePlane = PolyDrawKernel.planeFromHit(
        surface.point,
        PolyDrawKernel.normalTowardViewer(surface.normal, view)
      )
      snapped = PolyDrawKernel.snapOnPlane(surface.point, facePlane, this.snapSize())
      if (!this.drawPlaneLocked) this.plane = facePlane
    } else {
      const hit = PolyDrawKernel.intersectPlane(ray, this.plane)
      if (!hit || PolyDrawKernel.isUnreliableHit(ray, this.plane, this.mappingCamera())) {
        this.hoverKind = 'none'
        this.hoverSnapped = false
        this.hoverWorld = null
        this.hoverScreen = null
        this.refreshChainScreen()
        return
      }
      snapped = PolyDrawKernel.snapOnPlane(hit, this.plane, this.snapSize())
    }

    const lastWorld = this.chain.length > 0 ? this.vertWorld(this.chain[this.chain.length - 1]!.vertId) : null
    if (this.isShiftHeld && lastWorld && snapped) {
      snapped = PolyDrawKernel.constrainFromLast(lastWorld, snapped, this.plane, this.snapSize())
    }
    if (!snapped) {
      this.hoverKind = 'none'
      this.hoverWorld = null
      this.refreshChainScreen()
      return
    }

    const skip = new Set(this.chain.map(p => p.vertId))
    if (this.canClose && firstId != null) skip.delete(firstId)
    const merged = this.findExistingNearWorld(snapped, skip)
    if (merged != null && merged !== lastId) {
      this.hoverExistingId = merged
      this.hoverSnapped = true
      this.hoverKind = this.canClose && merged === firstId ? 'close' : 'existing'
      this.hoverWorld = this.vertWorld(merged)
      this.hoverScreen = this.hoverWorld ? this.toOverlay(this.hoverWorld) : null
      this.refreshChainScreen()
      return
    }

    this.hoverKind = 'new'
    this.hoverSnapped = false
    this.hoverWorld = snapped
    this.hoverScreen = this.toOverlay(snapped)
    this.refreshChainScreen()
  }

  private pickExisting(
    pointer: { x: number; y: number },
    skipLast?: number
  ): number | null {
    let bestId: number | null = null
    let bestScore = Infinity
    const worldMat = this.ctx.objectMatrix ?? new THREE.Matrix4()
    const lastWorld = skipLast != null ? this.vertWorld(skipLast) : null
    const firstId = this.chain[0]?.vertId
    const reach = this.snapReach(lastWorld)
    const local = ScreenGeometry.pointerInView(pointer, this.mappingEl())
    const cam = this.mappingCamera()
    for (const [id, v] of this.ctx.mesh.vertices) {
      if (id === skipLast) continue
      const world = v.position.clone().applyMatrix4(worldMat)
      if (!PolyDrawKernel.isInFrontOfCamera(world, cam)) continue
      if (lastWorld && id !== firstId && world.distanceTo(lastWorld) > reach) continue
      const s = this.toOverlay(world)
      const d = Math.hypot(s.x - local.x, s.y - local.y)
      if (d > SNAP_PX) continue
      const depth = Math.abs(world.clone().applyMatrix4(cam.matrixWorldInverse).z)
      const score = d + depth * 0.2
      if (score < bestScore) {
        bestScore = score
        bestId = id
      }
    }
    return bestId
  }

  private snapReach(lastWorld: THREE.Vector3 | null): number {
    if (!lastWorld || this.chain.length < 2) return Number.POSITIVE_INFINITY
    const prev = this.vertWorld(this.chain[this.chain.length - 2]!.vertId)
    const edge = prev ? lastWorld.distanceTo(prev) : this.snapSize()
    return Math.max(2, edge * 5, this.snapSize() * 10)
  }

  private findExistingNearWorld(world: THREE.Vector3, skip: Set<number>): number | null {
    const thresh = this.mergeThreshold()
    const threshSq = thresh * thresh
    let bestId: number | null = null
    let best = threshSq
    for (const [id] of this.ctx.mesh.vertices) {
      if (skip.has(id)) continue
      const w = this.vertWorld(id)
      if (!w) continue
      const d = w.distanceToSquared(world)
      if (d <= best) {
        best = d
        bestId = id
      }
    }
    return bestId
  }

  private vertWorld(id: number): THREE.Vector3 | null {
    const v = this.ctx.mesh.vertices.get(id)
    if (!v) return null
    return v.position.clone().applyMatrix4(this.ctx.objectMatrix ?? new THREE.Matrix4())
  }

  private pickSceneFace(): { point: THREE.Vector3; normal: THREE.Vector3 } | null {
    if (!this.ctx.sceneGroup) return null
    const ray = this.pointerRay(this.currentMouse)
    const rc = new THREE.Raycaster()
    rc.ray.copy(ray)
    const hits = rc.intersectObject(this.ctx.sceneGroup, true)
    for (const h of hits) {
      if (!h.face) continue
      let obj: THREE.Object3D | null = h.object
      let skip = false
      while (obj) {
        if (obj.userData?.ignorePick || obj === this.ctx.previewGroup) {
          skip = true
          break
        }
        obj = obj.parent
      }
      if (skip) continue
      const n = h.face.normal.clone().transformDirection(h.object.matrixWorld).normalize()
      return { point: h.point.clone(), normal: n }
    }
    return null
  }

  private chainWorldPts(): THREE.Vector3[] {
    const pts: THREE.Vector3[] = []
    for (const p of this.chain) {
      const w = this.vertWorld(p.vertId)
      if (w) pts.push(w)
    }
    return pts
  }

  private rubberBandWorld(): THREE.Vector3[] {
    const pts = this.chainWorldPts()
    if (this.hoverKind === 'close' && pts.length >= 3) {
      pts.push(pts[0].clone())
      return pts
    }
    if (this.hoverWorld && this.hoverKind !== 'none') {
      const last = pts[pts.length - 1]
      if (!last || last.distanceToSquared(this.hoverWorld) > 1e-10) pts.push(this.hoverWorld.clone())
    }
    return pts
  }

  private refreshChainScreen() {
    this.screenPoints = this.chainWorldPts().map(w => this.toOverlay(w))
    if (this.hoverScreen && this.hoverKind !== 'close' && this.hoverKind !== 'none') {
      this.screenPoints = [...this.screenPoints, this.hoverScreen]
    }
    this.previewFaceScreen = this.chainWorldPts().map(w => this.toOverlay(w))
  }

  private updatePreview() {
    if (!this.ctx.previewGroup) return
    this.disposePreview()
    const pts = this.rubberBandWorld()

    if (pts.length >= 2) {
      const positions: number[] = []
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i]
        const b = pts[i + 1]
        positions.push(a.x, a.y, a.z, b.x, b.y, b.z)
      }
      const color = this.hoverKind === 'close' ? 0x34d399 : this.hoverSnapped ? 0x38bdf8 : 0xf59e0b
      this.previewLine = ScreenGeometry.dashedPreviewLine(positions, color)
      this.ctx.previewGroup.add(this.previewLine)
    }

    const fillPts = this.chainWorldPts()
    if (fillPts.length >= 3) {
      const ids = this.uniqueChainIds()
      const plan = PolyDrawKernel.planExistingLoop(this.ctx.mesh, ids)
      const loops = plan.loops.map(loop => loop.map(id => ids.indexOf(id)))
      const tri: number[] = []
      for (const loop of loops) {
        for (let i = 1; i < loop.length - 1; i++) {
          const a = fillPts[loop[0]]
          const b = fillPts[loop[i]]
          const c = fillPts[loop[i + 1]]
          tri.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
        }
      }
      if (tri.length > 0) {
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.Float32BufferAttribute(tri, 3))
        const mat = new THREE.MeshBasicMaterial({
          color: this.hoverKind === 'close' ? 0x34d399 : 0x38bdf8,
          transparent: true,
          opacity: 0.28,
          side: THREE.DoubleSide,
          depthWrite: false
        })
        this.previewFill = new THREE.Mesh(geo, mat)
        this.previewFill.renderOrder = 40
        this.ctx.previewGroup.add(this.previewFill)
      }
    }
  }

  private disposePreview() {
    if (this.previewLine) {
      this.previewLine.geometry.dispose()
      ;(this.previewLine.material as THREE.Material).dispose()
      this.previewLine.removeFromParent()
      this.previewLine = null
    }
    if (this.previewFill) {
      this.previewFill.geometry.dispose()
      ;(this.previewFill.material as THREE.Material).dispose()
      this.previewFill.removeFromParent()
      this.previewFill = null
    }
  }
}
