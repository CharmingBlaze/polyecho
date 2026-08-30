import * as THREE from 'three'
import { Bone } from '../../types/animation'
import { computeBoneWorldMatrix } from '../geometry/Converters'

export interface IKSolveTarget {
  endBoneId: string
  targetPosition: THREE.Vector3
  chainLength?: number
  poleTarget?: THREE.Vector3
}

/**
 * Analytical Two-Bone IK Solver (Law of Cosines for limbs like Arms & Legs)
 */
export function solveTwoBoneIK(
  rootBone: Bone,
  midBone: Bone,
  endBone: Bone,
  targetPos: THREE.Vector3,
  allBones: Bone[],
  poleTarget?: THREE.Vector3
): { rootRot: THREE.Euler; midRot: THREE.Euler } | null {
  const pMat = rootBone.parentId ? computeBoneWorldMatrix(allBones.find(b => b.id === rootBone.parentId)!, allBones) : new THREE.Matrix4()
  const pMatInv = pMat.clone().invert()

  // Local positions relative to parent of rootBone
  const a = new THREE.Vector3(rootBone.head.x, rootBone.head.y, rootBone.head.z)
  const b = new THREE.Vector3(midBone.head.x, midBone.head.y, midBone.head.z)
  const c = new THREE.Vector3(endBone.head.x, endBone.head.y, endBone.head.z)

  const l1 = a.distanceTo(b) || 1.0
  const l2 = b.distanceTo(c) || 1.0

  const targetLocal = targetPos.clone().applyMatrix4(pMatInv)
  const at = targetLocal.clone().sub(a)
  const dist = Math.min(l1 + l2 - 0.001, Math.max(Math.abs(l1 - l2) + 0.001, at.length()))

  // Law of cosines
  const cosAlpha = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist)
  const alpha = Math.acos(Math.max(-1, Math.min(1, cosAlpha)))

  // Direction to target
  const dirTarget = at.clone().normalize()

  // Default bend plane axis
  let bendAxis = new THREE.Vector3(0, 0, 1)
  if (poleTarget) {
    const poleLocal = poleTarget.clone().applyMatrix4(pMatInv).sub(a)
    bendAxis = new THREE.Vector3().crossVectors(dirTarget, poleLocal).normalize()
    if (bendAxis.lengthSq() < 0.001) bendAxis.set(0, 0, 1)
  }

  // Calculate mid bone world-ish position relative to A
  const rotA = new THREE.Quaternion().setFromAxisAngle(bendAxis, alpha)
  const dirUpper = dirTarget.clone().applyQuaternion(rotA).normalize()

  const solvedMidPos = a.clone().addScaledVector(dirUpper, l1)
  const dirLower = targetLocal.clone().sub(solvedMidPos).normalize()

  // Convert to bone local Euler rotations
  const baseUpperDir = new THREE.Vector3(rootBone.tail.x - rootBone.head.x, rootBone.tail.y - rootBone.head.y, rootBone.tail.z - rootBone.head.z).normalize()
  const baseLowerDir = new THREE.Vector3(midBone.tail.x - midBone.head.x, midBone.tail.y - midBone.head.y, midBone.tail.z - midBone.head.z).normalize()

  const qUpper = new THREE.Quaternion().setFromUnitVectors(baseUpperDir, dirUpper)
  const qLower = new THREE.Quaternion().setFromUnitVectors(baseLowerDir, dirLower)

  return {
    rootRot: new THREE.Euler().setFromQuaternion(qUpper),
    midRot: new THREE.Euler().setFromQuaternion(qLower)
  }
}

/**
 * Fast Cyclic Coordinate Descent (CCD) IK Solver for arbitrary chain lengths
 */
export function solveCCDIK(
  endBoneId: string,
  targetPos: THREE.Vector3,
  allBones: Bone[],
  chainLength = 2,
  iterations = 10
): boolean {
  const chain: Bone[] = []
  let curr = allBones.find(b => b.id === endBoneId)
  while (curr && chain.length < chainLength) {
    chain.push(curr)
    curr = curr.parentId ? allBones.find(b => b.id === curr!.parentId) : undefined
  }

  if (chain.length < 2) return false

  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < chain.length; i++) {
      const bone = chain[i]
      const boneMat = computeBoneWorldMatrix(bone, allBones)
      const bonePivotWorld = new THREE.Vector3(bone.head.x, bone.head.y, bone.head.z).applyMatrix4(boneMat)

      const endBone = chain[0]
      const endMat = computeBoneWorldMatrix(endBone, allBones)
      const endPosWorld = new THREE.Vector3(endBone.tail.x, endBone.tail.y, endBone.tail.z).applyMatrix4(endMat)

      if (endPosWorld.distanceTo(targetPos) < 0.005) {
        return true
      }

      const toEnd = endPosWorld.clone().sub(bonePivotWorld).normalize()
      const toTarget = targetPos.clone().sub(bonePivotWorld).normalize()

      const rotDelta = new THREE.Quaternion().setFromUnitVectors(toEnd, toTarget)

      // Apply rotation step to bone
      const currentQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(
        THREE.MathUtils.degToRad(bone.rotation.x),
        THREE.MathUtils.degToRad(bone.rotation.y),
        THREE.MathUtils.degToRad(bone.rotation.z)
      ))

      currentQuat.premultiply(rotDelta)
      const newEuler = new THREE.Euler().setFromQuaternion(currentQuat)

      bone.rotation.x = Number(THREE.MathUtils.radToDeg(newEuler.x).toFixed(2))
      bone.rotation.y = Number(THREE.MathUtils.radToDeg(newEuler.y).toFixed(2))
      bone.rotation.z = Number(THREE.MathUtils.radToDeg(newEuler.z).toFixed(2))
    }
  }

  return true
}
