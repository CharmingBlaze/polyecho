import * as THREE from 'three'
import { ModalOperator } from './ModalOperator'
import { TransformSolver } from '../transform/TransformSolver'
import { PivotManager } from '../transform/PivotManager'

export class RotateOperator extends ModalOperator {
  readonly name = 'Rotate'
  private isTrackball = false

  keyDown(event: KeyboardEvent): boolean {
    if (event.key.toLowerCase() === 'r') {
      event.preventDefault()
      this.isTrackball = !this.isTrackball
      this.evaluate()
      this.ctx.onUpdatePreview()
      this.updateStatus()
      return true
    }
    return super.keyDown(event)
  }

  evaluate() {
    const numDeg = this.numericInput.getValue()
    let angleRad = TransformSolver.solveRotationAngle(
      this.startMouse,
      this.currentMouse,
      this.pivotScreen,
      numDeg
    )

    if (this.isShiftHeld && numDeg === null) {
      angleRad *= 0.2
    }

    if (this.isCtrlHeld && numDeg === null) {
      const deg = THREE.MathUtils.radToDeg(angleRad)
      angleRad = THREE.MathUtils.degToRad(this.snapManager.snapAngle(deg, 5))
    }

    const basis = PivotManager.getBasis(this.orientation, this.ctx.camera)
    let rotAxis = basis.z.clone() // Default view plane normal

    if (this.constraint === 'X') rotAxis = basis.x.clone()
    else if (this.constraint === 'Y') rotAxis = basis.y.clone()
    else if (this.constraint === 'Z') rotAxis = basis.z.clone()

    const q = new THREE.Quaternion().setFromAxisAngle(rotAxis, angleRad)

    const targetVertIds = this.collectTargetVertIds()

    for (const [vId] of this.ctx.mesh.vertices) {
      if (targetVertIds.has(vId)) {
        const initPos = this.initialVertices.get(vId)
        if (initPos) {
          const rel = initPos.clone().sub(this.pivot).applyQuaternion(q)
          this.writeWorldPos(vId, this.pivot.clone().add(rel))
        }
      }
    }

    this.ctx.mesh.recalculateNormals()
  }

  updateStatus() {
    const mode = this.isTrackball ? ' (Trackball)' : this.constraint !== 'FREE' ? ` ${this.constraint} (${this.orientation})` : ''
    const num = this.numericInput.text ? `: ${this.numericInput.text}°` : ''
    this.statusText = `Rotate${mode}${num}`
  }
}
