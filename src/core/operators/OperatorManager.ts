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
    this.activeOperator.begin(context, pointerPos)

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
