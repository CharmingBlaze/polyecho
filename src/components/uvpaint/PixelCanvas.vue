<script setup lang="ts">
import { computed } from 'vue'
import UVEditor from './UVEditor.vue'
import PixelEditor from './PixelEditor.vue'
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
    <UVEditor v-if="activeTab === 'uv'" key="uv-editor" />
    <PixelEditor v-else key="pixel-editor" />
  </div>
</template>
