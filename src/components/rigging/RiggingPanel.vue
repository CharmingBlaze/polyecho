<script setup lang="ts">
import { computed } from 'vue'
import { useAnimationStore } from '../../stores/animationStore'
import { useProjectStore } from '../../stores/projectStore'
import UiSection from '../ui/UiSection.vue'
import UiButton from '../ui/UiButton.vue'
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

const selectedBone = computed(() => animationStore.selectedBone)

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
  if (newLen <= 0.05) newLen = 0.05
  const dx = bone.tail.x - bone.head.x
  const dy = bone.tail.y - bone.head.y
  const dz = bone.tail.z - bone.head.z
  const cur = Math.hypot(dx, dy, dz) || 1.0
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
  const bone = selectedBone.value
  if (bone.id === parentBoneId) return

  if (bone.parentId) {
    const oldP = animationStore.armature.bones.find(b => b.id === bone.parentId)
    if (oldP) {
      oldP.childrenIds = oldP.childrenIds.filter(id => id !== bone.id)
    }
  } else {
    animationStore.armature.rootBoneIds = animationStore.armature.rootBoneIds.filter(id => id !== bone.id)
  }

  if (parentBoneId === 'root') {
    bone.parentId = null
    animationStore.armature.rootBoneIds.push(bone.id)
  } else {
    bone.parentId = parentBoneId
    const newP = animationStore.armature.bones.find(b => b.id === parentBoneId)
    if (newP && !newP.childrenIds.includes(bone.id)) {
      newP.childrenIds.push(bone.id)
    }
  }
}

function handleAddSocket() {
  if (!selectedBone.value) return
  projectStore.recordState('Add Socket')
  animationStore.addSocket(selectedBone.value.id, `Socket_${Date.now().toString(36).slice(-3)}`)
}

function handleRemoveSocket(socketId: string) {
  if (!selectedBone.value) return
  projectStore.recordState('Remove Socket')
  animationStore.removeSocket(selectedBone.value.id, socketId)
}

