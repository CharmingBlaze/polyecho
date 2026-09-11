import { mixHex } from './colorMath'

/** Full resolved theme. Every preset is completed to this shape before apply. */
export interface ThemeColors {
  bgBase: string
  bgPanel: string
  bgHeader: string
  bgInput: string
  bgHover: string
  bgActive: string
  bgSurface: string
  bgToolbar: string
  bgStatus: string
  bgOverlay: string
  borderSubtle: string
  borderDefault: string
  borderStrong: string
  textPrimary: string
  textSecondary: string
  textMuted: string
  textDisabled: string
  textAccent: string
  accentColor: string
  selectionColor: string
  viewportBg: string
  gridMajor: string
  gridMinor: string
  gizmoX: string
  gizmoY: string
  gizmoZ: string
  gizmoAccent: string
  danger: string
  warning: string
  success: string
  info: string
  vertexColor: string
  edgeColor: string
  faceColor: string
  wireColor: string
  outlineColor: string
  seamColor: string
  boneColor: string
}

export type ThemeColorKey = keyof ThemeColors

export interface TokenMeta {
  key: ThemeColorKey
  label: string
  hint: string
}

export interface TokenGroup {
  id: string
  label: string
  hint: string
  keys: ThemeColorKey[]
}

/** Fields every hand-authored preset must supply. The rest are derived. */
export const REQUIRED_THEME_KEYS = [
  'bgBase',
  'bgPanel',
  'bgHeader',
  'bgInput',
  'bgHover',
  'bgActive',
  'borderSubtle',
  'borderDefault',
  'borderStrong',
  'textPrimary',
  'textSecondary',
  'textMuted',
  'textAccent',
  'accentColor',
  'selectionColor',
  'viewportBg',
  'gridMajor',
  'gridMinor',
  'gizmoX',
  'gizmoY',
  'gizmoZ',
  'gizmoAccent',
] as const

export type ThemeColorSeed = Pick<ThemeColors, (typeof REQUIRED_THEME_KEYS)[number]> &
  Partial<ThemeColors>

export const TOKEN_META: Record<ThemeColorKey, TokenMeta> = {
  bgBase: { key: 'bgBase', label: 'App base', hint: 'Window behind panels' },
  bgPanel: { key: 'bgPanel', label: 'Panel', hint: 'Sidebars and inspectors' },
  bgHeader: { key: 'bgHeader', label: 'Header', hint: 'Top bar and section titles' },
  bgInput: { key: 'bgInput', label: 'Input', hint: 'Fields and combo boxes' },
  bgHover: { key: 'bgHover', label: 'Hover', hint: 'Row and button hover fill' },
  bgActive: { key: 'bgActive', label: 'Active well', hint: 'Selected tool / list row' },
  bgSurface: { key: 'bgSurface', label: 'Raised surface', hint: 'Cards, popouts, menus' },
  bgToolbar: { key: 'bgToolbar', label: 'Toolbar', hint: 'Tool strips' },
  bgStatus: { key: 'bgStatus', label: 'Status bar', hint: 'Bottom chrome' },
  bgOverlay: { key: 'bgOverlay', label: 'Modal scrim', hint: 'Dim behind dialogs' },
  borderSubtle: { key: 'borderSubtle', label: 'Hairline', hint: 'Soft dividers' },
  borderDefault: { key: 'borderDefault', label: 'Border', hint: 'Default edges' },
  borderStrong: { key: 'borderStrong', label: 'Strong border', hint: 'Emphasis edges' },
  textPrimary: { key: 'textPrimary', label: 'Text', hint: 'Primary copy' },
  textSecondary: { key: 'textSecondary', label: 'Secondary text', hint: 'Supporting copy' },
  textMuted: { key: 'textMuted', label: 'Muted text', hint: 'Hints and labels' },
  textDisabled: { key: 'textDisabled', label: 'Disabled text', hint: 'Inactive controls' },
  textAccent: { key: 'textAccent', label: 'Accent text', hint: 'Highlighted labels' },
  accentColor: { key: 'accentColor', label: 'Accent', hint: 'Brand / focus' },
  selectionColor: { key: 'selectionColor', label: 'Selection', hint: 'Picked mesh / UV' },
  viewportBg: { key: 'viewportBg', label: 'Viewport', hint: '3D / UV canvas' },
  gridMajor: { key: 'gridMajor', label: 'Grid major', hint: 'Primary grid lines' },
  gridMinor: { key: 'gridMinor', label: 'Grid minor', hint: 'Secondary grid' },
  gizmoX: { key: 'gizmoX', label: 'Gizmo X', hint: 'Red axis' },
  gizmoY: { key: 'gizmoY', label: 'Gizmo Y', hint: 'Green axis' },
  gizmoZ: { key: 'gizmoZ', label: 'Gizmo Z', hint: 'Blue axis' },
  gizmoAccent: { key: 'gizmoAccent', label: 'Gizmo accent', hint: 'Active handle' },
  danger: { key: 'danger', label: 'Danger', hint: 'Destructive / error' },
  warning: { key: 'warning', label: 'Warning', hint: 'Caution' },
  success: { key: 'success', label: 'Success', hint: 'OK / confirm' },
  info: { key: 'info', label: 'Info', hint: 'Neutral notice' },
  vertexColor: { key: 'vertexColor', label: 'Vertices', hint: 'Edit-mode points' },
  edgeColor: { key: 'edgeColor', label: 'Edges', hint: 'Edit-mode wires' },
  faceColor: { key: 'faceColor', label: 'Faces', hint: 'Edit-mode fill' },
  wireColor: { key: 'wireColor', label: 'Object wire', hint: 'Unselected wireframe' },
  outlineColor: { key: 'outlineColor', label: 'Outline', hint: 'Object silhouette' },
  seamColor: { key: 'seamColor', label: 'UV seams', hint: 'Marked seams' },
  boneColor: { key: 'boneColor', label: 'Bones', hint: 'Armature draw' },
}

