<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useFloatingDrag } from '../../composables/useFloatingDrag'
import { useToolStore } from '../../stores/toolStore'
import { useProjectStore } from '../../stores/projectStore'
import { useAnimationStore } from '../../stores/animationStore'
import { SelectMode, ModelToolType } from '../../types/tools'
import BlenderIcon from '../icons/BlenderIcon.vue'
import { requestModalTool, requestPrimitiveMenu, requestFillFace, type ModalToolCommand } from '../../core/commands/editorCommands'
import {
  GripHorizontal,
  ChevronsLeft,
  ChevronsRight,
  Pin,
  PinOff,
  Minus,
  Plus
} from 'lucide-vue-next'

const toolStore = useToolStore()
const projectStore = useProjectStore()
const animationStore = useAnimationStore()

const isUvSelectionMode = computed(() => toolStore.appMode === 'uvpaint' && toolStore.uvWorkspaceTab === 'uv')
const isMeshWorkspace = computed(() => toolStore.isMeshWorkspace())
const isModeling = computed(() => toolStore.appMode === 'model')
const selectedObjectCount = computed(() => projectStore.selectedMeshIds.length || (projectStore.activeMesh ? 1 : 0))
const hasActiveMesh = computed(() => Boolean(projectStore.activeMesh))
const hasSelectedFaces = computed(() => projectStore.selectedFaceIds.length > 0)
const hasSelectedEdges = computed(() => projectStore.selectedEdgeIds.length > 0)
const hasTwoSelectedEdges = computed(() => projectStore.selectedEdgeIds.length >= 2)
const hasFillBoundary = computed(() => {
  if (projectStore.selectedVertexIds.length >= 3) return true
  if (!projectStore.activeMesh || projectStore.selectedEdgeIds.length < 2) return false
  const selected = new Set(projectStore.selectedEdgeIds)
  const boundary = new Set<string>()
  for (const face of projectStore.activeMesh.faces) {
    for (let i = 0; i < face.vertexIds.length; i++) {
      const a = face.vertexIds[i]
      const b = face.vertexIds[(i + 1) % face.vertexIds.length]
      const id = [a, b].sort().join('_')
      if (selected.has(id)) {
        boundary.add(a)
        boundary.add(b)
      }
    }
  }
  return boundary.size >= 3
})

const isFloating = ref(true)
const columnsPref = ref<1 | 2>(2)
const isMinimized = ref(false)
const pos = ref({ x: 16, y: 46 })
const hasMovedToolbar = ref(false)
const viewAnchor = ref({ left: 16, top: 46, width: 800, height: 600 })
const { isDragging, startDrag: startFloatingDrag } = useFloatingDrag(pos, {
  enabled: () => isFloating.value,
  maxPadX: 60,
  maxPadY: 80
})

function syncViewAnchor() {
  const el = document.querySelector('[data-viewport-root]') as HTMLElement | null
  if (!el) return
  const r = el.getBoundingClientRect()
  if (r.width < 8 || r.height < 8) return
  viewAnchor.value = { left: r.left, top: r.top, width: r.width, height: r.height }
}

function startDrag(e: PointerEvent) {
  if (isFloating.value) hasMovedToolbar.value = true
  startFloatingDrag(e)
}

/** Mesh operators vs mode-specific tools — never stacked. */
const shelfTab = ref<'ops' | 'context'>('ops')

const contextTabLabel = computed(() => {
  const mode = toolStore.selectMode
  if (mode === 'vertex') return 'Vert'
  if (mode === 'edge') return 'Edge'
  if (mode === 'face') return 'Face'
  if (mode === 'origin') return 'Pivot'
  if (mode === 'bone') return 'Bone'
  return 'Obj'
})

const isSingleColWorkspace = computed(() => {
  const mode = toolStore.appMode
  return mode === 'blockout' || mode === 'uvpaint' || mode === 'rig' || mode === 'animate'
})

const columns = computed<1 | 2>(() => (isSingleColWorkspace.value ? 1 : columnsPref.value))

const headerTitle = computed(() => {
  if (isSingleColWorkspace.value) {
    return isFloating.value ? 'Drag to move' : undefined
  }
  return isFloating.value ? 'Drag to move. Double-click for 1 / 2 columns.' : 'Double-click for 1 / 2 columns.'
})

const iconBtn = 'w-full h-8 flex items-center justify-center rounded-xs transition cursor-pointer relative disabled:opacity-30 disabled:cursor-not-allowed'
const gridCls = computed(() => (columns.value === 1 ? 'grid grid-cols-1 gap-1 w-full' : 'grid grid-cols-2 gap-1 w-full'))
const iconPx = computed(() => (columns.value === 2 ? 17 : 18))

