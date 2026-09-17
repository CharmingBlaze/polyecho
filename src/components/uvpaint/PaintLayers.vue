<script setup lang="ts">
import { computed } from 'vue'
import type { PixelBuffer } from '../../core/painting/PixelCanvas'

const props = defineProps<{ buffer: PixelBuffer; revision: number }>()
const emit = defineEmits<{
  close: []; add: []; select: [id: string]; duplicate: [id: string]; remove: [id: string]
  visibility: [id: string]; reorder: [id: string, direction: -1 | 1]
  rename: [name: string]; opacity: [value: number]; blend: [value: string]
}>()
const layers = computed(() => {
  props.revision
  return props.buffer.layers.map(layer => ({ ...layer, thumbnail: layer.canvas.toDataURL() })).reverse()
})
const active = computed(() => { props.revision; return props.buffer.activeLayer })
const activeIndex = computed(() => { props.revision; return props.buffer.layers.findIndex(l => l.id === props.buffer.activeLayerId) })
</script>

<template>
  <aside class="paint-layers-panel" aria-label="Paint layers" @pointerdown.stop @pointermove.stop @pointerup.stop @wheel.stop>
    <header class="inspector-head">
      <div class="inspector-head-kicker">Layers <span class="inspector-value">{{ layers.length }}</span></div>
      <button @click="emit('close')" title="Hide layers" aria-label="Hide paint layers">×</button>
    </header>
    <div class="layer-toolbar">
      <button @click="emit('add')" title="New transparent layer">+ New</button>
      <button :disabled="!active" @click="active && emit('duplicate', active.id)" title="Duplicate active layer">Duplicate</button>
      <button :disabled="layers.length < 2" @click="active && emit('remove', active.id)" title="Delete active layer (undoable)">Delete</button>
    </div>
    <div class="layer-list" role="listbox" aria-label="Texture layers">
      <div v-for="layer in layers" :key="layer.id" class="layer-row" :class="{ active: active?.id === layer.id, 'is-hidden': !layer.visible }">
        <button class="layer-eye" @click="emit('visibility', layer.id)" :aria-label="`${layer.visible ? 'Hide' : 'Show'} ${layer.name}`" :aria-pressed="layer.visible">{{ layer.visible ? '◉' : '○' }}</button>
        <button class="layer-select" role="option" :aria-selected="active?.id === layer.id" @click="emit('select', layer.id)">
          <img :src="layer.thumbnail" alt="" width="36" height="36" />
          <span><strong>{{ layer.name }}</strong><small>{{ layer.blendMode }} · {{ Math.round(layer.opacity * 100) }}%</small></span>
        </button>
      </div>
    </div>
    <div v-if="active" class="layer-properties">
      <label>Layer name<input :value="active.name" aria-label="Active paint layer name" @change="emit('rename', ($event.target as HTMLInputElement).value)" /></label>
      <label>Blend<select class="inspector-select" :value="active.blendMode" aria-label="Layer blend mode" @change="emit('blend', ($event.target as HTMLSelectElement).value)">
        <option value="normal">Normal</option><option value="multiply">Multiply</option><option value="screen">Screen</option><option value="overlay">Overlay</option><option value="additive">Additive</option>
      </select></label>
      <label>Opacity <span class="inspector-value">{{ Math.round(active.opacity * 100) }}%</span></label>
      <input type="range" min="0" max="100" :value="Math.round(active.opacity * 100)" class="inspector-range" aria-label="Layer opacity" @change="emit('opacity', Number(($event.target as HTMLInputElement).value))" />
      <div class="layer-toolbar"><button :disabled="activeIndex >= layers.length - 1" @click="emit('reorder', active.id, 1)">↑ Move up</button><button :disabled="activeIndex <= 0" @click="emit('reorder', active.id, -1)">↓ Move down</button></div>
      <p v-if="!active.visible">This layer is hidden. Show it before painting.</p>

    </div>
  </aside>
</template>

<style scoped>
.paint-layers-panel { width: 200px; flex-shrink: 0; display: flex; flex-direction: column; min-height: 0; height: 100%; background: var(--ui-bg-panel); border-left: 1px solid var(--ui-border-strong); color: var(--ui-text-secondary); font-size: 11px; position: relative; z-index: 80; }
header.inspector-head button { width: 24px; color: var(--ui-text-muted); }
button { cursor: pointer; border-radius: 3px; } button:hover { background: var(--ui-bg-hover); color: var(--ui-text-primary); } button:disabled { opacity: .35; cursor: default; }
.layer-toolbar { display: flex; gap: 4px; padding: 7px; }
.layer-toolbar button { padding: 4px 6px; border: 1px solid var(--ui-border-subtle); background: var(--ui-bg-input); font-size: 10px; flex: 1; }
.layer-list { flex: 0 1 auto; min-height: 48px; max-height: 300px; overflow-y: auto; padding: 0 5px; }
.layer-row { display: flex; align-items: center; border: 1px solid transparent; border-radius: 3px; margin-bottom: 4px; }
.layer-row.active { background: var(--ui-bg-active); border-color: var(--ui-border-strong); }
.layer-row.is-hidden .layer-select { opacity: .5; }
.layer-eye { width: 24px; flex-shrink: 0; color: var(--ui-text-secondary); }
.layer-select { min-width: 0; display: flex; gap: 7px; align-items: center; flex: 1; padding: 5px 3px; text-align: left; }
.layer-select img { image-rendering: pixelated; object-fit: contain; flex-shrink: 0; border: 1px solid var(--ui-border-subtle); background: repeating-conic-gradient(#35363c 0% 25%, #222329 0% 50%) 0 0 / 8px 8px; }
.layer-select span { min-width: 0; } .layer-select strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ui-text-primary); font-size: 10px; } .layer-select small { font-size: 9px; color: var(--ui-text-muted); }
.layer-properties { padding: 8px; border-top: 1px solid var(--ui-border-subtle); display: flex; flex-direction: column; gap: 7px; }
label { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
input:not([type=range]), select { width: 112px; min-width: 0; padding: 4px; color: var(--ui-text-primary); background: var(--ui-bg-input); border: 1px solid var(--ui-border-subtle); border-radius: 3px; }
input[type=range] { width: 100%; }
.layer-properties .layer-toolbar { padding: 0; }
p { color: var(--ui-text-muted); font-size: 10px; line-height: 1.5; }
</style>
