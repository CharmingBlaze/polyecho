<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAnimationStore } from '../../stores/animationStore'
import { useProjectStore } from '../../stores/projectStore'
import BlenderIcon from '../icons/BlenderIcon.vue'
import { 
  Trash2, 
  Copy, 
  Plus, 
  Sparkles, 
  ChevronDown, 
  Link, 
  Wand2, 
  Settings,
  Eye
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
  <div class="h-full w-full bg-dcc-900 flex flex-col select-none overflow-y-auto p-3 text-slate-200 space-y-3 font-mono text-xs">
    <!-- Properties Header Tab Bar (Bone | Blend | Proc | Mesh | Anims | Settings) -->
    <div class="border-b border-dcc-750 pb-2">
      <div class="text-[10px] text-slate-400 font-bold mb-1.5 uppercase tracking-wider">Animation Properties</div>
      <div class="grid grid-cols-6 gap-1 bg-dcc-900 p-0.5 rounded border border-dcc-750 text-[10px]">
        <button 
          @click="activeTab = 'bone'"
          class="py-1 rounded text-center transition flex items-center justify-center gap-1"
          :class="activeTab === 'bone' ? 'bg-indigo-600 text-white font-bold shadow-xs' : 'text-slate-400 hover:text-slate-200'"
        >
          <BlenderIcon name="bone" :size="11" />
          <span>Bone</span>
        </button>

        <button 
          @click="activeTab = 'blend'"
          class="py-1 rounded text-center transition flex items-center justify-center gap-1"
          :class="activeTab === 'blend' ? 'bg-indigo-600 text-white font-bold shadow-xs' : 'text-slate-400 hover:text-slate-200'"
          title="GLB Animator Blend Tool"
        >
          <Sparkles class="w-2.5 h-2.5" />
          <span>Blend</span>
        </button>

        <button 
          @click="activeTab = 'proc'"
          class="py-1 rounded text-center transition flex items-center justify-center gap-1"
          :class="activeTab === 'proc' ? 'bg-indigo-600 text-white font-bold shadow-xs' : 'text-slate-400 hover:text-slate-200'"
        >
          <Wand2 class="w-2.5 h-2.5" />
          <span>Proc</span>
        </button>

        <button 
          @click="activeTab = 'mesh'"
          class="py-1 rounded text-center transition flex items-center justify-center gap-1"
          :class="activeTab === 'mesh' ? 'bg-indigo-600 text-white font-bold shadow-xs' : 'text-slate-400 hover:text-slate-200'"
        >
          <BlenderIcon name="mesh-cube" :size="11" />
          <span>Mesh</span>
        </button>

        <button 
          @click="activeTab = 'anims'"
          class="py-1 rounded text-center transition flex items-center justify-center gap-1"
          :class="activeTab === 'anims' ? 'bg-indigo-600 text-white font-bold shadow-xs' : 'text-slate-400 hover:text-slate-200'"
        >
          <BlenderIcon name="pose" :size="11" />
          <span>Anims</span>
        </button>

        <button 
          @click="activeTab = 'settings'"
          class="py-1 rounded text-center transition flex items-center justify-center gap-0.5"
          :class="activeTab === 'settings' ? 'bg-indigo-600 text-white font-bold shadow-xs' : 'text-slate-400 hover:text-slate-200'"
          title="Animation Settings"
        >
          <Settings class="w-3 h-3" />
        </button>
      </div>
    </div>

    <!-- TAB 1: BONE PROPERTIES (GLB Animator Style) -->
    <div v-show="activeTab === 'bone'" class="space-y-3">
      <div v-if="selectedBone" class="space-y-2.5">
        <!-- Header: ▼ Bone: Name -->
        <div class="bg-dcc-850 px-2.5 py-1.5 rounded border border-dcc-750 flex items-center justify-between text-indigo-300 font-bold">
          <div class="flex items-center space-x-1.5 truncate">
            <ChevronDown class="w-3.5 h-3.5 text-indigo-400" />
            <span class="truncate">Bone: {{ selectedBone.name }}</span>
          </div>
          <button @click="animationStore.resetPose" class="text-[10px] text-slate-400 hover:text-white px-1.5 py-0.5 rounded bg-dcc-900 border border-dcc-700" title="Reset Pose (Alt+R)">
            Reset
          </button>
        </div>

        <!-- Meta info: Index & Parent -->
        <div class="bg-dcc-850 p-2 rounded border border-dcc-750 space-y-1.5 text-[11px]">
          <div class="flex justify-between text-slate-400">
            <span>Index:</span>
            <span class="text-slate-200 font-bold">{{ selectedBoneIndex }}</span>
          </div>
          <div class="flex justify-between text-slate-400">
            <span>Parent:</span>
            <span class="text-indigo-300 font-bold truncate max-w-[120px]">{{ parentBoneName }}</span>
          </div>
        </div>

        <!-- Position (world) -->
        <div class="bg-dcc-850 p-2 rounded border border-dcc-750 space-y-1.5">
          <span class="text-[10px] text-slate-400 font-bold">Position (world):</span>
          <div class="space-y-1">
            <div class="flex items-center justify-between bg-dcc-900 px-2 py-1 rounded border border-dcc-750">
              <span class="text-rose-400 font-bold text-[10px] w-4">X</span>
              <input type="number" step="0.01" v-model.number="selectedBone.head.x" class="w-20 bg-transparent text-right text-slate-100 focus:outline-none" />
            </div>
            <div class="flex items-center justify-between bg-dcc-900 px-2 py-1 rounded border border-dcc-750">
              <span class="text-emerald-400 font-bold text-[10px] w-4">Y</span>
              <input type="number" step="0.01" v-model.number="selectedBone.head.y" class="w-20 bg-transparent text-right text-slate-100 focus:outline-none" />
            </div>
            <div class="flex items-center justify-between bg-dcc-900 px-2 py-1 rounded border border-dcc-750">
              <span class="text-sky-400 font-bold text-[10px] w-4">Z</span>
              <input type="number" step="0.01" v-model.number="selectedBone.head.z" class="w-20 bg-transparent text-right text-slate-100 focus:outline-none" />
            </div>
          </div>
        </div>

        <!-- Rotation (°) -->
        <div class="bg-dcc-850 p-2 rounded border border-dcc-750 space-y-1.5">
          <span class="text-[10px] text-slate-400 font-bold">Rotation (°):</span>
          <div class="space-y-1">
            <div class="flex items-center justify-between bg-dcc-900 px-2 py-1 rounded border border-dcc-750">
              <span class="text-rose-400 font-bold text-[10px] w-4">X</span>
              <input type="number" step="1" v-model.number="selectedBone.rotation.x" class="w-20 bg-transparent text-right text-slate-100 focus:outline-none" />
            </div>
            <div class="flex items-center justify-between bg-dcc-900 px-2 py-1 rounded border border-dcc-750">
              <span class="text-emerald-400 font-bold text-[10px] w-4">Y</span>
              <input type="number" step="1" v-model.number="selectedBone.rotation.y" class="w-20 bg-transparent text-right text-slate-100 focus:outline-none" />
            </div>
            <div class="flex items-center justify-between bg-dcc-900 px-2 py-1 rounded border border-dcc-750">
              <span class="text-sky-400 font-bold text-[10px] w-4">Z</span>
              <input type="number" step="1" v-model.number="selectedBone.rotation.z" class="w-20 bg-transparent text-right text-slate-100 focus:outline-none" />
            </div>
          </div>
        </div>

        <!-- Translation Offsets (T.X, T.Y, T.Z) -->
        <div class="bg-dcc-850 p-2 rounded border border-dcc-750 space-y-1.5">
          <span class="text-[10px] text-slate-400 font-bold">Translation Offsets (T):</span>
          <div class="space-y-1">
            <div class="flex items-center justify-between bg-dcc-900 px-2 py-1 rounded border border-dcc-750">
              <span class="text-slate-400 text-[10px] w-8">T.X</span>
              <input type="number" step="0.01" v-model.number="selectedBone.position.x" class="w-20 bg-transparent text-right text-slate-100 focus:outline-none" />
            </div>
            <div class="flex items-center justify-between bg-dcc-900 px-2 py-1 rounded border border-dcc-750">
              <span class="text-slate-400 text-[10px] w-8">T.Y</span>
              <input type="number" step="0.01" v-model.number="selectedBone.position.y" class="w-20 bg-transparent text-right text-slate-100 focus:outline-none" />
            </div>
            <div class="flex items-center justify-between bg-dcc-900 px-2 py-1 rounded border border-dcc-750">
              <span class="text-slate-400 text-[10px] w-8">T.Z</span>
              <input type="number" step="0.01" v-model.number="selectedBone.position.z" class="w-20 bg-transparent text-right text-slate-100 focus:outline-none" />
            </div>
          </div>
        </div>

        <!-- Bone Length Controller -->
        <div class="bg-dcc-850 p-2 rounded border border-dcc-750 space-y-1.5">
          <div class="flex items-center justify-between">
            <span class="text-[10px] text-slate-300 font-bold">Bone Length</span>
            <div class="flex items-center space-x-1">
              <button @click="adjustBoneLength(-0.1)" class="px-1.5 py-0.5 bg-dcc-900 hover:bg-dcc-750 border border-dcc-700 rounded text-[9px] text-slate-300 font-bold">-0.1</button>
              <span class="text-indigo-400 font-bold px-1">{{ boneLength }}m</span>
              <button @click="adjustBoneLength(0.1)" class="px-1.5 py-0.5 bg-dcc-900 hover:bg-dcc-750 border border-dcc-700 rounded text-[9px] text-slate-300 font-bold">+0.1</button>
            </div>
          </div>

          <input 
            type="range" 
            min="0.1" 
            max="5.0" 
            step="0.05" 
            v-model.number="boneLength" 
            class="w-full accent-indigo-500 bg-dcc-900 h-1 rounded cursor-pointer"
          />

          <div class="grid grid-cols-4 gap-1 pt-0.5">
            <button 
              v-for="preset in [0.5, 1.0, 1.5, 2.0]" 
              :key="preset"
              @click="setPresetBoneLength(preset)"
              class="py-0.5 rounded bg-dcc-900 hover:bg-dcc-750 border border-dcc-700 text-slate-400 hover:text-slate-200 text-[9px] transition"
              :class="{ 'border-indigo-500 text-indigo-300 font-bold': Math.abs(boneLength - preset) < 0.05 }"
            >
              {{ preset }}m
            </button>
          </div>
        </div>

        <!-- Attached Rigid Meshes / Limbs (Section 3 & 15) -->
        <div class="bg-dcc-850 p-2 rounded border border-dcc-750 space-y-1.5">
          <div class="flex items-center justify-between">
            <span class="text-[10px] text-slate-300 font-bold flex items-center gap-1">
              <Link class="w-3 h-3 text-cyan-400" />
              <span>Attached Meshes ({{ attachedMeshes.length }})</span>
            </span>
            <button 
              v-if="activeMesh && activeMesh.parentId !== selectedBone.id"
              @click="animationStore.parentMeshToBone(activeMesh.id, selectedBone.id)"
              class="px-1.5 py-0.5 rounded bg-cyan-600/30 hover:bg-cyan-600 text-cyan-300 hover:text-white border border-cyan-500/40 text-[9px] font-bold transition"
              title="Assign active mesh to this bone (100% influence)"
            >
              + Assign Selected
            </button>
          </div>

          <div v-if="attachedMeshes.length > 0" class="space-y-1">
            <div v-for="m in attachedMeshes" :key="m.id" class="flex items-center justify-between bg-dcc-900 px-2 py-1 rounded text-[10px] text-slate-200 border border-dcc-750">
              <span class="truncate">{{ m.name }}</span>
              <button @click="animationStore.parentMeshToBone(m.id, null)" class="text-slate-400 hover:text-rose-400 transition" title="Detach mesh">
                <Trash2 class="w-2.5 h-2.5" />
              </button>
            </div>
          </div>
          <div v-else class="text-[9px] text-slate-500 italic">
            No meshes attached. Select a mesh and click Assign.
          </div>
        </div>
      </div>

      <div v-else class="text-slate-500 text-center py-6 italic text-[11px]">
        Select a bone in the 3D viewport or Outliner to edit its transform properties.
      </div>
    </div>

    <!-- TAB: ANIMATION BLEND TOOL (GLB Animator Style - Section 69) -->
    <div v-show="activeTab === 'blend'" class="space-y-3">
      <div class="bg-dcc-850 p-2.5 rounded border border-dcc-750 space-y-2">
        <span class="text-[11px] font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
          <Sparkles class="w-3.5 h-3.5" />
          <span>Animation Blend Tool</span>
        </span>
        <p class="text-[10px] text-slate-400">
          Preview real-time transition blending between any two animation clips using spherical interpolation.
        </p>

        <!-- Clip A Selector -->
        <div class="space-y-1">
          <span class="text-[10px] text-slate-300 font-bold">Clip A (Source):</span>
          <select v-model="blendClipAId" class="w-full bg-dcc-900 border border-dcc-750 rounded px-2 py-1 text-slate-200 text-xs">
            <option value="">-- Select Clip A --</option>
            <option v-for="c in animationStore.armature.clips" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>

        <!-- Clip B Selector -->
        <div class="space-y-1">
          <span class="text-[10px] text-slate-300 font-bold">Clip B (Target):</span>
          <select v-model="blendClipBId" class="w-full bg-dcc-900 border border-dcc-750 rounded px-2 py-1 text-slate-200 text-xs">
            <option value="">-- Select Clip B --</option>
            <option v-for="c in animationStore.armature.clips" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>

        <!-- Blend Slider -->
        <div class="space-y-1 pt-1">
          <div class="flex justify-between text-[10px] text-slate-300">
            <span>Blend Factor:</span>
            <span class="text-indigo-400 font-bold">{{ Math.round(blendFactor * 100) }}%</span>
          </div>
          <input 
            type="range" 
            min="0" 
            max="1" 
            step="0.01" 
            v-model.number="blendFactor" 
            @input="applyBlendPreview"
            class="w-full accent-indigo-500 bg-dcc-900 h-1.5 rounded cursor-pointer"
          />
          <div class="flex justify-between text-[9px] text-slate-500">
            <span>Clip A (100%)</span>
            <span>50/50</span>
            <span>Clip B (100%)</span>
          </div>
        </div>

        <button 
          @click="applyBlendPreview"
          class="w-full py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-xs transition"
        >
          Update Live Blend Preview
        </button>
      </div>
    </div>

    <!-- TAB 2: PROCEDURAL ANIMATIONS (Proc) -->
    <div v-show="activeTab === 'proc'" class="space-y-2.5">
      <!-- Characters & Creatures -->
      <div class="bg-dcc-850 p-2.5 rounded border border-dcc-750 space-y-1.5">
        <span class="text-[11px] font-bold text-indigo-300 flex items-center gap-1.5">
          <Wand2 class="w-3.5 h-3.5 text-indigo-400" />
          <span>Characters & Creatures</span>
        </span>

        <div class="space-y-1 pt-1">
          <button 
            @click="animationStore.generateWalkCycle"
            class="w-full py-1 px-2 rounded bg-dcc-900 hover:bg-dcc-750 border border-dcc-750 text-indigo-200 text-[11px] flex items-center justify-between transition"
          >
            <span>Biped Walk Cycle</span>
            <span class="text-[9px] text-slate-400 bg-dcc-800 px-1 rounded">2.0s</span>
          </button>

          <button 
            @click="animationStore.generateQuadrupedWalk"
            class="w-full py-1 px-2 rounded bg-dcc-900 hover:bg-dcc-750 border border-dcc-750 text-indigo-200 text-[11px] flex items-center justify-between transition"
          >
            <span>Quadruped 4-Leg Walk</span>
            <span class="text-[9px] text-slate-400 bg-dcc-800 px-1 rounded">2.0s</span>
          </button>

          <button 
            @click="animationStore.generateWingFlap"
            class="w-full py-1 px-2 rounded bg-dcc-900 hover:bg-dcc-750 border border-dcc-750 text-indigo-200 text-[11px] flex items-center justify-between transition"
          >
            <span>Wing Flap / Fly</span>
            <span class="text-[9px] text-slate-400 bg-dcc-800 px-1 rounded">1.3s</span>
          </button>

          <button 
            @click="animationStore.generateBirdDrink"
            class="w-full py-1 px-2 rounded bg-dcc-900 hover:bg-dcc-750 border border-dcc-750 text-indigo-200 text-[11px] flex items-center justify-between transition"
          >
            <span>Bird Drink / Pecker</span>
            <span class="text-[9px] text-slate-400 bg-dcc-800 px-1 rounded">2.0s</span>
          </button>

          <button 
            @click="animationStore.generateTailWiggle"
            class="w-full py-1 px-2 rounded bg-dcc-900 hover:bg-dcc-750 border border-dcc-750 text-indigo-200 text-[11px] flex items-center justify-between transition"
          >
            <span>Tail / Tentacle Wave</span>
            <span class="text-[9px] text-slate-400 bg-dcc-800 px-1 rounded">2.0s</span>
          </button>

          <button 
            @click="animationStore.generateIdleBreathe"
            class="w-full py-1 px-2 rounded bg-dcc-900 hover:bg-dcc-750 border border-dcc-750 text-indigo-200 text-[11px] flex items-center justify-between transition"
          >
            <span>Idle Breathe Cycle</span>
            <span class="text-[9px] text-slate-400 bg-dcc-800 px-1 rounded">2.0s</span>
          </button>
        </div>
      </div>

      <!-- Props, Items & Mechanical -->
      <div class="bg-dcc-850 p-2.5 rounded border border-dcc-750 space-y-1.5">
        <span class="text-[11px] font-bold text-amber-300 flex items-center gap-1.5">
          <Sparkles class="w-3.5 h-3.5 text-amber-400" />
          <span>Props & Mechanical Objects</span>
        </span>

        <div class="space-y-1 pt-1">
          <button 
            @click="animationStore.generateSpinLoop"
            class="w-full py-1 px-2 rounded bg-dcc-900 hover:bg-dcc-750 border border-dcc-750 text-amber-200 text-[11px] flex items-center justify-between transition"
          >
            <span>360 Spin / Turn Loop</span>
            <span class="text-[9px] text-slate-400 bg-dcc-800 px-1 rounded">2.0s</span>
          </button>

          <button 
            @click="animationStore.generateFloatingBob"
            class="w-full py-1 px-2 rounded bg-dcc-900 hover:bg-dcc-750 border border-dcc-750 text-amber-200 text-[11px] flex items-center justify-between transition"
          >
            <span>Floating Bob / Hover</span>
            <span class="text-[9px] text-slate-400 bg-dcc-800 px-1 rounded">2.0s</span>
          </button>

          <button 
            @click="animationStore.generateDoorOpenClose"
            class="w-full py-1 px-2 rounded bg-dcc-900 hover:bg-dcc-750 border border-dcc-750 text-amber-200 text-[11px] flex items-center justify-between transition"
          >
            <span>Door / Chest Open & Close</span>
            <span class="text-[9px] text-slate-400 bg-dcc-800 px-1 rounded">2.0s</span>
          </button>

          <button 
            @click="animationStore.generateJumpArc"
            class="w-full py-1 px-2 rounded bg-dcc-900 hover:bg-dcc-750 border border-dcc-750 text-indigo-200 text-[11px] flex items-center justify-between transition"
          >
            <span>Jump Arc & Landing</span>
            <span class="text-[9px] text-slate-400 bg-dcc-800 px-1 rounded">1.6s</span>
          </button>

          <button 
            @click="animationStore.generateAttackSlash"
            class="w-full py-1 px-2 rounded bg-dcc-900 hover:bg-dcc-750 border border-dcc-750 text-indigo-200 text-[11px] flex items-center justify-between transition"
          >
            <span>Attack Slash & Strike</span>
            <span class="text-[9px] text-slate-400 bg-dcc-800 px-1 rounded">1.3s</span>
          </button>

          <button 
            @click="animationStore.generateImpactShake"
            class="w-full py-1 px-2 rounded bg-dcc-900 hover:bg-dcc-750 border border-dcc-750 text-amber-200 text-[11px] flex items-center justify-between transition"
          >
            <span>Impact Shake / Recoil</span>
            <span class="text-[9px] text-slate-400 bg-dcc-800 px-1 rounded">1.0s</span>
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
          class="flex-1 bg-dcc-850 border border-dcc-750 text-slate-100 px-2 py-1 rounded text-xs focus:outline-none focus:border-indigo-500"
          @keydown.enter="handleCreateClip"
        />
        <button 
          @click="handleCreateClip"
          class="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-bold flex items-center space-x-1 shadow-xs transition"
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
          class="p-2 rounded border transition cursor-pointer flex flex-col space-y-1.5"
          :class="animationStore.activeClip?.id === clip.id ? 'bg-dcc-850 border-indigo-500/80 shadow-xs' : 'bg-dcc-850/60 border-dcc-750 hover:border-dcc-700'"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-1.5 truncate">
              <Film class="w-3.5 h-3.5 text-indigo-400" />
              <input 
                :value="clip.name"
                @change="animationStore.renameClip(clip.id, ($event.target as HTMLInputElement).value)"
                @click.stop
                class="bg-transparent font-bold text-slate-100 text-xs focus:outline-none border-b border-transparent focus:border-indigo-400 truncate max-w-[110px]"
              />
            </div>

            <!-- Clip Actions: Duplicate & Delete -->
            <div class="flex items-center space-x-1">
              <button 
                @click.stop="handleDuplicateClip(clip.id)"
                class="text-slate-400 hover:text-slate-200 p-1"
                title="Duplicate Clip"
              >
                <Copy class="w-3 h-3" />
              </button>

              <button 
                v-if="animationStore.armature.clips.length > 1"
                @click.stop="handleDeleteClip(clip.id)"
                class="text-slate-400 hover:text-rose-400 p-1"
                title="Delete Clip"
              >
                <Trash2 class="w-3 h-3" />
              </button>
            </div>
          </div>

          <!-- Clip Settings: Duration, FPS, Loop -->
          <div class="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-dcc-750" @click.stop>
            <div class="flex items-center space-x-1">
              <span>Frames:</span>
              <input 
                type="number" 
                v-model.number="clip.durationFrames" 
                class="w-10 bg-dcc-900 border border-dcc-750 text-center text-slate-200 rounded py-0.5 focus:outline-none"
              />
            </div>

            <div class="flex items-center space-x-1">
              <span>FPS:</span>
              <input 
                type="number" 
                v-model.number="clip.fps" 
                class="w-8 bg-dcc-900 border border-dcc-750 text-center text-slate-200 rounded py-0.5 focus:outline-none"
              />
            </div>

            <label class="flex items-center space-x-1 cursor-pointer">
              <input type="checkbox" v-model="clip.loop" class="rounded bg-dcc-900 border-dcc-750 text-indigo-600 focus:ring-0" />
              <span>Loop</span>
            </label>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 4: MESH PROPERTIES & BONE PARENTING -->
    <div v-show="activeTab === 'mesh'" class="space-y-2.5">
      <div v-if="activeMesh" class="space-y-2">
        <div class="bg-dcc-850 p-2.5 rounded border border-dcc-750 space-y-1.5">
          <div class="flex justify-between text-slate-400">
            <span>Name:</span>
            <span class="text-slate-200 font-bold">{{ activeMesh.name }}</span>
          </div>
          <div class="flex justify-between text-slate-400">
            <span>Vertices:</span>
            <span class="text-slate-200">{{ activeMesh.vertices.length }}</span>
          </div>
          <div class="flex justify-between text-slate-400">
            <span>Faces:</span>
            <span class="text-slate-200">{{ activeMesh.faces.length }}</span>
          </div>
        </div>

        <!-- Rigid Bone Parenting -->
        <div class="bg-dcc-850 p-2.5 rounded border border-dcc-750 space-y-1.5">
          <span class="text-[10px] text-slate-400 font-bold flex items-center gap-1">
            <Link class="w-3 h-3 text-indigo-400" />
            <span>Parent Bone:</span>
          </span>
          <select 
            :value="activeMesh.parentId || 'none'"
            @change="animationStore.parentMeshToBone(activeMesh.id, ($event.target as HTMLSelectElement).value === 'none' ? null : ($event.target as HTMLSelectElement).value)"
            class="w-full bg-dcc-900 border border-dcc-750 rounded px-2 py-1 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
          >
            <option value="none">-- Unparented (World) --</option>
            <option v-for="b in animationStore.armature.bones" :key="b.id" :value="b.id">
              {{ b.name }}
            </option>
          </select>
        </div>
      </div>

      <div v-else class="text-slate-500 text-center py-6 italic text-[11px]">
        No mesh currently selected.
      </div>
    </div>

    <!-- TAB 5: COMPREHENSIVE SETTINGS (Settings) -->
    <div v-show="activeTab === 'settings'" class="space-y-3">
      <!-- 1. Playback Engine Settings -->
      <div class="bg-dcc-850 p-2.5 rounded border border-dcc-750 space-y-2">
        <span class="text-[11px] font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
          <Settings class="w-3.5 h-3.5" />
          <span>Playback & Engine</span>
        </span>

        <!-- FPS Setting -->
        <div class="space-y-1">
          <div class="flex items-center justify-between text-[10px] text-slate-400">
            <span>Frame Rate (FPS):</span>
            <span class="text-indigo-400 font-bold">{{ animationStore.activeClip?.fps || 12 }} FPS</span>
          </div>
          <div class="grid grid-cols-5 gap-1">
            <button 
              v-for="fps in [8, 12, 24, 30, 60]" 
              :key="fps"
              @click="setClipFps(fps)"
              class="py-0.5 rounded text-[9px] border transition"
              :class="animationStore.activeClip?.fps === fps ? 'bg-indigo-600 border-indigo-400 text-white font-bold' : 'bg-dcc-900 border-dcc-750 text-slate-400 hover:text-slate-200'"
            >
              {{ fps }}
            </button>
          </div>
        </div>

        <!-- Playback Speed -->
        <div class="space-y-1 pt-1 border-t border-dcc-750">
          <div class="flex items-center justify-between text-[10px] text-slate-400">
            <span>Playback Speed:</span>
            <span class="text-indigo-400 font-bold">{{ animationStore.playbackSpeed }}x</span>
          </div>
          <div class="grid grid-cols-5 gap-1">
            <button 
              v-for="spd in [0.25, 0.5, 1.0, 1.5, 2.0]" 
              :key="spd"
              @click="animationStore.playbackSpeed = spd"
              class="py-0.5 rounded text-[9px] border transition"
              :class="animationStore.playbackSpeed === spd ? 'bg-indigo-600 border-indigo-400 text-white font-bold' : 'bg-dcc-900 border-dcc-750 text-slate-400 hover:text-slate-200'"
            >
              {{ spd }}x
            </button>
          </div>
        </div>

        <!-- Loop Mode -->
        <div class="space-y-1 pt-1 border-t border-dcc-750">
          <span class="text-[10px] text-slate-400">Loop Mode:</span>
          <div class="grid grid-cols-3 gap-1">
            <button 
              @click="animationStore.loopMode = 'loop'"
              class="py-1 rounded text-[10px] border transition"
              :class="animationStore.loopMode === 'loop' ? 'bg-indigo-600 border-indigo-400 text-white font-bold' : 'bg-dcc-900 border-dcc-750 text-slate-400 hover:text-slate-200'"
            >
              Loop
            </button>
            <button 
              @click="animationStore.loopMode = 'pingpong'"
              class="py-1 rounded text-[10px] border transition"
              :class="animationStore.loopMode === 'pingpong' ? 'bg-indigo-600 border-indigo-400 text-white font-bold' : 'bg-dcc-900 border-dcc-750 text-slate-400 hover:text-slate-200'"
            >
              Ping-Pong
            </button>
            <button 
              @click="animationStore.loopMode = 'once'"
              class="py-1 rounded text-[10px] border transition"
              :class="animationStore.loopMode === 'once' ? 'bg-indigo-600 border-indigo-400 text-white font-bold' : 'bg-dcc-900 border-dcc-750 text-slate-400 hover:text-slate-200'"
            >
              Once
            </button>
          </div>
        </div>
      </div>

      <!-- 2. Visual & Viewport Overlays -->
      <div class="bg-dcc-850 p-2.5 rounded border border-dcc-750 space-y-2">
        <span class="text-[11px] font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
          <Eye class="w-3.5 h-3.5" />
          <span>Viewport & Overlays</span>
        </span>

        <!-- Auto-Keying Toggle -->
        <label class="flex items-center justify-between p-1.5 bg-dcc-900 rounded border border-dcc-750 cursor-pointer">
          <span class="text-slate-300">Auto-Keying</span>
          <input type="checkbox" v-model="animationStore.autoKey" class="rounded bg-dcc-800 border-dcc-700 text-indigo-600" />
        </label>

        <!-- Onion Skinning Toggle -->
        <label class="flex items-center justify-between p-1.5 bg-dcc-900 rounded border border-dcc-750 cursor-pointer">
          <span class="text-slate-300">Onion Skinning</span>
          <input type="checkbox" v-model="animationStore.onionSkin" class="rounded bg-dcc-800 border-dcc-700 text-indigo-600" />
        </label>

        <!-- X-Ray Bones Toggle -->
        <label class="flex items-center justify-between p-1.5 bg-dcc-900 rounded border border-dcc-750 cursor-pointer">
          <span class="text-slate-300">X-Ray Bones (See Through)</span>
          <input type="checkbox" v-model="animationStore.xrayBones" class="rounded bg-dcc-800 border-dcc-700 text-indigo-600" />
        </label>
      </div>
    </div>
  </div>
</template>
