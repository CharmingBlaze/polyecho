<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useAnimationStore } from '../../stores/animationStore'
import { useProjectStore } from '../../stores/projectStore'
import { useToolStore } from '../../stores/toolStore'
import { resolveMeshBoneParentId } from '../../core/animation/Armature'
import UiSection from '../ui/UiSection.vue'
import UiButton from '../ui/UiButton.vue'
import { 
  Link, 
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
watch(() => toolStore.selectMode, syncTargetWithMode)

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
  return projectStore.meshes.filter(m => resolveMeshBoneParentId(m, animationStore.armature.bones) === selectedBone.value?.id)
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
  <div class="flex flex-col select-none text-xs font-sans">
    <div class="h-7 bg-ui-header border-b border-ui-borderSubtle px-2.5 flex items-center justify-between">
      <div class="flex items-center space-x-1.5">
        <Link class="w-3 h-3 text-amber-400" />
        <span class="text-[11px] font-medium text-ui-textMuted">Bind</span>
      </div>
      <span class="font-semibold text-ui-textPrimary truncate max-w-[140px] text-[11px]">
        {{ lastActionMessage || selectedBone?.name || 'No bone' }}
      </span>
    </div>

    <UiSection title="Use on" :icon="Check" hint="Ctrl+B" :default-open="true">
      <p class="text-[9px] text-ui-textMuted leading-snug">
        {{ selectedBone ? selectedBone.name : 'Select a bone' }} ← {{ selectionCountDescription }}
      </p>
      <div class="grid grid-cols-2 gap-1">
        <UiButton size="xs" variant="primary" :disabled="!selectedBone || !activeMesh" @click="handleBind">
          Bind
        </UiButton>
        <UiButton size="xs" variant="danger" :disabled="!activeMesh" @click="handleUnbind">
          Unbind
        </UiButton>
      </div>
    </UiSection>

    <UiSection title="Target" :icon="Box" :default-open="true">
      <div class="grid grid-cols-3 gap-1">
        <UiButton size="xs" :variant="targetMode === 'object' ? 'accent' : 'default'" @click="targetMode = 'object'">Object</UiButton>
        <UiButton size="xs" :variant="targetMode === 'faces' ? 'accent' : 'default'" @click="targetMode = 'faces'">Faces</UiButton>
        <UiButton size="xs" :variant="targetMode === 'vertices' ? 'accent' : 'default'" @click="targetMode = 'vertices'">Verts</UiButton>
        <UiButton size="xs" :variant="targetMode === 'edges' ? 'accent' : 'default'" @click="targetMode = 'edges'">Edges</UiButton>
        <UiButton size="xs" class="col-span-2" :variant="targetMode === 'all_vertices' ? 'accent' : 'default'" @click="targetMode = 'all_vertices'">All verts</UiButton>
      </div>
    </UiSection>

    <UiSection title="Method" :icon="Sparkles" :default-open="true">
      <div class="grid grid-cols-2 gap-1">
        <UiButton size="xs" :variant="bindingAlgorithm === 'rigid' ? 'accent' : 'default'" @click="bindingAlgorithm = 'rigid'">Rigid</UiButton>
        <UiButton size="xs" :variant="bindingAlgorithm === 'smooth' ? 'accent' : 'default'" @click="bindingAlgorithm = 'smooth'">Smooth</UiButton>
      </div>
      <UiButton v-if="bindingAlgorithm === 'smooth'" size="xs" class="w-full" :disabled="!activeMesh" @click="handleAutoSmoothAll">
        Auto-weight all bones
      </UiButton>
    </UiSection>

    <UiSection v-if="bindingAlgorithm === 'rigid' && targetMode !== 'object'" title="Weight" :icon="Layers" :default-open="false">
      <div class="flex items-center justify-between text-[10px] text-ui-textMuted">
        <span>Influence</span>
        <span class="font-mono text-ui-textPrimary">{{ Math.round(customWeight * 100) }}%</span>
      </div>
      <div class="grid grid-cols-4 gap-1">
        <UiButton v-for="w in [1, 0.75, 0.5, 0.25]" :key="w" size="xs" :variant="customWeight === w ? 'accent' : 'default'" @click="customWeight = w">
          {{ Math.round(w * 100) }}
        </UiButton>
      </div>
      <div class="grid grid-cols-2 gap-1">
        <UiButton size="xs" :variant="weightMode === 'replace' ? 'accent' : 'default'" @click="weightMode = 'replace'">Replace</UiButton>
        <UiButton size="xs" :variant="weightMode === 'add' ? 'accent' : 'default'" @click="weightMode = 'add'">Add</UiButton>
      </div>
      <label class="flex items-center justify-between text-[10px] cursor-pointer bg-ui-surface px-2 py-1 rounded-xs border border-ui-borderSubtle">
        <span class="flex items-center gap-1"><Scissors class="w-3 h-3" /> Split hinge</span>
        <input type="checkbox" v-model="splitBoundary" class="accent-amber-500" />
      </label>
    </UiSection>

    <UiSection v-if="selectedBone" title="On this bone" :icon="Activity" :badge="boundVerticesCount + boundMeshes.length" :default-open="true">
      <div v-if="boundVerticesCount > 0" class="text-[10px] text-ui-textSecondary">{{ boundVerticesCount }} skinned verts</div>
      <div v-for="m in boundMeshes" :key="m.id" class="text-[10px] text-sky-300 truncate">{{ m.name }} · object</div>
      <p v-if="boundVerticesCount === 0 && boundMeshes.length === 0" class="text-[9px] text-ui-textMuted">Nothing bound yet.</p>
    </UiSection>
  </div>
</template>
