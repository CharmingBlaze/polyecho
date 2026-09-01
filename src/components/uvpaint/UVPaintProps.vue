<script setup lang="ts">
import { computed } from 'vue'
import { useToolStore } from '../../stores/toolStore'
import { useProjectStore } from '../../stores/projectStore'
import { useLayoutStore } from '../../stores/layoutStore'
import UiSection from '../ui/UiSection.vue'
import UiButton from '../ui/UiButton.vue'
import {
  Image as ImageIcon,
  Palette,
  Scan,
  Layers,
  Eye,
  Scissors,
  Grid
} from 'lucide-vue-next'

const toolStore = useToolStore()
const projectStore = useProjectStore()
const layoutStore = useLayoutStore()

const paintTarget = computed(() => projectStore.activeTexture)
const meshMaterial = computed(() => {
  const id = projectStore.activeMesh?.materialId
  return projectStore.materials.find(m => m.id === id) || null
})
const atlasGrid = computed(() => paintTarget.value?.atlas || null)
const atlasCells = computed(() => {
  const a = atlasGrid.value
  if (!a) return [] as { col: number; row: number }[]
  const cells: { col: number; row: number }[] = []
  for (let row = 0; row < a.rows; row++) {
    for (let col = 0; col < a.cols; col++) cells.push({ col, row })
  }
  return cells
})
</script>

<template>
  <div class="flex flex-col select-none text-xs font-sans">
    <div class="h-7 bg-ui-header border-b border-ui-borderSubtle px-2.5 flex items-center justify-between">
      <div class="flex items-center space-x-1.5">
        <Scan class="w-3 h-3 text-sky-400" />
        <span class="text-[11px] font-medium text-ui-textMuted">UV / Paint</span>
      </div>
      <span class="font-semibold text-ui-textPrimary truncate max-w-[150px]">
        {{ projectStore.activeMesh?.name || 'No object' }}
      </span>
    </div>

    <UiSection title="Workspace" :icon="Scan" :default-open="true">
      <div class="grid grid-cols-2 gap-1">
        <UiButton
          size="xs"
          :variant="toolStore.uvWorkspaceTab === 'uv' ? 'accent' : 'default'"
          @click="toolStore.uvWorkspaceTab = 'uv'"
        >
          UV Editor
        </UiButton>
        <UiButton
          size="xs"
          :variant="toolStore.uvWorkspaceTab === 'paint' ? 'accent' : 'default'"
          @click="toolStore.uvWorkspaceTab = 'paint'"
        >
          Pixel Paint
        </UiButton>
      </div>
    </UiSection>

    <UiSection title="Unwrap" :icon="Scissors" :default-open="true">
      <div class="grid grid-cols-2 gap-1">
        <UiButton size="xs" @click="projectStore.markSelectedEdgesAsSeam()">Mark seam</UiButton>
        <UiButton size="xs" @click="projectStore.clearSelectedEdgesSeam()">Clear seam</UiButton>
        <UiButton size="xs" @click="projectStore.performSeamUnwrap()">Seam unwrap</UiButton>
        <UiButton size="xs" @click="projectStore.generateBoxUVs()">Box project</UiButton>
        <UiButton size="xs" class="col-span-2" @click="projectStore.performPackUVIslands()">Pack islands</UiButton>
      </div>
    </UiSection>

    <UiSection title="Atlas" :icon="Grid" :badge="atlasGrid ? `${atlasGrid.cols}×${atlasGrid.rows}` : undefined" :default-open="true">
      <p class="text-[10px] text-ui-textMuted leading-snug">
        Select faces in the UV editor, then a cell. Grid lives on the Texture tab.
      </p>
      <div v-if="atlasGrid" class="grid gap-0.5" :style="{ gridTemplateColumns: `repeat(${atlasGrid.cols}, minmax(0, 1fr))` }">
        <UiButton
          v-for="cell in atlasCells"
          :key="`${cell.col}-${cell.row}`"
          size="xs"
          @click="projectStore.performMapUVsToAtlasCell(cell.col, cell.row)"
        >
          {{ cell.col + 1 }},{{ cell.row + 1 }}
        </UiButton>
      </div>
      <UiButton v-else size="xs" class="w-full" @click="layoutStore.setInspectorTab('texture', toolStore.appMode)">
        Set atlas grid…
      </UiButton>
    </UiSection>

    <UiSection title="Viewport" :icon="Eye" :default-open="true">
      <label class="flex items-center justify-between text-[10px] cursor-pointer bg-ui-surface px-2 py-1 rounded-xs border border-ui-borderSubtle">
        <span>X-Ray</span>
        <input type="checkbox" v-model="toolStore.viewport.xray" class="accent-amber-500" />
      </label>
      <label class="flex items-center justify-between text-[10px] cursor-pointer bg-ui-surface px-2 py-1 rounded-xs border border-ui-borderSubtle">
        <span>Palette snap</span>
        <input type="checkbox" v-model="toolStore.paletteSnapEnabled" class="accent-emerald-500" />
      </label>
    </UiSection>

    <UiSection title="Paint target" :icon="Layers" :default-open="true">
      <div class="text-[11px] font-mono text-emerald-300 truncate">
        {{ paintTarget?.name || 'None' }}
        <span v-if="paintTarget" class="text-ui-textMuted"> {{ paintTarget.width }}×{{ paintTarget.height }}</span>
      </div>
      <p class="text-[9px] text-ui-textMuted leading-snug">Library image 2D/3D paint writes to. Bind it on Texture.</p>
      <UiButton size="xs" class="w-full" @click="layoutStore.setInspectorTab('texture', toolStore.appMode)">
        <ImageIcon class="w-3 h-3 text-sky-400" />
        Texture
      </UiButton>
    </UiSection>

    <UiSection title="Shading" :icon="Palette" :default-open="false">
      <div class="text-[11px] font-mono text-amber-300 truncate">{{ meshMaterial?.name || 'No material' }}</div>
      <UiButton size="xs" class="w-full" @click="layoutStore.setInspectorTab('material', toolStore.appMode)">
        <Palette class="w-3 h-3 text-amber-400" />
        Material
      </UiButton>
    </UiSection>
  </div>
</template>
