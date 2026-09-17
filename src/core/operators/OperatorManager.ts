import { ref } from 'vue'
import { ModalOperator, OperatorContext } from './ModalOperator'

export interface OperatorManagerState {
  active: boolean
  operatorName: string
  statusText: string
  previewTick: number
}

export class OperatorManager {
  private static instance: OperatorManager
  public activeOperator: ModalOperator | null = null
  private callbacks = new WeakMap<OperatorContext, Pick<OperatorContext, 'onCommit' | 'onCancel'>>()

  public state = ref<OperatorManagerState>({
    active: false,
    operatorName: '',
    statusText: '',
    previewTick: 0,
  })

  static getInstance(): OperatorManager {
    if (!this.instance) {
      this.instance = new OperatorManager()
    }
    return this.instance
  }

  start(operator: ModalOperator, context: OperatorContext, pointerPos: { x: number; y: number }) {
    if (this.activeOperator) {
      this.cancel()
    }

    this.activeOperator = operator
    // Operators can finish through their own keyboard handlers as well as the
    // manager's buttons. Both paths must release the modal state exactly once.
    let callbacks = this.callbacks.get(context)
    if (!callbacks) {
      callbacks = { onCommit: context.onCommit, onCancel: context.onCancel }
      this.callbacks.set(context, callbacks)
    }
    const original = callbacks
    let finished = false
    context.onCommit = name => {
      if (finished) return
      if (context.validateCommit && !context.validateCommit()) {
        operator.cancel()
        return
      }
      finished = true
      if (this.activeOperator === operator) this.finish()
      original.onCommit(name)
    }
    context.onCancel = () => {
      if (finished) return
      finished = true
      if (this.activeOperator === operator) this.finish()
      original.onCancel()
    }
    this.activeOperator.begin(context, pointerPos)
    if (this.activeOperator !== operator) return

    this.state.value.active = true
    this.state.value.operatorName = operator.name
    this.state.value.statusText = operator.statusText
    this.state.value.previewTick++
  }

  handlePointerMove(e: PointerEvent) {
    if (!this.activeOperator) return
    this.activeOperator.pointerMove(e)
    if (!this.activeOperator) return
    this.state.value.statusText = this.activeOperator.statusText
    this.state.value.previewTick++
  }

  handleKeyDown(e: KeyboardEvent): boolean {
    if (!this.activeOperator) return false
    const handled = this.activeOperator.keyDown(e)
    if (this.activeOperator) {
      this.state.value.statusText = this.activeOperator.statusText
      this.state.value.previewTick++
    }
    return handled
  }

  handleWheel(e: WheelEvent): boolean {
    if (!this.activeOperator) return false
    const handled = this.activeOperator.wheel(e)
    if (this.activeOperator) {
      this.state.value.statusText = this.activeOperator.statusText
      this.state.value.previewTick++
    }
    return handled
  }

  handlePointerDown(e: MouseEvent): boolean {
    if (!this.activeOperator) return false
    this.activeOperator.syncPointerFromEvent(e)
    const handled = this.activeOperator.handlePointerDown(e.button)
    if (this.activeOperator) {
      this.state.value.statusText = this.activeOperator.statusText
      this.state.value.previewTick++
    }
    return handled
  }

  confirm() {
    if (!this.activeOperator) return
    const op = this.activeOperator
    this.finish()
    op.confirm()
  }

  cancel() {
    if (!this.activeOperator) return
    const op = this.activeOperator
    this.finish()
    op.cancel()
  }

  private finish() {
    this.activeOperator = null
    this.state.value.active = false
    this.state.value.operatorName = ''
    this.state.value.statusText = ''
  }
}

export const operatorManager = OperatorManager.getInstance()