function tone(on: boolean) {
  return on
    ? 'bg-ui-active text-ui-textAccent border border-ui-accent/40'
    : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover border border-transparent'
}

const panelStyle = computed(() => {
  if (!isFloating.value) return {}
  if (!hasMovedToolbar.value) {
    const a = viewAnchor.value
    const down = toolStore.appMode === 'blockout' ? 52 : 0
    return {
      left: '8px',
      top: `${a.top + a.height * 0.42 + down}px`,
      transform: 'translateY(-50%)',
      maxHeight: `${Math.max(160, a.height - 24 - down)}px`
    }
  }
  const style: Record<string, string> = {
    left: `${pos.value.x}px`,
    top: `${pos.value.y}px`
  }
  if (!isMinimized.value) {
    style.maxHeight = `calc(100dvh - ${pos.value.y + 8}px)`
  }
  return style
})

watch(
  () => toolStore.selectMode,
  () => {
    if (isMeshWorkspace.value) shelfTab.value = 'context'
  }
)

watch(
  () => toolStore.appMode,
  (mode) => {
    shelfTab.value = mode === 'model' ? 'ops' : 'context'
    hasMovedToolbar.value = false
    nextTick(syncViewAnchor)
  }
)

watch(
  () => [isFloating.value, columns.value, isMinimized.value] as const,
  () => nextTick(syncViewAnchor)
)

function toggleColumns() {
  if (isSingleColWorkspace.value) return
  columnsPref.value = columnsPref.value === 2 ? 1 : 2
}

function toggleFloating() {
  isFloating.value = !isFloating.value
  if (isFloating.value) {
    hasMovedToolbar.value = false
    nextTick(syncViewAnchor)
  }
}

let viewAnchorObserver: ResizeObserver | null = null

