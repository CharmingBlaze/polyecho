<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { useToolStore } from '../../stores/toolStore'
import { PixelBuffer } from '../../core/painting/PixelCanvas'
import { Image as ImageIcon, X } from 'lucide-vue-next'

const props = defineProps<{
  file: File | null
  targetMaterialId?: string | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'imported', textureId: string): void
}>()

const projectStore = useProjectStore()
const toolStore = useToolStore()

// Fit mode: 'stretch' | 'contain' | 'tile'
const fitMode = ref<'stretch' | 'contain' | 'tile'>('stretch')

// Resolution presets
type ResPreset = 'keep' | 'image' | 32 | 64 | 128 | 256 | 512 | 1024
const selectedRes = ref<ResPreset>(256)

// Palette extraction
const extractPalette = ref<boolean>(true)

// Original image stats
const origWidth = ref<number>(64)
const origHeight = ref<number>(64)
const origImage = ref<HTMLImageElement | null>(null)
const isLoaded = ref<boolean>(false)

watch(() => props.file, (newFile) => {
  if (!newFile) {
    origImage.value = null
    isLoaded.value = false
    return
  }

  const objectUrl = URL.createObjectURL(newFile)
  const img = new Image()
  img.onload = () => {
    origWidth.value = img.naturalWidth || 64
    origHeight.value = img.naturalHeight || 64
    origImage.value = img
    isLoaded.value = true
    URL.revokeObjectURL(objectUrl)
  }
  img.onerror = () => {
    URL.revokeObjectURL(objectUrl)
  }
  img.src = objectUrl
}, { immediate: true })

const targetDimensions = computed<{ width: number; height: number }>(() => {
  if (selectedRes.value === 'keep' || selectedRes.value === 'image') {
    return { width: origWidth.value, height: origHeight.value }
  }
  const size = typeof selectedRes.value === 'number' ? selectedRes.value : 256
  return { width: size, height: size }
})

const resultText = computed(() => {
  return `${targetDimensions.value.width}x${targetDimensions.value.height}`
})

async function handleImport() {
  if (!props.file || !origImage.value) {
    emit('close')
    return
  }

  const targetW = targetDimensions.value.width
  const targetH = targetDimensions.value.height
  const img = origImage.value
  const origW = origWidth.value
  const origH = origHeight.value

  const buffer = new PixelBuffer(targetW, targetH)
  buffer.ctx.imageSmoothingEnabled = false
  buffer.ctx.clearRect(0, 0, targetW, targetH)

  if (fitMode.value === 'stretch') {
    buffer.ctx.drawImage(img, 0, 0, targetW, targetH)
  } else if (fitMode.value === 'contain') {
    const scale = Math.min(targetW / origW, targetH / origH)
    const drawW = Math.max(1, Math.round(origW * scale))
    const drawH = Math.max(1, Math.round(origH * scale))
    const offsetX = Math.round((targetW - drawW) / 2)
    const offsetY = Math.round((targetH - drawH) / 2)
    buffer.ctx.drawImage(img, offsetX, offsetY, drawW, drawH)
  } else if (fitMode.value === 'tile') {
    const ptrn = buffer.ctx.createPattern(img, 'repeat')
    if (ptrn) {
      buffer.ctx.fillStyle = ptrn
      buffer.ctx.fillRect(0, 0, targetW, targetH)
    } else {
      buffer.ctx.drawImage(img, 0, 0, targetW, targetH)
    }
  }

  // Extract Retro Palette if requested
  if (extractPalette.value) {
    const colors = buffer.extractPalette(16)
    if (colors.length > 0) {
      const palName = `Image_${props.file.name.replace(/\.[^/.]+$/, '').slice(0, 12)}`
      projectStore.activePalette = {
        id: `pal_${Date.now()}`,
        name: palName,
        colors
      }
      toolStore.primaryColor = colors[0]
      if (colors.length > 1) {
        toolStore.secondaryColor = colors[1]
      }
    }
  }

  // Add texture to project
  const texName = props.file.name.replace(/\.[^/.]+$/, '')
  const newTex = projectStore.addTexture(texName, targetW, targetH)
  newTex.pixelBuffer = buffer
  newTex.width = targetW
  newTex.height = targetH
  newTex.dataUrl = buffer.toDataURL()

  // Assign to targeted material or active material
  const targetMatId = props.targetMaterialId || projectStore.activeMesh?.materialId || projectStore.materials[0]?.id
  if (targetMatId) {
    projectStore.assignTextureToMaterial(targetMatId, newTex.id)
  }

  projectStore.activeTextureId = newTex.id
  projectStore.markTextureUpdated(newTex.id)
  projectStore.recordState(`Import Image Texture (${newTex.name})`)

  emit('imported', newTex.id)
  emit('close')
}
</script>

