<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { PrimitiveType } from '../../core/primitives/PrimitiveTypes'
import { PrimitivePlacementMode } from '../../core/operators/placement/PrimitivePlacementOperator'
import { PlacementOrientation } from '../../core/placement/SurfacePlacementSolver'
import BlenderIcon from '../icons/BlenderIcon.vue'
import { X, Search, Sparkles, Box, Shapes, Building2 } from 'lucide-vue-next'

const visible = ref(false)
const position = ref({ x: 100, y: 100 })
const activeTab = ref<'basic' | 'shapes' | 'build'>('basic')
const searchQuery = ref('')

const placementMode = ref<PrimitivePlacementMode>(PrimitivePlacementMode.CAD_DRAW)
const orientation = ref<PlacementOrientation>('WORLD')

interface PrimitiveItem {
  type: PrimitiveType
  label: string
  desc: string
  category: 'basic' | 'shapes' | 'build'
  icon: any
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

function openAt(x: number, y: number) {
  const panelWidth = 380
  const panelHeight = 440
  const clampedX = Math.min(x, window.innerWidth - panelWidth - 20)
  const clampedY = Math.min(y, window.innerHeight - panelHeight - 20)
  position.value = { x: Math.max(20, clampedX), y: Math.max(20, clampedY) }
  searchQuery.value = ''
  visible.value = true
}

function close() {
  visible.value = false
}

function selectPrimitive(type: PrimitiveType) {
  window.dispatchEvent(
    new CustomEvent('blender-modal-op', {
      detail: {
        tool: 'primitive',
        primitiveType: type,
        mode: placementMode.value,
        orientation: orientation.value
      }
    })
  )
  close()
}

let lastMousePos = { x: window.innerWidth / 2 - 190, y: window.innerHeight / 2 - 200 }

function handleGlobalPointerMove(e: PointerEvent) {
  lastMousePos = { x: e.clientX, y: e.clientY }
}

function handleGlobalKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && visible.value) {
    e.preventDefault()
    e.stopPropagation()
    close()
    return
  }
  if (e.shiftKey && (e.key === 'A' || e.key === 'a') && !e.ctrlKey && !e.altKey) {
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
    e.preventDefault()
    e.stopPropagation()
    openAt(lastMousePos.x, lastMousePos.y)
  }
}

function handleOpenEvent(e: any) {
  if (e && e.detail) {
    openAt(e.detail.x ?? lastMousePos.x, e.detail.y ?? lastMousePos.y)
  }
}

onMounted(() => {
  window.addEventListener('pointermove', handleGlobalPointerMove)
  window.addEventListener('keydown', handleGlobalKeyDown, true)
  window.addEventListener('open-add-primitive-menu', handleOpenEvent)
})

onUnmounted(() => {
  window.removeEventListener('pointermove', handleGlobalPointerMove)
  window.removeEventListener('keydown', handleGlobalKeyDown, true)
  window.removeEventListener('open-add-primitive-menu', handleOpenEvent)
})

defineExpose({
  openAt,
  close
})
</script>

