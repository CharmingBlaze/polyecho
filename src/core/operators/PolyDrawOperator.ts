import * as THREE from 'three'
import { ModalOperator, OperatorContext } from './ModalOperator'
import { ScreenGeometry } from '../geometry/ScreenGeometry'
import { ExtrudeKernel, ExtrudeResult } from '../mesh/operations/ExtrudeKernel'
import { PolyDrawKernel, DrawPlane, DrawViewKind } from '../mesh/operations/PolyDrawKernel'
import { TransformSolver } from '../transform/TransformSolver'
import { PivotManager } from '../transform/PivotManager'

export type PolyDrawPhase = 'draw' | 'extrude'

export class PolyDrawOperator extends ModalOperator {
  readonly name = 'Poly Draw'

  public phase: PolyDrawPhase = 'draw'
  public points: THREE.Vector3[] = []
  public hoverPoint: THREE.Vector3 | null = null
  public screenPoints: THREE.Vector2[] = []
  public hoverScreen: THREE.Vector2 | null = null

  private plane!: DrawPlane
  private planeLock: DrawViewKind | null = null
  private lastViewportKind: DrawViewKind | undefined
  private extrudeResult: ExtrudeResult | null = null
  private startRay = new THREE.Ray()
  private currentRay = new THREE.Ray()
  private extrudeNormal = new THREE.Vector3(0, 0, 1)
  private previewLine: THREE.Line | null = null
  private previewSolid: THREE.Mesh | null = null

  begin(ctx: OperatorContext, startPointer: { x: number; y: number }) {
    super.begin(ctx, startPointer)
    this.phase = 'draw'
    this.points = []
    this.hoverPoint = null
    this.extrudeResult = null
    this.planeLock = null
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

    if (this.phase === 'draw') {
      const kind = this.ctx.viewportKind
      if (this.points.length === 0 && kind && kind !== this.lastViewportKind) {
        this.planeLock = null
        this.lastViewportKind = kind
      }
      if (this.points.length === 0) this.resolvePlane()
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
        this.updateDrawPreview()
        this.updateStatus()
        return true
      }
      this.cancel()
      return true
    }

    if (button !== 0) return false

    if (this.phase === 'extrude') {
      return false
    }

    if (!this.hoverPoint) return true

    if (this.points.length >= 3 && this.isNearFirst()) {
      this.beginExtrude()
      return true
    }

    this.points.push(this.hoverPoint.clone())
    this.updateDrawPreview()
    this.updateStatus()
    return true
  }

  keyDown(event: KeyboardEvent): boolean {
    const key = event.key.toLowerCase()
    if (event.ctrlKey && key === 'z' && this.phase === 'draw') {
      event.preventDefault()
      this.points.pop()
      this.updateDrawPreview()
      this.updateStatus()
      return true
    }
    if ((key === 'enter' || key === ' ') && this.phase === 'draw') {
      event.preventDefault()
      if (this.points.length >= 3) this.beginExtrude()
      return true
    }
    if (key === 'backspace' && this.phase === 'draw') {
      event.preventDefault()
      this.points.pop()
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
      this.statusText = `Poly Draw · ${this.planeLabel()} · verts ${this.points.length} · close on first / Enter · RMB undo · 1/3/7 lock plane`
      return
    }
    const num = this.numericInput.text ? `: ${this.numericInput.text}m` : ''
    this.statusText = `Poly Draw Extrude${num} · LMB/Enter confirm`
  }

  private beginExtrude() {
    const faceId = PolyDrawKernel.createPlanarFace(this.ctx.mesh, this.points)
    if (faceId == null) return
    const baseVerts = [...(this.ctx.mesh.faces.get(faceId)?.vertexIds ?? [])]

    this.extrudeResult = ExtrudeKernel.extrudeFaces(this.ctx.mesh, [faceId])
    PolyDrawKernel.capDrawBase(this.ctx.mesh, baseVerts)
    this.extrudeNormal.copy(this.extrudeResult.regionNormal)
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
    this.updateStatus()
  }

  private resolvePlane() {
    if (this.planeLock) {
      this.plane = PolyDrawKernel.planeForView(this.planeLock)
      return
    }
    const kind = this.ctx.viewportKind || 'front'
    if (kind === 'persp') {
      const hit = this.pickSceneFace()
      if (hit) {
        this.plane = PolyDrawKernel.planeFromHit(hit.point, hit.normal)
        return
      }
      this.plane = PolyDrawKernel.planeForView('top')
      return
    }
    this.plane = PolyDrawKernel.planeForView(kind)
  }

  private planeLabel(): string {
    if (this.planeLock === 'front') return 'Front (XY)'
    if (this.planeLock === 'right') return 'Side (ZY)'
    if (this.planeLock === 'top') return 'Ground (XZ)'
    const kind = this.ctx.viewportKind || 'front'
    if (kind === 'persp') {
      const n = this.plane?.normal
      if (n && Math.abs(n.y) > 0.85) return 'Persp ground'
      if (n && n.lengthSq() > 0) return 'Persp on face'
      return 'Persp ground'
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
      if (h.object.userData?.ignorePick) continue
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
    const rect = this.ctx.viewportElement.getBoundingClientRect()
    this.hoverScreen = ScreenGeometry.worldToScreen(this.hoverPoint, this.ctx.camera, rect, this.ctx.quadrant)
    this.screenPoints = this.points.map(p => ScreenGeometry.worldToScreen(p, this.ctx.camera, rect, this.ctx.quadrant))
  }

  private isNearFirst(): boolean {
    if (!this.hoverScreen || this.screenPoints.length === 0) return false
    return this.hoverScreen.distanceTo(this.screenPoints[0]) <= 14
  }

  private pointerRay(pointer: { x: number; y: number }): THREE.Ray {
    const rect = this.ctx.viewportElement.getBoundingClientRect()
    return ScreenGeometry.screenToRay(pointer, this.ctx.camera, rect, this.ctx.quadrant)
  }

  private updateDrawPreview() {
    if (!this.ctx.previewGroup) return
    this.disposePreview()
    const pts = [...this.points]
    if (this.hoverPoint) pts.push(this.hoverPoint)
    if (pts.length < 2) return

    const positions: number[] = []
    for (let i = 0; i < pts.length - 1; i++) {
      positions.push(pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z)
    }
    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    const mat = new THREE.LineBasicMaterial({ color: 0xf59e0b, depthTest: false })
    this.previewLine = new THREE.LineSegments(geom, mat)
    this.previewLine.renderOrder = 80
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
