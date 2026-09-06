<script setup lang="ts">
/** UV / Paint workspace tab router. Pixel math lives in `src/core/painting/PixelCanvas.ts`. */
import { computed } from 'vue'
import UVEditor from './UVEditor.vue'
import PixelEditor from './PixelEditor.vue'
import { useToolStore } from '../../stores/toolStore'
import { useProjectStore } from '../../stores/projectStore'
import BlenderIcon from '../icons/BlenderIcon.vue'

const toolStore = useToolStore()
const projectStore = useProjectStore()

const activeTab = computed({
  get: () => toolStore.uvWorkspaceTab === 'uv' ? 'uv' : 'paint',
  set: (val: 'uv' | 'paint') => {
    toolStore.uvWorkspaceTab = val
  }
})
</script>

<template>
  <div class="h-full w-full bg-ui-panel flex flex-col select-none overflow-hidden relative font-mono text-xs">
    <div class="uv-paint-tabs bg-ui-header border-b border-ui-borderSubtle px-2 flex items-center gap-2 shrink-0 z-30 h-8.5 min-h-[34px]">
      <div class="flex items-center bg-ui-input p-0.5 rounded-xs border border-ui-borderSubtle shrink-0">
        <button
          type="button"
          class="flex items-center space-x-1.5 px-2.5 py-0.5 rounded-xs text-[10px] font-bold transition cursor-pointer"
          :class="activeTab === 'uv' ? 'bg-ui-accent text-white shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="UV Unwrapping, Seams & Quadrant Atlas Mapping"
          @click="activeTab = 'uv'"
        >
          <BlenderIcon name="uv" :size="12" />
          <span>UV</span>
        </button>
        <button
          type="button"
          class="flex items-center space-x-1.5 px-2.5 py-0.5 rounded-xs text-[10px] font-bold transition cursor-pointer"
          :class="activeTab === 'paint' ? 'bg-ui-accent text-white shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Pixel & Texture Paint Studio"
          @click="activeTab = 'paint'"
        >
          <BlenderIcon name="brush" :size="11" />
          <span>Paint</span>
        </button>
      </div>
      <div id="uv-paint-command-slot" class="uv-paint-command-slot flex items-center min-w-0 flex-1 overflow-hidden" />
      <div class="flex items-center gap-1.5 shrink-0">
        <div class="px-2 py-0.5 rounded-xs bg-ui-input border border-ui-borderSubtle text-[10px] font-mono text-ui-textMuted flex items-center gap-1">
          <span class="text-[9px] text-ui-textMuted font-bold">RES:</span>
          <span class="text-amber-300 font-bold">{{ projectStore.pixelBuffer.width }}×{{ projectStore.pixelBuffer.height }}</span>
        </div>
        <div
          v-if="activeTab === 'paint'"
          class="flex items-center gap-1.5 bg-ui-input px-2 py-0.5 rounded-xs border border-ui-borderSubtle"
        >
          <span class="text-[9px] text-ui-textMuted font-bold uppercase">Color:</span>
          <label class="w-5 h-5 rounded-xs border border-ui-borderStrong cursor-pointer shadow-xs relative overflow-hidden block" :style="{ backgroundColor: toolStore.primaryColor }">
            <input type="color" v-model="toolStore.primaryColor" class="opacity-0 absolute inset-0 w-full h-full cursor-pointer" />
          </label>
          <input
            type="text"
            v-model="toolStore.primaryColor"
            class="w-16 px-1.5 py-0.5 bg-ui-panel text-ui-textPrimary font-mono text-[10px] font-bold border border-ui-borderSubtle rounded-xs focus:outline-none focus:border-ui-accent uppercase text-center"
            aria-label="Color hex"
          />
        </div>
      </div>
    </div>
    <div class="flex-1 min-h-0 min-w-0">
      <UVEditor v-if="activeTab === 'uv'" key="uv-editor" />
      <PixelEditor v-else key="pixel-editor" />
    </div>
  </div>
</template>
