<script setup lang="ts">
import { computed } from 'vue'
import { useAnimationStore } from '../../stores/animationStore'
import { useProjectStore } from '../../stores/projectStore'
import BlenderIcon from '../icons/BlenderIcon.vue'
import { 
  Plus, 
  GitBranch, 
  FlipHorizontal, 
  Trash2, 
  Sparkles, 
  Link, 
  Unlink,
  Eye,
  Crosshair,
  RotateCcw,
  Wand2,
  ChevronRight,
  FolderTree
} from 'lucide-vue-next'

const animationStore = useAnimationStore()
const projectStore = useProjectStore()

const selectedBone = computed(() => animationStore.selectedBone)
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
  projectStore.recordState('Set Bone Length to ' + len)
  boneLength.value = len
}

const attachedMeshes = computed(() => {
  if (!selectedBone.value) return []
  return projectStore.meshes.filter(m => m.parentId === selectedBone.value?.id)
})

function handleAddRoot() {
  projectStore.recordState('Add Root Bone')
  animationStore.addRootBone()
}

function handleExtrude() {
  if (!selectedBone.value) {
    handleAddRoot()
    return
  }
  projectStore.recordState('Extrude Bone')
  animationStore.extrudeBone(selectedBone.value.id)
}

function handleSubdivide() {
  if (!selectedBone.value) return
  projectStore.recordState('Subdivide Bone')
  animationStore.subdivideBone(selectedBone.value.id)
}

function handleSymmetrize() {
  projectStore.recordState('Symmetrize Armature')
  animationStore.symmetrizeArmature()
}

function handleAttachSelectedMesh() {
  if (!selectedBone.value || !activeMesh.value) return
  projectStore.recordState('Parent ' + activeMesh.value.name + ' to ' + selectedBone.value.name)
  animationStore.parentMeshToBone(activeMesh.value.id, selectedBone.value.id)
}

function handleDetachMesh(meshId: string) {
  projectStore.recordState('Detach Mesh from Bone')
  animationStore.parentMeshToBone(meshId, null)
}

