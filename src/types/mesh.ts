export interface Vector3D {
  x: number
  y: number
  z: number
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
  mergeThreshold: number // e.g. 0.01m
  flipU: boolean
  flipV: boolean
}

export interface SubdivisionModifier {
  enabled: boolean
  level: number // 1 or 2
}

export interface SolidifyModifier {
  enabled: boolean
  thickness: number
  offset: number
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
  shadeMode?: 'flat' | 'smooth'
  seamEdgeIds?: string[]
}
