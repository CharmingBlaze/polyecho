<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { useToolStore } from '../../stores/toolStore'
import { useTextureApply } from '../../composables/useTextureApply'
import TextureSharePrompt from '../modals/TextureSharePrompt.vue'
import { PixelBuffer, type BufferLayer } from '../../core/painting/PixelCanvas'
import { inferTileSpacing, MAX_ATLAS_CELLS, pixelTileGrid, pixelTileIndexAt, pixelTileRect, resolvePixelTileGrid, transformTile } from '../../core/painting/TilePixels'
import { visitStrokePixels, type PixelPoint } from '../../core/painting/StrokePath'
import { saveBlobDocument } from '../../core/desktop/desktopApi'
import { stampFacesToRegion } from '../../core/uv/TilesetStamp'
import {
  activateTileset,
  selectTilesetTile,
  tilesetClipPaint,
  tilesetImageId,
  tilesetRegion,
  tilesetStamp,
  tilesetTileHeight,
  tilesetTileIndex,
  tilesetTileWidth,
  tilesetCols,
  tilesetRows,
  tilesetSpacing,
  tilesetMargin,
  tilesetUseMode
} from '../../composables/useTilesetWindow'

const emit = defineEmits<{ close: [] }>()
const props = defineProps<{ imageId?: string }>()
const project = useProjectStore(), tools = useToolStore()
const textureId = computed(() => {
  const session = tilesetImageId.value
  if (session && project.textures.some(item => item.id === session)) return session
  return props.imageId || project.activeTextureId
})
const texture = computed(() => project.textures.find(t => t.id === textureId.value))
const cols = ref(texture.value?.atlas?.cols || 2), rows = ref(texture.value?.atlas?.rows || 2)
const grid = ref({ cols: cols.value, rows: rows.value })
const selected = ref(0), dirty = ref(false), status = ref(''), closing = ref(false)
const tool = ref<'pencil' | 'eraser' | 'fill' | 'picker'>('pencil')
const individual = ref(true), inset = ref(0.5), rotation = ref(0), flip = ref(false)
const color = ref(tools.primaryColor), brush = ref(1), showGrid = ref(true), repeat = ref(false)
const canvas = ref<HTMLCanvasElement | null>(null), dialog = ref<HTMLElement | null>(null)
const importInput = ref<HTMLInputElement | null>(null)
const region = ref<{ x: number; y: number; width: number; height: number } | null>(null)
const selectionMode = ref<'tile' | 'square' | 'rectangle'>('tile')
const atlas = ref<HTMLElement | null>(null), minimized = ref(false)
const viewport = ref<HTMLElement | null>(null), pickerViewport = ref<HTMLElement | null>(null), pickerCanvas = ref<HTMLCanvasElement | null>(null)
const panelTab = ref<'tiles' | 'edit' | 'more'>('tiles')
const zoom = ref(1), pan = ref({ x: 0, y: 0 }), panMode = ref(false)
const pickerZoom = ref(1), pickerPan = ref({ x: 8, y: 8 })
const tileWidth = ref(Math.floor((texture.value?.width || 64) / cols.value)), tileHeight = ref(Math.floor((texture.value?.height || 64) / rows.value))
const spacing = ref(texture.value?.atlas?.spacing || 0)
const margin = ref(texture.value?.atlas?.margin || 0)
let panStart: { x: number; y: number; left: number; top: number } | null = null
let pickerFitted = false
const liveSave = ref(false), liveMap = ref(false), squareTiles = ref(true)
const size = ref({ w: Math.min(560, window.innerWidth - 24), h: Math.min(720, window.innerHeight - 72) })
const position = ref({ x: Math.max(12, window.innerWidth - size.value.w - 16), y: 56 })
let dragOrigin: { x: number; y: number; left: number; top: number } | null = null
let resizeOrigin: { x: number; y: number; w: number; h: number } | null = null
let selectionStart: PixelPoint | null = null
let layerSignature = ''
const undo = ref<ImageData[]>([]), redo = ref<ImageData[]>([])
const draft = document.createElement('canvas')
const ctx = draft.getContext('2d', { willReadFrequently: true })!
const draftUrl = ref(''), layerId = ref(''), clipboard = ref<ImageData | null>(null)
let drawing = false, previous: PixelPoint | null = null
const tileLayout = computed(() => ({ tileW: tileWidth.value, tileH: tileHeight.value, spacing: spacing.value, margin: margin.value }))
const b = computed(() => region.value || pixelTileRect(texture.value?.width || 1, texture.value?.height || 1, tileWidth.value, tileHeight.value, selected.value, spacing.value, margin.value))
const selectionStyle = computed(() => ({ left: `${b.value.x / (texture.value?.width || 1) * 100}%`, top: `${b.value.y / (texture.value?.height || 1) * 100}%`, width: `${b.value.width / (texture.value?.width || 1) * 100}%`, height: `${b.value.height / (texture.value?.height || 1) * 100}%` }))
const tiles = computed(() => Array.from({ length: grid.value.cols * grid.value.rows }, (_, i) => i))
const pickerRemainder = computed(() => {
  const t = texture.value
  if (!t) return ''
  const g = pixelTileGrid(t.width, t.height, tileLayout.value)
  const rx = Math.max(0, t.width - g.usedW), ry = Math.max(0, t.height - g.usedH)
  if (!rx && !ry) return spacing.value || margin.value ? ` · gap ${spacing.value} · margin ${margin.value}` : ''
  return ` · ${rx}×${ry} px leftover` 
})
const selectedCell = computed(() => `${selected.value % grid.value.cols + 1}, ${Math.floor(selected.value / grid.value.cols) + 1}`)
const atlasUrl = computed(() => { project.textureRevision; return texture.value?.pixelBuffer.toDataURL() || '' })
const bound = computed(() => project.materials.find(m => m.id === project.activeMesh?.materialId)?.textureId === textureId.value)
const replaceInput = ref<HTMLInputElement | null>(null)
const canMap = computed(() => Boolean(project.activeMesh && !project.activeMesh.locked && project.selectedFaceIds.length > 0))
const layer = computed<BufferLayer | undefined>(() => texture.value?.pixelBuffer.layers.find((l: BufferLayer) => l.id === layerId.value))
const { isOpen, sharedCount, applyToActiveMesh, confirm: confirmApply, cancel } = useTextureApply()
const previousFocus = document.activeElement as HTMLElement | null

