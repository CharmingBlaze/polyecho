<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { useProjectStore } from '../../stores/projectStore'
import { useToolStore } from '../../stores/toolStore'
import { useAnimationStore } from '../../stores/animationStore'
import { meshToThreeGeometry } from '../../core/geometry/Converters'
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
import ViewportNav from './ViewportNav.vue'
import { 
  Move, 
  RotateCw, 
  Search, 
  Maximize2,
  Check,
  X,
  Sparkles
} from 'lucide-vue-next'

const projectStore = useProjectStore()
const toolStore = useToolStore()
const animationStore = useAnimationStore()

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

// Transform helper proxy object & initial drag transforms
const transformProxy = new THREE.Object3D()
let dragStartProxyMatrix = new THREE.Matrix4()
let dragStartProxyMatrixInverse = new THREE.Matrix4()
const dragStartVertexMap = new Map<string, THREE.Vector3>()

function initThree() {
  if (!containerRef.value) return

  const width = containerRef.value.clientWidth || window.innerWidth
  const height = containerRef.value.clientHeight || window.innerHeight

  // Scene
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x14161a)

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
  transformControls.size = 0.8
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
  gridHelper = new THREE.GridHelper(20, 20, 0x6366f1, 0x282b33)
  gridHelper.position.y = -0.001
  layers.gridGroup.add(gridHelper)

  axesHelper = new THREE.AxesHelper(1.5)
  axesHelper.setColors(
    new THREE.Color(0xf43f5e), // X Axis Theme Rose
    new THREE.Color(0x10b981), // Y Axis Theme Emerald
    new THREE.Color(0x38bdf8)  // Z Axis Theme Sky
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
}

