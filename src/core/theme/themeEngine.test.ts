import { describe, expect, it } from 'vitest'
import { applyThemeToDocument, resolveAppliedColors } from './applyTheme'
import { contrastRatio } from './colorMath'
import { BUILTIN_THEME_PRESETS, resolvedPresetColors } from './themePresets'
import { completeThemeColors, mergeThemeColors, sanitizeColorOverrides } from './themeTokens'

describe('theme engine', () => {
  it('completes every builtin preset to the full token set', () => {
    for (const preset of BUILTIN_THEME_PRESETS) {
      const colors = completeThemeColors(preset.colors)
      expect(colors.bgSurface).toMatch(/^#/)
      expect(colors.danger).toMatch(/^#/)
      expect(colors.vertexColor).toMatch(/^#/)
      expect(colors.boneColor).toMatch(/^#/)
      expect(colors.textDisabled).toMatch(/^#/)
    }
  })

  it('fills missing overlay tokens from chrome', () => {
    const seed = resolvedPresetColors(BUILTIN_THEME_PRESETS[0]!)
    const { bgSurface, vertexColor, danger, ...required } = seed
    const completed = completeThemeColors(required)
    expect(completed.bgSurface).toBeTruthy()
    expect(completed.vertexColor).toBe(seed.selectionColor)
    expect(completed.danger).toBe('#e05555')
    expect(bgSurface).toBeTruthy()
  })

  it('remaps an active well that collides with the accent', () => {
    const base = resolvedPresetColors(BUILTIN_THEME_PRESETS[0]!)
    const collided = { ...base, bgActive: base.accentColor }
    const resolved = resolveAppliedColors(collided)
    expect(resolved.well.toLowerCase()).not.toBe(base.accentColor.toLowerCase())
    expect(contrastRatio(resolved.well, base.textPrimary)).toBeGreaterThan(1.4)
  })

  it('writes CSS variables onto the document', () => {
    const colors = resolvedPresetColors(BUILTIN_THEME_PRESETS[0]!)
    applyThemeToDocument('polyecho_default', colors, 110)
    const root = document.documentElement
    expect(root.getAttribute('data-theme')).toBe('polyecho_default')
    expect(root.style.getPropertyValue('--ui-bg-root')).toBe(colors.bgBase)
    expect(root.style.getPropertyValue('--ui-accent')).toBe(colors.accentColor)
    expect(root.style.getPropertyValue('--ui-danger')).toBe(colors.danger)
    expect(root.style.getPropertyValue('--ui-vertex')).toBe(colors.vertexColor)
    expect(root.style.getPropertyValue('--ui-scale-factor')).toBe('1.1')
    expect(root.style.getPropertyValue('--ui-on-accent')).toMatch(/^#/)
  })

  it('merges and sanitizes color overrides', () => {
    const base = resolvedPresetColors(BUILTIN_THEME_PRESETS[0]!)
    const merged = mergeThemeColors(base, { accentColor: '#00ffaa' })
    expect(merged.accentColor).toBe('#00ffaa')
    expect(merged.bgPanel).toBe(base.bgPanel)
    const clean = sanitizeColorOverrides({
      accentColor: '#abc',
      selectionColor: 'red',
      nope: '#ffffff',
    })
    expect(clean.accentColor).toBe('#abc')
    expect(clean.selectionColor).toBeUndefined()
  })
})
