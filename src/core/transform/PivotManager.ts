import * as THREE from 'three'
import { EditableMesh } from '../mesh/MeshKernel'
import { PivotMode, TransformBasis, TransformOrientation } from './TransformTypes'

export class PivotManager {
  static calculatePivot(
    mesh: EditableMesh,
    selectedVertIds: number[],
    selectedFaceIds: number[],
    mode: PivotMode = 'MEDIAN',
    cursorPos?: THREE.Vector3
  ): THREE.Vector3 {
    if (mode === 'CURSOR' && cursorPos) {
      return cursorPos.clone()
    }

    const positions: THREE.Vector3[] = []

    if (selectedFaceIds.length > 0) {
      for (const fId of selectedFaceIds) {
        const face = mesh.faces.get(fId)
        if (face) {
          face.vertexIds.forEach(vid => {
            const v = mesh.vertices.get(vid)
            if (v) positions.push(v.position)
          })
        }
      }
    } else if (selectedVertIds.length > 0) {
      for (const vid of selectedVertIds) {
        const v = mesh.vertices.get(vid)
        if (v) positions.push(v.position)
      }
    }

    if (positions.length === 0) {
      return new THREE.Vector3(0, 0, 0)
    }

    if (mode === 'BOUNDING_BOX') {
      const box = new THREE.Box3()
      positions.forEach(p => box.expandByPoint(p))
      return box.getCenter(new THREE.Vector3())
    }

    // Default Median Point
    const pivot = new THREE.Vector3()
    positions.forEach(p => pivot.add(p))
    pivot.divideScalar(positions.length)
    return pivot
  }

  static getBasis(
    orientation: TransformOrientation,
    camera: THREE.Camera,
    customNormal?: THREE.Vector3,
    objectRotation?: THREE.Euler
  ): TransformBasis {
    const origin = new THREE.Vector3(0, 0, 0)

    if (orientation === 'VIEW') {
      const z = new THREE.Vector3()
      camera.getWorldDirection(z).negate()
      const x = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).normalize()
      const y = new THREE.Vector3().crossVectors(z, x).normalize()
      return { x, y, z, origin }
    } else if (orientation === 'NORMAL' && customNormal) {
      const z = customNormal.clone().normalize()
      const up = Math.abs(z.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
      const x = new THREE.Vector3().crossVectors(up, z).normalize()
      const y = new THREE.Vector3().crossVectors(z, x).normalize()
      return { x, y, z, origin }
    } else if (orientation === 'LOCAL' && objectRotation) {
      const q = new THREE.Quaternion().setFromEuler(objectRotation)
      const x = new THREE.Vector3(1, 0, 0).applyQuaternion(q).normalize()
      const y = new THREE.Vector3(0, 1, 0).applyQuaternion(q).normalize()
      const z = new THREE.Vector3(0, 0, 1).applyQuaternion(q).normalize()
      return { x, y, z, origin }
    }

    // Default GLOBAL
    return {
      x: new THREE.Vector3(1, 0, 0),
      y: new THREE.Vector3(0, 1, 0),
      z: new THREE.Vector3(0, 0, 1),
      origin
    }
  }
}