function refresh() {
  draftUrl.value = draft.toDataURL()
  const target = canvas.value
  if (!target) return
  target.width = draft.width; target.height = draft.height
  target.getContext('2d')!.drawImage(draft, 0, 0)
}
function load() {
  if (!texture.value) return
  const buffer = texture.value.pixelBuffer
  layerId.value = buffer.activeLayerId
  layerSignature = buffer.activeLayer!.canvas.toDataURL()
  draft.width = b.value.width; draft.height = b.value.height
  ctx.drawImage(buffer.activeLayer!.canvas, b.value.x, b.value.y, b.value.width, b.value.height, 0, 0, draft.width, draft.height)
  undo.value = []; redo.value = []; dirty.value = false; closing.value = false
  nextTick(refresh)
}
function syncSession() {
  tilesetImageId.value = textureId.value
  tilesetTileIndex.value = selected.value
  tilesetRegion.value = region.value
  tilesetTileWidth.value = Math.max(1, tileWidth.value)
  tilesetTileHeight.value = Math.max(1, tileHeight.value)
  tilesetCols.value = grid.value.cols
  tilesetRows.value = grid.value.rows
  tilesetSpacing.value = spacing.value
  tilesetMargin.value = margin.value
  tilesetStamp.individual = individual.value
  tilesetStamp.inset = inset.value
  tilesetStamp.rotation = rotation.value
  tilesetStamp.flip = flip.value
}

function resolveGrid(t: { width: number; height: number; atlas?: { cols: number; rows: number } }) {
  return resolvePixelTileGrid(t.width, t.height, t.atlas)
}

function adoptTexture() {
  const t = texture.value
  if (!t) return
  const next = resolveGrid(t)
  cols.value = next.cols
  rows.value = next.rows
  grid.value = { ...next }
  tileWidth.value = Math.floor(t.width / next.cols)
  tileHeight.value = Math.floor(t.height / next.rows)
  spacing.value = t.atlas?.spacing || 0
  margin.value = t.atlas?.margin || 0
  const detected = inferTileSpacing(t.width, t.height, tileWidth.value, tileHeight.value, margin.value)
  if (detected && !spacing.value) spacing.value = detected
  const laid = pixelTileGrid(t.width, t.height, { tileW: tileWidth.value, tileH: tileHeight.value, spacing: spacing.value, margin: margin.value })
  cols.value = laid.cols
  rows.value = laid.rows
  grid.value = { cols: laid.cols, rows: laid.rows }
  if (!t.atlas || (t.atlas.cols === 2 && t.atlas.rows === 2 && next.cols > 2)) project.setTextureAtlasGrid(t.id, laid.cols, laid.rows)
  region.value = null
  selected.value = Math.min(selected.value, Math.max(0, next.cols * next.rows - 1))
  load()
  syncSession()
  nextTick(() => { scheduleFit(); fitAtlas(); drawPicker() })
}

function fitPicker() {
  const t = texture.value, box = pickerViewport.value
  if (!t || !box || box.clientWidth < 24 || box.clientHeight < 24) return false
  const scale = Math.min((box.clientWidth - 16) / t.width, (box.clientHeight - 16) / t.height)
  pickerZoom.value = Math.max(0.05, Math.min(24, scale))
  pickerPan.value = { x: (box.clientWidth - t.width * pickerZoom.value) / 2, y: (box.clientHeight - t.height * pickerZoom.value) / 2 }
  pickerFitted = true
  return true
}

function scheduleFit() {
  nextTick(() => {
    if (fitPicker()) return
    requestAnimationFrame(() => fitPicker())
  })
}

function drawPicker() {
  const t = texture.value, target = pickerCanvas.value
  if (!t || !target) return
  target.width = t.width
  target.height = t.height
  const g = target.getContext('2d')
  if (!g) return
  g.imageSmoothingEnabled = false
  g.clearRect(0, 0, t.width, t.height)
  g.drawImage(t.pixelBuffer.canvas, 0, 0)
  if (typeof g.moveTo !== 'function') return
  const laid = pixelTileGrid(t.width, t.height, tileLayout.value)
  g.strokeStyle = 'rgba(180, 205, 235, 0.4)'
  g.lineWidth = Math.max(0.5, 1 / Math.max(1, t.width / 256))
  for (let row = 0; row < laid.rows; row++) {
    for (let col = 0; col < laid.cols; col++) {
      const x = laid.margin + col * laid.strideX
      const y = laid.margin + row * laid.strideY
      g.strokeRect(x + 0.5, y + 0.5, laid.tileW - 1, laid.tileH - 1)
    }
  }
  const cell = b.value
  g.strokeStyle = '#f59e0b'
  g.lineWidth = Math.max(1, 2 / Math.max(1, t.width / 256))
  g.strokeRect(cell.x + 0.5, cell.y + 0.5, cell.width - 1, cell.height - 1)
}

function pickerPoint(e: PointerEvent) {
  const box = pickerViewport.value!.getBoundingClientRect()
  return {
    x: (e.clientX - box.left - pickerPan.value.x) / pickerZoom.value,
    y: (e.clientY - box.top - pickerPan.value.y) / pickerZoom.value
  }
}

function pickFromAtlas(e: PointerEvent) {
  if (e.button === 1 || e.altKey || panMode.value) {
    panStart = { x: e.clientX, y: e.clientY, left: pickerPan.value.x, top: pickerPan.value.y }
    pickerViewport.value!.setPointerCapture(e.pointerId)
    return
  }
  if (e.button !== 0 || !texture.value) return
  const p = pickerPoint(e)
  choose(pixelTileIndexAt(texture.value.width, texture.value.height, tileLayout.value, p.x, p.y))
}

function movePicker(e: PointerEvent) {
  if (!panStart) return
  pickerPan.value = { x: panStart.left + e.clientX - panStart.x, y: panStart.top + e.clientY - panStart.y }
}

function zoomPicker(factor: number, event?: WheelEvent) {
  const box = pickerViewport.value?.getBoundingClientRect()
  if (!box) return
  const x = event ? event.clientX - box.left : box.width / 2
  const y = event ? event.clientY - box.top : box.height / 2
  const next = Math.max(0.05, Math.min(24, pickerZoom.value * factor))
  const scale = next / pickerZoom.value
  pickerPan.value = { x: x - (x - pickerPan.value.x) * scale, y: y - (y - pickerPan.value.y) * scale }
  pickerZoom.value = next
}

function switchImage(id: string) {
  if (!id || id === textureId.value) return
  if (dirty.value && !save()) return
  activateTileset(id)
  project.selectTexture(id)
  selected.value = 0
  adoptTexture()
  status.value = `Using ${texture.value?.name || 'image'}.`
}

async function replaceAtlas(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  const t = texture.value
  if (!file || !t) return
  if (dirty.value && !save()) return
  try {
    project.selectTexture(t.id)
    project.recordPixels('Replace atlas image')
    await t.pixelBuffer.loadFromFile(file, true)
    t.width = t.pixelBuffer.width
    t.height = t.pixelBuffer.height
    project.markTextureUpdated(t.id)
    adoptTexture()
    status.value = `Replaced ${t.name} (${t.width} × ${t.height}). Set the grid if the tile size changed.`
  } catch {
    status.value = 'This image could not be opened.'
  }
}