export const TOKEN_GROUPS: TokenGroup[] = [
  {
    id: 'chrome',
    label: 'Chrome',
    hint: 'App shell',
    keys: [
      'bgBase',
      'bgPanel',
      'bgHeader',
      'bgInput',
      'bgHover',
      'bgActive',
      'bgSurface',
      'bgToolbar',
      'bgStatus',
      'bgOverlay',
      'borderSubtle',
      'borderDefault',
      'borderStrong',
    ],
  },
  {
    id: 'type',
    label: 'Type',
    hint: 'Readable copy',
    keys: ['textPrimary', 'textSecondary', 'textMuted', 'textDisabled', 'textAccent'],
  },
  {
    id: 'accent',
    label: 'Accent',
    hint: 'Focus and pick',
    keys: ['accentColor', 'selectionColor'],
  },
  {
    id: 'viewport',
    label: 'Viewport',
    hint: '3D stage',
    keys: ['viewportBg', 'gridMajor', 'gridMinor'],
  },
  {
    id: 'gizmo',
    label: 'Gizmos',
    hint: 'Transform handles',
    keys: ['gizmoX', 'gizmoY', 'gizmoZ', 'gizmoAccent'],
  },
  {
    id: 'status',
    label: 'Status',
    hint: 'Semantic signals',
    keys: ['danger', 'warning', 'success', 'info'],
  },
  {
    id: 'mesh',
    label: 'Mesh overlays',
    hint: 'Edit and UV',
    keys: ['vertexColor', 'edgeColor', 'faceColor', 'wireColor', 'outlineColor', 'seamColor', 'boneColor'],
  },
]

export function completeThemeColors(seed: ThemeColorSeed | ThemeColors): ThemeColors {
  const c = seed
  return {
    bgBase: c.bgBase,
    bgPanel: c.bgPanel,
    bgHeader: c.bgHeader,
    bgInput: c.bgInput,
    bgHover: c.bgHover,
    bgActive: c.bgActive,
    bgSurface: c.bgSurface ?? mixHex(c.bgPanel, c.bgHeader, 0.35),
    bgToolbar: c.bgToolbar ?? c.bgHeader,
    bgStatus: c.bgStatus ?? c.bgHeader,
    bgOverlay: c.bgOverlay ?? mixHex('#000000', c.bgBase, 0.35),
    borderSubtle: c.borderSubtle,
    borderDefault: c.borderDefault,
    borderStrong: c.borderStrong,
    textPrimary: c.textPrimary,
    textSecondary: c.textSecondary,
    textMuted: c.textMuted,
    textDisabled: c.textDisabled ?? mixHex(c.textMuted, c.bgPanel, 0.45),
    textAccent: c.textAccent,
    accentColor: c.accentColor,
    selectionColor: c.selectionColor,
    viewportBg: c.viewportBg,
    gridMajor: c.gridMajor,
    gridMinor: c.gridMinor,
    gizmoX: c.gizmoX,
    gizmoY: c.gizmoY,
    gizmoZ: c.gizmoZ,
    gizmoAccent: c.gizmoAccent,
    danger: c.danger ?? '#e05555',
    warning: c.warning ?? '#e0a030',
    success: c.success ?? '#4caf70',
    info: c.info ?? c.accentColor,
    vertexColor: c.vertexColor ?? c.selectionColor,
    edgeColor: c.edgeColor ?? mixHex(c.selectionColor, c.accentColor, 0.35),
    faceColor: c.faceColor ?? c.selectionColor,
    wireColor: c.wireColor ?? c.textMuted,
    outlineColor: c.outlineColor ?? c.textPrimary,
    seamColor: c.seamColor ?? c.accentColor,
    boneColor: c.boneColor ?? c.gizmoY,
  }
}

export function mergeThemeColors(base: ThemeColors, overrides: Partial<ThemeColors>): ThemeColors {
  return { ...base, ...overrides }
}

export function sanitizeColorOverrides(raw: unknown): Partial<ThemeColors> {
  if (!raw || typeof raw !== 'object') return {}
  const keys = Object.keys(TOKEN_META) as ThemeColorKey[]
  const out: Partial<ThemeColors> = {}
  for (const key of keys) {
    const value = (raw as Record<string, unknown>)[key]
    if (typeof value === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim())) {
      out[key] = value.trim()
    }
  }
  return out
}
