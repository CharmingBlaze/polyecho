<script setup lang="ts">
import { computed } from 'vue'
import { useToolStore } from '../../stores/toolStore'
import { useProjectStore } from '../../stores/projectStore'
import { useLayoutStore } from '../../stores/layoutStore'
import UiSection from '../ui/UiSection.vue'
import UiButton from '../ui/UiButton.vue'
import BlenderIcon from '../icons/BlenderIcon.vue'

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
    <div class="inspector-head">
      <div class="inspector-head-kicker">
        <BlenderIcon name="uv" :size="12" />
        <span>UV / Paint</span>
      </div>
      <span class="inspector-head-name">{{ projectStore.activeMesh?.name || 'No object' }}</span>
    </div>

    <div v-if="!projectStore.activeMesh" class="p-3 space-y-2 border-b border-ui-borderSubtle">
      <p class="text-[11px] leading-relaxed text-ui-textSecondary">Select a mesh in Modeling first, then unwrap or paint it here.</p>
      <UiButton size="xs" class="w-full" variant="accent" @click="toolStore.setAppMode('model')">Go to Modeling</UiButton>
    </div>

    <UiSection title="Workspace" blender-icon="uv" :default-open="true">
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

    <UiSection v-if="toolStore.uvWorkspaceTab === 'uv'" title="Unwrap" blender-icon="uv-smart" :default-open="true">
      <p class="text-[10px] text-ui-textMuted">Uses selected faces, or the whole mesh when nothing is selected.</p>
      <label class="flex items-center justify-between gap-2">Cut angle
        <input type="number" min="1" max="180" :value="toolStore.smartUvAngle"
          @change="toolStore.smartUvAngle = Math.max(1, Math.min(180, Number(($event.target as HTMLInputElement).value) || 66))"
          class="w-16 bg-ui-input rounded-xs px-2 py-1" aria-label="Smart UV cut angle" />
      </label>
      <label class="flex items-center justify-between gap-2">Margin (px)
        <input type="number" min="0" max="64" :value="toolStore.smartUvMargin"
          @change="toolStore.smartUvMargin = Math.max(0, Math.min(64, Number(($event.target as HTMLInputElement).value) || 0))"
          class="w-16 bg-ui-input rounded-xs px-2 py-1" aria-label="UV island margin in pixels" />
      </label>
      <div class="grid grid-cols-2 gap-1">
        <UiButton size="xs" class="col-span-2" :disabled="!projectStore.activeMesh" @click="projectStore.performSmartUvProject({
          angleLimitDegrees: toolStore.smartUvAngle,
          marginPixels: toolStore.smartUvMargin
        })">Smart UV Project</UiButton>
        <UiButton size="xs" :disabled="!projectStore.activeMesh" @click="projectStore.markSelectedEdgesAsSeam()" title="Selected edges, or the border of selected faces / islands">Mark seam</UiButton>
        <UiButton size="xs" :disabled="!projectStore.activeMesh" @click="projectStore.clearSelectedEdgesSeam()" title="Selected edges, or the border of selected faces / islands">Clear seam</UiButton>
        <UiButton size="xs" :disabled="!projectStore.activeMesh" @click="projectStore.performSeamUnwrap()">Seam unwrap</UiButton>
        <UiButton size="xs" :disabled="!projectStore.activeMesh" @click="projectStore.performBoxUnwrap()">Box project</UiButton>
        <UiButton size="xs" class="col-span-2" :disabled="!projectStore.activeMesh" @click="projectStore.performPackUVIslands(toolStore.smartUvMargin)">Pack islands</UiButton>
      </div>
    </UiSection>

    <UiSection v-if="toolStore.uvWorkspaceTab === 'uv'" title="Atlas" blender-icon="grid" :badge="atlasGrid ? `${atlasGrid.cols}×${atlasGrid.rows}` : undefined" :default-open="true">
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

    <UiSection v-if="toolStore.uvWorkspaceTab === 'paint'" title="Brush" blender-icon="brush" :default-open="true">
      <div class="flex items-center justify-between">
        <span class="capitalize inspector-value">{{ toolStore.paintTool }}</span>
        <span class="text-ui-textMuted">[ / ] resize</span>
      </div>
      <label class="flex items-center justify-between gap-2">Size (px)
        <input type="number" min="1" max="128" :value="toolStore.brushSize"
          @change="toolStore.brushSize = Math.max(1, Math.min(128, Math.round(Number(($event.target as HTMLInputElement).value) || 1)))"
          class="w-16 bg-ui-input rounded-xs px-2 py-1" aria-label="Brush size in pixels" />
      </label>
      <label class="flex items-center justify-between gap-2">Opacity
        <span>{{ Math.round(toolStore.brushOpacity * 100) }}%</span>
      </label>
      <input type="range" min="0" max="1" step="0.01" v-model.number="toolStore.brushOpacity" class="inspector-range" aria-label="Brush opacity" />
      <div class="inspector-seg is-stretch">
        <button type="button" class="inspector-seg-btn" :class="{ 'is-active': toolStore.brushShape === 'square' }" @click="toolStore.brushShape = 'square'">Square</button>
        <button type="button" class="inspector-seg-btn" :class="{ 'is-active': toolStore.brushShape === 'circle' }" @click="toolStore.brushShape = 'circle'">Round</button>
      </div>
      <label class="flex items-center justify-between">Foreground
        <input type="color" v-model="toolStore.primaryColor" class="w-10 h-6 bg-transparent cursor-pointer" aria-label="Foreground paint color" />
      </label>
      <label class="flex items-center justify-between">Pen pressure
        <input type="checkbox" v-model="toolStore.stylusPressureEnabled" />
      </label>
      <p class="text-[10px] text-ui-textMuted leading-relaxed">Ctrl-click paints the secondary color. Space-drag pans. Use the wheel to zoom.</p>
    </UiSection>

    <UiSection title="Viewport" blender-icon="eye-open" :default-open="true">
      <label class="flex items-center justify-between text-[10px] cursor-pointer bg-ui-surface px-2 py-1 rounded-xs border border-ui-borderSubtle">
        <span>X-Ray</span>
        <input type="checkbox" v-model="toolStore.viewport.xray" class="accent-ui-accent" />
      </label>
      <label class="flex items-center justify-between text-[10px] cursor-pointer bg-ui-surface px-2 py-1 rounded-xs border border-ui-borderSubtle">
        <span>Palette snap</span>
        <input type="checkbox" v-model="toolStore.paletteSnapEnabled" class="accent-ui-accent" />
      </label>
    </UiSection>

    <UiSection title="Paint target" blender-icon="texture" :default-open="true">
      <div class="text-[11px] font-mono text-ui-textPrimary truncate">
        {{ paintTarget?.name || 'None' }}
        <span v-if="paintTarget" class="text-ui-textMuted"> {{ paintTarget.width }}×{{ paintTarget.height }}</span>
      </div>
      <p class="text-[9px] text-ui-textMuted leading-snug">Library image 2D/3D paint writes to. Bind it on Texture.</p>
      <UiButton size="xs" class="w-full" @click="layoutStore.setInspectorTab('texture', toolStore.appMode)">
        <BlenderIcon name="texture" :size="12" />
        Texture
      </UiButton>
    </UiSection>

    <UiSection title="Shading" blender-icon="material" :default-open="false">
      <div class="text-[11px] font-mono text-ui-textPrimary truncate">{{ meshMaterial?.name || 'No material' }}</div>
      <UiButton size="xs" class="w-full" @click="layoutStore.setInspectorTab('material', toolStore.appMode)">
        <BlenderIcon name="material" :size="12" />
        Material
      </UiButton>
    </UiSection>
  </div>
</template>
