<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
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
const isFitToView = ref<boolean>(true)
const showUvOverlay = ref<boolean>(true)
const showPixelGrid = ref<boolean>(true)

const paintTools = [
  { id: 'brush', icon: 'brush', key: 'B', title: 'Pencil / Brush Tool' },
  { id: 'eraser', icon: 'eraser', key: 'E', title: 'Eraser Tool' },
  { id: 'bucket', icon: 'fill', key: 'G', title: 'Paint Bucket / Fill Tool' },
  { id: 'picker', icon: 'picker', key: 'I', title: 'Eyedropper Color Picker' },
  { id: 'line', icon: 'line', key: 'L', title: 'Line Tool' },
  { id: 'rect', icon: 'rect', key: 'U', title: 'Rectangle / Frame Tool' },
  { id: 'circle', icon: 'circle', key: 'C', title: 'Circle / Ellipse Tool' },
  { id: 'dither', icon: 'dither', key: 'D', title: 'Bayer Dither Brush' },
  { id: 'shade', icon: 'shade', key: 'H', title: 'Shading Brush' }
] as const

const cursorCoords = ref<{ x: number; y: number; hex: string } | null>(null)
const panOffset = ref<{ x: number; y: number }>({ x: 0, y: 0 })
const isPanning = ref<boolean>(false)
let panStart = { x: 0, y: 0 }
let containerResizeObserver: ResizeObserver | null = null

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
    isFitToView.value = false
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
    isFitToView.value = false
    panOffset.value.x = mouseX - (mouseX - panOffset.value.x) * (newZoom / oldZoom)
    panOffset.value.y = mouseY - (mouseY - panOffset.value.y) * (newZoom / oldZoom)
    zoom.value = newZoom
  }
}

function zoomOut() {
  isFitToView.value = false
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
  isFitToView.value = false
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
  isFitToView.value = true
  panOffset.value = { x: 0, y: 0 }
  renderCanvas()
}

watch(() => projectStore.textureRevision, renderCanvas)
watch(zoom, renderCanvas)
watch(showPixelGrid, renderCanvas)
watch(showUvOverlay, renderCanvas)

onMounted(() => {
  nextTick(() => {
    resetPanZoom()
    if (containerRef.value) {
      containerResizeObserver = new ResizeObserver(() => {
        if (isFitToView.value) resetPanZoom()
      })
      containerResizeObserver.observe(containerRef.value)
    }
  })
})

