import { describe, expect, it } from 'vitest'
import type { Material } from '../../types/texture'
import { applyOrderedDither, colorDepthLabel, rasterizeDitheredFill, suggestedPreviewSource } from './DitherPreview'

function mat(partial: Partial<Material>): Material {
  return {
    id: 'm',
    name: 'M',
    textureId: null,
    color: '#808080',
    shading: 'pbr',
    psxJitter: false,
    psxJitterResolution: 240,
    psxAffine: false,
    dither: true,
    ditherLevel: 32,
    wireframe: false,
    ...partial
  }
}

describe('DitherPreview', () => {
  it('quantizes a mid gray into fewer tones', () => {
    const w = 8
    const h = 1
    const data = new Uint8ClampedArray(w * h * 4)
    for (let x = 0; x < w; x++) {
      const i = x * 4
      data[i] = 128
      data[i + 1] = 128
      data[i + 2] = 128
      data[i + 3] = 255
    }
    applyOrderedDither(data, w, h, { pattern: 'bayer4x4', ditherLevel: 64, colorDepth: 2, scale: 1, channel: 'luma' })
    const unique = new Set([...data].filter((_, i) => i % 4 === 0))
    expect(unique.size).toBeLessThanOrEqual(3)
    expect([...unique].some(v => v === 0 || v === 255 || v === 128)).toBe(true)
  })

  it('stipples alpha as keep-or-checker from luma', () => {
    const data = new Uint8ClampedArray(8)
    data[0] = 240; data[1] = 240; data[2] = 240; data[3] = 255
    data[4] = 8; data[5] = 8; data[6] = 8; data[7] = 255
    applyOrderedDither(data, 2, 1, { pattern: 'bayer4x4', ditherLevel: 32, colorDepth: 32, channel: 'alpha' })
    expect(data[0]).toBe(240)
    expect(data[4]).not.toBe(8)
  })

  it('bakes a solid color into an image without checker punch-out', () => {
    const pixels = rasterizeDitheredFill(
      mat({ color: '#808080', ditherPattern: 'bayer4x4', ditherLevel: 64, colorDepth: 2 }),
      16,
      8,
      'color'
    )
    expect(pixels.width).toBe(16)
    expect(pixels.height).toBe(8)
    const unique = new Set([...pixels.data].filter((_, i) => i % 4 === 0))
    expect(unique.size).toBeGreaterThan(0)
    expect(unique.size).toBeLessThanOrEqual(4)
    expect(pixels.data[3]).toBe(255)
  })

  it('picks a preview source from the fill', () => {
    expect(suggestedPreviewSource(mat({ fill: 'gradient' }))).toBe('gradient')
    expect(suggestedPreviewSource(mat({ fill: 'image', textureId: 't' }))).toBe('image')
    expect(suggestedPreviewSource(mat({ fill: 'solid' }))).toBe('color')
    expect(colorDepthLabel(2)).toBe('Black & white')
  })
})
