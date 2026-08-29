import { ModalOperator } from './ModalOperator'
import { BevelKernel, BevelResult } from '../mesh/operations/BevelKernel'

export class BevelOperator extends ModalOperator {
  readonly name = 'Bevel'

  private segments = 1
  private lastResult: BevelResult | null = null

  wheel(event: WheelEvent): boolean {
    event.preventDefault()
    if (event.deltaY < 0) {
      this.segments = Math.min(8, this.segments + 1)
    } else {
      this.segments = Math.max(1, this.segments - 1)
    }
    this.evaluate()
    this.ctx.onUpdatePreview()
    this.updateStatus()
    return true
  }

  evaluate() {
    this.restoreSnapshot()

    const numWidth = this.numericInput.getValue()

    const startDist = Math.hypot(this.startMouse.x - this.pivotScreen.x, this.startMouse.y - this.pivotScreen.y) || 50
    const curDist = Math.hypot(this.currentMouse.x - this.pivotScreen.x, this.currentMouse.y - this.pivotScreen.y)

    let width = numWidth !== null
      ? numWidth
      : Math.abs(curDist - startDist) / (this.isShiftHeld ? 400 : 120)

    if (this.isCtrlHeld && numWidth === null) {
      width = this.snapManager.snapLinear(width, 0.05)
    }

    this.lastResult = BevelKernel.bevelFaces(this.ctx.mesh, this.ctx.selectedFaceIds, {
      width,
      segments: this.segments,
      clampOverlap: true
    })
  }

  confirm() {
    if (this.lastResult) {
      this.ctx.selectedFaceIds = [...this.lastResult.beveledFaceIds]
      this.ctx.selectedVertIds = [...this.lastResult.beveledVertexIds]
    }
    super.confirm()
  }

  updateStatus() {
    const num = this.numericInput.text ? ` Width: ${this.numericInput.text}` : ''
    this.statusText = `Bevel${num} | Segments: ${this.segments}`
  }
}
