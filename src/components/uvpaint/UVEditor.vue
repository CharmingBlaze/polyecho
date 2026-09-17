<script lang="ts">
/** Survives Paint-tab unmount so first-open framing is not reapplied. */
const uvViewSession = { fitted: false, zoom: 5, panX: 0, panY: 0 }
</script>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, watch, computed } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { useToolStore } from '../../stores/toolStore'
import { 
  sampleFaceTexelDensity,
  calculateUVDistortion,
  generateUVCheckerboardDataURL,
  ensureMeshUVs
} from '../../core/geometry/UVUnwrap'
import { selectedUvCorners, uvBounds, transformUvCorners, relaxUvCorners, uvInspectAfterSelection, uvInspectToggled, type UvCorner, type UvTransform } from '../../core/uv/UVEditing'
import BlenderIcon from '../icons/BlenderIcon.vue'
import { expandFacesToIslands, expandWeldedUvEdges, findUvIslands, stitchUvEdge } from '../../core/uv/UVIslands'
import { undirectedEdgeId } from '../../core/geometry/EdgeUtils'
import { EDITOR_EVENTS } from '../../core/commands/editorCommands'
import TextureSharePrompt from '../modals/TextureSharePrompt.vue'
import ImportTextureModal from '../modals/ImportTextureModal.vue'
import NewTextureModal from '../modals/NewTextureModal.vue'
import { useTextureApply } from '../../composables/useTextureApply'
import { saveBlobDocument } from '../../core/desktop/desktopApi'
import { resolvePixelTileGrid } from '../../core/painting/TilePixels'
import { openTileset, tilesetActiveBounds, tilesetCols, tilesetImageId, tilesetMargin, tilesetRegion, tilesetRows, tilesetSpacing, tilesetTileHeight, tilesetTileIndex, tilesetTileWidth, tilesetUseMode } from '../../composables/useTilesetWindow'

const projectStore = useProjectStore()
const toolStore = useToolStore()
const {
  isOpen: sharePromptOpen,
  sharedCount: sharePromptCount,
  applyToActiveMesh,
  confirm: confirmShareApply,
  cancel: cancelShareApply
} = useTextureApply()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const showImportModal = ref(false)
const pendingImportFile = ref<File | null>(null)

// UV Selection mode: 'vertex' | 'edge' | 'face' | 'island'
const activeDropdown = ref<string | null>(null)

function toggleDropdown(name: string) {
  activeDropdown.value = activeDropdown.value === name ? null : name
}

function closeDropdowns() {
  activeDropdown.value = null
}

const uvSelectMode = computed<'vertex' | 'edge' | 'face' | 'island'>({
  get: () => {
    if (toolStore.selectMode === 'object') return 'island'
    if (toolStore.selectMode === 'edge') return 'edge'
    if (toolStore.selectMode === 'vertex') return 'vertex'
    return 'face'
  },
  set: (val: 'vertex' | 'edge' | 'face' | 'island') => {
    if (val === 'island') toolStore.selectMode = 'object'
    else if (val === 'edge') toolStore.selectMode = 'edge'
    else if (val === 'vertex') toolStore.selectMode = 'vertex'
    else toolStore.selectMode = 'face'
  }
})

const selectedUvVerts = ref<{ faceIndex: number; vertIndex: number }[]>([])
const selectedUvEdges = ref<{ faceIndex: number; edgeIndex: number }[]>([])
const selectedFaceIndices = ref<number[]>([])
const uvDisplayTexture = computed(() => {
  const mesh = projectStore.activeMesh
  const material = mesh ? projectStore.materials.find(item => item.id === mesh.materialId) : undefined
  return projectStore.textures.find(item => item.id === material?.textureId) || projectStore.activeTexture
})
function displayPixels() {
  return uvDisplayTexture.value?.pixelBuffer || projectStore.pixelBuffer
}
function tilesetOverlayGrid(tex: { id: string; width: number; height: number; atlas?: { cols: number; rows: number; spacing?: number; margin?: number } | null }) {
  if (tilesetImageId.value === tex.id && tilesetTileWidth.value > 0 && tilesetTileHeight.value > 0) {
    return {
      cols: Math.max(1, tilesetCols.value || Math.floor(tex.width / tilesetTileWidth.value)),
      rows: Math.max(1, tilesetRows.value || Math.floor(tex.height / tilesetTileHeight.value)),
      tileW: tilesetTileWidth.value,
      tileH: tilesetTileHeight.value,
      spacing: tilesetSpacing.value,
      margin: tilesetMargin.value
    }
  }
  const grid = resolvePixelTileGrid(tex.width, tex.height, tex.atlas)
  return {
    cols: grid.cols,
    rows: grid.rows,
    tileW: Math.max(1, Math.floor(tex.width / grid.cols)),
    tileH: Math.max(1, Math.floor(tex.height / grid.rows)),
    spacing: tex.atlas?.spacing || 0,
    margin: tex.atlas?.margin || 0
  }
}
const paintAtlas = computed(() => {
  const tex = uvDisplayTexture.value || projectStore.activeTexture
  if (!tex) return { cols: 2, rows: 2 }
  const grid = tilesetOverlayGrid(tex)
  return { cols: grid.cols, rows: grid.rows }
})
const atlasMenuCells = computed(() => {
  const a = paintAtlas.value
  if (a.cols * a.rows > 64) return []
  const cells: { col: number; row: number }[] = []
  for (let row = 0; row < a.rows; row++) {
    for (let col = 0; col < a.cols; col++) cells.push({ col, row })
  }
  return cells
})
const pinnedUvKeys = ref<Set<string>>(new Set())
const hoveredIslandFaceIndices = ref<number[]>([])

const zoom = ref<number>(5)
const panOffset = ref<{ x: number; y: number }>({ x: 0, y: 0 })
const showPixelGrid = ref<boolean>(true)
const snapToPixels = ref<boolean>(true)
const showCheckerboard = ref<boolean>(false)
const showHeatmap = ref<boolean>(false)
const checkerboardImage = ref<HTMLImageElement | null>(null)

const targetTexelDensity = ref<number>(16)
const sampledDensity = ref<number | null>(null)
const smartUvAngle = computed({
  get: () => toolStore.smartUvAngle,
  set: (value: number) => { toolStore.smartUvAngle = Number.isFinite(value) ? value : 66 }
})
const smartUvMargin = computed({
  get: () => toolStore.smartUvMargin,
  set: (value: number) => { toolStore.smartUvMargin = Number.isFinite(value) ? value : 2 }
})

function handleSampleTexelDensity() {
  if (!activeMesh.value) return
  const faceIdx = selectedFaceIndices.value.length > 0 ? selectedFaceIndices.value[0] : 0
  const texSize = projectStore.activeTexture?.width || 64
  const density = sampleFaceTexelDensity(activeMesh.value, faceIdx, texSize)
  targetTexelDensity.value = density
  sampledDensity.value = density
}

function handleApplyTexelDensity() {
  if (!activeMesh.value) return
  projectStore.performApplyTexelDensity(targetTexelDensity.value, selectedFaceIndices.value.length > 0 ? selectedFaceIndices.value : undefined)
  renderCanvas()
}

function handleEqualizeTexelDensity() {
  projectStore.performEqualizeTexelDensity()
  renderCanvas()
}

const distortionMap = computed(() => {
  if (!showHeatmap.value || !activeMesh.value) return null
  return calculateUVDistortion(activeMesh.value)
})

// Touch / Multi-touch gesture tracker (Tablet / Mobile / Stylus)
const activePointers = new Map<number, { x: number; y: number }>()
let initialPinchDist = 0
let initialPinchZoom = 5
let initialPinchPan = { x: 0, y: 0 }

const isPanning = ref<boolean>(false)
let spaceHeld = false
let lastCanvasClickAt = 0
let panStart = { x: 0, y: 0 }

// Marquee Box Selection State (Blender Box Select / Ctrl+LMB Drag)
const isMarqueeSelecting = ref(false)
const marqueeStart = ref({ x: 0, y: 0 })
const marqueeEnd = ref({ x: 0, y: 0 })
const marqueeRect = computed(() => {
  const x = Math.min(marqueeStart.value.x, marqueeEnd.value.x)
  const y = Math.min(marqueeStart.value.y, marqueeEnd.value.y)
  const width = Math.abs(marqueeEnd.value.x - marqueeStart.value.x)
  const height = Math.abs(marqueeEnd.value.y - marqueeStart.value.y)
  return { x, y, width, height }
})

// Interaction state: 'none' | 'move' | 'scale_corner' | 'scale_edge' | 'rotate' | 'drag_vert' | 'drag_edge'
type DragType = 'none' | 'move' | 'scale_corner' | 'scale_edge' | 'rotate' | 'drag_vert' | 'drag_edge'
let activeDrag: DragType = 'none'
let uvDragRecorded = false
let dragStartMouse = { u: 0, v: 0, screenX: 0, screenY: 0 }
let dragStartBounds = { minU: 0, maxU: 1, minV: 0, maxV: 1, cU: 0.5, cV: 0.5, width: 1, height: 1 }
let dragStartUvs: { faceIndex: number; vertIndex: number; origU: number; origV: number }[] = []
let dragStartAngle = 0
let activeCornerHandle: number = 0
let activeEdgeHandle: 'top' | 'bottom' | 'left' | 'right' = 'top'

let hoveredHandle: 'body' | 'rotate' | 'edge-top' | 'edge-bottom' | 'edge-left' | 'edge-right' | number | null = null
let hoveredVert: { faceIndex: number; vertIndex: number } | null = null
let hoveredEdge: { faceIndex: number; edgeIndex: number } | null = null
let hoveredFaceIndex: number | null = null

const activeMesh = computed(() => projectStore.activeMesh)

// Sync selected face from 3D viewport
watch(() => projectStore.selectedFaceIds, (newVal) => {
  if (!activeMesh.value) return
  if (newVal.length > 0) {
    const indices: number[] = []
    activeMesh.value.faces.forEach((f, idx) => {
      if (newVal.includes(f.id)) indices.push(idx)
    })
    selectedFaceIndices.value = indices
  } else {
    selectedFaceIndices.value = []
  }
  renderCanvas()
}, { immediate: true })

let publishedUvVertexIds: string[] | null = null

// Sync selected vertices from 3D viewport
watch(() => projectStore.selectedVertexIds, (newVal) => {
  if (publishedUvVertexIds && newVal.length === publishedUvVertexIds.length && newVal.every(id => publishedUvVertexIds!.includes(id))) return
  if (!activeMesh.value) return
  if (newVal.length > 0) {
    const verts: { faceIndex: number; vertIndex: number }[] = []
    activeMesh.value.faces.forEach((f, fIdx) => {
      f.vertexIds.forEach((vId, vIdx) => {
        if (newVal.includes(vId)) verts.push({ faceIndex: fIdx, vertIndex: vIdx })
      })
    })
    selectedUvVerts.value = verts
  } else {
    selectedUvVerts.value = []
  }
  renderCanvas()
}, { immediate: true })

function getTargetFaces(): number[] {
  if (!activeMesh.value) return []

  if (uvSelectMode.value === 'vertex' && selectedUvVerts.value.length > 0) {
    return Array.from(new Set(selectedUvVerts.value.map(v => v.faceIndex)))
  }
  if (uvSelectMode.value === 'edge' && selectedUvEdges.value.length > 0) {
    return Array.from(new Set(selectedUvEdges.value.map(e => e.faceIndex)))
  }

  if (selectedFaceIndices.value.length > 0) {
    if (uvSelectMode.value === 'island') {
      return expandFacesToIslands(activeMesh.value, selectedFaceIndices.value)
    }
    return [...selectedFaceIndices.value]
  }

  return []
}

const uvIslandCount = computed(() => {
  if (!activeMesh.value) return 0
  return findUvIslands(activeMesh.value).length
})

const seamCount = computed(() => activeMesh.value?.seamEdgeIds?.length ?? 0)

const selectedFaceCount = computed(() => getTargetFaces().length)

function pinKey(faceIndex: number, vertIndex: number): string {
  const face = activeMesh.value?.faces[faceIndex]
  if (!face) return ''
  return `${face.id}:${face.vertexIds[vertIndex]}`
}

function isPinned(faceIndex: number, vertIndex: number): boolean {
  return pinnedUvKeys.value.has(pinKey(faceIndex, vertIndex))
}

function commitUvEdgeSelection(edges: { faceIndex: number; edgeIndex: number }[], additive: boolean) {
  if (!activeMesh.value) return
  const expanded = expandWeldedUvEdges(activeMesh.value, edges)
  if (additive) {
    const merged = [...selectedUvEdges.value]
    const seen = new Set(merged.map(e => `${e.faceIndex}:${e.edgeIndex}`))
    for (const e of expanded) {
      const key = `${e.faceIndex}:${e.edgeIndex}`
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(e)
    }
    selectedUvEdges.value = merged
  } else {
    selectedUvEdges.value = expanded
  }
  syncEdgesTo3D()
}

function publishUvHover(faceIndex: number | null) {
  if (faceIndex === null || !activeMesh.value) {
    hoveredIslandFaceIndices.value = []
    toolStore.setUvHoverFaceIds([])
    return
  }
  const faces = expandFacesToIslands(activeMesh.value, [faceIndex])
  hoveredIslandFaceIndices.value = faces
  toolStore.setUvHoverFaceIds(faces.map(i => activeMesh.value!.faces[i]?.id).filter(Boolean))
}

function selectIslandFromFace(faceIndex: number, additive: boolean) {
  if (!activeMesh.value) return
  const island = expandFacesToIslands(activeMesh.value, [faceIndex])
  if (additive) {
    selectedFaceIndices.value = Array.from(new Set([...selectedFaceIndices.value, ...island]))
  } else {
    selectedFaceIndices.value = island
  }
  syncFacesTo3D()
}

// Compute Bounding Box of Active Selection (Supports unconstrained / negative UV space)
const targetCorners = computed(() => activeMesh.value ? selectedUvCorners(activeMesh.value, uvSelectMode.value,
  selectedFaceIndices.value, selectedUvVerts.value, selectedUvEdges.value) : [])
