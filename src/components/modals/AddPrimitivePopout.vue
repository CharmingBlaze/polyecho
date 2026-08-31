<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { PrimitiveType } from '../../core/primitives/PrimitiveTypes'
import { PrimitivePlacementMode } from '../../core/operators/placement/PrimitivePlacementOperator'
import { PlacementOrientation } from '../../core/placement/SurfacePlacementSolver'
import BlenderIcon from '../icons/BlenderIcon.vue'
import { EDITOR_EVENTS, requestPrimitivePlacement } from '../../core/commands/editorCommands'
import { 
  X, 
  Search, 
  Box, 
  Shapes, 
  Building2, 
  GripHorizontal, 
  Minus, 
  Plus 
} from 'lucide-vue-next'

const visible = ref(false)
const isMinimized = ref(false)
const position = ref({ x: 120, y: 70 })
const activeTab = ref<'basic' | 'shapes' | 'build'>('basic')
const searchQuery = ref('')

const placementMode = ref<PrimitivePlacementMode>(PrimitivePlacementMode.CAD_DRAW)
const orientation = ref<PlacementOrientation>('SURFACE')

const isDragging = ref(false)
let dragOffset = { x: 0, y: 0 }

function startDrag(e: MouseEvent) {
  if (e.button !== 0) return
  isDragging.value = true
  dragOffset = {
    x: e.clientX - position.value.x,
    y: e.clientY - position.value.y
  }

  const onMouseMove = (moveEvent: MouseEvent) => {
    if (!isDragging.value) return
    const maxX = window.innerWidth - 320
    const maxY = window.innerHeight - 80
    position.value.x = Math.max(10, Math.min(maxX, moveEvent.clientX - dragOffset.x))
    position.value.y = Math.max(40, Math.min(maxY, moveEvent.clientY - dragOffset.y))
  }

  const onMouseUp = () => {
    isDragging.value = false
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

interface PrimitiveItem {
  type: PrimitiveType
  label: string
  desc: string
  category: 'basic' | 'shapes' | 'build'
  icon: string
  color: string
}

const PRIMITIVES: PrimitiveItem[] = [
  // BASIC
  { type: 'BOX', label: 'Box / Cube', desc: 'Standard 6-sided solid cube', category: 'basic', icon: 'mesh-cube', color: '#f59e0b' },
  { type: 'PLANE', label: 'Plane / Grid', desc: 'Flat 2D quad surface', category: 'basic', icon: 'mesh-plane', color: '#38bdf8' },
  { type: 'SPHERE', label: 'UV Sphere', desc: 'Radial UV quad sphere', category: 'basic', icon: 'mesh-sphere', color: '#a855f7' },
  { type: 'ICOSPHERE', label: 'Icosphere', desc: 'Equilateral geodesic sphere', category: 'basic', icon: 'mesh-icosphere', color: '#818cf8' },
  { type: 'CYLINDER', label: 'Cylinder', desc: 'Smooth cylinder with end caps', category: 'basic', icon: 'mesh-cylinder', color: '#10b981' },
  { type: 'CONE', label: 'Cone', desc: 'Conical solid with pointed tip', category: 'basic', icon: 'mesh-cone', color: '#f43f5e' },
  { type: 'PYRAMID', label: 'Pyramid', desc: '4-sided sloped pyramid', category: 'basic', icon: 'mesh-cone', color: '#fb923c' },

  // SHAPES
  { type: 'CIRCLE', label: 'Circle / Disc', desc: 'Flat circular n-gon polygon', category: 'shapes', icon: 'mesh-circle', color: '#22d3ee' },
  { type: 'PRISM', label: 'Prism', desc: 'Configurable 3-8 sided prism', category: 'shapes', icon: 'mesh-cylinder', color: '#34d399' },
  { type: 'TORUS', label: 'Torus / Donut', desc: 'Smooth circular ring tube', category: 'shapes', icon: 'mesh-torus', color: '#ec4899' },
  { type: 'CAPSULE', label: 'Capsule', desc: 'Pill shape with hemispherical caps', category: 'shapes', icon: 'mesh-cylinder', color: '#a78bfa' },
  { type: 'WEDGE', label: 'Wedge / Ramp', desc: 'Right-angled ramp slope', category: 'shapes', icon: 'mesh-cube', color: '#eab308' },
  { type: 'TUBE', label: 'Tube / Pipe', desc: 'Hollow cylinder pipe', category: 'shapes', icon: 'mesh-torus', color: '#14b8a6' },

  // BUILD
  { type: 'WALL', label: 'Wall Segment', desc: 'Architectural wall segment', category: 'build', icon: 'mesh-plane', color: '#f97316' },
  { type: 'STAIRS', label: 'Stairs', desc: 'Stepped stairs with risers', category: 'build', icon: 'mesh-cube', color: '#06b6d4' },
  { type: 'ARCH', label: 'Arch', desc: 'Curved architectural doorway', category: 'build', icon: 'mesh-torus', color: '#6366f1' },
]

const filteredPrimitives = computed(() => {
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    return PRIMITIVES.filter(p => p.label.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q))
  }
  return PRIMITIVES.filter(p => p.category === activeTab.value)
})

