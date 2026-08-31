<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from 'vue'
import { useAnimationStore } from '../../stores/animationStore'
import { useProjectStore } from '../../stores/projectStore'
import { useToolStore } from '../../stores/toolStore'
import { 
  Link, 
  Unlink, 
  Sparkles, 
  Scissors, 
  Check, 
  Layers, 
  Box, 
  Activity,
  GitCommitVertical,
  Dot,
  Minus,
  Maximize2
} from 'lucide-vue-next'

const animationStore = useAnimationStore()
const projectStore = useProjectStore()
const toolStore = useToolStore()

// Target Selection Mode
const targetMode = ref<'object' | 'vertices' | 'edges' | 'faces' | 'all_vertices'>('faces')

// Binding Algorithm & Weight
const bindingAlgorithm = ref<'rigid' | 'smooth'>('rigid')
const customWeight = ref<number>(1.0)
const weightMode = ref<'replace' | 'add'>('replace')
const splitBoundary = ref<boolean>(false)
const lastActionMessage = ref<string>('')
let messageTimer: ReturnType<typeof setTimeout> | null = null

function showActionMessage(msg: string) {
  lastActionMessage.value = msg
  if (messageTimer !== null) clearTimeout(messageTimer)
  messageTimer = setTimeout(() => {
    lastActionMessage.value = ''
    messageTimer = null
  }, 3500)
}

onBeforeUnmount(() => {
  if (messageTimer !== null) {
    clearTimeout(messageTimer)
    messageTimer = null
  }
})

const activeMesh = computed(() => projectStore.activeMesh)
const selectedBone = computed(() => animationStore.selectedBone)

// Sync targetMode with current toolStore.selectMode
function syncTargetWithMode() {
  if (toolStore.selectMode === 'object') targetMode.value = 'object'
  else if (toolStore.selectMode === 'vertex') targetMode.value = 'vertices'
  else if (toolStore.selectMode === 'edge') targetMode.value = 'edges'
  else if (toolStore.selectMode === 'face') targetMode.value = 'faces'
}
syncTargetWithMode()

const selectionCountDescription = computed(() => {
  if (!activeMesh.value) return 'No mesh selected'
  if (targetMode.value === 'object') {
    return `${activeMesh.value.name} (Object)`
  }
  if (targetMode.value === 'faces') {
    return `${projectStore.selectedFaceIds.length} Faces selected`
  }
  if (targetMode.value === 'edges') {
    return `${projectStore.selectedEdgeIds.length} Edges selected`
  }
  if (targetMode.value === 'vertices') {
    return `${projectStore.selectedVertexIds.length} Vertices selected`
  }
  return `All ${activeMesh.value.vertices.length} Vertices`
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
    lastActionMessage.value = 'Select a target bone first'
    return
  }
  projectStore.recordState('Bind Geometry to Bone')
  
  let targetType: any = targetMode.value
  if (bindingAlgorithm.value === 'smooth') {
    targetType = 'smooth_auto'
  }

  const res = animationStore.bindSelectedGeometry(targetType, selectedBone.value.id, {
    weight: customWeight.value,
    splitBoundary: splitBoundary.value,
    mode: weightMode.value
  })

  showActionMessage(res.message)
}

function handleUnbind() {
  if (!activeMesh.value) return
  projectStore.recordState('Unbind Geometry')
  animationStore.unbindGeometry(activeMesh.value.id, selectedBone.value?.id)
  showActionMessage(`Unbound ${activeMesh.value.name}`)
}

function handleAutoSmoothAll() {
  if (!activeMesh.value) return
  projectStore.recordState('Auto-Calculate Smooth Skinning')
  animationStore.autoWeightMeshToBones(activeMesh.value)
  showActionMessage(`Skinning computed for ${activeMesh.value.name}`)
}
</script>

