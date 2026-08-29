import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface HistoryRecord {
  description: string
  timestamp: number
  undo: () => void
  redo: () => void
}

export const useHistoryStore = defineStore('history', () => {
  const undoStack = ref<HistoryRecord[]>([])
  const redoStack = ref<HistoryRecord[]>([])

  function pushAction(action: HistoryRecord) {
    undoStack.value.push(action)
    if (undoStack.value.length > 40) {
      undoStack.value.shift()
    }
    // Clear redo on new action
    redoStack.value = []
  }

  function undo() {
    const action = undoStack.value.pop()
    if (action) {
      action.undo()
      redoStack.value.push(action)
    }
  }

  function redo() {
    const action = redoStack.value.pop()
    if (action) {
      action.redo()
      undoStack.value.push(action)
    }
  }

  return {
    undoStack,
    redoStack,
    pushAction,
    undo,
    redo,
  }
})
