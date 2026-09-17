<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { exportToOBJ, exportToMTL } from '../../core/export/ObjExport'
import { exportToGLTF, buildExportTextureMap } from '../../core/export/GltfExport'
import { exportToBlockbench } from '../../core/export/BlockbenchExport'
import { renderSpriteSheet } from '../../core/export/SpriteSheet'
import { pngFromCanvas } from '../../core/painting/encodePng'
import { saveBlobDocument, type DesktopFileFilter } from '../../core/desktop/desktopApi'
import { useAnimationStore } from '../../stores/animationStore'
import BlenderIcon from '../icons/BlenderIcon.vue'

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
  if (turntableInterval !== null) {
    clearInterval(turntableInterval)
    turntableInterval = null
  }
  if (activeRecorder && activeRecorder.state !== 'inactive') {
    activeRecorder.stop()
  }
  activeRecorder = null
})

const activeTab = ref<'gltf' | 'obj' | 'blockbench' | 'spritesheet' | 'texture' | 'turntable'>('gltf')

// Turntable Video options
const turntableDuration = ref<number>(3)
const turntableFps = ref<number>(30)
const isRecordingTurntable = ref<boolean>(false)
const turntableProgress = ref<number>(0)
let turntableInterval: ReturnType<typeof setInterval> | null = null
let activeRecorder: MediaRecorder | null = null

// Sprite sheet options
const spriteSize = ref<number>(64)
const spriteDirections = ref<number>(8)
const spriteIsoAngle = ref<number>(30)
const selectedClipId = ref<string>(animationStore.activeClip?.id || '')
const frameStep = ref<number>(1)

function filtersFor(filename: string): DesktopFileFilter[] {
  const ext = filename.split('.').pop()?.toLowerCase() || 'bin'
  return [{ name: ext.toUpperCase(), extensions: [ext] }]
}

async function downloadFile(blob: Blob, filename: string) {
  await saveBlobDocument(blob, filename, filtersFor(filename))
}

const isExportingGltf = ref(false)

async function handleExportGLTF(binary: boolean) {
  if (isExportingGltf.value) return
  isExportingGltf.value = true
  const textureMap = buildExportTextureMap(projectStore.textures)
  try {
    const blob = await exportToGLTF(
      projectStore.meshes, 
      textureMap, 
      animationStore.armature.clips, 
      binary,
      animationStore.armature,
      projectStore.materials
    )
    await downloadFile(blob, `${projectStore.projectName}.${binary ? 'glb' : 'gltf'}`)
    emit('close')
  } finally {
    for (const tex of textureMap.values()) {
      tex.dispose()
    }
    textureMap.clear()
    isExportingGltf.value = false
  }
}

function textureFileName(tex: { id: string; name: string }, used: Set<string>): string {
  const base = `${(tex.name || 'texture').replace(/[^\w.-]+/g, '_')}.png`
  if (!used.has(base)) {
    used.add(base)
    return base
  }
  const unique = `${(tex.name || 'texture').replace(/[^\w.-]+/g, '_')}_${tex.id.slice(-6)}.png`
  used.add(unique)
  return unique
}

function handleExportOBJ() {
  const usedNames = new Set<string>()
  const fileByTexId = new Map<string, string>()
  const mtlList = projectStore.materials.map(mat => {
    const texObj = mat.textureId ? projectStore.getTextureById(mat.textureId) : undefined
    let textureFileNameStr: string | undefined
    if (texObj) {
      if (!fileByTexId.has(texObj.id)) {
        fileByTexId.set(texObj.id, textureFileName(texObj, usedNames))
      }
      textureFileNameStr = fileByTexId.get(texObj.id)
    }
    return {
      id: mat.id,
      name: mat.name,
      color: mat.color,
      textureFileName: textureFileNameStr
    }
  })
  const nameMap = new Map(projectStore.materials.map(mat => [mat.id, mat.name] as const))
  const objText = exportToOBJ(projectStore.meshes, `${projectStore.projectName}.mtl`, nameMap)
  const mtlText = exportToMTL(mtlList)

  const objBlob = new Blob([objText], { type: 'text/plain' })
  downloadFile(objBlob, `${projectStore.projectName}.obj`)

  const mtlBlob = new Blob([mtlText], { type: 'text/plain' })
  downloadFile(mtlBlob, `${projectStore.projectName}.mtl`)

  for (const [texId, fileName] of fileByTexId) {
    const texObj = projectStore.getTextureById(texId)
    if (!texObj?.pixelBuffer) continue
    texObj.pixelBuffer.composite()
    const png = pngFromCanvas(texObj.pixelBuffer.canvas)
    if (png) {
      const bytes = new ArrayBuffer(png.byteLength)
      new Uint8Array(bytes).set(png)
      downloadFile(new Blob([bytes], { type: 'image/png' }), fileName)
    }
  }
  emit('close')
}

