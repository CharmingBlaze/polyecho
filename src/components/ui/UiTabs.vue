<script setup lang="ts">
defineProps<{
  modelValue: string
  tabs: { id: string; label: string; icon?: any }[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', id: string): void
}>()
</script>

<template>
  <div class="flex items-center h-7 bg-ui-header border-b border-ui-borderSubtle px-1 gap-0.5 select-none font-mono text-xs">
    <button 
      v-for="tab in tabs" 
      :key="tab.id"
      type="button"
      @click="emit('update:modelValue', tab.id)"
      class="h-6 px-2.5 flex items-center gap-1.5 rounded-xs transition text-[11px] font-medium"
      :class="modelValue === tab.id 
        ? 'bg-ui-panel text-ui-textPrimary font-bold border-b border-ui-accent shadow-xs' 
        : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
    >
      <component v-if="tab.icon" :is="tab.icon" class="w-3 h-3" />
      <span>{{ tab.label }}</span>
    </button>
  </div>
</template>
