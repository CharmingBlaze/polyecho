<script setup lang="ts">
import { computed } from 'vue'
import { useAnimationStore } from '../../stores/animationStore'
import { useProjectStore } from '../../stores/projectStore'
import { useToolStore } from '../../stores/toolStore'
import { inspectRig } from '../../core/animation/RiggingWorkflow'
import UiSection from '../ui/UiSection.vue'
import UiButton from '../ui/UiButton.vue'
import BlenderIcon from '../icons/BlenderIcon.vue'
import { 
  Trash2, 
  RotateCcw, 
  Wrench, 
  Plus, 
  Sliders,
  GitCommitVertical,
  Sparkles
} from 'lucide-vue-next'

const animationStore = useAnimationStore()
const projectStore = useProjectStore()
const toolStore = useToolStore()

const selectedBone = computed(() => animationStore.selectedBone)
const activeMesh = computed(() => projectStore.activeMesh)
const health = computed(() => inspectRig(activeMesh.value, animationStore.armature.bones))

const boneLength = computed({
  get: () => {
    if (!selectedBone.value) return 1.0
    const dx = selectedBone.value.tail.x - selectedBone.value.head.x
    const dy = selectedBone.value.tail.y - selectedBone.value.head.y
    const dz = selectedBone.value.tail.z - selectedBone.value.head.z
    return Number(Math.hypot(dx, dy, dz).toFixed(2))
  },
  set: (newLen: number) => {
    if (!selectedBone.value) return
    setBoneLength(selectedBone.value, newLen)
  }
})

function setBoneLength(bone: { head: { x: number; y: number; z: number }; tail: { x: number; y: number; z: number } }, newLen: number) {
  if (!Number.isFinite(newLen)) return
  if (newLen <= 0.05) newLen = 0.05
  const dx = bone.tail.x - bone.head.x
  const dy = bone.tail.y - bone.head.y
  const dz = bone.tail.z - bone.head.z
  const cur = Math.hypot(dx, dy, dz)
  if (cur < 1e-6) {
    bone.tail = { x: bone.head.x, y: bone.head.y + newLen, z: bone.head.z }
    return
  }
  const factor = newLen / cur
  bone.tail.x = Number((bone.head.x + dx * factor).toFixed(3))
  bone.tail.y = Number((bone.head.y + dy * factor).toFixed(3))
  bone.tail.z = Number((bone.head.z + dz * factor).toFixed(3))
}

function adjustBoneLength(delta: number) {
  if (!selectedBone.value) return
  projectStore.recordState('Change Bone Length')
  boneLength.value = Math.max(0.1, Number((boneLength.value + delta).toFixed(2)))
}

function handleReparent(parentBoneId: string) {
  if (!selectedBone.value) return
  animationStore.reparentBone(selectedBone.value.id, parentBoneId === 'root' ? null : parentBoneId)
}

function handleAddSocket() {
  if (!selectedBone.value) return
  animationStore.addSocket(selectedBone.value.id, `Socket_${Date.now().toString(36).slice(-3)}`)
}

function handleRemoveSocket(socketId: string) {
  if (!selectedBone.value) return
  animationStore.removeSocket(selectedBone.value.id, socketId)
}

function onRotationInput(axis: 'x' | 'y' | 'z', event: Event) {
  if (!selectedBone.value) return
  const value = Number((event.target as HTMLInputElement).value)
  if (!Number.isFinite(value)) return
  selectedBone.value.rotation[axis] = value
}

