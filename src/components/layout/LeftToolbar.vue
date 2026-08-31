<script setup lang="ts">
import { computed, ref } from 'vue'
import { useToolStore } from '../../stores/toolStore'
import { useProjectStore } from '../../stores/projectStore'
import { useAnimationStore } from '../../stores/animationStore'
import { SelectMode, ModelToolType } from '../../types/tools'
import BlenderIcon from '../icons/BlenderIcon.vue'
import { requestModalTool, requestPrimitiveMenu, type ModalToolCommand } from '../../core/commands/editorCommands'
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

// Floating / Minimizable Panel States
const isFloating = ref(true)
const columns = ref<1 | 2>(2)
const isMinimized = ref(false)
const pos = ref({ x: 16, y: 46 })

const isDragging = ref(false)
let dragOffset = { x: 0, y: 0 }

function toggleColumns() {
  columns.value = columns.value === 2 ? 1 : 2
}

function toggleFloating() {
  isFloating.value = !isFloating.value
  if (isFloating.value) {
    pos.value = { x: 16, y: 46 }
  }
}

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
    toolStore.setAppMode('model')
    ensureActiveMeshSelection()
    toolStore.selectMode = mode
  }
}

function toggleOriginMode() {
  if (toolStore.selectMode === 'origin') {
    toolStore.selectMode = 'object'
  } else {
    toolStore.setAppMode('model')
    ensureActiveMeshSelection()
    toolStore.selectMode = 'origin'
  }
}

function setModelTool(tool: ModelToolType) {
  if (toolStore.appMode === 'model') ensureActiveMeshSelection()
  toolStore.setModelTool(tool)
}

function startModalOp(opName: ModalToolCommand) {
  toolStore.setAppMode('model')
  ensureActiveMeshSelection()
  requestModalTool(opName)
}

