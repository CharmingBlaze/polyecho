import * as THREE from 'three'

export type PlacementHitType = 'GRID' | 'FACE' | 'EDGE' | 'VERTEX'
export type PlacementOrientation = 'WORLD' | 'SURFACE'

export interface PlacementHit {
  type: PlacementHitType
  objectId: string | null
  faceId: number | null
  worldPosition: THREE.Vector3
  worldNormal: THREE.Vector3
}

export class SurfacePlacementSolver {
  /**
   * Calculates support offset along the surface normal so that the primitive
   * rests on top of the surface instead of embedding halfway into it.
   */
  static calculateSupportOffset(
    halfDimensions: THREE.Vector3, // e.g. (halfWidth, halfHeight, halfDepth)
    orientation: PlacementOrientation,
    surfaceNormal: THREE.Vector3
  ): number {
    if (orientation === 'SURFACE') {
      // In surface orientation, height is aligned directly with normal
      return halfDimensions.y
    }

    // In world orientation, project bounding box extent onto normal
    const nx = Math.abs(surfaceNormal.x)
    const ny = Math.abs(surfaceNormal.y)
    const nz = Math.abs(surfaceNormal.z)

    return halfDimensions.x * nx + halfDimensions.y * ny + halfDimensions.z * nz
  }

  /**
   * Calculates the final resting position of a primitive on a surface hit.
   */
  static calculateRestingPosition(
    hit: PlacementHit,
    halfDimensions: THREE.Vector3,
    orientation: PlacementOrientation = 'WORLD'
  ): THREE.Vector3 {
    const offset = this.calculateSupportOffset(halfDimensions, orientation, hit.worldNormal)
    return hit.worldPosition.clone().addScaledVector(hit.worldNormal, offset)
  }

  /**
   * Calculates rotation quaternion for surface alignment vs world alignment.
   */
  static calculateRotation(
    hit: PlacementHit,
    orientation: PlacementOrientation = 'WORLD'
  ): THREE.Quaternion {
    if (orientation === 'WORLD') {
      return new THREE.Quaternion()
    }

    const up = new THREE.Vector3(0, 1, 0)
    const q = new THREE.Quaternion()
    q.setFromUnitVectors(up, hit.worldNormal.clone().normalize())
    return q
  }
}
