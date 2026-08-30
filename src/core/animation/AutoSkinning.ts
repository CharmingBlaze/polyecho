import * as THREE from 'three'
import { MeshObject } from '../../types/mesh'
import { Bone } from '../../types/animation'

/**
 * Calculates the shortest distance from a point to a 3D line segment (bone head -> tail)
 */
function distanceToSegment(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): number {
  const ab = b.clone().sub(a)
  const ap = p.clone().sub(a)
  const abLenSq = ab.lengthSq()

  if (abLenSq === 0) return ap.length()

  // Project point onto line segment, clamped between 0 and 1
  const t = Math.max(0, Math.min(1, ap.dot(ab) / abLenSq))
  const proj = a.clone().addScaledVector(ab, t)
  return p.distanceTo(proj)
}

export interface AutoSkinOptions {
  maxInfluences?: number // default: 4
  falloffPower?: number  // default: 2.0 (inverse square falloff)
  maxDistance?: number   // default: Infinity
}

/**
 * Automatically computes bone weights for all vertices in a mesh based on bone proximity.
 */
export function autoWeightMeshToArmature(
  mesh: MeshObject,
  bones: Bone[],
  options: AutoSkinOptions = {}
): void {
  if (!mesh || !bones || bones.length === 0) return

  const maxInfluences = options.maxInfluences ?? 4
  const falloffPower = options.falloffPower ?? 2.0

  for (const vertex of mesh.vertices) {
    // Compute vertex world position
    const vPos = new THREE.Vector3(
      mesh.position.x + vertex.position.x,
      mesh.position.y + vertex.position.y,
      mesh.position.z + vertex.position.z
    )

    const rawWeights: { boneId: string; rawWeight: number }[] = []

    for (const bone of bones) {
      const head = new THREE.Vector3(bone.head.x, bone.head.y, bone.head.z)
      const tail = new THREE.Vector3(bone.tail.x, bone.tail.y, bone.tail.z)

      const dist = distanceToSegment(vPos, head, tail)
      const safeDist = Math.max(dist, 0.05) // Prevent division by zero
      const weight = 1.0 / Math.pow(safeDist, falloffPower)

      rawWeights.push({ boneId: bone.id, rawWeight: weight })
    }

    // Sort by descending weight and take top maxInfluences
    rawWeights.sort((a, b) => b.rawWeight - a.rawWeight)
    const topWeights = rawWeights.slice(0, maxInfluences)

    // Normalize weights to sum to 1.0
    const totalWeight = topWeights.reduce((sum, w) => sum + w.rawWeight, 0)

    const finalBoneWeights: Record<string, number> = {}
    if (totalWeight > 0) {
      for (const item of topWeights) {
        finalBoneWeights[item.boneId] = Number((item.rawWeight / totalWeight).toFixed(4))
      }
    } else if (bones[0]) {
      finalBoneWeights[bones[0].id] = 1.0
    }

    vertex.boneWeights = finalBoneWeights
  }
}
