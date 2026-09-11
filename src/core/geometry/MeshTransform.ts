import * as THREE from 'three'
import type { MeshObject } from '../../types/mesh'

const pos = new THREE.Vector3()
const euler = new THREE.Euler()
const quat = new THREE.Quaternion()
const scale = new THREE.Vector3()

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
