import * as THREE from 'three'
import { EditableMesh } from '../mesh/MeshKernel'

export type PrimitiveType =
  | 'BOX'
  | 'PLANE'
  | 'SPHERE'
  | 'ICOSPHERE'
  | 'CYLINDER'
  | 'CONE'
  | 'PYRAMID'
  | 'CIRCLE'
  | 'PRISM'
  | 'TORUS'
  | 'CAPSULE'
  | 'WEDGE'
  | 'TUBE'
  | 'WALL'
  | 'STAIRS'
  | 'ARCH'

export type PrimitiveCreationKind =
  | 'RECTANGULAR'
  | 'RADIAL'
  | 'RADIAL_HEIGHT'
  | 'LINEAR_HEIGHT'
  | 'TORUS'

export interface BoxParameters {
  width: number   // U dimension
  depth: number   // V dimension
  height: number  // W dimension
  segmentsX?: number
  segmentsY?: number
  segmentsZ?: number
}

export interface PlaneParameters {
  width: number
  depth: number
  segmentsX?: number
  segmentsZ?: number
}

export interface SphereParameters {
  radius: number
  segments?: number
  rings?: number
}

export interface IcosphereParameters {
  radius: number
  subdivisions?: number
}

export interface CylinderParameters {
  radius: number
  height: number
  sides?: number
  capTop?: boolean
  capBottom?: boolean
}

export interface ConeParameters {
  radius: number
  height: number
  sides?: number
  capBottom?: boolean
}

export interface PyramidParameters {
  width: number
  depth: number
  height: number
}

export interface CircleParameters {
  radius: number
  sides?: number
  filled?: boolean
}

export interface PrismParameters {
  radius: number
  height: number
  sides?: number
}

export interface TorusParameters {
  majorRadius: number
  tubeRadius: number
  majorSegments?: number
  tubeSegments?: number
}

export interface CapsuleParameters {
  radius: number
  length: number
  segments?: number
  rings?: number
}

export interface WedgeParameters {
  width: number
  depth: number
  height: number
  flipDirection?: boolean
}

export interface TubeParameters {
  outerRadius: number
  innerRadius: number
  height: number
  sides?: number
}

export interface WallParameters {
  length: number
  thickness: number
  height: number
}

export interface StairsParameters {
  width: number
  totalRun: number
  totalHeight: number
  steps: number
}

export interface ArchParameters {
  width: number
  depth: number
  height: number
  openingWidth: number
  openingHeight: number
  segments?: number
}

export type PrimitiveParameters =
  | BoxParameters
  | PlaneParameters
  | SphereParameters
  | IcosphereParameters
  | CylinderParameters
  | ConeParameters
  | PyramidParameters
  | CircleParameters
  | PrismParameters
  | TorusParameters
  | CapsuleParameters
  | WedgeParameters
  | TubeParameters
  | WallParameters
  | StairsParameters
  | ArchParameters
  | Record<string, any>

export interface IPrimitiveBuilder<T extends PrimitiveParameters = PrimitiveParameters> {
  create(params: T): EditableMesh
  createPreviewGeometry?(params: T): THREE.BufferGeometry
}