onBeforeUnmount(() => {
  containerResizeObserver?.disconnect()
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
  <div class="pixel-editor h-full w-full bg-ui-panel flex flex-col select-none overflow-hidden touch-none relative font-mono text-xs">
    <input ref="fileInputRef" type="file" accept="image/*" @change="handleTextureUpload" class="hidden" />

    <!-- Stable document and view controls -->
    <div class="pixel-document-bar">
      <div class="pixel-document-group">
        <!-- Main 2D Workspace Tabs: UV Editor vs Pixel Paint -->
        <div class="flex items-center bg-ui-input p-0.5 rounded-xs border border-ui-borderSubtle shrink-0 mr-1">
          <button 
            @click="toolStore.uvWorkspaceTab = 'uv'"
            class="flex items-center space-x-1 px-2 py-0.5 rounded-xs text-[10px] font-bold transition"
            :class="toolStore.uvWorkspaceTab === 'uv' ? 'bg-ui-accent text-white shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
            title="UV Unwrapping, Seams & Quadrant Atlas Mapping"
          >
            <BlenderIcon name="uv" :size="11" />
            <span>UV Editor</span>
          </button>

          <button 
            @click="toolStore.uvWorkspaceTab = 'paint'"
            class="flex items-center space-x-1 px-2 py-0.5 rounded-xs text-[10px] font-bold transition"
            :class="toolStore.uvWorkspaceTab === 'paint' ? 'bg-ui-accent text-white shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
            title="Pixel & Texture Paint Studio"
          >
            <BlenderIcon name="brush" :size="10" />
            <span>Pixel Paint</span>
          </button>
        </div>

        <span class="pixel-group-label">Texture</span>
        <select
          v-model="projectStore.activeTextureId"
          @change="onTextureChanged"
          class="pixel-texture-select pixel-control"
          title="Active texture"
        >
          <option v-for="t in projectStore.textures" :key="t.id" :value="t.id">
            {{ t.name }} ({{ t.width }}x{{ t.height }})
          </option>
        </select>

        <div class="pixel-resolution-control pixel-control">
          <span class="pixel-group-label">Canvas</span>
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
          >
            <option value="default" disabled selected>{{ projectStore.pixelBuffer.width }} × {{ projectStore.pixelBuffer.height }}</option>
            <option value="64x64">64 × 64 · PSX Retro</option>
            <option value="128x128">128 × 128 · Low-Poly</option>
            <option value="256x256">256 × 256 · Detailed Atlas</option>
            <option value="512x512">512 × 512 · HD Trim Sheet</option>
            <option value="1024x1024">1024 × 1024 · 2K Model</option>
            <option value="2048x2048">2048 × 2048 · 4K Atlas</option>
            <option value="custom">Custom canvas size…</option>
          </select>
        </div>

        <button @click="fileInputRef?.click()" class="pixel-action-button" title="Import texture image">
          <Upload class="w-3.5 h-3.5" />
          <span>Import</span>
        </button>
        <button @click="downloadTexturePng" class="pixel-action-button pixel-action-export" title="Export texture as PNG">
          <Download class="w-3.5 h-3.5" />
          <span>Export</span>
        </button>
      </div>

    </div>

    <div class="pixel-workspace">
      <!-- Dedicated tool rail keeps tools stable and scannable -->
      <aside class="pixel-tool-rail" aria-label="Pixel paint tools">
        <div class="pixel-tool-stack">
          <button
            v-for="tool in paintTools"
            :key="tool.id"
            @click="toolStore.setPaintTool(tool.id)"
            class="pixel-tool-button"
            :class="{ 'is-active': toolStore.paintTool === tool.id }"
            :title="`${tool.title} (${tool.key})`"
          >
            <BlenderIcon :name="tool.icon" :size="15" />
            <span>{{ tool.key }}</span>
          </button>
        </div>

        <div class="pixel-rail-colors" title="Primary and secondary colors">
          <label class="pixel-rail-swatch pixel-rail-swatch-primary" :style="{ backgroundColor: toolStore.primaryColor }">
            <input type="color" v-model="toolStore.primaryColor" />
          </label>
          <label class="pixel-rail-swatch pixel-rail-swatch-secondary" :style="{ backgroundColor: toolStore.secondaryColor }">
            <input type="color" v-model="toolStore.secondaryColor" />
          </label>
          <button @click="swapColors" title="Swap colors (X)"><ArrowLeftRight class="w-3 h-3" /></button>
        </div>
      </aside>

      <div class="pixel-stage">
        <!-- Contextual controls stay grouped by purpose -->
        <div class="pixel-context-bar">
          <div class="pixel-context-row pixel-brush-row">
            <div class="pixel-context-group">
              <span class="pixel-group-label">Brush size</span>
              <div class="pixel-segmented-control">
                <button
                  v-for="s in [1, 2, 4, 8, 16, 32]"
                  :key="s"
                  @click="toolStore.brushSize = s"
                  :class="{ 'is-active': toolStore.brushSize === s }"
                >{{ s }}</button>
              </div>
              <button
                v-if="toolStore.paintTool === 'rect' || toolStore.paintTool === 'circle'"
                @click="toolStore.brushFilled = !toolStore.brushFilled"
                class="pixel-context-button"
                :class="{ 'is-active': toolStore.brushFilled }"
              >{{ toolStore.brushFilled ? 'Filled' : 'Outline' }}</button>
              <button
                v-else
                @click="toolStore.brushShape = toolStore.brushShape === 'square' ? 'circle' : 'square'"
                class="pixel-context-button"
                title="Toggle square or round brush"
              >{{ toolStore.brushShape === 'square' ? 'Square' : 'Round' }}</button>
            </div>

            <div class="pixel-color-control">
              <span class="pixel-group-label">Color</span>
              <label class="pixel-color-chip" :style="{ backgroundColor: toolStore.primaryColor }">
                <input type="color" v-model="toolStore.primaryColor" />
              </label>
              <input type="text" v-model="toolStore.primaryColor" class="pixel-hex-input" aria-label="Primary color hex" />
            </div>

            <div class="pixel-adjustments">
              <span class="pixel-group-label">Effects</span>
              <select
                class="pixel-control"
                @change="(e) => {
                  const val = (e.target as HTMLSelectElement).value
                  if (val === 'retro-atlas') resetRetroAtlas()
                  else if (val === 'clear') clearTexture()
                  else applyAdjustment(val)
                  ;(e.target as HTMLSelectElement).value = 'default'
                }"
              >
                <option value="default" disabled selected>Adjust image…</option>
                <option value="outline">1px Outline Effect</option>
                <option value="brighten">Brightness +10%</option>
                <option value="darken">Darkness −10%</option>
                <option value="grayscale">Desaturate</option>
                <option value="invert">Invert Colors</option>
                <option value="flipH">Flip Horizontal</option>
                <option value="flipV">Flip Vertical</option>
                <option value="rot90">Rotate 90° CW</option>
                <option value="retro-atlas">Generate Retro Atlas</option>
                <option value="clear">Clear Canvas</option>
              </select>
            </div>
          </div>

          <div class="pixel-context-row pixel-palette-row">
            <span class="pixel-group-label">Palette</span>
            <select
              :value="selectedPaletteName"
              @change="(e) => switchPalette((e.target as HTMLSelectElement).value)"
              class="pixel-palette-select pixel-control"
            >
              <option v-for="name in Object.keys(palettePresets)" :key="name" :value="name">{{ name }}</option>
              <option v-if="!palettePresets[selectedPaletteName]" :value="selectedPaletteName">{{ selectedPaletteName }}</option>
            </select>
            <div class="pixel-palette-swatches">
              <button
                v-for="c in activePalette"
                :key="c"
                @click="toolStore.primaryColor = c"
                @contextmenu.prevent="toolStore.secondaryColor = c"
                :style="{ backgroundColor: c }"
                :title="`Primary: ${c} · Right-click for secondary`"
              ></button>
            </div>
            <button @click="extractPaletteFromTexture" class="pixel-context-button" title="Extract colors from texture">Extract</button>
          </div>
        </div>

        <!-- Canvas Scroll & Pan Viewport -->
        <div
          ref="containerRef"
          class="pixel-canvas-viewport"
          @wheel="onWheel"
        >
          <div class="pixel-view-group" aria-label="Canvas view controls">
            <button
              @click="showUvOverlay = !showUvOverlay"
              class="pixel-toggle-button"
              :class="{ 'is-active': showUvOverlay }"
              title="Toggle UV wireframe overlay"
            >UV</button>
            <button
              @click="showPixelGrid = !showPixelGrid"
              class="pixel-icon-button"
              :class="{ 'is-active': showPixelGrid }"
              title="Toggle pixel grid"
            ><Grid class="w-3.5 h-3.5" /></button>
            <div class="pixel-zoom-control">
              <button @click="zoomOut" title="Zoom out"><ZoomOut class="w-3.5 h-3.5" /></button>
              <span @dblclick="resetPanZoom" title="Double-click to fit">{{ Math.round(zoom * 100) }}%</span>
              <button @click="zoomIn" title="Zoom in"><ZoomIn class="w-3.5 h-3.5" /></button>
            </div>
            <button @click="resetPanZoom" class="pixel-icon-button" title="Fit canvas to view">
              <Maximize class="w-3.5 h-3.5" />
            </button>
          </div>

          <div :style="{ transform: `translate(${panOffset.x}px, ${panOffset.y}px)` }" class="transition-transform duration-75">
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

          <div class="pixel-status-hud">
            <span>{{ projectStore.pixelBuffer.width }} × {{ projectStore.pixelBuffer.height }}</span>
            <span v-if="cursorCoords">X {{ cursorCoords.x }} · Y {{ cursorCoords.y }}</span>
            <span class="pixel-status-tool">{{ toolStore.paintTool }}</span>
            <span class="pixel-status-help">Space + drag to pan · Wheel to zoom</span>
          </div>
        </div>
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

<style scoped>
.pixel-editor {
  container-type: inline-size;
}

.pixel-document-bar {
  min-height: 38px;
  padding: 5px 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex: none;
  color: var(--ui-text-secondary);
  background: var(--ui-bg-header);
  border-bottom: 1px solid var(--ui-border-subtle);
  box-shadow: 0 1px 0 rgb(0 0 0 / 18%);
}

.pixel-document-group,
.pixel-view-group,
.pixel-context-group,
.pixel-color-control,
.pixel-adjustments {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}

.pixel-document-group {
  flex: 1;
}

.pixel-view-group {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 8;
  flex: none;
  padding: 4px;
  background: color-mix(in srgb, var(--ui-bg-header) 94%, transparent);
  border: 1px solid var(--ui-border-strong);
  border-radius: 4px;
  box-shadow: 0 5px 18px rgb(0 0 0 / 28%);
  backdrop-filter: blur(8px);
}

.pixel-group-label {
  flex: none;
  color: var(--ui-text-muted);
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: .04em;
  text-transform: uppercase;
}

.pixel-control,
.pixel-resolution-control,
.pixel-action-button,
.pixel-toggle-button,
.pixel-icon-button,
.pixel-context-button,
.pixel-zoom-control,
.pixel-segmented-control,
.pixel-hex-input {
  height: 26px;
  color: var(--ui-text-primary);
  background: var(--ui-bg-input);
  border: 1px solid var(--ui-border-subtle);
  border-radius: 3px;
}

.pixel-control,
.pixel-resolution-control select {
  padding: 0 7px;
  font: inherit;
  font-size: 10px;
  outline: none;
}

.pixel-control:focus,
.pixel-resolution-control:focus-within,
.pixel-hex-input:focus {
  border-color: var(--ui-border-focus);
}

.pixel-texture-select {
  width: clamp(138px, 26cqw, 238px);
  min-width: 110px;
  text-overflow: ellipsis;
}

.pixel-resolution-control {
  display: flex;
  align-items: center;
  padding-left: 7px;
}

.pixel-resolution-control select {
  width: 88px;
  padding-left: 4px;
  color: var(--ui-text-accent);
  font-weight: 700;
  background: transparent;
  border: 0;
}

.pixel-action-button,
.pixel-toggle-button,
.pixel-icon-button,
.pixel-context-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 0 8px;
  color: var(--ui-text-secondary);
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
  transition: border-color 120ms ease, color 120ms ease, background 120ms ease;
}

