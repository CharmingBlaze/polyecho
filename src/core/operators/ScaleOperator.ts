import * as THREE from 'three'
import { ModalOperator } from './ModalOperator'
import { TransformSolver } from '../transform/TransformSolver'
import { PivotManager } from '../transform/PivotManager'

export class ScaleOperator extends ModalOperator {
  readonly name = 'Scale'

  evaluate() {
    const numFactor = this.numericInput.getValue()
    let factor = TransformSolver.solveScaleFactor(
      this.startMouse,
      this.currentMouse,
      this.pivotScreen,
      numFactor
    )

    if (this.isShiftHeld && numFactor === null) {
      factor = 1 + (factor - 1) * 0.2
    }

    if (this.isCtrlHeld && numFactor === null) {
      factor = this.snapManager.snapScale(factor, 0.1)
    }

    const basis = PivotManager.getBasis(this.orientation, this.ctx.camera, undefined, this.ctx.objectEuler)

    const targetVertIds = this.collectTargetVertIds()

    for (const [vId] of this.ctx.mesh.vertices) {
      if (targetVertIds.has(vId)) {
        const initPos = this.initialVertices.get(vId)
        if (initPos) {
          const rel = initPos.clone().sub(this.pivot)

          // Transform into orientation basis
          const local = new THREE.Vector3(
            rel.dot(basis.x),
            rel.dot(basis.y),
            rel.dot(basis.z)
          )

          if (this.constraint === 'X') {
            local.x *= factor
          } else if (this.constraint === 'Y') {
            local.y *= factor
          } else if (this.constraint === 'Z') {
            local.z *= factor
          } else if (this.constraint === 'XY') {
            local.x *= factor
            local.y *= factor
          } else if (this.constraint === 'XZ') {
            local.x *= factor
            local.z *= factor
          } else if (this.constraint === 'YZ') {
            local.y *= factor
            local.z *= factor
          } else {
            local.multiplyScalar(factor)
          }

          const world = this.pivot.clone()
            .add(basis.x.clone().multiplyScalar(local.x))
            .add(basis.y.clone().multiplyScalar(local.y))
            .add(basis.z.clone().multiplyScalar(local.z))

          this.writeWorldPos(vId, world)
        }
      }
    }

    this.applyLiveSymmetry()
    this.ctx.mesh.recalculateNormals()
  }

  updateStatus() {
    const constraintText = this.constraint !== 'FREE' ? ` ${this.constraint} (${this.orientation})` : ''
    const num = this.numericInput.text ? `: ${this.numericInput.text}` : ''
    this.statusText = `Scale${constraintText}${num}`
  }
}
