<script setup lang="ts">
import { computed } from 'vue'
import { useToolStore } from '../../stores/toolStore'
import { useProjectStore } from '../../stores/projectStore'
import { useAnimationStore } from '../../stores/animationStore'
import { MODEL_PROFILES, validateMeshAgainstProfile } from '../../core/profiles/ModelProfiles'
import BlenderIcon from '../icons/BlenderIcon.vue'
import { Layers, Grid, AlertTriangle } from 'lucide-vue-next'

const toolStore = useToolStore()
const projectStore = useProjectStore()
const animationStore = useAnimationStore()

const activeProfile = computed(() => {
  return MODEL_PROFILES.find(p => p.id === toolStore.activeProfileId) || MODEL_PROFILES[0]
})

const profileIssues = computed(() => {
  const texSize = projectStore.activeTexture?.width || 64
  return validateMeshAgainstProfile(projectStore.activeMesh, activeProfile.value, texSize)
})

const contextualHints = computed(() => {
  if (toolStore.appMode === 'model') {
    if (toolStore.selectMode === 'vertex') {
      return 'LMB: Select Vert | Shift: Add | Alt: Linked | G/R/S | M: Merge | Del: Delete'
    } else if (toolStore.selectMode === 'edge') {
      return 'LMB: Select Edge | Shift: Add | Alt: Loop | Ctrl+Alt: Ring | G/R/S | Ctrl+R: Loop Cut'
    } else if (toolStore.selectMode === 'face') {
      return 'LMB: Select Face | Shift: Add | Alt: Linked | G/R/S | E: Extrude | I: Inset | Del: Delete'
    } else if (toolStore.selectMode === 'origin') {
      return 'LMB: Move Pivot Point | G: Move Origin | Esc: Finish Pivot'
    }
    return 'LMB: Select Object | G: Move | R: Rotate | S: Scale | Shift+A: Add | Tab: Edit Mode'
  } else if (toolStore.appMode === 'blockout') {
    return 'Drag the bars to resize panes · Drag ref to place · Alt-drag pane photo · F: Draw'
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
    <div class="flex items-center space-x-2 truncate max-w-[45%]">
      <span class="font-semibold text-[10px] uppercase text-ui-textSecondary shrink-0">{{ toolStore.appMode }}:</span>
      <span class="text-ui-textMuted truncate text-[10px] font-mono">{{ contextualHints }}</span>
    </div>

    <!-- Right: Scene Statistics, Active Profile, Snap & Mode -->
    <div class="flex items-center space-x-2.5 shrink-0 text-[10px]">
      <!-- Profile Selector & Budget Alerts -->
      <div class="flex items-center space-x-1 border-r border-ui-borderSubtle pr-2.5">
        <select 
          v-model="toolStore.activeProfileId" 
          class="bg-ui-input border border-ui-borderSubtle rounded-xs px-1.5 py-0.2 text-[9.5px] font-mono text-amber-300 focus:outline-none"
          title="Target Engine & Hardware Profile"
        >
          <option v-for="p in MODEL_PROFILES" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>

        <span 
          v-if="profileIssues.length > 0" 
          class="flex items-center gap-0.5 text-[9.5px] font-mono text-amber-400 font-bold px-1 rounded bg-amber-500/15 border border-amber-500/40 cursor-help"
          :title="profileIssues.map(i => i.message).join('\n')"
        >
          <AlertTriangle class="w-3 h-3 text-amber-400" />
          <span>{{ profileIssues.length }}</span>
        </span>
      </div>

      <!-- Stats (Tris, Verts, Faces) with Tabular Numerals -->
      <div class="flex items-center space-x-2 border-r border-ui-borderSubtle pr-2.5">
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
      <div class="flex items-center space-x-1 border-r border-ui-borderSubtle pr-2.5">
        <Layers class="w-3 h-3 text-ui-textMuted" />
        <span class="text-ui-textMuted"><span class="text-ui-textPrimary font-mono tabular-nums font-medium">{{ projectStore.meshes.length }}</span> Obj</span>
      </div>

      <!-- Grid Snap Status -->
      <div class="flex items-center space-x-1 border-r border-ui-borderSubtle pr-2.5">
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
