<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAnimationStore } from '../../stores/animationStore'
import { useProjectStore } from '../../stores/projectStore'
import { 
  Percent, 
  Trash2, 
  Layers,
  GitCommitVertical
} from 'lucide-vue-next'

const animationStore = useAnimationStore()
const projectStore = useProjectStore()

const activeMesh = computed(() => projectStore.activeMesh)
const selectedBone = computed(() => animationStore.selectedBone)
const selectedVertexIds = computed(() => projectStore.selectedVertexIds)

const customWeight = ref<number>(1.0)

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

function handleAssign100() {
  if (!activeMesh.value || !selectedBone.value || selectedVertexIds.value.length === 0) return
  projectStore.recordState('Assign 100% Bone Weight')
  animationStore.assignRigidVertices(activeMesh.value.id, selectedVertexIds.value, selectedBone.value.id)
}

function handleAssignCustomWeight() {
  if (!activeMesh.value || !selectedBone.value || selectedVertexIds.value.length === 0) return
  projectStore.recordState('Assign Bone Weight')
  animationStore.assignVertexWeight(activeMesh.value.id, selectedVertexIds.value, selectedBone.value.id, customWeight.value)
}

function handleRemoveWeight(boneId: string) {
  if (!activeMesh.value || selectedVertexIds.value.length === 0) return
  projectStore.recordState('Remove Bone Weight')
  animationStore.assignVertexWeight(activeMesh.value.id, selectedVertexIds.value, boneId, 0)
}

function handleNormalize() {
  if (!activeMesh.value || selectedVertexIds.value.length === 0) return
  projectStore.recordState('Normalize Vertex Weights')
  animationStore.normalizeVertexWeights(activeMesh.value.id, selectedVertexIds.value)
}
</script>

<template>
  <div class="h-full w-full bg-ui-panel p-3 text-ui-textPrimary flex flex-col space-y-3 font-sans text-xs select-none overflow-y-auto">
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-ui-borderSubtle pb-2">
      <div class="flex items-center gap-1.5 font-semibold text-ui-textPrimary">
        <Percent class="w-3.5 h-3.5 text-ui-accent" />
        <span class="text-[11px] uppercase tracking-wider text-ui-textMuted font-bold">Vertex Weights</span>
      </div>
      <span class="text-[10px] text-ui-textMuted font-medium">
        {{ selectedVertexIds.length }} Vertices Selected
      </span>
    </div>

    <!-- Active Bone Quick Assign 100% -->
    <div v-if="selectedBone" class="bg-ui-surface/60 p-2.5 rounded-xs border border-ui-borderSubtle space-y-2">
      <div class="flex items-center justify-between text-[11px]">
        <span class="text-[10px] text-ui-textMuted font-semibold uppercase">Active Bone</span>
        <span class="text-ui-textAccent font-semibold truncate max-w-[140px]">{{ selectedBone.name }}</span>
      </div>

      <button 
        @click="handleAssign100"
        :disabled="selectedVertexIds.length === 0"
        class="w-full py-1.5 px-2.5 bg-ui-accent hover:bg-ui-accentHover text-white rounded-xs font-semibold text-[11px] flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Layers class="w-3.5 h-3.5" />
        <span>Assign 100% Rigid Weight</span>
      </button>

      <!-- Custom Weight Slider -->
      <div class="space-y-1.5 pt-1.5 border-t border-ui-borderSubtle/60">
        <div class="flex items-center justify-between text-[10px] text-ui-textMuted">
          <span>Custom Influence</span>
          <span class="text-ui-textAccent font-semibold font-mono">{{ (customWeight * 100).toFixed(0) }}%</span>
        </div>
        <div class="flex items-center gap-2">
          <input 
            type="range" 
            min="0" 
            max="1" 
            step="0.05" 
            v-model.number="customWeight"
            class="flex-1 accent-ui-accent h-1 bg-ui-input rounded-xs cursor-pointer"
          />
          <button 
            @click="handleAssignCustomWeight"
            :disabled="selectedVertexIds.length === 0"
            class="px-2 py-0.5 bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle text-ui-textPrimary rounded-xs text-[10px] font-semibold transition cursor-pointer disabled:opacity-40"
          >
            Apply
          </button>
        </div>
      </div>
    </div>

    <!-- Influences Table for Selected Vertices -->
    <div class="bg-ui-surface/60 p-2.5 rounded-xs border border-ui-borderSubtle space-y-2 flex-1 flex flex-col min-h-0">
      <div class="flex items-center justify-between text-[10px]">
        <span class="text-ui-textMuted font-semibold uppercase tracking-wider">Influences Table</span>
        <button 
          @click="handleNormalize"
          :disabled="selectedVertexIds.length === 0"
          class="text-ui-textAccent hover:underline font-semibold cursor-pointer disabled:opacity-40"
        >
          Normalize All
        </button>
      </div>

      <div class="space-y-1 overflow-y-auto flex-1 max-h-48 text-[11px]">
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

        <div v-if="aggregateWeights.length === 0" class="py-6 text-center text-ui-textMuted italic text-[11px]">
          {{ selectedVertexIds.length === 0 ? 'Select vertices to inspect weights' : 'No bone weights assigned yet' }}
        </div>
      </div>
    </div>
  </div>
</template>
