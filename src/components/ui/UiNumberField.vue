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
}>()

const isDragging = ref(false)
let startX = 0
let startVal = 0

function handleMouseDown(e: MouseEvent) {
  if (props.disabled) return
  if (e.button !== 0) return // Left click only
  
  // If clicking directly on text input, allow focus
  if ((e.target as HTMLElement).tagName === 'INPUT') return

  isDragging.value = true
  startX = e.clientX
  startVal = props.modelValue
  document.body.style.cursor = 'ew-resize'

  const onMouseMove = (moveEvent: MouseEvent) => {
    if (!isDragging.value) return
    const dx = moveEvent.clientX - startX
    const delta = dx * (props.step || 0.1)
    let newVal = Number((startVal + delta).toFixed(props.precision))
    if (props.min !== undefined) newVal = Math.max(props.min, newVal)
    if (props.max !== undefined) newVal = Math.min(props.max, newVal)

    emit('update:modelValue', newVal)
    emit('change', newVal)
  }

  const onMouseUp = () => {
    isDragging.value = false
    document.body.style.cursor = ''
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

function handleInput(event: Event) {
  const val = parseFloat((event.target as HTMLInputElement).value)
  if (!isNaN(val)) {
    let clamped = val
    if (props.min !== undefined) clamped = Math.max(props.min, clamped)
    if (props.max !== undefined) clamped = Math.min(props.max, clamped)
    emit('update:modelValue', clamped)
    emit('change', clamped)
  }
}
</script>

<template>
  <div 
    class="flex items-center h-6 bg-ui-input border border-ui-borderSubtle hover:border-ui-borderDefault focus-within:border-ui-accent rounded-xs px-1.5 text-xs font-mono transition select-none group"
    :class="{ 'opacity-40 pointer-events-none': disabled, 'cursor-ew-resize': !disabled }"
    @mousedown="handleMouseDown"
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
      @change="handleInput"
    />

    <span v-if="unit" class="text-[10px] text-ui-textMuted ml-0.5 shrink-0 select-none">
      {{ unit }}
    </span>
  </div>
</template>
