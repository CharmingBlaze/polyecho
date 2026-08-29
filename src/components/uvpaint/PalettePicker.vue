<script setup lang="ts">
import { useToolStore } from '../../stores/toolStore'
import { useProjectStore } from '../../stores/projectStore'
import { DEFAULT_PALETTES } from '../../utils/color'
import { Palette } from '../../types/texture'
import UiSection from '../ui/UiSection.vue'

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
  <div class="flex flex-col select-none text-xs font-mono">
    <UiSection title="Palette & Color" :default-open="true">
      <template #actions>
        <!-- Primary / Secondary color preview -->
        <div class="flex items-center space-x-1">
          <div class="relative w-6 h-5">
            <div 
              class="absolute top-0 left-0 w-3.5 h-3.5 rounded-xs border border-ui-borderStrong shadow-xs cursor-pointer"
              :style="{ backgroundColor: toolStore.primaryColor }"
              title="Primary Color"
            ></div>
            <div 
              class="absolute bottom-0 right-0 w-3 h-3 rounded-xs border border-ui-borderStrong shadow-xs cursor-pointer"
              :style="{ backgroundColor: toolStore.secondaryColor }"
              title="Secondary Color (Right-Click swatch)"
            ></div>
          </div>
          <input 
            type="color" 
            v-model="toolStore.primaryColor" 
            class="w-4 h-4 rounded-xs cursor-pointer bg-transparent border-0" 
          />
        </div>
      </template>

      <!-- Palette Selector dropdown -->
      <div class="flex items-center">
        <select 
          :value="projectStore.activePalette.id" 
          @change="(e) => {
            const target = e.target as HTMLSelectElement
            const found = DEFAULT_PALETTES.find(p => p.id === target.value)
            if (found) selectPalette(found)
          }"
          class="w-full bg-ui-input border border-ui-borderDefault hover:border-ui-borderStrong focus:border-ui-accent rounded-xs px-2 h-6 text-[11px] font-mono text-ui-textPrimary focus:outline-none cursor-pointer"
        >
          <option 
            v-for="pal in DEFAULT_PALETTES" 
            :key="pal.id" 
            :value="pal.id"
            class="bg-ui-panel text-ui-textPrimary"
          >
            {{ pal.name }} ({{ pal.colors.length }} colors)
          </option>
        </select>
      </div>

      <!-- Color Swatches Grid -->
      <div class="grid grid-cols-8 gap-1 pt-1">
        <button 
          v-for="(color, idx) in projectStore.activePalette.colors" 
          :key="idx"
          class="w-full h-5 rounded-xs border border-ui-borderSubtle hover:scale-105 active:scale-95 transition cursor-pointer relative"
          :class="{ 'ring-1 ring-ui-accent border-ui-accent': toolStore.primaryColor.toLowerCase() === color.toLowerCase() }"
          :style="{ backgroundColor: color }"
          :title="`Left-Click: Primary, Right-Click: Secondary (${color})`"
          @click="setColor(color)"
          @contextmenu="setSecondaryColor($event, color)"
        ></button>
      </div>
    </UiSection>
  </div>
</template>
