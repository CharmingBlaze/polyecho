import { defineStore } from 'pinia'
import { ref, markRaw } from 'vue'
import { useProjectStore } from './projectStore'
import { useAnimationStore } from './animationStore'
import { PixelBuffer } from '../core/painting/PixelCanvas'
import { cloneMeshDocumentSlice } from '../core/history/applyMeshDocument'

export interface TextureSnapshot {
  id: string
  name: string
  width: number
  height: number
  dataUrl?: string
  atlas?: { cols: number; rows: number }
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
  /** Project textureRevision at capture time. Same number on apply means pixels were not edited. */
  textureRevision: number
  referenceRevision?: number
  armature: any
  selectedBoneId: string | null
  currentFrame: number
  referenceImages?: any[]
}

export type CaptureSnapshotOptions = {
  /** When false, skip cloning PixelBuffers (mesh / selection undos). Default true. */
  includeTextures?: boolean
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
  const documentEpoch = ref(0)
  const savedEpoch = ref(0)

  function bumpDocumentEpoch() {
    documentEpoch.value += 1
  }

  function markClean() {
    savedEpoch.value = documentEpoch.value
  }

  function markDirty() {
    if (savedEpoch.value === documentEpoch.value) {
      documentEpoch.value += 1
    }
  }

  function isDirty() {
    return documentEpoch.value !== savedEpoch.value
  }

  function captureSnapshot(description: string, options?: CaptureSnapshotOptions): AppSnapshot {
    const projectStore = useProjectStore()
    const animationStore = useAnimationStore()
    const includeTextures = options?.includeTextures !== false

    const texturesSnapshot: TextureSnapshot[] = includeTextures
      ? projectStore.textures.map(t => {
          const buf = t.pixelBuffer ? t.pixelBuffer.clone() : new PixelBuffer(t.width, t.height)
          return {
            id: t.id,
            name: t.name,
            width: t.width,
            height: t.height,
            atlas: t.atlas ? { ...t.atlas } : undefined,
            pixelBuffer: markRaw(buf) as PixelBuffer
          }
        })
      : []

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
      textureRevision: projectStore.textureRevision,
      referenceRevision: projectStore.referenceRevision,
      armature: JSON.parse(JSON.stringify(animationStore.armature)),
      selectedBoneId: animationStore.selectedBoneId,
      currentFrame: animationStore.currentFrame,
      referenceImages: JSON.parse(JSON.stringify(projectStore.referenceImages || []))
    }
  }

  function applySnapshot(snapshot: AppSnapshot) {
    isApplyingHistory.value = true
    const projectStore = useProjectStore()
    const animationStore = useAnimationStore()

    try {
      const meshSlice = cloneMeshDocumentSlice({
        meshes: snapshot.meshes,
        activeMeshId: snapshot.activeMeshId,
        selectedMeshIds: snapshot.selectedMeshIds,
        selectedVertexIds: snapshot.selectedVertexIds,
        selectedEdgeIds: snapshot.selectedEdgeIds,
        selectedFaceIds: snapshot.selectedFaceIds
      })
      projectStore.meshes = meshSlice.meshes
      projectStore.activeMeshId = meshSlice.activeMeshId
      projectStore.selectedMeshIds = meshSlice.selectedMeshIds
      projectStore.selectedVertexIds = meshSlice.selectedVertexIds
      projectStore.selectedEdgeIds = meshSlice.selectedEdgeIds
      projectStore.selectedFaceIds = meshSlice.selectedFaceIds
      projectStore.materials = JSON.parse(JSON.stringify(snapshot.materials))
      if (snapshot.activePalette) {
        projectStore.activePalette = JSON.parse(JSON.stringify(snapshot.activePalette))
      }
      projectStore.activeTextureId = snapshot.activeTextureId

      const hasTexturePayload = snapshot.textures.length > 0
      const texturesUntouched =
        typeof snapshot.textureRevision === 'number' &&
        snapshot.textureRevision === projectStore.textureRevision &&
        (!hasTexturePayload || (
          snapshot.textures.length === projectStore.textures.length &&
          snapshot.textures.every((t, i) => projectStore.textures[i]?.id === t.id)
        ))

      if (!texturesUntouched && hasTexturePayload) {
        projectStore.textures = snapshot.textures.map(t => {
          const clonedBuf = t.pixelBuffer.clone()
          return {
            id: t.id,
            name: t.name,
            width: t.width,
            height: t.height,
            atlas: t.atlas ? { ...t.atlas } : undefined,
            pixelBuffer: markRaw(clonedBuf) as PixelBuffer
          }
        })
        projectStore.textureRevision++
      }

      // Restore animation & rigging
      if (snapshot.armature) {
        animationStore.armature = JSON.parse(JSON.stringify(snapshot.armature))
        animationStore.selectedBoneId = snapshot.selectedBoneId
        animationStore.currentFrame = snapshot.currentFrame
      }
      const refsUntouched =
        typeof snapshot.referenceRevision === 'number' &&
        snapshot.referenceRevision === projectStore.referenceRevision
      if (!refsUntouched) {
        projectStore.referenceImages = JSON.parse(JSON.stringify(snapshot.referenceImages || []))
        projectStore.referenceRevision++
      }
    } finally {
      isApplyingHistory.value = false
      projectStore.markGeometryUpdated()
    }
  }

  function recordState(description: string, options?: CaptureSnapshotOptions) {
    if (isApplyingHistory.value) return
    const snapshot = captureSnapshot(description, options)
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
    bumpDocumentEpoch()
  }

  function pushAction(action: HistoryRecord) {
    if (isApplyingHistory.value) return
    undoStack.value.push(action)
    if (undoStack.value.length > 50) {
      undoStack.value.shift()
    }
    redoStack.value = []
    bumpDocumentEpoch()
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
    bumpDocumentEpoch()
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
    bumpDocumentEpoch()
  }

  function clearHistory() {
    undoStack.value = []
    redoStack.value = []
    documentEpoch.value = 0
    savedEpoch.value = 0
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
    clearHistory,
    documentEpoch,
    markClean,
    markDirty,
    isDirty
  }
})