.pixel-action-button:hover,
.pixel-toggle-button:hover,
.pixel-icon-button:hover,
.pixel-context-button:hover {
  color: var(--ui-text-primary);
  background: var(--ui-bg-hover);
  border-color: var(--ui-border-default);
}

.pixel-action-button:first-of-type {
  color: var(--ui-text-accent);
}

.pixel-action-export:hover {
  color: #34d399;
}

.pixel-icon-button {
  width: 26px;
  padding: 0;
}

.pixel-toggle-button.is-active,
.pixel-icon-button.is-active,
.pixel-context-button.is-active {
  color: var(--ui-text-accent);
  background: var(--ui-bg-active);
  border-color: var(--ui-accent);
}

.pixel-zoom-control {
  display: flex;
  align-items: stretch;
  overflow: hidden;
}

.pixel-zoom-control button {
  width: 25px;
  display: grid;
  place-items: center;
  color: var(--ui-text-muted);
}

.pixel-zoom-control button:hover {
  color: var(--ui-text-primary);
  background: var(--ui-bg-hover);
}

.pixel-zoom-control span {
  min-width: 48px;
  display: grid;
  place-items: center;
  color: var(--ui-text-primary);
  font-size: 9px;
  font-weight: 700;
  border-inline: 1px solid var(--ui-border-subtle);
}