function initTexture() {
  threeTexture = new THREE.CanvasTexture(projectStore.pixelBuffer.canvas)
  threeTexture.magFilter = THREE.NearestFilter
  threeTexture.minFilter = THREE.NearestFilter
  threeTexture.generateMipmaps = false

  psxMaterial = createPSXMaterial(threeTexture, new THREE.Vector2(320, 240))
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

    const { 
      geometry, 
      wireframeGeometry, 
      vertexPointsGeometry, 
      selectedFacesGeometry, 
      selectedEdgesGeometry, 
      edgeLinesGeometry, 
      faceIndexMap, 
      vertexIndexMap 
    } = meshToThreeGeometry(meshObj, selectedFaces, selectedEdges, toolStore.viewport.shadeMode)

    const isSmooth = (meshObj.shadeMode || toolStore.viewport.shadeMode) === 'smooth'

    let mat: THREE.Material
    if (toolStore.viewport.shading === 'psx' && psxMaterial) {
      psxMaterial.uniforms.uJitterAmount.value = toolStore.viewport.psxJitter ? 1.0 : 0.0
      psxMaterial.uniforms.uAffineEnabled.value = toolStore.viewport.psxAffine
      psxMaterial.uniforms.uDitherEnabled.value = toolStore.viewport.dither
      mat = psxMaterial
    } else if (toolStore.viewport.shading === 'textured' && threeTexture) {
      mat = new THREE.MeshStandardMaterial({
        map: threeTexture,
        roughness: 0.8,
        metalness: 0.05,
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
    } else {
      mat = new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        roughness: 0.75,
        metalness: 0.1,
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
    threeMesh.position.set(meshObj.position.x, meshObj.position.y, meshObj.position.z)
    threeMesh.rotation.set(
      THREE.MathUtils.degToRad(meshObj.rotation.x),
      THREE.MathUtils.degToRad(meshObj.rotation.y),
      THREE.MathUtils.degToRad(meshObj.rotation.z)
    )
    threeMesh.scale.set(meshObj.scale.x, meshObj.scale.y, meshObj.scale.z)
    threeMesh.userData = { meshId: meshObj.id, faceIndexMap }
    layers.modelGroup.add(threeMesh)

    // PASS 5: Wireframe overlay
    if ((toolStore.appMode === 'model' || isXRay) && toolStore.viewport.shading !== 'wireframe') {
      const wireMat = new THREE.LineBasicMaterial({ 
        color: isSelectedMesh ? 0x6366f1 : 0x475569, 
        depthTest: !isXRay,
        transparent: isXRay,
        opacity: isXRay ? 0.85 : 1.0
      })
      const wire = new THREE.LineSegments(wireframeGeometry, wireMat)
      wire.name = `${meshObj.id}_wire`
      wire.position.copy(threeMesh.position)
      wire.rotation.copy(threeMesh.rotation)
      wire.scale.copy(threeMesh.scale)
      layers.wireframeGroup.add(wire)
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

  for (const bone of animationStore.armature.bones) {
    const start = new THREE.Vector3(bone.head.x, bone.head.y, bone.head.z)
    const end = new THREE.Vector3(bone.tail.x, bone.tail.y, bone.tail.z)
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
      opacity: isSelected ? 0.65 : 0.35,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false
    })
    const octMesh = new THREE.Mesh(octGeom, octMat)
    octMesh.renderOrder = 999
    octMesh.userData = { boneId: bone.id }
    boneGroup.add(octMesh)

    const wireGeom = new THREE.WireframeGeometry(octGeom)
    const wireMat = new THREE.LineBasicMaterial({
      color: isSelected ? 0xfef08a : 0x38bdf8,
      depthTest: false,
      depthWrite: false
    })
    const wire = new THREE.LineSegments(wireGeom, wireMat)
    wire.renderOrder = 1000
    boneGroup.add(wire)

    const jointGeom = new THREE.SphereGeometry(Math.max(0.08, radius * 0.75), 8, 8)
    const jointMat = new THREE.MeshBasicMaterial({
      color: isSelected ? 0xf59e0b : 0x06b6d4,
      depthTest: false,
      depthWrite: false
    })
    const jointMesh = new THREE.Mesh(jointGeom, jointMat)
    jointMesh.position.copy(start)
    jointMesh.renderOrder = 1001
    jointMesh.userData = { boneId: bone.id }
    boneGroup.add(jointMesh)
  }
}

function updateTransformGizmo() {
  if (isGizmoDragging) return

  if (toolStore.appMode === 'rig') {
    const bone = animationStore.selectedBone
    if (bone) {
      transformProxy.position.set(bone.head.x, bone.head.y, bone.head.z)
      transformProxy.rotation.set(0, 0, 0)
      transformProxy.scale.set(1, 1, 1)
      transformProxy.updateMatrixWorld()
      transformControls.attach(transformProxy)
      transformControls.setMode('translate')
      return
    }
    transformControls.detach()
    return
  }

  if (toolStore.appMode === 'animate') {
    const bone = animationStore.selectedBone
    if (bone) {
      transformProxy.position.set(bone.head.x, bone.head.y, bone.head.z)
      transformProxy.rotation.set(
        THREE.MathUtils.degToRad(bone.rotation.x),
        THREE.MathUtils.degToRad(bone.rotation.y),
        THREE.MathUtils.degToRad(bone.rotation.z)
      )
      transformProxy.scale.set(1, 1, 1)
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

  if (toolStore.selectMode === 'origin') {
    transformProxy.position.set(activeMesh.position.x, activeMesh.position.y, activeMesh.position.z)
    transformProxy.rotation.set(0, 0, 0)
    transformProxy.scale.set(1, 1, 1)
    transformProxy.updateMatrixWorld()
    transformControls.attach(transformProxy)
    transformControls.setMode('translate')
    return
  } else if (toolStore.selectMode === 'object') {
    transformProxy.position.set(activeMesh.position.x, activeMesh.position.y, activeMesh.position.z)
    transformProxy.rotation.set(
      THREE.MathUtils.degToRad(activeMesh.rotation.x),
      THREE.MathUtils.degToRad(activeMesh.rotation.y),
      THREE.MathUtils.degToRad(activeMesh.rotation.z)
    )
    transformProxy.scale.set(activeMesh.scale.x, activeMesh.scale.y, activeMesh.scale.z)
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

function applyThemeToTransformGizmo(tc: TransformControls) {
  if (!tc) return
  const helper = tc.getHelper()
  if (!helper) return

  helper.traverse((child: any) => {
    if (child.material) {
      const mat = child.material
      const name = (child.name || '').toUpperCase()

      // Primary Axes matching PSX/Blender Theme
      if (name.includes('X') && !name.includes('Y') && !name.includes('Z')) {
        mat.color.setHex(0xf43f5e) // Theme Rose for X
      } else if (name.includes('Y') && !name.includes('X') && !name.includes('Z')) {
        mat.color.setHex(0x10b981) // Theme Emerald for Y
      } else if (name.includes('Z') && !name.includes('X') && !name.includes('Y')) {
        mat.color.setHex(0x38bdf8) // Theme Sky for Z
      } else if (name.includes('XY')) {
        mat.color.setHex(0x34d399) // Theme Spring Green for XY plane
      } else if (name.includes('YZ')) {
        mat.color.setHex(0x06b6d4) // Theme Cyan for YZ plane
      } else if (name.includes('XZ')) {
        mat.color.setHex(0xa855f7) // Theme Purple for XZ plane
      } else if (name === 'XYZ' || name === 'E' || name === 'START' || name === 'END' || name === 'DELTA') {
        mat.color.setHex(0x818cf8) // Theme Indigo for Uniform Center Gizmo Handle
      }
    }
  })
}

function onGizmoDragStart() {
  transformProxy.updateMatrixWorld()
  dragStartProxyMatrix.copy(transformProxy.matrixWorld)
  dragStartProxyMatrixInverse.copy(dragStartProxyMatrix).invert()

  dragStartVertexMap.clear()

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
  if (!activeMesh) return

  transformProxy.updateMatrixWorld()

  if (toolStore.appMode === 'rig') {
    const bone = animationStore.selectedBone
    if (bone) {
      const deltaX = transformProxy.position.x - bone.head.x
      const deltaY = transformProxy.position.y - bone.head.y
      const deltaZ = transformProxy.position.z - bone.head.z
      bone.head.x = transformProxy.position.x
      bone.head.y = transformProxy.position.y
      bone.head.z = transformProxy.position.z
      bone.tail.x += deltaX
      bone.tail.y += deltaY
      bone.tail.z += deltaZ
      rebuildBones()
      return
    }
  }

  if (toolStore.appMode === 'animate') {
    const bone = animationStore.selectedBone
    if (bone) {
      if (transformControls.getMode() === 'rotate') {
        bone.rotation.x = THREE.MathUtils.radToDeg(transformProxy.rotation.x)
        bone.rotation.y = THREE.MathUtils.radToDeg(transformProxy.rotation.y)
        bone.rotation.z = THREE.MathUtils.radToDeg(transformProxy.rotation.z)
      } else if (transformControls.getMode() === 'scale') {
        bone.scale.x = transformProxy.scale.x
        bone.scale.y = transformProxy.scale.y
        bone.scale.z = transformProxy.scale.z
      } else {
        const deltaX = transformProxy.position.x - bone.head.x
        const deltaY = transformProxy.position.y - bone.head.y
        const deltaZ = transformProxy.position.z - bone.head.z
        bone.head.x = transformProxy.position.x
        bone.head.y = transformProxy.position.y
        bone.head.z = transformProxy.position.z
        bone.tail.x += deltaX
        bone.tail.y += deltaY
        bone.tail.z += deltaZ
      }
      rebuildBones()
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
  if (event.button !== 0) return
  if (transformControls.dragging || isGizmoDragging || (transformControls as any).axis !== null) {
    orbitControls.enabled = false
    return
  }

  pointerDownClientPos = { x: event.clientX, y: event.clientY }
  pointerDownHitMesh = false

  updateActiveCameraAndQuadrant(event)
  raycaster.setFromCamera(mouse, activeCamera)

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

  if (toolStore.appMode === 'rig' || toolStore.appMode === 'animate' || animationStore.showBones) {
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
  lastHoverClientPos = { x: event.clientX, y: event.clientY }
  if (isGizmoDragging || transformControls.dragging || (transformControls as any).axis !== null) {
    orbitControls.enabled = false
    return
  }

  updateActiveCameraAndQuadrant(event)
  raycaster.setFromCamera(mouse, activeCamera)

  if (isPaintingOn3D && toolStore.appMode === 'uvpaint' && (toolStore.uvWorkspaceTab === 'paint' || toolStore.uvWorkspaceTab === 'vertex')) {
    orbitControls.enabled = false
    event.stopImmediatePropagation()
    event.preventDefault()
    paintRaycastHit()
    return
  }

  updateHoverState()
}

function onPointerUp(event?: PointerEvent) {
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
  }

  if (isPaintingOn3D) {
    isPaintingOn3D = false
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
    viewportKind: vpKind,
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
      pb.drawBrush(px, py, toolStore.primaryColor, effectiveSize)
    } else if (toolStore.paintTool === 'eraser') {
      pb.erase(px, py, effectiveSize)
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
watch(() => toolStore.viewport, rebuildMeshes, { deep: true })
watch(() => animationStore.selectedBoneId, rebuildMeshes)
watch(() => animationStore.showBones, rebuildBones)
watch(() => animationStore.currentFrame, rebuildMeshes)

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

function handleGlobalPointerMove(e: PointerEvent) {
  lastHoverClientPos = { x: e.clientX, y: e.clientY }
  if (operatorManager.state.value.active) {
    operatorManager.handlePointerMove(e)
  }
}

function handleGlobalKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && operatorManager.state.value.active) {
    e.preventDefault()
    e.stopPropagation()
    operatorManager.cancel()
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
  if (operatorManager.state.value.active) {
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
}

function projectWorldToScreen(worldPos: THREE.Vector3): { x: number; y: number } {
  if (!activeCamera || !containerRef.value) return { x: 0, y: 0 }
  const rect = containerRef.value.getBoundingClientRect()
  const proj = worldPos.clone().project(activeCamera)
  return {
    x: (proj.x * 0.5 + 0.5) * rect.width,
    y: (-(proj.y * 0.5) + 0.5) * rect.height
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

watch(() => toolStore.viewport.invertZoom, (inv) => {
  if (orbitControls) {
    orbitControls.zoomSpeed = inv ? -1.0 : 1.0
  }
})

watch(() => toolStore.viewport.shadeMode, () => {
  rebuildMeshes()
})

onMounted(() => {
  initThree()
  window.addEventListener('set-camera-view', handleCameraViewEvent)
  window.addEventListener('blender-modal-op', handleBlenderModalEvent)
  window.addEventListener('primitive-created', handlePrimitiveCreatedEvent)
  window.addEventListener('pointermove', handleGlobalPointerMove)
  window.addEventListener('keydown', handleGlobalKeyDown, true)
  window.addEventListener('wheel', handleGlobalWheel, { passive: false })
  window.addEventListener('pointerdown', handleGlobalPointerDown, true)
})

onUnmounted(() => {
  window.removeEventListener('set-camera-view', handleCameraViewEvent)
  window.removeEventListener('blender-modal-op', handleBlenderModalEvent)
  window.removeEventListener('primitive-created', handlePrimitiveCreatedEvent)
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
  <div class="relative w-full h-full overflow-hidden bg-dcc-900 flex flex-col">
    <!-- Viewport Nav & Shading switcher -->
    <ViewportNav @set-camera-view="setCameraView" />

    <!-- 3D Canvas Container -->
    <div ref="containerRef" class="w-full h-full cursor-crosshair flex-1 min-h-0 relative">
      <!-- 1. SINGLE VIEWPORT LIGHTWAVE CONTROLS -->
      <template v-if="!toolStore.viewport.quadView">
        <!-- Top-Right LightWave Nav Cluster (Move, Rotate, Zoom, Maximize) -->
        <div class="absolute top-2.5 right-2.5 z-20 flex items-center bg-dcc-900/90 border border-dcc-700/80 rounded shadow-md divide-x divide-dcc-750">
          <button 
            @mousedown="startLightWavePan('persp', $event)" 
            class="p-1.5 hover:bg-dcc-750 text-slate-300 hover:text-white cursor-move transition"
            title="LightWave Pan (Drag to pan view)"
          >
            <Move class="w-3.5 h-3.5" />
          </button>
          <button 
            @mousedown="startLightWaveRotate($event)" 
            class="p-1.5 hover:bg-dcc-750 text-slate-300 hover:text-white cursor-grab transition"
            title="LightWave Orbit (Drag to rotate 3D view)"
          >
            <RotateCw class="w-3.5 h-3.5" />
          </button>
          <button 
            @mousedown="startLightWaveZoom('persp', $event)" 
            class="p-1.5 hover:bg-dcc-750 text-slate-300 hover:text-white cursor-ns-resize transition"
            title="LightWave Zoom (Drag up/down to zoom)"
          >
            <Search class="w-3.5 h-3.5" />
          </button>
          <button 
            @click="toolStore.viewport.quadView = true" 
            class="p-1.5 hover:bg-dcc-750 text-slate-300 hover:text-white transition"
            title="Split to Quad View (Ctrl+Alt+Q)"
          >
            <Maximize2 class="w-3.5 h-3.5 text-amber-400" />
          </button>
        </div>
      </template>

      <!-- 2. QUAD VIEWPORT LIGHTWAVE CONTROLS -->
      <template v-else>
        <!-- Center Divider Lines -->
        <div class="absolute inset-x-0 top-1/2 h-px bg-dcc-700/90 pointer-events-none z-10"></div>
        <div class="absolute inset-y-0 left-1/2 w-px bg-dcc-700/90 pointer-events-none z-10"></div>

        <!-- QUADRANT 1: TOP-LEFT (Top Ortho) -->
        <div class="absolute top-2 left-2 z-20 flex items-center justify-between w-[calc(50%-16px)]">
          <!-- View Label -->
          <div class="px-2 py-0.5 rounded bg-dcc-900/90 border border-dcc-700/80 text-[10px] font-mono text-cyan-300 flex items-center gap-1.5 shadow">
            <span class="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
            <span class="font-bold">Top Ortho</span>
            <span class="text-slate-500">[Y+]</span>
          </div>

          <!-- LightWave Nav Buttons (Pan & Zoom for 2D Ortho) -->
          <div class="flex items-center bg-dcc-900/90 border border-dcc-700/80 rounded shadow divide-x divide-dcc-750">
            <button @mousedown="startLightWavePan('top', $event)" class="p-1 hover:bg-dcc-750 text-slate-300 hover:text-white cursor-move" title="Pan Top View (Drag to pan)">
              <Move class="w-3 h-3" />
            </button>
            <button @mousedown="startLightWaveZoom('top', $event)" class="p-1 hover:bg-dcc-750 text-slate-300 hover:text-white cursor-ns-resize" title="Zoom Top View (Drag up/down to zoom)">
              <Search class="w-3 h-3" />
            </button>
            <button @click="toolStore.viewport.quadView = false" class="p-1 hover:bg-dcc-750 text-slate-300 hover:text-white" title="Maximize View">
              <Maximize2 class="w-3 h-3" />
            </button>
          </div>
        </div>

        <!-- QUADRANT 2: TOP-RIGHT (Perspective) -->
        <div class="absolute top-2 right-2 z-20 flex items-center justify-between w-[calc(50%-16px)]">
          <div class="px-2 py-0.5 rounded bg-dcc-900/90 border border-dcc-700/80 text-[10px] font-mono text-amber-300 flex items-center gap-1.5 shadow">
            <span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
            <span class="font-bold">Perspective 3D</span>
            <span class="text-slate-500">[User]</span>
          </div>

          <!-- Full 3D Nav Buttons (Pan, Rotate, Zoom) -->
          <div class="flex items-center bg-dcc-900/90 border border-dcc-700/80 rounded shadow divide-x divide-dcc-750">
            <button @mousedown="startLightWavePan('persp', $event)" class="p-1 hover:bg-dcc-750 text-slate-300 hover:text-white cursor-move" title="Pan View">
              <Move class="w-3 h-3" />
            </button>
            <button @mousedown="startLightWaveRotate($event)" class="p-1 hover:bg-dcc-750 text-slate-300 hover:text-white cursor-grab" title="Orbit 3D View">
              <RotateCw class="w-3 h-3" />
            </button>
            <button @mousedown="startLightWaveZoom('persp', $event)" class="p-1 hover:bg-dcc-750 text-slate-300 hover:text-white cursor-ns-resize" title="Zoom View">
              <Search class="w-3 h-3" />
            </button>
            <button @click="toolStore.viewport.quadView = false" class="p-1 hover:bg-dcc-750 text-slate-300 hover:text-white" title="Maximize View">
              <Maximize2 class="w-3 h-3" />
            </button>
          </div>
        </div>

        <!-- QUADRANT 3: BOTTOM-LEFT (Front Ortho) -->
        <div class="absolute top-[calc(50%+8px)] left-2 z-20 flex items-center justify-between w-[calc(50%-16px)]">
          <div class="px-2 py-0.5 rounded bg-dcc-900/90 border border-dcc-700/80 text-[10px] font-mono text-emerald-300 flex items-center gap-1.5 shadow">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            <span class="font-bold">Front Ortho</span>
            <span class="text-slate-500">[Z-]</span>
          </div>

          <!-- LightWave Nav Buttons (Pan & Zoom for 2D Ortho) -->
          <div class="flex items-center bg-dcc-900/90 border border-dcc-700/80 rounded shadow divide-x divide-dcc-750">
            <button @mousedown="startLightWavePan('front', $event)" class="p-1 hover:bg-dcc-750 text-slate-300 hover:text-white cursor-move" title="Pan Front View (Drag to pan)">
              <Move class="w-3 h-3" />
            </button>
            <button @mousedown="startLightWaveZoom('front', $event)" class="p-1 hover:bg-dcc-750 text-slate-300 hover:text-white cursor-ns-resize" title="Zoom Front View (Drag up/down to zoom)">
              <Search class="w-3 h-3" />
            </button>
            <button @click="toolStore.viewport.quadView = false" class="p-1 hover:bg-dcc-750 text-slate-300 hover:text-white" title="Maximize View">
              <Maximize2 class="w-3 h-3" />
            </button>
          </div>
        </div>

        <!-- QUADRANT 4: BOTTOM-RIGHT (Right Ortho) -->
        <div class="absolute top-[calc(50%+8px)] right-2 z-20 flex items-center justify-between w-[calc(50%-16px)]">
          <div class="px-2 py-0.5 rounded bg-dcc-900/90 border border-dcc-700/80 text-[10px] font-mono text-indigo-300 flex items-center gap-1.5 shadow">
            <span class="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
            <span class="font-bold">Right Ortho</span>
            <span class="text-slate-500">[X-]</span>
          </div>

          <!-- LightWave Nav Buttons (Pan & Zoom for 2D Ortho) -->
          <div class="flex items-center bg-dcc-900/90 border border-dcc-700/80 rounded shadow divide-x divide-dcc-750">
            <button @mousedown="startLightWavePan('right', $event)" class="p-1 hover:bg-dcc-750 text-slate-300 hover:text-white cursor-move" title="Pan Right View (Drag to pan)">
              <Move class="w-3 h-3" />
            </button>
            <button @mousedown="startLightWaveZoom('right', $event)" class="p-1 hover:bg-dcc-750 text-slate-300 hover:text-white cursor-ns-resize" title="Zoom Right View (Drag up/down to zoom)">
              <Search class="w-3 h-3" />
            </button>
            <button @click="toolStore.viewport.quadView = false" class="p-1 hover:bg-dcc-750 text-slate-300 hover:text-white" title="Maximize View">
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

    <!-- Blender Modal Operator Interactive HUD (Stylus & Touch Ready) -->
    <div 
      v-if="operatorManager.state.value.active"
      class="absolute top-12 left-1/2 -translate-x-1/2 z-50 flex flex-wrap items-center gap-2.5 bg-dcc-900/95 border border-dcc-700/90 px-3.5 py-1.5 rounded-xl shadow-2xl backdrop-blur-xl font-mono select-none pointer-events-auto ring-1 ring-white/10 max-w-[95vw]"
    >
      <!-- Tool Badge -->
      <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-600/30 border border-indigo-500/50 text-indigo-300 font-bold text-xs uppercase tracking-wider shadow-xs">
        <Sparkles class="w-3.5 h-3.5 text-indigo-400" />
        <span>{{ operatorManager.state.value.operatorName }}</span>
      </div>

      <!-- Live Numerical & Status Feedback -->
      <div class="text-xs font-semibold text-slate-200 tracking-wide px-1">
        {{ operatorManager.state.value.statusText }}
      </div>

      <!-- Interactive Stylus & Keyboard Quick Controls -->
      <div class="flex items-center gap-1.5 pl-2 border-l border-dcc-750">
        <!-- Axis Constraint Buttons -->
        <div class="flex items-center bg-dcc-850 rounded-lg p-0.5 border border-dcc-750">
          <button 
            @click="triggerAxisConstraint('x')"
            class="px-2 py-1 rounded text-[10px] font-bold text-rose-400 hover:bg-rose-500/20 active:scale-95 transition"
            title="Lock to X Axis (X)"
          >
            X
          </button>
          <button 
            @click="triggerAxisConstraint('y')"
            class="px-2 py-1 rounded text-[10px] font-bold text-emerald-400 hover:bg-emerald-500/20 active:scale-95 transition"
            title="Lock to Y Axis (Y)"
          >
            Y
          </button>
          <button 
            @click="triggerAxisConstraint('z')"
            class="px-2 py-1 rounded text-[10px] font-bold text-sky-400 hover:bg-sky-500/20 active:scale-95 transition"
            title="Lock to Z Axis (Z)"
          >
            Z
          </button>
        </div>

        <!-- Snap & Precision Buttons -->
        <button 
          @click="triggerToggleSnap"
          class="px-2 py-1 bg-dcc-850 hover:bg-dcc-750 border border-dcc-750 rounded-lg text-[10px] text-slate-300 font-bold active:scale-95 transition"
          title="Toggle Grid / Angle Snapping (Ctrl)"
        >
          Snap
        </button>

        <button 
          @click="triggerTogglePrecision"
          class="px-2 py-1 bg-dcc-850 hover:bg-dcc-750 border border-dcc-750 rounded-lg text-[10px] text-slate-300 font-bold active:scale-95 transition"
          title="Precision Mode (Shift)"
        >
          Slow
        </button>

        <!-- Orientation Toggle for Placement -->
        <button 
          v-if="operatorManager.state.value.operatorName.includes('Primitive')"
          @click="triggerToggleOrientation"
          class="px-2 py-1 bg-dcc-850 hover:bg-dcc-750 border border-dcc-750 rounded-lg text-[10px] text-amber-400 font-bold active:scale-95 transition"
          title="Toggle Align to World vs Surface (O)"
        >
          Align
        </button>

        <!-- Step Back Button (Stylus Friendly Alternative to RMB) -->
        <button 
          @click="triggerStepBack"
          class="px-2 py-1 bg-dcc-850 hover:bg-dcc-750 border border-dcc-750 rounded-lg text-[10px] text-slate-400 hover:text-slate-200 active:scale-95 transition"
          title="Step Back / Cancel Stage (RMB)"
        >
          Back
        </button>

        <!-- Confirm Action Button -->
        <button 
          @click="operatorManager.confirm()" 
          class="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg shadow-sm ml-1 flex items-center gap-1 active:scale-95 transition"
          title="Confirm Operation (LMB / Enter)"
        >
          <Check class="w-3.5 h-3.5" />
          <span>Confirm</span>
        </button>

        <!-- Cancel Action Button -->
        <button 
          @click="operatorManager.cancel()" 
          class="px-2.5 py-1 bg-dcc-800 hover:bg-rose-950/60 hover:text-rose-300 text-slate-400 border border-dcc-700 text-xs rounded-lg active:scale-95 transition"
          title="Cancel Operation (Esc)"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- HUD Stats Bar (Tris, Verts, Mode) -->
    <div class="absolute bottom-3 left-3 bg-dcc-850/80 backdrop-blur-sm px-2.5 py-1 rounded border border-dcc-700/60 shadow text-[11px] font-mono text-slate-400 flex items-center space-x-3 select-none pointer-events-none z-20">
      <span>Tris: <strong class="text-slate-200">{{ projectStore.stats?.tris ?? 0 }}</strong></span>
      <span>Verts: <strong class="text-slate-200">{{ projectStore.stats?.verts ?? 0 }}</strong></span>
      <span>Faces: <strong class="text-slate-200">{{ projectStore.stats?.faces ?? 0 }}</strong></span>
      <span v-if="(projectStore.stats?.selectedFaces ?? 0) > 0" class="text-amber-400 font-bold">
        Sel Faces: {{ projectStore.stats?.selectedFaces }}
      </span>
      <span v-if="(projectStore.stats?.selectedVerts ?? 0) > 0" class="text-amber-400 font-bold">
        Sel Verts: {{ projectStore.stats?.selectedVerts }}
      </span>
      <span class="text-indigo-400 uppercase font-bold">{{ toolStore.appMode }} / {{ toolStore.selectMode }}</span>
      <span v-if="toolStore.viewport.quadView" class="text-amber-400 font-bold uppercase">[QUAD VIEW]</span>
      <span v-if="toolStore.viewport.xray" class="text-cyan-400 font-bold uppercase">[X-RAY]</span>
    </div>
  </div>
</template>
