<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import type { MaterialGradient, MaterialGradientStop } from '../../types/texture'
import { gradientCss, gradientRampCss, reverseGradient, sampleGradient } from '../../core/materials/MaterialFill'

/** Travel direction of a linear ramp. 0° runs left to right in UV space. */
const COMPASS: { angle: number; glyph: string; label: string; center?: boolean }[] = [
  { angle: 225, glyph: '↖', label: 'Bottom-right to top-left' },
  { angle: 270, glyph: '↑', label: 'Bottom to top' },
  { angle: 315, glyph: '↗', label: 'Bottom-left to top-right' },
  { angle: 180, glyph: '←', label: 'Right to left' },
  { angle: 0, glyph: '', label: '', center: true },
  { angle: 0, glyph: '→', label: 'Left to right' },
  { angle: 135, glyph: '↙', label: 'Top-right to bottom-left' },
  { angle: 90, glyph: '↓', label: 'Top to bottom' },
  { angle: 45, glyph: '↘', label: 'Top-left to bottom-right' }
]

const props = defineProps<{
  gradient: MaterialGradient
}>()

const emit = defineEmits<{
  begin: []
  update: [gradient: MaterialGradient]
}>()

const sliderRef = ref<HTMLElement | null>(null)
const selected = ref<{ kind: 'stop' | 'midpoint'; index: number }>({ kind: 'stop', index: 0 })
const removing = ref(false)
let tokenSeq = 1
const tokens = ref<number[]>([])

const stops = computed(() => props.gradient.stops)
const selectedStop = computed(() => stops.value[selected.value.kind === 'stop' ? selected.value.index : 0])

const midpoints = computed(() => {
  const list = stops.value
  const marks: { index: number; left: number }[] = []
  for (let i = 0; i < list.length - 1; i++) {
    const span = list[i + 1].offset - list[i].offset
    const mid = list[i].midpoint ?? 0.5
    marks.push({ index: i, left: (list[i].offset + span * mid) * 100 })
  }
  return marks
})

const rampStyle = computed(() => ({
  backgroundImage: `${gradientRampCss(props.gradient)}, repeating-conic-gradient(#3f3f46 0% 25%, #18181b 0% 50%)`,
  backgroundSize: 'auto, 8px 8px'
}))

const aimedStyle = computed(() => ({
  backgroundImage: `${gradientCss(props.gradient)}, repeating-conic-gradient(#3f3f46 0% 25%, #18181b 0% 50%)`,
  backgroundSize: 'auto, 6px 6px'
}))

const roundedAngle = computed(() => Math.round(props.gradient.angle) % 360)

function cloneGradient(source: MaterialGradient = props.gradient): MaterialGradient {
  return {
    kind: source.kind,
    angle: source.angle,
    stops: source.stops.map(stop => ({ ...stop }))
  }
}

function commit(next: MaterialGradient) {
  emit('update', next)
}

function pointerRatio(clientX: number): number {
  const rect = sliderRef.value?.getBoundingClientRect()
  if (!rect || rect.width <= 0) return 0
  return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
}

let drag: { kind: 'stop' | 'midpoint'; index: number } | null = null

function syncTokens(count: number) {
  while (tokens.value.length < count) tokens.value.push(tokenSeq++)
  if (tokens.value.length > count) tokens.value.splice(count)
}

function onMove(event: PointerEvent) {
  if (!drag) return
  const ratio = pointerRatio(event.clientX)
  const rect = sliderRef.value?.getBoundingClientRect()
  if (drag.kind === 'stop') {
    commit(moveStop(drag.index, ratio))
    removing.value = !!rect && event.clientY > rect.bottom + 28 && props.gradient.stops.length > 2
  } else {
    const next = cloneGradient()
    const left = next.stops[drag.index]
    const right = next.stops[drag.index + 1]
    if (!left || !right) return
    const span = right.offset - left.offset
    const mid = span <= 0.0001 ? 0.5 : (ratio - left.offset) / span
    left.midpoint = Math.min(0.87, Math.max(0.13, Math.round(mid * 1000) / 1000))
    commit(next)
  }
}

function moveStop(index: number, ratio: number): MaterialGradient {
  const next = cloneGradient()
  syncTokens(next.stops.length)
  const draggedToken = tokens.value[index]
  const tagged = next.stops.map((stop, i) => ({ stop: { ...stop }, token: tokens.value[i] }))
  tagged[index].stop.offset = Math.round(ratio * 1000) / 1000
  tagged.sort((a, b) => a.stop.offset - b.stop.offset)
  const at = Math.max(0, tagged.findIndex(item => item.token === draggedToken))
  tokens.value = tagged.map(item => item.token)
  selected.value = { kind: 'stop', index: at }
  if (drag) drag.index = at
  return { ...next, stops: tagged.map(item => item.stop) }
}

