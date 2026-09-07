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
  <div class="uv-paint-shell h-full w-full bg-ui-panel flex flex-col select-none relative z-[100] font-mono text-xs">
    <div class="uv-paint-tabs bg-ui-header border-b border-ui-borderSubtle px-2 flex items-center gap-2 shrink-0 relative isolate z-[200] overflow-visible h-8.5 min-h-[34px]">
      <div class="flex items-center bg-ui-input p-0.5 rounded-xs border border-ui-borderSubtle shrink-0">
        <button
          type="button"
          class="flex items-center space-x-1.5 px-2.5 py-0.5 rounded-xs text-[10px] font-bold transition cursor-pointer"
          :class="activeTab === 'uv' ? 'bg-ui-accent text-white shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="UV Unwrapping, Seams & Quadrant Atlas Mapping"
          @click="activeTab = 'uv'"
        >
          <BlenderIcon name="uv" :size="12" />
          <span class="uv-paint-tab-label">UV</span>
        </button>
        <button
          type="button"
          class="flex items-center space-x-1.5 px-2.5 py-0.5 rounded-xs text-[10px] font-bold transition cursor-pointer"
          :class="activeTab === 'paint' ? 'bg-ui-accent text-white shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Pixel & Texture Paint Studio"
          @click="activeTab = 'paint'"
        >
          <BlenderIcon name="brush" :size="11" />
          <span class="uv-paint-tab-label">Paint</span>
        </button>
      </div>
      <!-- Menus from both workspace tabs teleport here. This must remain visible
           outside the compact header so their popovers are never cropped. -->
      <div id="uv-paint-command-slot" class="uv-paint-command-slot relative z-[300] flex items-center min-w-0 flex-1 overflow-visible" />
      <div class="flex items-center gap-1.5 shrink-0">
        <div class="px-2 py-0.5 rounded-xs bg-ui-input border border-ui-borderSubtle text-[10px] font-mono text-ui-textMuted flex items-center gap-1">
          <span class="uv-paint-resolution-label text-[9px] text-ui-textMuted font-bold">RES:</span>
          <span class="text-amber-300 font-bold">{{ projectStore.pixelBuffer.width }}×{{ projectStore.pixelBuffer.height }}</span>
        </div>
        <div
          v-if="activeTab === 'paint'"
          class="flex items-center gap-1.5 bg-ui-input px-2 py-0.5 rounded-xs border border-ui-borderSubtle"
        >
          <span class="uv-paint-color-label text-[9px] text-ui-textMuted font-bold uppercase">Color:</span>
          <label class="w-5 h-5 rounded-xs border border-ui-borderStrong cursor-pointer shadow-xs relative overflow-hidden block" :style="{ backgroundColor: toolStore.primaryColor }">
            <input type="color" v-model="toolStore.primaryColor" class="opacity-0 absolute inset-0 w-full h-full cursor-pointer" />
          </label>
          <input
            type="text"
            v-model="toolStore.primaryColor"
            class="uv-paint-color-hex w-16 px-1.5 py-0.5 bg-ui-panel text-ui-textPrimary font-mono text-[10px] font-bold border border-ui-borderSubtle rounded-xs focus:outline-none focus:border-ui-accent uppercase text-center"
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

<style>
.uv-paint-shell { container-type: inline-size; }

/* Command menus are intentionally above the canvas, viewport and inspector.
   They are portaled into the shared workspace header, so this rule covers UV
   and Paint without duplicating it in both editors. */
.uv-paint-command-slot .header-dropdown-menu {
  z-index: 2147483000 !important;
}

@container (max-width: 760px) {
  .uv-paint-tabs { gap: 4px !important; padding-left: 4px !important; padding-right: 4px !important; }
  .uv-paint-tab-label,
  .uv-paint-resolution-label,
  .uv-paint-color-label,
  .uv-paint-color-hex { display: none; }
  .uv-paint-tabs > div:first-child button { padding-left: 6px !important; padding-right: 6px !important; }
}
</style>