function startScrubVector(e: MouseEvent, targetObj: { x: number; y: number; z: number }, axis: 'x' | 'y' | 'z', step = 0.05, precision = 2) {
  e.preventDefault()
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
    projectStore.recordState(`Adjust ${axis.toUpperCase()}`)
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

function toggleIk(on: boolean) {
  if (!selectedBone.value) return
  if (!selectedBone.value.ikConstraint) {
    selectedBone.value.ikConstraint = { enabled: on, chainLength: 2, iterations: 10, weight: 1 }
  } else {
    selectedBone.value.ikConstraint.enabled = on
  }
}

function toggleSpring(on: boolean) {
  if (!selectedBone.value) return
  if (!selectedBone.value.springConstraint) {
    selectedBone.value.springConstraint = { enabled: on, stiffness: 0.3, damping: 0.25, gravity: 0 }
  } else {
    selectedBone.value.springConstraint.enabled = on
  }
}
</script>

<template>
  <div class="flex flex-col select-none text-xs font-sans">
    <div class="h-7 bg-ui-header border-b border-ui-borderSubtle px-2.5 flex items-center justify-between">
      <div class="flex items-center space-x-1.5">
        <Sliders class="w-3 h-3 text-amber-400" />
        <span class="text-[11px] font-medium text-ui-textMuted">Bone</span>
      </div>
      <span class="font-semibold text-ui-textPrimary truncate max-w-[150px] text-[11px]">
        {{ selectedBone?.name || 'None selected' }}
      </span>
    </div>

    <UiSection title="Mode" :icon="Sliders" :default-open="true">
      <div class="grid grid-cols-2 gap-1">
        <UiButton size="xs" :variant="!animationStore.isTestPoseActive ? 'accent' : 'default'" @click="animationStore.toggleTestPose(false)">Edit rest</UiButton>
        <UiButton size="xs" :variant="animationStore.isTestPoseActive ? 'accent' : 'default'" @click="animationStore.toggleTestPose(true)">Pose</UiButton>
      </div>
      <UiButton v-if="animationStore.isTestPoseActive" size="xs" class="w-full" @click="animationStore.resetAllBonesToRest">
        <RotateCcw class="w-3 h-3" /> Reset pose
      </UiButton>
    </UiSection>

    <template v-if="selectedBone">
      <UiSection title="Identity" :icon="GitCommitVertical" :default-open="true">
        <input
          v-model="selectedBone.name"
          class="w-full bg-ui-input border border-ui-borderDefault rounded-xs px-2 py-1 text-xs"
        />
        <select
          :value="selectedBone.parentId || 'root'"
          class="w-full bg-ui-input border border-ui-borderDefault rounded-xs px-2 py-1 text-xs cursor-pointer"
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
            <input type="number" step="0.1" v-model.number="selectedBone.head.x" class="w-full bg-transparent text-right font-mono text-[10px] py-0.5" />
          </div>
          <div class="flex items-center bg-ui-input border border-ui-borderSubtle rounded-xs px-1">
            <span class="text-[9px] text-emerald-400 cursor-ew-resize" @mousedown="startScrubVector($event, selectedBone.head, 'y')">Y</span>
            <input type="number" step="0.1" v-model.number="selectedBone.head.y" class="w-full bg-transparent text-right font-mono text-[10px] py-0.5" />
          </div>
          <div class="flex items-center bg-ui-input border border-ui-borderSubtle rounded-xs px-1">
            <span class="text-[9px] text-sky-400 cursor-ew-resize" @mousedown="startScrubVector($event, selectedBone.head, 'z')">Z</span>
            <input type="number" step="0.1" v-model.number="selectedBone.head.z" class="w-full bg-transparent text-right font-mono text-[10px] py-0.5" />
          </div>
        </div>
        <div class="text-[9px] text-ui-textMuted">Tail</div>
        <div class="grid grid-cols-3 gap-1">
          <div class="flex items-center bg-ui-input border border-ui-borderSubtle rounded-xs px-1">
            <span class="text-[9px] text-rose-400 cursor-ew-resize" @mousedown="startScrubVector($event, selectedBone.tail, 'x')">X</span>
            <input type="number" step="0.1" v-model.number="selectedBone.tail.x" class="w-full bg-transparent text-right font-mono text-[10px] py-0.5" />
          </div>
          <div class="flex items-center bg-ui-input border border-ui-borderSubtle rounded-xs px-1">
            <span class="text-[9px] text-emerald-400 cursor-ew-resize" @mousedown="startScrubVector($event, selectedBone.tail, 'y')">Y</span>
            <input type="number" step="0.1" v-model.number="selectedBone.tail.y" class="w-full bg-transparent text-right font-mono text-[10px] py-0.5" />
          </div>
          <div class="flex items-center bg-ui-input border border-ui-borderSubtle rounded-xs px-1">
            <span class="text-[9px] text-sky-400 cursor-ew-resize" @mousedown="startScrubVector($event, selectedBone.tail, 'z')">Z</span>
            <input type="number" step="0.1" v-model.number="selectedBone.tail.z" class="w-full bg-transparent text-right font-mono text-[10px] py-0.5" />
          </div>
        </div>
        <div class="flex items-center justify-between text-[10px] text-ui-textMuted">
          <span>Length</span>
          <span class="font-mono text-ui-textPrimary">{{ boneLength }}</span>
        </div>
        <input type="range" min="0.1" max="5" step="0.05" v-model.number="boneLength" class="w-full accent-ui-accent h-1" />
        <div class="grid grid-cols-4 gap-1">
          <UiButton size="xs" @click="adjustBoneLength(-0.1)">−</UiButton>
          <UiButton size="xs" @click="adjustBoneLength(0.1)">+</UiButton>
          <UiButton size="xs" @click="boneLength = 1">1</UiButton>
          <UiButton size="xs" @click="boneLength = 2">2</UiButton>
        </div>
      </UiSection>

      <UiSection title="IK" :icon="Sparkles" hint="Pose drag" :default-open="true">
        <label class="flex items-center justify-between text-[10px] cursor-pointer bg-ui-surface px-2 py-1 rounded-xs border border-ui-borderSubtle">
          <span>Enabled</span>
          <input
            type="checkbox"
            :checked="selectedBone.ikConstraint?.enabled || false"
            class="accent-amber-500"
            @change="toggleIk(($event.target as HTMLInputElement).checked)"
          />
        </label>
        <p class="text-[9px] text-ui-textMuted leading-snug">Solved after keys. Drag in Pose to set the target.</p>
        <template v-if="selectedBone.ikConstraint?.enabled">
          <div class="flex justify-between text-[10px] text-ui-textMuted">
            <span>Chain</span>
            <span class="font-mono text-ui-textPrimary">{{ selectedBone.ikConstraint.chainLength }}</span>
          </div>
          <input type="range" min="2" max="6" step="1" v-model.number="selectedBone.ikConstraint.chainLength" class="w-full accent-amber-500 h-1" />
          <select
            :value="selectedBone.ikConstraint.targetBoneId || ''"
            class="w-full bg-ui-input border border-ui-borderDefault rounded-xs px-2 py-1 text-xs cursor-pointer"
            @change="selectedBone.ikConstraint!.targetBoneId = ($event.target as HTMLSelectElement).value || undefined"
          >
            <option value="" class="bg-ui-panel">Gizmo / last pos</option>
            <option v-for="b in animationStore.armature.bones.filter(b => b.id !== selectedBone?.id)" :key="b.id" :value="b.id" class="bg-ui-panel">{{ b.name }}</option>
          </select>
          <select
            :value="selectedBone.ikConstraint.poleTargetBoneId || ''"
            class="w-full bg-ui-input border border-ui-borderDefault rounded-xs px-2 py-1 text-xs cursor-pointer"
            @change="selectedBone.ikConstraint!.poleTargetBoneId = ($event.target as HTMLSelectElement).value || undefined"
          >
            <option value="" class="bg-ui-panel">No pole</option>
            <option v-for="b in animationStore.armature.bones.filter(b => b.id !== selectedBone?.id)" :key="b.id" :value="b.id" class="bg-ui-panel">{{ b.name }}</option>
          </select>
        </template>
      </UiSection>

      <UiSection title="Sockets" :icon="Wrench" :badge="selectedBone.sockets?.length || 0" :default-open="false">
        <UiButton size="xs" class="w-full" @click="handleAddSocket"><Plus class="w-3 h-3" /> Add</UiButton>
        <div v-for="s in selectedBone.sockets || []" :key="s.id" class="flex items-center gap-1">
          <input v-model="s.name" class="flex-1 bg-ui-input border border-ui-borderSubtle rounded-xs px-1.5 py-0.5 text-[10px] text-sky-300" />
          <button type="button" class="text-ui-textMuted hover:text-rose-400" @click="handleRemoveSocket(s.id)"><Trash2 class="w-3 h-3" /></button>
        </div>
      </UiSection>

      <UiSection title="Spring" :icon="Sparkles" :default-open="false">
        <label class="flex items-center justify-between text-[10px] cursor-pointer bg-ui-surface px-2 py-1 rounded-xs border border-ui-borderSubtle">
          <span>Jiggle</span>
          <input
            type="checkbox"
            :checked="selectedBone.springConstraint?.enabled || false"
            class="accent-emerald-500"
            @change="toggleSpring(($event.target as HTMLInputElement).checked)"
          />
        </label>
        <template v-if="selectedBone.springConstraint?.enabled">
          <div class="flex justify-between text-[10px] text-ui-textMuted"><span>Stiff</span><span class="font-mono">{{ selectedBone.springConstraint.stiffness }}</span></div>
          <input type="range" min="0.05" max="1" step="0.05" v-model.number="selectedBone.springConstraint.stiffness" class="w-full accent-emerald-500 h-1" />
          <div class="flex justify-between text-[10px] text-ui-textMuted"><span>Damp</span><span class="font-mono">{{ selectedBone.springConstraint.damping }}</span></div>
          <input type="range" min="0.05" max="1" step="0.05" v-model.number="selectedBone.springConstraint.damping" class="w-full accent-emerald-500 h-1" />
          <div class="flex justify-between text-[10px] text-ui-textMuted"><span>Gravity</span><span class="font-mono">{{ selectedBone.springConstraint.gravity }}</span></div>
          <input type="range" min="0" max="1" step="0.05" v-model.number="selectedBone.springConstraint.gravity" class="w-full accent-emerald-500 h-1" />
        </template>
      </UiSection>
    </template>

    <UiSection v-else title="Select" :icon="GitCommitVertical" :default-open="true">
      <p class="text-[9px] text-ui-textMuted">Pick a bone in the viewport or Skel tab.</p>
      <div class="grid grid-cols-2 gap-1">
        <UiButton size="xs" variant="primary" @click="animationStore.addRootBone(`Bone_Root_${animationStore.armature.bones.length + 1}`)">Add</UiButton>
        <UiButton size="xs" :variant="animationStore.clickToPlaceMode ? 'accent' : 'default'" @click="animationStore.clickToPlaceMode = !animationStore.clickToPlaceMode">Draw</UiButton>
      </div>
      <button
        v-for="b in animationStore.armature.bones"
        :key="b.id"
        type="button"
        class="w-full text-left px-2 py-1 rounded-xs text-[10px] hover:bg-ui-hover text-ui-textSecondary"
        @click="animationStore.selectBone(b.id)"
      >{{ b.name }}</button>
    </UiSection>
  </div>
</template>
