<script setup lang="ts">
import BlenderIcon from '../icons/BlenderIcon.vue'
import type { CanvasNavMode } from '../../composables/useCanvasLightwaveNav'

defineProps<{
  armed: CanvasNavMode | null
  sticky: boolean
  stickyTitle: string
  panTitle: string
  zoomTitle: string
}>()

const emit = defineEmits<{
  nav: [mode: CanvasNavMode, event: PointerEvent]
  toggleSticky: []
}>()
</script>

<template>
  <div class="canvas-lw-nav" role="group" aria-label="LightWave view controls" @pointerdown.stop @wheel.stop>
    <button
      type="button"
      class="canvas-lw-btn"
      :class="{ 'is-active': armed === 'pan' }"
      :title="panTitle"
      @pointerdown="emit('nav', 'pan', $event)"
    >
      <BlenderIcon name="tool-move" :size="14" />
    </button>
    <button
      type="button"
      class="canvas-lw-btn"
      :class="{ 'is-active': armed === 'zoom' }"
      :title="zoomTitle"
      @pointerdown="emit('nav', 'zoom', $event)"
    >
      <BlenderIcon name="zoom-in" :size="14" />
    </button>
    <button
      type="button"
      class="canvas-lw-btn"
      :class="{ 'is-active': sticky }"
      :title="stickyTitle"
      @click.stop="emit('toggleSticky')"
    >
      <BlenderIcon :name="sticky ? 'lock' : 'unlock'" :size="14" />
    </button>
  </div>
</template>

<style scoped>
.canvas-lw-nav {
  height: 24px;
  display: flex;
  align-items: stretch;
  background: var(--ui-bg-input);
  border: 1px solid var(--ui-border-subtle);
  border-radius: 3px;
  overflow: hidden;
  touch-action: none;
}
.canvas-lw-btn {
  width: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--ui-text-muted);
  border-right: 1px solid var(--ui-border-subtle);
  touch-action: none;
}
.canvas-lw-btn:last-child { border-right: none; }
.canvas-lw-btn:hover { background: var(--ui-bg-hover); color: var(--ui-text-accent); }
.canvas-lw-btn.is-active { background: var(--ui-bg-active); color: var(--ui-text-accent); }
.canvas-lw-btn:nth-child(1) { cursor: move; }
.canvas-lw-btn:nth-child(2) { cursor: ns-resize; }
</style>
