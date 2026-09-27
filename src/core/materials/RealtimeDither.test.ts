import { describe, expect, it } from 'vitest'
import { ditherPatternIndex, ditherSettingsFromMaterial } from './RealtimeDither'
import { getDitherMatrixValue } from '../../utils/dithering'
import type { Material } from '../../types/texture'

function mat(partial: Partial<Material>): Material {
  return {
    id: 'm',
    name: 'M',
    textureId: null,
    color: '#ffffff',
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

describe('realtime dither', () => {
  it('maps console looks onto distinct pattern ids', () => {
    expect(ditherPatternIndex('bayer4x4')).toBe(0)
    expect(ditherPatternIndex('snes')).toBe(11)
    expect(ditherPatternIndex('saturn_mesh')).toBe(12)
    expect(ditherPatternIndex('dreamcast')).toBe(13)
    expect(ditherPatternIndex('gba')).toBe(14)
    expect(ditherPatternIndex('rgb_shift')).toBe(17)
    expect(ditherPatternIndex('ordered')).toBe(ditherPatternIndex('bayer8x8'))
    expect(ditherPatternIndex('nope')).toBe(0)
  })

  it('reads strength and depth from the material without swapping shading', () => {
    const settings = ditherSettingsFromMaterial(mat({
      shading: 'pbr',
      ditherPattern: 'snes',
      ditherLevel: 16,
      colorDepth: 32,
      ditherScale: 2,
      ditherSpace: 'uv',
      ditherChannel: 'luma'
    }))
    expect(settings.enabled).toBe(true)
    expect(settings.pattern).toBe(11)
    expect(settings.intensity).toBe(0.5)
    expect(settings.depth).toBe(32)
    expect(settings.scale).toBe(2)
    expect(settings.space).toBe(1)
    expect(settings.channel).toBe(1)
  })

  it('keeps new pattern samples inside the dither range', () => {
    for (const pattern of ['snes', 'saturn_mesh', 'dreamcast', 'gba', 'diagonal', 'dots', 'rgb_shift']) {
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          const value = getDitherMatrixValue(x, y, pattern)
          expect(value).toBeGreaterThanOrEqual(-0.5)
          expect(value).toBeLessThanOrEqual(0.5)
        }
      }
    }
    expect(getDitherMatrixValue(0, 0, 'saturn_mesh')).not.toBe(getDitherMatrixValue(1, 0, 'saturn_mesh'))
  })
})
