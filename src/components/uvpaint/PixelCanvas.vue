<script setup lang="ts">
import { computed } from 'vue'
import UVEditor from './UVEditor.vue'
import PixelEditor from './PixelEditor.vue'
import VertexPainter from './VertexPainter.vue'
import BlenderIcon from '../icons/BlenderIcon.vue'
import { useToolStore } from '../../stores/toolStore'

const toolStore = useToolStore()

const activeTab = computed({
  get: () => toolStore.uvWorkspaceTab,
  set: (val: 'uv' | 'paint' | 'vertex') => {
    toolStore.uvWorkspaceTab = val
    if (val === 'vertex') {
      toolStore.paintTarget = 'vertex'
    } else {
      toolStore.paintTarget = 'texture'
    }
  }
})
</script>

<template>
  <div class="h-full w-full bg-dcc-900 flex flex-col select-none overflow-hidden relative">
    <!-- Top 2D DCC Workspace Mode Bar -->
    <div class="h-8 bg-dcc-850 border-b border-dcc-750 px-2 flex items-center justify-between text-xs text-slate-300 z-20 shrink-0 font-mono">
      <!-- Tab Switcher (UV | Paint | Vertex) -->
      <div class="flex items-center space-x-1">
        <div class="flex items-center bg-dcc-900 p-0.5 rounded border border-dcc-750">
          <button 
            @click="activeTab = 'uv'"
            class="flex items-center space-x-1 px-2.5 py-0.5 rounded text-[10px] font-bold transition"
            :class="activeTab === 'uv' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'"
            title="UV Editor & Atlas Mapping"
          >
            <BlenderIcon name="uv" :size="12" />
            <span>UV Editor</span>
          </button>

          <button 
            @click="activeTab = 'paint'"
            class="flex items-center space-x-1 px-2.5 py-0.5 rounded text-[10px] font-bold transition"
            :class="activeTab === 'paint' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'"
            title="2D Pixel Texture Paint"
          >
            <BlenderIcon name="brush" :size="11" />
            <span>Pixel Paint</span>
          </button>

          <button 
            @click="activeTab = 'vertex'"
            class="flex items-center space-x-1 px-2.5 py-0.5 rounded text-[10px] font-bold transition"
            :class="activeTab === 'vertex' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'"
            title="3D Vertex Color & Gradient Studio"
          >
            <BlenderIcon name="vertex-select" :size="11" />
            <span>Vertex Paint</span>
          </button>
        </div>
      </div>

      <!-- Mode Label -->
      <div class="text-[9px] text-slate-500 font-mono">
        <span v-if="activeTab === 'uv'">UV Unwrapping & Quadrant Atlas</span>
        <span v-else-if="activeTab === 'paint'">2D Texture Painting</span>
        <span v-else>3D Gouraud Vertex Colors</span>
      </div>
    </div>

    <!-- Active Component -->
    <div class="flex-1 min-h-0 relative">
      <UVEditor v-show="activeTab === 'uv'" />
      <PixelEditor v-show="activeTab === 'paint'" />
      <VertexPainter v-show="activeTab === 'vertex'" />
    </div>
  </div>
</template>
