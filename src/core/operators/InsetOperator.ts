import { ModalOperator } from './ModalOperator'
import { InsetKernel, InsetResult } from '../mesh/operations/InsetKernel'

export class InsetOperator extends ModalOperator {
  readonly name = 'Inset'

  private isOutset = false
  private depth = 0
  private lastResult: InsetResult | null = null

  keyDown(event: KeyboardEvent): boolean {
    if (event.key.toLowerCase() === 'o') {
      event.preventDefault()
      this.isOutset = !this.isOutset
      this.evaluate()
      this.ctx.onUpdatePreview()
      this.updateStatus()
      return true
    }
    return super.keyDown(event)
  }

  evaluate() {
    this.restoreSnapshot()

    const numThickness = this.numericInput.getValue()

    const startDist = Math.hypot(this.startMouse.x - this.pivotScreen.x, this.startMouse.y - this.pivotScreen.y) || 50
    const curDist = Math.hypot(this.currentMouse.x - this.pivotScreen.x, this.currentMouse.y - this.pivotScreen.y)

    let thickness = numThickness !== null
      ? numThickness
      : Math.abs(startDist - curDist) / (this.isShiftHeld ? 300 : 100)

    if (this.isCtrlHeld && numThickness === null) {
      thickness = this.snapManager.snapLinear(thickness, 0.1)
    }

    this.lastResult = InsetKernel.insetFaces(this.ctx.mesh, this.ctx.selectedFaceIds, {
      thickness,
      depth: this.depth,
      outset: this.isOutset
    })
  }

  confirm() {
    if (this.lastResult) {
      this.ctx.selectedFaceIds = [...this.lastResult.insetFaceIds]
      this.ctx.selectedVertIds = [...this.lastResult.insetVertexIds]
    }
    super.confirm()
  }

  updateStatus() {
    const mode = this.isOutset ? ' Outset' : ' Thickness'
    const num = this.numericInput.text ? `: ${this.numericInput.text}` : ''
    this.statusText = `Inset${mode}${num}`
  }
}
