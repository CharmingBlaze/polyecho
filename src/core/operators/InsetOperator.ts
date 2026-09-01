import { ModalOperator, OperatorContext } from './ModalOperator'
import { InsetKernel, InsetResult } from '../mesh/operations/InsetKernel'

export class InsetOperator extends ModalOperator {
  readonly name = 'Inset'

  private isOutset = false
  private individual = false
  private useBoundary = true
  private lastResult: InsetResult | null = null
  private startedAt = 0

  begin(ctx: OperatorContext, startPointer: { x: number; y: number }) {
    super.begin(ctx, startPointer)
    this.startedAt = performance.now()
  }

  keyDown(event: KeyboardEvent): boolean {
    const k = event.key.toLowerCase()
    if (k === 'i') {
      event.preventDefault()
      if (performance.now() - this.startedAt < 80) return true
      this.individual = !this.individual
      this.evaluate()
      this.ctx.onUpdatePreview()
      this.updateStatus()
      return true
    }
    if (k === 'o') {
      event.preventDefault()
      this.isOutset = !this.isOutset
      this.evaluate()
      this.ctx.onUpdatePreview()
      this.updateStatus()
      return true
    }
    if (k === 'b') {
      event.preventDefault()
      this.useBoundary = !this.useBoundary
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
    const dx = this.currentMouse.x - this.startMouse.x
    const dy = this.currentMouse.y - this.startMouse.y
    const scale = this.isShiftHeld ? 400 : 120

    let thickness: number
    let depth = 0
    if (numThickness !== null) {
      thickness = Math.max(0, numThickness)
    } else if (this.isCtrlHeld) {
      thickness = Math.abs(dx) / scale
      depth = -dy / scale
    } else {
      thickness = Math.hypot(dx, dy) / scale
    }

    this.lastResult = InsetKernel.insetFaces(this.ctx.mesh, this.ctx.selectedFaceIds, {
      thickness,
      depth,
      outset: this.isOutset,
      individual: this.individual,
      boundary: this.useBoundary
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
    const parts = [this.individual ? 'Individual' : 'Region']
    if (this.isOutset) parts.push('Outset')
    if (!this.useBoundary) parts.push('No Boundary')
    const num = this.numericInput.text ? ` ${this.numericInput.text}` : ''
    this.statusText = `Inset ${parts.join(' ')}${num}  (I individual, O outset, B boundary, Ctrl depth)`
  }
}
