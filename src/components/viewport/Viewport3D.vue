<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { useProjectStore } from '../../stores/projectStore'
import { useToolStore } from '../../stores/toolStore'
import { useAnimationStore } from '../../stores/animationStore'
import { useLayoutStore } from '../../stores/layoutStore'
import { useThemeStore, type ThemeColors } from '../../stores/themeStore'
import { meshToThreeGeometry, computeBoneWorldMatrix, updateThreeGeometryAttributes, resolveMeshShadeMode } from '../../core/geometry/Converters'
import { setIKTargetAndSolve, solveCCDIK } from '../../core/animation/IKSolver'
import { resolveMeshBoneParentId } from '../../core/animation/Armature'
import { sampleTrack } from '../../core/animation/Armature'
import { SpringPhysicsSolver } from '../../core/animation/SpringPhysics'
import { createPSXMaterial } from '../../core/shaders/PSXShader'
import { computeCentroid, computeFaceNormal } from '../../utils/math'
import { snapColorToPalette } from '../../utils/color'
import { getMeshEdges, getLinkedVertexIds, getLinkedFaceIds } from '../../core/geometry/EdgeUtils'
import { Vector3D, Edge, Vertex, MeshObject } from '../../types/mesh'
import { operatorManager } from '../../core/operators/OperatorManager'
import { OperatorContext } from '../../core/operators/ModalOperator'
import { MoveOperator } from '../../core/operators/MoveOperator'
import { RotateOperator } from '../../core/operators/RotateOperator'
import { ScaleOperator } from '../../core/operators/ScaleOperator'
import { ExtrudeOperator } from '../../core/operators/ExtrudeOperator'
import { InsetOperator } from '../../core/operators/InsetOperator'
import { BevelOperator } from '../../core/operators/BevelOperator'
import { KnifeOperator } from '../../core/operators/knife/KnifeOperator'
import { LoopCutOperator } from '../../core/operators/loopCut/LoopCutOperator'
import { PrimitivePlacementOperator, PrimitivePlacementMode } from '../../core/operators/placement/PrimitivePlacementOperator'
import { PolyDrawOperator } from '../../core/operators/PolyDrawOperator'
import { ScreenGeometry, type ViewQuadrant } from '../../core/geometry/ScreenGeometry'
import { PrimitiveType } from '../../core/primitives/PrimitiveTypes'
import { EditableMesh } from '../../core/mesh/MeshKernel'
import { MeshBridge } from '../../core/mesh/MeshBridge'
import { EditorEnvironment } from '../../core/render/EditorEnvironment'
import { ViewportLayerManager } from '../../core/render/ViewportLayers'
import { SnapManager } from '../../core/transform/SnapManager'
import { useFloatingDrag } from '../../composables/useFloatingDrag'
import { 
  Move, 
  RotateCw, 
  Search, 
  Maximize2,
  Crosshair,
  Check,
  X,
  GripHorizontal,
  GitCommitVertical,
  EyeOff
} from 'lucide-vue-next'
import BlenderIcon from '../icons/BlenderIcon.vue'
import { EDITOR_EVENTS } from '../../core/commands/editorCommands'

const projectStore = useProjectStore()
const toolStore = useToolStore()
const layoutStore = useLayoutStore()
const animationStore = useAnimationStore()
const themeStore = useThemeStore()

const containerRef = ref<HTMLDivElement | null>(null)
const canvasMountRef = ref<HTMLDivElement | null>(null)
const isWebGLContextLost = ref(false)
const rendererInitError = ref<string | null>(null)
const isRendererStarting = ref(false)

let scene: THREE.Scene
let renderer: THREE.WebGLRenderer
let animationFrameId: number
let resizeObserver: ResizeObserver | null = null
let contextRecoveryTimer: number | null = null

// Viewport Cameras
let cameraPersp: THREE.PerspectiveCamera
let cameraTop: THREE.OrthographicCamera
let cameraFront: THREE.OrthographicCamera
let cameraRight: THREE.OrthographicCamera
let activeCamera: THREE.Camera

let orbitControls: OrbitControls
let transformControls: TransformControls

let gridHelper: THREE.GridHelper
let gridFront: THREE.GridHelper
let gridSide: THREE.GridHelper
let axesHelper: THREE.AxesHelper

// Render Layer Architecture
let layers: ViewportLayerManager
const boneGroup = new THREE.Group()
boneGroup.renderOrder = 999

let threeTexture: THREE.CanvasTexture | null = null
let psxMaterial: THREE.ShaderMaterial | null = null
let editorEnv: EditorEnvironment

// Raycasting & Hover state
const raycaster = new THREE.Raycaster()
const mouse = new THREE.Vector2()
let isPaintingOn3D = false
let lastPaintUV: { u: number; v: number } | null = null
let lastPaintTextureId: string | undefined
let isGizmoDragging = false
let pointerDownClientPos = { x: 0, y: 0 }
let lastHoverClientPos = { x: 0, y: 0 }
let pointerDownHitMesh = false
let refDrag: {
  id: string
  plane: 'front' | 'side' | 'top'
  mode: 'pan' | 'scale'
  startHit: THREE.Vector3
  startOffsetX: number
  startOffsetY: number
  startScale: number
} | null = null

// Active Quadrant: 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right' | 'main'
const activeQuadrant = ref<ViewQuadrant>('main')
const refGroup = new THREE.Group()
refGroup.name = 'BlockoutReferences'
refGroup.renderOrder = 5

function isTripleView() {
  return toolStore.appMode === 'blockout'
}

function isSplitView() {
  return isTripleView() || toolStore.viewport.quadView
}

const BLOCKOUT_MIN_FRAC = 0.14

function tripleCols(total: number) {
  return ScreenGeometry.tripleCols(total)
}

function tripleHit(x: number, total: number) {
  const c = tripleCols(total)
  if (x < c.xSide) return { col: 0 as const, localX: x, localW: c.front, ...c }
  if (x < c.xPersp) return { col: 1 as const, localX: x - c.xSide, localW: c.side, ...c }
  return { col: 2 as const, localX: x - c.xPersp, localW: Math.max(1, c.persp), ...c }
}

const blockoutGridCols = computed(() => {
  const p = Math.max(BLOCKOUT_MIN_FRAC, 1 - layoutStore.blockoutFrontFrac - layoutStore.blockoutSideFrac)
  return `${layoutStore.blockoutFrontFrac}fr ${layoutStore.blockoutSideFrac}fr ${p}fr`
})

const isBlockoutSplitting = ref(false)

function syncBlockoutSplitsToScreen() {
  ScreenGeometry.blockoutFrontFrac = layoutStore.blockoutFrontFrac
  ScreenGeometry.blockoutSideFrac = layoutStore.blockoutSideFrac
}

function startBlockoutSplit(which: 'front-side' | 'side-persp', e: PointerEvent) {
  e.preventDefault()
  e.stopPropagation()
  const handle = e.currentTarget as HTMLElement
  isBlockoutSplitting.value = true
  try { handle.setPointerCapture(e.pointerId) } catch { /* optional */ }

  const onMove = (move: PointerEvent) => {
    const rect = containerRef.value?.getBoundingClientRect()
    if (!rect || rect.width < 8) return
    const x = (move.clientX - rect.left) / rect.width
    if (which === 'front-side') {
      const maxF = 1 - BLOCKOUT_MIN_FRAC - layoutStore.blockoutSideFrac
      layoutStore.blockoutFrontFrac = Math.min(maxF, Math.max(BLOCKOUT_MIN_FRAC, x))
    } else {
      const minX = layoutStore.blockoutFrontFrac + BLOCKOUT_MIN_FRAC
      const maxX = 1 - BLOCKOUT_MIN_FRAC
      const split = Math.min(maxX, Math.max(minX, x))
      layoutStore.blockoutSideFrac = split - layoutStore.blockoutFrontFrac
    }
    syncBlockoutSplitsToScreen()
    onWindowResize()
  }
  const onUp = () => {
    isBlockoutSplitting.value = false
    handle.removeEventListener('pointermove', onMove)
    handle.removeEventListener('pointerup', onUp)
    handle.removeEventListener('pointercancel', onUp)
    onWindowResize()
  }
  handle.addEventListener('pointermove', onMove)
  handle.addEventListener('pointerup', onUp)
  handle.addEventListener('pointercancel', onUp)
}

function resetBlockoutSplits() {
  layoutStore.resetBlockoutSplits()
  syncBlockoutSplitsToScreen()
  onWindowResize()
}

function isPerspQuadrant(q: ViewQuadrant = activeQuadrant.value) {
  return q === 'main' || q === 'top_right' || q === 'col_persp'
}

function viewportKindFromQuadrant(q: ViewQuadrant = activeQuadrant.value): 'persp' | 'top' | 'front' | 'right' {
  if (q === 'top_left') return 'top'
  if (q === 'bottom_left' || q === 'col_front') return 'front'
  if (q === 'bottom_right' || q === 'col_side') return 'right'
  return 'persp'
}

function disposeGridHelper(helper: THREE.GridHelper | undefined) {
  if (!helper || !layers) return
  layers.gridGroup.remove(helper)
  helper.geometry.dispose()
  const mats = helper.material
  if (Array.isArray(mats)) {
    for (const m of mats) m.dispose()
  } else {
    mats.dispose()
  }
}

function buildSceneGrids(major: THREE.Color, minor: THREE.Color) {
  disposeGridHelper(gridHelper)
  disposeGridHelper(gridFront)
  disposeGridHelper(gridSide)
  gridHelper = new THREE.GridHelper(20, 20, major, minor)
  gridHelper.position.y = -0.001
  gridFront = new THREE.GridHelper(20, 20, major, minor)
  gridFront.rotation.x = Math.PI / 2
  gridSide = new THREE.GridHelper(20, 20, major, minor)
  gridSide.rotation.z = Math.PI / 2
  layers.gridGroup.add(gridHelper, gridFront, gridSide)
}

function setGridsForView(view: 'floor' | 'front' | 'side') {
  const show = toolStore.viewport.showGrid
  if (gridHelper) gridHelper.visible = show && view === 'floor'
  if (gridFront) gridFront.visible = show && view === 'front'
  if (gridSide) gridSide.visible = show && view === 'side'
}

function isMeshSelectionAllowed() {
  return toolStore.isMeshWorkspace() || (toolStore.appMode === 'uvpaint' && toolStore.uvWorkspaceTab === 'uv')
}

function meshWorldMatrix(mesh: MeshObject): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(mesh.position.x, mesh.position.y, mesh.position.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(
      THREE.MathUtils.degToRad(mesh.rotation.x),
      THREE.MathUtils.degToRad(mesh.rotation.y),
      THREE.MathUtils.degToRad(mesh.rotation.z)
    )),
    new THREE.Vector3(mesh.scale.x, mesh.scale.y, mesh.scale.z)
  )
}

function localToWorld(mesh: MeshObject, local: Vector3D, mat = meshWorldMatrix(mesh)): THREE.Vector3 {
  return new THREE.Vector3(local.x, local.y, local.z).applyMatrix4(mat)
}

function worldToLocal(mesh: MeshObject, world: THREE.Vector3, invMat?: THREE.Matrix4): Vector3D {
  const inv = invMat ?? meshWorldMatrix(mesh).invert()
  const p = world.clone().applyMatrix4(inv)
  return { x: p.x, y: p.y, z: p.z }
}

function pushWorldFan(mesh: MeshObject, faceVerts: Vertex[], positions: number[]) {
  const mat = meshWorldMatrix(mesh)
  for (let i = 1; i < faceVerts.length - 1; i++) {
    const a = localToWorld(mesh, faceVerts[0].position, mat)
    const b = localToWorld(mesh, faceVerts[i].position, mat)
    const c = localToWorld(mesh, faceVerts[i + 1].position, mat)
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
  }
}

// Hover visual objects
let hoverFaceMesh: THREE.Mesh
let hoverEdgeMesh: THREE.Line
let hoverVertexMesh: THREE.Points
let hoverBoneMesh: THREE.Mesh
let hoverWeightBrushRing: THREE.LineLoop | null = null
let isWeightPainting = false

// Transform helper proxy object & initial drag transforms
const transformProxy = new THREE.Object3D()
let dragStartProxyMatrix = new THREE.Matrix4()
let dragStartProxyMatrixInverse = new THREE.Matrix4()
const dragStartVertexMap = new Map<string, THREE.Vector3>()
const dragStartMultiMeshMap = new Map<string, { position: THREE.Vector3; rotation: THREE.Euler; scale: THREE.Vector3 }>()

// Middle Mouse Button (MMB) / W Key Context Specials Menu
const showSpecialsMenu = ref(false)
const specialsMenuPos = ref({ x: 100, y: 100 })

// Marquee Box Selection State (Blender Box Select / Ctrl+LMB Drag)
const isMarqueeSelecting = ref(false)
const isBoxSelectArmed = ref(false)
const marqueeStart = ref({ x: 0, y: 0 })
const marqueeEnd = ref({ x: 0, y: 0 })
const marqueeRect = computed(() => {
  const x = Math.min(marqueeStart.value.x, marqueeEnd.value.x)
  const y = Math.min(marqueeStart.value.y, marqueeEnd.value.y)
  const width = Math.abs(marqueeEnd.value.x - marqueeStart.value.x)
  const height = Math.abs(marqueeEnd.value.y - marqueeStart.value.y)
  return { x, y, width, height }
})

function createRobustWebGLRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const configs: THREE.WebGLRendererParameters[] = [
    // 1. Standard default power preference (works with both integrated and discrete GPUs)
    { canvas, antialias: true, alpha: true, powerPreference: 'default', failIfMajorPerformanceCaveat: false },
    // 2. High performance
    { canvas, antialias: true, alpha: true, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false },
    // 3. Fallback without antialiasing for sandboxed or limited WebGL environments
    { canvas, antialias: false, alpha: true, powerPreference: 'default', failIfMajorPerformanceCaveat: false, precision: 'mediump' },
    // 4. Low-power / software fallback
    { canvas, antialias: false, alpha: true, powerPreference: 'low-power', failIfMajorPerformanceCaveat: false, precision: 'lowp' }
  ]

  for (const config of configs) {
    try {
      const r = new THREE.WebGLRenderer(config)
      return r
    } catch (_) {
      // Continue to next fallback configuration
    }
  }

  // 5. Try manual context binding for strict sandboxes / disabled flags
  const contextTypes = ['webgl2', 'webgl', 'experimental-webgl']
  for (const ctxType of contextTypes) {
    try {
      const gl = canvas.getContext(ctxType as any, {
        alpha: true,
        antialias: false,
        failIfMajorPerformanceCaveat: false
      })
      if (gl) {
        return new THREE.WebGLRenderer({ canvas, context: gl as WebGLRenderingContext, alpha: true })
      }
    } catch (_) {}
  }

  throw new Error('WebGL is currently disabled or unavailable in this browser.')
}

function initThree() {
  if (!containerRef.value) return

  // Dispose previous renderer if exists
  if (renderer) {
    try {
      renderer.dispose()
      renderer.forceContextLoss()
    } catch (_) {}
    renderer = null as any
  }

  const mountEl = canvasMountRef.value || containerRef.value
  while (mountEl.firstChild) {
    mountEl.removeChild(mountEl.firstChild)
  }

  const width = containerRef.value.clientWidth || window.innerWidth
  const height = containerRef.value.clientHeight || window.innerHeight

  // Create a clean dedicated canvas
  const canvas = document.createElement('canvas')
  canvas.style.display = 'block'
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  mountEl.appendChild(canvas)

  // Scene
  scene = new THREE.Scene()
  scene.background = new THREE.Color(themeStore.activeColors.viewportBg)

  // 1. Perspective Camera
  cameraPersp = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000)
  cameraPersp.position.set(4, 3, 5)
  cameraPersp.lookAt(0, 0.5, 0)

  // 2. Orthographic Top Camera (Looking down from Y+)
  const frustumSize = 5
  const aspect = (width / 2) / (height / 2) || 1
  cameraTop = new THREE.OrthographicCamera(
    -frustumSize * aspect / 2, frustumSize * aspect / 2,
    frustumSize / 2, -frustumSize / 2,
    0.1, 1000
  )
  cameraTop.position.set(0, 20, 0)
  cameraTop.up.set(0, 0, -1)
  cameraTop.lookAt(0, 0, 0)

  // 3. Orthographic Front Camera (Looking from Z+)
  cameraFront = new THREE.OrthographicCamera(
    -frustumSize * aspect / 2, frustumSize * aspect / 2,
    frustumSize / 2, -frustumSize / 2,
    0.1, 1000
  )
  cameraFront.position.set(0, 0.5, 20)
  cameraFront.up.set(0, 1, 0)
  cameraFront.lookAt(0, 0.5, 0)

  // 4. Orthographic Right Camera (Looking from X+)
  cameraRight = new THREE.OrthographicCamera(
    -frustumSize * aspect / 2, frustumSize * aspect / 2,
    frustumSize / 2, -frustumSize / 2,
    0.1, 1000
  )
  cameraRight.position.set(20, 0.5, 0)
  cameraRight.up.set(0, 1, 0)
  cameraRight.lookAt(0, 0.5, 0)

  activeCamera = cameraPersp

  // Multi-Strategy Resilient WebGL Renderer Creation
  renderer = createRobustWebGLRenderer(canvas)
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.toneMapping = THREE.NoToneMapping
  renderer.autoClear = false
  try {
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
  } catch (_) {}

  canvas.addEventListener('webglcontextlost', handleWebGLContextLost, false)
  canvas.addEventListener('webglcontextrestored', handleWebGLContextRestored, false)

  // Orbit Controls (Strictly for Perspective Camera)
  orbitControls = new OrbitControls(cameraPersp, canvas)
  orbitControls.enableDamping = true
  orbitControls.dampingFactor = 0.08
  orbitControls.zoomSpeed = toolStore.viewport.invertZoom ? -1.0 : 1.0
  orbitControls.target.set(0, 0.5, 0)

  // Transform Controls
  transformControls = new TransformControls(cameraPersp, canvas)
  transformControls.size = 0.55
  scene.add(transformControls.getHelper())
  scene.add(transformProxy)

  transformControls.addEventListener('dragging-changed', (event: any) => {
    isGizmoDragging = Boolean(event.value)
    orbitControls.enabled = !event.value

    if (event.value) {
      onGizmoDragStart()
    } else {
      commitProxyTransform()
    }
  })

  transformControls.addEventListener('axis-changed', (event: any) => {
    if (isGizmoDragging || transformControls.dragging) {
      orbitControls.enabled = false
      return
    }
    if (event.value !== null) {
      orbitControls.enabled = false
    } else if (!isSplitView() || isPerspQuadrant()) {
      if (orbitControls) orbitControls.enabled = true
    }
  })

  transformControls.addEventListener('objectChange', () => {
    onGizmoObjectChange()
  })

  // ----------------------------------------------------
  // CONCEPTUAL RENDERING PASSES & LAYER MANAGER
  // Pass 1: Model geometry (mesh objects)
  // Pass 2: Shadows / AO (shadow catcher ground)
  // Pass 3: Grid & Axes (gridHelper, axesHelper)
  // Pass 4: Selection (selected face overlays)
  // Pass 5: Vertices / Edges (wireframes, edge highlights, vertices)
  // Pass 6: Gizmos (transform controls, origin marker, bones)
  // Pass 7: Tool previews (Knife path, Loop cut rings, Bevel chamfers)
  // Pass 8: Hover overlay (hoverFaceMesh, hoverEdgeMesh, hoverVertexMesh)
  // ----------------------------------------------------
  layers = new ViewportLayerManager(scene)
  scene.add(refGroup)

  // Pass 2: Internal Editor Lighting & Soft Shadow Environment Rig
  editorEnv = new EditorEnvironment(scene, layers.shadowGroup)

  // Pass 3: Grid & Axes
  buildSceneGrids(
    new THREE.Color(themeStore.activeColors.gridMajor),
    new THREE.Color(themeStore.activeColors.gridMinor)
  )

  axesHelper = new THREE.AxesHelper(1.5)
  axesHelper.setColors(
    new THREE.Color(themeStore.activeColors.gizmoX), // X Axis
    new THREE.Color(themeStore.activeColors.gizmoY), // Y Axis
    new THREE.Color(themeStore.activeColors.gizmoZ)  // Z Axis
  )
  axesHelper.renderOrder = 1
  layers.gridGroup.add(axesHelper)

  // Pass 6: Gizmos & Bones
  applyThemeToTransformGizmo(transformControls)
  layers.gizmoGroup.add(transformControls.getHelper())
  layers.gizmoGroup.add(transformProxy)
  layers.gizmoGroup.add(boneGroup)

  // Setup Hover Visual Meshes
  initHoverVisuals()

  // Setup Texture
  initTexture()

  // Build Scene Meshes
  rebuildMeshes()
  rebuildReferencePlanes()

  // ResizeObserver
  if (window.ResizeObserver && containerRef.value) {
    resizeObserver = new ResizeObserver(() => {
      onWindowResize()
    })
    resizeObserver.observe(containerRef.value)
  }

  // Events (Using Capture Phase to prevent OrbitControls from rotating camera when drawing on 3D meshes)
  canvas.addEventListener('pointerdown', onPointerDown, { capture: true })
  canvas.addEventListener('pointermove', onPointerMove, { capture: true })
  canvas.addEventListener('pointerup', onPointerUp, { capture: true })
  canvas.addEventListener('pointerleave', onPointerUp, { capture: true })
  canvas.addEventListener('wheel', onWheel, { passive: false })
  window.addEventListener('resize', onWindowResize)

  animate()
}

function initHoverVisuals() {
  const faceMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide,
    depthTest: false
  })
  hoverFaceMesh = new THREE.Mesh(new THREE.BufferGeometry(), faceMat)
  hoverFaceMesh.visible = false
  layers.hoverGroup.add(hoverFaceMesh)

  const edgeMat = new THREE.LineBasicMaterial({
    color: 0xfef08a,
    linewidth: 5,
    depthTest: false,
    depthWrite: false,
    transparent: true
  })
  hoverEdgeMesh = new THREE.Line(new THREE.BufferGeometry(), edgeMat)
  hoverEdgeMesh.visible = false
  hoverEdgeMesh.renderOrder = 2
  layers.hoverGroup.add(hoverEdgeMesh)

  const vertMat = new THREE.PointsMaterial({
    color: 0xfef08a,
    size: 14,
    sizeAttenuation: false,
    depthTest: false
  })
  hoverVertexMesh = new THREE.Points(new THREE.BufferGeometry(), vertMat)
  hoverVertexMesh.visible = false
  layers.hoverGroup.add(hoverVertexMesh)

  const boneMat = new THREE.MeshBasicMaterial({
    color: 0xfef08a,
    depthTest: false
  })
  hoverBoneMesh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), boneMat)
  hoverBoneMesh.visible = false
  layers.hoverGroup.add(hoverBoneMesh)

  const ringGeom = new THREE.BufferGeometry()
  const ringPts: number[] = []
  const segments = 32
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2
    ringPts.push(Math.cos(theta), 0, Math.sin(theta))
  }
  ringGeom.setAttribute('position', new THREE.Float32BufferAttribute(ringPts, 3))
  const ringMat = new THREE.LineBasicMaterial({
    color: 0xffffff,
    linewidth: 2,
    depthTest: false
  })
  hoverWeightBrushRing = new THREE.LineLoop(ringGeom, ringMat)
  hoverWeightBrushRing.visible = false
  hoverWeightBrushRing.renderOrder = 9999
  layers.hoverGroup.add(hoverWeightBrushRing)
}

const textureCache = new Map<string, THREE.CanvasTexture>()

function getThreeTexture(textureId?: string | null): THREE.CanvasTexture | null {
  if (!textureId) return null
  const targetTex = projectStore.textures.find(t => t.id === textureId)
  if (!targetTex || !targetTex.pixelBuffer) {
    return null
  }

  let tex = textureCache.get(targetTex.id)
  if (!tex) {
    tex = new THREE.CanvasTexture(targetTex.pixelBuffer.canvas)
    tex.magFilter = THREE.NearestFilter
    tex.minFilter = THREE.NearestFilter
    tex.generateMipmaps = false
    textureCache.set(targetTex.id, tex)
  } else {
    tex.image = targetTex.pixelBuffer.canvas
    tex.needsUpdate = true
  }
  return tex
}

function updateThreeTextures() {
  // Dispose cached GPU textures whose source entries no longer exist
  const liveIds = new Set(projectStore.textures.map(t => t.id))
  for (const [id, tex] of textureCache) {
    if (!liveIds.has(id)) {
      tex.dispose()
      textureCache.delete(id)
    }
  }

  for (const t of projectStore.textures) {
    if (t.pixelBuffer) {
      let tex = textureCache.get(t.id)
      if (!tex) {
        tex = new THREE.CanvasTexture(t.pixelBuffer.canvas)
        tex.magFilter = THREE.NearestFilter
        tex.minFilter = THREE.NearestFilter
        tex.generateMipmaps = false
        textureCache.set(t.id, tex)
      } else {
        tex.image = t.pixelBuffer.canvas
        tex.needsUpdate = true
      }
    }
  }
  threeTexture = getThreeTexture(projectStore.activeTextureId)
  if (psxMaterial && psxMaterial.uniforms && psxMaterial.uniforms.uTexture) {
    psxMaterial.uniforms.uTexture.value = threeTexture
  }
}

function updateThreeTexture() {
  updateThreeTextures()
}

const isDraggingImageFile = ref(false)
const dropTargetPane = ref<'front' | 'side' | 'persp' | null>(null)

function paneFromClientX(clientX: number): 'front' | 'side' | 'persp' {
  const rect = containerRef.value?.getBoundingClientRect()
  if (!rect) return 'persp'
  const x = clientX - rect.left
  const hit = tripleHit(x, rect.width)
  if (hit.col === 0) return 'front'
  if (hit.col === 1) return 'side'
  return 'persp'
}

function onViewportDragOver(e: DragEvent) {
  if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) {
    isDraggingImageFile.value = true
    dropTargetPane.value = isTripleView() ? paneFromClientX(e.clientX) : 'persp'
  }
}

function onViewportDragLeave(e: DragEvent) {
  const next = e.relatedTarget as Node | null
  if (next && containerRef.value?.contains(next)) return
  isDraggingImageFile.value = false
  dropTargetPane.value = null
}

function onViewportDrop(e: DragEvent) {
  const pane = isTripleView() ? paneFromClientX(e.clientX) : 'persp'
  isDraggingImageFile.value = false
  dropTargetPane.value = null
  const file = e.dataTransfer?.files?.[0]
  if (!file || !file.type.startsWith('image/')) return

  if (isTripleView() && (pane === 'front' || pane === 'side')) {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : ''
      if (dataUrl) projectStore.setReferenceOnPlane(pane, dataUrl, file.name)
    }
    reader.readAsDataURL(file)
    return
  }

  const rect = containerRef.value?.getBoundingClientRect()
  if (!rect) return
  const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1
  const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1
  
  const cam = activeCamera || cameraPersp
  if (!cam) return
  raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), cam)
  const meshObjects = layers?.modelGroup?.children?.filter(c => !c.name.includes('_')) || []
  const intersects = raycaster.intersectObjects(meshObjects, true)

  let targetMeshId = projectStore.activeMeshId
  if (intersects.length > 0) {
    const hitObj = intersects[0].object
    const found = projectStore.meshes.find(m => m.id === hitObj.name)
    if (found) {
      targetMeshId = found.id
      projectStore.activeMeshId = found.id
      projectStore.selectedMeshIds = [found.id]
    }
  }

  const reader = new FileReader()
  reader.onload = (event) => {
    const dataUrl = event.target?.result as string
    if (!dataUrl) return
    const img = new Image()
    img.onload = () => {
      const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_')
      const newTex = projectStore.createTexture(cleanName, img.width || 64, img.height || 64, dataUrl)
      if (targetMeshId) {
        projectStore.activeMeshId = targetMeshId
        projectStore.applyTextureToMesh(targetMeshId, newTex.id, 'this_object')
      }
    }
    img.src = dataUrl
  }
  reader.readAsDataURL(file)
}

function initTexture() {
  updateThreeTextures()
  if (!psxMaterial) {
    psxMaterial = createPSXMaterial(threeTexture, new THREE.Vector2(320, 240))
  }
}

function isSkeletalPoseMode() {
  return toolStore.appMode === 'animate' || (toolStore.appMode === 'rig' && animationStore.isTestPoseActive)
}

