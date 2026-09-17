<script setup lang="ts">
import { ref, shallowRef, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { useToolStore } from '../../stores/toolStore'
import TextureSharePrompt from '../modals/TextureSharePrompt.vue'
import { useTextureApply } from '../../composables/useTextureApply'
import BlenderIcon from '../icons/BlenderIcon.vue'
import ImportTextureModal from '../modals/ImportTextureModal.vue'
import {
  openTileset,
  tilesetActiveBounds,
  tilesetClipPaint,
  tilesetImageId,
  tilesetRegion,
  tilesetTileIndex
} from '../../composables/useTilesetWindow'
import NewTextureModal from '../modals/NewTextureModal.vue'
import PaletteLibraryModal from '../modals/PaletteLibraryModal.vue'
import { DEFAULT_PALETTES, loadCustomPalettes, saveCustomPalettes, snapColorToPalette, type Palette } from '../../utils/color'
import {
  Sun,
  Moon
} from 'lucide-vue-next'
import { generateShadingRamp } from '../../utils/color'
import { EDITOR_EVENTS } from '../../core/commands/editorCommands'
import PaintLayers from './PaintLayers.vue'
import { useHistoryStore } from '../../stores/historyStore'
import { marqueeRect, containsPixel, translateSelection, copySelectedPixels, moveSelectedPixels, flipSelectedPixels, paintWithinSelection, type PaintRect } from '../../core/painting/PaintSelection'
import { PixelBuffer } from '../../core/painting/PixelCanvas'
import { visitStrokePixels } from '../../core/painting/StrokePath'
import { saveBlobDocument } from '../../core/desktop/desktopApi'

const projectStore = useProjectStore()
const toolStore = useToolStore()
const historyStore = useHistoryStore()
const imageApplied = computed(() => projectStore.materials.find(m => m.id === projectStore.activeMesh?.materialId)?.textureId === projectStore.activeTextureId)
const {
  isOpen: sharePromptOpen,
  sharedCount: sharePromptCount,
  applyToActiveMesh,
  confirm: confirmShareApply,
  cancel: cancelShareApply
} = useTextureApply()

// ----------------------------------------------------
// ACTIVE MESH, MATERIAL & TEXTURE BINDINGS
// ----------------------------------------------------
const showNewTextureModal = ref(false)

function handleTextureBindingChange(newTexId: string) {
  projectStore.selectTexture(newTexId)
  nextTick(() => {
    renderCanvas()
  })
}

function handleCreateNewTexture(payload: { name: string; width: number; height: number; fill: 'transparent' | 'white' | 'black' | 'primary' }) {
  const tex = projectStore.createTexture(payload.name, payload.width, payload.height)
  if (payload.fill === 'white') tex.pixelBuffer.clear('#ffffff')
  else if (payload.fill === 'black') tex.pixelBuffer.clear('#111111')
  else if (payload.fill === 'primary') tex.pixelBuffer.clear(toolStore.primaryColor || '#ffffff')
  if (payload.fill !== 'transparent') projectStore.markTextureUpdated(tex.id)
  if (projectStore.activeMesh && !projectStore.activeMesh.locked) {
    projectStore.applyTextureToMesh(projectStore.activeMesh.id, tex.id, 'this_object', { record: false })
  }
  showNewTextureModal.value = false
  nextTick(() => {
    renderCanvas()
  })
}

function handleApplyPaintTargetToMesh() {
  if (!projectStore.activeTexture || !projectStore.activeMesh) return
  applyToActiveMesh(projectStore.activeTexture.id)
}

function handleActiveObjectChange(meshId: string) {
  projectStore.selectMesh(meshId)
  nextTick(() => renderCanvas())
}

// Shading Tool Options State
const shadeMode = ref<'lighten' | 'darken'>('lighten')
const shadeStep = ref<number>(15)
const shadeHueShift = ref<boolean>(true)
const shadePaletteConstraint = ref<boolean>(false)

const activeShadingRamp = computed(() => {
  return generateShadingRamp(toolStore.primaryColor || '#ffffff')
})

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
const showLayers = ref<boolean>(true)
// PixelBuffer is deliberately non-reactive (canvas-heavy). Bump this after a
// layer mutation so the small layer popover stays in sync.
const layerRevision = ref(0)
const paintTools = [
  { id: 'select', icon: 'rect', key: 'M', title: 'Marquee Selection' },
  { id: 'brush', icon: 'brush', key: 'B', title: 'Pencil' },
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
let strokeDirty = false
let drawUsesSecondary = false
let dragStartCoords: { x: number; y: number } | null = null
let dragCurrentCoords: { x: number; y: number } | null = null
let lastDrawCoords: { x: number; y: number } | null = null

// Selection is a 2D editing boundary on the active layer, independent of mesh UV selection.
const paintSelection = ref<PaintRect | null>(null)
function tilesetHighlight(): PaintRect | null {
  const tex = projectStore.activeTexture
  if (!tex || tilesetImageId.value !== tex.id) return null
  const bounds = tilesetActiveBounds(tex.width, tex.height, tex.atlas?.cols || 2, tex.atlas?.rows || 2)
  return { x: bounds.x, y: bounds.y, w: bounds.width, h: bounds.height }
}
function paintClip(): PaintRect | null {
  return paintSelection.value
}
const pixelClipboard = shallowRef<ImageData | null>(null)
const selectionGesture = ref<'marquee' | 'move' | null>(null)
let gestureStart: { x: number; y: number } | null = null
let gestureSource: PaintRect | null = null
let selectionPreview: PixelBuffer | null = null
let selectionMoveBase: PixelBuffer | null = null
let selectionCutPixels: ImageData | null = null
let shapePreview: PixelBuffer | null = null
let shapeLayerSnapshot: ImageData | null = null
const canPaintLayer = computed(() => { layerRevision.value; projectStore.textureRevision; return projectStore.pixelBuffer.activeLayer?.visible !== false })

function needsBrushCursor() {
  return !isPanning.value && ['brush', 'eraser', 'dither', 'shade'].includes(toolStore.paintTool)
}

function beginSelectionMovePreview(source: PaintRect) {
  const pb = projectStore.pixelBuffer
  selectionCutPixels = copySelectedPixels(pb, source)
  selectionMoveBase = pb.clone()
  const layer = selectionMoveBase.activeLayer
  if (layer) {
    layer.ctx.clearRect(source.x, source.y, source.w, source.h)
    selectionMoveBase.commitLayers()
  }
  updateSelectionMovePreview(source)
}

function updateSelectionMovePreview(dest: PaintRect) {
  if (!selectionMoveBase || !selectionCutPixels) return
  if (!selectionPreview || selectionPreview.width !== selectionMoveBase.width || selectionPreview.height !== selectionMoveBase.height) {
    selectionPreview = new PixelBuffer(selectionMoveBase.width, selectionMoveBase.height)
  }
  const ctx = selectionPreview.ctx
  ctx.clearRect(0, 0, selectionPreview.width, selectionPreview.height)
  ctx.drawImage(selectionMoveBase.canvas, 0, 0)
  ctx.putImageData(selectionCutPixels, dest.x, dest.y)
}

function endSelectionMovePreview() {
  selectionMoveBase = null
  selectionCutPixels = null
  selectionPreview = null
}

function prepareShapePreview() {
  const pb = projectStore.pixelBuffer
  shapePreview = pb.clone()
  const layer = shapePreview.activeLayer
  shapeLayerSnapshot = layer ? layer.ctx.getImageData(0, 0, pb.width, pb.height) : null
}

function getShapePreviewBuffer() {
  const source = projectStore.pixelBuffer
  if (!shapePreview || shapePreview.width !== source.width || shapePreview.height !== source.height || !shapeLayerSnapshot) {
    prepareShapePreview()
  } else {
    const layer = shapePreview.activeLayer
    if (layer) layer.ctx.putImageData(shapeLayerSnapshot, 0, 0)
  }
  return shapePreview!
}

function clearShapePreview() {
  shapePreview = null
  shapeLayerSnapshot = null
}

function deselectPixels() {
  paintSelection.value = null
  selectionGesture.value = null
  endSelectionMovePreview()
  scheduleRender()
}

function selectAllPixels() {
  const pb = projectStore.pixelBuffer
  paintSelection.value = { x: 0, y: 0, w: pb.width, h: pb.height }
  toolStore.setPaintTool('select')
}

function editSelectedPixels(action: 'copy' | 'cut' | 'delete' | 'fill' | 'flipX' | 'flipY') {
  const rect = paintSelection.value
  if (!rect || selectionGesture.value) return
  const pb = projectStore.pixelBuffer
  if (action === 'copy' || action === 'cut') pixelClipboard.value = copySelectedPixels(pb, rect)
  if (action === 'copy' || !canPaintLayer.value) return
  projectStore.recordPixels(`${action === 'cut' ? 'Cut' : action === 'delete' ? 'Delete' : action === 'fill' ? 'Fill' : 'Flip'} Selected Pixels`)
  const ctx = pb.activeLayer!.ctx
  if (action === 'delete' || action === 'cut') ctx.clearRect(rect.x, rect.y, rect.w, rect.h)
  else if (action === 'fill') { ctx.fillStyle = resolveDrawColor(); ctx.fillRect(rect.x, rect.y, rect.w, rect.h) }
  else flipSelectedPixels(pb, rect, action === 'flipX' ? 'x' : 'y')
  refreshLayers()
}

function pastePixels() {
  const pixels = pixelClipboard.value
  if (!pixels || selectionGesture.value) return
  const pb = projectStore.pixelBuffer
  projectStore.recordPixels('Paste Pixels as Layer')
  const layer = pb.addLayer('Pasted pixels')
  const x = Math.max(0, Math.min(pb.width - pixels.width, paintSelection.value?.x ?? Math.floor((pb.width - pixels.width) / 2)))
  const y = Math.max(0, Math.min(pb.height - pixels.height, paintSelection.value?.y ?? Math.floor((pb.height - pixels.height) / 2)))
  layer.ctx.putImageData(pixels, x, y)
  paintSelection.value = { x, y, w: Math.min(pixels.width, pb.width), h: Math.min(pixels.height, pb.height) }
  toolStore.setPaintTool('select')
  showLayers.value = true
  refreshLayers()
}

function nudgeSelection(dx: number, dy: number) {
  const source = paintSelection.value
  if (!source || !canPaintLayer.value || selectionGesture.value) return
  const pb = projectStore.pixelBuffer
  const target = translateSelection(source, dx, dy, pb.width, pb.height)
  if (target.x === source.x && target.y === source.y) return
  projectStore.recordPixels('Move Selected Pixels')
  moveSelectedPixels(pb, source, target)
  paintSelection.value = target
  refreshLayers()
}

function reorderPaintLayer(id: string, direction: -1 | 1) {
  const pb = projectStore.pixelBuffer
  const index = pb.layers.findIndex(l => l.id === id)
  if (index < 0 || index + direction < 0 || index + direction >= pb.layers.length) return
  projectStore.recordPixels('Reorder Paint Layer')
  pb.moveLayer(id, direction)
  refreshLayers()
}

// Custom Resize Modal State
const showResizeModal = ref(false)
const resizeW = ref(64)
const resizeH = ref(64)
const resizeMode = ref<'resample' | 'crop'>('crop')

// Palette Library & Presets Engine
const showPaletteLibraryModal = ref(false)
const selectedPaletteName = computed(() => projectStore.activePalette?.name || 'PSX Classic 16')
const activePalette = computed<string[]>({
  get: () => projectStore.activePalette?.colors || DEFAULT_PALETTES[0].colors,
  set: (colors: string[]) => {
    projectStore.activePalette.colors = colors
  }
})

const layers = computed(() => {
  layerRevision.value
  projectStore.textureRevision
  return projectStore.pixelBuffer.layers
})

function refreshLayers() {
  layerRevision.value++
  projectStore.pixelBuffer.composite()
  projectStore.markTextureUpdated()
  renderCanvas()
}

function addPaintLayer() {
  projectStore.recordPixels('Add Paint Layer')
  projectStore.pixelBuffer.addLayer()
  refreshLayers()
}

function duplicatePaintLayer(layerId: string) {
  projectStore.recordPixels('Duplicate Paint Layer')
  projectStore.pixelBuffer.duplicateLayer(layerId)
  refreshLayers()
}

function deletePaintLayer(layerId: string) {
  if (projectStore.pixelBuffer.layers.length <= 1) return
  projectStore.recordPixels('Delete Paint Layer')
  projectStore.pixelBuffer.deleteLayer(layerId)
  refreshLayers()
}

function selectPaintLayer(layerId: string) {
  projectStore.pixelBuffer.activeLayerId = layerId
  layerRevision.value++
  renderCanvas()
}

function toggleLayerVisibility(layerId: string) {
  const layer = projectStore.pixelBuffer.layers.find(item => item.id === layerId)
  if (!layer) return
  projectStore.recordPixels('Toggle Paint Layer')
  layer.visible = !layer.visible
  refreshLayers()
}

function setActiveLayerOpacity(value: number) {
  const layer = projectStore.pixelBuffer.activeLayer
  if (!layer) return
  projectStore.recordPixels('Change Layer Opacity')
  layer.opacity = Math.max(0, Math.min(1, value / 100))
  refreshLayers()
}

function renameActivePaintLayer(name: string) {
  const layer = projectStore.pixelBuffer.activeLayer
  const next = name.trim()
  if (!layer || !next || next === layer.name) return
  projectStore.recordPixels('Rename Paint Layer')
  layer.name = next
  refreshLayers()
}

function setActiveLayerBlendMode(value: string) {
  const layer = projectStore.pixelBuffer.activeLayer
  if (!layer) return
  if (!['normal', 'multiply', 'screen', 'overlay', 'additive'].includes(value)) return
  projectStore.recordPixels('Change Layer Blend Mode')
  layer.blendMode = value as typeof layer.blendMode
  refreshLayers()
}

function clampBrushSize(value: number) {
  toolStore.brushSize = Math.max(1, Math.min(128, Math.round(Number(value) || 1)))
}

function switchPalette(pal: Palette) {
  projectStore.activePalette = pal
}

function extractPaletteFromTexture() {
  const extracted = projectStore.pixelBuffer.extractPalette(32)
  if (extracted.length > 0) {
    const newPal: Palette = {
      id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: `Extracted (${extracted.length})`,
      category: 'Custom',
      isCustom: true,
      colors: extracted
    }
    const customPals = loadCustomPalettes()
    customPals.push(newPal)
    saveCustomPalettes(customPals)
    projectStore.activePalette = newPal
  }
}

function addCurrentColorToActivePalette() {
  const color = (toolStore.primaryColor || '#ffffff').toLowerCase()
  const cur = projectStore.activePalette
  if (!cur.colors.includes(color)) {
    if (cur.isCustom) {
      cur.colors.push(color)
      const customPals = loadCustomPalettes()
      const found = customPals.find(p => p.id === cur.id)
      if (found) found.colors = cur.colors
      saveCustomPalettes(customPals)
    } else {
      const newPal: Palette = {
        id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: `${cur.name} (Custom)`,
        category: 'Custom',
        isCustom: true,
        colors: [...cur.colors, color]
      }
      const customPals = loadCustomPalettes()
      customPals.push(newPal)
      saveCustomPalettes(customPals)
      projectStore.activePalette = newPal
    }
  }
}

function quantizeCanvasToCurrentPalette() {
  const pb = projectStore.pixelBuffer
  const colors = projectStore.activePalette?.colors || DEFAULT_PALETTES[0].colors
  if (!pb || colors.length === 0) return

  projectStore.recordPixels(`Quantize Texture (${projectStore.activePalette.name})`)
  pb.suspendComposite()
  for (let y = 0; y < pb.height; y++) {
    for (let x = 0; x < pb.width; x++) {
      const curHex = pb.getPixelHex(x, y)
      const closest = snapColorToPalette(curHex, colors)
      pb.setPixel(x, y, closest, 1, false)
    }
  }
  pb.resumeComposite()
  projectStore.markTextureUpdated()
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

function handleTextureImported(texId?: string) {
  const id = texId || projectStore.activeTextureId
  if (id) projectStore.selectTexture(id)
  if (id && projectStore.activeMesh && !projectStore.activeMesh.locked) {
    projectStore.applyTextureToMesh(projectStore.activeMesh.id, id, 'this_object')
  }
  showImportModal.value = false
  pendingImportFile.value = null
  onTextureChanged()
}

function downloadTexturePng() {
  projectStore.pixelBuffer.canvas.toBlob((blob) => {
    if (!blob) return
    void saveBlobDocument(
      blob,
      `${projectStore.projectName}_texture_${projectStore.pixelBuffer.width}x${projectStore.pixelBuffer.height}.png`,
      [{ name: 'PNG', extensions: ['png'] }]
    )
  })
}

function resetRetroAtlas() {
  projectStore.generateRetroAtlasOnActive()
  renderCanvas()
}

function clearTexture() {
  projectStore.recordPixels('Clear Texture')
  projectStore.pixelBuffer.clear()
  projectStore.markTextureUpdated()
  renderCanvas()
}

function syncActiveTextureSize(w: number, h: number) {
  if (projectStore.activeTexture) {
    projectStore.activeTexture.width = w
    projectStore.activeTexture.height = h
  }
}

function applyCustomResize() {
  projectStore.recordPixels(`Resize Texture to ${resizeW.value}x${resizeH.value}`)
  projectStore.pixelBuffer.resize(resizeW.value, resizeH.value, resizeMode.value)
  syncActiveTextureSize(resizeW.value, resizeH.value)
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

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

function onKeyDown(e: KeyboardEvent) {
  if ((e.target as HTMLElement)?.closest?.('.tileset-dialog')) return
  if (toolStore.appMode !== 'uvpaint' || toolStore.uvWorkspaceTab !== 'paint') return
  if (isTypingTarget(e.target)) return
  const mod = e.ctrlKey || e.metaKey
  const key = e.key.toLowerCase()
  let handled = true
  if (mod && key === 'a') selectAllPixels()
  else if (mod && key === 'd') deselectPixels()
  else if (mod && key === 'c') editSelectedPixels('copy')
  else if (mod && key === 'x') editSelectedPixels('cut')
  else if (mod && key === 'v') pastePixels()
  else if (!mod && !e.altKey && key === 'm') toolStore.setPaintTool('select')
  else if ((key === 'delete' || key === 'backspace') && paintSelection.value) editSelectedPixels('delete')
  else if (key === 'escape' && activeDropdown.value) closeDropdowns()
  else if (key === 'escape' && paintSelection.value) deselectPixels()
  else if (key === 'escape' && showLayers.value) showLayers.value = false
  else if (!mod && !e.altKey && paintSelection.value && ['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key)) {
    const step = e.shiftKey ? 10 : 1
    nudgeSelection(key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0, key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0)
  } else handled = false
  if (handled) { e.preventDefault(); e.stopImmediatePropagation(); return }
  if (e.code === 'Space' && !isTypingTarget(e.target)) {
    e.preventDefault()
    isSpacePressed.value = true
  }
  if (e.key === '[') {
    e.preventDefault()
    clampBrushSize(toolStore.brushSize - (e.shiftKey ? 5 : 1))
  }
  if (e.key === ']') {
    e.preventDefault()
    clampBrushSize(toolStore.brushSize + (e.shiftKey ? 5 : 1))
  }
}

function onToggleUvOverlay() {
  showUvOverlay.value = !showUvOverlay.value
}

function onKeyUp(e: KeyboardEvent) {
  if (e.code === 'Space') {
    isSpacePressed.value = false
    isPanning.value = false
  }
}

function applyAdjustment(action: string) {
  const pb = projectStore.pixelBuffer
  projectStore.recordPixels(`Apply ${action}`)

  if (paintSelection.value && (action === 'flipH' || action === 'flipV')) {
    flipSelectedPixels(pb, paintSelection.value, action === 'flipH' ? 'x' : 'y')
  } else {
    if (action === 'rot90') deselectPixels()
    paintWithinSelection(pb, paintClip(), () => {
      if (action === 'invert') pb.invertColors()
      else if (action === 'brighten') pb.adjustBrightness(20)
      else if (action === 'darken') pb.adjustBrightness(-20)
      else if (action === 'grayscale') pb.desaturate()
      else if (action === 'outline') pb.generateOutline(toolStore.primaryColor)
      else if (action === 'flipH') pb.flip(true, false)
      else if (action === 'flipV') pb.flip(false, true)
      else if (action === 'rot90') pb.rotate(90)
    })
  }

  if (projectStore.activeTexture) {
    projectStore.activeTexture.width = pb.width
    projectStore.activeTexture.height = pb.height
  }
  projectStore.markTextureUpdated()
  renderCanvas()
}

function getPixelCoords(e: PointerEvent): { x: number; y: number } | null {
  const el = containerRef.value || canvasRef.value
  if (!el) return null
  const rect = el.getBoundingClientRect()
  const mouseX = e.clientX - rect.left
  const mouseY = e.clientY - rect.top
  const ox = panOffset.value.x
  const oy = panOffset.value.y
  const pb = projectStore.ensureTextureBuffer(projectStore.activeTexture)

  const px = Math.floor((mouseX - ox) / zoom.value)
  const py = Math.floor((mouseY - oy) / zoom.value)

  if (px < 0 || px >= pb.width || py < 0 || py >= pb.height) return null
  return { x: px, y: py }
}

function getClampedPixelCoords(e: PointerEvent) {
  const rect = containerRef.value?.getBoundingClientRect()
  if (!rect) return null
  const pb = projectStore.pixelBuffer
  return {
    x: Math.max(0, Math.min(pb.width - 1, Math.floor((e.clientX - rect.left - panOffset.value.x) / zoom.value))),
    y: Math.max(0, Math.min(pb.height - 1, Math.floor((e.clientY - rect.top - panOffset.value.y) / zoom.value))),
  }
}

let renderPending = false
let renderRafId: number | null = null
let checkerTile: HTMLCanvasElement | null = null
let checkerTileSize = 0

function scheduleRender() {
  if (renderPending) return
  renderPending = true
  renderRafId = requestAnimationFrame(() => {
    renderRafId = null
    renderPending = false
    renderCanvas()
  })
}

function fillCheckerboard(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  texW: number,
  texH: number,
  checkSize: number
) {
  if (!checkerTile || checkerTileSize !== checkSize) {
    checkerTile = document.createElement('canvas')
    checkerTile.width = checkSize * 2
    checkerTile.height = checkSize * 2
    checkerTileSize = checkSize
    const tctx = checkerTile.getContext('2d')
    if (tctx) {
      tctx.fillStyle = '#1e2025'
      tctx.fillRect(0, 0, checkSize * 2, checkSize * 2)
      tctx.fillStyle = '#141619'
      tctx.fillRect(0, 0, checkSize, checkSize)
      tctx.fillRect(checkSize, checkSize, checkSize, checkSize)
    }
  }
  const pattern = ctx.createPattern(checkerTile, 'repeat')
  if (!pattern) return
  ctx.save()
  ctx.beginPath()
  ctx.rect(ox, oy, texW, texH)
  ctx.clip()
  ctx.translate(ox, oy)
  ctx.fillStyle = pattern
  ctx.fillRect(0, 0, texW, texH)
  ctx.restore()
}

function drawShape(buffer: PixelBuffer, start: { x: number; y: number }, end: { x: number; y: number }) {
  const color = resolveDrawColor(drawUsesSecondary)
  const { brushSize: size, brushOpacity: opacity, brushFilled: filled, paintTool: tool } = toolStore
  paintWithinSelection(buffer, paintClip(), () => {
    if (tool === 'line') buffer.drawLine(start.x, start.y, end.x, end.y, color, size, opacity)
    else if (tool === 'rect') buffer.drawRect(start.x, start.y, end.x, end.y, color, size, filled, opacity)
    else if (tool === 'circle') buffer.drawCircle(start.x, start.y, Math.round(Math.hypot(end.x - start.x, end.y - start.y)), color, size, filled, opacity)
  })
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

  let pb = selectionPreview || projectStore.pixelBuffer
  if (isDrawing && dragStartCoords && dragCurrentCoords && ['line', 'rect', 'circle'].includes(toolStore.paintTool)) {
    pb = getShapePreviewBuffer()
    drawShape(pb, dragStartCoords, dragCurrentCoords)
  }

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
  ctx.beginPath()
  for (let x = startX; x < canvas.width; x += stageGridSize) {
    ctx.moveTo(x, 0)
    ctx.lineTo(x, canvas.height)
  }
  for (let y = startY; y < canvas.height; y += stageGridSize) {
    ctx.moveTo(0, y)
    ctx.lineTo(canvas.width, y)
  }
  ctx.stroke()

  // 2. Checkerboard for transparency, then the pixel buffer
  const checkSize = Math.max(4, Math.min(16, Math.round(zoom.value)))
  fillCheckerboard(ctx, ox, oy, texW, texH, checkSize)
  ctx.drawImage(pb.canvas, ox, oy, texW, texH)

  // 4. Draw Canvas Drop Shadow & Border Outline
  ctx.strokeStyle = '#4f46e5'
  ctx.lineWidth = 1.5
  ctx.strokeRect(ox, oy, texW, texH)

  // 6. Pixel Grid (Only show when zoomed in enough)
  if (showPixelGrid.value && zoom.value >= 4 && pb.width <= 512) {
    const z = zoom.value
    const visX0 = Math.max(0, Math.floor(-ox / z))
    const visX1 = Math.min(pb.width, Math.ceil((canvas.width - ox) / z))
    const visY0 = Math.max(0, Math.floor(-oy / z))
    const visY1 = Math.min(pb.height, Math.ceil((canvas.height - oy) / z))
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let x = visX0; x <= visX1; x++) {
      ctx.moveTo(ox + x * z, oy + visY0 * z)
      ctx.lineTo(ox + x * z, oy + visY1 * z)
    }
    for (let y = visY0; y <= visY1; y++) {
      ctx.moveTo(ox + visX0 * z, oy + y * z)
      ctx.lineTo(ox + visX1 * z, oy + y * z)
    }
    ctx.stroke()
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

  // Contrast outline stays visible over both light and dark texture pixels.
  const cursor = cursorCoords.value
  if (cursor && !isPanning.value && ['brush', 'eraser', 'dither', 'shade'].includes(toolStore.paintTool)) {
    const size = toolStore.brushSize
    ctx.save()
    ctx.beginPath()
    ctx.rect(ox, oy, texW, texH)
    ctx.clip()
    ctx.beginPath()
    if (toolStore.brushShape === 'circle' && size > 2 && ['brush', 'eraser'].includes(toolStore.paintTool)) {
      ctx.arc(ox + (cursor.x - Math.floor(size / 2) + size / 2) * zoom.value, oy + (cursor.y - Math.floor(size / 2) + size / 2) * zoom.value, size * zoom.value / 2, 0, Math.PI * 2)
    } else {
      ctx.rect(ox + (cursor.x - Math.floor(size / 2)) * zoom.value, oy + (cursor.y - Math.floor(size / 2)) * zoom.value, size * zoom.value, size * zoom.value)
    }
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)'
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.restore()
  }
  const tileClip = tilesetHighlight()
  if (tileClip) {
    ctx.save()
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.95)'
    ctx.lineWidth = 1.5
    ctx.strokeRect(ox + tileClip.x * zoom.value + 0.5, oy + tileClip.y * zoom.value + 0.5, tileClip.w * zoom.value, tileClip.h * zoom.value)
    ctx.restore()
  }
  if (paintSelection.value) {
    const r = paintSelection.value
    ctx.save()
    ctx.lineWidth = 1
    ctx.strokeStyle = '#000000'
    ctx.strokeRect(ox + r.x * zoom.value + 0.5, oy + r.y * zoom.value + 0.5, r.w * zoom.value, r.h * zoom.value)
    ctx.setLineDash([4, 4])
    ctx.strokeStyle = '#ffffff'
    ctx.strokeRect(ox + r.x * zoom.value + 0.5, oy + r.y * zoom.value + 0.5, r.w * zoom.value, r.h * zoom.value)
    ctx.restore()
  }

}

function onPointerLeave() {
  cursorCoords.value = null
  scheduleRender()
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

  // RMB / MMB / Space+LMB / Alt+LMB -> Pan Canvas (secondary color is Ctrl+LMB or swatch RMB)
  if (e.button === 1 || e.button === 2 || (e.button === 0 && isSpacePressed.value) || e.altKey) {
    isPanning.value = true
    panStart = { x: e.clientX - panOffset.value.x, y: e.clientY - panOffset.value.y }
    return
  }

  if (e.button !== 0) return

  toolStore.currentPointerType = (e.pointerType as any) || 'mouse'
  toolStore.currentPressure = e.pressure || 1.0

  const coords = getPixelCoords(e)
  if (!coords) return

  if (toolStore.paintTool === 'select') {
    gestureStart = coords
    gestureSource = paintSelection.value ? { ...paintSelection.value } : null
    selectionGesture.value = gestureSource && containsPixel(gestureSource, coords) && !e.shiftKey && canPaintLayer.value ? 'move' : 'marquee'
    if (selectionGesture.value === 'marquee') paintSelection.value = marqueeRect(coords, coords)
    else if (gestureSource) beginSelectionMovePreview(gestureSource)
    scheduleRender()
    return
  }
  if (toolStore.paintTool !== 'picker' && !canPaintLayer.value) return
  const clip = paintClip()
  if (clip && !containsPixel(clip, coords) && toolStore.paintTool !== 'picker') return
  isDrawing = true
  drawUsesSecondary = e.ctrlKey || e.metaKey
  dragStartCoords = { ...coords }
  dragCurrentCoords = { ...coords }
  lastDrawCoords = null

  const tool = toolStore.paintTool
  if (tool === 'line' || tool === 'rect' || tool === 'circle') {
    prepareShapePreview()
    renderCanvas()
    return
  }

  if (tool !== 'picker') projectStore.recordPixels('Pixel Paint')
  drawPixel(coords.x, coords.y, drawUsesSecondary, e.pressure)
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
      scheduleRender()
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
    scheduleRender()
    return
  }

  if (e.pointerType) {
    const pointerType = e.pointerType as 'mouse' | 'pen' | 'touch'
    if (toolStore.currentPointerType !== pointerType) toolStore.currentPointerType = pointerType
  }
  if (e.pressure > 0 && toolStore.currentPressure !== e.pressure) {
    toolStore.currentPressure = e.pressure
  }

  const coords = getPixelCoords(e)
  if (selectionGesture.value && gestureStart) {
    const point = coords || getClampedPixelCoords(e)
    if (point) {
      if (selectionGesture.value === 'marquee') paintSelection.value = marqueeRect(gestureStart, point)
      else if (gestureSource) {
        const pb = projectStore.pixelBuffer
        paintSelection.value = translateSelection(gestureSource, point.x - gestureStart.x, point.y - gestureStart.y, pb.width, pb.height)
        updateSelectionMovePreview(paintSelection.value)
      }
      scheduleRender()
    }
    return
  }

  {
    if (coords) {
      const prev = cursorCoords.value
      if (!prev || prev.x !== coords.x || prev.y !== coords.y) {
        cursorCoords.value = { x: coords.x, y: coords.y, hex: projectStore.pixelBuffer.getPixelHex(coords.x, coords.y) }
        if (needsBrushCursor()) scheduleRender()
      }
    } else if (cursorCoords.value) {
      cursorCoords.value = null
      if (needsBrushCursor()) scheduleRender()
    }
  }

  if (!coords) lastDrawCoords = null

  if (isDrawing && coords) {
    dragCurrentCoords = { ...coords }
    const tool = toolStore.paintTool
    if (tool === 'line' || tool === 'rect' || tool === 'circle') {
      scheduleRender()
    } else if (tool !== 'bucket') {
      drawPixel(coords.x, coords.y, drawUsesSecondary, e.pressure)
    }
  }
}

function onPointerUp(e: PointerEvent) {
  const el = e.target as HTMLElement
  if (el?.hasPointerCapture?.(e.pointerId)) {
    el.releasePointerCapture(e.pointerId)
  }
  activePointers.delete(e.pointerId)
  if (e.pointerId === activePenPointerId) {
    activePenPointerId = null
  }

  if (selectionGesture.value) {
    if (selectionGesture.value === 'move' && gestureSource && paintSelection.value && e.type !== 'pointercancel') {
      const target = paintSelection.value
      if (target.x !== gestureSource.x || target.y !== gestureSource.y) {
        projectStore.recordPixels('Move Selected Pixels')
        moveSelectedPixels(projectStore.pixelBuffer, gestureSource, target)
        refreshLayers()
      }
    } else if (e.type === 'pointercancel') paintSelection.value = gestureSource
    selectionGesture.value = null
    gestureStart = null
    gestureSource = null
    endSelectionMovePreview()
    scheduleRender()
    return
  }
  if (isPanning.value) {
    isPanning.value = false
    return
  }

  if (!isDrawing) return
  isDrawing = false

  const coords = getPixelCoords(e) || dragCurrentCoords
  const tool = toolStore.paintTool
  const shouldPersist = strokeDirty || (coords && dragStartCoords && (tool === 'line' || tool === 'rect' || tool === 'circle'))

  if (e.type !== 'pointercancel' && coords && dragStartCoords && (tool === 'line' || tool === 'rect' || tool === 'circle')) {
    projectStore.recordPixels(`Draw ${tool}`)
    drawShape(projectStore.pixelBuffer, dragStartCoords, coords)

    strokeDirty = true
  }

  if (shouldPersist && tool !== 'picker') {
    projectStore.markTextureUpdated()
    renderCanvas()
  }
  strokeDirty = false
  drawUsesSecondary = false
  dragStartCoords = null
  dragCurrentCoords = null
  lastDrawCoords = null
  clearShapePreview()
  scheduleRender()
}

function resolveDrawColor(isSecondary = false): string {
  const raw = isSecondary ? toolStore.secondaryColor : toolStore.primaryColor
  if (toolStore.paletteSnapEnabled) {
    return snapColorToPalette(raw, activePalette.value)
  }
  return raw
}

function drawPixel(x: number, y: number, isSecondary = false, pressure = 1.0) {
  const pb = projectStore.ensureTextureBuffer(projectStore.activeTexture)
  const color = resolveDrawColor(isSecondary)
  const size = toolStore.brushSize
  const usePressure = toolStore.currentPointerType === 'pen' && toolStore.stylusPressureEnabled
  const opacity = toolStore.brushOpacity * (usePressure && pressure > 0 ? pressure : 1.0)
  const shape = toolStore.brushShape

  if (toolStore.paintTool === 'picker') {
    const picked = pb.getPixelHex(x, y)
    if (isSecondary) toolStore.secondaryColor = picked
    else toolStore.primaryColor = picked
    renderCanvas()
    return
  }
  paintWithinSelection(pb, paintClip(), () => {
    if (toolStore.paintTool === 'eraser') {
      if (lastDrawCoords) pb.eraseLine(lastDrawCoords.x, lastDrawCoords.y, x, y, size, shape)
      else pb.erase(x, y, size, shape)
    } else if (toolStore.paintTool === 'bucket') {
      pb.floodFill(x, y, color)
    } else if (toolStore.paintTool === 'dither' || toolStore.paintTool === 'shade') {
      const wasDeferred = pb.compositeDeferred
      pb.suspendComposite()
      try {
        visitStrokePixels(lastDrawCoords, { x, y }, (px, py) => {
          if (toolStore.paintTool === 'dither') pb.drawDither(px, py, color, size)
          else {
            const mode = isSecondary ? (shadeMode.value === 'lighten' ? 'darken' : 'lighten') : shadeMode.value
            pb.drawShade(px, py, mode, size, shadeStep.value, shadeHueShift.value,
              shadePaletteConstraint.value ? activePalette.value : undefined)
          }
        })
      } finally {
        pb.compositeDeferred = wasDeferred
        pb.commitLayers()
      }
    } else {
      if (lastDrawCoords) pb.drawLine(lastDrawCoords.x, lastDrawCoords.y, x, y, color, size, opacity, shape)
      else pb.drawBrush(x, y, color, size, opacity, shape)
    }
  })

  lastDrawCoords = { x, y }
  strokeDirty = true
  projectStore.markTexturePreview()
  scheduleRender()
}

function onWheel(e: WheelEvent) {
  e.preventDefault()

  // Trackpad / Shift+wheel horizontal pan
  if (e.shiftKey) {
    isFitToView.value = false
    panOffset.value.x -= e.deltaY * 0.8
    scheduleRender()
    return
  }

  // Laptop Trackpad 2-finger pan (deltaX + deltaY with no ctrlKey pinch)
  if (Math.abs(e.deltaX) > 0 && !e.ctrlKey) {
    isFitToView.value = false
    panOffset.value.x -= e.deltaX
    panOffset.value.y -= e.deltaY
    scheduleRender()
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

  zoom.value = fitZoom
  panOffset.value = {
    x: Math.round((w - pb.width * zoom.value) / 2),
    y: Math.round((h - pb.height * zoom.value) / 2)
  }
  isFitToView.value = true
  renderCanvas()
}


watch(() => projectStore.textureRevision, scheduleRender)
watch(() => projectStore.geometryRevision, scheduleRender)
watch(() => projectStore.activeMeshId, scheduleRender)
watch(() => projectStore.activeTextureId, () => {
  deselectPixels()
  nextTick(() => {
    resetPanZoom()
    scheduleRender()
  })
})
watch(paintSelection, scheduleRender)
watch([tilesetClipPaint, tilesetImageId, tilesetTileIndex, tilesetRegion], scheduleRender)
watch(() => [projectStore.pixelBuffer.width, projectStore.pixelBuffer.height], deselectPixels)
watch(() => projectStore.pixelBuffer, () => { endSelectionMovePreview(); clearShapePreview(); selectionGesture.value = null; layerRevision.value++ })
watch(() => [toolStore.brushSize, toolStore.brushShape, toolStore.paintTool], scheduleRender)
watch(isPanning, scheduleRender)
watch(zoom, scheduleRender)
watch(showPixelGrid, scheduleRender)
watch(showUvOverlay, scheduleRender)

onMounted(() => {
  window.addEventListener('click', closeDropdowns)
  window.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener(EDITOR_EVENTS.toggleUvOverlay, onToggleUvOverlay)
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
  window.removeEventListener('keydown', onKeyDown, true)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener(EDITOR_EVENTS.toggleUvOverlay, onToggleUvOverlay)
  containerResizeObserver?.disconnect()
  endSelectionMovePreview()
  clearShapePreview()
  if (renderRafId !== null) {
    cancelAnimationFrame(renderRafId)
    renderRafId = null
    renderPending = false
  }
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
  <div class="pixel-editor h-full w-full bg-ui-panel flex flex-col select-none overflow-hidden touch-none relative font-sans text-xs">
    <input ref="fileInputRef" type="file" accept="image/*" @change="handleTextureUpload" class="hidden" />

    <div class="paint-document-bar">
      <label class="paint-document-picker"><span>Image</span><select :value="projectStore.activeTextureId" @change="handleTextureBindingChange(($event.target as HTMLSelectElement).value)" aria-label="Image to paint">
        <option v-for="texture in projectStore.textures" :key="texture.id" :value="texture.id">{{ texture.name }}</option>
      </select></label>
      <button @click="openTileset(projectStore.activeTextureId)" title="Browse, edit, and apply atlas tiles">Tileset</button>
      <span class="paint-document-spacer"></span>
      <label class="paint-object-picker"><span>Object</span><select :value="projectStore.activeMeshId" @change="handleActiveObjectChange(($event.target as HTMLSelectElement).value)" aria-label="Texture preview object"><option v-for="mesh in projectStore.meshes" :key="mesh.id" :value="mesh.id">{{ mesh.name }}</option></select></label>
      <span v-if="imageApplied" class="paint-applied">Applied ✓</span>
      <button v-else :disabled="!projectStore.activeMesh" class="paint-apply" @click="handleApplyPaintTargetToMesh">Apply image</button>
    </div>

    <Teleport defer to="#uv-paint-command-slot">
      <div class="editor-command-strip flex items-center gap-1.5">
        <div class="relative" @click.stop>
          <button @click="toggleDropdown('editPixels')" class="paint-menu-button">Edit ▾</button>
          <div v-if="activeDropdown === 'editPixels'" class="header-dropdown-menu paint-edit-menu">
            <button :disabled="!historyStore.undoStack.length" @click="historyStore.undo(); closeDropdowns()">Undo <kbd>Ctrl Z</kbd></button>
            <button :disabled="!historyStore.redoStack.length" @click="historyStore.redo(); closeDropdowns()">Redo <kbd>Ctrl Shift Z</kbd></button>
            <hr />
            <button @click="selectAllPixels(); closeDropdowns()">Select all pixels <kbd>Ctrl A</kbd></button>
            <button :disabled="!paintSelection" @click="deselectPixels(); closeDropdowns()">Deselect <kbd>Ctrl D</kbd></button>
            <hr />
            <button :disabled="!paintSelection" @click="editSelectedPixels('copy'); closeDropdowns()">Copy pixels <kbd>Ctrl C</kbd></button>
            <button :disabled="!paintSelection || !canPaintLayer" @click="editSelectedPixels('cut'); closeDropdowns()">Cut pixels <kbd>Ctrl X</kbd></button>
            <button :disabled="!pixelClipboard" @click="pastePixels(); closeDropdowns()">Paste as new layer <kbd>Ctrl V</kbd></button>
            <button :disabled="!paintSelection || !canPaintLayer" @click="editSelectedPixels('delete'); closeDropdowns()">Delete pixels <kbd>Del</kbd></button>
            <hr />
            <button :disabled="!paintSelection || !canPaintLayer" @click="editSelectedPixels('fill'); closeDropdowns()">Fill selection</button>
            <button :disabled="!paintSelection || !canPaintLayer" @click="editSelectedPixels('flipX'); closeDropdowns()">Flip selection horizontally</button>
            <button :disabled="!paintSelection || !canPaintLayer" @click="editSelectedPixels('flipY'); closeDropdowns()">Flip selection vertically</button>
          </div>
        </div>

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
            <div class="px-3 py-0.5 text-[9px] font-bold text-ui-textMuted uppercase">File</div>
            <button @click="showNewTextureModal = true; closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover text-amber-300 font-bold">New Image...</button>
            <button @click="fileInputRef?.click(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover text-ui-textAccent font-bold">Import Image...</button>
            <div class="h-px bg-ui-borderSubtle my-1"></div>
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

          <div v-if="activeDropdown === 'palette'" class="header-dropdown-menu absolute left-0 top-full mt-1 w-64 bg-ui-panel text-ui-textPrimary border border-ui-borderStrong rounded-xs shadow-2xl py-1 z-50 text-xs max-h-[80vh] overflow-y-auto">
            <!-- Open Pro Palette Library Modal -->
            <button 
              @click="showPaletteLibraryModal = true; closeDropdowns()" 
              class="w-full text-left px-3 py-1.5 hover:bg-ui-hover text-amber-400 font-bold flex items-center justify-between border-b border-ui-borderSubtle bg-ui-input/40"
            >
              <span class="flex items-center gap-1.5">
                <BlenderIcon name="uv-smart" :size="14" />
                <span>Browse All 50+ Palettes...</span>
              </span>
            </button>

            <!-- Quick Popular Presets -->
            <div class="px-3 py-1 text-[9px] font-bold text-ui-textMuted uppercase">Popular Presets</div>
            <button 
              v-for="p in DEFAULT_PALETTES.slice(0, 10)" 
              :key="p.id" 
              @click="switchPalette(p); closeDropdowns()"
              class="w-full text-left px-3 py-1 hover:bg-ui-hover flex items-center justify-between"
              :class="{ 'text-amber-400 font-bold bg-ui-hover/30': projectStore.activePalette.id === p.id }"
            >
              <div class="flex items-center gap-2 truncate">
                <div class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ backgroundColor: p.colors[0] }"></div>
                <span class="truncate">{{ p.name }}</span>
              </div>
              <span v-if="projectStore.activePalette.id === p.id" class="text-xs text-amber-400">✓</span>
              <span v-else class="text-[10px] text-ui-textMuted font-mono">{{ p.colors.length }}c</span>
            </button>

            <div class="h-px bg-ui-borderSubtle my-1"></div>

            <button @click="quantizeCanvasToCurrentPalette(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover text-sky-400 font-medium flex items-center gap-1.5">
              <span>Quantize Texture to Palette</span>
            </button>

            <button @click="extractPaletteFromTexture(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover text-emerald-400 font-medium flex items-center gap-1.5">
              <span>Extract from Current Texture</span>
            </button>
          </div>
        </div>

        <!-- Shading Menu Dropdown -->
        <div class="relative" @click.stop>
          <button 
            @click="toggleDropdown('shading')"
            class="px-2 py-1 text-xs font-semibold rounded-xs transition cursor-pointer flex items-center gap-1"
            :class="activeDropdown === 'shading' ? 'bg-ui-hover text-amber-300 shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
          >
            <BlenderIcon name="texture" :size="12" color="#f59e0b" />
            <span>Shading</span>
            <span class="text-[8px] opacity-70">▼</span>
          </button>

          <div v-if="activeDropdown === 'shading'" class="header-dropdown-menu absolute left-0 top-full mt-1 w-60 bg-ui-panel text-ui-textPrimary border border-ui-borderStrong rounded-xs shadow-2xl p-2 z-50 text-xs space-y-2">
            <div class="text-[9.5px] font-bold text-amber-300 uppercase tracking-wider flex items-center justify-between">
              <span>Shading Brush Options</span>
              <span class="text-ui-textMuted font-mono text-[8.5px]">Key: H</span>
            </div>

            <!-- Mode Selector -->
            <div class="space-y-1">
              <span class="text-[9px] text-ui-textMuted font-semibold">Mode:</span>
              <div class="grid grid-cols-2 gap-1">
                <button 
                  @click="shadeMode = 'lighten'; toolStore.setPaintTool('shade'); closeDropdowns()"
                  class="px-2 py-1 rounded-xs border text-[10px] font-bold flex items-center justify-center gap-1 transition cursor-pointer"
                  :class="shadeMode === 'lighten' ? 'bg-amber-500/20 text-amber-300 border-amber-500/50' : 'bg-ui-input text-ui-textSecondary border-ui-borderSubtle hover:bg-ui-hover'"
                >
                  <Sun class="w-3 h-3 text-amber-400" />
                  <span>Lighten (Dodge)</span>
                </button>
                <button 
                  @click="shadeMode = 'darken'; toolStore.setPaintTool('shade'); closeDropdowns()"
                  class="px-2 py-1 rounded-xs border text-[10px] font-bold flex items-center justify-center gap-1 transition cursor-pointer"
                  :class="shadeMode === 'darken' ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50' : 'bg-ui-input text-ui-textSecondary border-ui-borderSubtle hover:bg-ui-hover'"
                >
                  <Moon class="w-3 h-3 text-indigo-400" />
                  <span>Darken (Burn)</span>
                </button>
              </div>
            </div>

            <!-- Step Sensitivity -->
            <div class="space-y-1">
              <div class="flex items-center justify-between text-[9px] text-ui-textMuted">
                <span>Shade Step / Sensitivity:</span>
                <span class="font-mono text-ui-textPrimary font-bold">{{ shadeStep }}</span>
              </div>
              <div class="flex items-center gap-1 bg-ui-input p-0.5 rounded-xs border border-ui-borderSubtle">
                <button 
                  v-for="st in [5, 10, 15, 25, 40]" 
                  :key="st"
                  @click="shadeStep = st"
                  class="flex-1 py-0.5 text-[9px] font-bold rounded-xs transition cursor-pointer text-center"
                  :class="shadeStep === st ? 'bg-ui-active text-ui-textAccent shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
                >{{ st }}</button>
              </div>
            </div>

            <!-- Toggles -->
            <div class="space-y-1 pt-1 border-t border-ui-borderSubtle text-[10px]">
              <label class="flex items-center justify-between cursor-pointer p-1 rounded-xs hover:bg-ui-hover">
                <span class="text-ui-textSecondary">Artistic Hue Shift</span>
                <input type="checkbox" v-model="shadeHueShift" class="rounded-xs text-amber-500 bg-ui-input border-ui-borderDefault focus:ring-0 cursor-pointer" />
              </label>
              <label class="flex items-center justify-between cursor-pointer p-1 rounded-xs hover:bg-ui-hover">
                <span class="text-ui-textSecondary">Lock to Palette Colors</span>
                <input type="checkbox" v-model="shadePaletteConstraint" class="rounded-xs text-amber-500 bg-ui-input border-ui-borderDefault focus:ring-0 cursor-pointer" />
              </label>
            </div>
          </div>
        </div>

      </div>
    </Teleport>

    <NewTextureModal
      v-if="showNewTextureModal"
      :bind-hint="projectStore.activeMesh?.name"
      @close="showNewTextureModal = false"
      @create="handleCreateNewTexture"
    />

    <div class="paint-context-bar" aria-label="Active paint tool settings">
      <button class="paint-history" :disabled="!historyStore.undoStack.length" @click="historyStore.undo()" title="Undo (Ctrl Z)" aria-label="Undo paint edit">↶</button>
      <button class="paint-history" :disabled="!historyStore.redoStack.length" @click="historyStore.redo()" title="Redo (Ctrl Shift Z)" aria-label="Redo paint edit">↷</button>
      <strong class="paint-context-name">{{ paintTools.find(t => t.id === toolStore.paintTool)?.title.replace(' Tool', '') || toolStore.paintTool }}</strong>
        <div class="h-4 w-px bg-ui-borderSubtle mx-1"></div>

        <!-- Contextual Shading Quick Bar when Shading Brush Active -->
        <div v-if="toolStore.paintTool === 'shade'" class="flex items-center gap-1 bg-amber-950/20 border border-amber-500/30 px-1.5 py-0.5 rounded-xs">
          <span class="text-[9px] text-amber-400 font-bold uppercase">Shade:</span>
          <button 
            @click="shadeMode = 'lighten'"
            class="px-1.5 py-0.5 text-[9px] font-bold rounded-xs transition cursor-pointer flex items-center gap-0.5"
            :class="shadeMode === 'lighten' ? 'bg-amber-500/40 text-amber-200 border border-amber-400/60 shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary'"
          >
            <Sun class="w-2.5 h-2.5" />
            <span>Lighten</span>
          </button>
          <button 
            @click="shadeMode = 'darken'"
            class="px-1.5 py-0.5 text-[9px] font-bold rounded-xs transition cursor-pointer flex items-center gap-0.5"
            :class="shadeMode === 'darken' ? 'bg-indigo-500/40 text-indigo-200 border border-indigo-400/60 shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary'"
          >
            <Moon class="w-2.5 h-2.5" />
            <span>Darken</span>
          </button>
          <div class="h-3 w-px bg-amber-500/30 mx-0.5"></div>
          <button 
            @click="shadeHueShift = !shadeHueShift"
            class="px-1 py-0.5 text-[8.5px] font-bold rounded-xs border transition cursor-pointer"
            :class="shadeHueShift ? 'bg-amber-500/30 text-amber-300 border-amber-500/50' : 'bg-ui-input text-ui-textMuted border-ui-borderSubtle'"
            title="Warm Highlights / Cool Shadows"
          >HueShift</button>
        </div>

        <div v-if="toolStore.paintTool === 'shade'" class="h-4 w-px bg-ui-borderSubtle mx-1"></div>

        <!-- Brush Size Segmented Buttons -->
        <p v-if="toolStore.paintTool === 'select'" class="text-ui-textMuted text-[10px]">Drag to select · drag inside to move · Shift-drag replaces selection</p>
        <p v-else-if="toolStore.paintTool === 'picker'" class="text-ui-textMuted text-[10px]">Click the texture to sample a color.</p>
        <p v-else-if="toolStore.paintTool === 'bucket'" class="text-ui-textMuted text-[10px]">Click to fill a connected area of the same color.</p>
        <div v-else class="flex items-center gap-1">
          <span class="text-[9px] text-ui-textMuted font-bold uppercase">Size</span>
          <input
            :value="toolStore.brushSize"
            @input="clampBrushSize(Number(($event.target as HTMLInputElement).value))"
            type="number"
            min="1"
            max="128"
            class="w-12 h-6 bg-ui-input border border-ui-borderSubtle rounded-xs text-center text-[9px] font-bold text-ui-textPrimary focus:outline-none focus:border-ui-accent"
            title="Brush size, 1–128 px ([ and ] adjust)"
            aria-label="Brush size in pixels"
          />

          <div v-if="['brush', 'line', 'rect', 'circle'].includes(toolStore.paintTool)" class="flex items-center gap-1 ml-1" title="Brush opacity">
            <span class="text-[9px] text-ui-textMuted font-bold uppercase">Opacity</span>
            <input
              v-model.number="toolStore.brushOpacity"
              type="range"
              min="0.05"
              max="1"
              step="0.05"
              class="w-14 h-1 accent-amber-400 cursor-pointer"
              aria-label="Brush opacity"
            />
            <span class="w-7 text-right text-[9px] font-mono text-ui-textSecondary">{{ Math.round(toolStore.brushOpacity * 100) }}%</span>
          </div>

          <button
            v-if="toolStore.paintTool === 'rect' || toolStore.paintTool === 'circle'"
            @click="toolStore.brushFilled = !toolStore.brushFilled"
            class="px-1.5 py-0.5 text-[9px] font-bold rounded-xs border border-ui-borderSubtle bg-ui-input transition cursor-pointer"
            :class="toolStore.brushFilled ? 'text-ui-textAccent bg-ui-active' : 'text-ui-textMuted'"
          >{{ toolStore.brushFilled ? 'Filled' : 'Outline' }}</button>
          <button
            v-else-if="toolStore.paintTool === 'brush' || toolStore.paintTool === 'eraser'"
            @click="toolStore.brushShape = toolStore.brushShape === 'square' ? 'circle' : 'square'"
            class="px-1.5 py-0.5 text-[9px] font-bold rounded-xs border border-ui-borderSubtle bg-ui-input text-ui-textSecondary hover:text-ui-textPrimary transition cursor-pointer"
            title="Toggle Square / Round Brush Shape"
          >{{ toolStore.brushShape === 'square' ? 'Square' : 'Round' }}</button>
        </div>
    </div>

    <div v-if="paintSelection || toolStore.paintTool === 'select'" class="paint-selection-bar">
      <template v-if="paintSelection">
      <strong>{{ paintSelection.w }} × {{ paintSelection.h }} px</strong>
      <span class="text-ui-textMuted">Selection · active layer</span>
      <button @click="editSelectedPixels('copy')">Copy</button>
      <button :disabled="!canPaintLayer" @click="editSelectedPixels('fill')">Fill</button>
      <button :disabled="!canPaintLayer" @click="editSelectedPixels('flipX')">Flip H</button>
      <button :disabled="!canPaintLayer" @click="editSelectedPixels('flipY')">Flip V</button>
      <button @click="deselectPixels">Deselect ×</button>
      </template>
      <span v-else class="text-ui-textMuted">Select an area to copy, fill, flip, or move pixels. Arrow keys nudge by 1 px.</span>
    </div>
    <div v-if="!canPaintLayer" class="paint-layer-notice">The active layer is hidden. Show it in Layers to paint.</div>

    <!-- 3. MAIN WORKSPACE WITH TOOL RAIL, CANVAS & FLOATING OVERLAYS -->
    <div class="pixel-workspace relative flex-1 min-h-0 flex overflow-hidden">
      <!-- Left Dedicated Paint Tool Rail -->
      <aside class="pixel-tool-rail flex flex-col justify-between items-center py-2 px-1 bg-ui-panel border-r border-ui-borderSubtle z-10 select-none" aria-label="Pixel paint tools">
        <!-- Tools Stack -->
        <div class="flex flex-col gap-0.5">
          <button
            v-for="tool in paintTools"
            :key="tool.id"
            @click="toolStore.setPaintTool(tool.id)"
            class="w-8 h-8 flex items-center justify-center rounded-xs transition cursor-pointer relative group"
            :class="toolStore.paintTool === tool.id ? 'bg-ui-active text-ui-textAccent border border-ui-borderDefault shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
            :aria-label="tool.title"
            :aria-pressed="toolStore.paintTool === tool.id"
            :title="tool.title + ' (' + tool.key + ')'"
          >
            <BlenderIcon :name="tool.icon" :size="16" /><span class="paint-tool-key">{{ tool.key }}</span>
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
            <BlenderIcon name="swap-colors" :size="14" />
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
        @pointerleave="onPointerLeave"
        @pointercancel="onPointerUp"
        @contextmenu.prevent
      >
        <!-- Top Right Floating View Controls -->
        <div class="pixel-view-group" @pointerdown.stop @pointermove.stop @pointerup.stop @wheel.stop aria-label="Canvas View Controls">
          <div class="relative">
            <button
              @click="showLayers = !showLayers"
              class="pixel-view-toggle"
              :class="{ 'is-active': showLayers }"
              title="Paint layers"
            >
              <span>Layers</span>
              <span class="text-[8px] opacity-70">{{ layers.length }}</span>
            </button>
          </div>
          <button
            @click="showUvOverlay = !showUvOverlay"
            class="pixel-view-toggle"
            :class="{ 'is-active': showUvOverlay }"
            title="Toggle UV Wireframe Overlay (O)"
          >
            <BlenderIcon name="xray" :size="13" />
            <span>UV</span>
          </button>
          <button
            @click="showPixelGrid = !showPixelGrid"
            class="pixel-view-icon"
            :class="{ 'is-active': showPixelGrid }"
            title="Toggle Pixel Grid"
          ><BlenderIcon name="grid" :size="14" /></button>
          <div class="pixel-zoom-control">
            <button @click="zoomOut" title="Zoom out"><BlenderIcon name="zoom-out" :size="14" /></button>
            <span @dblclick="resetPanZoom" title="Double-click to fit">{{ Math.round(zoom * 100) }}%</span>
            <button @click="zoomIn" title="Zoom in"><BlenderIcon name="zoom-in" :size="14" /></button>
          </div>
          <button @click="resetPanZoom" class="pixel-view-icon" title="Fit Canvas to View">
            <BlenderIcon name="view-fit" :size="14" />
          </button>
        </div>
        <canvas 
          ref="canvasRef" 
          class="w-full h-full block touch-none"
        ></canvas>

        <!-- Docked Bottom Swatch Strip (Quick Palette Bar + Color Shading Bar) -->
        <div @pointerdown.stop @pointermove.stop @pointerup.stop @wheel.stop class="pixel-palette-dock absolute bottom-8 left-3 z-10 flex items-center gap-2 p-1 bg-ui-header/95 backdrop-blur-md border border-ui-borderStrong rounded-xs shadow-lg max-w-[calc(100%-24px)] overflow-x-auto">
          <!-- Palette Swatches -->
          <div class="palette-main flex items-center gap-1.5">
            <button 
              @click="showPaletteLibraryModal = true"
              class="flex items-center gap-1 px-1.5 py-0.5 bg-ui-input hover:bg-ui-hover text-amber-400 hover:text-amber-300 text-[9.5px] font-bold rounded-xs border border-ui-borderSubtle whitespace-nowrap transition cursor-pointer"
              title="Click to Open Full Palette Library (50+ Palettes, Import, Export)"
            >
              <span>{{ selectedPaletteName }}</span>
              <span class="text-[8px] opacity-70">▼</span>
            </button>

            <div class="palette-swatches flex items-center gap-0.5 flex-nowrap overflow-x-auto py-1 px-1">
              <button
                v-for="(c, idx) in activePalette"
                :key="idx"
                @click="toolStore.primaryColor = c"
                @contextmenu.prevent="toolStore.secondaryColor = c"
                class="w-4 h-4 rounded-xxs border hover:scale-115 transition shrink-0 cursor-pointer relative"
                :class="toolStore.primaryColor.toLowerCase() === c.toLowerCase() 
                  ? 'ring-2 ring-amber-400 border-white z-1 scale-110 shadow-xs' 
                  : (toolStore.secondaryColor.toLowerCase() === c.toLowerCase() ? 'ring-1 ring-sky-400 border-white' : 'border-black/50')"
                :style="{ backgroundColor: c }"
                :title="`Primary: ${c} · Right-Click for Secondary (#${idx + 1})`"
              ></button>

              <!-- Add Current Color to Palette Button -->
              <button 
                @click="addCurrentColorToActivePalette"
                class="w-4 h-4 rounded-xxs border border-dashed border-ui-borderDefault hover:border-ui-accent hover:bg-ui-hover flex items-center justify-center text-ui-textMuted hover:text-white transition shrink-0 cursor-pointer"
                title="Add current primary color to active palette"
              >
                <BlenderIcon name="plus" :size="10" />
              </button>
            </div>

            <button 
              @click="showPaletteLibraryModal = true" 
              class="px-1.5 py-0.5 bg-ui-input hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textPrimary text-[9px] font-bold rounded-xs border border-ui-borderSubtle whitespace-nowrap transition cursor-pointer" 
              title="Open Palette Library"
            >
              Library...
            </button>
          </div>

          <!-- Divider -->
          <div class="h-4 w-px bg-ui-borderSubtle shrink-0"></div>

          <!-- 5-Tone Color Shading Options Bar -->
          <div v-if="toolStore.paintTool === 'shade'" class="pixel-shading-dock flex items-center gap-1 shrink-0 bg-ui-input/60 px-1.5 py-0.5 rounded-xs border border-ui-borderSubtle">
            <span class="text-[8.5px] font-bold text-amber-300 uppercase whitespace-nowrap">Shading:</span>
            <div class="flex items-center gap-1">
              <button 
                @click="toolStore.primaryColor = activeShadingRamp.highlight"
                @contextmenu.prevent="toolStore.secondaryColor = activeShadingRamp.highlight"
                class="flex items-center justify-center px-1 h-4 rounded-xxs border border-black/40 hover:scale-105 transition shadow-2xs cursor-pointer text-[7.5px] font-mono text-black font-bold uppercase"
                :style="{ backgroundColor: activeShadingRamp.highlight }"
                :title="'Highlight (+45%): ' + activeShadingRamp.highlight + ' · Right-Click for Secondary'"
              >
                High
              </button>
              <button 
                @click="toolStore.primaryColor = activeShadingRamp.light"
                @contextmenu.prevent="toolStore.secondaryColor = activeShadingRamp.light"
                class="flex items-center justify-center px-1 h-4 rounded-xxs border border-black/40 hover:scale-105 transition shadow-2xs cursor-pointer text-[7.5px] font-mono text-black font-bold uppercase"
                :style="{ backgroundColor: activeShadingRamp.light }"
                :title="'Light (+22%): ' + activeShadingRamp.light + ' · Right-Click for Secondary'"
              >
                Light
              </button>
              <button 
                @click="toolStore.primaryColor = activeShadingRamp.base"
                @contextmenu.prevent="toolStore.secondaryColor = activeShadingRamp.base"
                class="flex items-center justify-center px-1 h-4 rounded-xxs border-2 border-amber-400 hover:scale-105 transition shadow-2xs cursor-pointer text-[7.5px] font-mono text-black font-bold uppercase"
                :style="{ backgroundColor: activeShadingRamp.base }"
                :title="'Base Midtone: ' + activeShadingRamp.base + ' · Right-Click for Secondary'"
              >
                Base
              </button>
              <button 
                @click="toolStore.primaryColor = activeShadingRamp.shadow"
                @contextmenu.prevent="toolStore.secondaryColor = activeShadingRamp.shadow"
                class="flex items-center justify-center px-1 h-4 rounded-xxs border border-black/40 hover:scale-105 transition shadow-2xs cursor-pointer text-[7.5px] font-mono text-white font-bold uppercase"
                :style="{ backgroundColor: activeShadingRamp.shadow }"
                :title="'Shadow (-35%): ' + activeShadingRamp.shadow + ' · Right-Click for Secondary'"
              >
                Shad
              </button>
              <button 
                @click="toolStore.primaryColor = activeShadingRamp.deepShadow"
                @contextmenu.prevent="toolStore.secondaryColor = activeShadingRamp.deepShadow"
                class="flex items-center justify-center px-1 h-4 rounded-xxs border border-black/40 hover:scale-105 transition shadow-2xs cursor-pointer text-[7.5px] font-mono text-white font-bold uppercase"
                :style="{ backgroundColor: activeShadingRamp.deepShadow }"
                :title="'Deep Shadow (-65%): ' + activeShadingRamp.deepShadow + ' · Right-Click for Secondary'"
              >
                Deep
              </button>
            </div>
          </div>
        </div>

        <!-- Quick Info Status HUD at Bottom Left -->
        <div class="pixel-status-hud">
          <span>{{ projectStore.pixelBuffer.width }} × {{ projectStore.pixelBuffer.height }}</span>
          <span class="text-ui-textAccent font-bold uppercase">{{ toolStore.paintTool }}</span>
          <span class="truncate">{{ projectStore.pixelBuffer.activeLayer?.name }}</span>
          <span v-if="paintSelection">{{ paintSelection.w }}×{{ paintSelection.h }} selected</span>
          <span v-if="cursorCoords" class="text-ui-textMuted font-mono">
            X:{{ cursorCoords.x }} Y:{{ cursorCoords.y }} [{{ cursorCoords.hex }}]
          </span>
          <span class="text-ui-textMuted hidden md:inline">RMB / Space+Drag / MMB pan · Ctrl+LMB secondary · Wheel zoom</span>
        </div>
      </div>
      <PaintLayers v-if="showLayers" :buffer="projectStore.pixelBuffer" :revision="layerRevision + projectStore.textureRevision"
        @close="showLayers = false" @add="addPaintLayer" @select="selectPaintLayer" @duplicate="duplicatePaintLayer"
        @remove="deletePaintLayer" @visibility="toggleLayerVisibility" @reorder="reorderPaintLayer"
        @rename="renameActivePaintLayer" @opacity="setActiveLayerOpacity" @blend="setActiveLayerBlendMode" />
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
      @imported="handleTextureImported" 
      @close="showImportModal = false; pendingImportFile = null" 
    />
    <TextureSharePrompt
      v-if="sharePromptOpen"
      :object-count="sharePromptCount"
      @confirm="confirmShareApply"
      @cancel="cancelShareApply"
    />
  </div>
  <!-- Palette Library & Manager Modal -->
  <PaletteLibraryModal 
    v-if="showPaletteLibraryModal" 
    @close="showPaletteLibraryModal = false"
    @selected="(pal) => { switchPalette(pal); showPaletteLibraryModal = false }"
  />
</template>

<style scoped>
.pixel-editor {
  container-type: inline-size;
}

.pixel-header-row {
  height: 32px;
  min-height: 32px;
  overflow: hidden;
}

.header-dropdown-menu {
  animation: dropdownIn 100ms ease-out forwards;
  max-height: calc(100vh - 88px);
  overscroll-behavior: contain;
}

/* The paint pane is often only half the workspace. Keep every primary action
   reachable there and progressively move supporting detail out of the way. */
@container (max-width: 900px) {
  .pixel-header-row { padding-left: 5px; padding-right: 5px; gap: 5px; }
  .asset-pipeline { gap: 3px; }
  .asset-label, .asset-arrow, .asset-apply-label { display: none; }
  .asset-pipeline select { max-width: 84px !important; }
  .editor-command-strip { gap: 2px; }
  .editor-command-strip > .relative > button { padding-left: 5px; padding-right: 5px; font-size: 10px; }
  .editor-command-strip > .h-4 { margin-left: 1px; margin-right: 1px; }
  .pixel-palette-dock { left: 6px; right: 6px; bottom: 36px; max-width: none; gap: 4px; }
  .pixel-palette-dock .max-w-md { max-width: 180px; }
  .pixel-status-hud { bottom: 0; right: 0; }
}

@container (max-width: 700px) {
  .pixel-shading-dock { display: none; }
  .pixel-palette-dock > .h-4 { display: none; }
  .pixel-palette-dock .max-w-md { max-width: 112px; }

  .editor-command-strip > .relative > button { padding-left: 4px; padding-right: 4px; }

  .pixel-status-hud .hidden { display: none; }
}

@container (max-width: 520px) {
  .pixel-header-row { overflow-x: auto; }
  .pixel-tool-rail { width: 34px; min-width: 34px; }
  .pixel-tool-rail .w-8 { width: 28px; height: 28px; }
  .pixel-palette-dock { padding: 3px; }
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
  width: 40px;
  min-width: 40px;
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
  right: 10px;
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

.paint-context-bar { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; padding: 6px 10px; background: var(--ui-bg-panel); border-bottom: 1px solid var(--ui-border-subtle); min-height: 36px; flex-shrink: 0; }
.paint-context-name { color: var(--ui-text-accent); font-size: 10px; margin-right: 4px; }
.paint-context-bar > .h-4 { display: none; }
.paint-tool-key { position: absolute; bottom: 1px; right: 3px; font-size: 8px; opacity: .6; }
.pixel-tool-rail { overflow-y: auto; padding-bottom: 8px; }
.pixel-tool-rail > div { flex-shrink: 0; }
.pixel-status-hud { left: 0; right: 0; bottom: 0; min-height: 26px; border-radius: 0; border-width: 1px 0 0; gap: 10px; padding: 4px 10px; white-space: nowrap; overflow: hidden; }
.pixel-palette-dock { bottom: 36px; left: 8px; right: 8px; max-width: none; }
.palette-main { flex: 1; min-width: 0; }
.palette-main > button { flex-shrink: 0; }
.palette-swatches { flex: 1; min-width: 0; }
.palette-swatches > button { width: 18px; height: 18px; }
@container (max-width: 420px) { .palette-main > button:last-child { display: none; } }
.pixel-view-group { height: 34px; }

.paint-menu-button { padding: 4px 8px; color: var(--ui-text-secondary); font-weight: 600; }
.paint-menu-button:hover { background: var(--ui-bg-hover); }
.paint-edit-menu { position: absolute; top: 100%; left: 0; margin-top: 4px; width: 258px; background: var(--ui-bg-panel); border: 1px solid var(--ui-border-strong); border-radius: 3px; padding: 4px; box-shadow: 0 8px 24px #0008; }
.paint-edit-menu button { display: flex; width: 100%; align-items: center; justify-content: space-between; padding: 6px 8px; font-size: 11px; color: var(--ui-text-primary); text-align: left; }
.paint-edit-menu button:hover { background: var(--ui-bg-hover); }
.paint-edit-menu kbd { font-size: 9px; color: var(--ui-text-muted); }
.paint-edit-menu hr { margin: 4px 0; border-color: var(--ui-border-subtle); }
.paint-selection-bar { height: 34px; overflow-x: auto; white-space: nowrap; display: flex; align-items: center; gap: 6px; padding: 5px 10px; border-bottom: 1px solid var(--ui-border-subtle); background: var(--ui-bg-active); flex-shrink: 0; font-size: 10px; }
.paint-selection-bar strong { color: var(--ui-text-accent); }
.paint-selection-bar button { flex-shrink: 0; padding: 3px 6px; background: var(--ui-bg-input); border: 1px solid var(--ui-border-subtle); border-radius: 3px; }
.paint-layer-notice { padding: 5px 10px; font-size: 10px; color: var(--ui-text-accent); background: var(--ui-bg-active); }
@container (max-width: 650px) {
  .pixel-workspace > :deep(.paint-layers-panel) { position: absolute; right: 6px; top: 42px; bottom: auto; max-height: calc(100% - 76px); overflow-y: auto; border: 1px solid var(--ui-border-strong); border-radius: 4px; box-shadow: 0 8px 24px #0008; }
}

.paint-document-bar { display: flex; align-items: center; gap: 5px; min-height: 32px; padding: 3px 8px; border-bottom: 1px solid var(--ui-border-subtle); background: var(--ui-bg-header); flex-shrink: 0; font-size: 10px; }
.paint-document-bar label { display: flex; align-items: center; gap: 5px; min-width: 0; }
.paint-document-picker { flex: 1; max-width: 290px; }
.paint-document-bar label > span { color: var(--ui-text-muted); }
.paint-document-bar select { min-width: 0; width: 100%; border: 1px solid var(--ui-border-subtle); background: var(--ui-bg-input); color: var(--ui-text-primary); border-radius: 3px; padding: 4px; }
.paint-object-picker { max-width: 150px; }
.paint-document-bar button { white-space: nowrap; padding: 4px 6px; border-radius: 3px; background: var(--ui-bg-input); border: 1px solid var(--ui-border-subtle); }
.paint-document-spacer { flex: 1; }
.paint-applied { white-space: nowrap; color: var(--ui-text-muted); }
.paint-document-bar .paint-apply { color: var(--ui-text-accent); border-color: var(--ui-border-strong); }
.paint-history { font-size: 17px; width: 24px; line-height: 24px; border-radius: 3px; } .paint-history:hover { background: var(--ui-bg-hover); }
.paint-context-bar { min-height: 32px; padding: 3px 8px; }
.paint-context-name { font-size: 11px; }
@container (max-width: 620px) { .paint-document-spacer, .paint-object-picker > span { display: none; } .paint-object-picker { max-width: 85px; } .paint-document-bar { gap: 3px; } }
</style>

