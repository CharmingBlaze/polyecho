<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAnimationStore } from '../../stores/animationStore'
import { useProjectStore } from '../../stores/projectStore'
import { useToolStore } from '../../stores/toolStore'
import { resolveMeshBoneParentId, sampleTrack } from '../../core/animation/Armature'
import UiSection from '../ui/UiSection.vue'
import UiButton from '../ui/UiButton.vue'
import {
  Key,
  Film,
  Sliders,
  GitCommitVertical,
  Sparkles,
  RotateCcw,
  Copy,
  Clipboard,
  Search
} from 'lucide-vue-next'

const animationStore = useAnimationStore()
const projectStore = useProjectStore()
const toolStore = useToolStore()

const newClipTitle = ref('')
const boneSearchQuery = ref('')
const blendClipAId = ref('')
const blendClipBId = ref('')
const blendFactor = ref(0.5)

const hasBones = computed(() => animationStore.armature.bones.length > 0)
const selectedBone = computed(() => animationStore.selectedBone)
const activeMesh = computed(() => projectStore.activeMesh)
const keyTargetLabel = computed(() => {
  if (selectedBone.value) return `${selectedBone.value.name} · frame ${animationStore.currentFrame}`
  if (activeMesh.value) return `${activeMesh.value.name} · frame ${animationStore.currentFrame}`
  return 'Select a bone or object'
})
const activeMeshBoneId = computed(() => {
  if (!activeMesh.value) return undefined
  return resolveMeshBoneParentId(activeMesh.value, animationStore.armature.bones)
})

const filteredBones = computed(() => {
  const q = boneSearchQuery.value.trim().toLowerCase()
  return animationStore.armature.bones.filter(b => !q || b.name.toLowerCase().includes(q))
})

function handleCreateClip() {
  const name = newClipTitle.value.trim() || `Action_${animationStore.armature.clips.length + 1}`
  animationStore.createClip(name, 24, 12)
  newClipTitle.value = ''
}

function applyBlendPreview() {
  if (!blendClipAId.value || !blendClipBId.value) return
  const clipA = animationStore.armature.clips.find(c => c.id === blendClipAId.value)
  const clipB = animationStore.armature.clips.find(c => c.id === blendClipBId.value)
  if (!clipA || !clipB) return

  const factor = blendFactor.value
  for (const bone of animationStore.armature.bones) {
    const trackA = clipA.tracks.find(t => t.targetId === bone.id)
    const trackB = clipB.tracks.find(t => t.targetId === bone.id)
    const poseA = trackA
      ? sampleTrack(trackA, animationStore.currentFrame)
      : { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } }
    const poseB = trackB
      ? sampleTrack(trackB, animationStore.currentFrame)
      : { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } }
    bone.position = {
      x: poseA.position.x + (poseB.position.x - poseA.position.x) * factor,
      y: poseA.position.y + (poseB.position.y - poseA.position.y) * factor,
      z: poseA.position.z + (poseB.position.z - poseA.position.z) * factor
    }
    bone.rotation = {
      x: poseA.rotation.x + (poseB.rotation.x - poseA.rotation.x) * factor,
      y: poseA.rotation.y + (poseB.rotation.y - poseA.rotation.y) * factor,
      z: poseA.rotation.z + (poseB.rotation.z - poseA.rotation.z) * factor
    }
    bone.scale = {
      x: poseA.scale.x + (poseB.scale.x - poseA.scale.x) * factor,
      y: poseA.scale.y + (poseB.scale.y - poseA.scale.y) * factor,
      z: poseA.scale.z + (poseB.scale.z - poseA.scale.z) * factor
    }
  }
}

function keyBlend() {
  applyBlendPreview()
  animationStore.recordAllBonesKeyframe()
}

