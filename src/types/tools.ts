export type AppMode = 'model' | 'uvpaint' | 'rig' | 'animate' | 'export'

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
  | 'merge'
  | 'delete'
  | 'flip_normals'

export type PaintToolType =
  | 'brush'
  | 'eraser'
  | 'bucket'
  | 'picker'
  | 'line'
  | 'dither'

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
  | 'weight_paint'

export interface SnappingSettings {
  grid: boolean
  gridSize: number // e.g. 0.25, 0.5, 1.0
  vertex: boolean
  angle: number // e.g. 15, 45, 90 deg
}

export interface ViewportSettings {
  shading: 'solid' | 'wireframe' | 'textured' | 'psx'
  showGrid: boolean
  showAxes: boolean
  showNormals: boolean
  showBones: boolean
  psxJitter: boolean
  psxAffine: boolean
  dither: boolean
  crtFilter: boolean
  resolutionScale: number // 1 = crisp, 0.5 = 240p retro, 0.25 = 120p
  quadView: boolean // Professional 4-split view (Top, Front, Right, Persp)
  xray: boolean // Blender X-Ray mode (transparent meshes, see through & select occluded elements)
  shadeMode: 'flat' | 'smooth' // 'flat' (face normals, default for low-poly) | 'smooth' (interpolated vertex normals)
  invertZoom: boolean // Invert trackpad / wheel zoom direction
}
