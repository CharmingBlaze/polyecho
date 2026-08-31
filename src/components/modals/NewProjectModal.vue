<script setup lang="ts">
import { useProjectStore } from '../../stores/projectStore'
import { useAnimationStore } from '../../stores/animationStore'
import { 
  createCharacterTemplate, 
  createTreasureChestTemplate, 
  createDungeonRoomTemplate 
} from '../../core/geometry/Templates'
import { X, Box, User, Shield, Castle } from 'lucide-vue-next'

const projectStore = useProjectStore()
const animationStore = useAnimationStore()

const emit = defineEmits<{
  (e: 'close'): void
}>()

function loadTemplate(type: 'blank' | 'character' | 'chest' | 'dungeon') {
  projectStore.recordState('Load Template')

  if (type === 'blank') {
    projectStore.resetToDefaultProject()
  } else if (type === 'character') {
    const t = createCharacterTemplate()
    projectStore.projectName = t.name
    projectStore.meshes = t.meshes
    if (t.armature) {
      animationStore.armature = t.armature
      animationStore.selectedBoneId = t.armature.bones[0]?.id || null
    }
  } else if (type === 'chest') {
    const t = createTreasureChestTemplate()
    projectStore.projectName = t.name
    projectStore.meshes = t.meshes
  } else if (type === 'dungeon') {
    const t = createDungeonRoomTemplate()
    projectStore.projectName = t.name
    projectStore.meshes = t.meshes
  } else {
    projectStore.resetToDefaultProject()
  }

  projectStore.activeMeshId = projectStore.meshes[0]?.id || ''
  projectStore.clearSubSelections()
  projectStore.markGeometryUpdated()
  emit('close')
}
</script>

<template>
  <div class="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 select-none">
    <div class="bg-dcc-850 border border-dcc-700 rounded-xl w-[560px] shadow-2xl overflow-hidden flex flex-col">
      <!-- Header -->
      <div class="h-12 bg-dcc-900 border-b border-dcc-750 px-4 flex items-center justify-between">
        <div class="flex items-center space-x-2">
          <Box class="w-4 h-4 text-indigo-400" />
          <span class="font-bold text-sm text-slate-200 font-mono">Create New Project Template</span>
        </div>
        <button @click="$emit('close')" class="p-1 rounded text-slate-400 hover:text-white hover:bg-dcc-750">
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Template Cards Grid -->
      <div class="p-5 grid grid-cols-2 gap-3.5">
        <!-- Blank Cube -->
        <button 
          @click="loadTemplate('blank')"
          class="flex flex-col items-start p-3.5 bg-dcc-900 hover:bg-dcc-750 border border-dcc-750 hover:border-indigo-500 rounded-lg text-left transition group"
        >
          <div class="w-8 h-8 rounded bg-indigo-500/20 text-indigo-400 flex items-center justify-center mb-2.5 group-hover:scale-110 transition">
            <Box class="w-4 h-4" />
          </div>
          <span class="font-bold text-xs text-slate-200 font-mono">Blank Model</span>
          <span class="text-[11px] text-slate-400 mt-1">Start from scratch with a single editable 3D low-poly cube.</span>
        </button>

        <!-- Rigged Character -->
        <button 
          @click="loadTemplate('character')"
          class="flex flex-col items-start p-3.5 bg-dcc-900 hover:bg-dcc-750 border border-dcc-750 hover:border-indigo-500 rounded-lg text-left transition group"
        >
          <div class="w-8 h-8 rounded bg-amber-500/20 text-amber-400 flex items-center justify-center mb-2.5 group-hover:scale-110 transition">
            <User class="w-4 h-4" />
          </div>
          <span class="font-bold text-xs text-slate-200 font-mono">Rigged Character</span>
          <span class="text-[11px] text-slate-400 mt-1">Humanoid character complete with 6-bone Armature & Walk cycle animation.</span>
        </button>

        <!-- Treasure Chest -->
        <button 
          @click="loadTemplate('chest')"
          class="flex flex-col items-start p-3.5 bg-dcc-900 hover:bg-dcc-750 border border-dcc-750 hover:border-indigo-500 rounded-lg text-left transition group"
        >
          <div class="w-8 h-8 rounded bg-emerald-500/20 text-emerald-400 flex items-center justify-center mb-2.5 group-hover:scale-110 transition">
            <Shield class="w-4 h-4" />
          </div>
          <span class="font-bold text-xs text-slate-200 font-mono">Game Prop (Chest)</span>
          <span class="text-[11px] text-slate-400 mt-1">Classic retro treasure chest with separated lid and lock mesh parts.</span>
        </button>

        <!-- Dungeon Room -->
        <button 
          @click="loadTemplate('dungeon')"
          class="flex flex-col items-start p-3.5 bg-dcc-900 hover:bg-dcc-750 border border-dcc-750 hover:border-indigo-500 rounded-lg text-left transition group"
        >
          <div class="w-8 h-8 rounded bg-cyan-500/20 text-cyan-400 flex items-center justify-center mb-2.5 group-hover:scale-110 transition">
            <Castle class="w-4 h-4" />
          </div>
          <span class="font-bold text-xs text-slate-200 font-mono">PSX Dungeon Room</span>
          <span class="text-[11px] text-slate-400 mt-1">Modular dungeon tile with corner walls, pillar, and stone floor.</span>
        </button>
      </div>
    </div>
  </div>
</template>
