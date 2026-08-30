<script setup lang="ts">
import { computed, ref } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { applyModifier } from '../../core/geometry/Modifiers'
import UiNumberField from '../ui/UiNumberField.vue'
import { 
  Wrench, 
  Trash2, 
  ChevronDown, 
  ChevronRight,
  Layers,
  Shield,
  FlipHorizontal
} from 'lucide-vue-next'

const projectStore = useProjectStore()
const activeMesh = computed(() => projectStore.activeMesh)

const showAddMenu = ref<boolean>(false)

const openModifiers = ref<Record<string, boolean>>({
  mirror: true,
  subdivision: true,
  solidify: true
})

function toggleSection(name: string) {
  openModifiers.value[name] = !openModifiers.value[name]
}

// ----------------------------------------
// MODIFIER ADDERS
// ----------------------------------------
function addMirrorModifier() {
  if (!activeMesh.value) return
  projectStore.recordState('Add Mirror Modifier')
  activeMesh.value.mirror = {
    enabled: true,
    axisX: true,
    axisY: false,
    axisZ: false,
    clipping: true,
    merge: true,
    mergeThreshold: 0.02,
    flipU: false,
    flipV: false
  }
  showAddMenu.value = false
}

function addSubdivisionModifier() {
  if (!activeMesh.value) return
  projectStore.recordState('Add Subdivision Modifier')
  activeMesh.value.subdivision = {
    enabled: true,
    level: 1
  }
  showAddMenu.value = false
}

function addSolidifyModifier() {
  if (!activeMesh.value) return
  projectStore.recordState('Add Solidify Modifier')
  activeMesh.value.solidify = {
    enabled: true,
    thickness: 0.08,
    offset: -1
  }
  showAddMenu.value = false
}

// ----------------------------------------
// MODIFIER APPLIERS & REMOVERS
// ----------------------------------------
function handleApply(type: 'mirror' | 'subdivision' | 'solidify') {
  if (!activeMesh.value) return
  projectStore.recordState(`Apply ${type} Modifier`)
  applyModifier(activeMesh.value, type)
}

function handleRemove(type: 'mirror' | 'subdivision' | 'solidify') {
  if (!activeMesh.value) return
  projectStore.recordState(`Remove ${type} Modifier`)
  if (type === 'mirror' && activeMesh.value.mirror) {
    activeMesh.value.mirror.enabled = false
  } else if (type === 'subdivision' && activeMesh.value.subdivision) {
    activeMesh.value.subdivision.enabled = false
  } else if (type === 'solidify' && activeMesh.value.solidify) {
    activeMesh.value.solidify.enabled = false
  }
}

const activeModifiersCount = computed(() => {
  if (!activeMesh.value) return 0
  let count = 0
  if (activeMesh.value.mirror?.enabled) count++
  if (activeMesh.value.subdivision?.enabled) count++
  if (activeMesh.value.solidify?.enabled) count++
  return count
})
</script>

