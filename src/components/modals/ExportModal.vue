<script setup lang="ts">
import { ref } from 'vue'
import * as THREE from 'three'
import { useProjectStore } from '../../stores/projectStore'
import { exportToOBJ, exportToMTL } from '../../core/export/ObjExport'
import { exportToGLTF } from '../../core/export/GltfExport'
import { renderSpriteSheet } from '../../core/export/SpriteSheet'
import { useAnimationStore } from '../../stores/animationStore'

const projectStore = useProjectStore()
const animationStore = useAnimationStore()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const activeTab = ref<'gltf' | 'obj' | 'spritesheet' | 'texture'>('gltf')

// Sprite sheet options
const spriteSize = ref<number>(64)
const spriteDirections = ref<number>(8)
const spriteIsoAngle = ref<number>(30)

function downloadFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

async function handleExportGLTF(binary: boolean) {
  const tex = new THREE.CanvasTexture(projectStore.pixelBuffer.canvas)
  const textureMap = new Map<string, THREE.Texture>()
  textureMap.set('default_material', tex)

  const blob = await exportToGLTF(projectStore.meshes, textureMap, animationStore.armature.clips, binary)
  downloadFile(blob, `${projectStore.projectName}.${binary ? 'glb' : 'gltf'}`)
  emit('close')
}

function handleExportOBJ() {
  const objText = exportToOBJ(projectStore.meshes, `${projectStore.projectName}.mtl`)
  const mtlText = exportToMTL('default_material', `${projectStore.projectName}_texture.png`)

  // Download OBJ
  const objBlob = new Blob([objText], { type: 'text/plain' })
  downloadFile(objBlob, `${projectStore.projectName}.obj`)

  // Download MTL
  const mtlBlob = new Blob([mtlText], { type: 'text/plain' })
  downloadFile(mtlBlob, `${projectStore.projectName}.mtl`)

  // Download Texture PNG
  handleExportTexture()
  emit('close')
}

function handleExportTexture() {
  projectStore.pixelBuffer.canvas.toBlob((blob) => {
    if (blob) {
      downloadFile(blob, `${projectStore.projectName}_texture.png`)
    }
  })
}

function handleExportSpriteSheet() {
  const tex = new THREE.CanvasTexture(projectStore.pixelBuffer.canvas)
  const textureMap = new Map<string, THREE.Texture>()
  textureMap.set('default_material', tex)

  const canvas = renderSpriteSheet(projectStore.meshes, textureMap, {
    frameWidth: spriteSize.value,
    frameHeight: spriteSize.value,
    directions: spriteDirections.value,
    framesPerDir: 1,
    isoAngle: spriteIsoAngle.value
  })

  canvas.toBlob((blob) => {
    if (blob) {
      downloadFile(blob, `${projectStore.projectName}_spritesheet_${spriteDirections.value}dir.png`)
      emit('close')
    }
  })
}
</script>

