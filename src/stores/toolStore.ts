import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { 
  AppMode, 
  SelectMode, 
  ModelToolType, 
  PaintToolType, 
  RigToolType, 
  AnimateToolType, 
  SnappingSettings, 
  ViewportSettings,
  TransformOrientation,
  PivotPoint
} from '../types/tools'

export const useToolStore = defineStore('tool', () => {
  const appMode = ref<AppMode>('model')
  const selectMode = ref<SelectMode>('object')
  const modelTool = ref<ModelToolType>('select')
  const transformOrientation = ref<TransformOrientation>('global')
  const pivotPoint = ref<PivotPoint>('median')
  const paintTool = ref<PaintToolType>('brush')
  const rigTool = ref<RigToolType>('select_bone')
  const animateTool = ref<AnimateToolType>('select_bone')
  const isBoxSelectActive = ref<boolean>(false)
  const lastTransformTool = ref<ModelToolType>('move')
  const activeProfileId = ref<string>('psx_retro')

  // Painting settings
  const primaryColor = ref<string>('#ffffff')
  const secondaryColor = ref<string>('#181425')
  const brushSize = ref<number>(1)
  const brushOpacity = ref<number>(1.0)
  const brushShape = ref<'square' | 'circle'>('square')
  const brushFilled = ref<boolean>(false)
  const ditherPattern = ref<string>('bayer4x4')
  const paletteSnapEnabled = ref<boolean>(false)

  // Stylus & Touch Settings
  const stylusPressureEnabled = ref<boolean>(true)
  const currentPressure = ref<number>(1.0)
  const currentPointerType = ref<'mouse' | 'pen' | 'touch'>('mouse')
  /** Floating G/R/S (and Loop Cut) HUD. Off by default; status stays in the bar. */
  const STYLUS_MODE_NOTIFICATIONS_KEY = 'polyecho_stylus_mode_notifications'
  const stylusModeNotifications = ref(false)
  if (typeof localStorage !== 'undefined') {
    stylusModeNotifications.value = localStorage.getItem(STYLUS_MODE_NOTIFICATIONS_KEY) === '1'
  }
  watch(stylusModeNotifications, (on) => {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(STYLUS_MODE_NOTIFICATIONS_KEY, on ? '1' : '0')
  })

  /** Click LightWave pan/orbit/zoom to lock that view tool until click-again or Esc. On by default. */
  const STICKY_VIEWPORT_CONTROLS_KEY = 'polyecho_sticky_viewport_controls'
  const stickyViewportControls = ref(true)
  const stickyViewNav = ref<'pan' | 'orbit' | 'zoom' | null>(null)
  if (typeof localStorage !== 'undefined') {
    stickyViewportControls.value = localStorage.getItem(STICKY_VIEWPORT_CONTROLS_KEY) !== '0'
  }
  watch(stickyViewportControls, (on) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STICKY_VIEWPORT_CONTROLS_KEY, on ? '1' : '0')
    }
    if (!on) stickyViewNav.value = null
  }, { flush: 'sync' })

  function toggleStickyViewNav(mode: 'pan' | 'orbit' | 'zoom') {
    if (!stickyViewportControls.value) return
    stickyViewNav.value = stickyViewNav.value === mode ? null : mode
  }

  function clearStickyViewNav() {
    stickyViewNav.value = null
  }

  // Vertex Painting settings
  const vertexPaintColor = ref<string>('#ffffff')
  const uvWorkspaceTab = ref<'uv' | 'paint'>('uv')
  /** Modeling select mode to restore when leaving UV / Paint. */
  const lastMeshSelectMode = ref<SelectMode>('object')
  /** Face ids of the UV island under the cursor — 3D viewport highlights these. */
  const uvHoverFaceIds = ref<string[]>([])
  const smartUvAngle = ref(66)
  const smartUvMargin = ref(2)
  /** Blender Subdivide redo: Number of Cuts / Smoothness. */
  const subdivideCuts = ref(1)
  const subdivideSmoothness = ref(0)
  const limitedDissolveAngle = ref(5)
  const bridgeSegments = ref(1)
  const bridgeTwist = ref(0)

  // Snapping & Precision
  const snapping = ref<SnappingSettings>({
    grid: true,
    gridSize: 0.1,
    vertex: false,
    edge: false,
    face: false,
    target: 'increment',
    angle: 15,
  })

  // Blender 3D Cursor
  const cursor3D = ref<{ x: number; y: number; z: number }>({ x: 0, y: 0, z: 0 })

  // Viewport display - Clean, standard 3D modeling viewport by default
  const viewport = ref<ViewportSettings>({
    shading: 'textured', // Standard clean textured shading by default
    showGrid: true,
    showAxes: true,
    showNormals: false,
    showBones: true,
    faceOrientation: false,
    wireframeOpacity: 0.88,
    psxJitter: false,
    psxAffine: false,
    dither: false,
    crtFilter: false,
    resolutionScale: 1,
    quadView: false,
    xray: false,
    shadeMode: 'flat',
    symmetryX: false,
    symmetryY: false,
    symmetryZ: false,
    invertZoom: false,
    combinedGizmo: false,
  })

  function isMeshWorkspace() {
    return appMode.value === 'model' || appMode.value === 'blockout'
  }

  function isMeshSelectMode(mode: SelectMode) {
    return mode === 'object' || mode === 'vertex' || mode === 'edge' || mode === 'face'
  }

  /** 1–4 / 5 / 6 stay in the current workspace unless they require another one. */
  function enterSelectMode(mode: SelectMode) {
    if (mode === 'bone') {
      if (appMode.value !== 'rig' && appMode.value !== 'animate') setAppMode('rig')
      selectMode.value = 'bone'
      return
    }
    if (appMode.value === 'uvpaint' || isMeshWorkspace()) {
      selectMode.value = mode
      return
    }
    if (appMode.value === 'rig' || appMode.value === 'animate') return
    setAppMode('model')
    selectMode.value = mode
  }

  function bindGeometryKind(): 'object' | 'vertices' | 'edges' | 'faces' {
    if (selectMode.value === 'vertex') return 'vertices'
    if (selectMode.value === 'edge') return 'edges'
    if (selectMode.value === 'face') return 'faces'
    return 'object'
  }

  function setAppMode(mode: AppMode) {
    const prev = appMode.value
    const leavingBlockout = prev === 'blockout' && mode !== 'blockout'
    const enteringUvPaint = mode === 'uvpaint' && prev !== 'uvpaint'
    const leavingUvPaint = prev === 'uvpaint' && mode !== 'uvpaint'

    if (enteringUvPaint && isMeshSelectMode(selectMode.value)) {
      lastMeshSelectMode.value = selectMode.value
    } else if (enteringUvPaint) {
      lastMeshSelectMode.value = 'object'
    }

    appMode.value = mode
    isBoxSelectActive.value = false

    if (mode === 'animate' || mode === 'rig') {
      selectMode.value = 'bone'
    } else if (enteringUvPaint) {
      selectMode.value = 'face'
    } else if (leavingUvPaint && mode === 'model') {
      selectMode.value = lastMeshSelectMode.value
    } else if ((mode === 'model' || mode === 'blockout') && (selectMode.value === 'bone' || selectMode.value === 'origin')) {
      selectMode.value = 'object'
    }

    if (mode === 'blockout') {
      selectMode.value = 'object'
      modelTool.value = 'move'
    } else if (leavingBlockout && (modelTool.value === 'polydraw' || modelTool.value === 'polybuild')) {
      modelTool.value = 'select'
    }
  }

  function setSelectMode(mode: SelectMode) {
    selectMode.value = mode
  }

  function setModelTool(tool: ModelToolType) {
    if (tool !== modelTool.value) stickyViewNav.value = null
    modelTool.value = tool
    if (tool !== 'select') isBoxSelectActive.value = false
  }

  function toggleBoxSelect() {
    stickyViewNav.value = null
    isBoxSelectActive.value = !isBoxSelectActive.value
  }

  watch(isBoxSelectActive, (active, wasActive) => {
    if (active && !wasActive) {
      if (modelTool.value !== 'select') lastTransformTool.value = modelTool.value
      modelTool.value = 'select'
    } else if (!active && wasActive && modelTool.value === 'select') {
      const restore = lastTransformTool.value
      modelTool.value = restore === 'select' ? 'move' : restore
    }
  }, { flush: 'sync' })

  function setPaintTool(tool: PaintToolType) {
    if (tool !== paintTool.value) stickyViewNav.value = null
    paintTool.value = tool
  }

  function setRigTool(tool: RigToolType) {
    if (tool !== rigTool.value) stickyViewNav.value = null
    rigTool.value = tool
  }

  function setUvHoverFaceIds(ids: string[]) {
    const next = ids.slice()
    const prev = uvHoverFaceIds.value
    if (prev.length === next.length && prev.every((id, i) => id === next[i])) return
    uvHoverFaceIds.value = next
  }

  return {
    appMode,
    selectMode,
    modelTool,
    transformOrientation,
    pivotPoint,
    isBoxSelectActive,
    activeProfileId,
    paintTool,
    rigTool,
    animateTool,
    primaryColor,
    secondaryColor,
    brushSize,
    brushOpacity,
    brushShape,
    brushFilled,
    ditherPattern,
    paletteSnapEnabled,
    stylusPressureEnabled,
    stylusModeNotifications,
    stickyViewportControls,
    stickyViewNav,
    toggleStickyViewNav,
    clearStickyViewNav,
    currentPressure,
    currentPointerType,
    vertexPaintColor,
    uvWorkspaceTab,
    uvHoverFaceIds,
    setUvHoverFaceIds,
    smartUvAngle,
    smartUvMargin,
    subdivideCuts,
    subdivideSmoothness,
    limitedDissolveAngle,
    bridgeSegments,
    bridgeTwist,
    snapping,
    cursor3D,
    viewport,
    isMeshWorkspace,
    isMeshSelectMode,
    enterSelectMode,
    bindGeometryKind,
    setAppMode,
    setSelectMode,
    setModelTool,
    toggleBoxSelect,
    setPaintTool,
    setRigTool,
  }
})