function endDrag() {
  if (drag?.kind === 'stop' && removing.value && props.gradient.stops.length > 2) {
    const next = cloneGradient()
    next.stops.splice(drag.index, 1)
    tokens.value.splice(drag.index, 1)
    selected.value = { kind: 'stop', index: Math.max(0, Math.min(drag.index, next.stops.length - 1)) }
    commit(next)
  }
  drag = null
  removing.value = false
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', endDrag)
}

function startDrag(kind: 'stop' | 'midpoint', index: number, event: PointerEvent) {
  event.preventDefault()
  event.stopPropagation()
  selected.value = { kind, index }
  emit('begin')
  removing.value = false
  syncTokens(props.gradient.stops.length)
  drag = { kind, index }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', endDrag)
}

onUnmounted(endDrag)

function addStop(event: PointerEvent) {
  if (event.target !== event.currentTarget) return
  const ratio = Math.round(pointerRatio(event.clientX) * 1000) / 1000
  const sampled = sampleGradient(props.gradient, ratio)
  emit('begin')
  const next = cloneGradient()
  const stop: MaterialGradientStop = { color: sampled.color, offset: ratio }
  if (sampled.opacity < 0.999) stop.opacity = Math.round(sampled.opacity * 1000) / 1000
  syncTokens(next.stops.length)
  const token = tokenSeq++
  next.stops.push(stop)
  const order = next.stops.map((item, index) => ({ item, token: tokens.value[index] ?? token }))
  order[order.length - 1].token = token
  order.sort((a, b) => a.item.offset - b.item.offset)
  tokens.value = order.map(entry => entry.token)
  selected.value = { kind: 'stop', index: order.findIndex(entry => entry.token === token) }
  commit({ ...next, stops: order.map(entry => entry.item) })
}

function setKind(kind: MaterialGradient['kind']) {
  if (props.gradient.kind === kind) return
  emit('begin')
  commit({ ...cloneGradient(), kind })
}

function setAngle(angle: number) {
  if (!Number.isFinite(angle)) return
  const next = cloneGradient()
  next.angle = ((angle % 360) + 360) % 360
  commit(next)
}

function chooseDirection(angle: number) {
  if (roundedAngle.value === angle) return
  emit('begin')
  setAngle(angle)
}

function flip() {
  emit('begin')
  commit(reverseGradient(props.gradient))
  selected.value = { kind: 'stop', index: 0 }
}

function patchSelected(patch: Partial<MaterialGradientStop>) {
  if (selected.value.kind !== 'stop') return
  const next = cloneGradient()
  const stop = next.stops[selected.value.index]
  if (!stop) return
  next.stops[selected.value.index] = { ...stop, ...patch }
  if (typeof patch.offset === 'number') {
    commit(moveStop(selected.value.index, Math.min(1, Math.max(0, patch.offset))))
    return
  }
  commit(next)
}

function setMidpoint(percent: number) {
  if (selected.value.kind !== 'midpoint') return
  const next = cloneGradient()
  const stop = next.stops[selected.value.index]
  if (!stop) return
  stop.midpoint = Math.min(0.87, Math.max(0.13, percent / 100))
  commit(next)
}

function removeSelected() {
  if (selected.value.kind !== 'stop' || props.gradient.stops.length <= 2) return
  emit('begin')
  const next = cloneGradient()
  next.stops.splice(selected.value.index, 1)
  tokens.value.splice(selected.value.index, 1)
  selected.value = { kind: 'stop', index: Math.max(0, selected.value.index - 1) }
  commit(next)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Delete' && event.key !== 'Backspace') return
  event.preventDefault()
  removeSelected()
}

const locationPercent = computed(() => {
  if (selected.value.kind === 'midpoint') {
    const stop = stops.value[selected.value.index]
    return Math.round((stop?.midpoint ?? 0.5) * 100)
  }
  return Math.round((selectedStop.value?.offset ?? 0) * 100)
})

const opacityPercent = computed(() => Math.round((selectedStop.value?.opacity ?? 1) * 100))
</script>

