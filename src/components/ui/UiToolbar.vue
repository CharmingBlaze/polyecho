<script setup lang="ts">
withDefaults(defineProps<{
  orientation?: 'horizontal' | 'vertical'
}>(), {
  orientation: 'horizontal'
})
</script>

<template>
  <div 
    class="flex items-center gap-1 p-1 bg-ui-header border-ui-borderSubtle select-none"
    :class="orientation === 'vertical' ? 'flex-col border-r w-[74px] h-full' : 'h-ui-toolbar border-b w-full'"
  >
    <slot />
  </div>
</template>
