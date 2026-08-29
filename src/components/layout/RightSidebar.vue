<script setup lang="ts">
import { ref, watch } from 'vue'
import { useToolStore } from '../../stores/toolStore'
import OutlinerTree from '../outliner/OutlinerTree.vue'
import TransformProps from '../inspector/TransformProps.vue'
import MaterialProps from '../inspector/MaterialProps.vue'
import PalettePicker from '../uvpaint/PalettePicker.vue'
import RiggingPanel from '../rigging/RiggingPanel.vue'
import AnimationInspector from '../inspector/AnimationInspector.vue'
import UVPaintProps from '../uvpaint/UVPaintProps.vue'
import { Layers, Sliders, Sparkles } from 'lucide-vue-next'

const toolStore = useToolStore()
const activeTab = ref<'outliner' | 'props' | 'material'>('outliner')

watch(() => toolStore.appMode, (mode) => {
  if (mode === 'rig' || mode === 'animate' || mode === 'uvpaint') {
    activeTab.value = 'props'
  }
})
</script>

<template>
  <aside class="w-80 bg-dcc-900 border-l border-dcc-750 flex flex-col select-none z-20 h-full overflow-hidden">
    <!-- Tab navigation -->
    <div class="h-9 bg-dcc-850 border-b border-dcc-750 grid grid-cols-3 text-xs font-mono shrink-0">
      <!-- 1. Dedicated Outliner Tab -->
      <button 
        @click="activeTab = 'outliner'"
        class="flex items-center justify-center gap-1.5 transition"
        :class="activeTab === 'outliner' ? 'bg-dcc-900 text-white font-bold border-b-2 border-indigo-500' : 'text-slate-400 hover:text-slate-200'"
      >
        <Layers class="w-3.5 h-3.5" />
        <span>OUTLINER</span>
      </button>

      <!-- 2. Properties Tab -->
      <button 
        @click="activeTab = 'props'"
        class="flex items-center justify-center gap-1.5 transition"
        :class="activeTab === 'props' ? 'bg-dcc-900 text-white font-bold border-b-2 border-indigo-500' : 'text-slate-400 hover:text-slate-200'"
      >
        <Sliders class="w-3.5 h-3.5" />
        <span>{{ toolStore.appMode === 'rig' ? 'RIGGING' : toolStore.appMode === 'animate' ? 'ANIM' : toolStore.appMode === 'uvpaint' ? 'PAINT' : 'PROPS' }}</span>
      </button>

      <!-- 3. Shading / Material Tab -->
      <button 
        @click="activeTab = 'material'"
        class="flex items-center justify-center gap-1.5 transition"
        :class="activeTab === 'material' ? 'bg-dcc-900 text-white font-bold border-b-2 border-indigo-500' : 'text-slate-400 hover:text-slate-200'"
      >
        <Sparkles class="w-3.5 h-3.5" />
        <span>SHADING</span>
      </button>
    </div>

    <!-- Content panels -->
    <div class="flex-1 min-h-0 relative flex flex-col">
      <!-- Outliner Tab: Takes 100% full real estate of right panel -->
      <OutlinerTree v-show="activeTab === 'outliner'" />

      <!-- Props Tab: Transform / Rigging / Animation / UVPaint Studio parameters -->
      <div v-show="activeTab === 'props'" class="h-full overflow-y-auto">
        <RiggingPanel v-if="toolStore.appMode === 'rig'" />
        <AnimationInspector v-else-if="toolStore.appMode === 'animate'" />
        <UVPaintProps v-else-if="toolStore.appMode === 'uvpaint'" />
        <div v-else class="p-3 space-y-3">
          <TransformProps />
          <PalettePicker />
        </div>
      </div>

      <!-- Shading Tab: Material / PSX Shaders -->
      <div v-show="activeTab === 'material'" class="h-full overflow-y-auto p-3 space-y-3">
        <MaterialProps />
        <PalettePicker />
      </div>
    </div>
  </aside>
</template>
