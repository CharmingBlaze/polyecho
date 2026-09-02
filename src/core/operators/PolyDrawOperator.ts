import * as THREE from 'three'
import { ModalOperator, OperatorContext } from './ModalOperator'
import { ScreenGeometry } from '../geometry/ScreenGeometry'
import { ExtrudeKernel, ExtrudeResult } from '../mesh/operations/ExtrudeKernel'
import { PolyDrawKernel, DrawPlane, DrawViewKind } from '../mesh/operations/PolyDrawKernel'
import { TransformSolver } from '../transform/TransformSolver'
import { PivotManager } from '../transform/PivotManager'

export type PolyDrawPhase = 'draw' | 'extrude'

const CLOSE_PX = 22

export class PolyDrawOperator extends ModalOperator {
  readonly name = 'Poly Draw'

  public phase: PolyDrawPhase = 'draw'
  public points: THREE.Vector3[] = []
  public hoverPoint: THREE.Vector3 | null = null
  public screenPoints: THREE.Vector2[] = []
  public hoverScreen: THREE.Vector2 | null = null
  public isClosing = false

  private plane!: DrawPlane
  private planeLock: DrawViewKind | null = null
  private lastViewportKind: DrawViewKind | undefined
  private perspMode: 'view' | 'ground' = 'view'
  private planeLocked = false
  private extrudeResult: ExtrudeResult | null = null
  private startRay = new THREE.Ray()
  private currentRay = new THREE.Ray()
  private extrudeNormal = new THREE.Vector3(0, 0, 1)
  private previewLine: THREE.Line | null = null
  private previewSolid: THREE.Mesh | null = null
  private lastClickAt = 0
  private isAltHeld = false

  begin(ctx: OperatorContext, startPointer: { x: number; y: number }) {
    super.begin(ctx, startPointer)
    this.phase = 'draw'
    this.points = []
    this.hoverPoint = null
    this.extrudeResult = null
    this.planeLock = null
    this.planeLocked = false
    this.perspMode = 'view'
    this.lastViewportKind = ctx.viewportKind
    this.resolvePlane()
    this.updateHover(startPointer)
    this.updateDrawPreview()
    this.updateStatus()
  }

  pointerMove(event: PointerEvent) {
    this.currentMouse = { x: event.clientX, y: event.clientY }
    this.isShiftHeld = event.shiftKey
    this.isCtrlHeld = event.ctrlKey
    this.isAltHeld = event.altKey

    if (this.phase === 'draw') {
      const kind = this.ctx.viewportKind
      if (!this.planeLocked && this.points.length === 0 && kind && kind !== this.lastViewportKind) {
        this.planeLock = null
        this.lastViewportKind = kind
      }
      if (!this.planeLocked) this.resolvePlane()
      this.updateHover(this.currentMouse)
      this.updateDrawPreview()
      this.updateStatus()
      return
    }

    this.evaluate()
    this.ctx.onUpdatePreview()
    this.updateStatus()
  }

  evaluate() {
    if (this.phase !== 'extrude' || !this.extrudeResult) return

    const ray = this.pointerRay(this.currentMouse)
    this.currentRay.copy(ray)

    const basis = PivotManager.getBasis(this.orientation, this.ctx.camera, this.extrudeNormal)
    const numVal = this.numericInput.getValue()
    let moveDir = this.extrudeNormal.clone()
    if (this.constraint === 'X') moveDir = basis.x.clone()
    else if (this.constraint === 'Y') moveDir = basis.y.clone()
    else if (this.constraint === 'Z') moveDir = basis.z.clone()

    let dist = 0
    if (numVal !== null) {
      dist = numVal
    } else {
      const tStart = TransformSolver.rayLineClosestPoint(this.startRay, this.pivot, moveDir)
      const tCur = TransformSolver.rayLineClosestPoint(this.currentRay, this.pivot, moveDir)
      dist = tCur - tStart
      if (!isFinite(dist) || Math.abs(dist) < 0.00001) {
        const hitStart = TransformSolver.rayPlaneIntersect(this.startRay, this.pivot, this.ctx.camera)
        const hitCur = TransformSolver.rayPlaneIntersect(this.currentRay, this.pivot, this.ctx.camera)
        if (hitStart && hitCur) dist = hitCur.sub(hitStart).dot(moveDir)
      }
    }

    if (this.isShiftHeld && numVal === null) dist *= 0.2
    if (this.isCtrlHeld && numVal === null) dist = this.snapManager.snapLinear(dist, 0.5)

    const delta = moveDir.multiplyScalar(dist)
    for (const vId of this.extrudeResult.newVertexIds) {
      const initPos = this.initialVertices.get(vId)
      const v = this.ctx.mesh.vertices.get(vId)
      if (initPos && v) v.position.copy(initPos).add(delta)
    }
    this.ctx.mesh.recalculateNormals()
    this.updateSolidPreview()
  }

