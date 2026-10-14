<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { MaterialGradient } from '../../types/texture'
import { gradientCss, gradientRampCss } from '../../core/materials/MaterialFill'
import {
  DEFAULT_GRADIENT_PRESETS,
  kindToSavedType,
  loadCustomGradients,
  saveCustomGradients,
  savedTypeToKind,
  type SavedGradient
} from '../../utils/gradient'

const props = defineProps<{
  gradient: MaterialGradient
  foreground?: string
}>()

const emit = defineEmits<{
  begin: []
  pick: [gradient: MaterialGradient, name: string]
  save: [preset: SavedGradient]
}>()

const open = ref(false)
const custom = ref<SavedGradient[]>([])
const saveName = ref('')
const showSave = ref(false)
const rootRef = ref<HTMLElement | null>(null)

const presets = computed(() => [...DEFAULT_GRADIENT_PRESETS, ...custom.value])

onMounted(() => {
  custom.value = loadCustomGradients()
})

function close() {
  open.value = false
  showSave.value = false
}

function onDocPointer(event: PointerEvent) {
  if (!open.value) return
  if (rootRef.value && !rootRef.value.contains(event.target as Node)) close()
}

onMounted(() => window.addEventListener('pointerdown', onDocPointer))
onUnmounted(() => window.removeEventListener('pointerdown', onDocPointer))

function swatchStyle(preset: SavedGradient): { backgroundImage: string } {
  const gradient: MaterialGradient = {
    kind: savedTypeToKind(preset.type),
    angle: preset.angle,
    stops: preset.stops.map(stop => {
      const next = { color: stop.color, offset: stop.position / 100 }
      return typeof stop.opacity === 'number' ? { ...next, opacity: stop.opacity } : next
    })
  }
  if (preset.id === 'fg-bg' || preset.id === 'transparent') {
    const fg = props.foreground || '#ffffff'
    gradient.stops = gradient.stops.map((stop, i) => ({
      ...stop,
      color: i === 0 ? fg : (preset.id === 'fg-bg' ? '#000000' : fg)
    }))
  }
  return {
    backgroundImage: `${preset.type === 'Linear' || preset.type === 'Reflected' ? gradientRampCss(gradient) : gradientCss(gradient)}, repeating-conic-gradient(#3f3f46 0% 25%, #18181b 0% 50%)`
  }
}

function pick(preset: SavedGradient) {
  const fg = props.foreground || '#ffffff'
  const stops = preset.stops.map((stop, i) => {
    let color = stop.color
    if (preset.id === 'fg-bg') color = i === 0 ? fg : '#000000'
    if (preset.id === 'transparent') color = fg
    const next: MaterialGradient['stops'][number] = { color, offset: stop.position / 100 }
    if (typeof stop.opacity === 'number') next.opacity = stop.opacity
    return next
  })
  emit('pick', { kind: savedTypeToKind(preset.type), angle: preset.angle, stops }, preset.name)
  close()
}

function nextCustomName() {
  let n = 1
  const used = new Set(custom.value.map(item => item.name))
  while (used.has(`Custom ${n}`)) n++
  return `Custom ${n}`
}

function startSave() {
  saveName.value = nextCustomName()
  showSave.value = true
}

function commitSave() {
  const name = saveName.value.trim() || nextCustomName()
  const preset: SavedGradient = {
    id: `custom_${Date.now()}`,
    name,
    type: kindToSavedType(props.gradient.kind),
    angle: props.gradient.angle,
    isCustom: true,
    stops: props.gradient.stops.map((stop, i) => ({
      id: String(i + 1),
      color: stop.color,
      position: Math.round(stop.offset * 100),
      opacity: stop.opacity
    }))
  }
  custom.value = [...custom.value, preset]
  saveCustomGradients(custom.value)
  emit('save', preset)
  showSave.value = false
}