function handleAutoWeight() {
  if (!activeMesh.value) return
  projectStore.recordState('Auto Weight Vertices')
  animationStore.autoWeightMeshToBones(activeMesh.value)
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

// Smart Auto-Rig Handlers
function handleAutoRigProp() {
  projectStore.recordState('Auto-Rig Prop')
  animationStore.autoRigProp()
}

function handleAutoRigChain(segments = 3) {
  projectStore.recordState('Auto-Rig Chain (' + segments + ' Segments)')
  animationStore.autoRigChain(undefined, segments)
}

function handleAutoRigHinge() {
  projectStore.recordState('Auto-Rig Hinge')
  animationStore.autoRigHinge()
}

function handleAutoRigMultiPart() {
  projectStore.recordState('Auto-Rig Multi-Part Assembly')
  animationStore.autoRigMultiPart()
}

function getBoneDepth(boneId: string): number {
  let depth = 0
  let cur = animationStore.armature.bones.find(b => b.id === boneId)
  while (cur && cur.parentId) {
    depth++
    cur = animationStore.armature.bones.find(b => b.id === cur?.parentId)
  }
  return depth
}
</script>

<template>
  <div class="h-full w-full bg-ui-panel flex flex-col select-none overflow-y-auto p-3 text-ui-textPrimary space-y-3 font-mono text-xs">
    <!-- Header -->
    <div class="flex items-center justify-between pb-2 border-b border-ui-borderSubtle">
      <div class="flex items-center space-x-2">
        <div class="p-1.5 rounded-xs bg-ui-active text-ui-textAccent border border-ui-accent/40">
          <BlenderIcon name="bone" :size="16" />
        </div>
        <div>
          <h2 class="text-xs font-bold tracking-wide uppercase">Rigging Studio</h2>
          <p class="text-[10px] text-ui-textMuted">Effortless bone setup & limb skinning</p>
        </div>
      </div>

      <button 
        v-if="animationStore.armature.bones.length > 0"
        @click="animationStore.clearArmature" 
        class="flex items-center space-x-1 px-2 py-1 bg-ui-input hover:bg-rose-500/20 text-ui-textMuted hover:text-rose-400 rounded-xs text-[10px] border border-ui-borderSubtle transition"
        title="Clear entire armature"
      >
        <Trash2 class="w-3 h-3" />
        <span>Clear</span>
      </button>
    </div>

    <!-- 1. Interactive Mode Switcher: Edit Skeleton vs Test Pose -->
    <div class="bg-ui-surface p-1.5 rounded-xs border border-ui-borderSubtle space-y-1.5">
      <div class="grid grid-cols-2 gap-1">
        <button 
          @click="animationStore.toggleTestPose(false)"
          class="py-1.5 px-2 rounded-xs font-bold text-[10px] flex items-center justify-center space-x-1.5 transition"
          :class="!animationStore.isTestPoseActive ? 'bg-ui-active text-ui-textAccent border border-ui-accent shadow-sm' : 'bg-ui-input hover:bg-ui-hover text-ui-textMuted border border-ui-borderSubtle'"
        >
          <BlenderIcon name="bone" :size="12" />
          <span>Edit Rig</span>
        </button>

        <button 
          @click="animationStore.toggleTestPose(true)"
          class="py-1.5 px-2 rounded-xs font-bold text-[10px] flex items-center justify-center space-x-1.5 transition"
          :class="animationStore.isTestPoseActive ? 'bg-amber-500 text-slate-900 border border-amber-400 shadow-sm' : 'bg-ui-input hover:bg-ui-hover text-amber-400 border border-ui-borderSubtle'"
        >
          <Sparkles class="w-3 h-3" />
          <span>Test Pose</span>
        </button>
      </div>

      <!-- Test Pose Active Banner -->
      <div v-if="animationStore.isTestPoseActive" class="p-2 bg-amber-500/10 border border-amber-500/30 rounded-xs space-y-1.5">
        <div class="flex items-center justify-between">
          <span class="text-[10px] text-amber-300 font-bold">Pose Sandbox Active</span>
          <button 
            @click="animationStore.resetAllBonesToRest"
            class="px-2 py-0.5 bg-amber-500 hover:bg-amber-400 text-slate-900 rounded-xs font-bold text-[9px] flex items-center space-x-1 transition shadow"
          >
            <RotateCcw class="w-2.5 h-2.5" />
            <span>Reset Rest Pose</span>
          </button>
        </div>
        <p class="text-[9px] text-amber-200/80 leading-tight">
          Rotate and move bones in the 3D viewport to preview deformations. Changes here do not alter neutral bind positions.
        </p>
      </div>
    </div>

    <!-- 2. Smart Algorithmic 1-Click Auto-Rigging (Beginner Hero Feature) -->
    <div class="bg-ui-surface p-2.5 rounded-xs border border-ui-borderSubtle space-y-2">
      <div class="flex items-center justify-between">
        <span class="text-[11px] font-bold text-ui-textPrimary uppercase tracking-wider flex items-center gap-1.5">
          <Wand2 class="w-3.5 h-3.5 text-ui-textAccent" />
          <span>1-Click Auto-Rig</span>
        </span>
        <span class="text-[9px] text-ui-textMuted">Any 3D Object</span>
      </div>

      <div class="grid grid-cols-2 gap-1.5">
        <button 
          @click="handleAutoRigProp"
          class="p-2 rounded-xs bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle hover:border-ui-accent text-left space-y-0.5 transition group"
          title="Creates a centered root bone perfectly sized to the active mesh"
        >
          <div class="flex items-center justify-between text-ui-textPrimary group-hover:text-ui-textAccent font-bold text-[10px]">
            <span>Center Prop</span>
            <ChevronRight class="w-3 h-3 opacity-60 group-hover:opacity-100" />
          </div>
          <p class="text-[9px] text-ui-textMuted leading-tight">Single items, weapons, rocks, floating props</p>
        </button>

        <button 
          @click="handleAutoRigChain(3)"
          class="p-2 rounded-xs bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle hover:border-ui-accent text-left space-y-0.5 transition group"
          title="Generates an evenly segmented 3-bone chain along the mesh length"
        >
          <div class="flex items-center justify-between text-ui-textPrimary group-hover:text-ui-textAccent font-bold text-[10px]">
            <span>Spine / Chain (3)</span>
            <ChevronRight class="w-3 h-3 opacity-60 group-hover:opacity-100" />
          </div>
          <p class="text-[9px] text-ui-textMuted leading-tight">Tails, ropes, spines, limbs, organic bodies</p>
        </button>

        <button 
          @click="handleAutoRigHinge"
          class="p-2 rounded-xs bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle hover:border-ui-accent text-left space-y-0.5 transition group"
          title="Places a rotating hinge bone along the bottom edge"
        >
          <div class="flex items-center justify-between text-ui-textPrimary group-hover:text-ui-textAccent font-bold text-[10px]">
            <span>Hinge Joint</span>
            <ChevronRight class="w-3 h-3 opacity-60 group-hover:opacity-100" />
          </div>
          <p class="text-[9px] text-ui-textMuted leading-tight">Chest lids, doors, trapdoors, levers</p>
        </button>

        <button 
          @click="handleAutoRigMultiPart"
          class="p-2 rounded-xs bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle hover:border-ui-accent text-left space-y-0.5 transition group"
          title="Auto-detects all meshes in project and rigs them hierarchically"
        >
          <div class="flex items-center justify-between text-ui-textPrimary group-hover:text-ui-textAccent font-bold text-[10px]">
            <span>All Parts Assembly</span>
            <ChevronRight class="w-3 h-3 opacity-60 group-hover:opacity-100" />
          </div>
          <p class="text-[9px] text-ui-textMuted leading-tight">Vehicles, robots, multi-mesh models</p>
        </button>
      </div>
    </div>

    <!-- 3. Viewport Interactive Bone Tools & Display Options -->
    <div class="bg-ui-surface p-2.5 rounded-xs border border-ui-borderSubtle space-y-2">
      <div class="flex items-center justify-between">
        <span class="text-[11px] font-bold text-ui-textPrimary uppercase tracking-wider flex items-center gap-1.5">
          <Crosshair class="w-3.5 h-3.5 text-ui-textAccent" />
          <span>Viewport Tools</span>
        </span>
      </div>

      <div class="grid grid-cols-2 gap-1.5">
        <button 
          @click="animationStore.clickToPlaceMode = !animationStore.clickToPlaceMode"
          class="py-1.5 px-2 rounded-xs font-bold text-[10px] flex items-center justify-center space-x-1.5 transition border"
          :class="animationStore.clickToPlaceMode ? 'bg-ui-accent text-white border-ui-accent shadow' : 'bg-ui-input hover:bg-ui-hover text-ui-textPrimary border-ui-borderSubtle'"
          title="Click directly on mesh surface in 3D viewport to drop connected joints"
        >
          <Crosshair class="w-3 h-3" />
          <span>{{ animationStore.clickToPlaceMode ? 'Placing Bones...' : 'Click-to-Place' }}</span>
        </button>

        <button 
          @click="animationStore.xrayBones = !animationStore.xrayBones"
          class="py-1.5 px-2 rounded-xs font-bold text-[10px] flex items-center justify-center space-x-1.5 transition border"
          :class="animationStore.xrayBones ? 'bg-ui-active text-ui-textAccent border-ui-accent' : 'bg-ui-input hover:bg-ui-hover text-ui-textMuted border-ui-borderSubtle'"
          title="Makes bones visible through opaque solid meshes"
        >
          <Eye class="w-3 h-3" />
          <span>X-Ray Bones: {{ animationStore.xrayBones ? 'ON' : 'OFF' }}</span>
        </button>
      </div>

      <!-- Standard Edit Tools -->
      <div class="grid grid-cols-2 gap-1.5 pt-1">
        <button 
          @click="handleAddRoot"
          class="py-1 px-2 rounded-xs bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle text-ui-textPrimary font-bold text-[10px] flex items-center justify-center space-x-1 transition"
          title="Add a new root bone at origin"
        >
          <Plus class="w-3 h-3 text-ui-textAccent" />
          <span>+ Root Bone</span>
        </button>

        <button 
          @click="handleExtrude"
          class="py-1 px-2 rounded-xs bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle text-ui-textAccent text-[10px] flex items-center justify-center space-x-1 transition"
          title="Extrude connected child bone from selected joint (E)"
        >
          <GitBranch class="w-3 h-3" />
          <span>Extrude (E)</span>
        </button>

        <button 
          @click="handleSubdivide"
          :disabled="!selectedBone"
          class="py-1 px-2 rounded-xs bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle text-ui-textPrimary text-[10px] flex items-center justify-center space-x-1 disabled:opacity-40 transition"
          title="Split selected bone into 2 segments"
        >
          <span>Subdivide</span>
        </button>

        <button 
          @click="handleSymmetrize"
          class="py-1 px-2 rounded-xs bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle text-ui-textAccent text-[10px] flex items-center justify-center space-x-1 transition"
          title="Mirror all Left bones (_L) across X-axis to Right (_R)"
        >
          <FlipHorizontal class="w-3 h-3" />
          <span>Symmetrize X</span>
        </button>
      </div>
    </div>

    <!-- 4. Visual Skeleton Hierarchy Tree (Outliner) -->
    <div v-if="animationStore.armature.bones.length > 0" class="bg-ui-surface p-2.5 rounded-xs border border-ui-borderSubtle space-y-2">
      <div class="flex items-center justify-between">
        <span class="text-[11px] font-bold text-ui-textPrimary uppercase tracking-wider flex items-center gap-1.5">
          <FolderTree class="w-3.5 h-3.5 text-ui-textAccent" />
          <span>Skeleton Hierarchy ({{ animationStore.armature.bones.length }})</span>
        </span>
      </div>

      <div class="space-y-1 max-h-48 overflow-y-auto p-1 bg-ui-input rounded-xs border border-ui-borderSubtle">
        <div 
          v-for="b in animationStore.armature.bones" 
          :key="b.id"
          @click="animationStore.selectBone(b.id)"
          class="flex items-center justify-between px-2 py-1 rounded-xs cursor-pointer text-[10px] transition"
          :class="selectedBone?.id === b.id ? 'bg-ui-active text-ui-textAccent font-bold border border-ui-accent/40' : 'hover:bg-ui-hover text-ui-textSecondary'"
          :style="{ paddingLeft: (getBoneDepth(b.id) * 12 + 6) + 'px' }"
        >
          <div class="flex items-center gap-1.5 truncate">
            <BlenderIcon name="bone" :size="11" />
            <span class="truncate">{{ b.name }}</span>
          </div>

          <div class="flex items-center gap-1">
            <span v-if="b.childrenIds.length" class="text-[8px] px-1 bg-ui-panel text-ui-textMuted rounded-xs">
              {{ b.childrenIds.length }}
            </span>
            <button 
              @click.stop="animationStore.deleteBone(b.id)"
              class="opacity-40 hover:opacity-100 hover:text-rose-400 p-0.5"
              title="Delete bone"
            >
              <Trash2 class="w-2.5 h-2.5" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 5. Active Bone Inspector -->
    <div v-if="selectedBone" class="bg-ui-surface p-2.5 rounded-xs border border-ui-borderSubtle space-y-2.5">
      <div class="flex items-center justify-between border-b border-ui-borderSubtle pb-1.5">
        <span class="text-[11px] font-bold text-ui-textAccent uppercase">Bone: {{ selectedBone.name }}</span>
        <button 
          @click="animationStore.deleteBone(selectedBone.id)"
          class="text-ui-textMuted hover:text-rose-400 p-0.5"
          title="Delete this bone"
        >
          <Trash2 class="w-3.5 h-3.5" />
        </button>
      </div>

      <!-- Rename -->
      <div class="space-y-1">
        <span class="text-[10px] text-ui-textMuted">Bone Name</span>
        <input 
          v-model="selectedBone.name"
          class="w-full bg-ui-input border border-ui-borderDefault rounded-xs px-2 py-1 text-ui-textPrimary text-xs focus:outline-none focus:border-ui-accent"
        />
      </div>

      <!-- Parent Selector -->
      <div class="space-y-1">
        <span class="text-[10px] text-ui-textMuted">Parent Bone</span>
        <select 
          :value="selectedBone.parentId || 'root'"
          @change="handleReparent(($event.target as HTMLSelectElement).value)"
          class="w-full bg-ui-input border border-ui-borderDefault rounded-xs px-2 py-1 text-ui-textPrimary text-xs focus:outline-none focus:border-ui-accent cursor-pointer"
        >
          <option value="root" class="bg-ui-panel text-ui-textPrimary">-- None (Root Bone) --</option>
          <option 
            v-for="b in animationStore.armature.bones.filter(b => b.id !== selectedBone?.id)" 
            :key="b.id" 
            :value="b.id"
            class="bg-ui-panel text-ui-textPrimary"
          >
            {{ b.name }}
          </option>
        </select>
      </div>

      <!-- Head Position -->
      <div class="space-y-1">
        <span class="text-[10px] text-ui-textMuted flex items-center justify-between">
          <span>Joint Head (Base)</span>
        </span>
        <div class="grid grid-cols-3 gap-1">
          <div class="flex items-center bg-ui-input border border-ui-borderDefault rounded-xs px-1.5 py-0.5">
            <span class="text-rose-500 font-bold text-[10px] mr-1">X</span>
            <input type="number" step="0.1" v-model.number="selectedBone.head.x" class="w-full bg-transparent text-ui-textPrimary text-xs focus:outline-none font-mono" />
          </div>
          <div class="flex items-center bg-ui-input border border-ui-borderDefault rounded-xs px-1.5 py-0.5">
            <span class="text-emerald-500 font-bold text-[10px] mr-1">Y</span>
            <input type="number" step="0.1" v-model.number="selectedBone.head.y" class="w-full bg-transparent text-ui-textPrimary text-xs focus:outline-none font-mono" />
          </div>
          <div class="flex items-center bg-ui-input border border-ui-borderDefault rounded-xs px-1.5 py-0.5">
            <span class="text-sky-500 font-bold text-[10px] mr-1">Z</span>
            <input type="number" step="0.1" v-model.number="selectedBone.head.z" class="w-full bg-transparent text-ui-textPrimary text-xs focus:outline-none font-mono" />
          </div>
        </div>
      </div>

      <!-- Tail Position -->
      <div class="space-y-1">
        <span class="text-[10px] text-ui-textMuted flex items-center justify-between">
          <span>Joint Tail (Tip)</span>
        </span>
        <div class="grid grid-cols-3 gap-1">
          <div class="flex items-center bg-ui-input border border-ui-borderDefault rounded-xs px-1.5 py-0.5">
            <span class="text-rose-500 font-bold text-[10px] mr-1">X</span>
            <input type="number" step="0.1" v-model.number="selectedBone.tail.x" class="w-full bg-transparent text-ui-textPrimary text-xs focus:outline-none font-mono" />
          </div>
          <div class="flex items-center bg-ui-input border border-ui-borderDefault rounded-xs px-1.5 py-0.5">
            <span class="text-emerald-500 font-bold text-[10px] mr-1">Y</span>
            <input type="number" step="0.1" v-model.number="selectedBone.tail.y" class="w-full bg-transparent text-ui-textPrimary text-xs focus:outline-none font-mono" />
          </div>
          <div class="flex items-center bg-ui-input border border-ui-borderDefault rounded-xs px-1.5 py-0.5">
            <span class="text-sky-500 font-bold text-[10px] mr-1">Z</span>
            <input type="number" step="0.1" v-model.number="selectedBone.tail.z" class="w-full bg-transparent text-ui-textPrimary text-xs focus:outline-none font-mono" />
          </div>
        </div>
      </div>

      <!-- Bone Length Controller with Presets -->
      <div class="space-y-1.5 pt-1.5 border-t border-ui-borderSubtle">
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
          class="w-full accent-ui-accent bg-ui-input h-1 rounded-xs cursor-pointer"
        />

        <!-- 1-Click Length Presets -->
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
    </div>

    <!-- 6. Rigid Limb Attachment & Proximity Skinning -->
    <div class="bg-ui-surface p-2.5 rounded-xs border border-ui-borderSubtle space-y-2">
      <div class="flex items-center justify-between">
        <span class="text-[11px] font-bold text-ui-textPrimary uppercase tracking-wider flex items-center gap-1.5">
          <Link class="w-3.5 h-3.5 text-ui-textAccent" />
          <span>Mesh-to-Bone Attachment</span>
        </span>
      </div>

      <p class="text-[10px] text-ui-textMuted">Attach scene meshes so they rigidly follow this bone during animation:</p>

      <!-- 1-Click Attach Selected Mesh -->
      <button 
        v-if="selectedBone && activeMesh"
        @click="handleAttachSelectedMesh"
        class="w-full py-1.5 px-2 rounded-xs bg-ui-accent hover:bg-ui-accentHover text-white font-bold text-[10px] flex items-center justify-center space-x-1.5 shadow transition"
      >
        <Link class="w-3 h-3" />
        <span>Parent "{{ activeMesh.name }}" to {{ selectedBone.name }}</span>
      </button>

      <!-- Attached Meshes List for this Bone -->
      <div v-if="attachedMeshes.length > 0" class="space-y-1 pt-1 border-t border-ui-borderSubtle">
        <span class="text-[10px] text-ui-textMuted">Attached Limbs ({{ attachedMeshes.length }}):</span>
        <div v-for="m in attachedMeshes" :key="m.id" class="flex items-center justify-between bg-ui-input px-2 py-1 rounded-xs border border-ui-borderSubtle text-[10px]">
          <span class="text-ui-textPrimary truncate">{{ m.name }}</span>
          <button @click="handleDetachMesh(m.id)" class="text-ui-textMuted hover:text-rose-400" title="Detach mesh">
            <Unlink class="w-3 h-3" />
          </button>
        </div>
      </div>
      <div v-else class="text-[10px] text-ui-textMuted italic">
        No meshes currently parented to this bone.
      </div>

      <!-- 1-Click Smooth Proximity Skinning -->
      <div class="pt-2 border-t border-ui-borderSubtle space-y-1.5">
        <span class="text-[10px] text-ui-textMuted">Organic Smooth Skinning:</span>
        <button 
          v-if="activeMesh"
          @click="handleAutoWeight"
          class="w-full py-1.5 px-2 rounded-xs bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle text-emerald-500 font-bold text-[10px] flex items-center justify-center space-x-1 transition"
          title="Auto-calculate smooth proximity vertex weights for active mesh"
        >
          <Sparkles class="w-3 h-3" />
          <span>Auto Weight "{{ activeMesh.name }}" Vertices</span>
        </button>
      </div>
    </div>
  </div>
</template>
