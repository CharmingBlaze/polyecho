<script setup lang="ts">
import { computed } from 'vue'
import { useAnimationStore } from '../../stores/animationStore'
import { useProjectStore } from '../../stores/projectStore'
import BlenderIcon from '../icons/BlenderIcon.vue'
import { 
  Trash2, 
  RotateCcw, 
  Wrench, 
  Plus, 
  Sliders 
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
</script>

<template>
  <div class="h-full w-full bg-ui-panel p-3 text-ui-textPrimary flex flex-col space-y-3 font-mono text-xs select-none overflow-y-auto">
    <!-- Top Mode Switcher: EDIT RIG vs POSE -->
    <div class="bg-ui-surface p-1.5 rounded-xs border border-ui-borderSubtle space-y-1.5">
      <div class="grid grid-cols-2 gap-1 bg-ui-input p-0.5 rounded-xs border border-ui-borderSubtle">
        <button 
          @click="animationStore.toggleTestPose(false)"
          class="py-1.5 px-2 rounded-xs font-bold text-xs flex items-center justify-center gap-1.5 transition"
          :class="!animationStore.isTestPoseActive ? 'bg-ui-accent text-white shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
        >
          <Sliders class="w-3.5 h-3.5" />
          <span>Edit Rig</span>
        </button>

        <button 
          @click="animationStore.toggleTestPose(true)"
          class="py-1.5 px-2 rounded-xs font-bold text-xs flex items-center justify-center gap-1.5 transition"
          :class="animationStore.isTestPoseActive ? 'bg-amber-500 text-slate-950 shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
        >
          <RotateCcw class="w-3.5 h-3.5" />
          <span>Pose Mode</span>
        </button>
      </div>

      <button 
        v-if="animationStore.isTestPoseActive"
        @click="animationStore.resetAllBonesToRest"
        class="w-full py-1 text-[10px] text-amber-400 hover:bg-amber-500/10 border border-amber-500/30 rounded-xs font-bold flex items-center justify-center gap-1 transition"
      >
        <RotateCcw class="w-3 h-3" />
        <span>Reset Rest Pose (Alt+R)</span>
      </button>
    </div>

    <!-- Active Bone Inspector -->
    <div v-if="selectedBone" class="bg-ui-surface p-2.5 rounded-xs border border-ui-borderSubtle space-y-3">
      <!-- Bone Header -->
      <div class="flex items-center justify-between border-b border-ui-borderSubtle pb-1.5">
        <span class="text-[11px] font-bold text-ui-textAccent uppercase tracking-wider">
          Bone Properties
        </span>
        <button 
          @click="animationStore.deleteBone(selectedBone.id)"
          class="text-ui-textMuted hover:text-rose-400 p-0.5"
          title="Delete bone (Del)"
        >
          <Trash2 class="w-3.5 h-3.5" />
        </button>
      </div>

      <!-- Rename -->
      <div class="space-y-1">
        <span class="text-[10px] text-ui-textMuted">Bone Name</span>
        <input 
          v-model="selectedBone.name"
          class="w-full bg-ui-input border border-ui-borderDefault rounded-xs px-2 py-1 text-ui-textPrimary text-xs focus:outline-none focus:border-ui-accent font-bold"
        />
      </div>

      <!-- Parent Bone Selector -->
      <div class="space-y-1">
        <span class="text-[10px] text-ui-textMuted">Parent Bone</span>
        <select 
          :value="selectedBone.parentId || 'root'"
          @change="handleReparent(($event.target as HTMLSelectElement).value)"
          class="w-full bg-ui-input border border-ui-borderDefault rounded-xs px-2 py-1 text-ui-textPrimary text-xs focus:outline-none focus:border-ui-accent cursor-pointer"
        >
          <option value="root" class="bg-ui-panel text-ui-textMuted">-- None (Root Bone) --</option>
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
        <span class="text-[10px] text-ui-textMuted">Joint Head (Base)</span>
        <div class="grid grid-cols-3 gap-1">
          <div class="flex items-center bg-ui-input border border-ui-borderSubtle rounded-xs px-1.5 py-0.5">
            <span class="text-[9px] text-rose-400 font-bold mr-1">X</span>
            <input type="number" step="0.1" v-model.number="selectedBone.head.x" class="w-full bg-transparent text-ui-textPrimary text-right text-xs focus:outline-none" />
          </div>
          <div class="flex items-center bg-ui-input border border-ui-borderSubtle rounded-xs px-1.5 py-0.5">
            <span class="text-[9px] text-emerald-400 font-bold mr-1">Y</span>
            <input type="number" step="0.1" v-model.number="selectedBone.head.y" class="w-full bg-transparent text-ui-textPrimary text-right text-xs focus:outline-none" />
          </div>
          <div class="flex items-center bg-ui-input border border-ui-borderSubtle rounded-xs px-1.5 py-0.5">
            <span class="text-[9px] text-sky-400 font-bold mr-1">Z</span>
            <input type="number" step="0.1" v-model.number="selectedBone.head.z" class="w-full bg-transparent text-ui-textPrimary text-right text-xs focus:outline-none" />
          </div>
        </div>
      </div>

      <!-- Tail Position -->
      <div class="space-y-1">
        <span class="text-[10px] text-ui-textMuted">Joint Tail (Tip)</span>
        <div class="grid grid-cols-3 gap-1">
          <div class="flex items-center bg-ui-input border border-ui-borderSubtle rounded-xs px-1.5 py-0.5">
            <span class="text-[9px] text-rose-400 font-bold mr-1">X</span>
            <input type="number" step="0.1" v-model.number="selectedBone.tail.x" class="w-full bg-transparent text-ui-textPrimary text-right text-xs focus:outline-none" />
          </div>
          <div class="flex items-center bg-ui-input border border-ui-borderSubtle rounded-xs px-1.5 py-0.5">
            <span class="text-[9px] text-emerald-400 font-bold mr-1">Y</span>
            <input type="number" step="0.1" v-model.number="selectedBone.tail.y" class="w-full bg-transparent text-ui-textPrimary text-right text-xs focus:outline-none" />
          </div>
          <div class="flex items-center bg-ui-input border border-ui-borderSubtle rounded-xs px-1.5 py-0.5">
            <span class="text-[9px] text-sky-400 font-bold mr-1">Z</span>
            <input type="number" step="0.1" v-model.number="selectedBone.tail.z" class="w-full bg-transparent text-ui-textPrimary text-right text-xs focus:outline-none" />
          </div>
        </div>
      </div>

      <!-- Bone Length Slider -->
      <div class="space-y-1.5 pt-1 border-t border-ui-borderSubtle">
        <div class="flex items-center justify-between text-[10px]">
          <span class="text-ui-textMuted">Bone Length</span>
          <div class="flex items-center gap-1">
            <button @click="adjustBoneLength(-0.1)" class="px-1 bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle rounded-xs text-[9px] text-ui-textMuted hover:text-ui-textPrimary">-0.1</button>
            <span class="text-ui-textAccent font-bold font-mono">{{ boneLength }}m</span>
            <button @click="adjustBoneLength(0.1)" class="px-1 bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle rounded-xs text-[9px] text-ui-textMuted hover:text-ui-textPrimary">+0.1</button>
          </div>
        </div>
        <input 
          type="range" 
          min="0.1" 
          max="5.0" 
          step="0.05" 
          v-model.number="boneLength"
          class="w-full accent-ui-accent h-1 bg-ui-input rounded-xs cursor-pointer"
        />
        <div class="grid grid-cols-4 gap-1">
          <button @click="setPresetBoneLength(0.5)" class="py-0.5 bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle rounded-xs text-[9px] text-ui-textMuted">0.5m</button>
          <button @click="setPresetBoneLength(1.0)" class="py-0.5 bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle rounded-xs text-[9px] text-ui-textMuted">1m</button>
          <button @click="setPresetBoneLength(1.5)" class="py-0.5 bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle rounded-xs text-[9px] text-ui-textMuted">1.5m</button>
          <button @click="setPresetBoneLength(2.0)" class="py-0.5 bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle rounded-xs text-[9px] text-ui-textMuted">2m</button>
        </div>
      </div>

      <!-- Sockets on this bone -->
      <div class="space-y-1.5 pt-1 border-t border-ui-borderSubtle">
        <div class="flex items-center justify-between text-[10px]">
          <span class="text-ui-textMuted font-bold uppercase flex items-center gap-1">
            <Wrench class="w-3 h-3 text-sky-400" />
            <span>Sockets ({{ selectedBone.sockets?.length || 0 }})</span>
          </span>
          <button @click="handleAddSocket" class="px-1.5 py-0.5 bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle text-ui-textPrimary rounded-xs text-[9px] font-bold flex items-center gap-0.5">
            <Plus class="w-2.5 h-2.5" />
            <span>Add</span>
          </button>
        </div>

        <div class="space-y-1">
          <div 
            v-for="s in selectedBone.sockets || []" 
            :key="s.id"
            class="flex items-center justify-between px-2 py-1 bg-ui-input rounded-xs border border-ui-borderSubtle text-[10px]"
          >
            <input 
              v-model="s.name"
              class="bg-transparent text-sky-300 font-bold focus:outline-none border-b border-transparent focus:border-ui-accent truncate"
            />
            <button @click="handleRemoveSocket(s.id)" class="text-ui-textMuted hover:text-rose-400 p-0.5">
              <Trash2 class="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State / Quick Selector -->
    <div v-else class="flex-1 flex flex-col p-3 space-y-3 bg-ui-surface rounded-xs border border-ui-borderSubtle">
      <div class="text-center space-y-1.5 py-3 border-b border-ui-borderSubtle">
        <BlenderIcon name="bone" :size="24" color="#f59e0b" class="mx-auto" />
        <h4 class="font-bold text-xs text-ui-textPrimary">No Bone Selected</h4>
        <p class="text-[10px] text-ui-textMuted leading-relaxed">
          Select a bone from the list below or create a new bone to edit its properties.
        </p>
      </div>

      <!-- Quick Actions -->
      <div class="grid grid-cols-2 gap-1.5">
        <button 
          @click="animationStore.addRootBone(`Bone_Root_${animationStore.armature.bones.length + 1}`)"
          class="py-1.5 px-2 bg-ui-accent hover:bg-ui-accentHover text-white rounded-xs font-bold text-xs flex items-center justify-center gap-1 shadow-xs transition"
        >
          <Plus class="w-3.5 h-3.5" />
          <span>+ Add Bone</span>
        </button>

        <button 
          @click="animationStore.clickToPlaceMode = !animationStore.clickToPlaceMode"
          class="py-1.5 px-2 rounded-xs font-bold text-xs flex items-center justify-center gap-1 transition border"
          :class="animationStore.clickToPlaceMode ? 'bg-amber-500 text-slate-950 border-amber-400 font-extrabold' : 'bg-ui-input border-ui-borderSubtle text-ui-textSecondary hover:bg-ui-hover'"
        >
          <span>Draw (B)</span>
        </button>
      </div>

      <!-- Quick Bones List -->
      <div v-if="animationStore.armature.bones.length > 0" class="space-y-1 flex-1 overflow-y-auto">
        <span class="text-[10px] text-ui-textMuted font-bold uppercase">Armature Bones:</span>
        <div class="space-y-0.5">
          <button 
            v-for="b in animationStore.armature.bones" 
            :key="b.id"
            @click="animationStore.selectBone(b.id)"
            class="w-full px-2 py-1 bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle rounded-xs text-left text-xs text-ui-textPrimary font-bold flex items-center gap-1.5 transition"
          >
            <BlenderIcon name="bone" :size="11" color="#f59e0b" />
            <span class="truncate">{{ b.name }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
