<script setup lang="ts">
import { ref, computed, watch } from 'vue'
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
  Wrench, 
  Box, 
  Scan, 
  Film, 
  FolderTree, 
  Link, 
  Paintbrush, 
  Image,
  Sliders,
  PanelRightClose,
  Columns
} from 'lucide-vue-next'

const toolStore = useToolStore()
const layoutStore = useLayoutStore()

// View Layout Mode: 'split' (stacked Outliner + Properties) | 'outliner' (Full Outliner) | 'props' (Full Properties)
const panelViewMode = ref<'split' | 'outliner' | 'props'>('split')

const activeTab = computed({
  get: () => layoutStore.inspectorTab === 'outliner' ? 'props' : layoutStore.inspectorTab,
  set: (tab) => layoutStore.setInspectorTab(tab, toolStore.appMode)
})

// Sidebar Width Resizing
const width = ref(320)
const isResizingWidth = ref(false)
let resizeStartX = 0
let startW = 320

function startResizeLeft(e: MouseEvent) {
  e.preventDefault()
  isResizingWidth.value = true
  resizeStartX = e.clientX
  startW = width.value

  const onMouseMove = (moveEvent: MouseEvent) => {
    if (!isResizingWidth.value) return
    const delta = resizeStartX - moveEvent.clientX
    width.value = Math.max(260, Math.min(600, startW + delta))
  }

  const onMouseUp = () => {
    isResizingWidth.value = false
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

// Vertical Splitter between Outliner and Properties
const outlinerPercent = ref(38) // 38% height for outliner by default
const isSplittingVertical = ref(false)
let splitStartY = 0
let startPercent = 38

function startVerticalSplit(e: MouseEvent) {
  e.preventDefault()
  const sidebarEl = (e.target as HTMLElement).closest('aside')
  if (!sidebarEl) return

  isSplittingVertical.value = true
  splitStartY = e.clientY
  startPercent = outlinerPercent.value
  const totalH = sidebarEl.clientHeight

  const onMouseMove = (moveEvent: MouseEvent) => {
    if (!isSplittingVertical.value) return
    const deltaY = moveEvent.clientY - splitStartY
    const deltaPercent = (deltaY / totalH) * 100
    outlinerPercent.value = Math.max(15, Math.min(80, startPercent + deltaPercent))
  }

  const onMouseUp = () => {
    isSplittingVertical.value = false
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

type PropertyTabItem = {
  id: 'props' | 'modifiers' | 'material' | 'texture' | 'refs' | 'skeleton' | 'bindings' | 'weights'
  label: string
  title: string
  icon?: any
  blenderIcon?: any
  accent?: string
}

const standardPropTabs = computed<PropertyTabItem[]>(() => {
  const mode = toolStore.appMode
  const objectTab: PropertyTabItem =
    mode === 'animate'
      ? { id: 'props', label: 'Animation', title: 'Animation & Keyframes', icon: Film, accent: 'amber' }
      : mode === 'uvpaint'
        ? { id: 'props', label: 'UV / Paint', title: 'UV & Seams Properties', icon: Scan, accent: 'sky' }
        : { id: 'props', label: 'Transform', title: 'Object Transform & Coordinates', icon: Box, accent: 'amber' }

  const mod: PropertyTabItem = { id: 'modifiers', label: 'Modifiers', title: 'Modifiers (Mirror, Subdiv, Solidify)', icon: Wrench, accent: 'sky' }
  const mat: PropertyTabItem = { id: 'material', label: 'Material', title: 'Material & Shading Properties', blenderIcon: 'material', accent: 'amber' }
  const tex: PropertyTabItem = { id: 'texture', label: 'Texture', title: 'Texture Atlas & Pixel Maps', blenderIcon: 'texture', accent: 'emerald' }
  const refs: PropertyTabItem = { id: 'refs', label: 'References', title: 'Reference Images for Blockout', icon: Image, accent: 'sky' }

  if (mode === 'blockout') return [objectTab, refs, mod]
  if (mode === 'uvpaint') return [objectTab, tex, mat, mod]
  return [objectTab, mod, mat, tex]
})

const rigPropTabs = computed<PropertyTabItem[]>(() => [
  { id: 'skeleton', label: 'Skeleton', title: 'Skeleton & Joint Hierarchy', icon: FolderTree, accent: 'amber' },
  { id: 'props', label: 'Bone', title: 'Bone Joint Transforms & IK', icon: Sliders, accent: 'sky' },
  { id: 'bindings', label: 'Bindings', title: 'Mesh Bindings & Parents', icon: Link, accent: 'emerald' },
  { id: 'weights', label: 'Weights', title: 'Vertex Weight Painting', icon: Paintbrush, accent: 'rose' }
])

const activePropTabs = computed(() => {
  return toolStore.appMode === 'rig' ? rigPropTabs.value : standardPropTabs.value
})

watch(
  () => toolStore.appMode,
  (mode) => {
    layoutStore.restoreInspectorTab(mode)
  },
  { immediate: true }
)
</script>

<template>
  <aside 
    class="relative h-full bg-ui-panel border-l border-ui-borderSubtle flex flex-col select-none z-30 font-sans text-xs overflow-hidden shrink-0"
    :style="{ width: `${width}px` }"
  >
    <!-- Left Resize Handle -->
    <div 
      @mousedown="startResizeLeft"
      class="absolute left-0 top-0 w-1.5 h-full cursor-ew-resize hover:bg-ui-accent/40 transition z-50 group"
      title="Drag to resize sidebar width"
    ></div>

    <!-- 1. TOP HEADER & VIEW MODE SWITCHER TABS -->
    <div class="h-7 bg-ui-header border-b border-ui-borderSubtle px-2 flex items-center justify-between text-ui-textMuted select-none shrink-0">
      <!-- Layout View Mode Pills -->
      <div class="flex items-center space-x-0.5 bg-ui-input p-0.5 rounded-xs border border-ui-borderSubtle text-[10px] font-sans">
        <button
          @click="panelViewMode = 'split'"
          class="px-2 py-0.5 rounded-xs flex items-center gap-1 transition cursor-pointer"
          :class="panelViewMode === 'split' 
            ? 'bg-ui-active text-ui-textAccent font-bold shadow-xs' 
            : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Split View: Outliner + Properties"
        >
          <Columns class="w-3 h-3" />
          <span>Both</span>
        </button>

        <button
          @click="panelViewMode = 'outliner'"
          class="px-2 py-0.5 rounded-xs flex items-center gap-1 transition cursor-pointer"
          :class="panelViewMode === 'outliner' 
            ? 'bg-ui-active text-ui-textAccent font-bold shadow-xs' 
            : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Full Outliner Tree (Scene Objects & Bones)"
        >
          <Layers class="w-3 h-3 text-amber-400" />
          <span>Outliner</span>
        </button>

        <button
          @click="panelViewMode = 'props'"
          class="px-2 py-0.5 rounded-xs flex items-center gap-1 transition cursor-pointer"
          :class="panelViewMode === 'props' 
            ? 'bg-ui-active text-ui-textAccent font-bold shadow-xs' 
            : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Full Properties Inspector"
        >
          <Sliders class="w-3 h-3 text-sky-400" />
          <span>Properties</span>
        </button>
      </div>

      <!-- Quick Hide Panel Button -->
      <button 
        @click="layoutStore.showRightSidebar = false"
        class="p-1 text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover rounded-xs transition cursor-pointer"
        title="Hide Panel (Hotkey: N)"
      >
        <PanelRightClose class="w-3.5 h-3.5" />
      </button>
    </div>

    <!-- 2. BODY CONTENT: BASED ON VIEW MODE -->
    <div class="flex-1 min-h-0 flex flex-col overflow-hidden">
      <!-- OPTION A: FULL OUTLINER MODE -->
      <div v-if="panelViewMode === 'outliner'" class="flex-1 min-h-0 flex flex-col overflow-hidden bg-ui-panel">
        <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
          <OutlinerTree />
        </div>
      </div>

      <!-- OPTION B: FULL PROPERTIES MODE -->
      <div v-else-if="panelViewMode === 'props'" class="flex-1 min-h-0 flex overflow-hidden bg-ui-panel">
        <!-- Vertical Tab Column (Blender Style) -->
        <div class="w-8 bg-ui-header/80 border-r border-ui-borderSubtle flex flex-col items-center py-2 gap-1 shrink-0 select-none">
          <button
            v-for="tab in activePropTabs"
            :key="tab.id"
            @click="activeTab = tab.id"
            class="w-6 h-6 rounded-xs flex items-center justify-center transition cursor-pointer relative"
            :class="activeTab === tab.id 
              ? 'bg-ui-active text-ui-textAccent shadow-xs font-bold' 
              : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
            :title="tab.title"
          >
            <BlenderIcon v-if="tab.blenderIcon" :name="tab.blenderIcon" :size="13" />
            <component v-else-if="tab.icon" :is="tab.icon" class="w-3.5 h-3.5" />
            <span 
              v-if="activeTab === tab.id" 
              class="absolute -left-1 top-1.5 bottom-1.5 w-0.5 rounded-r bg-ui-accent"
            ></span>
          </button>
        </div>

        <!-- Full Height Active Property Sheet -->
        <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-1.5">
          <SkeletonPanel v-if="toolStore.appMode === 'rig' && activeTab === 'skeleton'" />
          <BindingsPanel v-else-if="toolStore.appMode === 'rig' && activeTab === 'bindings'" />
          <WeightsPanel v-else-if="toolStore.appMode === 'rig' && activeTab === 'weights'" />

          <div v-else-if="activeTab === 'props'" class="h-full flex flex-col">
            <RiggingPanel v-if="toolStore.appMode === 'rig'" />
            <AnimationInspector v-else-if="toolStore.appMode === 'animate'" />
            <UVPaintProps v-else-if="toolStore.appMode === 'uvpaint'" />
            <TransformProps v-else />
          </div>

          <div v-else-if="activeTab === 'modifiers'" class="h-full flex flex-col">
            <ModifiersProps />
          </div>

          <div v-else-if="activeTab === 'material'" class="h-full flex flex-col">
            <MaterialProps />
          </div>

          <div v-else-if="activeTab === 'texture'" class="h-full flex flex-col">
            <TextureProps />
          </div>

          <div v-else-if="activeTab === 'refs'" class="h-full flex flex-col">
            <ReferenceProps />
          </div>
        </div>
      </div>

      <!-- OPTION C: DUAL SPLIT MODE (Outliner on Top + Properties on Bottom) -->
      <template v-else>
        <!-- Outliner Pane -->
        <div 
          class="flex flex-col min-h-0 overflow-hidden bg-ui-panel"
          :style="{ height: `${outlinerPercent}%` }"
        >
          <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
            <OutlinerTree />
          </div>
        </div>

        <!-- Resizable Splitter Bar -->
        <div 
          @mousedown="startVerticalSplit"
          class="h-2 w-full bg-ui-header hover:bg-ui-hover border-y border-ui-borderSubtle cursor-row-resize flex items-center justify-center transition group select-none shrink-0 z-20"
          title="Drag to resize Outliner vs Properties"
        >
          <div class="w-8 h-0.5 rounded-full bg-ui-borderDefault group-hover:bg-ui-accent transition"></div>
        </div>

        <!-- Properties Pane with Left Icon Bar -->
        <div class="flex-1 min-h-0 flex overflow-hidden bg-ui-panel">
          <!-- Vertical Icon Strip -->
          <div class="w-8 bg-ui-header/80 border-r border-ui-borderSubtle flex flex-col items-center py-1.5 gap-1 shrink-0 select-none">
            <button
              v-for="tab in activePropTabs"
              :key="tab.id"
              @click="activeTab = tab.id"
              class="w-6 h-6 rounded-xs flex items-center justify-center transition cursor-pointer relative"
              :class="activeTab === tab.id 
                ? 'bg-ui-active text-ui-textAccent shadow-xs font-bold' 
                : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
              :title="tab.title"
            >
              <BlenderIcon v-if="tab.blenderIcon" :name="tab.blenderIcon" :size="13" />
              <component v-else-if="tab.icon" :is="tab.icon" class="w-3.5 h-3.5" />
              <span 
                v-if="activeTab === tab.id" 
                class="absolute -left-1 top-1.5 bottom-1.5 w-0.5 rounded-r bg-ui-accent"
              ></span>
            </button>
          </div>

          <!-- Active Property Sheet -->
          <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-1">
            <SkeletonPanel v-if="toolStore.appMode === 'rig' && activeTab === 'skeleton'" />
            <BindingsPanel v-else-if="toolStore.appMode === 'rig' && activeTab === 'bindings'" />
            <WeightsPanel v-else-if="toolStore.appMode === 'rig' && activeTab === 'weights'" />

            <div v-else-if="activeTab === 'props'" class="h-full flex flex-col">
              <RiggingPanel v-if="toolStore.appMode === 'rig'" />
              <AnimationInspector v-else-if="toolStore.appMode === 'animate'" />
              <UVPaintProps v-else-if="toolStore.appMode === 'uvpaint'" />
              <TransformProps v-else />
            </div>

            <div v-else-if="activeTab === 'modifiers'" class="h-full flex flex-col">
              <ModifiersProps />
            </div>

            <div v-else-if="activeTab === 'material'" class="h-full flex flex-col">
              <MaterialProps />
            </div>

            <div v-else-if="activeTab === 'texture'" class="h-full flex flex-col">
              <TextureProps />
            </div>

            <div v-else-if="activeTab === 'refs'" class="h-full flex flex-col">
              <ReferenceProps />
            </div>
          </div>
        </div>
      </template>
    </div>
  </aside>
</template>
