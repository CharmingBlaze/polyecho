<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import * as THREE from 'three'
import { useProjectStore } from '../../stores/projectStore'
import { exportToOBJ, exportToMTL } from '../../core/export/ObjExport'
import { exportToGLTF } from '../../core/export/GltfExport'
import { renderSpriteSheet } from '../../core/export/SpriteSheet'
import { useAnimationStore } from '../../stores/animationStore'
import { Download, X, Box, Sparkles, Image, Film } from 'lucide-vue-next'

const projectStore = useProjectStore()
const animationStore = useAnimationStore()

const emit = defineEmits<{
  (e: 'close'): void
}>()

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close')
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})

const activeTab = ref<'gltf' | 'obj' | 'spritesheet' | 'texture' | 'turntable'>('gltf')

// Turntable Video options
const turntableDuration = ref<number>(3)
const turntableFps = ref<number>(30)
const isRecordingTurntable = ref<boolean>(false)
const turntableProgress = ref<number>(0)

// Sprite sheet options
const spriteSize = ref<number>(64)
const spriteDirections = ref<number>(8)
const spriteIsoAngle = ref<number>(30)
const selectedClipId = ref<string>(animationStore.activeClip?.id || '')
const frameStep = ref<number>(1)

function downloadFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

async function handleExportGLTF(binary: boolean) {
  const textureMap = new Map<string, THREE.Texture>()
  for (const mat of projectStore.materials) {
    const texObj = projectStore.getTextureForMaterial(mat.id)
    if (texObj && texObj.pixelBuffer) {
      const tex = new THREE.CanvasTexture(texObj.pixelBuffer.canvas)
      textureMap.set(mat.id, tex)
    }
  }
  if (textureMap.size === 0) {
    const tex = new THREE.CanvasTexture(projectStore.pixelBuffer.canvas)
    textureMap.set('default_material', tex)
  }

  const blob = await exportToGLTF(
    projectStore.meshes, 
    textureMap, 
    animationStore.armature.clips, 
    binary,
    animationStore.armature
  )
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

  const targetClip = selectedClipId.value ? animationStore.armature.clips.find(c => c.id === selectedClipId.value) : null

  const canvas = renderSpriteSheet(projectStore.meshes, textureMap, {
    frameWidth: spriteSize.value,
    frameHeight: spriteSize.value,
    directions: spriteDirections.value,
    framesPerDir: targetClip ? Math.floor(targetClip.durationFrames / frameStep.value) + 1 : 1,
    isoAngle: spriteIsoAngle.value,
    clip: targetClip,
    armature: animationStore.armature,
    frameStep: frameStep.value
  })

  canvas.toBlob((blob) => {
    if (blob) {
      const clipSuffix = targetClip ? `_${targetClip.name}` : ''
      downloadFile(blob, `${projectStore.projectName}${clipSuffix}_spritesheet_${spriteDirections.value}dir.png`)
      emit('close')
    }
  })
}

async function handleExportTurntable() {
  const canvas = document.querySelector('canvas') as HTMLCanvasElement
  if (!canvas) {
    alert('3D viewport canvas not found')
    return
  }

  isRecordingTurntable.value = true
  turntableProgress.value = 0

  const stream = canvas.captureStream(turntableFps.value)
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm'
  const recorder = new MediaRecorder(stream, { mimeType })
  const chunks: Blob[] = []

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data)
  }

  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: 'video/webm' })
    downloadFile(blob, `${projectStore.projectName}_turntable_360.webm`)
    isRecordingTurntable.value = false
    emit('close')
  }

  recorder.start()

  const totalTime = turntableDuration.value * 1000
  const intervalTime = 100
  let elapsed = 0

  const progressInterval = setInterval(() => {
    elapsed += intervalTime
    turntableProgress.value = Math.min(100, Math.round((elapsed / totalTime) * 100))
    if (elapsed >= totalTime) {
      clearInterval(progressInterval)
      recorder.stop()
    }
  }, intervalTime)
}
</script>