function applyMeshWorldPose(meshObj: MeshObject, target: THREE.Object3D) {
  let finalPos = new THREE.Vector3(meshObj.position.x, meshObj.position.y, meshObj.position.z)
  let finalEuler = new THREE.Euler(
    THREE.MathUtils.degToRad(meshObj.rotation.x),
    THREE.MathUtils.degToRad(meshObj.rotation.y),
    THREE.MathUtils.degToRad(meshObj.rotation.z)
  )
  let finalScale = new THREE.Vector3(meshObj.scale.x, meshObj.scale.y, meshObj.scale.z)

  if (isSkeletalPoseMode()) {
    const boundBoneId = resolveMeshBoneParentId(meshObj, animationStore.armature.bones)
    if (boundBoneId) {
      const parentBone = animationStore.armature.bones.find(b => b.id === boundBoneId)
      if (parentBone) {
        const boneMat = computeBoneWorldMatrix(parentBone, animationStore.armature.bones)
        const meshQuat = new THREE.Quaternion().setFromEuler(finalEuler)
        const meshMat = new THREE.Matrix4().compose(finalPos, meshQuat, finalScale)
        meshMat.premultiply(boneMat)
        const outQuat = new THREE.Quaternion()
        meshMat.decompose(finalPos, outQuat, finalScale)
        finalEuler.setFromQuaternion(outQuat)
      }
    } else if (meshObj.parentId) {
      const parentMesh = projectStore.meshes.find(m => m.id === meshObj.parentId)
      if (parentMesh) {
        finalPos.add(new THREE.Vector3(parentMesh.position.x, parentMesh.position.y, parentMesh.position.z))
        finalEuler.x += THREE.MathUtils.degToRad(parentMesh.rotation.x)
        finalEuler.y += THREE.MathUtils.degToRad(parentMesh.rotation.y)
        finalEuler.z += THREE.MathUtils.degToRad(parentMesh.rotation.z)
        finalScale.multiply(new THREE.Vector3(parentMesh.scale.x, parentMesh.scale.y, parentMesh.scale.z))
      }
    }
  }

  target.position.copy(finalPos)
  target.rotation.copy(finalEuler)
  target.scale.copy(finalScale)
}

function syncMeshHelperTransforms(meshId: string, src: THREE.Object3D) {
  if (!layers) return
  const names = [`${meshId}_wire`, `${meshId}_backface`, `${meshId}_sel`, `${meshId}_edges`]
  const groups = [layers.wireframeGroup, layers.gizmoGroup, layers.selectionGroup, layers.modelGroup]
  for (const group of groups) {
    for (const name of names) {
      const obj = group.getObjectByName(name)
      if (obj) {
        obj.position.copy(src.position)
        obj.rotation.copy(src.rotation)
        obj.scale.copy(src.scale)
      }
    }
  }
}

function updateMeshTransformsAndAttributes(): boolean {
  if (!layers || layers.modelGroup.children.length === 0) return false

  const isPoseMode = isSkeletalPoseMode()
  const skeletalContext = isPoseMode ? { isPoseMode: true, bones: animationStore.armature.bones } : undefined
  const isWeightPaint = toolStore.appMode === 'rig' && animationStore.isWeightPaintActive
  const weightPaintContext = isWeightPaint ? { isWeightPaint: true, activeBoneId: animationStore.selectedBoneId || '' } : undefined

  let allSuccess = true
  for (const child of layers.modelGroup.children) {
    if (child instanceof THREE.Mesh) {
      const meshObj = projectStore.meshes.find(m => m.id === child.name)
      if (meshObj) {
        applyMeshWorldPose(meshObj, child)
        syncMeshHelperTransforms(meshObj.id, child)
        const ok = updateThreeGeometryAttributes(meshObj, child.geometry, skeletalContext, weightPaintContext)
        if (!ok) allSuccess = false
      }
    }
  }

  return allSuccess
}

function refreshLiveDeform() {
  if (!updateMeshTransformsAndAttributes() && !isGizmoDragging) {
    rebuildMeshes()
  }
}

function poseReferenceMesh(mesh: THREE.Mesh, img: { plane: string; offsetX: number; offsetY: number; scale: number; opacity: number; flipX: boolean; locked: boolean; id: string }) {
  const s = Math.max(0.25, img.scale)
  mesh.scale.set(img.flipX ? -s : s, s, 1)
  mesh.rotation.set(0, 0, 0)
  if (img.plane === 'front') {
    mesh.position.set(img.offsetX, img.offsetY, -0.02)
  } else if (img.plane === 'side') {
    mesh.rotation.y = Math.PI / 2
    mesh.position.set(-0.02, img.offsetY, img.offsetX)
  } else {
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(img.offsetX, -0.02, img.offsetY)
  }
  const mat = mesh.material as THREE.MeshBasicMaterial
  mat.opacity = img.opacity
  mat.color.set(projectStore.selectedReferenceId === img.id ? 0xfff4c2 : 0xffffff)
  mesh.raycast = img.locked ? (() => {}) : THREE.Mesh.prototype.raycast
}

function syncReferenceTransforms() {
  const visible = projectStore.referenceImages.filter(img => img.visible && img.dataUrl)
  if (refGroup.children.length !== visible.length) {
    rebuildReferencePlanes()
    return
  }
  for (const child of refGroup.children) {
    if (!(child instanceof THREE.Mesh)) continue
    const img = projectStore.referenceImages.find(r => r.id === child.userData.refId)
    if (!img || !img.visible) {
      rebuildReferencePlanes()
      return
    }
    poseReferenceMesh(child, img)
  }
}

function panePlaneFromKind(kind: 'persp' | 'top' | 'front' | 'right'): 'front' | 'side' | 'top' | null {
  if (kind === 'front') return 'front'
  if (kind === 'right') return 'side'
  if (kind === 'top') return 'top'
  return null
}

function hitReferencePlane(plane: 'front' | 'side' | 'top'): THREE.Vector3 | null {
  const p = new THREE.Plane()
  if (plane === 'front') p.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -0.02))
  else if (plane === 'side') p.setFromNormalAndCoplanarPoint(new THREE.Vector3(1, 0, 0), new THREE.Vector3(-0.02, 0, 0))
  else p.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -0.02, 0))
  const hit = new THREE.Vector3()
  if (!raycaster.ray.intersectPlane(p, hit)) return null
  return hit
}

function beginRefDrag(img: { id: string; plane: 'front' | 'side' | 'top'; offsetX: number; offsetY: number; scale: number; locked: boolean }, event: PointerEvent) {
  if (img.locked) return false
  const hit = hitReferencePlane(img.plane)
  if (!hit) return false
  projectStore.recordState('Move Reference')
  projectStore.selectReference(img.id)
  refDrag = {
    id: img.id,
    plane: img.plane,
    mode: event.shiftKey ? 'scale' : 'pan',
    startHit: hit.clone(),
    startOffsetX: img.offsetX,
    startOffsetY: img.offsetY,
    startScale: img.scale
  }
  pointerDownHitMesh = true
  orbitControls.enabled = false
  updateTransformGizmo()
  return true
}

function tryBeginReferenceInteraction(event: PointerEvent): boolean {
  if (toolStore.appMode !== 'blockout') return false
  const kind = viewportKindFromQuadrant()
  const pane = panePlaneFromKind(kind)
  const modelHits = raycaster.intersectObjects(layers.modelGroup.children, true)
  const refHits = raycaster.intersectObjects(refGroup.children, true).filter(h => h.object.userData.refId)

  if (event.altKey && pane) {
    const img = projectStore.referenceImages.find(r => r.plane === pane && r.visible && !r.locked)
    return img ? beginRefDrag(img, event) : false
  }

  if (modelHits.length > 0) return false

  if (refHits.length > 0) {
    const id = refHits[0].object.userData.refId as string
    const img = projectStore.referenceImages.find(r => r.id === id)
    return img ? beginRefDrag(img, event) : false
  }

  return false
}

function applyRefDrag() {
  if (!refDrag) return
  const img = projectStore.referenceImages.find(r => r.id === refDrag!.id)
  if (!img) return
  const hit = hitReferencePlane(refDrag.plane)
  if (!hit) return
  if (refDrag.mode === 'scale') {
    const pixelDy = lastHoverClientPos.y - pointerDownClientPos.y
    const next = Math.max(0.5, Math.min(24, refDrag.startScale * (1 - pixelDy * 0.008)))
    projectStore.updateReferenceImage(img.id, { scale: next }, { rebuild: false })
    return
  }
  const dx = hit.x - refDrag.startHit.x
  const dy = hit.y - refDrag.startHit.y
  const dz = hit.z - refDrag.startHit.z
  if (refDrag.plane === 'front') {
    projectStore.updateReferenceImage(img.id, { offsetX: refDrag.startOffsetX + dx, offsetY: refDrag.startOffsetY + dy }, { rebuild: false })
  } else if (refDrag.plane === 'side') {
    projectStore.updateReferenceImage(img.id, { offsetX: refDrag.startOffsetX + dz, offsetY: refDrag.startOffsetY + dy }, { rebuild: false })
  } else {
    projectStore.updateReferenceImage(img.id, { offsetX: refDrag.startOffsetX + dx, offsetY: refDrag.startOffsetY + dz }, { rebuild: false })
  }
}

function rebuildReferencePlanes() {
  while (refGroup.children.length > 0) {
    const child = refGroup.children[0]
    refGroup.remove(child)
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose()
      const mat = child.material
      if (Array.isArray(mat)) mat.forEach(m => m.dispose())
      else {
        if (mat.map) mat.map.dispose()
        mat.dispose()
      }
    }
  }

  for (const img of projectStore.referenceImages) {
    if (!img.visible || !img.dataUrl) continue
    const tex = new THREE.TextureLoader().load(img.dataUrl)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.flipY = true
    const geom = new THREE.PlaneGeometry(1, 1)
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: img.opacity,
      side: THREE.DoubleSide,
      depthWrite: false
    })
    const mesh = new THREE.Mesh(geom, mat)
    mesh.userData.refId = img.id
    poseReferenceMesh(mesh, img)
    refGroup.add(mesh)
  }
}

function rebuildMeshes() {
  if (isGizmoDragging || !layers) return

  layers.clearModels()
  layers.clearSelections()
  layers.clearWireframes()

  // Clean gizmo group preserving transform proxy & transform controls & boneGroup
  const preserve = [transformControls.getHelper(), transformProxy, boneGroup]
  for (let i = layers.gizmoGroup.children.length - 1; i >= 0; i--) {
    const child = layers.gizmoGroup.children[i]
    if (!preserve.includes(child)) {
      layers.gizmoGroup.remove(child)
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments || child instanceof THREE.Points || child instanceof THREE.Line) {
        child.geometry.dispose()
        const material = (child as THREE.Mesh).material
        if (Array.isArray(material)) {
          for (const m of material) m.dispose()
        } else if (material) {
          material.dispose()
        }
      }
    }
  }

  const isXRay = toolStore.viewport.xray

  for (const meshObj of projectStore.meshes) {
    if (!meshObj.visible) continue

    const isSelectedMesh = projectStore.selectedMeshIds.includes(meshObj.id) || projectStore.activeMeshId === meshObj.id
    const selectedFaces = (isSelectedMesh && toolStore.selectMode === 'face') ? projectStore.selectedFaceIds : []
    const selectedEdges = (isSelectedMesh && toolStore.selectMode === 'edge') ? projectStore.selectedEdgeIds : []

    const isPoseMode = toolStore.appMode === 'animate' || (toolStore.appMode === 'rig' && animationStore.isTestPoseActive)
    const skeletalContext = isPoseMode ? { isPoseMode: true, bones: animationStore.armature.bones } : undefined

    const isWeightPaint = toolStore.appMode === 'rig' && animationStore.isWeightPaintActive
    const weightPaintContext = isWeightPaint ? { isWeightPaint: true, activeBoneId: animationStore.selectedBoneId || '' } : undefined

    const { 
      geometry, 
      wireframeGeometry, 
      vertexPointsGeometry, 
      selectedFacesGeometry, 
      selectedEdgesGeometry, 
      edgeLinesGeometry, 
      faceIndexMap, 
      vertexIndexMap 
    } = meshToThreeGeometry(meshObj, selectedFaces, selectedEdges, toolStore.viewport.shadeMode, skeletalContext, weightPaintContext)

    // Track which helper geometries get attached to the scene; the rest must be disposed
    let wireGeomUsed = false
    let selFacesGeomUsed = false
    let selEdgesGeomUsed = false
    let edgeLinesGeomUsed = false
    let ptsGeomUsed = false

    const shade = resolveMeshShadeMode(meshObj, toolStore.viewport.shadeMode)
    const isSmooth = shade !== 'flat'
    const meshMatObj = projectStore.materials.find(m => m.id === meshObj.materialId) || projectStore.materials[0]
    const previewPaintTarget =
      toolStore.appMode === 'uvpaint' &&
      meshObj.id === projectStore.activeMeshId &&
      !!projectStore.activeTextureId
    const meshTex = getThreeTexture(
      previewPaintTarget ? projectStore.activeTextureId : meshMatObj?.textureId
    )
    const baseColor = new THREE.Color(meshMatObj?.color || '#ffffff')
    const roughness = typeof meshMatObj?.roughness === 'number' ? meshMatObj.roughness : 0.75
    const metalness = typeof meshMatObj?.metalness === 'number' ? meshMatObj.metalness : 0.05
    const emissiveColor = meshMatObj?.emissive ? new THREE.Color(meshMatObj.emissive) : new THREE.Color(0x000000)
    const emissiveIntensity = typeof meshMatObj?.emissiveIntensity === 'number' ? meshMatObj.emissiveIntensity : 0.0
    const matOpacity = typeof meshMatObj?.opacity === 'number' ? meshMatObj.opacity : 1.0
    const alphaTest = typeof meshMatObj?.alphaTest === 'number' ? meshMatObj.alphaTest : 0.0
    const isDoubleSided = meshMatObj?.doubleSided !== false
    const isTransparent = isXRay || matOpacity < 1.0 || (meshMatObj?.blendMode === 'blend' || meshMatObj?.blendMode === 'additive')
    const sideSetting = isDoubleSided ? THREE.DoubleSide : THREE.FrontSide
    const isWireframe = Boolean(meshMatObj?.wireframe)

    let mat: THREE.Material
    if (isWeightPaint) {
      mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.65,
        metalness: 0.05,
        side: sideSetting,
        flatShading: !isSmooth,
        transparent: isXRay,
        opacity: isXRay ? 0.65 : 1.0,
        depthWrite: !isXRay
      })
    } else if (['psx', 'saturn', 'dreamcast', 'n64'].includes(meshMatObj?.shading || '') || toolStore.viewport.shading === 'psx' || (meshMatObj?.dither || toolStore.viewport.dither)) {
      const psxMat = createPSXMaterial(meshTex)
      psxMat.uniforms.uColor.value = baseColor

      const shadingType = meshMatObj?.shading || 'psx'
      let consoleMode = 0
      if (shadingType === 'saturn') consoleMode = 1
      else if (shadingType === 'dreamcast') consoleMode = 2
      else if (shadingType === 'n64') consoleMode = 3
      psxMat.uniforms.uConsoleMode.value = consoleMode

      psxMat.uniforms.uJitterAmount.value = (consoleMode === 0 && (meshMatObj?.psxJitter || toolStore.viewport.psxJitter)) ? 1.0 : 0.0
      psxMat.uniforms.uAffineEnabled.value = (consoleMode <= 1) && Boolean(meshMatObj?.psxAffine || toolStore.viewport.psxAffine)
      psxMat.uniforms.uDitherEnabled.value = Boolean(meshMatObj?.dither || toolStore.viewport.dither || consoleMode === 0 || consoleMode === 1)
      psxMat.uniforms.uDitherIntensity.value = typeof meshMatObj?.ditherLevel === 'number' ? (meshMatObj.ditherLevel / 32) : 1.0
      
      psxMat.uniforms.uSaturnMeshAlpha.value = Boolean(meshMatObj?.saturnMeshAlpha || shadingType === 'saturn')
      psxMat.uniforms.uDreamcastVQ.value = Boolean(meshMatObj?.dreamcastVQ || shadingType === 'dreamcast')
      psxMat.uniforms.uDreamcastSpecular.value = Boolean(meshMatObj?.dreamcastSpecular || shadingType === 'dreamcast')
      psxMat.uniforms.uDreamcastCelOutline.value = Boolean(meshMatObj?.dreamcastCelOutline)

      const patternName = meshMatObj?.ditherPattern || (shadingType === 'saturn' ? 'checker' : 'bayer4x4')
      let patType = 0
      if (patternName === 'bayer8x8') patType = 1
      else if (patternName === 'bayer2x2') patType = 2
      else if (patternName === 'bayer16x16') patType = 3
      else if (patternName === 'bluenoise') patType = 4
      else if (patternName === 'halftone') patType = 5
      else if (patternName === 'crosshatch') patType = 6
      else if (patternName === 'horizontal_lines') patType = 7
      else if (patternName === 'vertical_lines') patType = 8
      else if (patternName === 'checker') patType = 9
      else if (patternName === 'noise') patType = 10
      psxMat.uniforms.uDitherPatternType.value = patType

      let spaceType = 0
      if (meshMatObj?.ditherSpace === 'uv') spaceType = 1
      else if (meshMatObj?.ditherSpace === 'world') spaceType = 2
      psxMat.uniforms.uDitherSpace.value = spaceType

      let chanType = 0
      if (meshMatObj?.ditherChannel === 'luma') chanType = 1
      else if (meshMatObj?.ditherChannel === 'alpha') chanType = 2
      psxMat.uniforms.uDitherChannel.value = chanType

      psxMat.uniforms.uBayerSize.value = patternName === 'bayer2x2' ? 2 : (patternName === 'bayer8x8' ? 8 : (patternName === 'bayer16x16' ? 16 : 4))
      psxMat.uniforms.uDitherScale.value = typeof meshMatObj?.ditherScale === 'number' ? meshMatObj.ditherScale : 1.0
      psxMat.uniforms.uColorDepth.value = typeof meshMatObj?.colorDepth === 'number' ? meshMatObj.colorDepth : (shadingType === 'dreamcast' ? 0.0 : 32.0)
      psxMat.side = sideSetting
      psxMat.transparent = isTransparent
      psxMat.depthWrite = !isTransparent
      psxMat.opacity = isXRay ? 0.55 : matOpacity
      if (psxMat.uniforms.uOpacity) {
        psxMat.uniforms.uOpacity.value = isXRay ? 0.55 : (matOpacity < 1 ? matOpacity : 1.0)
      }
      mat = psxMat
    } else if (meshMatObj?.shading === 'unlit') {
      mat = new THREE.MeshBasicMaterial({
        map: meshTex,
        color: baseColor,
        vertexColors: true,
        side: sideSetting,
        wireframe: isWireframe,
        alphaTest: alphaTest,
        transparent: isTransparent,
        opacity: isXRay ? 0.55 : matOpacity,
        depthWrite: !isTransparent
      })
    } else if (meshMatObj?.shading === 'flat') {
      mat = new THREE.MeshStandardMaterial({
        map: meshTex,
        color: baseColor,
        roughness: roughness,
        metalness: metalness,
        emissive: emissiveColor,
        emissiveIntensity: emissiveIntensity,
        vertexColors: true,
        side: sideSetting,
        flatShading: true,
        wireframe: isWireframe,
        alphaTest: alphaTest,
        transparent: isTransparent,
        opacity: isXRay ? 0.55 : matOpacity,
        depthWrite: !isTransparent
      })
    } else if (meshMatObj?.shading === 'gouraud') {
      mat = new THREE.MeshStandardMaterial({
        map: meshTex,
        color: baseColor,
        roughness: roughness,
        metalness: metalness,
        emissive: emissiveColor,
        emissiveIntensity: emissiveIntensity,
        vertexColors: true,
        side: sideSetting,
        flatShading: false,
        wireframe: isWireframe,
        alphaTest: alphaTest,
        transparent: isTransparent,
        opacity: isXRay ? 0.55 : matOpacity,
        depthWrite: !isTransparent
      })
    } else if (toolStore.viewport.shading === 'wireframe') {
      mat = new THREE.MeshBasicMaterial({
        wireframe: true,
        color: 0x6366f1
      })
    } else if (toolStore.viewport.faceOrientation) {
      // Diagnostic Face Orientation: Cobalt Blue (Front-Facing Normals)
      mat = new THREE.MeshBasicMaterial({
        color: 0x2563eb,
        side: THREE.FrontSide,
        transparent: isXRay,
        opacity: isXRay ? 0.55 : 0.9,
        depthWrite: !isXRay
      })
    } else {
      // PBR / Textured Standard Material
      mat = new THREE.MeshStandardMaterial({
        map: meshTex,
        color: baseColor,
        roughness: roughness,
        metalness: metalness,
        emissive: emissiveColor,
        emissiveIntensity: emissiveIntensity,
        vertexColors: true,
        side: sideSetting,
        flatShading: !isSmooth,
        wireframe: isWireframe,
        alphaTest: alphaTest,
        transparent: isTransparent,
        opacity: isXRay ? 0.55 : matOpacity,
        depthWrite: !isTransparent
      })
    }

    // PASS 1: Base Model Geometry
    const threeMesh = new THREE.Mesh(geometry, mat)
    threeMesh.name = meshObj.id
    threeMesh.castShadow = true
    threeMesh.receiveShadow = true

    applyMeshWorldPose(meshObj, threeMesh)
    threeMesh.userData = { meshId: meshObj.id, faceIndexMap }
    layers.modelGroup.add(threeMesh)

    // Inverted Backfaces Overlay (Crimson Red) for Face Orientation Diagnostic
    if (toolStore.viewport.faceOrientation) {
      const backMat = new THREE.MeshBasicMaterial({
        color: 0xef4444, // Crimson Red for Flipped / Inside Normals
        side: THREE.BackSide,
        transparent: isXRay,
        opacity: isXRay ? 0.55 : 0.9,
        depthWrite: !isXRay
      })
      const backMesh = new THREE.Mesh(geometry, backMat)
      backMesh.name = `${meshObj.id}_backface`
      backMesh.position.copy(threeMesh.position)
      backMesh.rotation.copy(threeMesh.rotation)
      backMesh.scale.copy(threeMesh.scale)
      layers.modelGroup.add(backMesh)
    }

    // PASS 5: Wireframe overlay — dark crease lines (Blockbench-style), biased in front of the fill.
    // Skip on the active mesh in edge/vertex mode so cyan/orange/hover lines are not covered.
    const showCreaseWire = (isXRay || meshMatObj?.wireframe || toolStore.isMeshWorkspace())
      && toolStore.viewport.shading !== 'wireframe'
      && !(isSelectedMesh && (toolStore.selectMode === 'edge' || toolStore.selectMode === 'vertex'))
    if (showCreaseWire) {
      const wireMat = new THREE.LineBasicMaterial({
        color: isSelectedMesh ? 0x0b0f19 : 0x1e293b,
        depthTest: !isXRay,
        depthWrite: false,
        transparent: true,
        opacity: Math.max(0.72, toolStore.viewport.wireframeOpacity ?? 0.88),
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2
      })
      wireMat.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader.replace(
          '#include <project_vertex>',
          `#include <project_vertex>
           gl_Position.z -= 0.0012 * gl_Position.w;`
        )
      }
      const wire = new THREE.LineSegments(wireframeGeometry, wireMat)
      wire.name = `${meshObj.id}_wire`
      wire.renderOrder = 0
      wire.position.copy(threeMesh.position)
      wire.rotation.copy(threeMesh.rotation)
      wire.scale.copy(threeMesh.scale)
      layers.wireframeGroup.add(wire)
      wireGeomUsed = true
    }

    // Seam Edges Overlay (Bright Red #ef4444)
    if (meshObj.seamEdgeIds && meshObj.seamEdgeIds.length > 0) {
      const seamPositions: number[] = []
      const vertMap = new Map<string, { x: number; y: number; z: number }>()
      meshObj.vertices.forEach(v => vertMap.set(v.id, v.position))

      for (const eId of meshObj.seamEdgeIds) {
        const parts = eId.split('_')
        if (parts.length >= 2) {
          const p1 = vertMap.get(parts[0])
          const p2 = vertMap.get(parts[1])
          if (p1 && p2) {
            seamPositions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z)
          }
        }
      }

      if (seamPositions.length > 0) {
        const seamGeom = new THREE.BufferGeometry()
        seamGeom.setAttribute('position', new THREE.Float32BufferAttribute(seamPositions, 3))
        const seamMat = new THREE.LineBasicMaterial({
          color: 0xef4444,
          linewidth: 3,
          depthTest: false,
          transparent: true,
          opacity: 0.95
        })
        const seamLines = new THREE.LineSegments(seamGeom, seamMat)
        seamLines.position.copy(threeMesh.position)
        seamLines.rotation.copy(threeMesh.rotation)
        seamLines.scale.copy(threeMesh.scale)
        layers.wireframeGroup.add(seamLines)
      }
    }

    const isSelectionAllowed = isMeshSelectionAllowed()

    // PASS 4: Face Mode Selection Overlay
    if (isSelectionAllowed && toolStore.selectMode === 'face' && isSelectedMesh && selectedFacesGeometry.attributes.position) {
      const selFaceMat = new THREE.MeshBasicMaterial({
        color: 0xf59e0b,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthTest: !isXRay
      })
      const selFaceMesh = new THREE.Mesh(selectedFacesGeometry, selFaceMat)
      selFaceMesh.name = `${meshObj.id}_selfaces`
      selFaceMesh.position.copy(threeMesh.position)
      selFaceMesh.rotation.copy(threeMesh.rotation)
      selFaceMesh.scale.copy(threeMesh.scale)
      layers.selectionGroup.add(selFaceMesh)
      selFacesGeomUsed = true
    }

    // PASS 5: Edge Mode Overlay
    if (isSelectionAllowed && toolStore.selectMode === 'edge' && isSelectedMesh) {
      if (selectedEdgesGeometry.attributes.position) {
        const selEdgeMat = new THREE.LineBasicMaterial({
          color: 0xf59e0b,
          linewidth: 4,
          depthTest: false,
          depthWrite: false,
          transparent: true
        })
        const selEdgeMesh = new THREE.LineSegments(selectedEdgesGeometry, selEdgeMat)
        selEdgeMesh.name = `${meshObj.id}_seledges`
        selEdgeMesh.renderOrder = 2
        selEdgeMesh.position.copy(threeMesh.position)
        selEdgeMesh.rotation.copy(threeMesh.rotation)
        selEdgeMesh.scale.copy(threeMesh.scale)
        layers.wireframeGroup.add(selEdgeMesh)
        selEdgesGeomUsed = true
      }

      const edgeMat = new THREE.LineBasicMaterial({
        color: 0x06b6d4,
        linewidth: 2,
        depthTest: false,
        depthWrite: false,
        transparent: true
      })
      const edges = new THREE.LineSegments(edgeLinesGeometry, edgeMat)
      edges.name = `${meshObj.id}_edges`
      edges.renderOrder = 1
      edges.position.copy(threeMesh.position)
      edges.rotation.copy(threeMesh.rotation)
      edges.scale.copy(threeMesh.scale)
      edges.userData = { meshId: meshObj.id }
      layers.wireframeGroup.add(edges)
      edgeLinesGeomUsed = true
    }

    // PASS 5: Vertex Mode Overlay
    if (isSelectionAllowed && toolStore.selectMode === 'vertex' && isSelectedMesh) {
      const pMat = new THREE.PointsMaterial({
        size: 9,
        vertexColors: true,
        sizeAttenuation: false,
        depthTest: !toolStore.viewport.xray,
        depthWrite: false
      })
      const pts = new THREE.Points(vertexPointsGeometry, pMat)
      pts.name = `${meshObj.id}_pts`
      pts.position.copy(threeMesh.position)
      pts.rotation.copy(threeMesh.rotation)
      pts.scale.copy(threeMesh.scale)
      pts.userData = { meshId: meshObj.id, vertexIndexMap }
      layers.wireframeGroup.add(pts)
      ptsGeomUsed = true
    }

    // PASS 6: Blockbench Origin / Pivot Point Marker (Visible ONLY when Origin mode is selected)
    if (toolStore.appMode === 'model' && toolStore.selectMode === 'origin' && isSelectedMesh) {
      const isOriginMode = true
      const originMat = new THREE.MeshBasicMaterial({
        color: 0xf59e0b,
        depthTest: false,
        depthWrite: false,
        transparent: true
      })
      const originGeom = new THREE.OctahedronGeometry(0.22)
      const originMesh = new THREE.Mesh(originGeom, originMat)
      originMesh.name = `${meshObj.id}_origin`
      originMesh.position.set(meshObj.position.x, meshObj.position.y, meshObj.position.z)
      originMesh.renderOrder = 99999
      layers.gizmoGroup.add(originMesh)

      const crosshairGeom = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([
        -0.5, 0, 0, 0.5, 0, 0,
        0, -0.5, 0, 0, 0.5, 0,
        0, 0, -0.5, 0, 0, 0.5
      ], 3))
      const crosshairMat = new THREE.LineBasicMaterial({
        color: isOriginMode ? 0xfef08a : 0x38bdf8,
        depthTest: false,
        depthWrite: false,
        transparent: true
      })
      const crosshair = new THREE.LineSegments(crosshairGeom, crosshairMat)
      crosshair.name = `${meshObj.id}_crosshair`
      crosshair.position.copy(originMesh.position)
      crosshair.renderOrder = 99999
      layers.gizmoGroup.add(crosshair)

      if (isOriginMode) {
        const ringGeom = new THREE.RingGeometry(0.3, 0.35, 32)
        ringGeom.rotateX(Math.PI / 2)
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0xf59e0b,
          side: THREE.DoubleSide,
          depthTest: false,
          depthWrite: false,
          transparent: true
        })
        const ringMesh = new THREE.Mesh(ringGeom, ringMat)
        ringMesh.name = `${meshObj.id}_origin_ring`
        ringMesh.position.copy(originMesh.position)
        ringMesh.renderOrder = 99999
        layers.gizmoGroup.add(ringMesh)
      }
    }

    if (!wireGeomUsed) wireframeGeometry.dispose()
    if (!selFacesGeomUsed) selectedFacesGeometry.dispose()
    if (!selEdgesGeomUsed) selectedEdgesGeometry.dispose()
    if (!edgeLinesGeomUsed) edgeLinesGeometry.dispose()
    if (!ptsGeomUsed) vertexPointsGeometry.dispose()
  }

  // Onion Skinning Ghost Frames Overlay
  if (animationStore.onionSkin && toolStore.appMode === 'animate' && animationStore.activeClip) {
    const curF = animationStore.currentFrame
    const maxF = animationStore.activeClip.durationFrames || 24
    const count = animationStore.onionFramesCount || 2
    const baseOpacity = animationStore.onionOpacity || 0.35

    const offsets: { frame: number; color: number; factor: number }[] = []
    for (let k = 1; k <= count; k++) {
      if (curF - k >= 0) offsets.push({ frame: curF - k, color: 0xef4444, factor: (count - k + 1) / count })
      if (curF + k <= maxF) offsets.push({ frame: curF + k, color: 0x22c55e, factor: (count - k + 1) / count })
    }

    for (const ghost of offsets) {
      const ghostBones = animationStore.armature.bones.map(b => ({
        ...b,
        position: { ...b.position },
        rotation: { ...b.rotation },
        scale: { ...b.scale }
      }))

      for (const track of animationStore.activeClip.tracks) {
        if (track.targetType === 'bone') {
          const b = ghostBones.find(x => x.id === track.targetId)
          if (b) {
            const sampled = sampleTrack(track, ghost.frame)
            b.position = sampled.position
            b.rotation = sampled.rotation
            b.scale = sampled.scale
          }
        }
      }

      for (const meshObj of projectStore.meshes) {
        if (!meshObj.visible) continue
        const {
          geometry,
          wireframeGeometry: ghostWireGeom,
          vertexPointsGeometry: ghostPtsGeom,
          selectedFacesGeometry: ghostSelFacesGeom,
          selectedEdgesGeometry: ghostSelEdgesGeom,
          edgeLinesGeometry: ghostEdgeLinesGeom
        } = meshToThreeGeometry(
          meshObj,
          [],
          [],
          'flat',
          { isPoseMode: true, bones: ghostBones }
        )
        ghostWireGeom.dispose()
        ghostPtsGeom.dispose()
        ghostSelFacesGeom.dispose()
        ghostSelEdgesGeom.dispose()
        ghostEdgeLinesGeom.dispose()

        const ghostMat = new THREE.MeshBasicMaterial({
          color: ghost.color,
          transparent: true,
          opacity: baseOpacity * ghost.factor * 0.45,
          wireframe: true,
          depthTest: false
        })

        const ghostMesh = new THREE.Mesh(geometry, ghostMat)
        ghostMesh.position.set(meshObj.position.x, meshObj.position.y, meshObj.position.z)
        ghostMesh.rotation.set(
          THREE.MathUtils.degToRad(meshObj.rotation.x),
          THREE.MathUtils.degToRad(meshObj.rotation.y),
          THREE.MathUtils.degToRad(meshObj.rotation.z)
        )
        ghostMesh.scale.set(meshObj.scale.x, meshObj.scale.y, meshObj.scale.z)
        layers.gizmoGroup.add(ghostMesh)
      }
    }
  }

  // Update dynamic shadow camera bounds
  if (editorEnv) {
    const sceneBox = new THREE.Box3().setFromObject(layers.modelGroup)
    editorEnv.fitShadowCameraToBounds(sceneBox)
  }

  updateTransformGizmo()
  rebuildBones()
}

