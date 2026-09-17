<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useAnimationStore } from '../../stores/animationStore'
import { useProjectStore } from '../../stores/projectStore'
import { useToolStore } from '../../stores/toolStore'
import { resolveMeshBoneParentId } from '../../core/animation/Armature'
import UiSection from '../ui/UiSection.vue'
import UiButton from '../ui/UiButton.vue'
import { 
  Sparkles, 
  Scissors, 
  Check, 
  Layers, 
  Box, 
  Activity
} from 'lucide-vue-next'
import BlenderIcon from '../icons/BlenderIcon.vue'

const animationStore = useAnimationStore()
const projectStore = useProjectStore()
const toolStore = useToolStore()

// Target Selection Mode
const targetMode = ref<'object' | 'vertices' | 'edges' | 'faces' | 'all_vertices'>('object')

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
  if (toolStore.selectMode === 'vertex') targetMode.value = 'vertices'
  else if (toolStore.selectMode === 'edge') targetMode.value = 'edges'
  else if (toolStore.selectMode === 'face') targetMode.value = 'faces'
  else targetMode.value = 'object'
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
  animationStore.unbindGeometry(activeMesh.value.id, selectedBone.value?.id)
  showActionMessage(`Unbound ${activeMesh.value.name}`)
}

function setTarget(mode: 'object' | 'vertices' | 'edges' | 'faces' | 'all_vertices') {
  targetMode.value = mode
  if (mode === 'faces') toolStore.setSelectMode('face')
  else if (mode === 'edges') toolStore.setSelectMode('edge')
  else if (mode === 'vertices' || mode === 'all_vertices') toolStore.setSelectMode('vertex')
  else toolStore.setSelectMode('bone')
}

function handleAutoSmoothAll() {
  if (!activeMesh.value) return
  projectStore.recordState('Auto-Calculate Smooth Skinning')
  animationStore.autoWeightMeshToBones(activeMesh.value)
  showActionMessage(`Skinning computed for ${activeMesh.value.name}`)
}

function handleRigidAttach() {
  if (!selectedBone.value) {
    showActionMessage('Select a target bone first')
    return
  }
  showActionMessage(animationStore.bindSelectedGeometry('object', selectedBone.value.id).message)
}
</script>

<template>
  <div class="flex flex-col select-none text-xs font-sans">
    <div class="inspector-head">
      <div class="inspector-head-kicker">
        <BlenderIcon name="link" :size="12" />
        <span>Bind</span>
      </div>
      <span class="inspector-head-name">{{ activeMesh?.name || selectedBone?.name || 'No object' }}</span>
    </div>

    <div class="px-2.5 py-1.5 border-b border-ui-borderSubtle">
      <div class="text-[10px] text-ui-textSecondary truncate">
        <span class="font-semibold text-ui-textPrimary">{{ selectedBone ? selectedBone.name : 'No bone' }}</span>
        <span class="text-ui-textMuted"> · {{ lastActionMessage || selectionCountDescription }}</span>
      </div>
    </div>

    <UiSection title="Automatic" :icon="Sparkles" :default-open="true">
      <select v-model="animationStore.autoSkinMethod" aria-label="Skinning method" class="inspector-select w-full">
        <option value="surface">Surface smoothing</option>
        <option value="distance">Distance blend</option>
      </select>
      <p class="text-[10px] text-ui-textMuted leading-snug">Blends up to four nearby bones per vertex. Replaces this model's weights.</p>
      <UiButton size="xs" class="w-full" variant="accent" :disabled="!activeMesh?.vertices.length || !animationStore.armature.bones.length" @click="handleAutoSmoothAll">
        {{ animationStore.armature.bones.length ? 'Attach with automatic weights' : 'Add bones first' }}
      </UiButton>
    </UiSection>

    <UiSection title="Rigid" :icon="Box" :default-open="false">
      <p class="text-[10px] text-ui-textMuted leading-snug">Whole piece follows one bone. Replaces painted weights.</p>
      <select aria-label="Attachment bone" :value="animationStore.selectedBoneId || ''" class="inspector-select w-full" @change="animationStore.selectBone(($event.target as HTMLSelectElement).value)">
        <option value="" disabled>Choose a bone</option>
        <option v-for="bone in animationStore.armature.bones" :key="bone.id" :value="bone.id">{{ bone.name }}</option>
      </select>
      <UiButton size="xs" class="w-full" :disabled="!activeMesh || !selectedBone" @click="handleRigidAttach">Attach to selected bone</UiButton>
    </UiSection>

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
      <div class="flex flex-wrap gap-1">
        <button type="button" class="inspector-chip" :class="{ 'is-active': targetMode === 'object' }" @click="setTarget('object')">Object</button>
        <button type="button" class="inspector-chip" :class="{ 'is-active': targetMode === 'faces' }" @click="setTarget('faces')">Faces</button>
        <button type="button" class="inspector-chip" :class="{ 'is-active': targetMode === 'vertices' }" @click="setTarget('vertices')">Verts</button>
        <button type="button" class="inspector-chip" :class="{ 'is-active': targetMode === 'edges' }" @click="setTarget('edges')">Edges</button>
        <button type="button" class="inspector-chip" :class="{ 'is-active': targetMode === 'all_vertices' }" @click="setTarget('all_vertices')">All verts</button>
      </div>
    </UiSection>

    <UiSection title="Method" :icon="Sparkles" :default-open="true">
      <div class="inspector-seg is-stretch">
        <button type="button" class="inspector-seg-btn" :class="{ 'is-active': bindingAlgorithm === 'rigid' }" @click="bindingAlgorithm = 'rigid'">Rigid</button>
        <button type="button" class="inspector-seg-btn" :class="{ 'is-active': bindingAlgorithm === 'smooth' }" @click="bindingAlgorithm = 'smooth'">Smooth</button>
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
      <div class="inspector-seg is-stretch">
        <button v-for="w in [1, 0.75, 0.5, 0.25]" :key="w" type="button" class="inspector-seg-btn" :class="{ 'is-active': customWeight === w }" @click="customWeight = w">{{ Math.round(w * 100) }}</button>
      </div>
      <div class="inspector-seg is-stretch">
        <button type="button" class="inspector-seg-btn" :class="{ 'is-active': weightMode === 'replace' }" @click="weightMode = 'replace'">Replace</button>
        <button type="button" class="inspector-seg-btn" :class="{ 'is-active': weightMode === 'add' }" @click="weightMode = 'add'">Add</button>
      </div>
      <label class="flex items-center justify-between text-[10px] cursor-pointer bg-ui-surface px-2 py-1 rounded-xs border border-ui-borderSubtle">
        <span class="flex items-center gap-1"><Scissors class="w-3 h-3" /> Split hinge</span>
        <input type="checkbox" v-model="splitBoundary" class="accent-ui-accent" />
      </label>
    </UiSection>

    <UiSection v-if="selectedBone" title="On this bone" :icon="Activity" :badge="boundVerticesCount + boundMeshes.length" :default-open="true">
      <div v-if="boundVerticesCount > 0" class="text-[10px] text-ui-textSecondary">{{ boundVerticesCount }} skinned verts</div>
      <div v-for="m in boundMeshes" :key="m.id" class="text-[10px] text-ui-textPrimary truncate">{{ m.name }} · object</div>
      <p v-if="boundVerticesCount === 0 && boundMeshes.length === 0" class="text-[9px] text-ui-textMuted">Nothing bound yet.</p>
    </UiSection>
  </div>
</template>
