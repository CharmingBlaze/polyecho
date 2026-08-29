<script setup lang="ts">
import { 
  ContextMenuRoot, 
  ContextMenuTrigger, 
  ContextMenuPortal, 
  ContextMenuContent, 
  ContextMenuItem, 
  ContextMenuSeparator 
} from 'reka-ui'

export interface ContextMenuItemDef {
  label: string
  shortcut?: string
  icon?: any
  danger?: boolean
  separator?: boolean
  disabled?: boolean
  action?: () => void
}

defineProps<{
  items: ContextMenuItemDef[]
}>()
</script>

<template>
  <ContextMenuRoot>
    <ContextMenuTrigger as-child>
      <slot />
    </ContextMenuTrigger>
    <ContextMenuPortal>
      <ContextMenuContent class="z-50 min-w-44 bg-ui-header border border-ui-borderStrong rounded-xs py-1 shadow-2xl text-xs font-mono text-ui-textPrimary animate-in fade-in zoom-in-95 duration-75 select-none">
        <template v-for="(item, idx) in items" :key="idx">
          <ContextMenuSeparator v-if="item.separator" class="h-px bg-ui-borderSubtle my-1" />
          <ContextMenuItem 
            v-else
            :disabled="item.disabled"
            @select="item.action?.()"
            class="px-2.5 py-1.5 flex items-center justify-between hover:bg-ui-hover focus:bg-ui-hover focus:outline-none cursor-pointer text-[11px] disabled:opacity-40 disabled:pointer-events-none transition"
            :class="{ 'text-rose-400 hover:text-rose-300': item.danger }"
          >
            <div class="flex items-center space-x-2">
              <component v-if="item.icon" :is="item.icon" class="w-3.5 h-3.5" />
              <span>{{ item.label }}</span>
            </div>
            <span v-if="item.shortcut" class="text-ui-textMuted text-[10px] font-mono ml-4">
              {{ item.shortcut }}
            </span>
          </ContextMenuItem>
        </template>
      </ContextMenuContent>
    </ContextMenuPortal>
  </ContextMenuRoot>
</template>
