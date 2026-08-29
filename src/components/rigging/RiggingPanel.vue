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
  Unlink 
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
  projectStore.recordState(`Set Bone Length to ${len}`)
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
  projectStore.recordState(`Parent ${activeMesh.value.name} to ${selectedBone.value.name}`)
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

  // Remove from old parent
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
</script>

<template>
  <div class="h-full w-full bg-dcc-900 flex flex-col select-none overflow-y-auto p-3 text-slate-200 space-y-3 font-mono text-xs">
    <!-- Header -->
    <div class="flex items-center justify-between pb-2 border-b border-dcc-750">
      <div class="flex items-center space-x-2">
        <div class="p-1.5 rounded bg-cyan-600/20 text-cyan-400 border border-cyan-500/40">
          <BlenderIcon name="bone" :size="16" />
        </div>
        <div>
          <h2 class="text-xs font-bold tracking-wide uppercase">Rigging Studio</h2>
          <p class="text-[10px] text-slate-400">Custom skeletal bones & rigid limb parenting</p>
        </div>
      </div>

      <button 
        v-if="animationStore.armature.bones.length > 0"
        @click="animationStore.clearArmature" 
        class="flex items-center space-x-1 px-2 py-1 bg-dcc-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded text-[10px] border border-dcc-700 transition"
        title="Clear entire armature"
      >
        <Trash2 class="w-3 h-3" />
        <span>Clear</span>
      </button>
    </div>

    <!-- Quick Bone Creation Tools -->
    <div class="bg-dcc-850 p-2.5 rounded border border-dcc-750 space-y-2">
      <span class="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
        <Sparkles class="w-3.5 h-3.5 text-cyan-400" />
        <span>Bone Tools</span>
      </span>

      <div class="grid grid-cols-2 gap-1.5">
        <button 
          @click="handleAddRoot"
          class="py-1.5 px-2 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-[10px] flex items-center justify-center space-x-1 shadow transition"
          title="Add a new root bone at origin"
        >
          <Plus class="w-3 h-3" />
          <span>+ Root Bone</span>
        </button>

        <button 
          @click="handleExtrude"
          class="py-1.5 px-2 rounded bg-dcc-800 hover:bg-dcc-750 border border-dcc-700 text-cyan-300 text-[10px] flex items-center justify-center space-x-1 transition"
          title="Extrude connected child bone from selected joint (E)"
        >
          <GitBranch class="w-3 h-3" />
          <span>Extrude (E)</span>
        </button>

        <button 
          @click="handleSubdivide"
          :disabled="!selectedBone"
          class="py-1.5 px-2 rounded bg-dcc-800 hover:bg-dcc-750 border border-dcc-700 text-slate-300 text-[10px] flex items-center justify-center space-x-1 disabled:opacity-40 transition"
          title="Split selected bone into 2 segments"
        >
          <span>Subdivide</span>
        </button>

        <button 
          @click="handleSymmetrize"
          class="py-1.5 px-2 rounded bg-dcc-800 hover:bg-dcc-750 border border-dcc-700 text-amber-300 text-[10px] flex items-center justify-center space-x-1 transition"
          title="Mirror all Left bones (_L) across X-axis to Right (_R)"
        >
          <FlipHorizontal class="w-3 h-3" />
          <span>Symmetrize X</span>
        </button>
      </div>
    </div>

    <!-- Active Bone Inspector -->
    <div v-if="selectedBone" class="bg-dcc-850 p-2.5 rounded border border-dcc-750 space-y-2.5">
      <div class="flex items-center justify-between border-b border-dcc-750 pb-1.5">
        <span class="text-[11px] font-bold text-cyan-400 uppercase">Bone: {{ selectedBone.name }}</span>
        <button 
          @click="animationStore.deleteBone(selectedBone.id)"
          class="text-slate-500 hover:text-rose-400 p-0.5"
          title="Delete this bone"
        >
          <Trash2 class="w-3.5 h-3.5" />
        </button>
      </div>

      <!-- Rename -->
      <div class="space-y-1">
        <span class="text-[10px] text-slate-400">Bone Name</span>
        <input 
          v-model="selectedBone.name"
          class="w-full bg-dcc-900 border border-dcc-700 rounded px-2 py-1 text-slate-200 text-xs focus:outline-none focus:border-cyan-500"
        />
      </div>

      <!-- Parent Selector -->
      <div class="space-y-1">
        <span class="text-[10px] text-slate-400">Parent Bone</span>
        <select 
          :value="selectedBone.parentId || 'root'"
          @change="handleReparent(($event.target as HTMLSelectElement).value)"
          class="w-full bg-dcc-900 border border-dcc-700 rounded px-2 py-1 text-slate-200 text-xs focus:outline-none focus:border-cyan-500"
        >
          <option value="root">-- None (Root Bone) --</option>
          <option 
            v-for="b in animationStore.armature.bones.filter(b => b.id !== selectedBone?.id)" 
            :key="b.id" 
            :value="b.id"
          >
            {{ b.name }}
          </option>
        </select>
      </div>

      <!-- Head Position -->
      <div class="space-y-1">
        <span class="text-[10px] text-slate-400 flex items-center justify-between">
          <span>Joint Head (Base)</span>
        </span>
        <div class="grid grid-cols-3 gap-1">
          <div class="flex items-center bg-dcc-900 border border-dcc-700 rounded px-1.5 py-0.5">
            <span class="text-rose-400 text-[10px] mr-1">X</span>
            <input type="number" step="0.1" v-model.number="selectedBone.head.x" class="w-full bg-transparent text-slate-200 text-xs focus:outline-none" />
          </div>
          <div class="flex items-center bg-dcc-900 border border-dcc-700 rounded px-1.5 py-0.5">
            <span class="text-emerald-400 text-[10px] mr-1">Y</span>
            <input type="number" step="0.1" v-model.number="selectedBone.head.y" class="w-full bg-transparent text-slate-200 text-xs focus:outline-none" />
          </div>
          <div class="flex items-center bg-dcc-900 border border-dcc-700 rounded px-1.5 py-0.5">
            <span class="text-sky-400 text-[10px] mr-1">Z</span>
            <input type="number" step="0.1" v-model.number="selectedBone.head.z" class="w-full bg-transparent text-slate-200 text-xs focus:outline-none" />
          </div>
        </div>
      </div>

      <!-- Tail Position -->
      <div class="space-y-1">
        <span class="text-[10px] text-slate-400 flex items-center justify-between">
          <span>Joint Tail (Tip)</span>
        </span>
        <div class="grid grid-cols-3 gap-1">
          <div class="flex items-center bg-dcc-900 border border-dcc-700 rounded px-1.5 py-0.5">
            <span class="text-rose-400 text-[10px] mr-1">X</span>
            <input type="number" step="0.1" v-model.number="selectedBone.tail.x" class="w-full bg-transparent text-slate-200 text-xs focus:outline-none" />
          </div>
          <div class="flex items-center bg-dcc-900 border border-dcc-700 rounded px-1.5 py-0.5">
            <span class="text-emerald-400 text-[10px] mr-1">Y</span>
            <input type="number" step="0.1" v-model.number="selectedBone.tail.y" class="w-full bg-transparent text-slate-200 text-xs focus:outline-none" />
          </div>
          <div class="flex items-center bg-dcc-900 border border-dcc-700 rounded px-1.5 py-0.5">
            <span class="text-sky-400 text-[10px] mr-1">Z</span>
            <input type="number" step="0.1" v-model.number="selectedBone.tail.z" class="w-full bg-transparent text-slate-200 text-xs focus:outline-none" />
          </div>
        </div>
      </div>

      <!-- Bone Length Controller with Presets -->
      <div class="space-y-1.5 pt-1.5 border-t border-dcc-750">
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

        <!-- 1-Click Length Presets -->
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
    </div>

    <!-- Rigid Limb Attachment (Blockbench Style) -->
    <div class="bg-dcc-850 p-2.5 rounded border border-dcc-750 space-y-2">
      <div class="flex items-center justify-between">
        <span class="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
          <Link class="w-3.5 h-3.5 text-indigo-400" />
          <span>Mesh-to-Bone Attachment</span>
        </span>
      </div>

      <p class="text-[10px] text-slate-400">Attach scene meshes so they rigidly follow this bone during animation:</p>

      <!-- 1-Click Attach Selected Mesh -->
      <button 
        v-if="selectedBone && activeMesh"
        @click="handleAttachSelectedMesh"
        class="w-full py-1.5 px-2 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] flex items-center justify-center space-x-1.5 shadow transition"
      >
        <Link class="w-3 h-3" />
        <span>Parent "{{ activeMesh.name }}" to {{ selectedBone.name }}</span>
      </button>

      <!-- Attached Meshes List for this Bone -->
      <div v-if="attachedMeshes.length > 0" class="space-y-1 pt-1 border-t border-dcc-750">
        <span class="text-[10px] text-slate-400">Attached Limbs ({{ attachedMeshes.length }}):</span>
        <div v-for="m in attachedMeshes" :key="m.id" class="flex items-center justify-between bg-dcc-900 px-2 py-1 rounded border border-dcc-750 text-[10px]">
          <span class="text-slate-200 truncate">{{ m.name }}</span>
          <button @click="handleDetachMesh(m.id)" class="text-slate-500 hover:text-rose-400" title="Detach mesh">
            <Unlink class="w-3 h-3" />
          </button>
        </div>
      </div>
      <div v-else class="text-[10px] text-slate-500 italic">
        No meshes currently parented to this bone.
      </div>

      <!-- 1-Click Smooth Proximity Skinning -->
      <div class="pt-2 border-t border-dcc-750 space-y-1.5">
        <span class="text-[10px] text-slate-400">Organic Smooth Skinning:</span>
        <button 
          v-if="activeMesh"
          @click="handleAutoWeight"
          class="w-full py-1.5 px-2 rounded bg-dcc-800 hover:bg-dcc-750 border border-dcc-700 text-emerald-400 text-[10px] flex items-center justify-center space-x-1 transition"
          title="Auto-calculate smooth proximity vertex weights for active mesh"
        >
          <Sparkles class="w-3 h-3" />
          <span>Auto Weight "{{ activeMesh.name }}" Vertices</span>
        </button>
      </div>
    </div>
  </div>
</template>
