<script setup lang="ts">
/** UV / Paint workspace tab router. Pixel math lives in `src/core/painting/PixelCanvas.ts`. */
import { computed, ref } from 'vue'
import UVEditor from './UVEditor.vue'
import PixelEditor from './PixelEditor.vue'
import { useToolStore } from '../../stores/toolStore'
import { useProjectStore } from '../../stores/projectStore'
import BlenderIcon from '../icons/BlenderIcon.vue'

const toolStore = useToolStore()
const projectStore = useProjectStore()
const showHelp = ref(false)

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
</script>

<template>
  <div class="uv-paint-shell h-full w-full bg-ui-panel flex flex-col select-none relative z-[100] font-mono text-xs" @pointerdown="onShellPointerDown">
    <div class="uv-paint-tabs bg-ui-header border-b border-ui-borderSubtle px-2 flex items-center gap-2 shrink-0 relative isolate z-[200] overflow-visible h-8.5 min-h-[34px]">
      <div role="group" aria-label="UV and paint editors" class="flex items-center bg-ui-input p-0.5 rounded-xs border border-ui-borderSubtle shrink-0">
        <button
          type="button"
          class="flex items-center space-x-1.5 px-2.5 py-0.5 rounded-xs text-[10px] font-bold transition cursor-pointer"
          :class="activeTab === 'uv' ? 'bg-ui-accent text-white shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="UV Unwrapping, Seams & Quadrant Atlas Mapping"
          :aria-pressed="activeTab === 'uv'"
          @click="activeTab = 'uv'"
        >
          <BlenderIcon name="uv" :size="12" />
          <span class="uv-paint-tab-label">UV Layout</span>
        </button>
        <button
          type="button"
          class="flex items-center space-x-1.5 px-2.5 py-0.5 rounded-xs text-[10px] font-bold transition cursor-pointer"
          :class="activeTab === 'paint' ? 'bg-ui-accent text-white shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Pixel & Texture Paint Studio"
          :aria-pressed="activeTab === 'paint'"
          @click="activeTab = 'paint'"
        >
          <BlenderIcon name="brush" :size="11" />
          <span class="uv-paint-tab-label">Paint Texture</span>
        </button>
      </div>
      <div id="uv-paint-command-slot" class="uv-paint-command-slot flex items-center min-w-0" />
      <div class="flex items-center gap-1.5 shrink-0 ml-auto">
        <div class="px-2 py-0.5 rounded-xs bg-ui-input border border-ui-borderSubtle text-[10px] font-mono text-ui-textMuted flex items-center gap-1">
          <span class="uv-paint-resolution-label text-[9px] text-ui-textMuted font-bold">RES:</span>
          <span class="text-amber-300 font-bold">{{ projectStore.pixelBuffer.width }}×{{ projectStore.pixelBuffer.height }}</span>
        </div>
        <div
          v-if="activeTab === 'paint'"
          class="flex items-center gap-1.5 bg-ui-input px-2 py-0.5 rounded-xs border border-ui-borderSubtle"
        >
          <span class="uv-paint-color-label text-[9px] text-ui-textMuted font-bold uppercase">Color:</span>
          <label class="w-5 h-5 rounded-xs border border-ui-borderStrong cursor-pointer shadow-xs relative overflow-hidden block" :style="{ backgroundColor: toolStore.primaryColor }">
            <input type="color" v-model="toolStore.primaryColor" class="opacity-0 absolute inset-0 w-full h-full cursor-pointer" />
          </label>
          <input
            type="text"
            v-model="toolStore.primaryColor"
            class="uv-paint-color-hex w-16 px-1.5 py-0.5 bg-ui-panel text-ui-textPrimary font-mono text-[10px] font-bold border border-ui-borderSubtle rounded-xs focus:outline-none focus:border-ui-accent uppercase text-center"
            aria-label="Color hex"
          />
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
          <p><kbd>[ / ]</kbd> Brush size <kbd>X</kbd> Swap colors</p>
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
      class="shrink-0 px-3 py-1.5 text-[11px] leading-snug text-amber-100 bg-amber-950/40 border-b border-amber-500/30 flex items-center justify-between gap-3"
    >
      <span>Select a mesh in Modeling, then unwrap or paint it here.</span>
      <button
        type="button"
        class="shrink-0 px-2 py-0.5 rounded-xs bg-amber-500/20 border border-amber-400/40 text-amber-100 hover:bg-amber-500/30"
        @click="toolStore.setAppMode('model')"
      >Go to Modeling</button>
    </div>

    <div class="flex-1 min-h-0 min-w-0">
      <UVEditor v-if="activeTab === 'uv'" key="uv-editor" />
      <PixelEditor v-else key="pixel-editor" />
    </div>
  </div>
</template>

<style>
.uv-paint-shell { container-type: inline-size; }

/* Command menus are intentionally above the canvas, viewport and inspector.
   They are portaled into the shared workspace header, so this rule covers UV
   and Paint without duplicating it in both editors. */
.uv-paint-command-slot .header-dropdown-menu {
  z-index: 2147483000 !important;
}

@container (max-width: 760px) {
  .uv-paint-tabs { gap: 4px !important; padding-left: 4px !important; padding-right: 4px !important; }
  .uv-paint-resolution-label,
  .uv-paint-color-label,
  .uv-paint-color-hex { display: none; }
  .uv-paint-tabs > div:first-child button { padding-left: 6px !important; padding-right: 6px !important; }
}
</style>

<style>
.uv-paint-shell { font-family: var(--font-sans, sans-serif); }
.uv-paint-shell .uv-paint-tabs { flex-wrap: wrap; height: auto !important; min-height: 34px !important; padding: 4px 8px; gap: 6px !important; align-content: flex-start; }
</style>

<style>
.uv-paint-tabs { min-height: 34px !important; height: auto !important; }
.uv-paint-tab-label { white-space: nowrap; }
.uv-paint-command-slot { z-index: 190; order: 3; flex: 0 0 100%; min-width: 0; overflow-x: auto; padding-top: 3px; border-top: 1px solid var(--ui-border-subtle); }
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
@container (min-width: 980px) {
  .uv-paint-tabs { flex-wrap: nowrap !important; min-height: 34px !important; height: 34px !important; align-items: center; }
  .uv-paint-command-slot { order: 0 !important; flex: 1 1 auto !important; border-top: none !important; padding-top: 0 !important; }
}
@container (max-width: 979px) {
  .uv-paint-tabs { flex-wrap: wrap; height: auto !important; padding-top: 4px; min-height: 62px !important; row-gap: 4px !important; }
}
</style>
