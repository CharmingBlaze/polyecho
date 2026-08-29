import * as THREE from 'three'

export type TransformOrientation = 'GLOBAL' | 'LOCAL' | 'NORMAL' | 'VIEW'

export type AxisConstraint = 'FREE' | 'X' | 'Y' | 'Z' | 'XY' | 'XZ' | 'YZ'

export type PivotMode = 'MEDIAN' | 'BOUNDING_BOX' | 'INDIVIDUAL_ORIGINS' | 'ACTIVE_ELEMENT' | 'CURSOR'

export interface TransformBasis {
  x: THREE.Vector3
  y: THREE.Vector3
  z: THREE.Vector3
  origin: THREE.Vector3
}

export interface ConstraintState {
  axis: AxisConstraint
  orientation: TransformOrientation
}
