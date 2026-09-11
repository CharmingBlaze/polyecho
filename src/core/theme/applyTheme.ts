import {
  bestOnSurfaces,
  contrastRatio,
  darkenHex,
  luminance,
  mixHex,
  onColor,
  parseHex,
  rgbDist,
  withAlpha,
} from './colorMath'
import type { ThemeColors } from './themeTokens'

export interface AppliedThemeVars {
  colors: ThemeColors
  well: string
  muted: string
  accentLabel: string
}

export function resolveAppliedColors(colors: ThemeColors): AppliedThemeVars {
  let well = colors.bgActive
  const wellReads =
    Math.max(contrastRatio(well, colors.textPrimary), contrastRatio(well, colors.textAccent)) >= 3.2
  if (rgbDist(well, colors.accentColor) < 90 || !wellReads) {
    well = mixHex(colors.bgPanel, colors.accentColor, luminance(colors.bgPanel) > 0.4 ? 0.14 : 0.26)
  }

  const muted =
    contrastRatio(colors.textMuted, colors.bgPanel) >= 4.5
      ? colors.textMuted
      : mixHex(colors.textPrimary, colors.bgPanel, 0.38)

  const accentLabel = bestOnSurfaces(
    colors.textAccent,
    [colors.bgPanel, colors.bgHeader, well],
    ['#8f3200', '#0d4f4c', '#1a1c1b', '#fff6ea']
  )

  return {
    colors: { ...colors, bgActive: well, textMuted: muted, textAccent: accentLabel },
    well,
    muted,
    accentLabel,
  }
}

export function applyThemeToDocument(themeId: string, colors: ThemeColors, uiScale = 100): AppliedThemeVars {
  const resolved = resolveAppliedColors(colors)
  const c = resolved.colors
  const root = document.documentElement
  root.setAttribute('data-theme', themeId)

  root.style.setProperty('--ui-bg-root', c.bgBase)
  root.style.setProperty('--ui-bg-panel', c.bgPanel)
  root.style.setProperty('--ui-bg-header', c.bgHeader)
  root.style.setProperty('--ui-bg-surface', c.bgSurface)
  root.style.setProperty('--ui-bg-input', c.bgInput)
  root.style.setProperty('--ui-bg-hover', c.bgHover)
  root.style.setProperty('--ui-bg-active', resolved.well)
  root.style.setProperty('--ui-bg-toolbar', c.bgToolbar)
  root.style.setProperty('--ui-bg-status', c.bgStatus)
  root.style.setProperty('--ui-bg-overlay', c.bgOverlay)

  root.style.setProperty('--ui-border-subtle', c.borderSubtle)
  root.style.setProperty('--ui-border-default', c.borderDefault)
  root.style.setProperty('--ui-border-strong', c.borderStrong)
  root.style.setProperty('--ui-border-focus', c.accentColor)

  root.style.setProperty('--ui-text-primary', c.textPrimary)
  root.style.setProperty('--ui-text-secondary', c.textSecondary)
  root.style.setProperty('--ui-text-muted', resolved.muted)
  root.style.setProperty('--ui-text-disabled', c.textDisabled)
  root.style.setProperty('--ui-text-accent', resolved.accentLabel)

  root.style.setProperty('--ui-accent', c.accentColor)
  root.style.setProperty('--ui-on-accent', onColor(c.accentColor))
  root.style.setProperty('--ui-accent-hover', darkenHex(c.accentColor, 0.72))
  const accentRgb = parseHex(c.accentColor)
  if (accentRgb) {
    root.style.setProperty('--ui-accent-subtle', `rgba(${accentRgb[0]}, ${accentRgb[1]}, ${accentRgb[2]}, 0.18)`)
  }

  root.style.setProperty('--ui-selection', c.selectionColor)
  root.style.setProperty('--ui-selection-fill', withAlpha(c.selectionColor, 0.28))
  root.style.setProperty('--ui-viewport-bg', c.viewportBg)
  root.style.setProperty('--ui-grid-major', c.gridMajor)
  root.style.setProperty('--ui-grid-minor', c.gridMinor)
  root.style.setProperty('--ui-gizmo-x', c.gizmoX)
  root.style.setProperty('--ui-gizmo-y', c.gizmoY)
  root.style.setProperty('--ui-gizmo-z', c.gizmoZ)
  root.style.setProperty('--ui-gizmo-accent', c.gizmoAccent)

  root.style.setProperty('--ui-danger', c.danger)
  root.style.setProperty('--ui-warning', c.warning)
  root.style.setProperty('--ui-success', c.success)
  root.style.setProperty('--ui-info', c.info)
  root.style.setProperty('--ui-danger-subtle', withAlpha(c.danger, 0.18))
  root.style.setProperty('--ui-warning-subtle', withAlpha(c.warning, 0.18))
  root.style.setProperty('--ui-success-subtle', withAlpha(c.success, 0.18))

  root.style.setProperty('--ui-vertex', c.vertexColor)
  root.style.setProperty('--ui-edge', c.edgeColor)
  root.style.setProperty('--ui-face', c.faceColor)
  root.style.setProperty('--ui-wire', c.wireColor)
  root.style.setProperty('--ui-outline', c.outlineColor)
  root.style.setProperty('--ui-seam', c.seamColor)
  root.style.setProperty('--ui-bone', c.boneColor)

  root.style.setProperty('--ui-icon-default', resolved.muted)
  root.style.setProperty('--ui-icon-hover', c.textPrimary)
  root.style.setProperty('--ui-icon-active', resolved.accentLabel)
  root.style.setProperty('--ui-shadow', withAlpha('#000000', luminance(c.bgBase) > 0.5 ? 0.12 : 0.45))
  root.style.setProperty('--ui-scale-factor', `${uiScale / 100}`)

  root.style.setProperty('--color-ui-base', c.bgBase)
  root.style.setProperty('--color-ui-panel', c.bgPanel)
  root.style.setProperty('--color-ui-header', c.bgHeader)
  root.style.setProperty('--color-ui-input', c.bgInput)
  root.style.setProperty('--color-ui-hover', c.bgHover)
  root.style.setProperty('--color-ui-active', resolved.well)
  root.style.setProperty('--color-ui-border-subtle', c.borderSubtle)
  root.style.setProperty('--color-ui-border-default', c.borderDefault)
  root.style.setProperty('--color-ui-border-strong', c.borderStrong)
  root.style.setProperty('--color-ui-text-primary', c.textPrimary)
  root.style.setProperty('--color-ui-text-secondary', c.textSecondary)
  root.style.setProperty('--color-ui-text-muted', resolved.muted)
  root.style.setProperty('--color-ui-text-accent', resolved.accentLabel)
  root.style.setProperty('--color-ui-accent', c.accentColor)
  root.style.setProperty('--color-ui-selection', c.selectionColor)
  root.style.setProperty('--color-viewport-bg', c.viewportBg)

  window.dispatchEvent(new CustomEvent('theme-changed', { detail: c }))
  return resolved
}
