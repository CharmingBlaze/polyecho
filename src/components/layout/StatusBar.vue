<script setup lang="ts">
import { computed } from 'vue'
import { useToolStore } from '../../stores/toolStore'
import { useProjectStore } from '../../stores/projectStore'
import { useAnimationStore } from '../../stores/animationStore'
import BlenderIcon from '../icons/BlenderIcon.vue'
import { Layers, Grid } from 'lucide-vue-next'

const toolStore = useToolStore()
const projectStore = useProjectStore()
const animationStore = useAnimationStore()

const contextualHints = computed(() => {
  if (toolStore.appMode === 'model') {
    if (toolStore.selectMode === 'vertex') {
      return 'LMB: Select Vert | Shift+LMB: Multi-Select | G: Move | M: Merge | J: Connect | Del: Delete'
    } else if (toolStore.selectMode === 'edge') {
      return 'LMB: Select Edge | Shift+LMB: Multi-Select | G: Move | Ctrl+R: Loop Cut | Ctrl+B: Bevel | Alt+LMB: Loop'
    } else if (toolStore.selectMode === 'face') {
      return 'LMB: Select Face | Shift+LMB: Multi-Select | E: Extrude | I: Inset | F: Fill | Del: Delete'
    } else if (toolStore.selectMode === 'origin') {
      return 'LMB: Move Pivot Point | G: Move Origin | Esc: Finish Pivot'
    }
    return 'LMB: Select Object | G: Move | R: Rotate | S: Scale | Shift+A: Add | Tab: Edit Mode'
  } else if (toolStore.appMode === 'uvpaint') {
    return 'LMB: Paint Pixel | RMB: Sample/Secondary | Space+Drag: Pan UV | Wheel: Zoom UV'
  } else if (toolStore.appMode === 'rig') {
    return 'LMB: Select Bone | E: Extrude Bone | R: Rotate Joint | Parent: 100% Rigid Influence'
  } else if (toolStore.appMode === 'animate') {
    return 'Space: Play/Pause | K: Add Keyframe | Shift+D: Duplicate Key | Auto Key: ' + (animationStore.autoKey ? 'ON' : 'OFF')
  }
  return 'LMB: Select | RMB: Context Menu'
})
</script>

<template>
  <footer class="h-6 bg-ui-header border-t border-ui-borderSubtle px-2.5 flex items-center justify-between text-[11px] font-sans text-ui-textMuted select-none shrink-0 z-30">
    <!-- Left: Contextual Shortcut Hints -->
    <div class="flex items-center space-x-2 truncate max-w-[55%]">
      <span class="font-semibold text-[10px] uppercase text-ui-textSecondary shrink-0">{{ toolStore.appMode }}:</span>
      <span class="text-ui-textMuted truncate text-[10px] font-mono">{{ contextualHints }}</span>
    </div>

    <!-- Right: Scene Statistics, Active Selection, Snap & Mode -->
    <div class="flex items-center space-x-3 shrink-0 text-[10px]">
      <!-- Stats (Tris, Verts, Faces) with Tabular Numerals -->
      <div class="flex items-center space-x-2 border-r border-ui-borderSubtle pr-3">
        <span class="text-ui-textMuted">Tris <span class="text-ui-textPrimary font-mono tabular-nums font-medium">{{ projectStore.stats?.tris ?? 0 }}</span></span>
        <span class="text-ui-textMuted">Verts <span class="text-ui-textPrimary font-mono tabular-nums font-medium">{{ projectStore.stats?.verts ?? 0 }}</span></span>
        <span class="text-ui-textMuted">Faces <span class="text-ui-textPrimary font-mono tabular-nums font-medium">{{ projectStore.stats?.faces ?? 0 }}</span></span>
        <span v-if="(projectStore.stats?.selectedVerts ?? 0) > 0" class="text-ui-textAccent font-mono tabular-nums">
          Sel: {{ projectStore.stats?.selectedVerts }}v
        </span>
        <span v-else-if="(projectStore.stats?.selectedFaces ?? 0) > 0" class="text-ui-textAccent font-mono tabular-nums">
          Sel: {{ projectStore.stats?.selectedFaces }}f
        </span>
      </div>

      <!-- Objects count -->
      <div class="flex items-center space-x-1 border-r border-ui-borderSubtle pr-3">
        <Layers class="w-3 h-3 text-ui-textMuted" />
        <span class="text-ui-textMuted"><span class="text-ui-textPrimary font-mono tabular-nums font-medium">{{ projectStore.meshes.length }}</span> Obj</span>
      </div>

      <!-- Grid Snap Status -->
      <div class="flex items-center space-x-1 border-r border-ui-borderSubtle pr-3">
        <Grid class="w-3 h-3" :class="toolStore.snapping.grid ? 'text-ui-textAccent' : 'text-ui-textMuted'" />
        <span :class="toolStore.snapping.grid ? 'text-ui-textSecondary font-medium font-mono tabular-nums' : 'text-ui-textMuted font-mono'">
          {{ toolStore.snapping.grid ? 'Snap: 0.1m' : 'Snap: Off' }}
        </span>
      </div>

      <!-- Active Mode Badge -->
      <div class="flex items-center space-x-1 px-1.5 py-0.2 bg-ui-input border border-ui-borderSubtle rounded-xs text-[9px] font-medium text-ui-textSecondary uppercase">
        <BlenderIcon name="mesh-cube" :size="10" />
        <span>{{ toolStore.appMode }} / {{ toolStore.selectMode }}</span>
      </div>
    </div>
  </footer>
</template>
