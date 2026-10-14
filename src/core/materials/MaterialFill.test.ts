import { describe, expect, it } from 'vitest'
import type { Material } from '../../types/texture'
import {
  defaultGradient,
  gradientCss,
  gradientKey,
  materialFillKey,
  normalizeGradient,
  paintMaterialSwatch,
  resolveMaterialFill,
  resolveMaterialSurface,
  reverseGradient,
  sampleGradient,
  sphereShade,
  gradientParameter
} from './MaterialFill'

function mat(partial: Partial<Material>): Material {
  return {
    id: 'm',
    name: 'M',
    textureId: null,
    color: '#ff0000',
    shading: 'pbr',
    psxJitter: false,
    psxJitterResolution: 240,
    psxAffine: false,
    dither: false,
    ditherLevel: 0,
    wireframe: false,
    ...partial
  }
}

describe('material fill', () => {
  it('treats older materials as an image when a texture is bound', () => {
    expect(resolveMaterialFill(mat({ textureId: 'tex_a' }))).toBe('image')
    expect(resolveMaterialFill(mat({ textureId: null }))).toBe('solid')
    expect(resolveMaterialFill(mat({ fill: 'gradient', textureId: 'tex_a' }))).toBe('gradient')
  })

  it('uses the solid color and ignores the library image', () => {
    const surface = resolveMaterialSurface(mat({ fill: 'solid', textureId: 'tex_a', color: '#112233' }))
    expect(surface.fill).toBe('solid')
    expect(surface.color).toBe('#112233')
    expect(surface.textureId).toBeNull()
  })

  it('keeps an image tint and drops the map for a gradient', () => {
    const image = resolveMaterialSurface(mat({ fill: 'image', textureId: 'tex_a', color: '#abcdef' }))
    expect(image.textureId).toBe('tex_a')
    expect(image.color).toBe('#abcdef')

    const gradient = resolveMaterialSurface(mat({
      fill: 'gradient',
      textureId: 'tex_a',
      gradient: { kind: 'radial', angle: 10, stops: [{ color: '#000000', offset: 0 }, { color: '#ffffff', offset: 1 }] }
    }))
    expect(gradient.textureId).toBeNull()
    expect(gradient.color).toBe('#ffffff')
    expect(gradient.gradient?.kind).toBe('radial')
  })

  it('keeps stop positions and wraps the angle', () => {
    const g = normalizeGradient({
      kind: 'linear',
      angle: -90,
      stops: [
        { color: '#ffffff', offset: 0.4 },
        { color: '#000000', offset: 2 }
      ]
    })
    expect(g.angle).toBe(270)
    expect(g.stops.map(stop => stop.offset)).toEqual([0.4, 1])
    expect(gradientKey(g)).toBe(gradientKey(normalizeGradient(g)))
  })

  it('shifts the halfway color when the midpoint moves', () => {
    const gradient = {
      kind: 'linear' as const,
      angle: 0,
      stops: [
        { color: '#000000', offset: 0, midpoint: 0.8 },
        { color: '#ffffff', offset: 1 }
      ]
    }
    expect(sampleGradient(gradient, 0.8).color.toLowerCase()).toBe('#808080')
    expect(sampleGradient(gradient, 0.4).color.toLowerCase()).not.toBe('#808080')
  })

  it('reverses stops and flips the midpoint', () => {
    const reversed = reverseGradient({
      kind: 'linear',
      angle: 0,
      stops: [
        { color: '#ff0000', offset: 0, midpoint: 0.25 },
        { color: '#0000ff', offset: 1 }
      ]
    })
    expect(reversed.stops[0].color.toLowerCase()).toBe('#0000ff')
    expect(reversed.stops[0].midpoint).toBeCloseTo(0.75)
    expect(reversed.stops[1].offset).toBe(1)
  })

  it('builds a left-to-right ramp that includes the stop colors', () => {
    expect(gradientCss(defaultGradient('#ff00ff'))).toContain('#ff00ff')
    expect(sampleGradient(defaultGradient('#000000'), 0).color.toLowerCase()).toBe('#000000')
    expect(sampleGradient(defaultGradient('#000000'), 1).color.toLowerCase()).not.toBe('#000000')
  })

  it('shades a sphere disk and rejects outside pixels', () => {
    expect(sphereShade(0, 0)).toBeGreaterThan(0.5)
    expect(sphereShade(2, 0)).toBeNull()
  })

  it('paints a red swatch that is brighter in the center than the rim', () => {
    const canvas = document.createElement('canvas')
    canvas.width = 32
    canvas.height = 32
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('expected 2d context')
    paintMaterialSwatch(ctx, 32, 32, mat({ fill: 'solid', color: '#ff0000' }))
    const center = ctx.getImageData(16, 16, 1, 1).data
    const bottom = ctx.getImageData(16, 27, 1, 1).data
    const outside = ctx.getImageData(0, 0, 1, 1).data
    expect(center[0]).toBeGreaterThan(bottom[0])
    expect(center[0]).toBeGreaterThan(80)
    expect(outside[0]).toBeLessThan(40)
  })

  it('maps linear, reflected, and angle samples in UV space', () => {
    const linear = { kind: 'linear' as const, angle: 0, stops: [{ color: '#000000', offset: 0 }, { color: '#ffffff', offset: 1 }] }
    expect(gradientParameter(linear, 0, 0.5)).toBeLessThan(0.5)
    expect(gradientParameter(linear, 1, 0.5)).toBeGreaterThan(0.5)
    const reflected = { ...linear, kind: 'reflected' as const }
    expect(gradientParameter(reflected, 0.5, 0.5)).toBeGreaterThan(0.9)
    expect(gradientParameter(reflected, 0, 0.5)).toBeLessThan(0.4)
    const angle = { ...linear, kind: 'angle' as const, angle: 0 }
    expect(gradientParameter(angle, 1, 0.5)).toBeCloseTo(0, 1)
    expect(normalizeGradient({ kind: 'diamond', angle: 0, stops: linear.stops }).kind).toBe('diamond')
  })

  it('changes the viewport key when the fill changes', () => {
    const solid = mat({ fill: 'solid', color: '#ffffff' })
    const image = mat({ ...solid, fill: 'image', textureId: 'tex_a' })
    expect(materialFillKey(solid)).not.toBe(materialFillKey(image))
  })
})
