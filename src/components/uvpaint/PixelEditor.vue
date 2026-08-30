<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { useToolStore } from '../../stores/toolStore'
import { generateRetroAtlas } from '../../core/painting/DefaultTextures'
import BlenderIcon from '../icons/BlenderIcon.vue'
import ImportTextureModal from '../modals/ImportTextureModal.vue'
import { 
  ZoomIn, 
  ZoomOut, 
  Grid, 
  Upload, 
  Download, 
  ArrowLeftRight,
  Maximize
} from 'lucide-vue-next'

const projectStore = useProjectStore()
const toolStore = useToolStore()

const showImportModal = ref(false)
const pendingImportFile = ref<File | null>(null)

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

// Interactive Drawing & Shape drag preview states
let isDrawing = false
let dragStartCoords: { x: number; y: number } | null = null
let dragCurrentCoords: { x: number; y: number } | null = null

// Custom Resize Modal State
const showResizeModal = ref(false)
const resizeW = ref(64)
const resizeH = ref(64)
const resizeMode = ref<'resample' | 'crop'>('crop')

// Palette Presets Engine
const selectedPaletteName = ref('Retro PSX (16)')
const palettePresets: Record<string, string[]> = {
  'Retro PSX (16)': [
    '#000000', '#ffffff', '#181425', '#b13e53', '#ef7d57', '#ffcd75', 
    '#38b764', '#257179', '#29366f', '#3b5dc9', '#41a6f6', '#73eff7',
    '#94b0c2', '#566c86', '#333c57', '#1a1c23'
  ],
  'PICO-8 (16)': [
    '#000000', '#1D2B53', '#7E2553', '#008751', '#AB5236', '#5F574F',
    '#C2C3C7', '#FFF1E8', '#FF004D', '#FFA300', '#FFEC27', '#00E436',
    '#29ADFF', '#83769C', '#FF77A8', '#FFCCAA'
  ],
  'Game Boy (4)': [
    '#0f380f', '#306230', '#8bac0f', '#9bbc0f'
  ],
  'Cyberpunk (16)': [
    '#080811', '#140c24', '#29103e', '#52145c', '#8a186b', '#c71f66',
    '#f53d5a', '#ff735c', '#ffb369', '#ffe682', '#00f0ff', '#00a3ff',
    '#0047ff', '#7000ff', '#e000ff', '#ffffff'
  ],
  'Earth & Foliage (16)': [
    '#19100f', '#2e1814', '#472218', '#6b3620', '#9c532b', '#c77e3c',
    '#e0aa53', '#f2d37c', '#202e1c', '#334825', '#49632d', '#668237',
    '#8ea346', '#bcc259', '#e0df7b', '#f5f0b5'
  ]
}

const activePalette = ref<string[]>([...palettePresets['Retro PSX (16)']])

function switchPalette(name: string) {
  selectedPaletteName.value = name
  if (palettePresets[name]) {
    activePalette.value = [...palettePresets[name]]
  }
}

function extractPaletteFromTexture() {
  const extracted = projectStore.pixelBuffer.extractPalette(32)
  if (extracted.length > 0) {
    activePalette.value = extracted
    selectedPaletteName.value = 'Extracted (' + extracted.length + ')'
  }
}

function swapColors() {
  const temp = toolStore.primaryColor
  toolStore.primaryColor = toolStore.secondaryColor
  toolStore.secondaryColor = temp
}

function handleTextureUpload(event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.files || input.files.length === 0) return
  pendingImportFile.value = input.files[0]
  showImportModal.value = true
  input.value = ''
}

function onTextureChanged() {
  projectStore.markTextureUpdated()
  nextTick(() => {
    resetPanZoom()
    renderCanvas()
  })
}