function bonesAreInteractive() {
  return toolStore.appMode === 'rig' || toolStore.appMode === 'animate'
}

function rebuildBones() {
  while (boneGroup.children.length > 0) {
    const obj = boneGroup.children[0]
    boneGroup.remove(obj)
    if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments || obj instanceof THREE.Points || obj instanceof THREE.Line) {
      obj.geometry.dispose()
      const material = (obj as THREE.Mesh).material
      if (Array.isArray(material)) {
        for (const m of material) m.dispose()
      } else if (material) {
        material.dispose()
      }
    }
  }

  if (!animationStore.showBones) {
    boneGroup.visible = false
    return
  }
  boneGroup.visible = true

  const isPoseMode = toolStore.appMode === 'animate' || (toolStore.appMode === 'rig' && animationStore.isTestPoseActive)
  const isXRay = toolStore.viewport.xray || animationStore.xrayBones !== false

  for (const bone of animationStore.armature.bones) {
    let start: THREE.Vector3
    let end: THREE.Vector3

    if (isPoseMode) {
      const boneMat = computeBoneWorldMatrix(bone, animationStore.armature.bones)
      start = new THREE.Vector3(bone.head.x, bone.head.y, bone.head.z).applyMatrix4(boneMat)
      end = new THREE.Vector3(bone.tail.x, bone.tail.y, bone.tail.z).applyMatrix4(boneMat)
    } else {
      start = new THREE.Vector3(bone.head.x, bone.head.y, bone.head.z)
      end = new THREE.Vector3(bone.tail.x, bone.tail.y, bone.tail.z)
    }

    const boneVec = new THREE.Vector3().subVectors(end, start)
    const length = boneVec.length()
    if (length < 0.001) continue

    const overlayOnly = !bonesAreInteractive()
    const isSelected = !overlayOnly && bone.id === animationStore.selectedBoneId

    const dir = boneVec.clone().normalize()
    const up = Math.abs(dir.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
    const side = new THREE.Vector3().crossVectors(dir, up).normalize()
    const perp = new THREE.Vector3().crossVectors(dir, side).normalize()

    const midT = 0.2
    const radius = Math.min(0.2, length * 0.15)
    const midCenter = start.clone().addScaledVector(dir, length * midT)

    const c1 = midCenter.clone().addScaledVector(side, radius)
    const c2 = midCenter.clone().addScaledVector(perp, radius)
    const c3 = midCenter.clone().addScaledVector(side, -radius)
    const c4 = midCenter.clone().addScaledVector(perp, -radius)

    const positions: number[] = [
      start.x, start.y, start.z, c1.x, c1.y, c1.z, c2.x, c2.y, c2.z,
      start.x, start.y, start.z, c2.x, c2.y, c2.z, c3.x, c3.y, c3.z,
      start.x, start.y, start.z, c3.x, c3.y, c3.z, c4.x, c4.y, c4.z,
      start.x, start.y, start.z, c4.x, c4.y, c4.z, c1.x, c1.y, c1.z,
      c2.x, c2.y, c2.z, c1.x, c1.y, c1.z, end.x, end.y, end.z,
      c3.x, c3.y, c3.z, c2.x, c2.y, c2.z, end.x, end.y, end.z,
      c4.x, c4.y, c4.z, c3.x, c3.y, c3.z, end.x, end.y, end.z,
      c1.x, c1.y, c1.z, c4.x, c4.y, c4.z, end.x, end.y, end.z,
    ]

    const octGeom = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    octGeom.computeVertexNormals()

    const octMat = new THREE.MeshBasicMaterial({
      color: isSelected ? 0xf59e0b : 0x06b6d4,
      transparent: true,
      opacity: overlayOnly ? (isSelected ? 0.35 : 0.18) : (isSelected ? 0.75 : 0.4),
      side: THREE.DoubleSide,
      depthTest: !isXRay,
      depthWrite: false
    })
    const octMesh = new THREE.Mesh(octGeom, octMat)
    octMesh.renderOrder = 999
    octMesh.userData = { boneId: bone.id }
    boneGroup.add(octMesh)

    const wireGeom = new THREE.WireframeGeometry(octGeom)
    const wireMat = new THREE.LineBasicMaterial({
      color: isSelected ? 0xfef08a : 0x38bdf8,
      transparent: overlayOnly,
      opacity: overlayOnly ? 0.35 : 1,
      depthTest: !isXRay,
      depthWrite: false
    })
    const wire = new THREE.LineSegments(wireGeom, wireMat)
    wire.renderOrder = 1000
    boneGroup.add(wire)

    const jointGeom = new THREE.SphereGeometry(Math.max(0.08, radius * 0.75), 8, 8)
    const jointMat = new THREE.MeshBasicMaterial({
      color: isSelected ? 0xf59e0b : 0x06b6d4,
      depthTest: !isXRay,
      depthWrite: false
    })
    const jointMesh = new THREE.Mesh(jointGeom, jointMat)
    jointMesh.position.copy(start)
    jointMesh.renderOrder = 1001
    jointMesh.userData = { boneId: bone.id }
    boneGroup.add(jointMesh)

    // Render Sockets on Bone
    for (const s of bone.sockets || []) {
      const isSockSelected = animationStore.selectedSocketId === s.id
      const sockPos = start.clone().add(new THREE.Vector3(s.position.x, s.position.y, s.position.z))
      
      const sockGeom = new THREE.OctahedronGeometry(Math.max(0.06, radius * 0.5), 0)
      const sockMat = new THREE.MeshBasicMaterial({
        color: isSockSelected ? 0x38bdf8 : 0x0ea5e9,
        wireframe: !isSockSelected,
        depthTest: !isXRay,
        depthWrite: false
      })
      const sockMesh = new THREE.Mesh(sockGeom, sockMat)
      sockMesh.position.copy(sockPos)
      sockMesh.renderOrder = 1002
      sockMesh.userData = { socketId: s.id, boneId: bone.id }
      boneGroup.add(sockMesh)
    }
  }
}

function updateTransformGizmo() {
  if (isGizmoDragging || !transformControls || !scene) return

  // Socket Gizmo in Rig / Animation workspace
  if (toolStore.appMode === 'rig' || toolStore.appMode === 'animate') {
    const selSock = animationStore.selectedSocket
    if (selSock) {
      const bone = selSock.bone
      const s = selSock.socket
      const isPoseMode = toolStore.appMode === 'animate' || animationStore.isTestPoseActive
      let start: THREE.Vector3
      if (isPoseMode) {
        const boneMat = computeBoneWorldMatrix(bone, animationStore.armature.bones)
        start = new THREE.Vector3(bone.head.x, bone.head.y, bone.head.z).applyMatrix4(boneMat)
      } else {
        start = new THREE.Vector3(bone.head.x, bone.head.y, bone.head.z)
      }
      const sockWorldPos = start.clone().add(new THREE.Vector3(s.position.x, s.position.y, s.position.z))

      transformProxy.position.copy(sockWorldPos)
      transformProxy.rotation.set(
        THREE.MathUtils.degToRad(s.rotation.x),
        THREE.MathUtils.degToRad(s.rotation.y),
        THREE.MathUtils.degToRad(s.rotation.z)
      )
      transformProxy.scale.set(1, 1, 1)
      transformProxy.updateMatrixWorld()
      transformControls.attach(transformProxy)
      transformControls.setMode(toolStore.modelTool === 'rotate' ? 'rotate' : 'translate')
      return
    }
  }

  if (toolStore.appMode === 'rig') {
    const bone = animationStore.selectedBone
    if (bone) {
      if (animationStore.isTestPoseActive) {
        transformProxy.position.set(
          bone.head.x + bone.position.x,
          bone.head.y + bone.position.y,
          bone.head.z + bone.position.z
        )
        transformProxy.rotation.set(
          THREE.MathUtils.degToRad(bone.rotation.x),
          THREE.MathUtils.degToRad(bone.rotation.y),
          THREE.MathUtils.degToRad(bone.rotation.z)
        )
        transformProxy.scale.set(bone.scale.x, bone.scale.y, bone.scale.z)
        transformProxy.updateMatrixWorld()
        transformControls.attach(transformProxy)
        transformControls.setMode(toolStore.modelTool === 'rotate' ? 'rotate' : toolStore.modelTool === 'scale' ? 'scale' : 'translate')
        return
      }

      transformProxy.position.set(bone.head.x, bone.head.y, bone.head.z)
      transformProxy.rotation.set(0, 0, 0)
      transformProxy.scale.set(1, 1, 1)
      transformProxy.updateMatrixWorld()
      transformControls.attach(transformProxy)
      transformControls.setMode(toolStore.modelTool === 'rotate' ? 'rotate' : 'translate')
      return
    }
    transformControls.detach()
    return
  }

  if (toolStore.appMode === 'animate') {
    const bone = animationStore.selectedBone
    if (bone) {
      transformProxy.position.set(
        bone.head.x + bone.position.x,
        bone.head.y + bone.position.y,
        bone.head.z + bone.position.z
      )
      transformProxy.rotation.set(
        THREE.MathUtils.degToRad(bone.rotation.x),
        THREE.MathUtils.degToRad(bone.rotation.y),
        THREE.MathUtils.degToRad(bone.rotation.z)
      )
      transformProxy.scale.set(bone.scale.x, bone.scale.y, bone.scale.z)
      transformProxy.updateMatrixWorld()
      transformControls.attach(transformProxy)
      transformControls.setMode(toolStore.modelTool === 'rotate' ? 'rotate' : toolStore.modelTool === 'scale' ? 'scale' : 'translate')
      return
    }

    const activeMesh = projectStore.activeMesh
    if (activeMesh) {
      transformProxy.position.set(activeMesh.position.x, activeMesh.position.y, activeMesh.position.z)
      transformProxy.rotation.set(
        THREE.MathUtils.degToRad(activeMesh.rotation.x),
        THREE.MathUtils.degToRad(activeMesh.rotation.y),
        THREE.MathUtils.degToRad(activeMesh.rotation.z)
      )
      transformProxy.scale.set(activeMesh.scale.x, activeMesh.scale.y, activeMesh.scale.z)
      transformProxy.updateMatrixWorld()
      transformControls.attach(transformProxy)
      transformControls.setMode(toolStore.modelTool === 'rotate' ? 'rotate' : toolStore.modelTool === 'scale' ? 'scale' : 'translate')
      return
    }

    transformControls.detach()
    return
  }

  const activeMesh = projectStore.activeMesh
  if (toolStore.appMode === 'blockout' && projectStore.selectedReferenceId) {
    transformControls.detach()
    return
  }
  if (!activeMesh) {
    transformControls.detach()
    return
  }

  if (toolStore.appMode === 'uvpaint' && toolStore.modelTool === 'select') {
    transformControls.detach()
    return
  }

  if (toolStore.selectMode === 'origin') {
    transformProxy.position.set(activeMesh.position.x, activeMesh.position.y, activeMesh.position.z)
    transformProxy.rotation.set(0, 0, 0)
    transformProxy.scale.set(1, 1, 1)
    transformProxy.updateMatrixWorld()
    transformControls.attach(transformProxy)
    transformControls.setMode('translate')
    return
  } else if (
    toolStore.selectMode === 'object' ||
    (toolStore.selectMode === 'vertex' && projectStore.selectedVertexIds.length > 0) ||
    (toolStore.selectMode === 'edge' && projectStore.selectedEdgeIds.length > 0) ||
    (toolStore.selectMode === 'face' && projectStore.selectedFaceIds.length > 0)
  ) {
    let centroid: Vector3D
    let normalVec: THREE.Vector3 | null = null

    if (toolStore.selectMode === 'object') {
      if (projectStore.selectedMeshIds.length > 1 && toolStore.pivotPoint !== 'active') {
        const selectedMeshes = projectStore.meshes.filter(m => projectStore.selectedMeshIds.includes(m.id))
        centroid = computeCentroid(selectedMeshes.map(m => m.position))
      } else {
        centroid = { x: activeMesh.position.x, y: activeMesh.position.y, z: activeMesh.position.z }
      }
    } else if (toolStore.selectMode === 'vertex' && projectStore.selectedVertexIds.length > 0) {
      const selectedVerts = activeMesh.vertices.filter(v => projectStore.selectedVertexIds.includes(v.id))
      const mat = meshWorldMatrix(activeMesh)
      const worldPts = selectedVerts.map(v => localToWorld(activeMesh, v.position, mat))
      if (toolStore.pivotPoint === 'active') {
        const lastVertId = projectStore.selectedVertexIds[projectStore.selectedVertexIds.length - 1]
        const lastVert = activeMesh.vertices.find(v => v.id === lastVertId)
        const lastW = lastVert ? localToWorld(activeMesh, lastVert.position, mat) : worldPts[worldPts.length - 1]
        centroid = { x: lastW.x, y: lastW.y, z: lastW.z }
      } else {
        centroid = computeCentroid(worldPts.map(p => ({ x: p.x, y: p.y, z: p.z })))
      }
    } else if (toolStore.selectMode === 'edge' && projectStore.selectedEdgeIds.length > 0) {
      const allEdges = getMeshEdges(activeMesh)
      const vertMap = new Map(activeMesh.vertices.map(v => [v.id, v]))
      const mat = meshWorldMatrix(activeMesh)
      const targetVerts: Vector3D[] = []
      for (const e of allEdges) {
        if (projectStore.selectedEdgeIds.includes(e.id)) {
          const v1 = vertMap.get(e.v1)
          const v2 = vertMap.get(e.v2)
          if (v1) {
            const w = localToWorld(activeMesh, v1.position, mat)
            targetVerts.push({ x: w.x, y: w.y, z: w.z })
          }
          if (v2) {
            const w = localToWorld(activeMesh, v2.position, mat)
            targetVerts.push({ x: w.x, y: w.y, z: w.z })
          }
        }
      }
      centroid = computeCentroid(targetVerts)
    } else if (toolStore.selectMode === 'face' && projectStore.selectedFaceIds.length > 0) {
      const selectedFaces = activeMesh.faces.filter(f => projectStore.selectedFaceIds.includes(f.id))
      const vertMap = new Map(activeMesh.vertices.map(v => [v.id, v]))
      const mat = meshWorldMatrix(activeMesh)
      const targetVerts: Vector3D[] = []
      const normSum = new THREE.Vector3()

      for (const f of selectedFaces) {
        const fVerts: Vector3D[] = []
        for (const vid of f.vertexIds) {
          const v = vertMap.get(vid)
          if (v) {
            const w = localToWorld(activeMesh, v.position, mat)
            targetVerts.push({ x: w.x, y: w.y, z: w.z })
            fVerts.push(v.position)
          }
        }
        if (fVerts.length >= 3) {
          const fn = f.normal || computeFaceNormal(fVerts)
          const worldNorm = new THREE.Vector3(fn.x, fn.y, fn.z).transformDirection(mat)
          normSum.add(worldNorm)
        }
      }
      centroid = computeCentroid(targetVerts)
      if (normSum.lengthSq() > 0.001) {
        normalVec = normSum.normalize()
      }
    } else {
      transformControls.detach()
      return
    }

    // Apply Pivot point override
    if (toolStore.pivotPoint === 'cursor') {
      transformProxy.position.set(toolStore.cursor3D.x, toolStore.cursor3D.y, toolStore.cursor3D.z)
    } else {
      transformProxy.position.set(centroid.x, centroid.y, centroid.z)
    }

    // Apply Transform Orientation
    if (toolStore.transformOrientation === 'local') {
      transformProxy.rotation.set(
        THREE.MathUtils.degToRad(activeMesh.rotation.x),
        THREE.MathUtils.degToRad(activeMesh.rotation.y),
        THREE.MathUtils.degToRad(activeMesh.rotation.z)
      )
      transformControls.setSpace('local')
    } else if (toolStore.transformOrientation === 'view' && activeCamera) {
      transformProxy.quaternion.copy(activeCamera.quaternion)
      transformControls.setSpace('local')
    } else if (toolStore.transformOrientation === 'normal' && normalVec) {
      const up = Math.abs(normalVec.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
      const right = new THREE.Vector3().crossVectors(up, normalVec).normalize()
      const orthoUp = new THREE.Vector3().crossVectors(normalVec, right).normalize()
      const basisMat = new THREE.Matrix4().makeBasis(right, orthoUp, normalVec)
      transformProxy.quaternion.setFromRotationMatrix(basisMat)
      transformControls.setSpace('local')
    } else {
      transformProxy.rotation.set(0, 0, 0)
      transformControls.setSpace('world')
    }

    transformProxy.scale.set(1, 1, 1)
    transformProxy.updateMatrixWorld()
    transformControls.attach(transformProxy)
  } else {
    transformControls.detach()
    return
  }

  if (toolStore.modelTool === 'move') {
    transformControls.setMode('translate')
  } else if (toolStore.modelTool === 'rotate') {
    transformControls.setMode('rotate')
  } else if (toolStore.modelTool === 'scale') {
    transformControls.setMode('scale')
  }

  applyThemeToTransformGizmo(transformControls)
}

function applyThemeToTransformGizmo(tc: TransformControls, customColors?: ThemeColors) {
  if (!tc) return
  const helper = tc.getHelper()
  if (!helper) return
  const colors = customColors || themeStore.activeColors

  helper.traverse((child: any) => {
    if (child.material) {
      const mat = child.material
      const name = (child.name || '').toUpperCase()

      if (name.includes('XY')) {
        mat.color.set(colors.gizmoZ)
        mat.opacity = 0.5
      } else if (name.includes('YZ')) {
        mat.color.set(colors.gizmoX)
        mat.opacity = 0.5
      } else if (name.includes('XZ')) {
        mat.color.set(colors.gizmoY)
        mat.opacity = 0.5
      } else if (name.includes('X') && !name.includes('Y') && !name.includes('Z')) {
        mat.color.set(colors.gizmoX)
        mat.opacity = 1.0
      } else if (name.includes('Y') && !name.includes('X') && !name.includes('Z')) {
        mat.color.set(colors.gizmoY)
        mat.opacity = 1.0
      } else if (name.includes('Z') && !name.includes('X') && !name.includes('Y')) {
        mat.color.set(colors.gizmoZ)
        mat.opacity = 1.0
      } else if (name === 'XYZ' || name === 'E' || name === 'START' || name === 'END' || name === 'DELTA') {
        mat.color.set(colors.gizmoAccent)
        mat.opacity = 1.0
      }
    }
  })
}

function applyTheme(colors: ThemeColors) {
  if (scene) {
    scene.background = new THREE.Color(colors.viewportBg)
  }

  if (layers && layers.gridGroup) {
    buildSceneGrids(new THREE.Color(colors.gridMajor), new THREE.Color(colors.gridMinor))

    if (axesHelper) {
      axesHelper.setColors(
        new THREE.Color(colors.gizmoX),
        new THREE.Color(colors.gizmoY),
        new THREE.Color(colors.gizmoZ)
      )
    }
  }

  if (transformControls) {
    applyThemeToTransformGizmo(transformControls, colors)
  }

  if (hoverFaceMesh && hoverFaceMesh.material) {
    (hoverFaceMesh.material as THREE.MeshBasicMaterial).color.set(colors.selectionColor)
  }
  if (hoverEdgeMesh && hoverEdgeMesh.material) {
    (hoverEdgeMesh.material as THREE.LineBasicMaterial).color.set(colors.selectionColor)
  }
  if (hoverVertexMesh && hoverVertexMesh.material) {
    (hoverVertexMesh.material as THREE.PointsMaterial).color.set(colors.selectionColor)
  }
}

const dragStartBonesMap = new Map<string, { head: Vector3D; tail: Vector3D; position: Vector3D; rotation: Vector3D; scale: Vector3D }>()

function onGizmoDragStart() {
  projectStore.recordState(toolStore.selectMode === 'origin' ? 'Move Origin' : 'Transform')
  transformProxy.updateMatrixWorld()
  dragStartProxyMatrix.copy(transformProxy.matrixWorld)
  dragStartProxyMatrixInverse.copy(dragStartProxyMatrix).invert()

  dragStartVertexMap.clear()
  dragStartMultiMeshMap.clear()
  dragStartBonesMap.clear()

  for (const b of animationStore.armature.bones) {
    dragStartBonesMap.set(b.id, {
      head: { ...b.head },
      tail: { ...b.tail },
      position: { ...b.position },
      rotation: { ...b.rotation },
      scale: { ...b.scale }
    })
  }

  const targetMeshes = projectStore.meshes.filter(m => projectStore.selectedMeshIds.includes(m.id) || m.id === projectStore.activeMeshId)
  for (const m of targetMeshes) {
    dragStartMultiMeshMap.set(m.id, {
      position: new THREE.Vector3(m.position.x, m.position.y, m.position.z),
      rotation: new THREE.Euler(
        THREE.MathUtils.degToRad(m.rotation.x),
        THREE.MathUtils.degToRad(m.rotation.y),
        THREE.MathUtils.degToRad(m.rotation.z)
      ),
      scale: new THREE.Vector3(m.scale.x, m.scale.y, m.scale.z)
    })
  }

  const activeMesh = projectStore.activeMesh
  if (activeMesh) {
    const mat = meshWorldMatrix(activeMesh)
    for (const v of activeMesh.vertices) {
      dragStartVertexMap.set(v.id, localToWorld(activeMesh, v.position, mat))
    }
  }
}

function onGizmoObjectChange() {
  const activeMesh = projectStore.activeMesh
  transformProxy.updateMatrixWorld()

  // Socket gizmo drag in Rig / Animate
  const selSock = animationStore.selectedSocket
  if (selSock && (toolStore.appMode === 'rig' || toolStore.appMode === 'animate')) {
    const bone = selSock.bone
    const s = selSock.socket
    const isPoseMode = toolStore.appMode === 'animate' || animationStore.isTestPoseActive
    let start: THREE.Vector3
    if (isPoseMode) {
      const boneMat = computeBoneWorldMatrix(bone, animationStore.armature.bones)
      start = new THREE.Vector3(bone.head.x, bone.head.y, bone.head.z).applyMatrix4(boneMat)
    } else {
      start = new THREE.Vector3(bone.head.x, bone.head.y, bone.head.z)
    }

    if (transformControls.getMode() === 'rotate') {
      s.rotation.x = Number(THREE.MathUtils.radToDeg(transformProxy.rotation.x).toFixed(2))
      s.rotation.y = Number(THREE.MathUtils.radToDeg(transformProxy.rotation.y).toFixed(2))
      s.rotation.z = Number(THREE.MathUtils.radToDeg(transformProxy.rotation.z).toFixed(2))
    } else {
      s.position.x = Number((transformProxy.position.x - start.x).toFixed(3))
      s.position.y = Number((transformProxy.position.y - start.y).toFixed(3))
      s.position.z = Number((transformProxy.position.z - start.z).toFixed(3))
    }
    rebuildBones()
    refreshLiveDeform()
    return
  }

  if (toolStore.appMode === 'rig') {
    const bone = animationStore.selectedBone
    if (bone) {
      if (animationStore.isTestPoseActive) {
        if (transformControls.getMode() === 'translate' && (bone.ikConstraint?.enabled || bone.parentId || bone.childrenIds.length > 0)) {
          if (bone.ikConstraint?.enabled) {
            const chain = bone.ikConstraint.chainLength || 2
            setIKTargetAndSolve(bone, transformProxy.position, animationStore.armature.bones, chain)
          } else {
            solveCCDIK(bone.id, transformProxy.position, animationStore.armature.bones, 2)
          }
        } else if (transformControls.getMode() === 'rotate') {
          bone.rotation.x = Number(THREE.MathUtils.radToDeg(transformProxy.rotation.x).toFixed(2))
          bone.rotation.y = Number(THREE.MathUtils.radToDeg(transformProxy.rotation.y).toFixed(2))
          bone.rotation.z = Number(THREE.MathUtils.radToDeg(transformProxy.rotation.z).toFixed(2))
        } else if (transformControls.getMode() === 'scale') {
          bone.scale.x = Number(transformProxy.scale.x.toFixed(3))
          bone.scale.y = Number(transformProxy.scale.y.toFixed(3))
          bone.scale.z = Number(transformProxy.scale.z.toFixed(3))
        } else {
          bone.position.x = Number((transformProxy.position.x - bone.head.x).toFixed(3))
          bone.position.y = Number((transformProxy.position.y - bone.head.y).toFixed(3))
          bone.position.z = Number((transformProxy.position.z - bone.head.z).toFixed(3))
        }
        rebuildBones()
        refreshLiveDeform()
        return
      }

      const origBone = dragStartBonesMap.get(bone.id)
      if (origBone) {
        if (transformControls.getMode() === 'rotate') {
          const pivot = new THREE.Vector3(origBone.head.x, origBone.head.y, origBone.head.z)
          const rotEuler = transformProxy.rotation
          const rotQuat = new THREE.Quaternion().setFromEuler(rotEuler)

          const origTailVec = new THREE.Vector3(origBone.tail.x - pivot.x, origBone.tail.y - pivot.y, origBone.tail.z - pivot.z)
          const newTail = origTailVec.applyQuaternion(rotQuat).add(pivot)
          bone.tail.x = Number(newTail.x.toFixed(3))
          bone.tail.y = Number(newTail.y.toFixed(3))
          bone.tail.z = Number(newTail.z.toFixed(3))

          // Recursively rotate all descendant child bones around the parent pivot in Edit Rig mode
          function rotateChildren(parentId: string) {
            const pBone = animationStore.armature.bones.find(b => b.id === parentId)
            if (!pBone) return
            for (const cId of pBone.childrenIds) {
              const child = animationStore.armature.bones.find(b => b.id === cId)
              const origChild = dragStartBonesMap.get(cId)
              if (!child || !origChild) continue

              const newHead = new THREE.Vector3(origChild.head.x - pivot.x, origChild.head.y - pivot.y, origChild.head.z - pivot.z)
                .applyQuaternion(rotQuat).add(pivot)
              const newChildTail = new THREE.Vector3(origChild.tail.x - pivot.x, origChild.tail.y - pivot.y, origChild.tail.z - pivot.z)
                .applyQuaternion(rotQuat).add(pivot)

              child.head.x = Number(newHead.x.toFixed(3))
              child.head.y = Number(newHead.y.toFixed(3))
              child.head.z = Number(newHead.z.toFixed(3))
              child.tail.x = Number(newChildTail.x.toFixed(3))
              child.tail.y = Number(newChildTail.y.toFixed(3))
              child.tail.z = Number(newChildTail.z.toFixed(3))

              rotateChildren(cId)
            }
          }
          rotateChildren(bone.id)
        } else {
          const deltaX = transformProxy.position.x - origBone.head.x
          const deltaY = transformProxy.position.y - origBone.head.y
          const deltaZ = transformProxy.position.z - origBone.head.z
          bone.head.x = Number(transformProxy.position.x.toFixed(3))
          bone.head.y = Number(transformProxy.position.y.toFixed(3))
          bone.head.z = Number(transformProxy.position.z.toFixed(3))
          bone.tail.x = Number((origBone.tail.x + deltaX).toFixed(3))
          bone.tail.y = Number((origBone.tail.y + deltaY).toFixed(3))
          bone.tail.z = Number((origBone.tail.z + deltaZ).toFixed(3))

          // Recursively translate all descendant child bones in Edit Rig mode
          function translateChildren(parentId: string) {
            const pBone = animationStore.armature.bones.find(b => b.id === parentId)
            if (!pBone) return
            for (const cId of pBone.childrenIds) {
              const child = animationStore.armature.bones.find(b => b.id === cId)
              const origChild = dragStartBonesMap.get(cId)
              if (!child || !origChild) continue

              child.head.x = Number((origChild.head.x + deltaX).toFixed(3))
              child.head.y = Number((origChild.head.y + deltaY).toFixed(3))
              child.head.z = Number((origChild.head.z + deltaZ).toFixed(3))
              child.tail.x = Number((origChild.tail.x + deltaX).toFixed(3))
              child.tail.y = Number((origChild.tail.y + deltaY).toFixed(3))
              child.tail.z = Number((origChild.tail.z + deltaZ).toFixed(3))

              translateChildren(cId)
            }
          }
          translateChildren(bone.id)
        }
      }
      rebuildBones()
      refreshLiveDeform()
      return
    }
  }

  if (toolStore.appMode === 'animate') {
    const bone = animationStore.selectedBone
    if (bone) {
      if (transformControls.getMode() === 'translate' && (bone.ikConstraint?.enabled || bone.parentId || bone.childrenIds.length > 0)) {
        if (bone.ikConstraint?.enabled) {
          const chain = bone.ikConstraint.chainLength || 2
          setIKTargetAndSolve(bone, transformProxy.position, animationStore.armature.bones, chain)
        } else {
          solveCCDIK(bone.id, transformProxy.position, animationStore.armature.bones, 2)
        }
      } else if (transformControls.getMode() === 'rotate') {
        bone.rotation.x = Number(THREE.MathUtils.radToDeg(transformProxy.rotation.x).toFixed(2))
        bone.rotation.y = Number(THREE.MathUtils.radToDeg(transformProxy.rotation.y).toFixed(2))
        bone.rotation.z = Number(THREE.MathUtils.radToDeg(transformProxy.rotation.z).toFixed(2))
      } else if (transformControls.getMode() === 'scale') {
        bone.scale.x = Number(transformProxy.scale.x.toFixed(3))
        bone.scale.y = Number(transformProxy.scale.y.toFixed(3))
        bone.scale.z = Number(transformProxy.scale.z.toFixed(3))
      } else {
        bone.position.x = Number((transformProxy.position.x - bone.head.x).toFixed(3))
        bone.position.y = Number((transformProxy.position.y - bone.head.y).toFixed(3))
        bone.position.z = Number((transformProxy.position.z - bone.head.z).toFixed(3))
      }
      rebuildBones()
      refreshLiveDeform()
      return
    }

    if (activeMesh) {
      activeMesh.position.x = transformProxy.position.x
      activeMesh.position.y = transformProxy.position.y
      activeMesh.position.z = transformProxy.position.z

      activeMesh.rotation.x = THREE.MathUtils.radToDeg(transformProxy.rotation.x)
      activeMesh.rotation.y = THREE.MathUtils.radToDeg(transformProxy.rotation.y)
      activeMesh.rotation.z = THREE.MathUtils.radToDeg(transformProxy.rotation.z)

      activeMesh.scale.x = transformProxy.scale.x
      activeMesh.scale.y = transformProxy.scale.y
      activeMesh.scale.z = transformProxy.scale.z

      const threeMesh = layers.modelGroup.getObjectByName(activeMesh.id)
      if (threeMesh) {
        threeMesh.position.copy(transformProxy.position)
        threeMesh.rotation.copy(transformProxy.rotation)
        threeMesh.scale.copy(transformProxy.scale)
      }
      return
    }
  }

  if (!activeMesh) return

  if (toolStore.selectMode === 'origin') {
    const dx = transformProxy.position.x - activeMesh.position.x
    const dy = transformProxy.position.y - activeMesh.position.y
    const dz = transformProxy.position.z - activeMesh.position.z

    activeMesh.position.x = transformProxy.position.x
    activeMesh.position.y = transformProxy.position.y
    activeMesh.position.z = transformProxy.position.z

    for (const v of activeMesh.vertices) {
      v.position.x -= dx
      v.position.y -= dy
      v.position.z -= dz
    }

    const { 
      geometry, 
      wireframeGeometry,
      vertexPointsGeometry: ptsGeom,
      selectedFacesGeometry: selFacesGeom,
      selectedEdgesGeometry: selEdgesGeom,
      edgeLinesGeometry: edgeLinesGeom
    } = meshToThreeGeometry(activeMesh)
    ptsGeom.dispose()
    selFacesGeom.dispose()
    selEdgesGeom.dispose()
    edgeLinesGeom.dispose()

    const threeMesh = layers.modelGroup.getObjectByName(activeMesh.id) as THREE.Mesh
    if (threeMesh) {
      threeMesh.position.copy(transformProxy.position)
      threeMesh.geometry.dispose()
      threeMesh.geometry = geometry
    }

    const wire = layers.wireframeGroup.getObjectByName(`${activeMesh.id}_wire`) as THREE.LineSegments
    if (wire) {
      wire.position.copy(transformProxy.position)
      wire.geometry.dispose()
      wire.geometry = wireframeGeometry
    }

    const origMarker = layers.gizmoGroup.getObjectByName(`${activeMesh.id}_origin`) as THREE.Mesh
    if (origMarker) {
      origMarker.position.copy(transformProxy.position)
    }

    const crosshair = layers.gizmoGroup.getObjectByName(`${activeMesh.id}_crosshair`) as THREE.LineSegments
    if (crosshair) {
      crosshair.position.copy(transformProxy.position)
    }

    const ring = layers.gizmoGroup.getObjectByName(`${activeMesh.id}_origin_ring`) as THREE.Mesh
    if (ring) {
      ring.position.copy(transformProxy.position)
    }
    return
  }

  if (toolStore.selectMode === 'object') {
    if (projectStore.selectedMeshIds.length > 1) {
      const deltaMatrix = new THREE.Matrix4().multiplyMatrices(
        transformProxy.matrixWorld,
        dragStartProxyMatrixInverse
      )

      for (const meshObj of projectStore.meshes) {
        if (projectStore.selectedMeshIds.includes(meshObj.id)) {
          const startData = dragStartMultiMeshMap.get(meshObj.id)
          if (startData) {
            const startMatrix = new THREE.Matrix4().compose(
              startData.position,
              new THREE.Quaternion().setFromEuler(startData.rotation),
              startData.scale
            )
            const transformedMatrix = new THREE.Matrix4().multiplyMatrices(deltaMatrix, startMatrix)
            const newPos = new THREE.Vector3()
            const newQuat = new THREE.Quaternion()
            const newScale = new THREE.Vector3()
            transformedMatrix.decompose(newPos, newQuat, newScale)
            const newEuler = new THREE.Euler().setFromQuaternion(newQuat)

            meshObj.position.x = newPos.x
            meshObj.position.y = newPos.y
            meshObj.position.z = newPos.z

            meshObj.rotation.x = THREE.MathUtils.radToDeg(newEuler.x)
            meshObj.rotation.y = THREE.MathUtils.radToDeg(newEuler.y)
            meshObj.rotation.z = THREE.MathUtils.radToDeg(newEuler.z)

            meshObj.scale.x = newScale.x
            meshObj.scale.y = newScale.y
            meshObj.scale.z = newScale.z

            const threeMesh = layers.modelGroup.getObjectByName(meshObj.id)
            if (threeMesh) {
              threeMesh.position.copy(newPos)
              threeMesh.quaternion.copy(newQuat)
              threeMesh.scale.copy(newScale)
            }
            const wire = layers.wireframeGroup.getObjectByName(`${meshObj.id}_wire`)
            if (wire) {
              wire.position.copy(newPos)
              wire.quaternion.copy(newQuat)
              wire.scale.copy(newScale)
            }
          }
        }
      }
      return
    }

    activeMesh.position.x = transformProxy.position.x
    activeMesh.position.y = transformProxy.position.y
    activeMesh.position.z = transformProxy.position.z

    activeMesh.rotation.x = THREE.MathUtils.radToDeg(transformProxy.rotation.x)
    activeMesh.rotation.y = THREE.MathUtils.radToDeg(transformProxy.rotation.y)
    activeMesh.rotation.z = THREE.MathUtils.radToDeg(transformProxy.rotation.z)

    activeMesh.scale.x = transformProxy.scale.x
    activeMesh.scale.y = transformProxy.scale.y
    activeMesh.scale.z = transformProxy.scale.z

    const threeMesh = layers.modelGroup.getObjectByName(activeMesh.id)
    if (threeMesh) {
      threeMesh.position.copy(transformProxy.position)
      threeMesh.rotation.copy(transformProxy.rotation)
      threeMesh.scale.copy(transformProxy.scale)

      const wire = layers.wireframeGroup.getObjectByName(`${activeMesh.id}_wire`)
      if (wire) {
        wire.position.copy(transformProxy.position)
        wire.rotation.copy(transformProxy.rotation)
        wire.scale.copy(transformProxy.scale)
      }

      const selFaces = layers.selectionGroup.getObjectByName(`${activeMesh.id}_selfaces`)
      if (selFaces) {
        selFaces.position.copy(transformProxy.position)
        selFaces.rotation.copy(transformProxy.rotation)
        selFaces.scale.copy(transformProxy.scale)
      }
    }
  } else if (toolStore.selectMode === 'vertex' || toolStore.selectMode === 'face' || toolStore.selectMode === 'edge') {
    const deltaMatrix = new THREE.Matrix4().multiplyMatrices(
      transformProxy.matrixWorld,
      dragStartProxyMatrixInverse
    )

    const targetVertIds = new Set<string>()
    if (toolStore.selectMode === 'vertex') {
      projectStore.selectedVertexIds.forEach(id => targetVertIds.add(id))
    } else if (toolStore.selectMode === 'edge') {
      const allEdges = getMeshEdges(activeMesh)
      for (const e of allEdges) {
        if (projectStore.selectedEdgeIds.includes(e.id)) {
          targetVertIds.add(e.v1)
          targetVertIds.add(e.v2)
        }
      }
    } else if (toolStore.selectMode === 'face') {
      const selectedFaces = activeMesh.faces.filter(f => projectStore.selectedFaceIds.includes(f.id))
      for (const f of selectedFaces) {
        f.vertexIds.forEach(id => targetVertIds.add(id))
      }
    }

    const invMat = meshWorldMatrix(activeMesh).invert()
    for (const v of activeMesh.vertices) {
      if (targetVertIds.has(v.id)) {
        const startWorld = dragStartVertexMap.get(v.id)
        if (startWorld) {
          const transformedWorld = startWorld.clone().applyMatrix4(deltaMatrix)
          const local = worldToLocal(activeMesh, transformedWorld, invMat)
          let px = local.x
          let py = local.y
          let pz = local.z

          if (activeMesh.mirror?.enabled && activeMesh.mirror.clipping) {
            const startLocal = worldToLocal(activeMesh, startWorld, invMat)
            if (activeMesh.mirror.axisX) {
              if (startLocal.x >= 0 && px < 0) px = 0
              if (startLocal.x <= 0 && px > 0) px = 0
            }
            if (activeMesh.mirror.axisY) {
              if (startLocal.y >= 0 && py < 0) py = 0
              if (startLocal.y <= 0 && py > 0) py = 0
            }
            if (activeMesh.mirror.axisZ) {
              if (startLocal.z >= 0 && pz < 0) pz = 0
              if (startLocal.z <= 0 && pz > 0) pz = 0
            }
          }

          v.position.x = px
          v.position.y = py
          v.position.z = pz
        }
      }
    }

    if (toolStore.snapping.vertex || toolStore.snapping.edge) {
      const moving: THREE.Vector3[] = []
      const movingVerts: Vertex[] = []
      for (const v of activeMesh.vertices) {
        if (!targetVertIds.has(v.id)) continue
        moving.push(new THREE.Vector3(v.position.x, v.position.y, v.position.z))
        movingVerts.push(v)
      }
      const targets: THREE.Vector3[] = []
      if (toolStore.snapping.vertex) {
        for (const v of activeMesh.vertices) {
          if (targetVertIds.has(v.id)) continue
          targets.push(new THREE.Vector3(v.position.x, v.position.y, v.position.z))
        }
      }
      if (toolStore.snapping.edge) {
        for (const e of getMeshEdges(activeMesh)) {
          if (targetVertIds.has(e.v1) || targetVertIds.has(e.v2)) continue
          const a = activeMesh.vertices.find(vert => vert.id === e.v1)
          const b = activeMesh.vertices.find(vert => vert.id === e.v2)
          if (!a || !b) continue
          targets.push(new THREE.Vector3(
            (a.position.x + b.position.x) * 0.5,
            (a.position.y + b.position.y) * 0.5,
            (a.position.z + b.position.z) * 0.5
          ))
        }
      }
      const thresh = Math.max(0.06, toolStore.snapping.gridSize * 0.75)
      const extra = SnapManager.findRigidSnapOffset(moving, targets, thresh)
      if (extra) {
        for (const v of movingVerts) {
          v.position.x += extra.x
          v.position.y += extra.y
          v.position.z += extra.z
        }
      }
    }

    // Live X-Symmetry Mirroring
    if (toolStore.viewport.symmetryX) {
      for (const v of activeMesh.vertices) {
        if (!targetVertIds.has(v.id)) {
          for (const selId of targetVertIds) {
            const sel = activeMesh.vertices.find(vert => vert.id === selId)
            if (!sel) continue
            if (Math.abs(v.position.x + sel.position.x) < 0.05 && Math.abs(v.position.y - sel.position.y) < 0.05 && Math.abs(v.position.z - sel.position.z) < 0.05) {
              v.position.x = -sel.position.x
              v.position.y = sel.position.y
              v.position.z = sel.position.z
            }
          }
        }
      }
    }

    const { 
      geometry, 
      wireframeGeometry, 
      vertexPointsGeometry, 
      selectedFacesGeometry, 
      selectedEdgesGeometry,
      edgeLinesGeometry
    } = meshToThreeGeometry(
      activeMesh,
      toolStore.selectMode === 'face' ? projectStore.selectedFaceIds : [],
      toolStore.selectMode === 'edge' ? projectStore.selectedEdgeIds : []
    )
    edgeLinesGeometry.dispose()

    const threeMesh = layers.modelGroup.getObjectByName(activeMesh.id) as THREE.Mesh
    if (threeMesh) {
      threeMesh.geometry.dispose()
      threeMesh.geometry = geometry
    } else {
      geometry.dispose()
    }

    const wire = layers.wireframeGroup.getObjectByName(`${activeMesh.id}_wire`) as THREE.LineSegments
    if (wire) {
      wire.geometry.dispose()
      wire.geometry = wireframeGeometry
    } else {
      wireframeGeometry.dispose()
    }

    const pts = layers.wireframeGroup.getObjectByName(`${activeMesh.id}_pts`) as THREE.Points
    if (pts) {
      pts.geometry.dispose()
      pts.geometry = vertexPointsGeometry
    } else {
      vertexPointsGeometry.dispose()
    }

    const selFaces = layers.selectionGroup.getObjectByName(`${activeMesh.id}_selfaces`) as THREE.Mesh
    if (selFaces) {
      selFaces.geometry.dispose()
      selFaces.geometry = selectedFacesGeometry
    } else {
      selectedFacesGeometry.dispose()
    }

    const selEdges = layers.wireframeGroup.getObjectByName(`${activeMesh.id}_seledges`) as THREE.LineSegments
    if (selEdges) {
      selEdges.geometry.dispose()
      selEdges.geometry = selectedEdgesGeometry
    } else {
      selectedEdgesGeometry.dispose()
    }
  }
}

function commitProxyTransform() {
  const posing =
    (toolStore.appMode === 'animate' || toolStore.appMode === 'rig') && !!animationStore.selectedBoneId

  if (
    projectStore.activeMesh &&
    toolStore.snapping.autoMerge &&
    (toolStore.selectMode === 'vertex' || toolStore.selectMode === 'edge')
  ) {
    const threshold = toolStore.snapping.autoMergeThreshold || 0.015
    projectStore.performAutoMerge(projectStore.activeMesh.id, threshold)
  }

  if (projectStore.activeMesh && !posing) {
    projectStore.markGeometryUpdated()
  }

  if (toolStore.appMode === 'animate' && animationStore.autoKey) {
    animationStore.recordCurrentKeyframe()
  }

  isGizmoDragging = false
  rebuildBones()
  rebuildMeshes()
}

// Screen-Space NDC calculations
function pickPixelNdc(px: number) {
  const h = containerRef.value?.clientHeight || 800
  return (px * 2) / h
}

function surfaceHitDistance(): number {
  if (toolStore.viewport.xray || !layers) return Infinity
  const hits = raycaster.intersectObjects(layers.modelGroup.children, true)
  return hits[0]?.distance ?? Infinity
}

function findClosestVertexScreen(mesh: MeshObject, maxDistPx = 14): Vertex | null {
  let closestV: Vertex | null = null
  let minDist = pickPixelNdc(maxDistPx)
  const mat = meshWorldMatrix(mesh)
  const camPos = new THREE.Vector3()
  activeCamera.getWorldPosition(camPos)
  const occludeAt = surfaceHitDistance()

  for (const v of mesh.vertices) {
    const worldPos = localToWorld(mesh, v.position, mat)
    const dist3 = camPos.distanceTo(worldPos)
    if (dist3 > occludeAt + 0.06) continue
    const ndc = worldPos.project(activeCamera)
    if (ndc.z > 1 || ndc.z < -1) continue

    const d = Math.hypot(ndc.x - mouse.x, ndc.y - mouse.y)
    if (d < minDist) {
      minDist = d
      closestV = v
    }
  }
  return closestV
}

function findClosestEdgeScreen(mesh: MeshObject, maxDistPx = 10): Edge | null {
  const edges = getMeshEdges(mesh)
  const vertMap = new Map<string, Vertex>()
  for (const v of mesh.vertices) {
    vertMap.set(v.id, v)
  }

  let closestE: Edge | null = null
  let minDist = pickPixelNdc(maxDistPx)
  const mat = meshWorldMatrix(mesh)
  const camPos = new THREE.Vector3()
  activeCamera.getWorldPosition(camPos)
  const occludeAt = surfaceHitDistance()

  for (const edge of edges) {
    const v1 = vertMap.get(edge.v1)
    const v2 = vertMap.get(edge.v2)
    if (!v1 || !v2) continue

    const w1 = localToWorld(mesh, v1.position, mat)
    const w2 = localToWorld(mesh, v2.position, mat)
    const midDist = camPos.distanceTo(w1.clone().lerp(w2, 0.5))
    if (midDist > occludeAt + 0.08) continue

    const p1 = w1.project(activeCamera)
    const p2 = w2.clone().project(activeCamera)
    if ((p1.z > 1 && p2.z > 1) || (p1.z < -1 && p2.z < -1)) continue

    const d = distanceToSegment2D(mouse.x, mouse.y, p1.x, p1.y, p2.x, p2.y)
    if (d < minDist) {
      minDist = d
      closestE = edge
    }
  }
  return closestE
}

function distanceToSegment2D(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1)
  if (l2 === 0) return Math.hypot(px - x1, py - y1)
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)))
}

