<script setup lang="ts">
import { ref, watch } from 'vue'
import BlenderIcon from '../icons/BlenderIcon.vue'

const props = withDefaults(defineProps<{
  title: string
  defaultOpen?: boolean
  isOpen?: boolean
  collapsible?: boolean
  badge?: string | number
  hint?: string
  icon?: any
  blenderIcon?: string
}>(), {
  defaultOpen: true,
  isOpen: undefined,
  collapsible: true,
  badge: undefined,
  hint: undefined,
  icon: undefined
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
    <div
      class="h-7 px-2.5 flex items-center justify-between text-xs select-none cursor-pointer transition-colors hover:bg-ui-hover"
      @click="toggle"
    >
      <div class="flex items-center gap-1.5 truncate min-w-0">
        <BlenderIcon
          v-if="collapsible"
          :name="localIsOpen ? 'chevron-down' : 'chevron-right'"
          :size="11"
          class="text-ui-textMuted shrink-0"
        />
        <BlenderIcon v-if="blenderIcon" :name="blenderIcon as any" :size="12" class="text-ui-textMuted shrink-0" />
        <component v-else-if="icon" :is="icon" class="w-3 h-3 text-ui-textMuted shrink-0" />
        <span
          class="font-sans font-semibold text-[11px] truncate"
          :class="localIsOpen ? 'text-ui-textPrimary' : 'text-ui-textSecondary'"
        >
          {{ title }}
        </span>
        <span v-if="hint" class="font-mono text-[9px] text-ui-textMuted truncate">{{ hint }}</span>
      </div>

      <div class="flex items-center gap-1.5 shrink-0" @click.stop>
        <span
          v-if="badge !== undefined"
          class="text-[9px] font-mono px-1 rounded-xs text-ui-textMuted tabular-nums"
        >
          {{ badge }}
        </span>
        <slot name="actions" />
      </div>
    </div>

    <div v-show="localIsOpen" class="px-2.5 pb-2.5 pt-1 space-y-1.5 bg-ui-panel text-xs">
      <slot />
    </div>
  </div>
</template>