<template>
  <div 
    v-if="visible" 
    class="fixed inset-0 z-50 select-none"
    @click="close"
    @contextmenu.prevent="close"
  >
    <!-- Floating Glassmorphism Modal Panel -->
    <div 
      class="absolute bg-dcc-900/95 backdrop-blur-xl border border-dcc-700/80 shadow-2xl rounded-xl p-3 flex flex-col text-xs text-slate-200 w-[370px] animate-in fade-in zoom-in-95 duration-100 ring-1 ring-white/10"
      :style="{ left: `${position.x}px`, top: `${position.y}px` }"
      @click.stop
    >
      <!-- Header Bar with Title & Close -->
      <div class="flex items-center justify-between pb-2 border-b border-dcc-750/70 mb-2.5">
        <div class="flex items-center space-x-2">
          <div class="w-6 h-6 rounded-lg bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-300">
            <Sparkles class="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 class="font-bold text-slate-100 text-xs tracking-wide">Add Primitive</h3>
            <span class="text-[10px] text-slate-400 font-mono">16 Unified Mesh Generators</span>
          </div>
        </div>

        <button 
          @click="close" 
          class="p-1 rounded-lg hover:bg-dcc-750 text-slate-400 hover:text-white transition"
          title="Close (Esc)"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Touch/Stylus Workflow & Orientation Switches -->
      <div class="grid grid-cols-2 gap-2 bg-dcc-850/80 border border-dcc-750 rounded-lg p-1.5 mb-2.5">
        <!-- Workflow: CAD vs Place -->
        <div class="flex flex-col space-y-1">
          <span class="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-wider px-1">Workflow</span>
          <div class="grid grid-cols-2 gap-1 bg-dcc-900 p-0.5 rounded-md border border-dcc-750/70">
            <button 
              @click="placementMode = PrimitivePlacementMode.CAD_DRAW" 
              class="py-1 rounded text-[10px] font-bold transition flex items-center justify-center space-x-1"
              :class="placementMode === PrimitivePlacementMode.CAD_DRAW ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'"
              title="CAD Draw Mode (Interactive 2-stage drag & extrusion)"
            >
              <span>CAD Draw</span>
            </button>
            <button 
              @click="placementMode = PrimitivePlacementMode.PLACE" 
              class="py-1 rounded text-[10px] font-bold transition flex items-center justify-center space-x-1"
              :class="placementMode === PrimitivePlacementMode.PLACE ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'"
              title="Place Mode (Instant drop on grid / surface)"
            >
              <span>Place</span>
            </button>
          </div>
        </div>

        <!-- Orientation: World vs Surface -->
        <div class="flex flex-col space-y-1">
          <span class="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-wider px-1">Align To</span>
          <div class="grid grid-cols-2 gap-1 bg-dcc-900 p-0.5 rounded-md border border-dcc-750/70">
            <button 
              @click="orientation = 'WORLD'" 
              class="py-1 rounded text-[10px] font-bold transition flex items-center justify-center space-x-1"
              :class="orientation === 'WORLD' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'"
              title="Align upright to World Grid"
            >
              <span>World</span>
            </button>
            <button 
              @click="orientation = 'SURFACE'" 
              class="py-1 rounded text-[10px] font-bold transition flex items-center justify-center space-x-1"
              :class="orientation === 'SURFACE' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'"
              title="Align perpendicular to Surface Normal"
            >
              <span>Surface</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Search Input -->
      <div class="relative mb-2.5">
        <Search class="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input 
          v-model="searchQuery"
          type="text" 
          placeholder="Search primitives (e.g. cylinder, stairs, box)..." 
          class="w-full bg-dcc-850/90 border border-dcc-750 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition font-sans"
        />
      </div>

      <!-- Category Tabs (When Not Searching) -->
      <div v-if="!searchQuery" class="flex items-center space-x-1 mb-2 bg-dcc-850/60 p-0.5 rounded-lg border border-dcc-750/60">
        <button 
          @click="activeTab = 'basic'"
          class="flex-1 py-1 px-2 rounded-md text-[11px] font-bold transition flex items-center justify-center space-x-1.5"
          :class="activeTab === 'basic' ? 'bg-dcc-750 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200 hover:bg-dcc-800'"
        >
          <Box class="w-3 h-3 text-amber-400" />
          <span>Basic</span>
        </button>

        <button 
          @click="activeTab = 'shapes'"
          class="flex-1 py-1 px-2 rounded-md text-[11px] font-bold transition flex items-center justify-center space-x-1.5"
          :class="activeTab === 'shapes' ? 'bg-dcc-750 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200 hover:bg-dcc-800'"
        >
          <Shapes class="w-3 h-3 text-sky-400" />
          <span>Shapes</span>
        </button>

        <button 
          @click="activeTab = 'build'"
          class="flex-1 py-1 px-2 rounded-md text-[11px] font-bold transition flex items-center justify-center space-x-1.5"
          :class="activeTab === 'build' ? 'bg-dcc-750 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200 hover:bg-dcc-800'"
        >
          <Building2 class="w-3 h-3 text-emerald-400" />
          <span>Build</span>
        </button>
      </div>

      <!-- Touch & Stylus Friendly Primitive Grid Cards -->
      <div class="grid grid-cols-2 gap-1.5 max-h-56 overflow-y-auto pr-0.5 custom-scrollbar">
        <button 
          v-for="item in filteredPrimitives" 
          :key="item.type"
          @click="selectPrimitive(item.type)"
          class="group p-2 rounded-lg bg-dcc-850 hover:bg-dcc-750/90 border border-dcc-750 hover:border-indigo-500/60 flex items-center space-x-2.5 transition active:scale-[0.98] text-left"
        >
          <div 
            class="w-7 h-7 rounded-md bg-dcc-900 border border-dcc-700/80 flex items-center justify-center shrink-0 group-hover:scale-105 transition shadow-inner"
          >
            <BlenderIcon :name="item.icon" :size="16" :color="item.color" />
          </div>

          <div class="flex flex-col min-w-0 flex-1">
            <span class="font-bold text-slate-200 group-hover:text-white text-xs truncate">{{ item.label }}</span>
            <span class="text-[9px] text-slate-400 truncate">{{ item.desc }}</span>
          </div>
        </button>
      </div>

      <!-- Footer Hotkey & Stylus Hint -->
      <div class="pt-2 mt-2 border-t border-dcc-750/70 text-[10px] text-slate-400 font-mono flex items-center justify-between">
        <span class="flex items-center gap-1">
          <kbd class="px-1.5 py-0.5 bg-dcc-800 rounded border border-dcc-700 text-slate-300">Shift+A</kbd> to summon
        </span>
        <span class="text-slate-500">Touch & Stylus Ready</span>
      </div>
    </div>
  </div>
</template>