onMounted(() => {
  syncViewAnchor()
  window.addEventListener('resize', syncViewAnchor)
  const el = document.querySelector('[data-viewport-root]')
  if (el && typeof ResizeObserver !== 'undefined') {
    viewAnchorObserver = new ResizeObserver(() => syncViewAnchor())
    viewAnchorObserver.observe(el)
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', syncViewAnchor)
  viewAnchorObserver?.disconnect()
  viewAnchorObserver = null
})

function ensureActiveMeshSelection() {
  if (!projectStore.activeMesh && projectStore.meshes.length > 0) {
    projectStore.activeMeshId = projectStore.meshes[0].id
    projectStore.selectedMeshIds = [projectStore.meshes[0].id]
  }
}

function setSelectMode(mode: SelectMode) {
  if (isUvSelectionMode.value && mode !== 'bone' && mode !== 'origin') {
    ensureActiveMeshSelection()
    toolStore.setSelectMode(mode)
    return
  }
  if (mode === 'bone') {
    if (toolStore.appMode !== 'animate') {
      toolStore.setAppMode('rig')
    }
    toolStore.selectMode = 'bone'
  } else {
    if (toolStore.appMode !== 'blockout') toolStore.setAppMode('model')
    ensureActiveMeshSelection()
    toolStore.selectMode = mode
  }
  shelfTab.value = 'context'
}

function toggleOriginMode() {
  if (toolStore.selectMode === 'origin') {
    toolStore.selectMode = 'object'
    shelfTab.value = 'ops'
  } else {
    if (toolStore.appMode !== 'blockout') toolStore.setAppMode('model')
    ensureActiveMeshSelection()
    toolStore.selectMode = 'origin'
    shelfTab.value = 'context'
  }
}

function setModelTool(tool: ModelToolType) {
  if (isMeshWorkspace.value) ensureActiveMeshSelection()
  toolStore.setModelTool(tool)
}

function startModalOp(opName: ModalToolCommand) {
  if (toolStore.appMode !== 'blockout') toolStore.setAppMode('model')
  if (opName !== 'polydraw') ensureActiveMeshSelection()
  if (opName === 'polydraw') toolStore.setModelTool('polydraw')
  requestModalTool(opName)
}

function startMeshOp(opName: ModalToolCommand, editMode?: SelectMode) {
  if (editMode && (toolStore.selectMode === 'object' || toolStore.selectMode === 'origin' || toolStore.selectMode === 'bone')) {
    toolStore.setSelectMode(editMode)
  }
  startModalOp(opName)
}

function runSubdivide() {
  const mode = toolStore.selectMode
  if (mode === 'vertex' || mode === 'edge' || mode === 'face') {
    projectStore.performSubdivide(mode)
    return
  }
  projectStore.performSubdivide()
}

function runDissolve() {
  if (toolStore.selectMode === 'edge') projectStore.performDissolve('edge')
  else projectStore.performDissolve('vertex')
}

function handleAddBone() {
  if (animationStore.selectedBoneId) {
    animationStore.addChildBone(animationStore.selectedBoneId, `Bone_${animationStore.armature.bones.length + 1}`)
  } else {
    animationStore.addRootBone(`Bone_Root_${animationStore.armature.bones.length + 1}`)
  }
}

function handleDelete() {
  if (toolStore.selectMode === 'vertex' || toolStore.selectMode === 'edge' || toolStore.selectMode === 'face') {
    projectStore.performDelete(toolStore.selectMode)
  } else if (toolStore.selectMode === 'bone' && animationStore.selectedBoneId) {
    animationStore.deleteBone(animationStore.selectedBoneId)
  } else {
    projectStore.performDelete('object')
  }
}

function handleOpenAddPrimitive() {
  if (toolStore.appMode !== 'blockout') toolStore.setAppMode('model')
  requestPrimitiveMenu()
}

function clearActiveTexture() {
  projectStore.recordState('Clear Texture')
  projectStore.pixelBuffer.clear()
  projectStore.markTextureUpdated()
}

function handleSymmetrizeBones() {
  projectStore.recordState('Symmetrize Skeleton')
  animationStore.symmetrizeArmature()
}
</script>

<template>
  <div
    class="z-40"
    :class="isFloating ? 'contents' : 'h-full min-h-0 shrink-0 relative'"
  >
  <aside
    data-floating-panel
    class="bg-ui-panel border border-ui-borderSubtle flex flex-col z-40 overflow-hidden font-sans text-xs shadow-2xl select-none"
    :class="[
      isFloating ? 'fixed rounded-xs border-ui-borderStrong' : 'relative border-r border-t-0 border-b-0 border-l-0 h-full min-h-0',
      isDragging ? 'cursor-grabbing' : '',
      columns === 1 ? 'w-[56px]' : 'w-[108px]',
      isMinimized ? 'h-auto' : '',
      !isFloating && toolStore.appMode === 'blockout' ? 'pt-6' : ''
    ]"
    :style="panelStyle"
  >
    <div
      class="w-full h-7 border-b border-ui-borderSubtle flex items-center text-ui-textMuted shrink-0 group touch-none bg-ui-header"
      :class="[
        columns === 1 ? 'px-0.5 justify-between' : 'px-1.5 justify-between',
        isFloating ? 'cursor-move' : 'cursor-pointer'
      ]"
      @pointerdown="startDrag"
      @dblclick="toggleColumns"
      :title="headerTitle"
    >
      <div class="flex items-center gap-1 min-w-0">
        <GripHorizontal class="w-3.5 h-3.5 text-ui-textMuted group-hover:text-ui-textSecondary shrink-0" />
        <span v-if="columns === 2" class="text-[10px] font-semibold uppercase tracking-wide text-ui-textMuted truncate">Tools</span>
      </div>
      <div class="flex items-center shrink-0" @mousedown.stop @pointerdown.stop>
        <button
          v-if="!isSingleColWorkspace"
          type="button"
          @click="toggleColumns"
          class="p-0.5 text-ui-textMuted hover:text-ui-textSecondary rounded-xs hover:bg-ui-hover"
          :title="columns === 2 ? 'Single column' : 'Two columns'"
        >
          <ChevronsLeft v-if="columns === 2" class="w-3.5 h-3.5" />
          <ChevronsRight v-else class="w-3.5 h-3.5" />
        </button>
        <button type="button" @click="toggleFloating" class="p-0.5 rounded-xs hover:bg-ui-hover" :class="isFloating ? 'text-ui-accent' : 'text-ui-textMuted hover:text-ui-textSecondary'" :title="isFloating ? 'Dock left' : 'Float'">
          <PinOff v-if="isFloating" class="w-3.5 h-3.5" />
          <Pin v-else class="w-3.5 h-3.5" />
        </button>
        <button type="button" @click="isMinimized = !isMinimized" class="p-0.5 text-ui-textMuted hover:text-ui-textSecondary rounded-xs hover:bg-ui-hover" :title="isMinimized ? 'Expand' : 'Fold'">
          <Plus v-if="isMinimized" class="w-3.5 h-3.5" />
          <Minus v-else class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <div v-show="!isMinimized" class="w-full flex-1 min-h-0 flex flex-col">
      <!-- Sticky: select + transform -->
      <div class="shrink-0 px-1.5 pt-1.5 pb-1 space-y-1.5 border-b border-ui-borderSubtle">
        <div v-if="isMeshWorkspace || isUvSelectionMode">
          <div v-if="columns === 2" class="text-[9px] font-semibold uppercase tracking-wider text-ui-textMuted px-0.5 mb-1">Select</div>
          <div :class="gridCls">
            <button
              v-if="isMeshWorkspace"
              type="button"
              :class="[iconBtn, tone(toolStore.isBoxSelectActive)]"
              title="Box select (B)"
              @click="toolStore.isBoxSelectActive = !toolStore.isBoxSelectActive"
            >
              <BlenderIcon name="marquee" :size="iconPx" :color="toolStore.isBoxSelectActive ? '#f59e0b' : 'currentColor'" />
            </button>
            <button type="button" :class="[iconBtn, tone(toolStore.selectMode === 'object' && isMeshWorkspace)]" :title="isUvSelectionMode ? 'UV island (4)' : 'Object (4 / Tab)'" @click="setSelectMode('object')">
              <BlenderIcon name="object-mode" :size="iconPx" />
            </button>
            <button type="button" :class="[iconBtn, tone(toolStore.selectMode === 'vertex')]" title="Vertex (1)" @click="setSelectMode('vertex')">
              <BlenderIcon name="vertex-select" :size="iconPx" />
            </button>
            <button type="button" :class="[iconBtn, tone(toolStore.selectMode === 'edge')]" title="Edge (2)" @click="setSelectMode('edge')">
              <BlenderIcon name="edge-select" :size="iconPx" />
            </button>
            <button type="button" :class="[iconBtn, tone(toolStore.selectMode === 'face')]" title="Face (3)" @click="setSelectMode('face')">
              <BlenderIcon name="face-select" :size="iconPx" />
            </button>
            <button
              v-if="isMeshWorkspace"
              type="button"
              :class="[iconBtn, tone(toolStore.snapping.grid)]"
              title="Grid snap (Shift+Tab)"
              @click="toolStore.snapping.grid = !toolStore.snapping.grid"
            >
              <BlenderIcon name="snap" :size="iconPx" />
            </button>
          </div>
        </div>

        <div v-if="isMeshWorkspace || toolStore.appMode === 'rig' || toolStore.appMode === 'animate'">
          <div v-if="columns === 2" class="text-[9px] font-semibold uppercase tracking-wider text-ui-textMuted px-0.5 mb-1">{{ toolStore.appMode === 'blockout' ? 'Draw' : 'Transform' }}</div>
          <div :class="gridCls">
            <button
              v-if="toolStore.appMode === 'blockout'"
              type="button"
              :class="[iconBtn, tone(toolStore.modelTool === 'polydraw'), 'order-first']"
              title="Poly Draw (F)"
              @click="startModalOp('polydraw')"
            >
              <BlenderIcon name="face-select" :size="iconPx" color="#f59e0b" />
            </button>
            <button type="button" :class="[iconBtn, tone(toolStore.modelTool === 'move')]" title="Move (G)" @click="setModelTool('move')">
              <BlenderIcon name="tool-move" :size="iconPx" />
            </button>
            <button type="button" :class="[iconBtn, tone(toolStore.modelTool === 'rotate')]" title="Rotate (R)" @click="setModelTool('rotate')">
              <BlenderIcon name="tool-rotate" :size="iconPx" />
            </button>
            <button type="button" :class="[iconBtn, tone(toolStore.modelTool === 'scale')]" title="Scale (S)" @click="setModelTool('scale')">
              <BlenderIcon name="tool-scale" :size="iconPx" />
            </button>
            <button
              v-if="isMeshWorkspace"
              type="button"
              :class="[iconBtn, 'text-amber-400 hover:text-amber-300 hover:bg-ui-hover border border-amber-500/25 bg-amber-500/10']"
              title="Add primitive (Shift+A)"
              @click="handleOpenAddPrimitive"
            >
              <BlenderIcon name="mesh-cube" :size="iconPx" color="#f59e0b" />
            </button>
          </div>
        </div>
      </div>

      <!-- Modeling: Mesh | current-mode, one page at a time -->
      <template v-if="isModeling">
        <div class="shrink-0 mx-1.5 mt-1.5 p-0.5 rounded-xs bg-ui-input border border-ui-borderSubtle grid grid-cols-2 gap-0.5">
          <button
            type="button"
            class="h-6 rounded-xs text-[10px] font-semibold tracking-wide transition"
            :class="shelfTab === 'ops' ? 'bg-ui-active text-ui-textAccent' : 'text-ui-textMuted hover:text-ui-textSecondary'"
            title="Extrude, inset, bevel, cuts"
            @click="shelfTab = 'ops'"
          >
            Mesh
          </button>
          <button
            type="button"
            class="h-6 rounded-xs text-[10px] font-semibold tracking-wide transition"
            :class="shelfTab === 'context' ? 'bg-ui-active text-ui-textAccent' : 'text-ui-textMuted hover:text-ui-textSecondary'"
            :title="'Tools for ' + contextTabLabel + ' mode'"
            @click="shelfTab = 'context'"
          >
            {{ contextTabLabel }}
          </button>
        </div>

        <div class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-1.5 py-1.5">
          <div v-if="shelfTab === 'ops'" :class="gridCls">
            <button type="button" :class="[iconBtn, tone(false)]" title="Extrude (E)" @click="startMeshOp('extrude', 'face')">
              <BlenderIcon name="tool-extrude" :size="iconPx" />
            </button>
            <button type="button" :class="[iconBtn, tone(false)]" title="Inset (I)" @click="startMeshOp('inset', 'face')">
              <BlenderIcon name="tool-inset" :size="iconPx" />
            </button>
            <button type="button" :class="[iconBtn, tone(false)]" title="Bevel (Ctrl+B)" @click="startMeshOp('bevel', 'face')">
              <BlenderIcon name="tool-bevel" :size="iconPx" />
            </button>
            <button type="button" :class="[iconBtn, tone(false)]" title="Loop cut (Ctrl+R)" @click="startMeshOp('loop_cut', 'edge')">
              <BlenderIcon name="tool-loopcut" :size="iconPx" />
            </button>
            <button type="button" :class="[iconBtn, tone(false)]" title="Knife (K)" @click="startMeshOp('knife', 'edge')">
              <BlenderIcon name="tool-knife" :size="iconPx" />
            </button>
            <button type="button" :class="[iconBtn, tone(false)]" :disabled="!hasActiveMesh" title="Subdivide / divide" @click="runSubdivide">
              <BlenderIcon name="tool-subdivide" :size="iconPx" />
            </button>
            <button type="button" :class="[iconBtn, tone(false)]" title="Merge at center (M)" @click="toolStore.setSelectMode('vertex'); projectStore.performMerge('center')">
              <BlenderIcon name="tool-merge" :size="iconPx" />
            </button>
            <button type="button" :class="[iconBtn, tone(false)]" title="Connect vertices (J)" @click="toolStore.setSelectMode('vertex'); projectStore.performConnectVertices()">
              <BlenderIcon name="connect-verts" :size="iconPx" />
            </button>
            <button type="button" :class="[iconBtn, tone(false)]" title="Fill (F)" @click="requestFillFace()">
              <BlenderIcon name="fill-face" :size="iconPx" />
            </button>
            <button type="button" :class="[iconBtn, tone(false)]" title="Dissolve" @click="runDissolve">
              <BlenderIcon name="dissolve" :size="iconPx" />
            </button>
          </div>

          <div v-else-if="toolStore.selectMode === 'object' || toolStore.selectMode === 'origin'" :class="gridCls">
            <button type="button" :class="[iconBtn, tone(toolStore.selectMode === 'origin')]" title="Edit origin (5)" @click="toggleOriginMode">
              <BlenderIcon name="origin" :size="iconPx" :color="toolStore.selectMode === 'origin' ? '#f59e0b' : 'currentColor'" />
            </button>
            <button type="button" :class="[iconBtn, tone(false)]" title="Duplicate (Shift+D)" @click="projectStore.duplicateSelection('object')">
              <BlenderIcon name="duplicate" :size="iconPx" />
            </button>
            <button type="button" :class="[iconBtn, tone(false)]" :disabled="selectedObjectCount < 2" title="Join (Ctrl+J)" @click="projectStore.performJoinMeshes()">
              <BlenderIcon name="join-mesh" :size="iconPx" />
            </button>
            <button type="button" :class="[iconBtn, tone(false)]" :disabled="!hasActiveMesh" title="Clean mesh" @click="projectStore.performCleanupMesh()">
              <BlenderIcon name="clean-mesh" :size="iconPx" />
            </button>
            <button type="button" :class="[iconBtn, tone(false)]" :disabled="!hasActiveMesh" title="Flip normals" @click="projectStore.performFlipNormals()">
              <BlenderIcon name="flip-normals" :size="iconPx" />
            </button>
            <button type="button" :class="[iconBtn, 'text-ui-textMuted hover:text-rose-400 hover:bg-rose-950/30 border border-transparent']" title="Delete (X)" @click="handleDelete">
              <BlenderIcon name="trash" :size="iconPx" />
            </button>
          </div>

          <div v-else-if="toolStore.selectMode === 'vertex'" :class="gridCls">
            <button type="button" :class="[iconBtn, tone(false)]" title="Merge at center (M)" @click="projectStore.performMerge('center')">
              <BlenderIcon name="tool-merge" :size="iconPx" />
            </button>
            <button type="button" :class="[iconBtn, tone(false)]" title="Merge by distance" @click="projectStore.performMerge('distance', 0.01)">
              <BlenderIcon name="snap" :size="iconPx" />
            </button>
            <button type="button" :class="[iconBtn, tone(false)]" title="Connect (J)" @click="projectStore.performConnectVertices()">
              <BlenderIcon name="connect-verts" :size="iconPx" />
            </button>
            <button type="button" :class="[iconBtn, tone(false)]" title="Fill (F)" @click="requestFillFace()">
              <BlenderIcon name="fill-face" :size="iconPx" />
            </button>
            <button type="button" :class="[iconBtn, tone(false)]" title="Dissolve vertices" @click="projectStore.performDissolve('vertex')">
              <BlenderIcon name="dissolve" :size="iconPx" />
            </button>
            <button type="button" :class="[iconBtn, 'text-ui-textMuted hover:text-rose-400 hover:bg-rose-950/30 border border-transparent']" title="Delete vertices" @click="handleDelete">
              <BlenderIcon name="trash" :size="iconPx" />
            </button>
          </div>

          <div v-else-if="toolStore.selectMode === 'edge'" :class="gridCls">
            <button type="button" :class="[iconBtn, tone(false)]" :disabled="!hasTwoSelectedEdges" title="Bridge edges" @click="projectStore.performBridgeEdges()">
              <BlenderIcon name="bridge-edges" :size="iconPx" />
            </button>
            <button type="button" :class="[iconBtn, tone(false)]" :disabled="!hasSelectedEdges" title="Subdivide edges" @click="projectStore.performSubdivide('edge')">
              <BlenderIcon name="tool-subdivide" :size="iconPx" />
            </button>
            <button type="button" :class="[iconBtn, tone(false)]" title="Dissolve edges" @click="projectStore.performDissolve('edge')">
              <BlenderIcon name="dissolve" :size="iconPx" />
            </button>
            <button type="button" :class="[iconBtn, tone(false)]" :disabled="!hasFillBoundary" title="Fill (F)" @click="requestFillFace()">
              <BlenderIcon name="fill-face" :size="iconPx" />
            </button>
            <button type="button" :class="[iconBtn, tone(false)]" :disabled="!hasFillBoundary" title="Grid fill" @click="projectStore.performGridFill()">
              <BlenderIcon name="tool-subdivide" :size="iconPx" />
            </button>
            <button type="button" :class="[iconBtn, 'text-ui-textMuted hover:text-rose-400 hover:bg-rose-950/30 border border-transparent']" title="Delete edges" @click="handleDelete">
              <BlenderIcon name="trash" :size="iconPx" />
            </button>
          </div>

          <div v-else-if="toolStore.selectMode === 'face'" :class="gridCls">
            <button type="button" :class="[iconBtn, tone(false)]" :disabled="!hasSelectedFaces" title="Separate (P)" @click="projectStore.performSeparateMesh()">
              <BlenderIcon name="separate-mesh" :size="iconPx" />
            </button>
            <button type="button" :class="[iconBtn, tone(false)]" title="Flip normals" @click="projectStore.performFlipNormals()">
              <BlenderIcon name="flip-normals" :size="iconPx" />
            </button>
            <button type="button" :class="[iconBtn, tone(false)]" :disabled="!hasSelectedFaces" title="Subdivide faces" @click="projectStore.performSubdivide('face')">
              <BlenderIcon name="tool-subdivide" :size="iconPx" />
            </button>
            <button type="button" :class="[iconBtn, 'text-ui-textMuted hover:text-rose-400 hover:bg-rose-950/30 border border-transparent']" title="Delete faces" @click="handleDelete">
              <BlenderIcon name="trash" :size="iconPx" />
            </button>
          </div>
        </div>
      </template>

      <!-- Other workspaces: single contextual shelf -->
      <div v-else class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-1.5 py-1.5">
        <div v-if="isMeshWorkspace && (toolStore.selectMode === 'object' || toolStore.selectMode === 'origin')" :class="gridCls">
          <button type="button" :class="[iconBtn, tone(false)]" title="Duplicate (Shift+D)" @click="projectStore.duplicateSelection('object')">
            <BlenderIcon name="duplicate" :size="iconPx" />
          </button>
          <button type="button" :class="[iconBtn, tone(false)]" :disabled="selectedObjectCount < 2" title="Join (Ctrl+J)" @click="projectStore.performJoinMeshes()">
            <BlenderIcon name="join-mesh" :size="iconPx" />
          </button>
          <button type="button" :class="[iconBtn, tone(false)]" :disabled="!hasActiveMesh" title="Clean mesh" @click="projectStore.performCleanupMesh()">
            <BlenderIcon name="clean-mesh" :size="iconPx" />
          </button>
          <button type="button" :class="[iconBtn, 'text-ui-textMuted hover:text-rose-400 hover:bg-rose-950/30 border border-transparent']" title="Delete" @click="handleDelete">
            <BlenderIcon name="trash" :size="iconPx" />
          </button>
        </div>

        <div v-else-if="isMeshWorkspace && toolStore.selectMode === 'vertex'" :class="gridCls">
          <button type="button" :class="[iconBtn, tone(false)]" title="Merge (M)" @click="projectStore.performMerge('center')">
            <BlenderIcon name="tool-merge" :size="iconPx" />
          </button>
          <button type="button" :class="[iconBtn, tone(false)]" title="Connect (J)" @click="projectStore.performConnectVertices()">
            <BlenderIcon name="connect-verts" :size="iconPx" />
          </button>
          <button type="button" :class="[iconBtn, tone(false)]" title="Fill (F)" @click="requestFillFace()">
            <BlenderIcon name="fill-face" :size="iconPx" />
          </button>
          <button type="button" :class="[iconBtn, 'text-ui-textMuted hover:text-rose-400 hover:bg-rose-950/30 border border-transparent']" title="Delete" @click="handleDelete">
            <BlenderIcon name="trash" :size="iconPx" />
          </button>
        </div>

        <div v-else-if="isMeshWorkspace && toolStore.selectMode === 'edge'" :class="gridCls">
          <button type="button" :class="[iconBtn, tone(false)]" title="Loop cut (Ctrl+R)" @click="startModalOp('loop_cut')">
            <BlenderIcon name="tool-loopcut" :size="iconPx" />
          </button>
          <button type="button" :class="[iconBtn, tone(false)]" title="Knife (K)" @click="startModalOp('knife')">
            <BlenderIcon name="tool-knife" :size="iconPx" />
          </button>
          <button type="button" :class="[iconBtn, tone(false)]" :disabled="!hasTwoSelectedEdges" title="Bridge" @click="projectStore.performBridgeEdges()">
            <BlenderIcon name="bridge-edges" :size="iconPx" />
          </button>
          <button type="button" :class="[iconBtn, 'text-ui-textMuted hover:text-rose-400 hover:bg-rose-950/30 border border-transparent']" title="Delete" @click="handleDelete">
            <BlenderIcon name="trash" :size="iconPx" />
          </button>
        </div>

        <div v-else-if="isMeshWorkspace && toolStore.selectMode === 'face'" :class="gridCls">
          <button type="button" :class="[iconBtn, tone(false)]" title="Extrude (E)" @click="startModalOp('extrude')">
            <BlenderIcon name="tool-extrude" :size="iconPx" />
          </button>
          <button type="button" :class="[iconBtn, tone(false)]" title="Inset (I)" @click="startModalOp('inset')">
            <BlenderIcon name="tool-inset" :size="iconPx" />
          </button>
          <button type="button" :class="[iconBtn, tone(false)]" title="Bevel (Ctrl+B)" @click="startModalOp('bevel')">
            <BlenderIcon name="tool-bevel" :size="iconPx" />
          </button>
          <button type="button" :class="[iconBtn, 'text-ui-textMuted hover:text-rose-400 hover:bg-rose-950/30 border border-transparent']" title="Delete" @click="handleDelete">
            <BlenderIcon name="trash" :size="iconPx" />
          </button>
        </div>

        <div v-else-if="isUvSelectionMode" :class="gridCls">
          <button type="button" :class="[iconBtn, tone(false)]" :disabled="!hasActiveMesh" title="Unwrap seams" @click="projectStore.performSeamUnwrap()">
            <BlenderIcon name="uv" :size="iconPx" />
          </button>
          <button type="button" :class="[iconBtn, tone(false)]" :disabled="!hasActiveMesh" title="Pack islands" @click="projectStore.performPackUVIslands()">
            <BlenderIcon name="object-mode" :size="iconPx" />
          </button>
          <button type="button" :class="[iconBtn, tone(false)]" :disabled="!hasSelectedEdges" title="Mark seam" @click="projectStore.markSelectedEdgesAsSeam()">
            <BlenderIcon name="edge-select" :size="iconPx" />
          </button>
          <button type="button" :class="[iconBtn, tone(false)]" :disabled="!hasSelectedEdges" title="Clear seam" @click="projectStore.clearSelectedEdgesSeam()">
            <BlenderIcon name="dissolve" :size="iconPx" />
          </button>
        </div>

        <div v-else-if="toolStore.appMode === 'uvpaint' && toolStore.uvWorkspaceTab === 'paint'" :class="gridCls">
          <button type="button" :class="[iconBtn, tone(toolStore.paintTool === 'brush')]" title="Brush (B)" @click="toolStore.paintTool = 'brush'">
            <BlenderIcon name="brush" :size="iconPx" />
          </button>
          <button type="button" :class="[iconBtn, tone(toolStore.paintTool === 'bucket')]" title="Bucket (G)" @click="toolStore.paintTool = 'bucket'">
            <BlenderIcon name="fill" :size="iconPx" />
          </button>
          <button type="button" :class="[iconBtn, tone(toolStore.paintTool === 'dither')]" title="Dither (D)" @click="toolStore.paintTool = 'dither'">
            <BlenderIcon name="dither" :size="iconPx" />
          </button>
          <button type="button" :class="[iconBtn, tone(toolStore.paintTool === 'eraser')]" title="Eraser (E)" @click="toolStore.paintTool = 'eraser'">
            <BlenderIcon name="eraser" :size="iconPx" />
          </button>
          <button type="button" :class="[iconBtn, tone(toolStore.paintTool === 'picker')]" title="Picker (I)" @click="toolStore.paintTool = 'picker'">
            <BlenderIcon name="picker" :size="iconPx" />
          </button>
          <button type="button" :class="[iconBtn, 'text-ui-textMuted hover:text-rose-400 hover:bg-rose-950/30 border border-transparent']" title="Clear canvas" @click="clearActiveTexture">
            <BlenderIcon name="trash" :size="iconPx" />
          </button>
        </div>

        <div v-else-if="toolStore.appMode === 'rig'" :class="gridCls">
          <button type="button" :class="[iconBtn, tone(false)]" :title="animationStore.selectedBoneId ? 'Add child bone' : 'Add root bone'" @click="handleAddBone">
            <BlenderIcon name="bone" :size="iconPx" />
          </button>
          <button type="button" :class="[iconBtn, tone(false)]" title="Extrude bone (E)" @click="animationStore.extrudeBone(animationStore.selectedBoneId)">
            <BlenderIcon name="tool-extrude" :size="iconPx" />
          </button>
          <button type="button" :class="[iconBtn, tone(false)]" :disabled="!animationStore.selectedBoneId" title="Subdivide bone" @click="animationStore.selectedBoneId ? animationStore.subdivideBone(animationStore.selectedBoneId) : null">
            <BlenderIcon name="tool-subdivide" :size="iconPx" />
          </button>
          <button type="button" :class="[iconBtn, tone(false)]" title="Symmetrize" @click="handleSymmetrizeBones">
            <BlenderIcon name="tool-merge" :size="iconPx" />
          </button>
          <button v-if="animationStore.selectedBoneId" type="button" :class="[iconBtn, 'text-ui-textMuted hover:text-rose-400 hover:bg-rose-950/30 border border-transparent', columns === 2 ? 'col-span-2' : '']" title="Delete bone" @click="animationStore.deleteBone(animationStore.selectedBoneId)">
            <BlenderIcon name="trash" :size="iconPx" />
          </button>
        </div>

        <div v-else-if="toolStore.appMode === 'animate'" :class="gridCls">
          <button type="button" :class="[iconBtn, tone(false)]" title="Insert key (I / K)" @click="animationStore.recordCurrentKeyframe()">
            <BlenderIcon name="keyframe" :size="iconPx" />
          </button>
          <button type="button" :class="[iconBtn, tone(false)]" title="Play (Space)" @click="animationStore.togglePlay()">
            <BlenderIcon name="pose" :size="iconPx" />
          </button>
          <button type="button" :class="[iconBtn, tone(false)]" title="Reset pose (Alt+R)" @click="animationStore.resetPose">
            <BlenderIcon name="tool-rotate" :size="iconPx" />
          </button>
        </div>
      </div>
    </div>
  </aside>
  </div>
</template>
