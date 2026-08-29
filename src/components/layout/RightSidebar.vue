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
const activeTab = ref<'outliner' | 'props' | 'material'>('props')

watch(() => toolStore.appMode, () => {
  activeTab.value = 'props'
})
</script>

<template>
  <aside class="w-80 bg-ui-panel border-l border-ui-borderSubtle flex flex-col select-none z-20 h-full overflow-hidden font-mono text-xs">
    <!-- Dense Inspector Tab Navigation -->
    <div class="h-8 bg-ui-header border-b border-ui-borderSubtle grid grid-cols-3 text-xs shrink-0">
      <!-- 1. Outliner Tab -->
      <button 
        @click="activeTab = 'outliner'"
        class="flex items-center justify-center gap-1.5 transition text-[11px] font-medium"
        :class="activeTab === 'outliner' ? 'bg-ui-panel text-ui-textPrimary font-bold border-b border-ui-accent shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
      >
        <Layers class="w-3.5 h-3.5" />
        <span>OUTLINER</span>
      </button>

      <!-- 2. Properties Tab -->
      <button 
        @click="activeTab = 'props'"
        class="flex items-center justify-center gap-1.5 transition text-[11px] font-medium"
        :class="activeTab === 'props' ? 'bg-ui-panel text-ui-textPrimary font-bold border-b border-ui-accent shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
      >
        <Sliders class="w-3.5 h-3.5" />
        <span>{{ toolStore.appMode === 'rig' ? 'RIG' : toolStore.appMode === 'animate' ? 'ANIM' : toolStore.appMode === 'uvpaint' ? 'PAINT' : 'PROPS' }}</span>
      </button>

      <!-- 3. Shading / Material Tab -->
      <button 
        @click="activeTab = 'material'"
        class="flex items-center justify-center gap-1.5 transition text-[11px] font-medium"
        :class="activeTab === 'material' ? 'bg-ui-panel text-ui-textPrimary font-bold border-b border-ui-accent shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
      >
        <Sparkles class="w-3.5 h-3.5" />
        <span>SHADING</span>
      </button>
    </div>

    <!-- Content panels -->
    <div class="flex-1 min-h-0 relative flex flex-col overflow-y-auto">
      <!-- Outliner Tab -->
      <OutlinerTree v-show="activeTab === 'outliner'" />

      <!-- Props Tab -->
      <div v-show="activeTab === 'props'" class="h-full overflow-y-auto flex flex-col">
        <RiggingPanel v-if="toolStore.appMode === 'rig'" />
        <AnimationInspector v-else-if="toolStore.appMode === 'animate'" />
        <UVPaintProps v-else-if="toolStore.appMode === 'uvpaint'" />
        <div v-else class="flex flex-col">
          <TransformProps />
          <div class="p-2 border-t border-ui-borderSubtle">
            <PalettePicker />
          </div>
        </div>
      </div>

      <!-- Shading Tab -->
      <div v-show="activeTab === 'material'" class="h-full overflow-y-auto flex flex-col">
        <MaterialProps />
        <div class="p-2 border-t border-ui-borderSubtle">
          <PalettePicker />
        </div>
      </div>
    </div>
  </aside>
</template>
