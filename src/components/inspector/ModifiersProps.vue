<script setup lang="ts">
import { computed, ref } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
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

const showAddMenu = ref(false)

const openModifiers = ref<Record<string, boolean>>({
  mirror: true,
  subdivision: true,
  solidify: true
})

function toggleSection(name: string) {
  openModifiers.value[name] = !openModifiers.value[name]
}

function bump() {
  projectStore.markGeometryUpdated()
}

function setFillRim(on: boolean) {
  if (!activeMesh.value?.solidify) return
  activeMesh.value.solidify.fillRim = on
  bump()
}

const activeModifiersCount = computed(() => {
  if (!activeMesh.value) return 0
  let count = 0
  if (activeMesh.value.mirror) count++
  if (activeMesh.value.subdivision) count++
  if (activeMesh.value.solidify) count++
  return count
})
</script>

<template>
  <div class="flex flex-col select-none text-xs font-sans">
    <div class="h-7 bg-ui-header border-b border-ui-borderSubtle px-2.5 flex items-center justify-between">
      <div class="flex items-center space-x-1.5">
        <Wrench class="w-3 h-3 text-sky-400" />
        <span class="text-[11px] font-medium text-ui-textMuted">Modifiers</span>
      </div>
      <span class="font-semibold text-ui-textPrimary truncate max-w-[150px]">{{ activeMesh?.name || 'No object' }}</span>
    </div>

    <div class="p-2 space-y-2">
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

        <div
          v-if="showAddMenu"
          class="absolute left-0 right-0 top-full mt-1 bg-[#1c1f26] border border-ui-borderStrong rounded-xs shadow-2xl z-50 p-1 text-xs divide-y divide-ui-borderSubtle"
        >
          <div class="py-1">
            <div class="px-2 py-0.5 text-[10px] font-bold text-ui-textMuted uppercase tracking-wider">Generate</div>

            <button
              @click="projectStore.addModifier('mirror'); showAddMenu = false"
              class="w-full text-left px-2.5 py-1.5 hover:bg-ui-hover rounded-xs flex items-center justify-between text-ui-textPrimary"
            >
              <div class="flex items-center gap-2">
                <FlipHorizontal class="w-3.5 h-3.5 text-amber-400" />
                <span>Mirror</span>
              </div>
              <span class="text-[10px] text-ui-textMuted font-mono">Bisect</span>
            </button>

            <button
              @click="projectStore.addModifier('subdivision'); showAddMenu = false"
              class="w-full text-left px-2.5 py-1.5 hover:bg-ui-hover rounded-xs flex items-center justify-between text-ui-textPrimary"
            >
              <div class="flex items-center gap-2">
                <Layers class="w-3.5 h-3.5 text-sky-400" />
                <span>Subdivision Surface</span>
              </div>
              <span class="text-[10px] text-ui-textMuted font-mono">Catmull–Clark</span>
            </button>

            <button
              @click="projectStore.addModifier('solidify'); showAddMenu = false"
              class="w-full text-left px-2.5 py-1.5 hover:bg-ui-hover rounded-xs flex items-center justify-between text-ui-textPrimary"
            >
              <div class="flex items-center gap-2">
                <Shield class="w-3.5 h-3.5 text-emerald-400" />
                <span>Solidify</span>
              </div>
              <span class="text-[10px] text-ui-textMuted font-mono">Shell + rim</span>
            </button>
          </div>
        </div>
      </div>

      <div v-if="activeMesh && activeModifiersCount > 0" class="space-y-2">
        <div
          v-if="activeMesh.mirror"
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
              <label class="flex items-center" title="Realtime">
                <input type="checkbox" v-model="activeMesh.mirror.enabled" class="accent-ui-accent" @change="bump" />
              </label>
              <button
                @click="projectStore.applyMeshModifier('mirror')"
                class="px-2 py-0.5 bg-ui-accent hover:bg-indigo-500 text-white rounded-xs text-[10px] font-medium transition"
                title="Bake into mesh"
              >
                Apply
              </button>
              <button
                @click="projectStore.removeMeshModifier('mirror')"
                class="p-1 text-ui-textMuted hover:text-rose-400 rounded-xs hover:bg-ui-hover transition"
                title="Remove Modifier"
              >
                <Trash2 class="w-3 h-3" />
              </button>
            </div>
          </div>

          <div v-show="openModifiers.mirror" class="p-2.5 space-y-2">
            <div class="flex items-center justify-between text-[11px]">
              <span class="text-ui-textSecondary font-bold">Axis</span>
              <div class="flex items-center space-x-1">
                <button
                  @click="activeMesh.mirror.axisX = !activeMesh.mirror.axisX; bump()"
                  class="px-2.5 py-0.5 rounded-xs border text-[10px] font-bold transition"
                  :class="activeMesh.mirror.axisX ? 'bg-rose-500/20 text-rose-300 border-rose-500/50' : 'bg-ui-input text-ui-textMuted border-ui-borderDefault'"
                >
                  X
                </button>
                <button
                  @click="activeMesh.mirror.axisY = !activeMesh.mirror.axisY; bump()"
                  class="px-2.5 py-0.5 rounded-xs border text-[10px] font-bold transition"
                  :class="activeMesh.mirror.axisY ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50' : 'bg-ui-input text-ui-textMuted border-ui-borderDefault'"
                >
                  Y
                </button>
                <button
                  @click="activeMesh.mirror.axisZ = !activeMesh.mirror.axisZ; bump()"
                  class="px-2.5 py-0.5 rounded-xs border text-[10px] font-bold transition"
                  :class="activeMesh.mirror.axisZ ? 'bg-sky-500/20 text-sky-300 border-sky-500/50' : 'bg-ui-input text-ui-textMuted border-ui-borderDefault'"
                >
                  Z
                </button>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-1 text-[10px]">
              <label class="flex items-center space-x-1.5 cursor-pointer bg-ui-input p-1.5 rounded-xs border border-ui-borderSubtle">
                <input type="checkbox" v-model="activeMesh.mirror.bisect" class="rounded-xs bg-ui-panel border-ui-borderDefault text-ui-accent" @change="bump" />
                <span>Bisect</span>
              </label>
              <label class="flex items-center space-x-1.5 cursor-pointer bg-ui-input p-1.5 rounded-xs border border-ui-borderSubtle">
                <input type="checkbox" v-model="activeMesh.mirror.merge" class="rounded-xs bg-ui-panel border-ui-borderDefault text-ui-accent" @change="bump" />
                <span>Merge</span>
              </label>
              <label class="flex items-center space-x-1.5 cursor-pointer bg-ui-input p-1.5 rounded-xs border border-ui-borderSubtle">
                <input type="checkbox" v-model="activeMesh.mirror.clipping" class="rounded-xs bg-ui-panel border-ui-borderDefault text-ui-accent" />
                <span>Clipping</span>
              </label>
              <label class="flex items-center space-x-1.5 cursor-pointer bg-ui-input p-1.5 rounded-xs border border-ui-borderSubtle">
                <input type="checkbox" v-model="activeMesh.mirror.flipU" class="rounded-xs bg-ui-panel border-ui-borderDefault text-ui-accent" @change="bump" />
                <span>Flip U</span>
              </label>
            </div>

            <div class="space-y-1">
              <span class="text-[10px] text-ui-textSecondary font-bold">Merge Distance</span>
              <UiNumberField v-model="activeMesh.mirror.mergeThreshold" :step="0.001" :min="0" :precision="4" @change="bump" />
            </div>
          </div>
        </div>

        <div
          v-if="activeMesh.subdivision"
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
              <label class="flex items-center" title="Realtime">
                <input type="checkbox" v-model="activeMesh.subdivision.enabled" class="accent-ui-accent" @change="bump" />
              </label>
              <button
                @click="projectStore.applyMeshModifier('subdivision')"
                class="px-2 py-0.5 bg-ui-accent hover:bg-indigo-500 text-white rounded-xs text-[10px] font-medium transition"
                title="Bake into mesh"
              >
                Apply
              </button>
              <button
                @click="projectStore.removeMeshModifier('subdivision')"
                class="p-1 text-ui-textMuted hover:text-rose-400 rounded-xs hover:bg-ui-hover transition"
                title="Remove Modifier"
              >
                <Trash2 class="w-3 h-3" />
              </button>
            </div>
          </div>

          <div v-show="openModifiers.subdivision" class="p-2.5 space-y-2">
            <div class="flex items-center justify-between text-[11px]">
              <span class="text-ui-textSecondary font-bold">Type</span>
              <div class="flex items-center space-x-1">
                <button
                  @click="activeMesh.subdivision.type = 'catmull-clark'; bump()"
                  class="px-2 py-0.5 rounded-xs border text-[10px] font-bold"
                  :class="(activeMesh.subdivision.type || 'catmull-clark') === 'catmull-clark' ? 'bg-sky-500/20 text-sky-300 border-sky-500/50' : 'bg-ui-input text-ui-textMuted border-ui-borderDefault'"
                >
                  Catmull–Clark
                </button>
                <button
                  @click="activeMesh.subdivision.type = 'simple'; bump()"
                  class="px-2 py-0.5 rounded-xs border text-[10px] font-bold"
                  :class="activeMesh.subdivision.type === 'simple' ? 'bg-sky-500/20 text-sky-300 border-sky-500/50' : 'bg-ui-input text-ui-textMuted border-ui-borderDefault'"
                >
                  Simple
                </button>
              </div>
            </div>
            <div class="flex items-center justify-between text-[11px]">
              <span class="text-ui-textSecondary font-bold">Levels</span>
              <div class="flex items-center space-x-1">
                <button
                  v-for="lv in [1, 2, 3]"
                  :key="lv"
                  @click="activeMesh.subdivision.level = lv; bump()"
                  class="px-2.5 py-0.5 rounded-xs border text-[10px] font-bold"
                  :class="activeMesh.subdivision.level === lv ? 'bg-sky-500/20 text-sky-300 border-sky-500/50' : 'bg-ui-input text-ui-textMuted border-ui-borderDefault'"
                >
                  {{ lv }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div
          v-if="activeMesh.solidify"
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
              <label class="flex items-center" title="Realtime">
                <input type="checkbox" v-model="activeMesh.solidify.enabled" class="accent-ui-accent" @change="bump" />
              </label>
              <button
                @click="projectStore.applyMeshModifier('solidify')"
                class="px-2 py-0.5 bg-ui-accent hover:bg-indigo-500 text-white rounded-xs text-[10px] font-medium transition"
                title="Bake into mesh"
              >
                Apply
              </button>
              <button
                @click="projectStore.removeMeshModifier('solidify')"
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
              <UiNumberField v-model="activeMesh.solidify.thickness" :step="0.01" :precision="3" @change="bump" />
            </div>
            <div class="space-y-1">
              <span class="text-[10px] text-ui-textSecondary font-bold">Offset</span>
              <UiNumberField v-model="activeMesh.solidify.offset" :step="0.1" :min="-1" :max="1" :precision="2" @change="bump" />
            </div>
            <label class="flex items-center space-x-1.5 cursor-pointer bg-ui-input p-1.5 rounded-xs border border-ui-borderSubtle text-[10px]">
              <input
                type="checkbox"
                :checked="activeMesh.solidify.fillRim !== false"
                class="rounded-xs bg-ui-panel border-ui-borderDefault text-ui-accent"
                @change="setFillRim(activeMesh.solidify.fillRim === false)"
              />
              <span>Fill Rim</span>
            </label>
          </div>
        </div>
      </div>

      <div v-else class="p-6 text-center text-ui-textMuted italic text-xs border border-dashed border-ui-borderSubtle rounded-xs">
        No modifiers on this object.
      </div>
    </div>
  </div>
</template>
