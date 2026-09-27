<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  BRUSH_SIZE_MAX,
  BRUSH_SIZE_MIN,
  BRUSH_SIZE_PRESETS,
  brushSizeFromUnit,
  brushSizeToUnit,
  clampBrushSize
} from '../../core/painting/BrushSize'
import { useToolStore } from '../../stores/toolStore'

const props = withDefaults(defineProps<{ fill?: boolean; compact?: boolean }>(), { fill: false, compact: false })

const toolStore = useToolStore()
const root = ref<HTMLElement | null>(null)
const pop = ref<HTMLElement | null>(null)
const stamp = ref<HTMLCanvasElement | null>(null)
const popStamp = ref<HTMLCanvasElement | null>(null)
const open = ref(false)
const draft = ref<string | null>(null)
const popStyle = ref({ left: '0px', top: '0px' })

const hint = 'Brush size, 1–128 px. The slider gives small sizes more travel. Drag the number to scrub. [ ] steps by 1 (Shift by 5).'
const unit = computed(() => brushSizeToUnit(toolStore.brushSize) * 100)
const readout = computed(() => draft.value ?? String(toolStore.brushSize))
const stampBox = computed(() => (props.compact ? 20 : props.fill ? 36 : 22))

function setSize(value: number) {
  toolStore.brushSize = clampBrushSize(value)
}

function onTrackPointer(e: PointerEvent) {
  if (e.button !== 0) return
  const el = e.currentTarget as HTMLElement
  el.setPointerCapture(e.pointerId)
  const apply = (ev: PointerEvent) => {
    const rect = el.getBoundingClientRect()
    const span = rect.width || 1
    setSize(brushSizeFromUnit((ev.clientX - rect.left) / span))
    draft.value = null
  }
  const move = (ev: PointerEvent) => {
    if (ev.pointerId === e.pointerId) apply(ev)
  }
  const up = (ev: PointerEvent) => {
    if (ev.pointerId !== e.pointerId) return
    el.removeEventListener('pointermove', move)
    el.removeEventListener('pointerup', up)
    el.removeEventListener('pointercancel', up)
  }
  apply(e)
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', up)
  el.addEventListener('pointercancel', up)
}

function onTrackKey(e: KeyboardEvent) {
  const step = e.shiftKey ? 5 : 1
  if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
    e.preventDefault()
    setSize(toolStore.brushSize + step)
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
    e.preventDefault()
    setSize(toolStore.brushSize - step)
  } else if (e.key === 'Home') {
    e.preventDefault()
    setSize(BRUSH_SIZE_MIN)
  } else if (e.key === 'End') {
    e.preventDefault()
    setSize(BRUSH_SIZE_MAX)
  }
}

function onNumberPointerDown(e: PointerEvent) {
  if (e.button !== 0) return
  e.preventDefault()
  const startX = e.clientX
  const start = toolStore.brushSize
  let dragged = false
  const move = (ev: PointerEvent) => {
    const dx = ev.clientX - startX
    if (Math.abs(dx) <= 3) return
    dragged = true
    setSize(start + dx / 6)
    draft.value = null
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    if (!dragged && e.target instanceof HTMLInputElement) e.target.focus()
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function onNumberInput(e: Event) {
  const raw = (e.target as HTMLInputElement).value
  draft.value = raw
  const n = Number(raw)
  if (raw.trim() !== '' && Number.isFinite(n)) setSize(n)
}

function commitDraft() {
  if (draft.value != null) setSize(Number(draft.value))
  draft.value = null
}

function placePopover() {
  const anchor = root.value
  if (!anchor) return
  const rect = anchor.getBoundingClientRect()
  const width = 232
  const height = pop.value?.offsetHeight ?? 196
  let left = props.fill ? rect.right - width : rect.left
  let top = rect.bottom + 6
  left = Math.max(8, Math.min(left, window.innerWidth - width - 8))
  if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 6)
  popStyle.value = { left: `${left}px`, top: `${top}px` }
}

async function togglePresets() {
  open.value = !open.value
  if (!open.value) return
  await nextTick()
  placePopover()
  drawStamp(popStamp.value, 72)
}

function onDocPointer(e: PointerEvent) {
  if (!open.value) return
  const target = e.target
  if (!(target instanceof Node)) return
  if (root.value?.contains(target) || pop.value?.contains(target)) return
  open.value = false
}

function onEscape(e: KeyboardEvent) {
  if (e.key === 'Escape') open.value = false
}

function drawStamp(canvas: HTMLCanvasElement | null, box: number) {
  if (!canvas) return
  const size = clampBrushSize(toolStore.brushSize)
  const shape = toolStore.brushShape
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  canvas.width = Math.round(box * dpr)
  canvas.height = Math.round(box * dpr)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, box, box)
  const cell = box > 40 ? 6 : 4
  for (let y = 0; y < box; y += cell) {
    for (let x = 0; x < box; x += cell) {
      const alt = ((x / cell) + (y / cell)) % 2 < 1
      ctx.fillStyle = alt ? '#1c1c1c' : '#2c2c2c'
      ctx.fillRect(x, y, cell, cell)
    }
  }
  const pad = box > 40 ? 8 : 3
  const scale = Math.min(1, (box - pad * 2) / size)
  const drawn = size * scale
  const ox = (box - drawn) / 2
  const oy = (box - drawn) / 2
  ctx.save()
  ctx.globalAlpha = Math.max(0.2, Math.min(1, toolStore.brushOpacity))
  ctx.fillStyle = toolStore.primaryColor || '#ffffff'
  if (shape === 'circle' && size > 2) {
    const mark = Math.max(scale, 1)
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        if (Math.hypot(dx + 0.5 - size / 2, dy + 0.5 - size / 2) <= size / 2) {
          ctx.fillRect(ox + dx * scale, oy + dy * scale, mark, mark)
        }
      }
    }
  } else {
    ctx.fillRect(ox, oy, Math.max(drawn, 1), Math.max(drawn, 1))
  }
  ctx.restore()
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'
  ctx.lineWidth = 1
  ctx.strokeRect(ox + 0.5, oy + 0.5, Math.max(drawn - 1, 0), Math.max(drawn - 1, 0))
}

