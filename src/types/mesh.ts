export interface Vector3D {
  x: number
  y: number
  z: number
}

export interface PrimitiveTransform {
  position: Vector3D
  rotation: Vector3D
  scale: Vector3D
}

export interface UV {
  u: number
  v: number
}

export interface Vertex {
  id: string
  position: Vector3D
  normal?: Vector3D
  color?: string // Hex or rgba for retro vertex coloring
  selected?: boolean
  boneWeights?: Record<string, number> // boneId -> weight (0..1)
}

/** Per-object normals, matching Blender Object > Shade Flat / Smooth / Auto Smooth. */
export type MeshShadeMode = 'flat' | 'smooth' | 'auto'

export interface Face {
  id: string
  vertexIds: string[] // 3 or 4 vertices (Tri or Quad)
  uvs: UV[] // 1 UV per vertex in counter-clockwise order
  normal?: Vector3D
  materialIndex: number
  selected?: boolean
}

export interface Edge {
  id: string
  v1: string
  v2: string
  selected?: boolean
  seam?: boolean
}

export interface MirrorModifier {
  enabled: boolean
  axisX: boolean
  axisY: boolean
  axisZ: boolean
  clipping: boolean
  merge: boolean
  mergeThreshold: number
  flipU: boolean
  flipV: boolean
  /** Cut and keep the + side of each enabled axis before mirroring. */
  bisect?: boolean
}

export type SubdivisionType = 'catmull-clark' | 'simple'

export interface SubdivisionModifier {
  enabled: boolean
  level: number
  type?: SubdivisionType
}

export interface SolidifyModifier {
  enabled: boolean
  thickness: number
  /** -1 original stays / shell inward, 0 centered, +1 original stays / shell outward. */
  offset: number
  /** Boundary quads connecting the two shells. Default true. */
  fillRim?: boolean
}

export interface BevelModifierConfig {
  enabled: boolean
  offset: number
}

export interface MeshObject {
  id: string
  name: string
  parentId?: string
  parentBoneId?: string
  parentType?: 'object' | 'bone' | 'vertex' | 'edge' | 'face'
  vertices: Vertex[]
  faces: Face[]
  position: Vector3D
  rotation: Vector3D // Euler in degrees
  scale: Vector3D
  visible: boolean
  locked: boolean
  materialId: string
  armatureId?: string
  mirror?: MirrorModifier
  subdivision?: SubdivisionModifier
  solidify?: SolidifyModifier
  bevelModifier?: BevelModifierConfig
  shadeMode?: MeshShadeMode
  /** Degrees. Edges sharper than this stay flat when `shadeMode` is `auto`. Default 30. */
  autoSmoothAngle?: number
  seamEdgeIds?: string[]
}
