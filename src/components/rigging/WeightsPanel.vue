<script setup lang="ts">
import { computed } from 'vue'
import { useAnimationStore } from '../../stores/animationStore'
import { useProjectStore } from '../../stores/projectStore'
import UiSection from '../ui/UiSection.vue'
import UiButton from '../ui/UiButton.vue'
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
  <div class="flex flex-col select-none text-xs font-sans">
    <div class="h-7 bg-ui-header border-b border-ui-borderSubtle px-2.5 flex items-center justify-between">
      <div class="flex items-center space-x-1.5">
        <Paintbrush class="w-3 h-3 text-sky-400" />
        <span class="text-[11px] font-medium text-ui-textMuted">Weights</span>
      </div>
      <span class="font-semibold text-ui-textPrimary truncate max-w-[140px] text-[11px]">
        {{ selectedBone?.name || activeMesh?.name || 'No target' }}
      </span>
    </div>

    <UiSection title="Mode" :icon="Paintbrush" :default-open="true">
      <div class="grid grid-cols-3 gap-1">
        <UiButton size="xs" :variant="!animationStore.isWeightPaintActive && !animationStore.isTestPoseActive ? 'accent' : 'default'" @click="animationStore.toggleWeightPaint(false); animationStore.toggleTestPose(false)">Edit</UiButton>
        <UiButton size="xs" :variant="animationStore.isTestPoseActive ? 'accent' : 'default'" @click="animationStore.toggleWeightPaint(false); animationStore.toggleTestPose(true)">Pose</UiButton>
        <UiButton size="xs" :variant="animationStore.isWeightPaintActive ? 'accent' : 'default'" @click="animationStore.toggleWeightPaint(true)">Paint</UiButton>
      </div>
    </UiSection>

    <UiSection title="Bone" :icon="GitCommitVertical" :default-open="true">
      <select
        v-if="animationStore.armature.bones.length"
        :value="animationStore.selectedBoneId || ''"
        class="w-full bg-ui-input border border-ui-borderDefault rounded-xs px-2 py-1 text-xs cursor-pointer"
        @change="animationStore.selectBone(($event.target as HTMLSelectElement).value)"
      >
        <option value="" class="bg-ui-panel">Select bone</option>
        <option v-for="b in animationStore.armature.bones" :key="b.id" :value="b.id" class="bg-ui-panel">{{ b.name }}</option>
      </select>
      <p v-else class="text-[9px] text-ui-textMuted">Add bones on the Skel tab first.</p>
    </UiSection>

    <UiSection title="Brush" :icon="Wand2" :default-open="true">
      <div class="grid grid-cols-5 gap-1">
        <UiButton size="xs" :variant="animationStore.weightPaintTool === 'draw' ? 'accent' : 'default'" title="Draw" @click="animationStore.weightPaintTool = 'draw'"><Paintbrush class="w-3 h-3" /></UiButton>
        <UiButton size="xs" :variant="animationStore.weightPaintTool === 'subtract' ? 'accent' : 'default'" title="Subtract" @click="animationStore.weightPaintTool = 'subtract'"><Eraser class="w-3 h-3" /></UiButton>
        <UiButton size="xs" :variant="animationStore.weightPaintTool === 'smooth' ? 'accent' : 'default'" title="Smooth" @click="animationStore.weightPaintTool = 'smooth'"><Sparkles class="w-3 h-3" /></UiButton>
        <UiButton size="xs" :variant="animationStore.weightPaintTool === 'fill' ? 'accent' : 'default'" title="Fill" @click="animationStore.weightPaintTool = 'fill'"><Layers class="w-3 h-3" /></UiButton>
        <UiButton size="xs" :variant="animationStore.weightPaintTool === 'sample' ? 'accent' : 'default'" title="Sample" @click="animationStore.weightPaintTool = 'sample'"><Pipette class="w-3 h-3" /></UiButton>
      </div>
      <div class="flex items-center justify-between text-[10px]">
        <span class="text-ui-textMuted cursor-ew-resize" @mousedown="startScrubNumeric($event, () => animationStore.weightBrushWeight, val => animationStore.weightBrushWeight = val, 0, 1, 0.02, 2)">Weight</span>
        <span class="font-mono">{{ Math.round(animationStore.weightBrushWeight * 100) }}%</span>
      </div>
      <input type="range" min="0" max="1" step="0.01" v-model.number="animationStore.weightBrushWeight" class="w-full accent-ui-accent h-1 bg-ui-input rounded-xs" />
      <div class="grid grid-cols-5 gap-1">
        <UiButton v-for="pw in weightPresets" :key="pw" size="xs" :variant="Math.abs(animationStore.weightBrushWeight - pw) < 0.01 ? 'accent' : 'default'" @click="animationStore.weightBrushWeight = pw">{{ pw }}</UiButton>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div>
          <div class="flex justify-between text-[10px] text-ui-textMuted"><span>Radius</span><span class="font-mono text-ui-textPrimary">{{ animationStore.weightBrushRadius }}</span></div>
          <input type="range" min="0.05" max="3" step="0.05" v-model.number="animationStore.weightBrushRadius" class="w-full accent-ui-accent h-1" />
        </div>
        <div>
          <div class="flex justify-between text-[10px] text-ui-textMuted"><span>Strength</span><span class="font-mono text-ui-textPrimary">{{ Math.round(animationStore.weightBrushStrength * 100) }}%</span></div>
          <input type="range" min="0.05" max="1" step="0.05" v-model.number="animationStore.weightBrushStrength" class="w-full accent-ui-accent h-1" />
        </div>
      </div>
    </UiSection>

    <UiSection title="Selection" :icon="Layers" :badge="selectedVertexIds.length" :default-open="true">
      <div class="grid grid-cols-2 gap-1">
        <UiButton size="xs" :disabled="!selectedVertexIds.length || !selectedBone" @click="handleFloodFillSelection">Fill sel</UiButton>
        <UiButton size="xs" :disabled="!selectedVertexIds.length || !selectedBone" @click="handleAssign100">Assign 100</UiButton>
      </div>
      <div v-for="inf in aggregateWeights" :key="inf.boneId" class="flex items-center justify-between text-[10px] px-1.5 py-0.5 rounded-xs" :class="inf.isSelected ? 'bg-ui-active text-ui-textAccent' : 'text-ui-textSecondary'">
        <span class="truncate">{{ inf.boneName }}</span>
        <span class="font-mono flex items-center gap-1">{{ (inf.avgWeight * 100).toFixed(0) }}%
          <button type="button" class="text-ui-textMuted hover:text-rose-400" @click="handleRemoveWeight(inf.boneId)"><Trash2 class="w-3 h-3" /></button>
        </span>
      </div>
      <p v-if="!aggregateWeights.length" class="text-[9px] text-ui-textMuted">Select verts in Edit to inspect weights.</p>
    </UiSection>

    <UiSection title="Brush options" :icon="RefreshCw" :default-open="false">
      <div class="grid grid-cols-3 gap-1">
        <UiButton size="xs" :variant="animationStore.weightBrushFalloff === 'smooth' ? 'accent' : 'default'" @click="animationStore.weightBrushFalloff = 'smooth'">Smooth</UiButton>
        <UiButton size="xs" :variant="animationStore.weightBrushFalloff === 'linear' ? 'accent' : 'default'" @click="animationStore.weightBrushFalloff = 'linear'">Linear</UiButton>
        <UiButton size="xs" :variant="animationStore.weightBrushFalloff === 'constant' ? 'accent' : 'default'" @click="animationStore.weightBrushFalloff = 'constant'">Hard</UiButton>
      </div>
      <label class="flex items-center justify-between text-[10px] cursor-pointer bg-ui-surface px-2 py-1 rounded-xs border border-ui-borderSubtle">
        <span>Normalize</span>
        <input type="checkbox" v-model="animationStore.weightAutoNormalize" class="accent-ui-accent" />
      </label>
      <label class="flex items-center justify-between text-[10px] cursor-pointer bg-ui-surface px-2 py-1 rounded-xs border border-ui-borderSubtle">
        <span>X mirror</span>
        <input type="checkbox" v-model="animationStore.weightXMirror" class="accent-ui-accent" />
      </label>
      <label class="flex items-center justify-between text-[10px] cursor-pointer bg-ui-surface px-2 py-1 rounded-xs border border-ui-borderSubtle">
        <span>Heatmap key</span>
        <input type="checkbox" v-model="animationStore.showHeatmapLegend" class="accent-ui-accent" />
      </label>
    </UiSection>

    <UiSection title="Utilities" :icon="Percent" :default-open="false">
      <div class="grid grid-cols-2 gap-1">
        <UiButton size="xs" :disabled="!selectedBone || !activeMesh" @click="handleFloodFillMesh">Fill mesh</UiButton>
        <UiButton size="xs" :disabled="!activeMesh" @click="handleSmoothMesh">Smooth</UiButton>
        <UiButton size="xs" :disabled="!activeMesh" @click="handleNormalizeAll">Normalize</UiButton>
        <UiButton size="xs" :disabled="!selectedBone || !activeMesh" @click="handleInvertWeights">Invert</UiButton>
        <UiButton size="xs" variant="danger" class="col-span-2" :disabled="!selectedBone || !activeMesh" @click="handleClearWeights">Clear bone</UiButton>
      </div>
    </UiSection>
  </div>
</template>
