<script setup lang="ts">
interface Props {
  size?: number
  showText?: boolean
}

withDefaults(defineProps<Props>(), {
  size: 17,
  showText: true
})
</script>

<template>
  <div class="flex items-center gap-1.5 select-none transition-all hover:opacity-90">
    <!-- Stylized 3D Low-Poly Echo Prism Emblem -->
    <svg 
      :width="size" 
      :height="size" 
      viewBox="0 0 24 24" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      class="shrink-0 text-ui-textPrimary transition-transform duration-200 group-hover:scale-105"
    >
      <!-- Subtle Echo Wave -->
      <polygon 
        points="12,1.5 22,6.8 22,17.2 12,22.5 2,17.2 2,6.8" 
        stroke="var(--ui-accent, currentColor)" 
        stroke-width="1" 
        stroke-dasharray="2 3"
        opacity="0.35"
      />
      <!-- Top Isometric Facet -->
      <polygon 
        points="12,3.8 19.5,7.8 12,12 4.5,7.8" 
        fill="currentColor" 
        fill-opacity="0.25"
        stroke="currentColor" 
        stroke-width="1.4" 
        stroke-linejoin="round"
      />
      <!-- Left Isometric Facet -->
      <polygon 
        points="4.5,7.8 12,12 12,19.8 4.5,15.8" 
        fill="currentColor" 
        fill-opacity="0.1"
        stroke="currentColor" 
        stroke-width="1.4" 
        stroke-linejoin="round"
      />
      <!-- Right Isometric Facet (Theme Accent Glow) -->
      <polygon 
        points="12,12 19.5,7.8 19.5,15.8 12,19.8" 
        fill="var(--ui-accent, #f59e0b)" 
        fill-opacity="0.35"
        stroke="var(--ui-accent, #f59e0b)" 
        stroke-width="1.4" 
        stroke-linejoin="round"
      />
      <!-- Vertex Nodes -->
      <circle cx="12" cy="3.8" r="1.1" fill="currentColor" />
      <circle cx="19.5" cy="7.8" r="1.1" fill="var(--ui-accent, #f59e0b)" />
      <circle cx="4.5" cy="7.8" r="1.1" fill="currentColor" />
      <circle cx="12" cy="12" r="1.3" fill="var(--ui-accent, #f59e0b)" />
      <circle cx="12" cy="19.8" r="1.1" fill="currentColor" />
    </svg>

    <!-- Clean Modern Typography (No background, high contrast across all themes) -->
    <div v-if="showText" class="flex items-center tracking-tight font-sans text-xs font-bold leading-none">
      <span class="text-ui-textPrimary font-extrabold tracking-wide">POLY</span>
      <span class="text-ui-accent font-black tracking-normal ml-0.5">ECHO</span>
    </div>
  </div>
</template>
