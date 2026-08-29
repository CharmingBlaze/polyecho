<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  variant?: 'default' | 'ghost' | 'active' | 'danger'
  size?: 'xs' | 'sm' | 'md'
  disabled?: boolean
  active?: boolean
  title?: string
}>(), {
  variant: 'ghost',
  size: 'sm',
  disabled: false,
  active: false,
  title: ''
})

const emit = defineEmits<{
  (e: 'click', event: MouseEvent): void
}>()

const classes = computed(() => {
  const base = 'inline-flex items-center justify-center rounded-xs transition-colors select-none focus:outline-none focus:ring-1 focus:ring-ui-accent disabled:opacity-40 disabled:pointer-events-none'
  
  const sizeMap = {
    xs: 'w-5 h-5 text-xs',
    sm: 'w-6 h-6 text-xs',
    md: 'w-7 h-7 text-sm'
  }

  const variantMap = {
    default: props.active 
      ? 'bg-ui-active text-ui-textAccent border border-ui-accent/50' 
      : 'bg-ui-surface text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover border border-ui-borderDefault',
    ghost: props.active 
      ? 'bg-ui-accentSubtle text-ui-textAccent border border-ui-accent/40 shadow-xs' 
      : 'bg-transparent text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover',
    active: 'bg-ui-accentSubtle text-ui-textAccent border border-ui-accent/50 shadow-xs',
    danger: 'bg-transparent text-rose-400 hover:text-rose-200 hover:bg-rose-950/40'
  }

  return [base, sizeMap[props.size], variantMap[props.variant]].join(' ')
})
</script>

<template>
  <button 
    type="button" 
    :disabled="disabled" 
    :class="classes"
    :title="title"
    @click="emit('click', $event)"
  >
    <slot />
  </button>
</template>
