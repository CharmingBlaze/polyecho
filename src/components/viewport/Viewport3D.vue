<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { useProjectStore } from '../../stores/projectStore'
import { useToolStore } from '../../stores/toolStore'
import { useAnimationStore } from '../../stores/animationStore'
import { useThemeStore, type ThemeColors } from '../../stores/themeStore'
import { meshToThreeGeometry, computeBoneWorldMatrix } from '../../core/geometry/Converters'
import { solveCCDIK } from '../../core/animation/IKSolver'
import { sampleTrack } from '../../core/animation/Armature'
import { SpringPhysicsSolver } from '../../core/animation/SpringPhysics'
import { createPSXMaterial } from '../../core/shaders/PSXShader'
import { computeCentroid } from '../../utils/math'
import { getMeshEdges } from '../../core/geometry/EdgeUtils'
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
import { PrimitiveType } from '../../core/primitives/PrimitiveTypes'
import { EditableMesh } from '../../core/mesh/MeshKernel'
import { MeshBridge } from '../../core/mesh/MeshBridge'
import { EditorEnvironment } from '../../core/render/EditorEnvironment'
import { ViewportLayerManager } from '../../core/render/ViewportLayers'
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

const projectStore = useProjectStore()
const toolStore = useToolStore()
const animationStore = useAnimationStore()
const themeStore = useThemeStore()

const containerRef = ref<HTMLDivElement | null>(null)

let scene: THREE.Scene
let renderer: THREE.WebGLRenderer
let animationFrameId: number
let resizeObserver: ResizeObserver | null = null

// Viewport Cameras
let cameraPersp: THREE.PerspectiveCamera
let cameraTop: THREE.OrthographicCamera
let cameraFront: THREE.OrthographicCamera
let cameraRight: THREE.OrthographicCamera
let activeCamera: THREE.Camera

let orbitControls: OrbitControls
let transformControls: TransformControls

let gridHelper: THREE.GridHelper
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
let isGizmoDragging = false
let pointerDownClientPos = { x: 0, y: 0 }
let lastHoverClientPos = { x: 0, y: 0 }
let pointerDownHitMesh = false

// Active Quadrant: 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right' | 'main'
const activeQuadrant = ref<'top_left' | 'top_right' | 'bottom_left' | 'bottom_right' | 'main'>('main')

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

function initThree() {
  if (!containerRef.value) return

  const width = containerRef.value.clientWidth || window.innerWidth
  const height = containerRef.value.clientHeight || window.innerHeight

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

  // Renderer with Soft Shadows
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.toneMapping = THREE.NoToneMapping
  renderer.autoClear = false
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  containerRef.value.appendChild(renderer.domElement)

  // Orbit Controls (Strictly for Perspective Camera)
  orbitControls = new OrbitControls(cameraPersp, renderer.domElement)
  orbitControls.enableDamping = true
  orbitControls.dampingFactor = 0.08
  orbitControls.zoomSpeed = toolStore.viewport.invertZoom ? -1.0 : 1.0
  orbitControls.target.set(0, 0.5, 0)

  // Transform Controls
  transformControls = new TransformControls(cameraPersp, renderer.domElement)
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
    } else if (!toolStore.viewport.quadView || activeQuadrant.value === 'top_right') {
      orbitControls.enabled = true
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

  // Pass 2: Internal Editor Lighting & Soft Shadow Environment Rig
  editorEnv = new EditorEnvironment(scene, layers.shadowGroup)

  // Pass 3: Grid & Axes
  gridHelper = new THREE.GridHelper(
    20, 
    20, 
    new THREE.Color(themeStore.activeColors.gridMajor), 
    new THREE.Color(themeStore.activeColors.gridMinor)
  )
  gridHelper.position.y = -0.001
  layers.gridGroup.add(gridHelper)

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

  // ResizeObserver
  if (window.ResizeObserver && containerRef.value) {
    resizeObserver = new ResizeObserver(() => {
      onWindowResize()
    })
    resizeObserver.observe(containerRef.value)
  }

  // Events (Using Capture Phase to prevent OrbitControls from rotating camera when drawing on 3D meshes)
  renderer.domElement.addEventListener('pointerdown', onPointerDown, { capture: true })
  renderer.domElement.addEventListener('pointermove', onPointerMove, { capture: true })
  renderer.domElement.addEventListener('pointerup', onPointerUp, { capture: true })
  renderer.domElement.addEventListener('pointerleave', onPointerUp, { capture: true })
  renderer.domElement.addEventListener('wheel', onWheel, { passive: false })
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
    depthTest: false
  })
  hoverEdgeMesh = new THREE.Line(new THREE.BufferGeometry(), edgeMat)
  hoverEdgeMesh.visible = false
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

