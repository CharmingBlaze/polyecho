import * as THREE from 'three'

/** Pixel distances stay circular even in narrow split views. */
export function closestScreenSegment(mouse: THREE.Vector2, a: THREE.Vector3, b: THREE.Vector3, width: number, height: number) {
  const delta = new THREE.Vector2((b.x - a.x) * width / 2, (b.y - a.y) * height / 2)
  const offset = new THREE.Vector2((mouse.x - a.x) * width / 2, (mouse.y - a.y) * height / 2)
  const t = delta.lengthSq() ? THREE.MathUtils.clamp(offset.dot(delta) / delta.lengthSq(), 0, 1) : 0
  return { t, distance: offset.addScaledVector(delta, -t).length() }
}

/** Test visibility on the candidate's ray, not at the pointer or an edge midpoint. */
export function visibleWorldPoint(point: THREE.Vector3, camera: THREE.Camera, objects: THREE.Object3D[], xray = false) {
  const ndc = point.clone().project(camera)
  if (ndc.z < -1 || ndc.z > 1) return false
  if (xray) return true
  const ray = new THREE.Raycaster()
  ray.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera)
  const distance = ray.ray.origin.distanceTo(point)
  const tolerance = Math.max(1e-5, distance * 1e-5)
  ray.far = Math.max(0, distance - tolerance)
  return ray.intersectObjects(objects, true).length === 0
}
