export type AppMode = 'model' | 'blockout' | 'uvpaint' | 'rig' | 'animate' | 'export'

export type SelectMode = 'object' | 'vertex' | 'edge' | 'face' | 'origin' | 'bone'

export type TransformMode = 'translate' | 'rotate' | 'scale'

export type ModelToolType = 
  | 'select'
  | 'move'
  | 'rotate'
  | 'scale'
  | 'extrude'
  | 'inset'
  | 'subdivide'
  | 'knife'
  | 'polydraw'
  | 'merge'
  | 'delete'
  | 'flip_normals'

export type PaintToolType =
  | 'brush'
  | 'eraser'
  | 'bucket'
  | 'picker'
  | 'line'
  | 'rect'
  | 'circle'
  | 'dither'
  | 'shade'
  | 'select'

export type RigToolType =
  | 'select_bone'
  | 'add_bone'
  | 'extrude_bone'
  | 'subdivide_bone'
  | 'symmetrize'
  | 'parent_mesh'
  | 'auto_weight'

export type AnimateToolType =
  | 'select_bone'
  | 'add_bone'
  | 'pose'
export type TransformOrientation = 'global' | 'local' | 'normal' | 'view' | 'cursor'

export type PivotPoint = 'median' | 'individual' | 'cursor' | 'active'

export type SnapTarget = 'increment' | 'vertex' | 'edge' | 'face'

export interface SnappingSettings {
  grid: boolean
  gridSize: number // e.g. 0.1, 0.25, 0.5, 1.0
  vertex: boolean
  edge: boolean
  face: boolean
  target: SnapTarget
  angle: number // e.g. 15, 45, 90 deg
  autoMerge?: boolean
  autoMergeThreshold?: number
}

export interface ViewportSettings {
  shading: 'solid' | 'wireframe' | 'textured' | 'psx'
  showGrid: boolean
  showAxes: boolean
  showNormals: boolean
  showBones: boolean
  faceOrientation: boolean // Cobalt Blue (front) / Crimson Red (backface) diagnostic overlay
  wireframeOpacity: number // 0 to 1
  psxJitter: boolean
  psxAffine: boolean
  dither: boolean
  crtFilter: boolean
  resolutionScale: number // 1 = crisp, 0.5 = 240p retro, 0.25 = 120p
  quadView: boolean // Professional 4-split view (Top, Front, Right, Persp)
  xray: boolean // Blender X-Ray mode (transparent meshes, see through & select occluded elements)
  shadeMode: 'flat' | 'smooth' // Fallback when a mesh has no shadeMode; object Shade Flat/Smooth/Auto is MeshObject.shadeMode
  symmetryX: boolean // Live X-axis mirror modeling
  symmetryY: boolean
  symmetryZ: boolean
  invertZoom: boolean // Invert trackpad / wheel zoom direction
}
