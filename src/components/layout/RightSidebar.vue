<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useFloatingDrag } from '../../composables/useFloatingDrag'
import { useToolStore } from '../../stores/toolStore'
import { useLayoutStore } from '../../stores/layoutStore'
import OutlinerTree from '../outliner/OutlinerTree.vue'
import TransformProps from '../inspector/TransformProps.vue'
import MaterialProps from '../inspector/MaterialProps.vue'
import TextureProps from '../inspector/TextureProps.vue'
import ReferenceProps from '../inspector/ReferenceProps.vue'
import ModifiersProps from '../inspector/ModifiersProps.vue'
import RiggingPanel from '../rigging/RiggingPanel.vue'
import BindingsPanel from '../rigging/BindingsPanel.vue'
import WeightsPanel from '../rigging/WeightsPanel.vue'
import SkeletonPanel from '../rigging/SkeletonPanel.vue'
import AnimationInspector from '../inspector/AnimationInspector.vue'
import UVPaintProps from '../uvpaint/UVPaintProps.vue'
import BlenderIcon from '../icons/BlenderIcon.vue'
import { 
  Layers, 
  Sliders, 
  Wrench,
  Link,
  Paintbrush,
  FolderTree,
  Box,
  Scan,
  Film,
  GripHorizontal, 
  Pin, 
  PinOff, 
  Minus, 
  Plus,
  X,
  ChevronRight,
  Image
} from 'lucide-vue-next'

const toolStore = useToolStore()
const layoutStore = useLayoutStore()
const activeTab = computed({
  get: () => layoutStore.inspectorTab,
  set: (tab) => layoutStore.setInspectorTab(tab, toolStore.appMode)
})

type SidebarTab = {
  id: 'outliner' | 'props' | 'modifiers' | 'material' | 'texture' | 'refs' | 'skeleton' | 'bindings' | 'weights'
  label: string
  title: string
  icon: any
  accent?: string
}

const standardTabs = computed<SidebarTab[]>(() => {
  const mode = toolStore.appMode
  const propsTab: SidebarTab =
    mode === 'animate'
      ? { id: 'props', label: 'Anim', title: 'Animation — bones, keys, clips', icon: Film }
      : mode === 'uvpaint'
        ? { id: 'props', label: 'UV', title: 'UV / Paint — unwrap, seams, paint target', icon: Scan }
        : { id: 'props', label: 'Object', title: 'Object — location, rotation, scale, origin', icon: Box }

  const list: SidebarTab = { id: 'outliner', label: 'List', title: 'Outliner — hierarchy, visibility, parenting', icon: Layers }
  const mod: SidebarTab = { id: 'modifiers', label: 'Mod', title: 'Modifiers', icon: Wrench, accent: 'sky' }
  const mat: SidebarTab = { id: 'material', label: 'Mat', title: 'Material — shading and assign', icon: 'material', accent: 'amber' }
  const tex: SidebarTab = { id: 'texture', label: 'Tex', title: 'Texture — select, create, apply', icon: 'texture', accent: 'emerald' }

  const refs: SidebarTab = { id: 'refs', label: 'Refs', title: 'Reference images for blockout', icon: Image, accent: 'sky' }
  if (mode === 'uvpaint') return [list, propsTab, tex, mat, mod]
  if (mode === 'blockout') return [list, propsTab, refs, mod]
  return [list, propsTab, mod, mat, tex]
})

const rigTabs = computed<SidebarTab[]>(() => [
  { id: 'skeleton', label: 'Skel', title: 'Skeleton hierarchy', icon: FolderTree },
  { id: 'props', label: 'Bone', title: 'Bone properties', icon: Sliders },
  { id: 'bindings', label: 'Bind', title: 'Geometry bindings (Ctrl+B)', icon: Link, accent: 'amber' },
  { id: 'weights', label: 'Wts', title: 'Weight paint', icon: Paintbrush, accent: 'sky' }
])

function tabClass(id: string, accent?: string) {
  const on = activeTab.value === id
  if (!on) return 'border-transparent text-ui-textMuted hover:text-ui-textSecondary hover:bg-ui-hover'
  if (accent === 'sky') return 'bg-ui-panel text-sky-400 font-semibold border-sky-500'
  if (accent === 'amber') return 'bg-ui-panel text-amber-400 font-semibold border-amber-500'
  if (accent === 'emerald') return 'bg-ui-panel text-emerald-400 font-semibold border-emerald-500'
  return 'bg-ui-panel text-ui-textPrimary font-semibold border-ui-accent'
}

// Photoshop / DCC Floating & Resizable Panel States
const isFloating = ref(false)
const isMinimized = ref(false)
const width = ref(320)
const height = ref(560)
const pos = ref({ 
  x: typeof window !== 'undefined' ? Math.max(20, window.innerWidth - 332) : 950, 
  y: 90 
})

