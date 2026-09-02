import * as THREE from 'three'
import { EditableMesh, MeshSnapshot } from '../mesh/MeshKernel'
import { NumericInput } from '../transform/NumericInput'
import { SnapManager } from '../transform/SnapManager'
import { applyLiveSymmetry } from '../transform/LiveSymmetry'
import { AxisConstraint, TransformOrientation, PivotMode } from '../transform/TransformTypes'
import type { ViewQuadrant } from '../geometry/ScreenGeometry'
import { ScreenGeometry } from '../geometry/ScreenGeometry'

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
  allMeshes?: any[]
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
  /** Object TRS so G/R/S run in world space then write local verts. */
  objectMatrix?: THREE.Matrix4
  /** Initial G/R/S space from the viewport header (X still cycles). */
  startOrientation?: TransformOrientation
  cursorWorld?: THREE.Vector3
  /** Orbit pivot — used as the 3D work-plane depth in perspective. */
  orbitTarget?: THREE.Vector3
  objectEuler?: THREE.Euler
  onUpdatePreview: () => void
  onCommit: (actionName: string) => void
  onCancel: () => void
}

export abstract class ModalOperator {
  abstract readonly name: string
  protected ctx!: OperatorContext
  protected initialSnapshot!: MeshSnapshot
  protected initialVertices = new Map<number, THREE.Vector3>()
  protected pivot = new THREE.Vector3()
  protected pivotScreen = { x: 0, y: 0 }

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

    this.initPivot()
    this.numericInput.reset()
    this.updateStatus()
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
    const positions: THREE.Vector3[] = []
    for (const vid of this.collectTargetVertIds()) {
      const p = this.initialVertices.get(vid)
      if (p) positions.push(p)
    }

    this.pivot.set(0, 0, 0)
    if (this.ctx.pivotMode === 'CURSOR' && this.ctx.cursorWorld) {
      this.pivot.copy(this.ctx.cursorWorld)
    } else if (this.ctx.pivotMode === 'ACTIVE_ELEMENT') {
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

    const rect = this.ctx.viewportElement.getBoundingClientRect()
    const screen = ScreenGeometry.worldToScreen(this.pivot, this.ctx.camera, rect, this.ctx.quadrant)
    this.pivotScreen = { x: screen.x, y: screen.y }
  }

  protected restoreSnapshot() {
    this.ctx.mesh.restoreSnapshot(this.initialSnapshot)
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