async function handleExportBlockbench() {
  const json = exportToBlockbench(
    projectStore.meshes,
    projectStore.textures,
    animationStore.armature,
    { projectName: projectStore.projectName }
  )
  await downloadFile(new Blob([json], { type: 'application/json' }), `${projectStore.projectName}.bbmodel`)
  emit('close')
}

function handleExportTexture() {
  const tex = projectStore.activeTexture
  const buf = tex?.pixelBuffer || projectStore.pixelBuffer
  if (!buf) return
  buf.composite()
  buf.canvas.toBlob((blob: Blob | null) => {
    if (blob) {
      const name = tex ? textureFileName(tex, new Set()) : `${projectStore.projectName}_texture.png`
      downloadFile(blob, name)
    }
  })
}

function handleExportSpriteSheet() {
  const textureMap = buildExportTextureMap(projectStore.textures)

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
  }, projectStore.materials)

  for (const tex of textureMap.values()) tex.dispose()
  textureMap.clear()

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
  activeRecorder = recorder
  const chunks: Blob[] = []

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data)
  }

  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: 'video/webm' })
    downloadFile(blob, `${projectStore.projectName}_turntable_360.webm`)
    isRecordingTurntable.value = false
    activeRecorder = null
    emit('close')
  }

  recorder.start()

  const totalTime = turntableDuration.value * 1000
  const intervalTime = 100
  let elapsed = 0

  turntableInterval = setInterval(() => {
    elapsed += intervalTime
    turntableProgress.value = Math.min(100, Math.round((elapsed / totalTime) * 100))
    if (elapsed >= totalTime) {
      if (turntableInterval !== null) {
        clearInterval(turntableInterval)
        turntableInterval = null
      }
      recorder.stop()
    }
  }, intervalTime)
}
</script>

