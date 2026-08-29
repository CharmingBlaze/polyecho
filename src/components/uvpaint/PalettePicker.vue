<script setup lang="ts">
import { useToolStore } from '../../stores/toolStore'
import { useProjectStore } from '../../stores/projectStore'
import { DEFAULT_PALETTES } from '../../utils/color'
import { Palette } from '../../types/texture'
import UiSection from '../ui/UiSection.vue'
import { ChevronDown, Pipette } from 'lucide-vue-next'

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
  <div class="flex flex-col select-none text-xs font-sans">
    <UiSection title="Palette & Color" :default-open="true">
      <template #actions>
        <!-- Primary & Secondary Color Overlapping Indicator -->
        <div class="flex items-center space-x-2">
          <div class="relative w-7 h-6 cursor-pointer" title="Active Colors: LMB Primary / RMB Secondary">
            <!-- Primary Color Box -->
            <div 
              class="absolute top-0 left-0 w-4 h-4 rounded-xs border border-ui-borderStrong shadow-sm z-10"
              :style="{ backgroundColor: toolStore.primaryColor }"
              title="Primary Color"
            ></div>
            <!-- Secondary Color Box -->
            <div 
              class="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-xs border border-ui-borderStrong shadow-sm"
              :style="{ backgroundColor: toolStore.secondaryColor }"
              title="Secondary Color"
            ></div>
          </div>

          <!-- Native Color Picker Trigger -->
          <label class="cursor-pointer relative flex items-center justify-center w-5 h-5 rounded-xs border border-ui-borderDefault bg-[#14161a] hover:border-ui-borderStrong transition text-ui-textMuted hover:text-ui-textPrimary" title="Pick Custom Color">
            <input 
              type="color" 
              v-model="toolStore.primaryColor" 
              class="opacity-0 absolute inset-0 w-full h-full cursor-pointer" 
            />
            <Pipette class="w-3 h-3 pointer-events-none" />
          </label>
        </div>
      </template>

      <!-- Palette Selector Custom Dropdown -->
      <div class="relative flex items-center w-full">
        <select 
          :value="projectStore.activePalette.id" 
          @change="(e) => {
            const target = e.target as HTMLSelectElement
            const found = DEFAULT_PALETTES.find(p => p.id === target.value)
            if (found) selectPalette(found)
          }"
          style="background-color: #14161a !important; color: #d8dbe0 !important;"
          class="w-full appearance-none border border-ui-borderDefault hover:border-ui-borderStrong focus:border-ui-accent rounded-xs pl-2.5 pr-7 h-7 text-xs font-sans focus:outline-none cursor-pointer transition shadow-inner"
        >
          <option 
            v-for="pal in DEFAULT_PALETTES" 
            :key="pal.id" 
            :value="pal.id"
            style="background-color: #14161a; color: #d8dbe0;"
            class="py-1"
          >
            {{ pal.name }} ({{ pal.colors.length }} colors)
          </option>
        </select>
        <ChevronDown class="w-3.5 h-3.5 text-ui-textMuted absolute right-2 pointer-events-none" />
      </div>

      <!-- Color Swatches Grid (High visibility 24px boxes) -->
      <div class="grid grid-cols-8 gap-1.5 pt-1">
        <button 
          v-for="(color, idx) in projectStore.activePalette.colors" 
          :key="idx"
          class="w-full h-6 rounded-xs border border-black/40 hover:scale-105 active:scale-95 transition-transform cursor-pointer relative shadow-sm"
          :class="{ 'ring-2 ring-ui-accent ring-offset-1 ring-offset-ui-panel': toolStore.primaryColor.toLowerCase() === color.toLowerCase() }"
          :style="{ backgroundColor: color }"
          :title="`Left-Click: Primary, Right-Click: Secondary (${color})`"
          @click="setColor(color)"
          @contextmenu="setSecondaryColor($event, color)"
        ></button>
      </div>
    </UiSection>
  </div>
</template>
