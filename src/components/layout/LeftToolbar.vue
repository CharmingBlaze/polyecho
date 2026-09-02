<script setup lang="ts">
import { computed } from 'vue'
import { useToolStore } from '../../stores/toolStore'
import { useProjectStore } from '../../stores/projectStore'
import { useAnimationStore } from '../../stores/animationStore'
import BlenderIcon from '../icons/BlenderIcon.vue'
import { requestModalTool, requestPrimitiveMenu } from '../../core/commands/editorCommands'
import { 
  MousePointer, 
  Move, 
  RotateCw, 
  PlusCircle
} from 'lucide-vue-next'

const toolStore = useToolStore()
const projectStore = useProjectStore()
const animationStore = useAnimationStore()

const isModeling = computed(() => toolStore.appMode === 'model')
const isBlockout = computed(() => toolStore.appMode === 'blockout')
const isRigging = computed(() => toolStore.appMode === 'rig')
const isAnimating = computed(() => toolStore.appMode === 'animate')
const isUVPaint = computed(() => toolStore.appMode === 'uvpaint')

function setSelectMode(mode: 'object' | 'vertex' | 'edge' | 'face') {
  toolStore.selectMode = mode
  projectStore.clearSubSelections()
}

function handleSetTool(tool: any) {
  toolStore.setModelTool(tool)
}

function handleStartModal(toolName: string) {
  requestModalTool(toolName as any)
}

function handleOpenPrimitiveMenu() {
  requestPrimitiveMenu()
}
</script>

