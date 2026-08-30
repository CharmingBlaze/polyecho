<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useToolStore } from '../../stores/toolStore'
import { useProjectStore } from '../../stores/projectStore'
import BlenderIcon from '../icons/BlenderIcon.vue'

export type PieMenuType = 'shading' | 'mode' | 'snap'

const toolStore = useToolStore()
const projectStore = useProjectStore()

const visible = ref(false)
const menuType = ref<PieMenuType>('shading')
const position = ref<{ x: number; y: number }>({ x: 0, y: 0 })

let lastMouseX = typeof window !== 'undefined' ? window.innerWidth / 2 : 500
let lastMouseY = typeof window !== 'undefined' ? window.innerHeight / 2 : 400

function onPointerMove(e: MouseEvent) {
  lastMouseX = e.clientX
  lastMouseY = e.clientY
}

function openPie(type: PieMenuType) {
  menuType.value = type
  position.value = {
    x: Math.max(120, Math.min(window.innerWidth - 120, lastMouseX)),
    y: Math.max(120, Math.min(window.innerHeight - 120, lastMouseY))
  }
  visible.value = true
}

function closePie() {
  visible.value = false
}

// ------------------------------------
// PIE ACTIONS
// ------------------------------------
function setShading(shading: 'psx' | 'solid' | 'textured' | 'wireframe') {
  toolStore.viewport.shading = shading
  closePie()
}

function setInteractionMode(mode: 'object' | 'edit' | 'uvpaint' | 'animate') {
  if (mode === 'object') {
    toolStore.setAppMode('model')
    toolStore.selectMode = 'object'
  } else if (mode === 'edit') {
    toolStore.setAppMode('model')
    if (toolStore.selectMode === 'object') toolStore.selectMode = 'face'
  } else if (mode === 'uvpaint') {
    toolStore.setAppMode('uvpaint')
  } else if (mode === 'animate') {
    toolStore.setAppMode('animate')
  }
  closePie()
}

function handleSnap(action: 'sel-grid' | 'sel-cursor' | 'cursor-origin' | 'cursor-sel') {
  if (action === 'sel-grid') {
    const mesh = projectStore.activeMesh
    if (mesh) {
      projectStore.recordState('Snap Selection to Grid')
      mesh.position.x = Math.round(mesh.position.x)
      mesh.position.y = Math.round(mesh.position.y)
      mesh.position.z = Math.round(mesh.position.z)
    }
  } else if (action === 'cursor-origin') {
    projectStore.recordState('Cursor to World Origin')
    toolStore.cursor3D = { x: 0, y: 0, z: 0 }
  } else if (action === 'cursor-sel') {
    const mesh = projectStore.activeMesh
    if (mesh) {
      toolStore.cursor3D = { ...mesh.position }
    }
  } else if (action === 'sel-cursor') {
    const mesh = projectStore.activeMesh
    if (mesh) {
      projectStore.recordState('Selection to Cursor')
      mesh.position = { ...toolStore.cursor3D }
    }
  }
  closePie()
}

function handleKeyDown(e: KeyboardEvent) {
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
    return
  }

  // Z key: Shading Pie Menu (if no modifiers)
  if ((e.key === 'z' || e.key === 'Z') && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
    e.preventDefault()
    if (visible.value && menuType.value === 'shading') {
      closePie()
    } else {
      openPie('shading')
    }
    return
  }

  // Shift + S: Snap Pie Menu
  if ((e.key === 's' || e.key === 'S') && e.shiftKey && !e.ctrlKey && !e.metaKey) {
    e.preventDefault()
    if (visible.value && menuType.value === 'snap') {
      closePie()
    } else {
      openPie('snap')
    }
    return
  }

  // Ctrl + Tab: Mode Pie Menu
  if (e.key === 'Tab' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    if (visible.value && menuType.value === 'mode') {
      closePie()
    } else {
      openPie('mode')
    }
    return
  }

  if (visible.value && (e.key === 'Escape' || e.key === ' ')) {
    closePie()
  }
}