function paintStamps() {
  drawStamp(stamp.value, stampBox.value)
  if (open.value) drawStamp(popStamp.value, 72)
}

watch(
  () => [toolStore.brushSize, toolStore.brushShape, toolStore.primaryColor, toolStore.brushOpacity, open.value, stampBox.value],
  () => nextTick(paintStamps)
)

onMounted(() => {
  paintStamps()
  document.addEventListener('pointerdown', onDocPointer, true)
  document.addEventListener('keydown', onEscape)
  window.addEventListener('resize', placePopover)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointer, true)
  document.removeEventListener('keydown', onEscape)
  window.removeEventListener('resize', placePopover)
})
</script>

<template>
  <div
    ref="root"
    class="brush-size-control"
    :class="{ 'is-fill': fill, 'is-compact': compact }"
    role="group"
    aria-label="Brush size"
    @pointerdown.stop
  >
    <button
      type="button"
      class="brush-size-stamp"
      :class="{ 'is-open': open }"
      title="Size presets"
      aria-label="Brush size presets"
      :aria-expanded="open"
      @click="togglePresets"
    >
      <canvas ref="stamp" class="brush-size-stamp-canvas" />
    </button>

    <div class="brush-size-slider-row">
      <div
        class="brush-size-track"
        role="slider"
        tabindex="0"
        aria-label="Brush size slider"
        :aria-valuemin="BRUSH_SIZE_MIN"
        :aria-valuemax="BRUSH_SIZE_MAX"
        :aria-valuenow="toolStore.brushSize"
        aria-valuetext="pixels"
        :title="hint"
        @pointerdown="onTrackPointer"
        @keydown="onTrackKey"
      >
        <div class="brush-size-fill" :style="{ width: unit + '%' }" />
        <div class="brush-size-thumb" :style="{ left: unit + '%' }" />
      </div>
      <input
        class="brush-size-number"
        type="number"
        inputmode="numeric"
        :min="BRUSH_SIZE_MIN"
        :max="BRUSH_SIZE_MAX"
        :value="readout"
        aria-label="Brush size in pixels"
        title="Type a size, or drag left and right to scrub"
        @pointerdown="onNumberPointerDown"
        @input="onNumberInput"
        @change="commitDraft"
        @blur="commitDraft"
        @keydown.enter="($event.target as HTMLInputElement).blur()"
      />
    </div>

    <div v-if="fill" class="brush-size-presets" role="listbox" aria-label="Brush size presets">
      <button
        v-for="preset in BRUSH_SIZE_PRESETS"
        :key="preset"
        type="button"
        role="option"
        :aria-selected="toolStore.brushSize === preset"
        :class="{ 'is-active': toolStore.brushSize === preset }"
        @click="setSize(preset)"
      >{{ preset }}</button>
    </div>

    <Teleport to="body">
      <div
        v-if="open"
        ref="pop"
        class="brush-size-popover"
        :style="popStyle"
        role="dialog"
        aria-label="Brush size"
        @pointerdown.stop
      >
        <div class="brush-size-popover-head">
          <canvas ref="popStamp" class="brush-size-popover-stamp" />
          <div>
            <strong>{{ toolStore.brushSize }} px</strong>
            <span>{{ toolStore.brushShape === 'circle' ? 'Round' : 'Square' }} · {{ Math.round(toolStore.brushOpacity * 100) }}%</span>
          </div>
        </div>
        <div class="brush-size-presets" role="listbox" aria-label="Brush size presets">
          <button
            v-for="preset in BRUSH_SIZE_PRESETS"
            :key="preset"
            type="button"
            role="option"
            :aria-selected="toolStore.brushSize === preset"
            :class="{ 'is-active': toolStore.brushSize === preset }"
            @click="setSize(preset)"
          >{{ preset }}</button>
        </div>
        <p>Small sizes take more of the slider. Drag the number to scrub one pixel every few pixels of movement.</p>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.brush-size-control {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  flex-shrink: 0;
}
.brush-size-control.is-compact {
  height: 24px;
  gap: 3px;
}
.brush-size-control.is-fill {
  display: flex;
  flex-wrap: wrap;
  width: 100%;
  height: auto;
  gap: 6px;
}
.brush-size-stamp {
  width: 22px;
  height: 22px;
  padding: 0;
  flex-shrink: 0;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 3px;
  background: var(--ui-bg-input);
  cursor: pointer;
  overflow: hidden;
}
.brush-size-control.is-compact .brush-size-stamp {
  width: 20px;
  height: 20px;
}
.brush-size-control.is-fill .brush-size-stamp {
  width: 36px;
  height: 36px;
}
.brush-size-stamp:hover,
.brush-size-stamp.is-open {
  border-color: var(--ui-accent);
}
.brush-size-stamp-canvas {
  display: block;
  width: 100%;
  height: 100%;
}
.brush-size-slider-row {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.brush-size-control.is-fill .brush-size-slider-row {
  flex: 1;
}
.brush-size-track {
  position: relative;
  width: 112px;
  height: 22px;
  flex-shrink: 0;
  cursor: ew-resize;
  touch-action: none;
}
.brush-size-control.is-compact .brush-size-track {
  width: 84px;
  height: 20px;
}
.brush-size-control.is-fill .brush-size-track {
  flex: 1;
  width: auto;
  min-width: 72px;
}
.brush-size-track:focus-visible {
  outline: 2px solid var(--ui-accent);
  outline-offset: 1px;
}
.brush-size-track::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 3px;
  margin-top: -1.5px;
  border-radius: 99px;
  background: var(--ui-bg-input);
  box-shadow: inset 0 0 0 1px var(--ui-border-subtle);
}
.brush-size-fill {
  position: absolute;
  left: 0;
  top: 50%;
  height: 3px;
  margin-top: -1.5px;
  border-radius: 99px;
  background: var(--ui-accent);
  pointer-events: none;
}
.brush-size-thumb {
  position: absolute;
  top: 50%;
  width: 12px;
  height: 12px;
  margin: -6px 0 0 -6px;
  border-radius: 99px;
  background: var(--ui-text-primary);
  border: 2px solid var(--ui-accent);
  box-shadow: 0 1px 3px #0008;
  pointer-events: none;
}
.brush-size-number {
  width: 38px;
  height: 22px;
  flex-shrink: 0;
  padding: 0 2px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 3px;
  background: var(--ui-bg-input);
  color: var(--ui-text-primary);
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-align: center;
  cursor: ew-resize;
  -moz-appearance: textfield;
  appearance: textfield;
}
.brush-size-number::-webkit-outer-spin-button,
.brush-size-number::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.brush-size-number:focus {
  outline: none;
  border-color: var(--ui-accent);
  cursor: text;
}
.brush-size-control.is-compact .brush-size-number {
  width: 34px;
  height: 20px;
  font-size: 10px;
}
.brush-size-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  width: 100%;
}
.brush-size-presets button {
  min-width: 26px;
  height: 20px;
  padding: 0 4px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 3px;
  background: var(--ui-bg-input);
  color: var(--ui-text-secondary);
  font-size: 10px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}
