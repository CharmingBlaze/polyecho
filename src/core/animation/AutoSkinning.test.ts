import { describe, expect, it } from 'vitest'
import { createCube } from '../geometry/Primitives'
import { autoWeightMeshToArmature } from './AutoSkinning'
import type { Bone } from '../../types/animation'

function bone(id: string, parentId: string | null, y: number): Bone {
  return {
    id,
    name: id,
    parentId,
    head: { x: 0, y, z: 0 },
    tail: { x: 0, y: y + 1, z: 0 },
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    childrenIds: [],
    roll: 0
  }
}

describe('AutoSkinning', () => {
  it('assigns at most four normalized influences per vertex', () => {
    const cube = createCube('Cube', 2)
    const bones = [bone('root', null, 0), bone('limb', 'root', 1), bone('tip', 'limb', 2)]
    autoWeightMeshToArmature(cube, bones, { maxInfluences: 4 })

    for (const vertex of cube.vertices) {
      const weights = Object.values(vertex.boneWeights || {})
      expect(weights.length).toBeGreaterThan(0)
      expect(weights.length).toBeLessThanOrEqual(4)
      const sum = weights.reduce((a, b) => a + b, 0)
      expect(sum).toBeGreaterThan(0.99)
      expect(sum).toBeLessThan(1.01)
    }
  })
})
