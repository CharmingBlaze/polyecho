import * as THREE from 'three'
import { EditableMesh, MeshSnapshot } from '../mesh/MeshKernel'
import { NumericInput } from '../transform/NumericInput'
import { SnapManager } from '../transform/SnapManager'
import { AxisConstraint, TransformOrientation, PivotMode } from '../transform/TransformTypes'

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
  quadrant?: 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right' | 'main'
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

  protected isShiftHeld = false
  protected isCtrlHeld = false

  public statusText = ''

  begin(ctx: OperatorContext, startPointer: { x: number; y: number }) {
    this.ctx = ctx
    this.initialSnapshot = ctx.mesh.createSnapshot()

    for (const [id, v] of ctx.mesh.vertices) {
      this.initialVertices.set(id, v.position.clone())
    }

    this.startMouse = { x: startPointer.x, y: startPointer.y }
    this.currentMouse = { x: startPointer.x, y: startPointer.y }

    this.initPivot()
    this.numericInput.reset()
    this.updateStatus()
  }

  protected initPivot() {
    const positions: THREE.Vector3[] = []
    if (this.ctx.selectedFaceIds.length > 0) {
      for (const fId of this.ctx.selectedFaceIds) {
        const f = this.ctx.mesh.faces.get(fId)
        if (f) {
          f.vertexIds.forEach(vid => {
            const v = this.ctx.mesh.vertices.get(vid)
            if (v) positions.push(v.position)
          })
        }
      }
    } else if (this.ctx.selectedVertIds.length > 0) {
      for (const vid of this.ctx.selectedVertIds) {
        const v = this.ctx.mesh.vertices.get(vid)
        if (v) positions.push(v.position)
      }
    }

    this.pivot.set(0, 0, 0)
    if (positions.length > 0) {
      positions.forEach(p => this.pivot.add(p))
      this.pivot.divideScalar(positions.length)
    }

    // Project pivot to screen
    const rect = this.ctx.viewportElement.getBoundingClientRect()
    const proj = this.pivot.clone().project(this.ctx.camera)
    this.pivotScreen = {
      x: (proj.x * 0.5 + 0.5) * (rect.width || window.innerWidth) + (rect.left || 0),
      y: (-(proj.y * 0.5) + 0.5) * (rect.height || window.innerHeight) + (rect.top || 0)
    }
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
