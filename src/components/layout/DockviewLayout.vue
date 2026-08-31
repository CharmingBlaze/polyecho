<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { DockviewVue } from 'dockview-vue'
import type { DockviewReadyEvent } from 'dockview-vue'
import { useToolStore } from '../../stores/toolStore'

import Viewport3D from '../viewport/Viewport3D.vue'
import PixelCanvas from '../uvpaint/PixelCanvas.vue'
import OutlinerTree from '../outliner/OutlinerTree.vue'
import TransformProps from '../inspector/TransformProps.vue'
import MaterialProps from '../inspector/MaterialProps.vue'
import TextureProps from '../inspector/TextureProps.vue'
import PalettePicker from '../uvpaint/PalettePicker.vue'
import RiggingPanel from '../rigging/RiggingPanel.vue'
import AnimationInspector from '../inspector/AnimationInspector.vue'
import UVPaintProps from '../uvpaint/UVPaintProps.vue'
import Timeline from '../animation/Timeline.vue'

const toolStore = useToolStore()
const dockviewApi = ref<any>(null)
const defaultLayoutSaved = ref<any>(null)

function onReady(event: DockviewReadyEvent) {
  dockviewApi.value = event.api
  setupLayout(event.api)
}

function setupLayout(api: any) {
  api.clear()

  // 1. Central 3D Viewport Panel
  const viewportPanel = api.addPanel({
    id: 'viewport_panel',
    component: 'viewport',
    title: '3D Viewport',
  })

  // 2. Right Side: Outliner & Inspector Tabbed Group
  const outlinerPanel = api.addPanel({
    id: 'outliner_panel',
    component: 'outliner',
    title: 'Outliner',
    position: {
      referencePanel: viewportPanel,
      direction: 'right'
    }
  })

  api.addPanel({
    id: 'inspector_panel',
    component: 'inspector',
    title: 'Properties',
    position: {
      referencePanel: outlinerPanel,
      direction: 'within'
    }
  })

  api.addPanel({
    id: 'shading_panel',
    component: 'shading',
    title: 'Shading',
    position: {
      referencePanel: outlinerPanel,
      direction: 'within'
    }
  })

  api.addPanel({
    id: 'textures_panel',
    component: 'textures',
    title: 'Textures',
    position: {
      referencePanel: outlinerPanel,
      direction: 'within'
    }
  })

  // Focus Inspector by default
  const insp = api.getPanel('inspector_panel')
  if (insp) insp.api.setActive()

  defaultLayoutSaved.value = api.toJSON()
}

// Watch appMode to adjust dockview panels (e.g. UV Canvas & Timeline)
watch(() => toolStore.appMode, (mode) => {
  if (!dockviewApi.value) return
  const api = dockviewApi.value

  const uvPanel = api.getPanel('uvcanvas_panel')
  const timelinePanel = api.getPanel('timeline_panel')

  if (mode === 'uvpaint') {
    if (!uvPanel) {
      const vp = api.getPanel('viewport_panel')
      if (vp) {
        api.addPanel({
          id: 'uvcanvas_panel',
          component: 'uvcanvas',
          title: '2D UV & Pixel Canvas',
          position: {
            referencePanel: vp,
            direction: 'right'
          }
        })
      }
    }
    if (timelinePanel) api.removePanel(timelinePanel)
  } else if (mode === 'animate') {
    if (!timelinePanel) {
      const vp = api.getPanel('viewport_panel')
      if (vp) {
        api.addPanel({
          id: 'timeline_panel',
          component: 'timeline',
          title: 'Animation Timeline',
          position: {
            referencePanel: vp,
            direction: 'below'
          }
        })
      }
    }
    if (uvPanel) api.removePanel(uvPanel)
  } else {
    if (uvPanel) api.removePanel(uvPanel)
    if (timelinePanel) api.removePanel(timelinePanel)
  }
})

// Listen for reset layout event from menu
function handleResetLayout() {
  if (dockviewApi.value) {
    setupLayout(dockviewApi.value)
  }
}

onMounted(() => {
  window.addEventListener('reset-dockview-layout', handleResetLayout)
})

onUnmounted(() => {
  window.removeEventListener('reset-dockview-layout', handleResetLayout)
})
</script>

<template>
  <div class="w-full h-full relative overflow-hidden bg-ui-root select-none font-mono">
    <DockviewVue
      class="dockview-theme-dark w-full h-full"
      @ready="onReady"
    >
      <!-- 1. 3D Viewport Slot -->
      <template #viewport>
        <div class="w-full h-full relative overflow-hidden bg-ui-root">
          <Viewport3D />
        </div>
      </template>

      <!-- 2. UV & Pixel Canvas Slot -->
      <template #uvcanvas>
        <div class="w-full h-full relative overflow-hidden bg-ui-root">
          <PixelCanvas />
        </div>
      </template>

      <!-- 3. Outliner Tree Slot -->
      <template #outliner>
        <div class="w-full h-full overflow-hidden bg-ui-panel flex flex-col">
          <OutlinerTree />
        </div>
      </template>

      <!-- 4. Inspector Properties Slot -->
      <template #inspector>
        <div class="w-full h-full overflow-y-auto bg-ui-panel flex flex-col custom-scrollbar">
          <RiggingPanel v-if="toolStore.appMode === 'rig'" />
          <AnimationInspector v-else-if="toolStore.appMode === 'animate'" />
          <UVPaintProps v-else-if="toolStore.appMode === 'uvpaint'" />
          <div v-else class="flex flex-col">
            <TransformProps />
            <div class="p-2 border-t border-ui-borderSubtle">
              <PalettePicker />
            </div>
          </div>
        </div>
      </template>

      <!-- 5. Shading & Materials Slot -->
      <template #shading>
        <div class="w-full h-full overflow-y-auto bg-ui-panel flex flex-col custom-scrollbar">
          <MaterialProps />
          <div class="p-2 border-t border-ui-borderSubtle">
            <PalettePicker />
          </div>
        </div>
      </template>

      <!-- 6. 2D Texture Assets Slot -->
      <template #textures>
        <div class="w-full h-full overflow-y-auto bg-ui-panel flex flex-col custom-scrollbar">
          <TextureProps />
        </div>
      </template>

      <!-- 7. Animation Timeline Slot -->
      <template #timeline>
        <div class="w-full h-full overflow-hidden bg-ui-panel flex flex-col">
          <Timeline />
        </div>
      </template>
    </DockviewVue>
  </div>
</template>
