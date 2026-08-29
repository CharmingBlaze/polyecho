<script setup lang="ts">
import { ref, watch } from 'vue'
import { useToolStore } from '../../stores/toolStore'
import OutlinerTree from '../outliner/OutlinerTree.vue'
import TransformProps from '../inspector/TransformProps.vue'
import MaterialProps from '../inspector/MaterialProps.vue'
import PalettePicker from '../uvpaint/PalettePicker.vue'
import RiggingPanel from '../rigging/RiggingPanel.vue'
import AnimationInspector from '../inspector/AnimationInspector.vue'
import UVPaintProps from '../uvpaint/UVPaintProps.vue'
import { 
  Layers, 
  Sliders, 
  Sparkles, 
  GripHorizontal, 
  Pin, 
  PinOff, 
  Minus, 
  Plus 
} from 'lucide-vue-next'

const toolStore = useToolStore()
const activeTab = ref<'outliner' | 'props' | 'material'>('props')

// Photoshop / DCC Floating & Resizable Panel States
const isFloating = ref(true)
const isMinimized = ref(false)
const width = ref(320)
const height = ref(560)
const pos = ref({ x: window.innerWidth - 340, y: 46 })

const isDragging = ref(false)
let dragOffset = { x: 0, y: 0 }

const isResizingWidth = ref(false)
const isResizingHeight = ref(false)
let resizeStartX = 0
let resizeStartY = 0
let startW = 320
let startH = 560

watch(() => toolStore.appMode, () => {
  activeTab.value = 'props'
})

function toggleFloating() {
  isFloating.value = !isFloating.value
  if (isFloating.value) {
    pos.value = {
      x: Math.max(20, window.innerWidth - width.value - 16),
      y: 46
    }
  }
}

function startDrag(e: MouseEvent) {
  if (!isFloating.value) return
  if (e.button !== 0) return

  isDragging.value = true
  dragOffset = {
    x: e.clientX - pos.value.x,
    y: e.clientY - pos.value.y
  }

  const onMouseMove = (moveEvent: MouseEvent) => {
    if (!isDragging.value) return
    const maxX = window.innerWidth - 100
    const maxY = window.innerHeight - 50
    pos.value.x = Math.max(0, Math.min(maxX, moveEvent.clientX - dragOffset.x))
    pos.value.y = Math.max(34, Math.min(maxY, moveEvent.clientY - dragOffset.y))
  }

  const onMouseUp = () => {
    isDragging.value = false
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
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
    const delta = moveEvent.clientY - resizeStartY
    height.value = Math.max(200, Math.min(window.innerHeight - 100, startH + delta))
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
    class="bg-ui-panel border border-ui-borderSubtle flex flex-col select-none z-30 font-mono text-xs overflow-hidden transition-all duration-75"
    :class="[
      isFloating ? 'fixed rounded-xs shadow-2xl border-ui-borderStrong' : 'relative border-l border-t-0 border-b-0 border-r-0 h-full',
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

    <!-- Movable Header & Panel Controls -->
    <div 
      class="h-6 bg-ui-header border-b border-ui-borderSubtle px-2 flex items-center justify-between text-ui-textMuted select-none shrink-0"
      :class="{ 'cursor-move': isFloating, 'cursor-pointer': !isFloating }"
      @mousedown="startDrag"
      @dblclick="isMinimized = !isMinimized"
      :title="isFloating ? 'Drag header to move inspector. Double-click to fold.' : 'Double-click to fold.'"
    >
      <div class="flex items-center space-x-1 text-ui-textSecondary font-bold text-[10px] uppercase">
        <GripHorizontal class="w-3 h-3 text-ui-textMuted" />
        <span>Inspector</span>
      </div>

      <div class="flex items-center space-x-1" @mousedown.stop>
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
      </div>
    </div>

    <!-- Body Content (Hidden when minimized) -->
    <div v-show="!isMinimized" class="flex-1 flex flex-col min-h-0 overflow-hidden">
      <!-- Dense Inspector Tab Navigation -->
      <div class="h-7 bg-ui-header border-b border-ui-borderSubtle grid grid-cols-3 text-xs shrink-0 font-sans">
        <!-- 1. Outliner Tab -->
        <button 
          @click="activeTab = 'outliner'"
          class="flex items-center justify-center gap-1.5 transition text-[11px] border-b-2"
          :class="activeTab === 'outliner' ? 'bg-ui-panel text-ui-textPrimary font-semibold border-ui-accent' : 'border-transparent text-ui-textMuted hover:text-ui-textSecondary hover:bg-ui-hover'"
        >
          <Layers class="w-3 h-3 text-ui-textMuted" />
          <span>Outliner</span>
        </button>

        <!-- 2. Properties Tab -->
        <button 
          @click="activeTab = 'props'"
          class="flex items-center justify-center gap-1.5 transition text-[11px] border-b-2"
          :class="activeTab === 'props' ? 'bg-ui-panel text-ui-textPrimary font-semibold border-ui-accent' : 'border-transparent text-ui-textMuted hover:text-ui-textSecondary hover:bg-ui-hover'"
        >
          <Sliders class="w-3 h-3 text-ui-textMuted" />
          <span>{{ toolStore.appMode === 'rig' ? 'Rig' : toolStore.appMode === 'animate' ? 'Animate' : toolStore.appMode === 'uvpaint' ? 'Paint' : 'Properties' }}</span>
        </button>

        <!-- 3. Shading / Material Tab -->
        <button 
          @click="activeTab = 'material'"
          class="flex items-center justify-center gap-1.5 transition text-[11px] border-b-2"
          :class="activeTab === 'material' ? 'bg-ui-panel text-ui-textPrimary font-semibold border-ui-accent' : 'border-transparent text-ui-textMuted hover:text-ui-textSecondary hover:bg-ui-hover'"
        >
          <Sparkles class="w-3 h-3 text-ui-textMuted" />
          <span>Shading</span>
        </button>
      </div>

      <!-- Content panels -->
      <div class="flex-1 min-h-0 relative flex flex-col overflow-y-auto custom-scrollbar">
        <!-- Outliner Tab -->
        <OutlinerTree v-show="activeTab === 'outliner'" />

        <!-- Props Tab -->
        <div v-show="activeTab === 'props'" class="h-full overflow-y-auto flex flex-col">
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

        <!-- Shading Tab -->
        <div v-show="activeTab === 'material'" class="h-full overflow-y-auto flex flex-col">
          <MaterialProps />
          <div class="p-2 border-t border-ui-borderSubtle">
            <PalettePicker />
          </div>
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
