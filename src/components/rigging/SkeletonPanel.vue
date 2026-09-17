<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAnimationStore } from '../../stores/animationStore'
import { useProjectStore } from '../../stores/projectStore'
import { useToolStore } from '../../stores/toolStore'
import UiSection from '../ui/UiSection.vue'
import UiButton from '../ui/UiButton.vue'
import BoneTreeNode from './BoneTreeNode.vue'
import { fitRigPreset, rigPresets, type RigPresetId } from '../../core/animation/RiggingWorkflow'
import BlenderIcon from '../icons/BlenderIcon.vue'
import { 
  Plus, 
  Trash2, 
  FolderTree, 
  Wrench,
  Crosshair,
  GitBranch,
  FlipHorizontal,
  GitCommitVertical,
  ExternalLink,
  Link,
  Eye
} from 'lucide-vue-next'

const animationStore = useAnimationStore()
const projectStore = useProjectStore()
const toolStore = useToolStore()
const preset = ref<RigPresetId>('human')
const activeMesh = computed(() => projectStore.activeMesh)

const rootBones = computed(() => {
  return animationStore.armature.bones.filter(b => !b.parentId)
})

const selectedBone = computed(() => animationStore.selectedBone)
const selectedSocket = computed(() => animationStore.selectedSocket)

function handleAddRoot() {
  projectStore.recordState('Add Root Bone')
  const mesh = projectStore.activeMesh
  let head = { x: 0, y: 0, z: 0 }
  let tail = { x: 0, y: 1.2, z: 0 }
  if (mesh && mesh.vertices.length > 0) {
    const joint = fitRigPreset(mesh, 'single')[0]
    head = { x: joint.head[0], y: joint.head[1], z: joint.head[2] }
    tail = { x: joint.tail[0], y: joint.tail[1], z: joint.tail[2] }
  }
  const bone = animationStore.addBoneFromPoints(head, tail, null, `Bone_Root_${animationStore.armature.bones.length + 1}`)
  animationStore.selectedBoneId = bone.id
}

function handleExtrude() {
  if (!animationStore.selectedBoneId) {
    handleAddRoot()
    return
  }
  animationStore.extrudeBone(animationStore.selectedBoneId)
}

function handleToggleDrawBone() {
  animationStore.clickToPlaceMode = !animationStore.clickToPlaceMode
}

function handleRemoveSocket(boneId: string, socketId: string) {
  animationStore.removeSocket(boneId, socketId)
  if (animationStore.selectedSocketId === socketId) {
    animationStore.selectedSocketId = null
  }
}

function handleSymmetrize() {
  animationStore.symmetrizeArmature()
}

function handleReparent(boneId: string, parentBoneId: string) {
  animationStore.reparentBone(boneId, parentBoneId === 'root' ? null : parentBoneId)
}

function handleAttachActiveMeshToSocket(socketId: string) {
  if (!projectStore.activeMesh) return
  projectStore.recordState('Attach Mesh to Socket')
  projectStore.activeMesh.parentId = socketId
}

function addPreset() {
  if (!activeMesh.value) return
  animationStore.addRigPreset(activeMesh.value.id, preset.value)
}
</script>

