import { describe, expect, it } from 'vitest'
import { viewKindFromQuadrant } from './CadCameraRig'

describe('CadCameraRig', () => {
  it('maps split quadrants to CAD cameras', () => {
    expect(viewKindFromQuadrant('main')).toBe('persp')
    expect(viewKindFromQuadrant('col_persp')).toBe('persp')
    expect(viewKindFromQuadrant('col_front')).toBe('front')
    expect(viewKindFromQuadrant('col_side')).toBe('right')
    expect(viewKindFromQuadrant('top_left')).toBe('top')
    expect(viewKindFromQuadrant('bottom_right')).toBe('right')
  })
})
