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

const activeDropdown = ref<string | null>(null)

function toggleDropdown(name: string) {
  activeDropdown.value = activeDropdown.value === name ? null : name
}

function closeDropdowns() {
  activeDropdown.value = null
}

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
const isSpacePressed = ref<boolean>(false)
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

// Touch & Stylus Gesture Tracking
const activePointers = new Map<number, { x: number; y: number; type: string }>()
let initialPinchDist = 0
let initialPinchZoom = 6
let initialPinchPan = { x: 0, y: 0 }
let activePenPointerId: number | null = null

function onKeyDown(e: KeyboardEvent) {
  if (e.code === 'Space') {
    isSpacePressed.value = true
  }
}

function onKeyUp(e: KeyboardEvent) {
  if (e.code === 'Space') {
    isSpacePressed.value = false
    isPanning.value = false
  }
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

function getPixelCoords(e: PointerEvent): { x: number; y: number } | null {
  const canvas = canvasRef.value
  if (!canvas) return null
  const rect = canvas.getBoundingClientRect()
  const mouseX = e.clientX - rect.left
  const mouseY = e.clientY - rect.top
  const ox = panOffset.value.x
  const oy = panOffset.value.y
  const pb = projectStore.pixelBuffer

  const px = Math.floor((mouseX - ox) / zoom.value)
  const py = Math.floor((mouseY - oy) / zoom.value)

  if (px < 0 || px >= pb.width || py < 0 || py >= pb.height) return null
  return { x: px, y: py }
}

function renderCanvas() {
  const canvas = canvasRef.value
  const container = containerRef.value
  if (!canvas || !container) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const w = container.clientWidth
  const h = container.clientHeight
  if (w <= 0 || h <= 0) return

  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
  }

  const pb = projectStore.pixelBuffer

  // Initialize panOffset to center if uninitialized
  if (panOffset.value.x === 0 && panOffset.value.y === 0) {
    panOffset.value = {
      x: Math.max(16, Math.round((w - pb.width * zoom.value) / 2)),
      y: Math.max(16, Math.round((h - pb.height * zoom.value) / 2))
    }
  }

  const texW = pb.width * zoom.value
  const texH = pb.height * zoom.value
  const ox = panOffset.value.x
  const oy = panOffset.value.y

  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  // 1. Draw Infinite Staging Yard Background
  ctx.fillStyle = '#0b0d12'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Subtle workspace background grid
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)'
  ctx.lineWidth = 1
  const stageGridSize = 32
  const startX = (ox % stageGridSize + stageGridSize) % stageGridSize
  const startY = (oy % stageGridSize + stageGridSize) % stageGridSize
  for (let x = startX; x < canvas.width; x += stageGridSize) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke()
  }
  for (let y = startY; y < canvas.height; y += stageGridSize) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke()
  }

  // 2. Draw Checkerboard background for transparency
  const checkSize = Math.max(4, Math.min(16, Math.round(zoom.value)))
  ctx.save()
  ctx.beginPath()
  ctx.rect(ox, oy, texW, texH)
  ctx.clip()

  for (let y = 0; y < texH; y += checkSize) {
    for (let x = 0; x < texW; x += checkSize) {
      const isEven = (Math.floor(x / checkSize) + Math.floor(y / checkSize)) % 2 === 0
      ctx.fillStyle = isEven ? '#1e2025' : '#141619'
      ctx.fillRect(ox + x, oy + y, checkSize, checkSize)
    }
  }

  // 3. Draw actual pixel buffer
  ctx.drawImage(pb.canvas, ox, oy, texW, texH)
  ctx.restore()

  // 4. Draw Canvas Drop Shadow & Border Outline
  ctx.strokeStyle = '#4f46e5'
  ctx.lineWidth = 1.5
  ctx.strokeRect(ox, oy, texW, texH)

  // 5. Draw Interactive Live Shape Preview (Line, Rect, Circle)
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
      ctx.moveTo(ox + (dragStartCoords.x + 0.5) * zoom.value, oy + (dragStartCoords.y + 0.5) * zoom.value)
      ctx.lineTo(ox + (dragCurrentCoords.x + 0.5) * zoom.value, oy + (dragCurrentCoords.y + 0.5) * zoom.value)
      ctx.stroke()
    } else if (toolStore.paintTool === 'rect') {
      const minX = Math.min(dragStartCoords.x, dragCurrentCoords.x)
      const minY = Math.min(dragStartCoords.y, dragCurrentCoords.y)
      const rw = (Math.abs(dragCurrentCoords.x - dragStartCoords.x) + 1) * zoom.value
      const rh = (Math.abs(dragCurrentCoords.y - dragStartCoords.y) + 1) * zoom.value

      if (filled) {
        ctx.fillStyle = color
        ctx.fillRect(ox + minX * zoom.value, oy + minY * zoom.value, rw, rh)
      } else {
        ctx.strokeStyle = color
        ctx.lineWidth = Math.max(1, size * zoom.value)
        ctx.strokeRect(ox + minX * zoom.value, oy + minY * zoom.value, rw, rh)
      }
    } else if (toolStore.paintTool === 'circle') {
      const cx = ox + (dragStartCoords.x + 0.5) * zoom.value
      const cy = oy + (dragStartCoords.y + 0.5) * zoom.value
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

  // 6. Pixel Grid (Only show when zoomed in enough)
  if (showPixelGrid.value && zoom.value >= 4 && pb.width <= 512) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
    ctx.lineWidth = 1
    for (let x = 0; x <= pb.width; x++) {
      ctx.beginPath()
      ctx.moveTo(ox + x * zoom.value, oy)
      ctx.lineTo(ox + x * zoom.value, oy + texH)
      ctx.stroke()
    }
    for (let y = 0; y <= pb.height; y++) {
      ctx.beginPath()
      ctx.moveTo(ox, oy + y * zoom.value)
      ctx.lineTo(ox + texW, oy + y * zoom.value)
      ctx.stroke()
    }
  }

  // 7. UV Wireframe Overlay
  if (showUvOverlay.value && projectStore.activeMesh) {
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)'
    ctx.lineWidth = 1.2
    for (const face of projectStore.activeMesh.faces) {
      if (face.uvs.length < 3) continue
      ctx.beginPath()
      ctx.moveTo(ox + face.uvs[0].u * texW, oy + (1 - face.uvs[0].v) * texH)
      for (let i = 1; i < face.uvs.length; i++) {
        ctx.lineTo(ox + face.uvs[i].u * texW, oy + (1 - face.uvs[i].v) * texH)
      }
      ctx.closePath()
      ctx.stroke()
    }
  }
}