const selectionBounds = computed(() => activeMesh.value ? uvBounds(activeMesh.value, targetCorners.value) : null)
const showPrecision = ref(false)
const inspectDismissed = ref(false)
const precisionTab = ref<'selection' | 'transform' | 'tools'>('selection')
const coordinateUnits = ref<'pixels' | 'uv'>('pixels')
const pivotMode = ref<'selection' | 'islands' | 'tile'>('selection')
const moveU = ref(0), moveV = ref(0), rotateAngle = ref(90), scaleU = ref(1), scaleV = ref(1)
const lockScale = ref(true)
const uvFeedback = ref('')
const textureSize = computed(() => {
  const pb = displayPixels()
  return { width: pb.width, height: pb.height }
})
const unitU = computed(() => coordinateUnits.value === 'pixels' ? textureSize.value.width : 1)
const unitV = computed(() => coordinateUnits.value === 'pixels' ? textureSize.value.height : 1)
const outsideFaces = computed(() => activeMesh.value?.faces.flatMap((f, i) => f.uvs.some(p => p.u < -1e-7 || p.u > 1 + 1e-7 || p.v < -1e-7 || p.v > 1 + 1e-7) ? [i] : []) ?? [])
const degenerateFaces = computed(() => activeMesh.value?.faces.flatMap((f, i) => {
  const area = f.uvs.reduce((sum, p, j) => { const q = f.uvs[(j + 1) % f.uvs.length]; return sum + p.u * q.v - q.u * p.v }, 0)
  return Math.abs(area) < 1e-10 ? [i] : []
}) ?? [])
function commitCornerEdits(label: string, edits: (UvCorner & { u: number; v: number })[]) {
  const mesh = activeMesh.value
  if (!mesh) return
  const changes = edits.filter(c => {
    const p = mesh.faces[c.faceIndex]?.uvs[c.vertIndex]
    return p && !isPinned(c.faceIndex, c.vertIndex) && Number.isFinite(c.u) && Number.isFinite(c.v) && (Math.abs(p.u - c.u) > 1e-12 || Math.abs(p.v - c.v) > 1e-12)
  })
  if (!changes.length) { uvFeedback.value = 'No UVs changed. Check selection and pins.'; return }
  projectStore.recordState(label)
  for (const c of changes) Object.assign(mesh.faces[c.faceIndex].uvs[c.vertIndex], { u: c.u, v: c.v })
  projectStore.markGeometryUpdated()
  uvFeedback.value = `${label} · ${changes.length} ${changes.length === 1 ? 'corner' : 'corners'}`
  scheduleRender()
}
function precisionTransform(options: Partial<UvTransform>, label = 'Transform UVs') {
  if (!activeMesh.value) return
  commitCornerEdits(label, transformUvCorners(activeMesh.value, targetCorners.value,
    { ...textureSize.value, pivot: pivotMode.value, ...options }, c => isPinned(c.faceIndex, c.vertIndex)))
}
function toggleInspect() {
  const next = uvInspectToggled(showPrecision.value)
  showPrecision.value = next.showPrecision
  inspectDismissed.value = next.inspectDismissed
}
function moveSelection() { precisionTransform({ moveU: Number(moveU.value) / unitU.value, moveV: Number(moveV.value) / unitV.value }, 'Move UVs') }
function resizeSelection() { precisionTransform({ scaleU: Number(scaleU.value), scaleV: Number(lockScale.value ? scaleU.value : scaleV.value) }, 'Scale UVs') }
function setSelectionCoordinate(axis: 'u' | 'v', event: Event) {
  const value = Number((event.target as HTMLInputElement).value), b = selectionBounds.value
  if (!b || !Number.isFinite(value)) return
  precisionTransform(axis === 'u' ? { moveU: value / unitU.value - b.minU } : { moveV: value / unitV.value - b.minV }, 'Position UVs')
}
function setSelectionSize(axis: 'u' | 'v', event: Event) {
  const value = Number((event.target as HTMLInputElement).value), b = selectionBounds.value
  if (!b || !Number.isFinite(value) || value <= 0) return
  const extent = axis === 'u' ? b.width : b.height
  if (extent < 1e-10) { uvFeedback.value = 'A zero-width selection cannot be resized on that axis.'; return }
  const factor = value / (axis === 'u' ? unitU.value : unitV.value) / extent
  precisionTransform(lockScale.value ? { scaleU: factor, scaleV: factor } : axis === 'u' ? { scaleU: factor } : { scaleV: factor }, 'Resize UVs')
}
function snapSelectionPixels() {
  if (!activeMesh.value) return
  const { width, height } = textureSize.value
  commitCornerEdits('Snap UVs to pixels', targetCorners.value.map(c => {
    const p = activeMesh.value!.faces[c.faceIndex].uvs[c.vertIndex]
    return { ...c, u: Math.round(p.u * width) / width, v: Math.round(p.v * height) / height }
  }))
}
function relaxSelection() {
  if (!activeMesh.value) return
  commitCornerEdits('Relax UV interiors', relaxUvCorners(activeMesh.value, targetCorners.value, 20, c => isPinned(c.faceIndex, c.vertIndex)))
}
function selectDiagnostic(faces: number[]) {
  uvSelectMode.value = 'face'
  selectedFaceIndices.value = [...faces]
  syncFacesTo3D()
  frameSelection()
}
function selectLinked() {
  if (!activeMesh.value) return
  const faces = getTargetFaces()
  if (!faces.length) return
  selectedFaceIndices.value = expandFacesToIslands(activeMesh.value, faces)
  uvSelectMode.value = 'island'
  syncFacesTo3D()
  scheduleRender()
}
async function exportUvLayout() {
  if (!activeMesh.value) return
  const { width, height } = textureSize.value
  const polygons = activeMesh.value.faces.map(f => `<polygon points="${f.uvs.map(p => `${p.u * width},${(1 - p.v) * height}`).join(' ')}"/>`).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g fill="none" stroke="#000000" stroke-width="0.5" stroke-linejoin="round">${polygons}</g></svg>`
  try {
    await saveBlobDocument(new Blob([svg], { type: 'image/svg+xml' }), `${activeMesh.value.name}-uv-layout.svg`, [{ name: 'UV Layout', extensions: ['svg'] }])
  } catch { uvFeedback.value = 'Could not export the UV layout. Please try again.' }
}

// ----------------------------------------------------
// COORDINATE CONVERSIONS (Infinite Staging Canvas)
// ----------------------------------------------------
function uvToScreen(u: number, v: number): { x: number; y: number } {
  const pb = displayPixels()
  const texW = pb.width * zoom.value
  const texH = pb.height * zoom.value
  return {
    x: panOffset.value.x + u * texW,
    y: panOffset.value.y + (1 - v) * texH
  }
}

function screenToUV(screenX: number, screenY: number, snap = false): { u: number; v: number } {
  const pb = displayPixels()
  const texW = pb.width * zoom.value
  const texH = pb.height * zoom.value
  let u = (screenX - panOffset.value.x) / texW
  let v = 1 - (screenY - panOffset.value.y) / texH

  if (snap && snapToPixels.value) {
    const snapGridU = 1 / pb.width
    const snapGridV = 1 / pb.height
    u = Math.round(u / snapGridU) * snapGridU
    v = Math.round(v / snapGridV) * snapGridV
  }

  return { u, v }
}

// ----------------------------------------------------
// SMART RAF CANVAS RENDERING (Zero dropped frames, 60fps)
// ----------------------------------------------------
let renderPending = false
let renderRafId: number | null = null
function scheduleRender() {
  if (renderPending) return
  renderPending = true
  renderRafId = requestAnimationFrame(() => {
    renderRafId = null
    renderPending = false
    renderCanvas()
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

  const pb = displayPixels()

  // If panOffset hasn't been initialized
  if (panOffset.value.x === 0 && panOffset.value.y === 0) {
    panOffset.value = {
      x: Math.max(16, (w - pb.width * zoom.value) / 2),
      y: Math.max(16, (h - pb.height * zoom.value) / 2)
    }
  }

  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const texW = pb.width * zoom.value
  const texH = pb.height * zoom.value
  const ox = panOffset.value.x
  const oy = panOffset.value.y

  // 1. Draw Infinite Staging Yard
  ctx.fillStyle = '#0b0d12'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Staging Subtle Grid
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)'
  ctx.lineWidth = 1
  const stageGridSize = 32
  for (let x = (ox % stageGridSize); x < canvas.width; x += stageGridSize) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke()
  }
  for (let y = (oy % stageGridSize); y < canvas.height; y += stageGridSize) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke()
  }

  // 2. Mesh atlas in pixel space — nearest neighbor, no shadow (ViperCAD-style)
  ctx.imageSmoothingEnabled = false
  if (showCheckerboard.value && checkerboardImage.value) {
    ctx.drawImage(checkerboardImage.value, ox, oy, texW, texH)
  } else {
    ctx.drawImage(pb.canvas, ox, oy, texW, texH)
  }

  // 0..1 Texture Frame
  ctx.strokeStyle = '#4f46e5'
  ctx.lineWidth = 1.5
  ctx.strokeRect(ox, oy, texW, texH)

  const sessionTex = uvDisplayTexture.value || projectStore.activeTexture
  const atlasGrid = sessionTex ? tilesetOverlayGrid(sessionTex) : null
  if (atlasGrid && (atlasGrid.cols > 1 || atlasGrid.rows > 1)) {
    ctx.save()
    ctx.setLineDash([])
    ctx.strokeStyle = 'rgba(180, 205, 235, 0.28)'
    ctx.lineWidth = 1
    const strideX = atlasGrid.tileW + atlasGrid.spacing
    const strideY = atlasGrid.tileH + atlasGrid.spacing
    const cw = (atlasGrid.tileW / pb.width) * texW
    const ch = (atlasGrid.tileH / pb.height) * texH
    for (let row = 0; row < atlasGrid.rows; row++) {
      for (let col = 0; col < atlasGrid.cols; col++) {
        const px = ox + ((atlasGrid.margin + col * strideX) / pb.width) * texW
        const py = oy + ((atlasGrid.margin + row * strideY) / pb.height) * texH
        ctx.strokeRect(px + 0.5, py + 0.5, Math.max(1, cw - 1), Math.max(1, ch - 1))
      }
    }
    ctx.restore()
  }

  if (sessionTex && tilesetImageId.value === sessionTex.id) {
    const grid = tilesetOverlayGrid(sessionTex)
    const cell = tilesetActiveBounds(sessionTex.width, sessionTex.height, grid.cols, grid.rows)
    const x = ox + (cell.x / sessionTex.width) * texW
    const y = oy + (cell.y / sessionTex.height) * texH
    const w = (cell.width / sessionTex.width) * texW
    const h = (cell.height / sessionTex.height) * texH
    ctx.save()
    ctx.fillStyle = 'rgba(251, 191, 36, 0.12)'
    ctx.fillRect(x, y, w, h)
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.95)'
    ctx.lineWidth = 2
    ctx.strokeRect(x + 0.5, y + 0.5, Math.max(1, w - 1), Math.max(1, h - 1))
    ctx.restore()
  }

  // 3. Pixel Grid inside Texture
  if (showPixelGrid.value && zoom.value >= 4) {
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

  // 3.5 Draw Inactive Selected Meshes (Multi-Mesh UV Atlas Visualization)
  projectStore.meshes.forEach(otherMesh => {
    if (otherMesh.id === activeMesh.value?.id || !otherMesh.visible) return
    if (!projectStore.selectedMeshIds.includes(otherMesh.id)) return

    otherMesh.faces.forEach(face => {
      if (!face.uvs || face.uvs.length < 3) return
      ctx.beginPath()
      const p0 = uvToScreen(face.uvs[0].u, face.uvs[0].v)
      ctx.moveTo(p0.x, p0.y)
      for (let i = 1; i < face.uvs.length; i++) {
        const pt = uvToScreen(face.uvs[i].u, face.uvs[i].v)
        ctx.lineTo(pt.x, pt.y)
      }
      ctx.closePath()
      ctx.fillStyle = 'rgba(168, 85, 247, 0.08)'
      ctx.strokeStyle = 'rgba(168, 85, 247, 0.45)'
      ctx.lineWidth = 1
      ctx.fill()
      ctx.stroke()
    })
  })

  // 4. Draw Active Mesh UV Faces & Edges & Vertices
  if (activeMesh.value) {
    activeMesh.value.faces.forEach((face, fIdx) => {
      if (face.uvs.length < 3) return

      const isFaceSelected = selectedFaceIndices.value.includes(fIdx)
      const isHovered = hoveredIslandFaceIndices.value.includes(fIdx)

      // Polygon Face
      ctx.beginPath()
      const p0 = uvToScreen(face.uvs[0].u, face.uvs[0].v)
      ctx.moveTo(p0.x, p0.y)
      for (let i = 1; i < face.uvs.length; i++) {
        const pt = uvToScreen(face.uvs[i].u, face.uvs[i].v)
        ctx.lineTo(pt.x, pt.y)
      }
      ctx.closePath()

      if (showHeatmap.value && distortionMap.value?.has(face.id)) {
        ctx.fillStyle = distortionMap.value.get(face.id)!.color
        ctx.strokeStyle = isFaceSelected ? '#f59e0b' : '#38bdf8'
        ctx.lineWidth = isFaceSelected ? 2 : 1
      } else if (isFaceSelected) {
        ctx.fillStyle = 'rgba(245, 158, 11, 0.12)'
        ctx.strokeStyle = '#f59e0b'
        ctx.lineWidth = 1.5
      } else if (isHovered) {
        ctx.fillStyle = 'rgba(254, 240, 138, 0.08)'
        ctx.strokeStyle = '#fbbf24'
        ctx.lineWidth = 1.5
      } else {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.04)'
        ctx.strokeStyle = 'rgba(14, 165, 233, 0.7)'
        ctx.lineWidth = 1
      }
      ctx.fill()
      ctx.stroke()

      // Edge Mode Highlighting
      if (uvSelectMode.value === 'edge') {
        for (let eIdx = 0; eIdx < face.uvs.length; eIdx++) {
          const uvA = face.uvs[eIdx]
          const uvB = face.uvs[(eIdx + 1) % face.uvs.length]
          const ptA = uvToScreen(uvA.u, uvA.v)
          const ptB = uvToScreen(uvB.u, uvB.v)

          const isEdgeSelected = selectedUvEdges.value.some(se => se.faceIndex === fIdx && se.edgeIndex === eIdx)
          const isEdgeHovered = hoveredEdge?.faceIndex === fIdx && hoveredEdge?.edgeIndex === eIdx

          if (isEdgeSelected || isEdgeHovered) {
            ctx.beginPath()
            ctx.moveTo(ptA.x, ptA.y)
            ctx.lineTo(ptB.x, ptB.y)
            ctx.strokeStyle = isEdgeSelected ? '#f59e0b' : '#fef08a'
            ctx.lineWidth = isEdgeHovered ? 4 : 3
            if (isEdgeHovered) {
              ctx.shadowColor = '#fef08a'
              ctx.shadowBlur = 6
            }
            ctx.stroke()
            ctx.shadowBlur = 0
          }
        }
      }

      // Vertex Mode Corner Points
      if (uvSelectMode.value === 'vertex') {
        face.uvs.forEach((uv, vIdx) => {
          const pt = uvToScreen(uv.u, uv.v)
          const isVertSelected = selectedUvVerts.value.some(sv => sv.faceIndex === fIdx && sv.vertIndex === vIdx)
          const isVertHovered = hoveredVert?.faceIndex === fIdx && hoveredVert?.vertIndex === vIdx

          ctx.beginPath()
          const radius = isVertHovered ? 6 : isVertSelected ? 5 : 3.5
          ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2)
          ctx.fillStyle = isVertHovered ? '#fef08a' : isVertSelected ? '#f59e0b' : '#06b6d4'
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = isVertHovered ? 2 : 1.2
          if (isVertHovered) {
            ctx.shadowColor = '#fef08a'
            ctx.shadowBlur = 8
          }
          ctx.fill()
          ctx.stroke()
          ctx.shadowBlur = 0
        })
      }

      face.uvs.forEach((uv, vIdx) => {
        if (!isPinned(fIdx, vIdx)) return
        const pt = uvToScreen(uv.u, uv.v)
        ctx.beginPath()
        ctx.moveTo(pt.x, pt.y - 6)
        ctx.lineTo(pt.x + 5, pt.y)
        ctx.lineTo(pt.x, pt.y + 6)
        ctx.lineTo(pt.x - 5, pt.y)
        ctx.closePath()
        ctx.fillStyle = '#f472b6'
        ctx.strokeStyle = '#831843'
        ctx.lineWidth = 1.2
        ctx.fill()
        ctx.stroke()
      })
    })

    const seamSet = new Set(activeMesh.value.seamEdgeIds || [])
    if (seamSet.size > 0) {
      ctx.save()
      ctx.strokeStyle = '#ef4444'
      ctx.lineWidth = 2.25
      ctx.lineCap = 'round'
      activeMesh.value.faces.forEach(face => {
        if (face.uvs.length < 2) return
        const n = face.vertexIds.length
        for (let eIdx = 0; eIdx < n; eIdx++) {
          const a = face.vertexIds[eIdx]
          const b = face.vertexIds[(eIdx + 1) % n]
          if (!a || !b || !seamSet.has(undirectedEdgeId(a, b))) continue
          const uvA = face.uvs[eIdx]
          const uvB = face.uvs[(eIdx + 1) % face.uvs.length]
          if (!uvA || !uvB) continue
          const ptA = uvToScreen(uvA.u, uvA.v)
          const ptB = uvToScreen(uvB.u, uvB.v)
          ctx.beginPath()
          ctx.moveTo(ptA.x, ptA.y)
          ctx.lineTo(ptB.x, ptB.y)
          ctx.stroke()
        }
      })
      ctx.restore()
    }

    // 5. Draw 8-Point Bounding Box Transform Gizmo (Face / Island Mode)
    const b = selectionBounds.value
    if (b && (uvSelectMode.value === 'face' || uvSelectMode.value === 'island')) {
      const tl = uvToScreen(b.minU, b.maxV)
      const tr = uvToScreen(b.maxU, b.maxV)
      const br = uvToScreen(b.maxU, b.minV)
      const bl = uvToScreen(b.minU, b.minV)
      const center = uvToScreen(b.cU, b.cV)

      const bw = tr.x - tl.x
      const bh = br.y - tr.y

      // Box outline
      ctx.strokeStyle = '#f59e0b'
      ctx.lineWidth = 1.5
      ctx.strokeRect(tl.x, tl.y, bw, bh)

      // Center crosshair
      ctx.beginPath(); ctx.arc(center.x, center.y, 3, 0, Math.PI * 2)
      ctx.fillStyle = '#f59e0b'; ctx.fill()

      // 4 Corner Handles
      const corners = [tl, tr, br, bl]
      corners.forEach((c, idx) => {
        const isHov = hoveredHandle === idx
        const size = isHov ? 10 : 8
        ctx.fillStyle = isHov ? '#fef08a' : '#f59e0b'
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = isHov ? 1.8 : 1.2
        if (isHov) {
          ctx.shadowColor = '#fef08a'
          ctx.shadowBlur = 8
        }
        ctx.fillRect(c.x - size / 2, c.y - size / 2, size, size)
        ctx.strokeRect(c.x - size / 2, c.y - size / 2, size, size)
        ctx.shadowBlur = 0
      })

      // 4 Edge Midpoint Handles
      const edges = [
        { name: 'edge-top', x: (tl.x + tr.x) / 2, y: tl.y },
        { name: 'edge-bottom', x: (bl.x + br.x) / 2, y: bl.y },
        { name: 'edge-left', x: tl.x, y: (tl.y + bl.y) / 2 },
        { name: 'edge-right', x: tr.x, y: (tr.y + br.y) / 2 }
      ]
      edges.forEach(e => {
        const isHov = hoveredHandle === e.name
        const size = isHov ? 8 : 6
        ctx.fillStyle = isHov ? '#fef08a' : '#f59e0b'
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = isHov ? 1.5 : 1
        if (isHov) {
          ctx.shadowColor = '#fef08a'
          ctx.shadowBlur = 6
        }
        ctx.fillRect(e.x - size / 2, e.y - size / 2, size, size)
        ctx.strokeRect(e.x - size / 2, e.y - size / 2, size, size)
        ctx.shadowBlur = 0
      })

      // Top Rotation Handle
      const rotY = tl.y - 20
      const isRotHov = hoveredHandle === 'rotate'
      ctx.beginPath()
      ctx.moveTo(center.x, tl.y)
      ctx.lineTo(center.x, rotY)
      ctx.strokeStyle = '#f59e0b'
      ctx.lineWidth = 1.5
      ctx.stroke()

      ctx.beginPath()
      ctx.arc(center.x, rotY, isRotHov ? 6 : 4.5, 0, Math.PI * 2)
      ctx.fillStyle = isRotHov ? '#fef08a' : '#f59e0b'
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = isRotHov ? 2 : 1.2
      if (isRotHov) {
        ctx.shadowColor = '#fef08a'
        ctx.shadowBlur = 8
      }
      ctx.fill()
      ctx.stroke()
      ctx.shadowBlur = 0
    }
  }

  // Draw Perforated Marquee Selection Box (Marching Ants / Dashed Outline)
  if (isMarqueeSelecting.value && marqueeRect.value.width > 2 && marqueeRect.value.height > 2) {
    ctx.save()
    ctx.setLineDash([4, 3])
    ctx.fillStyle = 'rgba(245, 158, 11, 0.14)'
    ctx.strokeStyle = '#f59e0b'
    ctx.lineWidth = 1.5
    ctx.fillRect(marqueeRect.value.x, marqueeRect.value.y, marqueeRect.value.width, marqueeRect.value.height)
    ctx.strokeRect(marqueeRect.value.x, marqueeRect.value.y, marqueeRect.value.width, marqueeRect.value.height)
    ctx.restore()
  }
}

// ----------------------------------------------------
// INTERACTION & HIT TESTING
// ----------------------------------------------------
function checkGizmoHit(screenX: number, screenY: number): any {
  const b = selectionBounds.value
  if (!b) return null

  const tl = uvToScreen(b.minU, b.maxV)
  const tr = uvToScreen(b.maxU, b.maxV)
  const br = uvToScreen(b.maxU, b.minV)
  const bl = uvToScreen(b.minU, b.minV)
  const center = uvToScreen(b.cU, b.cV)

  // Rotation handle
  const rotY = tl.y - 20
  if (Math.hypot(screenX - center.x, screenY - rotY) <= 8) return 'rotate'

  // Corner handles
  const corners = [tl, tr, br, bl]
  for (let i = 0; i < 4; i++) {
    if (Math.abs(screenX - corners[i].x) <= 6 && Math.abs(screenY - corners[i].y) <= 6) return i
  }

  // Edge handles
  if (Math.abs(screenX - (tl.x + tr.x) / 2) <= 5 && Math.abs(screenY - tl.y) <= 5) return 'edge-top'
  if (Math.abs(screenX - (bl.x + br.x) / 2) <= 5 && Math.abs(screenY - bl.y) <= 5) return 'edge-bottom'
  if (Math.abs(screenX - tl.x) <= 5 && Math.abs(screenY - (tl.y + bl.y) / 2) <= 5) return 'edge-left'
  if (Math.abs(screenX - tr.x) <= 5 && Math.abs(screenY - (tr.y + br.y) / 2) <= 5) return 'edge-right'

  // Inside box
  if (screenX >= tl.x && screenX <= tr.x && screenY >= tl.y && screenY <= br.y) return 'body'

  return null
}

function findClickedFace(u: number, v: number): number | null {
  if (!activeMesh.value) return null
  for (let fIdx = activeMesh.value.faces.length - 1; fIdx >= 0; fIdx--) {
    const face = activeMesh.value.faces[fIdx]
    if (face.uvs.length < 3) continue
    if (pointInPolygon(u, v, face.uvs)) return fIdx
  }
  return null
}

function findClickedVertex(screenX: number, screenY: number): { faceIndex: number; vertIndex: number } | null {
  if (!activeMesh.value) return null
  for (let fIdx = 0; fIdx < activeMesh.value.faces.length; fIdx++) {
    const face = activeMesh.value.faces[fIdx]
    for (let vIdx = 0; vIdx < face.uvs.length; vIdx++) {
      const pt = uvToScreen(face.uvs[vIdx].u, face.uvs[vIdx].v)
      if (Math.hypot(screenX - pt.x, screenY - pt.y) <= 8) {
        return { faceIndex: fIdx, vertIndex: vIdx }
      }
    }
  }
  return null
}

function findClickedEdge(screenX: number, screenY: number): { faceIndex: number; edgeIndex: number } | null {
  if (!activeMesh.value) return null
  for (let fIdx = 0; fIdx < activeMesh.value.faces.length; fIdx++) {
    const face = activeMesh.value.faces[fIdx]
    for (let eIdx = 0; eIdx < face.uvs.length; eIdx++) {
      const ptA = uvToScreen(face.uvs[eIdx].u, face.uvs[eIdx].v)
      const ptB = uvToScreen(face.uvs[(eIdx + 1) % face.uvs.length].u, face.uvs[(eIdx + 1) % face.uvs.length].v)
      if (distToSegment(screenX, screenY, ptA.x, ptA.y, ptB.x, ptB.y) <= 6) {
        return { faceIndex: fIdx, edgeIndex: eIdx }
      }
    }
  }
  return null
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2
  if (l2 === 0) return Math.hypot(px - x1, py - y1)
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)))
}

function pointInPolygon(u: number, v: number, uvs: { u: number; v: number }[]): boolean {
  let inside = false
  for (let i = 0, j = uvs.length - 1; i < uvs.length; j = i++) {
    const xi = uvs[i].u, yi = uvs[i].v
    const xj = uvs[j].u, yj = uvs[j].v
    const intersect = ((yi > v) !== (yj > v)) && (u < (xj - xi) * (v - yi) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

// ----------------------------------------------------
// POINTER & TOUCH GESTURE HANDLERS (Desktop, Laptop, Tablet, Stylus)
// ----------------------------------------------------
function onPointerDown(e: PointerEvent) {
  (e.target as HTMLElement)?.setPointerCapture?.(e.pointerId)
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

  // Two-Finger Pinch / Pan (Touchscreen / Tablet)
  if (activePointers.size === 2) {
    const pts = Array.from(activePointers.values())
    initialPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
    initialPinchZoom = zoom.value
    initialPinchPan = { ...panOffset.value }
    panStart = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }
    return
  }

  // Middle-Click, Right-Click, Space/Alt+Click -> Pan
  if (e.button === 1 || e.button === 2 || e.altKey || spaceHeld) {
    isPanning.value = true
    panStart = { x: e.clientX - panOffset.value.x, y: e.clientY - panOffset.value.y }
    return
  }

  if (e.button !== 0) return

  const now = Date.now()
  if (now - lastCanvasClickAt < 280) {
    lastCanvasClickAt = 0
    frameSelection()
    return
  }
  lastCanvasClickAt = now

  const rect = canvasRef.value!.getBoundingClientRect()
  const sx = e.clientX - rect.left
  const sy = e.clientY - rect.top
  const uv = screenToUV(sx, sy)

  dragStartMouse = { u: uv.u, v: uv.v, screenX: sx, screenY: sy }
  uvDragRecorded = false

  // 1. Vertex Mode Selection
  if (uvSelectMode.value === 'vertex') {
    const vert = findClickedVertex(sx, sy)
    if (vert) {
      if (e.shiftKey) {
        const existIdx = selectedUvVerts.value.findIndex(v => v.faceIndex === vert.faceIndex && v.vertIndex === vert.vertIndex)
        if (existIdx >= 0) selectedUvVerts.value.splice(existIdx, 1)
        else selectedUvVerts.value.push(vert)
      } else {
        const isAlreadySelected = selectedUvVerts.value.some(v => v.faceIndex === vert.faceIndex && v.vertIndex === vert.vertIndex)
        if (!isAlreadySelected) selectedUvVerts.value = [vert]
      }
      syncVerticesTo3D()
      activeDrag = 'drag_vert'
      recordDragStartUVs()
      renderCanvas()
      return
    }
  }

  // 2. Edge Mode Selection
  if (uvSelectMode.value === 'edge') {
    const edge = findClickedEdge(sx, sy)
    if (edge) {
      if (e.shiftKey) {
        const existIdx = selectedUvEdges.value.findIndex(se => se.faceIndex === edge.faceIndex && se.edgeIndex === edge.edgeIndex)
        if (existIdx >= 0) {
          selectedUvEdges.value.splice(existIdx, 1)
          syncEdgesTo3D()
        } else {
          commitUvEdgeSelection([edge], true)
        }
      } else {
        commitUvEdgeSelection([edge], false)
      }
      if (!e.shiftKey || selectedUvEdges.value.length > 0) {
        activeDrag = 'drag_edge'
        recordDragStartUVs()
      }
      renderCanvas()
      return
    }
  }

  // 3. Face / Island Gizmo Hit Check
  if (uvSelectMode.value === 'face' || uvSelectMode.value === 'island') {
    const hit = checkGizmoHit(sx, sy)
    if (hit !== null) {
      recordDragStartUVs()
      const b = selectionBounds.value!
      dragStartBounds = { ...b }

      if (hit === 'rotate') {
        activeDrag = 'rotate'
        const center = uvToScreen(b.cU, b.cV)
        dragStartAngle = Math.atan2(sy - center.y, sx - center.x)
      } else if (typeof hit === 'number') {
        activeDrag = 'scale_corner'
        activeCornerHandle = hit
      } else if (typeof hit === 'string' && hit.startsWith('edge-')) {
        activeDrag = 'scale_edge'
        activeEdgeHandle = hit.replace('edge-', '') as any
      } else if (hit === 'body') {
        activeDrag = 'move'
      }
      return
    }
  }

  // 4. Face / island click
  const clickedFace = findClickedFace(uv.u, uv.v)
  if (clickedFace !== null && !e.ctrlKey && (uvSelectMode.value === 'face' || uvSelectMode.value === 'island')) {
    if (uvSelectMode.value === 'island') {
      selectIslandFromFace(clickedFace, e.shiftKey)
    } else if (e.shiftKey) {
      const idx = selectedFaceIndices.value.indexOf(clickedFace)
      if (idx >= 0) selectedFaceIndices.value.splice(idx, 1)
      else selectedFaceIndices.value.push(clickedFace)
      syncFacesTo3D()
    } else {
      selectedFaceIndices.value = [clickedFace]
      syncFacesTo3D()
    }

    recordDragStartUVs()
    const b = selectionBounds.value
    if (b) dragStartBounds = { ...b }
    activeDrag = 'move'
    renderCanvas()
    return
  }

  // 5. Empty Canvas or Ctrl+LMB Drag -> Marquee Box Selection
  if (e.button === 0) {
    isMarqueeSelecting.value = true
    marqueeStart.value = { x: sx, y: sy }
    marqueeEnd.value = { x: sx, y: sy }
    renderCanvas()
  }
}

function onPointerMove(e: PointerEvent) {
  if (activePointers.has(e.pointerId)) {
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  }

  // Two-Finger Pinch Zoom & Pan
  if (activePointers.size === 2) {
    const pts = Array.from(activePointers.values())
    const curDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
    if (initialPinchDist > 0) {
      const scale = curDist / initialPinchDist
      zoom.value = Math.max(1, Math.min(24, Math.round(initialPinchZoom * scale)))
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

  if (isPanning.value) {
    panOffset.value = {
      x: e.clientX - panStart.x,
      y: e.clientY - panStart.y
    }
    renderCanvas()
    return
  }

  const rect = canvasRef.value!.getBoundingClientRect()
  const sx = e.clientX - rect.left
  const sy = e.clientY - rect.top

  if (isMarqueeSelecting.value) {
    marqueeEnd.value = { x: sx, y: sy }
    renderCanvas()
    return
  }

  const uv = screenToUV(sx, sy)

  if (activeDrag === 'none') {
    hoveredHandle = checkGizmoHit(sx, sy)
    hoveredVert = uvSelectMode.value === 'vertex' ? findClickedVertex(sx, sy) : null
    hoveredEdge = uvSelectMode.value === 'edge' ? findClickedEdge(sx, sy) : null
    hoveredFaceIndex = findClickedFace(uv.u, uv.v)
    if (uvSelectMode.value === 'edge') {
      if (hoveredEdge && activeMesh.value) {
        const faces = [...new Set(expandWeldedUvEdges(activeMesh.value, [hoveredEdge]).map(e => e.faceIndex))]
        hoveredIslandFaceIndices.value = faces
        toolStore.setUvHoverFaceIds(faces.map(i => activeMesh.value!.faces[i]?.id).filter(Boolean))
      } else {
        publishUvHover(null)
      }
    } else {
      publishUvHover(hoveredFaceIndex)
    }
    renderCanvas()
    return
  }

  if (!uvDragRecorded) {
    projectStore.recordState('UV Transform Edit')
    uvDragRecorded = true
  }

  // Move Selected Faces
  if (activeDrag === 'move') {
    const rawU = uv.u - dragStartMouse.u, rawV = uv.v - dragStartMouse.v
    const deltaU = snapToPixels.value ? Math.round(rawU * textureSize.value.width) / textureSize.value.width : rawU
    const deltaV = snapToPixels.value ? Math.round(rawV * textureSize.value.height) / textureSize.value.height : rawV
    applyUVTransform((origU, origV) => ({
      u: origU + deltaU,
      v: origV + deltaV
    }))
  }

  // Drag UV Vertices
  else if (activeDrag === 'drag_vert') {
    const rawU = uv.u - dragStartMouse.u, rawV = uv.v - dragStartMouse.v
    const deltaU = snapToPixels.value ? Math.round(rawU * textureSize.value.width) / textureSize.value.width : rawU
    const deltaV = snapToPixels.value ? Math.round(rawV * textureSize.value.height) / textureSize.value.height : rawV
    if (!activeMesh.value) return
    selectedUvVerts.value.forEach(sv => {
      if (isPinned(sv.faceIndex, sv.vertIndex)) return
      const face = activeMesh.value!.faces[sv.faceIndex]
      const orig = dragStartUvs.find(d => d.faceIndex === sv.faceIndex && d.vertIndex === sv.vertIndex)
      if (face && orig && face.uvs[sv.vertIndex]) {
        face.uvs[sv.vertIndex].u = orig.origU + deltaU
        face.uvs[sv.vertIndex].v = orig.origV + deltaV
      }
    })
    projectStore.markGeometryUpdated()
    renderCanvas()
  }

  // Drag UV Edges
  else if (activeDrag === 'drag_edge') {
    const rawU = uv.u - dragStartMouse.u, rawV = uv.v - dragStartMouse.v
    const deltaU = snapToPixels.value ? Math.round(rawU * textureSize.value.width) / textureSize.value.width : rawU
    const deltaV = snapToPixels.value ? Math.round(rawV * textureSize.value.height) / textureSize.value.height : rawV
    if (!activeMesh.value) return
    selectedUvEdges.value.forEach(se => {
      const face = activeMesh.value!.faces[se.faceIndex]
      if (face) {
        const v1Idx = se.edgeIndex
        const v2Idx = (se.edgeIndex + 1) % face.uvs.length
        const orig1 = dragStartUvs.find(d => d.faceIndex === se.faceIndex && d.vertIndex === v1Idx)
        const orig2 = dragStartUvs.find(d => d.faceIndex === se.faceIndex && d.vertIndex === v2Idx)
        if (orig1 && face.uvs[v1Idx] && !isPinned(se.faceIndex, v1Idx)) {
          face.uvs[v1Idx].u = orig1.origU + deltaU
          face.uvs[v1Idx].v = orig1.origV + deltaV
        }
        if (orig2 && face.uvs[v2Idx] && !isPinned(se.faceIndex, v2Idx)) {
          face.uvs[v2Idx].u = orig2.origU + deltaU
          face.uvs[v2Idx].v = orig2.origV + deltaV
        }
      }
    })
    projectStore.markGeometryUpdated()
    renderCanvas()
  }

  // Scale Corners (Anchored at opposite corner, or center if Alt is held)
  else if (activeDrag === 'scale_corner') {
    const b = dragStartBounds
    const w = b.width || 0.0001
    const h = b.height || 0.0001

    if (e.altKey) {
      // Symmetrical scale from Center
      let factorX = 1, factorY = 1
      if (activeCornerHandle === 0) {
        factorX = (b.maxU - uv.u) / w
        factorY = (uv.v - b.minV) / h
      } else if (activeCornerHandle === 1) {
        factorX = (uv.u - b.minU) / w
        factorY = (uv.v - b.minV) / h
      } else if (activeCornerHandle === 2) {
        factorX = (uv.u - b.minU) / w
        factorY = (b.maxV - uv.v) / h
      } else if (activeCornerHandle === 3) {
        factorX = (b.maxU - uv.u) / w
        factorY = (b.maxV - uv.v) / h
      }
      if (e.shiftKey) {
        const uniform = Math.max(Math.abs(factorX), Math.abs(factorY))
        factorX = Math.sign(factorX || 1) * uniform
        factorY = Math.sign(factorY || 1) * uniform
      }
      applyUVTransform((origU, origV) => ({
        u: b.cU + (origU - b.cU) * factorX,
        v: b.cV + (origV - b.cV) * factorY
      }))
    } else {
      // Natural resize anchored at opposite corner
      if (activeCornerHandle === 0) {
        // Top-Left handle -> Anchor is Bottom-Right (b.maxU, b.minV)
        let factorX = (b.maxU - uv.u) / w
        let factorY = (uv.v - b.minV) / h
        if (e.shiftKey) {
          const uniform = Math.max(factorX, factorY)
          factorX = uniform; factorY = uniform
        }
        applyUVTransform((origU, origV) => ({
          u: b.maxU - (b.maxU - origU) * factorX,
          v: b.minV + (origV - b.minV) * factorY
        }))
      } else if (activeCornerHandle === 1) {
        // Top-Right handle -> Anchor is Bottom-Left (b.minU, b.minV)
        let factorX = (uv.u - b.minU) / w
        let factorY = (uv.v - b.minV) / h
        if (e.shiftKey) {
          const uniform = Math.max(factorX, factorY)
          factorX = uniform; factorY = uniform
        }
        applyUVTransform((origU, origV) => ({
          u: b.minU + (origU - b.minU) * factorX,
          v: b.minV + (origV - b.minV) * factorY
        }))
      } else if (activeCornerHandle === 2) {
        // Bottom-Right handle -> Anchor is Top-Left (b.minU, b.maxV)
        let factorX = (uv.u - b.minU) / w
        let factorY = (b.maxV - uv.v) / h
        if (e.shiftKey) {
          const uniform = Math.max(factorX, factorY)
          factorX = uniform; factorY = uniform
        }
        applyUVTransform((origU, origV) => ({
          u: b.minU + (origU - b.minU) * factorX,
          v: b.maxV - (b.maxV - origV) * factorY
        }))
      } else if (activeCornerHandle === 3) {
        // Bottom-Left handle -> Anchor is Top-Right (b.maxU, b.maxV)
        let factorX = (b.maxU - uv.u) / w
        let factorY = (b.maxV - uv.v) / h
        if (e.shiftKey) {
          const uniform = Math.max(factorX, factorY)
          factorX = uniform; factorY = uniform
        }
        applyUVTransform((origU, origV) => ({
          u: b.maxU - (b.maxU - origU) * factorX,
          v: b.maxV - (b.maxV - origV) * factorY
        }))
      }
    }
  }

  // Stretch Edges (Anchored at opposite edge, or center if Alt is held)
  else if (activeDrag === 'scale_edge') {
    const b = dragStartBounds
    const w = b.width || 0.0001
    const h = b.height || 0.0001

    if (e.altKey) {
      // Symmetrical scale from Center
      let factorX = 1, factorY = 1
      if (activeEdgeHandle === 'top') factorY = (uv.v - b.minV) / h
      else if (activeEdgeHandle === 'bottom') factorY = (b.maxV - uv.v) / h
      else if (activeEdgeHandle === 'left') factorX = (b.maxU - uv.u) / w
      else if (activeEdgeHandle === 'right') factorX = (uv.u - b.minU) / w

      applyUVTransform((origU, origV) => ({
        u: b.cU + (origU - b.cU) * factorX,
        v: b.cV + (origV - b.cV) * factorY
      }))
    } else {
      // Natural edge resize anchored at opposite edge
      if (activeEdgeHandle === 'right') {
        // Anchor left edge (b.minU), stretch right edge
        const factorX = (uv.u - b.minU) / w
        applyUVTransform((origU, origV) => ({
          u: b.minU + (origU - b.minU) * factorX,
          v: origV
        }))
      } else if (activeEdgeHandle === 'left') {
        // Anchor right edge (b.maxU), stretch left edge
        const factorX = (b.maxU - uv.u) / w
        applyUVTransform((origU, origV) => ({
          u: b.maxU - (b.maxU - origU) * factorX,
          v: origV
        }))
      } else if (activeEdgeHandle === 'top') {
        // Anchor bottom edge (b.minV), stretch top edge
        const factorY = (uv.v - b.minV) / h
        applyUVTransform((origU, origV) => ({
          u: origU,
          v: b.minV + (origV - b.minV) * factorY
        }))
      } else if (activeEdgeHandle === 'bottom') {
        // Anchor top edge (b.maxV), stretch bottom edge
        const factorY = (b.maxV - uv.v) / h
        applyUVTransform((origU, origV) => ({
          u: origU,
          v: b.maxV - (b.maxV - origV) * factorY
        }))
      }
    }
  }

  // Rotate Selection
  else if (activeDrag === 'rotate') {
    const b = dragStartBounds
    const center = uvToScreen(b.cU, b.cV)
    let curAngle = Math.atan2(sy - center.y, sx - center.x)
    let deltaAngle = curAngle - dragStartAngle

    if (e.shiftKey) {
      const step = (15 * Math.PI) / 180
      deltaAngle = Math.round(deltaAngle / step) * step
    }

    const cos = Math.cos(-deltaAngle)
    const sin = Math.sin(-deltaAngle)

    applyUVTransform((origU, origV) => {
      const du = (origU - b.cU) * textureSize.value.width
      const dv = (origV - b.cV) * textureSize.value.height
      return {
        u: b.cU + (du * cos - dv * sin) / textureSize.value.width,
        v: b.cV + (du * sin + dv * cos) / textureSize.value.height
      }
    })
  }
}

function onPointerLeave(e: PointerEvent) {
  publishUvHover(null)
  onPointerUp(e)
}

function onPointerUp(e: PointerEvent) {
  const el = e.target as HTMLElement
  if (el?.hasPointerCapture?.(e.pointerId)) {
    el.releasePointerCapture(e.pointerId)
  }
  activePointers.delete(e.pointerId)
  if (isPanning.value) {
    isPanning.value = false
    return
  }

  if (isMarqueeSelecting.value) {
    isMarqueeSelecting.value = false
    const minX = Math.min(marqueeStart.value.x, marqueeEnd.value.x)
    const maxX = Math.max(marqueeStart.value.x, marqueeEnd.value.x)
    const minY = Math.min(marqueeStart.value.y, marqueeEnd.value.y)
    const maxY = Math.max(marqueeStart.value.y, marqueeEnd.value.y)

    const isInsideBox = (x: number, y: number) => x >= minX && x <= maxX && y >= minY && y <= maxY

    if (maxX - minX > 4 && maxY - minY > 4 && activeMesh.value) {
      // UV VERTEX MODE
      if (uvSelectMode.value === 'vertex') {
        const newVerts: { faceIndex: number; vertIndex: number }[] = []
        activeMesh.value.faces.forEach((face, fIdx) => {
          face.uvs.forEach((uvCoord, vIdx) => {
            const pt = uvToScreen(uvCoord.u, uvCoord.v)
            if (isInsideBox(pt.x, pt.y)) {
              newVerts.push({ faceIndex: fIdx, vertIndex: vIdx })
            }
          })
        })
        if (e.shiftKey) {
          selectedUvVerts.value = [...selectedUvVerts.value, ...newVerts]
        } else {
          selectedUvVerts.value = newVerts
        }
        syncVerticesTo3D()
      }

      // UV EDGE MODE
      else if (uvSelectMode.value === 'edge') {
        const newEdges: { faceIndex: number; edgeIndex: number }[] = []
        activeMesh.value.faces.forEach((face, fIdx) => {
          for (let eIdx = 0; eIdx < face.uvs.length; eIdx++) {
            const ptA = uvToScreen(face.uvs[eIdx].u, face.uvs[eIdx].v)
            const ptB = uvToScreen(face.uvs[(eIdx + 1) % face.uvs.length].u, face.uvs[(eIdx + 1) % face.uvs.length].v)
            const mid = { x: (ptA.x + ptB.x) / 2, y: (ptA.y + ptB.y) / 2 }
            if (isInsideBox(ptA.x, ptA.y) || isInsideBox(ptB.x, ptB.y) || isInsideBox(mid.x, mid.y)) {
              newEdges.push({ faceIndex: fIdx, edgeIndex: eIdx })
            }
          }
        })
        commitUvEdgeSelection(newEdges, e.shiftKey)
      }

      // UV FACE / ISLAND MODE
      else {
        const newFaces: number[] = []
        activeMesh.value.faces.forEach((face, fIdx) => {
          let anyIn = false
          for (const uvCoord of face.uvs) {
            const pt = uvToScreen(uvCoord.u, uvCoord.v)
            if (isInsideBox(pt.x, pt.y)) {
              anyIn = true
              break
            }
          }
          if (anyIn) {
            newFaces.push(fIdx)
          }
        })
        let faces = newFaces
        if (uvSelectMode.value === 'island' && activeMesh.value) {
          faces = expandFacesToIslands(activeMesh.value, newFaces)
        }
        if (e.shiftKey) {
          selectedFaceIndices.value = Array.from(new Set([...selectedFaceIndices.value, ...faces]))
        } else {
          selectedFaceIndices.value = faces
        }
        syncFacesTo3D()
      }
    } else if (!e.shiftKey) {
      selectedFaceIndices.value = []
      selectedUvVerts.value = []
      selectedUvEdges.value = []
      if (activeMesh.value) {
        projectStore.selectedFaceIds = []
        projectStore.selectedVertexIds = []
        projectStore.selectedEdgeIds = []
      }
    }
    renderCanvas()
    return
  }

  if (activeDrag !== 'none') {
    activeDrag = 'none'
    renderCanvas()
  }
}

function onWheel(e: WheelEvent) {
  e.preventDefault()

  // Trackpad 2-finger scroll / Shift+wheel horizontal pan
  if (e.shiftKey) {
    panOffset.value.x -= e.deltaY * 0.8
    renderCanvas()
    return
  }

  // Laptop Trackpad 2-finger pan (deltaX + deltaY with no ctrlKey pinch)
  if (Math.abs(e.deltaX) > 0 && !e.ctrlKey) {
    panOffset.value.x -= e.deltaX
    panOffset.value.y -= e.deltaY
    renderCanvas()
    return
  }

  const rect = canvasRef.value?.getBoundingClientRect()
  const mouseX = rect ? e.clientX - rect.left : panOffset.value.x
  const mouseY = rect ? e.clientY - rect.top : panOffset.value.y

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
  renderCanvas()
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
  scheduleRender()
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
  scheduleRender()
}

function resetPanZoom() {
  if (!containerRef.value) return
  const w = containerRef.value.clientWidth
  const h = containerRef.value.clientHeight
  if (w <= 0 || h <= 0) return

  const pb = displayPixels()
  // Fit texture into ~90% of available viewport area
  const targetW = w * 0.9
  const targetH = h * 0.9
  let fitZoom = Math.min(targetW / pb.width, targetH / pb.height)
  if (fitZoom >= 1) {
    fitZoom = Math.min(32, Math.floor(fitZoom))
  } else {
    fitZoom = Math.max(0.005, Math.round(fitZoom * 1000) / 1000)
  }
  zoom.value = fitZoom

  panOffset.value = {
    x: Math.round((w - pb.width * fitZoom) / 2),
    y: Math.round((h - pb.height * fitZoom) / 2)
  }
  scheduleRender()
}

// ----------------------------------------------------
// 3D VIEWPORT SELECTION SYNC
// ----------------------------------------------------
function syncFacesTo3D() {
  if (!activeMesh.value) return
  projectStore.selectedFaceIds = selectedFaceIndices.value.map(idx => activeMesh.value!.faces[idx]?.id).filter(Boolean)
}

function syncVerticesTo3D() {
  if (!activeMesh.value) return
  const vertIds: string[] = []
  selectedUvVerts.value.forEach(sv => {
    const face = activeMesh.value!.faces[sv.faceIndex]
    if (face && face.vertexIds[sv.vertIndex]) {
      vertIds.push(face.vertexIds[sv.vertIndex])
    }
  })
  projectStore.selectedVertexIds = Array.from(new Set(vertIds))
  publishedUvVertexIds = projectStore.selectedVertexIds
}

function clearUvSelection() {
  selectedUvVerts.value = []
  selectedUvEdges.value = []
  selectedFaceIndices.value = []
  if (!activeMesh.value) return
  projectStore.selectedFaceIds = []
  projectStore.selectedVertexIds = []
  projectStore.selectedEdgeIds = []
}

function selectAllUv() {
  if (!activeMesh.value) return
  if (uvSelectMode.value === 'vertex') {
    const verts: { faceIndex: number; vertIndex: number }[] = []
    activeMesh.value.faces.forEach((face, faceIndex) => {
      face.vertexIds.forEach((_, vertIndex) => verts.push({ faceIndex, vertIndex }))
    })
    selectedUvVerts.value = verts
    selectedUvEdges.value = []
    selectedFaceIndices.value = []
    syncVerticesTo3D()
  } else if (uvSelectMode.value === 'edge') {
    const edges: { faceIndex: number; edgeIndex: number }[] = []
    activeMesh.value.faces.forEach((face, faceIndex) => {
      face.vertexIds.forEach((_, edgeIndex) => edges.push({ faceIndex, edgeIndex }))
    })
    selectedUvEdges.value = expandWeldedUvEdges(activeMesh.value, edges)
    selectedUvVerts.value = []
    selectedFaceIndices.value = []
    syncEdgesTo3D()
  } else {
    selectedFaceIndices.value = activeMesh.value.faces.map((_, i) => i)
    selectedUvVerts.value = []
    selectedUvEdges.value = []
    syncFacesTo3D()
  }
  scheduleRender()
}

function syncEdgesTo3D() {
  if (!activeMesh.value) return
  const vertIds: string[] = []
  const edgeIds: string[] = []
  selectedUvEdges.value.forEach(se => {
    const face = activeMesh.value!.faces[se.faceIndex]
    if (!face) return
    const a = face.vertexIds[se.edgeIndex]
    const b = face.vertexIds[(se.edgeIndex + 1) % face.vertexIds.length]
    if (!a || !b) return
    vertIds.push(a, b)
    edgeIds.push(a < b ? `${a}_${b}` : `${b}_${a}`)
  })
  projectStore.selectedVertexIds = Array.from(new Set(vertIds))
  projectStore.selectedEdgeIds = Array.from(new Set(edgeIds))
}

function recordDragStartUVs() {
  if (!activeMesh.value) return
  dragStartUvs = []
  for (const c of targetCorners.value) {
    const uv = activeMesh.value.faces[c.faceIndex].uvs[c.vertIndex]
    dragStartUvs.push({ ...c, origU: uv.u, origV: uv.v })
  }
}

function applyUVTransform(transformFn: (origU: number, origV: number) => { u: number; v: number }) {
  if (!activeMesh.value) return
  dragStartUvs.forEach(d => {
    if (isPinned(d.faceIndex, d.vertIndex)) return
    const face = activeMesh.value!.faces[d.faceIndex]
    if (face && face.uvs[d.vertIndex]) {
      const res = transformFn(d.origU, d.origV)
      face.uvs[d.vertIndex].u = res.u
      face.uvs[d.vertIndex].v = res.v
    }
  })
  projectStore.markGeometryUpdated()
  renderCanvas()
}

// ----------------------------------------------------
// DIRECT IMAGE & TEXTURE ATLAS IMPORT
// ----------------------------------------------------
function handleImageImport(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files || input.files.length === 0) return
  pendingImportFile.value = input.files[0]
  showImportModal.value = true
  input.value = ''
}

function handleTextureImported(texId?: string) {
  const id = texId || projectStore.activeTextureId
  if (id && projectStore.activeMesh) {
    projectStore.applyTextureToMesh(projectStore.activeMesh.id, id, 'this_object')
  }
  showImportModal.value = false
  pendingImportFile.value = null
  nextTick(() => {
    resetPanZoom()
    renderCanvas()
  })
}

function exportTexturePng() {
  projectStore.pixelBuffer.canvas.toBlob((blob) => {
    if (!blob) return
    void saveBlobDocument(
      blob,
      `${projectStore.projectName}_uv_texture.png`,
      [{ name: 'PNG', extensions: ['png'] }]
    )
  })
}

// ----------------------------------------------------
// ACTIVE MESH, MATERIAL & TEXTURE BINDINGS
// ----------------------------------------------------
const showNewTextureModal = ref(false)

function handleTextureBindingChange(newTexId: string) {
  projectStore.selectTexture(newTexId)
  scheduleRender()
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
  scheduleRender()
}

function handleApplyPaintTargetToMesh() {
  if (!projectStore.activeTexture || !projectStore.activeMesh) return
  applyToActiveMesh(projectStore.activeTexture.id)
}

// ----------------------------------------------------
// QUICK TRANSFORMS & ATLAS SNAPPING
// ----------------------------------------------------
function rotateUVs(angleDeg: number) { precisionTransform({ angle: angleDeg }, `Rotate UVs ${angleDeg}°`) }
function flipUVs(axis: 'u' | 'v') { precisionTransform(axis === 'u' ? { scaleU: -1 } : { scaleV: -1 }, `Flip UVs ${axis.toUpperCase()}`) }
function scaleUVs(factor: number) { precisionTransform({ scaleU: factor, scaleV: factor }, `Scale UVs ${factor}×`) }

function snapToQuadrant(quad: 1 | 2 | 3 | 4) {
  const b = selectionBounds.value
  if (!b) return
  projectStore.recordState(`Snap UV to Quad ${quad}`)

  let targetMinU = 0, targetMaxU = 0.5, targetMinV = 0.5, targetMaxV = 1.0
  if (quad === 2) { targetMinU = 0.5; targetMaxU = 1.0; targetMinV = 0.5; targetMaxV = 1.0 }
  else if (quad === 3) { targetMinU = 0.0; targetMaxU = 0.5; targetMinV = 0.0; targetMaxV = 0.5 }
  else if (quad === 4) { targetMinU = 0.5; targetMaxU = 1.0; targetMinV = 0.0; targetMaxV = 0.5 }

  fitSelectionToRange(targetMinU, targetMaxU, targetMinV, targetMaxV)
}

function snapToFull() {
  if (!selectionBounds.value) return
  projectStore.recordState('Fit UV to Full 0..1 Space')
  fitSelectionToRange(0, 1, 0, 1)
}

function centerInView() {
  const b = selectionBounds.value
  if (!b) return
  projectStore.recordState('Center UVs')
  const deltaU = 0.5 - b.cU
  const deltaV = 0.5 - b.cV
  applyBulkTransform((u, v) => ({ u: u + deltaU, v: v + deltaV }))
}

function fitSelectionToRange(minU: number, maxU: number, minV: number, maxV: number) {
  const b = selectionBounds.value
  if (!b) return
  applyBulkTransform((u, v) => {
    const tu = (u - b.minU) / Math.max(b.width, 1e-10)
    const tv = (v - b.minV) / Math.max(b.height, 1e-10)
    return {
      u: minU + tu * (maxU - minU),
      v: minV + tv * (maxV - minV)
    }
  })
}

function applyBulkTransform(fn: (u: number, v: number) => { u: number; v: number }) {
  if (!activeMesh.value) return
  for (const c of targetCorners.value) {
    if (isPinned(c.faceIndex, c.vertIndex)) continue
    const uv = activeMesh.value.faces[c.faceIndex].uvs[c.vertIndex]
    const res = fn(uv.u, uv.v)
    if (Number.isFinite(res.u) && Number.isFinite(res.v)) Object.assign(uv, res)
  }
  projectStore.markGeometryUpdated()
  scheduleRender()
}

// ----------------------------------------------------
// UNIVERSAL UNWRAPPING ACTIONS
// ----------------------------------------------------
function handleSeamUnwrap() {
  if (!activeMesh.value) return
  const selected = getTargetFaces()
  projectStore.performSeamUnwrap(selected.length > 0 ? selected : undefined)
  nextTick(frameSelection)
}

function handleSmartUvProject() {
  if (!activeMesh.value) return
  const selected = getTargetFaces()
  projectStore.performSmartUvProject({
    angleLimitDegrees: smartUvAngle.value,
    marginPixels: smartUvMargin.value,
    textureSize: displayPixels().width,
    onlyFaceIndices: selected.length > 0 ? selected : undefined
  })
  nextTick(frameSelection)
}

function unwrapSelection(): number[] | undefined {
  const selected = getTargetFaces()
  return selected.length > 0 ? selected : undefined
}

function handleBoxUnwrap() {
  if (!activeMesh.value) return
  projectStore.performBoxUnwrap(unwrapSelection())
  nextTick(frameSelection)
}

function handlePlanarUnwrap(axis: 'x' | 'y' | 'z') {
  if (!activeMesh.value) return
  projectStore.performPlanarUnwrap(axis, unwrapSelection())
  nextTick(frameSelection)
}

function handleCylinderUnwrap() {
  if (!activeMesh.value) return
  projectStore.performCylinderUnwrap(unwrapSelection())
  nextTick(frameSelection)
}

function handleSphereUnwrap() {
  if (!activeMesh.value) return
  projectStore.performSphereUnwrap(unwrapSelection())
  nextTick(frameSelection)
}

function handleConeUnwrap() {
  if (!activeMesh.value) return
  projectStore.performConeUnwrap(unwrapSelection())
  nextTick(frameSelection)
}

function handleCubemapCross() {
  if (!activeMesh.value) return
  projectStore.performCubemapCrossUnwrap(unwrapSelection())
  nextTick(frameSelection)
}

function handlePackIslands(marginPx = 2) {
  if (!activeMesh.value) return
  const selected = getTargetFaces()
  projectStore.performPackUVIslands(marginPx, selected.length > 0 ? selected : undefined)
  nextTick(frameSelection)
}

function stitchSelectedEdges() {
  if (!activeMesh.value) return
  const edges = [...selectedUvEdges.value]
  if (edges.length === 0 && hoveredEdge) {
    edges.push(hoveredEdge)
  }
  if (edges.length === 0) return
  projectStore.recordState('Stitch UV Edge')
  let any = false
  for (const edge of edges) {
    if (stitchUvEdge(activeMesh.value, edge.faceIndex, edge.edgeIndex)) any = true
  }
  if (!any) return
  projectStore.markGeometryUpdated()
  scheduleRender()
}

function togglePinSelected() {
  const next = new Set(pinnedUvKeys.value)
  const corners = targetCorners.value
  if (corners.length === 0) return
  const allPinned = corners.every(c => next.has(pinKey(c.faceIndex, c.vertIndex)))
  for (const c of corners) {
    const key = pinKey(c.faceIndex, c.vertIndex)
    if (!key) continue
    if (allPinned) next.delete(key)
    else next.add(key)
  }
  pinnedUvKeys.value = next
  scheduleRender()
}

function clearUvPins() {
  pinnedUvKeys.value = new Set()
  scheduleRender()
}

function weldSelectedUVs() {
  if (!activeMesh.value) return
  const groups = new Map<string, { faceIndex: number; vertIndex: number }[]>()

  const pushCorner = (faceIndex: number, vertIndex: number) => {
    const face = activeMesh.value!.faces[faceIndex]
    const vid = face?.vertexIds[vertIndex]
    if (!vid) return
    const list = groups.get(vid) || []
    list.push({ faceIndex, vertIndex })
    groups.set(vid, list)
  }

  if (selectedUvVerts.value.length > 0) {
    selectedUvVerts.value.forEach(v => pushCorner(v.faceIndex, v.vertIndex))
  } else {
    for (const fIdx of getTargetFaces()) {
      const face = activeMesh.value.faces[fIdx]
      face?.vertexIds.forEach((_, vIdx) => pushCorner(fIdx, vIdx))
    }
  }

  const weldGroups = Array.from(groups.values()).filter(corners => corners.length >= 2)
  if (weldGroups.length === 0) return

  projectStore.recordState('Weld Selected UVs')
  for (const corners of weldGroups) {
    let u = 0, v = 0
    for (const c of corners) {
      const uv = activeMesh.value.faces[c.faceIndex].uvs[c.vertIndex]
      u += uv.u
      v += uv.v
    }
    u /= corners.length
    v /= corners.length
    for (const c of corners) {
      activeMesh.value.faces[c.faceIndex].uvs[c.vertIndex].u = u
      activeMesh.value.faces[c.faceIndex].uvs[c.vertIndex].v = v
    }
  }
  projectStore.markGeometryUpdated()
  scheduleRender()
}

function frameSelection() {
  const mesh = activeMesh.value
  const canvas = canvasRef.value
  const container = containerRef.value
  if (!mesh || !canvas || !container) return

  const faces = getTargetFaces()
  const indices = faces.length > 0 ? faces : mesh.faces.map((_, i) => i)
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity
  for (const fIdx of indices) {
    for (const uv of mesh.faces[fIdx]?.uvs || []) {
      if (uv.u < minU) minU = uv.u
      if (uv.u > maxU) maxU = uv.u
      if (uv.v < minV) minV = uv.v
      if (uv.v > maxV) maxV = uv.v
    }
  }
  if (!isFinite(minU)) {
    resetPanZoom()
    return
  }

  const pad = 0.08
  const spanU = Math.max(0.05, maxU - minU) + pad
  const spanV = Math.max(0.05, maxV - minV) + pad
  const w = container.clientWidth || canvas.clientWidth
  const h = container.clientHeight || canvas.clientHeight
  const texW = displayPixels().width
  const texH = displayPixels().height
  const fitZoom = Math.max(0.2, Math.min(24, Math.min(w / (spanU * texW), h / (spanV * texH)) * 0.9))
  zoom.value = fitZoom
  const midU = (minU + maxU) / 2
  const midV = (minV + maxV) / 2
  panOffset.value = {
    x: w / 2 - midU * texW * fitZoom,
    y: h / 2 - (1 - midV) * texH * fitZoom
  }
  scheduleRender()
}

function handleGridify() {
  if (!activeMesh.value) return
  projectStore.performGridifyUvQuads(unwrapSelection())
  nextTick(frameSelection)
}

function handleEqualizeTexels() {
  if (!activeMesh.value) return
  projectStore.performEqualizeTexelDensity()
  nextTick(frameSelection)
}

function alignSelection(alignment: 'left' | 'right' | 'top' | 'bottom' | 'center_h' | 'center_v') {
  if (!activeMesh.value || !selectionBounds.value) return
  projectStore.recordState(`Align UVs (${alignment})`)
  const b = selectionBounds.value
  applyBulkTransform((u, v) => ({
    u: alignment === 'left' ? b.minU : alignment === 'right' ? b.maxU : alignment === 'center_h' ? b.cU : u,
    v: alignment === 'top' ? b.maxV : alignment === 'bottom' ? b.minV : alignment === 'center_v' ? b.cV : v
  }))
}

function snapToTrimCell(col: number, row: number, totalCols: number, totalRows: number) {
  if (!activeMesh.value || !selectionBounds.value) return
  projectStore.recordState(`Snap to Trim (${col + 1}, ${row + 1})`)
  const b = selectionBounds.value
  const cellW = 1.0 / totalCols
  const cellH = 1.0 / totalRows
  const targetU0 = col * cellW
  const targetV0 = 1.0 - (row + 1) * cellH

  applyBulkTransform((u, v) => ({
    u: targetU0 + (u - b.minU) / Math.max(b.width, 1e-10) * cellW,
    v: targetV0 + (v - b.minV) / Math.max(b.height, 1e-10) * cellH
  }))
}

function syncUvFromDocument() {
  const mesh = activeMesh.value
  if (mesh) {
    const ids = projectStore.selectedFaceIds
    selectedFaceIndices.value = mesh.faces.flatMap((face, index) => ids.includes(face.id) ? [index] : [])
  }
  scheduleRender()
}
watch(() => projectStore.textureRevision, syncUvFromDocument)
watch([tilesetImageId, tilesetTileIndex, tilesetRegion, tilesetUseMode, tilesetTileWidth, tilesetTileHeight, tilesetCols, tilesetRows, tilesetSpacing, tilesetMargin], syncUvFromDocument)
watch(() => projectStore.activeTextureId, syncUvFromDocument)
watch(() => {
  const t = uvDisplayTexture.value
  return t ? `${t.id}:${t.width}x${t.height}` : ''
}, () => nextTick(scheduleRender))
watch(() => projectStore.geometryRevision, syncUvFromDocument, { flush: 'sync' })
watch(zoom, scheduleRender)
watch(showPixelGrid, scheduleRender)
watch(() => projectStore.activeMeshId, () => {
  publishedUvVertexIds = null
  selectedFaceIndices.value = []
  selectedUvVerts.value = []
  selectedUvEdges.value = []
  pinnedUvKeys.value = new Set()
  publishUvHover(null)
  nextTick(() => {
    scheduleRender()
  })
})
watch(() => projectStore.meshes.length, scheduleRender)
watch(() => projectStore.activeMeshId, () => {
  const mesh = activeMesh.value
  if (mesh && ensureMeshUVs(mesh)) {
    projectStore.markGeometryUpdated()
  }
})
watch(() => projectStore.selectedFaceIds, scheduleRender)
watch(() => projectStore.selectedVertexIds, scheduleRender)
watch(() => projectStore.selectedEdgeIds, scheduleRender)
watch(showCheckerboard, scheduleRender)
watch(showHeatmap, scheduleRender)

watch(() => targetCorners.value.length, (count) => {
  const next = uvInspectAfterSelection(count, showPrecision.value, inspectDismissed.value)
  showPrecision.value = next.showPrecision
  inspectDismissed.value = next.inspectDismissed
})

let resizeObserver: ResizeObserver | null = null
const uvViewReady = ref(false)

function restoreOrFitImage() {
  if (uvViewReady.value) return
  const el = containerRef.value
  if (!el || el.clientWidth < 8 || el.clientHeight < 8) return
  if (uvViewSession.fitted) {
    zoom.value = uvViewSession.zoom
    panOffset.value = { x: uvViewSession.panX, y: uvViewSession.panY }
  } else {
    resetPanZoom()
    uvViewSession.fitted = true
    uvViewSession.zoom = zoom.value
    uvViewSession.panX = panOffset.value.x
    uvViewSession.panY = panOffset.value.y
  }
  uvViewReady.value = true
  scheduleRender()
}

function onUvKeyDown(e: KeyboardEvent) {
  if (toolStore.appMode !== 'uvpaint' || toolStore.uvWorkspaceTab !== 'uv') return
  const tag = (e.target as HTMLElement)?.tagName
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return
  if ((e.target as HTMLElement)?.isContentEditable) return
  if (!e.ctrlKey && !e.metaKey && !e.altKey) {
    const step = e.shiftKey ? 10 : 1
    const offsets: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }
    if (offsets[e.key]) {
      e.preventDefault()
      const [u, v] = offsets[e.key]
      precisionTransform({ moveU: u / textureSize.value.width, moveV: v / textureSize.value.height }, 'Nudge UVs')
      return
    }
    if (e.key.toLowerCase() === 'l') { e.preventDefault(); selectLinked(); return }
    if (e.key === 'Home') { e.preventDefault(); resetPanZoom(); return }
  }
  if (e.key === 'Escape' && activeDropdown.value) {
    e.preventDefault()
    closeDropdowns()
    return
  }
  if (e.code === 'Space') {
    spaceHeld = true
    e.preventDefault()
  }
  if (e.key === 'f' || e.key === 'F') {
    e.preventDefault()
    frameSelection()
  }
  if ((e.key === 'p' || e.key === 'P') && e.altKey) {
    e.preventDefault()
    clearUvPins()
    return
  }
  if (e.key === 'p' || e.key === 'P') {
    e.preventDefault()
    togglePinSelected()
  }
  if (e.key === 'v' || e.key === 'V') {
    e.preventDefault()
    stitchSelectedEdges()
  }
  if ((e.key === 'a' || e.key === 'A') && e.altKey) {
    e.preventDefault()
    clearUvSelection()
    scheduleRender()
    return
  }
  if ((e.key === 'a' || e.key === 'A') && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
    e.preventDefault()
    selectAllUv()
    return
  }
  if ((e.key === 'a' || e.key === 'A') && !e.ctrlKey && !e.metaKey) {
    e.preventDefault()
    selectAllUv()
  }
}

function onUvKeyUp(e: KeyboardEvent) {
  if (e.code === 'Space') spaceHeld = false
}

onMounted(() => {
  window.addEventListener('click', closeDropdowns)
  window.addEventListener('keydown', onUvKeyDown)
  window.addEventListener('keyup', onUvKeyUp)
  window.addEventListener(EDITOR_EVENTS.smartUvProject, handleSmartUvProject)
  // Generate high-contrast numbered calibration test grid
  const img = new Image()
  img.src = generateUVCheckerboardDataURL(512)
  img.onload = () => {
    checkerboardImage.value = img
    scheduleRender()
  }

  if (containerRef.value) {
    if (window.ResizeObserver) {
      resizeObserver = new ResizeObserver(() => {
        restoreOrFitImage()
        scheduleRender()
      })
      resizeObserver.observe(containerRef.value)
    }
  }
  nextTick(restoreOrFitImage)
})

onUnmounted(() => {
  if (uvViewReady.value) {
    uvViewSession.zoom = zoom.value
    uvViewSession.panX = panOffset.value.x
    uvViewSession.panY = panOffset.value.y
  }
  window.removeEventListener('click', closeDropdowns)
  window.removeEventListener('keydown', onUvKeyDown)
  window.removeEventListener('keyup', onUvKeyUp)
  window.removeEventListener(EDITOR_EVENTS.smartUvProject, handleSmartUvProject)
  toolStore.setUvHoverFaceIds([])
  if (renderRafId !== null) {
    cancelAnimationFrame(renderRafId)
    renderRafId = null
    renderPending = false
  }
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
})

defineExpose({
  showPrecision,
  inspectDismissed,
  selectedFaceIndices,
  uvSelectMode,
  snapToPixels,
  showPixelGrid,
  showCheckerboard,
  showHeatmap,
  zoom,
  snapToQuadrant,
  snapToFull,
  centerInView,
  handlePackIslands,
  handleGridify,
  handleEqualizeTexels,
  alignSelection,
  handleBoxUnwrap,
  handlePlanarUnwrap,
  handleCylinderUnwrap,
  handleSphereUnwrap,
  handleConeUnwrap,
  handleCubemapCross,
  rotateUVs,
  flipUVs,
  scaleUVs
})
</script>

<template>
  <div class="uv-editor h-full w-full bg-ui-panel flex flex-col select-none overflow-hidden relative font-mono text-xs touch-none">
    <input ref="fileInputRef" type="file" accept="image/*" @change="handleImageImport" class="hidden" />

    <div class="uv-header-row bg-ui-header border-b border-ui-borderSubtle px-2 flex items-center gap-2 shrink-0 z-30 select-none">
      <div class="asset-pipeline flex items-center gap-1.5 min-w-0">
        <!-- Active target: keep the object and image together, without a second
             utility row competing with the UV tools below. -->
        <div class="flex items-center gap-1 px-1.5 py-0.5 rounded-xs bg-ui-input border border-ui-borderSubtle text-[10px] text-ui-textSecondary shrink-0">
          <span class="text-ui-textMuted font-bold text-[8.5px]">OBJ:</span>
          <select 
            v-model="projectStore.activeMeshId" 
            class="bg-transparent text-ui-textPrimary font-bold focus:outline-none cursor-pointer max-w-[100px] truncate"
            title="Active 3D Object"
          >
            <option v-for="m in projectStore.meshes" :key="m.id" :value="m.id" class="bg-ui-panel text-ui-textPrimary">
              {{ m.name }} ({{ m.faces.length }}f)
            </option>
          </select>
        </div>

        <!-- Paint target (not a mesh bind) -->
        <div class="flex items-center gap-1 px-1.5 py-0.5 rounded-xs bg-ui-input border border-ui-borderSubtle text-[10px] text-ui-textSecondary shrink-0">
          <span class="text-ui-textMuted font-bold text-[8.5px]">TEX:</span>
          <select 
            :value="projectStore.activeTextureId" 
            @change="handleTextureBindingChange(($event.target as HTMLSelectElement).value)"
            class="bg-transparent text-ui-textPrimary font-bold font-mono focus:outline-none cursor-pointer max-w-[125px] truncate"
            title="Paint target — the image this UV editor shows"
          >
            <option v-for="t in projectStore.textures" :key="t.id" :value="t.id" class="bg-ui-panel text-ui-textPrimary">
              {{ t.name }} ({{ t.width }}x{{ t.height }})
            </option>
          </select>
          <button
            type="button"
            class="px-1 py-0.5 text-[8.5px] font-bold text-ui-textAccent hover:bg-ui-hover rounded-xs"
            title="Apply this paint target to the active object"
            @click="handleApplyPaintTargetToMesh"
          >
            Apply
          </button>
          <button 
            @click="showNewTextureModal = true"
            class="p-0.5 hover:bg-ui-hover text-ui-textMuted rounded-xs transition cursor-pointer"
            title="New image — pick any size"
          >
            <BlenderIcon name="plus" :size="12" />
          </button>
        </div>

      </div>
      <div class="uv-header-divider" aria-hidden="true"></div>
      <div class="uv-workflow-bar uv-header-actions" aria-label="UV selection and quick actions">
        <button :disabled="!activeMesh" @click="handleSmartUvProject">Unwrap</button>
        <button :disabled="!activeMesh" @click="handlePackIslands(smartUvMargin)">Pack</button>
        <button class="uv-panel-toggle" :aria-pressed="showPrecision" @click="toggleInspect" title="Toggle UV inspector">Inspect {{ showPrecision ? '−' : '+' }}</button>
        <button :disabled="!projectStore.activeTexture" title="Browse, edit, and stamp atlas tiles" @click="projectStore.activeTexture && openTileset(projectStore.activeTexture.id)">Tileset</button>
      </div>
    </div>
    <Teleport defer to="#uv-paint-command-slot">
      <div class="uv-command-strip flex items-center gap-1">
        <!-- Texture Menu Dropdown -->
        <div class="relative" @click.stop>
          <button 
            @click="toggleDropdown('texture')"
            class="px-2 py-1 text-xs font-semibold rounded-xs transition cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0"
            :class="activeDropdown === 'texture' ? 'bg-ui-hover text-ui-textPrimary' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
          >
            <span>Texture</span>
            <span class="text-[8px] opacity-70">▼</span>
          </button>

          <div v-if="activeDropdown === 'texture'" class="header-dropdown-menu absolute left-0 top-full mt-1 w-56 bg-ui-panel text-ui-textPrimary border border-ui-borderStrong rounded-xs shadow-2xl py-1 z-50 text-xs">
            <button @click="fileInputRef?.click(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
              <span>Import Image...</span>
              <BlenderIcon name="import" :size="12" />
            </button>
            <button @click="exportTexturePng(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
              <span>Export Texture PNG</span>
              <BlenderIcon name="export" :size="12" />
            </button>
            <div class="h-px bg-ui-borderSubtle my-1"></div>
            <button @click="showNewTextureModal = true; closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
              <span>New Image...</span>
            </button>
            <button @click="projectStore.bakeSceneAtlas(2); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
              <span>Bake Scene Atlas</span>
            </button>
          </div>
        </div>

        <!-- UV Menu Dropdown -->
        <div class="relative" @click.stop>
          <div class="inspector-seg">
            <button
              @click="handleSmartUvProject"
              class="inspector-seg-btn"
              title="Automatically cut, project, and pack the selected faces or whole mesh (U)"
            >
              <BlenderIcon name="uv-smart" :size="12" />
              <span>Smart UV</span>
            </button>
            <button
              @click="toggleDropdown('uv')"
              class="inspector-seg-btn"
              :class="{ 'is-active': activeDropdown === 'uv' }"
              title="UV projection options"
            >▼</button>
          </div>

          <div v-if="activeDropdown === 'uv'" class="header-dropdown-menu absolute left-0 top-full mt-1 w-64 bg-ui-panel text-ui-textPrimary border border-ui-borderStrong rounded-xs shadow-2xl py-1 z-50 text-xs">
            <button @click="handleSmartUvProject(); closeDropdowns()" class="w-full text-left px-3 py-2 hover:bg-ui-hover flex items-center justify-between font-semibold">
              <span class="flex items-center gap-2"><BlenderIcon name="uv-smart" :size="14" /> Smart UV Project</span>
              <span class="text-[10px] text-ui-textMuted font-mono font-normal">U</span>
            </button>
            <div class="mx-2 mb-1 p-2 rounded-xs bg-ui-input border border-ui-borderSubtle space-y-1.5" @click.stop>
              <label class="flex items-center justify-between gap-3 text-[10px] text-ui-textSecondary">
                <span title="Lower values create more islands; higher values keep more faces together">Cut angle</span>
                <span class="flex items-center gap-1">
                  <input v-model.number="smartUvAngle" type="range" min="15" max="120" step="1" class="w-24 inspector-range" />
                  <input v-model.number="smartUvAngle" type="number" min="1" max="179" step="1" class="w-11 h-5 bg-ui-panel border border-ui-borderDefault rounded-xs px-1 text-right font-mono" />
                  <span>°</span>
                </span>
              </label>
              <label class="flex items-center justify-between gap-3 text-[10px] text-ui-textSecondary">
                <span>Island margin</span>
                <span class="flex items-center gap-1">
                  <input v-model.number="smartUvMargin" type="number" min="0" max="32" step="1" class="w-11 h-5 bg-ui-panel border border-ui-borderDefault rounded-xs px-1 text-right font-mono" />
                  <span>px</span>
                </span>
              </label>
              <p class="text-[9px] leading-tight text-ui-textMuted">Works on the selection, or the whole mesh when nothing is selected.</p>
            </div>
            <div class="h-px bg-ui-borderSubtle my-1"></div>
            <button @click="handleSeamUnwrap(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
              <span class="flex items-center gap-2"><BlenderIcon name="edge-select" :size="13" /> Unwrap Using Marked Seams</span>
              <span class="text-[9px] text-ui-textMuted">manual</span>
            </button>
            <button @click="handleBoxUnwrap(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
              <span class="flex items-center gap-2"><BlenderIcon name="mesh-cube" :size="13" /> Box Projection</span>
              <span class="text-[9px] text-ui-textMuted">sel or all</span>
            </button>
            <button @click="handleCubemapCross(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
              <span class="flex items-center gap-2"><BlenderIcon name="mesh-cube" :size="13" /> Cubemap Cross (Blockbench)</span>
            </button>
            <div class="h-px bg-ui-borderSubtle my-1"></div>
            <button @click="handleCylinderUnwrap(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center gap-2">
              <BlenderIcon name="mesh-cylinder" :size="13" />
              <span>Cylinder (Tube + Caps)</span>
            </button>
            <button @click="handleSphereUnwrap(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center gap-2">
              <BlenderIcon name="mesh-sphere" :size="13" />
              <span>Sphere (Equirectangular)</span>
            </button>
            <button @click="handleConeUnwrap(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center gap-2">
              <BlenderIcon name="mesh-cone" :size="13" />
              <span>Cone / Pyramid (Radial Fan)</span>
            </button>
            <div class="h-px bg-ui-borderSubtle my-1"></div>
            <div class="px-3 py-0.5 text-[9px] font-bold text-ui-textMuted uppercase">Planar Projections</div>
            <button @click="handlePlanarUnwrap('z'); closeDropdowns()" class="w-full text-left px-3 py-1 hover:bg-ui-hover text-xs">Planar Z-Axis (Front)</button>
            <button @click="handlePlanarUnwrap('x'); closeDropdowns()" class="w-full text-left px-3 py-1 hover:bg-ui-hover text-xs">Planar X-Axis (Side)</button>
            <button @click="handlePlanarUnwrap('y'); closeDropdowns()" class="w-full text-left px-3 py-1 hover:bg-ui-hover text-xs">Planar Y-Axis (Top)</button>
            <div class="h-px bg-ui-borderSubtle my-1"></div>
            <button @click="snapToFull(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-rose-950/60 hover:text-rose-300 text-rose-400">
              Reset UVs (0..1 Full)
            </button>
          </div>
        </div>

        <!-- Islands Menu Dropdown -->
        <div class="relative" @click.stop>
          <button 
            @click="toggleDropdown('islands')"
            class="px-2 py-1 text-xs font-semibold rounded-xs transition cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0"
            :class="activeDropdown === 'islands' ? 'bg-ui-hover text-ui-textPrimary' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
          >
            <span>Islands</span>
            <span class="text-[8px] opacity-70">▼</span>
          </button>

          <div v-if="activeDropdown === 'islands'" class="header-dropdown-menu absolute left-0 top-full mt-1 w-60 bg-ui-panel text-ui-textPrimary border border-ui-borderStrong rounded-xs shadow-2xl py-1 z-50 text-xs">
            <button @click="handlePackIslands(2); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
              <span class="flex items-center gap-2"><BlenderIcon name="pack-islands" :size="13" /> Auto-Pack Islands (2px Margin)</span>
            </button>
            <button @click="handlePackIslands(0); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
              <span>Auto-Pack Islands (0px Tight)</span>
            </button>
            <button @click="handlePackIslands(4); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
              <span>Auto-Pack Islands (4px Margin)</span>
            </button>
            <div class="h-px bg-ui-borderSubtle my-1"></div>
            <button @click="projectStore.bakeSceneAtlas(2); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover">
              <span>Bake Scene Atlas (All Meshes)</span>
            </button>
            <div class="h-px bg-ui-borderSubtle my-1"></div>
            <button @click="handleGridify(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover">
              <span>Gridify Quad Loops</span>
            </button>
            <button @click="handleEqualizeTexels(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover">
              <span>Equalize Texel Density</span>
            </button>
            <div class="h-px bg-ui-borderSubtle my-1"></div>
            <button @click="projectStore.markSelectedEdgesAsSeam(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
              <span>Mark Seams (edges or island border)</span>
              <span class="text-[10px] text-ui-textMuted font-mono">Ctrl+Shift+E</span>
            </button>
            <button @click="projectStore.clearSelectedEdgesSeam(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
              <span>Clear Seams (edges or island border)</span>
              <span class="text-[10px] text-ui-textMuted font-mono">Ctrl+Alt+E</span>
            </button>
            <div class="h-px bg-ui-borderSubtle my-1"></div>
            <button @click="stitchSelectedEdges(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
              <span>Stitch Selected Edge</span>
              <span class="text-[10px] text-ui-textMuted font-mono">V</span>
            </button>
            <button @click="weldSelectedUVs(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
              <span>Weld UVs (same 3D verts)</span>
            </button>
            <button @click="togglePinSelected(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
              <span>Pin / Unpin Selected</span>
              <span class="text-[10px] text-ui-textMuted font-mono">P</span>
            </button>
            <button @click="clearUvPins(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
              <span>Clear Pins</span>
              <span class="text-[10px] text-ui-textMuted font-mono">Alt+P</span>
            </button>
            <button @click="frameSelection(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
              <span>Frame Selection</span>
              <span class="text-[10px] text-ui-textMuted font-mono">F</span>
            </button>
          </div>
        </div>

        <!-- Align & Snap Menu Dropdown -->
        <div class="relative" @click.stop>
          <button 
            @click="toggleDropdown('align')"
            class="px-2 py-1 text-xs font-semibold rounded-xs transition cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0"
            :class="activeDropdown === 'align' ? 'bg-ui-hover text-ui-textPrimary' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
          >
            <span class="whitespace-nowrap">Align & Snap</span>
            <span class="text-[8px] opacity-70">▼</span>
          </button>

          <div v-if="activeDropdown === 'align'" class="header-dropdown-menu absolute right-0 top-full mt-1 w-56 bg-ui-panel text-ui-textPrimary border border-ui-borderStrong rounded-xs shadow-2xl py-1 z-50 text-xs">
            <div class="px-3 py-0.5 text-[9px] font-bold text-ui-textMuted uppercase">Align Island / Vertices</div>
            <div class="grid grid-cols-2 gap-1 px-2 py-1">
              <button @click="alignSelection('left'); closeDropdowns()" class="px-2 py-1 bg-ui-input hover:bg-ui-hover text-center rounded-xs text-[11px]">Left</button>
              <button @click="alignSelection('right'); closeDropdowns()" class="px-2 py-1 bg-ui-input hover:bg-ui-hover text-center rounded-xs text-[11px]">Right</button>
              <button @click="alignSelection('top'); closeDropdowns()" class="px-2 py-1 bg-ui-input hover:bg-ui-hover text-center rounded-xs text-[11px]">Top</button>
              <button @click="alignSelection('bottom'); closeDropdowns()" class="px-2 py-1 bg-ui-input hover:bg-ui-hover text-center rounded-xs text-[11px]">Bottom</button>
              <button @click="alignSelection('center_h'); closeDropdowns()" class="px-2 py-1 bg-ui-input hover:bg-ui-hover text-center rounded-xs text-[11px]">Center H</button>
              <button @click="alignSelection('center_v'); closeDropdowns()" class="px-2 py-1 bg-ui-input hover:bg-ui-hover text-center rounded-xs text-[11px]">Center V</button>
            </div>
            <div class="h-px bg-ui-borderSubtle my-1"></div>
            <div class="px-3 py-0.5 text-[9px] font-bold text-ui-textMuted uppercase">Atlas cells</div>
            <button @click="snapToFull(); closeDropdowns()" class="w-full text-left px-3 py-1 hover:bg-ui-hover">Fit to Full (0..1)</button>
            <div class="grid gap-0.5 px-2 py-1" :style="{ gridTemplateColumns: `repeat(${paintAtlas?.cols || 2}, minmax(0, 1fr))` }">
              <button
                v-for="cell in atlasMenuCells"
                :key="`${cell.col}-${cell.row}`"
                type="button"
                class="px-1 py-1 bg-ui-input hover:bg-ui-hover text-center rounded-xs text-[10px] font-mono"
                @click="snapToTrimCell(cell.col, cell.row, paintAtlas?.cols || 2, paintAtlas?.rows || 2); closeDropdowns()"
              >
                {{ cell.col + 1 }},{{ cell.row + 1 }}
              </button>
            </div>
          </div>
        </div>

        <!-- Texel Density Menu Dropdown -->
        <div class="relative" @click.stop>
          <button 
            @click="toggleDropdown('texel')"
            class="px-2 py-1 text-xs font-semibold rounded-xs transition cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0"
            :class="activeDropdown === 'texel' ? 'bg-ui-hover text-ui-textPrimary' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
          >
            <span class="whitespace-nowrap">Texel</span>
            <span class="text-[8px] opacity-70">▼</span>
          </button>

          <div v-if="activeDropdown === 'texel'" class="header-dropdown-menu absolute right-0 top-full mt-1 w-60 bg-ui-panel text-ui-textPrimary border border-ui-borderStrong rounded-xs shadow-2xl p-2 z-50 text-xs space-y-2">
            <div class="flex items-center justify-between border-b border-ui-borderSubtle pb-1">
              <span class="text-[10px] font-bold text-ui-textSecondary uppercase">Texel Density (px/unit)</span>
              <span v-if="sampledDensity !== null" class="text-[10px] font-mono inspector-value">{{ sampledDensity }} px/u</span>
            </div>

            <div class="flex items-center gap-1.5">
              <label class="text-[10px] text-ui-textMuted font-mono">Target:</label>
              <input 
                type="number" 
                min="1" 
                max="256" 
                v-model.number="targetTexelDensity" 
                class="flex-1 bg-ui-input border border-ui-borderSubtle rounded-xs px-2 py-0.5 text-xs font-mono text-ui-textPrimary focus:outline-none focus:border-ui-accent"
              />
              <button 
                @click="handleSampleTexelDensity"
                class="px-2 py-0.5 bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle rounded-xs text-[10px] font-mono text-ui-textSecondary hover:text-white"
                title="Sample density from active face"
              >
                Sample
              </button>
            </div>

            <div class="grid grid-cols-2 gap-1 pt-1 border-t border-ui-borderSubtle/60">
              <button 
                @click="handleApplyTexelDensity(); closeDropdowns()" 
                class="px-2 py-1 bg-ui-accent hover:bg-ui-accentHover text-[color:var(--ui-on-accent)] font-semibold rounded-xs text-[10px] transition text-center"
              >
                Apply Density
              </button>
              <button 
                @click="handleEqualizeTexelDensity(); closeDropdowns()" 
                class="px-2 py-1 bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle text-ui-textPrimary rounded-xs text-[10px] transition text-center"
              >
                Equalize All
              </button>
            </div>
          </div>
        </div>

        <!-- View Menu Dropdown -->
        <div class="relative" @click.stop>
          <button 
            @click="toggleDropdown('view')"
            class="px-2 py-1 text-xs font-semibold rounded-xs transition cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0"
            :class="activeDropdown === 'view' ? 'bg-ui-hover text-ui-textPrimary shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
          >
            <span>View</span>
            <span class="text-[8px] opacity-70">▼</span>
          </button>

          <div v-if="activeDropdown === 'view'" class="header-dropdown-menu absolute right-0 top-full mt-1 w-52 bg-ui-panel text-ui-textPrimary border border-ui-borderStrong rounded-xs shadow-2xl py-1 z-50 text-xs">
            <button @click="showCheckerboard = !showCheckerboard; closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
              <span>Checkerboard Grid</span>
              <span :class="showCheckerboard ? 'inspector-value' : 'text-ui-textMuted'">{{ showCheckerboard ? 'On' : 'Off' }}</span>
            </button>
            <button @click="showHeatmap = !showHeatmap; closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
              <span>UV Stretch Heatmap</span>
              <span :class="showHeatmap ? 'inspector-value' : 'text-ui-textMuted'">{{ showHeatmap ? 'On' : 'Off' }}</span>
            </button>
            <div class="h-px bg-ui-borderSubtle my-1"></div>
            <button @click="showPixelGrid = !showPixelGrid; closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
              <span>Pixel Grid Lines</span>
              <span :class="showPixelGrid ? 'inspector-value' : 'text-ui-textMuted'">{{ showPixelGrid ? 'On' : 'Off' }}</span>
            </button>
            <button @click="snapToPixels = !snapToPixels; closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
              <span>Snap to Pixels</span>
              <span :class="snapToPixels ? 'inspector-value' : 'text-ui-textMuted'">{{ snapToPixels ? 'On' : 'Off' }}</span>
            </button>
            <div class="h-px bg-ui-borderSubtle my-1"></div>
            <button @click="resetPanZoom(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
              <span>Frame UV Canvas</span>
              <span class="text-[10px] text-ui-textMuted font-mono">Home</span>
            </button>
            <button @click="frameSelection(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
              <span>Frame Selection / Islands</span>
              <span class="text-[10px] text-ui-textMuted font-mono">F</span>
            </button>
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

    <div class="uv-workbench-body">
    <!-- 3. INFINITE STAGING CANVAS VIEWPORT -->
    <div 
      ref="containerRef" 
      class="uv-canvas-viewport relative flex-1 min-h-0 overflow-hidden"
      @wheel="onWheel"
      @contextmenu.prevent
    >
      <div v-if="!activeMesh" class="uv-empty-state">
        <BlenderIcon name="uv" :size="28" />
        <strong>Select an object to edit its UVs</strong>
        <span>Choose a mesh in the 3D view, then unwrap or arrange its islands here.</span>
      </div>
      <!-- Vertical Selection & Quick Actions Toolbar (Docked Inside Canvas Left) -->
      <div class="uv-vertical-toolbar" aria-label="UV Selection & Quick Tools">
        <!-- UV Selection Modes -->
        <div class="uv-vert-tool-group">
          <button 
            @click="uvSelectMode = 'face'"
            class="uv-vert-tool-btn"
            :aria-pressed="uvSelectMode === 'face'"
            :class="{ 'is-active': uvSelectMode === 'face' }"
            title="Face Select (3)"
          >
            <BlenderIcon name="face-select" :size="15" />
          </button>
          <button 
            @click="uvSelectMode = 'vertex'"
            class="uv-vert-tool-btn"
            :aria-pressed="uvSelectMode === 'vertex'"
            :class="{ 'is-active': uvSelectMode === 'vertex' }"
            title="Vertex Select (1)"
          >
            <BlenderIcon name="vertex-select" :size="15" />
          </button>
          <button 
            @click="uvSelectMode = 'edge'"
            class="uv-vert-tool-btn"
            :aria-pressed="uvSelectMode === 'edge'"
            :class="{ 'is-active': uvSelectMode === 'edge' }"
            title="Edge Select (2)"
          >
            <BlenderIcon name="edge-select" :size="15" />
          </button>
          <button 
            @click="uvSelectMode = 'island'"
            class="uv-vert-tool-btn"
            :aria-pressed="uvSelectMode === 'island'"
            :class="{ 'is-active': uvSelectMode === 'island' }"
            title="Island Select (4)"
          >
            <BlenderIcon name="object-mode" :size="15" />
          </button>
        </div>

        <div class="uv-vert-divider"></div>

        <!-- Quick Transform & UV Operations -->
        <div class="uv-vert-tool-group">
          <button @click="rotateUVs(-90)" :disabled="!selectionBounds" class="uv-vert-tool-btn" title="Rotate 90° CCW">
            <BlenderIcon name="rotate-ccw" :size="15" /><span class="uv-tool-label">−90°</span>
          </button>
          <button @click="rotateUVs(90)" :disabled="!selectionBounds" class="uv-vert-tool-btn" title="Rotate 90° CW">
            <BlenderIcon name="rotate-cw" :size="15" /><span class="uv-tool-label">+90°</span>
          </button>
          <button @click="flipUVs('u')" :disabled="!selectionBounds" class="uv-vert-tool-btn" title="Flip Horizontal">
            <BlenderIcon name="flip-horizontal" :size="15" /><span class="uv-tool-label">Flip U</span>
          </button>
          <button @click="flipUVs('v')" :disabled="!selectionBounds" class="uv-vert-tool-btn" title="Flip Vertical">
            <BlenderIcon name="flip-vertical" :size="15" /><span class="uv-tool-label">Flip V</span>
          </button>
          <button @click="handlePackIslands(smartUvMargin)" class="uv-vert-tool-btn" :title="`Pack islands (${smartUvMargin}px margin)`">
            <BlenderIcon name="pack-islands" :size="15" /><span class="uv-tool-label">Pack</span>
          </button>
          <button @click="handleSmartUvProject" class="uv-vert-tool-btn" title="Smart UV Project: cut, project, and pack (U)">
            <BlenderIcon name="uv-smart" :size="15" /><span class="uv-tool-label">Smart UV</span>
          </button>
        </div>
      </div>

      <!-- Top Right Floating View Controls -->
      <div class="uv-view-group" aria-label="UV canvas view controls">
        <button @click="frameSelection" class="uv-view-toggle" title="Frame selected UVs, or all islands (F)"><BlenderIcon name="view-fit" :size="14" /><span>Frame</span></button>
        <button
          @click="showHeatmap = !showHeatmap"
          class="uv-view-icon"
          :class="{ 'is-active': showHeatmap }"
          title="Toggle distortion heatmap"
        ><BlenderIcon name="xray" :size="14" /></button>
        <button
          @click="snapToPixels = !snapToPixels"
          class="uv-view-toggle"
          :class="{ 'is-active': snapToPixels }"
          title="Snap to pixel grid"
        ><BlenderIcon name="snap" :size="14" /><span>Snap</span></button>
        <button
          @click="showPixelGrid = !showPixelGrid"
          class="uv-view-icon"
          :class="{ 'is-active': showPixelGrid }"
          title="Toggle pixel grid"
        ><BlenderIcon name="grid" :size="14" /></button>
        <div class="uv-zoom-control">
          <button @click="zoomOut" title="Zoom out"><BlenderIcon name="zoom-out" :size="14" /></button>
          <span @dblclick="resetPanZoom" title="Double-click to fit view">{{ Math.round(zoom * 100) }}%</span>
          <button @click="zoomIn" title="Zoom in"><BlenderIcon name="zoom-in" :size="14" /></button>
        </div>
        <button @click="resetPanZoom" class="uv-view-icon" title="Fit UV canvas to view">
          <BlenderIcon name="view-fit" :size="14" />
        </button>
      </div>
      <canvas 
        ref="canvasRef" 
        @pointerdown="onPointerDown" 
        @pointermove="onPointerMove" 
        @pointerup="onPointerUp" 
        @pointerleave="onPointerLeave"
        @pointercancel="onPointerUp"
        @contextmenu.prevent
        class="w-full h-full block touch-none"
      ></canvas>

      <!-- Quick Info HUD at Bottom Left -->
      <div class="uv-status-hud">
        <span class="flex items-center gap-1">Mode: <strong class="inspector-value uppercase font-bold">{{ uvSelectMode }}</strong></span>
        <span>Islands: <strong class="text-ui-textPrimary font-bold">{{ uvIslandCount }}</strong></span>
        <span v-if="seamCount">Seams: <strong class="text-red-400 font-bold">{{ seamCount }}</strong></span>
        <span v-if="selectedFaceCount">Sel: <strong class="inspector-value">{{ selectedFaceCount }}f</strong></span>
        <span v-if="pinnedUvKeys.size">Pins: <strong class="inspector-value">{{ pinnedUvKeys.size }}</strong></span>
        <span v-if="!selectionBounds" class="text-ui-textMuted">Select UVs to transform</span>
        <span v-if="selectionBounds" class="inspector-value font-bold">
          Bounds: {{ Math.round(selectionBounds.width * 100) }}% × {{ Math.round(selectionBounds.height * 100) }}%
        </span>
        <span class="text-ui-textMuted hidden md:inline">RMB / Space-drag pan · F frame · V stitch · P pin</span>
      </div>
    </div>
    <aside v-if="showPrecision" class="uv-precision-panel" aria-label="UV precision tools">
      <nav class="inspector-seg is-stretch uv-inspector-tabs" aria-label="UV inspector sections"><button v-for="tab in (['selection', 'transform', 'tools'] as const)" :key="tab" type="button" class="inspector-seg-btn" :class="{ 'is-active': precisionTab === tab }" :aria-pressed="precisionTab === tab" @click="precisionTab = tab">{{ tab.charAt(0).toUpperCase() + tab.slice(1) }}</button></nav>
      <div class="uv-panel-heading"><strong>Selection</strong><span>{{ targetCorners.length }} {{ targetCorners.length === 1 ? 'corner' : 'corners' }}</span></div>
      <div class="inspector-seg is-stretch uv-units" role="group" aria-label="Coordinate units"><button type="button" class="inspector-seg-btn" :class="{ 'is-active': coordinateUnits === 'pixels' }" :aria-pressed="coordinateUnits === 'pixels'" @click="coordinateUnits = 'pixels'">Pixels</button><button type="button" class="inspector-seg-btn" :class="{ 'is-active': coordinateUnits === 'uv' }" :aria-pressed="coordinateUnits === 'uv'" @click="coordinateUnits = 'uv'">UV units</button></div>
      <p class="uv-panel-hint">{{ textureSize.width }} × {{ textureSize.height }} texture · U right, V up</p>
      <fieldset v-show="precisionTab === 'selection'" :disabled="!targetCorners.length" class="uv-panel-section">
        <div class="uv-field-pair">
          <label>U position<input aria-label="UV U position" type="number" step="any" :value="selectionBounds ? +(selectionBounds.minU * unitU).toFixed(4) : ''" @change="setSelectionCoordinate('u', $event)" /></label>
          <label>V position<input aria-label="UV V position" type="number" step="any" :value="selectionBounds ? +(selectionBounds.minV * unitV).toFixed(4) : ''" @change="setSelectionCoordinate('v', $event)" /></label>
        </div>
        <div class="uv-field-pair">
          <label>Width<input aria-label="UV selection width" type="number" min="0" step="any" :value="selectionBounds ? +(selectionBounds.width * unitU).toFixed(4) : ''" @change="setSelectionSize('u', $event)" /></label>
          <label>Height<input aria-label="UV selection height" type="number" min="0" step="any" :value="selectionBounds ? +(selectionBounds.height * unitV).toFixed(4) : ''" @change="setSelectionSize('v', $event)" /></label>
        </div>
        <label class="uv-checkbox"><input v-model="lockScale" type="checkbox" /> Keep proportions</label>
        <label>Transform pivot<select v-model="pivotMode"><option value="selection">Selection center</option><option value="islands">Individual islands</option><option value="tile">Texture center</option></select></label>
      </fieldset>
      <fieldset v-show="precisionTab === 'transform'" :disabled="!targetCorners.length" class="uv-panel-section">
        <legend>Transform</legend>
        <form @submit.prevent="moveSelection">
          <div class="uv-field-pair"><label>Move U<input v-model.number="moveU" aria-label="Move UV U" type="number" step="any" /></label><label>Move V<input v-model.number="moveV" aria-label="Move UV V" type="number" step="any" /></label></div>
          <button type="submit" class="uv-wide-action">Move selection</button>
        </form>
        <form class="uv-inline-action" @submit.prevent="rotateUVs(Number(rotateAngle))"><label>Angle °<input v-model.number="rotateAngle" aria-label="UV rotation angle" type="number" step="any" /></label><button type="submit">Rotate</button></form>
        <form @submit.prevent="resizeSelection">
          <div class="uv-field-pair"><label>Scale U<input v-model.number="scaleU" aria-label="UV scale U" type="number" step="any" /></label><label>Scale V<input v-model.number="scaleV" aria-label="UV scale V" :disabled="lockScale" type="number" step="any" /></label></div>
          <button type="submit" class="uv-wide-action">Scale selection</button>
        </form>
        <div class="uv-field-pair"><button @click="flipUVs('u')">Flip U</button><button @click="flipUVs('v')">Flip V</button></div>
      </fieldset>
      <fieldset v-show="precisionTab === 'tools'" :disabled="!targetCorners.length" class="uv-panel-section">
        <legend>Pixel &amp; topology tools</legend>
        <button class="uv-wide-action" @click="snapSelectionPixels">Snap corners to pixels</button>
        <div class="uv-field-pair"><button @click="alignSelection('center_h')" title="Align selected corners to the same U coordinate">Align U</button><button @click="alignSelection('center_v')" title="Align selected corners to the same V coordinate">Align V</button></div>
        <button class="uv-wide-action" @click="relaxSelection" title="Smooth selected interior UVs while preserving island boundaries and pins">Relax interiors</button>
        <p class="uv-panel-hint">Relax preserves borders and pins. Arrow keys nudge 1 pixel; Shift nudges 10.</p>
      </fieldset>
      <div v-show="precisionTab === 'tools'" class="uv-panel-section">
        <div class="uv-panel-heading"><strong>Inspect</strong><span>{{ uvIslandCount }} islands</span></div>
        <button class="uv-diagnostic" :disabled="!outsideFaces.length" @click="selectDiagnostic(outsideFaces)"><span>Outside texture</span><b>{{ outsideFaces.length }}</b></button>
        <button class="uv-diagnostic" :disabled="!degenerateFaces.length" @click="selectDiagnostic(degenerateFaces)"><span>Zero-area faces</span><b>{{ degenerateFaces.length }}</b></button>
        <div class="uv-field-pair"><button :aria-pressed="showCheckerboard" @click="showCheckerboard = !showCheckerboard">Checker</button><button :aria-pressed="showHeatmap" @click="showHeatmap = !showHeatmap">Stretch</button></div>
        <button class="uv-wide-action" :disabled="!activeMesh" @click="exportUvLayout">Export UV layout</button>
      </div>
      <p class="uv-panel-feedback" role="status" aria-live="polite">{{ uvFeedback || 'Select corners, edges, faces or islands to begin.' }}</p>
    </aside>
    </div>
    <ImportTextureModal
      v-if="showImportModal && pendingImportFile"
      :file="pendingImportFile"
      @imported="handleTextureImported"
      @close="() => { showImportModal = false; pendingImportFile = null }"
    />
    <TextureSharePrompt
      v-if="sharePromptOpen"
      :object-count="sharePromptCount"
      @confirm="confirmShareApply"
      @cancel="cancelShareApply"
    />
  </div>
</template>

<style scoped>
.uv-workbench-body { display: flex; flex: 1; min-height: 0; min-width: 0; position: relative; }
.uv-workflow-bar { display: flex; align-items: center; gap: 5px; padding: 6px 9px; background: var(--ui-bg-header); border-bottom: 1px solid var(--ui-border-subtle); overflow-x: auto; flex-shrink: 0; }
.uv-workflow-title { color: var(--ui-text-muted); font-size: 9px; font-weight: 700; letter-spacing: 1.2px; white-space: nowrap; margin-right: 8px; }
.uv-workflow-bar button, .uv-precision-panel button:not(.inspector-seg-btn) { border: 1px solid var(--ui-border-subtle); background: var(--ui-bg-input); color: var(--ui-text-secondary); border-radius: 4px; padding: 5px 7px; font-size: 10px; white-space: nowrap; cursor: pointer; }
.uv-workflow-bar button:hover:not(:disabled), .uv-precision-panel button:not(.inspector-seg-btn):hover:not(:disabled) { color: var(--ui-text-primary); background: var(--ui-bg-hover); border-color: var(--ui-border-default); }
.uv-workflow-bar button:disabled, .uv-precision-panel button:disabled, .uv-precision-panel fieldset:disabled { opacity: .45; cursor: default; }
.uv-panel-toggle { margin-left: auto; }
.uv-workflow-bar button[aria-pressed="true"], .uv-precision-panel button:not(.inspector-seg-btn)[aria-pressed="true"] { color: var(--ui-text-primary); background: var(--ui-bg-active); border-color: var(--ui-border-strong); }
.uv-precision-panel { width: 220px; flex-shrink: 0; overflow-y: auto; border-left: 1px solid var(--ui-border-strong); background: var(--ui-bg-panel); padding: 12px; color: var(--ui-text-secondary); font-size: 10px; }
.uv-panel-heading { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 9px; }
.uv-panel-heading strong, .uv-panel-section legend { color: var(--ui-text-primary); font-weight: 600; font-size: 11px; }
.uv-panel-heading span { font-size: 9px; color: var(--ui-text-muted); }
.uv-units { margin: 0 0 8px; }
.uv-panel-section { display: grid; gap: 8px; min-width: 0; margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--ui-border-subtle); }
.uv-panel-section legend { padding-right: 8px; }
.uv-precision-panel label { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.uv-precision-panel input:not([type="checkbox"]), .uv-precision-panel select { width: 100%; min-width: 0; height: 27px; padding: 4px 6px; border: 1px solid var(--ui-border-subtle); border-radius: 3px; color: var(--ui-text-primary); background: var(--ui-bg-input); }
.uv-precision-panel input:focus, .uv-precision-panel select:focus { outline: 1px solid var(--ui-text-accent); }
.uv-field-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.uv-precision-panel .uv-checkbox { flex-direction: row; align-items: center; gap: 6px; }
.uv-panel-section form { display: grid; gap: 6px; }
.uv-panel-section .uv-inline-action { grid-template-columns: 1fr auto; align-items: end; }
.uv-wide-action { width: 100%; }
.uv-panel-hint { color: var(--ui-text-muted); font-size: 9px; line-height: 1.6; margin-top: 6px; }
.uv-diagnostic { display: flex; justify-content: space-between; align-items: center; }
.uv-diagnostic b { color: var(--ui-text-primary); }
.uv-panel-feedback { color: var(--ui-text-accent); line-height: 1.6; padding-top: 12px; font-size: 10px; }
@container (max-width: 600px) {
  .uv-precision-panel { width: 190px; padding: 9px; }
  .uv-workflow-title { display: none; }
  .uv-view-group { max-width: calc(100% - 54px); overflow-x: auto; }
}

.uv-editor {
  container-type: inline-size;
}

.uv-header-row {
  height: 38px;
  min-height: 38px;
  overflow: hidden;
}

.asset-pipeline {
  min-width: 0;
  flex-shrink: 0;
}

.uv-header-divider {
  width: 1px;
  align-self: stretch;
  margin: 7px 1px;
  background: var(--ui-border-subtle);
  flex-shrink: 0;
}

/* The context selector and the selection/actions now share one quiet row.
   Texture import/export remain available from Menus instead of permanently
   consuming room in the UV workspace. */
.uv-header-actions {
  flex: 1;
  min-width: 0;
  padding: 0;
  background: transparent;
  border: 0;
  gap: 4px;
  flex-wrap: nowrap;
}

.uv-header-actions button {
  min-height: 26px;
  padding: 4px 6px;
}

.uv-header-actions .uv-component-tabs {
  flex-shrink: 0;
}

.uv-header-actions .uv-component-tabs button {
  min-height: 22px;
  padding: 3px 5px;
}

.uv-header-actions .uv-panel-toggle {
  margin-left: auto;
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

.uv-canvas-viewport {
  container-type: inline-size;
  color: var(--ui-text-secondary);
  background: var(--ui-bg-root);
  cursor: crosshair;
  user-select: none;
  touch-action: none;
}

/* Vertical Toolbar Inside UV Canvas Window */
.uv-vertical-toolbar {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 4px;
  background: color-mix(in srgb, var(--ui-bg-header) 94%, transparent);
  border: 1px solid var(--ui-border-strong);
  border-radius: 4px;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);
}

.uv-vert-tool-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.uv-vert-tool-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  color: var(--ui-text-muted);
  background: transparent;
  border: 1px solid transparent;
  transition: all 120ms ease;
  cursor: pointer;
}

.uv-vert-tool-btn:hover {
  color: var(--ui-text-primary);
  background: var(--ui-bg-hover);
  border-color: var(--ui-border-subtle);
}

.uv-vert-tool-btn.is-active {
  color: var(--ui-text-primary);
  background: var(--ui-bg-active);
  border-color: var(--ui-border-default);
}
.uv-vert-tool-btn svg [fill]:not([fill="none"]) { fill: currentColor; }
.uv-vert-tool-btn svg [stroke]:not([stroke="none"]) { stroke: currentColor; }

.uv-vert-divider {
  height: 1px;
  margin: 2px 0;
  background: var(--ui-border-subtle);
}

.uv-view-group {
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

.uv-view-toggle,
.uv-view-icon,
.uv-zoom-control {
  height: 24px;
  color: var(--ui-text-muted);
  background: var(--ui-bg-input);
  border: 1px solid var(--ui-border-subtle);
  border-radius: 3px;
}

.uv-view-toggle,
.uv-view-icon {
  padding: 0 6px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 9px;
  font-weight: 700;
}

.uv-view-toggle.is-active,
.uv-view-icon.is-active {
  color: var(--ui-text-primary);
  background: var(--ui-bg-active);
  border-color: var(--ui-border-default);
}

.uv-zoom-control {
  display: flex;
  align-items: center;
  padding: 0 2px;
}

.uv-zoom-control button {
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  color: var(--ui-text-muted);
  border-radius: 2px;
}

.uv-zoom-control button:hover {
  color: var(--ui-text-primary);
  background: var(--ui-bg-hover);
}

.uv-zoom-control span {
  min-width: 38px;
  text-align: center;
  font-size: 9px;
  font-weight: 700;
  color: var(--ui-text-secondary);
}

.uv-status-hud {
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

.uv-tool-label { font-size: 10px; white-space: nowrap; }
.uv-vert-tool-btn:has(.uv-tool-label) { width: 84px; justify-content: flex-start; gap: 7px; padding: 0 6px; }
.uv-vert-tool-group { align-items: center; }
.uv-vertical-toolbar { max-height: calc(100% - 54px); overflow-y: auto; }
.uv-status-hud { bottom: 0; left: 0; right: 0; min-height: 26px; border-radius: 0; border-width: 1px 0 0; gap: 10px; padding: 4px 10px; white-space: nowrap; overflow: hidden; }
.uv-empty-state { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; text-align: center; padding: 70px; pointer-events: none; color: var(--ui-text-muted); }
.uv-empty-state strong { color: var(--ui-text-primary); font-size: 13px; }
.uv-empty-state span { max-width: 280px; font-size: 11px; line-height: 1.6; }
.uv-header-row { overflow-x: auto; }
@container (max-width: 540px) {
  .uv-tool-label { display: none; }
  .uv-vert-tool-btn:has(.uv-tool-label) { width: 28px; justify-content: center; padding: 0; }
  .uv-view-group { right: 6px; gap: 2px; }
}
</style>

<style scoped>
.uv-editor { font-family: var(--font-sans, sans-serif); }
.uv-component-tabs { display: flex; gap: 2px; background: var(--ui-bg-input); border: 1px solid var(--ui-border-subtle); border-radius: 4px; padding: 2px; }
.uv-component-tabs button { border-color: transparent; padding: 4px 6px; }
.uv-inspector-tabs { margin: 0 0 12px; }
.uv-workflow-bar { min-height: 36px; gap: 5px; flex-wrap: wrap; padding: 4px 8px; }
.uv-vertical-toolbar > .uv-vert-tool-group:first-child { display: flex; }
.uv-vertical-toolbar > .uv-vert-divider:nth-child(2) { display: block; }
.uv-tool-label { display: none; } .uv-vert-tool-btn:has(.uv-tool-label) { width: 28px; justify-content: center; padding: 0; }
.uv-vertical-toolbar { background: color-mix(in srgb, var(--ui-bg-panel) 90%, transparent); border-color: var(--ui-border-subtle); }
.uv-precision-panel { width: 210px; padding: 10px; }
.uv-panel-section { margin-top: 10px; padding-top: 10px; }
.uv-header-row { min-height: 38px; height: 38px; }
.uv-header-actions { min-height: 0; flex-wrap: nowrap; padding: 0; }
@container (max-width: 700px) { .uv-precision-panel { width: 190px; padding: 8px; } }
</style>