function openAt(x?: number, y?: number) {
  if (x !== undefined && y !== undefined) {
    const panelWidth = 360
    const panelHeight = 440
    const clampedX = Math.min(x, window.innerWidth - panelWidth - 20)
    const clampedY = Math.min(y, window.innerHeight - panelHeight - 20)
    position.value = { x: Math.max(20, clampedX), y: Math.max(40, clampedY) }
  }
  searchQuery.value = ''
  visible.value = true
}

function toggle() {
  visible.value = !visible.value
}

function close() {
  visible.value = false
}

function selectPrimitive(type: PrimitiveType) {
  close()
  requestPrimitivePlacement({
    type,
    mode: placementMode.value,
    orientation: orientation.value
  })
}

function handleGlobalKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && visible.value) {
    close()
    return
  }
  if (e.shiftKey && (e.key === 'A' || e.key === 'a') && !e.ctrlKey && !e.altKey) {
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
    e.preventDefault()
    e.stopPropagation()
    toggle()
  }
}

function handleOpenEvent(e: any) {
  if (e && e.detail) {
    openAt(e.detail.x, e.detail.y)
  } else {
    toggle()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeyDown, true)
  window.addEventListener(EDITOR_EVENTS.openPrimitiveMenu, handleOpenEvent)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeyDown, true)
  window.removeEventListener(EDITOR_EVENTS.openPrimitiveMenu, handleOpenEvent)
})

defineExpose({
  openAt,
  toggle,
  close
})
</script>