function onPointerDown(e: PointerEvent) {
  (e.target as HTMLElement)?.setPointerCapture?.(e.pointerId)
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType })

  if (e.pointerType === 'pen') {
    activePenPointerId = e.pointerId
  }

  // Palm Rejection: Ignore touch events if pen is touching the screen
  if (activePenPointerId !== null && e.pointerType === 'touch') {
    return
  }

  // Two-Finger Pinch / Pan Gesture (Tablet / Touchscreen)
  if (activePointers.size === 2) {
    isDrawing = false
    dragStartCoords = null
    dragCurrentCoords = null
    const pts = Array.from(activePointers.values())
    initialPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
    initialPinchZoom = zoom.value
    initialPinchPan = { ...panOffset.value }
    panStart = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }
    return
  }

  // Middle click, Space+LMB, Alt+LMB -> Pan Canvas
  if (e.button === 1 || (e.button === 0 && isSpacePressed.value) || e.altKey) {
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
    renderCanvas()
    return
  }

  projectStore.recordState('Pixel Paint')
  drawPixel(coords.x, coords.y, e.button === 2, e.pressure)
}

function onPointerMove(e: PointerEvent) {
  if (activePointers.has(e.pointerId)) {
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType })
  }

  // Two-Finger Pinch Zoom & Pan
  if (activePointers.size === 2) {
    const pts = Array.from(activePointers.values())
    const curDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
    if (initialPinchDist > 0) {
      const scale = curDist / initialPinchDist
      zoom.value = Math.max(0.5, Math.min(64, Math.round(initialPinchZoom * scale * 10) / 10))
      const midX = (pts[0].x + pts[1].x) / 2
      const midY = (pts[0].y + pts[1].y) / 2
      panOffset.value = {
        x: initialPinchPan.x + (midX - panStart.x),
        y: initialPinchPan.y + (midY - panStart.y)
      }
      renderCanvas()
    }
    return
  }

  // Palm rejection check
  if (activePenPointerId !== null && e.pointerType === 'touch') {
    return
  }

  if (isPanning.value) {
    panOffset.value = {
      x: e.clientX - panStart.x,
      y: e.clientY - panStart.y
    }
    renderCanvas()
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
      drawPixel(coords.x, coords.y, e.buttons === 2, e.pressure)
    }
  }
}

function onPointerUp(e: PointerEvent) {
  activePointers.delete(e.pointerId)
  if (e.pointerId === activePenPointerId) {
    activePenPointerId = null
  }

  if (isPanning.value) {
    isPanning.value = false
    return
  }

  if (!isDrawing) return
  isDrawing = false

  const coords = getPixelCoords(e) || dragCurrentCoords
  const tool = toolStore.paintTool

  if (coords && dragStartCoords && (tool === 'line' || tool === 'rect' || tool === 'circle')) {
    projectStore.recordState(`Draw ${tool}`)
    const isSecondary = e.button === 2
    const color = isSecondary ? toolStore.secondaryColor : toolStore.primaryColor
    const size = toolStore.brushSize
    const opacity = toolStore.brushOpacity
    const filled = toolStore.brushFilled
    const pb = projectStore.pixelBuffer

    if (tool === 'line') {
      pb.drawLine(dragStartCoords.x, dragStartCoords.y, coords.x, coords.y, color, size, opacity)
    } else if (tool === 'rect') {
      pb.drawRect(dragStartCoords.x, dragStartCoords.y, coords.x, coords.y, color, size, filled, opacity)
    } else if (tool === 'circle') {
      const dx = coords.x - dragStartCoords.x
      const dy = coords.y - dragStartCoords.y
      const radius = Math.round(Math.sqrt(dx * dx + dy * dy))
      pb.drawCircle(dragStartCoords.x, dragStartCoords.y, radius, color, size, filled, opacity)
    }

    projectStore.markTextureUpdated()
    renderCanvas()
  }

  dragStartCoords = null
  dragCurrentCoords = null
}

