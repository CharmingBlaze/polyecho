<script setup lang="ts">
/** UV / Paint workspace tab router. Pixel math lives in `src/core/painting/PixelCanvas.ts`. */
import { computed, onUnmounted, ref, watch } from 'vue'
import UVEditor, { forgetUvViewForNextOpen } from './UVEditor.vue'
import PixelEditor from './PixelEditor.vue'
import { useToolStore } from '../../stores/toolStore'
import { useProjectStore } from '../../stores/projectStore'
import BlenderIcon from '../icons/BlenderIcon.vue'

const toolStore = useToolStore()
const projectStore = useProjectStore()
const showHelp = ref(false)

onUnmounted(forgetUvViewForNextOpen)

function onShellPointerDown(e: PointerEvent) {
  const target = e.target
  if (!(target instanceof Element)) return
  if (!target.closest('.workspace-help-button') && !target.closest('.workspace-help')) {
    showHelp.value = false
  }
}

const activeTab = computed({
  get: () => toolStore.uvWorkspaceTab === 'uv' ? 'uv' : 'paint',
  set: (val: 'uv' | 'paint') => {
    toolStore.uvWorkspaceTab = val
  }
})

watch(
  () => toolStore.uvWorkspaceTab,
  (tab) => {
    if (tab === 'paint') toolStore.setPaintTool('brush')
  },
  { immediate: true }
)
</script>

<template>
  <div class="uv-paint-shell h-full w-full bg-ui-panel flex flex-col select-none relative z-[100] font-mono text-xs" @pointerdown="onShellPointerDown">
    <div
      class="uv-paint-tabs bg-ui-header border-b border-ui-borderSubtle px-2 flex items-center gap-2 shrink-0 relative overflow-visible h-8.5 min-h-[34px]"
    >
      <div role="group" aria-label="UV and paint editors" class="inspector-seg shrink-0">
        <button
          type="button"
          class="inspector-seg-btn"
          :class="{ 'is-active': activeTab === 'uv' }"
          title="UV Layout"
          aria-label="UV Layout"
          :aria-pressed="activeTab === 'uv'"
          @click="activeTab = 'uv'"
        >
          <BlenderIcon name="uv" :size="14" />
        </button>
        <button
          type="button"
          class="inspector-seg-btn"
          :class="{ 'is-active': activeTab === 'paint' }"
          title="Paint Texture"
          aria-label="Paint Texture"
          :aria-pressed="activeTab === 'paint'"
          @click="activeTab = 'paint'"
        >
          <BlenderIcon name="brush" :size="14" />
        </button>
      </div>
      <div id="uv-paint-command-slot" class="uv-paint-command-slot flex items-center min-w-0" />
      <div class="flex items-center gap-1.5 shrink-0 ml-auto">
        <div class="px-2 py-0.5 rounded-xs bg-ui-input border border-ui-borderSubtle text-[10px] font-mono text-ui-textMuted flex items-center gap-1">
          <span class="uv-paint-resolution-label text-[9px] text-ui-textMuted font-bold">RES:</span>
          <span class="inspector-value font-bold">{{ projectStore.pixelBuffer.width }}×{{ projectStore.pixelBuffer.height }}</span>
        </div>
      </div>
      <button class="workspace-help-button" :aria-expanded="showHelp" @click="showHelp = !showHelp" title="Workspace shortcuts">?</button>
      <div v-if="showHelp" class="workspace-help" @keydown.esc="showHelp = false">
        <div class="flex items-center justify-between mb-2"><strong>{{ activeTab === 'uv' ? 'UV Editor' : 'Pixel Paint' }} shortcuts</strong><button @click="showHelp = false" aria-label="Close shortcuts">×</button></div>
        <template v-if="activeTab === 'uv'">
          <p><kbd>1–4</kbd> Vertex / edge / face / island</p>
          <p><kbd>A</kbd> Select all <kbd>Alt+A</kbd> Deselect</p>
          <p><kbd>F</kbd> Frame selection <kbd>U</kbd> Smart UV</p>
          <p><kbd>P</kbd> Pin <kbd>V</kbd> Stitch</p>
        </template>
        <template v-else>
          <p><kbd>B</kbd> Brush <kbd>E</kbd> Eraser <kbd>I</kbd> Pick color</p>
          <p><kbd>G</kbd> Fill <kbd>L</kbd> Line <kbd>H</kbd> Shade</p>
          <p><kbd>[ / ]</kbd> Brush size <kbd>Shift</kbd>-drag or pen side button resizes</p>
          <p><kbd>Alt</kbd>-wheel steps size <kbd>X</kbd> Swap colors</p>
          <p><kbd>Ctrl-click</kbd> Secondary color</p>
          <p><kbd>M</kbd> Marquee <kbd>Ctrl D</kbd> Deselect</p>
          <p><kbd>Ctrl C / V</kbd> Copy / paste pixels as layer</p>
          <p><kbd>Arrows</kbd> Move selection <kbd>Del</kbd> Clear</p>
        </template>
        <p><kbd>Space-drag</kbd> Pan <kbd>Wheel</kbd> Zoom</p>
      </div>
    </div>

    <div
      v-if="!projectStore.activeMesh"
      class="shrink-0 px-3 py-1.5 text-[11px] leading-snug text-ui-textSecondary bg-ui-header border-b border-ui-borderSubtle flex items-center justify-between gap-3"
    >
      <span>Select a mesh in Modeling, then unwrap or paint it here.</span>
      <button
        type="button"
        class="shrink-0 px-2 py-0.5 rounded-xs bg-ui-active border border-ui-borderSubtle text-ui-textAccent hover:bg-ui-hover"
        @click="toolStore.setAppMode('model')"
      >Go to Modeling</button>
    </div>

    <div class="flex-1 min-h-0 min-w-0 flex">
      <div class="flex-1 min-h-0 min-w-0">
        <UVEditor v-show="activeTab === 'uv'" key="uv-editor" />
        <PixelEditor v-show="activeTab === 'paint'" key="pixel-editor" />
      </div>
      <div id="paint-layers-host" class="contents" />
    </div>
  </div>
