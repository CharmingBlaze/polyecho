import * as THREE from 'three'
import type { MeshObject } from '../../types/mesh'
import { EditableMesh, MeshSnapshot } from '../mesh/MeshKernel'
import { NumericInput } from '../transform/NumericInput'
import { SnapManager } from '../transform/SnapManager'
import { applyLiveSymmetry } from '../transform/LiveSymmetry'
import { AxisConstraint, TransformOrientation, PivotMode } from '../transform/TransformTypes'
import { PivotManager } from '../transform/PivotManager'
import type { ViewQuadrant } from '../geometry/ScreenGeometry'
import { ScreenGeometry } from '../geometry/ScreenGeometry'
import { applyWorldDeltaToObjectTRS, type ObjectGizmoStartTRS } from '../geometry/MeshTransform'

export interface OperatorContext {
  mesh: EditableMesh
  selectedVertIds: number[]
  selectedFaceIds: number[]
  selectedEdgeIds: number[]
  selectedMeshIds: string[]
  isObjectMode: boolean
  camera: THREE.Camera
  viewportElement: HTMLElement
  pivotMode: PivotMode
  previewGroup?: THREE.Group
  sceneGroup?: THREE.Group
  allMeshes?: MeshObject[]
  viewportKind?: 'persp' | 'top' | 'front' | 'right'
  quadrant?: ViewQuadrant
  /** World units for incremental snap (from toolStore.snapping). */
  gridSize?: number
  snapGrid?: boolean
  snapVertex?: boolean
  snapEdge?: boolean
  snapFace?: boolean
  symmetryX?: boolean
  symmetryY?: boolean
  symmetryZ?: boolean
  /** Object TRS so edit-mode G/R/S run in world space then write local verts. */
  objectMatrix?: THREE.Matrix4
  /** Initial G/R/S space from the viewport header (X still cycles). */
  startOrientation?: TransformOrientation
  cursorWorld?: THREE.Vector3
  /** Orbit pivot — used as the 3D work-plane depth in perspective. */
  orbitTarget?: THREE.Vector3
  objectEuler?: THREE.Euler
  onUpdatePreview: () => void
  onCommit: (actionName: string) => void
  /** Rejected commits follow the operator's normal cancel/rollback path. */
  validateCommit?: () => boolean
  onCancel: () => void
  /** Document id currently bound to `mesh` (Knife / Loop Cut retarget). */
  targetMeshId?: string
  /** Rebuild `mesh` + `objectMatrix` for another object. Returns false if skipped. */
  adoptMesh?: (meshId: string) => boolean
}

export abstract class ModalOperator {
  abstract readonly name: string
  protected ctx!: OperatorContext
  protected initialSnapshot!: MeshSnapshot
  protected initialVertices = new Map<number, THREE.Vector3>()
  protected objectStarts = new Map<string, ObjectGizmoStartTRS>()
  protected pivot = new THREE.Vector3()
  protected pivotScreen = { x: 0, y: 0 }
  private objectDeltaPos = new THREE.Vector3()
  private objectDeltaQuat = new THREE.Quaternion()
  private objectDeltaScale = new THREE.Vector3()
  private objectDeltaMat = new THREE.Matrix4()

  protected startMouse = { x: 0, y: 0 }
  protected currentMouse = { x: 0, y: 0 }

  protected constraint: AxisConstraint = 'FREE'
  protected orientation: TransformOrientation = 'GLOBAL'

  protected numericInput = new NumericInput()
  protected snapManager = new SnapManager()
  protected worldToLocal = new THREE.Matrix4()

  protected isShiftHeld = false
  protected isCtrlHeld = false

  public statusText = ''

  begin(ctx: OperatorContext, startPointer: { x: number; y: number }) {
    this.ctx = ctx
    this.initialSnapshot = ctx.mesh.createSnapshot()

    for (const [id, v] of ctx.mesh.vertices) {
      this.initialVertices.set(id, v.position.clone())
    }

    const worldMat = ctx.objectMatrix?.clone() ?? new THREE.Matrix4()
    this.worldToLocal.copy(worldMat).invert()
    for (const pos of this.initialVertices.values()) {
      pos.applyMatrix4(worldMat)
    }

    this.startMouse = { x: startPointer.x, y: startPointer.y }
    this.currentMouse = { x: startPointer.x, y: startPointer.y }

    if (ctx.startOrientation) this.orientation = ctx.startOrientation

    this.captureObjectStarts()
    this.initPivot()
    this.numericInput.reset()
    this.updateStatus()
  }

  protected objectTargetIds(): string[] {
    if (this.ctx.selectedMeshIds.length > 0) return this.ctx.selectedMeshIds
    return this.ctx.targetMeshId ? [this.ctx.targetMeshId] : []
  }

