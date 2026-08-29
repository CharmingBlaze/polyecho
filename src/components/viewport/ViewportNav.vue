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
  <div class="h-ui-toolbar bg-ui-panel border-b border-ui-borderSubtle px-2 flex items-center justify-between text-xs text-ui-textSecondary select-none z-10 font-mono">
    <!-- Left: 3D Viewport Title & Quick Camera View Selector -->
    <div class="flex items-center space-x-2 shrink-0">
      <div class="flex items-center space-x-1.5 font-bold text-ui-textPrimary text-[11px]">
        <BlenderIcon name="mesh-cube" :size="12" color="#f59e0b" />
        <span>3D Viewport</span>
      </div>

      <!-- Quick View Dropdown Selector -->
      <div v-if="!toolStore.viewport.quadView" class="flex items-center bg-ui-input rounded-xs px-1.5 py-0.5 border border-ui-borderDefault text-[10px]">
        <span class="text-ui-textMuted mr-1">View:</span>
        <select 
          @change="emit('setCameraView', ($event.target as HTMLSelectElement).value as any)"
          class="bg-transparent text-ui-textAccent font-bold focus:outline-none cursor-pointer"
        >
          <option value="persp" class="bg-ui-panel text-ui-textPrimary">Perspective</option>
          <option value="top" class="bg-ui-panel text-ui-textPrimary">Top Ortho (Num 7)</option>
          <option value="front" class="bg-ui-panel text-ui-textPrimary">Front Ortho (Num 1)</option>
          <option value="right" class="bg-ui-panel text-ui-textPrimary">Right Ortho (Num 3)</option>
          <option value="iso" class="bg-ui-panel text-ui-textPrimary">Isometric (Num 0)</option>
        </select>
      </div>

      <div v-else class="text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-xs border border-amber-500/30">
        Quad View (Top / Front / Right / Persp)
      </div>
    </div>

    <!-- Right: Shading Modes, X-Ray, Bones & Quad View (In-Viewport Controls) -->
    <div class="flex items-center space-x-1.5 shrink-0">
      <!-- Shading Modes -->
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

      <!-- Flat vs Smooth Shading Mode Selector -->
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

      <!-- X-Ray Mode Toggle -->
      <button 
        @click="toolStore.viewport.xray = !toolStore.viewport.xray" 
        class="flex items-center space-x-1 px-1.5 py-0.5 rounded-xs border text-[10px] transition"
        :class="toolStore.viewport.xray ? 'bg-ui-accentSubtle text-ui-textAccent border-ui-accent/40 font-bold shadow-xs' : 'bg-ui-input text-ui-textMuted border-ui-borderDefault hover:text-ui-textPrimary'"
        title="Toggle X-Ray (Translucent Mesh)"
      >
        <BlenderIcon name="xray" :size="11" />
        <span>X-Ray</span>
      </button>

      <!-- Quad View Toggle -->
      <button 
        @click="toolStore.viewport.quadView = !toolStore.viewport.quadView" 
        class="flex items-center space-x-1 px-1.5 py-0.5 rounded-xs border text-[10px] transition"
        :class="toolStore.viewport.quadView ? 'bg-ui-accentSubtle text-ui-textAccent border-ui-accent/40 font-bold shadow-xs' : 'bg-ui-input text-ui-textMuted border-ui-borderDefault hover:text-ui-textPrimary'"
        title="Toggle Quad View (Top/Front/Right/Persp)"
      >
        <LayoutGrid class="w-3 h-3" />
        <span>Quad</span>
      </button>

      <!-- Toggle Bones Visibility -->
      <button 
        @click="animationStore.showBones = !animationStore.showBones"
        class="flex items-center space-x-1 px-1.5 py-0.5 rounded-xs border text-[10px] transition"
        :class="animationStore.showBones ? 'bg-ui-accentSubtle text-ui-textAccent border-ui-accent/40 font-bold shadow-xs' : 'bg-ui-input text-ui-textMuted border-ui-borderDefault hover:text-ui-textPrimary'"
        title="Toggle Bone Overlay in Viewport"
      >
        <BlenderIcon name="bone" :size="11" />
        <span>Bones</span>
      </button>

      <!-- Invert Zoom Preference -->
      <button 
        @click="toolStore.viewport.invertZoom = !toolStore.viewport.invertZoom"
        class="flex items-center space-x-1 px-1.5 py-0.5 rounded-xs border text-[10px] transition"
        :class="toolStore.viewport.invertZoom ? 'bg-ui-accentSubtle text-ui-textAccent border-ui-accent/40 font-bold shadow-xs' : 'bg-ui-input text-ui-textMuted border-ui-borderDefault hover:text-ui-textPrimary'"
        title="Toggle Invert Zoom Direction"
      >
        <span>Inv Zoom</span>
      </button>

      <!-- Reset Camera Button -->
      <button 
        @click="emit('setCameraView', 'persp')"
        title="Reset Camera (Home)"
        class="p-1 text-ui-textMuted hover:text-ui-textPrimary rounded-xs bg-ui-input border border-ui-borderDefault hover:bg-ui-hover transition"
      >
        <Tv class="w-3 h-3" />
      </button>
    </div>
  </div>
</template>