function updateActiveCameraAndQuadrant(event: PointerEvent | MouseEvent) {
  if (!renderer || !renderer.domElement) return
  const rect = renderer.domElement.getBoundingClientRect()
  const mousePxX = event.clientX - rect.left
  const mousePxY = event.clientY - rect.top
  const width = rect.width
  const height = rect.height

  const isGizmoActive = isGizmoDragging || transformControls.dragging || (transformControls as any).axis !== null

  if (isTripleView()) {
    const hit = tripleHit(mousePxX, width)
    if (hit.col === 0) {
      activeCamera = cameraFront
      activeQuadrant.value = 'col_front'
      orbitControls.enabled = false
    } else if (hit.col === 1) {
      activeCamera = cameraRight
      activeQuadrant.value = 'col_side'
      orbitControls.enabled = false
    } else {
      activeCamera = cameraPersp
      activeQuadrant.value = 'col_persp'
      orbitControls.enabled = !isGizmoActive
    }
    mouse.x = (hit.localX / hit.localW) * 2 - 1
    mouse.y = -(mousePxY / height) * 2 + 1
    transformControls.camera = activeCamera
    transformControls.enabled = !isGizmoActive
    return
  }

  if (!toolStore.viewport.quadView) {
    activeCamera = cameraPersp
    activeQuadrant.value = 'main'
    orbitControls.enabled = !isGizmoActive
    mouse.x = (mousePxX / width) * 2 - 1
    mouse.y = -(mousePxY / height) * 2 + 1
    transformControls.camera = cameraPersp
    transformControls.enabled = true
    return
  }

  const isLeft = mousePxX < width / 2
  const isTop = mousePxY < height / 2

  if (isLeft && isTop) {
    activeCamera = cameraTop
    activeQuadrant.value = 'top_left'
    orbitControls.enabled = false
    mouse.x = (mousePxX / (width / 2)) * 2 - 1
    mouse.y = -(mousePxY / (height / 2)) * 2 + 1
  } else if (!isLeft && isTop) {
    activeCamera = cameraPersp
    activeQuadrant.value = 'top_right'
    orbitControls.enabled = !isGizmoActive
    mouse.x = ((mousePxX - width / 2) / (width / 2)) * 2 - 1
    mouse.y = -(mousePxY / (height / 2)) * 2 + 1
  } else if (isLeft && !isTop) {
    activeCamera = cameraFront
    activeQuadrant.value = 'bottom_left'
    orbitControls.enabled = false
    mouse.x = (mousePxX / (width / 2)) * 2 - 1
    mouse.y = -((mousePxY - height / 2) / (height / 2)) * 2 + 1
  } else {
    activeCamera = cameraRight
    activeQuadrant.value = 'bottom_right'
    orbitControls.enabled = false
    mouse.x = ((mousePxX - width / 2) / (width / 2)) * 2 - 1
    mouse.y = -((mousePxY - height / 2) / (height / 2)) * 2 + 1
  }

  transformControls.camera = activeCamera
}

// ----------------------------------------------------
// Smooth LightWave Navigation Controls (Incremental)
// ----------------------------------------------------
function startLightWavePan(camType: 'persp' | 'top' | 'front' | 'right', e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  let prevX = e.clientX
  let prevY = e.clientY

  let targetCam: THREE.Camera = cameraPersp
  if (camType === 'top') targetCam = cameraTop
  else if (camType === 'front') targetCam = cameraFront
  else if (camType === 'right') targetCam = cameraRight

  const onMove = (moveEvt: MouseEvent) => {
    const dx = moveEvt.clientX - prevX
    const dy = moveEvt.clientY - prevY
    prevX = moveEvt.clientX
    prevY = moveEvt.clientY

    if (camType === 'persp') {
      const vRight = new THREE.Vector3(1, 0, 0).applyQuaternion(cameraPersp.quaternion)
      const vUp = new THREE.Vector3(0, 1, 0).applyQuaternion(cameraPersp.quaternion)
      const dist = cameraPersp.position.distanceTo(orbitControls.target)
      const factor = dist * 0.0016
      const offset = vRight.clone().multiplyScalar(-dx * factor).add(vUp.clone().multiplyScalar(dy * factor))
      cameraPersp.position.add(offset)
      orbitControls.target.add(offset)
    } else {
      const orthoCam = targetCam as THREE.OrthographicCamera
      const factor = 0.015 / (orthoCam.zoom || 1)
      const vRight = new THREE.Vector3(1, 0, 0).applyQuaternion(orthoCam.quaternion)
      const vUp = new THREE.Vector3(0, 1, 0).applyQuaternion(orthoCam.quaternion)
      const offset = vRight.clone().multiplyScalar(-dx * factor).add(vUp.clone().multiplyScalar(dy * factor))
      orthoCam.position.add(offset)
    }
  }

  const onUp = () => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }

  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

function startLightWaveRotate(e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  let prevX = e.clientX
  let prevY = e.clientY

  const onMove = (moveEvt: MouseEvent) => {
    const dx = moveEvt.clientX - prevX
    const dy = moveEvt.clientY - prevY
    prevX = moveEvt.clientX
    prevY = moveEvt.clientY

    const offset = new THREE.Vector3().subVectors(cameraPersp.position, orbitControls.target)
    const spherical = new THREE.Spherical().setFromVector3(offset)
    spherical.theta -= dx * 0.007
    spherical.phi -= dy * 0.007
    spherical.phi = Math.max(0.01, Math.min(Math.PI - 0.01, spherical.phi))
    offset.setFromSpherical(spherical)
    cameraPersp.position.copy(orbitControls.target).add(offset)
    cameraPersp.lookAt(orbitControls.target)
  }

  const onUp = () => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }

  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

function startLightWaveZoom(camType: 'persp' | 'top' | 'front' | 'right', e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  let prevY = e.clientY

  const onMove = (moveEvt: MouseEvent) => {
    const dy = moveEvt.clientY - prevY
    prevY = moveEvt.clientY
    const invert = toolStore.viewport.invertZoom ? -1 : 1

    if (camType === 'persp') {
      const factor = 1 + (dy * invert) * 0.01
      const offset = new THREE.Vector3().subVectors(cameraPersp.position, orbitControls.target).multiplyScalar(factor)
      if (offset.length() > 0.3 && offset.length() < 150) {
        cameraPersp.position.copy(orbitControls.target).add(offset)
      }
    } else {
      let cam: THREE.OrthographicCamera | null = null
      if (camType === 'top') cam = cameraTop
      if (camType === 'front') cam = cameraFront
      if (camType === 'right') cam = cameraRight

      if (cam) {
        const zoomFactor = Math.pow(0.985, dy * invert)
        cam.zoom = Math.max(0.1, Math.min(25, cam.zoom * zoomFactor))
        cam.updateProjectionMatrix()
      }
    }
  }

  const onUp = () => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }

  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

function centerViewOnContents(camType: 'persp' | 'top' | 'front' | 'right' = 'persp') {
  const box = new THREE.Box3()
  let hasVertices = false

  const activeMesh = projectStore.activeMesh
  const meshesToFrame = activeMesh && activeMesh.vertices.length > 0 ? [activeMesh] : projectStore.meshes

  for (const m of meshesToFrame) {
    for (const v of m.vertices) {
      box.expandByPoint(localToWorld(m, v.position))
      hasVertices = true
    }
  }

  const center = new THREE.Vector3(0, 0.5, 0)
  let maxDim = 2

  if (hasVertices) {
    box.getCenter(center)
    const size = new THREE.Vector3()
    box.getSize(size)
    maxDim = Math.max(size.x, size.y, size.z, 0.5)
  }

  if (camType === 'persp' && orbitControls && cameraPersp) {
    orbitControls.target.copy(center)
    const dist = maxDim * 2.5
    const dir = new THREE.Vector3().subVectors(cameraPersp.position, center).normalize()
    if (dir.lengthSq() < 0.01) dir.set(1, 0.8, 1).normalize()
    cameraPersp.position.copy(center).addScaledVector(dir, Math.max(2.5, dist))
    cameraPersp.lookAt(center)
    orbitControls.update()
  } else if (camType === 'top' && cameraTop) {
    cameraTop.position.set(center.x, center.y + 15, center.z)
    cameraTop.lookAt(center)
    cameraTop.zoom = Math.max(0.5, Math.min(25, 4.0 / maxDim))
    cameraTop.updateProjectionMatrix()
  } else if (camType === 'front' && cameraFront) {
    cameraFront.position.set(center.x, center.y, center.z + 15)
    cameraFront.lookAt(center)
    cameraFront.zoom = Math.max(0.5, Math.min(25, 4.0 / maxDim))
    cameraFront.updateProjectionMatrix()
  } else if (camType === 'right' && cameraRight) {
    cameraRight.position.set(center.x + 15, center.y, center.z)
    cameraRight.lookAt(center)
    cameraRight.zoom = Math.max(0.5, Math.min(25, 4.0 / maxDim))
    cameraRight.updateProjectionMatrix()
  }
}

