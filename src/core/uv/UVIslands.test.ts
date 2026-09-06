import { describe, expect, it } from 'vitest'
import { createCube } from '../geometry/Primitives'
import { findUvIslands } from './UVIslands'

describe('UVIslands', () => {
  it('does not merge every cube face into one island', () => {
    const cube = createCube('Cube', 2)
    const islands = findUvIslands(cube)
    expect(islands.length).toBeGreaterThan(1)
    expect(islands.flat().sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5])
  })
})
