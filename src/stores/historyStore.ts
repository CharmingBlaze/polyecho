import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useProjectStore } from './projectStore'
import { useAnimationStore } from './animationStore'
import { PixelBuffer } from '../core/painting/PixelCanvas'

export interface TextureSnapshot {
  id: string
  name: string
  width: number
  height: number
  dataUrl?: string
  pixelBuffer: PixelBuffer
}

export interface AppSnapshot {
  description: string
  timestamp: number
  meshes: any[]
  activeMeshId: string
  selectedMeshIds: string[]
  selectedVertexIds: string[]
  selectedEdgeIds: string[]
  selectedFaceIds: string[]
  materials: any[]
  activePalette: any
  activeTextureId: string
  textures: TextureSnapshot[]
  armature: any
  selectedBoneId: string | null
  currentFrame: number
}

export interface HistoryRecord {
  description: string
  timestamp: number
  undo: () => void
  redo: () => void
  snapshot?: AppSnapshot
}

export const useHistoryStore = defineStore('history', () => {
  const undoStack = ref<HistoryRecord[]>([])
  const redoStack = ref<HistoryRecord[]>([])
  const isApplyingHistory = ref<boolean>(false)

  function captureSnapshot(description: string): AppSnapshot {
    const projectStore = useProjectStore()
    const animationStore = useAnimationStore()

    const texturesSnapshot: TextureSnapshot[] = projectStore.textures.map(t => {
      const buf = t.pixelBuffer ? t.pixelBuffer.clone() : new PixelBuffer(t.width, t.height)
      return {
        id: t.id,
        name: t.name,
        width: t.width,
        height: t.height,
        pixelBuffer: buf
      }
    })

    return {
      description,
      timestamp: Date.now(),
      meshes: JSON.parse(JSON.stringify(projectStore.meshes)),
      activeMeshId: projectStore.activeMeshId,
      selectedMeshIds: [...projectStore.selectedMeshIds],
      selectedVertexIds: [...projectStore.selectedVertexIds],
      selectedEdgeIds: [...projectStore.selectedEdgeIds],
      selectedFaceIds: [...projectStore.selectedFaceIds],
      materials: JSON.parse(JSON.stringify(projectStore.materials)),
      activePalette: JSON.parse(JSON.stringify(projectStore.activePalette)),
      activeTextureId: projectStore.activeTextureId,
      textures: texturesSnapshot,
      armature: JSON.parse(JSON.stringify(animationStore.armature)),
      selectedBoneId: animationStore.selectedBoneId,
      currentFrame: animationStore.currentFrame
    }
  }

  function applySnapshot(snapshot: AppSnapshot) {
    isApplyingHistory.value = true
    const projectStore = useProjectStore()
    const animationStore = useAnimationStore()

    try {
      projectStore.meshes = JSON.parse(JSON.stringify(snapshot.meshes))
      projectStore.activeMeshId = snapshot.activeMeshId
      projectStore.selectedMeshIds = [...snapshot.selectedMeshIds]
      projectStore.selectedVertexIds = [...snapshot.selectedVertexIds]
      projectStore.selectedEdgeIds = [...snapshot.selectedEdgeIds]
      projectStore.selectedFaceIds = [...snapshot.selectedFaceIds]
      projectStore.materials = JSON.parse(JSON.stringify(snapshot.materials))
      if (snapshot.activePalette) {
        projectStore.activePalette = JSON.parse(JSON.stringify(snapshot.activePalette))
      }
      projectStore.activeTextureId = snapshot.activeTextureId

      // Restore textures with fresh PixelBuffers
      projectStore.textures = snapshot.textures.map(t => {
        const clonedBuf = t.pixelBuffer.clone()
        return {
          id: t.id,
          name: t.name,
          width: t.width,
          height: t.height,
          pixelBuffer: clonedBuf
        }
      })
      projectStore.textureRevision++

      // Restore animation & rigging
      if (snapshot.armature) {
        animationStore.armature = JSON.parse(JSON.stringify(snapshot.armature))
        animationStore.selectedBoneId = snapshot.selectedBoneId
        animationStore.currentFrame = snapshot.currentFrame
      }
    } finally {
      isApplyingHistory.value = false
    }
  }

  function recordState(description: string) {
    if (isApplyingHistory.value) return
    const snapshot = captureSnapshot(description)
    undoStack.value.push({
      description,
      timestamp: Date.now(),
      snapshot,
      undo: () => applySnapshot(snapshot),
      redo: () => applySnapshot(snapshot)
    })

    if (undoStack.value.length > 50) {
      undoStack.value.shift()
    }
    redoStack.value = []
  }

  function pushAction(action: HistoryRecord) {
    if (isApplyingHistory.value) return
    undoStack.value.push(action)
    if (undoStack.value.length > 50) {
      undoStack.value.shift()
    }
    redoStack.value = []
  }

  function undo() {
    if (undoStack.value.length === 0) return
    const currentAction = undoStack.value.pop()
    if (!currentAction) return

    const redoSnapshot = captureSnapshot('Redo ' + currentAction.description)
    redoStack.value.push({
      description: currentAction.description,
      timestamp: Date.now(),
      snapshot: redoSnapshot,
      undo: () => applySnapshot(redoSnapshot),
      redo: () => applySnapshot(redoSnapshot)
    })

    if (currentAction.snapshot) {
      applySnapshot(currentAction.snapshot)
    } else {
      currentAction.undo()
    }
  }

  function redo() {
    if (redoStack.value.length === 0) return
    const currentAction = redoStack.value.pop()
    if (!currentAction) return

    const undoSnapshot = captureSnapshot('Undo ' + currentAction.description)
    undoStack.value.push({
      description: currentAction.description,
      timestamp: Date.now(),
      snapshot: undoSnapshot,
      undo: () => applySnapshot(undoSnapshot),
      redo: () => applySnapshot(undoSnapshot)
    })

    if (currentAction.snapshot) {
      applySnapshot(currentAction.snapshot)
    } else {
      currentAction.redo()
    }
  }

  function clearHistory() {
    undoStack.value = []
    redoStack.value = []
  }

  return {
    undoStack,
    redoStack,
    isApplyingHistory,
    captureSnapshot,
    applySnapshot,
    recordState,
    pushAction,
    undo,
    redo,
    clearHistory
  }
})