function onWheel(event: WheelEvent) {
  if (toolStore.appMode === 'blockout' && event.altKey && projectStore.selectedReferenceId) {
    event.preventDefault()
    const img = projectStore.referenceImages.find(r => r.id === projectStore.selectedReferenceId)
    if (img && !img.locked) {
      const invert = toolStore.viewport.invertZoom ? -1 : 1
      const factor = (event.deltaY * invert) < 0 ? 1.08 : 0.92
      const next = Math.max(0.5, Math.min(24, img.scale * factor))
      projectStore.updateReferenceImage(img.id, { scale: next }, { rebuild: false })
    }
    return
  }
  if (!isSplitView() || !renderer) return
  const rect = renderer.domElement.getBoundingClientRect()
  const mousePxX = event.clientX - rect.left
  const mousePxY = event.clientY - rect.top
  const width = rect.width
  const height = rect.height

  let cam: THREE.OrthographicCamera | null = null
  if (isTripleView()) {
    const hit = tripleHit(mousePxX, width)
    if (hit.col === 0) cam = cameraFront
    else if (hit.col === 1) cam = cameraRight
  } else {
    const isLeft = mousePxX < width / 2
    const isTop = mousePxY < height / 2
    if (isLeft && isTop) cam = cameraTop
    else if (isLeft && !isTop) cam = cameraFront
    else if (!isLeft && !isTop) cam = cameraRight
  }

  if (cam) {
    event.preventDefault()
    const invert = toolStore.viewport.invertZoom ? -1 : 1
    const zoomFactor = (event.deltaY * invert) < 0 ? 1.15 : 0.85
    cam.zoom = Math.max(0.1, Math.min(25, cam.zoom * zoomFactor))
    cam.updateProjectionMatrix()
  }
}

// Raycasting for Selection & Hover Highlighting
function onPointerDown(event: PointerEvent) {
  if (operatorManager.state.value.active) {
    if (orbitControls) orbitControls.enabled = false
    event.stopImmediatePropagation()
    event.preventDefault()
    return
  }

  // Middle Mouse Button (button === 1) triggers the Specials Context Menu at cursor!
  if (event.button === 1) {
    event.preventDefault()
    specialsMenuPos.value = { x: event.clientX, y: event.clientY }
    showSpecialsMenu.value = true
    return
  }

  // Close context specials menu on left/right click in viewport
  if (showSpecialsMenu.value) {
    showSpecialsMenu.value = false
  }

  if (event.button !== 0) return
  if (transformControls.dragging || isGizmoDragging || (transformControls as any).axis !== null) {
    orbitControls.enabled = false
    return
  }

  // Stylus / Pen & Touch tracking
  if (event.pointerType) {
    toolStore.currentPointerType = event.pointerType as any
    if (event.pressure !== undefined && event.pressure > 0) {
      toolStore.currentPressure = event.pressure
    }
  }

  pointerDownClientPos = { x: event.clientX, y: event.clientY }
  pointerDownHitMesh = false

  updateActiveCameraAndQuadrant(event)
  raycaster.setFromCamera(mouse, activeCamera)

  // 1. Marquee Box Selection Trigger (Ctrl + LMB Drag, or when One-Shot Box Select is active)
  const isBoxSelectRequested = (event.ctrlKey || toolStore.isBoxSelectActive || isBoxSelectArmed.value) && toolStore.appMode !== 'uvpaint'
  if (isBoxSelectRequested) {
    isMarqueeSelecting.value = true
    orbitControls.enabled = false
    const rect = containerRef.value ? containerRef.value.getBoundingClientRect() : { left: 0, top: 0 }
    marqueeStart.value = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    marqueeEnd.value = { ...marqueeStart.value }
    return
  }

  if (tryBeginReferenceInteraction(event)) {
    event.preventDefault()
    event.stopImmediatePropagation()
    return
  }

  if (toolStore.appMode === 'uvpaint' && toolStore.uvWorkspaceTab === 'paint') {
    const hits = raycaster.intersectObjects(layers.modelGroup.children, true)
    if (hits.length > 0) {
      pointerDownHitMesh = true
      orbitControls.enabled = false
      isPaintingOn3D = true
      event.stopImmediatePropagation()
      event.preventDefault()
      projectStore.recordState('3D Paint')
      lastPaintUV = null
      paintRaycastHit()
      return
    }
    orbitControls.enabled = true
    return
  }

  if (toolStore.appMode === 'rig' && animationStore.clickToPlaceMode) {
    const hits = raycaster.intersectObjects(layers.modelGroup.children, true)
    let hitPoint: THREE.Vector3 | null = null
    if (hits.length > 0) {
      hitPoint = hits[0].point
    } else {
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
      const target = new THREE.Vector3()
      if (raycaster.ray.intersectPlane(plane, target)) {
        hitPoint = target
      }
    }

    if (hitPoint) {
      pointerDownHitMesh = true
      projectStore.recordState('Add Bone')
      const curBone = animationStore.selectedBone
      if (!curBone) {
        const isFirstBone = animationStore.armature.bones.length === 0
        const rootBone = animationStore.addBoneFromPoints(
          { x: Number(hitPoint.x.toFixed(3)), y: Number(hitPoint.y.toFixed(3)), z: Number(hitPoint.z.toFixed(3)) },
          { x: Number(hitPoint.x.toFixed(3)), y: Number((hitPoint.y + 0.8).toFixed(3)), z: Number(hitPoint.z.toFixed(3)) },
          null,
          `Bone_${animationStore.armature.bones.length + 1}`
        )
        if (isFirstBone && projectStore.activeMesh) {
          animationStore.parentMeshToBone(projectStore.activeMesh.id, rootBone.id)
          animationStore.autoWeightMeshToBones(projectStore.activeMesh)
        }
      } else {
        animationStore.addBoneFromPoints(
          { ...curBone.tail },
          { x: Number(hitPoint.x.toFixed(3)), y: Number(hitPoint.y.toFixed(3)), z: Number(hitPoint.z.toFixed(3)) },
          curBone.id,
          `Bone_${animationStore.armature.bones.length + 1}`
        )
      }
      rebuildBones()
      rebuildMeshes()
      return
    }
  }

  if (bonesAreInteractive()) {
    const boneHits = raycaster.intersectObjects(boneGroup.children, true)
    if (boneHits.length > 0) {
      pointerDownHitMesh = true
      for (const hit of boneHits) {
        if (hit.object.userData.boneId) {
          animationStore.selectBone(hit.object.userData.boneId)
          rebuildMeshes()
          return
        }
      }
    }
  }

  // Weight Paint Click / Drag Start
  if (event.button === 0 && toolStore.appMode === 'rig' && animationStore.isWeightPaintActive) {
    const activeMesh = projectStore.activeMesh || projectStore.meshes[0]
    if (activeMesh) {
      const intersects = raycaster.intersectObjects(layers.modelGroup.children, true)
      if (intersects.length > 0 && intersects[0].point) {
        isWeightPainting = true
        pointerDownHitMesh = true
        orbitControls.enabled = false
        event.stopImmediatePropagation()
        event.preventDefault()
        projectStore.recordState('Weight Paint Stroke')
        const bId = animationStore.selectedBoneId || (animationStore.armature.bones[0]?.id ?? '')
        if (bId) {
          animationStore.paintVertexWeightAtPoint(activeMesh.id, intersects[0].point, bId, animationStore.weightPaintTool)
          rebuildMeshes()
        }
        return
      }
    }
  }
    const isSelectionAllowed = isMeshSelectionAllowed()
  const activeMesh = projectStore.activeMesh

  // 1. Edge Mode Selection
  if (isSelectionAllowed && toolStore.selectMode === 'edge' && activeMesh) {
    const edge = findClosestEdgeScreen(activeMesh)
    if (edge) {
      pointerDownHitMesh = true
      if (event.altKey && (event.ctrlKey || event.metaKey)) {
        projectStore.selectEdgeRing(edge.id, event.shiftKey)
      } else if (event.altKey) {
        projectStore.selectEdgeLoop(edge.id, event.shiftKey)
      } else if (event.shiftKey) {
        if (projectStore.selectedEdgeIds.includes(edge.id)) {
          projectStore.selectedEdgeIds = projectStore.selectedEdgeIds.filter(id => id !== edge.id)
        } else {
          projectStore.selectedEdgeIds.push(edge.id)
        }
      } else {
        projectStore.selectedEdgeIds = [edge.id]
      }
      rebuildMeshes()
      return
    }
  }

  // 2. Vertex Mode Selection
  if (isSelectionAllowed && toolStore.selectMode === 'vertex' && activeMesh) {
    const v = findClosestVertexScreen(activeMesh)
    if (v) {
      pointerDownHitMesh = true
      if (event.altKey) {
        const linked = getLinkedVertexIds(activeMesh, v.id)
        if (event.shiftKey) {
          projectStore.selectedVertexIds = Array.from(new Set([...projectStore.selectedVertexIds, ...linked]))
        } else {
          projectStore.selectedVertexIds = linked
        }
        activeMesh.vertices.forEach(vert => (vert.selected = projectStore.selectedVertexIds.includes(vert.id)))
      } else if (event.shiftKey) {
        if (projectStore.selectedVertexIds.includes(v.id)) {
          projectStore.selectedVertexIds = projectStore.selectedVertexIds.filter(id => id !== v.id)
          v.selected = false
        } else {
          projectStore.selectedVertexIds.push(v.id)
          v.selected = true
        }
      } else {
        projectStore.selectedVertexIds = [v.id]
        activeMesh.vertices.forEach(vert => (vert.selected = vert.id === v.id))
      }
      rebuildMeshes()
      return
    }
  }

  // 3. Face / Object Mode Selection
  const intersects = raycaster.intersectObjects(layers.modelGroup.children, true)
  if (intersects.length > 0) {
    pointerDownHitMesh = true
    const hit = intersects[0]
    const meshObj = projectStore.meshes.find(m => m.id === hit.object.name)
    if (!meshObj) return

    projectStore.activeMeshId = meshObj.id
    projectStore.selectedReferenceId = ''

    if (toolStore.selectMode === 'object') {
      if (event.shiftKey) {
        if (projectStore.selectedMeshIds.includes(meshObj.id)) {
          projectStore.selectedMeshIds = projectStore.selectedMeshIds.filter(id => id !== meshObj.id)
        } else {
          projectStore.selectedMeshIds.push(meshObj.id)
        }
      } else {
        projectStore.selectedMeshIds = [meshObj.id]
      }
    } else if (toolStore.selectMode === 'face' && hit.faceIndex !== undefined && hit.faceIndex !== null) {
      const faceIndexMap: number[] = hit.object.userData.faceIndexMap || []
      const fi = hit.faceIndex as number
      const originalFaceIdx = faceIndexMap[fi]
      if (typeof originalFaceIdx === 'number' && meshObj.faces[originalFaceIdx]) {
        const face = meshObj.faces[originalFaceIdx]
        if (event.altKey) {
          const linked = getLinkedFaceIds(meshObj, face.id)
          if (event.shiftKey) {
            projectStore.selectedFaceIds = Array.from(new Set([...projectStore.selectedFaceIds, ...linked]))
          } else {
            projectStore.selectedFaceIds = linked
          }
          meshObj.faces.forEach(f => (f.selected = projectStore.selectedFaceIds.includes(f.id)))
        } else if (event.shiftKey) {
          if (projectStore.selectedFaceIds.includes(face.id)) {
            projectStore.selectedFaceIds = projectStore.selectedFaceIds.filter(id => id !== face.id)
            face.selected = false
          } else {
            projectStore.selectedFaceIds.push(face.id)
            face.selected = true
          }
        } else {
          projectStore.selectedFaceIds = [face.id]
          meshObj.faces.forEach(f => (f.selected = f.id === face.id))
        }
      }
    }
    rebuildMeshes()
  }
}

function onPointerMove(event: PointerEvent) {
  if (operatorManager.state.value.active) {
    if (orbitControls) orbitControls.enabled = false
    return
  }
  lastHoverClientPos = { x: event.clientX, y: event.clientY }
  if (refDrag) {
    updateActiveCameraAndQuadrant(event)
    raycaster.setFromCamera(mouse, activeCamera)
    applyRefDrag()
    orbitControls.enabled = false
    return
  }
  if (isGizmoDragging || transformControls.dragging || (transformControls as any).axis !== null) {
    orbitControls.enabled = false
    return
  }

  // Marquee drag update
  if (isMarqueeSelecting.value && containerRef.value) {
    const rect = containerRef.value.getBoundingClientRect()
    marqueeEnd.value = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    return
  }

  updateActiveCameraAndQuadrant(event)
  raycaster.setFromCamera(mouse, activeCamera)

  if (isWeightPainting && event.buttons === 1 && toolStore.appMode === 'rig' && animationStore.isWeightPaintActive) {
    orbitControls.enabled = false
    event.stopImmediatePropagation()
    event.preventDefault()
    const activeMesh = projectStore.activeMesh || projectStore.meshes[0]
    if (activeMesh) {
      const intersects = raycaster.intersectObjects(layers.modelGroup.children, true)
      if (intersects.length > 0 && intersects[0].point) {
        const bId = animationStore.selectedBoneId || (animationStore.armature.bones[0]?.id ?? '')
        if (bId) {
          animationStore.paintVertexWeightAtPoint(activeMesh.id, intersects[0].point, bId, animationStore.weightPaintTool)
          rebuildMeshes()
        }
      }
    }
    return
  }

  if (isPaintingOn3D && (event.buttons === 1)) {
    orbitControls.enabled = false
    event.stopImmediatePropagation()
    event.preventDefault()
    paintRaycastHit()
    return
  }

  updateHoverState()
}

function applyMarqueeSelection(isShift = false, isAlt = false) {
  if (!containerRef.value) return

  const minX = Math.min(marqueeStart.value.x, marqueeEnd.value.x)
  const maxX = Math.max(marqueeStart.value.x, marqueeEnd.value.x)
  const minY = Math.min(marqueeStart.value.y, marqueeEnd.value.y)
  const maxY = Math.max(marqueeStart.value.y, marqueeEnd.value.y)

  // Ignore tiny jitter clicks (< 4px)
  if (maxX - minX < 4 && maxY - minY < 4) return

  const isInsideBox = (screenX: number, screenY: number) => {
    return screenX >= minX && screenX <= maxX && screenY >= minY && screenY <= maxY
  }

  // 1. VERTEX MODE
  if (toolStore.selectMode === 'vertex') {
    const activeMesh = projectStore.activeMesh
    if (!activeMesh) return
    const newlySelected: string[] = []

    const mat = meshWorldMatrix(activeMesh)
    for (const v of activeMesh.vertices) {
      const screenPt = projectWorldToScreen(localToWorld(activeMesh, v.position, mat))
      if (isInsideBox(screenPt.x, screenPt.y)) {
        newlySelected.push(v.id)
      }
    }

    if (isShift) {
      projectStore.selectedVertexIds = Array.from(new Set([...projectStore.selectedVertexIds, ...newlySelected]))
    } else if (isAlt) {
      projectStore.selectedVertexIds = projectStore.selectedVertexIds.filter(id => !newlySelected.includes(id))
    } else {
      projectStore.selectedVertexIds = newlySelected
    }
    activeMesh.vertices.forEach(v => (v.selected = projectStore.selectedVertexIds.includes(v.id)))
    projectStore.recordState('Box Select Vertices')
    rebuildMeshes()
  }

  // 2. EDGE MODE
  else if (toolStore.selectMode === 'edge') {
    const activeMesh = projectStore.activeMesh
    if (!activeMesh) return
    const allEdges = getMeshEdges(activeMesh)
    const vertMap = new Map(activeMesh.vertices.map(v => [v.id, v]))
    const newlySelected: string[] = []

    const mat = meshWorldMatrix(activeMesh)
    for (const edge of allEdges) {
      const v1 = vertMap.get(edge.v1)
      const v2 = vertMap.get(edge.v2)
      if (!v1 || !v2) continue
      const p1 = projectWorldToScreen(localToWorld(activeMesh, v1.position, mat))
      const p2 = projectWorldToScreen(localToWorld(activeMesh, v2.position, mat))
      const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }

      if (isInsideBox(p1.x, p1.y) || isInsideBox(p2.x, p2.y) || isInsideBox(mid.x, mid.y)) {
        newlySelected.push(edge.id)
      }
    }

    if (isShift) {
      projectStore.selectedEdgeIds = Array.from(new Set([...projectStore.selectedEdgeIds, ...newlySelected]))
    } else if (isAlt) {
      projectStore.selectedEdgeIds = projectStore.selectedEdgeIds.filter(id => !newlySelected.includes(id))
    } else {
      projectStore.selectedEdgeIds = newlySelected
    }
    projectStore.recordState('Box Select Edges')
    rebuildMeshes()
  }

  // 3. FACE MODE
  else if (toolStore.selectMode === 'face') {
    const activeMesh = projectStore.activeMesh
    if (!activeMesh) return
    const vertMap = new Map(activeMesh.vertices.map(v => [v.id, v]))
    const newlySelected: string[] = []

    const mat = meshWorldMatrix(activeMesh)
    for (const face of activeMesh.faces) {
      const faceVerts = face.vertexIds.map(id => vertMap.get(id)!).filter(Boolean)
      if (faceVerts.length === 0) continue

      let avgX = 0, avgY = 0, avgZ = 0
      let anyVertInside = false
      for (const v of faceVerts) {
        const w = localToWorld(activeMesh, v.position, mat)
        const p = projectWorldToScreen(w)
        if (isInsideBox(p.x, p.y)) anyVertInside = true
        avgX += w.x
        avgY += w.y
        avgZ += w.z
      }
      const centroidPt = projectWorldToScreen(new THREE.Vector3(avgX / faceVerts.length, avgY / faceVerts.length, avgZ / faceVerts.length))

      if (anyVertInside || isInsideBox(centroidPt.x, centroidPt.y)) {
        newlySelected.push(face.id)
      }
    }

    if (isShift) {
      projectStore.selectedFaceIds = Array.from(new Set([...projectStore.selectedFaceIds, ...newlySelected]))
    } else if (isAlt) {
      projectStore.selectedFaceIds = projectStore.selectedFaceIds.filter(id => !newlySelected.includes(id))
    } else {
      projectStore.selectedFaceIds = newlySelected
    }
    activeMesh.faces.forEach(f => (f.selected = projectStore.selectedFaceIds.includes(f.id)))
    projectStore.recordState('Box Select Faces')
    rebuildMeshes()
  }

  // 4. OBJECT MODE
  else if (toolStore.selectMode === 'object') {
    const newlySelected: string[] = []
    for (const mesh of projectStore.meshes) {
      if (!mesh.visible) continue
      let anyInside = false
      for (const v of mesh.vertices) {
        const p = projectWorldToScreen(localToWorld(mesh, v.position))
        if (isInsideBox(p.x, p.y)) {
          anyInside = true
          break
        }
      }
      if (anyInside) {
        newlySelected.push(mesh.id)
      }
    }

    if (newlySelected.length > 0) {
      if (isShift) {
        projectStore.selectedMeshIds = Array.from(new Set([...projectStore.selectedMeshIds, ...newlySelected]))
      } else {
        projectStore.selectedMeshIds = newlySelected
      }
      projectStore.activeMeshId = newlySelected[0]
    } else if (!isShift) {
      projectStore.deselectAll()
    }
    projectStore.recordState('Box Select Objects')
    rebuildMeshes()
  }

  // 5. BONE MODE / RIGGING
  else if (bonesAreInteractive()) {
    const bones = animationStore.armature.bones
    let matchedBoneId: string | null = null

    for (const bone of bones) {
      const headPt = projectWorldToScreen(new THREE.Vector3(bone.head.x, bone.head.y, bone.head.z))
      const tailPt = projectWorldToScreen(new THREE.Vector3(bone.tail.x, bone.tail.y, bone.tail.z))
      const midPt = { x: (headPt.x + tailPt.x) / 2, y: (headPt.y + tailPt.y) / 2 }

      if (isInsideBox(headPt.x, headPt.y) || isInsideBox(tailPt.x, tailPt.y) || isInsideBox(midPt.x, midPt.y)) {
        matchedBoneId = bone.id
        break
      }
    }

    if (matchedBoneId) {
      animationStore.selectBone(matchedBoneId)
      rebuildMeshes()
    }
  }
}

function onPointerUp(event?: PointerEvent) {
  if (refDrag) {
    refDrag = null
    orbitControls.enabled = true
    updateTransformGizmo()
    return
  }
  if (isMarqueeSelecting.value) {
    isMarqueeSelecting.value = false
    orbitControls.enabled = true
    applyMarqueeSelection(event?.shiftKey, event?.altKey)
    // Deactivate one-shot Box Select mode immediately
    toolStore.isBoxSelectActive = false
    isBoxSelectArmed.value = false
    return
  }

  if (event && !pointerDownHitMesh && !isPaintingOn3D && !isGizmoDragging) {
    const moveDist = Math.hypot(event.clientX - pointerDownClientPos.x, event.clientY - pointerDownClientPos.y)
    // Clean click on empty background deselects
    if (moveDist < 6 && !event.shiftKey) {
      const isSelectionAllowed = isMeshSelectionAllowed()
      if (isSelectionAllowed) {
        if (toolStore.selectMode === 'object') {
          projectStore.deselectAll()
        } else {
          projectStore.clearSubSelections()
        }
        rebuildMeshes()
        updateTransformGizmo()
      }
    }
    if (toolStore.isBoxSelectActive || isBoxSelectArmed.value) {
      toolStore.isBoxSelectActive = false
      isBoxSelectArmed.value = false
      if (orbitControls) orbitControls.enabled = true
    }
  }

  if (isWeightPainting) {
    isWeightPainting = false
    orbitControls.enabled = true
    if (event) {
      event.stopImmediatePropagation()
    }
  }

  if (isPaintingOn3D) {
    isPaintingOn3D = false
    lastPaintUV = null
    if (lastPaintTextureId || projectStore.activeTextureId) {
      projectStore.markTextureUpdated(lastPaintTextureId)
    }
    lastPaintTextureId = undefined
    orbitControls.enabled = true
    if (event) {
      event.stopImmediatePropagation()
    }
  }
  if (isGizmoDragging || transformControls.dragging) {
    isGizmoDragging = false
    commitProxyTransform()
  }
  if (!isSplitView() || isPerspQuadrant()) {
    if ((transformControls as any).axis === null) {
      orbitControls.enabled = true
    }
  }
}

// ----------------------------------------------------
// BLENDER MODAL INTERACTIVE TRANSFORM ENGINE
// G (Grab), R (Rotate), S (Scale), E (Extrude), I (Inset), B (Bevel), K (Knife), Ctrl+R (Loop Cut), Primitive Placement
// ----------------------------------------------------
function startModalOperator(tool: string, options?: any) {
  if (!toolStore.isMeshWorkspace()) return
  const useEmptyKernel = tool === 'polydraw' || tool === 'primitive' || tool === 'add_primitive'
  const activeMesh = useEmptyKernel && tool === 'polydraw' ? null : projectStore.activeMesh

  // Bridge active mesh to EditableMesh kernel (or empty mesh if placing new primitive)
  const bridgeData = activeMesh 
    ? MeshBridge.meshObjectToEditableMesh(activeMesh)
    : { mesh: new EditableMesh(), strToNumVertId: new Map(), numToStrVertId: new Map(), strToNumFaceId: new Map(), numToStrFaceId: new Map() }
  const editableMesh = bridgeData.mesh

  if (tool === 'inset' && toolStore.selectMode === 'object') return

  // Derive selection IDs — never silently fall back to the whole mesh in component mode
  let selVertIds = projectStore.selectedVertexIds
    .map(id => bridgeData.strToNumVertId.get(id)!)
    .filter(id => id !== undefined)

  let selFaceIds = projectStore.selectedFaceIds
    .map(id => bridgeData.strToNumFaceId.get(id)!)
    .filter(id => id !== undefined)

  let selEdgeIds: number[] = []

  if (toolStore.selectMode === 'object') {
    selVertIds = Array.from(editableMesh.vertices.keys())
    selFaceIds = Array.from(editableMesh.faces.keys())
  } else if (toolStore.selectMode === 'edge' && activeMesh) {
    selVertIds = []
    selFaceIds = []
    const meshEdges = getMeshEdges(activeMesh)
    for (const e of meshEdges) {
      if (!projectStore.selectedEdgeIds.includes(e.id)) continue
      const a = bridgeData.strToNumVertId.get(e.v1)
      const b = bridgeData.strToNumVertId.get(e.v2)
      if (a == null || b == null) continue
      selVertIds.push(a, b)
      for (const ke of editableMesh.edges.values()) {
        if ((ke.v1 === a && ke.v2 === b) || (ke.v1 === b && ke.v2 === a)) {
          selEdgeIds.push(ke.id)
          break
        }
      }
    }
    selVertIds = Array.from(new Set(selVertIds))
  } else if (toolStore.selectMode === 'face') {
    selVertIds = []
  } else if (toolStore.selectMode === 'vertex') {
    selFaceIds = []
  }

  if (tool === 'inset' && selFaceIds.length === 0) return

  // Determine viewport kind
  const vpKind = viewportKindFromQuadrant()

  const ctx: OperatorContext = {
    mesh: editableMesh,
    selectedVertIds: selVertIds,
    selectedFaceIds: selFaceIds,
    selectedEdgeIds: selEdgeIds,
    selectedMeshIds: [...projectStore.selectedMeshIds],
    isObjectMode: toolStore.selectMode === 'object',
    camera: activeCamera,
    viewportElement: containerRef.value || document.body,
    pivotMode: 'MEDIAN',
    previewGroup: layers.previewGroup,
    sceneGroup: layers.modelGroup,
    allMeshes: projectStore.meshes,
    viewportKind: vpKind,
    quadrant: activeQuadrant.value,
    gridSize: toolStore.snapping.gridSize,
    snapGrid: toolStore.snapping.grid,
    snapVertex: toolStore.snapping.vertex,
    snapEdge: toolStore.snapping.edge,
    objectMatrix: activeMesh ? meshWorldMatrix(activeMesh) : undefined,
    onUpdatePreview: () => {
      if (activeMesh && tool !== 'primitive' && tool !== 'add_primitive' && tool !== 'polydraw') {
        const updatedMeshObj = MeshBridge.editableMeshToMeshObject(
          editableMesh,
          activeMesh,
          bridgeData.numToStrVertId,
          bridgeData.numToStrFaceId
        )
        projectStore.replaceMesh(updatedMeshObj)
        updateActiveMeshVisualsFast()
      }
    },
    onCommit: (actionName: string) => {
      if (tool === 'polydraw' && editableMesh.faces.size > 0) {
        projectStore.addEditableMesh(editableMesh, `Block_${projectStore.meshes.length + 1}`)
      } else if (activeMesh && tool !== 'primitive' && tool !== 'add_primitive') {
        const updatedMeshObj = MeshBridge.editableMeshToMeshObject(
          editableMesh,
          activeMesh,
          bridgeData.numToStrVertId,
          bridgeData.numToStrFaceId
        )
        projectStore.replaceMesh(updatedMeshObj)
        projectStore.recordState(actionName)
      }
      orbitControls.enabled = true
      rebuildMeshes()
    },
    onCancel: () => {
      orbitControls.enabled = true
      rebuildMeshes()
    }
  }

  const pointerPos = {
    x: lastHoverClientPos.x || window.innerWidth / 2,
    y: lastHoverClientPos.y || window.innerHeight / 2
  }

  orbitControls.enabled = false

  if (tool === 'grab' || tool === 'move') {
    operatorManager.start(new MoveOperator(), ctx, pointerPos)
  } else if (tool === 'rotate') {
    operatorManager.start(new RotateOperator(), ctx, pointerPos)
  } else if (tool === 'scale') {
    operatorManager.start(new ScaleOperator(), ctx, pointerPos)
  } else if (tool === 'extrude') {
    operatorManager.start(new ExtrudeOperator(), ctx, pointerPos)
  } else if (tool === 'inset') {
    operatorManager.start(new InsetOperator(), ctx, pointerPos)
  } else if (tool === 'bevel') {
    operatorManager.start(new BevelOperator(), ctx, pointerPos)
  } else if (tool === 'knife') {
    operatorManager.start(new KnifeOperator(), ctx, pointerPos)
  } else if (tool === 'loop_cut' || tool === 'loopcut') {
    operatorManager.start(new LoopCutOperator(), ctx, pointerPos)
  } else if (tool === 'polydraw') {
    operatorManager.start(new PolyDrawOperator(), ctx, pointerPos)
  } else if (tool === 'primitive' || tool === 'add_primitive') {
    const pType = (options?.primitiveType || 'BOX') as PrimitiveType
    const pMode = options?.mode || PrimitivePlacementMode.CAD_DRAW
    const pOrient = options?.orientation || 'WORLD'
    operatorManager.start(new PrimitivePlacementOperator(pType, pMode, pOrient, options?.parameters), ctx, pointerPos)
  }

  // Immediately dispatch initial pointer location to operator for instant precision hover response
  if (operatorManager.state.value.active) {
    operatorManager.handlePointerMove({ clientX: pointerPos.x, clientY: pointerPos.y } as any)
  }
}