<template>
  <aside 
    class="w-10 bg-ui-panel border-r border-ui-borderSubtle flex flex-col items-center py-2.5 gap-1.5 select-none z-20 shrink-0 font-sans shadow-sm"
  >
    <!-- 1. MODELING WORKSPACE TOOLS -->
    <template v-if="isModeling">
      <!-- Object / Vertex / Edge / Face Selection Mode Pill Group -->
      <div class="flex flex-col items-center gap-1 p-0.5 rounded-xs bg-ui-input border border-ui-borderSubtle shrink-0">
        <button 
          @click="setSelectMode('object')" 
          class="w-8 h-8 rounded-xs flex items-center justify-center transition cursor-pointer"
          :class="toolStore.selectMode === 'object' ? 'bg-ui-active text-ui-textAccent shadow-xs font-bold' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Object Select (Tab / 4)"
        >
          <BlenderIcon name="object-mode" :size="18" />
        </button>
        <button 
          @click="setSelectMode('vertex')" 
          class="w-8 h-8 rounded-xs flex items-center justify-center transition cursor-pointer"
          :class="toolStore.selectMode === 'vertex' ? 'bg-ui-active text-ui-textAccent shadow-xs font-bold' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Vertex Select (1)"
        >
          <BlenderIcon name="vertex-select" :size="20" />
        </button>
        <button 
          @click="setSelectMode('edge')" 
          class="w-8 h-8 rounded-xs flex items-center justify-center transition cursor-pointer"
          :class="toolStore.selectMode === 'edge' ? 'bg-ui-active text-ui-textAccent shadow-xs font-bold' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Edge Select (2)"
        >
          <BlenderIcon name="edge-select" :size="20" />
        </button>
        <button 
          @click="setSelectMode('face')" 
          class="w-8 h-8 rounded-xs flex items-center justify-center transition cursor-pointer"
          :class="toolStore.selectMode === 'face' ? 'bg-ui-active text-ui-textAccent shadow-xs font-bold' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Face Select (3)"
        >
          <BlenderIcon name="face-select" :size="20" />
        </button>
      </div>

      <div class="w-6 h-px bg-ui-borderSubtle my-0.5 shrink-0"></div>

      <!-- Select Box -->
      <button 
        @click="handleSetTool('select')"
        class="w-8 h-8 flex items-center justify-center rounded-xs transition relative group cursor-pointer"
        :class="toolStore.modelTool === 'select' ? 'bg-ui-active text-ui-textAccent shadow-inner' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
        title="Select Box (W)"
      >
        <BlenderIcon name="select-box" :size="18" />
      </button>

      <!-- Move -->
      <button 
        @click="handleSetTool('move')"
        class="w-8 h-8 flex items-center justify-center rounded-xs transition relative group cursor-pointer"
        :class="toolStore.modelTool === 'move' ? 'bg-ui-active text-ui-textAccent shadow-inner' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
        title="Move / Translate (G)"
      >
        <BlenderIcon name="tool-move" :size="18" />
      </button>

      <!-- Rotate -->
      <button 
        @click="handleSetTool('rotate')"
        class="w-8 h-8 flex items-center justify-center rounded-xs transition relative group cursor-pointer"
        :class="toolStore.modelTool === 'rotate' ? 'bg-ui-active text-ui-textAccent shadow-inner' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
        title="Rotate (R)"
      >
        <BlenderIcon name="tool-rotate" :size="18" />
      </button>

      <!-- Scale -->
      <button 
        @click="handleSetTool('scale')"
        class="w-8 h-8 flex items-center justify-center rounded-xs transition relative group cursor-pointer"
        :class="toolStore.modelTool === 'scale' ? 'bg-ui-active text-ui-textAccent shadow-inner' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
        title="Scale (S)"
      >
        <BlenderIcon name="tool-scale" :size="18" />
      </button>

      <!-- EDIT MODE MESH MODELING TOOLS (Vertex, Edge, Face) -->
      <template v-if="toolStore.selectMode !== 'object'">
        <div class="w-6 h-px bg-ui-borderSubtle my-0.5"></div>

        <!-- Extrude -->
        <button 
          @click="handleStartModal('extrude')"
          class="w-8 h-8 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition relative group cursor-pointer"
          title="Extrude Region (E)"
        >
          <BlenderIcon name="tool-extrude" :size="18" />
        </button>

        <!-- Inset -->
        <button 
          @click="handleStartModal('inset')"
          class="w-8 h-8 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition relative group cursor-pointer"
          title="Inset Faces (I)"
        >
          <BlenderIcon name="tool-inset" :size="18" />
        </button>

        <!-- Bevel -->
        <button 
          @click="handleStartModal('bevel')"
          class="w-8 h-8 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition relative group cursor-pointer"
          title="Bevel Edges / Vertices (Ctrl+B)"
        >
          <BlenderIcon name="tool-bevel" :size="18" />
        </button>

        <!-- Loop Cut -->
        <button 
          @click="handleStartModal('loopcut')"
          class="w-8 h-8 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition relative group cursor-pointer"
          title="Loop Cut and Slide (Ctrl+R)"
        >
          <BlenderIcon name="tool-loopcut" :size="18" />
        </button>

        <!-- Knife -->
        <button 
          @click="handleStartModal('knife')"
          class="w-8 h-8 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition relative group cursor-pointer"
          title="Knife Topology (K)"
        >
          <BlenderIcon name="tool-knife" :size="18" />
        </button>

        <!-- Poly Draw -->
        <button 
          @click="handleStartModal('polydraw')"
          class="w-8 h-8 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition relative group cursor-pointer"
        title="Poly Draw: trace a silhouette, close, then pull thickness (F)"
        >
          <BlenderIcon name="tool-draw" :size="18" />
        </button>

        <!-- Poly Build -->
        <button 
          @click="handleStartModal('polybuild')"
          class="w-8 h-8 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition relative group cursor-pointer"
          title="Poly Build: click verts into faces, Tab walks the other way (V)"
        >
          <BlenderIcon name="connect-verts" :size="18" />
        </button>
      </template>

      <!-- Add Primitive Placement -->
      <button 
        @click="handleOpenPrimitiveMenu"
        class="w-8 h-8 flex items-center justify-center rounded-xs text-amber-400 hover:text-amber-300 hover:bg-ui-hover transition relative group cursor-pointer mt-auto"
        title="Add 3D Primitive (Shift+A)"
      >
        <PlusCircle class="w-5 h-5" />
      </button>
    </template>

    <!-- 2. BLOCKOUT WORKSPACE TOOLS -->
    <template v-else-if="isBlockout">
      <!-- Selection Mode Pills -->
      <div class="flex flex-col items-center gap-1 p-0.5 rounded-xs bg-ui-input border border-ui-borderSubtle shrink-0">
        <button 
          @click="setSelectMode('object')" 
          class="w-8 h-8 rounded-xs flex items-center justify-center transition cursor-pointer"
          :class="toolStore.selectMode === 'object' ? 'bg-ui-active text-ui-textAccent shadow-xs font-bold' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Object Select (Tab / 4)"
        >
          <BlenderIcon name="object-mode" :size="18" />
        </button>
        <button 
          @click="setSelectMode('vertex')" 
          class="w-8 h-8 rounded-xs flex items-center justify-center transition cursor-pointer"
          :class="toolStore.selectMode === 'vertex' ? 'bg-ui-active text-ui-textAccent shadow-xs font-bold' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Vertex Select (1)"
        >
          <BlenderIcon name="vertex-select" :size="20" />
        </button>
        <button 
          @click="setSelectMode('edge')" 
          class="w-8 h-8 rounded-xs flex items-center justify-center transition cursor-pointer"
          :class="toolStore.selectMode === 'edge' ? 'bg-ui-active text-ui-textAccent shadow-xs font-bold' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Edge Select (2)"
        >
          <BlenderIcon name="edge-select" :size="20" />
        </button>
        <button 
          @click="setSelectMode('face')" 
          class="w-8 h-8 rounded-xs flex items-center justify-center transition cursor-pointer"
          :class="toolStore.selectMode === 'face' ? 'bg-ui-active text-ui-textAccent shadow-xs font-bold' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Face Select (3)"
        >
          <BlenderIcon name="face-select" :size="20" />
        </button>
      </div>

      <div class="w-6 h-px bg-ui-borderSubtle my-0.5 shrink-0"></div>

      <!-- Select Box -->
      <button 
        @click="handleSetTool('select')"
        class="w-8 h-8 flex items-center justify-center rounded-xs transition relative group cursor-pointer"
        :class="toolStore.modelTool === 'select' ? 'bg-ui-active text-ui-textAccent shadow-inner' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
        title="Select Box (W)"
      >
        <BlenderIcon name="select-box" :size="18" />
      </button>

      <!-- Move -->
      <button 
        @click="handleSetTool('move')"
        class="w-8 h-8 flex items-center justify-center rounded-xs transition relative group cursor-pointer"
        :class="toolStore.modelTool === 'move' ? 'bg-ui-active text-ui-textAccent shadow-inner' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
        title="Move / Translate (G)"
      >
        <BlenderIcon name="tool-move" :size="18" />
      </button>

      <!-- Rotate -->
      <button 
        @click="handleSetTool('rotate')"
        class="w-8 h-8 flex items-center justify-center rounded-xs transition relative group cursor-pointer"
        :class="toolStore.modelTool === 'rotate' ? 'bg-ui-active text-ui-textAccent shadow-inner' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
        title="Rotate (R)"
      >
        <BlenderIcon name="tool-rotate" :size="18" />
      </button>

      <!-- Scale -->
      <button 
        @click="handleSetTool('scale')"
        class="w-8 h-8 flex items-center justify-center rounded-xs transition relative group cursor-pointer"
        :class="toolStore.modelTool === 'scale' ? 'bg-ui-active text-ui-textAccent shadow-inner' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
        title="Scale (S)"
      >
        <BlenderIcon name="tool-scale" :size="18" />
      </button>

      <div class="w-6 h-px bg-ui-borderSubtle my-0.5"></div>

      <!-- Poly Draw (Primary Blockout Tool) -->
      <button 
        @click="handleStartModal('polydraw')"
        class="w-8 h-8 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition relative group cursor-pointer"
        title="Poly Draw: trace a silhouette, close, then pull thickness (F)"
      >
        <BlenderIcon name="tool-draw" :size="18" />
      </button>

      <!-- Poly Build -->
      <button 
        @click="handleStartModal('polybuild')"
        class="w-8 h-8 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition relative group cursor-pointer"
        title="Poly Build: click verts into faces, Tab walks the other way (V)"
      >
        <BlenderIcon name="connect-verts" :size="18" />
      </button>

      <!-- Extrude -->
      <button 
        @click="handleStartModal('extrude')"
        class="w-8 h-8 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition relative group cursor-pointer"
        title="Extrude Region (E)"
      >
        <BlenderIcon name="tool-extrude" :size="18" />
      </button>

      <!-- Loop Cut -->
      <button 
        @click="handleStartModal('loopcut')"
        class="w-8 h-8 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition relative group cursor-pointer"
        title="Loop Cut (Ctrl+R)"
      >
        <BlenderIcon name="tool-loopcut" :size="18" />
      </button>

      <!-- Knife -->
      <button 
        @click="handleStartModal('knife')"
        class="w-8 h-8 flex items-center justify-center rounded-xs text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover transition relative group cursor-pointer"
        title="Knife Topology (K)"
      >
        <BlenderIcon name="tool-knife" :size="18" />
      </button>

      <!-- Add Primitive -->
      <button 
        @click="handleOpenPrimitiveMenu"
        class="w-8 h-8 flex items-center justify-center rounded-xs text-amber-400 hover:text-amber-300 hover:bg-ui-hover transition relative group cursor-pointer mt-auto"
        title="Add 3D Primitive (Shift+A)"
      >
        <PlusCircle class="w-5 h-5" />
      </button>
    </template>

    <!-- 3. UV / PAINT TOOLS -->
    <template v-else-if="isUVPaint">
      <button 
        @click="toolStore.setPaintTool('brush')"
        class="w-8 h-8 flex items-center justify-center rounded-xs transition cursor-pointer"
        :class="toolStore.paintTool === 'brush' ? 'bg-ui-active text-ui-textAccent' : 'text-ui-textSecondary hover:bg-ui-hover'"
        title="Brush (B)"
      >
        <BlenderIcon name="brush" :size="18" />
      </button>
      <button 
        @click="toolStore.setPaintTool('eraser')"
        class="w-8 h-8 flex items-center justify-center rounded-xs transition cursor-pointer"
        :class="toolStore.paintTool === 'eraser' ? 'bg-ui-active text-ui-textAccent' : 'text-ui-textSecondary hover:bg-ui-hover'"
        title="Eraser (E)"
      >
        <BlenderIcon name="eraser" :size="18" />
      </button>
      <button 
        @click="toolStore.setPaintTool('bucket')"
        class="w-8 h-8 flex items-center justify-center rounded-xs transition cursor-pointer"
        :class="toolStore.paintTool === 'bucket' ? 'bg-ui-active text-ui-textAccent' : 'text-ui-textSecondary hover:bg-ui-hover'"
        title="Bucket Fill (G)"
      >
        <BlenderIcon name="fill" :size="18" />
      </button>
      <button 
        @click="toolStore.setPaintTool('picker')"
        class="w-8 h-8 flex items-center justify-center rounded-xs transition cursor-pointer"
        :class="toolStore.paintTool === 'picker' ? 'bg-ui-active text-ui-textAccent' : 'text-ui-textSecondary hover:bg-ui-hover'"
        title="Color Picker (I)"
      >
        <BlenderIcon name="picker" :size="18" />
      </button>
      <button 
        @click="toolStore.setPaintTool('dither')"
        class="w-8 h-8 flex items-center justify-center rounded-xs transition cursor-pointer"
        :class="toolStore.paintTool === 'dither' ? 'bg-ui-active text-ui-textAccent' : 'text-ui-textSecondary hover:bg-ui-hover'"
        title="Retro Dither Brush"
      >
        <BlenderIcon name="dither" :size="18" />
      </button>
      <button 
        @click="toolStore.setPaintTool('shade')"
        class="w-8 h-8 flex items-center justify-center rounded-xs transition cursor-pointer"
        :class="toolStore.paintTool === 'shade' ? 'bg-ui-active text-ui-textAccent' : 'text-ui-textSecondary hover:bg-ui-hover'"
        title="Shade Lighten / Darken (H)"
      >
        <BlenderIcon name="shade" :size="18" />
      </button>
    </template>

    <!-- 4. RIGGING TOOLS -->
    <template v-else-if="isRigging">
      <button 
        @click="toolStore.setRigTool('select_bone')"
        class="w-8 h-8 flex items-center justify-center rounded-xs transition cursor-pointer"
        :class="toolStore.rigTool === 'select_bone' ? 'bg-ui-active text-ui-textAccent' : 'text-ui-textSecondary hover:bg-ui-hover'"
        title="Select Joint (W)"
      >
        <MousePointer class="w-4.5 h-4.5" />
      </button>
      <button 
        @click="toolStore.setRigTool('add_bone')"
        class="w-8 h-8 flex items-center justify-center rounded-xs transition cursor-pointer"
        :class="toolStore.rigTool === 'add_bone' ? 'bg-ui-active text-ui-textAccent' : 'text-ui-textSecondary hover:bg-ui-hover'"
        title="Extrude Bone Joint (E)"
      >
        <BlenderIcon name="tool-extrude" :size="18" />
      </button>
      <button 
        @click="toolStore.setModelTool('move')"
        class="w-8 h-8 flex items-center justify-center rounded-xs transition cursor-pointer"
        :class="toolStore.modelTool === 'move' ? 'bg-ui-active text-ui-textAccent' : 'text-ui-textSecondary hover:bg-ui-hover'"
        title="Translate Bone (G)"
      >
        <Move class="w-4.5 h-4.5" />
      </button>
      <button 
        @click="toolStore.setModelTool('rotate')"
        class="w-8 h-8 flex items-center justify-center rounded-xs transition cursor-pointer"
        :class="toolStore.modelTool === 'rotate' ? 'bg-ui-active text-ui-textAccent' : 'text-ui-textSecondary hover:bg-ui-hover'"
        title="Rotate Bone (R)"
      >
        <RotateCw class="w-4.5 h-4.5" />
      </button>
      <button 
        @click="toolStore.setModelTool('scale')"
        class="w-8 h-8 flex items-center justify-center rounded-xs transition cursor-pointer"
        :class="toolStore.modelTool === 'scale' ? 'bg-ui-active text-ui-textAccent' : 'text-ui-textSecondary hover:bg-ui-hover'"
        title="Scale Bone (S)"
      >
        <BlenderIcon name="tool-scale" :size="18" />
      </button>

      <div class="w-6 h-px bg-ui-borderSubtle my-0.5"></div>

      <button 
        @click="animationStore.isWeightPaintActive = !animationStore.isWeightPaintActive"
        class="w-8 h-8 flex items-center justify-center rounded-xs transition cursor-pointer"
        :class="animationStore.isWeightPaintActive ? 'bg-amber-500/20 text-amber-400 font-bold border border-amber-500/50' : 'text-ui-textSecondary hover:bg-ui-hover'"
        title="Weight Paint Mode (Ctrl+Tab)"
      >
        <BlenderIcon name="vertex-group" :size="18" />
      </button>
    </template>

    <!-- 5. ANIMATION TOOLS -->
    <template v-else-if="isAnimating">
      <button 
        @click="toolStore.setModelTool('select')"
        class="w-8 h-8 flex items-center justify-center rounded-xs transition cursor-pointer"
        :class="toolStore.modelTool === 'select' ? 'bg-ui-active text-ui-textAccent' : 'text-ui-textSecondary hover:bg-ui-hover'"
        title="Select Bone (W)"
      >
        <MousePointer class="w-4.5 h-4.5" />
      </button>
      <button 
        @click="toolStore.setModelTool('rotate')"
        class="w-8 h-8 flex items-center justify-center rounded-xs transition cursor-pointer"
        :class="toolStore.modelTool === 'rotate' ? 'bg-ui-active text-ui-textAccent' : 'text-ui-textSecondary hover:bg-ui-hover'"
        title="Rotate Pose (R)"
      >
        <RotateCw class="w-4.5 h-4.5" />
      </button>
      <button 
        @click="toolStore.setModelTool('move')"
        class="w-8 h-8 flex items-center justify-center rounded-xs transition cursor-pointer"
        :class="toolStore.modelTool === 'move' ? 'bg-ui-active text-ui-textAccent' : 'text-ui-textSecondary hover:bg-ui-hover'"
        title="Translate Root / IK (G)"
      >
        <Move class="w-4.5 h-4.5" />
      </button>
      <button 
        @click="toolStore.setModelTool('scale')"
        class="w-8 h-8 flex items-center justify-center rounded-xs transition cursor-pointer"
        :class="toolStore.modelTool === 'scale' ? 'bg-ui-active text-ui-textAccent' : 'text-ui-textSecondary hover:bg-ui-hover'"
        title="Scale Pose (S)"
      >
        <BlenderIcon name="tool-scale" :size="18" />
      </button>
    </template>
  </aside>
</template>