.brush-size-presets button:hover {
  background: var(--ui-bg-hover);
  color: var(--ui-text-primary);
}
.brush-size-presets button.is-active {
  border-color: var(--ui-accent);
  background: var(--ui-bg-active);
  color: var(--ui-text-primary);
}
</style>

<style>
.brush-size-popover {
  position: fixed;
  z-index: 4000;
  width: 232px;
  padding: 10px;
  border: 1px solid var(--ui-border-strong);
  border-radius: 6px;
  background: var(--ui-bg-panel);
  box-shadow: 0 10px 28px #000a;
  color: var(--ui-text-secondary);
  font-family: var(--font-sans, sans-serif);
}
.brush-size-popover-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.brush-size-popover-head strong {
  display: block;
  color: var(--ui-text-primary);
  font-size: 13px;
}
.brush-size-popover-head span {
  font-size: 10px;
}
.brush-size-popover-stamp {
  width: 72px;
  height: 72px;
  border-radius: 4px;
  border: 1px solid var(--ui-border-subtle);
}
.brush-size-popover .brush-size-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}
.brush-size-popover .brush-size-presets button {
  min-width: 32px;
  height: 22px;
  padding: 0 5px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 3px;
  background: var(--ui-bg-input);
  color: var(--ui-text-secondary);
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
}
.brush-size-popover .brush-size-presets button:hover {
  background: var(--ui-bg-hover);
  color: var(--ui-text-primary);
}
.brush-size-popover .brush-size-presets button.is-active {
  border-color: var(--ui-accent);
  background: var(--ui-bg-active);
  color: var(--ui-text-primary);
}
.brush-size-popover p {
  margin: 8px 0 0;
  font-size: 10px;
  line-height: 1.35;
}
</style>