  handlePointerDown(button: number): boolean {
    if (button === 2) {
      if (this.phase === 'draw' && this.points.length > 0) {
        this.points.pop()
        if (this.points.length === 0) this.planeLocked = false
        this.updateDrawPreview()
        this.updateStatus()
        return true
      }
      return false
    }

    if (button !== 0) return false

    if (this.phase === 'extrude') {
      return false
    }

    const now = performance.now()
    const dbl = now - this.lastClickAt < 320
    this.lastClickAt = now

    if (!this.hoverPoint) return true

    if (this.points.length >= 3 && (this.isNearFirst() || dbl)) {
      this.beginExtrude()
      return true
    }

    const last = this.points[this.points.length - 1]
    if (last && last.distanceToSquared(this.hoverPoint) < 1e-8) return true

    if (this.points.length === 0) this.resolvePlane()
    this.points.push(this.hoverPoint.clone())
    if (!this.planeLocked) {
      this.plane = PolyDrawKernel.rebaseOrigin(this.plane, this.points[0])
      this.planeLocked = true
    }
    this.updateDrawPreview()
    this.updateStatus()
    return true
  }

  keyDown(event: KeyboardEvent): boolean {
    const key = event.key.toLowerCase()
    if (event.ctrlKey && key === 'z' && this.phase === 'draw') {
      event.preventDefault()
      this.points.pop()
      if (this.points.length === 0) this.planeLocked = false
      this.updateDrawPreview()
      this.updateStatus()
      return true
    }
    if ((key === 'enter' || key === ' ' || key === 'c' || key === 'f') && this.phase === 'draw') {
      event.preventDefault()
      if (this.points.length >= 3) this.beginExtrude()
      return true
    }
    if ((key === 'f' || key === 'tab' || key === 'c') && this.phase === 'extrude') {
      event.preventDefault()
      this.flipExtrude()
      return true
    }
    if (key === 'n' && this.phase === 'draw' && this.points.length === 0) {
      event.preventDefault()
      if (this.ctx.viewportKind === 'persp' && !this.planeLock) {
        this.perspMode = this.perspMode === 'view' ? 'ground' : 'view'
      } else {
        this.plane = PolyDrawKernel.flipPlane(this.plane)
      }
      this.resolvePlane()
      this.updateHover(this.currentMouse)
      this.updateStatus()
      return true
    }
    if (key === 'backspace' && this.phase === 'draw') {
      event.preventDefault()
      this.points.pop()
      if (this.points.length === 0) this.planeLocked = false
      this.updateDrawPreview()
      this.updateStatus()
      return true
    }
    if (this.phase === 'draw' && this.points.length === 0) {
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
    return super.keyDown(event)
  }

  confirm() {
    this.disposePreview()
    if (this.phase === 'draw' && this.points.length >= 3) {
      this.beginExtrude()
    }
    if (this.ctx.mesh.faces.size === 0) {
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
    if (this.phase === 'draw') {
      this.statusText = this.points.length === 0
        ? `Poly Draw · ${this.planeLabel()} · click to drop verts · N view/ground · 1/3/7 lock Front/Side/Ground · MMB orbit`
        : `Poly Draw · ${this.planeLabel()} · ${this.points.length} verts · close on first / double-click / C / Enter · Shift = 45° · RMB undo · MMB orbit`
      return
    }
    const num = this.numericInput.text ? `: ${this.numericInput.text}m` : ''
    this.statusText = `Thickness${num} · drag either way · F/C flips · LMB/Enter confirm`
  }

  flipExtrude() {
    if (this.phase !== 'extrude') return
    this.extrudeNormal.negate()
    this.evaluate()
    this.ctx.onUpdatePreview()
    this.updateStatus()
  }

  get canClose(): boolean {
    return this.phase === 'draw' && this.points.length >= 3
  }

  closeFromHud() {
    if (this.phase === 'draw' && this.points.length >= 3) this.beginExtrude()
  }

  flipFromHud() {
    this.flipExtrude()
  }

  private beginExtrude() {
    const view = new THREE.Vector3()
    this.ctx.camera.getWorldDirection(view)
    const loop = PolyDrawKernel.orientLoopTowardViewer(this.points, view)
    const faceId = PolyDrawKernel.createPlanarFace(this.ctx.mesh, loop)
    if (faceId == null) return
    const baseVerts = [...(this.ctx.mesh.faces.get(faceId)?.vertexIds ?? [])]

    this.extrudeResult = ExtrudeKernel.extrudeFaces(this.ctx.mesh, [faceId])
    PolyDrawKernel.capDrawBase(this.ctx.mesh, baseVerts)
    this.extrudeNormal.copy(this.extrudeResult.regionNormal)
    if (this.extrudeNormal.dot(view) > 0) this.extrudeNormal.negate()
    this.phase = 'extrude'
    this.disposePreview()

    this.initialVertices.clear()
    for (const [id, v] of this.ctx.mesh.vertices) {
      this.initialVertices.set(id, v.position.clone())
    }

    this.pivot.set(0, 0, 0)
    for (const vId of this.extrudeResult.newVertexIds) {
      const v = this.ctx.mesh.vertices.get(vId)
      if (v) this.pivot.add(v.position)
    }
    if (this.extrudeResult.newVertexIds.length > 0) {
      this.pivot.divideScalar(this.extrudeResult.newVertexIds.length)
    }

    this.startRay.copy(this.pointerRay(this.currentMouse))
    this.ctx.selectedFaceIds = [...this.extrudeResult.extrudedFaceIds]
    this.updateSolidPreview()
    this.ctx.onUpdatePreview()
    this.updateStatus()
  }

  private workOrigin(): THREE.Vector3 {
    if (this.points.length > 0) return this.points[0].clone()
    if (this.ctx.orbitTarget) return this.ctx.orbitTarget.clone()
    if (this.ctx.cursorWorld) return this.ctx.cursorWorld.clone()
    return new THREE.Vector3(0, 0.5, 0)
  }

  private resolvePlane() {
    if (this.planeLocked) return
    const origin = this.workOrigin()
    if (this.planeLock) {
      this.plane = PolyDrawKernel.planeForView(this.planeLock, origin)
      return
    }
    const kind = this.ctx.viewportKind || 'front'
    if (kind === 'persp') {
      if (this.isAltHeld) {
        const hit = this.pickSceneFace()
        if (hit) {
          const view = new THREE.Vector3()
          this.ctx.camera.getWorldDirection(view)
          this.plane = PolyDrawKernel.planeFromHit(hit.point, PolyDrawKernel.normalTowardViewer(hit.normal, view))
          return
        }
      }
      if (this.perspMode === 'ground') {
        const ground = PolyDrawKernel.planeForView('top', origin)
        const ray = this.pointerRay(this.currentMouse)
        if (!PolyDrawKernel.isUnreliableHit(ray, ground, this.ctx.camera)) {
          this.plane = ground
          return
        }
      }
      this.plane = PolyDrawKernel.viewPlane(this.ctx.camera, origin)
      return
    }
    this.plane = PolyDrawKernel.planeForView(kind, origin)
  }

  private planeLabel(): string {
    if (this.planeLock === 'front') return 'Front (XY)'
    if (this.planeLock === 'right') return 'Side (ZY)'
    if (this.planeLock === 'top') return 'Ground (XZ)'
    const kind = this.ctx.viewportKind || 'front'
    if (kind === 'persp') {
      const n = this.plane?.normal
      if (n && Math.abs(n.y) > 0.85 && this.perspMode === 'ground') return 'Persp ground'
      if (n && n.lengthSq() > 0) {
        const view = new THREE.Vector3()
        this.ctx.camera.getWorldDirection(view)
        if (Math.abs(n.dot(view)) > 0.65) return 'Persp view'
        return 'Persp view'
      }
      return 'Persp view'
    }
    if (kind === 'right') return 'Side (ZY)'
    if (kind === 'top') return 'Top (XZ)'
    return 'Front (XY)'
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

  private snapSize(): number {
    const base = this.ctx.gridSize && this.ctx.gridSize > 0 ? this.ctx.gridSize : 0.5
    if (this.ctx.snapGrid === false) return this.isCtrlHeld ? base : 0.01
    if (this.isCtrlHeld) return base * 0.5
    return base
  }

  private updateHover(pointer: { x: number; y: number }) {
    const ray = this.pointerRay(pointer)
    const hit = PolyDrawKernel.intersectPlane(ray, this.plane)
    if (!hit) {
      this.hoverPoint = null
      this.hoverScreen = null
      return
    }
    this.hoverPoint = PolyDrawKernel.snapOnPlane(hit, this.plane, this.snapSize())
    if (this.isShiftHeld && this.points.length > 0) {
      this.hoverPoint = PolyDrawKernel.constrainFromLast(this.points[this.points.length - 1], this.hoverPoint, this.plane, this.snapSize())
    }
    const rect = this.ctx.viewportElement.getBoundingClientRect()
    this.hoverScreen = ScreenGeometry.worldToScreen(this.hoverPoint, this.ctx.camera, rect, this.ctx.quadrant)
    this.screenPoints = this.points.map(p => ScreenGeometry.worldToScreen(p, this.ctx.camera, rect, this.ctx.quadrant))
    this.isClosing = this.points.length >= 3 && this.isNearFirst()
  }

  private isNearFirst(): boolean {
    if (!this.hoverScreen || this.screenPoints.length === 0) return false
    return this.hoverScreen.distanceTo(this.screenPoints[0]) <= CLOSE_PX
  }

  private pointerRay(pointer: { x: number; y: number }): THREE.Ray {
    const rect = this.ctx.viewportElement.getBoundingClientRect()
    return ScreenGeometry.screenToRay(pointer, this.ctx.camera, rect, this.ctx.quadrant)
  }

  private updateDrawPreview() {
    if (!this.ctx.previewGroup) return
    this.disposePreview()
    const pts = [...this.points]
    const closing = this.isClosing
    if (this.hoverPoint && !closing) pts.push(this.hoverPoint)
    if (pts.length < 2) return

    const positions: number[] = []
    for (let i = 0; i < pts.length - 1; i++) {
      positions.push(pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z)
    }
    if (closing) {
      const first = pts[0]
      const last = pts[pts.length - 1]
      positions.push(last.x, last.y, last.z, first.x, first.y, first.z)
    }
    this.previewLine = ScreenGeometry.dashedPreviewLine(positions, closing ? 0x34d399 : 0xf59e0b)
    this.ctx.previewGroup.add(this.previewLine)
  }

  private updateSolidPreview() {
    if (!this.ctx.previewGroup) return
    this.disposeSolidPreview()
    const positions: number[] = []
    for (const face of this.ctx.mesh.faces.values()) {
      const ids = face.vertexIds
      for (let i = 1; i < ids.length - 1; i++) {
        const a = this.ctx.mesh.vertices.get(ids[0])
        const b = this.ctx.mesh.vertices.get(ids[i])
        const c = this.ctx.mesh.vertices.get(ids[i + 1])
        if (!a || !b || !c) continue
        positions.push(a.position.x, a.position.y, a.position.z, b.position.x, b.position.y, b.position.z, c.position.x, c.position.y, c.position.z)
      }
    }
    if (positions.length === 0) return
    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geom.computeVertexNormals()
    const mat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      roughness: 0.8
    })
    this.previewSolid = new THREE.Mesh(geom, mat)
    this.ctx.previewGroup.add(this.previewSolid)
  }

  private disposeSolidPreview() {
    if (!this.previewSolid) return
    this.previewSolid.geometry.dispose()
    ;(this.previewSolid.material as THREE.Material).dispose()
    this.previewSolid.removeFromParent()
    this.previewSolid = null
  }

  private disposePreview() {
    this.disposeSolidPreview()
    if (!this.previewLine) return
    this.previewLine.geometry.dispose()
    ;(this.previewLine.material as THREE.Material).dispose()
    this.previewLine.removeFromParent()
    this.previewLine = null
  }
}
