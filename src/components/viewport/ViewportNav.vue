<script setup lang="ts">
import { ref } from 'vue'
import { useToolStore } from '../../stores/toolStore'
import { useAnimationStore } from '../../stores/animationStore'
import { useProjectStore } from '../../stores/projectStore'
import BlenderIcon from '../icons/BlenderIcon.vue'
import { 
  LayoutGrid, 
  ChevronDown,
  Magnet,
  Crosshair,
  Search,
  Layers,
  Compass,
  Check,
  FlipHorizontal
} from 'lucide-vue-next'

const toolStore = useToolStore()
const animationStore = useAnimationStore()
const projectStore = useProjectStore()

const showModeMenu = ref(false)
const showOrientationMenu = ref(false)
const showPivotMenu = ref(false)
const showSnapMenu = ref(false)
const showOverlaysMenu = ref(false)

const emit = defineEmits<{
  (e: 'setCameraView', view: 'persp' | 'top' | 'front' | 'right' | 'iso'): void
  (e: 'openCommandPalette'): void
}>()

function setEditMode(mode: 'vertex' | 'edge' | 'face') {
  toolStore.selectMode = mode
  projectStore.clearSubSelections()
}

function setInteractionMode(mode: 'object' | 'edit' | 'uvpaint' | 'rig' | 'animate') {
  if (mode === 'object') {
    toolStore.setAppMode('model')
    toolStore.selectMode = 'object'
  } else if (mode === 'edit') {
    toolStore.setAppMode('model')
    if (toolStore.selectMode === 'object' || toolStore.selectMode === 'origin') {
      toolStore.selectMode = 'face'
    }
  } else if (mode === 'uvpaint') {
    toolStore.setAppMode('uvpaint')
  } else if (mode === 'rig') {
    toolStore.setAppMode('rig')
  } else if (mode === 'animate') {
    toolStore.setAppMode('animate')
  }
  showModeMenu.value = false
}

function triggerCommandPalette() {
  window.dispatchEvent(new CustomEvent('open-command-palette'))
}
</script>

