<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAnimationStore } from '../../stores/animationStore'
import { useProjectStore } from '../../stores/projectStore'
import { 
  Trash2, 
  Copy, 
  Plus, 
  Sparkles, 
  ChevronDown, 
  Link, 
  Unlink,
  Wand2, 
  Settings,
  Eye,
  ExternalLink,
  Key,
  RotateCcw,
  Clipboard,
  GitCommitVertical,
  Box,
  Film,
  Sliders
} from 'lucide-vue-next'

const animationStore = useAnimationStore()
const projectStore = useProjectStore()

import { sampleTrack } from '../../core/animation/Armature'

const activeTab = ref<'bone' | 'blend' | 'proc' | 'mesh' | 'anims' | 'settings'>('bone')
const newClipTitle = ref<string>('')

const blendClipAId = ref<string>('')
const blendClipBId = ref<string>('')
const blendFactor = ref<number>(0.5)

function applyBlendPreview() {
  if (!blendClipAId.value || !blendClipBId.value) return
  const clipA = animationStore.armature.clips.find(c => c.id === blendClipAId.value)
  const clipB = animationStore.armature.clips.find(c => c.id === blendClipBId.value)
  if (!clipA || !clipB) return

  const factor = blendFactor.value
  for (const bone of animationStore.armature.bones) {
    const trackA = clipA.tracks.find(t => t.targetId === bone.id)
    const trackB = clipB.tracks.find(t => t.targetId === bone.id)

    const poseA = trackA ? sampleTrack(trackA, animationStore.currentFrame) : { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } }
    const poseB = trackB ? sampleTrack(trackB, animationStore.currentFrame) : { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } }

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

const attachedMeshes = computed(() => {
  if (!selectedBone.value) return []
  return projectStore.meshes.filter(m => m.parentId === selectedBone.value?.id)
})

const selectedBone = computed(() => animationStore.selectedBone)
const selectedBoneIndex = computed(() => {
  if (!selectedBone.value) return -1
  return animationStore.armature.bones.findIndex(b => b.id === selectedBone.value?.id)
})

const parentBoneName = computed(() => {
  if (!selectedBone.value || !selectedBone.value.parentId) return 'None (Root)'
  const p = animationStore.armature.bones.find(b => b.id === selectedBone.value?.parentId)
  return p ? p.name : 'None (Root)'
})

const activeMesh = computed(() => projectStore.activeMesh)