<template>
  <div @click.self="$emit('close')" class="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 select-none font-sans">
    <div class="bg-ui-panel border border-ui-borderStrong rounded-xs w-[540px] shadow-2xl overflow-hidden flex flex-col">
      <div class="h-9 bg-ui-header border-b border-ui-borderSubtle px-3 flex items-center justify-between">
        <div class="flex items-center gap-2 text-xs font-mono font-bold text-ui-textPrimary">
          <BlenderIcon name="export" :size="14" />
          <span>Export Game Assets</span>
        </div>
        <button @click="$emit('close')" class="p-1 rounded-xs text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover" title="Close (Esc)">
          <BlenderIcon name="close" :size="14" />
        </button>
      </div>

      <div class="grid grid-cols-6 bg-ui-input/40 border-b border-ui-borderSubtle text-[10px] font-mono">
        <button 
          @click="activeTab = 'gltf'" 
          class="py-2 flex items-center justify-center gap-1 transition"
          :class="activeTab === 'gltf' ? 'bg-ui-panel text-ui-textAccent font-bold border-b-2 border-ui-accent' : 'text-ui-textMuted hover:text-ui-textPrimary'"
        >
          <BlenderIcon name="mesh-cube" :size="12" />
          <span>GLB</span>
        </button>
        <button 
          @click="activeTab = 'obj'" 
          class="py-2 flex items-center justify-center gap-1 transition"
          :class="activeTab === 'obj' ? 'bg-ui-panel text-ui-textAccent font-bold border-b-2 border-ui-accent' : 'text-ui-textMuted hover:text-ui-textPrimary'"
        >
          <span>OBJ</span>
        </button>
        <button 
          @click="activeTab = 'blockbench'" 
          class="py-2 flex items-center justify-center gap-1 transition"
          :class="activeTab === 'blockbench' ? 'bg-ui-panel text-ui-textAccent font-bold border-b-2 border-ui-accent' : 'text-ui-textMuted hover:text-ui-textPrimary'"
        >
          <span>BB</span>
        </button>
        <button 
          @click="activeTab = 'spritesheet'" 
          class="py-2 flex items-center justify-center gap-1 transition"
          :class="activeTab === 'spritesheet' ? 'bg-ui-panel text-ui-textAccent font-bold border-b-2 border-ui-accent' : 'text-ui-textMuted hover:text-ui-textPrimary'"
        >
          <BlenderIcon name="image" :size="12" />
          <span>Sprites</span>
        </button>
        <button 
          @click="activeTab = 'texture'" 
          class="py-2 flex items-center justify-center gap-1 transition"
          :class="activeTab === 'texture' ? 'bg-ui-panel text-ui-textAccent font-bold border-b-2 border-ui-accent' : 'text-ui-textMuted hover:text-ui-textPrimary'"
        >
          <span>PNG</span>
        </button>
        <button 
          @click="activeTab = 'turntable'" 
          class="py-2 flex items-center justify-center gap-1 transition"
          :class="activeTab === 'turntable' ? 'bg-ui-panel text-ui-textAccent font-bold border-b-2 border-ui-accent' : 'text-ui-textMuted hover:text-ui-textPrimary'"
        >
          <BlenderIcon name="film" :size="12" />
          <span>Turn</span>
        </button>
      </div>

      <!-- Content Panels -->
      <div class="p-5 text-xs text-ui-textSecondary">
        <!-- GLTF Section -->
        <div v-if="activeTab === 'gltf'" class="flex flex-col space-y-4">
          <p class="text-ui-textMuted leading-relaxed">
            Exports standard glTF 2.0 / GLB file compatible with Godot, Unity, Unreal Engine, Three.js, and web engines. Includes mesh geometries, UV coordinates, and pixel textures.
          </p>
          <div class="flex gap-2">
            <button 
              @click="handleExportGLTF(true)"
              class="flex-1 py-2.5 bg-ui-accent hover:bg-ui-accentHover text-white rounded-xs font-semibold shadow transition"
            >
              Export Binary (.GLB)
            </button>
            <button 
              @click="handleExportGLTF(false)"
              class="flex-1 py-2.5 bg-ui-input hover:bg-ui-hover text-ui-textPrimary rounded-xs font-semibold shadow transition"
            >
              Export JSON (.gltf)
            </button>
          </div>
        </div>

        <!-- OBJ Section -->
        <div v-else-if="activeTab === 'obj'" class="flex flex-col space-y-4">
          <p class="text-ui-textMuted leading-relaxed">
            Exports Wavefront OBJ geometry, MTL material definition, and embedded PNG pixel texture map. Universally supported by Blender, 3ds Max, and game engines.
          </p>
          <button 
            @click="handleExportOBJ"
            class="w-full py-2.5 bg-ui-accent hover:bg-ui-accentHover text-white rounded-xs font-semibold shadow transition"
          >
            Export OBJ + MTL + PNG
          </button>
        </div>

        <div v-else-if="activeTab === 'blockbench'" class="flex flex-col space-y-4">
          <p class="text-ui-textMuted leading-relaxed">
            Writes a Blockbench <span class="font-mono">.bbmodel</span> with cube approximations of each object, textures, and clip names. Import the same file from File → Import.
          </p>
          <button 
            @click="handleExportBlockbench"
            class="w-full py-2.5 bg-ui-accent hover:bg-ui-accentHover text-white rounded-xs font-semibold shadow transition"
          >
            Export Blockbench (.bbmodel)
          </button>
        </div>

        <!-- Sprite Sheet Section -->
        <div v-else-if="activeTab === 'spritesheet'" class="flex flex-col space-y-3">
          <p class="text-ui-textMuted leading-relaxed">
            Bakes your 3D low-poly model or animation clip into an 8-directional or isometric 2D retro pixel-art sprite sheet ready for top-down, tactical RPG, or billboard games.
          </p>

          <div class="grid grid-cols-2 gap-3 py-1">
            <label class="flex flex-col space-y-1">
              <span class="font-mono text-ui-textMuted">Animation Clip:</span>
              <select v-model="selectedClipId" class="bg-ui-header border border-ui-borderStrong rounded p-1.5 font-mono text-xs text-amber-300">
                <option value="">Current Static Pose (1 frame)</option>
                <option v-for="c in animationStore.armature.clips" :key="c.id" :value="c.id">
                  {{ c.name }} ({{ c.durationFrames }} frames)
                </option>
              </select>
            </label>

            <label class="flex flex-col space-y-1">
              <span class="font-mono text-ui-textMuted">Frame Sampling:</span>
              <select v-model="frameStep" class="bg-ui-header border border-ui-borderStrong rounded p-1.5 font-mono text-xs">
                <option :value="1">Every Frame (100% full rate)</option>
                <option :value="2">Every 2nd Frame (50% speed/retro)</option>
                <option :value="3">Every 3rd Frame (33% compact)</option>
              </select>
            </label>

            <label class="flex flex-col space-y-1">
              <span class="font-mono text-ui-textMuted">Frame Size:</span>
              <select v-model="spriteSize" class="bg-ui-header border border-ui-borderStrong rounded p-1.5 font-mono text-xs">
                <option :value="32">32 x 32 px</option>
                <option :value="48">48 x 48 px</option>
                <option :value="64">64 x 64 px</option>
                <option :value="128">128 x 128 px</option>
              </select>
            </label>

            <label class="flex flex-col space-y-1">
              <span class="font-mono text-ui-textMuted">Directions & Angle:</span>
              <select v-model="spriteDirections" class="bg-ui-header border border-ui-borderStrong rounded p-1.5 font-mono text-xs">
                <option :value="4">4 Directions (Cardinals)</option>
                <option :value="8">8 Directions (Octagonal)</option>
              </select>
            </label>
          </div>

          <div class="p-2 rounded bg-ui-input/60 border border-ui-borderSubtle flex items-center justify-between text-[11px] font-mono text-ui-textMuted">
            <span>Camera Pitch Angle:</span>
            <div class="flex items-center gap-2">
              <button 
                @click="spriteIsoAngle = 30" 
                class="px-2 py-0.5 rounded text-[10px]"
                :class="spriteIsoAngle === 30 ? 'bg-ui-accent text-white font-bold' : 'bg-ui-input text-ui-textMuted hover:text-ui-textPrimary'"
              >
                30° Iso
              </button>
              <button 
                @click="spriteIsoAngle = 45" 
                class="px-2 py-0.5 rounded text-[10px]"
                :class="spriteIsoAngle === 45 ? 'bg-ui-accent text-white font-bold' : 'bg-ui-input text-ui-textMuted hover:text-ui-textPrimary'"
              >
                45° Dimetric
              </button>
              <button 
                @click="spriteIsoAngle = 0" 
                class="px-2 py-0.5 rounded text-[10px]"
                :class="spriteIsoAngle === 0 ? 'bg-ui-accent text-white font-bold' : 'bg-ui-input text-ui-textMuted hover:text-ui-textPrimary'"
              >
                0° Side / Billboard
              </button>
            </div>
          </div>

          <button 
            @click="handleExportSpriteSheet"
            class="w-full py-2.5 bg-ui-accent hover:bg-ui-accentHover text-white rounded-xs font-semibold shadow transition"
          >
            Generate & Download Animated Sprite Sheet
          </button>
        </div>

        <!-- Texture PNG Section -->
        <div v-else-if="activeTab === 'texture'" class="flex flex-col space-y-4">
          <p class="text-ui-textMuted leading-relaxed">
            Downloads the raw pixel art canvas texture as a standalone PNG with nearest-neighbor crisp pixel edges.
          </p>
          <button 
            @click="handleExportTexture"
            class="w-full py-2.5 bg-ui-accent hover:bg-ui-accentHover text-white rounded-xs font-semibold shadow transition"
          >
            Download Texture PNG
          </button>
        </div>

        <!-- Turntable Video Section -->
        <div v-else-if="activeTab === 'turntable'" class="flex flex-col space-y-4">
          <p class="text-ui-textMuted leading-relaxed">
            Records a 360-degree turntable video of your 3D model directly from the canvas into high-quality WebM video.
          </p>
          <div class="grid grid-cols-2 gap-3">
            <label class="flex flex-col space-y-1">
              <span class="font-mono text-ui-textMuted">Duration:</span>
              <select v-model="turntableDuration" class="bg-ui-header border border-ui-borderStrong rounded p-1.5 font-mono text-xs">
                <option :value="2">2 Seconds (Fast)</option>
                <option :value="3">3 Seconds (Standard)</option>
                <option :value="4">4 Seconds (Smooth)</option>
                <option :value="6">6 Seconds (Slow Pan)</option>
              </select>
            </label>

            <label class="flex flex-col space-y-1">
              <span class="font-mono text-ui-textMuted">Frame Rate:</span>
              <select v-model="turntableFps" class="bg-ui-header border border-ui-borderStrong rounded p-1.5 font-mono text-xs">
                <option :value="24">24 FPS (Cinematic)</option>
                <option :value="30">30 FPS (Smooth)</option>
                <option :value="60">60 FPS (Ultra Smooth)</option>
              </select>
            </label>
          </div>

          <div v-if="isRecordingTurntable" class="p-3 bg-ui-header rounded-xs border border-ui-accent/40 flex flex-col space-y-2">
            <div class="flex justify-between text-xs font-mono text-ui-textAccent">
              <span>Recording 360 Turntable...</span>
              <span>{{ turntableProgress }}%</span>
            </div>
            <div class="w-full bg-ui-input rounded-full h-1.5 overflow-hidden">
              <div class="bg-ui-accent h-full transition-all duration-100" :style="{ width: `${turntableProgress}%` }"></div>
            </div>
          </div>

          <button 
            @click="handleExportTurntable"
            :disabled="isRecordingTurntable"
            class="w-full py-2.5 bg-ui-accent hover:bg-ui-accentHover disabled:opacity-50 text-white rounded-xs font-semibold shadow transition"
          >
            {{ isRecordingTurntable ? 'Recording Turntable Video...' : 'Record & Download 360 Turntable Video (.webm)' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
