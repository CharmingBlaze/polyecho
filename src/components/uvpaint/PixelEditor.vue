<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { useToolStore } from '../../stores/toolStore'
import { generateRetroAtlas } from '../../core/painting/DefaultTextures'
import { 
  ZoomIn, 
  ZoomOut, 
  Grid, 
  PenTool,
  Upload,
  Download,
  Sparkles,
  Trash2
} from 'lucide-vue-next'

const projectStore = useProjectStore()
const toolStore = useToolStore()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

const zoom = ref<number>(6)
const showUvOverlay = ref<boolean>(true)
const showPixelGrid = ref<boolean>(true)

const cursorCoords = ref<{ x: number; y: number; hex: string } | null>(null)
const panOffset = ref<{ x: number; y: number }>({ x: 0, y: 0 })
const isPanning = ref<boolean>(false)
let panStart = { x: 0, y: 0 }

let isDrawing = false

function handleTextureUpload(event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.files || input.files.length === 0) return
  const file = input.files[0]
  const reader = new FileReader()
  reader.onload = (e) => {
    const url = e.target?.result as string
    projectStore.pixelBuffer.loadFromDataURL(url).then(() => {
      projectStore.markTextureUpdated()
      renderCanvas()
    })
  }
  reader.readAsDataURL(file)
}

