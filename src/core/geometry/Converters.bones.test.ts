import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { computeBoneWorldMatrix, computeBoneSkinMatrix, evaluateSkinning, faceTriIndexSets, meshHasSkinWeights, updateThreeGeometryAttributes, meshToThreeGeometry } from './Converters'
import { createCube } from './Primitives'
import type { Bone } from '../../types/animation'

function makeBone(id: string, parentId: string | null, y: number, rotZ = 0): Bone {
  return {
    id,
    name: id,
    parentId,
    head: { x: 0, y, z: 0 },
    tail: { x: 0, y: y + 1, z: 0 },
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: rotZ },
    scale: { x: 1, y: 1, z: 1 },
    childrenIds: [],
    roll: 0
  }
}

describe('bone world matrices', () => {
  it('returns the same matrix from a shared cache', () => {
    const root = makeBone('root', null, 0)
    const child = makeBone('child', 'root', 1, 15)
    const bones = [root, child]
    const cache = new Map<string, THREE.Matrix4>()
    const a = computeBoneWorldMatrix(child, bones, false, cache)
    const b = computeBoneWorldMatrix(child, bones, false, cache)
    expect(a).toBe(b)
    expect(cache.size).toBe(2)
  })

  it('does not mutate a cached world when building skin matrices', () => {
    const root = makeBone('root', null, 0, 20)
    const bones = [root]
    const cache = new Map<string, THREE.Matrix4>()
    const world = computeBoneWorldMatrix(root, bones, false, cache)
    const before = world.toArray()
    computeBoneSkinMatrix(root, bones, cache, new Map())
    expect(world.toArray()).toEqual(before)
  })

  it('skins only weighted vertices and leaves others aliased', () => {
    const cube = createCube('Cube', 2)
    const root = makeBone('root', null, 0, 45)
    cube.vertices[0].boneWeights = { root: 1 }
    const out = evaluateSkinning(cube, cube.vertices, [root])
    expect(out[0]).not.toBe(cube.vertices[0])
    expect(out[1]).toBe(cube.vertices[1])
  })

  it('splits quads on the shorter diagonal', () => {
    const verts = [
      { position: { x: 0, y: 0, z: 0 } },
      { position: { x: 2, y: 0, z: 0 } },
      { position: { x: 2, y: 0, z: 1 } },
      { position: { x: 0, y: 0, z: 2 } }
    ]
    expect(faceTriIndexSets(verts)).toEqual([[0, 1, 2], [0, 2, 3]])
  })

  it('updates GPU attributes without changing buffer length', () => {
    const cube = createCube('Cube', 2)
    cube.vertices[0].boneWeights = { root: 1 }
    expect(meshHasSkinWeights(cube)).toBe(true)
    const { geometry } = meshToThreeGeometry(cube, [], [], 'flat', {
      isPoseMode: true,
      bones: [makeBone('root', null, 0, 0)]
    })
    const before = geometry.getAttribute('position').array.length
    const ok = updateThreeGeometryAttributes(
      cube,
      geometry,
      { isPoseMode: true, bones: [makeBone('root', null, 0, 25)] },
      undefined,
      'flat'
    )
    expect(ok).toBe(true)
    expect(geometry.getAttribute('position').array.length).toBe(before)
  })
})
