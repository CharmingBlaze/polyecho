import * as THREE from 'three'
import { ModalOperator } from './ModalOperator'
import { TransformSolver } from '../transform/TransformSolver'
import { PivotManager } from '../transform/PivotManager'

export class ScaleOperator extends ModalOperator {
  readonly name = 'Scale'
  protected usesProportional = true

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

    if (this.ctx.isObjectMode) {
      let sx = factor, sy = factor, sz = factor
      if (this.constraint === 'X') { sy = 1; sz = 1 }
      else if (this.constraint === 'Y') { sx = 1; sz = 1 }
      else if (this.constraint === 'Z') { sx = 1; sy = 1 }
      else if (this.constraint === 'XY') sz = 1
      else if (this.constraint === 'XZ') sy = 1
      else if (this.constraint === 'YZ') sx = 1
      this.applyObjectScale(sx, sy, sz)
      return
    }

    this.restoreEditPositions()
    const targetVertIds = this.collectTargetVertIds()
    const weights = this.falloffWeights(targetVertIds)

    for (const [vId, initPos] of this.initialVertices) {
      const w = weights ? (weights.get(vId) ?? 0) : (targetVertIds.has(vId) ? 1 : 0)
      if (w <= 1e-6) continue
      const amount = 1 + (factor - 1) * w
      const rel = initPos.clone().sub(this.pivot)

      const local = new THREE.Vector3(
        rel.dot(basis.x),
        rel.dot(basis.y),
        rel.dot(basis.z)
      )

      if (this.constraint === 'X') {
        local.x *= amount
      } else if (this.constraint === 'Y') {
        local.y *= amount
      } else if (this.constraint === 'Z') {
        local.z *= amount
      } else if (this.constraint === 'XY') {
        local.x *= amount
        local.y *= amount
      } else if (this.constraint === 'XZ') {
        local.x *= amount
        local.z *= amount
      } else if (this.constraint === 'YZ') {
        local.y *= amount
        local.z *= amount
      } else {
        local.multiplyScalar(amount)
      }

      const world = this.pivot.clone()
        .add(basis.x.clone().multiplyScalar(local.x))
        .add(basis.y.clone().multiplyScalar(local.y))
        .add(basis.z.clone().multiplyScalar(local.z))

      this.writeWorldPos(vId, world)
    }

    this.applyLiveSymmetry()
    this.ctx.mesh.recalculateNormals()
  }

  updateStatus() {
    const constraintText = this.constraint !== 'FREE' ? ` ${this.constraint} (${this.orientation})` : ''
    const num = this.numericInput.text ? `: ${this.numericInput.text}` : ''
    this.statusText = `Scale${constraintText}${num}${this.proportionalStatus()}`
  }
}