  protected captureObjectStarts() {
    this.objectStarts.clear()
    if (!this.ctx.isObjectMode || !this.ctx.allMeshes) return
    const ids = new Set(this.objectTargetIds())
    for (const meshObj of this.ctx.allMeshes) {
      if (!ids.has(meshObj.id)) continue
      this.objectStarts.set(meshObj.id, {
        position: new THREE.Vector3(meshObj.position.x, meshObj.position.y, meshObj.position.z),
        rotation: new THREE.Euler(
          THREE.MathUtils.degToRad(meshObj.rotation.x),
          THREE.MathUtils.degToRad(meshObj.rotation.y),
          THREE.MathUtils.degToRad(meshObj.rotation.z)
        ),
        scale: new THREE.Vector3(meshObj.scale.x, meshObj.scale.y, meshObj.scale.z)
      })
    }
  }

  protected restoreObjectTRS() {
    for (const meshObj of this.ctx.allMeshes ?? []) {
      const start = this.objectStarts.get(meshObj.id)
      if (!start) continue
      meshObj.position.x = start.position.x
      meshObj.position.y = start.position.y
      meshObj.position.z = start.position.z
      meshObj.rotation.x = THREE.MathUtils.radToDeg(start.rotation.x)
      meshObj.rotation.y = THREE.MathUtils.radToDeg(start.rotation.y)
      meshObj.rotation.z = THREE.MathUtils.radToDeg(start.rotation.z)
      meshObj.scale.x = start.scale.x
      meshObj.scale.y = start.scale.y
      meshObj.scale.z = start.scale.z
    }
  }

  protected applyObjectWorldDelta(deltaMatrix: THREE.Matrix4) {
    for (const meshObj of this.ctx.allMeshes ?? []) {
      const start = this.objectStarts.get(meshObj.id)
      if (!start) continue
      const euler = applyWorldDeltaToObjectTRS(
        start,
        deltaMatrix,
        this.objectDeltaPos,
        this.objectDeltaQuat,
        this.objectDeltaScale
      )
      meshObj.position.x = this.objectDeltaPos.x
      meshObj.position.y = this.objectDeltaPos.y
      meshObj.position.z = this.objectDeltaPos.z
      meshObj.rotation.x = THREE.MathUtils.radToDeg(euler.x)
      meshObj.rotation.y = THREE.MathUtils.radToDeg(euler.y)
      meshObj.rotation.z = THREE.MathUtils.radToDeg(euler.z)
      meshObj.scale.x = this.objectDeltaScale.x
      meshObj.scale.y = this.objectDeltaScale.y
      meshObj.scale.z = this.objectDeltaScale.z
    }
  }

  protected applyObjectTranslation(delta: THREE.Vector3) {
    this.applyObjectWorldDelta(this.objectDeltaMat.makeTranslation(delta.x, delta.y, delta.z))
  }

  protected applyObjectRotation(q: THREE.Quaternion) {
    const t = new THREE.Matrix4().makeTranslation(this.pivot.x, this.pivot.y, this.pivot.z)
    const r = new THREE.Matrix4().makeRotationFromQuaternion(q)
    const ti = new THREE.Matrix4().makeTranslation(-this.pivot.x, -this.pivot.y, -this.pivot.z)
    this.applyObjectWorldDelta(t.multiply(r).multiply(ti))
  }

  protected applyObjectScale(sx: number, sy: number, sz: number) {
    const basis = PivotManager.getBasis(this.orientation, this.ctx.camera, undefined, this.ctx.objectEuler)
    const rot = new THREE.Matrix4().makeBasis(basis.x, basis.y, basis.z)
    const rotI = rot.clone().invert()
    const s = new THREE.Matrix4().makeScale(sx, sy, sz)
    const t = new THREE.Matrix4().makeTranslation(this.pivot.x, this.pivot.y, this.pivot.z)
    const ti = new THREE.Matrix4().makeTranslation(-this.pivot.x, -this.pivot.y, -this.pivot.z)
    this.applyObjectWorldDelta(t.multiply(rot).multiply(s).multiply(rotI).multiply(ti))
  }

  protected collectTargetVertIds(): Set<number> {
    const ids = new Set<number>()
    for (const vid of this.ctx.selectedVertIds) ids.add(vid)
    for (const fId of this.ctx.selectedFaceIds) {
      const f = this.ctx.mesh.faces.get(fId)
      if (f) f.vertexIds.forEach(vid => ids.add(vid))
    }
    for (const eId of this.ctx.selectedEdgeIds) {
      const e = this.ctx.mesh.edges.get(eId)
      if (e) {
        ids.add(e.v1)
        ids.add(e.v2)
      }
    }
    return ids
  }

  protected writeWorldPos(vId: number, world: THREE.Vector3) {
    const v = this.ctx.mesh.vertices.get(vId)
    if (!v) return
    v.position.copy(world).applyMatrix4(this.worldToLocal)
  }

