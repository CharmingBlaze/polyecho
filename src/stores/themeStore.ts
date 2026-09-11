import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { applyThemeToDocument } from '../core/theme/applyTheme'
import { isHexColor } from '../core/theme/colorMath'
import {
  BUILTIN_THEME_PRESETS,
  type ThemePreset,
} from '../core/theme/themePresets'
import {
  completeThemeColors,
  mergeThemeColors,
  sanitizeColorOverrides,
  type ThemeColorKey,
  type ThemeColors,
} from '../core/theme/themeTokens'

export type { ThemeColors, ThemeColorKey } from '../core/theme/themeTokens'
export type { ThemePreset } from '../core/theme/themePresets'
export const THEME_PRESETS = BUILTIN_THEME_PRESETS

const LS_THEME_ID = 'polyecho_theme_id'
const LS_UI_SCALE = 'polyecho_ui_scale'
const LS_CUSTOM = 'polyecho_theme_custom'
const LS_USER = 'polyecho_user_themes'

export interface UserTheme {
  id: string
  name: string
  basedOn: string
  colors: Partial<ThemeColors>
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore quota / private mode
  }
}

function userThemeToPreset(user: UserTheme): ThemePreset {
  const base = BUILTIN_THEME_PRESETS.find((t) => t.id === user.basedOn) ?? BUILTIN_THEME_PRESETS[0]!
  return {
    id: user.id,
    name: user.name,
    category: 'Custom',
    description: `Custom theme based on ${base.name}`,
    colors: completeThemeColors({ ...base.colors, ...user.colors }),
    builtin: false,
  }
}

export const useThemeStore = defineStore('theme', () => {
  const currentThemeId = ref('polyecho_default')
  const customColors = ref<Partial<ThemeColors>>({})
  const userThemes = ref<UserTheme[]>([])
  const uiScale = ref(100)

  const builtinPresets = BUILTIN_THEME_PRESETS

  const allPresets = computed<ThemePreset[]>(() => [
    ...userThemes.value.map(userThemeToPreset),
    ...BUILTIN_THEME_PRESETS,
  ])

  const activePreset = computed(() => {
    return allPresets.value.find((t) => t.id === currentThemeId.value) ?? BUILTIN_THEME_PRESETS[0]!
  })

  const baseColors = computed(() => completeThemeColors(activePreset.value.colors))

  const activeColors = computed<ThemeColors>(() =>
    mergeThemeColors(baseColors.value, customColors.value)
  )

  const hasCustomOverrides = computed(() => Object.keys(customColors.value).length > 0)

  function persistCustom() {
    writeJson(LS_CUSTOM, { themeId: currentThemeId.value, colors: customColors.value })
  }

  function persistUsers() {
    writeJson(LS_USER, userThemes.value)
  }

  function initTheme() {
    try {
      const savedTheme = localStorage.getItem(LS_THEME_ID)
      userThemes.value = sanitizeUserThemes(readJson<UserTheme[]>(LS_USER, []))
      const pack = readJson<{ themeId?: string; colors?: unknown }>(LS_CUSTOM, {})
      if (savedTheme && allPresets.value.some((t) => t.id === savedTheme)) {
        currentThemeId.value = savedTheme
      }
      if (pack.themeId === currentThemeId.value) {
        customColors.value = sanitizeColorOverrides(pack.colors)
      }
      const savedScale = localStorage.getItem(LS_UI_SCALE)
      if (savedScale) uiScale.value = Number(savedScale)
    } catch {
      // ignore
    }
    applyCurrentTheme()
  }

  function setTheme(themeId: string) {
    if (!allPresets.value.some((t) => t.id === themeId)) return
    currentThemeId.value = themeId
    customColors.value = {}
    try {
      localStorage.setItem(LS_THEME_ID, themeId)
    } catch {
      // ignore
    }
    persistCustom()
    applyCurrentTheme()
  }

  function setColor(key: ThemeColorKey, hex: string) {
    if (!isHexColor(hex)) return
    customColors.value = { ...customColors.value, [key]: hex.trim() }
    persistCustom()
    applyCurrentTheme()
  }

  function resetColor(key: ThemeColorKey) {
    const next = { ...customColors.value }
    delete next[key]
    customColors.value = next
    persistCustom()
    applyCurrentTheme()
  }

  function resetAllColors() {
    customColors.value = {}
    persistCustom()
    applyCurrentTheme()
  }

  function duplicateAsUserTheme(name?: string) {
    const id = `user_${Date.now().toString(36)}`
    const basedOn = activePreset.value.builtin === false
      ? (userThemes.value.find((u) => u.id === currentThemeId.value)?.basedOn ?? 'polyecho_default')
      : currentThemeId.value
    const user: UserTheme = {
      id,
      name: name?.trim() || `${activePreset.value.name} copy`,
      basedOn,
      colors: { ...activeColors.value },
    }
    userThemes.value = [user, ...userThemes.value]
    persistUsers()
    setTheme(id)
    return id
  }

  function deleteUserTheme(id: string) {
    userThemes.value = userThemes.value.filter((t) => t.id !== id)
    persistUsers()
    if (currentThemeId.value === id) setTheme('polyecho_default')
  }

  function exportThemeJson(): string {
    return JSON.stringify(
      {
        name: activePreset.value.name,
        basedOn: activePreset.value.builtin === false
          ? userThemes.value.find((u) => u.id === currentThemeId.value)?.basedOn
          : currentThemeId.value,
        colors: activeColors.value,
      },
      null,
      2
    )
  }

  function importThemeJson(raw: string): boolean {
    try {
      const parsed = JSON.parse(raw) as { name?: string; basedOn?: string; colors?: unknown }
      const colors = sanitizeColorOverrides(parsed.colors)
      if (Object.keys(colors).length === 0) return false
      const id = `user_${Date.now().toString(36)}`
      const basedOn =
        typeof parsed.basedOn === 'string' && BUILTIN_THEME_PRESETS.some((t) => t.id === parsed.basedOn)
          ? parsed.basedOn
          : 'polyecho_default'
      const user: UserTheme = {
        id,
        name: (parsed.name || 'Imported theme').slice(0, 48),
        basedOn,
        colors,
      }
      userThemes.value = [user, ...userThemes.value]
      persistUsers()
      setTheme(id)
      return true
    } catch {
      return false
    }
  }

  function setScale(scale: number) {
    uiScale.value = Math.max(75, Math.min(150, scale))
    try {
      localStorage.setItem(LS_UI_SCALE, String(uiScale.value))
    } catch {
      // ignore
    }
    applyCurrentTheme()
  }

  function applyCurrentTheme() {
    applyThemeToDocument(currentThemeId.value, activeColors.value, uiScale.value)
  }

  watch(currentThemeId, () => {
    applyCurrentTheme()
  })

  return {
    currentThemeId,
    customColors,
    userThemes,
    uiScale,
    activeColors,
    activePreset,
    hasCustomOverrides,
    presets: allPresets,
    builtinPresets,
    initTheme,
    setTheme,
    setColor,
    resetColor,
    resetAllColors,
    duplicateAsUserTheme,
    deleteUserTheme,
    exportThemeJson,
    importThemeJson,
    setScale,
    applyCurrentTheme,
  }
})

function sanitizeUserThemes(raw: UserTheme[]): UserTheme[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((t) => t && typeof t.id === 'string' && typeof t.name === 'string')
    .map((t) => ({
      id: t.id,
      name: t.name.slice(0, 48),
      basedOn: typeof t.basedOn === 'string' ? t.basedOn : 'polyecho_default',
      colors: sanitizeColorOverrides(t.colors),
    }))
}