function updateActiveMeshVisualsFast() {
  const activeMesh = projectStore.activeMesh
  if (!activeMesh) return

  const { 
    geometry, 
    wireframeGeometry, 
    vertexPointsGeometry, 
    selectedFacesGeometry, 
    selectedEdgesGeometry,
    edgeLinesGeometry
  } = meshToThreeGeometry(
    activeMesh,
    toolStore.selectMode === 'face' ? projectStore.selectedFaceIds : [],
    toolStore.selectMode === 'edge' ? projectStore.selectedEdgeIds : [],
    toolStore.viewport.shadeMode
  )
  edgeLinesGeometry.dispose()

  const threeMesh = layers.modelGroup.getObjectByName(activeMesh.id) as THREE.Mesh
  if (threeMesh) {
    threeMesh.geometry.dispose()
    threeMesh.geometry = geometry
    threeMesh.castShadow = true
    threeMesh.receiveShadow = true
  } else {
    geometry.dispose()
  }

  const wire = layers.wireframeGroup.getObjectByName(`${activeMesh.id}_wire`) as THREE.LineSegments
  if (wire) {
    wire.geometry.dispose()
    wire.geometry = wireframeGeometry
  } else {
    wireframeGeometry.dispose()
  }

  const pts = layers.wireframeGroup.getObjectByName(`${activeMesh.id}_pts`) as THREE.Points
  if (pts) {
    pts.geometry.dispose()
    pts.geometry = vertexPointsGeometry
  } else {
    vertexPointsGeometry.dispose()
  }

  const selFaces = layers.selectionGroup.getObjectByName(`${activeMesh.id}_selfaces`) as THREE.Mesh
  if (selFaces) {
    selFaces.geometry.dispose()
    selFaces.geometry = selectedFacesGeometry
  } else {
    selectedFacesGeometry.dispose()
  }

  const selEdges = layers.wireframeGroup.getObjectByName(`${activeMesh.id}_seledges`) as THREE.LineSegments
  if (selEdges) {
    selEdges.geometry.dispose()
    selEdges.geometry = selectedEdgesGeometry
  } else {
    selectedEdgesGeometry.dispose()
  }
}

function updateHoverState() {
  const isSelectionAllowed = isMeshSelectionAllowed()
  const activeMesh = projectStore.activeMesh
  let hasHover = false

  if (isSelectionAllowed && toolStore.selectMode === 'vertex' && activeMesh) {
    const v = findClosestVertexScreen(activeMesh)
    if (v) {
      const w = localToWorld(activeMesh, v.position)
      const geom = new THREE.BufferGeometry().setAttribute(
        'position', 
        new THREE.Float32BufferAttribute([w.x, w.y, w.z], 3)
      )
      hoverVertexMesh.geometry.dispose()
      hoverVertexMesh.geometry = geom
      hoverVertexMesh.visible = true
      hasHover = true
    } else {
      hoverVertexMesh.visible = false
    }
  } else {
    hoverVertexMesh.visible = false
  }

  if (isSelectionAllowed && toolStore.selectMode === 'edge' && activeMesh) {
    const edge = findClosestEdgeScreen(activeMesh)
    if (edge) {
      const vertMap = new Map<string, Vertex>()
      for (const v of activeMesh.vertices) {
        vertMap.set(v.id, v)
      }
      const v1 = vertMap.get(edge.v1)
      const v2 = vertMap.get(edge.v2)
      if (v1 && v2) {
        const p1 = localToWorld(activeMesh, v1.position)
        const p2 = localToWorld(activeMesh, v2.position)
        hoverEdgeMesh.geometry.dispose()
        hoverEdgeMesh.geometry = new THREE.BufferGeometry().setFromPoints([p1, p2])
        hoverEdgeMesh.visible = true
        hasHover = true
      }
    } else {
      hoverEdgeMesh.visible = false
    }
  } else {
    hoverEdgeMesh.visible = false
  }

  const uvHoverIds = toolStore.uvHoverFaceIds
  if (toolStore.appMode === 'uvpaint' && uvHoverIds.length > 0 && activeMesh) {
    const vertMap = new Map<string, Vertex>()
    for (const v of activeMesh.vertices) vertMap.set(v.id, v)
    const idSet = new Set(uvHoverIds)
    const positions: number[] = []
    for (const face of activeMesh.faces) {
      if (!idSet.has(face.id)) continue
      const faceVerts = face.vertexIds.map(id => vertMap.get(id)!).filter(Boolean)
      pushWorldFan(activeMesh, faceVerts, positions)
    }
    if (positions.length > 0) {
      hoverFaceMesh.geometry.dispose()
      hoverFaceMesh.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      hoverFaceMesh.visible = true
      hasHover = true
    } else {
      hoverFaceMesh.visible = false
    }
  } else if (isSelectionAllowed && toolStore.selectMode === 'face' && activeMesh) {
    const intersects = raycaster.intersectObjects(layers.modelGroup.children, true)
    if (intersects.length > 0 && intersects[0].faceIndex !== undefined && intersects[0].faceIndex !== null) {
      const hit = intersects[0]
      const faceIndexMap: number[] = hit.object.userData.faceIndexMap || []
      const fi = hit.faceIndex as number
      const originalFaceIdx = faceIndexMap[fi]
      if (typeof originalFaceIdx === 'number' && activeMesh.faces[originalFaceIdx]) {
        const face = activeMesh.faces[originalFaceIdx]
        const vertMap = new Map<string, Vertex>()
        for (const v of activeMesh.vertices) {
          vertMap.set(v.id, v)
        }
        const faceVerts = face.vertexIds.map(id => vertMap.get(id)!).filter(Boolean)
        const positions: number[] = []
        pushWorldFan(activeMesh, faceVerts, positions)

        hoverFaceMesh.geometry.dispose()
        hoverFaceMesh.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
        hoverFaceMesh.visible = true
        hasHover = true
      }
    } else {
      hoverFaceMesh.visible = false
    }
  } else {
    hoverFaceMesh.visible = false
  }

  if (bonesAreInteractive() && animationStore.showBones) {
    const boneHits = raycaster.intersectObjects(boneGroup.children, true)
    if (boneHits.length > 0) {
      for (const hit of boneHits) {
        if (hit.object.userData.boneId) {
          const bId = hit.object.userData.boneId
          const bone = animationStore.armature.bones.find(b => b.id === bId)
          if (bone) {
            const isPoseMode = toolStore.appMode === 'animate' || (toolStore.appMode === 'rig' && animationStore.isTestPoseActive)
            if (isPoseMode) {
              const boneMat = computeBoneWorldMatrix(bone, animationStore.armature.bones)
              const posed = new THREE.Vector3(bone.head.x, bone.head.y, bone.head.z).applyMatrix4(boneMat)
              hoverBoneMesh.position.copy(posed)
            } else {
              hoverBoneMesh.position.set(bone.head.x, bone.head.y, bone.head.z)
            }
            hoverBoneMesh.visible = true
            hasHover = true
            break
          }
        }
      }
    } else {
      hoverBoneMesh.visible = false
    }
  } else {
    hoverBoneMesh.visible = false
  }

  // 3D Skeletal Weight Paint Projector Ring (Rigging mode only)
  const isWeightPaintHoverActive = toolStore.appMode === 'rig' && animationStore.isWeightPaintActive

  if (isWeightPaintHoverActive && hoverWeightBrushRing) {
    const intersects = raycaster.intersectObjects(layers.modelGroup.children, true)
    if (intersects.length > 0 && intersects[0].point) {
      const hit = intersects[0]
      hoverWeightBrushRing.position.copy(hit.point)
      if (hit.face) {
        hoverWeightBrushRing.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), hit.face.normal)
      }
      const r = animationStore.weightBrushRadius || 0.5
      hoverWeightBrushRing.scale.set(r, r, r)
      hoverWeightBrushRing.visible = true
      hasHover = true
    } else {
      hoverWeightBrushRing.visible = false
    }
  } else if (hoverWeightBrushRing) {
    hoverWeightBrushRing.visible = false
  }

  if (renderer && renderer.domElement) {
    if (toolStore.appMode === 'uvpaint') {
      renderer.domElement.style.cursor = 'crosshair'
    } else {
      renderer.domElement.style.cursor = hasHover ? 'pointer' : 'default'
    }
  }
}

function paintRaycastHit() {
  if (toolStore.appMode !== 'uvpaint') return
  const intersects = raycaster.intersectObjects(layers.modelGroup.children, true)
  if (intersects.length === 0) return
  const hit = intersects[0]

  if (hit.uv) {
    const uv = hit.uv
    const targetTex = projectStore.activeTexture || projectStore.textures[0]
    const pb = targetTex?.pixelBuffer || projectStore.pixelBuffer
    if (!pb) return

    if (targetTex && projectStore.activeTextureId !== targetTex.id) {
      projectStore.selectTexture(targetTex.id)
    }

    const px = Math.floor(uv.x * pb.width)
    const py = Math.floor((1 - uv.y) * pb.height)

    const isPen = toolStore.currentPointerType === 'pen' && toolStore.stylusPressureEnabled
    const effectiveSize = isPen ? Math.max(1, Math.round(toolStore.brushSize * toolStore.currentPressure * 1.5)) : toolStore.brushSize

    const activeDrawColor = toolStore.paletteSnapEnabled
      ? snapColorToPalette(toolStore.primaryColor, projectStore.activePalette.colors)
      : toolStore.primaryColor

    if (toolStore.paintTool === 'brush') {
      if (lastPaintUV) {
        pb.paintLineAtUV(lastPaintUV.u, lastPaintUV.v, uv.x, uv.y, activeDrawColor, effectiveSize, 'brush', toolStore.brushOpacity)
      } else {
        pb.drawBrush(px, py, activeDrawColor, effectiveSize, toolStore.brushOpacity)
      }
      lastPaintUV = { u: uv.x, v: uv.y }
    } else if (toolStore.paintTool === 'eraser') {
      if (lastPaintUV) {
        pb.paintLineAtUV(lastPaintUV.u, lastPaintUV.v, uv.x, uv.y, activeDrawColor, effectiveSize, 'eraser')
      } else {
        pb.erase(px, py, effectiveSize)
      }
      lastPaintUV = { u: uv.x, v: uv.y }
    } else if (toolStore.paintTool === 'bucket') {
      pb.floodFill(px, py, activeDrawColor)
    } else if (toolStore.paintTool === 'dither') {
      pb.drawDither(px, py, activeDrawColor, effectiveSize)
    } else if (toolStore.paintTool === 'picker') {
      toolStore.primaryColor = pb.getPixelHex(px, py)
    } else if (toolStore.paintTool === 'shade') {
      pb.paintAtUV(uv.x, uv.y, activeDrawColor, effectiveSize, 'shade-light')
      lastPaintUV = { u: uv.x, v: uv.y }
    }

    const hitTex = targetTex ? textureCache.get(targetTex.id) : threeTexture
    if (hitTex) {
      hitTex.needsUpdate = true
    }
    lastPaintTextureId = targetTex?.id
    projectStore.markTexturePreview()
  }
}

function execSpecial(action: string) {
  showSpecialsMenu.value = false
  if (action === 'connect-path') {
    projectStore.performConnectVertices()
  } else if (action === 'merge-center') {
    projectStore.performMerge('center')
  } else if (action === 'bevel') {
    startModalOperator('bevel')
  } else if (action === 'subdivide') {
    projectStore.performSubdivide()
  } else if (action === 'loopcut') {
    startModalOperator('loopcut')
  } else if (action === 'extrude') {
    startModalOperator('extrude')
  } else if (action === 'extrude-individual') {
    projectStore.recordState('Extrude Individual Faces')
    startModalOperator('extrude')
  } else if (action === 'inset') {
    startModalOperator('inset')
  } else if (action === 'fill-face') {
    handleFillFaceEvent()
  } else if (action === 'flip-normals') {
    projectStore.performFlipNormals()
  } else if (action === 'poke') {
    if (projectStore.activeMesh) {
      projectStore.recordState('Poke Faces')
      projectStore.performSubdivide()
    }
  } else if (action === 'triangulate') {
    if (projectStore.activeMesh) {
      projectStore.recordState('Triangulate Faces')
      projectStore.performSubdivide()
    }
  } else if (action === 'origin-geometry') {
    const activeMesh = projectStore.activeMesh
    if (activeMesh && activeMesh.vertices.length > 0) {
      projectStore.recordState('Set Origin to Geometry')
      let avgX = 0, avgY = 0, avgZ = 0
      for (const v of activeMesh.vertices) {
        avgX += v.position.x
        avgY += v.position.y
        avgZ += v.position.z
      }
      const cx = avgX / activeMesh.vertices.length
      const cy = avgY / activeMesh.vertices.length
      const cz = avgZ / activeMesh.vertices.length
      activeMesh.position.x += cx
      activeMesh.position.y += cy
      activeMesh.position.z += cz
      for (const v of activeMesh.vertices) {
        v.position.x -= cx
        v.position.y -= cy
        v.position.z -= cz
      }
      rebuildMeshes()
    }
  } else if (action === 'origin-cursor') {
    const activeMesh = projectStore.activeMesh
    if (activeMesh) {
      projectStore.recordState('Set Origin to 3D Cursor')
      const cur = toolStore.cursor3D
      const dx = cur.x - activeMesh.position.x
      const dy = cur.y - activeMesh.position.y
      const dz = cur.z - activeMesh.position.z
      activeMesh.position.x = cur.x
      activeMesh.position.y = cur.y
      activeMesh.position.z = cur.z
      for (const v of activeMesh.vertices) {
        v.position.x -= dx
        v.position.y -= dy
        v.position.z -= dz
      }
      rebuildMeshes()
    }
  } else if (action === 'duplicate') {
    projectStore.duplicateSelection()
    rebuildMeshes()
  } else if (action === 'join') {
    projectStore.performJoinMeshes()
    rebuildMeshes()
  } else if (action === 'separate') {
    projectStore.performSeparateMesh()
    rebuildMeshes()
  } else if (action === 'extrude-bone') {
    animationStore.extrudeBone(animationStore.selectedBoneId || '')
    rebuildBones()
  } else if (action === 'subdivide-bone') {
    animationStore.subdivideBone(animationStore.selectedBoneId || '')
    rebuildBones()
  } else if (action === 'symmetrize-bone') {
    animationStore.symmetrizeArmature()
    rebuildBones()
  } else if (action === 'delete') {
    if (toolStore.selectMode === 'vertex' || toolStore.selectMode === 'edge' || toolStore.selectMode === 'face' || toolStore.selectMode === 'object') {
      projectStore.performDelete(toolStore.selectMode)
    }
    rebuildMeshes()
  } else if (action === 'delete-bone') {
    if (animationStore.selectedBoneId) {
      animationStore.deleteBone(animationStore.selectedBoneId)
      rebuildBones()
    }
  }
}

function setCameraView(view: 'persp' | 'top' | 'front' | 'right' | 'iso') {
  const dist = 6
  if (view === 'top') {
    cameraPersp.position.set(0, dist, 0.001)
  } else if (view === 'front') {
    cameraPersp.position.set(0, 0.5, dist)
  } else if (view === 'right') {
    cameraPersp.position.set(dist, 0.5, 0)
  } else if (view === 'iso') {
    cameraPersp.position.set(dist * 0.7, dist * 0.6, dist * 0.7)
  }
  cameraPersp.lookAt(0, 0.5, 0)
  orbitControls.target.set(0, 0.5, 0)
}

async function startViewportRenderer() {
  if (isRendererStarting.value || renderer) return

  isRendererStarting.value = true
  rendererInitError.value = null

  await nextTick()
  try {
    initThree()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    rendererInitError.value = message.includes('WebGL context')
      ? 'WebGL is disabled or unavailable in this browser.'
      : `The 3D renderer could not start: ${message}`
    console.error('3D viewport initialization failed:', error)
  } finally {
    isRendererStarting.value = false
  }
}

function recoverViewportRenderer() {
  if (!renderer) {
    void startViewportRenderer()
    return
  }
  if (!containerRef.value || !scene || !cameraPersp) return

  try {
    const context = renderer.getContext()
    if (context.isContextLost()) {
      isWebGLContextLost.value = true
      renderer.forceContextRestore()
      return
    }

    isWebGLContextLost.value = false
    renderer.resetState()
    onWindowResize()
    rebuildMeshes()
    if (threeTexture) threeTexture.needsUpdate = true
    renderer.clear()
    renderer.render(scene, cameraPersp)
  } catch (error) {
    console.warn('Viewport renderer recovery deferred:', error)
  }
}

function handleWebGLContextLost(event: Event) {
  event.preventDefault()
  isWebGLContextLost.value = true

  if (contextRecoveryTimer !== null) window.clearTimeout(contextRecoveryTimer)
  contextRecoveryTimer = window.setTimeout(() => {
    contextRecoveryTimer = null
    recoverViewportRenderer()
  }, 250)
}

function handleWebGLContextRestored() {
  isWebGLContextLost.value = false
  nextTick(() => recoverViewportRenderer())
}

function handleViewportFocus() {
  if (rendererInitError.value && !renderer) void startViewportRenderer()
  else recoverViewportRenderer()
}

function handleViewportVisibilityChange() {
  if (!document.hidden) recoverViewportRenderer()
}

function onWindowResize() {
  if (!containerRef.value || !renderer) return
  const width = containerRef.value.clientWidth
  const height = containerRef.value.clientHeight
  if (width === 0 || height === 0) return

  cameraPersp.aspect = isTripleView()
    ? (tripleCols(width).persp / height) || 1
    : width / height
  cameraPersp.updateProjectionMatrix()

  const frustumSize = 5
  const cols = isTripleView() ? tripleCols(width) : null
  const splitAspect = isTripleView() && cols
    ? 1
    : ((width / 2) / (height / 2)) || 1

  const updateOrtho = (cam: THREE.OrthographicCamera, aspect: number) => {
    const currentZoom = cam.zoom
    cam.left = -frustumSize * aspect / 2
    cam.right = frustumSize * aspect / 2
    cam.top = frustumSize / 2
    cam.bottom = -frustumSize / 2
    cam.zoom = currentZoom
    cam.updateProjectionMatrix()
  }

  if (cols) {
    updateOrtho(cameraFront, (cols.front / height) || 1)
    updateOrtho(cameraRight, (cols.side / height) || 1)
    updateOrtho(cameraTop, (cols.front / height) || 1)
  } else {
    updateOrtho(cameraTop, splitAspect)
    updateOrtho(cameraFront, splitAspect)
    updateOrtho(cameraRight, splitAspect)
  }

  renderer.setSize(width, height)
}

function animate() {
  animationFrameId = requestAnimationFrame(animate)

  if (animationStore.armature.bones.length > 0 && (animationStore.isPlaying || animationStore.isTestPoseActive)) {
    SpringPhysicsSolver.step(animationStore.armature.bones)
  }

  if (
    animationStore.armature.bones.length > 0 &&
    isSkeletalPoseMode() &&
    (animationStore.isPlaying || animationStore.isTestPoseActive || isGizmoDragging)
  ) {
    refreshLiveDeform()
  }

  if (orbitControls && orbitControls.enabled && !isGizmoDragging && !transformControls.dragging) {
    orbitControls.update()
  }

  if (!renderer || !containerRef.value) return
  if (renderer.getContext().isContextLost()) {
    isWebGLContextLost.value = true
    return
  }
  const width = containerRef.value.clientWidth
  const height = containerRef.value.clientHeight

  if (axesHelper) axesHelper.visible = toolStore.viewport.showAxes

  if (isTripleView()) {
    const cols = tripleCols(width)
    const gizmoHelper = transformControls.getHelper()
    renderer.setScissorTest(true)
    renderer.clear()

    gizmoHelper.visible = false
    setGridsForView('front')
    renderer.setViewport(0, 0, cols.front, height)
    renderer.setScissor(0, 0, cols.front, height)
    gizmoHelper.visible = activeQuadrant.value === 'col_front'
    renderer.render(scene, cameraFront)

    setGridsForView('side')
    renderer.setViewport(cols.xSide, 0, cols.side, height)
    renderer.setScissor(cols.xSide, 0, cols.side, height)
    gizmoHelper.visible = activeQuadrant.value === 'col_side'
    renderer.render(scene, cameraRight)

    setGridsForView('floor')
    renderer.setViewport(cols.xPersp, 0, cols.persp, height)
    renderer.setScissor(cols.xPersp, 0, cols.persp, height)
    gizmoHelper.visible = activeQuadrant.value === 'col_persp'
    renderer.render(scene, cameraPersp)

    renderer.setScissorTest(false)
  } else if (toolStore.viewport.quadView) {
    const halfW = Math.floor(width / 2)
    const halfH = Math.floor(height / 2)

    renderer.setScissorTest(true)
    renderer.clear()

    setGridsForView('floor')
    renderer.setViewport(0, halfH, halfW, halfH)
    renderer.setScissor(0, halfH, halfW, halfH)
    renderer.render(scene, cameraTop)

    setGridsForView('floor')
    renderer.setViewport(halfW, halfH, halfW, halfH)
    renderer.setScissor(halfW, halfH, halfW, halfH)
    renderer.render(scene, cameraPersp)

    setGridsForView('front')
    renderer.setViewport(0, 0, halfW, halfH)
    renderer.setScissor(0, 0, halfW, halfH)
    renderer.render(scene, cameraFront)

    setGridsForView('side')
    renderer.setViewport(halfW, 0, halfW, halfH)
    renderer.setScissor(halfW, 0, halfW, halfH)
    renderer.render(scene, cameraRight)

    renderer.setScissorTest(false)
  } else {
    setGridsForView('floor')
    renderer.setScissorTest(false)
    renderer.setViewport(0, 0, width, height)
    renderer.clear()
    if (transformControls) transformControls.getHelper().visible = true
    renderer.render(scene, cameraPersp)
  }
}

// Watchers
watch(() => projectStore.meshes, rebuildMeshes, { deep: true })
watch(() => projectStore.referenceRevision, rebuildReferencePlanes)
watch(() => projectStore.referenceImages, syncReferenceTransforms, { deep: true })
watch(() => projectStore.selectedReferenceId, () => {
  syncReferenceTransforms()
  updateTransformGizmo()
})
watch(() => projectStore.textureRevision, () => {
  if (threeTexture) threeTexture.needsUpdate = true
})
watch(() => toolStore.appMode, async () => {
  toolStore.isBoxSelectActive = false
  isBoxSelectArmed.value = false
  if (orbitControls) orbitControls.enabled = true
  if (toolStore.appMode === 'blockout') {
    activeQuadrant.value = 'col_front'
    toolStore.setModelTool('move')
    if (transformControls) {
      transformControls.enabled = true
      transformControls.camera = cameraFront
    }
  } else if (transformControls) {
    transformControls.enabled = true
    transformControls.getHelper().visible = true
  }
  rebuildMeshes()
  rebuildBones()
  rebuildReferencePlanes()
  onWindowResize()
  await nextTick()
  setTimeout(() => recoverViewportRenderer(), 50)
  setTimeout(() => recoverViewportRenderer(), 150)
})
watch(() => toolStore.uvWorkspaceTab, async () => {
  await nextTick()
  setTimeout(() => recoverViewportRenderer(), 50)
})
watch(() => toolStore.selectMode, () => {
  toolStore.isBoxSelectActive = false
  isBoxSelectArmed.value = false
  if (orbitControls) orbitControls.enabled = true
  rebuildMeshes()
  updateTransformGizmo()
})
watch(() => toolStore.modelTool, updateTransformGizmo)
watch(() => [toolStore.transformOrientation, toolStore.pivotPoint], updateTransformGizmo)
watch(() => animationStore.selectedBoneId, () => {
  rebuildBones()
  rebuildMeshes()
  updateTransformGizmo()
})
watch(() => animationStore.selectedSocketId, () => {
  rebuildBones()
  updateTransformGizmo()
})
watch(() => animationStore.showBones, rebuildBones)
watch(() => animationStore.xrayBones, rebuildBones)
watch(() => animationStore.isTestPoseActive, () => {
  rebuildBones()
  rebuildMeshes()
  updateTransformGizmo()
})
watch(() => animationStore.currentFrame, () => {
  rebuildBones()
  if (!updateMeshTransformsAndAttributes()) {
    rebuildMeshes()
  }
})
watch(
  () =>
    animationStore.armature.bones.map(
      b => `${b.position.x},${b.position.y},${b.position.z},${b.rotation.x},${b.rotation.y},${b.rotation.z},${b.scale.x},${b.scale.y},${b.scale.z}`
    ).join('|'),
  () => {
    if (!isSkeletalPoseMode() || isGizmoDragging || animationStore.isPlaying) return
    rebuildBones()
    refreshLiveDeform()
  }
)
watch(() => toolStore.isBoxSelectActive, (active) => {
  if (orbitControls) {
    orbitControls.enabled = !active
  }
})

function handleCameraViewEvent(e: any) {
  if (e && e.detail) {
    setCameraView(e.detail)
  }
}

function handleFillFaceEvent() {
  const mesh = projectStore.activeMesh
  const dir = new THREE.Vector3()
  activeCamera.getWorldDirection(dir)
  if (mesh) {
    dir.transformDirection(meshWorldMatrix(mesh).invert())
  }
  projectStore.performFillFace({ x: dir.x, y: dir.y, z: dir.z })
}

function handleBlenderModalEvent(e: any) {
  if (e && e.detail) {
    if (typeof e.detail === 'string') {
      startModalOperator(e.detail)
    } else if (e.detail.tool) {
      startModalOperator(e.detail.tool, e.detail)
    }
  }
}

function handlePrimitiveCreatedEvent(e: any) {
  if (e && e.detail) {
    const { type, parameters, transform } = e.detail
    projectStore.addPrimitive(type, parameters, transform)
    rebuildMeshes()
  }
}

function handleStartPrimitivePlacementEvent(e: any) {
  if (e && e.detail) {
    startModalOperator('primitive', {
      primitiveType: e.detail.type || e.detail.primitiveType || 'BOX',
      mode: e.detail.mode || PrimitivePlacementMode.CAD_DRAW,
      orientation: e.detail.orientation || 'WORLD',
      parameters: e.detail.parameters
    })
  }
}

function handleGlobalPointerMove(e: PointerEvent) {
  lastHoverClientPos = { x: e.clientX, y: e.clientY }
  if (operatorManager.state.value.active) {
    updateActiveCameraAndQuadrant(e)
    if (operatorManager.activeOperator) {
      (operatorManager.activeOperator as any).ctx.camera = activeCamera
      const vpKind = viewportKindFromQuadrant()
      ;(operatorManager.activeOperator as any).ctx.viewportKind = vpKind
      ;(operatorManager.activeOperator as any).ctx.quadrant = activeQuadrant.value
    }
    operatorManager.handlePointerMove(e)
  }
}

function handleGlobalKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (toolStore.isBoxSelectActive || isBoxSelectArmed.value) {
      toolStore.isBoxSelectActive = false
      isBoxSelectArmed.value = false
      isMarqueeSelecting.value = false
      if (orbitControls) orbitControls.enabled = true
      return
    }
    if (operatorManager.state.value.active) {
      e.preventDefault()
      e.stopPropagation()
      operatorManager.cancel()
      return
    }
  }

  // Blender Box Select shortcut (B) or Add Bone in Rig Mode
  if ((e.key === 'b' || e.key === 'B') && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (toolStore.isMeshWorkspace()) {
      toolStore.isBoxSelectActive = !toolStore.isBoxSelectActive
      return
    } else if (toolStore.appMode === 'rig') {
      animationStore.clickToPlaceMode = !animationStore.clickToPlaceMode
      return
    }
  }

  if ((e.key === 'r' || e.key === 'R') && e.altKey) {
    e.preventDefault()
    if (toolStore.appMode === 'animate') animationStore.resetPose()
    else animationStore.resetAllBonesToRest()
    rebuildBones()
    rebuildMeshes()
    return
  }

  // Blender Specials Context Menu shortcut (W)
  if ((e.key === 'w' || e.key === 'W') && !e.ctrlKey && !e.metaKey && !e.altKey && toolStore.isMeshWorkspace()) {
    specialsMenuPos.value = { x: pointerDownClientPos.x || 200, y: pointerDownClientPos.y || 200 }
    showSpecialsMenu.value = !showSpecialsMenu.value
    return
  }

  if (operatorManager.state.value.active) {
    if (operatorManager.handleKeyDown(e)) {
      e.preventDefault()
      e.stopPropagation()
    }
  }
}

function handleGlobalWheel(e: WheelEvent) {
  if (operatorManager.state.value.active) {
    if (operatorManager.handleWheel(e)) {
      e.preventDefault()
      e.stopPropagation()
    }
  }
}

function handleGlobalPointerDown(e: MouseEvent) {
  if (!operatorManager.state.value.active) return

  // Prevent drawing in 3D scene when clicking on UI buttons, inputs, dropdowns, floating modals, or inspector panels
  const target = e.target as HTMLElement | null
  if (target) {
    if (
      target.tagName === 'BUTTON' ||
      target.tagName === 'INPUT' ||
      target.tagName === 'SELECT' ||
      target.tagName === 'TEXTAREA' ||
      target.closest('button') ||
      target.closest('input') ||
      target.closest('select') ||
      target.closest('textarea') ||
      target.closest('.fixed:not(#canvas-mount)') ||
      target.closest('.hud-panel')
    ) {
      return
    }
  }

  if (orbitControls) orbitControls.enabled = false

  updateActiveCameraAndQuadrant(e)
  if (operatorManager.activeOperator) {
    (operatorManager.activeOperator as any).ctx.camera = activeCamera
    const vpKind = viewportKindFromQuadrant()
    ;(operatorManager.activeOperator as any).ctx.viewportKind = vpKind
    ;(operatorManager.activeOperator as any).ctx.quadrant = activeQuadrant.value
  }
  if (operatorManager.handlePointerDown(e)) {
    e.preventDefault()
    e.stopPropagation()
    return
  }
  if (e.button === 0) {
    e.preventDefault()
    e.stopPropagation()
    operatorManager.confirm()
  } else if (e.button === 2) {
    e.preventDefault()
    e.stopPropagation()
    operatorManager.cancel()
  }
}

