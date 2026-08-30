<script setup lang="ts">
import { ref } from 'vue'
import { useToolStore } from '../../stores/toolStore'
import { useAnimationStore } from '../../stores/animationStore'
import { useProjectStore } from '../../stores/projectStore'
import BlenderIcon from '../icons/BlenderIcon.vue'
import { Tv, LayoutGrid, ChevronDown } from 'lucide-vue-next'

const toolStore = useToolStore()
const animationStore = useAnimationStore()
const projectStore = useProjectStore()

const showModeMenu = ref(false)

const emit = defineEmits<{
  (e: 'setCameraView', view: 'persp' | 'top' | 'front' | 'right' | 'iso'): void
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
</script>

<template>
  <div class="h-ui-toolbar bg-ui-panel border-b border-ui-borderSubtle px-2 flex items-center justify-between text-xs text-ui-textSecondary select-none z-10 font-mono">
    <!-- Left: Blender Interaction Mode Selector & Component Selectors -->
    <div class="flex items-center space-x-1.5 shrink-0">
      <!-- Mode Dropdown Pill -->
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

      <!-- Edit Mode Component Selectors (Vertices, Edges, Faces) -->
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

      <!-- Quick View Dropdown Selector -->
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

      <div v-else class="text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-xs border border-amber-500/30">
        Quad View
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

      <!-- X-Ray Mode Toggle (Blender Alt+Z) -->
      <button 
        @click="toolStore.viewport.xray = !toolStore.viewport.xray" 
        class="flex items-center space-x-1 px-1.5 py-0.5 rounded-xs border text-[10px] transition"
        :class="toolStore.viewport.xray ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-bold shadow-xs' : 'bg-ui-input text-ui-textMuted border-ui-borderDefault hover:text-ui-textPrimary'"
        title="Toggle X-Ray (Translucent Mesh & Occluded Selection) (Alt+Z)"
      >
        <BlenderIcon name="xray" :size="11" :color="toolStore.viewport.xray ? '#f59e0b' : 'currentColor'" />
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
