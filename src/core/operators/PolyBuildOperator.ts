import * as THREE from 'three'
import { ModalOperator } from './ModalOperator'
import { ScreenGeometry } from '../geometry/ScreenGeometry'
import { PolyDrawKernel, DrawPlane, DrawViewKind } from '../mesh/operations/PolyDrawKernel'
import { MeshTopologyService } from '../mesh/MeshTopologyService'

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
  public previewFaceScreen: THREE.Vector2[] = []

  private plane!: DrawPlane
  private planeLock: DrawViewKind | null = null
  private drawPlaneLocked = false
  public hoverWorld: THREE.Vector3 | null = null
  private hoverExistingId: number | null = null
  private previewLine: THREE.Line | null = null

  begin(ctx: any, startPointer: { x: number; y: number }) {
    super.begin(ctx, startPointer)
    this.chain = []
    this.facesMade = 0
    this.planeLock = null
    this.drawPlaneLocked = false
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
    this.updateHover(this.currentMouse)
    this.updatePreview()
    this.updateStatus()
  }

  handlePointerDown(button: number): boolean {
    if (button === 2) {
      if (this.chain.length > 0) {
        this.undoLast()
        return true
      }
      this.cancel()
      return true
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
    if (key === 'f' && !event.ctrlKey && !event.altKey && !event.metaKey) {
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
      this.confirm()
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
    if (n === 0) {
      this.statusText = this.hoverKind === 'existing'
        ? 'Click this vert to start · or click empty space to drop a new one'
        : 'Click empty space for a new vert · click an old vert to reuse it'
      return
    }
    if (this.hoverKind === 'close') {
      this.statusText = `Close this face (${n} verts) · click the first vert · Enter fills · Esc cancels`
      return
    }
    const kind = this.hoverKind === 'existing' ? 'on existing vert' : 'new vert'
    if (n === 1) {
      this.statusText = `Started · ${kind} · click the next point (old or new) · RMB undo`
      return
    }
    if (n === 2) {
      this.statusText = this.facesMade > 0
        ? `Strip edge kept · ${kind} · two more points make the next face`
        : `Edge started · ${kind} · add a third, then close or add a fourth`
      return
    }
    this.statusText = `${n} verts · ${kind} · click first to close, 4th makes a quad, Enter fills · ${this.facesMade} face${this.facesMade === 1 ? '' : 's'}`
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
    let placedId: number | null = null
    let isNew = false

    if (this.hoverExistingId != null && this.hoverExistingId !== lastId) {
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

    if (this.uniqueChainIds().length >= 4) {
      this.tryFillCurrent()
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

  private tryFillCurrent(): boolean {
    const unique = this.uniqueChainIds()
    if (unique.length < 3) return false

    const positions = unique.map(id => this.ctx.mesh.vertices.get(id)!.position)
    const a = positions[1].clone().sub(positions[0])
    const b = positions[2].clone().sub(positions[0])
    const n = a.cross(b)
    if (n.lengthSq() < 1e-12) return false
    n.normalize()

    const view = new THREE.Vector3()
    this.ctx.camera.getWorldDirection(view)
    view.transformDirection(this.worldToLocal)
    const loop = n.dot(view) > 0 ? [...unique].reverse() : unique

    const faceId = MeshTopologyService.fillBoundary(this.ctx.mesh, loop)
    if (faceId == null) return false
    this.ctx.mesh.recalculateNormals()
    this.facesMade += 1

    const ids = this.chain.map(p => p.vertId)
    const last = ids[ids.length - 2]
    const tip = ids[ids.length - 1]
    this.chain = last != null && tip != null && last !== tip
      ? [{ vertId: last, isNew: false }, { vertId: tip, isNew: false }]
      : tip != null
        ? [{ vertId: tip, isNew: false }]
        : []
    return true
  }

  private undoLast() {
    const last = this.chain.pop()
    if (last?.isNew) {
      const v = this.ctx.mesh.vertices.get(last.vertId)
      if (v && v.faceIds.length === 0) this.ctx.mesh.removeVertex(last.vertId)
    }
    if (this.chain.length === 0) this.drawPlaneLocked = false
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
      this.plane = PolyDrawKernel.planeFromHit(face.point, face.normal)
      return
    }

    const view = this.viewAlignedPlane()
    const origin = this.meshWorldCentroid() || view.origin
    this.plane = {
      origin: origin.clone(),
      normal: view.normal.clone(),
      axisU: view.axisU.clone(),
      axisV: view.axisV.clone()
    }
  }

  private viewAlignedPlane(): DrawPlane {
    if (this.planeLock) return PolyDrawKernel.planeForView(this.planeLock)
    const kind = this.ctx.viewportKind || 'front'
    if (kind === 'persp') return PolyDrawKernel.planeForView('top')
    return PolyDrawKernel.planeForView(kind)
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

  private updateHover(pointer: { x: number; y: number }) {
    const rect = this.ctx.viewportElement.getBoundingClientRect()
    const ray = ScreenGeometry.screenToRay(pointer, this.ctx.camera, rect, this.ctx.quadrant)
    const lastId = this.chain[this.chain.length - 1]?.vertId
    const firstId = this.chain[0]?.vertId
    this.canFill = this.uniqueChainIds().length >= 3
    this.canClose = this.canFill && firstId != null && firstId !== lastId

    const near = this.pickExisting(pointer, rect, lastId)
    if (near != null) {
      this.hoverExistingId = near
      this.hoverSnapped = true
      this.hoverKind = this.canClose && near === firstId ? 'close' : 'existing'
      const world = this.vertWorld(near)
      this.hoverWorld = world
      this.hoverScreen = world
        ? ScreenGeometry.worldToScreen(world, this.ctx.camera, rect, this.ctx.quadrant)
        : null
      this.refreshChainScreen(rect)
      return
    }

    this.hoverExistingId = null
    const hit = PolyDrawKernel.intersectPlane(ray, this.plane)
    if (!hit) {
      this.hoverKind = 'none'
      this.hoverSnapped = false
      this.hoverWorld = null
      this.hoverScreen = null
      this.refreshChainScreen(rect)
      return
    }

    const snapped = PolyDrawKernel.snapOnPlane(hit, this.plane, this.snapSize())
    const skip = new Set(this.chain.map(p => p.vertId))
    if (this.canClose && firstId != null) skip.delete(firstId)
    const merged = this.findExistingNearWorld(snapped, skip)
    if (merged != null && merged !== lastId) {
      this.hoverExistingId = merged
      this.hoverSnapped = true
      this.hoverKind = this.canClose && merged === firstId ? 'close' : 'existing'
      this.hoverWorld = this.vertWorld(merged)
      this.hoverScreen = this.hoverWorld
        ? ScreenGeometry.worldToScreen(this.hoverWorld, this.ctx.camera, rect, this.ctx.quadrant)
        : null
      this.refreshChainScreen(rect)
      return
    }

    this.hoverKind = 'new'
    this.hoverSnapped = false
    this.hoverWorld = snapped
    this.hoverScreen = ScreenGeometry.worldToScreen(snapped, this.ctx.camera, rect, this.ctx.quadrant)
    this.refreshChainScreen(rect)
  }

  private pickExisting(
    pointer: { x: number; y: number },
    rect: DOMRect,
    skipLast?: number
  ): number | null {
    let bestId: number | null = null
    let best = SNAP_PX
    const worldMat = this.ctx.objectMatrix ?? new THREE.Matrix4()
    for (const [id, v] of this.ctx.mesh.vertices) {
      if (id === skipLast) continue
      const world = v.position.clone().applyMatrix4(worldMat)
      const s = ScreenGeometry.worldToScreen(world, this.ctx.camera, rect, this.ctx.quadrant)
      const d = Math.hypot(s.x - pointer.x, s.y - pointer.y)
      if (d <= best) {
        best = d
        bestId = id
      }
    }
    return bestId
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
    const rect = this.ctx.viewportElement.getBoundingClientRect()
    const ray = ScreenGeometry.screenToRay(this.currentMouse, this.ctx.camera, rect, this.ctx.quadrant)
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

  private refreshChainScreen(rect: DOMRect) {
    this.screenPoints = this.chain.map(p => {
      const w = this.vertWorld(p.vertId)!
      return ScreenGeometry.worldToScreen(w, this.ctx.camera, rect, this.ctx.quadrant)
    })
    if (this.hoverScreen) this.screenPoints = [...this.screenPoints, this.hoverScreen]

    const loopIds = this.uniqueChainIds()
    this.previewFaceScreen = []
    if (loopIds.length >= 2 && this.hoverScreen && this.hoverKind !== 'close') {
      const extra = this.hoverExistingId
      const ids = extra != null && !loopIds.includes(extra) ? [...loopIds, extra] : loopIds
      if (ids.length >= 3) {
        this.previewFaceScreen = ids.map(id => {
          const w = this.vertWorld(id)!
          return ScreenGeometry.worldToScreen(w, this.ctx.camera, rect, this.ctx.quadrant)
        })
        if (this.hoverKind === 'new' && this.hoverScreen) {
          this.previewFaceScreen = [
            ...loopIds.map(id => ScreenGeometry.worldToScreen(this.vertWorld(id)!, this.ctx.camera, rect, this.ctx.quadrant)),
            this.hoverScreen
          ]
        }
      }
    } else if (this.hoverKind === 'close' && loopIds.length >= 3) {
      this.previewFaceScreen = loopIds.map(id => {
        const w = this.vertWorld(id)!
        return ScreenGeometry.worldToScreen(w, this.ctx.camera, rect, this.ctx.quadrant)
      })
    }
  }

  private updatePreview() {
    if (!this.ctx.previewGroup) return
    this.disposePreview()
    const pts: THREE.Vector3[] = []
    for (const p of this.chain) {
      const w = this.vertWorld(p.vertId)
      if (w) pts.push(w)
    }
    if (this.hoverWorld) pts.push(this.hoverWorld)

    if (pts.length >= 2) {
      const positions: number[] = []
      for (let i = 0; i < pts.length - 1; i++) {
        positions.push(pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z)
      }
      if (this.hoverKind === 'close' && pts.length >= 3) {
        const first = pts[0]
        const last = pts[pts.length - 1]
        positions.push(last.x, last.y, last.z, first.x, first.y, first.z)
      }
      const color = this.hoverKind === 'close' ? 0x34d399 : this.hoverSnapped ? 0x38bdf8 : 0xf59e0b
      this.previewLine = ScreenGeometry.dashedPreviewLine(positions, color)
      this.ctx.previewGroup.add(this.previewLine)
    }
  }

  private disposePreview() {
    if (this.previewLine) {
      this.previewLine.geometry.dispose()
      ;(this.previewLine.material as THREE.Material).dispose()
      this.previewLine.removeFromParent()
      this.previewLine = null
    }
  }
}