const { isDragging, startDrag } = useFloatingDrag(pos, {
  enabled: () => isFloating.value,
  maxPadX: 100,
  maxPadY: 50
})

const isResizingWidth = ref(false)
const isResizingHeight = ref(false)
let resizeStartX = 0
let resizeStartY = 0
let startW = 320
let startH = 560

watch(
  () => toolStore.appMode,
  (mode) => {
    layoutStore.restoreInspectorTab(mode)
  },
  { immediate: true }
)

function toggleFloating() {
  isFloating.value = !isFloating.value
  if (isFloating.value) {
    pos.value = {
      x: Math.max(20, window.innerWidth - width.value - 12),
      y: 90
    }
  }
}

function startResizeLeft(e: MouseEvent) {
  e.preventDefault()
  isResizingWidth.value = true
  resizeStartX = e.clientX
  startW = width.value

  const onMouseMove = (moveEvent: MouseEvent) => {
    if (!isResizingWidth.value) return
    const delta = resizeStartX - moveEvent.clientX
    width.value = Math.max(240, Math.min(560, startW + delta))
  }

  const onMouseUp = () => {
    isResizingWidth.value = false
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

function startResizeCorner(e: MouseEvent) {
  e.preventDefault()
  isResizingHeight.value = true
  resizeStartY = e.clientY
  startH = height.value

  const onMouseMove = (moveEvent: MouseEvent) => {
    if (!isResizingHeight.value) return
    const deltaY = moveEvent.clientY - resizeStartY
    height.value = Math.max(200, Math.min(window.innerHeight - 100, startH + deltaY))
  }

  const onMouseUp = () => {
    isResizingHeight.value = false
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}
</script>

<template>
  <aside 
    data-floating-panel
    class="bg-ui-panel border border-ui-borderSubtle flex flex-col select-none z-30 font-mono text-xs overflow-hidden"
    :class="[
      isFloating ? 'fixed rounded-xs shadow-2xl border-ui-borderStrong' : 'relative border-l border-t-0 border-b-0 border-r-0 h-full',
      isDragging ? 'transition-none cursor-grabbing' : '',
      isMinimized ? 'h-auto' : ''
    ]"
    :style="isFloating ? { 
      left: `${pos.x}px`, 
      top: `${pos.y}px`, 
      width: `${width}px`, 
      height: isMinimized ? 'auto' : `${height}px` 
    } : { 
      width: `${width}px` 
    }"
  >
    <!-- Left Border Resize Handle (When docked) -->
    <div 
      v-if="!isFloating"
      @mousedown="startResizeLeft"
      class="absolute left-0 top-0 w-1.5 h-full cursor-ew-resize hover:bg-ui-accent/40 transition z-50 group"
      title="Drag to resize inspector width"
    ></div>

    <!-- Collapse / Hide Panel Edge Button (When docked) -->
    <button 
      v-if="!isFloating"
      @click="layoutStore.showRightSidebar = false"
      class="absolute -left-3 top-10 w-3 h-8 bg-ui-header/90 hover:bg-ui-panel border-l border-t border-b border-ui-borderStrong rounded-l-xs flex items-center justify-center text-ui-textMuted hover:text-white shadow-md transition z-50 cursor-pointer group"
      title="Hide Properties Panel (Hotkey: N)"
    >
      <ChevronRight class="w-2.5 h-2.5 group-hover:translate-x-0.5 transition-transform" />
    </button>

    <!-- Movable Header & Panel Controls -->
    <div 
      class="h-6 bg-ui-header border-b border-ui-borderSubtle px-2 flex items-center justify-between text-ui-textMuted select-none shrink-0"
      :class="{ 'cursor-move': isFloating, 'cursor-pointer': !isFloating }"
      @pointerdown="startDrag"
      @dblclick="isMinimized = !isMinimized"
      :title="isFloating ? 'Drag header to move inspector. Double-click to fold.' : 'Double-click to fold.'"
    >
      <div class="flex items-center space-x-1 text-ui-textSecondary font-bold text-[10px] uppercase">
        <GripHorizontal class="w-3 h-3 text-ui-textMuted" />
        <span>Properties</span>
      </div>

      <div class="flex items-center space-x-1" @mousedown.stop @pointerdown.stop>
        <!-- Toggle Dock / Float -->
        <button 
          @click="toggleFloating"
          class="p-0.5 text-ui-textMuted hover:text-ui-textPrimary rounded-xs hover:bg-ui-hover transition"
          :class="{ 'text-ui-accent': isFloating }"
          :title="isFloating ? 'Dock to Right Edge' : 'Undock / Float Panel'"
        >
          <PinOff v-if="isFloating" class="w-3 h-3" />
          <Pin v-else class="w-3 h-3" />
        </button>

        <!-- Minimize / Fold -->
        <button 
          @click="isMinimized = !isMinimized"
          class="p-0.5 text-ui-textMuted hover:text-ui-textPrimary rounded-xs hover:bg-ui-hover transition"
          :title="isMinimized ? 'Expand Panel' : 'Minimize Panel'"
        >
          <Plus v-if="isMinimized" class="w-3 h-3" />
          <Minus v-else class="w-3 h-3" />
        </button>

        <!-- Close / Hide Panel -->
        <button 
          @click="layoutStore.showRightSidebar = false"
          class="p-0.5 text-ui-textMuted hover:text-rose-400 rounded-xs hover:bg-ui-hover transition"
          title="Hide Properties Panel (Hotkey: N)"
        >
          <X class="w-3 h-3" />
        </button>
      </div>
    </div>

    <!-- Body Content (Hidden when minimized) -->
    <div v-show="!isMinimized" class="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div
        v-if="toolStore.appMode === 'rig'"
        class="h-7 bg-ui-header border-b border-ui-borderSubtle grid shrink-0 font-sans"
        :style="{ gridTemplateColumns: `repeat(${rigTabs.length}, minmax(0, 1fr))` }"
      >
        <button
          v-for="tab in rigTabs"
          :key="tab.id"
          type="button"
          @click="activeTab = tab.id"
          class="flex flex-col items-center justify-center gap-0 leading-none transition border-b-2 px-0.5 text-[9px]"
          :class="tabClass(tab.id, tab.accent)"
          :title="tab.title"
        >
          <component :is="tab.icon" class="w-3.5 h-3.5" />
          <span>{{ tab.label }}</span>
        </button>
      </div>

      <div
        v-else
        class="h-7 bg-ui-header border-b border-ui-borderSubtle grid shrink-0 font-sans"
        :style="{ gridTemplateColumns: `repeat(${standardTabs.length}, minmax(0, 1fr))` }"
      >
        <button
          v-for="tab in standardTabs"
          :key="tab.id"
          type="button"
          @click="activeTab = tab.id"
          class="flex flex-col items-center justify-center gap-0 leading-none transition border-b-2 px-0.5 text-[9px]"
          :class="tabClass(tab.id, tab.accent)"
          :title="tab.title"
        >
          <BlenderIcon v-if="tab.icon === 'material' || tab.icon === 'texture'" :name="tab.icon" :size="12" />
          <component v-else :is="tab.icon" class="w-3.5 h-3.5" />
          <span>{{ tab.label }}</span>
        </button>
      </div>

      <!-- Content panels -->
      <div class="flex-1 min-h-0 relative flex flex-col overflow-y-auto custom-scrollbar">
        <!-- Rigging Panels -->
        <SkeletonPanel v-if="toolStore.appMode === 'rig' && activeTab === 'skeleton'" />
        <BindingsPanel v-else-if="toolStore.appMode === 'rig' && activeTab === 'bindings'" />
        <WeightsPanel v-else-if="toolStore.appMode === 'rig' && activeTab === 'weights'" />

        <!-- Outliner Tab -->
        <OutlinerTree v-else-if="activeTab === 'outliner'" />

        <!-- Props Tab -->
        <div v-else-if="activeTab === 'props'" class="h-full overflow-y-auto flex flex-col">
          <RiggingPanel v-if="toolStore.appMode === 'rig'" />
          <AnimationInspector v-else-if="toolStore.appMode === 'animate'" />
          <UVPaintProps v-else-if="toolStore.appMode === 'uvpaint'" />
          <TransformProps v-else />
        </div>

        <!-- Modifiers Tab -->
        <div v-else-if="activeTab === 'modifiers'" class="h-full overflow-y-auto flex flex-col">
          <ModifiersProps />
        </div>

        <!-- Material Properties Tab -->
        <div v-else-if="activeTab === 'material'" class="h-full overflow-y-auto flex flex-col">
          <MaterialProps />
        </div>

        <!-- Texture Assets Tab -->
        <div v-else-if="activeTab === 'texture'" class="h-full overflow-y-auto flex flex-col">
          <TextureProps />
        </div>

        <div v-else-if="activeTab === 'refs'" class="h-full overflow-y-auto flex flex-col">
          <ReferenceProps />
        </div>
      </div>

      <!-- Bottom Corner Resize Handle (When floating) -->
      <div 
        v-if="isFloating"
        @mousedown="startResizeCorner"
        class="h-2 w-full bg-ui-header border-t border-ui-borderSubtle cursor-ns-resize hover:bg-ui-accent/30 transition shrink-0 flex items-center justify-center"
        title="Drag to resize inspector height"
      >
        <div class="w-8 h-0.5 bg-ui-textMuted/40 rounded-full"></div>
      </div>
    </div>
  </aside>
</template>
