<script setup lang="ts">
import { computed } from 'vue'
import { useToolStore } from '../../stores/toolStore'
import { useProjectStore } from '../../stores/projectStore'
import { useAnimationStore } from '../../stores/animationStore'
import BlenderIcon from '../icons/BlenderIcon.vue'
import { useLayoutStore } from '../../stores/layoutStore'
import { requestFillFace, requestModalTool, requestPrimitiveMenu, requestSmartUvProject } from '../../core/commands/editorCommands'
import { operatorManager } from '../../core/operators/OperatorManager'

const toolStore = useToolStore()
const projectStore = useProjectStore()
const animationStore = useAnimationStore()
const layoutStore = useLayoutStore()

const isModeling = computed(() => toolStore.appMode === 'model')
const isBlockout = computed(() => toolStore.appMode === 'blockout')
const isRigging = computed(() => toolStore.appMode === 'rig')
const isAnimating = computed(() => toolStore.appMode === 'animate')
const isUVPaint = computed(() => toolStore.appMode === 'uvpaint')
const isUVEditing = computed(() => isUVPaint.value && toolStore.uvWorkspaceTab === 'uv')
const modalName = computed(() => {
  void operatorManager.state.value.previewTick
  return operatorManager.state.value.active ? operatorManager.state.value.operatorName : ''
})

function isModal(name: string) {
  return modalName.value === name
}

function modalClass(name: string, idle = 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover') {
  return isModal(name) ? 'bg-ui-active text-ui-textAccent shadow-inner' : idle
}

function setSelectMode(mode: 'object' | 'vertex' | 'edge' | 'face') {
  toolStore.enterSelectMode(mode)
}

function handleSetTool(tool: 'select' | 'move' | 'rotate' | 'scale') {
  toolStore.setModelTool(tool)
}

function handleBoxSelect() {
  toolStore.toggleBoxSelect()
}

function handleStartModal(toolName: string) {
  toolStore.isBoxSelectActive = false
  requestModalTool(toolName as any)
}

function handleSubdivide() {
  if (toolStore.selectMode === 'object' || toolStore.selectMode === 'vertex' || toolStore.selectMode === 'edge' || toolStore.selectMode === 'face') {
    projectStore.performSubdivide(toolStore.selectMode)
  }
}

function handleOpenPrimitiveMenu() {
  requestPrimitiveMenu()
}

function toggleCombinedGizmo() {
  const next = !toolStore.viewport.combinedGizmo
  toolStore.viewport.combinedGizmo = next
  if (next) toolStore.setModelTool('move')
}
</script>

