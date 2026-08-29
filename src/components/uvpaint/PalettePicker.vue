<script setup lang="ts">
import { useToolStore } from '../../stores/toolStore'
import { useProjectStore } from '../../stores/projectStore'
import { DEFAULT_PALETTES } from '../../utils/color'
import { Palette } from '../../types/texture'

const toolStore = useToolStore()
const projectStore = useProjectStore()

function selectPalette(p: Palette) {
  projectStore.activePalette = p
}

function setColor(hex: string) {
  toolStore.primaryColor = hex
}

function setSecondaryColor(e: MouseEvent, hex: string) {
  e.preventDefault()
  toolStore.secondaryColor = hex
}
</script>

<template>
  <div class="bg-dcc-850 border border-dcc-750 rounded-lg p-2.5 flex flex-col space-y-2.5 select-none text-xs">
    <!-- Header: Color Swatches & Active Colors -->
    <div class="flex items-center justify-between">
      <span class="font-bold text-slate-300 uppercase tracking-wider font-mono text-[11px]">Palette & Color</span>
      
      <!-- Primary / Secondary color swatches -->
      <div class="flex items-center space-x-1.5">
        <div class="relative w-7 h-7">
          <div 
            class="absolute top-0 left-0 w-5 h-5 rounded border border-dcc-600 shadow cursor-pointer"
            :style="{ backgroundColor: toolStore.primaryColor }"
            title="Primary Color"
          ></div>
          <div 
            class="absolute bottom-0 right-0 w-4 h-4 rounded border border-dcc-600 shadow cursor-pointer"
            :style="{ backgroundColor: toolStore.secondaryColor }"
            title="Secondary Color (Right-Click swatch)"
          ></div>
        </div>
        <input 
          type="color" 
          v-model="toolStore.primaryColor" 
          class="w-6 h-6 rounded cursor-pointer bg-transparent border-0" 
        />
      </div>
    </div>

    <!-- Palette Selector dropdown -->
    <div class="flex items-center space-x-2">
      <select 
        :value="projectStore.activePalette.id" 
        @change="(e) => {
          const target = e.target as HTMLSelectElement
          const found = DEFAULT_PALETTES.find(p => p.id === target.value)
          if (found) selectPalette(found)
        }"
        class="w-full bg-dcc-900 border border-dcc-700 text-slate-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-indigo-500"
      >
        <option v-for="pal in DEFAULT_PALETTES" :key="pal.id" :value="pal.id">
          {{ pal.name }} ({{ pal.colors.length }} colors)
        </option>
      </select>
    </div>

    <!-- Swatch Color Grid -->
    <div class="grid grid-cols-8 gap-1 p-1.5 bg-dcc-900 rounded border border-dcc-750">
      <button 
        v-for="col in projectStore.activePalette.colors" 
        :key="col"
        class="w-5 h-5 rounded-sm border transition transform hover:scale-110 active:scale-95"
        :class="toolStore.primaryColor.toLowerCase() === col.toLowerCase() ? 'border-white ring-2 ring-indigo-500 shadow-md' : 'border-black/40'"
        :style="{ backgroundColor: col }"
        @click="setColor(col)"
        @contextmenu="setSecondaryColor($event, col)"
        :title="col"
      ></button>
    </div>
  </div>
</template>
