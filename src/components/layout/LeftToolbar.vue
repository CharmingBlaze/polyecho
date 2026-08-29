<script setup lang="ts">
import { ref } from 'vue'
import { useToolStore } from '../../stores/toolStore'
import { useProjectStore } from '../../stores/projectStore'
import { useAnimationStore } from '../../stores/animationStore'
import BlenderIcon from '../icons/BlenderIcon.vue'
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

// Photoshop-style Floating / Minimizable Panel States
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
    projectStore.performDelete('face')
  }
}

function handleOpenAddPrimitive() {
  window.dispatchEvent(new CustomEvent('open-add-primitive-menu', { detail: { x: 100, y: 150 } }))
}

function handleStartLoopCut() {
  window.dispatchEvent(new CustomEvent('blender-modal-op', { detail: 'loopcut' }))
}

function handleStartKnife() {
  window.dispatchEvent(new CustomEvent('blender-modal-op', { detail: 'knife' }))
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
    <!-- Photoshop-style Movable Header & Minimize Bar -->
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
      <!-- 1. SELECTION MODES -->
      <div class="w-full px-1.5 border-b border-ui-borderSubtle pb-1.5 mb-1.5">
        <div v-if="columns === 2" class="text-[11px] font-medium text-ui-textMuted mb-1 px-1">Select</div>
        <div class="grid gap-1.5 w-full" :class="columns === 1 ? 'grid-cols-1' : 'grid-cols-2'">
          <!-- Object Mode (4) -->
          <button 
            @click="toolStore.selectMode = 'object'"
            class="w-full h-9 flex items-center justify-center rounded-xs transition relative"
            :class="toolStore.selectMode === 'object' ? 'bg-ui-active text-ui-textAccent border border-ui-accent/40 shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
            title="Object Mode (4 / Tab)"
          >
            <BlenderIcon name="object-mode" :size="20" />
            <span v-if="columns === 2" class="absolute bottom-0.5 right-1 text-[9px] font-mono opacity-60">4</span>
          </button>

          <!-- Origin / Pivot Mode (5) -->
          <button 
            @click="toolStore.selectMode = 'origin'"
            class="w-full h-9 flex items-center justify-center rounded-xs transition relative"
            :class="toolStore.selectMode === 'origin' ? 'bg-ui-active text-ui-textAccent border border-ui-accent/40 shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
            title="Origin / Pivot Edit (5 / P)"
          >
            <BlenderIcon name="origin" :size="20" />
            <span v-if="columns === 2" class="absolute bottom-0.5 right-1 text-[9px] font-mono opacity-60">5</span>
          </button>

          <!-- Vertex Mode (1) -->
          <button 
            @click="toolStore.selectMode = 'vertex'"
            class="w-full h-9 flex items-center justify-center rounded-xs transition relative"
            :class="toolStore.selectMode === 'vertex' ? 'bg-ui-active text-ui-textAccent border border-ui-accent/40 shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
            title="Vertex Select (1)"
          >
            <BlenderIcon name="vertex-select" :size="20" />
            <span v-if="columns === 2" class="absolute bottom-0.5 right-1 text-[9px] font-mono opacity-60">1</span>
          </button>

          <!-- Edge Mode (2) -->
          <button 
            @click="toolStore.selectMode = 'edge'"
            class="w-full h-9 flex items-center justify-center rounded-xs transition relative"
            :class="toolStore.selectMode === 'edge' ? 'bg-ui-active text-ui-textAccent border border-ui-accent/40 shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
            title="Edge Select (2)"
          >
            <BlenderIcon name="edge-select" :size="20" />
            <span v-if="columns === 2" class="absolute bottom-0.5 right-1 text-[9px] font-mono opacity-60">2</span>
          </button>

          <!-- Face Mode (3) -->
          <button 
            @click="toolStore.selectMode = 'face'"
            class="w-full h-9 flex items-center justify-center rounded-xs transition relative"
            :class="toolStore.selectMode === 'face' ? 'bg-ui-active text-ui-textAccent border border-ui-accent/40 shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
            title="Face Select (3)"
          >
            <BlenderIcon name="face-select" :size="20" />
            <span v-if="columns === 2" class="absolute bottom-0.5 right-1 text-[9px] font-mono opacity-60">3</span>
          </button>

          <!-- Snapping Quick Toggle -->
          <button 
            @click="toolStore.snapping.grid = !toolStore.snapping.grid"
            class="w-full h-9 flex items-center justify-center rounded-xs transition relative"
            :class="toolStore.snapping.grid ? 'bg-ui-accentSubtle text-ui-textAccent border border-ui-accent/30 shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
            title="Toggle Grid Snapping (Shift+Tab)"
          >
            <BlenderIcon name="snap" :size="19" />
          </button>
        </div>
      </div>

      <!-- 2. TRANSFORM & PLACEMENT TOOLS -->
      <div class="w-full px-1.5 border-b border-ui-borderSubtle pb-1.5 mb-1.5">
        <div v-if="columns === 2" class="text-[11px] font-medium text-ui-textMuted mb-1 px-1">Gizmo</div>
        <div class="grid gap-1.5 w-full" :class="columns === 1 ? 'grid-cols-1' : 'grid-cols-2'">
          <!-- Move Tool -->
          <button 
            @click="toolStore.modelTool = 'move'"
            class="w-full h-9 flex items-center justify-center rounded-xs transition"
            :class="toolStore.modelTool === 'move' ? 'bg-ui-active text-ui-textAccent border border-ui-accent/40 shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
            title="Move Tool (G / W)"
          >
            <BlenderIcon name="tool-move" :size="20" />
          </button>

          <!-- Rotate Tool -->
          <button 
            @click="toolStore.modelTool = 'rotate'"
            class="w-full h-9 flex items-center justify-center rounded-xs transition"
            :class="toolStore.modelTool === 'rotate' ? 'bg-ui-active text-ui-textAccent border border-ui-accent/40 shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
            title="Rotate Tool (R)"
          >
            <BlenderIcon name="tool-rotate" :size="20" />
          </button>

          <!-- Scale Tool -->
          <button 
            @click="toolStore.modelTool = 'scale'"
            class="w-full h-9 flex items-center justify-center rounded-xs transition"
            :class="toolStore.modelTool === 'scale' ? 'bg-ui-active text-ui-textAccent border border-ui-accent/40 shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
            title="Scale Tool (S)"
          >
            <BlenderIcon name="tool-scale" :size="20" />
          </button>

          <!-- Add Primitive / CAD Shapes Popout Trigger -->
          <button 
            @click="handleOpenAddPrimitive"
            class="w-full h-9 flex items-center justify-center rounded-xs text-amber-400 hover:text-amber-300 hover:bg-ui-hover transition border border-amber-500/30 bg-amber-500/10"
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
          <button @click="projectStore.duplicateSelection('object')" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition" title="Duplicate Object (Shift+D)">
            <BlenderIcon name="duplicate" :size="19" />
          </button>

          <button @click="projectStore.performJoinMeshes()" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition" title="Join Selected Meshes (Ctrl+J)">
            <BlenderIcon name="join-mesh" :size="20" />
          </button>

          <button @click="projectStore.performSeparateMesh()" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition" title="Separate Selection (P)">
            <BlenderIcon name="separate-mesh" :size="20" />
          </button>

          <button @click="projectStore.performCleanupMesh()" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition" title="Safe Clean Mesh Geometry">
            <BlenderIcon name="clean-mesh" :size="19" />
          </button>

          <button @click="projectStore.performFlipNormals()" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition" title="Recalculate Outside Normals">
            <BlenderIcon name="flip-normals" :size="20" />
          </button>

          <button @click="handleDelete" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textMuted hover:text-rose-400 hover:bg-rose-950/30 transition" title="Delete Object (Delete / X)">
            <BlenderIcon name="trash" :size="19" />
          </button>
        </div>
      </div>

      <!-- (B) VERTEX MODE TOOLS -->
      <div v-else-if="toolStore.appMode === 'model' && toolStore.selectMode === 'vertex'" class="w-full px-1.5 flex-1">
        <div v-if="columns === 2" class="text-[11px] font-medium text-ui-textMuted mb-1 px-1">Vertex</div>
        <div class="grid gap-1.5 w-full" :class="columns === 1 ? 'grid-cols-1' : 'grid-cols-2'">
          <button @click="projectStore.performMerge('center')" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition" title="Merge Vertices at Center (M)">
            <BlenderIcon name="tool-merge" :size="20" />
          </button>

          <button @click="projectStore.performMerge('distance', 0.01)" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition" title="Merge by Distance / Auto Weld">
            <BlenderIcon name="snap" :size="19" />
          </button>

          <button @click="projectStore.performConnectVertices()" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition" title="Connect Selected 2 Vertices (J)">
            <BlenderIcon name="connect-verts" :size="20" />
          </button>

          <button @click="projectStore.performFillFace()" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition" title="Fill Face from Vertices (F)">
            <BlenderIcon name="fill-face" :size="20" />
          </button>

          <button @click="handleStartKnife" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition" title="Knife Topology Tool (K)">
            <BlenderIcon name="tool-knife" :size="20" />
          </button>

          <button @click="projectStore.performSubdivide()" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition" title="Subdivide Connected Edges">
            <BlenderIcon name="tool-subdivide" :size="20" />
          </button>

          <button @click="projectStore.performDissolve('vertex')" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition" title="Dissolve Vertices">
            <BlenderIcon name="dissolve" :size="20" />
          </button>

          <button @click="handleDelete" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textMuted hover:text-rose-400 hover:bg-rose-950/30 transition" title="Delete Vertices (Delete / X)">
            <BlenderIcon name="trash" :size="19" />
          </button>
        </div>
      </div>

      <!-- (C) EDGE MODE TOOLS -->
      <div v-else-if="toolStore.appMode === 'model' && toolStore.selectMode === 'edge'" class="w-full px-1.5 flex-1">
        <div v-if="columns === 2" class="text-[11px] font-medium text-ui-textMuted mb-1 px-1">Edge</div>
        <div class="grid gap-1.5 w-full" :class="columns === 1 ? 'grid-cols-1' : 'grid-cols-2'">
          <button @click="handleStartLoopCut" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition" title="Loop Cut & Slide (Ctrl+R)">
            <BlenderIcon name="tool-loopcut" :size="20" />
          </button>

          <button @click="handleStartKnife" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition" title="Knife Topology Tool (K)">
            <BlenderIcon name="tool-knife" :size="20" />
          </button>

          <button @click="projectStore.performBevel()" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition" title="Bevel / Chamfer Edge (Ctrl+B)">
            <BlenderIcon name="tool-bevel" :size="20" />
          </button>

          <button @click="projectStore.performExtrude()" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition" title="Extrude Edges (E)">
            <BlenderIcon name="tool-extrude" :size="20" />
          </button>

          <button @click="projectStore.performSubdivide()" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition" title="Subdivide / Divide Edges">
            <BlenderIcon name="tool-subdivide" :size="20" />
          </button>

          <button @click="projectStore.performDissolve('edge')" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition" title="Dissolve Edge">
            <BlenderIcon name="dissolve" :size="20" />
          </button>

          <button @click="projectStore.performFillFace()" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition" title="Fill / Bridge Loop (F)">
            <BlenderIcon name="fill-face" :size="20" />
          </button>

          <button @click="handleDelete" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textMuted hover:text-rose-400 hover:bg-rose-950/30 transition" title="Delete Edges (Delete / X)">
            <BlenderIcon name="trash" :size="19" />
          </button>
        </div>
      </div>

      <!-- (D) FACE MODE TOOLS -->
      <div v-else-if="toolStore.appMode === 'model' && toolStore.selectMode === 'face'" class="w-full px-1.5 flex-1">
        <div v-if="columns === 2" class="text-[11px] font-medium text-ui-textMuted mb-1 px-1">Face</div>
        <div class="grid gap-1.5 w-full" :class="columns === 1 ? 'grid-cols-1' : 'grid-cols-2'">
          <button @click="projectStore.performExtrude()" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition" title="Extrude Region (E)">
            <BlenderIcon name="tool-extrude" :size="20" />
          </button>

          <button @click="projectStore.performInset()" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition" title="Inset Faces (I)">
            <BlenderIcon name="tool-inset" :size="20" />
          </button>

          <button @click="projectStore.performBevel()" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition" title="Bevel / Chamfer (Ctrl+B)">
            <BlenderIcon name="tool-bevel" :size="20" />
          </button>

          <button @click="handleStartLoopCut" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition" title="Loop Cut & Slide (Ctrl+R)">
            <BlenderIcon name="tool-loopcut" :size="20" />
          </button>

          <button @click="handleStartKnife" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition" title="Knife Topology Tool (K)">
            <BlenderIcon name="tool-knife" :size="20" />
          </button>

          <button @click="projectStore.performSubdivide()" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition" title="Subdivide Faces">
            <BlenderIcon name="tool-subdivide" :size="20" />
          </button>

          <button @click="projectStore.performFlipNormals()" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition" title="Flip Face Normals">
            <BlenderIcon name="flip-normals" :size="20" />
          </button>

          <button @click="handleDelete" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textMuted hover:text-rose-400 hover:bg-rose-950/30 transition" title="Delete Faces (Delete / X)">
            <BlenderIcon name="trash" :size="19" />
          </button>
        </div>
      </div>

      <!-- (E) PAINTING TOOLS -->
      <div v-else-if="toolStore.appMode === 'uvpaint' && (toolStore.uvWorkspaceTab === 'paint' || toolStore.uvWorkspaceTab === 'vertex')" class="w-full px-1.5 flex-1">
        <div v-if="columns === 2" class="text-[11px] font-medium text-ui-textMuted mb-1 px-1">Paint</div>
        <div class="grid gap-1.5 w-full" :class="columns === 1 ? 'grid-cols-1' : 'grid-cols-2'">
          <button @click="toolStore.paintTool = 'brush'" class="w-full h-9 flex items-center justify-center rounded-xs transition" :class="toolStore.paintTool === 'brush' ? 'bg-ui-active text-ui-textAccent border border-ui-accent/40 shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'" title="Pixel Brush (B)">
            <BlenderIcon name="brush" :size="20" />
          </button>

          <button @click="toolStore.paintTool = 'bucket'" class="w-full h-9 flex items-center justify-center rounded-xs transition" :class="toolStore.paintTool === 'bucket' ? 'bg-ui-active text-ui-textAccent border border-ui-accent/40 shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'" title="Flood Fill Bucket (G)">
            <BlenderIcon name="fill" :size="20" />
          </button>

          <button @click="toolStore.paintTool = 'dither'" class="w-full h-9 flex items-center justify-center rounded-xs transition" :class="toolStore.paintTool === 'dither' ? 'bg-ui-active text-ui-textAccent border border-ui-accent/40 shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'" title="Bayer Dither Brush (D)">
            <BlenderIcon name="dither" :size="20" />
          </button>

          <button @click="toolStore.paintTool = 'eraser'" class="w-full h-9 flex items-center justify-center rounded-xs transition" :class="toolStore.paintTool === 'eraser' ? 'bg-ui-active text-ui-textAccent border border-ui-accent/40 shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'" title="Eraser (E)">
            <BlenderIcon name="eraser" :size="20" />
          </button>

          <button @click="toolStore.paintTool = 'picker'" class="w-full h-9 flex items-center justify-center rounded-xs transition" :class="toolStore.paintTool === 'picker' ? 'bg-ui-active text-ui-textAccent border border-ui-accent/40 shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'" title="Eyedropper Color Picker (I)">
            <BlenderIcon name="picker" :size="20" />
          </button>

          <button @click="projectStore.pixelBuffer.clear('#000000'); projectStore.markTextureUpdated()" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textMuted hover:text-rose-400 hover:bg-rose-950/30 transition" title="Clear Canvas">
            <BlenderIcon name="trash" :size="19" />
          </button>
        </div>
      </div>

      <!-- (F) RIGGING TOOLS -->
      <div v-else-if="toolStore.appMode === 'rig'" class="w-full px-1.5 flex-1">
        <div v-if="columns === 2" class="text-[11px] font-medium text-ui-textMuted mb-1 px-1">Rig</div>
        <div class="grid gap-1.5 w-full" :class="columns === 1 ? 'grid-cols-1' : 'grid-cols-2'">
          <button @click="handleAddBone" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition" title="Add Root Bone">
            <BlenderIcon name="bone" :size="20" />
          </button>

          <button @click="animationStore.extrudeBone(animationStore.selectedBoneId)" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition" title="Extrude Child Bone (E)">
            <BlenderIcon name="tool-extrude" :size="20" />
          </button>

          <button @click="animationStore.selectedBoneId ? animationStore.subdivideBone(animationStore.selectedBoneId) : null" :disabled="!animationStore.selectedBoneId" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover disabled:opacity-30 transition" title="Subdivide Selected Bone">
            <BlenderIcon name="tool-subdivide" :size="20" />
          </button>

          <button @click="animationStore.symmetrizeArmature" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition" title="Symmetrize Left Bones across X-Axis">
            <BlenderIcon name="tool-merge" :size="20" />
          </button>

          <button v-if="animationStore.selectedBoneId" @click="animationStore.deleteBone(animationStore.selectedBoneId)" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textMuted hover:text-rose-400 hover:bg-rose-950/30 transition" :class="columns === 2 ? 'col-span-2' : ''" title="Delete Selected Bone (Delete / X)">
            <BlenderIcon name="trash" :size="19" />
          </button>
        </div>
      </div>

      <!-- (G) ANIMATION TOOLS -->
      <div v-else-if="toolStore.appMode === 'animate'" class="w-full px-1.5 flex-1">
        <div v-if="columns === 2" class="text-[11px] font-medium text-ui-textMuted mb-1 px-1">Pose</div>
        <div class="grid gap-1.5 w-full" :class="columns === 1 ? 'grid-cols-1' : 'grid-cols-2'">
          <button @click="animationStore.resetPose" class="w-full h-9 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition" :class="columns === 2 ? 'col-span-2' : ''" title="Reset Pose (Alt+R)">
            <BlenderIcon name="keyframe" :size="20" />
          </button>
        </div>
      </div>
    </div>
  </aside>
</template>