function startScrubVector(e: MouseEvent, targetObj: { x: number; y: number; z: number }, axis: 'x' | 'y' | 'z', step = 0.05, precision = 2) {
  e.preventDefault()
  projectStore.recordState(`Adjust ${axis.toUpperCase()}`)
  const startX = e.clientX
  const startVal = Number(targetObj[axis]) || 0

  const onMouseMove = (moveEvent: MouseEvent) => {
    const deltaX = moveEvent.clientX - startX
    const mult = moveEvent.shiftKey ? 0.1 : 1.0
    targetObj[axis] = Number((startVal + deltaX * step * mult).toFixed(precision))
  }

  const onMouseUp = () => {
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

function toggleIk(on: boolean) {
  if (!selectedBone.value) return
  projectStore.recordState('Toggle Inverse Kinematics')
  if (!selectedBone.value.ikConstraint) {
    selectedBone.value.ikConstraint = { enabled: on, chainLength: 2, iterations: 10, weight: 1 }
  } else {
    selectedBone.value.ikConstraint.enabled = on
  }
}

function toggleSpring(on: boolean) {
  if (!selectedBone.value) return
  projectStore.recordState('Toggle Spring')
  if (!selectedBone.value.springConstraint) {
    selectedBone.value.springConstraint = { enabled: on, stiffness: 0.3, damping: 0.25, gravity: 0 }
  } else {
    selectedBone.value.springConstraint.enabled = on
  }
}
</script>

<template>
  <div class="flex flex-col select-none text-xs font-sans">
    <div class="inspector-head">
      <div class="inspector-head-kicker">
        <BlenderIcon name="bone" :size="12" />
        <span>Bone</span>
      </div>
      <span class="inspector-head-name">{{ activeMesh?.name || selectedBone?.name || 'No object' }}</span>
    </div>

    <div class="px-2.5 py-1.5 border-b border-ui-borderSubtle">
      <div class="text-[10px] text-ui-textSecondary truncate">
        <span class="font-semibold text-ui-textPrimary">{{ selectedBone?.name || 'No bone' }}</span>
        <span class="text-ui-textMuted"> · {{ animationStore.isTestPoseActive ? 'Pose' : 'Edit rest' }}</span>
      </div>
    </div>

    <UiSection title="Mode" :icon="Sliders" :default-open="true">
      <div class="inspector-seg is-stretch">
        <button type="button" class="inspector-seg-btn" :class="{ 'is-active': !animationStore.isTestPoseActive }" @click="animationStore.toggleTestPose(false)">Edit rest</button>
        <button type="button" class="inspector-seg-btn" :class="{ 'is-active': animationStore.isTestPoseActive }" @click="animationStore.toggleTestPose(true)">Pose</button>
      </div>
      <UiButton v-if="animationStore.isTestPoseActive" size="xs" class="w-full" @click="animationStore.resetAllBonesToRest">
        <RotateCcw class="w-3 h-3" /> Reset pose
      </UiButton>
    </UiSection>

    <template v-if="selectedBone">
      <UiSection title="Identity" :icon="GitCommitVertical" :default-open="true">
        <input
          :value="selectedBone.name"
          aria-label="Bone name"
          @change="animationStore.renameBone(selectedBone.id, ($event.target as HTMLInputElement).value)"
          class="w-full bg-ui-input border border-ui-borderDefault rounded-xs px-2 py-1 text-xs"
        />
        <select
          :value="selectedBone.parentId || 'root'"
          class="inspector-select w-full"
          @change="handleReparent(($event.target as HTMLSelectElement).value)"
        >
          <option value="root" class="bg-ui-panel">None (root)</option>
          <option
            v-for="b in animationStore.armature.bones.filter(b => b.id !== selectedBone?.id)"
            :key="b.id"
            :value="b.id"
            class="bg-ui-panel"
          >{{ b.name }}</option>
        </select>
        <UiButton size="xs" variant="danger" class="w-full" @click="animationStore.deleteBone(selectedBone.id)">
          <Trash2 class="w-3 h-3" /> Delete
        </UiButton>
      </UiSection>

      <UiSection title="Rest" :icon="Sliders" :default-open="true">
        <div class="text-[9px] text-ui-textMuted">Head</div>
        <div class="grid grid-cols-3 gap-1">
          <div class="flex items-center bg-ui-input border border-ui-borderSubtle rounded-xs px-1">
            <span class="text-[9px] text-rose-400 cursor-ew-resize" @mousedown="startScrubVector($event, selectedBone.head, 'x')">X</span>
            <input type="number" step="0.1" @focus="projectStore.recordState('Edit Joint Position')" v-model.number="selectedBone.head.x" class="w-full bg-transparent text-right font-mono text-[10px] py-0.5" />
          </div>
          <div class="flex items-center bg-ui-input border border-ui-borderSubtle rounded-xs px-1">
            <span class="text-[9px] text-emerald-400 cursor-ew-resize" @mousedown="startScrubVector($event, selectedBone.head, 'y')">Y</span>
            <input type="number" step="0.1" @focus="projectStore.recordState('Edit Joint Position')" v-model.number="selectedBone.head.y" class="w-full bg-transparent text-right font-mono text-[10px] py-0.5" />
          </div>
          <div class="flex items-center bg-ui-input border border-ui-borderSubtle rounded-xs px-1">
            <span class="text-[9px] text-sky-400 cursor-ew-resize" @mousedown="startScrubVector($event, selectedBone.head, 'z')">Z</span>
            <input type="number" step="0.1" @focus="projectStore.recordState('Edit Joint Position')" v-model.number="selectedBone.head.z" class="w-full bg-transparent text-right font-mono text-[10px] py-0.5" />
          </div>
        </div>
        <div class="text-[9px] text-ui-textMuted">Tail</div>
        <div class="grid grid-cols-3 gap-1">
          <div class="flex items-center bg-ui-input border border-ui-borderSubtle rounded-xs px-1">
            <span class="text-[9px] text-rose-400 cursor-ew-resize" @mousedown="startScrubVector($event, selectedBone.tail, 'x')">X</span>
            <input type="number" step="0.1" @focus="projectStore.recordState('Edit Joint Position')" v-model.number="selectedBone.tail.x" class="w-full bg-transparent text-right font-mono text-[10px] py-0.5" />
          </div>
          <div class="flex items-center bg-ui-input border border-ui-borderSubtle rounded-xs px-1">
            <span class="text-[9px] text-emerald-400 cursor-ew-resize" @mousedown="startScrubVector($event, selectedBone.tail, 'y')">Y</span>
            <input type="number" step="0.1" @focus="projectStore.recordState('Edit Joint Position')" v-model.number="selectedBone.tail.y" class="w-full bg-transparent text-right font-mono text-[10px] py-0.5" />
          </div>
          <div class="flex items-center bg-ui-input border border-ui-borderSubtle rounded-xs px-1">
            <span class="text-[9px] text-sky-400 cursor-ew-resize" @mousedown="startScrubVector($event, selectedBone.tail, 'z')">Z</span>
            <input type="number" step="0.1" @focus="projectStore.recordState('Edit Joint Position')" v-model.number="selectedBone.tail.z" class="w-full bg-transparent text-right font-mono text-[10px] py-0.5" />
          </div>
        </div>
        <div class="flex items-center justify-between text-[10px] text-ui-textMuted">
          <span>Length</span>
          <span class="font-mono text-ui-textPrimary">{{ boneLength }}</span>
        </div>
        <input type="range" aria-label="Bone length" min="0.1" max="5" step="0.05" @pointerdown="projectStore.recordState('Change Bone Length')" @keydown="projectStore.recordState('Change Bone Length')" v-model.number="boneLength" class="inspector-range" />
        <div class="grid grid-cols-4 gap-1">
          <UiButton size="xs" @click="adjustBoneLength(-0.1)">−</UiButton>
          <UiButton size="xs" @click="adjustBoneLength(0.1)">+</UiButton>
          <UiButton size="xs" @click="projectStore.recordState('Change Bone Length'); boneLength = 1">1</UiButton>
          <UiButton size="xs" @click="projectStore.recordState('Change Bone Length'); boneLength = 2">2</UiButton>
        </div>
      </UiSection>

      <UiSection title="Inverse kinematics (IK)" :icon="Sparkles" :default-open="false">
        <label class="flex items-center justify-between text-[10px] cursor-pointer bg-ui-surface px-2 py-1 rounded-xs border border-ui-borderSubtle">
          <span>Enabled</span>
          <input
            type="checkbox"
            :checked="selectedBone.ikConstraint?.enabled || false"
            class="accent-ui-accent"
            @change="toggleIk(($event.target as HTMLInputElement).checked)"
          />
        </label>
        <p class="text-[9px] text-ui-textMuted leading-snug">Solved after keys. Drag in Pose to set the target.</p>
        <template v-if="selectedBone.ikConstraint?.enabled">
          <div class="flex justify-between text-[10px] text-ui-textMuted">
            <span>Chain</span>
            <span class="font-mono text-ui-textPrimary">{{ selectedBone.ikConstraint.chainLength }}</span>
          </div>
          <input type="range" min="2" max="6" step="1" v-model.number="selectedBone.ikConstraint.chainLength" class="inspector-range" />
          <label class="text-[9px] text-ui-textMuted">Target</label>
          <select
            :value="selectedBone.ikConstraint.targetBoneId || ''"
            class="inspector-select w-full"
            @change="selectedBone.ikConstraint!.targetBoneId = ($event.target as HTMLSelectElement).value || undefined"
          >
            <option value="" class="bg-ui-panel">Viewport target / last pose</option>
            <option v-for="b in animationStore.armature.bones.filter(b => b.id !== selectedBone?.id)" :key="b.id" :value="b.id" class="bg-ui-panel">{{ b.name }}</option>
          </select>
          <label class="text-[9px] text-ui-textMuted">Pole (bend direction)</label>
          <select
            :value="selectedBone.ikConstraint.poleTargetBoneId || ''"
            class="inspector-select w-full"
            @change="selectedBone.ikConstraint!.poleTargetBoneId = ($event.target as HTMLSelectElement).value || undefined"
          >
            <option value="" class="bg-ui-panel">No pole</option>
            <option v-for="b in animationStore.armature.bones.filter(b => b.id !== selectedBone?.id)" :key="b.id" :value="b.id" class="bg-ui-panel">{{ b.name }}</option>
          </select>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <div class="flex justify-between text-[9px] text-ui-textMuted"><span>Iterations</span><span>{{ selectedBone.ikConstraint.iterations || 10 }}</span></div>
              <input v-model.number="selectedBone.ikConstraint.iterations" type="range" min="1" max="32" step="1" class="inspector-range" title="Higher values improve longer-chain IK convergence" />
            </div>
            <div>
              <div class="flex justify-between text-[9px] text-ui-textMuted"><span>Influence</span><span>{{ Math.round((selectedBone.ikConstraint.weight ?? 1) * 100) }}%</span></div>
              <input v-model.number="selectedBone.ikConstraint.weight" type="range" min="0" max="1" step="0.05" class="inspector-range" title="Blend between the keyed pose and the IK solve" />
            </div>
          </div>
        </template>
      </UiSection>

      <UiSection title="Sockets" :icon="Wrench" :badge="selectedBone.sockets?.length || 0" :default-open="false">
        <UiButton size="xs" class="w-full" @click="handleAddSocket"><Plus class="w-3 h-3" /> Add</UiButton>
        <div v-for="s in selectedBone.sockets || []" :key="s.id" class="flex items-center gap-1">
          <input v-model="s.name" class="flex-1 bg-ui-input border border-ui-borderSubtle rounded-xs px-1.5 py-0.5 text-[10px] text-ui-textPrimary" />
          <button type="button" class="text-ui-textMuted hover:text-rose-400" @click="handleRemoveSocket(s.id)"><Trash2 class="w-3 h-3" /></button>
        </div>
      </UiSection>

      <UiSection title="Spring" :icon="Sparkles" :default-open="false">
        <label class="flex items-center justify-between text-[10px] cursor-pointer bg-ui-surface px-2 py-1 rounded-xs border border-ui-borderSubtle">
          <span>Jiggle</span>
          <input
            type="checkbox"
            :checked="selectedBone.springConstraint?.enabled || false"
            class="accent-ui-accent"
            @change="toggleSpring(($event.target as HTMLInputElement).checked)"
          />
        </label>
        <template v-if="selectedBone.springConstraint?.enabled">
          <div class="flex justify-between text-[10px] text-ui-textMuted"><span>Stiff</span><span class="font-mono">{{ selectedBone.springConstraint.stiffness }}</span></div>
          <input type="range" min="0.05" max="1" step="0.05" v-model.number="selectedBone.springConstraint.stiffness" class="inspector-range" />
          <div class="flex justify-between text-[10px] text-ui-textMuted"><span>Damp</span><span class="font-mono">{{ selectedBone.springConstraint.damping }}</span></div>
          <input type="range" min="0.05" max="1" step="0.05" v-model.number="selectedBone.springConstraint.damping" class="inspector-range" />
          <div class="flex justify-between text-[10px] text-ui-textMuted"><span>Gravity</span><span class="font-mono">{{ selectedBone.springConstraint.gravity }}</span></div>
          <input type="range" min="0" max="1" step="0.05" v-model.number="selectedBone.springConstraint.gravity" class="inspector-range" />
        </template>
      </UiSection>
    </template>

    <UiSection title="Test" :icon="RotateCcw" :default-open="false">
      <p class="text-[10px] text-ui-textMuted leading-snug">Temporary pose. No keyframes are recorded.</p>
      <p class="text-[10px] text-ui-textSecondary">{{ health.ready ? 'Binding checks passed' : 'Before you animate' }}</p>
      <p v-if="health.unweighted" class="text-[10px] text-ui-textSecondary">{{ health.unweighted }} vertices have no bone influence.</p>
      <p v-if="health.invalid" class="text-[10px] text-ui-textSecondary">{{ health.invalid }} vertices have invalid or unnormalized weights.</p>
      <p v-if="health.brokenBones" class="text-[10px] text-ui-textSecondary">{{ health.brokenBones }} bones need length or parent fixed.</p>
      <p v-if="health.rigid" class="text-[10px] text-ui-textMuted">Solid attachment found.</p>
      <template v-if="selectedBone && animationStore.isTestPoseActive">
        <p class="text-[10px] text-ui-textMuted truncate">{{ selectedBone.name }}</p>
        <div class="flex justify-between text-[10px] text-ui-textMuted"><span>X</span><span class="font-mono inspector-value">{{ Math.round(selectedBone.rotation.x) }}°</span></div>
        <input type="range" min="-90" max="90" step="1" :value="selectedBone.rotation.x" aria-label="Test rotation X" class="inspector-range" @input="onRotationInput('x', $event)" />
        <div class="flex justify-between text-[10px] text-ui-textMuted"><span>Y</span><span class="font-mono inspector-value">{{ Math.round(selectedBone.rotation.y) }}°</span></div>
        <input type="range" min="-90" max="90" step="1" :value="selectedBone.rotation.y" aria-label="Test rotation Y" class="inspector-range" @input="onRotationInput('y', $event)" />
        <div class="flex justify-between text-[10px] text-ui-textMuted"><span>Z</span><span class="font-mono inspector-value">{{ Math.round(selectedBone.rotation.z) }}°</span></div>
        <input type="range" min="-90" max="90" step="1" :value="selectedBone.rotation.z" aria-label="Test rotation Z" class="inspector-range" @input="onRotationInput('z', $event)" />
      </template>
      <div class="grid grid-cols-2 gap-1">
        <UiButton size="xs" :disabled="!animationStore.armature.bones.length" @click="animationStore.resetAllBonesToRest()">Reset pose</UiButton>
        <UiButton size="xs" variant="accent" :disabled="!animationStore.armature.bones.length" @click="toolStore.setAppMode('animate')">Animation</UiButton>
      </div>
    </UiSection>
  </div>
</template>
