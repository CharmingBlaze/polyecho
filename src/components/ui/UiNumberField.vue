<script setup lang="ts">
import { ref } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: number
  label?: string
  labelColor?: string
  step?: number
  min?: number
  max?: number
  precision?: number
  unit?: string
  disabled?: boolean
}>(), {
  label: '',
  labelColor: 'text-ui-textSecondary',
  step: 0.1,
  min: -Infinity,
  max: Infinity,
  precision: 2,
  unit: '',
  disabled: false
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: number): void
  (e: 'change', value: number): void
  (e: 'commit', value: number): void
  (e: 'beforeChange'): void
}>()

const isDragging = ref(false)
let startX = 0
let startVal = 0
let emittedBeforeChange = false
let activePointerId: number | null = null

function emitBeforeChangeOnce() {
  if (emittedBeforeChange) return
  emittedBeforeChange = true
  emit('beforeChange')
}

function handlePointerDown(e: PointerEvent) {
  if (props.disabled) return
  if (e.button !== 0) return // Left click only
  
  // Keep direct input entry available for keyboard and on-screen keyboards.
  if ((e.target as HTMLElement).tagName === 'INPUT') return

  e.preventDefault()
  isDragging.value = true
  emittedBeforeChange = false
  activePointerId = e.pointerId
  startX = e.clientX
  startVal = props.modelValue
  document.body.style.cursor = 'ew-resize'

  const onPointerMove = (moveEvent: PointerEvent) => {
    if (!isDragging.value || moveEvent.pointerId !== activePointerId) return
    moveEvent.preventDefault()
    const dx = moveEvent.clientX - startX
    const delta = dx * (props.step || 0.1)
    let newVal = Number((startVal + delta).toFixed(props.precision))
    if (props.min !== undefined) newVal = Math.max(props.min, newVal)
    if (props.max !== undefined) newVal = Math.min(props.max, newVal)

    emitBeforeChangeOnce()
    emit('update:modelValue', newVal)
    emit('change', newVal)
  }

  const finishPointer = (upEvent: PointerEvent) => {
    if (upEvent.pointerId !== activePointerId) return
    if (emittedBeforeChange) emit('commit', props.modelValue)
    isDragging.value = false
    emittedBeforeChange = false
    activePointerId = null
    document.body.style.cursor = ''
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', finishPointer)
    window.removeEventListener('pointercancel', finishPointer)
  }

  window.addEventListener('pointermove', onPointerMove, { passive: false })
  window.addEventListener('pointerup', finishPointer)
  window.addEventListener('pointercancel', finishPointer)
}

function handleInput(event: Event) {
  const val = parseFloat((event.target as HTMLInputElement).value)
  if (!isNaN(val)) {
    let clamped = val
    if (props.min !== undefined) clamped = Math.max(props.min, clamped)
    if (props.max !== undefined) clamped = Math.min(props.max, clamped)
    emitBeforeChangeOnce()
    emit('update:modelValue', clamped)
    emit('change', clamped)
    emit('commit', clamped)
  }
}
</script>

<template>
  <div 
    class="flex items-center h-6 bg-ui-input border border-ui-borderSubtle hover:border-ui-borderDefault focus-within:border-ui-accent rounded-xs px-1.5 text-xs font-mono transition select-none touch-none group"
    :class="{ 'opacity-40 pointer-events-none': disabled, 'cursor-ew-resize': !disabled }"
    @pointerdown="handlePointerDown"
  >
    <span 
      v-if="label" 
      class="text-[10px] font-semibold shrink-0 mr-1 select-none opacity-80"
      :class="labelColor || 'text-ui-textSecondary'"
    >
      {{ label }}
    </span>

    <input 
      type="number"
      :step="step"
      :min="min"
      :max="max"
      :value="modelValue"
      :disabled="disabled"
      class="w-full bg-transparent text-right text-ui-textPrimary font-mono tabular-nums text-xs focus:outline-none cursor-text selection:bg-ui-accent/40"
      @focus="emittedBeforeChange = false"
      @change="handleInput"
    >

    <span v-if="unit" class="text-[10px] text-ui-textMuted ml-0.5 shrink-0 select-none">
      {{ unit }}
    </span>
  </div>
</template>
