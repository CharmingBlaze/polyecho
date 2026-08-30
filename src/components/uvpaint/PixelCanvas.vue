<script setup lang="ts">
import { computed } from 'vue'
import UVEditor from './UVEditor.vue'
import PixelEditor from './PixelEditor.vue'
import BlenderIcon from '../icons/BlenderIcon.vue'
import { useToolStore } from '../../stores/toolStore'

const toolStore = useToolStore()

const activeTab = computed({
  get: () => toolStore.uvWorkspaceTab === 'uv' ? 'uv' : 'paint',
  set: (val: 'uv' | 'paint') => {
    toolStore.uvWorkspaceTab = val
  }
})
</script>

<template>
  <div class="h-full w-full bg-ui-panel flex flex-col select-none overflow-hidden relative font-mono text-xs">
    <!-- Top 2D DCC Workspace Mode Bar -->
    <div class="h-8 bg-ui-header border-b border-ui-borderSubtle px-2 flex items-center justify-between text-xs text-ui-textPrimary z-20 shrink-0">
      <!-- Main 2D Workspace Tabs: UV Editor vs Pixel Paint -->
      <div class="flex items-center space-x-1">
        <div class="flex items-center bg-ui-input p-0.5 rounded-xs border border-ui-borderSubtle">
          <button 
            @click="activeTab = 'uv'"
            class="flex items-center space-x-1.5 px-3 py-0.5 rounded-xs text-[10px] font-bold transition"
            :class="activeTab === 'uv' ? 'bg-ui-accent text-white shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
            title="UV Unwrapping, Seams & Quadrant Atlas Mapping"
          >
            <BlenderIcon name="uv" :size="12" />
            <span>UV Editor</span>
          </button>

          <button 
            @click="activeTab = 'paint'"
            class="flex items-center space-x-1.5 px-3 py-0.5 rounded-xs text-[10px] font-bold transition"
            :class="activeTab === 'paint' ? 'bg-ui-accent text-white shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
            title="Pixel & Texture Paint Studio"
          >
            <BlenderIcon name="brush" :size="11" />
            <span>Pixel Paint</span>
          </button>
        </div>
      </div>

      <!-- Mode Info Label -->
      <div class="text-[9px] text-ui-textMuted font-mono hidden sm:block">
        <span v-if="activeTab === 'uv'">UV Unwrapping & Quadrant Atlas Mapping</span>
        <span v-else>2D Texture & Pixel Painting Studio</span>
      </div>
    </div>

    <!-- Active Component View -->
    <div class="flex-1 min-h-0 relative">
      <UVEditor v-show="activeTab === 'uv'" />
      <PixelEditor v-show="activeTab === 'paint'" />
    </div>
  </div>
</template>