<template>
  <aside 
    class="w-10 bg-ui-panel border-r border-ui-borderSubtle flex flex-col items-center py-2.5 gap-1.5 select-none z-20 shrink-0 font-sans shadow-sm overflow-y-auto overflow-x-hidden"
  >
    <!-- 1. MODELING WORKSPACE TOOLS -->
    <template v-if="isModeling">
      <!-- Object / Vertex / Edge / Face Selection Mode Pill Group -->
      <div class="flex flex-col items-center gap-1 p-0.5 rounded-xs bg-ui-input border border-ui-borderSubtle shrink-0">
        <button 
          class="w-8 h-8 rounded-xs flex items-center justify-center transition cursor-pointer" 
          :class="toolStore.selectMode === 'object' ? 'bg-ui-active text-ui-textAccent shadow-xs font-bold' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Object Select (Tab / 4)"
          @click="setSelectMode('object')"
        >
          <BlenderIcon name="object-mode" :size="18" />
        </button>
        <button 
          class="w-8 h-8 rounded-xs flex items-center justify-center transition cursor-pointer" 
          :class="toolStore.selectMode === 'vertex' ? 'bg-ui-active text-ui-textAccent shadow-xs font-bold' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Vertex Select (1)"
          @click="setSelectMode('vertex')"
        >
          <BlenderIcon name="vertex-select" :size="20" />
        </button>
        <button 
          class="w-8 h-8 rounded-xs flex items-center justify-center transition cursor-pointer" 
          :class="toolStore.selectMode === 'edge' ? 'bg-ui-active text-ui-textAccent shadow-xs font-bold' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Edge Select (2)"
          @click="setSelectMode('edge')"
        >
          <BlenderIcon name="edge-select" :size="20" />
        </button>
        <button 
          class="w-8 h-8 rounded-xs flex items-center justify-center transition cursor-pointer" 
          :class="toolStore.selectMode === 'face' ? 'bg-ui-active text-ui-textAccent shadow-xs font-bold' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Face Select (3)"
          @click="setSelectMode('face')"
        >
          <BlenderIcon name="face-select" :size="20" />
        </button>
      </div>

      <button
        type="button"
        class="w-8 h-8 flex items-center justify-center rounded-xs transition relative group cursor-pointer"
        :class="layoutStore.showPrimitivePanel
          ? 'bg-ui-active text-amber-300 shadow-inner'
          : 'text-amber-400 hover:text-amber-300 hover:bg-ui-hover'"
        title="Add Primitive (Shift+A) — panel stays open until you close it"
        @click="handleOpenPrimitiveMenu"
      >
        <BlenderIcon name="mesh-cube" :size="18" />
      </button>

      <div class="w-6 h-px bg-ui-borderSubtle my-0.5 shrink-0" />

      <!-- Select Box -->
      <button 
        class="w-8 h-8 flex items-center justify-center rounded-xs transition relative group cursor-pointer"
        :class="toolStore.isBoxSelectActive ? 'bg-ui-active text-ui-textAccent shadow-inner' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
        :aria-pressed="toolStore.isBoxSelectActive"
        title="Select Box (B)"
        @click="handleBoxSelect"
      >
        <BlenderIcon name="select-box" :size="18" />
      </button>

      <!-- Move -->
      <button 
        class="w-8 h-8 flex items-center justify-center rounded-xs transition relative group cursor-pointer"
        :class="toolStore.modelTool === 'move' ? 'bg-ui-active text-ui-textAccent shadow-inner' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
        title="Move gizmo — G starts grab"
        @click="handleSetTool('move')"
      >
        <BlenderIcon name="tool-move" :size="18" />
      </button>

      <!-- Rotate -->
      <button 
        class="w-8 h-8 flex items-center justify-center rounded-xs transition relative group cursor-pointer"
        :class="toolStore.modelTool === 'rotate' ? 'bg-ui-active text-ui-textAccent shadow-inner' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
        title="Rotate gizmo — R starts rotate"
        @click="handleSetTool('rotate')"
      >
        <BlenderIcon name="tool-rotate" :size="18" />
      </button>

      <!-- Scale -->
      <button 
        class="w-8 h-8 flex items-center justify-center rounded-xs transition relative group cursor-pointer"
        :class="toolStore.modelTool === 'scale' ? 'bg-ui-active text-ui-textAccent shadow-inner' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
        title="Scale gizmo — S starts scale"
        @click="handleSetTool('scale')"
      >
        <BlenderIcon name="tool-scale" :size="18" />
      </button>

      <button
        type="button"
        class="w-8 h-8 flex items-center justify-center rounded-xs transition relative group cursor-pointer"
        :class="toolStore.viewport.combinedGizmo ? 'bg-ui-active text-ui-textAccent shadow-inner' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
        title="Combined gizmo — Voluma translate, rotate, and scale"
        @click="toggleCombinedGizmo"
      >
        <BlenderIcon name="gizmo-combined" :size="18" />
      </button>

      <!-- Subdivide (Object + Edit) -->
      <button 
        class="w-8 h-8 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition relative group cursor-pointer"
        title="Subdivide (W). Object mode splits the whole mesh."
        @click="handleSubdivide"
      >
        <BlenderIcon name="tool-subdivide" :size="18" />
      </button>

      <!-- EDIT MODE MESH MODELING TOOLS (Vertex, Edge, Face) -->
      <template v-if="toolStore.selectMode !== 'object'">
        <div class="w-6 h-px bg-ui-borderSubtle my-0.5" />

        <!-- Extrude -->
        <button 
          class="w-8 h-8 flex items-center justify-center rounded-xs transition relative group cursor-pointer"
          :class="modalClass('Extrude')"
          title="Extrude Region (E)"
          @click="handleStartModal('extrude')"
        >
          <BlenderIcon name="tool-extrude" :size="18" />
        </button>

        <!-- Inset -->
        <button 
          class="w-8 h-8 flex items-center justify-center rounded-xs transition relative group cursor-pointer"
          :class="modalClass('Inset')"
          title="Inset Faces (I)"
          @click="handleStartModal('inset')"
        >
          <BlenderIcon name="tool-inset" :size="18" />
        </button>

        <!-- Bevel -->
        <button 
          class="w-8 h-8 flex items-center justify-center rounded-xs transition relative group cursor-pointer"
          :class="modalClass('Bevel')"
          title="Bevel Edges (Ctrl+B)"
          @click="handleStartModal('bevel')"
        >
          <BlenderIcon name="tool-bevel" :size="18" />
        </button>

        <!-- Loop Cut -->
        <button 
          class="w-8 h-8 flex items-center justify-center rounded-xs transition relative group cursor-pointer"
          :class="modalClass('Loop Cut')"
          title="Loop Cut and Slide (Ctrl+R)"
          @click="handleStartModal('loop_cut')"
        >
          <BlenderIcon name="tool-loopcut" :size="18" />
        </button>

        <!-- Knife -->
        <button 
          class="w-8 h-8 flex items-center justify-center rounded-xs transition relative group cursor-pointer"
          :class="modalClass('Knife')"
          title="Knife Topology (K)"
          @click="handleStartModal('knife')"
        >
          <BlenderIcon name="tool-knife" :size="18" />
        </button>

        <button 
          class="w-8 h-8 flex items-center justify-center rounded-xs transition relative group cursor-pointer"
          :class="modalClass('Edge Slide')"
          title="Edge Slide (Shift+G)"
          @click="handleStartModal('edge_slide')"
        >
          <BlenderIcon name="edge-select" :size="18" />
        </button>

        <!-- Fill -->
        <button 
          class="w-8 h-8 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition relative group cursor-pointer"
          title="Fill Face (F)"
          @click="requestFillFace()"
        >
          <BlenderIcon name="fill-face" :size="18" />
        </button>

        <!-- Merge -->
        <button 
          class="w-8 h-8 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition relative group cursor-pointer"
          title="Merge at Center (M)"
          @click="projectStore.performMerge('center')"
        >
          <BlenderIcon name="tool-merge" :size="18" />
        </button>
      </template>
    </template>

    <!-- 2. BLOCKOUT WORKSPACE TOOLS -->
    <template v-else-if="isBlockout">
      <!-- Selection Mode Pills -->
      <div class="flex flex-col items-center gap-1 p-0.5 rounded-xs bg-ui-input border border-ui-borderSubtle shrink-0">
        <button 
          class="w-8 h-8 rounded-xs flex items-center justify-center transition cursor-pointer" 
          :class="toolStore.selectMode === 'object' ? 'bg-ui-active text-ui-textAccent shadow-xs font-bold' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Object Select (Tab / 4)"
          @click="setSelectMode('object')"
        >
          <BlenderIcon name="object-mode" :size="18" />
        </button>
        <button 
          class="w-8 h-8 rounded-xs flex items-center justify-center transition cursor-pointer" 
          :class="toolStore.selectMode === 'vertex' ? 'bg-ui-active text-ui-textAccent shadow-xs font-bold' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Vertex Select (1)"
          @click="setSelectMode('vertex')"
        >
          <BlenderIcon name="vertex-select" :size="20" />
        </button>
        <button 
          class="w-8 h-8 rounded-xs flex items-center justify-center transition cursor-pointer" 
          :class="toolStore.selectMode === 'edge' ? 'bg-ui-active text-ui-textAccent shadow-xs font-bold' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Edge Select (2)"
          @click="setSelectMode('edge')"
        >
          <BlenderIcon name="edge-select" :size="20" />
        </button>
        <button 
          class="w-8 h-8 rounded-xs flex items-center justify-center transition cursor-pointer" 
          :class="toolStore.selectMode === 'face' ? 'bg-ui-active text-ui-textAccent shadow-xs font-bold' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Face Select (3)"
          @click="setSelectMode('face')"
        >
          <BlenderIcon name="face-select" :size="20" />
        </button>
      </div>

      <button
        type="button"
        class="w-8 h-8 flex items-center justify-center rounded-xs transition relative group cursor-pointer"
        :class="layoutStore.showPrimitivePanel
          ? 'bg-ui-active text-amber-300 shadow-inner'
          : 'text-amber-400 hover:text-amber-300 hover:bg-ui-hover'"
        title="Add Primitive (Shift+A) — panel stays open until you close it"
        @click="handleOpenPrimitiveMenu"
      >
        <BlenderIcon name="mesh-cube" :size="18" />
      </button>

      <div class="w-6 h-px bg-ui-borderSubtle my-0.5 shrink-0" />

      <!-- Select Box -->
      <button 
        class="w-8 h-8 flex items-center justify-center rounded-xs transition relative group cursor-pointer"
        :class="toolStore.isBoxSelectActive ? 'bg-ui-active text-ui-textAccent shadow-inner' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
        :aria-pressed="toolStore.isBoxSelectActive"
        title="Select Box (B)"
        @click="handleBoxSelect"
      >
        <BlenderIcon name="select-box" :size="18" />
      </button>

      <!-- Move -->
      <button 
        class="w-8 h-8 flex items-center justify-center rounded-xs transition relative group cursor-pointer"
        :class="toolStore.modelTool === 'move' ? 'bg-ui-active text-ui-textAccent shadow-inner' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
        title="Move gizmo — G starts grab"
        @click="handleSetTool('move')"
      >
        <BlenderIcon name="tool-move" :size="18" />
      </button>

      <!-- Rotate -->
      <button 
        class="w-8 h-8 flex items-center justify-center rounded-xs transition relative group cursor-pointer"
        :class="toolStore.modelTool === 'rotate' ? 'bg-ui-active text-ui-textAccent shadow-inner' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
        title="Rotate gizmo — R starts rotate"
        @click="handleSetTool('rotate')"
      >
        <BlenderIcon name="tool-rotate" :size="18" />
      </button>

      <!-- Scale -->
      <button 
        class="w-8 h-8 flex items-center justify-center rounded-xs transition relative group cursor-pointer"
        :class="toolStore.modelTool === 'scale' ? 'bg-ui-active text-ui-textAccent shadow-inner' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
        title="Scale gizmo — S starts scale"
        @click="handleSetTool('scale')"
      >
        <BlenderIcon name="tool-scale" :size="18" />
      </button>

      <button
        type="button"
        class="w-8 h-8 flex items-center justify-center rounded-xs transition relative group cursor-pointer"
        :class="toolStore.viewport.combinedGizmo ? 'bg-ui-active text-ui-textAccent shadow-inner' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
        title="Combined gizmo — Voluma translate, rotate, and scale"
        @click="toggleCombinedGizmo"
      >
        <BlenderIcon name="gizmo-combined" :size="18" />
      </button>

      <button 
        class="w-8 h-8 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition relative group cursor-pointer"
        title="Subdivide (W). Object mode splits the whole mesh."
        @click="handleSubdivide"
      >
        <BlenderIcon name="tool-subdivide" :size="18" />
      </button>

      <div class="w-6 h-px bg-ui-borderSubtle my-0.5" />

      <!-- Poly Draw (Primary Blockout Tool) -->
      <button
        class="w-8 h-8 flex items-center justify-center rounded-xs transition cursor-pointer"
        :class="modalClass('Shape Draw', 'text-emerald-300 hover:bg-ui-hover')"
        title="Shape Draw: draw any outline, shape its volume, and keep editing"
        aria-label="Shape Draw"
        :aria-pressed="isModal('Shape Draw')"
        @click="handleStartModal('shapedraw')"
      >
        <BlenderIcon name="tool-shape-draw" :size="20" />
      </button>
      <button 
        class="w-8 h-8 flex items-center justify-center rounded-xs transition relative group cursor-pointer"
        :class="modalClass('Poly Draw')"
        title="Poly Draw: trace a silhouette, close, then pull thickness (F)"
        :aria-pressed="isModal('Poly Draw')"
        @click="handleStartModal('polydraw')"
      >
        <BlenderIcon name="tool-poly-draw" :size="20" />
      </button>

      <!-- Poly Build -->
      <button 
        class="w-8 h-8 flex items-center justify-center rounded-xs transition relative group cursor-pointer"
        :class="modalClass('Poly Build')"
        title="Poly Build: click verts into faces, Tab walks the other way (V)"
        :aria-pressed="isModal('Poly Build')"
        @click="handleStartModal('polybuild')"
      >
        <BlenderIcon name="tool-poly-build" :size="20" />
      </button>

      <!-- Extrude -->
      <button 
        class="w-8 h-8 flex items-center justify-center rounded-xs transition relative group cursor-pointer"
        :class="modalClass('Extrude')"
        title="Extrude Region (E)"
        @click="handleStartModal('extrude')"
      >
        <BlenderIcon name="tool-extrude" :size="18" />
      </button>

      <!-- Loop Cut -->
      <button 
        class="w-8 h-8 flex items-center justify-center rounded-xs transition relative group cursor-pointer"
        :class="modalClass('Loop Cut')"
        title="Loop Cut (Ctrl+R)"
        @click="handleStartModal('loop_cut')"
      >
        <BlenderIcon name="tool-loopcut" :size="18" />
      </button>

      <!-- Knife -->
      <button 
        class="w-8 h-8 flex items-center justify-center rounded-xs transition relative group cursor-pointer"
        :class="modalClass('Knife')"
        title="Knife Topology (K)"
        @click="handleStartModal('knife')"
      >
        <BlenderIcon name="tool-knife" :size="18" />
      </button>

      <!-- Fill (Model F; in Blockout F is Poly Draw) -->
      <button
        class="w-8 h-8 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition relative group cursor-pointer"
        title="Fill a boundary (Mesh menu). F in Blockout is Poly Draw."
        @click="requestFillFace()"
      >
        <BlenderIcon name="fill-face" :size="18" />
      </button>
    </template>

    <!-- 3. UV / PAINT TOOLS -->
    <template v-else-if="isUVEditing">
      <div class="flex flex-col items-center gap-1 p-0.5 rounded-xs bg-ui-input border border-ui-borderSubtle shrink-0">
        <button class="w-8 h-8 rounded-xs flex items-center justify-center transition cursor-pointer" :class="toolStore.selectMode === 'object' ? 'bg-ui-active text-ui-textAccent' : 'text-ui-textSecondary hover:bg-ui-hover'" title="Island Select (4)" @click="setSelectMode('object')">
          <BlenderIcon name="uv" :size="18" />
        </button>
        <button class="w-8 h-8 rounded-xs flex items-center justify-center transition cursor-pointer" :class="toolStore.selectMode === 'vertex' ? 'bg-ui-active text-ui-textAccent' : 'text-ui-textSecondary hover:bg-ui-hover'" title="UV Vertex Select (1)" @click="setSelectMode('vertex')">
          <BlenderIcon name="vertex-select" :size="18" />
        </button>
        <button class="w-8 h-8 rounded-xs flex items-center justify-center transition cursor-pointer" :class="toolStore.selectMode === 'edge' ? 'bg-ui-active text-ui-textAccent' : 'text-ui-textSecondary hover:bg-ui-hover'" title="UV Edge Select (2)" @click="setSelectMode('edge')">
          <BlenderIcon name="edge-select" :size="18" />
        </button>
        <button class="w-8 h-8 rounded-xs flex items-center justify-center transition cursor-pointer" :class="toolStore.selectMode === 'face' ? 'bg-ui-active text-ui-textAccent' : 'text-ui-textSecondary hover:bg-ui-hover'" title="UV Face Select (3)" @click="setSelectMode('face')">
          <BlenderIcon name="face-select" :size="18" />
        </button>
      </div>
      <div class="w-6 h-px bg-ui-borderSubtle my-0.5 shrink-0" />
      <button
        class="w-8 h-8 flex items-center justify-center rounded-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 transition cursor-pointer"
        title="Smart UV Project (U): automatically cut, project, and pack"
        @click="requestSmartUvProject"
      >
        <BlenderIcon name="uv-smart" :size="18" />
      </button>
    </template>

    <template v-else-if="isUVPaint">
      <button 
        class="w-8 h-8 flex items-center justify-center rounded-xs transition cursor-pointer"
        :class="toolStore.paintTool === 'select' ? 'bg-ui-active text-ui-textAccent' : 'text-ui-textSecondary hover:bg-ui-hover'"
        title="Marquee Selection (M)"
        @click="toolStore.setPaintTool('select')"
      >
        <BlenderIcon name="select-box" :size="18" />
      </button>
      <button 
        class="w-8 h-8 flex items-center justify-center rounded-xs transition cursor-pointer"
        :class="toolStore.paintTool === 'brush' ? 'bg-ui-active text-ui-textAccent' : 'text-ui-textSecondary hover:bg-ui-hover'"
        title="Brush (B)"
        @click="toolStore.setPaintTool('brush')"
      >
        <BlenderIcon name="brush" :size="18" />
      </button>
      <button 
        class="w-8 h-8 flex items-center justify-center rounded-xs transition cursor-pointer"
        :class="toolStore.paintTool === 'eraser' ? 'bg-ui-active text-ui-textAccent' : 'text-ui-textSecondary hover:bg-ui-hover'"
        title="Eraser (E)"
        @click="toolStore.setPaintTool('eraser')"
      >
        <BlenderIcon name="eraser" :size="18" />
      </button>
      <button 
        class="w-8 h-8 flex items-center justify-center rounded-xs transition cursor-pointer"
        :class="toolStore.paintTool === 'bucket' ? 'bg-ui-active text-ui-textAccent' : 'text-ui-textSecondary hover:bg-ui-hover'"
        title="Bucket Fill (G)"
        @click="toolStore.setPaintTool('bucket')"
      >
        <BlenderIcon name="fill" :size="18" />
      </button>
      <button 
        class="w-8 h-8 flex items-center justify-center rounded-xs transition cursor-pointer"
        :class="toolStore.paintTool === 'picker' ? 'bg-ui-active text-ui-textAccent' : 'text-ui-textSecondary hover:bg-ui-hover'"
        title="Color Picker (I)"
        @click="toolStore.setPaintTool('picker')"
      >
        <BlenderIcon name="picker" :size="18" />
      </button>
      <button 
        class="w-8 h-8 flex items-center justify-center rounded-xs transition cursor-pointer"
        :class="toolStore.paintTool === 'line' ? 'bg-ui-active text-ui-textAccent' : 'text-ui-textSecondary hover:bg-ui-hover'"
        title="Line (L)"
        @click="toolStore.setPaintTool('line')"
      >
        <BlenderIcon name="line" :size="18" />
      </button>
      <button 
        class="w-8 h-8 flex items-center justify-center rounded-xs transition cursor-pointer"
        :class="toolStore.paintTool === 'rect' ? 'bg-ui-active text-ui-textAccent' : 'text-ui-textSecondary hover:bg-ui-hover'"
        title="Rectangle (U)"
        @click="toolStore.setPaintTool('rect')"
      >
        <BlenderIcon name="rect" :size="18" />
      </button>
      <button 
        class="w-8 h-8 flex items-center justify-center rounded-xs transition cursor-pointer"
        :class="toolStore.paintTool === 'circle' ? 'bg-ui-active text-ui-textAccent' : 'text-ui-textSecondary hover:bg-ui-hover'"
        title="Circle (C)"
        @click="toolStore.setPaintTool('circle')"
      >
        <BlenderIcon name="circle" :size="18" />
      </button>
      <button 
        class="w-8 h-8 flex items-center justify-center rounded-xs transition cursor-pointer"
        :class="toolStore.paintTool === 'dither' ? 'bg-ui-active text-ui-textAccent' : 'text-ui-textSecondary hover:bg-ui-hover'"
        title="Retro Dither Brush"
        @click="toolStore.setPaintTool('dither')"
      >
        <BlenderIcon name="dither" :size="18" />
      </button>
      <button 
        class="w-8 h-8 flex items-center justify-center rounded-xs transition cursor-pointer"
        :class="toolStore.paintTool === 'shade' ? 'bg-ui-active text-ui-textAccent' : 'text-ui-textSecondary hover:bg-ui-hover'"
        title="Shade Lighten / Darken (H)"
        @click="toolStore.setPaintTool('shade')"
      >
        <BlenderIcon name="shade" :size="18" />
      </button>
    </template>

    <!-- 4. RIGGING TOOLS -->
    <template v-else-if="isRigging">
      <button 
        class="w-8 h-8 flex items-center justify-center rounded-xs transition cursor-pointer"
        :class="toolStore.rigTool === 'select_bone' ? 'bg-ui-active text-ui-textAccent' : 'text-ui-textSecondary hover:bg-ui-hover'"
        title="Select Joint (W)"
        @click="toolStore.setRigTool('select_bone')"
      >
        <BlenderIcon name="cursor-select" :size="18" />
      </button>
      <button 
        class="w-8 h-8 flex items-center justify-center rounded-xs transition cursor-pointer"
        :class="toolStore.rigTool === 'add_bone' ? 'bg-ui-active text-ui-textAccent' : 'text-ui-textSecondary hover:bg-ui-hover'"
        title="Extrude Bone Joint (E)"
        @click="toolStore.setRigTool('add_bone')"
      >
        <BlenderIcon name="tool-extrude" :size="18" />
      </button>
      <button 
        class="w-8 h-8 flex items-center justify-center rounded-xs transition cursor-pointer"
        :class="toolStore.modelTool === 'move' ? 'bg-ui-active text-ui-textAccent' : 'text-ui-textSecondary hover:bg-ui-hover'"
        title="Move / Translate (G)"
        @click="toolStore.setModelTool('move')"
      >
        <BlenderIcon name="tool-move" :size="18" />
      </button>
      <button 
        class="w-8 h-8 flex items-center justify-center rounded-xs transition cursor-pointer"
        :class="toolStore.modelTool === 'rotate' ? 'bg-ui-active text-ui-textAccent' : 'text-ui-textSecondary hover:bg-ui-hover'"
        title="Rotate Bone (R)"
        @click="toolStore.setModelTool('rotate')"
      >
        <BlenderIcon name="tool-rotate" :size="18" />
      </button>
      <button 
        class="w-8 h-8 flex items-center justify-center rounded-xs transition cursor-pointer"
        :class="toolStore.modelTool === 'scale' ? 'bg-ui-active text-ui-textAccent' : 'text-ui-textSecondary hover:bg-ui-hover'"
        title="Scale Bone (S)"
        @click="toolStore.setModelTool('scale')"
      >
        <BlenderIcon name="tool-scale" :size="18" />
      </button>

      <div class="w-6 h-px bg-ui-borderSubtle my-0.5" />

      <button 
        class="w-8 h-8 flex items-center justify-center rounded-xs transition cursor-pointer"
        :class="animationStore.isWeightPaintActive ? 'bg-amber-500/20 text-amber-400 font-bold border border-amber-500/50' : 'text-ui-textSecondary hover:bg-ui-hover'"
        title="Weight Paint Mode (Ctrl+Tab)"
        @click="animationStore.toggleWeightPaint()"
      >
        <BlenderIcon name="vertex-group" :size="18" />
      </button>
    </template>

    <!-- 5. ANIMATION TOOLS -->
    <template v-else-if="isAnimating">
      <button 
        class="w-8 h-8 flex items-center justify-center rounded-xs transition cursor-pointer"
        :class="toolStore.modelTool === 'select' ? 'bg-ui-active text-ui-textAccent' : 'text-ui-textSecondary hover:bg-ui-hover'"
        title="Select Bone (W)"
        @click="toolStore.setModelTool('select')"
      >
        <BlenderIcon name="cursor-select" :size="18" />
      </button>
      <button 
        class="w-8 h-8 flex items-center justify-center rounded-xs transition cursor-pointer"
        :class="toolStore.modelTool === 'rotate' ? 'bg-ui-active text-ui-textAccent' : 'text-ui-textSecondary hover:bg-ui-hover'"
        title="Rotate Pose (R)"
        @click="toolStore.setModelTool('rotate')"
      >
        <BlenderIcon name="tool-rotate" :size="18" />
      </button>
      <button 
        class="w-8 h-8 flex items-center justify-center rounded-xs transition cursor-pointer"
        :class="toolStore.modelTool === 'move' ? 'bg-ui-active text-ui-textAccent' : 'text-ui-textSecondary hover:bg-ui-hover'"
        title="Translate Root / IK (G)"
        @click="toolStore.setModelTool('move')"
      >
        <BlenderIcon name="tool-move" :size="18" />
      </button>
      <button 
        class="w-8 h-8 flex items-center justify-center rounded-xs transition cursor-pointer"
        :class="toolStore.modelTool === 'scale' ? 'bg-ui-active text-ui-textAccent' : 'text-ui-textSecondary hover:bg-ui-hover'"
        title="Scale Pose (S)"
        @click="toolStore.setModelTool('scale')"
      >
        <BlenderIcon name="tool-scale" :size="18" />
      </button>
      <div class="w-6 h-px bg-ui-borderSubtle my-0.5" />
      <button
        class="w-8 h-8 flex items-center justify-center rounded-xs text-amber-400 hover:text-amber-300 hover:bg-ui-hover transition cursor-pointer"
        title="Insert key on selected bone or object (I / K)"
        @click="animationStore.recordCurrentKeyframe()"
      >
        <BlenderIcon name="keyframe" :size="18" />
      </button>
    </template>
  </aside>
</template>