function startDrag(e: MouseEvent) {
  if (!isFloating.value) return
  if (e.button !== 0) return

  isDragging.value = true
  dragOffset = {
    x: e.clientX - pos.value.x,
    y: e.clientY - pos.value.y
  }

  const onMouseMove = (moveEvent: MouseEvent) => {
    if (!isDragging.value) return
    const maxX = window.innerWidth - (columns.value === 1 ? 60 : 100)
    const maxY = window.innerHeight - 80
    pos.value.x = Math.max(0, Math.min(maxX, moveEvent.clientX - dragOffset.x))
    pos.value.y = Math.max(34, Math.min(maxY, moveEvent.clientY - dragOffset.y))
  }

  const onMouseUp = () => {
    isDragging.value = false
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
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
  toolStore.setAppMode('model')
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
  <aside 
    class="bg-ui-panel border border-ui-borderSubtle flex flex-col items-center py-1.5 select-none z-40 overflow-y-auto font-sans text-xs transition-all duration-75 shadow-2xl"
    :class="[
      isFloating ? 'fixed rounded-xs border-ui-borderStrong' : 'relative border-r border-t-0 border-b-0 border-l-0 h-full',
      columns === 1 ? 'w-[54px]' : 'w-[94px]',
      isMinimized ? 'h-auto' : ''
    ]"
    :style="isFloating ? { left: `${pos.x}px`, top: `${pos.y}px` } : {}"
  >
    <!-- Movable Header & Minimize Bar -->
    <div 
      class="w-full px-1.5 py-1 border-b border-ui-borderSubtle flex items-center justify-between text-ui-textMuted select-none mb-1.5 group"
      :class="{ 'cursor-move bg-ui-header': isFloating, 'cursor-pointer hover:bg-ui-hover': !isFloating }"
      @mousedown="startDrag"
      @dblclick="toggleColumns"
      :title="isFloating ? 'Drag to move toolbar. Double-click to toggle 1/2 columns.' : 'Double-click to toggle 1/2 columns.'"
    >
      <div class="flex items-center space-x-1">
        <GripHorizontal class="w-4 h-4 text-ui-textMuted group-hover:text-ui-textSecondary transition" />
      </div>

      <div class="flex items-center space-x-0.5" @mousedown.stop>
        <!-- Toggle 1-Col vs 2-Col -->
        <button 
          @click="toggleColumns"
          class="p-0.5 text-ui-textMuted hover:text-ui-textSecondary rounded-xs hover:bg-ui-hover transition"
          :title="columns === 2 ? 'Collapse to Single Column' : 'Expand to Double Column'"
        >
          <ChevronsLeft v-if="columns === 2" class="w-3.5 h-3.5" />
          <ChevronsRight v-else class="w-3.5 h-3.5" />
        </button>

        <!-- Toggle Dock / Float -->
        <button 
          @click="toggleFloating"
          class="p-0.5 text-ui-textMuted hover:text-ui-textSecondary rounded-xs hover:bg-ui-hover transition"
          :class="{ 'text-ui-accent': isFloating }"
          :title="isFloating ? 'Dock to Left Edge' : 'Undock / Float Panel'"
        >
          <PinOff v-if="isFloating" class="w-3.5 h-3.5" />
          <Pin v-else class="w-3.5 h-3.5" />
        </button>

        <!-- Minimize / Fold -->
        <button 
          @click="isMinimized = !isMinimized"
          class="p-0.5 text-ui-textMuted hover:text-ui-textSecondary rounded-xs hover:bg-ui-hover transition"
          :title="isMinimized ? 'Expand Toolbar' : 'Minimize Toolbar'"
        >
          <Plus v-if="isMinimized" class="w-3.5 h-3.5" />
          <Minus v-else class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- Body Content (Hidden when minimized) -->
    <div v-show="!isMinimized" class="w-full flex flex-col items-center">
      <!-- 1. SELECTION MODES & MARQUEE TOOL -->
      <div v-if="toolStore.appMode === 'model' || isUvSelectionMode" class="w-full px-1.5 border-b border-ui-borderSubtle pb-1.5 mb-1.5">
        <div v-if="columns === 2" class="text-[11px] font-medium text-ui-textMuted mb-1 px-1">{{ isUvSelectionMode ? 'UV Select' : 'Select' }}</div>
        <div class="grid gap-1.5 w-full" :class="columns === 1 ? 'grid-cols-1' : 'grid-cols-2'">
          <!-- Select Box / Marquee Tool -->
          <button 
            v-if="toolStore.appMode === 'model'"
            @click="toolStore.isBoxSelectActive = !toolStore.isBoxSelectActive"
            class="w-full h-9 flex items-center justify-center rounded-xs transition relative cursor-pointer"
            :class="toolStore.isBoxSelectActive ? 'bg-amber-500/20 text-amber-300 border border-amber-500/60 font-bold shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
            title="Box Select Marquee (B / Ctrl+LMB Drag - One-Shot)"
          >
            <BlenderIcon name="marquee" :size="19" :color="toolStore.isBoxSelectActive ? '#f59e0b' : 'currentColor'" />
            <span v-if="columns === 2" class="absolute bottom-0.5 right-1 text-[9px] font-mono opacity-60">B</span>
          </button>

          <!-- Object Mode (4) -->
          <button 
            @click="setSelectMode('object')"
            class="w-full h-9 flex items-center justify-center rounded-xs transition relative cursor-pointer"
            :class="toolStore.selectMode === 'object' && toolStore.appMode === 'model' ? 'bg-ui-active text-ui-textAccent border border-ui-accent/40 shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
            :title="isUvSelectionMode ? 'UV Island Select (4)' : 'Object Mode (4 / Tab)'"
          >
            <BlenderIcon name="object-mode" :size="20" />
            <span v-if="columns === 2" class="absolute bottom-0.5 right-1 text-[9px] font-mono opacity-60">4</span>
          </button>

          <!-- Origin / Pivot Mode (5) -->
          <button 
            v-if="toolStore.appMode === 'model'"
            @click="toggleOriginMode"
            class="w-full h-9 flex items-center justify-center rounded-xs transition relative cursor-pointer"
            :class="toolStore.selectMode === 'origin' && toolStore.appMode === 'model' ? 'bg-amber-500/25 text-amber-300 border border-amber-500/60 font-bold shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
            title="Origin / Pivot Edit (5)"
          >
            <BlenderIcon name="origin" :size="20" :color="toolStore.selectMode === 'origin' ? '#f59e0b' : 'currentColor'" />
            <span v-if="columns === 2" class="absolute bottom-0.5 right-1 text-[9px] font-mono opacity-60">5</span>
          </button>

          <!-- Vertex Mode (1) -->
          <button 
            @click="setSelectMode('vertex')"
            class="w-full h-9 flex items-center justify-center rounded-xs transition relative cursor-pointer"
            :class="toolStore.selectMode === 'vertex' && toolStore.appMode === 'model' ? 'bg-ui-active text-ui-textAccent border border-ui-accent/40 shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
            title="Vertex Select (1)"
          >
            <BlenderIcon name="vertex-select" :size="20" />
            <span v-if="columns === 2" class="absolute bottom-0.5 right-1 text-[9px] font-mono opacity-60">1</span>
          </button>

          <!-- Edge Mode (2) -->
          <button 
            @click="setSelectMode('edge')"
            class="w-full h-9 flex items-center justify-center rounded-xs transition relative cursor-pointer"
            :class="toolStore.selectMode === 'edge' && toolStore.appMode === 'model' ? 'bg-ui-active text-ui-textAccent border border-ui-accent/40 shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
            title="Edge Select (2)"
          >
            <BlenderIcon name="edge-select" :size="20" />
            <span v-if="columns === 2" class="absolute bottom-0.5 right-1 text-[9px] font-mono opacity-60">2</span>
          </button>

          <!-- Face Mode (3) -->
          <button 
            @click="setSelectMode('face')"
            class="w-full h-9 flex items-center justify-center rounded-xs transition relative cursor-pointer"
            :class="toolStore.selectMode === 'face' && toolStore.appMode === 'model' ? 'bg-ui-active text-ui-textAccent border border-ui-accent/40 shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
            title="Face Select (3)"
          >
            <BlenderIcon name="face-select" :size="20" />
            <span v-if="columns === 2" class="absolute bottom-0.5 right-1 text-[9px] font-mono opacity-60">3</span>
          </button>

          <!-- Bone Mode (6) -->
          <button 
            v-if="toolStore.appMode === 'model'"
            @click="setSelectMode('bone')"
            class="w-full h-9 flex items-center justify-center rounded-xs transition relative cursor-pointer"
            :class="toolStore.selectMode === 'bone' ? 'bg-ui-active text-ui-textAccent border border-ui-accent/40 shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
            title="Bone Selection Mode (6 / Rigging)"
          >
            <BlenderIcon name="bone" :size="19" />
            <span v-if="columns === 2" class="absolute bottom-0.5 right-1 text-[9px] font-mono opacity-60">6</span>
          </button>

          <!-- Snapping Quick Toggle -->
          <button 
            v-if="toolStore.appMode === 'model'"
            @click="toolStore.snapping.grid = !toolStore.snapping.grid"
            class="w-full h-9 flex items-center justify-center rounded-xs transition relative cursor-pointer"
            :class="toolStore.snapping.grid ? 'bg-ui-accentSubtle text-ui-textAccent border border-ui-accent/30 shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
            title="Toggle Grid Snapping (Shift+Tab)"
          >
            <BlenderIcon name="snap" :size="19" />
          </button>
        </div>
      </div>

      <!-- 2. TRANSFORM & PLACEMENT TOOLS -->
      <div v-if="toolStore.appMode === 'model' || toolStore.appMode === 'rig' || toolStore.appMode === 'animate'" class="w-full px-1.5 border-b border-ui-borderSubtle pb-1.5 mb-1.5">
        <div v-if="columns === 2" class="text-[11px] font-medium text-ui-textMuted mb-1 px-1">Gizmo</div>
        <div class="grid gap-1.5 w-full" :class="columns === 1 ? 'grid-cols-1' : 'grid-cols-2'">
          <!-- Move Tool -->
          <button 
            @click="setModelTool('move')"
            class="w-full h-9 flex items-center justify-center rounded-xs transition cursor-pointer"
            :class="toolStore.modelTool === 'move' ? 'bg-ui-active text-ui-textAccent border border-ui-accent/40 shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
            title="Move Tool (G / W)"
          >
            <BlenderIcon name="tool-move" :size="20" />
          </button>

          <!-- Rotate Tool -->
          <button 
            @click="setModelTool('rotate')"
            class="w-full h-9 flex items-center justify-center rounded-xs transition cursor-pointer"
            :class="toolStore.modelTool === 'rotate' ? 'bg-ui-active text-ui-textAccent border border-ui-accent/40 shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
            title="Rotate Tool (R)"
          >
            <BlenderIcon name="tool-rotate" :size="20" />
          </button>

          <!-- Scale Tool -->
          <button 
            @click="setModelTool('scale')"
            class="w-full h-9 flex items-center justify-center rounded-xs transition cursor-pointer"
            :class="toolStore.modelTool === 'scale' ? 'bg-ui-active text-ui-textAccent border border-ui-accent/40 shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
            title="Scale Tool (S)"
          >
            <BlenderIcon name="tool-scale" :size="20" />
          </button>

          <!-- Add Primitive / CAD Shapes Popout Trigger -->
          <button 
            v-if="toolStore.appMode === 'model'"
            @click="handleOpenAddPrimitive"
            class="w-full h-9 flex items-center justify-center rounded-xs text-amber-400 hover:text-amber-300 hover:bg-ui-hover transition border border-amber-500/30 bg-amber-500/10 cursor-pointer"
            title="Add Primitive & CAD Shapes (Shift+A)"
          >
            <BlenderIcon name="mesh-cube" :size="19" color="#f59e0b" />
          </button>
        </div>
      </div>

      <!-- 3. CONTEXTUAL ESSENTIAL MODELING TOOLS -->
      
      <!-- (A) OBJECT / ORIGIN MODE TOOLS -->
      <div v-if="toolStore.appMode === 'model' && (toolStore.selectMode === 'object' || toolStore.selectMode === 'origin')" class="w-full px-1.5 flex-1">
        <div v-if="columns === 2" class="text-[11px] font-medium text-ui-textMuted mb-1 px-1">Object</div>
        <div class="grid gap-1.5 w-full" :class="columns === 1 ? 'grid-cols-1' : 'grid-cols-2'">
          <button @click="projectStore.duplicateSelection('object')" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition cursor-pointer" title="Duplicate Object (Shift+D)">
            <BlenderIcon name="duplicate" :size="19" />
          </button>

          <button @click="projectStore.performJoinMeshes()" :disabled="selectedObjectCount < 2" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer" title="Join Selected Meshes (Ctrl+J)">
            <BlenderIcon name="join-mesh" :size="20" />
          </button>

          <button @click="projectStore.performCleanupMesh()" :disabled="!hasActiveMesh" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer" title="Safe Clean Mesh Geometry">
            <BlenderIcon name="clean-mesh" :size="19" />
          </button>

          <button @click="projectStore.performFlipNormals()" :disabled="!hasActiveMesh" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer" title="Flip Mesh Normals">
            <BlenderIcon name="flip-normals" :size="20" />
          </button>

          <button @click="handleDelete" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textMuted hover:text-rose-400 hover:bg-rose-950/30 transition cursor-pointer" title="Delete Object (Delete / X)">
            <BlenderIcon name="trash" :size="19" />
          </button>
        </div>
      </div>

      <!-- (B) VERTEX MODE TOOLS -->
      <div v-else-if="toolStore.appMode === 'model' && toolStore.selectMode === 'vertex'" class="w-full px-1.5 flex-1">
        <div v-if="columns === 2" class="text-[11px] font-medium text-ui-textMuted mb-1 px-1">Vertex</div>
        <div class="grid gap-1.5 w-full" :class="columns === 1 ? 'grid-cols-1' : 'grid-cols-2'">
          <button @click="projectStore.performMerge('center')" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition cursor-pointer" title="Merge Vertices at Center (M)">
            <BlenderIcon name="tool-merge" :size="20" />
          </button>

          <button @click="projectStore.performMerge('distance', 0.01)" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition cursor-pointer" title="Merge by Distance / Auto Weld">
            <BlenderIcon name="snap" :size="19" />
          </button>

          <button @click="projectStore.performConnectVertices()" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition cursor-pointer" title="Connect Selected 2 Vertices (J)">
            <BlenderIcon name="connect-verts" :size="20" />
          </button>

          <button @click="projectStore.performFillFace()" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition cursor-pointer" title="Fill Face from Vertices (F)">
            <BlenderIcon name="fill-face" :size="20" />
          </button>

          <button @click="startModalOp('knife')" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition cursor-pointer" title="Knife Topology Tool (K)">
            <BlenderIcon name="tool-knife" :size="20" />
          </button>

          <button @click="projectStore.performSubdivide('vertex')" :disabled="projectStore.selectedVertexIds.length === 0" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer" title="Subdivide Faces Touching Selected Vertices">
            <BlenderIcon name="tool-subdivide" :size="20" />
          </button>

          <button @click="projectStore.performDissolve('vertex')" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition cursor-pointer" title="Dissolve Vertices">
            <BlenderIcon name="dissolve" :size="20" />
          </button>

          <button @click="handleDelete" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textMuted hover:text-rose-400 hover:bg-rose-950/30 transition cursor-pointer" title="Delete Vertices (Delete / X)">
            <BlenderIcon name="trash" :size="19" />
          </button>
        </div>
      </div>

      <!-- (C) EDGE MODE TOOLS -->
      <div v-else-if="toolStore.appMode === 'model' && toolStore.selectMode === 'edge'" class="w-full px-1.5 flex-1">
        <div v-if="columns === 2" class="text-[11px] font-medium text-ui-textMuted mb-1 px-1">Edge</div>
        <div class="grid gap-1.5 w-full" :class="columns === 1 ? 'grid-cols-1' : 'grid-cols-2'">
          <button @click="startModalOp('loop_cut')" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition cursor-pointer" title="Loop Cut & Slide (Ctrl+R)">
            <BlenderIcon name="tool-loopcut" :size="20" />
          </button>

          <button @click="startModalOp('knife')" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition cursor-pointer" title="Knife Topology Tool (K)">
            <BlenderIcon name="tool-knife" :size="20" />
          </button>

          <button @click="projectStore.performBridgeEdges()" :disabled="!hasTwoSelectedEdges" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer" title="Bridge Selected Edges / Edge Loops">
            <BlenderIcon name="bridge-edges" :size="20" />
          </button>

          <button @click="projectStore.performSubdivide('edge')" :disabled="!hasSelectedEdges" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer" title="Subdivide Selected Edges">
            <BlenderIcon name="tool-subdivide" :size="20" />
          </button>

          <button @click="projectStore.performDissolve('edge')" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition cursor-pointer" title="Dissolve Edge">
            <BlenderIcon name="dissolve" :size="20" />
          </button>

          <button @click="projectStore.performFillFace()" :disabled="!hasFillBoundary" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer" title="Fill Selected Edge Boundary (F)">
            <BlenderIcon name="fill-face" :size="20" />
          </button>

          <button @click="projectStore.performGridFill()" :disabled="!hasFillBoundary" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer" title="Grid Fill Selected Edge Boundary">
            <BlenderIcon name="tool-subdivide" :size="20" />
          </button>

          <button @click="handleDelete" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textMuted hover:text-rose-400 hover:bg-rose-950/30 transition cursor-pointer" title="Delete Edges (Delete / X)">
            <BlenderIcon name="trash" :size="19" />
          </button>
        </div>
      </div>

      <!-- (D) FACE MODE TOOLS -->
      <div v-else-if="toolStore.appMode === 'model' && toolStore.selectMode === 'face'" class="w-full px-1.5 flex-1">
        <div v-if="columns === 2" class="text-[11px] font-medium text-ui-textMuted mb-1 px-1">Face</div>
        <div class="grid gap-1.5 w-full" :class="columns === 1 ? 'grid-cols-1' : 'grid-cols-2'">
          <button @click="startModalOp('extrude')" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition cursor-pointer" title="Extrude Region (E)">
            <BlenderIcon name="tool-extrude" :size="20" />
          </button>

          <button @click="startModalOp('inset')" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition cursor-pointer" title="Inset Faces (I)">
            <BlenderIcon name="tool-inset" :size="20" />
          </button>

          <button @click="startModalOp('bevel')" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition cursor-pointer" title="Bevel / Chamfer (Ctrl+B)">
            <BlenderIcon name="tool-bevel" :size="20" />
          </button>

          <button @click="startModalOp('loop_cut')" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition cursor-pointer" title="Loop Cut & Slide (Ctrl+R)">
            <BlenderIcon name="tool-loopcut" :size="20" />
          </button>

          <button @click="startModalOp('knife')" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition cursor-pointer" title="Knife Topology Tool (K)">
            <BlenderIcon name="tool-knife" :size="20" />
          </button>

          <button @click="projectStore.performSubdivide('face')" :disabled="!hasSelectedFaces" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer" title="Subdivide Selected Faces">
            <BlenderIcon name="tool-subdivide" :size="20" />
          </button>

          <button @click="projectStore.performSeparateMesh()" :disabled="!hasSelectedFaces" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer" title="Separate Selected Faces into New Object (P)">
            <BlenderIcon name="separate-mesh" :size="20" />
          </button>

          <button @click="projectStore.performFlipNormals()" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition cursor-pointer" title="Flip Face Normals">
            <BlenderIcon name="flip-normals" :size="20" />
          </button>

          <button @click="handleDelete" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textMuted hover:text-rose-400 hover:bg-rose-950/30 transition cursor-pointer" title="Delete Faces (Delete / X)">
            <BlenderIcon name="trash" :size="19" />
          </button>
        </div>
      </div>

      <!-- (E) UV TOOLS -->
      <div v-else-if="isUvSelectionMode" class="w-full px-1.5 flex-1">
        <div v-if="columns === 2" class="text-[11px] font-medium text-ui-textMuted mb-1 px-1">UV</div>
        <div class="grid gap-1.5 w-full" :class="columns === 1 ? 'grid-cols-1' : 'grid-cols-2'">
          <button @click="projectStore.performSeamUnwrap()" :disabled="!hasActiveMesh" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer" title="Unwrap Along Marked Seams">
            <BlenderIcon name="uv" :size="20" />
          </button>
          <button @click="projectStore.performPackUVIslands()" :disabled="!hasActiveMesh" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer" title="Pack UV Islands">
            <BlenderIcon name="object-mode" :size="20" />
          </button>
          <button @click="projectStore.markSelectedEdgesAsSeam()" :disabled="!hasSelectedEdges" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer" title="Mark Selected Edges as Seams">
            <BlenderIcon name="edge-select" :size="20" />
          </button>
          <button @click="projectStore.clearSelectedEdgesSeam()" :disabled="!hasSelectedEdges" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer" title="Clear Seam from Selected Edges">
            <BlenderIcon name="dissolve" :size="20" />
          </button>
        </div>
      </div>

      <!-- (F) PAINTING TOOLS -->
      <div v-else-if="toolStore.appMode === 'uvpaint' && (toolStore.uvWorkspaceTab === 'paint' || toolStore.uvWorkspaceTab === 'vertex')" class="w-full px-1.5 flex-1">
        <div v-if="columns === 2" class="text-[11px] font-medium text-ui-textMuted mb-1 px-1">Paint</div>
        <div class="grid gap-1.5 w-full" :class="columns === 1 ? 'grid-cols-1' : 'grid-cols-2'">
          <button @click="toolStore.paintTool = 'brush'" class="w-full h-9 flex items-center justify-center rounded-xs transition cursor-pointer" :class="toolStore.paintTool === 'brush' ? 'bg-ui-active text-ui-textAccent border border-ui-accent/40 shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'" title="Pixel Brush (B)">
            <BlenderIcon name="brush" :size="20" />
          </button>

          <button @click="toolStore.paintTool = 'bucket'" class="w-full h-9 flex items-center justify-center rounded-xs transition cursor-pointer" :class="toolStore.paintTool === 'bucket' ? 'bg-ui-active text-ui-textAccent border border-ui-accent/40 shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'" title="Flood Fill Bucket (G)">
            <BlenderIcon name="fill" :size="20" />
          </button>

          <button @click="toolStore.paintTool = 'dither'" class="w-full h-9 flex items-center justify-center rounded-xs transition cursor-pointer" :class="toolStore.paintTool === 'dither' ? 'bg-ui-active text-ui-textAccent border border-ui-accent/40 shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'" title="Bayer Dither Brush (D)">
            <BlenderIcon name="dither" :size="20" />
          </button>

          <button @click="toolStore.paintTool = 'eraser'" class="w-full h-9 flex items-center justify-center rounded-xs transition cursor-pointer" :class="toolStore.paintTool === 'eraser' ? 'bg-ui-active text-ui-textAccent border border-ui-accent/40 shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'" title="Eraser (E)">
            <BlenderIcon name="eraser" :size="20" />
          </button>

          <button @click="toolStore.paintTool = 'picker'" class="w-full h-9 flex items-center justify-center rounded-xs transition cursor-pointer" :class="toolStore.paintTool === 'picker' ? 'bg-ui-active text-ui-textAccent border border-ui-accent/40 shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'" title="Eyedropper Color Picker (I)">
            <BlenderIcon name="picker" :size="20" />
          </button>

          <button @click="clearActiveTexture" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textMuted hover:text-rose-400 hover:bg-rose-950/30 transition cursor-pointer" title="Clear Texture Canvas">
            <BlenderIcon name="trash" :size="19" />
          </button>
        </div>
      </div>

      <!-- (G) RIGGING TOOLS -->
      <div v-else-if="toolStore.appMode === 'rig'" class="w-full px-1.5 flex-1">
        <div v-if="columns === 2" class="text-[11px] font-medium text-ui-textMuted mb-1 px-1">Rig</div>
        <div class="grid gap-1.5 w-full" :class="columns === 1 ? 'grid-cols-1' : 'grid-cols-2'">
          <button @click="handleAddBone" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition cursor-pointer" :title="animationStore.selectedBoneId ? 'Add Child to Selected Bone' : 'Add Root Bone'">
            <BlenderIcon name="bone" :size="20" />
          </button>

          <button @click="animationStore.extrudeBone(animationStore.selectedBoneId)" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition cursor-pointer" title="Extrude Child Bone (E)">
            <BlenderIcon name="tool-extrude" :size="20" />
          </button>

          <button @click="animationStore.selectedBoneId ? animationStore.subdivideBone(animationStore.selectedBoneId) : null" :disabled="!animationStore.selectedBoneId" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover disabled:opacity-30 transition cursor-pointer" title="Subdivide Selected Bone">
            <BlenderIcon name="tool-subdivide" :size="20" />
          </button>

          <button @click="handleSymmetrizeBones" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition cursor-pointer" title="Symmetrize Left Bones across X-Axis">
            <BlenderIcon name="tool-merge" :size="20" />
          </button>

          <button v-if="animationStore.selectedBoneId" @click="animationStore.deleteBone(animationStore.selectedBoneId)" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textMuted hover:text-rose-400 hover:bg-rose-950/30 transition cursor-pointer" :class="columns === 2 ? 'col-span-2' : ''" title="Delete Selected Bone (Delete / X)">
            <BlenderIcon name="trash" :size="19" />
          </button>
        </div>
      </div>

      <!-- (H) ANIMATION TOOLS -->
      <div v-else-if="toolStore.appMode === 'animate'" class="w-full px-1.5 flex-1">
        <div v-if="columns === 2" class="text-[11px] font-medium text-ui-textMuted mb-1 px-1">Pose</div>
        <div class="grid gap-1.5 w-full" :class="columns === 1 ? 'grid-cols-1' : 'grid-cols-2'">
          <button @click="animationStore.resetPose" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition cursor-pointer" :class="columns === 2 ? 'col-span-2' : ''" title="Reset Pose (Alt+R)">
            <BlenderIcon name="keyframe" :size="20" />
          </button>
        </div>
      </div>
    </div>
  </aside>
</template>