function removeCustom(preset: SavedGradient, event: Event) {
  event.stopPropagation()
  custom.value = custom.value.filter(item => item.id !== preset.id)
  saveCustomGradients(custom.value)
}

const currentStyle = computed(() => ({
  backgroundImage: `${gradientCss(props.gradient)}, repeating-conic-gradient(#3f3f46 0% 25%, #18181b 0% 50%)`
}))
</script>

<template>
  <div ref="rootRef" class="chooser">
    <button type="button" class="chooser-open" title="Gradient picker" @click="open = !open">
      <span class="chooser-current" :style="currentStyle" />
      <span class="chooser-caret">▾</span>
    </button>
    <div v-if="open" class="chooser-pop" role="listbox" aria-label="Gradient presets">
      <div class="chooser-grid">
        <button
          v-for="preset in presets"
          :key="preset.id"
          type="button"
          class="chooser-swatch"
          :title="preset.name"
          :style="swatchStyle(preset)"
          @click="pick(preset)"
        >
          <span v-if="preset.isCustom" class="chooser-x" title="Delete preset" @click="removeCustom(preset, $event)">×</span>
        </button>
      </div>
      <div v-if="showSave" class="chooser-save">
        <input v-model="saveName" class="chooser-name" aria-label="Preset name" @keydown.enter="commitSave">
        <button type="button" class="chooser-btn" @click="commitSave">Save</button>
        <button type="button" class="chooser-btn is-ghost" @click="showSave = false">Cancel</button>
      </div>
      <button v-else type="button" class="chooser-add" @click="startSave">Save current as preset</button>
    </div>
  </div>
</template>

<style scoped>
.chooser { position: relative; }
.chooser-open {
  display: flex;
  align-items: stretch;
  width: 100%;
  height: 22px;
  padding: 0;
  border: 1px solid var(--ui-border-default);
  background: var(--ui-bg-surface);
  border-radius: var(--ui-radius-xs);
  cursor: pointer;
}
.chooser-current {
  flex: 1;
  background-color: #1a1a1a;
  background-size: auto, 8px 8px;
}
.chooser-caret {
  width: 18px;
  display: grid;
  place-items: center;
  font-size: 9px;
  color: var(--ui-text-muted);
  border-left: 1px solid var(--ui-border-subtle);
}
.chooser-pop {
  position: absolute;
  z-index: 40;
  left: 0;
  right: 0;
  top: calc(100% + 4px);
  padding: 6px;
  border: 1px solid var(--ui-border-default);
  background: var(--ui-bg-panel, #16181d);
  border-radius: var(--ui-radius-xs);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
}
.chooser-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 4px;
}
.chooser-swatch {
  position: relative;
  height: 18px;
  padding: 0;
  border: 1px solid #111;
  background-color: #1a1a1a;
  background-size: auto, 6px 6px;
  cursor: pointer;
}
.chooser-swatch:hover { outline: 1px solid var(--ui-accent, #7dd3fc); }
.chooser-x {
  position: absolute;
  top: -4px;
  right: -2px;
  width: 12px;
  height: 12px;
  font-size: 10px;
  line-height: 10px;
  color: #fff;
  text-shadow: 0 0 2px #000;
}
.chooser-add,
.chooser-btn {
  margin-top: 6px;
  width: 100%;
  height: 20px;
  border: 1px solid var(--ui-border-subtle);
  background: var(--ui-bg-surface);
  color: var(--ui-text-secondary);
  border-radius: var(--ui-radius-xs);
  font-size: 10px;
  cursor: pointer;
}
.chooser-save {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 4px;
  margin-top: 6px;
}
.chooser-name {
  height: 20px;
  border: 1px solid var(--ui-border-subtle);
  background: var(--ui-bg-input, #111);
  color: var(--ui-text-primary);
  font-size: 10px;
  padding: 0 4px;
}
.chooser-btn { width: auto; padding: 0 6px; margin: 0; }
.chooser-btn.is-ghost { background: transparent; }
</style>