.pixel-workspace {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.pixel-tool-rail {
  width: 44px;
  padding: 7px 5px;
  flex: none;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  background: var(--ui-bg-header);
  border-right: 1px solid var(--ui-border-subtle);
  box-shadow: 1px 0 0 rgb(0 0 0 / 14%);
  z-index: 5;
}

.pixel-tool-stack {
  display: grid;
  gap: 3px;
}

.pixel-tool-button {
  position: relative;
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  color: var(--ui-text-muted);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 3px;
  transition: color 120ms ease, background 120ms ease, border-color 120ms ease;
}

.pixel-tool-button:hover {
  color: var(--ui-text-primary);
  background: var(--ui-bg-hover);
  border-color: var(--ui-border-subtle);
}

.pixel-tool-button.is-active {
  color: var(--ui-text-accent);
  background: var(--ui-bg-active);
  border-color: var(--ui-accent);
  box-shadow: inset 2px 0 0 var(--ui-accent);
}

.pixel-tool-button span {
  position: absolute;
  right: 2px;
  bottom: 0;
  color: var(--ui-text-muted);
  font-size: 7px;
  opacity: .7;
}

.pixel-rail-colors {
  position: relative;
  height: 50px;
  border-top: 1px solid var(--ui-border-subtle);
  padding-top: 8px;
}

.pixel-rail-swatch {
  position: absolute;
  width: 21px;
  height: 21px;
  overflow: hidden;
  border: 2px solid var(--ui-border-strong);
  border-radius: 3px;
  box-shadow: 0 1px 4px rgb(0 0 0 / 35%);
  cursor: pointer;
}

.pixel-rail-swatch-primary { left: 1px; top: 9px; z-index: 2; }
.pixel-rail-swatch-secondary { right: 1px; top: 20px; }
.pixel-rail-swatch input { opacity: 0; width: 100%; height: 100%; cursor: pointer; }
.pixel-rail-colors button { position: absolute; left: 0; bottom: -2px; color: var(--ui-text-muted); }

.pixel-stage {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.pixel-context-bar {
  flex: none;
  padding: 5px 8px;
  background: var(--ui-bg-panel);
  border-bottom: 1px solid var(--ui-border-subtle);
  box-shadow: 0 2px 8px rgb(0 0 0 / 12%);
  z-index: 4;
}

.pixel-context-row {
  min-height: 28px;
  display: flex;
  align-items: center;
  gap: 7px;
}

.pixel-brush-row {
  padding-bottom: 4px;
  border-bottom: 1px solid var(--ui-border-subtle);
}

.pixel-palette-row {
  padding-top: 4px;
}

.pixel-segmented-control {
  display: flex;
  overflow: hidden;
}

.pixel-segmented-control button {
  min-width: 25px;
  padding: 0 5px;
  color: var(--ui-text-muted);
  font-size: 9px;
  font-weight: 700;
  border-right: 1px solid var(--ui-border-subtle);
}

.pixel-segmented-control button:last-child { border-right: 0; }
.pixel-segmented-control button:hover { color: var(--ui-text-primary); background: var(--ui-bg-hover); }
.pixel-segmented-control button.is-active { color: var(--ui-text-accent); background: var(--ui-bg-active); }

.pixel-color-control {
  margin-left: 4px;
  padding-left: 10px;
  border-left: 1px solid var(--ui-border-subtle);
}

.pixel-color-chip {
  width: 24px;
  height: 24px;
  overflow: hidden;
  border: 2px solid var(--ui-border-strong);
  border-radius: 3px;
  cursor: pointer;
}

.pixel-color-chip input { opacity: 0; width: 100%; height: 100%; cursor: pointer; }

.pixel-hex-input {
  width: 68px;
  padding: 0 6px;
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  outline: none;
}

.pixel-adjustments {
  margin-left: auto;
}

.pixel-adjustments .pixel-control {
  width: 132px;
  color: var(--ui-text-accent);
  font-weight: 700;
}

.pixel-palette-select {
  width: 148px;
  flex: none;
}

.pixel-palette-swatches {
  height: 26px;
  padding: 3px;
  flex: 1;
  min-width: 80px;
  display: flex;
  align-items: center;
  gap: 2px;
  overflow: hidden;
  background: var(--ui-bg-input);
  border: 1px solid var(--ui-border-subtle);
  border-radius: 3px;
}

.pixel-palette-swatches button {
  width: 14px;
  height: 17px;
  flex: 1 1 10px;
  min-width: 9px;
  max-width: 20px;
  border: 1px solid rgb(0 0 0 / 50%);
  border-radius: 2px;
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 5%);
  transition: transform 100ms ease, border-color 100ms ease;
}

.pixel-palette-swatches button:hover {
  z-index: 1;
  transform: translateY(-1px) scale(1.08);
  border-color: white;
}

.pixel-canvas-viewport {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: crosshair;
  touch-action: none;
  background-color: var(--ui-bg-root);
  background-image: radial-gradient(circle, rgb(255 255 255 / 3%) 1px, transparent 1px);
  background-size: 16px 16px;
}

.pixel-status-hud {
  position: absolute;
  left: 12px;
  bottom: 12px;
  min-height: 25px;
  max-width: calc(100% - 24px);
  padding: 0 9px;
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--ui-text-muted);
  font-size: 9px;
  background: color-mix(in srgb, var(--ui-bg-panel) 94%, transparent);
  border: 1px solid var(--ui-border-strong);
  border-radius: 3px;
  box-shadow: 0 4px 16px rgb(0 0 0 / 28%);
  pointer-events: none;
}

