<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, watch, computed } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { useToolStore } from '../../stores/toolStore'
import { 
  boxUnwrap, 
  planarUnwrap, 
  cylinderUnwrap, 
  sphereUnwrap, 
  coneUnwrap, 
  cubemapCrossUnwrap, 
  packUVIslands,
  gridifyQuadIslands,
  equalizeTexelDensity,
  sampleFaceTexelDensity,
  calculateUVDistortion,
  generateUVCheckerboardDataURL,
  ensureMeshUVs
} from '../../core/geometry/UVUnwrap'
import BlenderIcon from '../icons/BlenderIcon.vue'
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  RotateCcw, 
  FlipHorizontal, 
  FlipVertical, 
  Grid, 
  Magnet, 
  Upload, 
  Download, 
  Maximize,
  Plus
} from 'lucide-vue-next'
import { SeamUnwrapper } from '../../core/uv/SeamUnwrapper'
import { expandFacesToIslands, expandWeldedUvEdges, findUvIslands, stitchUvEdge } from '../../core/uv/UVIslands'
import type { MeshObject } from '../../types/mesh'
import TextureSharePrompt from '../modals/TextureSharePrompt.vue'
import ImportTextureModal from '../modals/ImportTextureModal.vue'
import { useTextureApply } from '../../composables/useTextureApply'

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
const paintAtlas = computed(() => projectStore.activeTexture?.atlas || null)
const atlasMenuCells = computed(() => {
  const a = paintAtlas.value || { cols: 2, rows: 2 }
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

// Sync selected vertices from 3D viewport
watch(() => projectStore.selectedVertexIds, (newVal) => {
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
  const faces = uvSelectMode.value === 'island'
    ? expandFacesToIslands(activeMesh.value, [faceIndex])
    : [faceIndex]
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
const selectionBounds = computed(() => {
  if (!activeMesh.value) return null
  const targetFaces = getTargetFaces()
  if (targetFaces.length === 0) return null

  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity
  let count = 0

  for (const fIdx of targetFaces) {
    const face = activeMesh.value.faces[fIdx]
    if (!face) continue
    for (const uv of face.uvs) {
      if (uv.u < minU) minU = uv.u
      if (uv.u > maxU) maxU = uv.u
      if (uv.v < minV) minV = uv.v
      if (uv.v > maxV) maxV = uv.v
      count++
    }
  }

  if (count === 0 || !isFinite(minU)) return null
  const w = Math.max(0.0001, maxU - minU)
  const h = Math.max(0.0001, maxV - minV)
  return {
    minU,
    maxU,
    minV,
    maxV,
    cU: (minU + maxU) / 2,
    cV: (minV + maxV) / 2,
    width: w,
    height: h
  }
})

// ----------------------------------------------------
// COORDINATE CONVERSIONS (Infinite Staging Canvas)
// ----------------------------------------------------
function uvToScreen(u: number, v: number): { x: number; y: number } {
  const pb = projectStore.pixelBuffer
  const texW = pb.width * zoom.value
  const texH = pb.height * zoom.value
  return {
    x: panOffset.value.x + u * texW,
    y: panOffset.value.y + (1 - v) * texH
  }
}

function screenToUV(screenX: number, screenY: number): { u: number; v: number } {
  const pb = projectStore.pixelBuffer
  const texW = pb.width * zoom.value
  const texH = pb.height * zoom.value
  let u = (screenX - panOffset.value.x) / texW
  let v = 1 - (screenY - panOffset.value.y) / texH

  if (snapToPixels.value) {
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

  const pb = projectStore.pixelBuffer
  if (activeMesh.value) {
    ensureMeshUVs(activeMesh.value)
  }

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

  // 2. Draw Active Central 0..1 Texture (or Checkerboard Test Grid)
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)'
  ctx.shadowBlur = 8
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 2
  if (showCheckerboard.value && checkerboardImage.value) {
    ctx.drawImage(checkerboardImage.value, ox, oy, texW, texH)
  } else {
    ctx.drawImage(pb.canvas, ox, oy, texW, texH)
  }
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0

  // 0..1 Texture Frame
  ctx.strokeStyle = '#4f46e5'
  ctx.lineWidth = 1.5
  ctx.strokeRect(ox, oy, texW, texH)

  const atlasGrid = projectStore.activeTexture?.atlas
  if (atlasGrid && (atlasGrid.cols > 1 || atlasGrid.rows > 1)) {
    ctx.save()
    ctx.setLineDash([4, 4])
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)'
    ctx.lineWidth = 1
    for (let c = 1; c < atlasGrid.cols; c++) {
      const x = ox + (texW * c) / atlasGrid.cols
      ctx.beginPath()
      ctx.moveTo(x, oy)
      ctx.lineTo(x, oy + texH)
      ctx.stroke()
    }
    for (let r = 1; r < atlasGrid.rows; r++) {
      const y = oy + (texH * r) / atlasGrid.rows
      ctx.beginPath()
      ctx.moveTo(ox, y)
      ctx.lineTo(ox + texW, y)
      ctx.stroke()
    }
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
    ensureMeshUVs(otherMesh)

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
  if (clickedFace !== null && !e.ctrlKey) {
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
    const deltaU = uv.u - dragStartMouse.u
    const deltaV = uv.v - dragStartMouse.v
    applyUVTransform((origU, origV) => ({
      u: origU + deltaU,
      v: origV + deltaV
    }))
  }

  // Drag UV Vertices
  else if (activeDrag === 'drag_vert') {
    const deltaU = uv.u - dragStartMouse.u
    const deltaV = uv.v - dragStartMouse.v
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
    const deltaU = uv.u - dragStartMouse.u
    const deltaV = uv.v - dragStartMouse.v
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
      const du = origU - b.cU
      const dv = origV - b.cV
      return {
        u: b.cU + (du * cos - dv * sin),
        v: b.cV + (du * sin + dv * cos)
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

  const pb = projectStore.pixelBuffer
  // Fit texture into ~78% of available viewport area
  const targetW = w * 0.78
  const targetH = h * 0.78
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
  projectStore.selectedVertexIds = vertIds
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
  const targetFaces = getTargetFaces()
  targetFaces.forEach(fIdx => {
    const face = activeMesh.value!.faces[fIdx]
    if (!face) return
    face.uvs.forEach((uv, vIdx) => {
      dragStartUvs.push({
        faceIndex: fIdx,
        vertIndex: vIdx,
        origU: uv.u,
        origV: uv.v
      })
    })
  })
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
    if (blob) {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${projectStore.projectName}_uv_texture.png`
      a.click()
      URL.revokeObjectURL(url)
    }
  })
}

// ----------------------------------------------------
// ACTIVE MESH, MATERIAL & TEXTURE BINDINGS
// ----------------------------------------------------
const showNewTextureModal = ref(false)
const newTextureName = ref('')
const newTextureSize = ref<number>(64)

function bindTextureToActiveObject(textureId: string) {
  const mesh = projectStore.activeMesh
  if (!mesh) {
    projectStore.selectTexture(textureId)
    return
  }
  projectStore.applyTextureToMesh(mesh.id, textureId, 'this_object')
}

function handleTextureBindingChange(newTexId: string) {
  bindTextureToActiveObject(newTexId)
  scheduleRender()
}

function handleCreateNewTexture() {
  const name = newTextureName.value.trim() || `Texture_${projectStore.textures.length + 1}`
  const tex = projectStore.createTexture(name, newTextureSize.value, newTextureSize.value)
  if (projectStore.activeMesh) {
    projectStore.applyTextureToMesh(projectStore.activeMesh.id, tex.id, 'this_object')
  }
  showNewTextureModal.value = false
  newTextureName.value = ''
  scheduleRender()
}

function handleApplyPaintTargetToMesh() {
  if (!projectStore.activeTexture || !projectStore.activeMesh) return
  applyToActiveMesh(projectStore.activeTexture.id)
}

// ----------------------------------------------------
// QUICK TRANSFORMS & ATLAS SNAPPING
// ----------------------------------------------------
function rotateUVs(angleDeg: number) {
  const b = selectionBounds.value
  if (!b) return
  projectStore.recordState(`Rotate UVs ${angleDeg}°`)
  const rad = (angleDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)

  applyBulkTransform((u, v) => {
    const du = u - b.cU
    const dv = v - b.cV
    return {
      u: b.cU + (du * cos - dv * sin),
      v: b.cV + (du * sin + dv * cos)
    }
  })
}

function flipUVs(axis: 'u' | 'v') {
  const b = selectionBounds.value
  if (!b) return
  projectStore.recordState(`Flip UVs ${axis.toUpperCase()}`)
  applyBulkTransform((u, v) => ({
    u: axis === 'u' ? b.cU - (u - b.cU) : u,
    v: axis === 'v' ? b.cV - (v - b.cV) : v
  }))
}

function scaleUVs(factor: number) {
  const b = selectionBounds.value
  if (!b) return
  projectStore.recordState(`Scale UVs ${factor}x`)
  applyBulkTransform((u, v) => ({
    u: b.cU + (u - b.cU) * factor,
    v: b.cV + (v - b.cV) * factor
  }))
}

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
  if (!activeMesh.value) return
  projectStore.recordState('Fit UV to Full 0..1 Space')
  if (getTargetFaces().length === 0) {
    selectedFaceIndices.value = activeMesh.value.faces.map((_, i) => i)
    fitSelectionToRange(0, 1, 0, 1)
    selectedFaceIndices.value = []
    return
  }
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
    const tu = (u - b.minU) / b.width
    const tv = (v - b.minV) / b.height
    return {
      u: minU + tu * (maxU - minU),
      v: minV + tv * (maxV - minV)
    }
  })
}

function applyBulkTransform(fn: (u: number, v: number) => { u: number; v: number }) {
  if (!activeMesh.value) return
  const targetFaces = getTargetFaces()
  targetFaces.forEach(fIdx => {
    const face = activeMesh.value!.faces[fIdx]
    if (!face) return
    face.uvs.forEach((uv, vIdx) => {
      if (isPinned(fIdx, vIdx)) return
      const res = fn(uv.u, uv.v)
      uv.u = res.u
      uv.v = res.v
    })
  })
  projectStore.markGeometryUpdated()
  scheduleRender()
}

// ----------------------------------------------------
// UNIVERSAL UNWRAPPING ACTIONS
// ----------------------------------------------------
function commitUnwrappedFaces(result: MeshObject, onlySelected: boolean) {
  if (!activeMesh.value) return
  const targets = getTargetFaces()
  if (onlySelected && targets.length > 0) {
    const targetSet = new Set(targets)
    for (const i of targetSet) {
      if (result.faces[i]) activeMesh.value.faces[i].uvs = result.faces[i].uvs
    }
  } else {
    activeMesh.value.faces = result.faces
  }
  projectStore.markGeometryUpdated()
  scheduleRender()
}

function handleSeamUnwrap() {
  if (!activeMesh.value) return
  projectStore.recordState('Unwrap Along Seams')
  SeamUnwrapper.unwrapMesh(activeMesh.value)
  projectStore.markGeometryUpdated()
  scheduleRender()
}

function handleBoxUnwrap() {
  if (!activeMesh.value) return
  projectStore.recordState('Box Unwrap')
  commitUnwrappedFaces(boxUnwrap(activeMesh.value), true)
}

function handlePlanarUnwrap(axis: 'x' | 'y' | 'z') {
  if (!activeMesh.value) return
  projectStore.recordState(`Planar Unwrap (${axis.toUpperCase()})`)
  commitUnwrappedFaces(planarUnwrap(activeMesh.value, axis), true)
}

function handleCylinderUnwrap() {
  if (!activeMesh.value) return
  projectStore.recordState('Cylindrical Unwrap')
  commitUnwrappedFaces(cylinderUnwrap(activeMesh.value), true)
}

function handleSphereUnwrap() {
  if (!activeMesh.value) return
  projectStore.recordState('Spherical Unwrap')
  commitUnwrappedFaces(sphereUnwrap(activeMesh.value), true)
}

function handleConeUnwrap() {
  if (!activeMesh.value) return
  projectStore.recordState('Conical Fan Unwrap')
  commitUnwrappedFaces(coneUnwrap(activeMesh.value), true)
}

function handleCubemapCross() {
  if (!activeMesh.value) return
  projectStore.recordState('Cubemap Cross Unwrap')
  commitUnwrappedFaces(cubemapCrossUnwrap(activeMesh.value), true)
}

function handlePackIslands(marginPx = 2) {
  if (!activeMesh.value) return
  const selected = getTargetFaces()
  projectStore.recordState(
    selected.length > 0
      ? `Pack Selected UV Islands (${marginPx}px)`
      : `Auto-Pack UV Islands (${marginPx}px)`
  )
  const unwrapped = packUVIslands(
    activeMesh.value,
    marginPx,
    projectStore.pixelBuffer.width,
    selected.length > 0 ? selected : undefined
  )
  activeMesh.value.faces = unwrapped.faces
  projectStore.markGeometryUpdated()
  scheduleRender()
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
  const corners: { faceIndex: number; vertIndex: number }[] = []
  if (selectedUvVerts.value.length > 0) {
    corners.push(...selectedUvVerts.value)
  } else if (selectedUvEdges.value.length > 0) {
    for (const se of selectedUvEdges.value) {
      const face = activeMesh.value?.faces[se.faceIndex]
      if (!face) continue
      corners.push({ faceIndex: se.faceIndex, vertIndex: se.edgeIndex })
      corners.push({ faceIndex: se.faceIndex, vertIndex: (se.edgeIndex + 1) % face.uvs.length })
    }
  } else {
    for (const fIdx of getTargetFaces()) {
      const face = activeMesh.value?.faces[fIdx]
      face?.uvs.forEach((_, vIdx) => corners.push({ faceIndex: fIdx, vertIndex: vIdx }))
    }
  }
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

  let welded = 0
  projectStore.recordState('Weld Selected UVs')
  for (const corners of groups.values()) {
    if (corners.length < 2) continue
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
    welded++
  }
  if (welded === 0) return
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
  const texW = projectStore.pixelBuffer.width
  const texH = projectStore.pixelBuffer.height
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
  projectStore.recordState('Gridify Quad Loops')
  const targetFaces = getTargetFaces()
  const unwrapped = gridifyQuadIslands(activeMesh.value, targetFaces)
  activeMesh.value.faces = unwrapped.faces
  projectStore.markGeometryUpdated()
  scheduleRender()
}

function handleEqualizeTexels() {
  if (!activeMesh.value) return
  projectStore.recordState('Equalize Texel Density')
  const unwrapped = equalizeTexelDensity(activeMesh.value)
  activeMesh.value.faces = unwrapped.faces
  projectStore.markGeometryUpdated()
  scheduleRender()
}

function alignSelection(alignment: 'left' | 'right' | 'top' | 'bottom' | 'center_h' | 'center_v') {
  if (!activeMesh.value || !selectionBounds.value) return
  projectStore.recordState(`Align UVs (${alignment})`)
  const b = selectionBounds.value
  const targetFaces = getTargetFaces()

  for (const fIdx of targetFaces) {
    const face = activeMesh.value.faces[fIdx]
    if (!face) continue
    for (let vIdx = 0; vIdx < face.uvs.length; vIdx++) {
      if (isPinned(fIdx, vIdx)) continue
      const uv = face.uvs[vIdx]
      if (alignment === 'left') uv.u = b.minU
      else if (alignment === 'right') uv.u = b.maxU
      else if (alignment === 'top') uv.v = b.maxV
      else if (alignment === 'bottom') uv.v = b.minV
      else if (alignment === 'center_h') uv.u = b.cU
      else if (alignment === 'center_v') uv.v = b.cV
    }
  }
  projectStore.markGeometryUpdated()
  scheduleRender()
}

function snapToTrimCell(col: number, row: number, totalCols: number, totalRows: number) {
  if (!activeMesh.value || !selectionBounds.value) return
  projectStore.recordState(`Snap to Trim (${col + 1}, ${row + 1})`)
  const b = selectionBounds.value
  const targetFaces = getTargetFaces()

  const cellW = 1.0 / totalCols
  const cellH = 1.0 / totalRows
  const targetU0 = col * cellW
  const targetV0 = 1.0 - (row + 1) * cellH

  for (const fIdx of targetFaces) {
    const face = activeMesh.value.faces[fIdx]
    if (!face) continue
    for (let vIdx = 0; vIdx < face.uvs.length; vIdx++) {
      if (isPinned(fIdx, vIdx)) continue
      const uv = face.uvs[vIdx]
      const normU = (uv.u - b.minU) / b.width
      const normV = (uv.v - b.minV) / b.height
      uv.u = Math.max(0, Math.min(1, targetU0 + normU * cellW))
      uv.v = Math.max(0, Math.min(1, targetV0 + normV * cellH))
    }
  }
  projectStore.markGeometryUpdated()
  scheduleRender()
}

watch(() => projectStore.textureRevision, scheduleRender)
watch(() => projectStore.activeTextureId, scheduleRender)
watch(() => projectStore.geometryRevision, scheduleRender)
watch(zoom, scheduleRender)
watch(showPixelGrid, scheduleRender)
watch(() => projectStore.activeMeshId, () => {
  selectedFaceIndices.value = []
  selectedUvVerts.value = []
  selectedUvEdges.value = []
  pinnedUvKeys.value = new Set()
  publishUvHover(null)
  nextTick(() => {
    scheduleRender()
  })
})
watch(() => projectStore.meshes, scheduleRender, { deep: true })
watch(() => projectStore.selectedFaceIds, scheduleRender)
watch(() => projectStore.selectedVertexIds, scheduleRender)
watch(() => projectStore.selectedEdgeIds, scheduleRender)
watch(showCheckerboard, scheduleRender)
watch(showHeatmap, scheduleRender)

watch(() => toolStore.uvWorkspaceTab, (tab) => {
  if (tab === 'uv') {
    nextTick(() => {
      scheduleRender()
    })
  }
})

let resizeObserver: ResizeObserver | null = null

function onUvKeyDown(e: KeyboardEvent) {
  if (toolStore.appMode !== 'uvpaint' || toolStore.uvWorkspaceTab !== 'uv') return
  const tag = (e.target as HTMLElement)?.tagName
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return
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
}

function onUvKeyUp(e: KeyboardEvent) {
  if (e.code === 'Space') spaceHeld = false
}

onMounted(() => {
  window.addEventListener('click', closeDropdowns)
  window.addEventListener('keydown', onUvKeyDown)
  window.addEventListener('keyup', onUvKeyUp)
  // Generate high-contrast numbered calibration test grid
  const img = new Image()
  img.src = generateUVCheckerboardDataURL(512)
  img.onload = () => {
    checkerboardImage.value = img
    scheduleRender()
  }

  if (containerRef.value) {
    if (containerRef.value.clientWidth > 0) {
      panOffset.value = {
        x: Math.max(16, (containerRef.value.clientWidth - 64 * zoom.value) / 2),
        y: Math.max(16, (containerRef.value.clientHeight - 64 * zoom.value) / 2)
      }
    }
    if (window.ResizeObserver) {
      resizeObserver = new ResizeObserver(() => {
        scheduleRender()
      })
      resizeObserver.observe(containerRef.value)
    }
  }
  scheduleRender()
})

onUnmounted(() => {
  window.removeEventListener('click', closeDropdowns)
  window.removeEventListener('keydown', onUvKeyDown)
  window.removeEventListener('keyup', onUvKeyUp)
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

    <!-- 1. ROW 1: WORKSPACE TABS & UNIFIED 3D ASSET BINDING HIERARCHY -->
    <div class="uv-header-row-1 bg-ui-header border-b border-ui-borderSubtle px-2 flex items-center justify-between gap-2 shrink-0 z-30 select-none h-8.5 min-h-[34px]">
      <!-- Left: Workspace Switcher Tabs -->
      <div class="workspace-tabs flex items-center bg-ui-input p-0.5 rounded-xs border border-ui-borderSubtle shrink-0">
        <button 
          @click="toolStore.uvWorkspaceTab = 'uv'"
          class="flex items-center space-x-1.5 px-2.5 py-0.5 rounded-xs text-[10px] font-bold transition cursor-pointer"
          :class="toolStore.uvWorkspaceTab === 'uv' ? 'bg-ui-accent text-white shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="UV Unwrapping, Seams & Quadrant Atlas Mapping"
        >
          <BlenderIcon name="uv" :size="12" />
          <span>UV</span>
        </button>

        <button 
          @click="toolStore.uvWorkspaceTab = 'paint'"
          class="flex items-center space-x-1.5 px-2.5 py-0.5 rounded-xs text-[10px] font-bold transition cursor-pointer"
          :class="toolStore.uvWorkspaceTab === 'paint' ? 'bg-ui-accent text-white shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Pixel & Texture Paint Studio"
        >
          <BlenderIcon name="brush" :size="11" />
          <span>Paint</span>
        </button>
      </div>

      <!-- Center: Unified Asset Pipeline Hierarchy (OBJ -> MAT -> TEX) -->
      <div class="asset-pipeline flex items-center gap-1.5 shrink-0 overflow-x-auto">
        <!-- 1. Active 3D Object -->
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

        <span class="text-ui-textMuted text-[9px] font-bold shrink-0">→</span>

        <!-- Paint target (not a mesh bind) -->
        <div class="flex items-center gap-1 px-1.5 py-0.5 rounded-xs bg-ui-input border border-ui-borderSubtle text-[10px] text-ui-textSecondary shrink-0">
          <span class="text-ui-textMuted font-bold text-[8.5px]">TEX:</span>
          <select 
            :value="projectStore.activeTextureId" 
            @change="handleTextureBindingChange(($event.target as HTMLSelectElement).value)"
            class="bg-transparent text-emerald-400 font-bold font-mono focus:outline-none cursor-pointer max-w-[125px] truncate"
            title="Paint target — the image this UV editor shows"
          >
            <option v-for="t in projectStore.textures" :key="t.id" :value="t.id" class="bg-ui-panel text-ui-textPrimary">
              {{ t.name }} ({{ t.width }}x{{ t.height }})
            </option>
          </select>
          <button
            type="button"
            class="px-1 py-0.5 text-[8.5px] font-bold text-sky-300 hover:bg-ui-hover rounded-xs"
            title="Apply this paint target to the active object"
            @click="handleApplyPaintTargetToMesh"
          >
            Apply
          </button>
          <button 
            @click="showNewTextureModal = true"
            class="p-0.5 hover:bg-ui-hover text-emerald-400 rounded-xs transition cursor-pointer"
            title="Create a new texture (paint target only)"
          >
            <Plus class="w-3 h-3" />
          </button>
        </div>

        <!-- Texture Import / Export Action Pill Group -->
        <div class="flex items-center bg-ui-input p-0.5 rounded-xs border border-ui-borderSubtle shrink-0">
          <button 
            @click="fileInputRef?.click()" 
            class="flex items-center gap-1 px-2 py-0.5 hover:bg-ui-hover text-ui-textAccent rounded-xs text-[10px] font-bold transition cursor-pointer whitespace-nowrap"
            title="Add an image to the library (does not replace the current map)"
          >
            <Upload class="w-3 h-3 text-ui-accent" />
            <span>Import</span>
          </button>

          <button 
            @click="exportTexturePng" 
            class="flex items-center gap-1 px-2 py-0.5 hover:bg-ui-hover text-emerald-400 rounded-xs text-[10px] font-bold transition cursor-pointer whitespace-nowrap"
            title="Export UV Texture PNG"
          >
            <Download class="w-3 h-3 text-emerald-400" />
            <span>Export</span>
          </button>
        </div>
      </div>

      <!-- Right: Active Resolution & Canvas Readout -->
      <div class="asset-resolution flex items-center gap-1.5 shrink-0">
        <div class="px-2 py-0.5 rounded-xs bg-ui-input border border-ui-borderSubtle text-[10px] font-mono text-ui-textMuted flex items-center gap-1">
          <span class="text-[9px] text-ui-textMuted font-bold">RES:</span>
          <span class="text-amber-300 font-bold">{{ projectStore.pixelBuffer.width }}×{{ projectStore.pixelBuffer.height }}</span>
        </div>
      </div>
    </div>

    <!-- 2. ROW 2: DCC MENUS & VIEW CONTROLS -->
    <div class="uv-header-row-2 bg-ui-panel border-b border-ui-borderSubtle px-2 flex items-center justify-between gap-2 shrink-0 z-20 select-none h-8 min-h-[32px] overflow-visible">
      <!-- Left: DCC Dropdown Menus -->
      <div class="flex items-center gap-1 shrink-0">
        <!-- Texture Menu Dropdown -->
        <div class="relative" @click.stop>
          <button 
            @click="toggleDropdown('texture')"
            class="px-2 py-1 text-xs font-semibold rounded-xs transition cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0"
            :class="activeDropdown === 'texture' ? 'bg-ui-hover text-emerald-400 shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
          >
            <span>Texture</span>
            <span class="text-[8px] opacity-70">▼</span>
          </button>

          <div v-if="activeDropdown === 'texture'" class="header-dropdown-menu absolute left-0 top-full mt-1 w-56 bg-ui-panel text-ui-textPrimary border border-ui-borderStrong rounded-xs shadow-2xl py-1 z-50 text-xs">
            <button @click="fileInputRef?.click(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between text-ui-textAccent font-bold">
              <span>Import Image...</span>
              <Upload class="w-3 h-3 text-ui-accent" />
            </button>
            <button @click="exportTexturePng(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between text-emerald-400 font-bold">
              <span>Export Texture PNG</span>
              <Download class="w-3 h-3 text-emerald-400" />
            </button>
            <div class="h-px bg-ui-borderSubtle my-1"></div>
            <button @click="showNewTextureModal = true; closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between text-amber-300 font-medium">
              <span>+ New Texture Map...</span>
            </button>
            <button @click="projectStore.bakeSceneAtlas(2); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between text-amber-400 font-bold">
              <span>Bake Scene Atlas</span>
            </button>
          </div>
        </div>

        <!-- UV Menu Dropdown -->
        <div class="relative" @click.stop>
          <button 
            @click="toggleDropdown('uv')"
            class="px-2 py-1 text-xs font-semibold rounded-xs transition cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0"
            :class="activeDropdown === 'uv' ? 'bg-ui-hover text-ui-textAccent shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
          >
            <span>UV</span>
            <span class="text-[8px] opacity-70">▼</span>
          </button>

          <div v-if="activeDropdown === 'uv'" class="header-dropdown-menu absolute left-0 top-full mt-1 w-56 bg-ui-panel text-ui-textPrimary border border-ui-borderStrong rounded-xs shadow-2xl py-1 z-50 text-xs">
            <button @click="handleSeamUnwrap(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between text-amber-400 font-bold">
              <span>Unwrap Along Seams (LSCM)</span>
              <span class="text-[10px] text-ui-textMuted font-mono font-normal">U</span>
            </button>
            <button @click="handleBoxUnwrap(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
              <span>Smart Box Unwrap</span>
              <span class="text-[9px] text-ui-textMuted">sel or all</span>
            </button>
            <button @click="handleCubemapCross(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between text-ui-textAccent">
              <span>Cubemap Cross (Blockbench)</span>
            </button>
            <div class="h-px bg-ui-borderSubtle my-1"></div>
            <button @click="handleCylinderUnwrap(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover">
              <span>Cylinder (Tube + Caps)</span>
            </button>
            <button @click="handleSphereUnwrap(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover">
              <span>Sphere (Equirectangular)</span>
            </button>
            <button @click="handleConeUnwrap(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover">
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
            :class="activeDropdown === 'islands' ? 'bg-ui-hover text-emerald-400 shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
          >
            <span>Islands</span>
            <span class="text-[8px] opacity-70">▼</span>
          </button>

          <div v-if="activeDropdown === 'islands'" class="header-dropdown-menu absolute left-0 top-full mt-1 w-60 bg-ui-panel text-ui-textPrimary border border-ui-borderStrong rounded-xs shadow-2xl py-1 z-50 text-xs">
            <button @click="handlePackIslands(2); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between text-emerald-400 font-bold">
              <span>Auto-Pack Islands (2px Margin)</span>
            </button>
            <button @click="handlePackIslands(0); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
              <span>Auto-Pack Islands (0px Tight)</span>
            </button>
            <button @click="handlePackIslands(4); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
              <span>Auto-Pack Islands (4px Margin)</span>
            </button>
            <div class="h-px bg-ui-borderSubtle my-1"></div>
            <button @click="projectStore.bakeSceneAtlas(2); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover text-amber-400 font-bold">
              <span>Bake Scene Atlas (All Meshes)</span>
            </button>
            <div class="h-px bg-ui-borderSubtle my-1"></div>
            <button @click="handleGridify(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover text-ui-textAccent">
              <span>Gridify Quad Loops</span>
            </button>
            <button @click="handleEqualizeTexels(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover text-sky-400">
              <span>Equalize Texel Density</span>
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
            :class="activeDropdown === 'align' ? 'bg-ui-hover text-ui-textAccent shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
          >
            <span class="whitespace-nowrap">Align & Snap</span>
            <span class="text-[8px] opacity-70">▼</span>
          </button>

          <div v-if="activeDropdown === 'align'" class="header-dropdown-menu absolute left-0 top-full mt-1 w-56 bg-ui-panel text-ui-textPrimary border border-ui-borderStrong rounded-xs shadow-2xl py-1 z-50 text-xs">
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
            <button @click="snapToFull(); closeDropdowns()" class="w-full text-left px-3 py-1 hover:bg-ui-hover text-amber-400 font-bold">Fit to Full (0..1)</button>
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
            :class="activeDropdown === 'texel' ? 'bg-ui-hover text-ui-textAccent shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
          >
            <span class="whitespace-nowrap">Texel</span>
            <span class="text-[8px] opacity-70">▼</span>
          </button>

          <div v-if="activeDropdown === 'texel'" class="header-dropdown-menu absolute left-0 top-full mt-1 w-60 bg-ui-panel text-ui-textPrimary border border-ui-borderStrong rounded-xs shadow-2xl p-2 z-50 text-xs space-y-2">
            <div class="flex items-center justify-between border-b border-ui-borderSubtle pb-1">
              <span class="text-[10px] font-bold text-amber-300 uppercase">Texel Density (px/unit)</span>
              <span v-if="sampledDensity !== null" class="text-[10px] font-mono text-emerald-400 font-bold">{{ sampledDensity }} px/u</span>
            </div>

            <div class="flex items-center gap-1.5">
              <label class="text-[10px] text-ui-textMuted font-mono">Target:</label>
              <input 
                type="number" 
                min="1" 
                max="256" 
                v-model.number="targetTexelDensity" 
                class="flex-1 bg-ui-input border border-ui-borderSubtle rounded-xs px-2 py-0.5 text-xs font-mono text-ui-textPrimary focus:outline-none focus:border-amber-400"
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
                class="px-2 py-1 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xs text-[10px] transition text-center shadow-xs"
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

          <div v-if="activeDropdown === 'view'" class="header-dropdown-menu absolute left-0 top-full mt-1 w-52 bg-ui-panel text-ui-textPrimary border border-ui-borderStrong rounded-xs shadow-2xl py-1 z-50 text-xs">
            <button @click="showCheckerboard = !showCheckerboard; closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
              <span>Checkerboard Grid</span>
              <span class="text-amber-400 font-bold">{{ showCheckerboard ? 'ON' : 'OFF' }}</span>
            </button>
            <button @click="showHeatmap = !showHeatmap; closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
              <span>UV Stretch Heatmap</span>
              <span class="text-amber-400 font-bold">{{ showHeatmap ? 'ON' : 'OFF' }}</span>
            </button>
            <div class="h-px bg-ui-borderSubtle my-1"></div>
            <button @click="showPixelGrid = !showPixelGrid; closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
              <span>Pixel Grid Lines</span>
              <span class="text-amber-400 font-bold">{{ showPixelGrid ? 'ON' : 'OFF' }}</span>
            </button>
            <button @click="snapToPixels = !snapToPixels; closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
              <span>Snap to Pixels</span>
              <span class="text-amber-400 font-bold">{{ snapToPixels ? 'ON' : 'OFF' }}</span>
            </button>
            <div class="h-px bg-ui-borderSubtle my-1"></div>
            <button @click="resetPanZoom(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between text-ui-textAccent">
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

      <!-- Right: Diagnostic Toggles -->
      <div class="flex items-center gap-1 shrink-0">
        <button 
          @click="showCheckerboard = !showCheckerboard" 
          class="flex items-center space-x-1 px-1.5 py-0.5 rounded-xs text-[10px] font-bold border transition cursor-pointer whitespace-nowrap"
          :class="showCheckerboard ? 'bg-ui-active text-ui-textAccent border-ui-accent/40 shadow-xs' : 'bg-ui-input text-ui-textMuted border-ui-borderSubtle hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Toggle Calibration Checkerboard Test Grid"
        >
          <span>Checkerboard</span>
        </button>

        <button 
          @click="showHeatmap = !showHeatmap" 
          class="flex items-center space-x-1 px-1.5 py-0.5 rounded-xs text-[10px] font-bold border transition cursor-pointer whitespace-nowrap"
          :class="showHeatmap ? 'bg-ui-active text-ui-textAccent border-ui-accent/40 shadow-xs' : 'bg-ui-input text-ui-textMuted border-ui-borderSubtle hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Toggle UV Stretch & Distortion Heatmap"
        >
          <span>Heatmap</span>
        </button>
      </div>
    </div>

    <!-- Mini-Modal: Create New Texture -->
    <div v-if="showNewTextureModal" class="absolute inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div class="bg-ui-panel border border-ui-borderStrong rounded-xs shadow-2xl p-3 w-80 space-y-3" @click.stop>
        <div class="flex items-center justify-between border-b border-ui-borderSubtle pb-1.5">
          <span class="text-xs font-bold text-amber-300 uppercase">Create New Texture Map</span>
          <button @click="showNewTextureModal = false" class="text-ui-textMuted hover:text-white transition">✕</button>
        </div>

        <div class="space-y-1">
          <label class="text-[10px] text-ui-textMuted font-bold uppercase">Texture Name:</label>
          <input 
            v-model="newTextureName" 
            placeholder="e.g. Character_Armor_64" 
            class="w-full bg-ui-input border border-ui-borderSubtle rounded-xs px-2 py-1 text-ui-textPrimary text-xs focus:outline-none focus:border-amber-400 font-mono"
          />
        </div>

        <div class="space-y-1">
          <label class="text-[10px] text-ui-textMuted font-bold uppercase">Resolution:</label>
          <div class="grid grid-cols-3 gap-1">
            <button 
              v-for="s in [16, 32, 64, 128, 256, 512]" 
              :key="s"
              @click="newTextureSize = s"
              class="py-1 text-center rounded-xs border text-[10px] font-mono transition cursor-pointer"
              :class="newTextureSize === s ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-bold' : 'bg-ui-input text-ui-textSecondary border-ui-borderSubtle hover:bg-ui-hover'"
            >
              {{ s }} × {{ s }}
            </button>
          </div>
        </div>

        <div class="flex gap-1 pt-1">
          <button 
            @click="handleCreateNewTexture"
            class="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xs text-xs font-bold transition cursor-pointer shadow-xs"
          >
            Create
          </button>
          <button 
            @click="showNewTextureModal = false"
            class="px-3 py-1.5 bg-ui-input hover:bg-ui-hover text-ui-textSecondary rounded-xs text-xs transition cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>

    <!-- 3. INFINITE STAGING CANVAS VIEWPORT -->
    <div 
      ref="containerRef" 
      class="uv-canvas-viewport relative flex-1 min-h-0 overflow-hidden"
      @wheel="onWheel"
    >
      <!-- Vertical Selection & Quick Actions Toolbar (Docked Inside Canvas Left) -->
      <div class="uv-vertical-toolbar" aria-label="UV Selection & Quick Tools">
        <!-- UV Selection Modes -->
        <div class="uv-vert-tool-group">
          <button 
            @click="uvSelectMode = 'vertex'"
            class="uv-vert-tool-btn"
            :class="{ 'is-active': uvSelectMode === 'vertex' }"
            title="Vertex Select (1)"
          >
            <BlenderIcon name="vertex-select" :size="15" />
          </button>
          <button 
            @click="uvSelectMode = 'edge'"
            class="uv-vert-tool-btn"
            :class="{ 'is-active': uvSelectMode === 'edge' }"
            title="Edge Select (2)"
          >
            <BlenderIcon name="edge-select" :size="15" />
          </button>
          <button 
            @click="uvSelectMode = 'face'"
            class="uv-vert-tool-btn"
            :class="{ 'is-active': uvSelectMode === 'face' }"
            title="Face Select (3)"
          >
            <BlenderIcon name="face-select" :size="15" />
          </button>
          <button 
            @click="uvSelectMode = 'island'"
            class="uv-vert-tool-btn"
            :class="{ 'is-active': uvSelectMode === 'island' }"
            title="Island Select (4)"
          >
            <BlenderIcon name="object-mode" :size="15" />
          </button>
        </div>

        <div class="uv-vert-divider"></div>

        <!-- Quick Transform & UV Operations -->
        <div class="uv-vert-tool-group">
          <button @click="rotateUVs(-90)" class="uv-vert-tool-btn" title="Rotate 90° CCW">
            <RotateCcw class="w-3.5 h-3.5" />
          </button>
          <button @click="rotateUVs(90)" class="uv-vert-tool-btn" title="Rotate 90° CW">
            <RotateCw class="w-3.5 h-3.5" />
          </button>
          <button @click="flipUVs('u')" class="uv-vert-tool-btn" title="Flip Horizontal">
            <FlipHorizontal class="w-3.5 h-3.5" />
          </button>
          <button @click="flipUVs('v')" class="uv-vert-tool-btn" title="Flip Vertical">
            <FlipVertical class="w-3.5 h-3.5" />
          </button>
          <button @click="handlePackIslands(2)" class="uv-vert-tool-btn text-emerald-400 hover:text-emerald-300" title="Auto-Pack Islands (2px)">
            <Maximize class="w-3.5 h-3.5" />
          </button>
          <button @click="handleSeamUnwrap" class="uv-vert-tool-btn text-amber-400 hover:text-amber-300" title="Unwrap Along Seams (LSCM)">
            <BlenderIcon name="uv" :size="14" />
          </button>
        </div>
      </div>

      <!-- Top Right Floating View Controls -->
      <div class="uv-view-group" aria-label="UV canvas view controls">
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
        ><Magnet class="w-3.5 h-3.5" /><span>Snap</span></button>
        <button
          @click="showPixelGrid = !showPixelGrid"
          class="uv-view-icon"
          :class="{ 'is-active': showPixelGrid }"
          title="Toggle pixel grid"
        ><Grid class="w-3.5 h-3.5" /></button>
        <div class="uv-zoom-control">
          <button @click="zoomOut" title="Zoom out"><ZoomOut class="w-3.5 h-3.5" /></button>
          <span @dblclick="resetPanZoom" title="Double-click to fit view">{{ Math.round(zoom * 100) }}%</span>
          <button @click="zoomIn" title="Zoom in"><ZoomIn class="w-3.5 h-3.5" /></button>
        </div>
        <button @click="resetPanZoom" class="uv-view-icon" title="Fit UV canvas to view">
          <Maximize class="w-3.5 h-3.5" />
        </button>
      </div>

      <canvas 
        ref="canvasRef" 
        @pointerdown="onPointerDown" 
        @pointermove="onPointerMove" 
        @pointerup="onPointerUp" 
        @pointerleave="onPointerLeave"
        @pointercancel="onPointerUp"
        class="w-full h-full block touch-none"
      ></canvas>

      <!-- Quick Info HUD at Bottom Left -->
      <div class="uv-status-hud">
        <span class="flex items-center gap-1">Mode: <strong class="text-ui-textAccent uppercase font-bold">{{ uvSelectMode }}</strong></span>
        <span>Islands: <strong class="text-ui-textPrimary font-bold">{{ uvIslandCount }}</strong></span>
        <span v-if="selectedFaceCount">Sel: <strong class="text-amber-300 font-bold">{{ selectedFaceCount }}f</strong></span>
        <span v-if="pinnedUvKeys.size">Pins: <strong class="text-pink-400 font-bold">{{ pinnedUvKeys.size }}</strong></span>
        <span v-else class="text-ui-textMuted">No selection</span>
        <span v-if="selectionBounds" class="text-ui-textAccent font-bold">
          Bounds: {{ Math.round(selectionBounds.width * 100) }}% × {{ Math.round(selectionBounds.height * 100) }}%
        </span>
        <span class="text-ui-textMuted hidden md:inline">Space-drag pan · F frame · V stitch · P pin</span>
      </div>
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
.uv-editor {
  container-type: inline-size;
}

.uv-header-row-1 {
  height: 32px;
  min-height: 32px;
}

.uv-header-row-2 {
  height: 32px;
  min-height: 32px;
}

.asset-pipeline {
  min-width: 0;
}

@container (max-width: 760px) {
  .uv-header-row-1 {
    height: 64px;
    min-height: 64px;
    flex-wrap: wrap;
    align-content: center;
    padding-block: 4px;
  }

  .workspace-tabs {
    order: 1;
  }

  .asset-resolution {
    order: 2;
    margin-left: auto;
  }

  .asset-pipeline {
    order: 3;
    width: 100%;
    flex: 0 0 100%;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .asset-pipeline::-webkit-scrollbar {
    display: none;
  }
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
  color: var(--ui-text-accent);
  background: var(--ui-bg-active);
  border-color: var(--ui-border-default);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

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
  color: var(--ui-text-accent);
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
</style>
