<script setup lang="ts">
import { ref } from 'vue'
import { ChevronRight, ChevronDown } from 'lucide-vue-next'

const props = withDefaults(defineProps<{
  title: string
  defaultOpen?: boolean
  collapsible?: boolean
  badge?: string | number
}>(), {
  defaultOpen: true,
  collapsible: true,
  badge: undefined
})

const isOpen = ref(props.defaultOpen)

function toggle() {
  if (props.collapsible) {
    isOpen.value = !isOpen.value
  }
}
</script>

<template>
  <div class="border-b border-ui-borderSubtle">
    <!-- Section Header -->
    <div 
      class="h-7 bg-ui-header/80 hover:bg-ui-hover px-2 flex items-center justify-between text-xs font-mono select-none cursor-pointer transition"
      @click="toggle"
    >
      <div class="flex items-center space-x-1.5 truncate">
        <component 
          v-if="collapsible"
          :is="isOpen ? ChevronDown : ChevronRight" 
          class="w-3 h-3 text-ui-textMuted shrink-0" 
        />
        <span class="font-bold text-[11px] uppercase tracking-wider text-ui-textSecondary truncate">
          {{ title }}
        </span>
      </div>

      <div class="flex items-center space-x-1.5 shrink-0" @click.stop>
        <span v-if="badge !== undefined" class="text-[9px] font-mono px-1 py-0.2 rounded-xs bg-ui-surface text-ui-textMuted border border-ui-borderSubtle">
          {{ badge }}
        </span>
        <slot name="actions" />
      </div>
    </div>

    <!-- Section Body -->
    <div v-show="isOpen" class="p-2 space-y-2 bg-ui-panel text-xs">
      <slot />
    </div>
  </div>
</template>
