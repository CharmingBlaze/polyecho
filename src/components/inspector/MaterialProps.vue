<script setup lang="ts">
import { useToolStore } from '../../stores/toolStore'
import UiSection from '../ui/UiSection.vue'
import { Tv } from 'lucide-vue-next'

const toolStore = useToolStore()
</script>

<template>
  <div class="flex flex-col select-none text-xs font-mono">
    <UiSection title="Retro PSX Shading" :default-open="true">
      <div class="space-y-2">
        <!-- Vertex Jitter -->
        <label class="flex items-center justify-between cursor-pointer bg-ui-input p-1.5 rounded-xs border border-ui-borderSubtle">
          <span class="text-ui-textSecondary">PS1 Vertex Jitter</span>
          <input 
            type="checkbox" 
            v-model="toolStore.viewport.psxJitter" 
            class="rounded-xs text-ui-accent bg-ui-panel border-ui-borderDefault focus:ring-0 cursor-pointer" 
          />
        </label>

        <!-- Affine Texture Warping -->
        <label class="flex items-center justify-between cursor-pointer bg-ui-input p-1.5 rounded-xs border border-ui-borderSubtle">
          <span class="text-ui-textSecondary">Affine Texture Distortion</span>
          <input 
            type="checkbox" 
            v-model="toolStore.viewport.psxAffine" 
            class="rounded-xs text-ui-accent bg-ui-panel border-ui-borderDefault focus:ring-0 cursor-pointer" 
          />
        </label>

        <!-- Bayer Dithering -->
        <label class="flex items-center justify-between cursor-pointer bg-ui-input p-1.5 rounded-xs border border-ui-borderSubtle">
          <span class="text-ui-textSecondary">15-Bit Bayer Dithering</span>
          <input 
            type="checkbox" 
            v-model="toolStore.viewport.dither" 
            class="rounded-xs text-ui-accent bg-ui-panel border-ui-borderDefault focus:ring-0 cursor-pointer" 
          />
        </label>

        <!-- CRT Filter Overlay -->
        <label class="flex items-center justify-between cursor-pointer bg-ui-input p-1.5 rounded-xs border border-ui-borderSubtle">
          <span class="text-ui-textSecondary flex items-center gap-1.5">
            <Tv class="w-3.5 h-3.5 text-indigo-400" />
            <span>CRT Scanlines</span>
          </span>
          <input 
            type="checkbox" 
            v-model="toolStore.viewport.crtFilter" 
            class="rounded-xs text-ui-accent bg-ui-panel border-ui-borderDefault focus:ring-0 cursor-pointer" 
          />
        </label>
      </div>
    </UiSection>
  </div>
</template>