.pixel-status-tool {
  color: var(--ui-text-accent);
  font-weight: 800;
  text-transform: uppercase;
}

.pixel-status-help {
  padding-left: 10px;
  border-left: 1px solid var(--ui-border-subtle);
}

@container (max-width: 720px) {
  .pixel-document-bar {
    min-height: 38px;
  }

  .pixel-document-group {
    width: 100%;
  }

  .pixel-texture-select { flex: 1; width: auto; }
  .pixel-brush-row { flex-wrap: wrap; }
  .pixel-adjustments { margin-left: 0; }
}

@container (max-width: 560px) {
  .pixel-document-group > .pixel-group-label,
  .pixel-resolution-control .pixel-group-label,
  .pixel-color-control .pixel-group-label,
  .pixel-adjustments .pixel-group-label {
    display: none;
  }

  .pixel-action-button span { display: none; }
  .pixel-action-button { width: 26px; padding: 0; }
  .pixel-resolution-control { padding-left: 2px; }
  .pixel-resolution-control select { width: 76px; }
  .pixel-context-group { width: 100%; }
  .pixel-color-control { margin-left: 0; padding-left: 0; border-left: 0; }
  .pixel-adjustments { margin-left: auto; }
  .pixel-palette-select { width: 115px; }
  .pixel-status-help { display: none; }
}

@container (max-width: 420px) {
  .pixel-tool-rail { width: 40px; padding-inline: 4px; }
  .pixel-hex-input { display: none; }
  .pixel-adjustments .pixel-control { width: 108px; }
  .pixel-palette-row > .pixel-group-label { display: none; }
  .pixel-palette-select { width: 104px; }
  .pixel-palette-row { gap: 4px; }
}
</style>