<template>
  <div class="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center z-50 select-none p-4 animate-in fade-in duration-150">
    <div class="bg-[#13151b] border border-[#232733] rounded-xl w-[440px] shadow-2xl overflow-hidden flex flex-col text-white font-sans">
      <!-- Header -->
      <div class="h-12 bg-[#181b24] border-b border-[#232733] px-4 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div class="w-6 h-6 rounded bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
            <ImageIcon class="w-3.5 h-3.5" />
          </div>
          <span class="font-bold text-sm text-slate-100">Import Image Texture</span>
        </div>
        <button 
          @click="('close')" 
          class="p-1 rounded-md text-slate-400 hover:text-white hover:bg-[#232733] transition cursor-pointer"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Body -->
      <div class="p-4 space-y-4">
        <!-- File Info Banner -->
        <div class="bg-[#1a1d26] border border-[#262b3a] rounded-lg px-3.5 py-2.5 flex items-center justify-between">
          <span class="text-xs text-slate-200 font-mono truncate max-w-[260px]">{{ file?.name || 'texture.png' }}</span>
          <span class="text-xs font-mono font-bold text-indigo-400">{{ origWidth }}x{{ origHeight }}</span>
        </div>

        <!-- Fit Mode Section -->
        <div class="space-y-1.5">
          <div class="text-[11px] font-bold text-slate-400 tracking-wide">Fit Mode</div>
          <div class="grid grid-cols-3 gap-2">
            <button 
              v-for="mode in [
                { id: 'stretch', label: 'Stretch' },
                { id: 'contain', label: 'Contain' },
                { id: 'tile', label: 'Tile' }
              ]" 
              :key="mode.id"
              @click="fitMode = mode.id as any"
              class="py-1.5 px-2 rounded-lg text-xs font-medium border transition text-center cursor-pointer"
              :class="fitMode === mode.id 
                ? 'bg-indigo-600 text-white font-bold border-indigo-500 shadow-xs' 
                : 'bg-[#1a1d26] text-slate-400 hover:text-slate-200 border-[#262b3a] hover:bg-[#202430]'"
            >
              {{ mode.label }}
            </button>
          </div>
        </div>

        <!-- Texture Resolution Section -->
        <div class="space-y-1.5">
          <div class="text-[11px] font-bold text-slate-400 tracking-wide">Texture Resolution</div>
          <div class="grid grid-cols-3 gap-2">
            <!-- Row 1 -->
            <button 
              @click="selectedRes = 'keep'"
              class="py-1.5 px-2 rounded-lg text-xs font-medium border transition text-center cursor-pointer"
              :class="selectedRes === 'keep' 
                ? 'bg-indigo-600 text-white font-bold border-indigo-500 shadow-xs' 
                : 'bg-[#1a1d26] text-slate-400 hover:text-slate-200 border-[#262b3a] hover:bg-[#202430]'"
            >
              Keep
            </button>

            <button 
              @click="selectedRes = 'image'"
              class="py-1.5 px-2 rounded-lg text-xs font-medium border transition text-center cursor-pointer"
              :class="selectedRes === 'image' 
                ? 'bg-indigo-600 text-white font-bold border-indigo-500 shadow-xs' 
                : 'bg-[#1a1d26] text-slate-400 hover:text-slate-200 border-[#262b3a] hover:bg-[#202430]'"
            >
              Image
            </button>

            <button 
              @click="selectedRes = 32"
              class="py-1.5 px-2 rounded-lg text-xs font-medium border transition text-center cursor-pointer font-mono"
              :class="selectedRes === 32 
                ? 'bg-indigo-600 text-white font-bold border-indigo-500 shadow-xs' 
                : 'bg-[#1a1d26] text-slate-400 hover:text-slate-200 border-[#262b3a] hover:bg-[#202430]'"
            >
              32²
            </button>

            <!-- Row 2 -->
            <button 
              @click="selectedRes = 64"
              class="py-1.5 px-2 rounded-lg text-xs font-medium border transition text-center cursor-pointer font-mono"
              :class="selectedRes === 64 
                ? 'bg-indigo-600 text-white font-bold border-indigo-500 shadow-xs' 
                : 'bg-[#1a1d26] text-slate-400 hover:text-slate-200 border-[#262b3a] hover:bg-[#202430]'"
            >
              64²
            </button>

            <button 
              @click="selectedRes = 128"
              class="py-1.5 px-2 rounded-lg text-xs font-medium border transition text-center cursor-pointer font-mono"
              :class="selectedRes === 128 
                ? 'bg-indigo-600 text-white font-bold border-indigo-500 shadow-xs' 
                : 'bg-[#1a1d26] text-slate-400 hover:text-slate-200 border-[#262b3a] hover:bg-[#202430]'"
            >
              128²
            </button>

            <button 
              @click="selectedRes = 256"
              class="py-1.5 px-2 rounded-lg text-xs font-medium border transition text-center cursor-pointer font-mono"
              :class="selectedRes === 256 
                ? 'bg-indigo-600 text-white font-bold border-indigo-500 shadow-xs' 
                : 'bg-[#1a1d26] text-slate-400 hover:text-slate-200 border-[#262b3a] hover:bg-[#202430]'"
            >
              256²
            </button>
          </div>

          <!-- Result Readout -->
          <div class="text-[11px] text-slate-400 pt-0.5">
            <span>Result: </span>
            <span class="font-bold text-slate-200 font-mono">{{ resultText }}</span>
          </div>
        </div>

        <!-- Retro Palette Extraction Checkbox Card -->
        <label class="bg-[#1a1d26] border border-[#262b3a] rounded-lg px-3.5 py-2.5 flex items-center gap-2.5 cursor-pointer hover:border-[#343b4f] transition">
          <input 
            type="checkbox" 
            v-model="extractPalette" 
            class="rounded accent-indigo-600 w-4 h-4 cursor-pointer"
          />
          <span class="text-xs text-slate-200 font-medium">Extract retro palette from image colors</span>
        </label>
      </div>

      <!-- Footer Buttons -->
      <div class="p-4 pt-1 flex items-center justify-end gap-2.5">
        <button 
          @click="('close')" 
          class="px-4 py-2 rounded-lg text-xs font-semibold text-slate-300 hover:text-white bg-[#1a1d26] hover:bg-[#222736] border border-[#2a3040] transition cursor-pointer"
        >
          Cancel
        </button>

        <button 
          @click="handleImport" 
          class="px-6 py-2 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 shadow-md transition cursor-pointer"
        >
          Import
        </button>
      </div>
    </div>
  </div>
</template>
