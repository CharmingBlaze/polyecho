<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAnimationStore } from '../../stores/animationStore'
import { useProjectStore } from '../../stores/projectStore'
import { useToolStore } from '../../stores/toolStore'
import BlenderIcon from '../icons/BlenderIcon.vue'
import { 
  Link, 
  Unlink, 
  Sparkles, 
  Scissors, 
  Check, 
  Layers, 
  Box, 
  Activity 
} from 'lucide-vue-next'

const animationStore = useAnimationStore()
const projectStore = useProjectStore()
const toolStore = useToolStore()

const bindingType = ref<'rigid_vertex' | 'object' | 'smooth_vertex'>('rigid_vertex')
const splitBoundary = ref<boolean>(false)
const lastActionMessage = ref<string>('')

const activeMesh = computed(() => projectStore.activeMesh)
const selectedBone = computed(() => animationStore.selectedBone)

const selectionDescription = computed(() => {
  if (!activeMesh.value) return 'No mesh selected'
  if (toolStore.selectMode === 'face' && projectStore.selectedFaceIds.length > 0) {
    const vertSet = new Set<string>()
    for (const f of activeMesh.value.faces) {
      if (projectStore.selectedFaceIds.includes(f.id)) {
        f.vertexIds.forEach(id => vertSet.add(id))
      }
    }
    return `${projectStore.selectedFaceIds.length} faces (${vertSet.size} vertices)`
  }
  if (toolStore.selectMode === 'vertex' && projectStore.selectedVertexIds.length > 0) {
    return `${projectStore.selectedVertexIds.length} vertices`
  }
  if (toolStore.selectMode === 'edge' && projectStore.selectedEdgeIds.length > 0) {
    return `${projectStore.selectedEdgeIds.length} edges`
  }
  return `1 object (${activeMesh.value.name})`
})

const boundMeshes = computed(() => {
  if (!selectedBone.value) return []
  return projectStore.meshes.filter(m => m.parentId === selectedBone.value?.id)
})

const boundVerticesCount = computed(() => {
  if (!selectedBone.value || !activeMesh.value) return 0
  const bId = selectedBone.value.id
  return activeMesh.value.vertices.filter(v => v.boneWeights && v.boneWeights[bId] && v.boneWeights[bId] > 0.001).length
})

function handleBind() {
  if (!selectedBone.value) {
    lastActionMessage.value = 'Please select a target bone first'
    return
  }
  projectStore.recordState('Bind Selected Geometry')
  const res = animationStore.bindSelectedGeometry(bindingType.value, selectedBone.value.id, {
    splitBoundary: splitBoundary.value
  })
  lastActionMessage.value = res.message
  setTimeout(() => { lastActionMessage.value = '' }, 3000)
}

function handleUnbind() {
  if (!activeMesh.value) return
  projectStore.recordState('Unbind Geometry')
  animationStore.unbindGeometry(activeMesh.value.id, selectedBone.value?.id)
  lastActionMessage.value = `Unbound ${activeMesh.value.name}`
  setTimeout(() => { lastActionMessage.value = '' }, 3000)
}
</script>

