import { operatorManager } from '../operators/OperatorManager'
import { defaultKeymap, KeyBinding } from './Keymap'

export type ActionHandler = (action: string, event: KeyboardEvent) => void

export class InputRouter {
  private keymap: KeyBinding[] = [...defaultKeymap]
  private actionHandlers = new Map<string, ActionHandler>()

  registerAction(action: string, handler: ActionHandler) {
    this.actionHandlers.set(action, handler)
  }

  handleKeyDown(event: KeyboardEvent): boolean {
    // 1. If an input field is focused, do not intercept
    const targetTag = (event.target as HTMLElement)?.tagName
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(targetTag)) {
      return false
    }

    // 2. Highest priority: active modal operator
    if (operatorManager.state.value.active) {
      if (operatorManager.handleKeyDown(event)) {
        return true
      }
    }

    // 3. Match against keymap
    const keyLower = event.key.toLowerCase()
    const ctrl = event.ctrlKey || event.metaKey
    const shift = event.shiftKey
    const alt = event.altKey

    for (const binding of this.keymap) {
      if (
        binding.key.toLowerCase() === keyLower &&
        !!binding.ctrl === ctrl &&
        !!binding.shift === shift &&
        !!binding.alt === alt
      ) {
        const handler = this.actionHandlers.get(binding.action)
        if (handler) {
          handler(binding.action, event)
          return true
        }
      }
    }

    return false
  }
}

export const inputRouter = new InputRouter()