function dropAtlas(event: DragEvent) {
  const file = event.dataTransfer?.files[0]
  if (!file?.type.startsWith('image/')) return
  const input = replaceInput.value
  if (!input) return
  const transfer = new DataTransfer()
  transfer.items.add(file)
  input.files = transfer.files
  void replaceAtlas({ target: input } as unknown as Event)
}

function choose(index: number) {
  if (dirty.value && !save()) return
  selected.value = index
  region.value = pixelTileRect(texture.value?.width || 1, texture.value?.height || 1, tileWidth.value, tileHeight.value, index, spacing.value, margin.value)
  status.value = `Tile ${index + 1} selected. ${tilesetUseMode.value === 'stamp' ? 'Click faces in the 3D view to apply it.' : 'Paint on the 3D object — strokes stay in this tile.'}`
  load(); syncSession(); selectTilesetTile(index)
  nextTick(drawPicker)
  if (liveMap.value) map()
}
function setUseMode(mode: 'stamp' | 'paint') {
  tilesetUseMode.value = mode
  if (mode === 'paint') {
    panelTab.value = 'edit'
    tools.uvWorkspaceTab = 'paint'
    tools.setPaintTool('brush')
  }
  syncSession()
  status.value = mode === 'stamp'
    ? 'Stamp mode: click faces in the 3D view to apply this tile.'
    : 'Paint mode: brush the 3D object; strokes stay inside this tile.'
}
function atlasPoint(e: PointerEvent) {
  const rect = atlas.value!.getBoundingClientRect(), t = texture.value!
  return { x: Math.max(0, Math.min(t.width - 1, Math.floor((e.clientX - rect.left) / rect.width * t.width))), y: Math.max(0, Math.min(t.height - 1, Math.floor((e.clientY - rect.top) / rect.height * t.height))) }
}
function startSelection(e: PointerEvent) {
  if (e.button === 1 || e.altKey || panMode.value) {
    panStart = { x: e.clientX, y: e.clientY, left: pan.value.x, top: pan.value.y }
    viewport.value!.setPointerCapture(e.pointerId); return
  }
  if (e.button !== 0 || !texture.value) return
  if (dirty.value && !save()) return
  atlas.value?.focus()
  const p = atlasPoint(e)
  if (selectionMode.value === 'tile') {
    choose(Math.min(grid.value.rows - 1, Math.floor(p.y / texture.value.height * grid.value.rows)) * grid.value.cols + Math.min(grid.value.cols - 1, Math.floor(p.x / texture.value.width * grid.value.cols)))
    return
  }
  selectionStart = p; atlas.value!.setPointerCapture(e.pointerId); moveSelection(e)
}
function moveSelection(e: PointerEvent) {
  if (panStart) { pan.value = { x: panStart.left + e.clientX - panStart.x, y: panStart.top + e.clientY - panStart.y }; return }
  if (!selectionStart || !texture.value) return
  const p = atlasPoint(e), start = selectionStart
  let width = Math.abs(p.x - start.x) + 1, height = Math.abs(p.y - start.y) + 1
  if (selectionMode.value === 'square') width = height = Math.min(width, height)
  region.value = { x: p.x < start.x ? start.x - width + 1 : start.x, y: p.y < start.y ? start.y - height + 1 : start.y, width, height }
  load(); syncSession()
}
function endSelection() {
  panStart = null
  if (!selectionStart) return
  selectionStart = null
  syncSession()
  if (liveMap.value) map()
}
function fitAtlas() {
  const width = viewport.value?.clientWidth || 320, height = viewport.value?.clientHeight || 300
  zoom.value = Math.min(1, height / (width * (texture.value?.height || 1) / (texture.value?.width || 1)))
  pan.value = { x: (width - width * zoom.value) / 2, y: (height - width * (texture.value?.height || 1) / (texture.value?.width || 1) * zoom.value) / 2 }
}
function zoomAt(factor: number, event?: WheelEvent) {
  const rect = viewport.value?.getBoundingClientRect()
  if (!rect) return
  const x = event ? event.clientX - rect.left : rect.width / 2, y = event ? event.clientY - rect.top : rect.height / 2
  const next = Math.max(.1, Math.min(24, zoom.value * factor)), scale = next / zoom.value
  pan.value = { x: x - (x - pan.value.x) * scale, y: y - (y - pan.value.y) * scale }; zoom.value = next
}
function writeAtlas(c: number, r: number, record: boolean) {
  const t = texture.value
  if (!t) return
  if (record) {
    project.setTextureAtlasGrid(textureId.value, c, r)
    return
  }
  t.atlas = c === 1 && r === 1 ? undefined : { cols: c, rows: r, spacing: spacing.value || undefined, margin: margin.value || undefined }
}

