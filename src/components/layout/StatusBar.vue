<script setup lang="ts">
import { computed } from 'vue'
import { useToolStore } from '../../stores/toolStore'
import { useProjectStore } from '../../stores/projectStore'
import { useAnimationStore } from '../../stores/animationStore'
import { useRuntimeStore } from '../../stores/runtimeStore'
import { MODEL_PROFILES, validateMeshAgainstProfile } from '../../core/profiles/ModelProfiles'
import { isDesktopApp, revealCrashLog } from '../../core/desktop/desktopApi'
import BlenderIcon from '../icons/BlenderIcon.vue'

const toolStore = useToolStore()
const projectStore = useProjectStore()
const animationStore = useAnimationStore()
const runtimeStore = useRuntimeStore()

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
      return 'LMB: Select Vert | Drag: Orbit | RMB: Pan | Shift: Add | Alt: Linked | G/R/S | M: Merge | Del: Delete'
    } else if (toolStore.selectMode === 'edge') {
      return 'LMB: Select Edge | Drag: Orbit | RMB: Pan | Shift: Add | Alt: Loop | Ctrl+Alt: Ring | G/R/S | Ctrl+R: Loop Cut'
    } else if (toolStore.selectMode === 'face') {
      return 'LMB: Select Face | Drag: Orbit | RMB: Pan | Shift: Add | Alt: Linked | G/R/S | E: Extrude | I: Inset | Del: Delete'
    } else if (toolStore.selectMode === 'origin') {
      return 'LMB: Move Pivot Point | RMB: Pan | G: Move Origin | Esc: Finish Pivot'
    }
    return 'LMB: Select Object | Drag: Orbit | RMB: Pan | G: Move | R: Rotate | S: Scale | Shift+A: Add | Tab: Edit Mode'
  } else if (toolStore.appMode === 'blockout') {
    return 'RMB: Pan view · Drag bars to resize · F: Poly Draw · V: Poly Build (new or old verts, close the loop)'
  } else if (toolStore.appMode === 'uvpaint') {
    if (toolStore.uvWorkspaceTab === 'uv') {
      return 'U: Smart UV | Ctrl+Shift+E: Mark seam | 1/2/3/4: Vertex/Edge/Face/Island | A: Select all | P: Pin | V: Stitch | F: Frame | RMB/Space: Pan'
    }
    return 'LMB: Paint | Ctrl+LMB: Secondary | RMB: Pan | B/E/G/I: Brush/Eraser/Fill/Picker | Space+Drag: Pan'
  } else if (toolStore.appMode === 'rig') {
    return 'LMB: Select Bone | Drag: Orbit | RMB: Pan | E: Extrude Bone | R: Rotate Joint | Parent: 100% Rigid Influence'
  } else if (toolStore.appMode === 'animate') {
    return 'RMB: Pan (view / timeline / graph) | Space: Play | I/K: Insert key | Shift+D: Duplicate keys | Ctrl+C/V: Copy/paste pose | Auto-key: ' + (animationStore.autoKey ? 'ON' : 'OFF')
  }
  return 'LMB: Select | RMB: Pan view'
})
</script>

<template>
  <footer class="h-6 bg-ui-header border-t border-ui-borderSubtle px-2.5 flex items-center justify-between text-[11px] font-sans text-ui-textMuted select-none shrink-0 z-30">
    <!-- Left: Contextual Shortcut Hints -->
    <div class="flex items-center space-x-2 truncate max-w-[45%]">
      <span class="font-semibold text-[10px] uppercase text-ui-textSecondary shrink-0">{{ toolStore.appMode }}:</span>
      <span class="text-ui-textMuted truncate text-[10px] font-mono">{{ contextualHints }}</span>
      <button
        v-if="runtimeStore.lastError"
        type="button"
        class="ml-2 shrink-0 max-w-[220px] truncate text-[10px] font-mono text-rose-200 bg-rose-500/15 border border-rose-400/40 rounded-xs px-1.5 py-0 hover:bg-rose-500/25"
        :title="(runtimeStore.lastErrorSource ? runtimeStore.lastErrorSource + ': ' : '') + runtimeStore.lastError + ' (click to dismiss)'"
        @click="runtimeStore.dismissError()"
      >
        Crash: {{ runtimeStore.lastError }}
      </button>
      <button
        v-if="runtimeStore.lastError && isDesktopApp()"
        type="button"
        class="shrink-0 text-[10px] font-mono text-rose-200/80 hover:text-rose-100 underline"
        @click="void revealCrashLog()"
      >
        Log
      </button>
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
          <BlenderIcon name="warning" :size="12" />
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
        <BlenderIcon name="layers" :size="12" />
        <span class="text-ui-textMuted"><span class="text-ui-textPrimary font-mono tabular-nums font-medium">{{ projectStore.meshes.length }}</span> Obj</span>
      </div>

      <!-- Grid Snap Status -->
      <div class="flex items-center space-x-1 border-r border-ui-borderSubtle pr-2.5">
        <BlenderIcon name="grid" :size="12" :color="toolStore.snapping.grid ? 'var(--ui-accent)' : 'currentColor'" />
        <span :class="toolStore.snapping.grid ? 'text-ui-textSecondary font-medium font-mono tabular-nums' : 'text-ui-textMuted font-mono'">
          {{ toolStore.snapping.grid ? `Snap: ${toolStore.snapping.gridSize}m` : 'Snap: Off' }}
        </span>
      </div>

      <div
        class="flex items-center px-1.5 py-0.2 bg-ui-input border border-ui-borderSubtle rounded-xs text-[9px] font-medium text-ui-textSecondary uppercase"
        :title="isDesktopApp() ? 'Running as a desktop window' : 'Running in a browser tab'"
      >
        {{ isDesktopApp() ? 'Desktop' : 'Web' }}
      </div>

      <!-- Active Mode Badge -->
      <div class="flex items-center space-x-1 px-1.5 py-0.2 bg-ui-input border border-ui-borderSubtle rounded-xs text-[9px] font-medium text-ui-textSecondary uppercase">
        <BlenderIcon name="mesh-cube" :size="10" />
        <span>{{ toolStore.appMode }} / {{ toolStore.selectMode }}</span>
      </div>
    </div>
  </footer>
</template>