<template>
  <!-- Floating, Movable, Closable & Minimizable Primitive Panel -->
  <div 
    v-if="visible" 
    class="fixed z-50 flex flex-col bg-ui-panel border border-ui-borderStrong rounded-xs shadow-2xl font-sans select-none pointer-events-auto w-[360px] text-xs transition-shadow"
    :style="{ left: `${position.x}px`, top: `${position.y}px` }"
  >
    <!-- Panel Draggable Header Bar -->
    <div 
      class="flex items-center justify-between px-2.5 py-1.5 bg-ui-header border-b border-ui-borderSubtle cursor-move rounded-t-xs text-xs text-ui-textMuted group select-none"
      @mousedown="startDrag"
      title="Drag to move panel"
    >
      <div class="flex items-center space-x-1.5">
        <GripHorizontal class="w-3.5 h-3.5 text-ui-textMuted group-hover:text-ui-textSecondary transition" />
        <span class="font-semibold text-ui-textPrimary text-xs tracking-wide">Add Primitives & CAD</span>
      </div>

      <div class="flex items-center space-x-1" @mousedown.stop>
        <!-- Minimize Button -->
        <button 
          @click="isMinimized = !isMinimized" 
          class="p-1 rounded-xs hover:bg-ui-hover text-ui-textMuted hover:text-ui-textPrimary transition"
          :title="isMinimized ? 'Expand Panel' : 'Minimize Panel'"
        >
          <Plus v-if="isMinimized" class="w-3.5 h-3.5" />
          <Minus v-else class="w-3.5 h-3.5" />
        </button>

        <!-- Close Button -->
        <button 
          @click="close" 
          class="p-1 rounded-xs hover:bg-rose-950/50 text-ui-textMuted hover:text-rose-300 transition"
          title="Close (Esc)"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- Body Content (Hidden when minimized) -->
    <div v-show="!isMinimized" class="p-2.5 flex flex-col space-y-2.5 bg-ui-panel text-xs rounded-b-xs">
      <!-- Mode & Alignment Dual Row -->
      <div class="grid grid-cols-2 gap-2 bg-ui-input/80 border border-ui-borderSubtle rounded-xs p-1.5">
        <!-- Placement Mode: CAD Draw vs Place -->
        <div class="flex flex-col space-y-1">
          <span class="text-[10px] font-semibold text-ui-textMuted uppercase tracking-wider px-0.5">Mode</span>
          <div class="grid grid-cols-2 gap-1 bg-ui-surface p-0.5 rounded-xs border border-ui-borderSubtle">
            <button 
              @click="placementMode = PrimitivePlacementMode.CAD_DRAW" 
              class="py-1 rounded-xs text-[10px] font-medium transition text-center"
              :class="placementMode === PrimitivePlacementMode.CAD_DRAW ? 'bg-ui-active text-ui-textAccent border border-ui-accent/40 font-semibold shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary'"
              title="CAD Draw Mode: Click and drag footprint on any surface, then extrude height"
            >
              CAD Draw
            </button>
            <button 
              @click="placementMode = PrimitivePlacementMode.PLACE" 
              class="py-1 rounded-xs text-[10px] font-medium transition text-center"
              :class="placementMode === PrimitivePlacementMode.PLACE ? 'bg-ui-active text-ui-textAccent border border-ui-accent/40 font-semibold shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary'"
              title="Place Mode: One-click instant drop on any surface"
            >
              Direct
            </button>
          </div>
        </div>

        <!-- Surface Alignment: Surface Normal vs World -->
        <div class="flex flex-col space-y-1">
          <span class="text-[10px] font-semibold text-ui-textMuted uppercase tracking-wider px-0.5">Align To</span>
          <div class="grid grid-cols-2 gap-1 bg-ui-surface p-0.5 rounded-xs border border-ui-borderSubtle">
            <button 
              @click="orientation = 'SURFACE'" 
              class="py-1 rounded-xs text-[10px] font-medium transition text-center"
              :class="orientation === 'SURFACE' ? 'bg-ui-active text-ui-textAccent border border-ui-accent/40 font-semibold shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary'"
              title="Orient perpendicular to clicked surface normal"
            >
              Surface
            </button>
            <button 
              @click="orientation = 'WORLD'" 
              class="py-1 rounded-xs text-[10px] font-medium transition text-center"
              :class="orientation === 'WORLD' ? 'bg-ui-active text-ui-textAccent border border-ui-accent/40 font-semibold shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary'"
              title="Align upright to World axes"
            >
              World
            </button>
          </div>
        </div>
      </div>

      <!-- Search Input -->
      <div class="relative">
        <Search class="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ui-textMuted pointer-events-none" />
        <input 
          v-model="searchQuery"
          type="text" 
          placeholder="Filter primitives (cube, stairs, arch, cone)..." 
          class="w-full bg-ui-input border border-ui-borderSubtle hover:border-ui-borderDefault focus:border-ui-accent rounded-xs pl-8 pr-3 py-1.5 text-xs text-ui-textPrimary placeholder-ui-textMuted focus:outline-none transition font-sans"
        />
      </div>

      <!-- Category Tabs (When Not Searching) -->
      <div v-if="!searchQuery" class="flex items-center space-x-1 bg-ui-input/60 p-0.5 rounded-xs border border-ui-borderSubtle">
        <button 
          @click="activeTab = 'basic'"
          class="flex-1 py-1 px-2 rounded-xs text-[11px] font-medium transition flex items-center justify-center space-x-1.5"
          :class="activeTab === 'basic' ? 'bg-ui-surface text-ui-textPrimary border border-ui-borderDefault shadow-xs font-semibold' : 'text-ui-textMuted hover:text-ui-textSecondary hover:bg-ui-hover'"
        >
          <Box class="w-3 h-3 text-amber-400" />
          <span>Basic</span>
        </button>

        <button 
          @click="activeTab = 'shapes'"
          class="flex-1 py-1 px-2 rounded-xs text-[11px] font-medium transition flex items-center justify-center space-x-1.5"
          :class="activeTab === 'shapes' ? 'bg-ui-surface text-ui-textPrimary border border-ui-borderDefault shadow-xs font-semibold' : 'text-ui-textMuted hover:text-ui-textSecondary hover:bg-ui-hover'"
        >
          <Shapes class="w-3 h-3 text-sky-400" />
          <span>Shapes</span>
        </button>

        <button 
          @click="activeTab = 'build'"
          class="flex-1 py-1 px-2 rounded-xs text-[11px] font-medium transition flex items-center justify-center space-x-1.5"
          :class="activeTab === 'build' ? 'bg-ui-surface text-ui-textPrimary border border-ui-borderDefault shadow-xs font-semibold' : 'text-ui-textMuted hover:text-ui-textSecondary hover:bg-ui-hover'"
        >
          <Building2 class="w-3 h-3 text-emerald-400" />
          <span>CAD Build</span>
        </button>
      </div>

      <!-- Grid of Primitives -->
      <div class="grid grid-cols-2 gap-1.5 max-h-60 overflow-y-auto pr-0.5">
        <button 
          v-for="item in filteredPrimitives" 
          :key="item.type"
          @click="selectPrimitive(item.type)"
          class="px-2.5 py-1.5 rounded bg-ui-surface hover:bg-ui-hover border border-ui-borderSubtle hover:border-amber-500/50 flex items-center space-x-2.5 transition active:scale-[0.98] text-left group shadow-xs"
        >
          <div class="flex items-center justify-center shrink-0">
            <BlenderIcon :name="(item.icon as any)" :size="18" :color="item.color" />
          </div>

          <div class="flex flex-col min-w-0 flex-1">
            <span class="font-semibold text-ui-textPrimary group-hover:text-amber-300 text-xs truncate transition">{{ item.label }}</span>
            <span class="text-[10px] text-ui-textMuted truncate">{{ item.desc }}</span>
          </div>
        </button>
      </div>

      <!-- Footer Info -->
      <div class="pt-1.5 border-t border-ui-borderSubtle text-[10px] text-ui-textMuted font-mono flex items-center justify-between">
        <span class="flex items-center gap-1">
          <kbd class="px-1 py-0.5 bg-ui-input rounded-xs border border-ui-borderSubtle text-ui-textSecondary">Shift+A</kbd> toggle panel
        </span>
        <span class="text-ui-textMuted">Click surface to draw</span>
      </div>
    </div>
  </div>
</template>
