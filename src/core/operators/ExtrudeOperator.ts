import * as THREE from 'three'
import { ModalOperator, OperatorContext } from './ModalOperator'
import { ExtrudeKernel, ExtrudeResult } from '../mesh/operations/ExtrudeKernel'
import { TransformSolver } from '../transform/TransformSolver'
import { PivotManager } from '../transform/PivotManager'
import { ScreenGeometry } from '../geometry/ScreenGeometry'

export class ExtrudeOperator extends ModalOperator {
  readonly name = 'Extrude'

  private individual = false
  private extrudeResult: ExtrudeResult | null = null
  private normal = new THREE.Vector3(0, 1, 0)
  private startRay = new THREE.Ray()
  private currentRay = new THREE.Ray()
  private startedAt = 0
  private lastDist = 0

  constructor(individual = false) {
    super()
    this.individual = individual
  }

  begin(ctx: OperatorContext, startPointer: { x: number; y: number }) {
    super.begin(ctx, startPointer)
    this.startedAt = performance.now()
    this.startRay.copy(this.pointerRay(startPointer))
    this.evaluate()
    this.ctx.onUpdatePreview()
    this.updateStatus()
  }

  keyDown(event: KeyboardEvent): boolean {
    const k = event.key.toLowerCase()
    if (k === 'i' && !event.altKey) {
      event.preventDefault()
      if (performance.now() - this.startedAt < 80) return true
      this.individual = !this.individual
      this.evaluate()
      this.ctx.onUpdatePreview()
      this.updateStatus()
      return true
    }
    return super.keyDown(event)
  }

  evaluate() {
    this.restoreSnapshot()

    this.extrudeResult = ExtrudeKernel.extrude(this.ctx.mesh, {
      individual: this.individual,
      faceIds: this.ctx.selectedFaceIds,
      edgeIds: this.ctx.selectedEdgeIds,
      vertexIds: this.ctx.selectedFaceIds.length || this.ctx.selectedEdgeIds.length
        ? []
        : this.ctx.selectedVertIds,
    })

    const worldMat = this.ctx.objectMatrix?.clone() ?? new THREE.Matrix4()
    this.worldToLocal.copy(worldMat).invert()
    this.normal.copy(this.extrudeResult.regionNormal).transformDirection(worldMat).normalize()
    if (this.normal.lengthSq() < 1e-8) this.normal.set(0, 1, 0)

    this.pivot.set(0, 0, 0)
    let count = 0
    const restWorld = new Map<number, THREE.Vector3>()
    for (const vId of this.extrudeResult.newVertexIds) {
      const v = this.ctx.mesh.vertices.get(vId)
      if (!v) continue
      const w = v.position.clone().applyMatrix4(worldMat)
      restWorld.set(vId, w)
      this.pivot.add(w)
      count++
    }
    if (count > 0) this.pivot.divideScalar(count)

    this.currentRay.copy(this.pointerRay(this.currentMouse))
    const basis = PivotManager.getBasis(this.orientation, this.ctx.camera, this.normal, this.ctx.objectEuler)
    const numVal = this.numericInput.getValue()

    let moveDir = this.normal.clone()
    if (this.constraint === 'X') moveDir = basis.x.clone()
    else if (this.constraint === 'Y') moveDir = basis.y.clone()
    else if (this.constraint === 'Z') moveDir = basis.z.clone()
    else if (this.constraint === 'XY' || this.constraint === 'XZ' || this.constraint === 'YZ') {
      moveDir = this.normal.clone()
    }

    let dist = 0
    if (numVal !== null) {
      dist = numVal
    } else {
      const tStart = TransformSolver.rayLineClosestPoint(this.startRay, this.pivot, moveDir)
      const tCur = TransformSolver.rayLineClosestPoint(this.currentRay, this.pivot, moveDir)
      dist = tCur - tStart
      if (!isFinite(dist)) dist = 0
      if (Math.abs(dist) < 1e-6) {
        const hitStart = TransformSolver.rayPlaneIntersect(this.startRay, this.pivot, this.ctx.camera)
        const hitCur = TransformSolver.rayPlaneIntersect(this.currentRay, this.pivot, this.ctx.camera)
        if (hitStart && hitCur) dist = hitCur.sub(hitStart).dot(moveDir)
      }
    }

    if (this.isShiftHeld && numVal === null) dist *= 0.2
    if (this.isCtrlHeld && numVal === null) {
      dist = this.snapManager.snapLinear(dist, this.ctx.gridSize || 0.1)
    }
    this.lastDist = dist

    const delta = moveDir.multiplyScalar(dist)
    for (const vId of this.extrudeResult.newVertexIds) {
      const rest = restWorld.get(vId)
      if (!rest) continue
      this.writeWorldPos(vId, rest.clone().add(delta))
    }

    this.ctx.mesh.recalculateNormals()
  }

  confirm() {
    if (!this.extrudeResult || this.extrudeResult.newVertexIds.length === 0) {
      this.cancel()
      return
    }
    this.ctx.selectedFaceIds = [...this.extrudeResult.extrudedFaceIds]
    this.ctx.selectedVertIds = [...this.extrudeResult.newVertexIds]
    super.confirm()
  }

  private pointerRay(pointer: { x: number; y: number }): THREE.Ray {
    return ScreenGeometry.rayFromClient(
      pointer,
      this.ctx.camera,
      this.ctx.viewportElement,
      this.ctx.quadrant
    )
  }

  updateStatus() {
    const kind = this.individual ? 'Individual' : 'Region'
    const axis = this.constraint !== 'FREE' ? ` ${this.constraint}` : ' Normal'
    const num = this.numericInput.text ? `: ${this.numericInput.text}` : ` ${this.lastDist.toFixed(3)}`
    this.statusText = `Extrude ${kind}${axis}${num}  (I individual · LMB confirm · Esc cancel)`
  }
}