<template>
  <div class="h-full w-full bg-ui-panel p-3 text-ui-textPrimary flex flex-col space-y-3 font-sans text-xs select-none overflow-y-auto">
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-ui-borderSubtle pb-2">
      <div class="flex items-center gap-1.5 text-ui-textPrimary font-semibold">
        <Link class="w-3.5 h-3.5 text-ui-accent" />
        <span class="text-[11px] uppercase tracking-wider text-ui-textMuted font-bold">Geometry Bindings & Parenting</span>
      </div>
      <span v-if="lastActionMessage" class="text-[10px] text-emerald-400 font-medium truncate max-w-[180px]">
        {{ lastActionMessage }}
      </span>
    </div>

    <!-- Active Bone & Mesh Status -->
    <div class="grid grid-cols-2 gap-2 text-[11px]">
      <div class="bg-ui-surface/60 p-2 rounded-xs border border-ui-borderSubtle space-y-1">
        <div class="text-[10px] uppercase font-semibold text-ui-textMuted">Target Bone</div>
        <div v-if="selectedBone" class="flex items-center gap-1.5 font-medium text-ui-textPrimary truncate">
          <GitCommitVertical class="w-3.5 h-3.5 text-ui-accent shrink-0" />
          <span class="truncate">{{ selectedBone.name }}</span>
        </div>
        <div v-else class="text-rose-400/80 text-[11px] italic">
          None selected
        </div>
      </div>

      <div class="bg-ui-surface/60 p-2 rounded-xs border border-ui-borderSubtle space-y-1">
        <div class="text-[10px] uppercase font-semibold text-ui-textMuted">Selected Mesh</div>
        <div class="font-medium text-ui-textPrimary truncate">
          {{ activeMesh ? activeMesh.name : 'No mesh selected' }}
        </div>
      </div>
    </div>

    <!-- 1. Geometry Target Selection Mode (Objects, Vertices, Edges, Faces) -->
    <div class="bg-ui-surface/60 p-2.5 rounded-xs border border-ui-borderSubtle space-y-2">
      <div class="flex items-center justify-between text-[10px]">
        <span class="uppercase font-semibold text-ui-textMuted tracking-wider">1. Parent / Bind Target</span>
        <span class="text-ui-textAccent font-medium">{{ selectionCountDescription }}</span>
      </div>

      <div class="grid grid-cols-5 gap-1 text-[10px]">
        <button 
          @click="targetMode = 'object'"
          class="py-1.5 px-1 rounded-xs border font-medium flex flex-col items-center gap-1 transition cursor-pointer"
          :class="targetMode === 'object' ? 'bg-ui-active border-ui-accent text-ui-textAccent shadow-xs' : 'bg-ui-input/70 border-ui-borderSubtle text-ui-textSecondary hover:bg-ui-hover'"
          title="Parent entire mesh object as a rigid node"
        >
          <Box class="w-3.5 h-3.5 text-sky-400" />
          <span>Object</span>
        </button>

        <button 
          @click="targetMode = 'faces'"
          class="py-1.5 px-1 rounded-xs border font-medium flex flex-col items-center gap-1 transition cursor-pointer"
          :class="targetMode === 'faces' ? 'bg-ui-active border-ui-accent text-ui-textAccent shadow-xs' : 'bg-ui-input/70 border-ui-borderSubtle text-ui-textSecondary hover:bg-ui-hover'"
          title="Bind vertices belonging to selected faces"
        >
          <Layers class="w-3.5 h-3.5 text-amber-400" />
          <span>Faces</span>
        </button>

        <button 
          @click="targetMode = 'edges'"
          class="py-1.5 px-1 rounded-xs border font-medium flex flex-col items-center gap-1 transition cursor-pointer"
          :class="targetMode === 'edges' ? 'bg-ui-active border-ui-accent text-ui-textAccent shadow-xs' : 'bg-ui-input/70 border-ui-borderSubtle text-ui-textSecondary hover:bg-ui-hover'"
          title="Bind vertices belonging to selected edges"
        >
          <Minus class="w-3.5 h-3.5 text-emerald-400" />
          <span>Edges</span>
        </button>

        <button 
          @click="targetMode = 'vertices'"
          class="py-1.5 px-1 rounded-xs border font-medium flex flex-col items-center gap-1 transition cursor-pointer"
          :class="targetMode === 'vertices' ? 'bg-ui-active border-ui-accent text-ui-textAccent shadow-xs' : 'bg-ui-input/70 border-ui-borderSubtle text-ui-textSecondary hover:bg-ui-hover'"
          title="Bind selected individual vertices"
        >
          <Dot class="w-3.5 h-3.5 text-rose-400" />
          <span>Vertices</span>
        </button>

        <button 
          @click="targetMode = 'all_vertices'"
          class="py-1.5 px-1 rounded-xs border font-medium flex flex-col items-center gap-1 transition cursor-pointer"
          :class="targetMode === 'all_vertices' ? 'bg-ui-active border-ui-accent text-ui-textAccent shadow-xs' : 'bg-ui-input/70 border-ui-borderSubtle text-ui-textSecondary hover:bg-ui-hover'"
          title="Bind every vertex in this mesh to the target bone"
        >
          <Maximize2 class="w-3.5 h-3.5 text-purple-400" />
          <span>All Verts</span>
        </button>
      </div>
    </div>

    <!-- 2. Binding Algorithm & Influence Weight -->
    <div class="bg-ui-surface/60 p-2.5 rounded-xs border border-ui-borderSubtle space-y-2">
      <div class="text-[10px] uppercase font-semibold text-ui-textMuted tracking-wider">2. Binding Algorithm & Options</div>

      <div class="grid grid-cols-2 gap-1.5">
        <button 
          @click="bindingAlgorithm = 'rigid'"
          class="p-2 rounded-xs border text-left flex flex-col gap-1 transition cursor-pointer"
          :class="bindingAlgorithm === 'rigid' ? 'bg-ui-active border-ui-accent text-ui-textAccent shadow-xs' : 'bg-ui-input/60 border-ui-borderSubtle text-ui-textSecondary hover:bg-ui-hover'"
        >
          <div class="flex items-center gap-1.5 font-semibold text-[11px]">
            <Layers class="w-3.5 h-3.5 text-amber-400" />
            <span>Rigid Weight</span>
          </div>
          <span class="text-[9px] text-ui-textMuted leading-snug">Low-poly vertex lock</span>
        </button>

        <button 
          @click="bindingAlgorithm = 'smooth'"
          class="p-2 rounded-xs border text-left flex flex-col gap-1 transition cursor-pointer"
          :class="bindingAlgorithm === 'smooth' ? 'bg-ui-active border-ui-accent text-ui-textAccent shadow-xs' : 'bg-ui-input/60 border-ui-borderSubtle text-ui-textSecondary hover:bg-ui-hover'"
        >
          <div class="flex items-center gap-1.5 font-semibold text-[11px]">
            <Sparkles class="w-3.5 h-3.5 text-purple-400" />
            <span>Smooth Skinning</span>
          </div>
          <span class="text-[9px] text-ui-textMuted leading-snug">Distance falloff</span>
        </button>
      </div>

      <!-- Weight & Options Controls -->
      <div v-if="bindingAlgorithm === 'rigid' && targetMode !== 'object'" class="space-y-2 pt-1">
        <!-- Weight Percentage Presets -->
        <div class="space-y-1">
          <div class="flex items-center justify-between text-[10px] text-ui-textMuted">
            <span>Influence Weight:</span>
            <span class="text-ui-textAccent font-bold font-mono">{{ Math.round(customWeight * 100) }}%</span>
          </div>
          <div class="grid grid-cols-4 gap-1">
            <button 
              v-for="w in [1.0, 0.75, 0.5, 0.25]" 
              :key="w"
              @click="customWeight = w"
              class="py-1 rounded-xs border text-[10px] font-medium transition cursor-pointer"
              :class="customWeight === w ? 'bg-ui-active border-ui-accent text-ui-textAccent font-bold' : 'bg-ui-input/70 border-ui-borderSubtle text-ui-textSecondary hover:bg-ui-hover'"
            >
              {{ Math.round(w * 100) }}%
            </button>
          </div>
        </div>

        <!-- Mode: Replace vs Add -->
        <div class="flex items-center justify-between text-[10px] pt-1">
          <span class="text-ui-textMuted">Weight Application:</span>
          <div class="flex items-center gap-1">
            <button 
              @click="weightMode = 'replace'"
              class="px-2 py-0.5 rounded-xs border text-[10px] transition cursor-pointer"
              :class="weightMode === 'replace' ? 'bg-ui-active border-ui-accent text-ui-textAccent font-bold' : 'bg-ui-input border-ui-borderSubtle text-ui-textMuted'"
            >
              Replace
            </button>
            <button 
              @click="weightMode = 'add'"
              class="px-2 py-0.5 rounded-xs border text-[10px] transition cursor-pointer"
              :class="weightMode === 'add' ? 'bg-ui-active border-ui-accent text-ui-textAccent font-bold' : 'bg-ui-input border-ui-borderSubtle text-ui-textMuted'"
            >
              Additive
            </button>
          </div>
        </div>

        <!-- Mechanical Hinge Seam Split Option -->
        <label class="flex items-center gap-2 pt-1 border-t border-ui-borderSubtle/60 cursor-pointer text-[11px] text-ui-textSecondary hover:text-ui-textPrimary transition">
          <input type="checkbox" v-model="splitBoundary" class="rounded-xs bg-ui-input border-ui-borderDefault text-ui-accent focus:ring-0 cursor-pointer" />
          <span class="flex items-center gap-1.5">
            <Scissors class="w-3.5 h-3.5 text-amber-400" />
            <span>Split boundary seam vertices (for mechanical joints)</span>
          </span>
        </label>
      </div>
    </div>

    <!-- 3. Action Buttons -->
    <div class="space-y-1.5 pt-1">
      <div class="flex items-center gap-2">
        <button 
          @click="handleBind"
          class="flex-1 py-2 px-3 bg-ui-accent hover:bg-ui-accentHover text-white rounded-xs font-semibold text-xs flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="!selectedBone || !activeMesh"
        >
          <Check class="w-3.5 h-3.5" />
          <span>Bind to {{ selectedBone ? selectedBone.name : 'Bone' }}</span>
          <span class="text-[10px] opacity-75 font-mono">(Ctrl+B)</span>
        </button>

        <button 
          @click="handleUnbind"
          class="py-2 px-3 bg-ui-input hover:bg-rose-950/40 hover:text-rose-300 text-ui-textSecondary border border-ui-borderSubtle rounded-xs font-medium text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
          title="Unbind selected geometry / mesh from bone"
          :disabled="!activeMesh"
        >
          <Unlink class="w-3.5 h-3.5" />
          <span>Unbind</span>
        </button>
      </div>

      <button 
        v-if="bindingAlgorithm === 'smooth'"
        @click="handleAutoSmoothAll"
        class="w-full py-1.5 px-3 bg-purple-950/40 hover:bg-purple-900/50 text-purple-300 border border-purple-500/40 rounded-xs font-semibold text-[11px] flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
        :disabled="!activeMesh"
      >
        <Sparkles class="w-3.5 h-3.5 text-purple-400" />
        <span>Auto-Calculate Smooth Weights for All Bones</span>
      </button>
    </div>

    <!-- 4. Active Bone Current Bindings Outliner -->
    <div v-if="selectedBone" class="bg-ui-surface/60 p-2.5 rounded-xs border border-ui-borderSubtle space-y-1.5">
      <div class="text-[10px] text-ui-textMuted font-semibold uppercase flex items-center justify-between">
        <span>Active Bindings: {{ selectedBone.name }}</span>
        <span class="text-ui-textAccent font-medium">{{ boundVerticesCount }} Verts · {{ boundMeshes.length }} Meshes</span>
      </div>

      <div class="space-y-1 max-h-36 overflow-y-auto text-[11px]">
        <div v-if="boundVerticesCount > 0" class="flex items-center justify-between px-2 py-1 bg-ui-input/70 rounded-xs border border-ui-borderSubtle text-emerald-400">
          <span class="flex items-center gap-1.5">
            <Activity class="w-3 h-3" />
            <span>{{ boundVerticesCount }} Skinned Vertices</span>
          </span>
          <span class="text-[9px] text-ui-textMuted font-mono font-semibold">Vertex Weights</span>
        </div>

        <div v-for="m in boundMeshes" :key="m.id" class="flex items-center justify-between px-2 py-1 bg-ui-input/70 rounded-xs border border-ui-borderSubtle text-sky-300">
          <span class="flex items-center gap-1.5 truncate">
            <Box class="w-3 h-3" />
            <span class="truncate">{{ m.name }}</span>
          </span>
          <span class="text-[9px] text-ui-textMuted font-semibold">Object Node</span>
        </div>

        <div v-if="boundVerticesCount === 0 && boundMeshes.length === 0" class="py-2 text-center text-ui-textMuted italic text-[11px]">
          No geometry bound to this bone yet.
        </div>
      </div>
    </div>
  </div>
</template>