<template>
  <div class="flex flex-col select-none text-xs font-sans">
    <div class="inspector-head">
      <div class="inspector-head-kicker">
        <BlenderIcon name="armature" :size="12" />
        <span>Skeleton</span>
      </div>
      <span class="inspector-head-name">{{ activeMesh?.name || 'No object' }}</span>
    </div>

    <div class="px-2.5 py-1.5 border-b border-ui-borderSubtle">
      <div class="text-[10px] text-ui-textSecondary truncate">
        <span class="font-semibold text-ui-textPrimary">{{ animationStore.armature.bones.length }}</span>
        <span class="text-ui-textMuted"> {{ animationStore.armature.bones.length === 1 ? 'bone' : 'bones' }}</span>
      </div>
    </div>

    <UiSection title="Starter" :icon="FolderTree" :default-open="true">
      <p class="text-[10px] text-ui-textMuted leading-snug">Fit a skeleton to the mesh, or draw joints in the viewport.</p>
      <div class="grid grid-cols-2 gap-1">
        <UiButton size="xs" @click="animationStore.showRigFitPopup = false; animationStore.showHumanoidRigWizard = true">Humanoid</UiButton>
        <UiButton size="xs" @click="animationStore.showRigFitPopup = true">Guided fit</UiButton>
      </div>
      <div class="flex flex-wrap gap-1">
        <button
          v-for="item in rigPresets"
          :key="item.id"
          type="button"
          class="inspector-chip"
          :class="{ 'is-active': preset === item.id }"
          :title="item.description"
          :aria-pressed="preset === item.id"
          @click="preset = item.id"
        >{{ item.name }}</button>
      </div>
      <UiButton size="xs" class="w-full" variant="accent" :disabled="!activeMesh?.vertices.length" @click="addPreset">Add fitted skeleton</UiButton>
    </UiSection>

    <UiSection title="Add" :icon="Plus" hint="E · B" :default-open="true">
      <div class="grid grid-cols-2 gap-1">
        <UiButton size="xs" @click="handleAddRoot">
          <Plus class="w-3 h-3" /> Add root
        </UiButton>
        <UiButton size="xs" :active="animationStore.clickToPlaceMode" @click="handleToggleDrawBone">
          <Crosshair class="w-3 h-3" /> Draw
        </UiButton>
        <UiButton size="xs" @click="handleExtrude">
          <GitBranch class="w-3 h-3" /> Extend joint
        </UiButton>
        <UiButton size="xs" @click="handleSymmetrize">
          <FlipHorizontal class="w-3 h-3" /> Mirror X
        </UiButton>
      </div>
      <p class="text-[9px] text-ui-textMuted leading-snug">Draw places in the viewport. First bone can auto-weight; later clicks only add joints.</p>
    </UiSection>

    <UiSection title="Display" :icon="Eye" :default-open="false">
      <label class="block text-[11px] text-ui-textMuted">Bone size <input v-model.number="animationStore.boneDisplaySize" aria-label="Bone display size" type="range" min="0.5" max="2" step="0.1" class="inspector-range" /></label>
      <p class="text-[10px] text-ui-textMuted">Blue: left · rose: right · amber: selected</p>
      <label class="flex items-center justify-between text-[10px] cursor-pointer bg-ui-surface px-2 py-1 rounded-xs border border-ui-borderSubtle">
        <span>Show bones</span>
        <input type="checkbox" :checked="animationStore.showBones" class="accent-ui-accent" @change="animationStore.setShowBones(($event.target as HTMLInputElement).checked)" />
      </label>
      <label class="flex items-center justify-between text-[10px] cursor-pointer bg-ui-surface px-2 py-1 rounded-xs border border-ui-borderSubtle">
        <span>X-Ray mesh (Alt+Z)</span>
        <input type="checkbox" v-model="toolStore.viewport.xray" class="accent-ui-accent" />
      </label>
      <label class="flex items-center justify-between text-[10px] cursor-pointer bg-ui-surface px-2 py-1 rounded-xs border border-ui-borderSubtle">
        <span>X-ray bones</span>
        <input type="checkbox" v-model="animationStore.xrayBones" class="accent-ui-accent" />
      </label>
    </UiSection>

    <UiSection
      v-if="animationStore.armature.bones.length === 0"
      title="Hierarchy"
      :icon="GitCommitVertical"
      :default-open="true"
    >
      <p class="text-[10px] text-ui-textMuted leading-snug">No bones yet. Add one at the mesh, or Draw in the viewport.</p>
    </UiSection>

    <UiSection
      v-else
      title="Hierarchy"
      :icon="GitCommitVertical"
      :badge="selectedSocket ? selectedSocket.socket.name : (selectedBone?.name || '')"
      :default-open="true"
    >
      <template #actions>
        <button
          type="button"
          class="p-0.5 text-ui-textMuted hover:text-ui-textPrimary rounded-xs hover:bg-ui-hover"
          title="Pop-out hierarchy (H)"
          @click.stop="animationStore.toggleBoneHierarchyPopout(true)"
        >
          <ExternalLink class="w-3 h-3" />
        </button>
      </template>
      <div class="bg-ui-input/50 rounded-xs border border-ui-borderSubtle p-1 space-y-0.5 overflow-y-auto max-h-[280px]">
        <BoneTreeNode v-for="root in rootBones" :key="root.id" :bone-id="root.id" />

      </div>

    </UiSection>

    <UiSection v-if="selectedSocket" title="Socket" :icon="Wrench" :default-open="true">
      <div class="flex items-center justify-between text-[10px]">
        <span class="text-ui-textPrimary truncate">{{ selectedSocket.socket.name }} · {{ selectedSocket.bone.name }}</span>
        <button type="button" class="text-ui-textMuted hover:text-rose-400" @click="handleRemoveSocket(selectedSocket.bone.id, selectedSocket.socket.id)">
          <Trash2 class="w-3 h-3" />
        </button>
      </div>
      <div class="grid grid-cols-3 gap-1">
        <input type="number" step="0.1" v-model.number="selectedSocket.socket.position.x" class="w-full bg-ui-input px-1 py-0.5 text-right rounded-xs border border-ui-borderSubtle font-mono text-[10px]" title="X" />
        <input type="number" step="0.1" v-model.number="selectedSocket.socket.position.y" class="w-full bg-ui-input px-1 py-0.5 text-right rounded-xs border border-ui-borderSubtle font-mono text-[10px]" title="Y" />
        <input type="number" step="0.1" v-model.number="selectedSocket.socket.position.z" class="w-full bg-ui-input px-1 py-0.5 text-right rounded-xs border border-ui-borderSubtle font-mono text-[10px]" title="Z" />
      </div>
      <UiButton v-if="projectStore.activeMesh" size="xs" class="w-full" @click="handleAttachActiveMeshToSocket(selectedSocket.socket.id)">
        <Link class="w-3 h-3" /> Attach mesh
      </UiButton>
    </UiSection>

    <UiSection v-else-if="selectedBone" title="Parent" :icon="GitBranch" :default-open="true">
      <select
        :value="selectedBone.parentId || 'root'"
        class="inspector-select w-full"
        @change="handleReparent(selectedBone.id, ($event.target as HTMLSelectElement).value)"
      >
        <option value="root" class="bg-ui-panel text-ui-textMuted">None (root)</option>
        <option
          v-for="b in animationStore.armature.bones.filter(b => b.id !== selectedBone?.id)"
          :key="b.id"
          :value="b.id"
          class="bg-ui-panel"
        >{{ b.name }}</option>
      </select>
      <p class="text-[9px] text-ui-textMuted">Rest pose, IK, and spring are in joint settings below.</p>
    </UiSection>
  </div>
</template>