  protected applyLiveSymmetry() {
    if (this.ctx.isObjectMode) return
    applyLiveSymmetry(
      [...this.ctx.mesh.vertices.values()].map(v => ({ id: v.id, position: v.position })),
      this.collectTargetVertIds(),
      {
        x: this.ctx.symmetryX,
        y: this.ctx.symmetryY,
        z: this.ctx.symmetryZ,
      }
    )
  }

  protected initPivot() {
    this.pivot.set(0, 0, 0)
    if (this.ctx.pivotMode === 'CURSOR' && this.ctx.cursorWorld) {
      this.pivot.copy(this.ctx.cursorWorld)
    } else if (this.ctx.isObjectMode && this.objectStarts.size > 0) {
      const active = this.ctx.pivotMode === 'ACTIVE_ELEMENT' && this.ctx.targetMeshId
        ? this.objectStarts.get(this.ctx.targetMeshId)
        : undefined
      if (active) this.pivot.copy(active.position)
      else {
        for (const start of this.objectStarts.values()) this.pivot.add(start.position)
        this.pivot.divideScalar(this.objectStarts.size)
      }
    } else {
      const positions: THREE.Vector3[] = []
      for (const vid of this.collectTargetVertIds()) {
        const p = this.initialVertices.get(vid)
        if (p) positions.push(p)
      }

      if (this.ctx.pivotMode === 'ACTIVE_ELEMENT') {
        const last = this.ctx.selectedVertIds[this.ctx.selectedVertIds.length - 1]
        const active = last != null ? this.initialVertices.get(last) : undefined
        if (active) this.pivot.copy(active)
        else if (positions.length > 0) {
          positions.forEach(p => this.pivot.add(p))
          this.pivot.divideScalar(positions.length)
        }
      } else if (positions.length > 0) {
        positions.forEach(p => this.pivot.add(p))
        this.pivot.divideScalar(positions.length)
      }
    }

    const rect = this.ctx.viewportElement.getBoundingClientRect()
    const screen = ScreenGeometry.worldToScreen(this.pivot, this.ctx.camera, rect, this.ctx.quadrant)
    this.pivotScreen = { x: screen.x, y: screen.y }
  }

  protected restoreSnapshot() {
    this.ctx.mesh.restoreSnapshot(this.initialSnapshot)
    this.restoreObjectTRS()
  }

  pointerMove(event: PointerEvent) {
    this.currentMouse = { x: event.clientX, y: event.clientY }
    this.isShiftHeld = event.shiftKey
    this.isCtrlHeld = event.ctrlKey

    this.evaluate()
    this.ctx.onUpdatePreview()
    this.updateStatus()
  }

  keyDown(event: KeyboardEvent): boolean {
    const key = event.key

    // Handle direct numerical typing
    if (this.numericInput.handleKey(key)) {
      event.preventDefault()
      this.evaluate()
      this.ctx.onUpdatePreview()
      this.updateStatus()
      return true
    }

    const lowerKey = key.toLowerCase()

    // Axis constraints: X, Y, Z, Shift+X (YZ), Shift+Y (XZ), Shift+Z (XY)
    if (lowerKey === 'x' || lowerKey === 'y' || lowerKey === 'z') {
      event.preventDefault()
      const axis = lowerKey.toUpperCase() as 'X' | 'Y' | 'Z'
      if (event.shiftKey) {
        // Plane exclusion
        const plane = axis === 'X' ? 'YZ' : axis === 'Y' ? 'XZ' : 'XY'
        this.constraint = this.constraint === plane ? 'FREE' : plane
      } else {
        // Multi-tap cycle: Global -> Local -> Free
        if (this.constraint === axis && this.orientation === 'GLOBAL') {
          this.orientation = 'LOCAL'
        } else if (this.constraint === axis && this.orientation === 'LOCAL') {
          this.constraint = 'FREE'
          this.orientation = 'GLOBAL'
        } else {
          this.constraint = axis
          this.orientation = 'GLOBAL'
        }
      }
      this.evaluate()
      this.ctx.onUpdatePreview()
      this.updateStatus()
      return true
    }

    if (key === 'Enter') {
      event.preventDefault()
      this.confirm()
      return true
    }

    if (key === 'Escape') {
      event.preventDefault()
      this.cancel()
      return true
    }

    return false
  }

  wheel(_event: WheelEvent): boolean {
    return false
  }

  syncPointerFromEvent(e: { clientX: number; clientY: number }) {
    this.currentMouse = { x: e.clientX, y: e.clientY }
  }

  handlePointerDown(_button: number): boolean {
    return false
  }

  confirm() {
    this.ctx.onCommit(this.name)
  }

  cancel() {
    this.restoreSnapshot()
    this.ctx.onCancel()
  }

  abstract evaluate(): void
  abstract updateStatus(): void
}