<template>
  <div class="h-full w-full bg-ui-panel p-3 text-ui-textPrimary flex flex-col space-y-3 font-mono text-xs select-none overflow-y-auto">
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-ui-borderSubtle pb-2">
      <div class="flex items-center gap-1.5">
        <Link class="w-3.5 h-3.5 text-ui-accent" />
        <span class="text-[11px] font-bold uppercase tracking-wider text-ui-textAccent">Geometry Bindings</span>
      </div>
      <span v-if="lastActionMessage" class="text-[10px] text-emerald-400 font-bold truncate max-w-[160px]">
        {{ lastActionMessage }}
      </span>
    </div>

    <!-- Active Bone & Geometry Target Selection Status -->
    <div class="grid grid-cols-2 gap-2">
      <!-- Target Bone -->
      <div class="bg-ui-surface p-2 rounded-xs border border-ui-borderSubtle space-y-1">
        <span class="text-[10px] text-ui-textMuted font-bold uppercase">Target Bone</span>
        <div v-if="selectedBone" class="flex items-center gap-1.5 text-ui-textPrimary font-bold truncate">
          <BlenderIcon name="bone" :size="12" color="#f59e0b" />
          <span class="truncate">{{ selectedBone.name }}</span>
        </div>
        <div v-else class="text-rose-400/80 text-[10px] italic">
          None selected
        </div>
      </div>

      <!-- Selected Geometry -->
      <div class="bg-ui-surface p-2 rounded-xs border border-ui-borderSubtle space-y-1">
        <span class="text-[10px] text-ui-textMuted font-bold uppercase">Selected Geometry</span>
        <div class="text-ui-textPrimary font-bold truncate text-[11px]">
          {{ selectionDescription }}
        </div>
      </div>
    </div>

    <!-- Binding Mode Selection -->
    <div class="bg-ui-surface p-2.5 rounded-xs border border-ui-borderSubtle space-y-2">
      <span class="text-[10px] text-ui-textMuted font-bold uppercase">Binding Type</span>
      <div class="grid grid-cols-3 gap-1">
        <button 
          @click="bindingType = 'rigid_vertex'"
          class="p-2 rounded-xs border text-left flex flex-col gap-1 transition"
          :class="bindingType === 'rigid_vertex' ? 'bg-ui-active border-ui-accent text-ui-textAccent shadow-xs' : 'bg-ui-input border-ui-borderSubtle text-ui-textSecondary hover:bg-ui-hover'"
        >
          <div class="flex items-center gap-1 font-bold text-[10px]">
            <Layers class="w-3 h-3 text-amber-400" />
            <span>Rigid (100%)</span>
          </div>
          <span class="text-[8px] text-ui-textMuted leading-tight">Low-poly vertex lock</span>
        </button>

        <button 
          @click="bindingType = 'object'"
          class="p-2 rounded-xs border text-left flex flex-col gap-1 transition"
          :class="bindingType === 'object' ? 'bg-ui-active border-ui-accent text-ui-textAccent shadow-xs' : 'bg-ui-input border-ui-borderSubtle text-ui-textSecondary hover:bg-ui-hover'"
        >
          <div class="flex items-center gap-1 font-bold text-[10px]">
            <Box class="w-3 h-3 text-sky-400" />
            <span>Object</span>
          </div>
          <span class="text-[8px] text-ui-textMuted leading-tight">Whole piece attachment</span>
        </button>

        <button 
          @click="bindingType = 'smooth_vertex'"
          class="p-2 rounded-xs border text-left flex flex-col gap-1 transition"
          :class="bindingType === 'smooth_vertex' ? 'bg-ui-active border-ui-accent text-ui-textAccent shadow-xs' : 'bg-ui-input border-ui-borderSubtle text-ui-textSecondary hover:bg-ui-hover'"
        >
          <div class="flex items-center gap-1 font-bold text-[10px]">
            <Sparkles class="w-3 h-3 text-purple-400" />
            <span>Smooth</span>
          </div>
          <span class="text-[8px] text-ui-textMuted leading-tight">Auto proximity weights</span>
        </button>
      </div>

      <!-- Boundary Split Seam Checkbox (Low-Poly Flagship Feature) -->
      <label v-if="bindingType === 'rigid_vertex'" class="flex items-center gap-2 pt-1 border-t border-ui-borderSubtle cursor-pointer text-[10px] text-ui-textSecondary">
        <input type="checkbox" v-model="splitBoundary" class="rounded-xs bg-ui-input border-ui-borderSubtle text-ui-accent focus:ring-0" />
        <span class="flex items-center gap-1">
          <Scissors class="w-3 h-3 text-amber-400" />
          <span>Split Boundary Seam (for mechanical joints)</span>
        </span>
      </label>
    </div>

    <!-- Action Buttons -->
    <div class="flex items-center gap-2">
      <button 
        @click="handleBind"
        class="flex-1 py-2 px-3 bg-ui-accent hover:bg-ui-accentHover text-white rounded-xs font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition"
        :disabled="!selectedBone"
      >
        <Check class="w-3.5 h-3.5" />
        <span>Bind Selected (Ctrl+B)</span>
      </button>

      <button 
        @click="handleUnbind"
        class="py-2 px-3 bg-ui-surface hover:bg-rose-950/60 hover:text-rose-300 text-ui-textMuted border border-ui-borderSubtle rounded-xs font-bold text-xs flex items-center justify-center gap-1 transition"
        title="Unbind selected geometry from bone"
      >
        <Unlink class="w-3.5 h-3.5" />
        <span>Unbind</span>
      </button>
    </div>

    <!-- Active Bone Current Bindings Outliner -->
    <div v-if="selectedBone" class="bg-ui-surface p-2.5 rounded-xs border border-ui-borderSubtle space-y-1.5">
      <span class="text-[10px] text-ui-textMuted font-bold uppercase flex items-center justify-between">
        <span>Active Bindings: {{ selectedBone.name }}</span>
        <span class="text-ui-textAccent">{{ boundVerticesCount }} Verts · {{ boundMeshes.length }} Objects</span>
      </span>

      <div class="space-y-1 max-h-32 overflow-y-auto text-[10px]">
        <div v-if="boundVerticesCount > 0" class="flex items-center justify-between px-2 py-1 bg-ui-input rounded-xs border border-ui-borderSubtle text-emerald-400">
          <span class="flex items-center gap-1.5">
            <Activity class="w-3 h-3" />
            <span>{{ boundVerticesCount }} Skinned Vertices ({{ activeMesh?.name }})</span>
          </span>
          <span class="text-[9px] text-ui-textMuted font-bold">Rigid 1.0</span>
        </div>

        <div v-for="m in boundMeshes" :key="m.id" class="flex items-center justify-between px-2 py-1 bg-ui-input rounded-xs border border-ui-borderSubtle text-sky-300">
          <span class="flex items-center gap-1.5 truncate">
            <Box class="w-3 h-3" />
            <span class="truncate">{{ m.name }}</span>
          </span>
          <span class="text-[9px] text-ui-textMuted font-bold">Object</span>
        </div>

        <div v-if="boundVerticesCount === 0 && boundMeshes.length === 0" class="py-2 text-center text-ui-textMuted italic text-[10px]">
          No geometry currently bound to this bone.
        </div>
      </div>
    </div>
  </div>
</template>
