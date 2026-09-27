import { describe, expect, it } from 'vitest'
import {
  DEFAULT_VIEWPORT_LIGHTING,
  psxLightingFromSettings,
  sanitizeViewportLighting,
} from './ViewportLighting'

describe('viewport lighting settings', () => {
  it('defaults to a bright warm sun and a cool sky fill', () => {
    expect(DEFAULT_VIEWPORT_LIGHTING.keyIntensity).toBeGreaterThan(1)
    expect(DEFAULT_VIEWPORT_LIGHTING.keyColor.toLowerCase()).toBe('#ffe7c2')
    expect(DEFAULT_VIEWPORT_LIGHTING.fillColor.toLowerCase()).toBe('#7ec8ff')
    expect(DEFAULT_VIEWPORT_LIGHTING.skyColor.toLowerCase()).toBe('#b7e4ff')
    const lit = psxLightingFromSettings(DEFAULT_VIEWPORT_LIGHTING)
    expect(lit.ambient.b).toBeGreaterThan(lit.ambient.r)
    expect(lit.keyIntensity).toBeGreaterThan(0.9)
  })

  it('fills missing fields and clamps out-of-range values', () => {
    const lit = sanitizeViewportLighting({ keyIntensity: 9, keyColor: 'nope', shadowStrength: -1 })
    expect(lit.keyIntensity).toBe(4)
    expect(lit.keyColor).toBe(DEFAULT_VIEWPORT_LIGHTING.keyColor)
    expect(lit.fillIntensity).toBe(DEFAULT_VIEWPORT_LIGHTING.fillIntensity)
    expect(lit.shadowStrength).toBe(0)
  })

  it('scales the PSX key with the key-light slider', () => {
    const base = psxLightingFromSettings(DEFAULT_VIEWPORT_LIGHTING)
    const brighter = psxLightingFromSettings({ ...DEFAULT_VIEWPORT_LIGHTING, keyIntensity: DEFAULT_VIEWPORT_LIGHTING.keyIntensity * 2 })
    expect(brighter.keyIntensity).toBeCloseTo(base.keyIntensity * 2, 5)
    expect(base.ambient.r).toBeGreaterThan(0.3)
  })
})