<template>
  <div @click.self="$emit('close')" class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 select-none">
    <div class="bg-dcc-850 border border-dcc-700 rounded-xl w-[520px] shadow-2xl overflow-hidden flex flex-col">
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
      <div class="grid grid-cols-5 bg-dcc-800 border-b border-dcc-750 text-xs font-mono">
        <button 
          @click="activeTab = 'gltf'" 
          class="py-2.5 flex items-center justify-center gap-1.5 transition"
          :class="activeTab === 'gltf' ? 'bg-dcc-850 text-white font-bold border-b-2 border-indigo-500' : 'text-slate-400 hover:text-slate-200'"
        >
          <Box class="w-3.5 h-3.5" />
          <span>GLTF/GLB</span>
        </button>
        <button 
          @click="activeTab = 'obj'" 
          class="py-2.5 flex items-center justify-center gap-1.5 transition"
          :class="activeTab === 'obj' ? 'bg-dcc-850 text-white font-bold border-b-2 border-indigo-500' : 'text-slate-400 hover:text-slate-200'"
        >
          <span>OBJ+MTL</span>
        </button>
        <button 
          @click="activeTab = 'spritesheet'" 
          class="py-2.5 flex items-center justify-center gap-1.5 transition"
          :class="activeTab === 'spritesheet' ? 'bg-dcc-850 text-white font-bold border-b-2 border-indigo-500' : 'text-slate-400 hover:text-slate-200'"
        >
          <Sparkles class="w-3.5 h-3.5 text-amber-400" />
          <span>Sprites</span>
        </button>
        <button 
          @click="activeTab = 'texture'" 
          class="py-2.5 flex items-center justify-center gap-1.5 transition"
          :class="activeTab === 'texture' ? 'bg-dcc-850 text-white font-bold border-b-2 border-indigo-500' : 'text-slate-400 hover:text-slate-200'"
        >
          <Image class="w-3.5 h-3.5" />
          <span>Texture</span>
        </button>
        <button 
          @click="activeTab = 'turntable'" 
          class="py-2.5 flex items-center justify-center gap-1.5 transition"
          :class="activeTab === 'turntable' ? 'bg-dcc-850 text-white font-bold border-b-2 border-indigo-500' : 'text-slate-400 hover:text-slate-200'"
        >
          <Film class="w-3.5 h-3.5 text-rose-400" />
          <span>Turntable</span>
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
            Bakes your 3D low-poly model or animation clip into an 8-directional or isometric 2D retro pixel-art sprite sheet ready for top-down, tactical RPG, or billboard games.
          </p>

          <div class="grid grid-cols-2 gap-3 py-1">
            <label class="flex flex-col space-y-1">
              <span class="font-mono text-slate-400">Animation Clip:</span>
              <select v-model="selectedClipId" class="bg-dcc-900 border border-dcc-700 rounded p-1.5 font-mono text-xs text-amber-300">
                <option value="">Current Static Pose (1 frame)</option>
                <option v-for="c in animationStore.armature.clips" :key="c.id" :value="c.id">
                  {{ c.name }} ({{ c.durationFrames }} frames)
                </option>
              </select>
            </label>

            <label class="flex flex-col space-y-1">
              <span class="font-mono text-slate-400">Frame Sampling:</span>
              <select v-model="frameStep" class="bg-dcc-900 border border-dcc-700 rounded p-1.5 font-mono text-xs">
                <option :value="1">Every Frame (100% full rate)</option>
                <option :value="2">Every 2nd Frame (50% speed/retro)</option>
                <option :value="3">Every 3rd Frame (33% compact)</option>
              </select>
            </label>

            <label class="flex flex-col space-y-1">
              <span class="font-mono text-slate-400">Frame Size:</span>
              <select v-model="spriteSize" class="bg-dcc-900 border border-dcc-700 rounded p-1.5 font-mono text-xs">
                <option :value="32">32 x 32 px</option>
                <option :value="48">48 x 48 px</option>
                <option :value="64">64 x 64 px</option>
                <option :value="128">128 x 128 px</option>
              </select>
            </label>

            <label class="flex flex-col space-y-1">
              <span class="font-mono text-slate-400">Directions & Angle:</span>
              <select v-model="spriteDirections" class="bg-dcc-900 border border-dcc-700 rounded p-1.5 font-mono text-xs">
                <option :value="4">4 Directions (Cardinals)</option>
                <option :value="8">8 Directions (Octagonal)</option>
              </select>
            </label>
          </div>

          <div class="p-2 rounded bg-dcc-900/60 border border-dcc-750 flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>Camera Pitch Angle:</span>
            <div class="flex items-center gap-2">
              <button 
                @click="spriteIsoAngle = 30" 
                class="px-2 py-0.5 rounded text-[10px]"
                :class="spriteIsoAngle === 30 ? 'bg-indigo-600 text-white font-bold' : 'bg-dcc-800 text-slate-400 hover:text-white'"
              >
                30° Iso
              </button>
              <button 
                @click="spriteIsoAngle = 45" 
                class="px-2 py-0.5 rounded text-[10px]"
                :class="spriteIsoAngle === 45 ? 'bg-indigo-600 text-white font-bold' : 'bg-dcc-800 text-slate-400 hover:text-white'"
              >
                45° Dimetric
              </button>
              <button 
                @click="spriteIsoAngle = 0" 
                class="px-2 py-0.5 rounded text-[10px]"
                :class="spriteIsoAngle === 0 ? 'bg-indigo-600 text-white font-bold' : 'bg-dcc-800 text-slate-400 hover:text-white'"
              >
                0° Side / Billboard
              </button>
            </div>
          </div>

          <button 
            @click="handleExportSpriteSheet"
            class="w-full py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-semibold shadow transition"
          >
            Generate & Download Animated Sprite Sheet
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

        <!-- Turntable Video Section -->
        <div v-else-if="activeTab === 'turntable'" class="flex flex-col space-y-4">
          <p class="text-slate-400 leading-relaxed">
            Records a 360-degree turntable video of your 3D model directly from the canvas into high-quality WebM video.
          </p>
          <div class="grid grid-cols-2 gap-3">
            <label class="flex flex-col space-y-1">
              <span class="font-mono text-slate-400">Duration:</span>
              <select v-model="turntableDuration" class="bg-dcc-900 border border-dcc-700 rounded p-1.5 font-mono text-xs">
                <option :value="2">2 Seconds (Fast)</option>
                <option :value="3">3 Seconds (Standard)</option>
                <option :value="4">4 Seconds (Smooth)</option>
                <option :value="6">6 Seconds (Slow Pan)</option>
              </select>
            </label>

            <label class="flex flex-col space-y-1">
              <span class="font-mono text-slate-400">Frame Rate:</span>
              <select v-model="turntableFps" class="bg-dcc-900 border border-dcc-700 rounded p-1.5 font-mono text-xs">
                <option :value="24">24 FPS (Cinematic)</option>
                <option :value="30">30 FPS (Smooth)</option>
                <option :value="60">60 FPS (Ultra Smooth)</option>
              </select>
            </label>
          </div>

          <div v-if="isRecordingTurntable" class="p-3 bg-dcc-900 rounded border border-indigo-500/40 flex flex-col space-y-2">
            <div class="flex justify-between text-xs font-mono text-indigo-300">
              <span>Recording 360 Turntable...</span>
              <span>{{ turntableProgress }}%</span>
            </div>
            <div class="w-full bg-dcc-800 rounded-full h-1.5 overflow-hidden">
              <div class="bg-indigo-500 h-full transition-all duration-100" :style="{ width: `${turntableProgress}%` }"></div>
            </div>
          </div>

          <button 
            @click="handleExportTurntable"
            :disabled="isRecordingTurntable"
            class="w-full py-2.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-lg font-semibold shadow transition"
          >
            {{ isRecordingTurntable ? 'Recording Turntable Video...' : 'Record & Download 360 Turntable Video (.webm)' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
