<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { useToolStore } from '../../stores/toolStore'
import { PixelBuffer } from '../../core/painting/PixelCanvas'
import { 
  Image as ImageIcon, 
  X, 
  Sparkles, 
  Lock, 
  Unlock,
  Grid
} from 'lucide-vue-next'

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

// Resampling filter: 'nearest' | 'bilinear'
const filterMode = ref<'nearest' | 'bilinear'>('nearest')

// Resolution presets: 'orig' | 32 | 64 | 128 | 256 | 512 | 'custom'
type ResPreset = 'orig' | 32 | 64 | 128 | 256 | 512 | 'custom'
const selectedRes = ref<ResPreset>('orig')

// Custom dimensions & aspect ratio lock
const customWidth = ref<number>(256)
const customHeight = ref<number>(256)
const lockAspectRatio = ref<boolean>(true)

// Atlas / Sprite Sheet Slicing Options
const isAtlasMode = ref<boolean>(false)
const atlasSliceMethod = ref<'grid' | 'tileSize'>('grid')
const atlasCols = ref<number>(2)
const atlasRows = ref<number>(2)
const atlasTileW = ref<number>(32)
const atlasTileH = ref<number>(32)

// Palette extraction
const extractPalette = ref<boolean>(true)
const extractedColors = ref<string[]>([])

// Original image metadata
const origWidth = ref<number>(64)
const origHeight = ref<number>(64)
const fileSizeKb = ref<number>(0)
const origImage = ref<HTMLImageElement | null>(null)
const isLoaded = ref<boolean>(false)

// Live preview canvas
const previewCanvasRef = ref<HTMLCanvasElement | null>(null)

watch(() => props.file, (newFile) => {
  if (!newFile) {
    origImage.value = null
    isLoaded.value = false
    return
  }

  fileSizeKb.value = Math.round(newFile.size / 1024)
  const objectUrl = URL.createObjectURL(newFile)
  const img = new Image()
  img.onload = () => {
    origWidth.value = img.naturalWidth || 64
    origHeight.value = img.naturalHeight || 64
    customWidth.value = img.naturalWidth || 64
    customHeight.value = img.naturalHeight || 64
    origImage.value = img
    isLoaded.value = true
    URL.revokeObjectURL(objectUrl)
    updateLivePreview()
  }
  img.onerror = () => {
    URL.revokeObjectURL(objectUrl)
  }
  img.src = objectUrl
}, { immediate: true })

const targetDimensions = computed<{ width: number; height: number }>(() => {
  if (selectedRes.value === 'orig') {
    return { width: origWidth.value, height: origHeight.value }
  }
  if (selectedRes.value === 'custom') {
    return { 
      width: Math.max(8, Math.min(4096, customWidth.value || 64)), 
      height: Math.max(8, Math.min(4096, customHeight.value || 64)) 
    }
  }
  const size = typeof selectedRes.value === 'number' ? selectedRes.value : 256
  return { width: size, height: size }
})

const computedTileDimensions = computed(() => {
  const targetW = targetDimensions.value.width
  const targetH = targetDimensions.value.height
  if (atlasSliceMethod.value === 'grid') {
    const cols = Math.max(1, atlasCols.value)
    const rows = Math.max(1, atlasRows.value)
    return {
      cols,
      rows,
      tileW: Math.max(1, Math.floor(targetW / cols)),
      tileH: Math.max(1, Math.floor(targetH / rows)),
      count: cols * rows
    }
  } else {
    const tw = Math.max(8, Math.min(targetW, atlasTileW.value))
    const th = Math.max(8, Math.min(targetH, atlasTileH.value))
    const cols = Math.max(1, Math.floor(targetW / tw))
    const rows = Math.max(1, Math.floor(targetH / th))
    return {
      cols,
      rows,
      tileW: tw,
      tileH: th,
      count: cols * rows
    }
  }
})

const aspectRatioText = computed(() => {
  if (!origWidth.value || !origHeight.value) return '1:1'
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
  const d = gcd(origWidth.value, origHeight.value)
  const rw = origWidth.value / d
  const rh = origHeight.value / d
  if (rw <= 32 && rh <= 32) return `${rw}:${rh}`
  return (origWidth.value / origHeight.value).toFixed(2) + ':1'
})

