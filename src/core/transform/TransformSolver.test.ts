import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { TransformSolver } from './TransformSolver'
import type { TransformBasis } from './TransformTypes'

const globalBasis: TransformBasis = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
  origin: new THREE.Vector3()
}

describe('TransformSolver', () => {
  it('uses numeric move on the constrained axis', () => {
    const zero = new THREE.Vector3()
    const ray = new THREE.Ray(zero, new THREE.Vector3(0, 0, -1))
    const dx = TransformSolver.solveMoveDelta(zero, zero, ray, ray, zero, globalBasis, 'X', 1.5)
    expect(dx.x).toBeCloseTo(1.5)
    expect(dx.y).toBeCloseTo(0)
    expect(dx.z).toBeCloseTo(0)
  })

  it('returns the typed scale factor and rotation in radians', () => {
    expect(TransformSolver.solveScaleFactor({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 0 }, 2)).toBe(2)
    expect(TransformSolver.solveRotationAngle({ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 0 }, 90))
      .toBeCloseTo(Math.PI / 2)
  })
})