<template>
  <div class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 select-none">
    <div class="bg-dcc-850 border border-dcc-700 rounded-xl w-[500px] shadow-2xl overflow-hidden flex flex-col">
      <!-- Modal Header -->
      <div class="h-12 bg-dcc-900 border-b border-dcc-750 px-4 flex items-center justify-between">
        <div class="flex items-center space-x-2">
          <Download class="w-4 h-4 text-indigo-400" />
          <span class="font-bold text-sm text-slate-200 font-mono">Export Game Assets</span>
        </div>
        <button @click="$emit('close')" class="p-1 rounded text-slate-400 hover:text-white hover:bg-dcc-750">
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Format Tabs -->
      <div class="grid grid-cols-4 bg-dcc-800 border-b border-dcc-750 text-xs font-mono">
        <button 
          @click="activeTab = 'gltf'" 
          class="py-2.5 flex items-center justify-center gap-1.5 transition"
          :class="activeTab === 'gltf' ? 'bg-dcc-850 text-white font-bold border-b-2 border-indigo-500' : 'text-slate-400 hover:text-slate-200'"
        >
          <Box class="w-3.5 h-3.5" />
          <span>GLTF / GLB</span>
        </button>
        <button 
          @click="activeTab = 'obj'" 
          class="py-2.5 flex items-center justify-center gap-1.5 transition"
          :class="activeTab === 'obj' ? 'bg-dcc-850 text-white font-bold border-b-2 border-indigo-500' : 'text-slate-400 hover:text-slate-200'"
        >
          <span>OBJ + MTL</span>
        </button>
        <button 
          @click="activeTab = 'spritesheet'" 
          class="py-2.5 flex items-center justify-center gap-1.5 transition"
          :class="activeTab === 'spritesheet' ? 'bg-dcc-850 text-white font-bold border-b-2 border-indigo-500' : 'text-slate-400 hover:text-slate-200'"
        >
          <Sparkles class="w-3.5 h-3.5 text-amber-400" />
          <span>Sprite Sheet</span>
        </button>
        <button 
          @click="activeTab = 'texture'" 
          class="py-2.5 flex items-center justify-center gap-1.5 transition"
          :class="activeTab === 'texture' ? 'bg-dcc-850 text-white font-bold border-b-2 border-indigo-500' : 'text-slate-400 hover:text-slate-200'"
        >
          <Image class="w-3.5 h-3.5" />
          <span>Texture PNG</span>
        </button>
      </div>

      <!-- Content Panels -->
      <div class="p-5 text-xs text-slate-300">
        <!-- GLTF Section -->
        <div v-if="activeTab === 'gltf'" class="flex flex-col space-y-4">
          <p class="text-slate-400 leading-relaxed">
            Exports standard glTF 2.0 / GLB file compatible with Godot, Unity, Unreal Engine, Three.js, and web engines. Includes mesh geometries, UV coordinates, and pixel textures.
          </p>
          <div class="flex gap-2">
            <button 
              @click="handleExportGLTF(true)"
              class="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold shadow transition"
            >
              Export Binary (.GLB)
            </button>
            <button 
              @click="handleExportGLTF(false)"
              class="flex-1 py-2.5 bg-dcc-750 hover:bg-dcc-700 text-slate-200 rounded-lg font-semibold shadow transition"
            >
              Export JSON (.gltf)
            </button>
          </div>
        </div>

        <!-- OBJ Section -->
        <div v-else-if="activeTab === 'obj'" class="flex flex-col space-y-4">
          <p class="text-slate-400 leading-relaxed">
            Exports Wavefront OBJ geometry, MTL material definition, and embedded PNG pixel texture map. Universally supported by Blender, 3ds Max, and game engines.
          </p>
          <button 
            @click="handleExportOBJ"
            class="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold shadow transition"
          >
            Export OBJ + MTL + PNG
          </button>
        </div>

        <!-- Sprite Sheet Section -->
        <div v-else-if="activeTab === 'spritesheet'" class="flex flex-col space-y-3">
          <p class="text-slate-400 leading-relaxed">
            Bakes your 3D low-poly model into an 8-directional or isometric 2D retro pixel-art sprite sheet ready for top-down or RPG games.
          </p>

          <div class="grid grid-cols-2 gap-3 py-2">
            <label class="flex flex-col space-y-1">
              <span class="font-mono text-slate-400">Frame Size:</span>
              <select v-model="spriteSize" class="bg-dcc-900 border border-dcc-700 rounded p-1.5 font-mono text-xs">
                <option :value="32">32 x 32 px</option>
                <option :value="64">64 x 64 px</option>
                <option :value="128">128 x 128 px</option>
              </select>
            </label>

            <label class="flex flex-col space-y-1">
              <span class="font-mono text-slate-400">Directions:</span>
              <select v-model="spriteDirections" class="bg-dcc-900 border border-dcc-700 rounded p-1.5 font-mono text-xs">
                <option :value="4">4 Directions</option>
                <option :value="8">8 Directions (Octagonal)</option>
              </select>
            </label>
          </div>

          <button 
            @click="handleExportSpriteSheet"
            class="w-full py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-semibold shadow transition"
          >
            Generate & Download Sprite Sheet
          </button>
        </div>

        <!-- Texture PNG Section -->
        <div v-else-if="activeTab === 'texture'" class="flex flex-col space-y-4">
          <p class="text-slate-400 leading-relaxed">
            Downloads the raw pixel art canvas texture as a standalone PNG with nearest-neighbor crisp pixel edges.
          </p>
          <button 
            @click="handleExportTexture"
            class="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold shadow transition"
          >
            Download Texture PNG
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
