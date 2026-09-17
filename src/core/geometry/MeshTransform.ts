import * as THREE from 'three'
import type { MeshObject } from '../../types/mesh'

const pos = new THREE.Vector3()
const euler = new THREE.Euler()
const quat = new THREE.Quaternion()
const scale = new THREE.Vector3()

const startQuat = new THREE.Quaternion()
const startMatrix = new THREE.Matrix4()
const transformedMatrix = new THREE.Matrix4()
const outEuler = new THREE.Euler()

/** Object TRS. Rotation is stored in degrees on `MeshObject`. */
export function meshObjectWorldMatrix(mesh: MeshObject, out?: THREE.Matrix4): THREE.Matrix4 {
  const target = out ?? new THREE.Matrix4()
  pos.set(mesh.position.x, mesh.position.y, mesh.position.z)
  euler.set(
    THREE.MathUtils.degToRad(mesh.rotation.x),
    THREE.MathUtils.degToRad(mesh.rotation.y),
    THREE.MathUtils.degToRad(mesh.rotation.z)
  )
  quat.setFromEuler(euler)
  scale.set(mesh.scale.x, mesh.scale.y, mesh.scale.z)
  return target.compose(pos, quat, scale)
}

/** Drag-start object TRS. Rotation is radians, matching Three.js Euler. */
export type ObjectGizmoStartTRS = {
  position: THREE.Vector3
  rotation: THREE.Euler
  scale: THREE.Vector3
}

/**
 * Apply a world delta from the identity-scale gizmo proxy onto the object's
 * drag-start TRS. Translate / rotate then keep the existing object scale
 * instead of copying the proxy's (1,1,1).
 */
export function applyWorldDeltaToObjectTRS(
  start: ObjectGizmoStartTRS,
  deltaMatrix: THREE.Matrix4,
  outPos: THREE.Vector3,
  outQuat: THREE.Quaternion,
  outScale: THREE.Vector3
): THREE.Euler {
  startQuat.setFromEuler(start.rotation)
  startMatrix.compose(start.position, startQuat, start.scale)
  transformedMatrix.multiplyMatrices(deltaMatrix, startMatrix)
  transformedMatrix.decompose(outPos, outQuat, outScale)
  return outEuler.setFromQuaternion(outQuat)
}
