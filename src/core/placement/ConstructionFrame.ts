import * as THREE from 'three'

export interface ConstructionFrame {
  origin: THREE.Vector3
  axisU: THREE.Vector3 // horizontal axis in view/plane
  axisV: THREE.Vector3 // vertical axis in view/plane
  axisW: THREE.Vector3 // normal / extrusion axis out of plane
}

export class ConstructionFrameResolver {
  /**
   * Resolves the construction frame for a specific viewport or surface normal.
   */
  static getFrameForViewport(
    viewportKind: 'persp' | 'top' | 'front' | 'right',
    origin = new THREE.Vector3(),
    surfaceNormal?: THREE.Vector3
  ): ConstructionFrame {
    // If a valid surface normal is provided (e.g. placing directly on a face)
    if (surfaceNormal && surfaceNormal.lengthSq() > 1e-4) {
      return this.getFrameFromSurfaceNormal(origin, surfaceNormal)
    }

    switch (viewportKind) {
      case 'top':
        // Top view: U = X, V = Z, W = Y
        return {
          origin: origin.clone(),
          axisU: new THREE.Vector3(1, 0, 0),
          axisV: new THREE.Vector3(0, 0, 1),
          axisW: new THREE.Vector3(0, 1, 0)
        }

      case 'front':
        // Front view: U = X, V = Y, W = Z
        return {
          origin: origin.clone(),
          axisU: new THREE.Vector3(1, 0, 0),
          axisV: new THREE.Vector3(0, 1, 0),
          axisW: new THREE.Vector3(0, 0, 1)
        }

      case 'right':
        // Right view: U = Z, V = Y, W = X
        return {
          origin: origin.clone(),
          axisU: new THREE.Vector3(0, 0, 1),
          axisV: new THREE.Vector3(0, 1, 0),
          axisW: new THREE.Vector3(1, 0, 0)
        }

      case 'persp':
      default:
        // Default Ground XZ Plane: U = X, V = Z, W = Y
        return {
          origin: origin.clone(),
          axisU: new THREE.Vector3(1, 0, 0),
          axisV: new THREE.Vector3(0, 0, 1),
          axisW: new THREE.Vector3(0, 1, 0)
        }
    }
  }

  /**
   * Builds an orthonormal basis from a surface normal.
   */
  static getFrameFromSurfaceNormal(origin: THREE.Vector3, normal: THREE.Vector3): ConstructionFrame {
    const W = normal.clone().normalize()
    const reference = Math.abs(W.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
    const U = new THREE.Vector3().crossVectors(reference, W).normalize()
    const V = new THREE.Vector3().crossVectors(W, U).normalize()

    return {
      origin: origin.clone(),
      axisU: U,
      axisV: V,
      axisW: W
    }
  }

  /**
   * Converts a 3D vector delta into (u, v, w) scalar coordinates within the frame.
   */
  static projectToUVW(delta: THREE.Vector3, frame: ConstructionFrame): { u: number; v: number; w: number } {
    return {
      u: delta.dot(frame.axisU),
      v: delta.dot(frame.axisV),
      w: delta.dot(frame.axisW)
    }
  }

  /**
   * Converts (u, v, w) scalar coordinates back into a 3D world position from the frame origin.
   */
  static uvwToWorld(u: number, v: number, w: number, frame: ConstructionFrame): THREE.Vector3 {
    return frame.origin.clone()
      .addScaledVector(frame.axisU, u)
      .addScaledVector(frame.axisV, v)
      .addScaledVector(frame.axisW, w)
  }
}
