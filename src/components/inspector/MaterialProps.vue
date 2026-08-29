<script setup lang="ts">
import { useToolStore } from '../../stores/toolStore'
import { Sparkles, Tv } from 'lucide-vue-next'

const toolStore = useToolStore()
</script>

<template>
  <div class="bg-dcc-850 border border-dcc-750 rounded-lg p-2.5 flex flex-col space-y-2.5 select-none text-xs">
    <div class="flex items-center justify-between border-b border-dcc-750 pb-1.5">
      <span class="font-bold text-slate-300 uppercase tracking-wider font-mono text-[11px] flex items-center gap-1.5">
        <Sparkles class="w-3.5 h-3.5 text-amber-400" />
        <span>Retro PSX Shading</span>
      </span>
    </div>

    <!-- Toggles Grid -->
    <div class="flex flex-col space-y-2">
      <!-- Vertex Jitter -->
      <label class="flex items-center justify-between cursor-pointer">
        <span class="text-slate-300">PS1 Vertex Jitter</span>
        <input 
          type="checkbox" 
          v-model="toolStore.viewport.psxJitter" 
          class="w-4 h-4 rounded text-indigo-600 bg-dcc-900 border-dcc-700 focus:ring-0 cursor-pointer" 
        />
      </label>

      <!-- Affine Texture Warping -->
      <label class="flex items-center justify-between cursor-pointer">
        <span class="text-slate-300">Affine Texture Distortion</span>
        <input 
          type="checkbox" 
          v-model="toolStore.viewport.psxAffine" 
          class="w-4 h-4 rounded text-indigo-600 bg-dcc-900 border-dcc-700 focus:ring-0 cursor-pointer" 
        />
      </label>

      <!-- Bayer Dithering -->
      <label class="flex items-center justify-between cursor-pointer">
        <span class="text-slate-300">15-Bit Bayer Dithering</span>
        <input 
          type="checkbox" 
          v-model="toolStore.viewport.dither" 
          class="w-4 h-4 rounded text-indigo-600 bg-dcc-900 border-dcc-700 focus:ring-0 cursor-pointer" 
        />
      </label>

      <!-- CRT Filter Overlay -->
      <label class="flex items-center justify-between cursor-pointer">
        <span class="text-slate-300 flex items-center gap-1.5">
          <Tv class="w-3.5 h-3.5 text-indigo-400" />
          <span>CRT Scanlines</span>
        </span>
        <input 
          type="checkbox" 
          v-model="toolStore.viewport.crtFilter" 
          class="w-4 h-4 rounded text-indigo-600 bg-dcc-900 border-dcc-700 focus:ring-0 cursor-pointer" 
        />
      </label>
    </div>
  </div>
</template>
