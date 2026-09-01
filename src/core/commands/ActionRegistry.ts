export type ActionScope = 'global' | 'viewport' | 'uv' | 'paint' | 'rig' | 'animate'

export interface CommandAction {
  id: string
  label: string
  category: 'Modeling' | 'Topology' | 'Selection' | 'Primitives' | 'Modifiers' | 'Shading' | 'UV & Texture' | 'Rig & Animation' | 'Transform' | 'Viewport' | 'File & Project'
  shortcut?: string
  icon?: string
  scope?: ActionScope
  handler: () => void | Promise<void>
  disabled?: () => boolean
}

class ActionRegistryService {
  private actions = new Map<string, CommandAction>()

  register(action: CommandAction) {
    this.actions.set(action.id, action)
  }

  registerMany(actions: CommandAction[]) {
    for (const a of actions) {
      this.actions.set(a.id, a)
    }
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
    return Array.from(this.actions.values()).filter(a => !a.scope || a.scope === 'global' || a.scope === scope)
  }

  getByCategory(category: CommandAction['category']): CommandAction[] {
    return Array.from(this.actions.values()).filter(a => a.category === category)
  }

  execute(actionId: string): boolean {
    const action = this.actions.get(actionId)
    if (action && (!action.disabled || !action.disabled())) {
      action.handler()
      return true
    }
    return false
  }

  /**
   * Normalize shortcut string (e.g. "Ctrl+Shift+Z" -> "ctrl+shift+z", "Shift+A" -> "shift+a")
   */
  normalizeShortcut(shortcut: string): string {
    return shortcut
      .split('+')
      .map(s => s.trim().toLowerCase())
      .sort()
      .join('+')
  }

  /**
   * Converts a KeyboardEvent to a normalized shortcut string
   */
  eventToShortcut(e: KeyboardEvent): string {
    const parts: string[] = []
    if (e.ctrlKey || e.metaKey) parts.push('ctrl')
    if (e.altKey) parts.push('alt')
    if (e.shiftKey) parts.push('shift')

    let key = e.key
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
      return ''
    }
    if (key === ' ') key = 'space'
    parts.push(key.toLowerCase())

    return parts.sort().join('+')
  }
}

export const actionRegistry = new ActionRegistryService()
