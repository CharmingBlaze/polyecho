import * as THREE from 'three'
import { TransformBasis, AxisConstraint } from './TransformTypes'

export class TransformSolver {
  /**
   * Raycasts onto a camera view plane passing through pivot.
   */
  static rayPlaneIntersect(
    ray: THREE.Ray,
    pivot: THREE.Vector3,
    camera: THREE.Camera
  ): THREE.Vector3 | null {
    const planeNormal = new THREE.Vector3()
    camera.getWorldDirection(planeNormal).negate()
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, pivot)
    const hit = new THREE.Vector3()
    return ray.intersectPlane(plane, hit) ? hit : null
  }

  /**
   * Calculates the closest point on a 3D constraint line from a camera ray.
   */
  static rayLineClosestPoint(
    ray: THREE.Ray,
    linePoint: THREE.Vector3,
    lineDir: THREE.Vector3
  ): number {
    const u = lineDir.clone().normalize()
    const v = ray.direction.clone().normalize()
    const w0 = linePoint.clone().sub(ray.origin)

    const a = u.dot(u) // 1
    const b = u.dot(v)
    const c = v.dot(v) // 1
    const d = u.dot(w0)
    const e = v.dot(w0)

    const denom = a * c - b * b
    if (Math.abs(denom) > 1e-4) {
      const t = (b * e - c * d) / denom
      return t
    }
    return 0
  }

  /**
   * Solves move delta with axis or plane constraints applied.
   */
  static solveMoveDelta(
    startHit: THREE.Vector3,
    currentHit: THREE.Vector3,
    startRay: THREE.Ray,
    currentRay: THREE.Ray,
    pivot: THREE.Vector3,
    basis: TransformBasis,
    constraint: AxisConstraint,
    numericVal: number | null
  ): THREE.Vector3 {
    if (numericVal !== null) {
      if (constraint === 'X') return basis.x.clone().multiplyScalar(numericVal)
      if (constraint === 'Y') return basis.y.clone().multiplyScalar(numericVal)
      if (constraint === 'Z') return basis.z.clone().multiplyScalar(numericVal)
      return basis.x.clone().multiplyScalar(numericVal)
    }

    if (constraint === 'X') {
      const tStart = this.rayLineClosestPoint(startRay, pivot, basis.x)
      const tCur = this.rayLineClosestPoint(currentRay, pivot, basis.x)
      return basis.x.clone().multiplyScalar(tCur - tStart)
    } else if (constraint === 'Y') {
      const tStart = this.rayLineClosestPoint(startRay, pivot, basis.y)
      const tCur = this.rayLineClosestPoint(currentRay, pivot, basis.y)
      return basis.y.clone().multiplyScalar(tCur - tStart)
    } else if (constraint === 'Z') {
      const tStart = this.rayLineClosestPoint(startRay, pivot, basis.z)
      const tCur = this.rayLineClosestPoint(currentRay, pivot, basis.z)
      return basis.z.clone().multiplyScalar(tCur - tStart)
    } else if (constraint === 'XY') {
      const delta = currentHit.clone().sub(startHit)
      const projZ = basis.z.clone().multiplyScalar(delta.dot(basis.z))
      return delta.sub(projZ)
    } else if (constraint === 'XZ') {
      const delta = currentHit.clone().sub(startHit)
      const projY = basis.y.clone().multiplyScalar(delta.dot(basis.y))
      return delta.sub(projY)
    } else if (constraint === 'YZ') {
      const delta = currentHit.clone().sub(startHit)
      const projX = basis.x.clone().multiplyScalar(delta.dot(basis.x))
      return delta.sub(projX)
    }

    // Unconstrained FREE
    return currentHit.clone().sub(startHit)
  }

  /**
   * Solves signed scale factor relative to screen-projected pivot.
   */
  static solveScaleFactor(
    startMouse: { x: number; y: number },
    currentMouse: { x: number; y: number },
    pivotScreen: { x: number; y: number },
    numericVal: number | null
  ): number {
    if (numericVal !== null) return numericVal

    const startVec = new THREE.Vector2(startMouse.x - pivotScreen.x, startMouse.y - pivotScreen.y)
    const curVec = new THREE.Vector2(currentMouse.x - pivotScreen.x, currentMouse.y - pivotScreen.y)
    const startLen = startVec.length() || 30

    const dot = curVec.dot(startVec)
    const direction = Math.sign(dot) || 1
    const factor = (curVec.length() / startLen) * direction

    return factor
  }

  /**
   * Solves continuous angular rotation delta.
   */
  static solveRotationAngle(
    startMouse: { x: number; y: number },
    currentMouse: { x: number; y: number },
    pivotScreen: { x: number; y: number },
    numericDegrees: number | null
  ): number {
    if (numericDegrees !== null) {
      return THREE.MathUtils.degToRad(numericDegrees)
    }

    const a0 = Math.atan2(startMouse.y - pivotScreen.y, startMouse.x - pivotScreen.x)
    const a1 = Math.atan2(currentMouse.y - pivotScreen.y, currentMouse.x - pivotScreen.x)
    return a1 - a0
  }
}