<template>
  <div class="flex flex-col select-none text-xs font-sans p-2 space-y-2">
    <!-- Blender Add Modifier Header -->
    <div class="relative">
      <button 
        @click="showAddMenu = !showAddMenu"
        class="w-full py-1.5 px-3 bg-ui-input hover:bg-ui-hover text-ui-textPrimary border border-ui-borderDefault rounded-xs flex items-center justify-between font-medium transition shadow-xs"
      >
        <div class="flex items-center gap-2">
          <Wrench class="w-3.5 h-3.5 text-sky-400" />
          <span>Add Modifier</span>
        </div>
        <ChevronDown class="w-3.5 h-3.5 text-ui-textMuted" />
      </button>

      <!-- Add Modifier Dropdown Menu -->
      <div 
        v-if="showAddMenu"
        class="absolute left-0 right-0 top-full mt-1 bg-[#1c1f26] border border-ui-borderStrong rounded-xs shadow-2xl z-50 p-1 text-xs divide-y divide-ui-borderSubtle"
      >
        <div class="py-1">
          <div class="px-2 py-0.5 text-[10px] font-bold text-ui-textMuted uppercase tracking-wider">Generate</div>
          
          <button 
            @click="addMirrorModifier"
            class="w-full text-left px-2.5 py-1.5 hover:bg-ui-hover rounded-xs flex items-center justify-between text-ui-textPrimary"
          >
            <div class="flex items-center gap-2">
              <FlipHorizontal class="w-3.5 h-3.5 text-amber-400" />
              <span>Mirror</span>
            </div>
            <span class="text-[10px] text-ui-textMuted font-mono">Symmetrize</span>
          </button>

          <button 
            @click="addSubdivisionModifier"
            class="w-full text-left px-2.5 py-1.5 hover:bg-ui-hover rounded-xs flex items-center justify-between text-ui-textPrimary"
          >
            <div class="flex items-center gap-2">
              <Layers class="w-3.5 h-3.5 text-sky-400" />
              <span>Subdivision Surface</span>
            </div>
            <span class="text-[10px] text-ui-textMuted font-mono">Smooth</span>
          </button>

          <button 
            @click="addSolidifyModifier"
            class="w-full text-left px-2.5 py-1.5 hover:bg-ui-hover rounded-xs flex items-center justify-between text-ui-textPrimary"
          >
            <div class="flex items-center gap-2">
              <Shield class="w-3.5 h-3.5 text-emerald-400" />
              <span>Solidify</span>
            </div>
            <span class="text-[10px] text-ui-textMuted font-mono">Shell</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Active Modifiers Stack List -->
    <div v-if="activeMesh && activeModifiersCount > 0" class="space-y-2">
      <!-- 1. MIRROR MODIFIER CARD -->
      <div 
        v-if="activeMesh.mirror?.enabled"
        class="bg-ui-panel border border-ui-borderDefault rounded-xs overflow-hidden shadow-xs"
      >
        <div class="h-7 bg-ui-header px-2 flex items-center justify-between border-b border-ui-borderSubtle">
          <button @click="toggleSection('mirror')" class="flex items-center gap-1.5 font-semibold text-ui-textPrimary text-[11px]">
            <ChevronDown v-if="openModifiers.mirror" class="w-3 h-3 text-ui-textMuted" />
            <ChevronRight v-else class="w-3 h-3 text-ui-textMuted" />
            <FlipHorizontal class="w-3.5 h-3.5 text-amber-400" />
            <span>Mirror</span>
          </button>

          <div class="flex items-center space-x-1">
            <button 
              @click="handleApply('mirror')"
              class="px-2 py-0.5 bg-ui-accent hover:bg-indigo-500 text-white rounded-xs text-[10px] font-medium transition"
              title="Apply Modifier"
            >
              Apply
            </button>
            <button 
              @click="handleRemove('mirror')"
              class="p-1 text-ui-textMuted hover:text-rose-400 rounded-xs hover:bg-ui-hover transition"
              title="Remove Modifier"
            >
              <Trash2 class="w-3 h-3" />
            </button>
          </div>
        </div>

        <div v-show="openModifiers.mirror" class="p-2.5 space-y-2">
          <!-- Mirror Axes -->
          <div class="flex items-center justify-between text-[11px]">
            <span class="text-ui-textSecondary font-bold">Axis:</span>
            <div class="flex items-center space-x-1">
              <button 
                @click="activeMesh.mirror.axisX = !activeMesh.mirror.axisX"
                class="px-2.5 py-0.5 rounded-xs border text-[10px] font-bold transition"
                :class="activeMesh.mirror.axisX ? 'bg-rose-500/20 text-rose-300 border-rose-500/50' : 'bg-ui-input text-ui-textMuted border-ui-borderDefault'"
              >
                X
              </button>
              <button 
                @click="activeMesh.mirror.axisY = !activeMesh.mirror.axisY"
                class="px-2.5 py-0.5 rounded-xs border text-[10px] font-bold transition"
                :class="activeMesh.mirror.axisY ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50' : 'bg-ui-input text-ui-textMuted border-ui-borderDefault'"
              >
                Y
              </button>
              <button 
                @click="activeMesh.mirror.axisZ = !activeMesh.mirror.axisZ"
                class="px-2.5 py-0.5 rounded-xs border text-[10px] font-bold transition"
                :class="activeMesh.mirror.axisZ ? 'bg-sky-500/20 text-sky-300 border-sky-500/50' : 'bg-ui-input text-ui-textMuted border-ui-borderDefault'"
              >
                Z
              </button>
            </div>
          </div>

          <!-- Options -->
          <div class="grid grid-cols-2 gap-1 text-[10px]">
            <label class="flex items-center space-x-1.5 cursor-pointer bg-ui-input p-1.5 rounded-xs border border-ui-borderSubtle">
              <input type="checkbox" v-model="activeMesh.mirror.clipping" class="rounded-xs bg-ui-panel border-ui-borderDefault text-ui-accent" />
              <span>Clipping</span>
            </label>
            <label class="flex items-center space-x-1.5 cursor-pointer bg-ui-input p-1.5 rounded-xs border border-ui-borderSubtle">
              <input type="checkbox" v-model="activeMesh.mirror.merge" class="rounded-xs bg-ui-panel border-ui-borderDefault text-ui-accent" />
              <span>Merge</span>
            </label>
          </div>
        </div>
      </div>

      <!-- 2. SUBDIVISION SURFACE MODIFIER CARD -->
      <div 
        v-if="activeMesh.subdivision?.enabled"
        class="bg-ui-panel border border-ui-borderDefault rounded-xs overflow-hidden shadow-xs"
      >
        <div class="h-7 bg-ui-header px-2 flex items-center justify-between border-b border-ui-borderSubtle">
          <button @click="toggleSection('subdivision')" class="flex items-center gap-1.5 font-semibold text-ui-textPrimary text-[11px]">
            <ChevronDown v-if="openModifiers.subdivision" class="w-3 h-3 text-ui-textMuted" />
            <ChevronRight v-else class="w-3 h-3 text-ui-textMuted" />
            <Layers class="w-3.5 h-3.5 text-sky-400" />
            <span>Subdivision Surface</span>
          </button>

          <div class="flex items-center space-x-1">
            <button 
              @click="handleApply('subdivision')"
              class="px-2 py-0.5 bg-ui-accent hover:bg-indigo-500 text-white rounded-xs text-[10px] font-medium transition"
              title="Apply Modifier"
            >
              Apply
            </button>
            <button 
              @click="handleRemove('subdivision')"
              class="p-1 text-ui-textMuted hover:text-rose-400 rounded-xs hover:bg-ui-hover transition"
              title="Remove Modifier"
            >
              <Trash2 class="w-3 h-3" />
            </button>
          </div>
        </div>

        <div v-show="openModifiers.subdivision" class="p-2.5 space-y-2">
          <div class="flex items-center justify-between text-[11px]">
            <span class="text-ui-textSecondary font-bold">Levels Viewport:</span>
            <div class="flex items-center space-x-1">
              <button 
                @click="activeMesh.subdivision.level = 1"
                class="px-2.5 py-0.5 rounded-xs border text-[10px] font-bold"
                :class="activeMesh.subdivision.level === 1 ? 'bg-sky-500/20 text-sky-300 border-sky-500/50' : 'bg-ui-input text-ui-textMuted border-ui-borderDefault'"
              >
                1
              </button>
              <button 
                @click="activeMesh.subdivision.level = 2"
                class="px-2.5 py-0.5 rounded-xs border text-[10px] font-bold"
                :class="activeMesh.subdivision.level === 2 ? 'bg-sky-500/20 text-sky-300 border-sky-500/50' : 'bg-ui-input text-ui-textMuted border-ui-borderDefault'"
              >
                2
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 3. SOLIDIFY MODIFIER CARD -->
      <div 
        v-if="activeMesh.solidify?.enabled"
        class="bg-ui-panel border border-ui-borderDefault rounded-xs overflow-hidden shadow-xs"
      >
        <div class="h-7 bg-ui-header px-2 flex items-center justify-between border-b border-ui-borderSubtle">
          <button @click="toggleSection('solidify')" class="flex items-center gap-1.5 font-semibold text-ui-textPrimary text-[11px]">
            <ChevronDown v-if="openModifiers.solidify" class="w-3 h-3 text-ui-textMuted" />
            <ChevronRight v-else class="w-3 h-3 text-ui-textMuted" />
            <Shield class="w-3.5 h-3.5 text-emerald-400" />
            <span>Solidify</span>
          </button>

          <div class="flex items-center space-x-1">
            <button 
              @click="handleApply('solidify')"
              class="px-2 py-0.5 bg-ui-accent hover:bg-indigo-500 text-white rounded-xs text-[10px] font-medium transition"
              title="Apply Modifier"
            >
              Apply
            </button>
            <button 
              @click="handleRemove('solidify')"
              class="p-1 text-ui-textMuted hover:text-rose-400 rounded-xs hover:bg-ui-hover transition"
              title="Remove Modifier"
            >
              <Trash2 class="w-3 h-3" />
            </button>
          </div>
        </div>

        <div v-show="openModifiers.solidify" class="p-2.5 space-y-2">
          <div class="space-y-1">
            <span class="text-[10px] text-ui-textSecondary font-bold">Thickness</span>
            <UiNumberField v-model="activeMesh.solidify.thickness" :step="0.01" :precision="3" />
          </div>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else class="p-6 text-center text-ui-textMuted italic text-xs border border-dashed border-ui-borderSubtle rounded-xs">
      No active modifiers on this mesh.
    </div>
  </div>
</template>