function projectWorldToScreen(worldPos: THREE.Vector3): { x: number; y: number } {
  if (!activeCamera || !containerRef.value) return { x: 0, y: 0 }
  const rect = containerRef.value.getBoundingClientRect()
  const proj = worldPos.clone().project(activeCamera)
  
  if (!isSplitView()) {
    return {
      x: (proj.x * 0.5 + 0.5) * rect.width,
      y: (-(proj.y * 0.5) + 0.5) * rect.height
    }
  }

  if (isTripleView()) {
    const cols = tripleCols(rect.width)
    const localY = (-(proj.y * 0.5) + 0.5) * rect.height
    if (activeQuadrant.value === 'col_front') {
      return { x: (proj.x * 0.5 + 0.5) * cols.front, y: localY }
    }
    if (activeQuadrant.value === 'col_side') {
      return { x: cols.xSide + (proj.x * 0.5 + 0.5) * cols.side, y: localY }
    }
    return { x: cols.xPersp + (proj.x * 0.5 + 0.5) * cols.persp, y: localY }
  }

  const halfW = rect.width / 2
  const halfH = rect.height / 2
  const localX = (proj.x * 0.5 + 0.5) * halfW
  const localY = (-(proj.y * 0.5) + 0.5) * halfH

  if (activeQuadrant.value === 'top_left') {
    return { x: localX, y: localY }
  } else if (activeQuadrant.value === 'top_right') {
    return { x: halfW + localX, y: localY }
  } else if (activeQuadrant.value === 'bottom_left') {
    return { x: localX, y: halfH + localY }
  } else {
    return { x: halfW + localX, y: halfH + localY }
  }
}

function triggerAxisConstraint(axis: 'x' | 'y' | 'z') {
  operatorManager.handleKeyDown(new KeyboardEvent('keydown', { key: axis }))
}

function triggerToggleSnap() {
  operatorManager.handleKeyDown(new KeyboardEvent('keydown', { key: 'Control', ctrlKey: true }))
}

function triggerTogglePrecision() {
  operatorManager.handleKeyDown(new KeyboardEvent('keydown', { key: 'Shift', shiftKey: true }))
}

function triggerToggleOrientation() {
  operatorManager.handleKeyDown(new KeyboardEvent('keydown', { key: 'o' }))
}

function triggerInsetIndividual() {
  operatorManager.handleKeyDown(new KeyboardEvent('keydown', { key: 'i' }))
}

function triggerInsetBoundary() {
  operatorManager.handleKeyDown(new KeyboardEvent('keydown', { key: 'b' }))
}

function triggerInsetOutset() {
  operatorManager.handleKeyDown(new KeyboardEvent('keydown', { key: 'o' }))
}

function triggerStepBack() {
  operatorManager.handlePointerDown({ button: 2 } as any)
}

// Floating & Movable Operator HUD
const hudPos = ref({ x: typeof window !== 'undefined' ? Math.max(20, Math.round(window.innerWidth / 2 - 220)) : 220, y: 52 })
const { startDrag: startHudDrag } = useFloatingDrag(hudPos, {
  minX: 10,
  minY: 40,
  maxPadX: 320,
  maxPadY: 90
})

watch(() => toolStore.viewport.invertZoom, (inv) => {
  if (orbitControls) {
    orbitControls.zoomSpeed = inv ? -1.0 : 1.0
  }
})

watch(() => toolStore.viewport.shadeMode, () => {
  rebuildMeshes()
})

watch(() => toolStore.viewport.faceOrientation, () => {
  rebuildMeshes()
})

watch(() => toolStore.viewport.wireframeOpacity, () => {
  rebuildMeshes()
})

watch(() => toolStore.viewport.shading, () => {
  updateThreeTexture()
  rebuildMeshes()
})

watch(() => toolStore.viewport.xray, () => {
  rebuildMeshes()
  rebuildBones()
})

watch(() => projectStore.textureRevision, () => {
  updateThreeTextures()
})

watch(() => toolStore.uvHoverFaceIds, () => {
  updateHoverState()
})

watch(() => [projectStore.activeTextureId, projectStore.textures.length], () => {
  updateThreeTextures()
  rebuildMeshes()
})

watch(() => projectStore.materials, () => {
  updateThreeTextures()
  rebuildMeshes()
}, { deep: true })

watch(() => [projectStore.meshes, projectStore.geometryRevision, projectStore.activeMeshId, projectStore.selectedMeshIds], () => {
  rebuildMeshes()
}, { deep: true })

watch(() => [
  animationStore.isWeightPaintActive,
  animationStore.selectedBoneId,
  animationStore.weightBrushRadius,
  animationStore.weightBrushWeight,
  animationStore.weightPaintTool
], () => {
  rebuildMeshes()
})

watch(() => operatorManager.state.value.active, (active) => {
  if (orbitControls) {
    orbitControls.enabled = !active
  }
})

function toggleBoneVisibility() {
  animationStore.toggleShowBones()
  rebuildBones()
}

watch(() => [toolStore.viewport.showBones, animationStore.showBones], () => {
  rebuildBones()
})

function handleThemeChangedEvent(e: any) {
  if (e && e.detail) {
    applyTheme(e.detail)
  }
}

watch(() => themeStore.currentThemeId, () => {
  applyTheme(themeStore.activeColors)
})

watch(
  () => [layoutStore.blockoutFrontFrac, layoutStore.blockoutSideFrac] as const,
  () => syncBlockoutSplitsToScreen(),
  { immediate: true }
)

onMounted(() => {
  void startViewportRenderer()
  window.addEventListener(EDITOR_EVENTS.cameraView, handleCameraViewEvent)
  window.addEventListener(EDITOR_EVENTS.modalTool, handleBlenderModalEvent)
  window.addEventListener(EDITOR_EVENTS.fillFace, handleFillFaceEvent)
  window.addEventListener(EDITOR_EVENTS.primitiveCreated, handlePrimitiveCreatedEvent)
  window.addEventListener(EDITOR_EVENTS.startPrimitivePlacement, handleStartPrimitivePlacementEvent)
  window.addEventListener('theme-changed', handleThemeChangedEvent)
  window.addEventListener('pointermove', handleGlobalPointerMove)
  window.addEventListener('keydown', handleGlobalKeyDown, true)
  window.addEventListener('wheel', handleGlobalWheel, { passive: false })
  window.addEventListener('pointerdown', handleGlobalPointerDown, true)
  window.addEventListener('focus', handleViewportFocus)
  document.addEventListener('visibilitychange', handleViewportVisibilityChange)
})

onUnmounted(() => {
  window.removeEventListener(EDITOR_EVENTS.cameraView, handleCameraViewEvent)
  window.removeEventListener(EDITOR_EVENTS.modalTool, handleBlenderModalEvent)
  window.removeEventListener(EDITOR_EVENTS.fillFace, handleFillFaceEvent)
  window.removeEventListener(EDITOR_EVENTS.primitiveCreated, handlePrimitiveCreatedEvent)
  window.removeEventListener(EDITOR_EVENTS.startPrimitivePlacement, handleStartPrimitivePlacementEvent)
  window.removeEventListener('theme-changed', handleThemeChangedEvent)
  window.removeEventListener('pointermove', handleGlobalPointerMove)
  window.removeEventListener('keydown', handleGlobalKeyDown, true)
  window.removeEventListener('wheel', handleGlobalWheel)
  window.removeEventListener('pointerdown', handleGlobalPointerDown, true)
  window.removeEventListener('focus', handleViewportFocus)
  document.removeEventListener('visibilitychange', handleViewportVisibilityChange)
  if (contextRecoveryTimer !== null) {
    window.clearTimeout(contextRecoveryTimer)
    contextRecoveryTimer = null
  }
  cancelAnimationFrame(animationFrameId)
  if (operatorManager.state.value.active) {
    operatorManager.cancel()
  }
  if (resizeObserver && containerRef.value) {
    resizeObserver.unobserve(containerRef.value)
    resizeObserver.disconnect()
  }
  if (renderer && renderer.domElement && containerRef.value) {
    renderer.domElement.removeEventListener('wheel', onWheel)
    renderer.domElement.removeEventListener('pointerdown', onPointerDown, { capture: true } as EventListenerOptions)
    renderer.domElement.removeEventListener('pointermove', onPointerMove, { capture: true } as EventListenerOptions)
    renderer.domElement.removeEventListener('pointerup', onPointerUp, { capture: true } as EventListenerOptions)
    renderer.domElement.removeEventListener('pointerleave', onPointerUp, { capture: true } as EventListenerOptions)
    renderer.domElement.removeEventListener('webglcontextlost', handleWebGLContextLost)
    renderer.domElement.removeEventListener('webglcontextrestored', handleWebGLContextRestored)
    renderer.domElement.parentElement?.removeChild(renderer.domElement)
    renderer.dispose()
  }
  if (orbitControls) {
    orbitControls.dispose()
  }
  if (transformControls) {
    transformControls.dispose()
  }
  if (layers) {
    layers.dispose(scene)
  }
  if (editorEnv) {
    editorEnv.dispose()
  }
  for (const tex of textureCache.values()) {
    tex.dispose()
  }
  textureCache.clear()
  if (threeTexture) {
    threeTexture.dispose()
    threeTexture = null
  }
  if (psxMaterial) {
    psxMaterial.dispose()
    psxMaterial = null
  }
  window.removeEventListener('resize', onWindowResize)
})
</script>

