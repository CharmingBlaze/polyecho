import * as THREE from 'three'
import { MeshObject } from '../../types/mesh'
import { Bone } from '../../types/animation'
import { meshRestMatrix } from './RiggingWorkflow'

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
  method?: 'surface' | 'distance'
  smoothingPasses?: number
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

  const maxInfluences = Math.max(1, Math.min(4, Math.floor(options.maxInfluences || 4)))
  const falloffPower = Math.max(.1, options.falloffPower || 2)
  const matrix = meshRestMatrix(mesh)
  const segments = bones.map(bone => ({ id: bone.id, head: new THREE.Vector3(bone.head.x, bone.head.y, bone.head.z), tail: new THREE.Vector3(bone.tail.x, bone.tail.y, bone.tail.z) }))
  const seeds: Record<string, number>[] = []

  for (const vertex of mesh.vertices) {
    // Compute vertex world position
    const vPos = new THREE.Vector3(
      vertex.position.x, vertex.position.y, vertex.position.z
    ).applyMatrix4(matrix)

    const rawWeights: { boneId: string; rawWeight: number }[] = []

    for (const bone of segments) {
      const dist = distanceToSegment(vPos, bone.head, bone.tail)
      const safeDist = Math.max(dist, 0.05) // Prevent division by zero
      const weight = 1.0 / Math.pow(safeDist, falloffPower)

      rawWeights.push({ boneId: bone.id, rawWeight: weight })
    }

    // Sort by descending weight and take top maxInfluences
    rawWeights.sort((a, b) => b.rawWeight - a.rawWeight)
    seeds.push({ [rawWeights[0].boneId]: 1 })
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

  if (options.method !== 'surface') return
  // Diffuse nearest-bone seeds only along actual mesh edges. Separate pieces do
  // not exchange weights merely because they are close together in world space.
  const byId = new Map(mesh.vertices.map((v, index) => [v.id, index]))
  const neighbors = mesh.vertices.map(() => new Set<number>())
  for (const face of mesh.faces) {
    for (let i = 0; i < face.vertexIds.length; i++) {
      const a = byId.get(face.vertexIds[i]), b = byId.get(face.vertexIds[(i + 1) % face.vertexIds.length])
      if (a !== undefined && b !== undefined && a !== b) { neighbors[a].add(b); neighbors[b].add(a) }
    }
  }
  let weights = seeds
  const passes = Math.max(0, Math.min(32, Math.round(options.smoothingPasses ?? 12)))
  for (let pass = 0; pass < passes; pass++) {
    weights = weights.map((current, i) => {
      if (!neighbors[i].size) return current
      const mixed: Record<string, number> = {}
      for (const [id, w] of Object.entries(seeds[i])) mixed[id] = w * .3
      for (const neighbor of neighbors[i]) {
        for (const [id, w] of Object.entries(weights[neighbor])) mixed[id] = (mixed[id] || 0) + .7 * w / neighbors[i].size
      }
      const top = Object.entries(mixed).sort((a, b) => b[1] - a[1]).slice(0, maxInfluences)
      const total = top.reduce((sum, [, w]) => sum + w, 0)
      return Object.fromEntries(top.map(([id, w]) => [id, w / total]))
    })
  }
  mesh.vertices.forEach((v, i) => { v.boneWeights = weights[i] })
}
