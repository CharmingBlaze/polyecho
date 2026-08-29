<script setup lang="ts">
import { useToolStore } from '../../stores/toolStore'
import { useProjectStore } from '../../stores/projectStore'
import { useAnimationStore } from '../../stores/animationStore'
import BlenderIcon from '../icons/BlenderIcon.vue'

const toolStore = useToolStore()
const projectStore = useProjectStore()
const animationStore = useAnimationStore()

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
  window.dispatchEvent(new CustomEvent('open-add-primitive-menu', { detail: { x: 80, y: 150 } }))
}

function handleStartLoopCut() {
  window.dispatchEvent(new CustomEvent('blender-modal-op', { detail: 'loopcut' }))
}

function handleStartKnife() {
  window.dispatchEvent(new CustomEvent('blender-modal-op', { detail: 'knife' }))
}
</script>

<template>
  <aside class="w-[74px] bg-ui-panel border-r border-ui-borderSubtle flex flex-col items-center py-1.5 select-none z-20 overflow-y-auto font-mono">
    <!-- 1. SELECTION MODES (2 Columns, 3 Rows = 6 Symmetrical Slots) -->
    <div class="w-full px-1 border-b border-ui-borderSubtle pb-1.5 mb-1">
      <div class="text-[9px] font-bold text-ui-textMuted uppercase tracking-wider mb-1 px-1">Select</div>
      <div class="grid grid-cols-2 gap-1 w-full">
        <!-- Object Mode (4) -->
        <button 
          @click="toolStore.selectMode = 'object'"
          class="w-full h-7 flex items-center justify-center rounded-xs transition relative"
          :class="toolStore.selectMode === 'object' ? 'bg-ui-active text-ui-textAccent border border-ui-accent/50 shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Object Mode (4 / Tab)"
        >
          <BlenderIcon name="object-mode" :size="15" />
          <span class="absolute bottom-0.5 right-0.5 text-[8px] font-mono font-bold opacity-60">4</span>
        </button>

        <!-- Origin / Pivot Mode (5) -->
        <button 
          @click="toolStore.selectMode = 'origin'"
          class="w-full h-7 flex items-center justify-center rounded-xs transition relative"
          :class="toolStore.selectMode === 'origin' ? 'bg-ui-active text-ui-textAccent border border-ui-accent/50 shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Origin / Pivot Edit (5 / P)"
        >
          <BlenderIcon name="origin" :size="15" />
          <span class="absolute bottom-0.5 right-0.5 text-[8px] font-mono font-bold opacity-60">5</span>
        </button>

        <!-- Vertex Mode (1) -->
        <button 
          @click="toolStore.selectMode = 'vertex'"
          class="w-full h-7 flex items-center justify-center rounded-xs transition relative"
          :class="toolStore.selectMode === 'vertex' ? 'bg-ui-active text-ui-textAccent border border-ui-accent/50 shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Vertex Select (1)"
        >
          <BlenderIcon name="vertex-select" :size="15" />
          <span class="absolute bottom-0.5 right-0.5 text-[8px] font-mono font-bold opacity-60">1</span>
        </button>

        <!-- Edge Mode (2) -->
        <button 
          @click="toolStore.selectMode = 'edge'"
          class="w-full h-7 flex items-center justify-center rounded-xs transition relative"
          :class="toolStore.selectMode === 'edge' ? 'bg-ui-active text-ui-textAccent border border-ui-accent/50 shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Edge Select (2)"
        >
          <BlenderIcon name="edge-select" :size="15" />
          <span class="absolute bottom-0.5 right-0.5 text-[8px] font-mono font-bold opacity-60">2</span>
        </button>

        <!-- Face Mode (3) -->
        <button 
          @click="toolStore.selectMode = 'face'"
          class="w-full h-7 flex items-center justify-center rounded-xs transition relative"
          :class="toolStore.selectMode === 'face' ? 'bg-ui-active text-ui-textAccent border border-ui-accent/50 shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Face Select (3)"
        >
          <BlenderIcon name="face-select" :size="15" />
          <span class="absolute bottom-0.5 right-0.5 text-[8px] font-mono font-bold opacity-60">3</span>
        </button>

        <!-- Snapping Quick Toggle -->
        <button 
          @click="toolStore.snapping.grid = !toolStore.snapping.grid"
          class="w-full h-7 flex items-center justify-center rounded-xs transition relative"
          :class="toolStore.snapping.grid ? 'bg-ui-accentSubtle text-ui-textAccent border border-ui-accent/40 shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Toggle Grid Snapping (Shift+Tab)"
        >
          <BlenderIcon name="snap" :size="14" />
        </button>
      </div>
    </div>

    <!-- 2. TRANSFORM TOOLS (2 Columns, 2 Rows = 4 Symmetrical Slots) -->
    <div class="w-full px-1 border-b border-ui-borderSubtle pb-1.5 mb-1">
      <div class="text-[9px] font-bold text-ui-textMuted uppercase tracking-wider mb-1 px-1">Gizmo</div>
      <div class="grid grid-cols-2 gap-1 w-full">
        <!-- Move Tool -->
        <button 
          @click="toolStore.modelTool = 'move'"
          class="w-full h-7 flex items-center justify-center rounded-xs transition"
          :class="toolStore.modelTool === 'move' ? 'bg-ui-active text-ui-textAccent border border-ui-accent/50 shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Move Tool (G / W)"
        >
          <BlenderIcon name="tool-move" :size="15" />
        </button>

        <!-- Rotate Tool -->
        <button 
          @click="toolStore.modelTool = 'rotate'"
          class="w-full h-7 flex items-center justify-center rounded-xs transition"
          :class="toolStore.modelTool === 'rotate' ? 'bg-ui-active text-ui-textAccent border border-ui-accent/50 shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Rotate Tool (R)"
        >
          <BlenderIcon name="tool-rotate" :size="15" />
        </button>

        <!-- Scale Tool -->
        <button 
          @click="toolStore.modelTool = 'scale'"
          class="w-full h-7 flex items-center justify-center rounded-xs transition"
          :class="toolStore.modelTool === 'scale' ? 'bg-ui-active text-ui-textAccent border border-ui-accent/50 shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Scale Tool (S)"
        >
          <BlenderIcon name="tool-scale" :size="15" />
        </button>

        <!-- Add Primitive Popout Button -->
        <button 
          @click="handleOpenAddPrimitive"
          class="w-full h-7 flex items-center justify-center rounded-xs text-amber-400 hover:bg-ui-hover transition border border-amber-500/30 bg-amber-500/10"
          title="Add Primitive Menu (Shift+A)"
        >
          <BlenderIcon name="mesh-cube" :size="14" color="#f59e0b" />
        </button>
      </div>
    </div>

    <!-- 3. CONTEXTUAL ESSENTIAL MODELING TOOLS -->
    
    <!-- (A) OBJECT / ORIGIN MODE TOOLS (6 items = 3x2) -->
    <div v-if="toolStore.appMode === 'model' && (toolStore.selectMode === 'object' || toolStore.selectMode === 'origin')" class="w-full px-1.5 flex-1">
      <div class="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-wider mb-1 px-1">Object</div>
      <div class="grid grid-cols-2 gap-1 w-full">
        <!-- Duplicate Object -->
        <button 
          @click="projectStore.duplicateSelection('object')"
          class="w-full h-8 flex items-center justify-center rounded text-amber-400 hover:bg-dcc-750 transition"
          title="Duplicate Object (Shift+D)"
        >
          <BlenderIcon name="duplicate" :size="15" />
        </button>

        <!-- Join Meshes -->
        <button 
          @click="projectStore.performJoinMeshes()"
          class="w-full h-8 flex items-center justify-center rounded text-blue-400 hover:bg-dcc-750 transition"
          title="Join Selected Meshes (Ctrl+J)"
        >
          <BlenderIcon name="join-mesh" :size="16" />
        </button>

        <!-- Separate Mesh -->
        <button 
          @click="projectStore.performSeparateMesh()"
          class="w-full h-8 flex items-center justify-center rounded text-pink-400 hover:bg-dcc-750 transition"
          title="Separate Selection (P)"
        >
          <BlenderIcon name="separate-mesh" :size="16" />
        </button>

        <!-- Clean Mesh -->
        <button 
          @click="projectStore.performCleanupMesh()"
          class="w-full h-8 flex items-center justify-center rounded text-emerald-400 hover:bg-dcc-750 transition"
          title="Safe Clean Mesh Geometry"
        >
          <BlenderIcon name="clean-mesh" :size="15" />
        </button>

        <!-- Recalculate Outside Normals -->
        <button 
          @click="projectStore.performFlipNormals()"
          class="w-full h-8 flex items-center justify-center rounded text-cyan-400 hover:bg-dcc-750 transition"
          title="Recalculate Outside Normals"
        >
          <BlenderIcon name="flip-normals" :size="16" />
        </button>

        <!-- Delete Object -->
        <button 
          @click="handleDelete"
          class="w-full h-8 flex items-center justify-center rounded text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 transition"
          title="Delete Object (Delete / X)"
        >
          <BlenderIcon name="trash" :size="15" />
        </button>
      </div>
    </div>

    <!-- (B) VERTEX MODE TOOLS (8 items = 4x2) -->
    <div v-else-if="toolStore.appMode === 'model' && toolStore.selectMode === 'vertex'" class="w-full px-1.5 flex-1">
      <div class="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-wider mb-1 px-1">Vertex</div>
      <div class="grid grid-cols-2 gap-1 w-full">
        <!-- Merge at Center -->
        <button 
          @click="projectStore.performMerge('center')"
          class="w-full h-8 flex items-center justify-center rounded text-amber-400 hover:bg-dcc-750 transition"
          title="Merge Vertices at Center (M)"
        >
          <BlenderIcon name="tool-merge" :size="16" />
        </button>

        <!-- Merge by Distance / Weld -->
        <button 
          @click="projectStore.performMerge('distance', 0.01)"
          class="w-full h-8 flex items-center justify-center rounded text-amber-300 hover:bg-dcc-750 transition"
          title="Merge by Distance / Auto Weld"
        >
          <BlenderIcon name="snap" :size="15" />
        </button>

        <!-- Connect Vertices -->
        <button 
          @click="projectStore.performConnectVertices()"
          class="w-full h-8 flex items-center justify-center rounded text-emerald-400 hover:bg-dcc-750 transition"
          title="Connect Selected 2 Vertices (J)"
        >
          <BlenderIcon name="connect-verts" :size="16" />
        </button>

        <!-- Fill Face from Vertices -->
        <button 
          @click="projectStore.performFillFace()"
          class="w-full h-8 flex items-center justify-center rounded text-teal-400 hover:bg-dcc-750 transition"
          title="Fill Face from Vertices (F)"
        >
          <BlenderIcon name="fill-face" :size="16" />
        </button>

        <!-- Knife Tool -->
        <button 
          @click="handleStartKnife"
          class="w-full h-8 flex items-center justify-center rounded text-rose-400 hover:bg-dcc-750 transition"
          title="Knife Topology Tool (K)"
        >
          <BlenderIcon name="tool-knife" :size="16" />
        </button>

        <!-- Subdivide / Divide -->
        <button 
          @click="projectStore.performSubdivide()"
          class="w-full h-8 flex items-center justify-center rounded text-indigo-400 hover:bg-dcc-750 transition"
          title="Subdivide Connected Edges"
        >
          <BlenderIcon name="tool-subdivide" :size="16" />
        </button>

        <!-- Dissolve Vertex -->
        <button 
          @click="projectStore.performDissolve('vertex')"
          class="w-full h-8 flex items-center justify-center rounded text-rose-300 hover:bg-dcc-750 transition"
          title="Dissolve Vertices"
        >
          <BlenderIcon name="dissolve" :size="16" />
        </button>

        <!-- Delete Vertices -->
        <button 
          @click="handleDelete"
          class="w-full h-8 flex items-center justify-center rounded text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 transition"
          title="Delete Vertices (Delete / X)"
        >
          <BlenderIcon name="trash" :size="15" />
        </button>
      </div>
    </div>

    <!-- (C) EDGE MODE TOOLS (8 items = 4x2) -->
    <div v-else-if="toolStore.appMode === 'model' && toolStore.selectMode === 'edge'" class="w-full px-1.5 flex-1">
      <div class="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-wider mb-1 px-1">Edge</div>
      <div class="grid grid-cols-2 gap-1 w-full">
        <!-- Loop Cut -->
        <button 
          @click="handleStartLoopCut"
          class="w-full h-8 flex items-center justify-center rounded text-amber-400 hover:bg-dcc-750 transition"
          title="Loop Cut & Slide (Ctrl+R)"
        >
          <BlenderIcon name="tool-loopcut" :size="16" />
        </button>

        <!-- Knife Tool -->
        <button 
          @click="handleStartKnife"
          class="w-full h-8 flex items-center justify-center rounded text-rose-400 hover:bg-dcc-750 transition"
          title="Knife Topology Tool (K)"
        >
          <BlenderIcon name="tool-knife" :size="16" />
        </button>

        <!-- Bevel Edges -->
        <button 
          @click="projectStore.performBevel()"
          class="w-full h-8 flex items-center justify-center rounded text-purple-400 hover:bg-dcc-750 transition"
          title="Bevel / Chamfer Edge (Ctrl+B)"
        >
          <BlenderIcon name="tool-bevel" :size="16" />
        </button>

        <!-- Extrude Edges -->
        <button 
          @click="projectStore.performExtrude()"
          class="w-full h-8 flex items-center justify-center rounded text-emerald-400 hover:bg-dcc-750 transition"
          title="Extrude Edges (E)"
        >
          <BlenderIcon name="tool-extrude" :size="16" />
        </button>

        <!-- Subdivide Edges -->
        <button 
          @click="projectStore.performSubdivide()"
          class="w-full h-8 flex items-center justify-center rounded text-indigo-400 hover:bg-dcc-750 transition"
          title="Subdivide / Divide Edges"
        >
          <BlenderIcon name="tool-subdivide" :size="16" />
        </button>

        <!-- Dissolve Edge -->
        <button 
          @click="projectStore.performDissolve('edge')"
          class="w-full h-8 flex items-center justify-center rounded text-rose-300 hover:bg-dcc-750 transition"
          title="Dissolve Edge (Merge 2 adjacent faces)"
        >
          <BlenderIcon name="dissolve" :size="16" />
        </button>

        <!-- Fill / Bridge Face -->
        <button 
          @click="projectStore.performFillFace()"
          class="w-full h-8 flex items-center justify-center rounded text-teal-400 hover:bg-dcc-750 transition"
          title="Fill / Bridge Loop (F)"
        >
          <BlenderIcon name="fill-face" :size="16" />
        </button>

        <!-- Delete Edges -->
        <button 
          @click="handleDelete"
          class="w-full h-8 flex items-center justify-center rounded text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 transition"
          title="Delete Edges (Delete / X)"
        >
          <BlenderIcon name="trash" :size="15" />
        </button>
      </div>
    </div>

    <!-- (D) FACE MODE TOOLS (8 items = 4x2) -->
    <div v-else-if="toolStore.appMode === 'model' && toolStore.selectMode === 'face'" class="w-full px-1.5 flex-1">
      <div class="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-wider mb-1 px-1">Face</div>
      <div class="grid grid-cols-2 gap-1 w-full">
        <!-- Extrude -->
        <button 
          @click="projectStore.performExtrude()"
          class="w-full h-8 flex items-center justify-center rounded text-emerald-400 hover:bg-dcc-750 transition"
          title="Extrude Region (E)"
        >
          <BlenderIcon name="tool-extrude" :size="16" />
        </button>

        <!-- Inset -->
        <button 
          @click="projectStore.performInset()"
          class="w-full h-8 flex items-center justify-center rounded text-sky-400 hover:bg-dcc-750 transition"
          title="Inset Faces (I)"
        >
          <BlenderIcon name="tool-inset" :size="16" />
        </button>

        <!-- Bevel -->
        <button 
          @click="projectStore.performBevel()"
          class="w-full h-8 flex items-center justify-center rounded text-purple-400 hover:bg-dcc-750 transition"
          title="Bevel / Chamfer (Ctrl+B)"
        >
          <BlenderIcon name="tool-bevel" :size="16" />
        </button>

        <!-- Loop Cut -->
        <button 
          @click="handleStartLoopCut"
          class="w-full h-8 flex items-center justify-center rounded text-amber-400 hover:bg-dcc-750 transition"
          title="Loop Cut & Slide (Ctrl+R)"
        >
          <BlenderIcon name="tool-loopcut" :size="16" />
        </button>

        <!-- Knife Tool -->
        <button 
          @click="handleStartKnife"
          class="w-full h-8 flex items-center justify-center rounded text-rose-400 hover:bg-dcc-750 transition"
          title="Knife Topology Tool (K)"
        >
          <BlenderIcon name="tool-knife" :size="16" />
        </button>

        <!-- Subdivide -->
        <button 
          @click="projectStore.performSubdivide()"
          class="w-full h-8 flex items-center justify-center rounded text-indigo-400 hover:bg-dcc-750 transition"
          title="Subdivide Faces"
        >
          <BlenderIcon name="tool-subdivide" :size="16" />
        </button>

        <!-- Flip Normals -->
        <button 
          @click="projectStore.performFlipNormals()"
          class="w-full h-8 flex items-center justify-center rounded text-cyan-400 hover:bg-dcc-750 transition"
          title="Flip Face Normals"
        >
          <BlenderIcon name="flip-normals" :size="16" />
        </button>

        <!-- Delete Faces -->
        <button 
          @click="handleDelete"
          class="w-full h-8 flex items-center justify-center rounded text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 transition"
          title="Delete Faces (Delete / X)"
        >
          <BlenderIcon name="trash" :size="15" />
        </button>
      </div>
    </div>

    <!-- PAINTING TOOLS (2 Columns, 3 Rows = 6 Symmetrical Slots) -->
    <div v-else-if="toolStore.appMode === 'uvpaint' && (toolStore.uvWorkspaceTab === 'paint' || toolStore.uvWorkspaceTab === 'vertex')" class="w-full px-1.5 flex-1">
      <div class="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-wider mb-1 px-1">Paint</div>
      <div class="grid grid-cols-2 gap-1 w-full">
        <button 
          @click="toolStore.paintTool = 'brush'"
          class="w-full h-8 flex items-center justify-center rounded transition"
          :class="toolStore.paintTool === 'brush' ? 'bg-dcc-700 text-indigo-400 border border-indigo-500/50 shadow-xs' : 'text-slate-400 hover:text-slate-200 hover:bg-dcc-750'"
          title="Pixel Brush (B)"
        >
          <BlenderIcon name="brush" :size="16" />
        </button>

        <button 
          @click="toolStore.paintTool = 'bucket'"
          class="w-full h-8 flex items-center justify-center rounded transition"
          :class="toolStore.paintTool === 'bucket' ? 'bg-dcc-700 text-indigo-400 border border-indigo-500/50 shadow-xs' : 'text-slate-400 hover:text-slate-200 hover:bg-dcc-750'"
          title="Flood Fill Bucket (G)"
        >
          <BlenderIcon name="fill" :size="16" />
        </button>

        <button 
          @click="toolStore.paintTool = 'dither'"
          class="w-full h-8 flex items-center justify-center rounded transition"
          :class="toolStore.paintTool === 'dither' ? 'bg-dcc-700 text-indigo-400 border border-indigo-500/50 shadow-xs' : 'text-slate-400 hover:text-slate-200 hover:bg-dcc-750'"
          title="Bayer Dither Brush (D)"
        >
          <BlenderIcon name="dither" :size="16" />
        </button>

        <button 
          @click="toolStore.paintTool = 'eraser'"
          class="w-full h-8 flex items-center justify-center rounded transition"
          :class="toolStore.paintTool === 'eraser' ? 'bg-dcc-700 text-indigo-400 border border-indigo-500/50 shadow-xs' : 'text-slate-400 hover:text-slate-200 hover:bg-dcc-750'"
          title="Eraser (E)"
        >
          <BlenderIcon name="eraser" :size="16" />
        </button>

        <button 
          @click="toolStore.paintTool = 'picker'"
          class="w-full h-8 flex items-center justify-center rounded transition"
          :class="toolStore.paintTool === 'picker' ? 'bg-dcc-700 text-indigo-400 border border-indigo-500/50 shadow-xs' : 'text-slate-400 hover:text-slate-200 hover:bg-dcc-750'"
          title="Eyedropper Color Picker (I)"
        >
          <BlenderIcon name="picker" :size="16" />
        </button>

        <button 
          @click="projectStore.pixelBuffer.clear('#000000'); projectStore.markTextureUpdated()"
          class="w-full h-8 flex items-center justify-center rounded text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 transition"
          title="Clear Canvas"
        >
          <BlenderIcon name="trash" :size="15" />
        </button>
      </div>
    </div>

    <!-- RIGGING TOOLS (2 Columns, 3 Rows = 6 Symmetrical Slots) -->
    <div v-else-if="toolStore.appMode === 'rig'" class="w-full px-1.5 flex-1">
      <div class="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-wider mb-1 px-1">Rig</div>
      <div class="grid grid-cols-2 gap-1 w-full">
        <button 
          @click="handleAddBone"
          class="w-full h-8 flex items-center justify-center rounded text-cyan-300 hover:bg-dcc-750 transition border border-cyan-500/30"
          title="Add Root Bone"
        >
          <BlenderIcon name="bone" :size="16" />
        </button>

        <button 
          @click="animationStore.extrudeBone(animationStore.selectedBoneId)"
          class="w-full h-8 flex items-center justify-center rounded text-cyan-400 hover:bg-dcc-750 transition"
          title="Extrude Child Bone (E)"
        >
          <BlenderIcon name="tool-extrude" :size="16" />
        </button>

        <button 
          @click="animationStore.selectedBoneId ? animationStore.subdivideBone(animationStore.selectedBoneId) : null"
          :disabled="!animationStore.selectedBoneId"
          class="w-full h-8 flex items-center justify-center rounded text-slate-300 hover:bg-dcc-750 disabled:opacity-30 transition"
          title="Subdivide Selected Bone"
        >
          <BlenderIcon name="tool-subdivide" :size="16" />
        </button>

        <button 
          @click="animationStore.symmetrizeArmature"
          class="w-full h-8 flex items-center justify-center rounded text-amber-400 hover:bg-dcc-750 transition"
          title="Symmetrize Left Bones across X-Axis"
        >
          <BlenderIcon name="tool-merge" :size="16" />
        </button>

        <button 
          v-if="animationStore.selectedBoneId"
          @click="animationStore.deleteBone(animationStore.selectedBoneId)"
          class="w-full h-8 flex items-center justify-center rounded text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 transition col-span-2"
          title="Delete Selected Bone (Delete / X)"
        >
          <BlenderIcon name="trash" :size="15" />
        </button>
      </div>
    </div>

    <!-- ANIMATION TOOLS (2 Columns) -->
    <div v-else-if="toolStore.appMode === 'animate'" class="w-full px-1.5 flex-1">
      <div class="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-wider mb-1 px-1">Pose</div>
      <div class="grid grid-cols-2 gap-1 w-full">
        <button 
          @click="animationStore.resetPose"
          class="w-full h-8 flex items-center justify-center rounded text-slate-300 hover:bg-dcc-750 transition col-span-2"
          title="Reset Pose (Alt+R)"
        >
          <BlenderIcon name="keyframe" :size="16" />
        </button>
      </div>
    </div>
  </aside>
</template>