<template>
  <div class="grad-editor" tabindex="0" @keydown="onKeydown">
    <div class="grad-toolbar">
      <div class="inspector-seg">
        <button type="button" class="inspector-seg-btn" :class="{ 'is-active': gradient.kind !== 'radial' }" @click="setKind('linear')">Linear</button>
        <button type="button" class="inspector-seg-btn" :class="{ 'is-active': gradient.kind === 'radial' }" @click="setKind('radial')">Radial</button>
      </div>
      <button type="button" class="grad-flip" title="Reverse gradient" @click="flip">Flip</button>
    </div>

    <div v-if="gradient.kind === 'linear'" class="grad-aim">
      <div class="grad-compass" role="group" aria-label="Gradient direction">
        <template v-for="(dir, index) in COMPASS" :key="index">
          <span
            v-if="dir.center"
            class="grad-compass-preview"
            :style="aimedStyle"
            title="Preview of the gradient direction"
          ></span>
          <button
            v-else
            type="button"
            class="grad-dir"
            :class="{ 'is-active': roundedAngle === dir.angle }"
            :title="dir.label"
            :aria-label="dir.label"
            :aria-pressed="roundedAngle === dir.angle"
            @click="chooseDirection(dir.angle)"
          >{{ dir.glyph }}</button>
        </template>
      </div>
      <label class="grad-angle">
        <span>Angle</span>
        <input
          class="inspector-range"
          type="range"
          min="0"
          max="359"
          :value="roundedAngle"
          aria-label="Gradient angle"
          @pointerdown="emit('begin')"
          @input="setAngle(Number(($event.target as HTMLInputElement).value))"
        />
        <input
          type="number"
          min="0"
          max="359"
          :value="roundedAngle"
          aria-label="Gradient angle in degrees"
          @focus="emit('begin')"
          @change="setAngle(Number(($event.target as HTMLInputElement).value))"
        />
      </label>
    </div>

    <div ref="sliderRef" class="grad-slider">
      <div class="grad-mid-row">
        <button
          v-for="mark in midpoints"
          :key="`mid-${mark.index}`"
          type="button"
          class="grad-diamond"
          :class="{ 'is-selected': selected.kind === 'midpoint' && selected.index === mark.index }"
          :style="{ left: `${mark.left}%` }"
          title="Drag the midpoint"
          @pointerdown="startDrag('midpoint', mark.index, $event)"
        ></button>
      </div>
      <div
        class="grad-ramp"
        :style="rampStyle"
        title="Click to add a color stop"
        @pointerdown="addStop"
      ></div>
      <div class="grad-stop-row">
        <button
          v-for="(stop, index) in stops"
          :key="tokens[index] ?? index"
          type="button"
          class="grad-stop"
          :class="{ 'is-selected': selected.kind === 'stop' && selected.index === index, 'is-remove': removing && selected.kind === 'stop' && selected.index === index }"
          :style="{ left: `${stop.offset * 100}%` }"
          title="Drag along the bar. Drag down to delete."
          @pointerdown="startDrag('stop', index, $event)"
        >
          <span class="grad-stop-swatch" :style="{ background: stop.color, opacity: stop.opacity ?? 1 }"></span>
        </button>
      </div>
    </div>

    <div v-if="selected.kind === 'midpoint'" class="grad-fields">
      <span class="grad-label">Midpoint</span>
      <input
        class="inspector-range flex-1"
        type="range"
        min="13"
        max="87"
        :value="locationPercent"
        @pointerdown="emit('begin')"
        @input="setMidpoint(Number(($event.target as HTMLInputElement).value))"
      />
      <span class="grad-readout">{{ locationPercent }}%</span>
    </div>

    <div v-else-if="selectedStop" class="grad-fields-stack">
      <div class="grad-fields">
        <input
          type="color"
          class="grad-color"
          :value="selectedStop.color"
          @pointerdown="emit('begin')"
          @input="patchSelected({ color: ($event.target as HTMLInputElement).value })"
        />
        <input
          class="grad-hex"
          :value="selectedStop.color"
          @focus="emit('begin')"
          @change="patchSelected({ color: ($event.target as HTMLInputElement).value })"
        />
        <span class="grad-label">Location</span>
        <input
          class="grad-num"
          type="number"
          min="0"
          max="100"
          :value="locationPercent"
          @focus="emit('begin')"
          @change="patchSelected({ offset: Number(($event.target as HTMLInputElement).value) / 100 })"
        />
        <button type="button" class="grad-flip" :disabled="stops.length <= 2" title="Delete stop" @click="removeSelected">Delete</button>
      </div>
      <div class="grad-fields">
        <span class="grad-label">Opacity</span>
        <input
          class="inspector-range flex-1"
          type="range"
          min="0"
          max="100"
          :value="opacityPercent"
          @pointerdown="emit('begin')"
          @input="patchSelected({ opacity: Number(($event.target as HTMLInputElement).value) / 100 })"
        />
        <span class="grad-readout">{{ opacityPercent }}%</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.grad-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  outline: none;
}
.grad-toolbar,
.grad-fields {
  display: flex;
  align-items: center;
  gap: 6px;
}
.grad-fields-stack {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.grad-flip,
.grad-angle input,
.grad-hex,
.grad-num {
  height: 22px;
  border: 1px solid var(--ui-border-subtle);
  background: var(--ui-bg-surface);
  color: var(--ui-text-secondary);
  border-radius: var(--ui-radius-xs);
  font-size: 10px;
}
.grad-flip {
  padding: 0 6px;
  cursor: pointer;
}
.grad-flip:disabled {
  opacity: 0.35;
  cursor: default;
}
.grad-aim {
  display: flex;
  align-items: center;
  gap: 8px;
}
.grad-compass {
  display: grid;
  grid-template-columns: repeat(3, 18px);
  grid-template-rows: repeat(3, 18px);
  gap: 2px;
  flex: none;
}
.grad-dir {
  padding: 0;
  border: 1px solid var(--ui-border-subtle);
  background: var(--ui-bg-surface);
  color: var(--ui-text-secondary);
  border-radius: var(--ui-radius-xs);
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
}
.grad-dir.is-active {
  color: var(--ui-text-primary, #fff);
  border-color: var(--ui-accent, #7dd3fc);
  background: color-mix(in srgb, var(--ui-accent, #7dd3fc) 22%, var(--ui-bg-surface));
}
.grad-compass-preview {
  border: 1px solid var(--ui-border-default);
  border-radius: 2px;
  background-color: #1a1a1a;
}
.grad-angle {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
  font-size: 10px;
  color: var(--ui-text-muted);
}
.grad-angle .inspector-range {
  flex: 1;
  min-width: 36px;
}
.grad-angle input,
.grad-num {
  width: 42px;
  padding: 0 4px;
  font-family: ui-monospace, monospace;
}
.grad-hex {
  width: 72px;
  padding: 0 4px;
  font-family: ui-monospace, monospace;
  text-transform: uppercase;
}
.grad-color {
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid var(--ui-border-default);
  background: transparent;
  cursor: pointer;
}
.grad-label,
.grad-readout {
  font-size: 10px;
  color: var(--ui-text-muted);
}
.grad-readout {
  width: 32px;
  text-align: right;
  font-family: ui-monospace, monospace;
  color: var(--ui-text-secondary);
}
.grad-slider {
  position: relative;
  padding: 14px 8px 16px;
  user-select: none;
}
.grad-ramp {
  height: 18px;
  border: 1px solid var(--ui-border-default);
  border-radius: 2px;
  cursor: copy;
  background-color: #1a1a1a;
  background-size: auto, 8px 8px;
  background-position: 0 0, 0 0;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.35);
}
.grad-mid-row,
.grad-stop-row {
  position: absolute;
  left: 8px;
  right: 8px;
  height: 12px;
}
.grad-mid-row {
  top: 0;
}
.grad-stop-row {
  bottom: 0;
  height: 14px;
}
.grad-diamond,
.grad-stop {
  position: absolute;
  padding: 0;
  transform: translateX(-50%);
  cursor: ew-resize;
}
.grad-diamond {
  top: 1px;
  width: 8px;
  height: 8px;
  background: var(--ui-text-secondary);
  border: 1px solid #111;
  transform: translateX(-50%) rotate(45deg);
}
.grad-diamond.is-selected {
  background: var(--ui-accent, #7dd3fc);
}
.grad-stop {
  top: 0;
  width: 12px;
  height: 14px;
  background: transparent;
  border: 0;
}
.grad-stop-swatch {
  display: block;
  width: 12px;
  height: 10px;
  border: 1px solid #111;
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.35) inset;
  clip-path: polygon(0 0, 100% 0, 100% 62%, 50% 100%, 0 62%);
}
.grad-stop.is-selected .grad-stop-swatch {
  outline: 1px solid #fff;
  outline-offset: 1px;
}
.grad-stop.is-remove .grad-stop-swatch {
  outline-color: #f43f5e;
}
</style>