function downloadTexturePng() {
  projectStore.pixelBuffer.canvas.toBlob((blob) => {
    if (blob) {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${projectStore.projectName}_texture.png`
      a.click()
      URL.revokeObjectURL(url)
    }
  })
}

function resetRetroAtlas() {
  projectStore.recordState('Generate Retro Atlas')
  generateRetroAtlas(projectStore.pixelBuffer)
  projectStore.markTextureUpdated()
  renderCanvas()
}

function clearTexture() {
  projectStore.recordState('Clear Texture')
  projectStore.pixelBuffer.clear('#1e293b')
  projectStore.markTextureUpdated()
  renderCanvas()
}

function renderCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const pb = projectStore.pixelBuffer
  canvas.width = pb.width * zoom.value
  canvas.height = pb.height * zoom.value

  ctx.imageSmoothingEnabled = false

  // 1. Draw Pixel Buffer image
  ctx.drawImage(pb.canvas, 0, 0, canvas.width, canvas.height)

  // 2. Draw Pixel Grid
  if (showPixelGrid.value && zoom.value >= 4) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
    ctx.lineWidth = 1

    for (let x = 0; x <= pb.width; x++) {
      ctx.beginPath()
      ctx.moveTo(x * zoom.value, 0)
      ctx.lineTo(x * zoom.value, canvas.height)
      ctx.stroke()
    }

    for (let y = 0; y <= pb.height; y++) {
      ctx.beginPath()
      ctx.moveTo(0, y * zoom.value)
      ctx.lineTo(canvas.width, y * zoom.value)
      ctx.stroke()
    }
  }

  // 3. Draw 3D UV Wireframe Overlay
  if (showUvOverlay.value && projectStore.activeMesh) {
    ctx.strokeStyle = '#38bdf8'
    ctx.lineWidth = 1.5
    ctx.fillStyle = 'rgba(56, 189, 248, 0.12)'

    projectStore.activeMesh.faces.forEach((face) => {
      if (face.uvs.length < 3) return
      ctx.beginPath()
      const first = face.uvs[0]
      ctx.moveTo(first.u * canvas.width, (1 - first.v) * canvas.height)

      for (let i = 1; i < face.uvs.length; i++) {
        const uv = face.uvs[i]
        ctx.lineTo(uv.u * canvas.width, (1 - uv.v) * canvas.height)
      }
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    })
  }
}

function getPixelCoords(e: PointerEvent): { x: number; y: number } | null {
  const canvas = canvasRef.value
  if (!canvas) return null
  const rect = canvas.getBoundingClientRect()
  const clickX = e.clientX - rect.left
  const clickY = e.clientY - rect.top

  const pb = projectStore.pixelBuffer
  const px = Math.floor(clickX / zoom.value)
  const py = Math.floor(clickY / zoom.value)

  if (px < 0 || px >= pb.width || py < 0 || py >= pb.height) return null
  return { x: px, y: py }
}

function onPointerDown(e: PointerEvent) {
  // Middle click -> Pan
  if (e.button === 1) {
    isPanning.value = true
    panStart = { x: e.clientX - panOffset.value.x, y: e.clientY - panOffset.value.y }
    return
  }

  if (e.button !== 0 && e.button !== 2) return

  toolStore.currentPointerType = (e.pointerType as any) || 'mouse'
  toolStore.currentPressure = e.pressure || 1.0

  const coords = getPixelCoords(e)
  if (!coords) return

  isDrawing = true
  projectStore.recordState('Pixel Paint')

  drawPixel(coords.x, coords.y, e.button === 2)
}

function onPointerMove(e: PointerEvent) {
  if (isPanning.value) {
    panOffset.value = {
      x: e.clientX - panStart.x,
      y: e.clientY - panStart.y
    }
    return
  }

  toolStore.currentPointerType = (e.pointerType as any) || 'mouse'
  toolStore.currentPressure = e.pressure || 1.0

  const coords = getPixelCoords(e)

  if (coords) {
    const pb = projectStore.pixelBuffer
    const hex = pb.getPixelHex(coords.x, coords.y)
    cursorCoords.value = { x: coords.x, y: coords.y, hex }
  } else {
    cursorCoords.value = null
  }

  if (isDrawing && coords) {
    drawPixel(coords.x, coords.y, e.buttons === 2)
  }
}

function onPointerUp() {
  if (isPanning.value) {
    isPanning.value = false
    return
  }
  if (isDrawing) {
    isDrawing = false
    projectStore.markTextureUpdated()
    renderCanvas()
  }
}

function drawPixel(x: number, y: number, isSecondary: boolean = false) {
  const pb = projectStore.pixelBuffer
  const color = isSecondary ? toolStore.secondaryColor : toolStore.primaryColor
  const size = toolStore.brushSize

  if (toolStore.paintTool === 'eraser') {
    pb.erase(x, y, size)
  } else if (toolStore.paintTool === 'bucket') {
    pb.floodFill(x, y, color)
  } else if (toolStore.paintTool === 'picker') {
    const picked = pb.getPixelHex(x, y)
    if (isSecondary) toolStore.secondaryColor = picked
    else toolStore.primaryColor = picked
  } else if (toolStore.paintTool === 'dither') {
    pb.drawDither(x, y, color, size)
  } else {
    pb.drawBrush(x, y, color, size)
  }

  projectStore.markTextureUpdated()
  renderCanvas()
}

function onWheel(e: WheelEvent) {
  e.preventDefault()
  if (e.ctrlKey || e.metaKey) {
    const delta = e.deltaY < 0 ? 1 : -1
    zoom.value = Math.max(1, Math.min(24, zoom.value + delta))
  } else {
    panOffset.value.x -= e.deltaX * 0.8
    panOffset.value.y -= e.deltaY * 0.8
  }
}

function resetPanZoom() {
  zoom.value = 6
  panOffset.value = { x: 0, y: 0 }
  renderCanvas()
}

watch(() => projectStore.textureRevision, renderCanvas)
watch(zoom, renderCanvas)
watch(showPixelGrid, renderCanvas)
watch(showUvOverlay, renderCanvas)

onMounted(() => {
  renderCanvas()
})

defineExpose({
  showUvOverlay,
  showPixelGrid,
  zoom,
  resetRetroAtlas,
  handleTextureUpload,
  downloadTexturePng,
  clearTexture,
  fileInputRef
})
</script>

<template>
  <div class="h-full w-full bg-dcc-900 flex flex-col select-none overflow-hidden touch-none relative">
    <input ref="fileInputRef" type="file" accept="image/*" @change="handleTextureUpload" class="hidden" />

    <!-- Top Complete Pixel Toolbar -->
    <div class="bg-dcc-850 border-b border-dcc-750 px-2 py-1 flex flex-wrap items-center justify-between gap-1.5 text-xs text-slate-300 shrink-0 font-mono">
      <!-- Left: File / Presets -->
      <div class="flex items-center space-x-1.5 shrink-0">
        <button 
          @click="fileInputRef?.click()" 
          class="flex items-center gap-1 px-2 py-0.5 bg-dcc-900 hover:bg-dcc-750 text-slate-300 rounded border border-dcc-700 text-[10px] transition"
          title="Upload custom texture PNG/JPG"
        >
          <Upload class="w-3 h-3 text-indigo-400" />
          <span>Upload</span>
        </button>

        <button 
          @click="downloadTexturePng" 
          class="flex items-center gap-1 px-2 py-0.5 bg-dcc-900 hover:bg-dcc-750 text-slate-300 rounded border border-dcc-700 text-[10px] transition"
          title="Download Texture PNG"
        >
          <Download class="w-3 h-3 text-emerald-400" />
          <span>Export</span>
        </button>

        <button 
          @click="resetRetroAtlas" 
          class="flex items-center gap-1 px-2 py-0.5 bg-dcc-900 hover:bg-dcc-750 text-amber-400 rounded border border-dcc-700 text-[10px] font-bold transition"
          title="Generate authentic PSX retro texture atlas"
        >
          <Sparkles class="w-3 h-3" />
          <span>Retro Atlas</span>
        </button>

        <button 
          @click="clearTexture" 
          class="p-1 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded border border-dcc-700 transition"
          title="Clear canvas"
        >
          <Trash2 class="w-3 h-3" />
        </button>
      </div>

      <!-- Center: Stylus Pressure HUD -->
      <div class="flex items-center space-x-1 bg-dcc-900 border border-dcc-750 px-1.5 py-0.5 rounded shrink-0">
        <button 
          @click="toolStore.stylusPressureEnabled = !toolStore.stylusPressureEnabled"
          class="flex items-center gap-1 text-[10px] font-bold transition"
          :class="toolStore.stylusPressureEnabled ? 'text-amber-400' : 'text-slate-500'"
          title="Toggle Stylus / Pen Pressure Sensitivity"
        >
          <PenTool class="w-3 h-3" />
          <span>Stylus: {{ toolStore.stylusPressureEnabled ? 'ON' : 'Fixed' }}</span>
        </button>
        <span class="text-[9px] text-slate-400 border-l border-dcc-750 pl-1">
          {{ toolStore.currentPointerType === 'pen' ? `${Math.round(toolStore.currentPressure * 100)}%` : 'MOUSE' }}
        </span>
      </div>

      <!-- Right: Overlays & Zoom -->
      <div class="flex items-center space-x-1 shrink-0">
        <button 
          @click="showUvOverlay = !showUvOverlay" 
          class="px-1.5 py-0.5 rounded text-[10px] border transition"
          :class="showUvOverlay ? 'bg-sky-500/20 text-sky-300 border-sky-500/50 font-bold' : 'bg-dcc-900 text-slate-500 border-dcc-750'"
          title="Toggle 3D UV Wireframe Overlay"
        >
          UV Wire
        </button>

        <button 
          @click="showPixelGrid = !showPixelGrid" 
          class="p-1 rounded text-slate-400 hover:text-white border border-dcc-750 bg-dcc-900"
          :class="{ 'text-indigo-400 bg-indigo-500/20 border-indigo-500/50': showPixelGrid }"
          title="Toggle Pixel Grid"
        >
          <Grid class="w-3 h-3" />
        </button>

        <div class="flex items-center bg-dcc-900 border border-dcc-750 rounded">
          <button @click="zoom = Math.max(1, zoom - 1)" class="p-1 hover:bg-dcc-750 rounded-l text-slate-400 hover:text-white" title="Zoom Out">
            <ZoomOut class="w-3 h-3" />
          </button>
          <span @dblclick="resetPanZoom" class="px-1.5 font-mono text-[9px] text-slate-300 cursor-pointer" title="Double click to reset">
            {{ zoom }}x
          </span>
          <button @click="zoom = Math.min(24, zoom + 1)" class="p-1 hover:bg-dcc-750 rounded-r text-slate-400 hover:text-white" title="Zoom In">
            <ZoomIn class="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>

    <!-- Canvas Scroll & Pan Viewport -->
    <div 
      ref="containerRef"
      class="flex-1 min-h-0 relative overflow-hidden bg-dcc-950 flex items-center justify-center cursor-crosshair touch-none"
      @wheel="onWheel"
    >
      <!-- Moveable Pan Group -->
      <div 
        :style="{ transform: `translate(${panOffset.x}px, ${panOffset.y}px)` }"
        class="transition-transform duration-75"
      >
        <canvas 
          ref="canvasRef"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointerleave="onPointerUp"
          @pointercancel="onPointerUp"
          class="shadow-2xl border border-dcc-700/80 image-rendering-pixelated touch-none"
        ></canvas>
      </div>

      <!-- Status HUD: Resolution & Hover Pixel Coords -->
      <div class="absolute bottom-3 left-3 bg-dcc-850/90 border border-dcc-750/80 px-2.5 py-1 rounded shadow text-[10px] font-mono text-slate-400 flex items-center space-x-3 pointer-events-none">
        <span>Res: <strong class="text-slate-200">{{ projectStore.pixelBuffer.width }}x{{ projectStore.pixelBuffer.height }}</strong></span>
        <span v-if="cursorCoords">
          XY: <strong class="text-indigo-400">{{ cursorCoords.x }}, {{ cursorCoords.y }}</strong>
          <span class="inline-block w-2.5 h-2.5 rounded-xs ml-1.5 align-middle border border-black/40" :style="{ backgroundColor: cursorCoords.hex }"></span>
        </span>
        <span class="text-slate-500">Space+Drag to Pan</span>
      </div>
    </div>
  </div>
</template>
