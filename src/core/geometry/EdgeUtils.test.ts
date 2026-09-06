import { describe, expect, it } from 'vitest'
import { createCube } from './Primitives'
import { getMeshEdges, parseUndirectedEdgeId, undirectedEdgeId } from './EdgeUtils'

describe('EdgeUtils', () => {
  it('does not split vertex ids that contain underscores', () => {
    const id = undirectedEdgeId('v_ab', 'v_c')
    const parsed = parseUndirectedEdgeId(id, ['v_ab', 'v_c', 'v_a'])
    expect(parsed).toEqual({ v1: 'v_ab', v2: 'v_c' })
  })

  it('returns null when an endpoint is missing', () => {
    expect(parseUndirectedEdgeId('v_a_v_b', ['v_a'])).toBeNull()
  })

  it('derives 12 unique edges from a cube', () => {
    const cube = createCube('Cube', 2)
    const edges = getMeshEdges(cube)
    expect(edges).toHaveLength(12)
    expect(new Set(edges.map(e => e.id)).size).toBe(12)
  })
})
