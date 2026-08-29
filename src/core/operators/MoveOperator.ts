import * as THREE from 'three'
import { ModalOperator } from './ModalOperator'
import { TransformSolver } from '../transform/TransformSolver'
import { PivotManager } from '../transform/PivotManager'

export class MoveOperator extends ModalOperator {
  readonly name = 'Move'

  private startRay = new THREE.Ray()
  private currentRay = new THREE.Ray()
  private startHit = new THREE.Vector3()
  private currentHit = new THREE.Vector3()

  begin(ctx: any, startPointer: { x: number; y: number }) {
    super.begin(ctx, startPointer)

    const rect = this.ctx.viewportElement.getBoundingClientRect()
    const cW = rect.width || window.innerWidth
    const cH = rect.height || window.innerHeight

    // Build start ray
    const ndcStart = new THREE.Vector2(
      ((this.startMouse.x - rect.left) / cW) * 2 - 1,
      -((this.startMouse.y - rect.top) / cH) * 2 + 1
    )
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(ndcStart, this.ctx.camera)
    this.startRay.copy(raycaster.ray)

    const hit = TransformSolver.rayPlaneIntersect(this.startRay, this.pivot, this.ctx.camera)
    if (hit) this.startHit.copy(hit)
  }

  evaluate() {
    const rect = this.ctx.viewportElement.getBoundingClientRect()
    const cW = rect.width || window.innerWidth
    const cH = rect.height || window.innerHeight

    // Build current ray
    const ndcCur = new THREE.Vector2(
      ((this.currentMouse.x - rect.left) / cW) * 2 - 1,
      -((this.currentMouse.y - rect.top) / cH) * 2 + 1
    )
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(ndcCur, this.ctx.camera)
    this.currentRay.copy(raycaster.ray)

    const hit = TransformSolver.rayPlaneIntersect(this.currentRay, this.pivot, this.ctx.camera)
    if (hit) this.currentHit.copy(hit)

    const basis = PivotManager.getBasis(this.orientation, this.ctx.camera)
    const numVal = this.numericInput.getValue()

    let delta = TransformSolver.solveMoveDelta(
      this.startHit,
      this.currentHit,
      this.startRay,
      this.currentRay,
      this.pivot,
      basis,
      this.constraint,
      numVal
    )

    if (this.isShiftHeld && numVal === null) {
      delta.multiplyScalar(0.2)
    }

    if (this.isCtrlHeld && numVal === null) {
      delta.x = this.snapManager.snapLinear(delta.x, 0.5)
      delta.y = this.snapManager.snapLinear(delta.y, 0.5)
      delta.z = this.snapManager.snapLinear(delta.z, 0.5)
    }

    // Apply delta to initial vertex positions
    const targetVertIds = new Set<number>()
    if (this.ctx.selectedFaceIds.length > 0) {
      for (const fId of this.ctx.selectedFaceIds) {
        const face = this.ctx.mesh.faces.get(fId)
        if (face) face.vertexIds.forEach(vid => targetVertIds.add(vid))
      }
    } else {
      this.ctx.selectedVertIds.forEach((vid: number) => targetVertIds.add(vid))
    }

    for (const [vId, v] of this.ctx.mesh.vertices) {
      if (targetVertIds.has(vId)) {
        const initPos = this.initialVertices.get(vId)
        if (initPos) {
          v.position.copy(initPos).add(delta)
        }
      }
    }

    this.ctx.mesh.recalculateNormals()
  }

  updateStatus() {
    const constraintText = this.constraint !== 'FREE' ? ` ${this.constraint} (${this.orientation})` : ''
    const num = this.numericInput.text ? `: ${this.numericInput.text}` : ''
    this.statusText = `Move${constraintText}${num}`
  }
}