function setPreset(res: ResPreset) {
  selectedRes.value = res
  if (typeof res === 'number') {
    customWidth.value = res
    customHeight.value = res
  } else if (res === 'orig') {
    customWidth.value = origWidth.value
    customHeight.value = origHeight.value
  }
  updateLivePreview()
}

function handleCustomWidthChange(val: number) {
  const w = Math.max(8, Math.min(4096, Math.round(val)))
  customWidth.value = w
  if (lockAspectRatio.value && origWidth.value > 0) {
    const ratio = origHeight.value / origWidth.value
    customHeight.value = Math.max(8, Math.min(4096, Math.round(w * ratio)))
  }
  selectedRes.value = 'custom'
  updateLivePreview()
}

function handleCustomHeightChange(val: number) {
  const h = Math.max(8, Math.min(4096, Math.round(val)))
  customHeight.value = h
  if (lockAspectRatio.value && origHeight.value > 0) {
    const ratio = origWidth.value / origHeight.value
    customWidth.value = Math.max(8, Math.min(4096, Math.round(h * ratio)))
  }
  selectedRes.value = 'custom'
  updateLivePreview()
}

function generateProcessedBuffer(): PixelBuffer | null {
  if (!origImage.value) return null
  const targetW = targetDimensions.value.width
  const targetH = targetDimensions.value.height
  const img = origImage.value
  const origW = origWidth.value
  const origH = origHeight.value

  const buffer = new PixelBuffer(targetW, targetH)
  buffer.ctx.imageSmoothingEnabled = filterMode.value === 'bilinear'
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

  return buffer
}

function updateLivePreview() {
  nextTick(() => {
    const buffer = generateProcessedBuffer()
    if (!buffer || !previewCanvasRef.value) return

    const canvas = previewCanvasRef.value
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Draw checkerboard background
    const chSize = 8
    for (let y = 0; y < canvas.height; y += chSize) {
      for (let x = 0; x < canvas.width; x += chSize) {
        ctx.fillStyle = ((x / chSize + y / chSize) % 2 === 0) ? '#1c1f29' : '#14161e'
        ctx.fillRect(x, y, chSize, chSize)
      }
    }

    // Scale buffer to fit preview canvas keeping aspect ratio
    const scale = Math.min(canvas.width / buffer.width, canvas.height / buffer.height)
    const drawW = Math.round(buffer.width * scale)
    const drawH = Math.round(buffer.height * scale)
    const ox = Math.round((canvas.width - drawW) / 2)
    const oy = Math.round((canvas.height - drawH) / 2)

    ctx.imageSmoothingEnabled = false
    ctx.drawImage(buffer.canvas, ox, oy, drawW, drawH)

    // Draw Atlas Grid Slice lines if Atlas Mode is enabled
    if (isAtlasMode.value) {
      const { cols, rows } = computedTileDimensions.value
      ctx.strokeStyle = '#f59e0b'
      ctx.lineWidth = 1
      ctx.setLineDash([3, 3])

      // Vertical lines
      for (let c = 1; c < cols; c++) {
        const x = ox + (drawW * (c / cols))
        ctx.beginPath()
        ctx.moveTo(x, oy)
        ctx.lineTo(x, oy + drawH)
        ctx.stroke()
      }

      // Horizontal lines
      for (let r = 1; r < rows; r++) {
        const y = oy + (drawH * (r / rows))
        ctx.beginPath()
        ctx.moveTo(ox, y)
        ctx.lineTo(ox + drawW, y)
        ctx.stroke()
      }
      ctx.setLineDash([])
    }

    // Outline preview border
    ctx.strokeStyle = isAtlasMode.value ? '#f59e0b' : 'rgba(99, 102, 241, 0.5)'
    ctx.lineWidth = 1
    ctx.strokeRect(ox, oy, drawW, drawH)

    // Update palette preview
    if (extractPalette.value) {
      extractedColors.value = buffer.extractPalette(16)
    }
  })
}

watch([fitMode, filterMode, selectedRes, extractPalette, isAtlasMode, atlasSliceMethod, atlasCols, atlasRows, atlasTileW, atlasTileH], () => {
  updateLivePreview()
})

function handleClose() {
  emit('close')
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    handleClose()
  } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    handleImport()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  updateLivePreview()
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})

