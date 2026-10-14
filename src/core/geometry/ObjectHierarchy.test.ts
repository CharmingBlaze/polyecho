import { describe, expect, it } from 'vitest'
import { isDescendantOf } from './ObjectHierarchy'

const meshes = [
  { id: 'root' },
  { id: 'child', parentId: 'root' },
  { id: 'leaf', parentId: 'child' }
]

describe('ObjectHierarchy', () => {
  it('does not treat an object as its own descendant', () => {
    expect(isDescendantOf(meshes, 'root', 'root')).toBe(false)
    expect(isDescendantOf(meshes, 'child', 'child')).toBe(false)
  })

  it('detects a parent under a proposed child', () => {
    expect(isDescendantOf(meshes, 'root', 'leaf')).toBe(true)
    expect(isDescendantOf(meshes, 'leaf', 'root')).toBe(false)
  })

  it('stops on a parent cycle instead of looping', () => {
    const loop = [
      { id: 'a', parentId: 'b' },
      { id: 'b', parentId: 'a' }
    ]
    expect(isDescendantOf(loop, 'a', 'b')).toBe(true)
    expect(isDescendantOf(loop, 'x', 'a')).toBe(false)
  })
})