function drawPixel(x: number, y: number, isSecondary = false, pressure = 1.0) {
  const pb = projectStore.pixelBuffer
  const color = isSecondary ? toolStore.secondaryColor : toolStore.primaryColor
  const size = toolStore.brushSize
  const opacity = toolStore.brushOpacity * (pressure > 0 ? pressure : 1.0)
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

function onWheel(e: WheelEvent) {
  e.preventDefault()

  // Trackpad / Shift+wheel horizontal pan
  if (e.shiftKey) {
    isFitToView.value = false
    panOffset.value.x -= e.deltaY * 0.8
    renderCanvas()
    return
  }

  // Laptop Trackpad 2-finger pan (deltaX + deltaY with no ctrlKey pinch)
  if (Math.abs(e.deltaX) > 0 && !e.ctrlKey) {
    isFitToView.value = false
    panOffset.value.x -= e.deltaX
    panOffset.value.y -= e.deltaY
    renderCanvas()
    return
  }

  const rect = containerRef.value?.getBoundingClientRect()
  const mouseX = rect ? e.clientX - rect.left : panOffset.value.x
  const mouseY = rect ? e.clientY - rect.top : panOffset.value.y

  const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85
  const oldZoom = zoom.value
  let newZoom = Math.max(0.25, Math.min(64, oldZoom * zoomFactor))
  if (newZoom < 1) {
    newZoom = Math.max(0.1, Math.round(newZoom * 100) / 100)
  } else {
    newZoom = Math.round(newZoom * 10) / 10
  }

  if (newZoom !== oldZoom) {
    isFitToView.value = false
    panOffset.value.x = mouseX - (mouseX - panOffset.value.x) * (newZoom / oldZoom)
    panOffset.value.y = mouseY - (mouseY - panOffset.value.y) * (newZoom / oldZoom)
    zoom.value = newZoom
    renderCanvas()
  }
}

function zoomOut() {
  isFitToView.value = false
  const oldZoom = zoom.value
  let newZoom = Math.max(0.25, oldZoom * 0.8)
  if (newZoom < 1) newZoom = Math.round(newZoom * 100) / 100
  else newZoom = Math.round(newZoom * 10) / 10
  zoom.value = newZoom
  renderCanvas()
}

function zoomIn() {
  isFitToView.value = false
  const oldZoom = zoom.value
  let newZoom = Math.min(64, oldZoom * 1.25)
  if (newZoom < 1) newZoom = Math.round(newZoom * 100) / 100
  else newZoom = Math.round(newZoom * 10) / 10
  zoom.value = newZoom
  renderCanvas()
}

function startLightWavePan(e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  isPanning.value = true
  panStart = { x: e.clientX - panOffset.value.x, y: e.clientY - panOffset.value.y }
  const onMove = (moveEvt: MouseEvent) => {
    panOffset.value = {
      x: moveEvt.clientX - panStart.x,
      y: moveEvt.clientY - panStart.y
    }
    renderCanvas()
  }
  const onUp = () => {
    isPanning.value = false
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

function startLightWaveZoom(e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  let prevY = e.clientY
  const onMove = (moveEvt: MouseEvent) => {
    const dy = moveEvt.clientY - prevY
    prevY = moveEvt.clientY
    const zoomFactor = Math.pow(0.985, dy)
    zoom.value = Math.max(0.1, Math.min(64, Math.round(zoom.value * zoomFactor * 100) / 100))
    renderCanvas()
  }
  const onUp = () => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

function resetPanZoom() {
  if (!containerRef.value) return
  const w = containerRef.value.clientWidth
  const h = containerRef.value.clientHeight
  const pb = projectStore.pixelBuffer
  if (w <= 0 || h <= 0) return

  const targetW = w * 0.78
  const targetH = h * 0.78
  let fitZoom = Math.min(targetW / pb.width, targetH / pb.height)
  if (fitZoom >= 1) {
    fitZoom = Math.floor(fitZoom)
  } else {
    fitZoom = Math.max(0.1, Math.round(fitZoom * 100) / 100)
  }

  zoom.value = Math.max(1, fitZoom)
  panOffset.value = {
    x: Math.max(16, Math.round((w - pb.width * zoom.value) / 2)),
    y: Math.max(16, Math.round((h - pb.height * zoom.value) / 2))
  }
  isFitToView.value = true
  renderCanvas()
}


watch(() => projectStore.textureRevision, renderCanvas)
watch(zoom, renderCanvas)
watch(showPixelGrid, renderCanvas)
watch(showUvOverlay, renderCanvas)

onMounted(() => {
  window.addEventListener('click', closeDropdowns)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
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
  window.removeEventListener('click', closeDropdowns)
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
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

    <!-- 1. ROW 1: WORKSPACE TABS & TEXTURE / CANVAS DOCUMENT BAR -->
    <div class="pixel-header-row-1 bg-ui-header border-b border-ui-borderSubtle px-2 flex items-center justify-between gap-2 shrink-0 z-30 select-none h-8 min-h-[32px]">
      <!-- Main 2D Workspace Tabs: UV Editor vs Pixel Paint -->
      <div class="flex items-center bg-ui-input p-0.5 rounded-xs border border-ui-borderSubtle shrink-0">
        <button 
          @click="toolStore.uvWorkspaceTab = 'uv'"
          class="flex items-center space-x-1.5 px-3 py-0.5 rounded-xs text-[10px] font-bold transition cursor-pointer"
          :class="toolStore.uvWorkspaceTab === 'uv' ? 'bg-ui-accent text-white shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="UV Unwrapping, Seams & Quadrant Atlas Mapping"
        >
          <BlenderIcon name="uv" :size="12" />
          <span>UV Editor</span>
        </button>

        <button 
          @click="toolStore.uvWorkspaceTab = 'paint'"
          class="flex items-center space-x-1.5 px-3 py-0.5 rounded-xs text-[10px] font-bold transition cursor-pointer"
          :class="toolStore.uvWorkspaceTab === 'paint' ? 'bg-ui-accent text-white shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Pixel & Texture Paint Studio"
        >
          <BlenderIcon name="brush" :size="11" />
          <span>Pixel Paint</span>
        </button>
      </div>

      <!-- Right: Texture Selector, Canvas Size, Import & Export -->
      <div class="flex items-center gap-1.5 shrink-0">
        <!-- Texture Selector -->
        <div class="flex items-center gap-1 px-1.5 py-0.5 rounded-xs bg-ui-input border border-ui-borderSubtle text-[10px]">
          <span class="text-ui-textMuted font-bold text-[9px]">TEX:</span>
          <select 
            v-model="projectStore.activeTextureId" 
            @change="onTextureChanged"
            class="bg-transparent text-ui-textPrimary font-mono focus:outline-none cursor-pointer max-w-[130px] truncate"
          >
            <option v-for="t in projectStore.textures" :key="t.id" :value="t.id" class="bg-ui-panel">
              {{ t.name }} ({{ t.width }}x{{ t.height }})
            </option>
          </select>
        </div>

        <!-- Canvas Resolution Selector -->
        <div class="flex items-center gap-1 px-1.5 py-0.5 rounded-xs bg-ui-input border border-ui-borderSubtle text-[10px]">
          <span class="text-ui-textMuted font-bold text-[9px]">RES:</span>
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
            class="bg-transparent text-amber-400 font-bold focus:outline-none cursor-pointer"
          >
            <option value="default" disabled selected class="bg-ui-panel">{{ projectStore.pixelBuffer.width }}x{{ projectStore.pixelBuffer.height }}</option>
            <option value="64x64" class="bg-ui-panel text-ui-textPrimary">64 × 64 (PSX)</option>
            <option value="128x128" class="bg-ui-panel text-ui-textPrimary">128 × 128 (Low-Poly)</option>
            <option value="256x256" class="bg-ui-panel text-ui-textPrimary">256 × 256 (Atlas)</option>
            <option value="512x512" class="bg-ui-panel text-ui-textPrimary">512 × 512 (HD)</option>
            <option value="custom" class="bg-ui-panel text-ui-textAccent font-bold">Custom Size...</option>
          </select>
        </div>

        <button 
          @click="fileInputRef?.click()" 
          class="flex items-center gap-1 px-2 py-0.5 rounded-xs bg-ui-input hover:bg-ui-hover text-ui-textAccent text-[10px] font-bold border border-ui-borderSubtle transition cursor-pointer"
          title="Import Texture Image"
        >
          <Upload class="w-3 h-3 text-ui-accent" />
          <span>Import</span>
        </button>

        <button 
          @click="downloadTexturePng" 
          class="flex items-center gap-1 px-2 py-0.5 hover:bg-ui-hover rounded-xs text-emerald-400 border border-ui-borderSubtle bg-ui-input text-[10px] font-bold transition cursor-pointer"
          title="Export Texture PNG"
        >
          <Download class="w-3 h-3 text-emerald-400" />
          <span>Export</span>
        </button>
      </div>
    </div>

    <!-- 2. ROW 2: DCC MENUS, BRUSH SIZE & COLOR SWATCHES -->
    <div class="pixel-header-row-2 bg-ui-panel border-b border-ui-borderSubtle px-2 flex items-center justify-between gap-2 shrink-0 z-20 select-none h-8 min-h-[32px] overflow-visible">
      <!-- Left: DCC Menus & Brush Controls -->
      <div class="flex items-center gap-1.5 min-w-0">
        <!-- Image Menu Dropdown -->
        <div class="relative" @click.stop>
          <button 
            @click="toggleDropdown('image')"
            class="px-2 py-1 text-xs font-semibold rounded-xs transition cursor-pointer flex items-center gap-1"
            :class="activeDropdown === 'image' ? 'bg-ui-hover text-ui-textAccent shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
          >
            <span>Image</span>
            <span class="text-[8px] opacity-70">▼</span>
          </button>

          <div v-if="activeDropdown === 'image'" class="header-dropdown-menu absolute left-0 top-full mt-1 w-52 bg-ui-panel text-ui-textPrimary border border-ui-borderStrong rounded-xs shadow-2xl py-1 z-50 text-xs">
            <div class="px-3 py-0.5 text-[9px] font-bold text-ui-textMuted uppercase">Adjustments</div>
            <button @click="applyAdjustment('brighten'); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover">Brightness (+10%)</button>
            <button @click="applyAdjustment('darken'); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover">Darkness (-10%)</button>
            <button @click="applyAdjustment('grayscale'); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover">Desaturate (Grayscale)</button>
            <button @click="applyAdjustment('invert'); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover">Invert Colors</button>
            <div class="h-px bg-ui-borderSubtle my-1"></div>
            <div class="px-3 py-0.5 text-[9px] font-bold text-ui-textMuted uppercase">Transforms</div>
            <button @click="applyAdjustment('flipH'); closeDropdowns()" class="w-full text-left px-3 py-1 hover:bg-ui-hover">Flip Horizontal</button>
            <button @click="applyAdjustment('flipV'); closeDropdowns()" class="w-full text-left px-3 py-1 hover:bg-ui-hover">Flip Vertical</button>
            <button @click="applyAdjustment('rot90'); closeDropdowns()" class="w-full text-left px-3 py-1 hover:bg-ui-hover">Rotate 90° CW</button>
            <div class="h-px bg-ui-borderSubtle my-1"></div>
            <button @click="resetRetroAtlas(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover text-amber-400 font-bold">Generate Retro Atlas</button>
            <button @click="clearTexture(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-rose-950/60 hover:text-rose-300 text-rose-400">Clear Canvas</button>
          </div>
        </div>

        <!-- Effects Menu Dropdown -->
        <div class="relative" @click.stop>
          <button 
            @click="toggleDropdown('effects')"
            class="px-2 py-1 text-xs font-semibold rounded-xs transition cursor-pointer flex items-center gap-1"
            :class="activeDropdown === 'effects' ? 'bg-ui-hover text-emerald-400 shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
          >
            <span>Effects</span>
            <span class="text-[8px] opacity-70">▼</span>
          </button>

          <div v-if="activeDropdown === 'effects'" class="header-dropdown-menu absolute left-0 top-full mt-1 w-52 bg-ui-panel text-ui-textPrimary border border-ui-borderStrong rounded-xs shadow-2xl py-1 z-50 text-xs">
            <button @click="applyAdjustment('outline'); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover text-emerald-400 font-bold">1px Outline Effect</button>
            <div class="h-px bg-ui-borderSubtle my-1"></div>
            <button @click="resizeW = projectStore.pixelBuffer.width; resizeH = projectStore.pixelBuffer.height; showResizeModal = true; closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover text-ui-textAccent">
              Resize / Resample Canvas...
            </button>
          </div>
        </div>

        <!-- Palette Menu Dropdown -->
        <div class="relative" @click.stop>
          <button 
            @click="toggleDropdown('palette')"
            class="px-2 py-1 text-xs font-semibold rounded-xs transition cursor-pointer flex items-center gap-1"
            :class="activeDropdown === 'palette' ? 'bg-ui-hover text-amber-400 shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
          >
            <span>Palette</span>
            <span class="text-[8px] opacity-70">▼</span>
          </button>

          <div v-if="activeDropdown === 'palette'" class="header-dropdown-menu absolute left-0 top-full mt-1 w-56 bg-ui-panel text-ui-textPrimary border border-ui-borderStrong rounded-xs shadow-2xl py-1 z-50 text-xs">
            <div class="px-3 py-0.5 text-[9px] font-bold text-ui-textMuted uppercase">Preset Palettes</div>
            <button 
              v-for="name in Object.keys(palettePresets)" 
              :key="name" 
              @click="switchPalette(name); closeDropdowns()"
              class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between"
              :class="{ 'text-amber-400 font-bold': selectedPaletteName === name }"
            >
              <span>{{ name }}</span>
              <span v-if="selectedPaletteName === name" class="text-xs">✓</span>
            </button>
            <div class="h-px bg-ui-borderSubtle my-1"></div>
            <button @click="extractPaletteFromTexture(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover text-emerald-400 font-bold">
              Extract from Current Texture
            </button>
          </div>
        </div>

        <div class="h-4 w-px bg-ui-borderSubtle mx-1"></div>

        <!-- Brush Size Segmented Buttons -->
        <div class="flex items-center gap-1">
          <span class="text-[9px] text-ui-textMuted font-bold uppercase">Size:</span>
          <div class="flex items-center bg-ui-input rounded-xs border border-ui-borderSubtle p-0.5">
            <button
              v-for="s in [1, 2, 4, 8, 16, 32]"
              :key="s"
              @click="toolStore.brushSize = s"
              class="px-1.5 py-0.5 text-[9px] font-bold rounded-xs transition cursor-pointer"
              :class="toolStore.brushSize === s ? 'bg-ui-active text-ui-textAccent shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
            >{{ s }}</button>
          </div>

          <button
            v-if="toolStore.paintTool === 'rect' || toolStore.paintTool === 'circle'"
            @click="toolStore.brushFilled = !toolStore.brushFilled"
            class="px-1.5 py-0.5 text-[9px] font-bold rounded-xs border border-ui-borderSubtle bg-ui-input transition cursor-pointer"
            :class="toolStore.brushFilled ? 'text-ui-textAccent bg-ui-active' : 'text-ui-textMuted'"
          >{{ toolStore.brushFilled ? 'Filled' : 'Outline' }}</button>
          <button
            v-else
            @click="toolStore.brushShape = toolStore.brushShape === 'square' ? 'circle' : 'square'"
            class="px-1.5 py-0.5 text-[9px] font-bold rounded-xs border border-ui-borderSubtle bg-ui-input text-ui-textSecondary hover:text-ui-textPrimary transition cursor-pointer"
            title="Toggle Square / Round Brush Shape"
          >{{ toolStore.brushShape === 'square' ? 'Square' : 'Round' }}</button>
        </div>
      </div>

      <!-- Right: Color Preview Chip & Hex Code -->
      <div class="flex items-center gap-1.5 shrink-0">
        <span class="text-[9px] text-ui-textMuted font-bold uppercase">Color:</span>
        <label class="w-5 h-5 rounded-xs border border-ui-borderStrong cursor-pointer shadow-xs relative overflow-hidden block" :style="{ backgroundColor: toolStore.primaryColor }">
          <input type="color" v-model="toolStore.primaryColor" class="opacity-0 absolute inset-0 w-full h-full cursor-pointer" />
        </label>
        <input 
          type="text" 
          v-model="toolStore.primaryColor" 
          class="w-16 px-1.5 py-0.5 bg-ui-input text-ui-textPrimary font-mono text-[10px] font-bold border border-ui-borderSubtle rounded-xs focus:outline-none focus:border-ui-accent uppercase" 
          aria-label="Color hex" 
        />
      </div>
    </div>

    <!-- 3. MAIN WORKSPACE WITH TOOL RAIL, CANVAS & FLOATING OVERLAYS -->
    <div class="pixel-workspace relative flex-1 min-h-0 flex overflow-hidden">
      <!-- Left Dedicated Paint Tool Rail -->
      <aside class="pixel-tool-rail flex flex-col justify-between items-center py-2 px-1 bg-ui-header border-r border-ui-borderSubtle z-10 select-none" aria-label="Pixel paint tools">
        <!-- Tools Stack -->
        <div class="flex flex-col gap-1">
          <button
            v-for="tool in paintTools"
            :key="tool.id"
            @click="toolStore.setPaintTool(tool.id)"
            class="w-7 h-7 flex flex-col items-center justify-center rounded-xs transition cursor-pointer relative group"
            :class="toolStore.paintTool === tool.id ? 'bg-ui-active text-ui-textAccent font-bold border border-ui-borderDefault shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
            :title="tool.title + ' (' + tool.key + ')'"
          >
            <BlenderIcon :name="tool.icon" :size="14" />
            <span class="text-[7px] leading-none opacity-60 mt-0.5 font-mono">{{ tool.key }}</span>
          </button>
        </div>

        <!-- Overlapping Color Swatch Box at Rail Bottom -->
        <div class="flex flex-col items-center gap-1 pt-2 border-t border-ui-borderSubtle w-full" title="Primary & Secondary Colors (X to Swap)">
          <div class="relative w-6 h-6 my-1">
            <!-- Secondary Swatch (Bottom-Right) -->
            <label 
              class="absolute bottom-0 right-0 w-4 h-4 rounded-xs border border-ui-borderStrong shadow-xs cursor-pointer overflow-hidden block z-0" 
              :style="{ backgroundColor: toolStore.secondaryColor }"
              title="Secondary Color (Right-Click Swatch)"
            >
              <input type="color" v-model="toolStore.secondaryColor" class="opacity-0 absolute inset-0 w-full h-full cursor-pointer" />
            </label>
            <!-- Primary Swatch (Top-Left) -->
            <label 
              class="absolute top-0 left-0 w-4 h-4 rounded-xs border border-ui-borderStrong shadow-xs cursor-pointer overflow-hidden block z-10" 
              :style="{ backgroundColor: toolStore.primaryColor }"
              title="Primary Color (Left-Click Swatch)"
            >
              <input type="color" v-model="toolStore.primaryColor" class="opacity-0 absolute inset-0 w-full h-full cursor-pointer" />
            </label>
          </div>
          <button @click="swapColors" class="p-1 hover:bg-ui-hover text-ui-textMuted hover:text-ui-textPrimary rounded-xs transition cursor-pointer" title="Swap Colors (X)">
            <ArrowLeftRight class="w-3 h-3" />
          </button>
        </div>
      </aside>

      <!-- Drawing Stage & Infinite Canvas Viewport -->
      <div 
        ref="containerRef" 
        class="pixel-stage flex-1 min-w-0 min-h-0 relative overflow-hidden bg-ui-root cursor-crosshair select-none"
        @wheel="onWheel"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointerleave="onPointerUp"
        @pointercancel="onPointerUp"
      >
        <!-- Top Right Floating View Controls -->
        <!-- Top Right Floating LightWave View Controls (Move, Search, Crosshair, X-Ray, Grid, Fit) -->
        <div class="uv-view-group" aria-label="Canvas View Controls">
          <button
            @mousedown="startLightWavePan"
            class="uv-view-icon cursor-move"
            title="LightWave Pan (Drag to pan canvas)"
          ><Move class="w-3.5 h-3.5" /></button>
          <button
            @mousedown="startLightWaveZoom"
            class="uv-view-icon cursor-ns-resize"
            title="LightWave Zoom (Drag up/down to zoom)"
          ><Search class="w-3.5 h-3.5" /></button>
          <button
            @click="resetPanZoom"
            class="uv-view-icon"
            title="Center View on Canvas (Crosshair)"
          ><Crosshair class="w-3.5 h-3.5" /></button>
          <button
            @click="showUvOverlay = !showUvOverlay"
            class="uv-view-icon"
            :class="{ 'is-active': showUvOverlay }"
            title="Toggle UV Wireframe Overlay (Alt+Z)"
          ><BlenderIcon name="xray" :size="14" /></button>
          <button
            @click="showPixelGrid = !showPixelGrid"
            class="uv-view-icon"
            :class="{ 'is-active': showPixelGrid }"
            title="Toggle Pixel Grid"
          ><Grid class="w-3.5 h-3.5" /></button>
          <div class="uv-zoom-control">
            <button @click="zoomOut" title="Zoom out"><ZoomOut class="w-3.5 h-3.5" /></button>
            <span @dblclick="resetPanZoom" title="Double-click to fit">{{ Math.round(zoom * 100) }}%</span>
            <button @click="zoomIn" title="Zoom in"><ZoomIn class="w-3.5 h-3.5" /></button>
          </div>
          <button @click="resetPanZoom" class="uv-view-icon" title="Fit Canvas to View">
            <Maximize class="w-3.5 h-3.5" />
          </button>
        </div>

        <canvas 
          ref="canvasRef" 
          class="w-full h-full block touch-none"
        ></canvas>

        <!-- Docked Bottom Swatch Strip (Quick Palette Bar) -->
        <div class="pixel-palette-dock absolute bottom-8 left-3 z-10 flex items-center gap-1.5 p-1 bg-ui-header/90 backdrop-blur-md border border-ui-borderStrong rounded-xs shadow-lg max-w-[calc(100%-24px)] overflow-x-auto">
          <span class="text-[9px] font-bold text-ui-textMuted uppercase whitespace-nowrap pl-1">{{ selectedPaletteName }}:</span>
          <div class="flex items-center gap-0.5 flex-wrap max-h-6 overflow-hidden">
            <button
              v-for="c in activePalette"
              :key="c"
              @click="toolStore.primaryColor = c"
              @contextmenu.prevent="toolStore.secondaryColor = c"
              class="w-4 h-4 rounded-xxs border border-black/40 hover:scale-110 transition shrink-0 cursor-pointer"
              :style="{ backgroundColor: c }"
              :title="'Primary: ' + c + ' · Right-Click for Secondary'"
            ></button>
          </div>
          <button @click="extractPaletteFromTexture" class="px-1.5 py-0.5 bg-ui-input hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textPrimary text-[9px] font-bold rounded-xs border border-ui-borderSubtle whitespace-nowrap transition cursor-pointer" title="Extract Palette from Texture">
            Extract
          </button>
        </div>

        <!-- Quick Info Status HUD at Bottom Left -->
        <div class="pixel-status-hud">
          <span>{{ projectStore.pixelBuffer.width }} × {{ projectStore.pixelBuffer.height }}</span>
          <span class="text-ui-textAccent font-bold uppercase">{{ toolStore.paintTool }}</span>
          <span v-if="cursorCoords" class="text-ui-textMuted font-mono">
            X:{{ cursorCoords.x }} Y:{{ cursorCoords.y }} [{{ cursorCoords.hex }}]
          </span>
          <span class="text-ui-textMuted hidden md:inline">Space+Drag / MMB to Pan | Wheel to Zoom</span>
        </div>
      </div>
    </div>

    <!-- Custom Canvas Resize Modal Dialog -->
    <div v-if="showResizeModal" class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div class="bg-ui-panel border border-ui-borderStrong rounded-xs shadow-2xl p-4 w-80 flex flex-col gap-3 font-mono text-xs text-ui-textPrimary">
        <div class="flex items-center justify-between pb-2 border-b border-ui-borderSubtle">
          <span class="font-bold text-ui-textAccent uppercase text-xs">Resize Texture Canvas</span>
          <button @click="showResizeModal = false" class="text-ui-textMuted hover:text-white font-bold">✕</button>
        </div>

        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <span class="text-ui-textMuted">Width:</span>
            <input type="number" v-model.number="resizeW" min="8" max="4096" step="8" class="w-24 bg-ui-input border border-ui-borderSubtle px-2 py-1 text-right rounded-xs text-ui-textPrimary font-bold" />
          </div>
          <div class="flex items-center justify-between">
            <span class="text-ui-textMuted">Height:</span>
            <input type="number" v-model.number="resizeH" min="8" max="4096" step="8" class="w-24 bg-ui-input border border-ui-borderSubtle px-2 py-1 text-right rounded-xs text-ui-textPrimary font-bold" />
          </div>
          <div class="flex items-center justify-between pt-1">
            <span class="text-ui-textMuted">Mode:</span>
            <select v-model="resizeMode" class="bg-ui-input border border-ui-borderSubtle px-2 py-1 rounded-xs text-ui-textPrimary">
              <option value="crop">Crop / Extend (Anchor)</option>
              <option value="resample">Nearest Resample (Scale)</option>
            </select>
          </div>
        </div>

        <div class="flex items-center justify-end gap-2 pt-2 border-t border-ui-borderSubtle">
          <button @click="showResizeModal = false" class="px-3 py-1 rounded-xs bg-ui-input hover:bg-ui-hover text-ui-textSecondary">Cancel</button>
          <button @click="applyCustomResize" class="px-3 py-1 rounded-xs bg-ui-accent hover:bg-ui-accent/80 text-white font-bold">Apply Resize</button>
        </div>
      </div>
    </div>

    <!-- Import Texture Modal -->
    <ImportTextureModal 
      v-if="showImportModal && pendingImportFile" 
      :file="pendingImportFile" 
      @imported="() => { showImportModal = false; pendingImportFile = null; onTextureChanged(); }" 
      @close="showImportModal = false; pendingImportFile = null" 
    />
  </div>
</template>

<style scoped>
.pixel-editor {
  container-type: inline-size;
}

.pixel-header-row-1,
.pixel-header-row-2 {
  height: 32px;
  min-height: 32px;
}

.header-dropdown-menu {
  animation: dropdownIn 100ms ease-out forwards;
}

@keyframes dropdownIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.pixel-tool-rail {
  width: 36px;
  min-width: 36px;
}

.pixel-view-group {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 10;
  height: 32px;
  padding: 3px;
  display: flex;
  align-items: center;
  gap: 4px;
  background: color-mix(in srgb, var(--ui-bg-header) 94%, transparent);
  border: 1px solid var(--ui-border-strong);
  border-radius: 4px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(8px);
}

.pixel-view-toggle,
.pixel-view-icon,
.pixel-zoom-control {
  height: 24px;
  color: var(--ui-text-muted);
  background: var(--ui-bg-input);
  border: 1px solid var(--ui-border-subtle);
  border-radius: 3px;
}

.pixel-view-toggle,
.pixel-view-icon {
  padding: 0 6px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 9px;
  font-weight: 700;
  cursor: pointer;
}

.pixel-view-toggle.is-active,
.pixel-view-icon.is-active {
  color: var(--ui-text-accent);
  background: var(--ui-bg-active);
  border-color: var(--ui-border-default);
}

.pixel-zoom-control {
  display: flex;
  align-items: center;
  padding: 0 2px;
}

.pixel-zoom-control button {
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  color: var(--ui-text-muted);
  border-radius: 2px;
  cursor: pointer;
}

.pixel-zoom-control button:hover {
  color: var(--ui-text-primary);
  background: var(--ui-bg-hover);
}

.pixel-zoom-control span {
  min-width: 38px;
  text-align: center;
  font-size: 9px;
  font-weight: 700;
  color: var(--ui-text-secondary);
}

.pixel-status-hud {
  position: absolute;
  bottom: 8px;
  left: 10px;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 10px;
  color: var(--ui-text-secondary);
  background: color-mix(in srgb, var(--ui-bg-header) 92%, transparent);
  border: 1px solid var(--ui-border-subtle);
  padding: 3px 8px;
  border-radius: 3px;
  backdrop-filter: blur(6px);
  pointer-events: none;
}
</style>
