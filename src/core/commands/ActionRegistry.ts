export type ActionScope = 'global' | 'viewport' | 'uv' | 'paint' | 'rig' | 'animate'

export interface CommandAction {
  id: string
  label: string
  category: 'Modeling' | 'UV & Texture' | 'Rig & Animation' | 'Viewport' | 'File & Project'
  shortcut?: string
  scope: ActionScope
  handler: () => void | Promise<void>
  disabled?: () => boolean
}

class ActionRegistryService {
  private actions = new Map<string, CommandAction>()

  register(action: CommandAction) {
    this.actions.set(action.id, action)
  }

  unregister(actionId: string) {
    this.actions.delete(actionId)
  }

  get(actionId: string): CommandAction | undefined {
    return this.actions.get(actionId)
  }

  getAll(): CommandAction[] {
    return Array.from(this.actions.values())
  }

  getByScope(scope: ActionScope): CommandAction[] {
    return Array.from(this.actions.values()).filter(a => a.scope === 'global' || a.scope === scope)
  }

  execute(actionId: string) {
    const action = this.actions.get(actionId)
    if (action && (!action.disabled || !action.disabled())) {
      action.handler()
      return true
    }
    return false
  }
}

export const actionRegistry = new ActionRegistryService()