async function handleImport() {
  const buffer = generateProcessedBuffer()
  if (!props.file || !buffer) {
    emit('close')
    return
  }

  const targetW = targetDimensions.value.width
  const targetH = targetDimensions.value.height
  const texName = props.file.name.replace(/\.[^/.]+$/, '')

  // Extract Retro Palette if requested
  if (extractPalette.value) {
    const colors = buffer.extractPalette(16)
    if (colors.length > 0) {
      const palName = `Image_${texName.slice(0, 12)}`
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

  // If Atlas Slicing Mode is enabled:
  if (isAtlasMode.value) {
    const { cols, rows, tileW, tileH } = computedTileDimensions.value
    projectStore.recordState(`Import & Slice Atlas (${texName}: ${cols}x${rows})`)

    // Add Master Atlas texture
    const masterTex = projectStore.addTexture(`${texName}_Atlas`, targetW, targetH)
    masterTex.pixelBuffer = buffer
    masterTex.dataUrl = buffer.toDataURL()

    // Slice individual tiles
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tileBuf = new PixelBuffer(tileW, tileH)
        tileBuf.ctx.imageSmoothingEnabled = false
        tileBuf.ctx.drawImage(
          buffer.canvas,
          c * tileW, r * tileH, tileW, tileH,
          0, 0, tileW, tileH
        )
        const tileTex = projectStore.addTexture(`${texName}_${r}_${c}`, tileW, tileH)
        tileTex.pixelBuffer = tileBuf
        tileTex.dataUrl = tileBuf.toDataURL()
        projectStore.markTextureUpdated(tileTex.id)
      }
    }

    const targetMatId = props.targetMaterialId || projectStore.activeMesh?.materialId || projectStore.materials[0]?.id
    if (targetMatId) {
      projectStore.assignTextureToMaterial(targetMatId, masterTex.id)
    }
    projectStore.activeTextureId = masterTex.id
    projectStore.markTextureUpdated(masterTex.id)
    emit('imported', masterTex.id)
    emit('close')
    return
  }

  // Standard Single Texture Import
  const newTex = projectStore.addTexture(texName, targetW, targetH)
  newTex.pixelBuffer = buffer
  newTex.width = targetW
  newTex.height = targetH
  newTex.dataUrl = buffer.toDataURL()

  const targetMatId = props.targetMaterialId || projectStore.activeMesh?.materialId || projectStore.materials[0]?.id
  if (targetMatId) {
    projectStore.assignTextureToMaterial(targetMatId, newTex.id)
  }

  projectStore.activeTextureId = newTex.id
  projectStore.markTextureUpdated(newTex.id)
  projectStore.recordState(`Import Texture Map (${newTex.name})`)

  emit('imported', newTex.id)
  emit('close')
}
</script>

