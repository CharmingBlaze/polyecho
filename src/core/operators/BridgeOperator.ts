import { ModalOperator } from './ModalOperator'
import { edgeChainsFromIds, MeshEditOps } from '../mesh/operations/MeshEditOps'

/**
 * Preview a bridge between two edge loops. Drag changes the segment count,
 * scroll changes the twist. Confirm writes one undo step. A loop pair that
 * cannot be bridged cancels with nothing recorded.
 */
export class BridgeOperator extends ModalOperator {
  readonly name = 'Bridge'

  private baseSegments: number
  private segments = 1
  private twist: number
  private created: number[] = []
  private error: string | null = null

  constructor(
    segments = 1,
    twist = 0,
    private readonly onParams?: (segments: number, twist: number) => void
  ) {
    super()
    this.baseSegments = clampSegments(segments)
    this.segments = this.baseSegments
    this.twist = Math.round(twist) || 0
  }

  begin(ctx: Parameters<ModalOperator['begin']>[0], pointer: { x: number; y: number }) {
    super.begin(ctx, pointer)
    this.evaluate()
    this.updateStatus()
    this.ctx.onUpdatePreview()
  }

  wheel(event: WheelEvent): boolean {
    event.preventDefault()
    this.twist += event.deltaY < 0 ? 1 : -1
    this.evaluate()
    this.ctx.onUpdatePreview()
    this.updateStatus()
    return true
  }

  evaluate() {
    this.restoreSnapshot()
    this.created = []
    this.error = null

    const num = this.numericInput.getValue()
    if (num !== null) {
      this.segments = clampSegments(num)
    } else {
      const step = this.isShiftHeld ? 80 : 28
      const extra = Math.round((this.currentMouse.x - this.startMouse.x) / step)
      this.segments = clampSegments(this.baseSegments + extra)
    }

    const chains = edgeChainsFromIds(this.ctx.mesh, this.ctx.selectedEdgeIds)
    if (chains.length !== 2) {
      this.error = 'Bridge needs two edge loops'
      this.publishParams()
      return
    }
    const [a, b] = chains as [typeof chains[0], typeof chains[0]]
    if (a.verts.length !== b.verts.length || a.closed !== b.closed || a.verts.length < 2) {
      this.error = 'Loops must match in length and be both open or both closed'
      this.publishParams()
      return
    }

    this.created = MeshEditOps.bridgeLoopsAdvanced(
      this.ctx.mesh,
      a.verts,
      b.verts,
      this.segments,
      this.twist,
      a.closed
    )
    if (!this.created.length) this.error = 'Bridge could not build the strip'
    this.publishParams()
  }

  confirm() {
    if (this.error || !this.created.length) {
      this.cancel()
      return
    }
    this.ctx.selectedFaceIds = [...this.created]
    this.ctx.selectedVertIds = []
    this.ctx.selectedEdgeIds = []
    super.confirm()
  }

  updateStatus() {
    if (this.error) {
      this.statusText = this.error
      return
    }
    const num = this.numericInput.text ? ` (${this.numericInput.text})` : ''
    this.statusText = `Bridge${num} | Segments: ${this.segments} (drag) | Twist: ${this.twist} (scroll)`
  }

  private publishParams() {
    this.onParams?.(this.segments, this.twist)
  }
}

function clampSegments(value: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.max(1, Math.min(16, Math.round(value)))
}
