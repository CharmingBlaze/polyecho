<script setup lang="ts">
import { computed } from 'vue'
import { useAnimationStore } from '../../stores/animationStore'
import { useProjectStore } from '../../stores/projectStore'
import { 
  Percent, 
  Trash2, 
  Layers,
  GitCommitVertical,
  Paintbrush,
  Eraser,
  Wand2,
  Pipette,
  RefreshCw,
  Sparkles
} from 'lucide-vue-next'

const animationStore = useAnimationStore()
const projectStore = useProjectStore()

const activeMesh = computed(() => projectStore.activeMesh)
const selectedBone = computed(() => animationStore.selectedBone)
const selectedVertexIds = computed(() => projectStore.selectedVertexIds)

// Quick numeric presets
const weightPresets = [0.0, 0.25, 0.5, 0.75, 1.0]

// Mouse drag scrubbing on numeric input labels
function startScrubNumeric(
  e: MouseEvent, 
  getter: () => number, 
  setter: (val: number) => void, 
  min = 0, 
  max = 1, 
  step = 0.05, 
  precision = 2
) {
  e.preventDefault()
  const startX = e.clientX
  const startVal = getter()

  const onMouseMove = (moveEvent: MouseEvent) => {
    const deltaX = moveEvent.clientX - startX
    const mult = moveEvent.shiftKey ? 0.2 : 1.0
    const newVal = Math.max(min, Math.min(max, Number((startVal + deltaX * step * mult).toFixed(precision))))
    setter(newVal)
  }

  const onMouseUp = () => {
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

const aggregateWeights = computed(() => {
  if (!activeMesh.value || selectedVertexIds.value.length === 0) return []
  const vMap = new Map(activeMesh.value.vertices.map(v => [v.id, v]))
  const boneMap = new Map(animationStore.armature.bones.map(b => [b.id, b]))

  const weightAccum = new Map<string, { total: number; count: number }>()

  for (const vId of selectedVertexIds.value) {
    const v = vMap.get(vId)
    if (!v || !v.boneWeights) continue
    for (const [bId, w] of Object.entries(v.boneWeights)) {
      if (w <= 0.001) continue
      const curr = weightAccum.get(bId) || { total: 0, count: 0 }
      curr.total += w
      curr.count++
      weightAccum.set(bId, curr)
    }
  }

  const result: { boneId: string; boneName: string; avgWeight: number; isSelected: boolean }[] = []
  for (const [bId, data] of weightAccum.entries()) {
    const b = boneMap.get(bId)
    result.push({
      boneId: bId,
      boneName: b ? b.name : bId,
      avgWeight: Number((data.total / data.count).toFixed(3)),
      isSelected: bId === selectedBone.value?.id
    })
  }

  return result.sort((a, b) => b.avgWeight - a.avgWeight)
})

// Quick Operations
function handleAssign100() {
  if (!activeMesh.value || !selectedBone.value || selectedVertexIds.value.length === 0) return
  projectStore.recordState('Assign 100% Bone Weight')
  animationStore.assignRigidVertices(activeMesh.value.id, selectedVertexIds.value, selectedBone.value.id)
}

function handleFloodFillMesh() {
  if (!activeMesh.value || !selectedBone.value) return
  projectStore.recordState(`Flood Fill ${selectedBone.value.name} Weight`)
  animationStore.floodFillBoneWeight(activeMesh.value.id, selectedBone.value.id, animationStore.weightBrushWeight, false)
}

function handleFloodFillSelection() {
  if (!activeMesh.value || !selectedBone.value || selectedVertexIds.value.length === 0) return
  projectStore.recordState(`Fill Selection ${selectedBone.value.name} Weight`)
  animationStore.floodFillBoneWeight(activeMesh.value.id, selectedBone.value.id, animationStore.weightBrushWeight, true)
}

function handleSmoothMesh() {
  if (!activeMesh.value) return
  projectStore.recordState('Smooth Bone Weights')
  animationStore.smoothMeshBoneWeights(activeMesh.value.id, selectedBone.value?.id)
}

function handleNormalizeAll() {
  if (!activeMesh.value) return
  projectStore.recordState('Normalize All Weights')
  animationStore.normalizeAllMeshWeights(activeMesh.value.id)
}

function handleInvertWeights() {
  if (!activeMesh.value || !selectedBone.value) return
  projectStore.recordState(`Invert ${selectedBone.value.name} Weights`)
  animationStore.invertBoneWeights(activeMesh.value.id, selectedBone.value.id)
}

function handleClearWeights() {
  if (!activeMesh.value || !selectedBone.value) return
  projectStore.recordState(`Clear ${selectedBone.value.name} Weights`)
  animationStore.clearBoneWeights(activeMesh.value.id, selectedBone.value.id)
}

function handleRemoveWeight(boneId: string) {
  if (!activeMesh.value || selectedVertexIds.value.length === 0) return
  projectStore.recordState('Remove Bone Weight')
  animationStore.assignVertexWeight(activeMesh.value.id, selectedVertexIds.value, boneId, 0)
}
</script>

<template>
  <div class="h-full w-full bg-ui-panel p-3 text-ui-textPrimary flex flex-col space-y-3 font-sans text-xs select-none overflow-y-auto custom-scrollbar">
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-ui-borderSubtle pb-2">
      <div class="flex items-center gap-1.5 font-semibold text-ui-textPrimary">
        <Paintbrush class="w-3.5 h-3.5 text-ui-accent" />
        <span class="text-[11px] uppercase tracking-wider text-ui-textMuted font-bold">Weight Paint & Skinning</span>
      </div>
      <span v-if="activeMesh" class="text-[9px] font-mono text-ui-textSecondary bg-ui-input px-1.5 py-0.5 rounded-xs border border-ui-borderSubtle truncate max-w-[110px]">
        {{ activeMesh.name }}
      </span>
    </div>

    <!-- Mode Switcher Island (Edit Rig | Test Pose | Weight Paint) -->
    <div class="grid grid-cols-3 gap-1 bg-ui-input/70 p-0.5 rounded-xs border border-ui-borderSubtle text-[10px]">
      <button 
        @click="animationStore.toggleWeightPaint(false); animationStore.toggleTestPose(false)"
        class="py-1 px-1 rounded-xs transition flex items-center justify-center gap-1 cursor-pointer"
        :class="!animationStore.isWeightPaintActive && !animationStore.isTestPoseActive ? 'bg-ui-active text-ui-textAccent font-bold border border-ui-accent/40 shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
        title="Edit Skeleton Joints & Pivot Positions"
      >
        <GitCommitVertical class="w-3 h-3 text-purple-400" />
        <span>Edit Rig</span>
      </button>

      <button 
        @click="animationStore.toggleWeightPaint(false); animationStore.toggleTestPose(true)"
        class="py-1 px-1 rounded-xs transition flex items-center justify-center gap-1 cursor-pointer"
        :class="animationStore.isTestPoseActive ? 'bg-ui-active text-ui-textAccent font-bold border border-ui-accent/40 shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
        title="Test Skeleton Deformations & Poses"
      >
        <RefreshCw class="w-3 h-3 text-amber-400" />
        <span>Pose</span>
      </button>

      <button 
        @click="animationStore.toggleWeightPaint(true)"
        class="py-1 px-1 rounded-xs transition flex items-center justify-center gap-1 cursor-pointer"
        :class="animationStore.isWeightPaintActive ? 'bg-sky-600 text-white font-bold shadow-xs border border-sky-400' : 'text-ui-textMuted hover:text-sky-300 hover:bg-ui-hover'"
        title="Interactive 3D Heatmap Weight Painting Mode"
      >
        <Paintbrush class="w-3 h-3 text-white" />
        <span>Weight Paint</span>
      </button>
    </div>

    <!-- Active Bone Selector -->
    <div class="bg-ui-surface p-2.5 rounded-xs border border-ui-borderSubtle space-y-1.5">
      <div class="flex items-center justify-between text-[10px]">
        <span class="text-ui-textMuted font-semibold uppercase tracking-wider">Active Bone Target</span>
        <span v-if="selectedBone" class="text-amber-400 font-mono font-bold text-[10px]">
          {{ selectedBone.name }}
        </span>
      </div>

      <select 
        v-if="animationStore.armature.bones.length > 0"
        :value="animationStore.selectedBoneId || ''"
        @change="animationStore.selectBone(($event.target as HTMLSelectElement).value)"
        class="w-full bg-ui-input border border-ui-borderDefault rounded-xs px-2 py-1 text-ui-textPrimary text-xs focus:outline-none focus:border-ui-accent cursor-pointer"
      >
        <option value="" class="bg-ui-panel text-ui-textMuted">-- Select Bone to Paint / Inspect --</option>
        <option v-for="b in animationStore.armature.bones" :key="b.id" :value="b.id" class="bg-ui-panel text-ui-textPrimary">
          {{ b.name }} ({{ b.parentId ? 'Child' : 'Root' }})
        </option>
      </select>

      <div v-else class="text-ui-textMuted text-center py-2 italic text-[10px]">
        No bones in armature. Add a bone first.
      </div>
    </div>

    <!-- 3D WEIGHT PAINT BRUSH TOOLBAR (When in Weight Paint Mode) -->
    <div class="bg-ui-surface p-2.5 rounded-xs border border-ui-borderSubtle space-y-2.5">
      <div class="flex items-center justify-between text-[10px]">
        <span class="text-ui-textAccent font-bold uppercase tracking-wider flex items-center gap-1">
          <Wand2 class="w-3 h-3 text-sky-400" />
          <span>3D Paint Brush</span>
        </span>
        <span v-if="animationStore.isWeightPaintActive" class="text-emerald-400 font-medium flex items-center gap-1">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>Viewport Paint Active</span>
        </span>
      </div>

      <!-- Brush Tool Modes (Draw | Subtract | Smooth | Fill | Sample) -->
      <div class="grid grid-cols-5 gap-1 bg-ui-input/70 p-0.5 rounded-xs border border-ui-borderSubtle text-[9px]">
        <button 
          @click="animationStore.weightPaintTool = 'draw'"
          class="py-1 rounded-xs transition flex flex-col items-center justify-center gap-0.5 cursor-pointer"
          :class="animationStore.weightPaintTool === 'draw' ? 'bg-ui-active text-ui-textAccent font-bold border border-ui-accent/40 shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Draw / Add Weight (Up to Target Value)"
        >
          <Paintbrush class="w-3 h-3 text-sky-400" />
          <span>Draw</span>
        </button>

        <button 
          @click="animationStore.weightPaintTool = 'subtract'"
          class="py-1 rounded-xs transition flex flex-col items-center justify-center gap-0.5 cursor-pointer"
          :class="animationStore.weightPaintTool === 'subtract' ? 'bg-ui-active text-ui-textAccent font-bold border border-ui-accent/40 shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Subtract / Erase Bone Weight"
        >
          <Eraser class="w-3 h-3 text-rose-400" />
          <span>Sub</span>
        </button>

        <button 
          @click="animationStore.weightPaintTool = 'smooth'"
          class="py-1 rounded-xs transition flex flex-col items-center justify-center gap-0.5 cursor-pointer"
          :class="animationStore.weightPaintTool === 'smooth' ? 'bg-ui-active text-ui-textAccent font-bold border border-ui-accent/40 shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Smooth / Blur Weights Across Connected Vertices"
        >
          <Sparkles class="w-3 h-3 text-amber-400" />
          <span>Smooth</span>
        </button>

        <button 
          @click="animationStore.weightPaintTool = 'fill'"
          class="py-1 rounded-xs transition flex flex-col items-center justify-center gap-0.5 cursor-pointer"
          :class="animationStore.weightPaintTool === 'fill' ? 'bg-ui-active text-ui-textAccent font-bold border border-ui-accent/40 shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Flood Fill Target Weight Under Brush"
        >
          <Layers class="w-3 h-3 text-purple-400" />
          <span>Fill</span>
        </button>

        <button 
          @click="animationStore.weightPaintTool = 'sample'"
          class="py-1 rounded-xs transition flex flex-col items-center justify-center gap-0.5 cursor-pointer"
          :class="animationStore.weightPaintTool === 'sample' ? 'bg-ui-active text-ui-textAccent font-bold border border-ui-accent/40 shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Sample / Pick Weight Value from Mesh"
        >
          <Pipette class="w-3 h-3 text-emerald-400" />
          <span>Sample</span>
        </button>
      </div>

      <!-- Target Weight Slider + Quick Preset Buttons -->
      <div class="space-y-1 pt-1">
        <div class="flex items-center justify-between text-[10px]">
          <span 
            class="text-ui-textSecondary cursor-ew-resize hover:text-ui-textAccent font-medium"
            @mousedown="startScrubNumeric($event, () => animationStore.weightBrushWeight, val => animationStore.weightBrushWeight = val, 0, 1, 0.02, 2)"
            title="Click & Drag to scrub weight value"
          >
            Target Weight:
          </span>
          <span class="font-mono text-ui-textAccent font-bold text-xs">
            {{ Number(animationStore.weightBrushWeight).toFixed(2) }} ({{ Math.round(animationStore.weightBrushWeight * 100) }}%)
          </span>
        </div>
        <input 
          type="range" 
          min="0" 
          max="1" 
          step="0.01" 
          v-model.number="animationStore.weightBrushWeight" 
          class="w-full accent-ui-accent bg-ui-input h-1.5 rounded-xs cursor-pointer"
        />

        <!-- Preset Buttons -->
        <div class="grid grid-cols-5 gap-1 pt-0.5">
          <button 
            v-for="pw in weightPresets" 
            :key="pw"
            @click="animationStore.weightBrushWeight = pw"
            class="py-0.5 rounded-xs text-[9px] font-mono font-semibold transition text-center cursor-pointer"
            :class="Math.abs(animationStore.weightBrushWeight - pw) < 0.01 ? 'bg-ui-active text-ui-textAccent border border-ui-accent/40' : 'bg-ui-input text-ui-textSecondary hover:bg-ui-hover'"
          >
            {{ pw === 0 ? '0.0' : pw === 1 ? '1.0' : pw }}
          </button>
        </div>
      </div>

      <!-- Brush Radius (Size) & Strength Scrubbers -->
      <div class="grid grid-cols-2 gap-2 pt-1 border-t border-ui-borderSubtle/60">
        <!-- Radius -->
        <div class="space-y-1">
          <div class="flex items-center justify-between text-[10px]">
            <span 
              class="text-ui-textSecondary cursor-ew-resize hover:text-ui-textAccent"
              @mousedown="startScrubNumeric($event, () => animationStore.weightBrushRadius, val => animationStore.weightBrushRadius = val, 0.05, 5.0, 0.05, 2)"
              title="Click & Drag to scrub brush radius"
            >
              Radius:
            </span>
            <span class="font-mono text-ui-textPrimary font-bold text-[10px]">{{ animationStore.weightBrushRadius }}m</span>
          </div>
          <input 
            type="range" 
            min="0.05" 
            max="3.0" 
            step="0.05" 
            v-model.number="animationStore.weightBrushRadius" 
            class="w-full accent-ui-accent bg-ui-input h-1.5 rounded-xs cursor-pointer"
          />
        </div>

        <!-- Strength -->
        <div class="space-y-1">
          <div class="flex items-center justify-between text-[10px]">
            <span 
              class="text-ui-textSecondary cursor-ew-resize hover:text-ui-textAccent"
              @mousedown="startScrubNumeric($event, () => animationStore.weightBrushStrength, val => animationStore.weightBrushStrength = val, 0.05, 1.0, 0.05, 2)"
              title="Click & Drag to scrub brush strength"
            >
              Strength:
            </span>
            <span class="font-mono text-ui-textPrimary font-bold text-[10px]">{{ Math.round(animationStore.weightBrushStrength * 100) }}%</span>
          </div>
          <input 
            type="range" 
            min="0.05" 
            max="1.0" 
            step="0.05" 
            v-model.number="animationStore.weightBrushStrength" 
            class="w-full accent-ui-accent bg-ui-input h-1.5 rounded-xs cursor-pointer"
          />
        </div>
      </div>

      <!-- Falloff Curve Selection -->
      <div class="space-y-1 pt-1 border-t border-ui-borderSubtle/60">
        <div class="flex items-center justify-between text-[10px]">
          <span class="text-ui-textMuted font-medium">Brush Falloff</span>
        </div>
        <div class="grid grid-cols-3 gap-1 text-[10px]">
          <button 
            @click="animationStore.weightBrushFalloff = 'smooth'"
            class="py-0.5 rounded-xs text-center transition font-medium cursor-pointer"
            :class="animationStore.weightBrushFalloff === 'smooth' ? 'bg-ui-active text-ui-textAccent border border-ui-accent/40 font-bold' : 'bg-ui-input text-ui-textMuted hover:bg-ui-hover'"
          >
            Smooth
          </button>
          <button 
            @click="animationStore.weightBrushFalloff = 'linear'"
            class="py-0.5 rounded-xs text-center transition font-medium cursor-pointer"
            :class="animationStore.weightBrushFalloff === 'linear' ? 'bg-ui-active text-ui-textAccent border border-ui-accent/40 font-bold' : 'bg-ui-input text-ui-textMuted hover:bg-ui-hover'"
          >
            Linear
          </button>
          <button 
            @click="animationStore.weightBrushFalloff = 'constant'"
            class="py-0.5 rounded-xs text-center transition font-medium cursor-pointer"
            :class="animationStore.weightBrushFalloff === 'constant' ? 'bg-ui-active text-ui-textAccent border border-ui-accent/40 font-bold' : 'bg-ui-input text-ui-textMuted hover:bg-ui-hover'"
          >
            Hard
          </button>
        </div>
      </div>

      <!-- Paint Options Toggles -->
      <div class="space-y-1.5 pt-1.5 border-t border-ui-borderSubtle/60 text-[10px]">
        <label class="flex items-center justify-between cursor-pointer text-ui-textSecondary hover:text-ui-textPrimary">
          <span>Auto-Normalize (Total = 1.0)</span>
          <input type="checkbox" v-model="animationStore.weightAutoNormalize" class="accent-ui-accent rounded-xs cursor-pointer" />
        </label>
        <label class="flex items-center justify-between cursor-pointer text-ui-textSecondary hover:text-ui-textPrimary">
          <span>X-Axis Symmetry Mirror</span>
          <input type="checkbox" v-model="animationStore.weightXMirror" class="accent-ui-accent rounded-xs cursor-pointer" />
        </label>
        <label class="flex items-center justify-between cursor-pointer text-ui-textSecondary hover:text-ui-textPrimary">
          <span>Show Viewport Heatmap Legend</span>
          <input type="checkbox" v-model="animationStore.showHeatmapLegend" class="accent-ui-accent rounded-xs cursor-pointer" />
        </label>
      </div>
    </div>

    <!-- HEATMAP COLOR RAMP LEGEND -->
    <div class="bg-ui-surface p-2.5 rounded-xs border border-ui-borderSubtle space-y-1.5">
      <div class="flex items-center justify-between text-[10px]">
        <span class="text-ui-textMuted font-bold uppercase tracking-wider">Heatmap Gradient Legend</span>
      </div>
      <div class="h-3 w-full rounded-xs shadow-inner" style="background: linear-gradient(to right, #0a188f 0%, #00e5ff 25%, #00e676 50%, #ffd600 75%, #ff1744 100%);"></div>
      <div class="flex justify-between text-[9px] font-mono text-ui-textSecondary">
        <span>0% Blue</span>
        <span>25% Cyan</span>
        <span>50% Green</span>
        <span>75% Yellow</span>
        <span>100% Red</span>
      </div>
    </div>

    <!-- 1-CLICK WEIGHT UTILITIES -->
    <div class="bg-ui-surface p-2.5 rounded-xs border border-ui-borderSubtle space-y-1.5">
      <span class="text-[10px] text-ui-textMuted font-bold uppercase tracking-wider">1-Click Utilities</span>
      <div class="grid grid-cols-2 gap-1.5 pt-0.5">
        <button 
          @click="handleFloodFillMesh"
          :disabled="!selectedBone || !activeMesh"
          class="py-1 px-2 bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle text-ui-textPrimary rounded-xs text-[10px] font-medium flex items-center justify-center gap-1 transition cursor-pointer disabled:opacity-40"
          title="Flood fill all vertices on active mesh with target weight"
        >
          <Layers class="w-3 h-3 text-sky-400" />
          <span>Fill Mesh</span>
        </button>

        <button 
          @click="handleSmoothMesh"
          :disabled="!activeMesh"
          class="py-1 px-2 bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle text-ui-textPrimary rounded-xs text-[10px] font-medium flex items-center justify-center gap-1 transition cursor-pointer disabled:opacity-40"
          title="Smooth all vertex weight transitions"
        >
          <Sparkles class="w-3 h-3 text-amber-400" />
          <span>Smooth Seams</span>
        </button>

        <button 
          @click="handleNormalizeAll"
          :disabled="!activeMesh"
          class="py-1 px-2 bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle text-ui-textPrimary rounded-xs text-[10px] font-medium flex items-center justify-center gap-1 transition cursor-pointer disabled:opacity-40"
          title="Normalize sum of all bone weights across all vertices to 1.0"
        >
          <Percent class="w-3 h-3 text-emerald-400" />
          <span>Normalize All</span>
        </button>

        <button 
          @click="handleInvertWeights"
          :disabled="!selectedBone || !activeMesh"
          class="py-1 px-2 bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle text-ui-textPrimary rounded-xs text-[10px] font-medium flex items-center justify-center gap-1 transition cursor-pointer disabled:opacity-40"
          title="Invert weight influence on active bone"
        >
          <RefreshCw class="w-3 h-3 text-purple-400" />
          <span>Invert Weight</span>
        </button>

        <button 
          @click="handleClearWeights"
          :disabled="!selectedBone || !activeMesh"
          class="col-span-2 py-1 px-2 bg-rose-950/30 hover:bg-rose-900/40 border border-rose-900/50 text-rose-300 rounded-xs text-[10px] font-medium flex items-center justify-center gap-1 transition cursor-pointer disabled:opacity-40"
          title="Clear all weight influence for active bone"
        >
          <Trash2 class="w-3 h-3" />
          <span>Clear Active Bone Weights</span>
        </button>
      </div>
    </div>

    <!-- Influences Table for Selected Vertices -->
    <div class="bg-ui-surface p-2.5 rounded-xs border border-ui-borderSubtle space-y-2 flex-1 flex flex-col min-h-0">
      <div class="flex items-center justify-between text-[10px]">
        <span class="text-ui-textMuted font-semibold uppercase tracking-wider">
          Selected Vertices ({{ selectedVertexIds.length }})
        </span>
        <div class="flex items-center gap-2">
          <button 
            @click="handleFloodFillSelection"
            :disabled="selectedVertexIds.length === 0 || !selectedBone"
            class="text-sky-400 hover:underline font-semibold cursor-pointer disabled:opacity-40 text-[10px]"
            title="Fill selected vertices with brush target weight"
          >
            Fill Weight
          </button>
          <span class="text-ui-borderSubtle">|</span>
          <button 
            @click="handleAssign100"
            :disabled="selectedVertexIds.length === 0 || !selectedBone"
            class="text-ui-textAccent hover:underline font-semibold cursor-pointer disabled:opacity-40 text-[10px]"
          >
            Assign 100%
          </button>
        </div>
      </div>

      <div class="space-y-1 overflow-y-auto flex-1 max-h-40 text-[11px] custom-scrollbar">
        <div 
          v-for="inf in aggregateWeights" 
          :key="inf.boneId"
          class="flex items-center justify-between px-2 py-1 rounded-xs border transition"
          :class="inf.isSelected ? 'bg-ui-active border-ui-accent/40 text-ui-textAccent shadow-xs' : 'bg-ui-input/70 border-ui-borderSubtle text-ui-textSecondary'"
        >
          <div class="flex items-center gap-1.5 truncate">
            <GitCommitVertical class="w-3.5 h-3.5 text-ui-accent shrink-0" />
            <span class="truncate font-medium">{{ inf.boneName }}</span>
          </div>

          <div class="flex items-center gap-2">
            <span class="font-mono text-ui-textPrimary font-semibold text-[10px]">
              {{ (inf.avgWeight * 100).toFixed(0) }}%
            </span>
            <button 
              @click="handleRemoveWeight(inf.boneId)"
              class="text-ui-textMuted hover:text-rose-400 p-0.5 transition cursor-pointer"
              title="Remove bone influence from selected vertices"
            >
              <Trash2 class="w-3 h-3" />
            </button>
          </div>
        </div>

        <div v-if="aggregateWeights.length === 0" class="py-4 text-center text-ui-textMuted italic text-[10px]">
          {{ selectedVertexIds.length === 0 ? 'Select vertices in Edit Mode to inspect discrete values' : 'No weights assigned to selection' }}
        </div>
      </div>
    </div>
  </div>
</template>
