<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAnimationStore } from '../../stores/animationStore'
import { useProjectStore } from '../../stores/projectStore'
import { useToolStore } from '../../stores/toolStore'
import { resolveMeshBoneParentId, sampleTrack } from '../../core/animation/Armature'
import UiSection from '../ui/UiSection.vue'
import UiButton from '../ui/UiButton.vue'
import BlenderIcon from '../icons/BlenderIcon.vue'

const animationStore = useAnimationStore()
const projectStore = useProjectStore()
const toolStore = useToolStore()

const newClipTitle = ref('')
const newClipFps = ref(30)
const newClipSeconds = ref(1)
const newClipLoop = ref(true)
const canKey = computed(() => !!animationStore.activeClip && !!(selectedBone.value || activeMesh.value))
const hasClipboard = computed(() => animationStore.hasPoseClipboard)
const selectedTrack = computed(() => animationStore.activeClip?.tracks.find(t =>
  t.targetId === (selectedBone.value?.id || activeMesh.value?.id) && t.targetType === (selectedBone.value ? 'bone' : 'mesh')))
const targetKeyFrames = computed(() => [...new Set(selectedTrack.value ? [
  ...selectedTrack.value.positionKeys, ...selectedTrack.value.rotationKeys, ...selectedTrack.value.scaleKeys
].map(k => k.frame) : [])].sort((a, b) => a - b))
const previousKey = computed(() => targetKeyFrames.value.filter(f => f < animationStore.currentFrame).at(-1))
const nextKey = computed(() => targetKeyFrames.value.find(f => f > animationStore.currentFrame))
const keyedNow = computed(() => targetKeyFrames.value.includes(animationStore.currentFrame))
function commitPose(channel: 'position' | 'rotation' | 'scale', axis: 'x' | 'y' | 'z', event: Event) {
  const input = event.target as HTMLInputElement
  const bone = selectedBone.value
  if (!bone) return
  if (input.value.trim()) animationStore.setBonePoseValue(bone.id, channel, axis, Number(input.value))
  input.value = String(bone[channel][axis])
}
function boneDepth(id: string) {
  const visited = new Set<string>([id])
  let bone = animationStore.armature.bones.find(b => b.id === id)
  let depth = 0
  while (bone?.parentId && !visited.has(bone.parentId)) {
    visited.add(bone.parentId)
    bone = animationStore.armature.bones.find(b => b.id === bone!.parentId)
    if (bone) depth++
  }
  return Math.min(depth, 6)
}
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
  animationStore.createClip(name, Math.round(Math.max(0.1, Math.min(120, Number(newClipSeconds.value) || 1)) * newClipFps.value), newClipFps.value, { loop: newClipLoop.value })
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
  projectStore.recordState(`Adjust ${axis.toUpperCase()}`)
  const startX = e.clientX
  const startVal = Number(targetObj[axis]) || 0
  const onMouseMove = (moveEvent: MouseEvent) => {
    targetObj[axis] = Number((startVal + (moveEvent.clientX - startX) * step * (moveEvent.shiftKey ? 0.1 : 1)).toFixed(precision))
  }
  const onMouseUp = () => {
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
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
    <div class="inspector-head">
      <div class="inspector-head-kicker">
        <BlenderIcon name="keyframe" :size="12" />
        <span>Animate</span>
      </div>
      <span class="inspector-head-name">{{ animationStore.activeClip?.name || 'No clip' }}</span>
    </div>

    <div class="px-2.5 py-1.5 border-b border-ui-borderSubtle">
      <div class="text-[10px] text-ui-textSecondary truncate">
        <span class="font-semibold text-ui-textPrimary">{{ selectedBone?.name || activeMesh?.name || 'No target' }}</span>
        <span class="text-ui-textMuted"> · f{{ animationStore.currentFrame }} · {{ keyedNow ? 'keyed' : 'no key' }}{{ animationStore.autoKey ? ' · Auto-key' : '' }}</span>
      </div>
    </div>

    <UiSection title="Clip" blender-icon="keyframe-map" :default-open="true">
      <select
        :value="animationStore.activeClip?.id"
        class="inspector-select w-full"
        @change="animationStore.selectClip(($event.target as HTMLSelectElement).value)"
      >
        <option v-for="c in animationStore.armature.clips" :key="c.id" :value="c.id" class="bg-ui-panel">
          {{ c.name }} · {{ c.durationFrames }}f
        </option>
      </select>
      <label class="flex flex-col gap-0.5 text-[9px] text-ui-textMuted">
        Action name
        <input
          :value="animationStore.activeClip?.name || ''"
          :disabled="!animationStore.activeClip"
          class="w-full bg-ui-input border border-ui-borderSubtle rounded-xs px-2 py-1 text-[10px] text-ui-textPrimary disabled:opacity-50"
          @change="animationStore.activeClip && animationStore.renameClip(animationStore.activeClip.id, ($event.target as HTMLInputElement).value)"
        />
      </label>
      <div class="grid grid-cols-2 gap-1">
        <label class="flex flex-col gap-0.5 text-[9px] text-ui-textMuted">
          Frame rate
          <select
            :value="animationStore.activeClip?.fps || 12"
            class="inspector-select w-full"
            @change="animationStore.setActiveClipFps(Number(($event.target as HTMLSelectElement).value))"
          >
            <option v-for="rate in [12, 15, 24, 30, 60]" :key="rate" :value="rate">{{ rate }} fps</option>
          </select>
        </label>
        <label class="flex flex-col gap-0.5 text-[9px] text-ui-textMuted">
          Preview speed
          <select v-model.number="animationStore.playbackSpeed" class="inspector-select w-full">
            <option :value="0.25">¼×</option>
            <option :value="0.5">½×</option>
            <option :value="1">1×</option>
            <option :value="2">2×</option>
          </select>
        </label>
      </div>
      <p class="text-[10px] text-ui-textMuted">{{ animationStore.activeClip?.durationFrames }} frames · {{ animationStore.totalDurationSeconds }} seconds · {{ animationStore.activeClip?.tracks.length || 0 }} tracks</p>
      <div class="grid grid-cols-2 gap-1">
        <UiButton size="xs" :disabled="!animationStore.activeClip" @click="animationStore.duplicateClip(animationStore.activeClip!.id)">Duplicate</UiButton>
        <UiButton size="xs" variant="danger" :disabled="animationStore.armature.clips.length <= 1" @click="animationStore.deleteClip(animationStore.activeClip!.id)">Delete</UiButton>
      </div>
    </UiSection>

    <UiSection title="New clip" blender-icon="plus" :default-open="false">
      <div class="flex gap-1">
        <input
          v-model="newClipTitle"
          placeholder="New action…"
          class="flex-1 bg-ui-input border border-ui-borderSubtle rounded-xs px-2 py-1 text-[10px]"
          @keydown.enter="handleCreateClip"
        />
        <UiButton size="xs" @click="handleCreateClip">New</UiButton>
      </div>
      <div class="grid grid-cols-2 gap-1">
        <label class="text-[10px] text-ui-textMuted">Seconds<input v-model.number="newClipSeconds" aria-label="New clip duration" type="number" min="0.1" max="120" step="0.1" class="w-full bg-ui-input border border-ui-borderSubtle rounded-xs px-1 py-0.5 font-mono text-[10px]" /></label>
        <label class="text-[10px] text-ui-textMuted">Frame rate<select v-model.number="newClipFps" aria-label="New clip frame rate" class="inspector-select w-full"><option v-for="rate in [12, 15, 24, 30, 60]" :key="rate" :value="rate">{{ rate }} fps</option></select></label>
      </div>
      <label class="flex items-center justify-between text-[10px] cursor-pointer bg-ui-surface px-2 py-1 rounded-xs border border-ui-borderSubtle">
        <span>Loop</span>
        <input type="checkbox" v-model="newClipLoop" class="accent-ui-accent" />
      </label>
    </UiSection>

    <UiSection title="Pose & keyframes" blender-icon="keyframe" :default-open="true">
      <p class="text-[10px] text-ui-textMuted leading-snug">{{ keyTargetLabel }}</p>
      <div class="flex items-center justify-between gap-1 text-[10px]">
        <UiButton size="xs" :disabled="previousKey === undefined" @click="previousKey !== undefined && animationStore.setFrame(previousKey)">‹ Previous key</UiButton>
        <span class="font-mono inspector-value">{{ keyedNow ? 'Keyed' : 'No key' }}</span>
        <UiButton size="xs" :disabled="nextKey === undefined" @click="nextKey !== undefined && animationStore.setFrame(nextKey)">Next key ›</UiButton>
      </div>
      <p v-if="animationStore.recordedStatusMessage !== 'Ready'" class="text-[9px] text-ui-textSecondary truncate">{{ animationStore.recordedStatusMessage }}</p>
      <div class="grid grid-cols-2 gap-1">
        <UiButton size="xs" variant="accent" :disabled="!canKey" title="Save the selected bone or object pose (I or K)" @click="animationStore.recordCurrentKeyframe()">Insert key</UiButton>
        <UiButton size="xs" title="Keys every bone and object in the scene" @click="animationStore.recordAllBonesKeyframe()">Key entire scene</UiButton>
        <UiButton size="xs" :disabled="!keyedNow" @click="animationStore.deleteKeyframeAt(selectedBone?.id || activeMesh!.id, animationStore.currentFrame)">Delete target key</UiButton>
        <UiButton size="xs" title="Alt+R" @click="animationStore.resetPose()"><BlenderIcon name="undo" :size="12" /> Reset</UiButton>
      </div>
      <div class="grid grid-cols-2 gap-1">
        <UiButton size="xs" @click="animationStore.copyPose()"><BlenderIcon name="duplicate" :size="12" /> Copy</UiButton>
        <UiButton size="xs" :disabled="!hasClipboard" @click="animationStore.pastePose()"><BlenderIcon name="import" :size="12" /> Paste</UiButton>
      </div>
      <UiButton size="xs" class="w-full" :disabled="!hasClipboard" @click="animationStore.pasteFlippedPose()">Paste flipped</UiButton>
      <UiButton size="xs" class="w-full" @click="animationStore.showPosePopup = true">Quick Pose</UiButton>
    </UiSection>

    <UiSection v-if="selectedBone" title="Pose" blender-icon="pose" :default-open="true">
      <div class="text-[9px] text-ui-textMuted">Rotation</div>
      <div class="grid grid-cols-3 gap-1">
        <div v-for="ax in (['x', 'y', 'z'] as const)" :key="'r'+ax" class="flex items-center bg-ui-input border border-ui-borderSubtle rounded-xs px-1">
          <span class="text-[9px] font-bold cursor-ew-resize" :class="ax === 'x' ? 'text-rose-400' : ax === 'y' ? 'text-emerald-400' : 'text-sky-400'" @mousedown="startScrubVector($event, selectedBone.rotation, ax, 1, 1)">{{ ax.toUpperCase() }}</span>
          <input type="number" step="1" :aria-label="`Rotation ${ax.toUpperCase()}`" :value="selectedBone.rotation[ax]" @change="commitPose('rotation', ax, $event)" class="w-full bg-transparent text-right font-mono text-[10px] py-0.5" />
        </div>
      </div>
      <div class="text-[9px] text-ui-textMuted">Location</div>
      <div class="grid grid-cols-3 gap-1">
        <div v-for="ax in (['x', 'y', 'z'] as const)" :key="'p'+ax" class="flex items-center bg-ui-input border border-ui-borderSubtle rounded-xs px-1">
          <span class="text-[9px] font-bold cursor-ew-resize" :class="ax === 'x' ? 'text-rose-400' : ax === 'y' ? 'text-emerald-400' : 'text-sky-400'" @mousedown="startScrubVector($event, selectedBone.position, ax)">{{ ax.toUpperCase() }}</span>
          <input type="number" step="0.1" :aria-label="`Location ${ax.toUpperCase()}`" :value="selectedBone.position[ax]" @change="commitPose('position', ax, $event)" class="w-full bg-transparent text-right font-mono text-[10px] py-0.5" />
        </div>
      </div>
      <div class="text-[9px] text-ui-textMuted">Scale</div>
      <div class="grid grid-cols-3 gap-1">
        <div v-for="ax in (['x', 'y', 'z'] as const)" :key="'s'+ax" class="flex items-center bg-ui-input border border-ui-borderSubtle rounded-xs px-1">
          <span class="text-[9px] font-bold cursor-ew-resize" :class="ax === 'x' ? 'text-rose-400' : ax === 'y' ? 'text-emerald-400' : 'text-sky-400'" @mousedown="startScrubVector($event, selectedBone.scale, ax, 0.05, 2)">{{ ax.toUpperCase() }}</span>
          <input type="number" step="0.05" :aria-label="`Scale ${ax.toUpperCase()}`" :value="selectedBone.scale[ax]" @change="commitPose('scale', ax, $event)" class="w-full bg-transparent text-right font-mono text-[10px] py-0.5" />
        </div>
      </div>
      <p class="text-[10px] text-ui-textMuted">{{ selectedBone.ikConstraint?.enabled ? 'IK enabled · solver controls this chain.' : 'Direct bone posing (FK)' }}{{ selectedBone.springConstraint?.enabled ? ' · Spring enabled' : '' }}</p>
    </UiSection>

    <UiSection v-if="hasBones" title="Bones" blender-icon="bone" :badge="filteredBones.length" :default-open="true">
      <input v-model="boneSearchQuery" placeholder="Find bone…" class="w-full bg-ui-input border border-ui-borderSubtle rounded-xs px-2 py-1 text-[10px]" />
      <div class="max-h-36 overflow-y-auto space-y-0.5">
        <button
          v-for="b in filteredBones"
          :key="b.id"
          type="button"
          class="w-full text-left px-2 py-1 rounded-xs text-[10px] truncate"
          :class="animationStore.selectedBoneId === b.id ? 'bg-ui-active text-ui-textPrimary' : 'text-ui-textSecondary hover:bg-ui-hover'"
          @click="animationStore.selectBone(b.id)"
          :style="{ paddingLeft: `${8 + boneDepth(b.id) * 10}px` }"
          :aria-pressed="animationStore.selectedBoneId === b.id"
          :title="b.name"
        >{{ b.parentId ? '↳ ' : '◈ ' }}{{ b.name }}<span v-if="b.ikConstraint?.enabled" class="text-ui-textMuted ml-1">IK</span></button>
        <p v-if="!filteredBones.length" class="text-[10px] text-ui-textMuted p-2">No bones match your search.</p>
      </div>
      <UiButton size="xs" class="w-full" @click="animationStore.toggleBoneHierarchyPopout(true)">Open bone hierarchy</UiButton>
    </UiSection>
    <UiSection v-else title="Bones" blender-icon="bone" :default-open="false">
      <p class="text-[10px] text-ui-textMuted leading-snug">No armature. This clip keys the selected object. Build a skeleton in Rig to pose bones.</p>
      <UiButton size="xs" class="w-full" @click="toolStore.setAppMode('rig')">Open Rig</UiButton>
    </UiSection>

    <UiSection title="Playback" blender-icon="display" :default-open="true">
      <label class="flex items-center justify-between text-[10px] cursor-pointer bg-ui-surface px-2 py-1 rounded-xs border border-ui-borderSubtle">
        <span>Auto-key on release</span>
        <input type="checkbox" v-model="animationStore.autoKey" class="accent-ui-accent" />
      </label>
      <label class="flex items-center justify-between text-[10px] cursor-pointer bg-ui-surface px-2 py-1 rounded-xs border border-ui-borderSubtle">
        <span class="flex items-center gap-1"><BlenderIcon name="onion-skin" :size="12" /> Onion skin</span>
        <input type="checkbox" v-model="animationStore.onionSkin" class="accent-ui-accent" />
      </label>
      <div v-if="animationStore.onionSkin" class="grid grid-cols-2 gap-1">
        <label class="flex flex-col gap-0.5 text-[9px] text-ui-textMuted">
          Frames
          <input
            type="number"
            min="1"
            max="4"
            v-model.number="animationStore.onionFramesCount"
            class="w-full bg-ui-input border border-ui-borderSubtle rounded-xs px-1 py-0.5 text-[10px] text-ui-textPrimary font-mono"
          />
        </label>
        <label class="flex flex-col gap-0.5 text-[9px] text-ui-textMuted">
          Opacity
          <input
            type="number"
            min="0.1"
            max="0.8"
            step="0.05"
            v-model.number="animationStore.onionOpacity"
            class="w-full bg-ui-input border border-ui-borderSubtle rounded-xs px-1 py-0.5 text-[10px] text-ui-textPrimary font-mono"
          />
        </label>
      </div>
      <div class="inspector-seg is-stretch">
        <button type="button" class="inspector-seg-btn" :class="{ 'is-active': animationStore.interpolationMode === 'step' }" @click="animationStore.interpolationMode = 'step'">Step</button>
        <button type="button" class="inspector-seg-btn" :class="{ 'is-active': animationStore.interpolationMode === 'linear' }" @click="animationStore.interpolationMode = 'linear'">Linear</button>
        <button type="button" class="inspector-seg-btn" :class="{ 'is-active': animationStore.interpolationMode === 'cubic' }" @click="animationStore.interpolationMode = 'cubic'">Cubic</button>
        <button type="button" class="inspector-seg-btn" :class="{ 'is-active': animationStore.interpolationMode === 'bezier' }" @click="animationStore.interpolationMode = 'bezier'">Bezier</button>
      </div>
      <div class="inspector-seg is-stretch">
        <button type="button" class="inspector-seg-btn" :class="{ 'is-active': animationStore.loopMode === 'loop' }" @click="animationStore.setLoopMode('loop')">Loop</button>
        <button type="button" class="inspector-seg-btn" :class="{ 'is-active': animationStore.loopMode === 'once' }" @click="animationStore.setLoopMode('once')">Once</button>
        <button type="button" class="inspector-seg-btn" :class="{ 'is-active': animationStore.loopMode === 'pingpong' }" @click="animationStore.setLoopMode('pingpong')">Bounce</button>
      </div>
      <label class="flex items-center justify-between text-[10px] cursor-pointer bg-ui-surface px-2 py-1 rounded-xs border border-ui-borderSubtle">
        <span>X-Ray mesh (Alt+Z)</span>
        <input type="checkbox" v-model="toolStore.viewport.xray" class="accent-ui-accent" />
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

    <UiSection title="Generate & blend" blender-icon="uv-smart" :default-open="false">
      <p class="text-[9px] text-ui-textMuted">Creates a clip and selects it.</p>
      <div class="grid grid-cols-3 gap-1">
        <UiButton v-for="g in generators" :key="g.label" size="xs" @click="g.run">{{ g.label }}</UiButton>
      </div>
      <div class="text-[9px] text-ui-textMuted pt-1">Blend two clips at this frame, then key.</div>
      <select v-model="blendClipAId" class="inspector-select w-full">
        <option value="" class="bg-ui-panel">Clip A</option>
        <option v-for="c in animationStore.armature.clips" :key="c.id" :value="c.id" class="bg-ui-panel">{{ c.name }}</option>
      </select>
      <select v-model="blendClipBId" class="inspector-select w-full">
        <option value="" class="bg-ui-panel">Clip B</option>
        <option v-for="c in animationStore.armature.clips" :key="c.id" :value="c.id" class="bg-ui-panel">{{ c.name }}</option>
      </select>
      <input type="range" min="0" max="1" step="0.05" v-model.number="blendFactor" class="inspector-range" />
      <div class="grid grid-cols-2 gap-1">
        <UiButton size="xs" :disabled="!hasBones || !blendClipAId || !blendClipBId" @click="applyBlendPreview">Preview</UiButton>
        <UiButton size="xs" :disabled="!hasBones || !blendClipAId || !blendClipBId" @click="keyBlend">Key blend</UiButton>
      </div>
    </UiSection>

    <UiSection v-if="activeMesh && hasBones" title="Mesh parent" blender-icon="link" :default-open="false">
      <p class="text-[9px] text-ui-textMuted">Object bind. Skin weights live in Rig → Bind / Wts.</p>
      <select
        :value="activeMeshBoneId || 'none'"
        class="inspector-select w-full"
        @change="animationStore.parentMeshToBone(activeMesh.id, ($event.target as HTMLSelectElement).value === 'none' ? null : ($event.target as HTMLSelectElement).value)"
      >
        <option value="none" class="bg-ui-panel">World</option>
        <option v-for="b in animationStore.armature.bones" :key="b.id" :value="b.id" class="bg-ui-panel">{{ b.name }}</option>
      </select>
    </UiSection>
  </div>
</template>
