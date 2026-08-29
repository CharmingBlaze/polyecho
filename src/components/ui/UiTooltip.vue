<script setup lang="ts">
import { 
  TooltipProvider, 
  TooltipRoot, 
  TooltipTrigger, 
  TooltipContent, 
  TooltipPortal 
} from 'reka-ui'

withDefaults(defineProps<{
  content: string
  side?: 'top' | 'right' | 'bottom' | 'left'
  delayDuration?: number
}>(), {
  side: 'top',
  delayDuration: 300
})
</script>

<template>
  <TooltipProvider :delay-duration="delayDuration">
    <TooltipRoot>
      <TooltipTrigger as-child>
        <slot />
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent 
          :side="side" 
          :side-offset="4"
          class="z-50 px-2 py-1 bg-ui-header border border-ui-borderStrong rounded-xs text-[10px] font-mono text-ui-textPrimary shadow-xl animate-in fade-in zoom-in-95 duration-75 select-none pointer-events-none"
        >
          {{ content }}
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>