onMounted(() => {
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <div 
    v-if="visible" 
    class="fixed inset-0 z-50 select-none bg-black/25 backdrop-blur-[1px]"
    @pointerdown.self="closePie"
    @contextmenu.prevent="closePie"
  >
    <div 
      class="absolute -translate-x-1/2 -translate-y-1/2 w-72 h-72 pointer-events-none flex items-center justify-center font-sans text-xs"
      :style="{ left: `${position.x}px`, top: `${position.y}px` }"
    >
      <!-- Center Ring / Pivot Indicator -->
      <div class="w-8 h-8 rounded-full border-2 border-ui-accent/80 bg-ui-header/90 flex items-center justify-center shadow-lg">
        <div class="w-2 h-2 rounded-full bg-ui-accent"></div>
      </div>

      <!-- 1. SHADING PIE MENU (Z) -->
      <template v-if="menuType === 'shading'">
        <!-- NORTH: Rendered (PSX) -->
        <button 
          @click="setShading('psx')"
          class="absolute top-2 left-1/2 -translate-x-1/2 pointer-events-auto px-3 py-1.5 bg-[#181a20]/95 hover:bg-ui-accent text-ui-textPrimary border border-ui-borderStrong rounded-xs flex items-center gap-2 shadow-xl transition active:scale-95"
          :class="{ 'border-ui-accent font-bold': toolStore.viewport.shading === 'psx' }"
        >
          <BlenderIcon name="shading-rendered" :size="13" color="#ec4899" />
          <span>Rendered (PSX)</span>
          <span class="text-[10px] text-ui-textMuted font-mono">8</span>
        </button>

        <!-- SOUTH: Wireframe -->
        <button 
          @click="setShading('wireframe')"
          class="absolute bottom-2 left-1/2 -translate-x-1/2 pointer-events-auto px-3 py-1.5 bg-[#181a20]/95 hover:bg-ui-accent text-ui-textPrimary border border-ui-borderStrong rounded-xs flex items-center gap-2 shadow-xl transition active:scale-95"
          :class="{ 'border-ui-accent font-bold': toolStore.viewport.shading === 'wireframe' }"
        >
          <BlenderIcon name="shading-wire" :size="13" color="#38bdf8" />
          <span>Wireframe</span>
          <span class="text-[10px] text-ui-textMuted font-mono">2</span>
        </button>

        <!-- WEST: Solid -->
        <button 
          @click="setShading('solid')"
          class="absolute left-0 top-1/2 -translate-y-1/2 pointer-events-auto px-3 py-1.5 bg-[#181a20]/95 hover:bg-ui-accent text-ui-textPrimary border border-ui-borderStrong rounded-xs flex items-center gap-2 shadow-xl transition active:scale-95"
          :class="{ 'border-ui-accent font-bold': toolStore.viewport.shading === 'solid' }"
        >
          <BlenderIcon name="shading-solid" :size="13" color="#fbbf24" />
          <span>Solid</span>
          <span class="text-[10px] text-ui-textMuted font-mono">4</span>
        </button>

        <!-- EAST: Material Preview / Textured -->
        <button 
          @click="setShading('textured')"
          class="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-auto px-3 py-1.5 bg-[#181a20]/95 hover:bg-ui-accent text-ui-textPrimary border border-ui-borderStrong rounded-xs flex items-center gap-2 shadow-xl transition active:scale-95"
          :class="{ 'border-ui-accent font-bold': toolStore.viewport.shading === 'textured' }"
        >
          <BlenderIcon name="shading-textured" :size="13" color="#34d399" />
          <span>Material Preview</span>
          <span class="text-[10px] text-ui-textMuted font-mono">6</span>
        </button>

        <!-- TOP-LEFT: Toggle X-Ray (Alt+Z) -->
        <button 
          @click="toolStore.viewport.xray = !toolStore.viewport.xray; closePie()"
          class="absolute top-10 left-2 pointer-events-auto px-2.5 py-1 bg-[#181a20]/95 hover:bg-amber-500/20 text-ui-textPrimary border border-ui-borderStrong hover:border-amber-500/50 rounded-xs flex items-center gap-1.5 shadow-xl transition active:scale-95 text-[11px]"
          :class="{ 'border-amber-500/60 bg-amber-500/20 text-amber-300 font-bold': toolStore.viewport.xray }"
        >
          <BlenderIcon name="xray" :size="12" :color="toolStore.viewport.xray ? '#f59e0b' : '#94a3b8'" />
          <span>Toggle X-Ray</span>
          <span class="text-[9px] text-ui-textMuted font-mono">Alt+Z</span>
        </button>
      </template>

      <!-- 2. MODE PIE MENU (Ctrl+Tab) -->
      <template v-else-if="menuType === 'mode'">
        <!-- NORTH: Edit Mode -->
        <button 
          @click="setInteractionMode('edit')"
          class="absolute top-2 left-1/2 -translate-x-1/2 pointer-events-auto px-3 py-1.5 bg-[#181a20]/95 hover:bg-ui-accent text-ui-textPrimary border border-ui-borderStrong rounded-xs flex items-center gap-2 shadow-xl transition active:scale-95"
        >
          <BlenderIcon name="vertex-select" :size="13" color="#38bdf8" />
          <span>Edit Mode</span>
        </button>

        <!-- SOUTH: Object Mode -->
        <button 
          @click="setInteractionMode('object')"
          class="absolute bottom-2 left-1/2 -translate-x-1/2 pointer-events-auto px-3 py-1.5 bg-[#181a20]/95 hover:bg-ui-accent text-ui-textPrimary border border-ui-borderStrong rounded-xs flex items-center gap-2 shadow-xl transition active:scale-95"
        >
          <BlenderIcon name="mesh-cube" :size="13" color="#f59e0b" />
          <span>Object Mode</span>
        </button>

        <!-- WEST: Texture Paint -->
        <button 
          @click="setInteractionMode('uvpaint')"
          class="absolute left-0 top-1/2 -translate-y-1/2 pointer-events-auto px-3 py-1.5 bg-[#181a20]/95 hover:bg-ui-accent text-ui-textPrimary border border-ui-borderStrong rounded-xs flex items-center gap-2 shadow-xl transition active:scale-95"
        >
          <BlenderIcon name="uv" :size="13" color="#34d399" />
          <span>Texture Paint</span>
        </button>

        <!-- EAST: Pose Mode -->
        <button 
          @click="setInteractionMode('animate')"
          class="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-auto px-3 py-1.5 bg-[#181a20]/95 hover:bg-ui-accent text-ui-textPrimary border border-ui-borderStrong rounded-xs flex items-center gap-2 shadow-xl transition active:scale-95"
        >
          <BlenderIcon name="keyframe" :size="13" color="#ec4899" />
          <span>Pose Mode</span>
        </button>
      </template>

      <!-- 3. SNAP / CURSOR PIE MENU (Shift+S) -->
      <template v-else-if="menuType === 'snap'">
        <!-- NORTH: Selection to Grid -->
        <button 
          @click="handleSnap('sel-grid')"
          class="absolute top-2 left-1/2 -translate-x-1/2 pointer-events-auto px-3 py-1.5 bg-[#181a20]/95 hover:bg-ui-accent text-ui-textPrimary border border-ui-borderStrong rounded-xs flex items-center gap-2 shadow-xl transition active:scale-95"
        >
          <span>Selection to Grid</span>
        </button>

        <!-- SOUTH: Cursor to World Origin -->
        <button 
          @click="handleSnap('cursor-origin')"
          class="absolute bottom-2 left-1/2 -translate-x-1/2 pointer-events-auto px-3 py-1.5 bg-[#181a20]/95 hover:bg-ui-accent text-ui-textPrimary border border-ui-borderStrong rounded-xs flex items-center gap-2 shadow-xl transition active:scale-95"
        >
          <span>Cursor to World Origin</span>
        </button>

        <!-- WEST: Selection to Cursor -->
        <button 
          @click="handleSnap('sel-cursor')"
          class="absolute left-0 top-1/2 -translate-y-1/2 pointer-events-auto px-3 py-1.5 bg-[#181a20]/95 hover:bg-ui-accent text-ui-textPrimary border border-ui-borderStrong rounded-xs flex items-center gap-2 shadow-xl transition active:scale-95"
        >
          <span>Selection to Cursor</span>
        </button>

        <!-- EAST: Cursor to Selected -->
        <button 
          @click="handleSnap('cursor-sel')"
          class="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-auto px-3 py-1.5 bg-[#181a20]/95 hover:bg-ui-accent text-ui-textPrimary border border-ui-borderStrong rounded-xs flex items-center gap-2 shadow-xl transition active:scale-95"
        >
          <span>Cursor to Selected</span>
        </button>
      </template>
    </div>
  </div>
</template>
