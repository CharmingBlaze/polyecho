<script setup lang="ts">
import { computed } from 'vue'
import BlenderIcon from '../icons/BlenderIcon.vue'
import { useLayoutStore, type ToolShelfId } from '../../stores/layoutStore'

const props = defineProps<{
  shelfId: ToolShelfId
  title: string
  icon: string
  shortTitle?: string
  teleportTo?: string
}>()

const layoutStore = useLayoutStore()
const shelf = computed(() => layoutStore.toolShelves[props.shelfId])

function dragShelf(event: PointerEvent) {
  if (event.button !== 0) return
  const target = event.target
  if (target instanceof Element && target.closest('button')) return
  const header = event.currentTarget
  if (!(header instanceof HTMLElement)) return
  const bounds = header.closest('.tool-shelf')?.parentElement
  if (!bounds) return
  const start = layoutStore.toolShelves[props.shelfId]
  const originX = event.clientX
  const originY = event.clientY
  const baseX = start.x
  const baseY = start.y
  header.setPointerCapture(event.pointerId)

  const move = (ev: PointerEvent) => {
    if (ev.pointerId !== event.pointerId) return
    const rect = bounds.getBoundingClientRect()
    const x = Math.round(Math.max(8, Math.min(rect.width - 56, baseX + ev.clientX - originX)))
    const y = Math.round(Math.max(8, Math.min(rect.height - 40, baseY + ev.clientY - originY)))
    layoutStore.moveToolShelf(props.shelfId, x, y)
  }
  const end = (ev: PointerEvent) => {
    if (ev.pointerId !== event.pointerId) return
    header.removeEventListener('pointermove', move)
    header.removeEventListener('pointerup', end)
    header.removeEventListener('pointercancel', end)
  }
  header.addEventListener('pointermove', move)
  header.addEventListener('pointerup', end)
  header.addEventListener('pointercancel', end)
}
</script>

<template>
  <Teleport :to="teleportTo || 'body'" :disabled="!teleportTo">
    <div
      v-if="shelf.open"
      class="tool-shelf"
      :class="{ 'is-minimized': shelf.minimized, 'is-editor-local': !teleportTo }"
      :style="{ left: shelf.x + 'px', top: shelf.y + 'px' }"
      role="region"
      :aria-label="title + ' tools'"
      @pointerdown.stop
      @wheel.stop
    >
      <header class="tool-shelf-bar" @pointerdown="dragShelf">
        <span class="tool-shelf-grip" aria-hidden="true"></span>
        <strong :title="title">{{ shortTitle || title }}</strong>
        <button
          type="button"
          :aria-label="shelf.minimized ? 'Expand ' + title + ' tools' : 'Minimize ' + title + ' tools'"
          :title="shelf.minimized ? 'Expand' : 'Minimize'"
          @click="layoutStore.patchToolShelf(shelfId, { minimized: !shelf.minimized })"
        >{{ shelf.minimized ? '▢' : '−' }}</button>
        <button
          type="button"
          :aria-label="'Close ' + title + ' tools'"
          title="Close"
          @click="layoutStore.patchToolShelf(shelfId, { open: false })"
        >×</button>
      </header>
      <div v-show="!shelf.minimized" class="tool-shelf-body">
        <slot />
      </div>
    </div>
    <button
      v-else
      type="button"
      class="tool-shelf-reopen"
      :title="'Show ' + title + ' tools'"
      :aria-label="'Show ' + title + ' tools'"
      @pointerdown.stop
      @click="layoutStore.patchToolShelf(shelfId, { open: true, minimized: false })"
    >
      <BlenderIcon :name="(icon as any)" :size="15" />
      <span>{{ title }}</span>
    </button>
  </Teleport>
</template>

<style scoped>
.tool-shelf {
  position: absolute;
  z-index: 30;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  width: 64px;
  max-width: 64px;
  max-height: calc(100% - 16px);
  min-width: 64px;
  border: 1px solid var(--ui-border-strong);
  border-radius: 6px;
  background: color-mix(in srgb, var(--ui-bg-panel) 94%, transparent);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(10px);
  overflow: hidden;
}
.tool-shelf.is-editor-local {
  border-color: color-mix(in srgb, var(--ui-accent) 28%, var(--ui-border-strong));
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--ui-bg-panel) 97%, var(--ui-accent) 3%), var(--ui-bg-panel));
  box-shadow:
    0 12px 30px rgba(0, 0, 0, 0.5),
    0 0 0 1px color-mix(in srgb, var(--ui-accent) 8%, transparent);
}
.tool-shelf-bar {
  display: flex;
  align-items: center;
  gap: 2px;
  height: 24px;
  padding: 0 2px 0 3px;
  cursor: grab;
  user-select: none;
  background: color-mix(in srgb, var(--ui-bg-header) 88%, transparent);
  border-bottom: 1px solid var(--ui-border-subtle);
  touch-action: none;
}
.tool-shelf.is-minimized .tool-shelf-bar {
  border-bottom: none;
}
.tool-shelf.is-editor-local .tool-shelf-bar {
  background: linear-gradient(90deg, color-mix(in srgb, var(--ui-accent) 16%, var(--ui-bg-header)), var(--ui-bg-header));
}
.tool-shelf-bar:active { cursor: grabbing; }
.tool-shelf-grip {
  width: 5px;
  height: 10px;
  flex-shrink: 0;
  background-image: radial-gradient(circle, var(--ui-text-muted) 1px, transparent 1.4px);
  background-size: 4px 4px;
  background-position: center;
  opacity: 0.8;
}
.tool-shelf-bar strong {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
  color: var(--ui-text-secondary);
}
.tool-shelf-bar button {
  width: 16px;
  height: 18px;
  flex-shrink: 0;
  border-radius: 3px;
  color: var(--ui-text-muted);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}
.tool-shelf-bar button:hover {
  background: var(--ui-bg-hover);
  color: var(--ui-text-primary);
}
.tool-shelf-body {
  display: flex;
  justify-content: center;
  overflow: auto;
  padding: 2px;
  min-height: 0;
}
.tool-shelf-reopen {
  position: absolute;
  z-index: 30;
  pointer-events: auto;
  top: 12px;
  left: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 10px 0 8px;
  border: 1px solid var(--ui-border-strong);
  border-radius: 6px;
  background: color-mix(in srgb, var(--ui-bg-panel) 94%, transparent);
  color: var(--ui-text-primary);
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(10px);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}
.tool-shelf-reopen:hover {
  background: var(--ui-bg-hover);
  border-color: var(--ui-accent);
}
</style>
