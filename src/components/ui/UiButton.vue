<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  variant?: 'default' | 'primary' | 'ghost' | 'danger' | 'accent'
  size?: 'xs' | 'sm' | 'md'
  disabled?: boolean
  active?: boolean
  type?: 'button' | 'submit' | 'reset'
}>(), {
  variant: 'default',
  size: 'sm',
  disabled: false,
  active: false,
  type: 'button'
})

const emit = defineEmits<{
  (e: 'click', event: MouseEvent): void
}>()

const classes = computed(() => {
  const base = 'inline-flex items-center justify-center font-mono font-medium rounded-xs transition-colors select-none focus:outline-none focus:ring-1 focus:ring-ui-accent disabled:opacity-40 disabled:pointer-events-none'
  
  const sizeMap = {
    xs: 'h-5 px-1.5 text-[10px] gap-1',
    sm: 'h-6 px-2 text-xs gap-1.5',
    md: 'h-7 px-3 text-xs gap-2'
  }

  const variantMap = {
    default: props.active 
      ? 'bg-ui-active text-ui-textPrimary border border-ui-borderStrong' 
      : 'bg-ui-surface text-ui-textPrimary hover:bg-ui-hover border border-ui-borderDefault',
    primary: 'bg-ui-accent text-white hover:bg-ui-accentHover border border-ui-accent/80 font-bold shadow-xs',
    accent: 'bg-ui-accentSubtle text-ui-textAccent hover:bg-ui-accent/30 border border-ui-accent/40 font-bold',
    ghost: props.active 
      ? 'bg-ui-hover text-ui-textPrimary' 
      : 'bg-transparent text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover',
    danger: 'bg-rose-950/40 text-rose-300 hover:bg-rose-900/60 border border-rose-800/50'
  }

  return [base, sizeMap[props.size], variantMap[props.variant]].join(' ')
})
</script>

<template>
  <button 
    :type="type" 
    :disabled="disabled" 
    :class="classes"
    @click="emit('click', $event)"
  >
    <slot />
  </button>
</template>