function startScrubVector(e: MouseEvent, targetObj: { x: number; y: number; z: number }, axis: 'x' | 'y' | 'z', step = 0.05, precision = 2) {
  e.preventDefault()
  const startX = e.clientX
  const startVal = Number(targetObj[axis]) || 0
  const onMouseMove = (moveEvent: MouseEvent) => {
    targetObj[axis] = Number((startVal + (moveEvent.clientX - startX) * step * (moveEvent.shiftKey ? 0.1 : 1)).toFixed(precision))
  }
  const onMouseUp = () => {
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
    projectStore.recordState(`Adjust ${axis.toUpperCase()}`)
    if (animationStore.autoKey) animationStore.recordCurrentKeyframe({ record: false })
  }
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

const generators: { label: string; run: () => void }[] = [
  { label: 'Idle', run: () => animationStore.generateIdleBreathe() },
  { label: 'Walk', run: () => animationStore.generateWalkCycle() },
  { label: 'Jump', run: () => animationStore.generateJumpArc() },
  { label: 'Attack', run: () => animationStore.generateAttackSlash() },
  { label: 'Spin', run: () => animationStore.generateSpinLoop() },
  { label: 'Float', run: () => animationStore.generateFloatingBob() },
  { label: 'Tail', run: () => animationStore.generateTailWiggle() },
  { label: 'Impact', run: () => animationStore.generateImpactShake() },
  { label: 'Wings', run: () => animationStore.generateWingFlap() },
  { label: 'Quad walk', run: () => animationStore.generateQuadrupedWalk() },
  { label: 'Drink', run: () => animationStore.generateBirdDrink() },
  { label: 'Door', run: () => animationStore.generateDoorOpenClose() }
]
</script>

<template>
  <div class="flex flex-col select-none text-xs font-sans">
    <div class="h-7 bg-ui-header border-b border-ui-borderSubtle px-2.5 flex items-center justify-between">
      <div class="flex items-center space-x-1.5">
        <Film class="w-3 h-3 text-sky-400" />
        <span class="text-[11px] font-medium text-ui-textMuted">Animate</span>
      </div>
      <span class="font-semibold text-ui-textPrimary truncate max-w-[150px] text-[11px]">
        {{ animationStore.activeClip?.name || 'No clip' }}
      </span>
    </div>

    <UiSection title="Clip" :icon="Film" :default-open="true">
      <select
        :value="animationStore.activeClip?.id"
        class="w-full bg-ui-input border border-ui-borderDefault rounded-xs px-2 py-1 text-xs cursor-pointer"
        @change="animationStore.selectClip(($event.target as HTMLSelectElement).value)"
      >
        <option v-for="c in animationStore.armature.clips" :key="c.id" :value="c.id" class="bg-ui-panel">
          {{ c.name }} · {{ c.durationFrames }}f
        </option>
      </select>
      <div class="flex gap-1">
        <input
          v-model="newClipTitle"
          placeholder="New action…"
          class="flex-1 bg-ui-input border border-ui-borderSubtle rounded-xs px-2 py-1 text-[10px]"
          @keydown.enter="handleCreateClip"
        />
        <UiButton size="xs" variant="primary" @click="handleCreateClip">New</UiButton>
      </div>
      <div class="grid grid-cols-2 gap-1">
        <UiButton size="xs" :disabled="!animationStore.activeClip" @click="animationStore.duplicateClip(animationStore.activeClip!.id)">Duplicate</UiButton>
        <UiButton size="xs" variant="danger" :disabled="animationStore.armature.clips.length <= 1" @click="animationStore.deleteClip(animationStore.activeClip!.id)">Delete</UiButton>
      </div>
    </UiSection>

    <UiSection title="Keyframe" :icon="Key" :default-open="true">
      <p class="text-[10px] text-ui-textMuted leading-snug">{{ keyTargetLabel }}</p>
      <p v-if="animationStore.recordedStatusMessage !== 'Ready'" class="text-[9px] text-emerald-400 truncate">{{ animationStore.recordedStatusMessage }}</p>
      <div class="grid grid-cols-2 gap-1">
        <UiButton size="xs" variant="primary" title="I or K" @click="animationStore.recordCurrentKeyframe()">Insert key</UiButton>
        <UiButton size="xs" @click="animationStore.recordAllBonesKeyframe()">Key all</UiButton>
        <UiButton size="xs" @click="animationStore.clearKeyframeAtCurrentTime()">Clear frame</UiButton>
        <UiButton size="xs" title="Alt+R" @click="animationStore.resetPose()"><RotateCcw class="w-3 h-3" /> Reset</UiButton>
      </div>
      <div class="grid grid-cols-2 gap-1">
        <UiButton size="xs" @click="animationStore.copyPose()"><Copy class="w-3 h-3" /> Copy</UiButton>
        <UiButton size="xs" @click="animationStore.pastePose()"><Clipboard class="w-3 h-3" /> Paste</UiButton>
      </div>
      <UiButton size="xs" class="w-full" @click="animationStore.pasteFlippedPose()">Paste flipped</UiButton>
    </UiSection>

    <UiSection v-if="selectedBone" title="Pose" :icon="GitCommitVertical" :default-open="true">
      <div class="text-[9px] text-ui-textMuted">Rotation</div>
      <div class="grid grid-cols-3 gap-1">
        <div v-for="ax in (['x', 'y', 'z'] as const)" :key="'r'+ax" class="flex items-center bg-ui-input border border-ui-borderSubtle rounded-xs px-1">
          <span class="text-[9px] font-bold cursor-ew-resize" :class="ax === 'x' ? 'text-rose-400' : ax === 'y' ? 'text-emerald-400' : 'text-sky-400'" @mousedown="startScrubVector($event, selectedBone.rotation, ax, 1, 1)">{{ ax.toUpperCase() }}</span>
          <input type="number" step="1" v-model.number="selectedBone.rotation[ax]" class="w-full bg-transparent text-right font-mono text-[10px] py-0.5" />
        </div>
      </div>
      <div class="text-[9px] text-ui-textMuted">Location</div>
      <div class="grid grid-cols-3 gap-1">
        <div v-for="ax in (['x', 'y', 'z'] as const)" :key="'p'+ax" class="flex items-center bg-ui-input border border-ui-borderSubtle rounded-xs px-1">
          <span class="text-[9px] font-bold cursor-ew-resize" :class="ax === 'x' ? 'text-rose-400' : ax === 'y' ? 'text-emerald-400' : 'text-sky-400'" @mousedown="startScrubVector($event, selectedBone.position, ax)">{{ ax.toUpperCase() }}</span>
          <input type="number" step="0.1" v-model.number="selectedBone.position[ax]" class="w-full bg-transparent text-right font-mono text-[10px] py-0.5" />
        </div>
      </div>
    </UiSection>

    <UiSection v-if="hasBones" title="Bones" :icon="Search" :badge="filteredBones.length" :default-open="true">
      <input v-model="boneSearchQuery" placeholder="Find bone…" class="w-full bg-ui-input border border-ui-borderSubtle rounded-xs px-2 py-1 text-[10px]" />
      <div class="max-h-36 overflow-y-auto space-y-0.5">
        <button
          v-for="b in filteredBones"
          :key="b.id"
          type="button"
          class="w-full text-left px-2 py-1 rounded-xs text-[10px] truncate"
          :class="animationStore.selectedBoneId === b.id ? 'bg-ui-active text-ui-textAccent' : 'text-ui-textSecondary hover:bg-ui-hover'"
          @click="animationStore.selectBone(b.id)"
        >{{ b.name }}</button>
      </div>
    </UiSection>
    <UiSection v-else title="Bones" :icon="GitCommitVertical" :default-open="false">
      <p class="text-[10px] text-ui-textMuted leading-snug">No armature. This clip keys the selected object. Build a skeleton in Rig to pose bones.</p>
      <UiButton size="xs" class="w-full" @click="toolStore.setAppMode('rig')">Open Rig</UiButton>
    </UiSection>

    <UiSection title="Playback" :icon="Sliders" :default-open="true">
      <label class="flex items-center justify-between text-[10px] cursor-pointer bg-ui-surface px-2 py-1 rounded-xs border border-ui-borderSubtle">
        <span>Auto-key on release</span>
        <input type="checkbox" v-model="animationStore.autoKey" class="accent-rose-500" />
      </label>
      <div class="grid grid-cols-2 gap-1">
        <UiButton size="xs" :variant="animationStore.interpolationMode === 'step' ? 'accent' : 'default'" @click="animationStore.interpolationMode = 'step'">Step</UiButton>
        <UiButton size="xs" :variant="animationStore.interpolationMode === 'linear' ? 'accent' : 'default'" @click="animationStore.interpolationMode = 'linear'">Linear</UiButton>
        <UiButton size="xs" :variant="animationStore.interpolationMode === 'cubic' ? 'accent' : 'default'" @click="animationStore.interpolationMode = 'cubic'">Cubic</UiButton>
        <UiButton size="xs" :variant="animationStore.interpolationMode === 'bezier' ? 'accent' : 'default'" @click="animationStore.interpolationMode = 'bezier'">Bezier</UiButton>
      </div>
      <div class="grid grid-cols-3 gap-1">
        <UiButton size="xs" :variant="animationStore.loopMode === 'loop' ? 'accent' : 'default'" @click="animationStore.loopMode = 'loop'">Loop</UiButton>
        <UiButton size="xs" :variant="animationStore.loopMode === 'once' ? 'accent' : 'default'" @click="animationStore.loopMode = 'once'">Once</UiButton>
        <UiButton size="xs" :variant="animationStore.loopMode === 'pingpong' ? 'accent' : 'default'" @click="animationStore.loopMode = 'pingpong'">Bounce</UiButton>
      </div>
      <label class="flex items-center justify-between text-[10px] cursor-pointer bg-ui-surface px-2 py-1 rounded-xs border border-ui-borderSubtle">
        <span>X-Ray mesh (Alt+Z)</span>
        <input type="checkbox" v-model="toolStore.viewport.xray" class="accent-amber-500" />
      </label>
      <template v-if="hasBones">
        <label class="flex items-center justify-between text-[10px] cursor-pointer bg-ui-surface px-2 py-1 rounded-xs border border-ui-borderSubtle">
          <span>Show bones</span>
          <input
            type="checkbox"
            :checked="animationStore.showBones"
            class="accent-ui-accent"
            @change="animationStore.setShowBones(!animationStore.showBones)"
          />
        </label>
        <label class="flex items-center justify-between text-[10px] cursor-pointer bg-ui-surface px-2 py-1 rounded-xs border border-ui-borderSubtle">
          <span>X-ray bones</span>
          <input type="checkbox" v-model="animationStore.xrayBones" class="accent-ui-accent" />
        </label>
      </template>
    </UiSection>

    <UiSection title="Generate" :icon="Sparkles" :default-open="false">
      <p class="text-[9px] text-ui-textMuted">Creates a clip and selects it.</p>
      <div class="grid grid-cols-3 gap-1">
        <UiButton v-for="g in generators" :key="g.label" size="xs" @click="g.run">{{ g.label }}</UiButton>
      </div>
      <div class="text-[9px] text-ui-textMuted pt-1">Blend two clips at this frame, then key.</div>
      <select v-model="blendClipAId" class="w-full bg-ui-input border border-ui-borderDefault rounded-xs px-2 py-1 text-[10px] cursor-pointer">
        <option value="" class="bg-ui-panel">Clip A</option>
        <option v-for="c in animationStore.armature.clips" :key="c.id" :value="c.id" class="bg-ui-panel">{{ c.name }}</option>
      </select>
      <select v-model="blendClipBId" class="w-full bg-ui-input border border-ui-borderDefault rounded-xs px-2 py-1 text-[10px] cursor-pointer">
        <option value="" class="bg-ui-panel">Clip B</option>
        <option v-for="c in animationStore.armature.clips" :key="c.id" :value="c.id" class="bg-ui-panel">{{ c.name }}</option>
      </select>
      <input type="range" min="0" max="1" step="0.05" v-model.number="blendFactor" class="w-full accent-ui-accent h-1" />
      <div class="grid grid-cols-2 gap-1">
        <UiButton size="xs" @click="applyBlendPreview">Preview</UiButton>
        <UiButton size="xs" variant="primary" @click="keyBlend">Key blend</UiButton>
      </div>
    </UiSection>

    <UiSection v-if="activeMesh && hasBones" title="Mesh parent" :icon="GitCommitVertical" :default-open="false">
      <p class="text-[9px] text-ui-textMuted">Object bind. Skin weights live in Rig → Bind / Wts.</p>
      <select
        :value="activeMeshBoneId || 'none'"
        class="w-full bg-ui-input border border-ui-borderDefault rounded-xs px-2 py-1 text-xs cursor-pointer"
        @change="animationStore.parentMeshToBone(activeMesh.id, ($event.target as HTMLSelectElement).value === 'none' ? null : ($event.target as HTMLSelectElement).value)"
      >
        <option value="none" class="bg-ui-panel">World</option>
        <option v-for="b in animationStore.armature.bones" :key="b.id" :value="b.id" class="bg-ui-panel">{{ b.name }}</option>
      </select>
    </UiSection>
  </div>
</template>
