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
  AlignCenter,
  Upload, 
  Download,
  Activity,
  Layers,
  Maximize
} from 'lucide-vue-next'
import { SeamUnwrapper } from '../../core/uv/SeamUnwrapper'

const projectStore = useProjectStore()
const toolStore = useToolStore()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

// UV Selection mode: 'vertex' | 'edge' | 'face' | 'island'
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

const zoom = ref<number>(5)
const panOffset = ref<{ x: number; y: number }>({ x: 0, y: 0 })
const showPixelGrid = ref<boolean>(true)
const snapToPixels = ref<boolean>(true)
const showCheckerboard = ref<boolean>(false)
const showHeatmap = ref<boolean>(false)
const checkerboardImage = ref<HTMLImageElement | null>(null)

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
  if (uvSelectMode.value === 'island' || selectedFaceIndices.value.length === 0) {
    return activeMesh.value.faces.map((_, i) => i)
  }
  return selectedFaceIndices.value
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
function scheduleRender() {
  if (renderPending) return
  renderPending = true
  requestAnimationFrame(() => {
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
  ctx.shadowColor = 'rgba(0, 0, 0, 0.9)'
  ctx.shadowBlur = 32
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 4
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

  // Quadrant 50% Subdivisions (Dashed Crosshairs)
  ctx.save()
  ctx.setLineDash([4, 4])
  ctx.strokeStyle = 'rgba(99, 102, 241, 0.35)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(ox + texW / 2, oy)
  ctx.lineTo(ox + texW / 2, oy + texH)
  ctx.moveTo(ox, oy + texH / 2)
  ctx.lineTo(ox + texW, oy + texH / 2)
  ctx.stroke()
  ctx.restore()

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

      const isFaceSelected = selectedFaceIndices.value.includes(fIdx) || uvSelectMode.value === 'island'
      const isHovered = hoveredFaceIndex === fIdx

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
        ctx.fillStyle = 'rgba(245, 158, 11, 0.38)'
        ctx.strokeStyle = '#f59e0b'
        ctx.lineWidth = 2
      } else if (isHovered && (uvSelectMode.value === 'face' || uvSelectMode.value === 'island')) {
        ctx.fillStyle = 'rgba(254, 240, 138, 0.32)'
        ctx.strokeStyle = '#fef08a'
        ctx.lineWidth = 2
        ctx.shadowColor = '#fef08a'
        ctx.shadowBlur = 8
      } else {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.12)'
        ctx.strokeStyle = '#0284c7'
        ctx.lineWidth = 1
      }
      ctx.fill()
      ctx.stroke()
      ctx.shadowBlur = 0

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
  if (e.button === 1 || e.button === 2 || e.altKey) {
    isPanning.value = true
    panStart = { x: e.clientX - panOffset.value.x, y: e.clientY - panOffset.value.y }
    return
  }

  if (e.button !== 0) return

  const rect = canvasRef.value!.getBoundingClientRect()
  const sx = e.clientX - rect.left
  const sy = e.clientY - rect.top
  const uv = screenToUV(sx, sy)

  dragStartMouse = { u: uv.u, v: uv.v, screenX: sx, screenY: sy }

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
        if (existIdx >= 0) selectedUvEdges.value.splice(existIdx, 1)
        else selectedUvEdges.value.push(edge)
      } else {
        selectedUvEdges.value = [edge]
      }
      syncEdgesTo3D()
      activeDrag = 'drag_edge'
      recordDragStartUVs()
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

  // 4. Face Click Check
  const clickedFace = findClickedFace(uv.u, uv.v)
  if (clickedFace !== null && !e.ctrlKey) {
    if (e.shiftKey) {
      const idx = selectedFaceIndices.value.indexOf(clickedFace)
      if (idx >= 0) selectedFaceIndices.value.splice(idx, 1)
      else selectedFaceIndices.value.push(clickedFace)
    } else {
      selectedFaceIndices.value = [clickedFace]
    }

    syncFacesTo3D()
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
    renderCanvas()
    return
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
        if (orig1 && face.uvs[v1Idx]) {
          face.uvs[v1Idx].u = orig1.origU + deltaU
          face.uvs[v1Idx].v = orig1.origV + deltaV
        }
        if (orig2 && face.uvs[v2Idx]) {
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

function onPointerUp(e: PointerEvent) {
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
        if (e.shiftKey) {
          selectedUvEdges.value = [...selectedUvEdges.value, ...newEdges]
        } else {
          selectedUvEdges.value = newEdges
        }
        syncEdgesTo3D()
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
        if (e.shiftKey) {
          selectedFaceIndices.value = Array.from(new Set([...selectedFaceIndices.value, ...newFaces]))
        } else {
          selectedFaceIndices.value = newFaces
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
    projectStore.recordState('UV Transform Edit')
    renderCanvas()
  }
}

function onWheel(e: WheelEvent) {
  e.preventDefault()
  if (e.shiftKey) {
    panOffset.value.x -= e.deltaY * 0.8
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

function onTextureChanged() {
  projectStore.markTextureUpdated()
  nextTick(() => {
    resetPanZoom()
    renderCanvas()
  })
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
  // Highlight face vertices of edge
  const vertIds: string[] = []
  selectedUvEdges.value.forEach(se => {
    const face = activeMesh.value!.faces[se.faceIndex]
    if (face) {
      vertIds.push(face.vertexIds[se.edgeIndex])
      vertIds.push(face.vertexIds[(se.edgeIndex + 1) % face.vertexIds.length])
    }
  })
  projectStore.selectedVertexIds = Array.from(new Set(vertIds))
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
  const file = input.files[0]
  const reader = new FileReader()
  reader.onload = async (event) => {
    const url = event.target?.result as string
    await projectStore.pixelBuffer.loadFromDataURL(url, true)
    if (projectStore.activeTexture) {
      projectStore.activeTexture.name = file.name.replace(/\.[^/.]+$/, '')
      projectStore.activeTexture.width = projectStore.pixelBuffer.width
      projectStore.activeTexture.height = projectStore.pixelBuffer.height
      projectStore.activeTexture.dataUrl = projectStore.pixelBuffer.toDataURL()
    }
    projectStore.markTextureUpdated()
    nextTick(() => {
      resetPanZoom()
      renderCanvas()
    })
  }
  reader.readAsDataURL(file)
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
    face.uvs.forEach(uv => {
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
  const unwrapped = boxUnwrap(activeMesh.value)
  activeMesh.value.faces = unwrapped.faces
  projectStore.markGeometryUpdated()
  scheduleRender()
}

function handlePlanarUnwrap(axis: 'x' | 'y' | 'z') {
  if (!activeMesh.value) return
  projectStore.recordState(`Planar Unwrap (${axis.toUpperCase()})`)
  const unwrapped = planarUnwrap(activeMesh.value, axis)
  activeMesh.value.faces = unwrapped.faces
  projectStore.markGeometryUpdated()
  scheduleRender()
}

function handleCylinderUnwrap() {
  if (!activeMesh.value) return
  projectStore.recordState('Cylindrical Unwrap')
  const unwrapped = cylinderUnwrap(activeMesh.value)
  activeMesh.value.faces = unwrapped.faces
  projectStore.markGeometryUpdated()
  scheduleRender()
}

function handleSphereUnwrap() {
  if (!activeMesh.value) return
  projectStore.recordState('Spherical Unwrap')
  const unwrapped = sphereUnwrap(activeMesh.value)
  activeMesh.value.faces = unwrapped.faces
  projectStore.markGeometryUpdated()
  scheduleRender()
}

function handleConeUnwrap() {
  if (!activeMesh.value) return
  projectStore.recordState('Conical Fan Unwrap')
  const unwrapped = coneUnwrap(activeMesh.value)
  activeMesh.value.faces = unwrapped.faces
  projectStore.markGeometryUpdated()
  scheduleRender()
}

function handleCubemapCross() {
  if (!activeMesh.value) return
  projectStore.recordState('Cubemap Cross Unwrap')
  const unwrapped = cubemapCrossUnwrap(activeMesh.value)
  activeMesh.value.faces = unwrapped.faces
  projectStore.markGeometryUpdated()
  scheduleRender()
}

function handlePackIslands(marginPx = 2) {
  if (!activeMesh.value) return
  projectStore.recordState(`Auto-Pack UV Islands (${marginPx}px)`)
  const unwrapped = packUVIslands(activeMesh.value, marginPx, projectStore.pixelBuffer.width)
  activeMesh.value.faces = unwrapped.faces
  projectStore.markGeometryUpdated()
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
    for (const uv of face.uvs) {
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
    for (const uv of face.uvs) {
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

onMounted(() => {
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

    <!-- 1. TOP COMPACT UV HEADER BAR -->
    <div class="uv-primary-bar">
      <div class="uv-primary-grid">
        <!-- Active 3D Object Selector -->
        <div class="uv-object-control uv-control-shell">
          <span class="text-ui-textMuted font-semibold text-[9px]">OBJ:</span>
          <select 
            v-model="projectStore.activeMeshId" 
            class="bg-transparent text-ui-textPrimary font-bold focus:outline-none cursor-pointer max-w-[120px] truncate"
          >
            <option v-for="m in projectStore.meshes" :key="m.id" :value="m.id" class="bg-ui-panel text-ui-textPrimary">
              {{ m.name }} ({{ m.faces.length }}f)
            </option>
          </select>
        </div>

        <!-- 3D Unwrapping Dropdown -->
        <div class="uv-dropdown-control uv-unwrap-control">
          <select 
            @change="(e) => {
              const val = (e.target as HTMLSelectElement).value
              if (val === 'seams') handleSeamUnwrap()
              else if (val === 'cubemap') handleCubemapCross()
              else if (val === 'box') handleBoxUnwrap()
              else if (val === 'cylinder') handleCylinderUnwrap()
              else if (val === 'sphere') handleSphereUnwrap()
              else if (val === 'cone') handleConeUnwrap()
              else if (val === 'planar-z') handlePlanarUnwrap('z')
              else if (val === 'planar-x') handlePlanarUnwrap('x')
              else if (val === 'planar-y') handlePlanarUnwrap('y')
              else if (val === 'reset') snapToFull()
              ;(e.target as HTMLSelectElement).value = 'default'
            }"
            class="bg-transparent text-ui-textAccent font-bold focus:outline-none cursor-pointer"
          >
            <option value="default" disabled selected class="bg-ui-panel text-ui-textMuted">Unwrap 3D...</option>
            <option value="seams" class="bg-ui-panel text-amber-400 font-bold">Unwrap Along Seams (LSCM)</option>
            <option value="reset" class="bg-ui-panel text-rose-500 font-semibold">Reset UVs (0..1 Full)</option>
            <option value="cubemap" class="bg-ui-panel text-ui-textAccent">Cubemap Cross (Blockbench)</option>
            <option value="box" class="bg-ui-panel text-ui-textPrimary">Smart Box Unwrap</option>
            <option value="cylinder" class="bg-ui-panel text-ui-textPrimary">Cylinder (Tube + Caps)</option>
            <option value="sphere" class="bg-ui-panel text-ui-textPrimary">Sphere (Equirectangular)</option>
            <option value="cone" class="bg-ui-panel text-ui-textPrimary">Cone / Pyramid (Radial Fan)</option>
            <option value="planar-z" class="bg-ui-panel text-ui-textPrimary">Planar Z-Axis</option>
            <option value="planar-x" class="bg-ui-panel text-ui-textPrimary">Planar X-Axis</option>
            <option value="planar-y" class="bg-ui-panel text-ui-textPrimary">Planar Y-Axis</option>
          </select>
        </div>

        <!-- Islands & Layout Operations Dropdown -->
        <div class="uv-dropdown-control uv-layout-control">
          <select 
            @change="(e) => {
              const val = (e.target as HTMLSelectElement).value
              if (val === 'bake-atlas') projectStore.bakeSceneAtlas(2)
              else if (val === 'pack-2') handlePackIslands(2)
              else if (val === 'pack-0') handlePackIslands(0)
              else if (val === 'pack-4') handlePackIslands(4)
              else if (val === 'gridify') handleGridify()
              else if (val === 'equalize') handleEqualizeTexels()
              ;(e.target as HTMLSelectElement).value = 'default'
            }"
            class="bg-transparent text-emerald-500 font-bold focus:outline-none cursor-pointer"
          >
            <option value="default" disabled selected class="bg-ui-panel text-ui-textMuted">Islands & Layout...</option>
            <option value="bake-atlas" class="bg-ui-panel text-amber-400 font-bold">Bake Scene Texture Atlas</option>
            <option value="pack-2" class="bg-ui-panel text-emerald-500 font-medium">Auto-Pack Islands (2px)</option>
            <option value="pack-0" class="bg-ui-panel text-ui-textPrimary">Auto-Pack Islands (0px)</option>
            <option value="pack-4" class="bg-ui-panel text-ui-textPrimary">Auto-Pack Islands (4px)</option>
            <option value="gridify" class="bg-ui-panel text-ui-textAccent font-medium">Gridify Quad Loops</option>
            <option value="equalize" class="bg-ui-panel text-sky-500 font-medium">Equalize Texel Density</option>
          </select>
        </div>

        <!-- UV Alignment Dropdown -->
        <div class="uv-dropdown-control uv-align-control">
          <select 
            @change="(e) => {
              const val = (e.target as HTMLSelectElement).value
              if (val) alignSelection(val as any)
              ;(e.target as HTMLSelectElement).value = 'default'
            }"
            class="bg-transparent text-ui-textPrimary font-bold focus:outline-none cursor-pointer"
          >
            <option value="default" disabled selected class="bg-ui-panel text-ui-textMuted">Align...</option>
            <option value="left" class="bg-ui-panel text-ui-textPrimary">Align Left</option>
            <option value="right" class="bg-ui-panel text-ui-textPrimary">Align Right</option>
            <option value="top" class="bg-ui-panel text-ui-textPrimary">Align Top</option>
            <option value="bottom" class="bg-ui-panel text-ui-textPrimary">Align Bottom</option>
            <option value="center_h" class="bg-ui-panel text-ui-textPrimary">Align Center (Horiz)</option>
            <option value="center_v" class="bg-ui-panel text-ui-textPrimary">Align Center (Vert)</option>
          </select>
        </div>
      </div>

      <!-- Right: Texture Selector, Image Import/Export -->
      <div class="uv-document-bar">
        <!-- Texture Selector Dropdown -->
        <div class="uv-texture-control">
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
          @click="fileInputRef?.click()" 
          class="flex items-center gap-1 px-1.5 py-0.5 rounded-xs bg-ui-input hover:bg-ui-hover text-ui-textAccent text-[10px] font-bold border border-ui-borderSubtle transition cursor-pointer"
          title="Import Texture / Sprite Sheet Image"
        >
          <Upload class="w-3 h-3 text-ui-accent" />
          <span>Import</span>
        </button>

        <button 
          @click="exportTexturePng" 
          class="flex items-center gap-1 px-1.5 py-0.5 hover:bg-ui-hover rounded-xs text-ui-textSecondary hover:text-emerald-500 border border-ui-borderSubtle bg-ui-input text-[10px] transition cursor-pointer"
          title="Export UV Texture PNG"
        >
          <Download class="w-3 h-3 text-emerald-500" />
          <span>Export</span>
        </button>
      </div>
    </div>

    <!-- Row 2: Trim Sheet Snapping, Visual Diagnostics & Transforms -->
    <div class="uv-secondary-bar">
      <!-- Left: Modular Trim Sheet & Multi-Grid Snapping -->
      <div class="uv-trim-diagnostics">
        <span class="text-[10px] text-ui-textMuted font-semibold">Trim Snap:</span>
        <div class="flex items-center bg-ui-input rounded-xs border border-ui-borderSubtle px-1.5 py-0.5 text-[10px]">
          <select 
            @change="(e) => {
              const val = (e.target as HTMLSelectElement).value
              if (val === 'q1') snapToQuadrant(1)
              else if (val === 'q2') snapToQuadrant(2)
              else if (val === 'q3') snapToQuadrant(3)
              else if (val === 'q4') snapToQuadrant(4)
              else if (val === 'full') snapToFull()
              else if (val.startsWith('grid-')) {
                const [, c, r, tc, tr] = val.split('-').map(Number)
                snapToTrimCell(c, r, tc, tr)
              }
              ;(e.target as HTMLSelectElement).value = 'default'
            }"
            class="bg-transparent text-ui-textAccent font-bold focus:outline-none cursor-pointer"
          >
            <option value="default" disabled selected class="bg-ui-panel text-ui-textMuted">Trim / Atlas Snapping...</option>
            <option value="full" class="bg-ui-panel text-ui-textAccent font-bold">Fit to Full (0..1)</option>
            <option value="q1" class="bg-ui-panel text-ui-textPrimary">Top-Left Quadrant (Q1)</option>
            <option value="q2" class="bg-ui-panel text-ui-textPrimary">Top-Right Quadrant (Q2)</option>
            <option value="q3" class="bg-ui-panel text-ui-textPrimary">Bottom-Left Quadrant (Q3)</option>
            <option value="q4" class="bg-ui-panel text-ui-textPrimary">Bottom-Right Quadrant (Q4)</option>
            <option disabled class="bg-ui-panel text-ui-textMuted font-bold">--- Modular Trim Grid Presets ---</option>
            <option value="grid-0-0-2-2" class="bg-ui-panel text-ui-textPrimary">2x2 Grid: Cell (1,1)</option>
            <option value="grid-1-0-2-2" class="bg-ui-panel text-ui-textPrimary">2x2 Grid: Cell (2,1)</option>
            <option value="grid-0-1-2-2" class="bg-ui-panel text-ui-textPrimary">2x2 Grid: Cell (1,2)</option>
            <option value="grid-1-1-2-2" class="bg-ui-panel text-ui-textPrimary">2x2 Grid: Cell (2,2)</option>
            <option value="grid-0-0-4-4" class="bg-ui-panel text-ui-textPrimary">4x4 Grid: Top-Left (1,1)</option>
            <option value="grid-3-3-4-4" class="bg-ui-panel text-ui-textPrimary">4x4 Grid: Bottom-Right (4,4)</option>
            <option value="grid-0-0-8-8" class="bg-ui-panel text-ui-textPrimary">8x8 Tile: Top-Left (1,1)</option>
          </select>
        </div>

        <button 
          @click="showCheckerboard = !showCheckerboard" 
          class="flex items-center space-x-1 px-1.5 py-0.5 rounded-xs text-[10px] font-bold border transition"
          :class="showCheckerboard ? 'bg-ui-active text-ui-textAccent border-ui-accent/40 shadow-xs' : 'bg-ui-input text-ui-textMuted border-ui-borderSubtle hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Toggle Calibration Checkerboard Test Grid"
        >
          <Layers class="w-3 h-3" />
          <span>Checkerboard</span>
        </button>

        <button 
          @click="showHeatmap = !showHeatmap" 
          class="flex items-center space-x-1 px-1.5 py-0.5 rounded-xs text-[10px] font-bold border transition"
          :class="showHeatmap ? 'bg-ui-active text-ui-textAccent border-ui-accent/40 shadow-xs' : 'bg-ui-input text-ui-textMuted border-ui-borderSubtle hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Toggle UV Stretch & Distortion Heatmap (Green = 1:1, Blue = Compressed, Red = Stretched)"
        >
          <Activity class="w-3 h-3" />
          <span>Heatmap</span>
        </button>
      </div>

      <!-- Right: Transform Presets -->
      <div class="uv-transform-presets">
        <span class="text-[10px] text-ui-textMuted font-semibold">Transforms:</span>
        <div class="flex items-center space-x-0.5 bg-ui-input rounded-xs p-0.5 border border-ui-borderSubtle">
          <button @click="rotateUVs(-90)" class="p-1 hover:bg-ui-hover rounded-xs text-ui-textSecondary hover:text-ui-textPrimary transition" title="Rotate 90° CCW">
            <RotateCcw class="w-3 h-3" />
          </button>
          <button @click="rotateUVs(90)" class="p-1 hover:bg-ui-hover rounded-xs text-ui-textSecondary hover:text-ui-textPrimary transition" title="Rotate 90° CW">
            <RotateCw class="w-3 h-3" />
          </button>
          <button @click="flipUVs('u')" class="p-1 hover:bg-ui-hover rounded-xs text-ui-textSecondary hover:text-ui-textPrimary transition" title="Flip Horizontal">
            <FlipHorizontal class="w-3 h-3" />
          </button>
          <button @click="flipUVs('v')" class="p-1 hover:bg-ui-hover rounded-xs text-ui-textSecondary hover:text-ui-textPrimary transition" title="Flip Vertical">
            <FlipVertical class="w-3 h-3" />
          </button>
          <button @click="scaleUVs(1.5)" class="px-1.5 py-0.5 hover:bg-ui-hover rounded-xs text-[9px] text-ui-textAccent font-bold transition" title="Scale Up +50%">+50%</button>
          <button @click="scaleUVs(0.67)" class="px-1.5 py-0.5 hover:bg-ui-hover rounded-xs text-[9px] text-ui-textAccent font-bold transition" title="Scale Down -33%">-33%</button>
          <button @click="centerInView" class="p-1 hover:bg-ui-hover rounded-xs text-ui-textMuted hover:text-ui-textPrimary transition" title="Center UV Islands in Canvas">
            <AlignCenter class="w-3 h-3" />
          </button>
          <button @click="resetPanZoom" class="px-1.5 py-0.5 hover:bg-ui-hover rounded-xs text-[9px] text-ui-textAccent font-bold transition" title="Frame & Center Viewport on Texture">
            Frame
          </button>
        </div>
      </div>
    </div>

    <!-- 2. INFINITE STAGING CANVAS VIEWPORT -->
    <div 
      ref="containerRef" 
      class="uv-canvas-viewport"
      @wheel="onWheel"
    >
      <!-- Sleek Vertical Toolbar inside UV Canvas Window (Left Pinned) -->
      <div class="uv-vertical-toolbar" aria-label="UV Selection & Quick Tools">
        <!-- UV Selection Mode Icons -->
        <div class="uv-vert-tool-group">
          <button 
            @click="uvSelectMode = 'vertex'"
            class="uv-vert-tool-btn"
            :class="{ 'is-active': uvSelectMode === 'vertex' }"
            title="UV Vertex Select (1)"
          >
            <BlenderIcon name="vertex-select" :size="15" />
          </button>
          <button 
            @click="uvSelectMode = 'edge'"
            class="uv-vert-tool-btn"
            :class="{ 'is-active': uvSelectMode === 'edge' }"
            title="UV Edge Select (2)"
          >
            <BlenderIcon name="edge-select" :size="15" />
          </button>
          <button 
            @click="uvSelectMode = 'face'"
            class="uv-vert-tool-btn"
            :class="{ 'is-active': uvSelectMode === 'face' }"
            title="UV Face Select (3)"
          >
            <BlenderIcon name="face-select" :size="15" />
          </button>
          <button 
            @click="uvSelectMode = 'island'"
            class="uv-vert-tool-btn"
            :class="{ 'is-active': uvSelectMode === 'island' }"
            title="UV Island Select (4)"
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

      <!-- Top Right View & Zoom Controls -->
      <div class="uv-view-group" aria-label="UV canvas view controls">
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
        @pointerleave="onPointerUp"
        @pointercancel="onPointerUp"
        class="w-full h-full block touch-none"
      ></canvas>

      <!-- Quick Info HUD at Bottom Left -->
      <div class="uv-status-hud">
        <span class="flex items-center gap-1">Mode: <strong class="text-ui-textAccent uppercase font-bold">{{ uvSelectMode }}</strong></span>
        <span>Res: <strong class="text-ui-textPrimary font-bold">{{ projectStore.pixelBuffer.width }}x{{ projectStore.pixelBuffer.height }}</strong></span>
        <span v-if="selectionBounds" class="text-ui-textAccent font-bold">
          Bounds: {{ Math.round(selectionBounds.width * 100) }}% x {{ Math.round(selectionBounds.height * 100) }}%
        </span>
        <span class="text-ui-textMuted">Space+Drag / Middle Click to Pan | Double-Click Zoom to Frame</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.uv-editor {
  container-type: inline-size;
}

.uv-primary-bar {
  flex: none;
  padding: 5px 8px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  color: var(--ui-text-secondary);
  background: var(--ui-bg-header);
  border-bottom: 1px solid var(--ui-border-subtle);
  box-shadow: 0 1px 0 rgb(0 0 0 / 18%);
  z-index: 5;
}

.uv-primary-grid {
  display: grid;
  grid-template-columns: minmax(110px, auto) repeat(3, minmax(100px, 1fr));
  gap: 5px;
  align-items: center;
  min-width: 0;
}

.uv-object-control { grid-area: auto; }
.uv-unwrap-control { grid-area: auto; }
.uv-layout-control { grid-area: auto; }
.uv-align-control { grid-area: auto; }

.uv-control-shell,
.uv-dropdown-control,
.uv-texture-control {
  min-width: 0;
  height: 28px;
  display: flex;
  align-items: center;
  background: var(--ui-bg-input);
  border: 1px solid var(--ui-border-subtle);
  border-radius: 3px;
}

.uv-control-shell,
.uv-texture-control {
  gap: 5px;
  padding: 0 7px;
}

.uv-control-shell select,
.uv-dropdown-control select,
.uv-texture-control select {
  min-width: 0;
  width: 100%;
  height: 25px;
  color: var(--ui-text-primary);
  background: transparent;
  border: 0;
  outline: none;
  font: inherit;
  font-size: 10px;
  text-overflow: ellipsis;
}

.uv-dropdown-control {
  padding: 0 5px;
}

.uv-unwrap-control select { color: var(--ui-text-accent); font-weight: 700; }
.uv-layout-control select { color: #34d399; font-weight: 700; }

.uv-document-bar {
  min-height: 31px;
  padding-top: 4px;
  display: flex;
  align-items: center;
  gap: 5px;
  border-top: 1px solid var(--ui-border-subtle);
}

.uv-texture-control {
  flex: 1;
  max-width: 340px;
}

.uv-document-bar > button {
  height: 27px;
  padding: 0 9px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  white-space: nowrap;
  color: var(--ui-text-secondary);
  background: var(--ui-bg-input);
  border: 1px solid var(--ui-border-subtle);
  border-radius: 3px;
  font-size: 10px;
  font-weight: 700;
}

.uv-document-bar > button:hover {
  color: var(--ui-text-primary);
  background: var(--ui-bg-hover);
  border-color: var(--ui-border-default);
}

.uv-document-bar > button:first-of-type { color: var(--ui-text-accent); }
.uv-document-bar > button:last-of-type:hover { color: #34d399; }

.uv-secondary-bar {
  min-height: 38px;
  padding: 5px 8px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--ui-text-secondary);
  background: var(--ui-bg-panel);
  border-bottom: 1px solid var(--ui-border-subtle);
  box-shadow: 0 2px 8px rgb(0 0 0 / 12%);
  z-index: 4;
}

.uv-trim-diagnostics,
.uv-transform-presets {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 5px;
}

.uv-trim-diagnostics > span,
.uv-transform-presets > span,
.uv-object-control > span,
.uv-texture-control > span {
  flex: none;
  color: var(--ui-text-muted);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: .04em;
  text-transform: uppercase;
}

.uv-trim-diagnostics > div:nth-of-type(1) {
  height: 27px;
  min-width: 135px;
  flex: 1;
  padding: 0 5px;
  display: flex;
  align-items: center;
  background: var(--ui-bg-input);
  border: 1px solid var(--ui-border-subtle);
  border-radius: 3px;
}

.uv-trim-diagnostics > div:nth-of-type(1) select {
  width: 100%;
  border: 0;
  font-size: 10px;
}

.uv-trim-diagnostics > button {
  height: 27px;
  padding: 0 8px;
  color: var(--ui-text-muted);
  background: var(--ui-bg-input);
  border: 1px solid var(--ui-border-subtle);
  border-radius: 3px;
  font-size: 9px;
}

.uv-trim-diagnostics > button:hover {
  color: var(--ui-text-primary);
  background: var(--ui-bg-hover);
}

.uv-transform-presets > div {
  height: 27px;
  padding: 2px;
  display: flex;
  align-items: center;
  gap: 1px;
  background: var(--ui-bg-input);
  border: 1px solid var(--ui-border-subtle);
  border-radius: 3px;
}

.uv-transform-presets button {
  height: 21px;
  min-width: 23px;
  padding: 0 5px;
  display: grid;
  place-items: center;
  color: var(--ui-text-muted);
  border-radius: 2px;
  font-size: 9px;
}

.uv-transform-presets button:hover {
  color: var(--ui-text-primary);
  background: var(--ui-bg-hover);
}

.uv-canvas-viewport {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
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
  background: color-mix(in srgb, var(--ui-bg-header) 92%, transparent);
  border: 1px solid var(--ui-border-strong);
  border-radius: 4px;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.35);
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
  height: 36px;
  padding: 4px;
  display: flex;
  align-items: center;
  gap: 5px;
  background: color-mix(in srgb, var(--ui-bg-header) 94%, transparent);
  border: 1px solid var(--ui-border-strong);
  border-radius: 4px;
  box-shadow: 0 5px 18px rgb(0 0 0 / 30%);
  backdrop-filter: blur(8px);
}

.uv-view-toggle,
.uv-view-icon,
.uv-zoom-control {
  height: 26px;
  color: var(--ui-text-muted);
  background: var(--ui-bg-input);
  border: 1px solid var(--ui-border-subtle);
  border-radius: 3px;
}

.uv-view-toggle,
.uv-view-icon {
  padding: 0 7px;
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
  width: 22px;
  height: 22px;
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
  min-width: 42px;
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