<template>
  <div class="h-ui-toolbar bg-ui-panel border-b border-ui-borderSubtle px-2 flex items-center justify-between text-xs text-ui-textSecondary select-none z-10 font-mono gap-2 overflow-x-auto custom-scrollbar">
    <!-- Left: Interaction Mode, Component Selectors, Transform Orientation, Pivot, Snapping & Symmetry -->
    <div class="flex items-center space-x-1.5 shrink-0">
      <!-- 1. Mode Dropdown Pill -->
      <div class="relative">
        <button 
          @click="showModeMenu = !showModeMenu"
          class="h-6 px-2 bg-ui-input hover:bg-ui-hover text-ui-textPrimary border border-ui-borderDefault rounded-xs flex items-center space-x-1.5 font-bold text-[11px] transition shadow-xs"
        >
          <BlenderIcon 
            :name="toolStore.selectMode === 'object' ? 'mesh-cube' : toolStore.appMode === 'animate' ? 'bone' : 'vertex-select'" 
            :size="12" 
            :color="toolStore.selectMode === 'object' ? '#f59e0b' : '#38bdf8'" 
          />
          <span>
            {{ toolStore.appMode === 'animate' ? 'Pose Mode' : toolStore.appMode === 'rig' ? 'Rig Mode' : toolStore.appMode === 'uvpaint' ? 'Paint Mode' : toolStore.selectMode === 'object' ? 'Object Mode' : 'Edit Mode' }}
          </span>
          <ChevronDown class="w-3 h-3 text-ui-textMuted" />
        </button>

        <div 
          v-if="showModeMenu"
          class="absolute left-0 top-full mt-1 w-44 bg-[#1c1f26] border border-ui-borderStrong rounded-xs shadow-2xl z-50 p-1 divide-y divide-ui-borderSubtle text-xs"
        >
          <div class="py-0.5">
            <button 
              @click="setInteractionMode('object')" 
              class="w-full text-left px-2 py-1.5 hover:bg-ui-hover rounded-xs flex items-center justify-between"
              :class="{ 'text-amber-400 font-bold': toolStore.selectMode === 'object' && toolStore.appMode === 'model' }"
            >
              <div class="flex items-center gap-2">
                <BlenderIcon name="mesh-cube" :size="12" color="#f59e0b" />
                <span>Object Mode</span>
              </div>
              <span class="text-[10px] text-ui-textMuted font-mono">Tab</span>
            </button>

            <button 
              @click="setInteractionMode('edit')" 
              class="w-full text-left px-2 py-1.5 hover:bg-ui-hover rounded-xs flex items-center justify-between"
              :class="{ 'text-sky-400 font-bold': toolStore.selectMode !== 'object' && toolStore.appMode === 'model' }"
            >
              <div class="flex items-center gap-2">
                <BlenderIcon name="vertex-select" :size="12" color="#38bdf8" />
                <span>Edit Mode</span>
              </div>
              <span class="text-[10px] text-ui-textMuted font-mono">Tab</span>
            </button>
          </div>

          <div class="py-0.5">
            <button 
              @click="setInteractionMode('uvpaint')" 
              class="w-full text-left px-2 py-1.5 hover:bg-ui-hover rounded-xs flex items-center gap-2 text-ui-textPrimary"
            >
              <BlenderIcon name="uv" :size="12" color="#34d399" />
              <span>Texture Paint</span>
            </button>

            <button 
              @click="setInteractionMode('rig')" 
              class="w-full text-left px-2 py-1.5 hover:bg-ui-hover rounded-xs flex items-center gap-2 text-ui-textPrimary"
            >
              <BlenderIcon name="bone" :size="12" color="#a855f7" />
              <span>Rigging Mode</span>
            </button>

            <button 
              @click="setInteractionMode('animate')" 
              class="w-full text-left px-2 py-1.5 hover:bg-ui-hover rounded-xs flex items-center gap-2 text-ui-textPrimary"
            >
              <BlenderIcon name="keyframe" :size="12" color="#ec4899" />
              <span>Pose Mode</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 2. Edit Mode Component Selectors (Vertices, Edges, Faces, Bones) -->
      <div 
        v-if="toolStore.appMode === 'model' && toolStore.selectMode !== 'object'"
        class="flex items-center bg-ui-input rounded-xs p-0.5 border border-ui-borderDefault"
      >
        <button 
          @click="setEditMode('vertex')" 
          class="px-1.5 py-0.5 rounded-xs text-[10px] flex items-center space-x-1 transition"
          :class="toolStore.selectMode === 'vertex' ? 'bg-ui-active text-ui-textPrimary font-bold border border-ui-borderStrong shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary'"
          title="Vertex Select (1)"
        >
          <BlenderIcon name="vertex-select" :size="11" />
          <span>1</span>
        </button>

        <button 
          @click="setEditMode('edge')" 
          class="px-1.5 py-0.5 rounded-xs text-[10px] flex items-center space-x-1 transition"
          :class="toolStore.selectMode === 'edge' ? 'bg-ui-active text-ui-textPrimary font-bold border border-ui-borderStrong shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary'"
          title="Edge Select (2)"
        >
          <BlenderIcon name="edge-select" :size="11" />
          <span>2</span>
        </button>

        <button 
          @click="setEditMode('face')" 
          class="px-1.5 py-0.5 rounded-xs text-[10px] flex items-center space-x-1 transition"
          :class="toolStore.selectMode === 'face' ? 'bg-ui-active text-ui-textPrimary font-bold border border-ui-borderStrong shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary'"
          title="Face Select (3)"
        >
          <BlenderIcon name="face-select" :size="11" />
          <span>3</span>
        </button>

        <button 
          @click="toolStore.selectMode = 'bone'" 
          class="px-1.5 py-0.5 rounded-xs text-[10px] flex items-center space-x-1 transition"
          :class="toolStore.selectMode === 'bone' ? 'bg-ui-active text-ui-textPrimary font-bold border border-ui-borderStrong shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary'"
          title="Bone Select (6)"
        >
          <BlenderIcon name="bone" :size="11" />
          <span>6</span>
        </button>
      </div>

      <!-- 3. Transform Orientation Dropdown (Global, Local, Normal, View) -->
      <div class="relative">
        <button 
          @click="showOrientationMenu = !showOrientationMenu; showPivotMenu = false; showSnapMenu = false"
          class="h-6 px-1.5 bg-ui-input hover:bg-ui-hover text-ui-textPrimary border border-ui-borderDefault rounded-xs flex items-center space-x-1 text-[10px] font-mono transition"
          title="Transform Orientation (Global, Local, Normal, View)"
        >
          <Compass class="w-3 h-3 text-sky-400" />
          <span class="capitalize">{{ toolStore.transformOrientation }}</span>
          <ChevronDown class="w-2.5 h-2.5 text-ui-textMuted" />
        </button>

        <div 
          v-if="showOrientationMenu"
          class="absolute left-0 top-full mt-1 w-32 bg-[#1c1f26] border border-ui-borderStrong rounded-xs shadow-2xl z-50 p-1 text-[11px]"
        >
          <button 
            v-for="ori in (['global', 'local', 'normal', 'view', 'cursor'] as const)"
            :key="ori"
            @click="toolStore.transformOrientation = ori; showOrientationMenu = false"
            class="w-full text-left px-2 py-1 hover:bg-ui-hover rounded-xs flex items-center justify-between capitalize"
            :class="{ 'text-sky-400 font-bold': toolStore.transformOrientation === ori }"
          >
            <span>{{ ori }}</span>
            <Check v-if="toolStore.transformOrientation === ori" class="w-3 h-3 text-sky-400" />
          </button>
        </div>
      </div>

      <!-- 4. Transform Pivot Point Dropdown (Median Point, Individual, Cursor) -->
      <div class="relative">
        <button 
          @click="showPivotMenu = !showPivotMenu; showOrientationMenu = false; showSnapMenu = false"
          class="h-6 px-1.5 bg-ui-input hover:bg-ui-hover text-ui-textPrimary border border-ui-borderDefault rounded-xs flex items-center space-x-1 text-[10px] font-mono transition"
          title="Pivot Point (Median Point, Individual Origins, 3D Cursor)"
        >
          <Crosshair class="w-3 h-3 text-amber-400" />
          <span class="capitalize">{{ toolStore.pivotPoint === 'median' ? 'Median' : toolStore.pivotPoint === 'individual' ? 'Indiv' : 'Cursor' }}</span>
          <ChevronDown class="w-2.5 h-2.5 text-ui-textMuted" />
        </button>

        <div 
          v-if="showPivotMenu"
          class="absolute left-0 top-full mt-1 w-36 bg-[#1c1f26] border border-ui-borderStrong rounded-xs shadow-2xl z-50 p-1 text-[11px]"
        >
          <button 
            v-for="piv in ([
              { id: 'median', label: 'Median Point' },
              { id: 'individual', label: 'Individual Origins' },
              { id: 'cursor', label: '3D Cursor' }
            ] as const)"
            :key="piv.id"
            @click="toolStore.pivotPoint = piv.id; showPivotMenu = false"
            class="w-full text-left px-2 py-1 hover:bg-ui-hover rounded-xs flex items-center justify-between"
            :class="{ 'text-amber-400 font-bold': toolStore.pivotPoint === piv.id }"
          >
            <span>{{ piv.label }}</span>
            <Check v-if="toolStore.pivotPoint === piv.id" class="w-3 h-3 text-amber-400" />
          </button>
        </div>
      </div>

      <!-- 5. Snapping Controls & Magnet Toggle (Shift+Tab) -->
      <div class="flex items-center bg-ui-input rounded-xs border border-ui-borderDefault p-0.5">
        <button 
          @click="toolStore.snapping.grid = !toolStore.snapping.grid"
          class="px-1.5 py-0.5 rounded-xs text-[10px] flex items-center space-x-1 transition"
          :class="toolStore.snapping.grid ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/50 shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary'"
          title="Toggle Snapping (Shift+Tab)"
        >
          <Magnet class="w-3 h-3" :class="toolStore.snapping.grid ? 'text-amber-400' : 'text-slate-400'" />
          <span class="text-[9px]">{{ toolStore.snapping.gridSize }}m</span>
        </button>

        <div class="relative">
          <button 
            @click="showSnapMenu = !showSnapMenu; showOrientationMenu = false; showPivotMenu = false"
            class="px-1 py-0.5 hover:bg-ui-hover rounded-xs text-ui-textMuted hover:text-ui-textPrimary"
            title="Snapping Settings & Step Size"
          >
            <ChevronDown class="w-2.5 h-2.5" />
          </button>

          <div 
            v-if="showSnapMenu"
            class="absolute left-0 top-full mt-1 w-44 bg-[#1c1f26] border border-ui-borderStrong rounded-xs shadow-2xl z-50 p-1.5 space-y-1.5 text-[11px]"
          >
            <div class="text-[10px] text-ui-textMuted font-bold uppercase tracking-wider px-1">Snap Grid Size</div>
            <div class="grid grid-cols-4 gap-1 px-1">
              <button 
                v-for="sz in [0.1, 0.25, 0.5, 1.0]"
                :key="sz"
                @click="toolStore.snapping.gridSize = sz; showSnapMenu = false"
                class="py-0.5 text-center rounded-xs border text-[10px]"
                :class="toolStore.snapping.gridSize === sz ? 'bg-amber-500/20 text-amber-300 border-amber-500/60 font-bold' : 'bg-ui-input border-ui-borderSubtle text-ui-textMuted hover:text-white'"
              >
                {{ sz }}m
              </button>
            </div>

            <div class="border-t border-ui-borderSubtle pt-1.5 space-y-1 px-1">
              <div class="text-[10px] text-ui-textMuted font-bold uppercase tracking-wider">Snap Targets</div>
              <label class="flex items-center justify-between cursor-pointer py-0.5">
                <span class="text-slate-300">Vertex Snap</span>
                <input type="checkbox" v-model="toolStore.snapping.vertex" class="rounded-xs text-amber-500" />
              </label>
              <label class="flex items-center justify-between cursor-pointer py-0.5">
                <span class="text-slate-300">Edge Midpoint</span>
                <input type="checkbox" v-model="toolStore.snapping.edge" class="rounded-xs text-amber-500" />
              </label>
            </div>
          </div>
        </div>
      </div>

      <!-- 6. Mesh Symmetry / Mirror X Real-Time Toggle -->
      <button 
        @click="toolStore.viewport.symmetryX = !toolStore.viewport.symmetryX"
        class="h-6 px-1.5 rounded-xs border text-[10px] flex items-center space-x-1 transition"
        :class="toolStore.viewport.symmetryX ? 'bg-amber-500/20 text-amber-300 border-amber-500/60 font-bold shadow-xs' : 'bg-ui-input text-ui-textMuted border-ui-borderDefault hover:text-ui-textPrimary'"
        title="Live X-Axis Mesh Symmetry / Mirror Modeling"
      >
        <FlipHorizontal class="w-3 h-3" :class="toolStore.viewport.symmetryX ? 'text-amber-400' : 'text-slate-400'" />
        <span>Sym X</span>
      </button>
    </div>

    <!-- Center: Camera Quick View Selector -->
    <div class="flex items-center space-x-1.5 shrink-0">
      <div v-if="!toolStore.viewport.quadView" class="flex items-center bg-ui-input rounded-xs px-1.5 py-0.5 border border-ui-borderDefault text-[10px]">
        <span class="text-ui-textMuted mr-1">View:</span>
        <select 
          @change="emit('setCameraView', ($event.target as HTMLSelectElement).value as any)"
          class="bg-transparent text-ui-textAccent font-bold focus:outline-none cursor-pointer"
        >
          <option value="persp" class="bg-ui-panel text-ui-textPrimary">User Perspective</option>
          <option value="top" class="bg-ui-panel text-ui-textPrimary">Top Ortho (Num 7)</option>
          <option value="front" class="bg-ui-panel text-ui-textPrimary">Front Ortho (Num 1)</option>
          <option value="right" class="bg-ui-panel text-ui-textPrimary">Right Ortho (Num 3)</option>
          <option value="iso" class="bg-ui-panel text-ui-textPrimary">Isometric (Num 0)</option>
        </select>
      </div>

      <div v-else class="text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-xs border border-amber-500/30 font-bold">
        Quad View
      </div>
    </div>

    <!-- Right: Overlays, Shading, X-Ray, Bones, Search Palette & Quad Toggle -->
    <div class="flex items-center space-x-1.5 shrink-0">
      <!-- 1. Viewport Overlays Dropdown (Diagnostics, Face Orientation, Grid, Wireframe Opacity) -->
      <div class="relative">
        <button 
          @click="showOverlaysMenu = !showOverlaysMenu"
          class="h-6 px-1.5 bg-ui-input hover:bg-ui-hover text-ui-textPrimary border border-ui-borderDefault rounded-xs flex items-center space-x-1 text-[10px] font-mono transition"
          :class="{ 'border-sky-500/50 text-sky-300 font-bold': toolStore.viewport.faceOrientation }"
          title="Viewport Overlays & Diagnostics (Face Orientation, Grid, Axes)"
        >
          <Layers class="w-3 h-3 text-sky-400" />
          <span>Overlays</span>
          <ChevronDown class="w-2.5 h-2.5 text-ui-textMuted" />
        </button>

        <div 
          v-if="showOverlaysMenu"
          class="absolute right-0 top-full mt-1 w-52 bg-[#1c1f26] border border-ui-borderStrong rounded-xs shadow-2xl z-50 p-2 space-y-2 text-[11px]"
        >
          <div class="text-[10px] text-ui-textMuted font-bold uppercase tracking-wider">Geometry Overlays</div>
          
          <!-- Face Orientation Check (Cobalt Blue vs Crimson Red) -->
          <label class="flex items-center justify-between cursor-pointer py-0.5 hover:bg-ui-hover px-1 rounded-xs">
            <div class="flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full" :class="toolStore.viewport.faceOrientation ? 'bg-sky-400' : 'bg-slate-600'"></span>
              <span class="text-slate-200 font-medium">Face Orientation</span>
            </div>
            <input type="checkbox" v-model="toolStore.viewport.faceOrientation" class="rounded-xs text-sky-500" />
          </label>

          <label class="flex items-center justify-between cursor-pointer py-0.5 hover:bg-ui-hover px-1 rounded-xs">
            <span class="text-slate-300">Show 3D Grid</span>
            <input type="checkbox" v-model="toolStore.viewport.showGrid" class="rounded-xs text-amber-500" />
          </label>

          <label class="flex items-center justify-between cursor-pointer py-0.5 hover:bg-ui-hover px-1 rounded-xs">
            <span class="text-slate-300">Show World Axes</span>
            <input type="checkbox" v-model="toolStore.viewport.showAxes" class="rounded-xs text-amber-500" />
          </label>

          <label class="flex items-center justify-between cursor-pointer py-0.5 hover:bg-ui-hover px-1 rounded-xs">
            <span class="text-slate-300">Show Bones</span>
            <input type="checkbox" v-model="animationStore.showBones" class="rounded-xs text-amber-500" />
          </label>

          <!-- Wireframe Opacity -->
          <div class="border-t border-ui-borderSubtle pt-1.5 space-y-1">
            <div class="flex items-center justify-between text-[10px] text-ui-textMuted">
              <span>Wireframe Opacity</span>
              <span class="font-mono">{{ Math.round(toolStore.viewport.wireframeOpacity * 100) }}%</span>
            </div>
            <input 
              type="range" 
              min="0.1" 
              max="1.0" 
              step="0.05"
              v-model.number="toolStore.viewport.wireframeOpacity" 
              class="w-full h-1 bg-ui-borderStrong rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
          </div>
        </div>
      </div>

      <!-- 2. Shading Modes -->
      <div class="flex items-center bg-ui-input rounded-xs p-0.5 border border-ui-borderDefault">
        <button 
          @click="toolStore.viewport.shading = 'textured'" 
          class="px-1.5 py-0.5 rounded-xs text-[10px] flex items-center space-x-1 transition"
          :class="toolStore.viewport.shading === 'textured' ? 'bg-ui-active text-ui-textPrimary font-bold border border-ui-borderStrong shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary'"
          title="Textured Shading"
        >
          <BlenderIcon name="shading-textured" :size="11" />
          <span>Tex</span>
        </button>

        <button 
          @click="toolStore.viewport.shading = 'solid'" 
          class="px-1.5 py-0.5 rounded-xs text-[10px] flex items-center space-x-1 transition"
          :class="toolStore.viewport.shading === 'solid' ? 'bg-ui-active text-ui-textPrimary font-bold border border-ui-borderStrong shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary'"
          title="Solid Shading"
        >
          <BlenderIcon name="shading-solid" :size="11" />
          <span>Solid</span>
        </button>

        <button 
          @click="toolStore.viewport.shading = 'wireframe'" 
          class="px-1.5 py-0.5 rounded-xs text-[10px] flex items-center space-x-1 transition"
          :class="toolStore.viewport.shading === 'wireframe' ? 'bg-ui-active text-ui-textPrimary font-bold border border-ui-borderStrong shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary'"
          title="Wireframe Mode"
        >
          <BlenderIcon name="shading-wire" :size="11" />
          <span>Wire</span>
        </button>

        <button 
          @click="toolStore.viewport.shading = 'psx'" 
          class="px-1.5 py-0.5 rounded-xs text-[10px] flex items-center space-x-1 transition"
          :class="toolStore.viewport.shading === 'psx' ? 'bg-ui-active text-ui-textPrimary font-bold border border-ui-borderStrong shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary'"
          title="PSX Retro Preview"
        >
          <BlenderIcon name="shading-rendered" :size="11" />
          <span>PSX</span>
        </button>
      </div>

      <!-- 3. Flat vs Smooth Shading Mode Selector -->
      <div class="flex items-center bg-ui-input rounded-xs p-0.5 border border-ui-borderDefault">
        <button 
          @click="toolStore.viewport.shadeMode = 'flat'" 
          class="px-1.5 py-0.5 rounded-xs text-[10px] flex items-center space-x-1 transition"
          :class="toolStore.viewport.shadeMode === 'flat' ? 'bg-ui-active text-ui-textPrimary font-bold border border-ui-borderStrong shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary'"
          title="Flat Shading (Face Normals - Low-Poly Default)"
        >
          <span>Flat</span>
        </button>

        <button 
          @click="toolStore.viewport.shadeMode = 'smooth'" 
          class="px-1.5 py-0.5 rounded-xs text-[10px] flex items-center space-x-1 transition"
          :class="toolStore.viewport.shadeMode === 'smooth' ? 'bg-ui-active text-ui-textPrimary font-bold border border-ui-borderStrong shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary'"
          title="Smooth Shading (Vertex Normals)"
        >
          <span>Smooth</span>
        </button>
      </div>

      <!-- 4. X-Ray Mode Toggle (Blender Alt+Z) -->
      <button 
        @click="toolStore.viewport.xray = !toolStore.viewport.xray" 
        class="flex items-center space-x-1 px-1.5 py-0.5 rounded-xs border text-[10px] transition"
        :class="toolStore.viewport.xray ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-bold shadow-xs' : 'bg-ui-input text-ui-textMuted border-ui-borderDefault hover:text-ui-textPrimary'"
        title="Toggle X-Ray (Translucent Mesh & Occluded Selection) (Alt+Z)"
      >
        <BlenderIcon name="xray" :size="11" :color="toolStore.viewport.xray ? '#f59e0b' : 'currentColor'" />
        <span>X-Ray</span>
      </button>

      <!-- 5. Quick Command Search Palette Trigger (F3 / Space) -->
      <button 
        @click="triggerCommandPalette"
        class="p-1 text-ui-textMuted hover:text-ui-textPrimary rounded-xs bg-ui-input border border-ui-borderDefault hover:bg-ui-hover transition"
        title="Command Search Menu (F3 / Space)"
      >
        <Search class="w-3 h-3 text-amber-400" />
      </button>

      <!-- 6. Quad View Toggle -->
      <button 
        @click="toolStore.viewport.quadView = !toolStore.viewport.quadView" 
        class="flex items-center space-x-1 px-1.5 py-0.5 rounded-xs border text-[10px] transition"
        :class="toolStore.viewport.quadView ? 'bg-ui-accentSubtle text-ui-textAccent border-ui-accent/40 font-bold shadow-xs' : 'bg-ui-input text-ui-textMuted border-ui-borderDefault hover:text-ui-textPrimary'"
        title="Toggle Quad View (Top/Front/Right/Persp) (Ctrl+Alt+Q)"
      >
        <LayoutGrid class="w-3 h-3" />
        <span>Quad</span>
      </button>
    </div>
  </div>
</template>
