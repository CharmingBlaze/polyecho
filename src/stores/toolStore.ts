import { defineStore } from 'pinia'
import { ref } from 'vue'
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

  // Painting settings
  const primaryColor = ref<string>('#ffffff')
  const secondaryColor = ref<string>('#181425')
  const brushSize = ref<number>(1)
  const brushOpacity = ref<number>(1.0)
  const brushShape = ref<'square' | 'circle'>('square')
  const brushFilled = ref<boolean>(false)
  const ditherPattern = ref<string>('bayer4x4')

  // Stylus & Touch Settings
  const stylusPressureEnabled = ref<boolean>(true)
  const currentPressure = ref<number>(1.0)
  const currentPointerType = ref<'mouse' | 'pen' | 'touch'>('mouse')

  // Vertex Painting settings
  const vertexPaintColor = ref<string>('#ffffff')
  const vertexBrushRadius = ref<number>(0.8)
  const vertexBrushFalloff = ref<number>(0.5) // 0 = hard, 1 = smooth falloff
  const vertexBrushBlend = ref<'mix' | 'add' | 'multiply'>('mix')
  const paintTarget = ref<'texture' | 'vertex'>('texture')
  const uvWorkspaceTab = ref<'uv' | 'paint' | 'vertex'>('uv')

  // Snapping & Precision
  const snapping = ref<SnappingSettings>({
    grid: true,
    gridSize: 0.5,
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
    wireframeOpacity: 0.6,
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
  })

  function setAppMode(mode: AppMode) {
    appMode.value = mode
    if (mode === 'model' && selectMode.value === 'bone') {
      selectMode.value = 'object'
    } else if (mode === 'animate' || mode === 'rig') {
      selectMode.value = 'bone'
    }
  }

  function setSelectMode(mode: SelectMode) {
    selectMode.value = mode
  }

  function setModelTool(tool: ModelToolType) {
    modelTool.value = tool
  }

  function setPaintTool(tool: PaintToolType) {
    paintTool.value = tool
  }

  function setRigTool(tool: RigToolType) {
    rigTool.value = tool
  }

  return {
    appMode,
    selectMode,
    modelTool,
    transformOrientation,
    pivotPoint,
    isBoxSelectActive,
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
    stylusPressureEnabled,
    currentPressure,
    currentPointerType,
    vertexPaintColor,
    vertexBrushRadius,
    vertexBrushFalloff,
    vertexBrushBlend,
    paintTarget,
    uvWorkspaceTab,
    snapping,
    cursor3D,
    viewport,
    setAppMode,
    setSelectMode,
    setModelTool,
    setPaintTool,
    setRigTool,
  }
})