function downloadTexturePng() {
  projectStore.pixelBuffer.canvas.toBlob((blob) => {
    if (blob) {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${projectStore.projectName}_texture_${projectStore.pixelBuffer.width}x${projectStore.pixelBuffer.height}.png`
      a.click()
      URL.revokeObjectURL(url)
    }
  })
}

function resetRetroAtlas() {
  generateRetroAtlas(projectStore.pixelBuffer)
  projectStore.markTextureUpdated()
  renderCanvas()
}

function clearTexture() {
  projectStore.recordState('Clear Texture')
  projectStore.pixelBuffer.clear()
  projectStore.markTextureUpdated()
  renderCanvas()
}

function handleQuickResize(w: number, h: number) {
  projectStore.recordState(`Resize Texture to ${w}x${h}`)
  projectStore.pixelBuffer.resize(w, h, 'crop')
  const maxDim = Math.max(w, h)
  if (maxDim >= 1024) zoom.value = 1
  else if (maxDim >= 512) zoom.value = 2
  else if (maxDim >= 256) zoom.value = 3
  else if (maxDim >= 128) zoom.value = 4
  else zoom.value = 6
  projectStore.markTextureUpdated()
  renderCanvas()
}

function applyCustomResize() {
  projectStore.recordState(`Resize Texture to ${resizeW.value}x${resizeH.value}`)
  projectStore.pixelBuffer.resize(resizeW.value, resizeH.value, resizeMode.value)
  showResizeModal.value = false
  projectStore.markTextureUpdated()
  renderCanvas()
}

function getPixelCoords(e: PointerEvent): { x: number; y: number } | null {
  const canvas = canvasRef.value
  if (!canvas) return null
  const rect = canvas.getBoundingClientRect()
  const px = Math.floor((e.clientX - rect.left) / zoom.value)
  const py = Math.floor((e.clientY - rect.top) / zoom.value)
  const pb = projectStore.pixelBuffer
  if (px < 0 || px >= pb.width || py < 0 || py >= pb.height) return null
  return { x: px, y: py }
}

function renderCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const pb = projectStore.pixelBuffer
  const width = pb.width * zoom.value
  const height = pb.height * zoom.value

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }

  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, width, height)

  // 1. Draw Checkerboard background for transparency
  const checkSize = Math.max(6, Math.min(24, Math.round(zoom.value * 2)))
  for (let y = 0; y < height; y += checkSize) {
    for (let x = 0; x < width; x += checkSize) {
      const isEven = (Math.floor(x / checkSize) + Math.floor(y / checkSize)) % 2 === 0
      ctx.fillStyle = isEven ? '#1e2025' : '#141619'
      ctx.fillRect(x, y, checkSize, checkSize)
    }
  }

  // 2. Draw actual pixel buffer
  ctx.drawImage(pb.canvas, 0, 0, width, height)

  // 3. Draw Interactive Live Shape Preview (Line, Rect, Circle)
  if (isDrawing && dragStartCoords && dragCurrentCoords) {
    const isSecondary = false
    const color = isSecondary ? toolStore.secondaryColor : toolStore.primaryColor
    const size = toolStore.brushSize
    const opacity = toolStore.brushOpacity
    const filled = toolStore.brushFilled

    ctx.save()
    ctx.globalAlpha = opacity

    if (toolStore.paintTool === 'line') {
      ctx.strokeStyle = color
      ctx.lineWidth = Math.max(1, size * zoom.value)
      ctx.beginPath()
      ctx.moveTo((dragStartCoords.x + 0.5) * zoom.value, (dragStartCoords.y + 0.5) * zoom.value)
      ctx.lineTo((dragCurrentCoords.x + 0.5) * zoom.value, (dragCurrentCoords.y + 0.5) * zoom.value)
      ctx.stroke()
    } else if (toolStore.paintTool === 'rect') {
      const minX = Math.min(dragStartCoords.x, dragCurrentCoords.x) * zoom.value
      const minY = Math.min(dragStartCoords.y, dragCurrentCoords.y) * zoom.value
      const w = (Math.abs(dragCurrentCoords.x - dragStartCoords.x) + 1) * zoom.value
      const h = (Math.abs(dragCurrentCoords.y - dragStartCoords.y) + 1) * zoom.value

      if (filled) {
        ctx.fillStyle = color
        ctx.fillRect(minX, minY, w, h)
      } else {
        ctx.strokeStyle = color
        ctx.lineWidth = Math.max(1, size * zoom.value)
        ctx.strokeRect(minX, minY, w, h)
      }
    } else if (toolStore.paintTool === 'circle') {
      const cx = (dragStartCoords.x + 0.5) * zoom.value
      const cy = (dragStartCoords.y + 0.5) * zoom.value
      const dx = (dragCurrentCoords.x - dragStartCoords.x) * zoom.value
      const dy = (dragCurrentCoords.y - dragStartCoords.y) * zoom.value
      const radius = Math.sqrt(dx * dx + dy * dy)

      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      if (filled) {
        ctx.fillStyle = color
        ctx.fill()
      } else {
        ctx.strokeStyle = color
        ctx.lineWidth = Math.max(1, size * zoom.value)
        ctx.stroke()
      }
    }
    ctx.restore()
  }

  // 4. Pixel Grid (Only show when zoomed in enough)
  if (showPixelGrid.value && zoom.value >= 4 && pb.width <= 512) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
    ctx.lineWidth = 1
    for (let x = 0; x <= pb.width; x++) {
      ctx.beginPath()
      ctx.moveTo(x * zoom.value, 0)
      ctx.lineTo(x * zoom.value, height)
      ctx.stroke()
    }
    for (let y = 0; y <= pb.height; y++) {
      ctx.beginPath()
      ctx.moveTo(0, y * zoom.value)
      ctx.lineTo(width, y * zoom.value)
      ctx.stroke()
    }
  }

  // 5. UV Overlay
  if (showUvOverlay.value && projectStore.activeMesh) {
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)'
    ctx.lineWidth = 1.2
    for (const face of projectStore.activeMesh.faces) {
      if (face.uvs.length < 3) continue
      ctx.beginPath()
      ctx.moveTo(face.uvs[0].u * width, (1 - face.uvs[0].v) * height)
      for (let i = 1; i < face.uvs.length; i++) {
        ctx.lineTo(face.uvs[i].u * width, (1 - face.uvs[i].v) * height)
      }
      ctx.closePath()
      ctx.stroke()
    }
  }
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
  dragStartCoords = { ...coords }
  dragCurrentCoords = { ...coords }

  const tool = toolStore.paintTool
  if (tool === 'line' || tool === 'rect' || tool === 'circle') {
    // Shapes handle preview on drag, commit on pointerup
    renderCanvas()
    return
  }

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
    dragCurrentCoords = { ...coords }
    const tool = toolStore.paintTool
    if (tool === 'line' || tool === 'rect' || tool === 'circle') {
      renderCanvas()
    } else {
      drawPixel(coords.x, coords.y, e.buttons === 2)
    }
  }
}

function onPointerUp(e: PointerEvent) {
  if (isPanning.value) {
    isPanning.value = false
    return
  }

  if (isDrawing) {
    isDrawing = false

    const tool = toolStore.paintTool
    const pb = projectStore.pixelBuffer
    const isSecondary = e.button === 2
    const color = isSecondary ? toolStore.secondaryColor : toolStore.primaryColor
    const size = toolStore.brushSize
    const opacity = toolStore.brushOpacity
    const filled = toolStore.brushFilled

    if (dragStartCoords && dragCurrentCoords) {
      if (tool === 'line') {
        projectStore.recordState('Draw Line')
        pb.drawLine(dragStartCoords.x, dragStartCoords.y, dragCurrentCoords.x, dragCurrentCoords.y, color, size, opacity)
      } else if (tool === 'rect') {
        projectStore.recordState('Draw Rectangle')
        pb.drawRect(dragStartCoords.x, dragStartCoords.y, dragCurrentCoords.x, dragCurrentCoords.y, color, size, filled, opacity)
      } else if (tool === 'circle') {
        projectStore.recordState('Draw Circle')
        const dx = dragCurrentCoords.x - dragStartCoords.x
        const dy = dragCurrentCoords.y - dragStartCoords.y
        const radius = Math.sqrt(dx * dx + dy * dy)
        pb.drawCircle(dragStartCoords.x, dragStartCoords.y, radius, color, size, filled, opacity)
      }
    }

    dragStartCoords = null
    dragCurrentCoords = null

    projectStore.markTextureUpdated()
    renderCanvas()
  }
}

function drawPixel(x: number, y: number, isSecondary: boolean = false) {
  const pb = projectStore.pixelBuffer
  const color = isSecondary ? toolStore.secondaryColor : toolStore.primaryColor
  const size = toolStore.brushSize
  const opacity = toolStore.brushOpacity
  const shape = toolStore.brushShape

  if (toolStore.paintTool === 'eraser') {
    pb.erase(x, y, size, shape)
  } else if (toolStore.paintTool === 'bucket') {
    pb.floodFill(x, y, color)
  } else if (toolStore.paintTool === 'picker') {
    const picked = pb.getPixelHex(x, y)
    if (isSecondary) toolStore.secondaryColor = picked
    else toolStore.primaryColor = picked
  } else if (toolStore.paintTool === 'dither') {
    pb.drawDither(x, y, color, size)
  } else if (toolStore.paintTool === 'shade') {
    pb.drawShade(x, y, 'lighten', size, 15)
  } else {
    pb.drawBrush(x, y, color, size, opacity, shape)
  }

  projectStore.markTextureUpdated()
  renderCanvas()
}

function applyAdjustment(action: string) {
  const pb = projectStore.pixelBuffer
  projectStore.recordState(`Apply ${action}`)

  if (action === 'invert') pb.invertColors()
  else if (action === 'brighten') pb.adjustBrightness(20)
  else if (action === 'darken') pb.adjustBrightness(-20)
  else if (action === 'grayscale') pb.desaturate()
  else if (action === 'outline') pb.generateOutline(toolStore.primaryColor)
  else if (action === 'flipH') pb.flip(true, false)
  else if (action === 'flipV') pb.flip(false, true)
  else if (action === 'rot90') pb.rotate(90)

  projectStore.markTextureUpdated()
  renderCanvas()
}

function onWheel(e: WheelEvent) {
  e.preventDefault()
  if (e.shiftKey) {
    panOffset.value.x -= e.deltaY * 0.8
    renderCanvas()
    return
  }

  const rect = containerRef.value?.getBoundingClientRect()
  const mouseX = rect ? e.clientX - rect.left - rect.width / 2 : panOffset.value.x
  const mouseY = rect ? e.clientY - rect.top - rect.height / 2 : panOffset.value.y

  const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85
  const oldZoom = zoom.value
  let newZoom = oldZoom * zoomFactor
  if (newZoom < 1) {
    newZoom = Math.max(0.005, Math.round(newZoom * 1000) / 1000)
  } else {
    newZoom = Math.min(64, Math.round(newZoom * 10) / 10)
  }

  if (newZoom !== oldZoom) {
    panOffset.value.x = mouseX - (mouseX - panOffset.value.x) * (newZoom / oldZoom)
    panOffset.value.y = mouseY - (mouseY - panOffset.value.y) * (newZoom / oldZoom)
    zoom.value = newZoom
  }
}

function zoomOut() {
  const oldZoom = zoom.value
  let newZoom = oldZoom * 0.8
  if (newZoom < 1) {
    newZoom = Math.max(0.005, Math.round(newZoom * 1000) / 1000)
  } else {
    newZoom = Math.max(0.005, Math.round(newZoom * 10) / 10)
  }
  zoom.value = newZoom
}

function zoomIn() {
  const oldZoom = zoom.value
  let newZoom = oldZoom * 1.25
  if (newZoom < 1) {
    newZoom = Math.round(newZoom * 1000) / 1000
  } else {
    newZoom = Math.min(64, Math.round(newZoom * 10) / 10)
  }
  zoom.value = newZoom
}

function resetPanZoom() {
  if (!containerRef.value) {
    panOffset.value = { x: 0, y: 0 }
    return
  }
  const w = containerRef.value.clientWidth
  const h = containerRef.value.clientHeight
  const targetW = w * 0.78
  const targetH = h * 0.78
  const pb = projectStore.pixelBuffer
  let fitZoom = Math.min(targetW / pb.width, targetH / pb.height)
  if (fitZoom >= 1) {
    fitZoom = Math.min(32, Math.floor(fitZoom))
  } else {
    fitZoom = Math.max(0.005, Math.round(fitZoom * 1000) / 1000)
  }
  zoom.value = fitZoom
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
  <div class="h-full w-full bg-ui-panel flex flex-col select-none overflow-hidden touch-none relative font-mono text-xs">
    <input ref="fileInputRef" type="file" accept="image/*" @change="handleTextureUpload" class="hidden" />

    <!-- Top Complete Dual-Row Professional Pixel & Texture Toolbar -->
    <!-- Row 1: Comprehensive Tool Strip, Brush Options, Resolution & View Controls -->
    <div class="h-7 bg-ui-header border-b border-ui-borderSubtle px-2 flex items-center justify-between gap-1 text-ui-textSecondary shrink-0 font-mono text-xs">
      <!-- Left: Tools Switcher & Options -->
      <div class="flex items-center gap-1.5 shrink-0">
        <!-- Tools Switcher Group (Brush, Eraser, Fill, Picker, Line, Rect, Circle, Dither, Shade) -->
        <div class="flex items-center bg-ui-input rounded-xs p-0.5 border border-ui-borderSubtle">
          <button 
            @click="toolStore.setPaintTool('brush')"
            class="p-1 rounded-xs text-ui-textMuted hover:text-ui-textPrimary transition"
            :class="{ 'bg-ui-active text-ui-textAccent font-bold shadow-xs': toolStore.paintTool === 'brush' }"
            title="Pencil / Brush Tool (B)"
          >
            <BlenderIcon name="brush" :size="12" />
          </button>
          <button 
            @click="toolStore.setPaintTool('eraser')"
            class="p-1 rounded-xs text-ui-textMuted hover:text-ui-textPrimary transition"
            :class="{ 'bg-ui-active text-ui-textAccent font-bold shadow-xs': toolStore.paintTool === 'eraser' }"
            title="Eraser Tool (E)"
          >
            <BlenderIcon name="eraser" :size="12" />
          </button>
          <button 
            @click="toolStore.setPaintTool('bucket')"
            class="p-1 rounded-xs text-ui-textMuted hover:text-ui-textPrimary transition"
            :class="{ 'bg-ui-active text-ui-textAccent font-bold shadow-xs': toolStore.paintTool === 'bucket' }"
            title="Paint Bucket / Fill Tool (G)"
          >
            <BlenderIcon name="fill" :size="12" />
          </button>
          <button 
            @click="toolStore.setPaintTool('picker')"
            class="p-1 rounded-xs text-ui-textMuted hover:text-ui-textPrimary transition"
            :class="{ 'bg-ui-active text-ui-textAccent font-bold shadow-xs': toolStore.paintTool === 'picker' }"
            title="Eyedropper Color Picker (I)"
          >
            <BlenderIcon name="picker" :size="12" />
          </button>

          <div class="h-3 w-px bg-ui-borderSubtle mx-0.5"></div>

          <!-- Shape Tools -->
          <button 
            @click="toolStore.setPaintTool('line')"
            class="p-1 rounded-xs text-ui-textMuted hover:text-ui-textPrimary transition"
            :class="{ 'bg-ui-active text-ui-textAccent font-bold shadow-xs': toolStore.paintTool === 'line' }"
            title="Line Tool (L)"
          >
            <BlenderIcon name="line" :size="12" />
          </button>
          <button 
            @click="toolStore.setPaintTool('rect')"
            class="p-1 rounded-xs text-ui-textMuted hover:text-ui-textPrimary transition"
            :class="{ 'bg-ui-active text-ui-textAccent font-bold shadow-xs': toolStore.paintTool === 'rect' }"
            title="Rectangle / Frame Tool (U)"
          >
            <BlenderIcon name="rect" :size="12" />
          </button>
          <button 
            @click="toolStore.setPaintTool('circle')"
            class="p-1 rounded-xs text-ui-textMuted hover:text-ui-textPrimary transition"
            :class="{ 'bg-ui-active text-ui-textAccent font-bold shadow-xs': toolStore.paintTool === 'circle' }"
            title="Circle / Ellipse Tool (C)"
          >
            <BlenderIcon name="circle" :size="12" />
          </button>
          <button 
            @click="toolStore.setPaintTool('dither')"
            class="p-1 rounded-xs text-ui-textMuted hover:text-ui-textPrimary transition"
            :class="{ 'bg-ui-active text-ui-textAccent font-bold shadow-xs': toolStore.paintTool === 'dither' }"
            title="Bayer Dither Shader (D)"
          >
            <BlenderIcon name="dither" :size="12" />
          </button>
          <button 
            @click="toolStore.setPaintTool('shade')"
            class="p-1 rounded-xs text-ui-textMuted hover:text-ui-textPrimary transition"
            :class="{ 'bg-ui-active text-ui-textAccent font-bold shadow-xs': toolStore.paintTool === 'shade' }"
            title="Shading Brush (Lighten / Darken) (H)"
          >
            <BlenderIcon name="shade" :size="12" />
          </button>
        </div>

        <!-- Brush Size Stepper & Presets -->
        <div class="flex items-center bg-ui-input rounded-xs border border-ui-borderSubtle p-0.5 text-[10px]">
          <span class="text-[9px] text-ui-textMuted px-1 font-semibold">Size:</span>
          <button 
            v-for="s in [1, 2, 4, 8, 16, 32]" 
            :key="s"
            @click="toolStore.brushSize = s"
            class="px-1.5 py-0.5 rounded-xs transition font-bold"
            :class="toolStore.brushSize === s ? 'bg-ui-active text-ui-textAccent' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
          >
            {{ s }}
          </button>
        </div>

        <!-- Shape / Brush Option Toggles -->
        <div v-if="toolStore.paintTool === 'rect' || toolStore.paintTool === 'circle'" class="flex items-center bg-ui-input rounded-xs border border-ui-borderSubtle px-1 py-0.5 text-[10px]">
          <button 
            @click="toolStore.brushFilled = !toolStore.brushFilled"
            class="px-1.5 py-0.5 rounded-xs font-bold transition"
            :class="toolStore.brushFilled ? 'bg-ui-active text-ui-textAccent' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
          >
            {{ toolStore.brushFilled ? 'Filled' : 'Outline' }}
          </button>
        </div>

        <!-- Brush Shape Toggle (Square vs Circle) -->
        <div v-else class="flex items-center bg-ui-input rounded-xs border border-ui-borderSubtle px-1 py-0.5 text-[10px]">
          <button 
            @click="toolStore.brushShape = toolStore.brushShape === 'square' ? 'circle' : 'square'"
            class="px-1.5 py-0.5 rounded-xs font-semibold text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover"
            title="Toggle Square (Pixel) vs Circle (Round) brush shape"
          >
            {{ toolStore.brushShape === 'square' ? 'Square' : 'Round' }}
          </button>
        </div>
      </div>

      <!-- Right: Resolution Switcher, File Actions, Overlays & Zoom -->
      <div class="flex items-center space-x-1 shrink-0">
        <!-- Texture Canvas Resolution Switcher Dropdown -->
        <div class="flex items-center bg-ui-input rounded-xs border border-ui-borderSubtle px-1.5 py-0.5 text-[10px]">
          <span class="text-[9px] text-ui-textMuted font-semibold pr-1">Res:</span>
          <select 
            @change="(e) => {
              const val = (e.target as HTMLSelectElement).value
              if (val === 'custom') {
                resizeW = projectStore.pixelBuffer.width
                resizeH = projectStore.pixelBuffer.height
                showResizeModal = true
              } else {
                const [w, h] = val.split('x').map(Number)
                handleQuickResize(w, h)
              }
              ;(e.target as HTMLSelectElement).value = 'default'
            }"
            class="bg-transparent text-ui-textAccent font-bold focus:outline-none cursor-pointer"
          >
            <option value="default" disabled selected class="bg-ui-panel text-ui-textMuted">
              {{ projectStore.pixelBuffer.width }}x{{ projectStore.pixelBuffer.height }}
            </option>
            <option value="64x64" class="bg-ui-panel text-ui-textPrimary">64 x 64 (PSX Retro)</option>
            <option value="128x128" class="bg-ui-panel text-ui-textPrimary">128 x 128 (Standard Low-Poly)</option>
            <option value="256x256" class="bg-ui-panel text-ui-textPrimary">256 x 256 (Detailed Atlas)</option>
            <option value="512x512" class="bg-ui-panel text-ui-textPrimary">512 x 512 (HD Trim Sheet)</option>
            <option value="1024x1024" class="bg-ui-panel text-ui-textPrimary">1024 x 1024 (2K Full Model)</option>
            <option value="2048x2048" class="bg-ui-panel text-ui-textPrimary">2048 x 2048 (4K Ultra Atlas)</option>
            <option value="custom" class="bg-ui-panel text-ui-textAccent font-bold">Custom Canvas Size...</option>
          </select>
        </div>

        <div class="h-3.5 w-px bg-ui-borderSubtle mx-0.5"></div>

        <button 
          @click="fileInputRef?.click()" 
          class="flex items-center gap-1 px-1.5 py-0.5 bg-ui-input hover:bg-ui-hover text-ui-textAccent rounded-xs border border-ui-borderSubtle text-[10px] font-bold transition"
          title="Upload texture PNG/JPG/WebP of any resolution"
        >
          <Upload class="w-3 h-3 text-ui-accent" />
          <span>Upload</span>
        </button>

        <button 
          @click="downloadTexturePng" 
          class="flex items-center gap-1 px-1.5 py-0.5 bg-ui-input hover:bg-ui-hover text-ui-textSecondary hover:text-emerald-500 rounded-xs border border-ui-borderSubtle text-[10px] transition"
          title="Download Texture PNG"
        >
          <Download class="w-3 h-3 text-emerald-500" />
          <span>Export</span>
        </button>

        <div class="h-3.5 w-px bg-ui-borderSubtle mx-0.5"></div>

        <!-- Texture Selector Dropdown -->
        <div class="flex items-center space-x-1">
          <span class="text-[10px] text-ui-textMuted font-semibold">Tex:</span>
          <select 
            v-model="projectStore.activeTextureId" 
            @change="onTextureChanged"
            class="bg-ui-input border border-ui-borderSubtle rounded-xs px-1.5 py-0.5 text-ui-textPrimary text-[10px] font-mono focus:outline-none focus:border-ui-accent cursor-pointer"
          >
            <option v-for="t in projectStore.textures" :key="t.id" :value="t.id">
              {{ t.name }} ({{ t.width }}x{{ t.height }})
            </option>
          </select>
        </div>

        <button 
          @click="showUvOverlay = !showUvOverlay" 
          class="px-1.5 py-0.5 rounded-xs text-[10px] border transition font-bold cursor-pointer"
          :class="showUvOverlay ? 'bg-ui-active text-ui-textAccent border-ui-accent/40 shadow-xs' : 'bg-ui-input text-ui-textMuted border-ui-borderSubtle hover:bg-ui-hover'"
          title="Toggle 3D UV Wireframe Overlay"
        >
          UV Wire
        </button>

        <button 
          @click="showPixelGrid = !showPixelGrid" 
          class="p-1 rounded-xs hover:bg-ui-hover text-ui-textMuted hover:text-ui-textPrimary border border-ui-borderSubtle bg-ui-input cursor-pointer"
          :class="{ 'text-ui-textAccent bg-ui-active border-ui-accent/40': showPixelGrid }"
          title="Toggle Pixel Grid"
        >
          <Grid class="w-3 h-3" />
        </button>

        <div class="flex items-center bg-ui-input border border-ui-borderSubtle rounded-xs">
          <button @click="zoomOut" class="p-1 hover:bg-ui-hover rounded-l-xs text-ui-textMuted hover:text-ui-textPrimary cursor-pointer" title="Zoom Out (-)">
            <ZoomOut class="w-3 h-3" />
          </button>
          <span @dblclick="resetPanZoom" class="px-1.5 font-mono text-[9px] text-ui-textPrimary cursor-pointer font-mono select-none" title="Double click to fit zoom (F)">
            {{ Math.round(zoom * 100) }}%
          </span>
          <button @click="zoomIn" class="p-1 hover:bg-ui-hover rounded-r-xs text-ui-textMuted hover:text-ui-textPrimary cursor-pointer" title="Zoom In (+)">
            <ZoomIn class="w-3 h-3" />
          </button>
        </div>

        <button 
          @click="resetPanZoom" 
          class="p-1 rounded-xs hover:bg-ui-hover text-ui-textMuted hover:text-ui-textPrimary border border-ui-borderSubtle bg-ui-input cursor-pointer"
          title="Frame / Fit to Viewport (F)"
        >
          <Maximize class="w-3 h-3" />
        </button>
      </div>
    </div>

    <!-- Row 2: Color Studio, Preset Palettes Strip & Image Adjustments -->
    <div class="h-7 bg-ui-panel border-b border-ui-borderSubtle px-2 flex items-center justify-between text-xs text-ui-textSecondary shrink-0 font-mono">
      <!-- Left: Dual Swatches & Color Input -->
      <div class="flex items-center space-x-1.5">
        <div class="flex items-center space-x-1 bg-ui-input px-1 py-0.5 rounded-xs border border-ui-borderSubtle">
          <div class="relative w-4 h-4 rounded-xs overflow-hidden border border-white/60 shadow-xs" title="Primary Color (Left Click to paint)">
            <input type="color" v-model="toolStore.primaryColor" class="absolute -top-2 -left-2 w-8 h-8 cursor-pointer border-none p-0 bg-transparent" />
          </div>
          <button @click="swapColors" class="p-0.5 text-ui-textMuted hover:text-ui-textPrimary transition" title="Swap Primary & Secondary Colors (X)">
            <ArrowLeftRight class="w-2.5 h-2.5" />
          </button>
          <div class="relative w-4 h-4 rounded-xs overflow-hidden border border-ui-borderDefault shadow-xs" title="Secondary Color (Right Click to paint)">
            <input type="color" v-model="toolStore.secondaryColor" class="absolute -top-2 -left-2 w-8 h-8 cursor-pointer border-none p-0 bg-transparent" />
          </div>
          <input type="text" v-model="toolStore.primaryColor" class="w-16 bg-transparent text-[10px] font-mono font-bold text-ui-textPrimary uppercase focus:outline-none pl-1" />
        </div>
      </div>

      <!-- Center: Palette Presets Switcher & Swatches Strip -->
      <div class="flex items-center space-x-1">
        <select 
          :value="selectedPaletteName"
          @change="(e) => switchPalette((e.target as HTMLSelectElement).value)"
          class="bg-ui-input text-ui-textPrimary border border-ui-borderSubtle rounded-xs px-1 py-0.5 text-[9px] focus:outline-none cursor-pointer"
        >
          <option v-for="name in Object.keys(palettePresets)" :key="name" :value="name" class="bg-ui-panel text-ui-textPrimary">{{ name }}</option>
          <option v-if="!palettePresets[selectedPaletteName]" :value="selectedPaletteName" class="bg-ui-panel text-ui-textPrimary">{{ selectedPaletteName }}</option>
        </select>

        <div class="flex items-center space-x-0.5 bg-ui-input p-0.5 rounded-xs border border-ui-borderSubtle max-w-[280px] overflow-x-auto">
          <button 
            v-for="c in activePalette" 
            :key="c"
            @click="toolStore.primaryColor = c"
            @contextmenu.prevent="toolStore.secondaryColor = c"
            class="w-3.5 h-3.5 rounded-xs border border-black/40 hover:border-white hover:scale-110 transition shadow-xs shrink-0"
            :style="{ backgroundColor: c }"
            :title="`Left Click: Set Primary (${c}) | Right Click: Set Secondary`"
          ></button>
        </div>

        <button 
          @click="extractPaletteFromTexture"
          class="px-1.5 py-0.5 rounded-xs bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle text-ui-textAccent text-[9px] font-bold transition"
          title="Extract dominant color palette from the current texture"
        >
          Extract
        </button>
      </div>

      <!-- Right: Aseprite Adjustments & FX Dropdown -->
      <div class="flex items-center space-x-1">
        <div class="flex items-center bg-ui-input rounded-xs border border-ui-borderSubtle px-1.5 py-0.5 text-[10px]">
          <select 
            @change="(e) => {
              const val = (e.target as HTMLSelectElement).value
              if (val === 'retro-atlas') resetRetroAtlas()
              else if (val === 'clear') clearTexture()
              else applyAdjustment(val)
              ;(e.target as HTMLSelectElement).value = 'default'
            }"
            class="bg-transparent text-ui-textAccent font-bold focus:outline-none cursor-pointer"
          >
            <option value="default" disabled selected class="bg-ui-panel text-ui-textMuted">Adjustments...</option>
            <option value="outline" class="bg-ui-panel text-ui-textAccent font-bold">1px Outline Effect</option>
            <option value="brighten" class="bg-ui-panel text-ui-textPrimary">Brightness (+10%)</option>
            <option value="darken" class="bg-ui-panel text-ui-textPrimary">Darkness (-10%)</option>
            <option value="grayscale" class="bg-ui-panel text-ui-textPrimary">Desaturate (Grayscale)</option>
            <option value="invert" class="bg-ui-panel text-ui-textPrimary">Invert Colors</option>
            <option value="flipH" class="bg-ui-panel text-ui-textPrimary">Flip Horizontal</option>
            <option value="flipV" class="bg-ui-panel text-ui-textPrimary">Flip Vertical</option>
            <option value="rot90" class="bg-ui-panel text-ui-textPrimary">Rotate 90° CW</option>
            <option value="retro-atlas" class="bg-ui-panel text-ui-textAccent">Generate Retro Atlas</option>
            <option value="clear" class="bg-ui-panel text-rose-500 font-bold">Clear Canvas</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Canvas Scroll & Pan Viewport -->
    <div 
      ref="containerRef" 
      class="flex-1 min-h-0 relative overflow-hidden bg-ui-root flex items-center justify-center cursor-crosshair touch-none"
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
          class="shadow-2xl border border-ui-borderStrong image-rendering-pixelated touch-none"
        ></canvas>
      </div>

      <!-- Status HUD: Resolution & Hover Pixel Coords -->
      <div class="absolute bottom-3 left-3 bg-ui-panel/95 border border-ui-borderStrong px-2.5 py-1 rounded-xs shadow-md text-[10px] font-mono text-ui-textMuted flex items-center space-x-3 pointer-events-none z-10">
        <span>Res: <strong class="text-ui-textPrimary">{{ projectStore.pixelBuffer.width }}x{{ projectStore.pixelBuffer.height }}</strong></span>
        <span v-if="cursorCoords">
          XY: <strong class="text-ui-textAccent">{{ cursorCoords.x }}, {{ cursorCoords.y }}</strong>
          <span class="inline-block w-2.5 h-2.5 rounded-xs ml-1.5 align-middle border border-black/40" :style="{ backgroundColor: cursorCoords.hex }"></span>
        </span>
        <span class="text-ui-textMuted">Tool: <strong class="text-ui-textAccent uppercase">{{ toolStore.paintTool }}</strong></span>
        <span class="text-ui-textMuted">Space+Drag / Middle Click to Pan</span>
      </div>
    </div>

    <!-- Custom Canvas Resize Modal -->
    <div v-if="showResizeModal" class="absolute inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div class="bg-ui-panel border border-ui-borderStrong rounded-xs p-4 max-w-sm w-full space-y-3 shadow-2xl font-mono text-xs text-ui-textPrimary">
        <div class="flex items-center justify-between border-b border-ui-borderSubtle pb-2">
          <span class="font-bold text-ui-textPrimary uppercase tracking-wide">Resize Texture Canvas</span>
          <button @click="showResizeModal = false" class="text-ui-textMuted hover:text-ui-textPrimary">&times;</button>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-[10px] text-ui-textMuted mb-1">Width (px):</label>
            <input type="number" v-model.number="resizeW" min="8" max="8192" class="w-full bg-ui-input border border-ui-borderDefault rounded-xs px-2 py-1 text-ui-textPrimary font-bold focus:outline-none focus:border-ui-accent" />
          </div>
          <div>
            <label class="block text-[10px] text-ui-textMuted mb-1">Height (px):</label>
            <input type="number" v-model.number="resizeH" min="8" max="8192" class="w-full bg-ui-input border border-ui-borderDefault rounded-xs px-2 py-1 text-ui-textPrimary font-bold focus:outline-none focus:border-ui-accent" />
          </div>
        </div>

        <div>
          <label class="block text-[10px] text-ui-textMuted mb-1">Mode:</label>
          <div class="grid grid-cols-2 gap-2">
            <button 
              @click="resizeMode = 'crop'" 
              class="py-1 px-2 rounded-xs border text-center font-bold text-[10px] transition"
              :class="resizeMode === 'crop' ? 'bg-ui-active border-ui-accent/40 text-ui-textAccent' : 'bg-ui-input border-ui-borderSubtle text-ui-textMuted hover:bg-ui-hover'"
            >
              Extend / Crop
            </button>
            <button 
              @click="resizeMode = 'resample'" 
              class="py-1 px-2 rounded-xs border text-center font-bold text-[10px] transition"
              :class="resizeMode === 'resample' ? 'bg-ui-active border-ui-accent/40 text-ui-textAccent' : 'bg-ui-input border-ui-borderSubtle text-ui-textMuted hover:bg-ui-hover'"
            >
              Resample / Scale
            </button>
          </div>
        </div>

        <div class="flex justify-end space-x-2 pt-2 border-t border-ui-borderSubtle">
          <button @click="showResizeModal = false" class="px-3 py-1 bg-ui-input hover:bg-ui-hover rounded-xs text-ui-textMuted hover:text-ui-textPrimary text-[10px]">Cancel</button>
          <button @click="applyCustomResize" class="px-3 py-1 bg-ui-accent hover:bg-ui-accentHover rounded-xs text-white font-bold text-[10px]">Apply Resize</button>
        </div>
      </div>
    </div>

    <!-- Import Image Texture Modal -->
    <ImportTextureModal 
      v-if="showImportModal && pendingImportFile" 
      :file="pendingImportFile" 
      @close="() => { showImportModal = false; pendingImportFile = null }"
      @imported="() => {
        showImportModal = false
        pendingImportFile = null
        nextTick(() => {
          resetPanZoom()
          renderCanvas()
        })
      }"
    />
  </div>
</template>