function getThreeTexture(textureId?: string | null): THREE.CanvasTexture {
  const targetTex = (textureId ? projectStore.textures.find(t => t.id === textureId) : null) || projectStore.activeTexture || projectStore.textures[0]
  if (!targetTex || !targetTex.pixelBuffer) {
    if (!threeTexture) {
      threeTexture = new THREE.CanvasTexture(projectStore.pixelBuffer.canvas)
      threeTexture.magFilter = THREE.NearestFilter
      threeTexture.minFilter = THREE.NearestFilter
      threeTexture.generateMipmaps = false
    }
    return threeTexture
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

function initTexture() {
  updateThreeTextures()
  if (!psxMaterial) {
    psxMaterial = createPSXMaterial(threeTexture, new THREE.Vector2(320, 240))
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
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
        child.geometry.dispose()
      }
    }
  }

  const isXRay = toolStore.viewport.xray

  for (const meshObj of projectStore.meshes) {
    if (!meshObj.visible) continue

    const isSelectedMesh = projectStore.selectedMeshIds.includes(meshObj.id)
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

    const isSmooth = (meshObj.shadeMode || toolStore.viewport.shadeMode) === 'smooth'
    const meshMatObj = projectStore.materials.find(m => m.id === meshObj.materialId) || projectStore.materials[0]
    const meshTex = getThreeTexture(meshMatObj?.textureId)
    const baseColor = new THREE.Color(meshMatObj?.color || '#ffffff')

    let mat: THREE.Material
    if (isWeightPaint) {
      mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.65,
        metalness: 0.05,
        side: THREE.DoubleSide,
        flatShading: !isSmooth,
        transparent: isXRay,
        opacity: isXRay ? 0.65 : 1.0,
        depthWrite: !isXRay
      })
    } else if (toolStore.viewport.shading === 'psx' && psxMaterial) {
      psxMaterial.uniforms.uJitterAmount.value = toolStore.viewport.psxJitter ? 1.0 : 0.0
      psxMaterial.uniforms.uAffineEnabled.value = toolStore.viewport.psxAffine
      psxMaterial.uniforms.uDitherEnabled.value = toolStore.viewport.dither
      psxMaterial.uniforms.uTexture.value = meshTex
      mat = psxMaterial
    } else if (toolStore.viewport.shading === 'textured' || meshMatObj?.shading === 'textured') {
      mat = new THREE.MeshStandardMaterial({
        map: meshTex,
        color: baseColor,
        roughness: meshMatObj?.roughness !== undefined ? meshMatObj.roughness : 0.8,
        metalness: meshMatObj?.metalness !== undefined ? meshMatObj.metalness : 0.05,
        vertexColors: true,
        side: THREE.DoubleSide,
        flatShading: !isSmooth,
        transparent: isXRay,
        opacity: isXRay ? 0.55 : 1.0,
        depthWrite: !isXRay
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
      mat = new THREE.MeshStandardMaterial({
        color: baseColor,
        roughness: meshMatObj?.roughness !== undefined ? meshMatObj.roughness : 0.75,
        metalness: meshMatObj?.metalness !== undefined ? meshMatObj.metalness : 0.1,
        vertexColors: true,
        side: THREE.DoubleSide,
        flatShading: !isSmooth,
        transparent: isXRay,
        opacity: isXRay ? 0.55 : 1.0,
        depthWrite: !isXRay
      })
    }

    // PASS 1: Base Model Geometry
    const threeMesh = new THREE.Mesh(geometry, mat)
    threeMesh.name = meshObj.id
    threeMesh.castShadow = true
    threeMesh.receiveShadow = true

    let finalPos = new THREE.Vector3(meshObj.position.x, meshObj.position.y, meshObj.position.z)
    let finalEuler = new THREE.Euler(
      THREE.MathUtils.degToRad(meshObj.rotation.x),
      THREE.MathUtils.degToRad(meshObj.rotation.y),
      THREE.MathUtils.degToRad(meshObj.rotation.z)
    )
    let finalScale = new THREE.Vector3(meshObj.scale.x, meshObj.scale.y, meshObj.scale.z)

    if (meshObj.parentId && isPoseMode) {
      const parentBone = animationStore.armature.bones.find(b => b.id === meshObj.parentId)
      if (parentBone) {
        const boneMat = computeBoneWorldMatrix(parentBone, animationStore.armature.bones)
        finalPos = finalPos.clone().applyMatrix4(boneMat)
        const bRot = new THREE.Euler(
          THREE.MathUtils.degToRad(parentBone.rotation.x),
          THREE.MathUtils.degToRad(parentBone.rotation.y),
          THREE.MathUtils.degToRad(parentBone.rotation.z)
        )
        finalEuler.x += bRot.x
        finalEuler.y += bRot.y
        finalEuler.z += bRot.z
        finalScale.multiply(new THREE.Vector3(parentBone.scale.x, parentBone.scale.y, parentBone.scale.z))
      } else {
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

    threeMesh.position.copy(finalPos)
    threeMesh.rotation.copy(finalEuler)
    threeMesh.scale.copy(finalScale)
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

    // PASS 5: Wireframe overlay
    if ((toolStore.appMode === 'model' || isXRay) && toolStore.viewport.shading !== 'wireframe') {
      const wireMat = new THREE.LineBasicMaterial({ 
        color: isSelectedMesh ? 0x6366f1 : 0x475569, 
        depthTest: !isXRay,
        transparent: true,
        opacity: toolStore.viewport.wireframeOpacity !== undefined ? toolStore.viewport.wireframeOpacity : (isXRay ? 0.85 : 1.0)
      })
      const wire = new THREE.LineSegments(wireframeGeometry, wireMat)
      wire.name = `${meshObj.id}_wire`
      wire.position.copy(threeMesh.position)
      wire.rotation.copy(threeMesh.rotation)
      wire.scale.copy(threeMesh.scale)
      layers.wireframeGroup.add(wire)
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

    const isSelectionAllowed = toolStore.appMode === 'model' || (toolStore.appMode === 'uvpaint' && toolStore.uvWorkspaceTab === 'uv')

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
    }

    // PASS 5: Edge Mode Overlay
    if (isSelectionAllowed && toolStore.selectMode === 'edge' && isSelectedMesh) {
      if (selectedEdgesGeometry.attributes.position) {
        const selEdgeMat = new THREE.LineBasicMaterial({
          color: 0xf59e0b,
          linewidth: 4,
          depthTest: false
        })
        const selEdgeMesh = new THREE.LineSegments(selectedEdgesGeometry, selEdgeMat)
        selEdgeMesh.name = `${meshObj.id}_seledges`
        selEdgeMesh.position.copy(threeMesh.position)
        selEdgeMesh.rotation.copy(threeMesh.rotation)
        selEdgeMesh.scale.copy(threeMesh.scale)
        layers.wireframeGroup.add(selEdgeMesh)
      }

      const edgeMat = new THREE.LineBasicMaterial({ color: 0x06b6d4, linewidth: 2, depthTest: false })
      const edges = new THREE.LineSegments(edgeLinesGeometry, edgeMat)
      edges.name = `${meshObj.id}_edges`
      edges.position.copy(threeMesh.position)
      edges.rotation.copy(threeMesh.rotation)
      edges.scale.copy(threeMesh.scale)
      edges.userData = { meshId: meshObj.id }
      layers.wireframeGroup.add(edges)
    }

    // PASS 5: Vertex Mode Overlay
    if (isSelectionAllowed && toolStore.selectMode === 'vertex' && isSelectedMesh) {
      const pMat = new THREE.PointsMaterial({ size: 10, vertexColors: true, sizeAttenuation: false, depthTest: false })
      const pts = new THREE.Points(vertexPointsGeometry, pMat)
      pts.name = `${meshObj.id}_pts`
      pts.position.copy(threeMesh.position)
      pts.rotation.copy(threeMesh.rotation)
      pts.scale.copy(threeMesh.scale)
      pts.userData = { meshId: meshObj.id, vertexIndexMap }
      layers.wireframeGroup.add(pts)
    }

    // PASS 6: Blockbench Origin / Pivot Point Marker
    if (toolStore.appMode === 'model' && isSelectedMesh) {
      const isOriginMode = toolStore.selectMode === 'origin'
      const originMat = new THREE.MeshBasicMaterial({
        color: isOriginMode ? 0xf59e0b : 0x38bdf8,
        depthTest: false
      })
      const originGeom = new THREE.OctahedronGeometry(isOriginMode ? 0.12 : 0.08)
      const originMesh = new THREE.Mesh(originGeom, originMat)
      originMesh.name = `${meshObj.id}_origin`
      originMesh.position.set(meshObj.position.x, meshObj.position.y, meshObj.position.z)
      originMesh.renderOrder = 998
      layers.gizmoGroup.add(originMesh)

      const crosshairGeom = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([
        -0.2, 0, 0, 0.2, 0, 0,
        0, -0.2, 0, 0, 0.2, 0,
        0, 0, -0.2, 0, 0, 0.2
      ], 3))
      const crosshairMat = new THREE.LineBasicMaterial({
        color: isOriginMode ? 0xfef08a : 0x06b6d4,
        depthTest: false
      })
      const crosshair = new THREE.LineSegments(crosshairGeom, crosshairMat)
      crosshair.position.copy(originMesh.position)
      crosshair.renderOrder = 998
      layers.gizmoGroup.add(crosshair)
    }
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
        const { geometry } = meshToThreeGeometry(
          meshObj,
          [],
          [],
          'flat',
          { isPoseMode: true, bones: ghostBones }
        )

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

function rebuildBones() {
  while (boneGroup.children.length > 0) {
    const obj = boneGroup.children[0]
    boneGroup.remove(obj)
  }

  if (!animationStore.showBones) {
    boneGroup.visible = false
    return
  }
  boneGroup.visible = true

  const isPoseMode = toolStore.appMode === 'animate' || (toolStore.appMode === 'rig' && animationStore.isTestPoseActive)
  const isXRay = animationStore.xrayBones !== false

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

    const isSelected = bone.id === animationStore.selectedBoneId

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
      opacity: isSelected ? 0.75 : 0.4,
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
  if (isGizmoDragging) return

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
  } else if (toolStore.selectMode === 'object') {
    if (projectStore.selectedMeshIds.length > 1) {
      const selectedMeshes = projectStore.meshes.filter(m => projectStore.selectedMeshIds.includes(m.id))
      const centroid = computeCentroid(selectedMeshes.map(m => m.position))
      transformProxy.position.set(centroid.x, centroid.y, centroid.z)
      transformProxy.rotation.set(0, 0, 0)
      transformProxy.scale.set(1, 1, 1)
    } else {
      transformProxy.position.set(activeMesh.position.x, activeMesh.position.y, activeMesh.position.z)
      transformProxy.rotation.set(
        THREE.MathUtils.degToRad(activeMesh.rotation.x),
        THREE.MathUtils.degToRad(activeMesh.rotation.y),
        THREE.MathUtils.degToRad(activeMesh.rotation.z)
      )
      transformProxy.scale.set(activeMesh.scale.x, activeMesh.scale.y, activeMesh.scale.z)
    }
    transformProxy.updateMatrixWorld()
    transformControls.attach(transformProxy)
  } else if (toolStore.selectMode === 'vertex' && projectStore.selectedVertexIds.length > 0) {
    const selectedVerts = activeMesh.vertices.filter(v => projectStore.selectedVertexIds.includes(v.id))
    const centroid = computeCentroid(selectedVerts.map(v => v.position))
    transformProxy.position.set(
      activeMesh.position.x + centroid.x,
      activeMesh.position.y + centroid.y,
      activeMesh.position.z + centroid.z
    )
    transformProxy.rotation.set(0, 0, 0)
    transformProxy.scale.set(1, 1, 1)
    transformProxy.updateMatrixWorld()
    transformControls.attach(transformProxy)
  } else if (toolStore.selectMode === 'edge' && projectStore.selectedEdgeIds.length > 0) {
    const allEdges = getMeshEdges(activeMesh)
    const vertMap = new Map(activeMesh.vertices.map(v => [v.id, v]))
    const targetVerts: Vector3D[] = []
    for (const e of allEdges) {
      if (projectStore.selectedEdgeIds.includes(e.id)) {
        const v1 = vertMap.get(e.v1)
        const v2 = vertMap.get(e.v2)
        if (v1) targetVerts.push(v1.position)
        if (v2) targetVerts.push(v2.position)
      }
    }
    const centroid = computeCentroid(targetVerts)
    transformProxy.position.set(
      activeMesh.position.x + centroid.x,
      activeMesh.position.y + centroid.y,
      activeMesh.position.z + centroid.z
    )
    transformProxy.rotation.set(0, 0, 0)
    transformProxy.scale.set(1, 1, 1)
    transformProxy.updateMatrixWorld()
    transformControls.attach(transformProxy)
  } else if (toolStore.selectMode === 'face' && projectStore.selectedFaceIds.length > 0) {
    const selectedFaces = activeMesh.faces.filter(f => projectStore.selectedFaceIds.includes(f.id))
    const vertMap = new Map(activeMesh.vertices.map(v => [v.id, v]))
    const targetVerts: Vector3D[] = []
    for (const f of selectedFaces) {
      for (const vid of f.vertexIds) {
        const v = vertMap.get(vid)
        if (v) targetVerts.push(v.position)
      }
    }
    const centroid = computeCentroid(targetVerts)
    transformProxy.position.set(
      activeMesh.position.x + centroid.x,
      activeMesh.position.y + centroid.y,
      activeMesh.position.z + centroid.z
    )
    transformProxy.rotation.set(0, 0, 0)
    transformProxy.scale.set(1, 1, 1)
    transformProxy.updateMatrixWorld()
    transformControls.attach(transformProxy)
  } else {
    transformControls.detach()
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
    if (gridHelper) {
      layers.gridGroup.remove(gridHelper)
      gridHelper.geometry.dispose()
    }
    gridHelper = new THREE.GridHelper(
      20, 
      20, 
      new THREE.Color(colors.gridMajor), 
      new THREE.Color(colors.gridMinor)
    )
    gridHelper.position.y = -0.001
    layers.gridGroup.add(gridHelper)

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
    for (const v of activeMesh.vertices) {
      dragStartVertexMap.set(v.id, new THREE.Vector3(
        activeMesh.position.x + v.position.x,
        activeMesh.position.y + v.position.y,
        activeMesh.position.z + v.position.z
      ))
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
    rebuildMeshes()
    return
  }

  if (toolStore.appMode === 'rig') {
    const bone = animationStore.selectedBone
    if (bone) {
      if (animationStore.isTestPoseActive) {
        if (transformControls.getMode() === 'translate' && (bone.parentId || bone.childrenIds.length > 0)) {
          solveCCDIK(bone.id, transformProxy.position, animationStore.armature.bones, 2)
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
        rebuildMeshes()
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
      rebuildMeshes()
      return
    }
  }

  if (toolStore.appMode === 'animate') {
    const bone = animationStore.selectedBone
    if (bone) {
      if (transformControls.getMode() === 'translate' && (bone.parentId || bone.childrenIds.length > 0)) {
        solveCCDIK(bone.id, transformProxy.position, animationStore.armature.bones, 2)
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
      rebuildMeshes()
      if (animationStore.autoKey) {
        animationStore.recordCurrentKeyframe()
      }
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

      if (animationStore.autoKey) {
        animationStore.recordCurrentKeyframe()
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
      wireframeGeometry
    } = meshToThreeGeometry(activeMesh)

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

    for (const v of activeMesh.vertices) {
      if (targetVertIds.has(v.id)) {
        const startWorld = dragStartVertexMap.get(v.id)
        if (startWorld) {
          const transformedWorld = startWorld.clone().applyMatrix4(deltaMatrix)
          let px = transformedWorld.x - activeMesh.position.x
          let py = transformedWorld.y - activeMesh.position.y
          let pz = transformedWorld.z - activeMesh.position.z

          if (activeMesh.mirror?.enabled && activeMesh.mirror.clipping) {
            if (activeMesh.mirror.axisX) {
              const startX = startWorld.x - activeMesh.position.x
              if (startX >= 0 && px < 0) px = 0
              if (startX <= 0 && px > 0) px = 0
            }
            if (activeMesh.mirror.axisY) {
              const startY = startWorld.y - activeMesh.position.y
              if (startY >= 0 && py < 0) py = 0
              if (startY <= 0 && py > 0) py = 0
            }
            if (activeMesh.mirror.axisZ) {
              const startZ = startWorld.z - activeMesh.position.z
              if (startZ >= 0 && pz < 0) pz = 0
              if (startZ <= 0 && pz > 0) pz = 0
            }
          }

          v.position.x = px
          v.position.y = py
          v.position.z = pz
        }
      }
    }

    // Live X-Symmetry Mirroring
    if (toolStore.viewport.symmetryX) {
      for (const v of activeMesh.vertices) {
        if (!targetVertIds.has(v.id)) {
          const startV = dragStartVertexMap.get(v.id)
          if (!startV) continue
          for (const selId of targetVertIds) {
            const selStart = dragStartVertexMap.get(selId)
            if (selStart && Math.abs((startV.x - activeMesh.position.x) + (selStart.x - activeMesh.position.x)) < 0.05 && Math.abs(startV.y - selStart.y) < 0.05 && Math.abs(startV.z - selStart.z) < 0.05) {
              const selCurrent = activeMesh.vertices.find(vert => vert.id === selId)
              if (selCurrent) {
                v.position.x = -selCurrent.position.x
                v.position.y = selCurrent.position.y
                v.position.z = selCurrent.position.z
              }
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
      selectedEdgesGeometry 
    } = meshToThreeGeometry(
      activeMesh,
      toolStore.selectMode === 'face' ? projectStore.selectedFaceIds : [],
      toolStore.selectMode === 'edge' ? projectStore.selectedEdgeIds : []
    )

    const threeMesh = layers.modelGroup.getObjectByName(activeMesh.id) as THREE.Mesh
    if (threeMesh) {
      threeMesh.geometry.dispose()
      threeMesh.geometry = geometry
    }

    const wire = layers.wireframeGroup.getObjectByName(`${activeMesh.id}_wire`) as THREE.LineSegments
    if (wire) {
      wire.geometry.dispose()
      wire.geometry = wireframeGeometry
    }

    const pts = layers.wireframeGroup.getObjectByName(`${activeMesh.id}_pts`) as THREE.Points
    if (pts) {
      pts.geometry.dispose()
      pts.geometry = vertexPointsGeometry
    }

    const selFaces = layers.selectionGroup.getObjectByName(`${activeMesh.id}_selfaces`) as THREE.Mesh
    if (selFaces) {
      selFaces.geometry.dispose()
      selFaces.geometry = selectedFacesGeometry
    }

    const selEdges = layers.wireframeGroup.getObjectByName(`${activeMesh.id}_seledges`) as THREE.LineSegments
    if (selEdges) {
      selEdges.geometry.dispose()
      selEdges.geometry = selectedEdgesGeometry
    }
  }
}

function commitProxyTransform() {
  const activeMesh = projectStore.activeMesh
  if (!activeMesh) return

  projectStore.recordState('Transform')

  if (toolStore.appMode === 'animate') {
    if (animationStore.autoKey) {
      animationStore.recordCurrentKeyframe()
    }
  }

  isGizmoDragging = false
  rebuildMeshes()
}

// Screen-Space NDC calculations
function findClosestVertexScreen(mesh: MeshObject, maxDistNdc = 0.045): Vertex | null {
  let closestV: Vertex | null = null
  let minDist = maxDistNdc

  for (const v of mesh.vertices) {
    const worldPos = new THREE.Vector3(
      mesh.position.x + v.position.x,
      mesh.position.y + v.position.y,
      mesh.position.z + v.position.z
    )
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

function findClosestEdgeScreen(mesh: MeshObject, maxDistNdc = 0.035): Edge | null {
  const edges = getMeshEdges(mesh)
  const vertMap = new Map<string, Vertex>()
  for (const v of mesh.vertices) {
    vertMap.set(v.id, v)
  }

  let closestE: Edge | null = null
  let minDist = maxDistNdc

  for (const edge of edges) {
    const v1 = vertMap.get(edge.v1)
    const v2 = vertMap.get(edge.v2)
    if (!v1 || !v2) continue

    const p1 = new THREE.Vector3(mesh.position.x + v1.position.x, mesh.position.y + v1.position.y, mesh.position.z + v1.position.z).project(activeCamera)
    const p2 = new THREE.Vector3(mesh.position.x + v2.position.x, mesh.position.y + v2.position.y, mesh.position.z + v2.position.z).project(activeCamera)
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

  if (!toolStore.viewport.quadView) {
    activeCamera = cameraPersp
    activeQuadrant.value = 'main'
    orbitControls.enabled = !isGizmoActive
    mouse.x = (mousePxX / width) * 2 - 1
    mouse.y = -(mousePxY / height) * 2 + 1
    transformControls.camera = cameraPersp
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
      box.expandByPoint(new THREE.Vector3(m.position.x + v.position.x, m.position.y + v.position.y, m.position.z + v.position.z))
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
  if (!toolStore.viewport.quadView || !renderer) return
  const rect = renderer.domElement.getBoundingClientRect()
  const mousePxX = event.clientX - rect.left
  const mousePxY = event.clientY - rect.top
  const width = rect.width
  const height = rect.height

  const isLeft = mousePxX < width / 2
  const isTop = mousePxY < height / 2

  let cam: THREE.OrthographicCamera | null = null
  if (isLeft && isTop) cam = cameraTop
  else if (isLeft && !isTop) cam = cameraFront
  else if (!isLeft && !isTop) cam = cameraRight

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
  if (operatorManager.state.value.active) return

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

  if (toolStore.appMode === 'uvpaint' && (toolStore.uvWorkspaceTab === 'paint' || toolStore.uvWorkspaceTab === 'vertex')) {
    const hits = raycaster.intersectObjects(layers.modelGroup.children, true)
    if (hits.length > 0) {
      pointerDownHitMesh = true
      orbitControls.enabled = false
      isPaintingOn3D = true
      event.stopImmediatePropagation()
      event.preventDefault()
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
      const curBone = animationStore.selectedBone
      if (!curBone) {
        const rootBone = animationStore.addBoneFromPoints(
          { x: Number(hitPoint.x.toFixed(3)), y: Number(hitPoint.y.toFixed(3)), z: Number(hitPoint.z.toFixed(3)) },
          { x: Number(hitPoint.x.toFixed(3)), y: Number((hitPoint.y + 0.8).toFixed(3)), z: Number(hitPoint.z.toFixed(3)) },
          null,
          `Bone_${animationStore.armature.bones.length + 1}`
        )
        if (projectStore.activeMesh) {
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
        if (projectStore.activeMesh) {
          animationStore.autoWeightMeshToBones(projectStore.activeMesh)
        }
      }
      rebuildBones()
      rebuildMeshes()
      return
    }
  }

  if (toolStore.appMode === 'rig' || toolStore.appMode === 'animate' || animationStore.showBones || toolStore.selectMode === 'bone') {
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
        const bId = animationStore.selectedBoneId || (animationStore.armature.bones[0]?.id ?? '')
        if (bId) {
          animationStore.paintVertexWeightAtPoint(activeMesh.id, intersects[0].point, bId, animationStore.weightPaintTool)
          rebuildMeshes()
        }
        return
      }
    }
  }

  // Direct 3D Surface Paint Click / Drag Start
  const isPaintActive = (toolStore.appMode === 'uvpaint' && (toolStore.uvWorkspaceTab === 'paint' || toolStore.uvWorkspaceTab === 'vertex')) ||
    ['brush', 'eraser', 'picker', 'bucket', 'dither'].includes(toolStore.paintTool)
  if (event.button === 0 && isPaintActive && !event.altKey) {
    const intersects = raycaster.intersectObjects(layers.modelGroup.children, true)
    if (intersects.length > 0 && intersects[0].uv) {
      isPaintingOn3D = true
      pointerDownHitMesh = true
      orbitControls.enabled = false
      event.stopImmediatePropagation()
      event.preventDefault()
      lastPaintUV = null
      paintRaycastHit()
      return
    }
  }

  const isSelectionAllowed = toolStore.appMode === 'model' || (toolStore.appMode === 'uvpaint' && toolStore.uvWorkspaceTab === 'uv')
  const activeMesh = projectStore.activeMesh

  // 1. Edge Mode Selection
  if (isSelectionAllowed && toolStore.selectMode === 'edge' && activeMesh) {
    const edge = findClosestEdgeScreen(activeMesh)
    if (edge) {
      pointerDownHitMesh = true
      if (event.shiftKey) {
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
      if (event.shiftKey) {
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
        if (event.shiftKey) {
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
  if (operatorManager.state.value.active) return
  lastHoverClientPos = { x: event.clientX, y: event.clientY }
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

    for (const v of activeMesh.vertices) {
      const worldPos = new THREE.Vector3(
        activeMesh.position.x + v.position.x,
        activeMesh.position.y + v.position.y,
        activeMesh.position.z + v.position.z
      )
      const screenPt = projectWorldToScreen(worldPos)
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

    for (const edge of allEdges) {
      const v1 = vertMap.get(edge.v1)
      const v2 = vertMap.get(edge.v2)
      if (!v1 || !v2) continue
      const p1 = projectWorldToScreen(new THREE.Vector3(activeMesh.position.x + v1.position.x, activeMesh.position.y + v1.position.y, activeMesh.position.z + v1.position.z))
      const p2 = projectWorldToScreen(new THREE.Vector3(activeMesh.position.x + v2.position.x, activeMesh.position.y + v2.position.y, activeMesh.position.z + v2.position.z))
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

    for (const face of activeMesh.faces) {
      const faceVerts = face.vertexIds.map(id => vertMap.get(id)!).filter(Boolean)
      if (faceVerts.length === 0) continue

      let avgX = 0, avgY = 0, avgZ = 0
      let anyVertInside = false
      for (const v of faceVerts) {
        const p = projectWorldToScreen(new THREE.Vector3(activeMesh.position.x + v.position.x, activeMesh.position.y + v.position.y, activeMesh.position.z + v.position.z))
        if (isInsideBox(p.x, p.y)) anyVertInside = true
        avgX += activeMesh.position.x + v.position.x
        avgY += activeMesh.position.y + v.position.y
        avgZ += activeMesh.position.z + v.position.z
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
        const p = projectWorldToScreen(new THREE.Vector3(mesh.position.x + v.position.x, mesh.position.y + v.position.y, mesh.position.z + v.position.z))
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
  else if (toolStore.selectMode === 'bone' || toolStore.appMode === 'rig' || toolStore.appMode === 'animate') {
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
      const isSelectionAllowed = toolStore.appMode === 'model' || (toolStore.appMode === 'uvpaint' && toolStore.uvWorkspaceTab === 'uv')
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
    projectStore.recordState('Weight Paint Stroke')
    if (event) {
      event.stopImmediatePropagation()
    }
  }

  if (isPaintingOn3D) {
    isPaintingOn3D = false
    lastPaintUV = null
    orbitControls.enabled = true
    projectStore.recordState('3D Paint')
    if (event) {
      event.stopImmediatePropagation()
    }
  }
  if (isGizmoDragging || transformControls.dragging) {
    isGizmoDragging = false
    commitProxyTransform()
  }
  if (!toolStore.viewport.quadView || activeQuadrant.value === 'top_right') {
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
  if (toolStore.appMode !== 'model') return
  const activeMesh = projectStore.activeMesh

  // Bridge active mesh to EditableMesh kernel (or empty mesh if placing new primitive)
  const bridgeData = activeMesh 
    ? MeshBridge.meshObjectToEditableMesh(activeMesh)
    : { mesh: new EditableMesh(), strToNumVertId: new Map(), numToStrVertId: new Map(), strToNumFaceId: new Map(), numToStrFaceId: new Map() }
  const editableMesh = bridgeData.mesh

  // Derive selection IDs
  let selVertIds = projectStore.selectedVertexIds
    .map(id => bridgeData.strToNumVertId.get(id)!)
    .filter(id => id !== undefined)

  let selFaceIds = projectStore.selectedFaceIds
    .map(id => bridgeData.strToNumFaceId.get(id)!)
    .filter(id => id !== undefined)

  if (toolStore.selectMode === 'object') {
    selVertIds = Array.from(editableMesh.vertices.keys())
    selFaceIds = Array.from(editableMesh.faces.keys())
  } else if (selVertIds.length === 0 && selFaceIds.length === 0) {
    selFaceIds = Array.from(editableMesh.faces.keys())
    selVertIds = Array.from(editableMesh.vertices.keys())
  }

  // Determine viewport kind
  const vpKind = activeQuadrant.value === 'top_left' ? 'top' : (activeQuadrant.value === 'bottom_left' ? 'front' : (activeQuadrant.value === 'bottom_right' ? 'right' : 'persp'))

  const ctx: OperatorContext = {
    mesh: editableMesh,
    selectedVertIds: selVertIds,
    selectedFaceIds: selFaceIds,
    selectedEdgeIds: [],
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
    onUpdatePreview: () => {
      if (activeMesh) {
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
      if (activeMesh) {
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
    selectedEdgesGeometry 
  } = meshToThreeGeometry(
    activeMesh,
    toolStore.selectMode === 'face' ? projectStore.selectedFaceIds : [],
    toolStore.selectMode === 'edge' ? projectStore.selectedEdgeIds : [],
    toolStore.viewport.shadeMode
  )

  const threeMesh = layers.modelGroup.getObjectByName(activeMesh.id) as THREE.Mesh
  if (threeMesh) {
    threeMesh.geometry.dispose()
    threeMesh.geometry = geometry
    threeMesh.castShadow = true
    threeMesh.receiveShadow = true
  }

  const wire = layers.wireframeGroup.getObjectByName(`${activeMesh.id}_wire`) as THREE.LineSegments
  if (wire) {
    wire.geometry.dispose()
    wire.geometry = wireframeGeometry
  }

  const pts = layers.wireframeGroup.getObjectByName(`${activeMesh.id}_pts`) as THREE.Points
  if (pts) {
    pts.geometry.dispose()
    pts.geometry = vertexPointsGeometry
  }

  const selFaces = layers.selectionGroup.getObjectByName(`${activeMesh.id}_selfaces`) as THREE.Mesh
  if (selFaces) {
    selFaces.geometry.dispose()
    selFaces.geometry = selectedFacesGeometry
  }

  const selEdges = layers.wireframeGroup.getObjectByName(`${activeMesh.id}_seledges`) as THREE.LineSegments
  if (selEdges) {
    selEdges.geometry.dispose()
    selEdges.geometry = selectedEdgesGeometry
  }
}

function updateHoverState() {
  const isSelectionAllowed = toolStore.appMode === 'model' || (toolStore.appMode === 'uvpaint' && toolStore.uvWorkspaceTab === 'uv')
  const activeMesh = projectStore.activeMesh
  let hasHover = false

  if (isSelectionAllowed && toolStore.selectMode === 'vertex' && activeMesh) {
    const v = findClosestVertexScreen(activeMesh)
    if (v) {
      const geom = new THREE.BufferGeometry().setAttribute(
        'position', 
        new THREE.Float32BufferAttribute([
          activeMesh.position.x + v.position.x,
          activeMesh.position.y + v.position.y,
          activeMesh.position.z + v.position.z
        ], 3)
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
        const p1 = new THREE.Vector3(activeMesh.position.x + v1.position.x, activeMesh.position.y + v1.position.y, activeMesh.position.z + v1.position.z)
        const p2 = new THREE.Vector3(activeMesh.position.x + v2.position.x, activeMesh.position.y + v2.position.y, activeMesh.position.z + v2.position.z)
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

  if (isSelectionAllowed && toolStore.selectMode === 'face' && activeMesh) {
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
        for (let i = 1; i < faceVerts.length - 1; i++) {
          const v0 = faceVerts[0]
          const v1 = faceVerts[i]
          const v2 = faceVerts[i + 1]
          positions.push(
            activeMesh.position.x + v0.position.x, activeMesh.position.y + v0.position.y, activeMesh.position.z + v0.position.z,
            activeMesh.position.x + v1.position.x, activeMesh.position.y + v1.position.y, activeMesh.position.z + v1.position.z,
            activeMesh.position.x + v2.position.x, activeMesh.position.y + v2.position.y, activeMesh.position.z + v2.position.z
          )
        }

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

  if (toolStore.appMode === 'animate' || animationStore.showBones) {
    const boneHits = raycaster.intersectObjects(boneGroup.children, true)
    if (boneHits.length > 0) {
      for (const hit of boneHits) {
        if (hit.object.userData.boneId) {
          const bId = hit.object.userData.boneId
          const bone = animationStore.armature.bones.find(b => b.id === bId)
          if (bone) {
            hoverBoneMesh.position.set(bone.head.x, bone.head.y, bone.head.z)
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

  // 3D Paint & Weight Paint Projector Ring
  const isPaintHoverActive = (toolStore.appMode === 'rig' && animationStore.isWeightPaintActive) ||
    ((toolStore.appMode === 'uvpaint' || ['brush', 'eraser'].includes(toolStore.paintTool)) && (toolStore.uvWorkspaceTab === 'paint' || toolStore.uvWorkspaceTab === 'vertex' || toolStore.appMode !== 'uvpaint'))

  if (isPaintHoverActive && hoverWeightBrushRing) {
    const intersects = raycaster.intersectObjects(layers.modelGroup.children, true)
    if (intersects.length > 0 && intersects[0].point) {
      const hit = intersects[0]
      hoverWeightBrushRing.position.copy(hit.point)
      if (hit.face) {
        hoverWeightBrushRing.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), hit.face.normal)
      }
      const r = toolStore.appMode === 'rig' 
        ? (animationStore.weightBrushRadius || 0.5) 
        : Math.max(0.08, (toolStore.brushSize || 1) * 0.06)
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
    renderer.domElement.style.cursor = hasHover ? 'pointer' : 'crosshair'
  }
}

function paintRaycastHit() {
  const intersects = raycaster.intersectObjects(layers.modelGroup.children, true)
  if (intersects.length === 0) return
  const hit = intersects[0]

  // 1. Direct 3D Vertex Color Painting
  if (toolStore.paintTarget === 'vertex') {
    const meshObj = projectStore.meshes.find(m => m.id === hit.object.name)
    if (!meshObj || !hit.point) return

    const hitPt = hit.point
    const isPen = toolStore.currentPointerType === 'pen' && toolStore.stylusPressureEnabled
    const pressureScale = isPen ? (0.3 + toolStore.currentPressure * 0.7) : 1.0
    const radius = toolStore.vertexBrushRadius * pressureScale
    const falloff = toolStore.vertexBrushFalloff
    const paintColor = new THREE.Color(toolStore.vertexPaintColor)

    let changed = false
    for (const v of meshObj.vertices) {
      const worldPos = new THREE.Vector3(
        meshObj.position.x + v.position.x,
        meshObj.position.y + v.position.y,
        meshObj.position.z + v.position.z
      )
      const dist = worldPos.distanceTo(hitPt)
      if (dist <= radius) {
        const t = dist / radius
        const intensity = (falloff === 0 ? 1 : Math.max(0, 1 - Math.pow(t, 2 - falloff))) * (isPen ? toolStore.currentPressure : 1.0)

        const curColor = new THREE.Color(v.color || '#ffffff')
        curColor.lerp(paintColor, intensity)
        v.color = `#${curColor.getHexString()}`
        changed = true
      }
    }

    if (changed) {
      rebuildMeshes()
    }
    return
  }

  // 2. 2D Texture Pixel Painting
  if (hit.uv) {
    const uv = hit.uv
    const pb = projectStore.pixelBuffer
    const px = Math.floor(uv.x * pb.width)
    const py = Math.floor((1 - uv.y) * pb.height)

    const isPen = toolStore.currentPointerType === 'pen' && toolStore.stylusPressureEnabled
    const effectiveSize = isPen ? Math.max(1, Math.round(toolStore.brushSize * toolStore.currentPressure * 1.5)) : toolStore.brushSize

    if (toolStore.paintTool === 'brush') {
      if (lastPaintUV) {
        pb.paintLineAtUV(lastPaintUV.u, lastPaintUV.v, uv.x, uv.y, toolStore.primaryColor, effectiveSize, 'brush', toolStore.brushOpacity)
      } else {
        pb.drawBrush(px, py, toolStore.primaryColor, effectiveSize, toolStore.brushOpacity)
      }
      lastPaintUV = { u: uv.x, v: uv.y }
    } else if (toolStore.paintTool === 'eraser') {
      if (lastPaintUV) {
        pb.paintLineAtUV(lastPaintUV.u, lastPaintUV.v, uv.x, uv.y, toolStore.primaryColor, effectiveSize, 'eraser')
      } else {
        pb.erase(px, py, effectiveSize)
      }
      lastPaintUV = { u: uv.x, v: uv.y }
    } else if (toolStore.paintTool === 'bucket') {
      pb.floodFill(px, py, toolStore.primaryColor)
    } else if (toolStore.paintTool === 'dither') {
      pb.drawDither(px, py, toolStore.primaryColor, effectiveSize)
    } else if (toolStore.paintTool === 'picker') {
      toolStore.primaryColor = pb.getPixelHex(px, py)
    }

    if (threeTexture) {
      threeTexture.needsUpdate = true
    }
    projectStore.markTextureUpdated()
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
    projectStore.performFillFace()
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

function onWindowResize() {
  if (!containerRef.value || !renderer) return
  const width = containerRef.value.clientWidth
  const height = containerRef.value.clientHeight
  if (width === 0 || height === 0) return

  cameraPersp.aspect = width / height
  cameraPersp.updateProjectionMatrix()

  const frustumSize = 5
  const quadAspect = (width / 2) / (height / 2) || 1

  const updateOrtho = (cam: THREE.OrthographicCamera) => {
    const currentZoom = cam.zoom
    cam.left = -frustumSize * quadAspect / 2
    cam.right = frustumSize * quadAspect / 2
    cam.top = frustumSize / 2
    cam.bottom = -frustumSize / 2
    cam.zoom = currentZoom
    cam.updateProjectionMatrix()
  }

  updateOrtho(cameraTop)
  updateOrtho(cameraFront)
  updateOrtho(cameraRight)

  renderer.setSize(width, height)
}

function animate() {
  animationFrameId = requestAnimationFrame(animate)

  if (animationStore.armature.bones.length > 0 && (animationStore.isPlaying || animationStore.isTestPoseActive)) {
    SpringPhysicsSolver.step(animationStore.armature.bones)
  }

  if (orbitControls && orbitControls.enabled && !isGizmoDragging && !transformControls.dragging) {
    orbitControls.update()
  }

  if (!renderer || !containerRef.value) return
  const width = containerRef.value.clientWidth
  const height = containerRef.value.clientHeight

  if (toolStore.viewport.quadView) {
    const halfW = Math.floor(width / 2)
    const halfH = Math.floor(height / 2)

    renderer.setScissorTest(true)
    renderer.clear()

    // 1. Top-Left: Top Ortho View
    renderer.setViewport(0, halfH, halfW, halfH)
    renderer.setScissor(0, halfH, halfW, halfH)
    renderer.render(scene, cameraTop)

    // 2. Top-Right: Perspective User 3D Camera
    renderer.setViewport(halfW, halfH, halfW, halfH)
    renderer.setScissor(halfW, halfH, halfW, halfH)
    renderer.render(scene, cameraPersp)

    // 3. Bottom-Left: Front Ortho View
    renderer.setViewport(0, 0, halfW, halfH)
    renderer.setScissor(0, 0, halfW, halfH)
    renderer.render(scene, cameraFront)

    // 4. Bottom-Right: Right Ortho View
    renderer.setViewport(halfW, 0, halfW, halfH)
    renderer.setScissor(halfW, 0, halfW, halfH)
    renderer.render(scene, cameraRight)

    renderer.setScissorTest(false)
  } else {
    renderer.setScissorTest(false)
    renderer.setViewport(0, 0, width, height)
    renderer.clear()
    renderer.render(scene, cameraPersp)
  }
}

// Watchers
watch(() => projectStore.meshes, rebuildMeshes, { deep: true })
watch(() => projectStore.textureRevision, () => {
  if (threeTexture) threeTexture.needsUpdate = true
})
watch(() => toolStore.appMode, async () => {
  rebuildMeshes()
  await nextTick()
  setTimeout(() => onWindowResize(), 50)
  setTimeout(() => onWindowResize(), 150)
})
watch(() => toolStore.selectMode, rebuildMeshes)
watch(() => toolStore.modelTool, updateTransformGizmo)
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
watch(() => animationStore.currentFrame, rebuildMeshes)
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
      const vpKind = activeQuadrant.value === 'top_left' ? 'top' : (activeQuadrant.value === 'bottom_left' ? 'front' : (activeQuadrant.value === 'bottom_right' ? 'right' : 'persp'))
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
      orbitControls.enabled = true
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
    if (toolStore.appMode === 'model') {
      toolStore.isBoxSelectActive = !toolStore.isBoxSelectActive
      return
    } else if (toolStore.appMode === 'rig') {
      animationStore.clickToPlaceMode = !animationStore.clickToPlaceMode
      return
    }
  }

  // Rigging Quick Extrude (E)
  if ((e.key === 'e' || e.key === 'E') && !e.ctrlKey && !e.metaKey && !e.altKey && toolStore.appMode === 'rig') {
    if (animationStore.selectedBoneId) {
      projectStore.recordState('Extrude Bone')
      animationStore.extrudeBone(animationStore.selectedBoneId)
      rebuildBones()
      return
    }
  }

  // Quick Bind Shortcut (Ctrl+B)
  if ((e.key === 'b' || e.key === 'B') && (e.ctrlKey || e.metaKey) && toolStore.appMode === 'rig') {
    e.preventDefault()
    if (animationStore.selectedBoneId) {
      projectStore.recordState('Quick Bind Geometry')
      animationStore.bindSelectedGeometry('rigid_vertex', animationStore.selectedBoneId)
      rebuildMeshes()
      return
    }
  }

  // Reset Pose (Alt+R)
  if ((e.key === 'r' || e.key === 'R') && e.altKey) {
    e.preventDefault()
    animationStore.resetAllBonesToRest()
    rebuildBones()
    rebuildMeshes()
    return
  }

  // Blender Specials Context Menu shortcut (W)
  if ((e.key === 'w' || e.key === 'W') && !e.ctrlKey && !e.metaKey && !e.altKey && toolStore.appMode === 'model') {
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

  // Prevent drawing in 3D scene when clicking on any UI button, floating panel, modal, inspector, etc.
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
      target.closest('.pointer-events-auto') ||
      (renderer && renderer.domElement && target !== renderer.domElement)
    ) {
      return
    }
  }

  updateActiveCameraAndQuadrant(e)
  if (operatorManager.activeOperator) {
    (operatorManager.activeOperator as any).ctx.camera = activeCamera
    const vpKind = activeQuadrant.value === 'top_left' ? 'top' : (activeQuadrant.value === 'bottom_left' ? 'front' : (activeQuadrant.value === 'bottom_right' ? 'right' : 'persp'))
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
  
  if (!toolStore.viewport.quadView) {
    return {
      x: (proj.x * 0.5 + 0.5) * rect.width,
      y: (-(proj.y * 0.5) + 0.5) * rect.height
    }
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

function triggerStepBack() {
  operatorManager.handlePointerDown({ button: 2 } as any)
}

// Floating & Movable Operator HUD
const hudPos = ref({ x: typeof window !== 'undefined' ? Math.max(20, Math.round(window.innerWidth / 2 - 220)) : 220, y: 52 })
const isHudDragging = ref(false)
let hudDragOffset = { x: 0, y: 0 }

function startHudDrag(e: MouseEvent) {
  if (e.button !== 0) return
  isHudDragging.value = true
  hudDragOffset = {
    x: e.clientX - hudPos.value.x,
    y: e.clientY - hudPos.value.y
  }

  const onMouseMove = (moveEvent: MouseEvent) => {
    if (!isHudDragging.value) return
    const maxX = window.innerWidth - 320
    const maxY = window.innerHeight - 90
    hudPos.value.x = Math.max(10, Math.min(maxX, moveEvent.clientX - hudDragOffset.x))
    hudPos.value.y = Math.max(40, Math.min(maxY, moveEvent.clientY - hudDragOffset.y))
  }

  const onMouseUp = () => {
    isHudDragging.value = false
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

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

watch(() => projectStore.textureRevision, () => {
  updateThreeTextures()
  rebuildMeshes()
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

function toggleBoneVisibility() {
  toolStore.viewport.showBones = !toolStore.viewport.showBones
  animationStore.showBones = toolStore.viewport.showBones
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

onMounted(() => {
  initThree()
  window.addEventListener('set-camera-view', handleCameraViewEvent)
  window.addEventListener('blender-modal-op', handleBlenderModalEvent)
  window.addEventListener('primitive-created', handlePrimitiveCreatedEvent)
  window.addEventListener('start-primitive-placement', handleStartPrimitivePlacementEvent)
  window.addEventListener('theme-changed', handleThemeChangedEvent)
  window.addEventListener('pointermove', handleGlobalPointerMove)
  window.addEventListener('keydown', handleGlobalKeyDown, true)
  window.addEventListener('wheel', handleGlobalWheel, { passive: false })
  window.addEventListener('pointerdown', handleGlobalPointerDown, true)
})

onUnmounted(() => {
  window.removeEventListener('set-camera-view', handleCameraViewEvent)
  window.removeEventListener('blender-modal-op', handleBlenderModalEvent)
  window.removeEventListener('primitive-created', handlePrimitiveCreatedEvent)
  window.removeEventListener('start-primitive-placement', handleStartPrimitivePlacementEvent)
  window.removeEventListener('theme-changed', handleThemeChangedEvent)
  window.removeEventListener('pointermove', handleGlobalPointerMove)
  window.removeEventListener('keydown', handleGlobalKeyDown, true)
  window.removeEventListener('wheel', handleGlobalWheel)
  window.removeEventListener('pointerdown', handleGlobalPointerDown, true)
  cancelAnimationFrame(animationFrameId)
  if (resizeObserver && containerRef.value) {
    resizeObserver.unobserve(containerRef.value)
    resizeObserver.disconnect()
  }
  if (renderer && renderer.domElement && containerRef.value) {
    renderer.domElement.removeEventListener('wheel', onWheel)
    containerRef.value.removeChild(renderer.domElement)
    renderer.dispose()
  }
  if (layers) {
    layers.dispose(scene)
  }
  if (editorEnv) {
    editorEnv.dispose()
  }
  window.removeEventListener('resize', onWindowResize)
})
</script>

<template>
  <div class="relative w-full h-full overflow-hidden bg-ui-root flex flex-col">
    <!-- 3D Canvas Container -->
    <div ref="containerRef" class="w-full h-full cursor-crosshair flex-1 min-h-0 relative">
      <!-- 1. SINGLE VIEWPORT LIGHTWAVE CONTROLS -->
      <template v-if="!toolStore.viewport.quadView">
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

      <!-- 2. QUAD VIEWPORT LIGHTWAVE CONTROLS -->
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
      v-if="operatorManager.state.value.active && (operatorManager.activeOperator instanceof KnifeOperator || operatorManager.activeOperator instanceof LoopCutOperator)"
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
      class="fixed z-50 flex flex-col bg-ui-panel border border-ui-borderStrong rounded-xs shadow-2xl font-sans select-none pointer-events-auto max-w-[95vw] min-w-[360px]"
      :style="{ left: `${hudPos.x}px`, top: `${hudPos.y}px` }"
    >
      <!-- Panel Header Bar (Draggable) -->
      <div 
        class="flex items-center justify-between px-2.5 py-1 bg-ui-header border-b border-ui-borderSubtle cursor-move rounded-t-xs text-xs text-ui-textMuted group"
        @mousedown="startHudDrag"
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