</template>

<style>
.uv-paint-shell { container-type: inline-size; }

/* UV and Paint editors each form a stacking context (container-type), and the
   canvas chrome inside them (view controls, layers) paints after this bar.
   The bar has to be its own context above that chrome so portaled menus,
   which hang out of the bar, stay on top in both workspaces. */
.uv-paint-tabs {
  position: relative;
  z-index: 200;
}
.uv-paint-command-slot .header-dropdown-menu {
  z-index: 1;
  overflow: visible;
}

@container (max-width: 760px) {
  .uv-paint-tabs { gap: 4px !important; padding-left: 4px !important; padding-right: 4px !important; }
  .uv-paint-resolution-label,
  .uv-paint-color-label,
  .uv-paint-color-hex,
  .uv-paint-size-label { display: none; }
}
</style>

<style>
.uv-paint-shell { font-family: var(--font-sans, sans-serif); overflow: visible; }
.uv-paint-shell .uv-paint-tabs {
  flex-wrap: nowrap;
  height: 34px !important;
  min-height: 34px !important;
  padding: 4px 8px;
  gap: 6px !important;
  align-items: center;
  overflow: visible !important;
}
</style>

<style>
.uv-paint-tabs { min-height: 34px !important; height: 34px !important; position: relative; z-index: 200; }
.uv-paint-command-slot {
  order: 0;
  flex: 1 1 auto;
  min-width: 0;
  overflow: visible;
  padding-top: 0;
  border-top: none;
}
.uv-paint-command-slot > div { display: flex; flex-wrap: nowrap; gap: 4px; width: max-content; min-height: 28px; }
.uv-paint-shell button:focus-visible, .uv-paint-shell input:focus-visible, .uv-paint-shell select:focus-visible { outline: 2px solid var(--ui-text-accent); outline-offset: 2px; }
.uv-paint-shell button:disabled { opacity: .35; cursor: default; }
.workspace-help-button { width: 24px; height: 24px; border: 1px solid var(--ui-border-subtle); border-radius: 3px; color: var(--ui-text-secondary); }
.workspace-help-button:hover { background: var(--ui-bg-hover); color: var(--ui-text-primary); }
.workspace-help { position: absolute; top: 38px; right: 8px; width: 290px; padding: 14px; z-index: 400; border: 1px solid var(--ui-border-strong); border-radius: 4px; background: var(--ui-bg-panel); box-shadow: 0 8px 28px #0008; color: var(--ui-text-secondary); font-size: 11px; }
.workspace-help p { margin: 9px 0; }
.workspace-help kbd { color: var(--ui-text-primary); background: var(--ui-bg-input); border: 1px solid var(--ui-border-subtle); padding: 2px 4px; border-radius: 3px; }
</style>

<style>
@container (min-width: 860px) {
  .uv-paint-tabs { gap: 6px !important; }
  .uv-paint-tabs .uv-paint-color-label, .uv-paint-tabs .uv-paint-resolution-label { display: none; }
}
</style>
