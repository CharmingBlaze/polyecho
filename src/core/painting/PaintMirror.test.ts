import { describe, expect, it } from 'vitest'
import { mirrorPixels, mirrorUvs } from './PaintMirror'

describe('paint mirror', () => {
  it('flips across the texture center and keeps the original first', () => {
    expect(mirrorPixels(1, 2, 8, 8, true, false)).toEqual([
      { x: 1, y: 2 },
      { x: 6, y: 2 }
    ])
    expect(mirrorPixels(1, 2, 8, 8, false, true)).toEqual([
      { x: 1, y: 2 },
      { x: 1, y: 5 }
    ])
    expect(mirrorPixels(1, 2, 8, 8, true, true)).toEqual([
      { x: 1, y: 2 },
      { x: 6, y: 2 },
      { x: 1, y: 5 },
      { x: 6, y: 5 }
    ])
  })

  it('does not duplicate a pixel that sits on the mirror line', () => {
    expect(mirrorPixels(3, 1, 7, 4, true, false)).toEqual([{ x: 3, y: 1 }])
  })

  it('mirrors UVs the same way', () => {
    const mirrored = mirrorUvs({ u: 0.25, v: 0.8 }, true, true).map(point => ({
      u: Math.round(point.u * 1000) / 1000,
      v: Math.round(point.v * 1000) / 1000
    }))
    expect(mirrored).toEqual([
      { u: 0.25, v: 0.8 },
      { u: 0.75, v: 0.8 },
      { u: 0.25, v: 0.2 },
      { u: 0.75, v: 0.2 }
    ])
  })
})