<template>
  <div data-viewport-root class="relative w-full h-full overflow-hidden bg-ui-root flex flex-col">
    <!-- 3D Canvas Container -->
    <div 
      ref="containerRef" 
      class="w-full h-full cursor-crosshair flex-1 min-h-0 relative"
      @dragover.prevent="onViewportDragOver"
      @dragleave.prevent="onViewportDragLeave"
      @drop.prevent="onViewportDrop"
    >
      <!-- Dedicated 3D Canvas Mount (Preserves Vue UI overlay and LightWave controls) -->
      <div ref="canvasMountRef" class="absolute inset-0 w-full h-full z-0 pointer-events-auto"></div>

      <!-- Drop Image Overlay -->
      <div
        v-if="isDraggingImageFile && isTripleView()"
        class="absolute inset-0 z-50 grid pointer-events-none"
        :style="{ gridTemplateColumns: blockoutGridCols }"
      >
        <div
          class="m-1.5 rounded-lg border-2 border-dashed flex flex-col items-center justify-center text-center px-3"
          :class="dropTargetPane === 'front' ? 'bg-emerald-950/75 border-emerald-400' : 'bg-ui-root/40 border-ui-borderStrong'"
        >
          <span class="text-xs font-bold text-white font-mono">Front reference</span>
          <span class="text-[10px] text-emerald-200 font-mono mt-1">Tracing plane (not a texture)</span>
        </div>
        <div
          class="m-1.5 rounded-lg border-2 border-dashed flex flex-col items-center justify-center text-center px-3"
          :class="dropTargetPane === 'side' ? 'bg-indigo-950/75 border-indigo-400' : 'bg-ui-root/40 border-ui-borderStrong'"
        >
          <span class="text-xs font-bold text-white font-mono">Side reference</span>
          <span class="text-[10px] text-indigo-200 font-mono mt-1">Tracing plane (not a texture)</span>
        </div>
        <div
          class="m-1.5 rounded-lg border-2 border-dashed flex flex-col items-center justify-center text-center px-3"
          :class="dropTargetPane === 'persp' ? 'bg-sky-950/75 border-sky-400' : 'bg-ui-root/40 border-ui-borderStrong'"
        >
          <span class="text-xs font-bold text-white font-mono">Apply texture</span>
          <span class="text-[10px] text-sky-200 font-mono mt-1">Assigns to the 3D object</span>
        </div>
      </div>
      <div 
        v-else-if="isDraggingImageFile"
        class="absolute inset-3 bg-sky-950/70 backdrop-blur-xs border-2 border-dashed border-sky-400 rounded-lg z-50 flex flex-col items-center justify-center p-6 text-center pointer-events-none shadow-2xl animate-in fade-in"
      >
        <span class="text-sm font-bold text-white font-mono">Drop Image to Apply Texture</span>
        <span class="text-[10px] text-sky-300 font-mono mt-1">Assigns image texture directly to 3D object</span>
      </div>
      <div
        v-if="isWebGLContextLost || rendererInitError"
        class="absolute inset-0 z-40 flex items-center justify-center bg-ui-root/90 backdrop-blur-sm"
      >
        <div class="max-w-xs flex flex-col items-center gap-2 rounded border border-ui-borderStrong bg-ui-panel px-5 py-4 shadow-xl text-center">
          <span class="text-[11px] font-bold text-ui-textPrimary">
            {{ rendererInitError ? '3D rendering is unavailable' : 'Restoring 3D viewport…' }}
          </span>
          <span class="text-[9px] leading-relaxed text-ui-textMuted">
            <template v-if="rendererInitError">
              {{ rendererInitError }} Enable hardware acceleration and WebGL in your browser, restart it, then retry.
            </template>
            <template v-else>The browser released the graphics context.</template>
          </span>
          <button
            @click="rendererInitError ? startViewportRenderer() : recoverViewportRenderer()"
            :disabled="isRendererStarting"
            class="mt-1 rounded-xs border border-ui-accent/50 bg-ui-active px-3 py-1 text-[9px] font-bold text-ui-textAccent hover:bg-ui-hover"
          >{{ isRendererStarting ? 'Starting…' : 'Retry renderer' }}</button>
        </div>
      </div>

      <!-- 1. SINGLE VIEWPORT LIGHTWAVE CONTROLS -->
      <template v-if="!isSplitView()">
        <!-- Top-Left Transform Space & Pivot Cluster -->
        <div 
          v-if="toolStore.appMode === 'model' || toolStore.appMode === 'blockout'"
          class="absolute top-2.5 left-2.5 z-20 flex items-center gap-1.5 bg-ui-panel/95 text-ui-textPrimary border border-ui-borderStrong rounded-xs shadow-md px-2 py-1 text-xs font-mono select-none"
        >
          <!-- Transform Orientation -->
          <div class="flex items-center gap-1">
            <span class="text-[10px] text-ui-textMuted uppercase font-bold">Space:</span>
            <select 
              v-model="toolStore.transformOrientation"
              class="bg-ui-input border border-ui-borderSubtle rounded-xs px-1.5 py-0.5 text-[11px] text-ui-textPrimary focus:outline-none focus:border-amber-400"
            >
              <option value="global">Global</option>
              <option value="local">Local</option>
              <option value="normal">Normal</option>
              <option value="view">View</option>
              <option value="cursor">3D Cursor</option>
            </select>
          </div>

          <div class="h-3 w-px bg-ui-borderSubtle"></div>

          <!-- Pivot Point -->
          <div class="flex items-center gap-1">
            <span class="text-[10px] text-ui-textMuted uppercase font-bold">Pivot:</span>
            <select 
              v-model="toolStore.pivotPoint"
              class="bg-ui-input border border-ui-borderSubtle rounded-xs px-1.5 py-0.5 text-[11px] text-ui-textPrimary focus:outline-none focus:border-amber-400"
            >
              <option value="median">Median Point</option>
              <option value="active">Active Element</option>
              <option value="cursor">3D Cursor</option>
            </select>
          </div>
        </div>

        <!-- Top-Right LightWave Nav Cluster (Move, Rotate, Zoom, Center, Maximize) -->
        <div class="absolute top-2.5 right-2.5 z-20 flex items-center bg-ui-panel/95 text-ui-textPrimary border border-ui-borderStrong rounded-xs shadow-md divide-x divide-ui-borderSubtle">
          <button 
            @mousedown="startLightWavePan('persp', $event)" 
            class="p-1.5 hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textAccent cursor-move transition"
            title="LightWave Pan (Drag to pan view)"
          >
            <Move class="w-3.5 h-3.5" />
          </button>
          <button 
            @mousedown="startLightWaveRotate($event)" 
            class="p-1.5 hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textAccent cursor-grab transition"
            title="LightWave Orbit (Drag to rotate 3D view)"
          >
            <RotateCw class="w-3.5 h-3.5" />
          </button>
          <button 
            @mousedown="startLightWaveZoom('persp', $event)" 
            class="p-1.5 hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textAccent cursor-ns-resize transition"
            title="LightWave Zoom (Drag up/down to zoom)"
          >
            <Search class="w-3.5 h-3.5" />
          </button>
          <button 
            @click="centerViewOnContents('persp')" 
            class="p-1.5 hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textAccent transition"
            title="Center View on Model (Frame Contents)"
          >
            <Crosshair class="w-3.5 h-3.5" />
          </button>
          <!-- In-Viewport See-Through Glassmorphic X-Ray Button -->
          <button 
            @click="toolStore.viewport.xray = !toolStore.viewport.xray" 
            class="p-1.5 transition flex items-center justify-center cursor-pointer"
            :class="toolStore.viewport.xray ? 'bg-ui-active text-ui-textAccent font-bold shadow-inner' : 'hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textAccent'"
            title="Toggle X-Ray Mode (Alt+Z)"
          >
            <BlenderIcon name="xray" :size="14" :color="toolStore.viewport.xray ? 'var(--ui-accent)' : 'currentColor'" />
          </button>
          <!-- In-Viewport Bone Visibility Toggle Button -->
          <button 
            @click="toggleBoneVisibility()" 
            class="p-1.5 transition flex items-center justify-center cursor-pointer"
            :class="toolStore.viewport.showBones ? 'text-amber-400 hover:bg-ui-hover' : 'text-ui-textMuted/60 hover:text-ui-textSecondary hover:bg-ui-hover'"
            :title="toolStore.viewport.showBones ? 'Hide Skeleton Bones' : 'Show Skeleton Bones'"
          >
            <GitCommitVertical v-if="toolStore.viewport.showBones" class="w-3.5 h-3.5 text-amber-400" />
            <EyeOff v-else class="w-3.5 h-3.5 text-ui-textMuted" />
          </button>
          <button 
            @click="toolStore.viewport.quadView = true" 
            class="p-1.5 hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textAccent transition cursor-pointer"
            title="Split to Quad View (Ctrl+Alt+Q)"
          >
            <Maximize2 class="w-3.5 h-3.5 text-ui-textAccent" />
          </button>
        </div>

        <!-- In-Viewport Origin Edit Mode Guidance Banner -->
        <div 
          v-if="toolStore.appMode === 'model' && toolStore.selectMode === 'origin'"
          class="absolute top-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-1 bg-amber-950/90 backdrop-blur-xs border border-amber-500/50 rounded-full shadow-lg font-sans text-[11px] text-amber-300 select-none"
        >
          <div class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></div>
          <span class="font-semibold">
            Origin Edit Mode: Drag Gizmo or Use Presets to Move Pivot
          </span>
          <button 
            @click="toolStore.selectMode = 'object'" 
            class="ml-1 px-2 py-0.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xs text-[10px] transition cursor-pointer"
          >
            Done
          </button>
        </div>

        <!-- In-Viewport Rigging Mode Guidance Banner -->
        <div 
          v-if="toolStore.appMode === 'rig'"
          class="absolute top-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-1 bg-ui-panel/90 backdrop-blur-xs border border-ui-borderStrong rounded-full shadow-lg font-sans text-[11px]"
        >
          <div class="w-2 h-2 rounded-full" :class="animationStore.clickToPlaceMode ? 'bg-amber-400 animate-pulse' : animationStore.isWeightPaintActive ? 'bg-sky-400 animate-pulse' : 'bg-emerald-400'"></div>
          <span v-if="animationStore.clickToPlaceMode" class="text-amber-300 font-semibold">
            Draw Bone Active: Click Head, then Click Tail in 3D (Press B or Esc to exit)
          </span>
          <span v-else-if="animationStore.isWeightPaintActive" class="text-sky-300 font-semibold flex items-center gap-1.5">
            <span>Weight Paint Mode:</span>
            <strong class="text-amber-400 font-mono">{{ animationStore.selectedBone ? animationStore.selectedBone.name : 'Select Bone' }}</strong>
            <span class="text-ui-textMuted text-[10px]">({{ animationStore.weightPaintTool.toUpperCase() }} · Radius: {{ animationStore.weightBrushRadius }}m · W: {{ Number(animationStore.weightBrushWeight).toFixed(2) }})</span>
          </span>
          <span v-else-if="animationStore.armature.bones.length === 0" class="text-ui-textPrimary">
            Rig Mode: Press <strong class="text-ui-textAccent">B</strong> or click <strong class="text-ui-textAccent">+ Add Bone</strong>
          </span>
          <span v-else class="text-ui-textSecondary">
            Rig Mode: <strong class="text-ui-textPrimary">{{ animationStore.selectedBone ? animationStore.selectedBone.name : 'Select joint' }}</strong> · <span class="text-ui-textMuted">Extrude: E · Bind: Ctrl+B</span>
          </span>
          <button 
            @click="animationStore.toggleBoneHierarchyPopout()" 
            class="ml-1 px-1.5 py-0.2 bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle rounded-xs text-[10px] text-ui-textAccent font-semibold transition cursor-pointer"
            title="Toggle Floating Bone Hierarchy (H)"
          >
            Tree (H)
          </button>
        </div>

        <!-- In-Viewport Floating Heatmap Legend Overlay -->
        <div 
          v-if="toolStore.appMode === 'rig' && animationStore.isWeightPaintActive && animationStore.showHeatmapLegend"
          class="absolute bottom-3 left-3 z-20 bg-ui-panel/90 backdrop-blur-xs border border-ui-borderStrong rounded-xs p-2 shadow-xl font-sans text-xs flex flex-col gap-1 min-w-[210px] select-none pointer-events-none"
        >
          <div class="flex items-center justify-between text-[10px] text-ui-textMuted font-bold uppercase tracking-wider">
            <span>Heatmap Influence</span>
            <span class="text-amber-400 font-mono">{{ animationStore.selectedBone ? animationStore.selectedBone.name : 'No Bone' }}</span>
          </div>
          <div class="h-2.5 w-full rounded-xs shadow-inner" style="background: linear-gradient(to right, #0a188f 0%, #00e5ff 25%, #00e676 50%, #ffd600 75%, #ff1744 100%);"></div>
          <div class="flex justify-between text-[9px] font-mono text-ui-textSecondary">
            <span>0% Blue</span>
            <span>25%</span>
            <span>50%</span>
            <span>75%</span>
            <span>100% Red</span>
          </div>
        </div>
      </template>

      <!-- 2. BLOCKOUT TRIPLE (Front | Side | Persp) -->
      <template v-else-if="isTripleView()">
        <div class="absolute inset-0 z-20 grid pointer-events-none" :style="{ gridTemplateColumns: blockoutGridCols }">
          <div
            class="relative min-w-0 border-2"
            :class="activeQuadrant === 'col_front' ? 'border-emerald-400/85' : 'border-transparent'"
          >
            <div class="absolute top-1.5 left-1.5 right-1.5 flex items-center justify-between gap-1 min-w-0">
              <div class="shrink-0 px-1.5 py-0.5 rounded-xs bg-ui-panel/95 border border-ui-borderStrong text-[10px] font-mono text-ui-textPrimary flex items-center gap-1 shadow-xs">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                <span class="font-bold">Front</span>
                <span class="text-ui-textMuted">Z</span>
              </div>
              <div class="pointer-events-auto flex items-center bg-ui-panel/95 border border-ui-borderStrong rounded-xs shadow-xs divide-x divide-ui-borderSubtle shrink-0">
                <button type="button" @mousedown="startLightWavePan('front', $event)" class="p-1 hover:bg-ui-hover text-ui-textSecondary cursor-move" title="Pan Front">
                  <Move class="w-3 h-3" />
                </button>
                <button type="button" @mousedown="startLightWaveZoom('front', $event)" class="p-1 hover:bg-ui-hover text-ui-textSecondary cursor-ns-resize" title="Zoom Front">
                  <Search class="w-3 h-3" />
                </button>
                <button type="button" @click="centerViewOnContents('front')" class="p-1 hover:bg-ui-hover text-ui-textSecondary" title="Frame Front">
                  <Crosshair class="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
          <div
            class="relative min-w-0 border-2 border-l border-ui-borderStrong/50"
            :class="activeQuadrant === 'col_side' ? 'border-indigo-400/85' : 'border-transparent'"
          >
            <div class="absolute top-1.5 left-1.5 right-1.5 flex items-center justify-between gap-1 min-w-0">
              <div class="shrink-0 px-1.5 py-0.5 rounded-xs bg-ui-panel/95 border border-ui-borderStrong text-[10px] font-mono text-ui-textPrimary flex items-center gap-1 shadow-xs">
                <span class="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                <span class="font-bold">Side</span>
                <span class="text-ui-textMuted">X</span>
              </div>
              <div class="pointer-events-auto flex items-center bg-ui-panel/95 border border-ui-borderStrong rounded-xs shadow-xs divide-x divide-ui-borderSubtle shrink-0">
                <button type="button" @mousedown="startLightWavePan('right', $event)" class="p-1 hover:bg-ui-hover text-ui-textSecondary cursor-move" title="Pan Side">
                  <Move class="w-3 h-3" />
                </button>
                <button type="button" @mousedown="startLightWaveZoom('right', $event)" class="p-1 hover:bg-ui-hover text-ui-textSecondary cursor-ns-resize" title="Zoom Side">
                  <Search class="w-3 h-3" />
                </button>
                <button type="button" @click="centerViewOnContents('right')" class="p-1 hover:bg-ui-hover text-ui-textSecondary" title="Frame Side">
                  <Crosshair class="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
          <div
            class="relative min-w-0 border-2"
            :class="activeQuadrant === 'col_persp' ? 'border-amber-400/85' : 'border-transparent'"
          >
            <div class="absolute top-1.5 left-1.5 right-1.5 flex items-center justify-between gap-1 min-w-0">
              <div class="shrink-0 px-1.5 py-0.5 rounded-xs bg-ui-panel/95 border border-ui-borderStrong text-[10px] font-mono text-ui-textPrimary flex items-center gap-1 shadow-xs">
                <span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                <span class="font-bold">Persp</span>
              </div>
              <div class="pointer-events-auto flex items-center bg-ui-panel/95 border border-ui-borderStrong rounded-xs shadow-xs divide-x divide-ui-borderSubtle shrink-0">
                <button type="button" @mousedown="startLightWavePan('persp', $event)" class="p-1 hover:bg-ui-hover text-ui-textSecondary cursor-move" title="Pan">
                  <Move class="w-3 h-3" />
                </button>
                <button type="button" @mousedown="startLightWaveRotate($event)" class="p-1 hover:bg-ui-hover text-ui-textSecondary cursor-grab" title="Orbit">
                  <RotateCw class="w-3 h-3" />
                </button>
                <button type="button" @mousedown="startLightWaveZoom('persp', $event)" class="p-1 hover:bg-ui-hover text-ui-textSecondary cursor-ns-resize" title="Zoom">
                  <Search class="w-3 h-3" />
                </button>
                <button type="button" @click="centerViewOnContents('persp')" class="p-1 hover:bg-ui-hover text-ui-textSecondary" title="Frame">
                  <Crosshair class="w-3 h-3" />
                </button>
                <button
                  type="button"
                  @click="toolStore.viewport.xray = !toolStore.viewport.xray"
                  class="p-1"
                  :class="toolStore.viewport.xray ? 'bg-ui-active text-ui-textAccent' : 'hover:bg-ui-hover text-ui-textSecondary'"
                  title="X-Ray"
                >
                  <BlenderIcon name="xray" :size="13" :color="toolStore.viewport.xray ? 'var(--ui-accent)' : 'currentColor'" />
                </button>
              </div>
            </div>
          </div>
        </div>
        <div
          class="absolute inset-y-0 z-30 w-4 -translate-x-1/2 cursor-col-resize pointer-events-auto group"
          :class="isBlockoutSplitting ? 'bg-amber-400/25' : 'hover:bg-amber-400/15'"
          :style="{ left: `${layoutStore.blockoutFrontFrac * 100}%` }"
          title="Drag to resize Front / Side. Double-click to reset."
          @pointerdown="startBlockoutSplit('front-side', $event)"
          @dblclick="resetBlockoutSplits"
        >
          <div class="absolute inset-y-3 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-ui-borderStrong group-hover:bg-amber-400" />
        </div>
        <div
          class="absolute inset-y-0 z-30 w-4 -translate-x-1/2 cursor-col-resize pointer-events-auto group"
          :class="isBlockoutSplitting ? 'bg-amber-400/25' : 'hover:bg-amber-400/15'"
          :style="{ left: `${(layoutStore.blockoutFrontFrac + layoutStore.blockoutSideFrac) * 100}%` }"
          title="Drag to resize Side / Persp. Double-click to reset."
          @pointerdown="startBlockoutSplit('side-persp', $event)"
          @dblclick="resetBlockoutSplits"
        >
          <div class="absolute inset-y-3 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-ui-borderStrong group-hover:bg-amber-400" />
        </div>
        <div
          v-if="!operatorManager.state.value.active"
          class="absolute bottom-2 left-1/2 z-20 -translate-x-1/2 pointer-events-none max-w-[min(92%,42rem)] px-2.5 py-1 rounded-xs bg-ui-panel/90 border border-ui-borderStrong text-[10px] font-mono text-ui-textSecondary text-center shadow-xs"
        >
          <span class="text-amber-400 font-semibold">F</span> Draw
          · Drag a ref to place it
          · <span class="text-ui-textMuted">Alt-drag</span> pane’s photo
          · Shift-drag scale · Alt-wheel scale
          · Drag the bars to resize panes · double-click resets
        </div>
      </template>

      <!-- 3. QUAD VIEWPORT LIGHTWAVE CONTROLS -->
      <template v-else>
        <!-- Center Divider Lines -->
        <div class="absolute inset-x-0 top-1/2 h-px bg-ui-borderStrong/60 pointer-events-none z-10"></div>
        <div class="absolute inset-y-0 left-1/2 w-px bg-ui-borderStrong/60 pointer-events-none z-10"></div>

        <!-- QUADRANT 1: TOP-LEFT (Top Ortho) -->
        <div class="absolute top-2 left-2 z-20 flex items-center justify-between w-[calc(50%-16px)]">
          <!-- View Label -->
          <div class="px-2 py-0.5 rounded-xs bg-ui-panel/95 border border-ui-borderStrong text-[10px] font-mono text-ui-textPrimary flex items-center gap-1.5 shadow-xs">
            <span class="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
            <span class="font-bold">Top Ortho</span>
            <span class="text-ui-textMuted">[Y+]</span>
          </div>

          <!-- LightWave Nav Buttons (Pan, Zoom, Center, Maximize for 2D Ortho) -->
          <div class="flex items-center bg-ui-panel/95 text-ui-textPrimary border border-ui-borderStrong rounded-xs shadow-xs divide-x divide-ui-borderSubtle">
            <button @mousedown="startLightWavePan('top', $event)" class="p-1 hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textAccent cursor-move transition" title="Pan Top View (Drag to pan)">
              <Move class="w-3 h-3" />
            </button>
            <button @mousedown="startLightWaveZoom('top', $event)" class="p-1 hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textAccent cursor-ns-resize transition" title="Zoom Top View (Drag up/down to zoom)">
              <Search class="w-3 h-3" />
            </button>
            <button @click="centerViewOnContents('top')" class="p-1 hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textAccent transition" title="Center Top View on Model">
              <Crosshair class="w-3 h-3" />
            </button>
            <button @click="toolStore.viewport.quadView = false" class="p-1 hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textAccent transition" title="Maximize View">
              <Maximize2 class="w-3 h-3" />
            </button>
          </div>
        </div>

        <!-- QUADRANT 2: TOP-RIGHT (Perspective) -->
        <div class="absolute top-2 right-2 z-20 flex items-center justify-between w-[calc(50%-16px)]">
          <div class="px-2 py-0.5 rounded-xs bg-ui-panel/95 border border-ui-borderStrong text-[10px] font-mono text-ui-textPrimary flex items-center gap-1.5 shadow-xs">
            <span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
            <span class="font-bold">Perspective 3D</span>
            <span class="text-ui-textMuted">[User]</span>
          </div>

          <!-- Full 3D Nav Buttons (Pan, Rotate, Zoom, Center, X-Ray, Maximize) -->
          <div class="flex items-center bg-ui-panel/95 text-ui-textPrimary border border-ui-borderStrong rounded-xs shadow-xs divide-x divide-ui-borderSubtle">
            <button @mousedown="startLightWavePan('persp', $event)" class="p-1 hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textAccent cursor-move transition" title="Pan View">
              <Move class="w-3 h-3" />
            </button>
            <button @mousedown="startLightWaveRotate($event)" class="p-1 hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textAccent cursor-grab transition" title="Orbit 3D View">
              <RotateCw class="w-3 h-3" />
            </button>
            <button @mousedown="startLightWaveZoom('persp', $event)" class="p-1 hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textAccent cursor-ns-resize transition" title="Zoom View">
              <Search class="w-3 h-3" />
            </button>
            <button @click="centerViewOnContents('persp')" class="p-1 hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textAccent transition" title="Center View on Model">
              <Crosshair class="w-3 h-3" />
            </button>
            <!-- In-Viewport See-Through Glassmorphic X-Ray Button -->
            <button 
              @click="toolStore.viewport.xray = !toolStore.viewport.xray" 
              class="p-1 transition flex items-center justify-center"
              :class="toolStore.viewport.xray ? 'bg-ui-active text-ui-textAccent font-bold shadow-inner' : 'hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textAccent'"
              title="Toggle X-Ray Mode (Alt+Z)"
            >
              <BlenderIcon name="xray" :size="13" :color="toolStore.viewport.xray ? 'var(--ui-accent)' : 'currentColor'" />
            </button>
            <button @click="toolStore.viewport.quadView = false" class="p-1 hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textAccent transition" title="Maximize View">
              <Maximize2 class="w-3 h-3" />
            </button>
          </div>
        </div>

        <!-- QUADRANT 3: BOTTOM-LEFT (Front Ortho) -->
        <div class="absolute top-[calc(50%+8px)] left-2 z-20 flex items-center justify-between w-[calc(50%-16px)]">
          <div class="px-2 py-0.5 rounded-xs bg-ui-panel/95 border border-ui-borderStrong text-[10px] font-mono text-ui-textPrimary flex items-center gap-1.5 shadow-xs">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            <span class="font-bold">Front Ortho</span>
            <span class="text-ui-textMuted">[Z-]</span>
          </div>

          <!-- LightWave Nav Buttons (Pan, Zoom, Center, Maximize for 2D Ortho) -->
          <div class="flex items-center bg-ui-panel/95 text-ui-textPrimary border border-ui-borderStrong rounded-xs shadow-xs divide-x divide-ui-borderSubtle">
            <button @mousedown="startLightWavePan('front', $event)" class="p-1 hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textAccent cursor-move transition" title="Pan Front View (Drag to pan)">
              <Move class="w-3 h-3" />
            </button>
            <button @mousedown="startLightWaveZoom('front', $event)" class="p-1 hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textAccent cursor-ns-resize transition" title="Zoom Front View (Drag up/down to zoom)">
              <Search class="w-3 h-3" />
            </button>
            <button @click="centerViewOnContents('front')" class="p-1 hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textAccent transition" title="Center Front View on Model">
              <Crosshair class="w-3 h-3" />
            </button>
            <button @click="toolStore.viewport.quadView = false" class="p-1 hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textAccent transition" title="Maximize View">
              <Maximize2 class="w-3 h-3" />
            </button>
          </div>
        </div>

        <!-- QUADRANT 4: BOTTOM-RIGHT (Right Ortho) -->
        <div class="absolute top-[calc(50%+8px)] right-2 z-20 flex items-center justify-between w-[calc(50%-16px)]">
          <div class="px-2 py-0.5 rounded-xs bg-ui-panel/95 border border-ui-borderStrong text-[10px] font-mono text-ui-textPrimary flex items-center gap-1.5 shadow-xs">
            <span class="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
            <span class="font-bold">Right Ortho</span>
            <span class="text-ui-textMuted">[X-]</span>
          </div>

          <!-- LightWave Nav Buttons (Pan, Zoom, Center, Maximize for 2D Ortho) -->
          <div class="flex items-center bg-ui-panel/95 text-ui-textPrimary border border-ui-borderStrong rounded-xs shadow-xs divide-x divide-ui-borderSubtle">
            <button @mousedown="startLightWavePan('right', $event)" class="p-1 hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textAccent cursor-move transition" title="Pan Right View (Drag to pan)">
              <Move class="w-3 h-3" />
            </button>
            <button @mousedown="startLightWaveZoom('right', $event)" class="p-1 hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textAccent cursor-ns-resize transition" title="Zoom Right View (Drag up/down to zoom)">
              <Search class="w-3 h-3" />
            </button>
            <button @click="centerViewOnContents('right')" class="p-1 hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textAccent transition" title="Center Right View on Model">
              <Crosshair class="w-3 h-3" />
            </button>
            <button @click="toolStore.viewport.quadView = false" class="p-1 hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textAccent transition" title="Maximize View">
              <Maximize2 class="w-3 h-3" />
            </button>
          </div>
        </div>
      </template>
    </div>

    <!-- Retro CRT Scanline Filter Overlay (Optional) -->
    <div 
      v-if="toolStore.viewport.crtFilter" 
      class="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,_rgba(0,0,0,0)_0%,_rgba(0,0,0,0.4)_100%)] opacity-80"
    >
      <div class="w-full h-full bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%)] bg-[length:100%_4px]"></div>
    </div>

    <!-- Knife & Loop Cut Interactive Screen Overlay Layer -->
    <svg 
      v-if="operatorManager.state.value.active && (operatorManager.activeOperator instanceof KnifeOperator || operatorManager.activeOperator instanceof LoopCutOperator || operatorManager.activeOperator instanceof PolyDrawOperator)"
      class="absolute inset-0 w-full h-full pointer-events-none z-30"
    >
      <!-- Loop Cut Preview Lines -->
      <template v-if="operatorManager.activeOperator instanceof LoopCutOperator">
        <line
          v-for="(seg, idx) in (operatorManager.activeOperator as LoopCutOperator).previewSegments"
          :key="'lc_' + idx"
          :x1="projectWorldToScreen(seg.p1).x"
          :y1="projectWorldToScreen(seg.p1).y"
          :x2="projectWorldToScreen(seg.p2).x"
          :y2="projectWorldToScreen(seg.p2).y"
          stroke="#f59e0b"
          stroke-width="2.5"
          stroke-linecap="round"
        />
      </template>

      <template v-if="operatorManager.activeOperator instanceof PolyDrawOperator">
        <line
          v-for="(pt, idx) in (operatorManager.activeOperator as PolyDrawOperator).screenPoints.slice(1)"
          :key="'pd_' + idx"
          :x1="(operatorManager.activeOperator as PolyDrawOperator).screenPoints[idx].x - (containerRef?.getBoundingClientRect().left || 0)"
          :y1="(operatorManager.activeOperator as PolyDrawOperator).screenPoints[idx].y - (containerRef?.getBoundingClientRect().top || 0)"
          :x2="pt.x - (containerRef?.getBoundingClientRect().left || 0)"
          :y2="pt.y - (containerRef?.getBoundingClientRect().top || 0)"
          stroke="#f59e0b"
          stroke-width="2"
        />
        <circle
          v-for="(pt, idx) in (operatorManager.activeOperator as PolyDrawOperator).screenPoints"
          :key="'pdc_' + idx"
          :cx="pt.x - (containerRef?.getBoundingClientRect().left || 0)"
          :cy="pt.y - (containerRef?.getBoundingClientRect().top || 0)"
          r="4"
          fill="#f59e0b"
        />
      </template>

      <!-- Knife Path Preview Lines -->
      <template v-if="operatorManager.activeOperator instanceof KnifeOperator">
        <!-- Confirmed Path Segments -->
        <line
          v-for="(pt, idx) in (operatorManager.activeOperator as KnifeOperator).points.slice(1)"
          :key="'kp_' + idx"
          :x1="(operatorManager.activeOperator as KnifeOperator).points[idx].screen.x"
          :y1="(operatorManager.activeOperator as KnifeOperator).points[idx].screen.y"
          :x2="pt.screen.x"
          :y2="pt.screen.y"
          stroke="#eab308"
          stroke-width="2"
        />
        <!-- Active Floating Segment to Cursor -->
        <line
          v-if="(operatorManager.activeOperator as KnifeOperator).points.length > 0 && (operatorManager.activeOperator as KnifeOperator).currentHoverPoint"
          :x1="(operatorManager.activeOperator as KnifeOperator).points[(operatorManager.activeOperator as KnifeOperator).points.length - 1].screen.x"
          :y1="(operatorManager.activeOperator as KnifeOperator).points[(operatorManager.activeOperator as KnifeOperator).points.length - 1].screen.y"
          :x2="(operatorManager.activeOperator as KnifeOperator).currentHoverPoint!.screen.x"
          :y2="(operatorManager.activeOperator as KnifeOperator).currentHoverPoint!.screen.y"
          stroke="#eab308"
          stroke-width="2"
          stroke-dasharray="4 3"
        />
        <!-- Snapped Target Indicator -->
        <circle
          v-if="(operatorManager.activeOperator as KnifeOperator).currentHoverPoint"
          :cx="(operatorManager.activeOperator as KnifeOperator).currentHoverPoint!.screen.x"
          :cy="(operatorManager.activeOperator as KnifeOperator).currentHoverPoint!.screen.y"
          r="5"
          :fill="(operatorManager.activeOperator as KnifeOperator).currentHoverPoint!.targetType === 'VERTEX' ? '#22c55e' : (operatorManager.activeOperator as KnifeOperator).currentHoverPoint!.targetType === 'MIDPOINT' ? '#06b6d4' : '#eab308'"
          stroke="#ffffff"
          stroke-width="1.5"
        />
      </template>
    </svg>

    <!-- Blender Perforated Marquee Box Selection Overlay (Marching Ants / Dashed Border) -->
    <svg 
      v-if="isMarqueeSelecting && marqueeRect.width > 2 && marqueeRect.height > 2" 
      class="absolute inset-0 w-full h-full pointer-events-none z-30"
    >
      <rect 
        :x="marqueeRect.x" 
        :y="marqueeRect.y" 
        :width="marqueeRect.width" 
        :height="marqueeRect.height" 
        fill="rgba(56, 189, 248, 0.14)"
        stroke="#38bdf8"
        stroke-width="1.5"
        stroke-dasharray="4 3"
      />
    </svg>

    <!-- One-Shot Box Select Mode Active Floating Badge -->
    <div 
      v-if="toolStore.isBoxSelectActive"
      class="absolute top-2.5 left-1/2 -translate-x-1/2 z-40 bg-[#181a20]/95 border border-amber-500/60 text-amber-300 px-3 py-1 rounded-xs shadow-2xl flex items-center gap-2 text-xs font-mono select-none backdrop-blur-xs"
    >
      <BlenderIcon name="marquee" :size="13" color="#f59e0b" />
      <span>Box Select: Drag to select</span>
      <span class="text-[10px] text-ui-textMuted">(Esc / Click &times; to cancel)</span>
      <button @click="toolStore.isBoxSelectActive = false" class="ml-1 text-slate-400 hover:text-white">&times;</button>
    </div>

    <!-- Blender Modal Operator Interactive HUD (Floating, Movable & Closable) -->
    <div 
      v-if="operatorManager.state.value.active"
      data-floating-panel
      class="fixed z-50 flex flex-col bg-ui-panel border border-ui-borderStrong rounded-xs shadow-2xl font-sans select-none pointer-events-auto max-w-[95vw] min-w-[360px] hud-panel"
      :style="{ left: `${hudPos.x}px`, top: `${hudPos.y}px` }"
    >
      <!-- Panel Header Bar (Draggable) -->
      <div 
        class="flex items-center justify-between px-2.5 py-1 bg-ui-header border-b border-ui-borderSubtle cursor-move rounded-t-xs text-xs text-ui-textMuted group"
        @pointerdown="startHudDrag"
        title="Drag to reposition HUD"
      >
        <div class="flex items-center gap-1.5">
          <GripHorizontal class="w-3.5 h-3.5 text-ui-textMuted group-hover:text-ui-textSecondary transition" />
          <span class="font-semibold text-ui-textPrimary text-[11px]">{{ operatorManager.state.value.operatorName }}</span>
        </div>
        <button 
          @click="operatorManager.cancel()"
          class="p-0.5 text-ui-textMuted hover:text-rose-400 hover:bg-rose-950/40 rounded-xs transition"
          title="Cancel Operation (Esc)"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>

      <!-- Panel Body: Status and Controls -->
      <div class="p-2 flex flex-col gap-2 bg-ui-panel text-xs rounded-b-xs">
        <!-- Live Status & Instruction Text -->
        <div class="text-[11px] text-ui-textSecondary font-mono bg-ui-input/70 px-2 py-1 rounded-xs border border-ui-borderSubtle">
          {{ operatorManager.state.value.statusText }}
        </div>

        <!-- Interactive Controls Row -->
        <div class="flex items-center justify-between gap-2 pt-0.5">
          <!-- Axis Constraint Group -->
          <div class="flex items-center bg-ui-input rounded-xs p-0.5 border border-ui-borderSubtle">
            <button 
              @click="triggerAxisConstraint('x')"
              class="px-1.5 py-0.5 rounded-xs text-[10px] font-bold text-rose-400 hover:bg-rose-500/20 active:scale-95 transition"
              title="Lock to X Axis (X)"
            >
              X
            </button>
            <button 
              @click="triggerAxisConstraint('y')"
              class="px-1.5 py-0.5 rounded-xs text-[10px] font-bold text-emerald-400 hover:bg-emerald-500/20 active:scale-95 transition"
              title="Lock to Y Axis (Y)"
            >
              Y
            </button>
            <button 
              @click="triggerAxisConstraint('z')"
              class="px-1.5 py-0.5 rounded-xs text-[10px] font-bold text-sky-400 hover:bg-sky-500/20 active:scale-95 transition"
              title="Lock to Z Axis (Z)"
            >
              Z
            </button>
          </div>

          <!-- Modifiers & Snapping Controls -->
          <div class="flex items-center gap-1">
            <button 
              @click="triggerToggleSnap"
              class="px-2 py-1 bg-ui-surface hover:bg-ui-hover border border-ui-borderSubtle rounded-xs text-[11px] text-ui-textSecondary font-medium active:scale-95 transition"
              title="Toggle Grid / Angle Snapping (Ctrl)"
            >
              Snap
            </button>

            <button 
              @click="triggerTogglePrecision"
              class="px-2 py-1 bg-ui-surface hover:bg-ui-hover border border-ui-borderSubtle rounded-xs text-[11px] text-ui-textSecondary font-medium active:scale-95 transition"
              title="Precision Mode (Shift)"
            >
              Slow
            </button>

            <button 
              v-if="operatorManager.state.value.operatorName === 'Inset'"
              @click="triggerInsetIndividual"
              class="px-2 py-1 bg-ui-surface hover:bg-ui-hover border border-ui-borderSubtle rounded-xs text-[11px] text-ui-textSecondary font-medium active:scale-95 transition"
              title="Individual faces (I)"
            >
              Individual
            </button>
            <button 
              v-if="operatorManager.state.value.operatorName === 'Inset'"
              @click="triggerInsetBoundary"
              class="px-2 py-1 bg-ui-surface hover:bg-ui-hover border border-ui-borderSubtle rounded-xs text-[11px] text-ui-textSecondary font-medium active:scale-95 transition"
              title="Inset mesh boundary edges (B)"
            >
              Boundary
            </button>
            <button 
              v-if="operatorManager.state.value.operatorName === 'Inset'"
              @click="triggerInsetOutset"
              class="px-2 py-1 bg-ui-surface hover:bg-ui-hover border border-ui-borderSubtle rounded-xs text-[11px] text-ui-textSecondary font-medium active:scale-95 transition"
              title="Outset (O)"
            >
              Outset
            </button>
            <button 
              v-if="operatorManager.state.value.operatorName.includes('Primitive')"
              @click="triggerToggleOrientation"
              class="px-2 py-1 bg-ui-surface hover:bg-ui-hover border border-ui-borderSubtle rounded-xs text-[11px] text-amber-400 font-medium active:scale-95 transition"
              title="Toggle Align to World vs Surface (O)"
            >
              Align
            </button>

            <button 
              @click="triggerStepBack"
              class="px-2 py-1 bg-ui-surface hover:bg-ui-hover border border-ui-borderSubtle rounded-xs text-[11px] text-ui-textMuted hover:text-ui-textPrimary active:scale-95 transition"
              title="Step Back / Cancel Stage (RMB)"
            >
              Back
            </button>
          </div>

          <!-- Action Buttons -->
          <div class="flex items-center gap-1.5 pl-1.5 border-l border-ui-borderSubtle">
            <button 
              @click="operatorManager.confirm()" 
              class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs rounded-xs shadow-xs flex items-center gap-1 active:scale-95 transition border border-emerald-500/80"
              title="Confirm Operation (LMB / Enter)"
            >
              <Check class="w-3.5 h-3.5" />
              <span>Confirm</span>
            </button>

            <button 
              @click="operatorManager.cancel()" 
              class="px-2 py-1 bg-ui-surface hover:bg-rose-950/60 hover:text-rose-300 text-ui-textMuted border border-ui-borderSubtle text-xs rounded-xs active:scale-95 transition"
              title="Cancel Operation (Esc)"
            >
              <X class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Middle Mouse Button (MMB) / W Key Context Specials Menu (Floating at Cursor) -->
    <div 
      v-if="showSpecialsMenu"
      class="fixed z-50 bg-[#181a20]/95 border border-ui-borderStrong rounded-xs shadow-2xl p-1 font-mono text-xs select-none backdrop-blur-md min-w-[210px] animate-in fade-in zoom-in-95 duration-100"
      :style="{ left: `${specialsMenuPos.x}px`, top: `${specialsMenuPos.y}px` }"
      @click.stop
    >
      <div class="px-2 py-1 bg-ui-header border-b border-ui-borderSubtle text-[10px] text-amber-400 font-bold uppercase tracking-wider flex items-center justify-between">
        <span>{{ toolStore.selectMode.toUpperCase() }} SPECIALS</span>
        <button @click="showSpecialsMenu = false" class="text-ui-textMuted hover:text-white">&times;</button>
      </div>

      <div class="py-1 divide-y divide-ui-borderSubtle/40">
        <!-- VERTEX SPECIALS -->
        <template v-if="toolStore.selectMode === 'vertex'">
          <div class="py-0.5">
            <button @click="execSpecial('connect-path')" class="w-full text-left px-2 py-1 hover:bg-ui-hover rounded-xs flex items-center justify-between text-ui-textPrimary">
              <span>Connect Path</span>
              <span class="text-[10px] text-amber-400 font-bold">J</span>
            </button>
            <button @click="execSpecial('merge-center')" class="w-full text-left px-2 py-1 hover:bg-ui-hover rounded-xs flex items-center justify-between text-ui-textPrimary">
              <span>Merge Vertices</span>
              <span class="text-[10px] text-amber-400 font-bold">M</span>
            </button>
            <button @click="execSpecial('bevel')" class="w-full text-left px-2 py-1 hover:bg-ui-hover rounded-xs flex items-center justify-between text-ui-textPrimary">
              <span>Bevel Vertices</span>
              <span class="text-[10px] text-ui-textMuted font-mono">Shift+Ctrl+B</span>
            </button>
            <button @click="execSpecial('fill-face')" class="w-full text-left px-2 py-1 hover:bg-ui-hover rounded-xs flex items-center justify-between text-ui-textPrimary">
              <span>New Face from Verts</span>
              <span class="text-[10px] text-amber-400 font-bold">F</span>
            </button>
          </div>
          <div class="pt-1">
            <button @click="execSpecial('delete')" class="w-full text-left px-2 py-1 hover:bg-rose-950/40 text-rose-400 rounded-xs flex items-center justify-between">
              <span>Delete Vertices</span>
              <span class="text-[10px] font-bold">X</span>
            </button>
          </div>
        </template>

        <!-- EDGE SPECIALS -->
        <template v-else-if="toolStore.selectMode === 'edge'">
          <div class="py-0.5">
            <button @click="execSpecial('subdivide')" class="w-full text-left px-2 py-1 hover:bg-ui-hover rounded-xs flex items-center justify-between text-ui-textPrimary">
              <span>Subdivide</span>
            </button>
            <button @click="execSpecial('loopcut')" class="w-full text-left px-2 py-1 hover:bg-ui-hover rounded-xs flex items-center justify-between text-ui-textPrimary">
              <span>Loop Cut and Slide</span>
              <span class="text-[10px] text-amber-400 font-bold">Ctrl+R</span>
            </button>
            <button @click="execSpecial('bevel')" class="w-full text-left px-2 py-1 hover:bg-ui-hover rounded-xs flex items-center justify-between text-ui-textPrimary">
              <span>Bevel Edges</span>
              <span class="text-[10px] text-amber-400 font-bold">Ctrl+B</span>
            </button>
            <button @click="execSpecial('fill-face')" class="w-full text-left px-2 py-1 hover:bg-ui-hover rounded-xs flex items-center justify-between text-ui-textPrimary">
              <span>Bridge / Fill Face</span>
              <span class="text-[10px] text-amber-400 font-bold">F</span>
            </button>
          </div>
          <div class="pt-1">
            <button @click="execSpecial('delete')" class="w-full text-left px-2 py-1 hover:bg-rose-950/40 text-rose-400 rounded-xs flex items-center justify-between">
              <span>Delete Edges</span>
              <span class="text-[10px] font-bold">X</span>
            </button>
          </div>
        </template>

        <!-- FACE SPECIALS -->
        <template v-else-if="toolStore.selectMode === 'face'">
          <div class="py-0.5">
            <button @click="execSpecial('extrude')" class="w-full text-left px-2 py-1 hover:bg-ui-hover rounded-xs flex items-center justify-between text-ui-textPrimary">
              <span>Extrude Faces</span>
              <span class="text-[10px] text-amber-400 font-bold">E</span>
            </button>
            <button @click="execSpecial('extrude-individual')" class="w-full text-left px-2 py-1 hover:bg-ui-hover rounded-xs flex items-center justify-between text-ui-textPrimary">
              <span>Extrude Individual</span>
              <span class="text-[10px] text-amber-400 font-bold">Alt+E</span>
            </button>
            <button @click="execSpecial('inset')" class="w-full text-left px-2 py-1 hover:bg-ui-hover rounded-xs flex items-center justify-between text-ui-textPrimary">
              <span>Inset Faces</span>
              <span class="text-[10px] text-amber-400 font-bold">I</span>
            </button>
            <button @click="execSpecial('poke')" class="w-full text-left px-2 py-1 hover:bg-ui-hover rounded-xs flex items-center justify-between text-ui-textPrimary">
              <span>Poke Face (Centroid)</span>
            </button>
            <button @click="execSpecial('flip-normals')" class="w-full text-left px-2 py-1 hover:bg-ui-hover rounded-xs flex items-center justify-between text-ui-textPrimary">
              <span>Flip Normals</span>
              <span class="text-[10px] text-ui-textMuted font-mono">Shift+N</span>
            </button>
          </div>
          <div class="pt-1">
            <button @click="execSpecial('delete')" class="w-full text-left px-2 py-1 hover:bg-rose-950/40 text-rose-400 rounded-xs flex items-center justify-between">
              <span>Delete Faces</span>
              <span class="text-[10px] font-bold">X</span>
            </button>
          </div>
        </template>

        <!-- OBJECT SPECIALS -->
        <template v-else-if="toolStore.selectMode === 'object'">
          <div class="py-0.5">
            <button @click="execSpecial('origin-geometry')" class="w-full text-left px-2 py-1 hover:bg-ui-hover rounded-xs flex items-center justify-between text-ui-textPrimary">
              <span>Set Origin to Geometry</span>
            </button>
            <button @click="execSpecial('origin-cursor')" class="w-full text-left px-2 py-1 hover:bg-ui-hover rounded-xs flex items-center justify-between text-ui-textPrimary">
              <span>Set Origin to 3D Cursor</span>
            </button>
            <button @click="execSpecial('duplicate')" class="w-full text-left px-2 py-1 hover:bg-ui-hover rounded-xs flex items-center justify-between text-ui-textPrimary">
              <span>Duplicate Objects</span>
              <span class="text-[10px] text-amber-400 font-bold">Shift+D</span>
            </button>
            <button @click="execSpecial('join')" class="w-full text-left px-2 py-1 hover:bg-ui-hover rounded-xs flex items-center justify-between text-ui-textPrimary">
              <span>Join Meshes</span>
              <span class="text-[10px] text-amber-400 font-bold">Ctrl+J</span>
            </button>
            <button @click="execSpecial('separate')" class="w-full text-left px-2 py-1 hover:bg-ui-hover rounded-xs flex items-center justify-between text-ui-textPrimary">
              <span>Separate Selection</span>
              <span class="text-[10px] text-amber-400 font-bold">P</span>
            </button>
          </div>
          <div class="pt-1">
            <button @click="execSpecial('delete')" class="w-full text-left px-2 py-1 hover:bg-rose-950/40 text-rose-400 rounded-xs flex items-center justify-between">
              <span>Delete Object</span>
              <span class="text-[10px] font-bold">X / Del</span>
            </button>
          </div>
        </template>

        <!-- BONE SPECIALS -->
        <template v-else-if="toolStore.selectMode === 'bone'">
          <div class="py-0.5">
            <button @click="execSpecial('extrude-bone')" class="w-full text-left px-2 py-1 hover:bg-ui-hover rounded-xs flex items-center justify-between text-ui-textPrimary">
              <span>Extrude Bone</span>
              <span class="text-[10px] text-amber-400 font-bold">E</span>
            </button>
            <button @click="execSpecial('subdivide-bone')" class="w-full text-left px-2 py-1 hover:bg-ui-hover rounded-xs flex items-center justify-between text-ui-textPrimary">
              <span>Subdivide Bone</span>
            </button>
            <button @click="execSpecial('symmetrize-bone')" class="w-full text-left px-2 py-1 hover:bg-ui-hover rounded-xs flex items-center justify-between text-ui-textPrimary">
              <span>Symmetrize Armature</span>
            </button>
          </div>
          <div class="pt-1">
            <button @click="execSpecial('delete-bone')" class="w-full text-left px-2 py-1 hover:bg-rose-950/40 text-rose-400 rounded-xs flex items-center justify-between">
              <span>Delete Bone</span>
              <span class="text-[10px] font-bold">X</span>
            </button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
