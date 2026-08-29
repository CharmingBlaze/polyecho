<script setup lang="ts">
defineProps<{
  modelValue: string | number
  options: { label: string; value: string | number }[]
  disabled?: boolean
  label?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: string | number): void
  (e: 'change', val: string | number): void
}>()

function handleChange(event: Event) {
  const val = (event.target as HTMLSelectElement).value
  emit('update:modelValue', val)
  emit('change', val)
}
</script>

<template>
  <div class="flex items-center space-x-1.5 w-full">
    <span v-if="label" class="text-[10px] font-mono text-ui-textSecondary shrink-0">{{ label }}</span>
    <select 
      :value="modelValue"
      :disabled="disabled"
      @change="handleChange"
      class="h-6 w-full bg-ui-input border border-ui-borderDefault hover:border-ui-borderStrong focus:border-ui-accent rounded-xs px-2 text-xs font-mono text-ui-textPrimary focus:outline-none transition disabled:opacity-40 select-none cursor-pointer"
    >
      <option 
        v-for="opt in options" 
        :key="opt.value" 
        :value="opt.value"
        class="bg-ui-panel text-ui-textPrimary"
      >
        {{ opt.label }}
      </option>
    </select>
  </div>
</template>
