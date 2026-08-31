<script setup lang="ts">
import { ref, watch } from 'vue'
import { ChevronRight, ChevronDown } from 'lucide-vue-next'

const props = withDefaults(defineProps<{
  title: string
  defaultOpen?: boolean
  isOpen?: boolean
  collapsible?: boolean
  badge?: string | number
}>(), {
  defaultOpen: true,
  isOpen: undefined,
  collapsible: true,
  badge: undefined
})

const emit = defineEmits<{
  (e: 'update:isOpen', val: boolean): void
  (e: 'toggle', val: boolean): void
}>()

const localIsOpen = ref(props.isOpen !== undefined ? props.isOpen : props.defaultOpen)

watch(() => props.isOpen, (val) => {
  if (val !== undefined) {
    localIsOpen.value = val
  }
})

watch(() => props.defaultOpen, (val) => {
  if (props.isOpen === undefined) {
    localIsOpen.value = val
  }
})

function toggle() {
  if (props.collapsible) {
    localIsOpen.value = !localIsOpen.value
    emit('update:isOpen', localIsOpen.value)
    emit('toggle', localIsOpen.value)
  }
}
</script>

<template>
  <div class="border-b border-ui-borderSubtle">
    <!-- Section Header -->
    <div 
      class="h-6.5 bg-ui-header hover:bg-ui-hover px-2 flex items-center justify-between text-xs select-none cursor-pointer transition"
      @click="toggle"
    >
      <div class="flex items-center space-x-1.5 truncate">
        <component 
          v-if="collapsible"
          :is="localIsOpen ? ChevronDown : ChevronRight" 
          class="w-3 h-3 text-ui-textMuted shrink-0 transition-transform" 
        />
        <span class="font-sans font-semibold text-[11px] text-ui-textSecondary truncate">
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
    <div v-show="localIsOpen" class="p-2 space-y-2 bg-ui-panel text-xs">
      <slot />
    </div>
  </div>
</template>