function applyTileSize(width: number, height: number) {
  const t = texture.value
  if (!t) return
  if (dirty.value) { status.value = 'Save or discard your tile edits before changing the grid.'; return }
  const nextW = Math.max(1, Math.min(t.width, Math.round(width) || 1))
  const nextH = Math.max(1, Math.min(t.height, Math.round(squareTiles.value ? nextW : height) || 1))
  if (t.width / nextW > MAX_ATLAS_CELLS || t.height / nextH > MAX_ATLAS_CELLS) {
    status.value = `Tile size must produce at most ${MAX_ATLAS_CELLS} rows or columns.`
    return
  }
  tileWidth.value = nextW
  tileHeight.value = nextH
  applyLayout()
}
function applyLayout() {
  const t = texture.value
  if (!t) return
  if (dirty.value) { status.value = 'Save or discard your tile edits before changing the grid.'; return }
  const laid = pixelTileGrid(t.width, t.height, tileLayout.value)
  cols.value = laid.cols
  rows.value = laid.rows
  grid.value = { cols: laid.cols, rows: laid.rows }
  writeAtlas(laid.cols, laid.rows, false)
  selected.value = Math.min(selected.value, Math.max(0, laid.cols * laid.rows - 1))
  region.value = pixelTileRect(t.width, t.height, laid.tileW, laid.tileH, selected.value, laid.spacing, laid.margin)
  load()
  syncSession()
  status.value = `${laid.cols}×${laid.rows} tiles · ${laid.tileW}×${laid.tileH} px · gap ${laid.spacing} · margin ${laid.margin}.`
}
function detectSpacing() {
  const t = texture.value
  if (!t) return
  const found = inferTileSpacing(t.width, t.height, tileWidth.value, tileHeight.value, margin.value)
  if (found == null) { status.value = 'No even gutter fits this tile size. Set Gap and Margin by hand.'; return }
  spacing.value = found
  applyLayout()
}
function nudgeTile(delta: number) {
  applyTileSize(tileWidth.value + delta, tileHeight.value + (squareTiles.value ? delta : 0))
}
function onTileDim(axis: 'w' | 'h', event: Event) {
  const n = Math.max(1, Math.round(Number((event.target as HTMLInputElement).value) || 1))
  applyTileSize(axis === 'w' ? n : tileWidth.value, axis === 'h' ? n : tileHeight.value)
}
function startDrag(e: PointerEvent) {
  if ((e.target as HTMLElement).closest('button, input, select, label') || e.button !== 0) return
  dragOrigin = { x: e.clientX, y: e.clientY, left: position.value.x, top: position.value.y }
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}
function drag(e: PointerEvent) {
  if (resizeOrigin) {
    size.value = {
      w: Math.max(400, Math.min(window.innerWidth - 16, resizeOrigin.w + e.clientX - resizeOrigin.x)),
      h: Math.max(280, Math.min(window.innerHeight - 16, resizeOrigin.h + e.clientY - resizeOrigin.y))
    }
    return
  }
  if (!dragOrigin) return
  position.value = { x: Math.max(0, Math.min(window.innerWidth - (dialog.value?.offsetWidth || 320), dragOrigin.left + e.clientX - dragOrigin.x)), y: Math.max(0, Math.min(window.innerHeight - 48, dragOrigin.top + e.clientY - dragOrigin.y)) }
}
function startResize(e: PointerEvent) {
  if (e.button !== 0) return
  e.stopPropagation()
  resizeOrigin = { x: e.clientX, y: e.clientY, w: size.value.w, h: size.value.h }
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}
function configure() {
  if (dirty.value) { status.value = 'Save or discard your tile edits before changing the grid.'; return }
  const t = texture.value
  if (!t) return
  const c = Math.max(1, Math.min(MAX_ATLAS_CELLS, t.width, Math.round(Number(cols.value) || 1)))
  const r = Math.max(1, Math.min(MAX_ATLAS_CELLS, t.height, Math.round(Number(rows.value) || 1)))
  cols.value = c; rows.value = r; grid.value = { cols: c, rows: r }
  tileWidth.value = Math.floor(t.width / c); tileHeight.value = Math.floor(t.height / r)
  writeAtlas(c, r, true)
  selected.value = Math.min(selected.value, Math.max(0, c * r - 1))
  load(); syncSession()
  status.value = `${c}×${r} tiles · ${tileWidth.value}×${tileHeight.value} px each.`
}
function checkpoint() {
  undo.value = [...undo.value.slice(-29), ctx.getImageData(0, 0, draft.width, draft.height)]
  redo.value = []; dirty.value = true; closing.value = false
}
function history(back: boolean) {
  const source = back ? undo : redo, destination = back ? redo : undo
  if (!source.value.length) return
  destination.value = [...destination.value, ctx.getImageData(0, 0, draft.width, draft.height)]
  const data = source.value[source.value.length - 1]!
  source.value = source.value.slice(0, -1); ctx.putImageData(data, 0, 0); dirty.value = true; refresh()
}
function point(e: PointerEvent): PixelPoint {
  const rect = canvas.value!.getBoundingClientRect()
  return { x: Math.max(0, Math.min(draft.width - 1, Math.floor((e.clientX - rect.left) / rect.width * draft.width))), y: Math.max(0, Math.min(draft.height - 1, Math.floor((e.clientY - rect.top) / rect.height * draft.height))) }
}
function stroke(e: PointerEvent) {
  if (!drawing) return
  const p = point(e), size = Math.max(1, Math.min(32, Math.round(Number(brush.value) || 1)))
  ctx.fillStyle = color.value
  visitStrokePixels(previous, p, (x, y) => {
    if (tool.value === 'eraser') ctx.clearRect(x - Math.floor(size / 2), y - Math.floor(size / 2), size, size)
    else ctx.fillRect(x - Math.floor(size / 2), y - Math.floor(size / 2), size, size)
  })
  previous = p; refresh()
}
function start(e: PointerEvent) {
  if (e.button !== 0) return
  const p = point(e)
  if (tool.value === 'picker') {
    const rgba = ctx.getImageData(p.x, p.y, 1, 1).data
    color.value = '#' + [...rgba.slice(0, 3)].map(n => n.toString(16).padStart(2, '0')).join(''); return
  }
  checkpoint()
  if (tool.value === 'fill') {
    const buffer = new PixelBuffer(draft.width, draft.height)
    buffer.activeLayer!.ctx.drawImage(draft, 0, 0); buffer.composite()
    buffer.floodFill(p.x, p.y, color.value)
    ctx.clearRect(0, 0, draft.width, draft.height); ctx.drawImage(buffer.canvas, 0, 0); refresh(); return
  }
  canvas.value!.setPointerCapture(e.pointerId); drawing = true; previous = null; stroke(e)
}
function stop() { const changed = drawing; drawing = false; previous = null; if (changed && liveSave.value) save() }
function edit(action: 'horizontal' | 'vertical' | 'rotate' | 'clear' | 'fill') {
  checkpoint()
  if (action === 'clear') ctx.clearRect(0, 0, draft.width, draft.height)
  else if (action === 'fill') { ctx.fillStyle = color.value; ctx.fillRect(0, 0, draft.width, draft.height) }
  else {
    const data = ctx.getImageData(0, 0, draft.width, draft.height)
    data.data.set(transformTile(data.data, data.width, data.height, action)); ctx.putImageData(data, 0, 0)
  }
  refresh()
}
function paste() {
  const data = clipboard.value
  if (!data || data.width !== draft.width || data.height !== draft.height) { status.value = 'Copy a tile with matching dimensions first.'; return }
  checkpoint(); ctx.putImageData(data, 0, 0); refresh()
}
function save() {
  if (!dirty.value) return true
  const t = texture.value, target = layer.value
  if (!t || !target || !target.visible) { status.value = 'Show the target layer in Paint before saving.'; return false }
  if (target.canvas.toDataURL() !== layerSignature) { status.value = 'This layer changed outside the panel. Discard this draft to load those changes before editing.'; return false }
  project.selectTexture(textureId.value)
  project.recordPixels('Edit atlas tile')
  t.atlas = grid.value.cols === 1 && grid.value.rows === 1 ? undefined : { ...grid.value }
  target.ctx.clearRect(b.value.x, b.value.y, b.value.width, b.value.height)
  target.ctx.drawImage(draft, b.value.x, b.value.y)
  t.pixelBuffer.composite(); project.markTextureUpdated(textureId.value)
  layerSignature = target.canvas.toDataURL()
  dirty.value = false; closing.value = false; status.value = 'Tile saved. Other tiles and layers are unchanged.'
  return true
}
function extract() {
  if (!texture.value || dirty.value) return
  const buffer = new PixelBuffer(b.value.width, b.value.height)
  buffer.activeLayer!.ctx.drawImage(texture.value.pixelBuffer.canvas, b.value.x, b.value.y, b.value.width, b.value.height, 0, 0, b.value.width, b.value.height)
  buffer.composite()
  const result = project.createTexture(`${texture.value.name}_tile_${selected.value + 1}`, b.value.width, b.value.height, undefined, buffer, { select: false })
  status.value = `Created ${result.name}. Find it in the image library and apply it to an object.`
}
function exportTile() {
  draft.toBlob(blob => { if (blob) void saveBlobDocument(blob, `tile_${selected.value + 1}.png`, [{ name: 'PNG image', extensions: ['png'] }]) })
}
function importTile(event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0]
  input.value = ''
  if (!file) return
  const index = selected.value, width = draft.width, height = draft.height
  const url = URL.createObjectURL(file), image = new Image()
  image.onload = () => {
    URL.revokeObjectURL(url)
    if (!dialog.value || selected.value !== index || draft.width !== width || draft.height !== height) return
    if (image.width !== width || image.height !== height) { status.value = `Import needs a ${width} × ${height} image. Resize it in Paint first.`; return }
    checkpoint(); ctx.clearRect(0, 0, width, height); ctx.drawImage(image, 0, 0); refresh()
    status.value = 'Image imported into the tile draft. Save to update the atlas.'
  }
  image.onerror = () => { URL.revokeObjectURL(url); status.value = 'This image could not be opened.' }
  image.src = url
}
function map() {
  const mesh = project.activeMesh
  if (!canMap.value || !mesh || !texture.value) return
  project.selectTexture(textureId.value)
  if (!bound.value) project.applyTextureToMesh(mesh.id, textureId.value, 'this_object')
  const next = resolvePixelTileGrid(texture.value.width, texture.value.height, texture.value.atlas)
  if (!texture.value.atlas || texture.value.atlas.cols !== next.cols || texture.value.atlas.rows !== next.rows) {
    project.setTextureAtlasGrid(textureId.value, next.cols, next.rows)
    grid.value = next
  }
  syncSession()
  project.recordState('Stamp atlas tile on faces')
  const count = stampFacesToRegion(mesh, project.selectedFaceIds, texture.value, b.value, {
    individual: individual.value, inset: inset.value, rotation: rotation.value, flip: flip.value
  })
  if (count) project.markGeometryUpdated()
  status.value = count
    ? `Mapped ${count} selected faces to tile ${selected.value + 1}. Click more faces in the 3D view to keep stamping.`
    : 'Those faces could not be mapped. Unwrap them in the UV editor first.'
}
function close() { if (dirty.value) { closing.value = true; status.value = 'You have unsaved tile edits.' } else emit('close') }
function key(e: KeyboardEvent) {
  if (!(e.target as HTMLElement)?.closest?.('.tileset-dialog')) return
  e.stopPropagation()
  if (e.target === atlas.value && !dirty.value && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) && texture.value) {
    e.preventDefault()
    const step = e.shiftKey ? 8 : 1
    region.value = { ...b.value, x: Math.max(0, Math.min(texture.value.width - b.value.width, b.value.x + (e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0))), y: Math.max(0, Math.min(texture.value.height - b.value.height, b.value.y + (e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0))) }
    load(); syncSession(); if (liveMap.value) map()
  }
  if (e.key === 'Escape') { e.preventDefault(); if (isOpen.value) cancel(); else close() }
  if (e.key === 'Tab') {
    const root = isOpen.value ? dialog.value!.parentElement! : dialog.value!
    const items = [...root.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, summary, [tabindex="0"]')].filter(el => el.getClientRects().length)
    const i = items.indexOf(document.activeElement as HTMLElement)
    if (e.shiftKey && i <= 0) { e.preventDefault(); items.at(-1)?.focus() }
    else if (!e.shiftKey && i === items.length - 1) { e.preventDefault(); items[0]?.focus() }
  }
  if ((e.ctrlKey || e.metaKey) && !['INPUT', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
    if (e.key.toLowerCase() === 'z') { e.preventDefault(); history(!e.shiftKey) }
    if (e.key.toLowerCase() === 's') { e.preventDefault(); save() }
  }
}
watch(() => project.textureRevision, () => {
  const active = texture.value?.pixelBuffer.activeLayer
  if (!dirty.value && !drawing && !selectionStart && active && (active.id !== layerId.value || active.canvas.toDataURL() !== layerSignature)) load()
  drawPicker()
})
watch(squareTiles, (on) => { if (on && tileHeight.value !== tileWidth.value) applyTileSize(tileWidth.value, tileWidth.value) })
watch([individual, inset, rotation, flip], syncSession)
watch([selected, tileWidth, tileHeight, spacing, margin, () => grid.value.cols, () => grid.value.rows], drawPicker)
watch(panelTab, (tab) => { if (tab === 'tiles' && !pickerFitted) scheduleFit() })
watch(textureId, (id, previous) => { if (id && id !== previous) { pickerFitted = false; adoptTexture() } })
onMounted(() => {
  adoptTexture()
  window.addEventListener('keydown', key, true)
})
onUnmounted(() => {
  window.removeEventListener('keydown', key, true)
  previousFocus?.focus()
})
</script>

<template>
  <Teleport to="body">
    <div class="tileset-backdrop" @keydown="key" @pointerdown.stop @pointerup.stop>
      <section ref="dialog" tabindex="-1" role="dialog" aria-modal="false" aria-label="Tileset atlas editor" class="tileset-dialog" :style="{ left: `${position.x}px`, top: `${position.y}px`, width: `${size.w}px`, height: minimized ? 'auto' : `${size.h}px` }" @pointermove="drag" @pointerup="dragOrigin = null; resizeOrigin = null" @pointercancel="dragOrigin = null; resizeOrigin = null">
        <header @pointerdown="startDrag">
          <div class="title-block">
            <strong>Tileset</strong>
            <span>{{ texture?.name }}</span>
          </div>
          <div class="mode-switch" role="group" aria-label="Tileset use mode">
            <button type="button" :aria-pressed="tilesetUseMode === 'stamp'" :class="{ selected: tilesetUseMode === 'stamp' }" @click="setUseMode('stamp')">Stamp</button>
            <button type="button" :aria-pressed="tilesetUseMode === 'paint'" :class="{ selected: tilesetUseMode === 'paint' }" @click="setUseMode('paint')">Paint</button>
          </div>
          <div class="chrome">
            <button type="button" :aria-label="minimized ? 'Expand atlas panel' : 'Minimize atlas panel'" @click="minimized = !minimized">{{ minimized ? '▢' : '−' }}</button>
            <button type="button" aria-label="Close tileset editor" @click="close">✕</button>
          </div>
        </header>
        <nav v-show="!minimized" class="workspace-tabs" aria-label="Tileset panels">
          <button type="button" :class="{ selected: panelTab === 'tiles' }" :aria-pressed="panelTab === 'tiles'" @click="panelTab = 'tiles'">Tiles</button>
          <button type="button" :class="{ selected: panelTab === 'edit' }" :aria-pressed="panelTab === 'edit'" @click="panelTab = 'edit'">Edit</button>
          <button type="button" :class="{ selected: panelTab === 'more' }" :aria-pressed="panelTab === 'more'" @click="panelTab = 'more'">Advanced</button>
        </nav>
        <div v-show="!minimized" class="tileset-body">
          <section v-show="panelTab === 'tiles'" class="tile-browser">
            <div class="image-row">
              <select :value="textureId" aria-label="Tileset image" @change="switchImage(($event.target as HTMLSelectElement).value)">
                <option v-for="item in project.textures" :key="item.id" :value="item.id">{{ item.name }} · {{ item.width }}×{{ item.height }}</option>
              </select>
              <input ref="replaceInput" type="file" accept="image/*" hidden @change="replaceAtlas" />
              <button type="button" @click="replaceInput?.click()">Replace</button>
              <button type="button" :disabled="!project.activeMesh || project.activeMesh.locked || bound" @click="applyToActiveMesh(textureId)">{{ bound ? 'On object' : 'Use on object' }}</button>
            </div>
            <div class="size-bar">
              <span class="field-label">Size</span>
              <div class="seg" role="group" aria-label="Tile size presets">
                <button v-for="preset in [8, 16, 32, 64]" :key="preset" type="button" :aria-label="`${preset} px tiles`" :aria-pressed="tileWidth === preset && tileHeight === preset" :class="{ selected: tileWidth === preset && tileHeight === preset }" @click="squareTiles = true; applyTileSize(preset, preset)">{{ preset }}</button>
              </div>
              <span class="unit">px</span>
              <button type="button" class="icon-btn" aria-label="Smaller tiles" @click="nudgeTile(-1)">−</button>
              <button type="button" class="icon-btn" aria-label="Larger tiles" @click="nudgeTile(1)">+</button>
              <label class="dim">W<input :value="tileWidth" type="number" min="1" aria-label="Tile width in pixels" @change="onTileDim('w', $event)" /></label>
              <label class="dim">H<input :value="tileHeight" type="number" min="1" aria-label="Tile height in pixels" :disabled="squareTiles" @change="onTileDim('h', $event)" /></label>
              <label class="dim">Gap<input :value="spacing" type="number" min="0" aria-label="Tile spacing in pixels" @change="spacing = Math.max(0, Math.round(Number(($event.target as HTMLInputElement).value) || 0)); applyLayout()" /></label>
              <label class="dim">Margin<input :value="margin" type="number" min="0" aria-label="Atlas margin in pixels" @change="margin = Math.max(0, Math.round(Number(($event.target as HTMLInputElement).value) || 0)); applyLayout()" /></label>
              <button type="button" @click="detectSpacing">Detect gap</button>
              <label class="lock"><input v-model="squareTiles" type="checkbox" /> Square</label>
              <span class="grid-badge">{{ grid.cols }}×{{ grid.rows }}</span>
              <button type="button" :aria-pressed="panMode" :class="{ selected: panMode }" @click="panMode = !panMode">Pan</button>
              <button type="button" @click="fitPicker">Fit</button>
            </div>
            <div
              ref="pickerViewport"
              class="tile-picker"
              aria-label="Atlas tile picker"
              @wheel.prevent.stop="zoomPicker($event.deltaY < 0 ? 1.15 : 1 / 1.15, $event)"
              @pointerdown.prevent="pickFromAtlas"
              @pointermove="movePicker"
              @pointerup="panStart = null"
              @pointercancel="panStart = null"
            >
              <canvas
                ref="pickerCanvas"
                class="tile-picker-canvas"
                :style="{ transform: `translate(${pickerPan.x}px, ${pickerPan.y}px) scale(${pickerZoom})` }"
              />
            </div>
            <div class="picker-footer">
              <p class="picker-meta">{{ tileWidth }}×{{ tileHeight }} px · {{ grid.cols }}×{{ grid.rows }} tiles{{ pickerRemainder }} · cell {{ selectedCell }}</p>
              <div class="stamp-row">
                <label>Rotate<select v-model.number="rotation" aria-label="Stamp rotation"><option :value="0">0°</option><option :value="1">90°</option><option :value="2">180°</option><option :value="3">270°</option></select></label>
                <label><input v-model="flip" type="checkbox" /> Flip</label>
                <label>Inset<input v-model.number="inset" type="number" min="0" max="16" step="0.5" aria-label="Stamp inset" /></label>
                <label><input v-model="tilesetClipPaint" type="checkbox" /> Clip paint</label>
              </div>
            </div>
            <div class="sr-tiles">
              <button v-for="i in tiles.slice(0, 32)" :key="i" type="button" :aria-label="`Select tile ${i + 1}`" :aria-pressed="selected === i" @click="choose(i)">{{ i + 1 }}</button>
            </div>
          </section>
          <main v-show="panelTab === 'edit'">
            <div class="tile-title"><h3>{{ region ? 'Edit region' : `Edit tile ${selected + 1}` }}</h3><span>{{ b.width }} × {{ b.height }} px · {{ layer?.name }}{{ dirty ? ' · Unsaved' : '' }}</span></div>
            <div class="tile-editor-bar">
              <button v-for="item in (['pencil', 'eraser', 'fill', 'picker'] as const)" :key="item" :aria-pressed="tool === item" :class="{ selected: tool === item }" @click="tool = item">{{ item }}</button>
              <input v-model="color" type="color" aria-label="Tile paint color" />
              <label>Size<input v-model.number="brush" type="number" min="1" max="32" aria-label="Tile brush size" /></label>
            </div>
            <div class="tile-stage"><canvas ref="canvas" aria-label="Tile pixel canvas" :style="{ aspectRatio: `${b.width} / ${b.height}` }" @pointerdown.prevent="start" @pointermove="stroke" @pointerup="stop" @pointercancel="stop" @lostpointercapture="stop" /><div v-if="showGrid && Math.max(b.width, b.height) <= 64" class="pixel-grid" :style="{ aspectRatio: `${b.width} / ${b.height}`, backgroundSize: `${100 / b.width}% ${100 / b.height}%` }"></div></div>
            <div class="row"><button :disabled="!undo.length" @click="history(true)">Undo</button><button :disabled="!redo.length" @click="history(false)">Redo</button><label><input v-model="showGrid" type="checkbox" /> Pixel grid</label><label><input v-model="repeat" type="checkbox" /> Repeat preview</label></div>
            <label><input v-model="liveSave" type="checkbox" /> Save each brush stroke to atlas</label>
            <div v-if="repeat" class="repeat-preview" :style="{ backgroundImage: `url(${draftUrl})`, backgroundSize: '33.333% 33.333%' }" aria-label="Tile repeated three by three"></div>
            <div class="edit-actions">
              <button class="primary" :disabled="!dirty || !layer?.visible" @click="save">Save tile to atlas</button>
              <button :disabled="!dirty" @click="load(); status = 'Draft discarded.'">Discard edits</button>
              <button @click="edit('fill')">Fill tile with color</button>
            </div>
          </main>
          <aside v-show="panelTab === 'more'" class="tile-actions">
            <h3>Save & use · {{ project.activeMesh?.name || 'No object selected' }}</h3>
            <button class="primary" :disabled="!dirty || !layer?.visible" @click="save">Save tile to atlas</button>
            <button :disabled="!dirty" @click="load(); status = 'Draft discarded.'">Discard edits</button>
            <button :disabled="!canMap" @click="map">Use region on {{ project.selectedFaceIds.length }} selected faces</button>
            <p>Stamp: click faces in the 3D view. Paint: brush the object; Clip keeps strokes in this tile.</p>
            <button :disabled="dirty" @click="extract">Create image from this tile</button>
            <button type="button" :disabled="project.textures.length < 2" @click="project.deleteTexture(textureId); status = 'Image deleted.'">Delete</button>
            <section class="atlas-section">
              <div class="atlas-heading">Region select · {{ texture?.width }} × {{ texture?.height }}</div>
              <div class="atlas-body">
                <div class="row selection-tools">
                  <button v-for="mode in (['tile', 'square', 'rectangle'] as const)" :key="mode" :class="{ selected: selectionMode === mode }" :aria-pressed="selectionMode === mode" @click="selectionMode = mode">{{ mode }}</button>
                </div>
                <div ref="viewport" class="atlas-viewport" @dragover.prevent @drop.prevent="dropAtlas" @wheel.prevent.stop="zoomAt($event.deltaY < 0 ? 1.15 : 1 / 1.15, $event)" @pointerdown.prevent="startSelection" @pointermove="moveSelection" @pointerup="endSelection" @pointercancel="endSelection">
                  <div ref="atlas" tabindex="0" role="group" class="atlas-overview" aria-label="Full atlas selection surface" :style="{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }">
                    <img :src="atlasUrl" alt="Whole texture atlas" draggable="false" />
                    <div class="atlas-region" :style="selectionStyle"></div>
                  </div>
                </div>
                <p>Drag to select · Arrow keys move · Shift = 8 px · {{ b.x }}, {{ b.y }} · {{ b.width }} × {{ b.height }} px</p>
                <label><input v-model="liveMap" type="checkbox" /> Apply region on selection</label>
                <div class="settings-grid">
                  <div class="row"><span class="settings-label">Grid</span><button v-for="n in [2,4,8]" :key="n" :class="{ selected: grid.cols === n && grid.rows === n }" @click="cols = n; rows = n; configure()">{{ n }} × {{ n }}</button></div>
                  <div class="row settings-fields">
                    <label>Cols<input v-model.number="cols" type="number" min="1" :max="MAX_ATLAS_CELLS" /></label>
                    <label>Rows<input v-model.number="rows" type="number" min="1" :max="MAX_ATLAS_CELLS" /></label>
                    <button type="button" @click="configure">Save grid</button>
                  </div>
                  <label><input v-model="individual" type="checkbox" /> Fill each face</label>
                </div>
              </div>
            </section>
            <details><summary>Transform & copy</summary><div class="options">
              <div class="row"><button @click="edit('horizontal')">Flip H</button><button @click="edit('vertical')">Flip V</button></div><button :disabled="b.width !== b.height" @click="edit('rotate')">Rotate 90° (square tiles)</button>
              <button @click="clipboard = ctx.getImageData(0, 0, draft.width, draft.height); status = 'Tile copied. Save or discard before choosing a destination.'">Copy tile</button><button :disabled="!clipboard" @click="paste">Paste tile</button>
              <button @click="edit('fill')">Fill tile with color</button><button @click="edit('clear')">Clear tile pixels</button>
            </div></details>
            <details><summary>Import, export & slice</summary><div class="options"><input ref="importInput" type="file" accept="image/*" hidden @change="importTile" /><button @click="importInput?.click()">Import image into tile…</button><button @click="exportTile">Export edited layer tile PNG</button><button :disabled="dirty || tiles.length < 2" @click="project.sliceTextureIntoTiles(textureId, grid.cols, grid.rows); status = 'All tiles added to the image library.'">Create images from all tiles</button><p>Slice uses the saved, merged atlas. The original stays intact.</p></div></details>
          </aside>
        </div>
        <footer v-show="!minimized || closing"><span role="status">{{ status || (tilesetUseMode === 'stamp' ? 'Click a tile, then a face in the 3D view.' : 'Click a tile, then paint the 3D object.') }}</span><template v-if="closing"><button @click="emit('close')">Discard & close</button><button @click="closing = false">Keep editing</button></template></footer>
        <button v-show="!minimized" type="button" class="resize-handle" aria-label="Resize tileset panel" @pointerdown="startResize"></button>
      </section>
      <TextureSharePrompt v-if="isOpen" style="pointer-events: auto" :object-count="sharedCount" @confirm="confirmApply" @cancel="cancel" />
    </div>
  </Teleport>
</template>

<style scoped>
.tileset-backdrop { position: fixed; inset: 0; z-index: 15000; pointer-events: none; }
.tileset-dialog {
  position: fixed; pointer-events: auto; display: flex; flex-direction: column;
  min-width: 400px; max-width: calc(100vw - 16px); max-height: calc(100vh - 16px); overflow: hidden;
  background: var(--ui-bg-panel); color: var(--ui-text-secondary);
  border: 1px solid var(--ui-border-strong); border-radius: 8px;
  box-shadow: 0 18px 48px #000a; font: 11px var(--font-sans, sans-serif); outline: none;
}
header {
  display: flex; align-items: center; gap: 10px; padding: 8px 10px;
  background: var(--ui-bg-header); cursor: move; touch-action: none; user-select: none; flex-shrink: 0;
}
.title-block { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 1px; }
header strong { font-size: 12px; color: var(--ui-text-primary); letter-spacing: 0; }
header span { font-size: 10px; color: var(--ui-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mode-switch, .seg, .workspace-tabs {
  display: flex; padding: 2px; gap: 2px; background: var(--ui-bg-input);
  border: 1px solid var(--ui-border-subtle); border-radius: 6px;
}
.mode-switch button, .seg button, .workspace-tabs button {
  text-transform: none; letter-spacing: 0; min-width: 36px; padding: 4px 8px; border: 0; background: transparent;
}
.chrome { display: flex; gap: 4px; }
.workspace-tabs { margin: 0 10px; flex-shrink: 0; }
.workspace-tabs button { flex: 1; }
.tileset-body { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; }
.tile-browser { display: flex; flex-direction: column; flex: 1; min-height: 0; padding: 8px 10px 6px; gap: 8px; }
.image-row, .size-bar, .stamp-row, .row, .edit-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.image-row select { flex: 1 1 140px; min-width: 0; }
.size-bar { padding: 6px 8px; background: var(--ui-bg-header); border: 1px solid var(--ui-border-subtle); border-radius: 6px; }
.field-label, .unit, .grid-badge { color: var(--ui-text-muted); font-size: 10px; }
.grid-badge {
  margin-left: auto; padding: 2px 7px; border-radius: 999px;
  background: var(--ui-bg-input); border: 1px solid var(--ui-border-subtle); color: var(--ui-text-secondary);
}
.icon-btn { min-width: 26px; padding: 4px 6px; }
.dim, .lock, label { display: flex; align-items: center; gap: 4px; }
.dim input { width: 44px; }
h3 { color: var(--ui-text-primary); font-weight: 600; margin: 0 0 8px; }
p { color: var(--ui-text-muted); line-height: 1.45; font-size: 10px; margin: 0; }
button, input, select { font: inherit; text-transform: none; letter-spacing: 0; }
button { background: var(--ui-bg-input); border: 1px solid var(--ui-border-subtle); padding: 5px 8px; border-radius: 4px; cursor: pointer; color: inherit; }
button:hover { background: var(--ui-bg-hover); }
button:disabled { opacity: .4; cursor: default; }
button.selected, .primary { background: var(--ui-bg-active); color: var(--ui-text-accent); border-color: var(--ui-border-strong); }
button:focus-visible, input:focus-visible, select:focus-visible, summary:focus-visible { outline: 2px solid var(--ui-text-accent); }
input, select { background: var(--ui-bg-input); color: var(--ui-text-primary); border: 1px solid var(--ui-border-subtle); padding: 3px 5px; border-radius: 4px; }
input[type=number] { width: 48px; }
input[type=color] { width: 30px; height: 26px; padding: 1px; }
.tile-picker {
  flex: 1; min-height: 280px; overflow: hidden; position: relative; touch-action: none; cursor: crosshair;
  border: 1px solid var(--ui-border-subtle); border-radius: 6px;
  background:
    repeating-conic-gradient(#2a2d36 0% 25%, #1b1d24 0% 50%) 0 0 / 16px 16px;
}
.tile-picker-canvas {
  display: block; width: auto !important; height: auto !important; max-width: none !important; max-height: none !important;
  transform-origin: 0 0; image-rendering: pixelated;
}
.picker-footer { display: flex; flex-direction: column; gap: 6px; flex-shrink: 0; }
.picker-meta { color: var(--ui-text-muted); }
.sr-tiles { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
main, .tile-actions { padding: 10px; overflow: auto; display: flex; flex-direction: column; gap: 8px; }
.tile-title h3 { margin-bottom: 2px; } .tile-title span { color: var(--ui-text-muted); font-size: 10px; }
.tile-editor-bar { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; }
.tile-editor-bar button { text-transform: capitalize; }
.tile-stage { position: relative; width: min(100%, 280px); margin: 0 auto; }
.tile-stage canvas, .pixel-grid { width: 100%; max-height: 36vh; object-fit: fill; }
.tile-stage canvas {
  display: block; image-rendering: pixelated; touch-action: none; cursor: crosshair;
  background: repeating-conic-gradient(#303139 0% 25%, #202127 0% 50%) 0 0 / 16px 16px;
}
.pixel-grid { position: absolute; inset: 0; pointer-events: none; background-image: linear-gradient(to right, #ffffff18 1px, transparent 1px), linear-gradient(to bottom, #ffffff18 1px, transparent 1px); }
.repeat-preview { height: 90px; image-rendering: pixelated; background-repeat: repeat; border: 1px solid var(--ui-border-subtle); }
.tile-actions > button { width: 100%; }
details { border: 1px solid var(--ui-border-subtle); border-radius: 4px; }
summary { cursor: pointer; padding: 8px; }
.options { padding: 4px 8px 10px; display: flex; flex-direction: column; gap: 8px; }
.atlas-section { border: 1px solid var(--ui-border-subtle); border-radius: 6px; background: var(--ui-bg-header); overflow: hidden; }
.atlas-heading { padding: 8px 10px; font-weight: 600; color: var(--ui-text-primary); }
.atlas-body { display: flex; flex-direction: column; gap: 8px; padding: 0 8px 8px; }
.atlas-viewport { height: 180px; overflow: hidden; position: relative; background: var(--ui-bg-input); touch-action: none; border-radius: 4px; border: 1px solid var(--ui-border-subtle); }
.atlas-overview { position: relative; margin: 0; transform-origin: 0 0; cursor: crosshair; background: repeating-conic-gradient(#303139 0% 25%, #202127 0% 50%) 0 0 / 12px 12px; }
.atlas-overview img { display: block; width: 100%; height: auto; image-rendering: pixelated; pointer-events: none; }
.atlas-region { position: absolute; border: 2px solid var(--ui-text-accent); background: #ffffff18; pointer-events: none; }
.selection-tools button { text-transform: capitalize; flex: 1; }
.settings-grid { display: flex; flex-direction: column; gap: 6px; }
.settings-label { font-weight: 600; color: var(--ui-text-primary); }
footer { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-top: 1px solid var(--ui-border-subtle); background: var(--ui-bg-header); flex-shrink: 0; }
footer span { flex: 1; }
.resize-handle { position: absolute; right: 0; bottom: 0; width: 16px; height: 16px; padding: 0; border: 0; background: transparent; cursor: nwse-resize; }
.resize-handle::after { content: ''; position: absolute; right: 3px; bottom: 3px; width: 9px; height: 9px; border-right: 2px solid var(--ui-text-muted); border-bottom: 2px solid var(--ui-text-muted); }
</style>
