export interface Command {
  name: string
  execute(): void
  undo(): void
  redo(): void
}

export class CommandManager {
  private undoStack: Command[] = []
  private redoStack: Command[] = []
  private maxHistory = 100

  execute(command: Command) {
    command.execute()
    this.undoStack.push(command)
    this.redoStack = []

    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift()
    }
  }

  undo(): boolean {
    const cmd = this.undoStack.pop()
    if (!cmd) return false

    cmd.undo()
    this.redoStack.push(cmd)
    return true
  }

  redo(): boolean {
    const cmd = this.redoStack.pop()
    if (!cmd) return false

    cmd.redo()
    this.undoStack.push(cmd)
    return true
  }

  clear() {
    this.undoStack = []
    this.redoStack = []
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }
}

export const commandManager = new CommandManager()
