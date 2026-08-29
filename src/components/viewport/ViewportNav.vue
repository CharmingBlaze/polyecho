<script setup lang="ts">
import { useToolStore } from '../../stores/toolStore'
import { useAnimationStore } from '../../stores/animationStore'
import BlenderIcon from '../icons/BlenderIcon.vue'
import { Tv, LayoutGrid } from 'lucide-vue-next'

const toolStore = useToolStore()
const animationStore = useAnimationStore()

const emit = defineEmits<{
  (e: 'setCameraView', view: 'persp' | 'top' | 'front' | 'right' | 'iso'): void
}>()
</script>

<template>
  <div class="h-8 bg-dcc-850 border-b border-dcc-750 px-3 flex items-center justify-between text-xs text-slate-300 select-none z-10">
    <!-- Left: 3D Viewport Title & Quick Camera View Selector -->
    <div class="flex items-center space-x-2 shrink-0">
      <div class="flex items-center space-x-1.5 font-mono font-bold text-slate-200 text-[11px]">
        <BlenderIcon name="mesh-cube" :size="13" color="#f59e0b" />
        <span>3D Viewport</span>
      </div>

      <!-- Quick View Dropdown Selector -->
      <div v-if="!toolStore.viewport.quadView" class="flex items-center bg-dcc-900 rounded px-1.5 py-0.5 border border-dcc-750 font-mono text-[10px]">
        <span class="text-slate-500 mr-1">View:</span>
        <select 
          @change="emit('setCameraView', ($event.target as HTMLSelectElement).value as any)"
          class="bg-transparent text-indigo-400 font-bold focus:outline-none cursor-pointer"
        >
          <option value="persp" class="bg-dcc-850 text-slate-200">Perspective</option>
          <option value="top" class="bg-dcc-850 text-slate-200">Top Ortho (Num 7)</option>
          <option value="front" class="bg-dcc-850 text-slate-200">Front Ortho (Num 1)</option>
          <option value="right" class="bg-dcc-850 text-slate-200">Right Ortho (Num 3)</option>
          <option value="iso" class="bg-dcc-850 text-slate-200">Isometric (Num 0)</option>
        </select>
      </div>

      <div v-else class="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30">
        Quad View (Top / Front / Right / Persp)
      </div>
    </div>

    <!-- Right: Shading Modes, X-Ray, Bones & Quad View -->
    <div class="flex items-center space-x-2 shrink-0">
      <!-- Shading Modes -->
      <div class="flex items-center bg-dcc-900 rounded p-0.5 border border-dcc-750">
        <button 
          @click="toolStore.viewport.shading = 'textured'" 
          class="px-2 py-0.5 rounded text-[10px] font-mono flex items-center space-x-1 transition"
          :class="toolStore.viewport.shading === 'textured' ? 'bg-indigo-600 text-white font-bold shadow-xs' : 'text-slate-400 hover:text-slate-200'"
          title="Textured Shading"
        >
          <BlenderIcon name="shading-textured" :size="12" />
          <span>Tex</span>
        </button>

        <button 
          @click="toolStore.viewport.shading = 'solid'" 
          class="px-2 py-0.5 rounded text-[10px] font-mono flex items-center space-x-1 transition"
          :class="toolStore.viewport.shading === 'solid' ? 'bg-indigo-600 text-white font-bold shadow-xs' : 'text-slate-400 hover:text-slate-200'"
          title="Solid Shading"
        >
          <BlenderIcon name="shading-solid" :size="12" />
          <span>Solid</span>
        </button>

        <button 
          @click="toolStore.viewport.shading = 'wireframe'" 
          class="px-2 py-0.5 rounded text-[10px] font-mono flex items-center space-x-1 transition"
          :class="toolStore.viewport.shading === 'wireframe' ? 'bg-indigo-600 text-white font-bold shadow-xs' : 'text-slate-400 hover:text-slate-200'"
          title="Wireframe Mode"
        >
          <BlenderIcon name="shading-wire" :size="12" />
          <span>Wire</span>
        </button>

        <button 
          @click="toolStore.viewport.shading = 'psx'" 
          class="px-2 py-0.5 rounded text-[10px] font-mono flex items-center space-x-1 transition"
          :class="toolStore.viewport.shading === 'psx' ? 'bg-indigo-600 text-white font-bold shadow-xs' : 'text-slate-400 hover:text-slate-200'"
          title="PSX Retro Preview"
        >
          <BlenderIcon name="shading-rendered" :size="12" />
          <span>PSX</span>
        </button>
      </div>

      <!-- Flat vs Smooth Shading Mode Selector -->
      <div class="flex items-center bg-dcc-900 rounded p-0.5 border border-dcc-750">
        <button 
          @click="toolStore.viewport.shadeMode = 'flat'" 
          class="px-2 py-0.5 rounded text-[10px] font-mono flex items-center space-x-1 transition"
          :class="toolStore.viewport.shadeMode === 'flat' ? 'bg-amber-600 text-white font-bold shadow-xs' : 'text-slate-400 hover:text-slate-200'"
          title="Flat Shading (Face Normals - Low-Poly Default)"
        >
          <span>Flat</span>
        </button>

        <button 
          @click="toolStore.viewport.shadeMode = 'smooth'" 
          class="px-2 py-0.5 rounded text-[10px] font-mono flex items-center space-x-1 transition"
          :class="toolStore.viewport.shadeMode === 'smooth' ? 'bg-amber-600 text-white font-bold shadow-xs' : 'text-slate-400 hover:text-slate-200'"
          title="Smooth Shading (Interpolated Vertex Normals)"
        >
          <span>Smooth</span>
        </button>
      </div>

      <!-- Blender X-Ray Toggle -->
      <button 
        @click="toolStore.viewport.xray = !toolStore.viewport.xray"
        class="flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-mono transition border"
        :class="toolStore.viewport.xray ? 'bg-sky-500/30 text-sky-300 border-sky-400 shadow-xs' : 'bg-dcc-900 hover:bg-dcc-800 text-slate-400 border-dcc-750'"
        title="Toggle Blender X-Ray Mode (Alt+Z) - See through occluded mesh faces and vertices"
      >
        <BlenderIcon name="xray" :size="12" :color="toolStore.viewport.xray ? '#38bdf8' : '#94a3b8'" />
        <span>X-Ray</span>
      </button>

      <!-- Quad View Toggle Button -->
      <button 
        @click="toolStore.viewport.quadView = !toolStore.viewport.quadView"
        class="flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-mono transition border"
        :class="toolStore.viewport.quadView ? 'bg-amber-500 text-slate-950 font-bold border-amber-400 shadow-xs' : 'bg-dcc-900 hover:bg-dcc-800 text-slate-300 border-dcc-750'"
        title="Toggle Professional Quad View (Ctrl+Alt+Q / Numpad 5)"
      >
        <LayoutGrid class="w-3 h-3" />
        <span>Quad View</span>
      </button>

      <!-- Bone Visibility Toggle -->
      <button 
        @click="animationStore.showBones = !animationStore.showBones" 
        class="flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-mono transition border"
        :class="animationStore.showBones ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' : 'bg-dcc-900 border-dcc-750 text-slate-500'"
        title="Toggle Bone Skeleton Visibility"
      >
        <BlenderIcon name="bone" :size="12" />
        <span>Bones</span>
        <BlenderIcon v-if="animationStore.showBones" name="eye-open" :size="12" color="#67e8f9" />
        <BlenderIcon v-else name="eye-closed" :size="12" color="#64748b" />
      </button>

      <!-- Invert Zoom (Trackpad/Wheel) Toggle -->
      <button 
        @click="toolStore.viewport.invertZoom = !toolStore.viewport.invertZoom"
        class="flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-mono transition border"
        :class="toolStore.viewport.invertZoom ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/50' : 'bg-dcc-900 border-dcc-750 text-slate-400 hover:text-slate-200'"
        title="Toggle Invert Zoom Direction (Ideal for laptop two-finger trackpad & natural scrolling)"
      >
        <span>Inv Zoom</span>
      </button>

      <!-- CRT Overlay -->
      <button 
        @click="toolStore.viewport.crtFilter = !toolStore.viewport.crtFilter" 
        class="p-1 rounded hover:bg-dcc-750 text-slate-400 hover:text-slate-200 transition"
        :class="{ 'text-amber-400': toolStore.viewport.crtFilter }"
        title="Toggle CRT Scanline Overlay"
      >
        <Tv class="w-3.5 h-3.5" />
      </button>
    </div>
  </div>
</template>