<template>
  <div 
    class="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center z-50 select-none p-4 animate-in fade-in duration-150"
    @click.self="handleClose"
  >
    <div class="bg-ui-surface border border-ui-borderDefault rounded-xs w-[680px] shadow-2xl overflow-hidden flex flex-col text-ui-textPrimary font-sans">
      
      <!-- Modal Header -->
      <div class="h-10 bg-ui-panel border-b border-ui-borderSubtle px-3.5 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div class="w-5 h-5 rounded-xs bg-ui-accent/15 text-ui-textAccent flex items-center justify-center">
            <ImageIcon class="w-3.5 h-3.5" />
          </div>
          <span class="font-bold text-xs text-ui-textPrimary tracking-wide">Import Texture or Atlas Map</span>
        </div>
        <button 
          @click="handleClose" 
          class="p-1 rounded-xs text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover transition cursor-pointer"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>

      <!-- Main Split Content -->
      <div class="grid grid-cols-12 gap-0 border-b border-ui-borderSubtle bg-ui-surface">
        
        <!-- Left: Live Preview Canvas -->
        <div class="col-span-5 p-3.5 bg-ui-panel/60 border-r border-ui-borderSubtle flex flex-col items-center justify-between gap-2.5">
          <div class="w-full flex items-center justify-between text-[10px] text-ui-textMuted font-mono">
            <span>PREVIEW</span>
            <span class="text-ui-textAccent font-bold">{{ targetDimensions.width }} × {{ targetDimensions.height }}</span>
          </div>

          <!-- Checkerboard Container -->
          <div class="relative w-full aspect-square bg-[#12141a] rounded-xs border border-ui-borderSubtle overflow-hidden flex items-center justify-center shadow-inner">
            <canvas 
              ref="previewCanvasRef" 
              width="230" 
              height="230" 
              class="w-full h-full object-contain [image-rendering:pixelated]"
            />
          </div>

          <!-- File Stats Readout -->
          <div class="w-full bg-ui-input/70 p-2 rounded-xs border border-ui-borderSubtle text-[10px] space-y-1">
            <div class="flex items-center justify-between text-ui-textMuted">
              <span>Source:</span>
              <span class="font-mono text-ui-textPrimary font-semibold truncate max-w-[120px]" :title="file?.name">{{ file?.name }}</span>
            </div>
            <div class="flex items-center justify-between text-ui-textMuted">
              <span>Original:</span>
              <span class="font-mono text-ui-textPrimary">{{ origWidth }} × {{ origHeight }} px</span>
            </div>
            <div class="flex items-center justify-between text-ui-textMuted">
              <span>Aspect Ratio:</span>
              <span class="font-mono text-ui-textPrimary">{{ aspectRatioText }}</span>
            </div>
            <div v-if="isAtlasMode" class="flex items-center justify-between text-amber-300 font-bold">
              <span>Slicing:</span>
              <span class="font-mono">{{ computedTileDimensions.cols }}×{{ computedTileDimensions.rows }} ({{ computedTileDimensions.count }} tiles)</span>
            </div>
          </div>
        </div>

        <!-- Right: Configuration Controls -->
        <div class="col-span-7 p-3.5 space-y-3 flex flex-col justify-between max-h-[460px] overflow-y-auto custom-scrollbar">
          
          <!-- 1. Resolution Presets & Custom Scaling -->
          <div class="space-y-1.5">
            <div class="flex items-center justify-between text-[10px] font-bold text-ui-textMuted uppercase tracking-wider">
              <span>Target Resolution</span>
              <span class="font-mono text-ui-textAccent">{{ targetDimensions.width }}×{{ targetDimensions.height }} px</span>
            </div>

            <!-- Resolution Grid -->
            <div class="grid grid-cols-4 gap-1">
              <button 
                v-for="res in (['orig', 32, 64, 128, 256, 512] as const)"
                :key="res"
                @click="setPreset(res)"
                class="py-1 px-1.5 rounded-xs text-[10px] font-mono font-medium border transition text-center cursor-pointer"
                :class="selectedRes === res 
                  ? 'bg-ui-accent text-white font-bold border-ui-accent shadow-xs' 
                  : 'bg-ui-input text-ui-textSecondary hover:text-ui-textPrimary border-ui-borderSubtle hover:bg-ui-hover'"
              >
                {{ res === 'orig' ? 'Source' : `${res}²` }}
              </button>

              <button 
                @click="selectedRes = 'custom'"
                class="col-span-2 py-1 px-1.5 rounded-xs text-[10px] font-mono font-medium border transition text-center cursor-pointer"
                :class="selectedRes === 'custom' 
                  ? 'bg-ui-accent text-white font-bold border-ui-accent shadow-xs' 
                  : 'bg-ui-input text-ui-textSecondary hover:text-ui-textPrimary border-ui-borderSubtle hover:bg-ui-hover'"
              >
                Custom Size
              </button>
            </div>

            <!-- Custom Size Inputs -->
            <div class="flex items-center gap-1.5 pt-1">
              <div class="flex-1 flex items-center bg-ui-input border border-ui-borderSubtle rounded-xs px-2 py-0.5 text-[11px] font-mono">
                <span class="text-ui-textMuted text-[9px] mr-1.5 uppercase">W</span>
                <input 
                  type="number" 
                  min="8" 
                  max="4096" 
                  step="8" 
                  :value="customWidth" 
                  @input="handleCustomWidthChange(Number(($event.target as HTMLInputElement).value))"
                  class="w-full bg-transparent text-ui-textPrimary focus:outline-none"
                />
              </div>

              <button 
                @click="lockAspectRatio = !lockAspectRatio"
                :title="lockAspectRatio ? 'Lock Aspect Ratio' : 'Unlock Aspect Ratio'"
                class="p-1 rounded-xs border transition cursor-pointer"
                :class="lockAspectRatio ? 'bg-ui-accent/15 text-ui-textAccent border-ui-accent/30' : 'bg-ui-input text-ui-textMuted border-ui-borderSubtle hover:text-ui-textPrimary'"
              >
                <Lock v-if="lockAspectRatio" class="w-3 h-3" />
                <Unlock v-else class="w-3 h-3" />
              </button>

              <div class="flex-1 flex items-center bg-ui-input border border-ui-borderSubtle rounded-xs px-2 py-0.5 text-[11px] font-mono">
                <span class="text-ui-textMuted text-[9px] mr-1.5 uppercase">H</span>
                <input 
                  type="number" 
                  min="8" 
                  max="4096" 
                  step="8" 
                  :value="customHeight" 
                  @input="handleCustomHeightChange(Number(($event.target as HTMLInputElement).value))"
                  class="w-full bg-transparent text-ui-textPrimary focus:outline-none"
                />
              </div>
            </div>
          </div>

          <!-- 2. Atlas / Sprite Sheet Slicing Card -->
          <div class="bg-amber-950/20 p-2 rounded-xs border border-amber-500/30 space-y-2">
            <label class="flex items-center justify-between cursor-pointer">
              <span class="text-[10.5px] font-bold text-amber-300 flex items-center gap-1.5">
                <Grid class="w-3.5 h-3.5 text-amber-400" />
                <span>Atlas / Sprite Sheet Slicing</span>
              </span>
              <input 
                type="checkbox" 
                v-model="isAtlasMode" 
                class="rounded-xs accent-amber-500 cursor-pointer"
              />
            </label>

            <!-- Atlas Options (if enabled) -->
            <div v-if="isAtlasMode" class="space-y-1.5 pt-1 border-t border-amber-500/20">
              <div class="grid grid-cols-2 gap-1 text-[9.5px]">
                <button 
                  @click="atlasSliceMethod = 'grid'"
                  class="py-1 rounded-xs border text-center transition cursor-pointer"
                  :class="atlasSliceMethod === 'grid' ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-bold' : 'bg-ui-input text-ui-textSecondary border-ui-borderSubtle'"
                >
                  Grid (Cols × Rows)
                </button>
                <button 
                  @click="atlasSliceMethod = 'tileSize'"
                  class="py-1 rounded-xs border text-center transition cursor-pointer"
                  :class="atlasSliceMethod === 'tileSize' ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-bold' : 'bg-ui-input text-ui-textSecondary border-ui-borderSubtle'"
                >
                  Tile Size (px)
                </button>
              </div>

              <!-- Grid Mode Inputs -->
              <div v-if="atlasSliceMethod === 'grid'" class="grid grid-cols-2 gap-2 text-[10px]">
                <div>
                  <span class="text-ui-textMuted text-[9px] block">Columns:</span>
                  <input type="number" min="1" max="64" v-model.number="atlasCols" class="w-full bg-ui-input border border-ui-borderSubtle rounded-xs px-1.5 py-0.5 text-ui-textPrimary font-mono" />
                </div>
                <div>
                  <span class="text-ui-textMuted text-[9px] block">Rows:</span>
                  <input type="number" min="1" max="64" v-model.number="atlasRows" class="w-full bg-ui-input border border-ui-borderSubtle rounded-xs px-1.5 py-0.5 text-ui-textPrimary font-mono" />
                </div>
              </div>

              <!-- Tile Size Inputs -->
              <div v-else class="grid grid-cols-2 gap-2 text-[10px]">
                <div>
                  <span class="text-ui-textMuted text-[9px] block">Tile Width (px):</span>
                  <input type="number" min="8" max="512" step="8" v-model.number="atlasTileW" class="w-full bg-ui-input border border-ui-borderSubtle rounded-xs px-1.5 py-0.5 text-ui-textPrimary font-mono" />
                </div>
                <div>
                  <span class="text-ui-textMuted text-[9px] block">Tile Height (px):</span>
                  <input type="number" min="8" max="512" step="8" v-model.number="atlasTileH" class="w-full bg-ui-input border border-ui-borderSubtle rounded-xs px-1.5 py-0.5 text-ui-textPrimary font-mono" />
                </div>
              </div>

              <div class="text-[9px] text-amber-200/80 font-mono">
                Will extract {{ computedTileDimensions.count }} sub-textures ({{ computedTileDimensions.tileW }}×{{ computedTileDimensions.tileH }}px each).
              </div>
            </div>
          </div>

          <!-- 3. Sampling Filter & Placement -->
          <div class="grid grid-cols-2 gap-2">
            <div class="space-y-1">
              <span class="text-[9.5px] font-bold text-ui-textMuted uppercase">Resample Filter</span>
              <div class="grid grid-cols-2 gap-0.5">
                <button 
                  @click="filterMode = 'nearest'"
                  class="py-1 rounded-xs text-[9.5px] font-medium border transition text-center cursor-pointer"
                  :class="filterMode === 'nearest' ? 'bg-ui-accent text-white font-bold border-ui-accent' : 'bg-ui-input text-ui-textSecondary border-ui-borderSubtle'"
                >
                  Nearest
                </button>
                <button 
                  @click="filterMode = 'bilinear'"
                  class="py-1 rounded-xs text-[9.5px] font-medium border transition text-center cursor-pointer"
                  :class="filterMode === 'bilinear' ? 'bg-ui-accent text-white font-bold border-ui-accent' : 'bg-ui-input text-ui-textSecondary border-ui-borderSubtle'"
                >
                  Bilinear
                </button>
              </div>
            </div>

            <div class="space-y-1">
              <span class="text-[9.5px] font-bold text-ui-textMuted uppercase">Fit Mode</span>
              <div class="grid grid-cols-3 gap-0.5">
                <button 
                  v-for="mode in [
                    { id: 'stretch', label: 'Stretch' },
                    { id: 'contain', label: 'Fit' },
                    { id: 'tile', label: 'Tile' }
                  ]" 
                  :key="mode.id"
                  @click="fitMode = mode.id as any"
                  class="py-1 rounded-xs text-[9px] font-medium border transition text-center cursor-pointer"
                  :class="fitMode === mode.id ? 'bg-ui-accent text-white font-bold border-ui-accent' : 'bg-ui-input text-ui-textSecondary border-ui-borderSubtle'"
                >
                  {{ mode.label }}
                </button>
              </div>
            </div>
          </div>

          <!-- 4. Retro Palette Extraction -->
          <div class="bg-ui-input/60 p-2 rounded-xs border border-ui-borderSubtle space-y-1.5">
            <label class="flex items-center justify-between cursor-pointer">
              <span class="text-[10px] font-semibold text-ui-textPrimary flex items-center gap-1">
                <Sparkles class="w-3 h-3 text-amber-400" />
                <span>Extract Retro Palette</span>
              </span>
              <input 
                type="checkbox" 
                v-model="extractPalette" 
                class="rounded-xs accent-ui-accent cursor-pointer"
              />
            </label>

            <!-- Color Swatches Preview -->
            <div v-if="extractPalette && extractedColors.length > 0" class="grid grid-cols-8 gap-0.5 pt-0.5">
              <div 
                v-for="c in extractedColors" 
                :key="c"
                class="h-3.5 rounded-2xs border border-black/30 shadow-2xs"
                :style="{ backgroundColor: c }"
                :title="c"
              />
            </div>
          </div>

        </div>
      </div>

      <!-- Modal Footer -->
      <div class="h-11 bg-ui-panel px-3.5 flex items-center justify-between">
        <span class="text-[10px] text-ui-textMuted font-mono">Press Ctrl+Enter to Import</span>
        <div class="flex items-center gap-2">
          <button 
            @click="handleClose" 
            class="px-3.5 py-1 rounded-xs text-[11px] font-medium text-ui-textSecondary hover:text-ui-textPrimary bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle transition cursor-pointer"
          >
            Cancel
          </button>

          <button 
            @click="handleImport" 
            class="px-4 py-1 rounded-xs text-[11px] font-bold text-white bg-ui-accent hover:bg-ui-accentHover shadow-xs transition active:scale-95 cursor-pointer"
          >
            {{ isAtlasMode ? `Import Atlas (${computedTileDimensions.count} Tiles)` : 'Import Texture' }}
          </button>
        </div>
      </div>

    </div>
  </div>
</template>