function startScrubVector(e: MouseEvent, targetObj: { x: number; y: number; z: number }, axis: 'x' | 'y' | 'z', step = 0.05, precision = 2) {
  e.preventDefault()
  const startX = e.clientX
  const startVal = Number(targetObj[axis]) || 0

  const onMouseMove = (moveEvent: MouseEvent) => {
    const deltaX = moveEvent.clientX - startX
    const mult = moveEvent.shiftKey ? 0.1 : 1.0
    const newVal = Number((startVal + deltaX * step * mult).toFixed(precision))
    targetObj[axis] = newVal
    if (animationStore.autoKey) {
      animationStore.recordCurrentKeyframe()
    }
  }

  const onMouseUp = () => {
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
    projectStore.recordState(`Adjust ${axis.toUpperCase()}`)
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

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

function setBoneLength(bone: any, newLen: number) {
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

function setPresetBoneLength(len: number) {
  if (!selectedBone.value) return
  projectStore.recordState(`Set Bone Length to ${len}`)
  boneLength.value = len
}

function handleCreateClip() {
  const name = newClipTitle.value.trim() || `Action_${animationStore.armature.clips.length + 1}`
  animationStore.addClip(name, 24, 12)
  newClipTitle.value = ''
}

function handleDuplicateClip(clipId: string) {
  animationStore.duplicateClip(clipId)
}

function handleDeleteClip(clipId: string) {
  if (animationStore.armature.clips.length <= 1) return
  animationStore.deleteClip(clipId)
}

function setClipFps(fps: number) {
  if (animationStore.activeClip) {
    animationStore.activeClip.fps = fps
  }
}
</script>

<template>
  <div class="h-full w-full bg-ui-panel flex flex-col select-none overflow-y-auto p-3 text-ui-textPrimary space-y-3 font-sans text-xs">
    <!-- Properties Header Tab Bar (Bone | Clips | Generators | Mesh | Config) -->
    <div class="border-b border-ui-borderSubtle pb-2">
      <div class="flex items-center justify-between mb-1.5">
        <span class="text-[10px] text-ui-textMuted font-bold uppercase tracking-wider">Animation Properties</span>
        <span v-if="animationStore.activeClip" class="text-[9px] text-ui-textAccent font-mono bg-ui-input px-1.5 py-0.5 rounded-xs border border-ui-borderSubtle">
          {{ animationStore.activeClip.name }}
        </span>
      </div>

      <div class="grid grid-cols-5 gap-1 bg-ui-input/70 p-0.5 rounded-xs border border-ui-borderSubtle text-[10px]">
        <button 
          @click="activeTab = 'bone'"
          class="py-1.5 px-1 rounded-xs transition flex flex-col items-center justify-center gap-1 cursor-pointer"
          :class="activeTab === 'bone' ? 'bg-ui-active text-ui-textAccent font-bold border border-ui-accent/40 shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Active Bone & Joint Properties"
        >
          <GitCommitVertical class="w-3.5 h-3.5 text-purple-400" />
          <span>Bone</span>
        </button>

        <button 
          @click="activeTab = 'anims'"
          class="py-1.5 px-1 rounded-xs transition flex flex-col items-center justify-center gap-1 cursor-pointer"
          :class="activeTab === 'anims' ? 'bg-ui-active text-ui-textAccent font-bold border border-ui-accent/40 shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Animation Clips & Actions"
        >
          <Film class="w-3.5 h-3.5 text-sky-400" />
          <span>Clips</span>
        </button>

        <button 
          @click="activeTab = 'proc'"
          class="py-1.5 px-1 rounded-xs transition flex flex-col items-center justify-center gap-1 cursor-pointer"
          :class="activeTab === 'proc' || activeTab === 'blend' ? 'bg-ui-active text-ui-textAccent font-bold border border-ui-accent/40 shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Procedural Animation Generators & Blending"
        >
          <Sparkles class="w-3.5 h-3.5 text-amber-400" />
          <span>Generators</span>
        </button>

        <button 
          @click="activeTab = 'mesh'"
          class="py-1.5 px-1 rounded-xs transition flex flex-col items-center justify-center gap-1 cursor-pointer"
          :class="activeTab === 'mesh' ? 'bg-ui-active text-ui-textAccent font-bold border border-ui-accent/40 shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Mesh Rigid Parenting & Skinning"
        >
          <Box class="w-3.5 h-3.5 text-emerald-400" />
          <span>Mesh</span>
        </button>

        <button 
          @click="activeTab = 'settings'"
          class="py-1.5 px-1 rounded-xs transition flex flex-col items-center justify-center gap-1 cursor-pointer"
          :class="activeTab === 'settings' ? 'bg-ui-active text-ui-textAccent font-bold border border-ui-accent/40 shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Armature Settings & Global Config"
        >
          <Sliders class="w-3.5 h-3.5 text-ui-textMuted" />
          <span>Config</span>
        </button>
      </div>
    </div>

    <!-- TAB 1: BONE PROPERTIES & POSE MODE -->
    <div v-show="activeTab === 'bone'" class="space-y-3">
      <!-- Pose Actions Toolbar -->
      <div class="bg-ui-surface p-2 rounded-xs border border-ui-borderSubtle space-y-1.5 font-sans">
        <div class="flex items-center justify-between text-[10px]">
          <span class="text-ui-textMuted font-semibold uppercase tracking-wider">Pose & Keying</span>
          <span class="text-amber-400 font-medium text-[10px]">Pose Mode Active</span>
        </div>
        <div class="grid grid-cols-3 gap-1">
          <button 
            @click="animationStore.recordCurrentKeyframe()"
            :disabled="!selectedBone"
            class="h-6 px-1.5 bg-ui-accent hover:bg-ui-accentHover text-white rounded-xs font-medium text-[10px] flex items-center justify-center gap-1 shadow-xs transition cursor-pointer disabled:opacity-40"
            title="Insert keyframe for selected bone (K)"
          >
            <Key class="w-2.5 h-2.5" />
            <span>Key (K)</span>
          </button>

          <button 
            @click="animationStore.recordAllBonesKeyframe()"
            class="h-6 px-1.5 bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle text-ui-textPrimary rounded-xs font-medium text-[10px] flex items-center justify-center gap-1 transition cursor-pointer"
            title="Insert keyframe for all bones in skeleton"
          >
            <span>Key All</span>
          </button>

          <button 
            @click="animationStore.resetPose()"
            class="h-6 px-1.5 bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle text-ui-textSecondary hover:text-ui-textPrimary rounded-xs font-medium text-[10px] flex items-center justify-center gap-1 transition cursor-pointer"
            title="Reset active bone pose (Alt+R)"
          >
            <RotateCcw class="w-2.5 h-2.5 text-amber-400" />
            <span>Reset (Alt+R)</span>
          </button>
        </div>

        <div class="grid grid-cols-2 gap-1 pt-1 border-t border-ui-borderSubtle">
          <button 
            @click="animationStore.copyPose()"
            class="h-5 bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle text-ui-textSecondary hover:text-ui-textPrimary rounded-xs text-[10px] font-medium flex items-center justify-center gap-1 transition cursor-pointer"
          >
            <Copy class="w-2.5 h-2.5" />
            <span>Copy Pose</span>
          </button>
          <button 
            @click="animationStore.pastePose()"
            class="h-5 bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle text-ui-textSecondary hover:text-ui-textPrimary rounded-xs text-[10px] font-medium flex items-center justify-center gap-1 transition cursor-pointer"
          >
            <Clipboard class="w-2.5 h-2.5" />
            <span>Paste Pose</span>
          </button>
        </div>
      </div>

      <!-- Skeleton Bone Quick Selector -->
      <div v-if="animationStore.armature.bones.length > 0" class="bg-ui-surface p-2 rounded-xs border border-ui-borderSubtle space-y-1.5">
        <div class="text-[10px] text-ui-textMuted font-bold uppercase flex items-center justify-between">
          <span>Skeleton Bones</span>
          <div class="flex items-center gap-1.5">
            <span class="text-ui-textSecondary font-normal">{{ animationStore.armature.bones.length }} Bones</span>
            <button 
              @click="animationStore.toggleBoneHierarchyPopout(true)"
              class="p-0.5 hover:bg-ui-hover text-ui-textSecondary hover:text-ui-accent rounded-xs transition cursor-pointer"
              title="Pop out Floating Bone Hierarchy (H)"
            >
              <ExternalLink class="w-3 h-3" />
            </button>
          </div>
        </div>
        <div class="space-y-0.5 max-h-28 overflow-y-auto">
          <button 
            v-for="b in animationStore.armature.bones" 
            :key="b.id"
            @click="animationStore.selectBone(b.id)"
            class="w-full px-2 py-1 rounded-xs text-left text-xs font-bold flex items-center gap-1.5 transition"
            :class="animationStore.selectedBoneId === b.id ? 'bg-ui-active text-ui-textAccent border border-ui-accent/40' : 'bg-ui-input text-ui-textSecondary hover:bg-ui-hover'"
          >
            <GitCommitVertical class="w-3.5 h-3.5" :class="animationStore.selectedBoneId === b.id ? 'text-amber-400' : 'text-purple-400'" />
            <span class="truncate">{{ b.name }}</span>
          </button>
        </div>
      </div>

      <div v-if="selectedBone" class="space-y-2.5">
        <!-- Header: ▼ Bone: Name -->
        <div class="bg-ui-surface px-2.5 py-1.5 rounded-xs border border-ui-borderSubtle flex items-center justify-between text-ui-textAccent font-bold">
          <div class="flex items-center space-x-1.5 truncate">
            <ChevronDown class="w-3.5 h-3.5 text-ui-accent" />
            <span class="truncate">Bone: {{ selectedBone.name }}</span>
          </div>
          <button @click="animationStore.resetPose" class="text-[10px] text-ui-textMuted hover:text-ui-textPrimary px-1.5 py-0.5 rounded-xs bg-ui-input border border-ui-borderSubtle" title="Reset Pose (Alt+R)">
            Reset
          </button>
        </div>

        <!-- Meta info: Index & Parent -->
        <div class="bg-ui-surface p-2 rounded-xs border border-ui-borderSubtle space-y-1.5 text-[11px]">
          <div class="flex justify-between text-ui-textMuted">
            <span>Index:</span>
            <span class="text-ui-textPrimary font-bold">{{ selectedBoneIndex }}</span>
          </div>
          <div class="flex justify-between text-ui-textMuted">
            <span>Parent:</span>
            <span class="text-ui-textAccent font-bold truncate max-w-[120px]">{{ parentBoneName }}</span>
          </div>
        </div>

        <!-- Position (world) -->
        <div class="bg-ui-surface p-2 rounded-xs border border-ui-borderSubtle space-y-1 font-sans">
          <div class="flex items-center justify-between text-[10px]">
            <span class="text-ui-textMuted font-semibold uppercase tracking-wider">Position (world)</span>
            <span class="text-ui-textMuted/70 text-[9px]">Drag label</span>
          </div>
          <div class="grid grid-cols-3 gap-1">
            <div class="flex items-center bg-ui-input rounded-xs border border-ui-borderSubtle hover:border-ui-borderDefault px-1.5 py-0.5 transition group">
              <span @mousedown="startScrubVector($event, selectedBone.head, 'x', 0.05, 2)" class="text-rose-400 font-bold text-[10px] pr-1 cursor-ew-resize select-none hover:text-rose-300" title="Click and drag to scrub X">X</span>
              <input type="number" step="0.01" v-model.number="selectedBone.head.x" class="w-full bg-transparent text-right text-ui-textPrimary focus:outline-none font-mono text-[11px]" />
            </div>
            <div class="flex items-center bg-ui-input rounded-xs border border-ui-borderSubtle hover:border-ui-borderDefault px-1.5 py-0.5 transition group">
              <span @mousedown="startScrubVector($event, selectedBone.head, 'y', 0.05, 2)" class="text-emerald-400 font-bold text-[10px] pr-1 cursor-ew-resize select-none hover:text-emerald-300" title="Click and drag to scrub Y">Y</span>
              <input type="number" step="0.01" v-model.number="selectedBone.head.y" class="w-full bg-transparent text-right text-ui-textPrimary focus:outline-none font-mono text-[11px]" />
            </div>
            <div class="flex items-center bg-ui-input rounded-xs border border-ui-borderSubtle hover:border-ui-borderDefault px-1.5 py-0.5 transition group">
              <span @mousedown="startScrubVector($event, selectedBone.head, 'z', 0.05, 2)" class="text-sky-400 font-bold text-[10px] pr-1 cursor-ew-resize select-none hover:text-sky-300" title="Click and drag to scrub Z">Z</span>
              <input type="number" step="0.01" v-model.number="selectedBone.head.z" class="w-full bg-transparent text-right text-ui-textPrimary focus:outline-none font-mono text-[11px]" />
            </div>
          </div>
        </div>

        <!-- Rotation (°) -->
        <div class="bg-ui-surface p-2 rounded-xs border border-ui-borderSubtle space-y-1 font-sans">
          <div class="flex items-center justify-between text-[10px]">
            <span class="text-ui-textMuted font-semibold uppercase tracking-wider">Rotation (°)</span>
            <span class="text-ui-textMuted/70 text-[9px]">Drag label</span>
          </div>
          <div class="grid grid-cols-3 gap-1">
            <div class="flex items-center bg-ui-input rounded-xs border border-ui-borderSubtle hover:border-ui-borderDefault px-1.5 py-0.5 transition group">
              <span @mousedown="startScrubVector($event, selectedBone.rotation, 'x', 0.5, 1)" class="text-rose-400 font-bold text-[10px] pr-1 cursor-ew-resize select-none hover:text-rose-300" title="Click and drag to scrub X">X</span>
              <input type="number" step="1" v-model.number="selectedBone.rotation.x" class="w-full bg-transparent text-right text-ui-textPrimary focus:outline-none font-mono text-[11px]" />
            </div>
            <div class="flex items-center bg-ui-input rounded-xs border border-ui-borderSubtle hover:border-ui-borderDefault px-1.5 py-0.5 transition group">
              <span @mousedown="startScrubVector($event, selectedBone.rotation, 'y', 0.5, 1)" class="text-emerald-400 font-bold text-[10px] pr-1 cursor-ew-resize select-none hover:text-emerald-300" title="Click and drag to scrub Y">Y</span>
              <input type="number" step="1" v-model.number="selectedBone.rotation.y" class="w-full bg-transparent text-right text-ui-textPrimary focus:outline-none font-mono text-[11px]" />
            </div>
            <div class="flex items-center bg-ui-input rounded-xs border border-ui-borderSubtle hover:border-ui-borderDefault px-1.5 py-0.5 transition group">
              <span @mousedown="startScrubVector($event, selectedBone.rotation, 'z', 0.5, 1)" class="text-sky-400 font-bold text-[10px] pr-1 cursor-ew-resize select-none hover:text-sky-300" title="Click and drag to scrub Z">Z</span>
              <input type="number" step="1" v-model.number="selectedBone.rotation.z" class="w-full bg-transparent text-right text-ui-textPrimary focus:outline-none font-mono text-[11px]" />
            </div>
          </div>
        </div>

        <!-- Translation Offsets (T.X, T.Y, T.Z) -->
        <div class="bg-ui-surface p-2 rounded-xs border border-ui-borderSubtle space-y-1 font-sans">
          <div class="flex items-center justify-between text-[10px]">
            <span class="text-ui-textMuted font-semibold uppercase tracking-wider">Translation Offsets (T)</span>
            <span class="text-ui-textMuted/70 text-[9px]">Drag label</span>
          </div>
          <div class="grid grid-cols-3 gap-1">
            <div class="flex items-center bg-ui-input rounded-xs border border-ui-borderSubtle hover:border-ui-borderDefault px-1.5 py-0.5 transition group">
              <span @mousedown="startScrubVector($event, selectedBone.position, 'x', 0.05, 2)" class="text-rose-400 font-bold text-[10px] pr-1 cursor-ew-resize select-none hover:text-rose-300" title="Click and drag to scrub T.X">X</span>
              <input type="number" step="0.01" v-model.number="selectedBone.position.x" class="w-full bg-transparent text-right text-ui-textPrimary focus:outline-none font-mono text-[11px]" />
            </div>
            <div class="flex items-center bg-ui-input rounded-xs border border-ui-borderSubtle hover:border-ui-borderDefault px-1.5 py-0.5 transition group">
              <span @mousedown="startScrubVector($event, selectedBone.position, 'y', 0.05, 2)" class="text-emerald-400 font-bold text-[10px] pr-1 cursor-ew-resize select-none hover:text-emerald-300" title="Click and drag to scrub T.Y">Y</span>
              <input type="number" step="0.01" v-model.number="selectedBone.position.y" class="w-full bg-transparent text-right text-ui-textPrimary focus:outline-none font-mono text-[11px]" />
            </div>
            <div class="flex items-center bg-ui-input rounded-xs border border-ui-borderSubtle hover:border-ui-borderDefault px-1.5 py-0.5 transition group">
              <span @mousedown="startScrubVector($event, selectedBone.position, 'z', 0.05, 2)" class="text-sky-400 font-bold text-[10px] pr-1 cursor-ew-resize select-none hover:text-sky-300" title="Click and drag to scrub T.Z">Z</span>
              <input type="number" step="0.01" v-model.number="selectedBone.position.z" class="w-full bg-transparent text-right text-ui-textPrimary focus:outline-none font-mono text-[11px]" />
            </div>
          </div>
        </div>

        <!-- Bone Length Controller -->
        <div class="bg-ui-surface p-2 rounded-xs border border-ui-borderSubtle space-y-1.5">
          <div class="flex items-center justify-between">
            <span class="text-[10px] text-ui-textPrimary font-bold">Bone Length</span>
            <div class="flex items-center space-x-1">
              <button @click="adjustBoneLength(-0.1)" class="px-1.5 py-0.5 bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle rounded-xs text-[9px] text-ui-textPrimary font-bold">-0.1</button>
              <span class="text-ui-textAccent font-bold px-1">{{ boneLength }}m</span>
              <button @click="adjustBoneLength(0.1)" class="px-1.5 py-0.5 bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle rounded-xs text-[9px] text-ui-textPrimary font-bold">+0.1</button>
            </div>
          </div>

          <input 
            type="range" 
            min="0.1" 
            max="5.0" 
            step="0.05" 
            v-model.number="boneLength" 
            class="w-full accent-ui-accent bg-ui-input h-1.5 rounded-xs cursor-pointer"
          />

          <div class="grid grid-cols-4 gap-1 pt-0.5">
            <button 
              v-for="preset in [0.5, 1.0, 1.5, 2.0]" 
              :key="preset"
              @click="setPresetBoneLength(preset)"
              class="py-0.5 rounded-xs bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle text-ui-textMuted hover:text-ui-textPrimary text-[9px] transition"
              :class="{ 'border-ui-accent text-ui-textAccent font-bold bg-ui-active': Math.abs(boneLength - preset) < 0.05 }"
            >
              {{ preset }}m
            </button>
          </div>
        </div>

        <!-- Attached Rigid Meshes / Limbs -->
        <div class="bg-ui-surface p-2 rounded-xs border border-ui-borderSubtle space-y-1.5">
          <div class="flex items-center justify-between">
            <span class="text-[10px] text-ui-textPrimary font-bold flex items-center gap-1">
              <Link class="w-3 h-3 text-ui-textAccent" />
              <span>Attached Meshes ({{ attachedMeshes.length }})</span>
            </span>
            <button 
              v-if="activeMesh && activeMesh.parentId !== selectedBone.id"
              @click="animationStore.parentMeshToBone(activeMesh.id, selectedBone.id)"
              class="px-1.5 py-0.5 rounded-xs bg-ui-active text-ui-textAccent hover:bg-ui-accent hover:text-white border border-ui-accent/40 text-[9px] font-bold transition"
              title="Assign active mesh to this bone (100% influence)"
            >
              + Assign Selected
            </button>
          </div>

          <div v-if="attachedMeshes.length > 0" class="space-y-1">
            <div v-for="m in attachedMeshes" :key="m.id" class="flex items-center justify-between bg-ui-input px-2 py-1 rounded-xs text-[10px] text-ui-textPrimary border border-ui-borderSubtle">
              <span class="truncate">{{ m.name }}</span>
              <button @click="animationStore.parentMeshToBone(m.id, null)" class="text-ui-textMuted hover:text-rose-400 transition" title="Detach mesh">
                <Trash2 class="w-2.5 h-2.5" />
              </button>
            </div>
          </div>
          <div v-else class="text-[9px] text-ui-textMuted italic">
            No meshes attached. Select a mesh and click Assign.
          </div>
        </div>
      </div>

      <div v-else class="text-ui-textMuted text-center py-6 italic text-[11px]">
        Select a bone in the 3D viewport or Outliner to edit its transform properties.
      </div>
    </div>

    <!-- TAB 2: PROCEDURAL ANIMATIONS & MOTION BLENDING -->
    <div v-show="activeTab === 'proc' || activeTab === 'blend'" class="space-y-3 font-sans">
      <!-- Motion Blending Tool -->
      <div class="bg-ui-surface p-2.5 rounded-xs border border-ui-borderSubtle space-y-2">
        <span class="text-[11px] font-bold text-ui-textAccent uppercase tracking-wider flex items-center gap-1.5">
          <Sparkles class="w-3.5 h-3.5 text-amber-400" />
          <span>Motion Blend Tool</span>
        </span>
        <p class="text-[10px] text-ui-textMuted leading-relaxed">
          Preview real-time transition blending between any two animation clips using spherical interpolation.
        </p>

        <!-- Clip A Selector -->
        <div class="space-y-1">
          <span class="text-[10px] text-ui-textPrimary font-semibold">Clip A (Source):</span>
          <select v-model="blendClipAId" class="w-full bg-ui-input border border-ui-borderDefault rounded-xs px-2 py-1 text-ui-textPrimary text-xs focus:outline-none focus:border-ui-accent cursor-pointer">
            <option value="" class="bg-ui-panel text-ui-textMuted">-- Select Clip A --</option>
            <option v-for="c in animationStore.armature.clips" :key="c.id" :value="c.id" class="bg-ui-panel text-ui-textPrimary">{{ c.name }}</option>
          </select>
        </div>

        <!-- Clip B Selector -->
        <div class="space-y-1">
          <span class="text-[10px] text-ui-textPrimary font-semibold">Clip B (Target):</span>
          <select v-model="blendClipBId" class="w-full bg-ui-input border border-ui-borderDefault rounded-xs px-2 py-1 text-ui-textPrimary text-xs focus:outline-none focus:border-ui-accent cursor-pointer">
            <option value="" class="bg-ui-panel text-ui-textMuted">-- Select Clip B --</option>
            <option v-for="c in animationStore.armature.clips" :key="c.id" :value="c.id" class="bg-ui-panel text-ui-textPrimary">{{ c.name }}</option>
          </select>
        </div>

        <!-- Blend Slider -->
        <div class="space-y-1 pt-1">
          <div class="flex justify-between text-[10px] text-ui-textPrimary">
            <span>Blend Factor:</span>
            <span class="text-ui-textAccent font-bold font-mono">{{ Math.round(blendFactor * 100) }}%</span>
          </div>
          <input 
            type="range" 
            min="0" 
            max="1" 
            step="0.01" 
            v-model.number="blendFactor" 
            @input="applyBlendPreview"
            class="w-full accent-ui-accent bg-ui-input h-1.5 rounded-xs cursor-pointer"
          />
          <div class="flex justify-between text-[9px] text-ui-textMuted">
            <span>Clip A (100%)</span>
            <span>50/50</span>
            <span>Clip B (100%)</span>
          </div>
        </div>

        <button 
          @click="applyBlendPreview"
          class="w-full py-1.5 rounded-xs bg-ui-accent hover:bg-ui-accentHover text-white font-bold text-xs shadow-xs transition cursor-pointer"
        >
          Update Live Blend Preview
        </button>
      </div>
      <!-- Characters & Creatures -->
      <div class="bg-ui-surface p-2.5 rounded-xs border border-ui-borderSubtle space-y-1.5">
        <span class="text-[11px] font-bold text-ui-textAccent flex items-center gap-1.5">
          <Wand2 class="w-3.5 h-3.5" />
          <span>Characters & Creatures</span>
        </span>

        <div class="space-y-1 pt-1">
          <button 
            @click="animationStore.generateWalkCycle"
            class="w-full py-1 px-2 rounded-xs bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle text-ui-textPrimary text-[11px] flex items-center justify-between transition"
          >
            <span>Biped Walk Cycle</span>
            <span class="text-[9px] text-ui-textMuted bg-ui-panel px-1 rounded-xs">2.0s</span>
          </button>

          <button 
            @click="animationStore.generateQuadrupedWalk"
            class="w-full py-1 px-2 rounded-xs bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle text-ui-textPrimary text-[11px] flex items-center justify-between transition"
          >
            <span>Quadruped 4-Leg Walk</span>
            <span class="text-[9px] text-ui-textMuted bg-ui-panel px-1 rounded-xs">2.0s</span>
          </button>

          <button 
            @click="animationStore.generateWingFlap"
            class="w-full py-1 px-2 rounded-xs bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle text-ui-textPrimary text-[11px] flex items-center justify-between transition"
          >
            <span>Wing Flap / Fly</span>
            <span class="text-[9px] text-ui-textMuted bg-ui-panel px-1 rounded-xs">1.3s</span>
          </button>

          <button 
            @click="animationStore.generateBirdDrink"
            class="w-full py-1 px-2 rounded-xs bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle text-ui-textPrimary text-[11px] flex items-center justify-between transition"
          >
            <span>Bird Drink / Pecker</span>
            <span class="text-[9px] text-ui-textMuted bg-ui-panel px-1 rounded-xs">2.0s</span>
          </button>

          <button 
            @click="animationStore.generateTailWiggle"
            class="w-full py-1 px-2 rounded-xs bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle text-ui-textPrimary text-[11px] flex items-center justify-between transition"
          >
            <span>Tail / Tentacle Wave</span>
            <span class="text-[9px] text-ui-textMuted bg-ui-panel px-1 rounded-xs">2.0s</span>
          </button>

          <button 
            @click="animationStore.generateIdleBreathe"
            class="w-full py-1 px-2 rounded-xs bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle text-ui-textPrimary text-[11px] flex items-center justify-between transition"
          >
            <span>Idle Breathe Cycle</span>
            <span class="text-[9px] text-ui-textMuted bg-ui-panel px-1 rounded-xs">2.0s</span>
          </button>
        </div>
      </div>

      <!-- Props, Items & Mechanical -->
      <div class="bg-ui-surface p-2.5 rounded-xs border border-ui-borderSubtle space-y-1.5">
        <span class="text-[11px] font-bold text-ui-textAccent flex items-center gap-1.5">
          <Sparkles class="w-3.5 h-3.5" />
          <span>Props & Mechanical Objects</span>
        </span>

        <div class="space-y-1 pt-1">
          <button 
            @click="animationStore.generateSpinLoop"
            class="w-full py-1 px-2 rounded-xs bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle text-ui-textPrimary text-[11px] flex items-center justify-between transition"
          >
            <span>360 Spin / Turn Loop</span>
            <span class="text-[9px] text-ui-textMuted bg-ui-panel px-1 rounded-xs">2.0s</span>
          </button>

          <button 
            @click="animationStore.generateFloatingBob"
            class="w-full py-1 px-2 rounded-xs bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle text-ui-textPrimary text-[11px] flex items-center justify-between transition"
          >
            <span>Floating Bob / Hover</span>
            <span class="text-[9px] text-ui-textMuted bg-ui-panel px-1 rounded-xs">2.0s</span>
          </button>

          <button 
            @click="animationStore.generateDoorOpenClose"
            class="w-full py-1 px-2 rounded-xs bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle text-ui-textPrimary text-[11px] flex items-center justify-between transition"
          >
            <span>Door / Chest Open & Close</span>
            <span class="text-[9px] text-ui-textMuted bg-ui-panel px-1 rounded-xs">2.0s</span>
          </button>

          <button 
            @click="animationStore.generateJumpArc"
            class="w-full py-1 px-2 rounded-xs bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle text-ui-textPrimary text-[11px] flex items-center justify-between transition"
          >
            <span>Jump Arc & Landing</span>
            <span class="text-[9px] text-ui-textMuted bg-ui-panel px-1 rounded-xs">1.6s</span>
          </button>

          <button 
            @click="animationStore.generateAttackSlash"
            class="w-full py-1 px-2 rounded-xs bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle text-ui-textPrimary text-[11px] flex items-center justify-between transition"
          >
            <span>Attack Slash & Strike</span>
            <span class="text-[9px] text-ui-textMuted bg-ui-panel px-1 rounded-xs">1.3s</span>
          </button>

          <button 
            @click="animationStore.generateImpactShake"
            class="w-full py-1 px-2 rounded-xs bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle text-ui-textPrimary text-[11px] flex items-center justify-between transition"
          >
            <span>Impact Shake / Recoil</span>
            <span class="text-[9px] text-ui-textMuted bg-ui-panel px-1 rounded-xs">1.0s</span>
          </button>
        </div>
      </div>
    </div>

    <!-- TAB 3: ANIMATIONS MANAGER (Anims Stack) -->
    <div v-show="activeTab === 'anims'" class="space-y-2.5">
      <!-- Create New Clip Bar -->
      <div class="flex items-center space-x-1.5">
        <input 
          v-model="newClipTitle"
          placeholder="New Clip Name..."
          class="flex-1 bg-ui-input border border-ui-borderDefault text-ui-textPrimary px-2 py-1 rounded-xs text-xs focus:outline-none focus:border-ui-accent"
          @keydown.enter="handleCreateClip"
        />
        <button 
          @click="handleCreateClip"
          class="px-2.5 py-1 rounded-xs bg-ui-accent hover:bg-ui-accentHover text-white font-bold flex items-center space-x-1 shadow-xs transition"
          title="Add New Animation Clip"
        >
          <Plus class="w-3.5 h-3.5" />
          <span>Add</span>
        </button>
      </div>

      <!-- Animation Clips List -->
      <div class="space-y-1.5">
        <div 
          v-for="clip in animationStore.armature.clips" 
          :key="clip.id"
          @click="animationStore.selectClip(clip.id)"
          class="p-2 rounded-xs border transition cursor-pointer flex flex-col space-y-1.5"
          :class="animationStore.activeClip?.id === clip.id ? 'bg-ui-active border-ui-accent shadow-xs' : 'bg-ui-surface border-ui-borderSubtle hover:border-ui-borderDefault'"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-1.5 truncate">
              <Film class="w-3.5 h-3.5 text-ui-textAccent" />
              <input 
                :value="clip.name"
                @change="animationStore.renameClip(clip.id, ($event.target as HTMLInputElement).value)"
                @click.stop
                class="bg-transparent font-bold text-ui-textPrimary text-xs focus:outline-none border-b border-transparent focus:border-ui-accent truncate max-w-[110px]"
              />
            </div>

            <!-- Clip Actions: Duplicate & Delete -->
            <div class="flex items-center space-x-1">
              <button 
                @click.stop="handleDuplicateClip(clip.id)"
                class="text-ui-textMuted hover:text-ui-textPrimary p-1"
                title="Duplicate Clip"
              >
                <Copy class="w-3 h-3" />
              </button>

              <button 
                v-if="animationStore.armature.clips.length > 1" 
                @click.stop="handleDeleteClip(clip.id)" 
                class="text-ui-textMuted hover:text-rose-400 p-1" 
                title="Delete Clip"
              >
                <Trash2 class="w-3 h-3" />
              </button>
            </div>
          </div>

          <!-- Clip Settings: Duration, FPS, Loop -->
          <div class="flex items-center justify-between text-[10px] text-ui-textMuted pt-1 border-t border-ui-borderSubtle" @click.stop>
            <div class="flex items-center space-x-1">
              <span>Frames:</span>
              <input 
                type="number" 
                v-model.number="clip.durationFrames" 
                class="w-10 bg-ui-input border border-ui-borderSubtle text-center text-ui-textPrimary rounded-xs py-0.5 focus:outline-none font-mono"
              />
            </div>

            <div class="flex items-center space-x-1">
              <span>FPS:</span>
              <input 
                type="number" 
                v-model.number="clip.fps" 
                class="w-8 bg-ui-input border border-ui-borderSubtle text-center text-ui-textPrimary rounded-xs py-0.5 focus:outline-none font-mono"
              />
            </div>

            <label class="flex items-center space-x-1 cursor-pointer">
              <input type="checkbox" v-model="clip.loop" class="rounded-xs bg-ui-input border-ui-borderSubtle text-ui-accent focus:ring-0" />
              <span>Loop</span>
            </label>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 4: MESH PROPERTIES & BONE PARENTING / SKINNING -->
    <div v-show="activeTab === 'mesh'" class="space-y-2.5">
      <div v-if="activeMesh" class="space-y-2">
        <div class="bg-ui-surface p-2.5 rounded-xs border border-ui-borderSubtle space-y-1.5">
          <div class="flex justify-between text-ui-textMuted">
            <span>Mesh:</span>
            <span class="text-ui-textPrimary font-bold">{{ activeMesh.name }}</span>
          </div>
          <div class="flex justify-between text-ui-textMuted">
            <span>Vertices:</span>
            <span class="text-ui-textPrimary">{{ activeMesh.vertices.length }}</span>
          </div>
          <div class="flex justify-between text-ui-textMuted">
            <span>Faces:</span>
            <span class="text-ui-textPrimary">{{ activeMesh.faces.length }}</span>
          </div>
          <div class="flex justify-between text-ui-textMuted">
            <span>Skinning:</span>
            <span :class="activeMesh.vertices.some(v => v.boneWeights && Object.keys(v.boneWeights).length > 0) ? 'text-emerald-400 font-bold' : 'text-ui-textMuted'">
              {{ activeMesh.vertices.filter(v => v.boneWeights && Object.keys(v.boneWeights).length > 0).length }} / {{ activeMesh.vertices.length }} Verts Weighted
            </span>
          </div>
        </div>

        <!-- Rigid Bone Parenting -->
        <div class="bg-ui-surface p-2.5 rounded-xs border border-ui-borderSubtle space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-[10px] text-ui-textMuted font-bold flex items-center gap-1">
              <Link class="w-3 h-3 text-ui-textAccent" />
              <span>Rigid Parent:</span>
            </span>
            <button 
              v-if="activeMesh.parentId"
              @click="animationStore.parentMeshToBone(activeMesh.id, null)"
              class="text-[9px] text-rose-400 hover:underline flex items-center gap-0.5"
            >
              <Unlink class="w-2.5 h-2.5" />
              <span>Unlink</span>
            </button>
          </div>
          <select 
            :value="activeMesh.parentId || 'none'"
            @change="animationStore.parentMeshToBone(activeMesh.id, ($event.target as HTMLSelectElement).value === 'none' ? null : ($event.target as HTMLSelectElement).value)"
            class="w-full bg-ui-input border border-ui-borderDefault rounded-xs px-2 py-1 text-ui-textPrimary text-xs focus:outline-none focus:border-ui-accent cursor-pointer"
          >
            <option value="none" class="bg-ui-panel text-ui-textMuted">-- Unparented (World Space) --</option>
            <optgroup label="Skeletal Bones">
              <option v-for="b in animationStore.armature.bones" :key="b.id" :value="b.id" class="bg-ui-panel text-ui-textPrimary">
                Bone: {{ b.name }}
              </option>
            </optgroup>
            <optgroup label="Other Mesh Objects">
              <option v-for="m in projectStore.meshes.filter(m => m.id !== activeMesh?.id)" :key="m.id" :value="m.id" class="bg-ui-panel text-ui-textPrimary">
                Mesh: {{ m.name }}
              </option>
            </optgroup>
          </select>
        </div>

        <!-- 1-Click Smooth Skinning & Auto Weighting -->
        <div class="bg-ui-surface p-2.5 rounded-xs border border-ui-borderSubtle space-y-2">
          <span class="text-[10px] text-ui-textMuted font-bold flex items-center gap-1">
            <Sparkles class="w-3 h-3 text-amber-400" />
            <span>Organic Linear Blend Skinning:</span>
          </span>
          <button 
            @click="animationStore.autoWeightMeshToBones(activeMesh)"
            class="w-full py-1.5 px-2 bg-ui-accent hover:bg-ui-accentHover text-white rounded-xs font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition"
          >
            <Wand2 class="w-3 h-3" />
            <span>Auto-Calculate Vertex Weights</span>
          </button>
          <p class="text-[9px] text-ui-textMuted leading-tight">
            Computes proximity bone weights for each vertex so rotating joints smoothly deforms organic shapes (limbs, tails, bodies).
          </p>
        </div>
      </div>

      <div v-else class="text-ui-textMuted text-center py-6 italic text-[11px]">
        No mesh currently selected. Click a model in the viewport.
      </div>
    </div>

    <!-- TAB 5: COMPREHENSIVE SETTINGS (Settings) -->
    <div v-show="activeTab === 'settings'" class="space-y-3">
      <!-- 1. Playback Engine Settings -->
      <div class="bg-ui-surface p-2.5 rounded-xs border border-ui-borderSubtle space-y-2">
        <span class="text-[11px] font-bold text-ui-textAccent uppercase tracking-wider flex items-center gap-1.5">
          <Settings class="w-3.5 h-3.5" />
          <span>Playback & Engine</span>
        </span>

        <!-- FPS Setting -->
        <div class="space-y-1">
          <div class="flex items-center justify-between text-[10px] text-ui-textMuted">
            <span>Frame Rate (FPS):</span>
            <span class="text-ui-textAccent font-bold">{{ animationStore.activeClip?.fps || 12 }} FPS</span>
          </div>
          <div class="grid grid-cols-5 gap-1">
            <button 
              v-for="fps in [8, 12, 24, 30, 60]" 
              :key="fps"
              @click="setClipFps(fps)"
              class="py-0.5 rounded-xs text-[9px] border transition"
              :class="animationStore.activeClip?.fps === fps ? 'bg-ui-accent border-ui-accent text-white font-bold' : 'bg-ui-input border-ui-borderSubtle text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
            >
              {{ fps }}
            </button>
          </div>
        </div>

        <!-- Playback Speed -->
        <div class="space-y-1 pt-1 border-t border-ui-borderSubtle">
          <div class="flex items-center justify-between text-[10px] text-ui-textMuted">
            <span>Playback Speed:</span>
            <span class="text-ui-textAccent font-bold">{{ animationStore.playbackSpeed }}x</span>
          </div>
          <div class="grid grid-cols-5 gap-1">
            <button 
              v-for="spd in [0.25, 0.5, 1.0, 1.5, 2.0]" 
              :key="spd"
              @click="animationStore.playbackSpeed = spd"
              class="py-0.5 rounded-xs text-[9px] border transition"
              :class="animationStore.playbackSpeed === spd ? 'bg-ui-accent border-ui-accent text-white font-bold' : 'bg-ui-input border-ui-borderSubtle text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
            >
              {{ spd }}x
            </button>
          </div>
        </div>

        <!-- Loop Mode -->
        <div class="space-y-1 pt-1 border-t border-ui-borderSubtle">
          <span class="text-[10px] text-ui-textMuted">Loop Mode:</span>
          <div class="grid grid-cols-3 gap-1">
            <button 
              @click="animationStore.loopMode = 'loop'"
              class="py-1 rounded-xs text-[10px] border transition"
              :class="animationStore.loopMode === 'loop' ? 'bg-ui-accent border-ui-accent text-white font-bold' : 'bg-ui-input border-ui-borderSubtle text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
            >
              Loop
            </button>
            <button 
              @click="animationStore.loopMode = 'pingpong'"
              class="py-1 rounded-xs text-[10px] border transition"
              :class="animationStore.loopMode === 'pingpong' ? 'bg-ui-accent border-ui-accent text-white font-bold' : 'bg-ui-input border-ui-borderSubtle text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
            >
              Ping-Pong
            </button>
            <button 
              @click="animationStore.loopMode = 'once'"
              class="py-1 rounded-xs text-[10px] border transition"
              :class="animationStore.loopMode === 'once' ? 'bg-ui-accent border-ui-accent text-white font-bold' : 'bg-ui-input border-ui-borderSubtle text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
            >
              Once
            </button>
          </div>
        </div>
      </div>

      <!-- 2. Visual & Viewport Overlays -->
      <div class="bg-ui-surface p-2.5 rounded-xs border border-ui-borderSubtle space-y-2">
        <span class="text-[11px] font-bold text-ui-textAccent uppercase tracking-wider flex items-center gap-1.5">
          <Eye class="w-3.5 h-3.5" />
          <span>Viewport & Overlays</span>
        </span>

        <!-- Auto-Keying Toggle -->
        <label class="flex items-center justify-between p-1.5 bg-ui-input rounded-xs border border-ui-borderSubtle cursor-pointer">
          <span class="text-ui-textPrimary">Auto-Keying</span>
          <input type="checkbox" v-model="animationStore.autoKey" class="rounded-xs bg-ui-panel border-ui-borderDefault text-ui-accent" />
        </label>

        <!-- Onion Skinning Toggle -->
        <label class="flex items-center justify-between p-1.5 bg-ui-input rounded-xs border border-ui-borderSubtle cursor-pointer">
          <span class="text-ui-textPrimary">Onion Skinning</span>
          <input type="checkbox" v-model="animationStore.onionSkin" class="rounded-xs bg-ui-panel border-ui-borderDefault text-ui-accent" />
        </label>

        <!-- X-Ray Bones Toggle -->
        <label class="flex items-center justify-between p-1.5 bg-ui-input rounded-xs border border-ui-borderSubtle cursor-pointer">
          <span class="text-ui-textPrimary">X-Ray Bones (See Through)</span>
          <input type="checkbox" v-model="animationStore.xrayBones" class="rounded-xs bg-ui-panel border-ui-borderDefault text-ui-accent" />
        </label>
      </div>
    </div>
  </div>
</template>
