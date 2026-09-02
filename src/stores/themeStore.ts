import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'

export interface ThemeColors {
  bgBase: string
  bgPanel: string
  bgHeader: string
  bgInput: string
  bgHover: string
  bgActive: string
  borderSubtle: string
  borderDefault: string
  borderStrong: string
  textPrimary: string
  textSecondary: string
  textMuted: string
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
}

export interface ThemePreset {
  id: string
  name: string
  category: 'Operating Systems' | 'Game Systems' | 'DCC & Pro Studios'
  description: string
  colors: ThemeColors
}

function parseHex(hex: string): [number, number, number] | null {
  const h = hex.replace('#', '').trim()
  if (h.length === 3 && /^[0-9a-f]{3}$/i.test(h)) {
    return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)]
  }
  if (h.length !== 6 || /[^0-9a-f]/i.test(h)) return null
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function toHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

function srgbLin(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  const rgb = parseHex(hex)
  if (!rgb) return 0
  return 0.2126 * srgbLin(rgb[0]) + 0.7152 * srgbLin(rgb[1]) + 0.0722 * srgbLin(rgb[2])
}

function contrastRatio(a: string, b: string): number {
  const hi = Math.max(luminance(a), luminance(b))
  const lo = Math.min(luminance(a), luminance(b))
  return (hi + 0.05) / (lo + 0.05)
}

function mixHex(a: string, b: string, t: number): string {
  const A = parseHex(a)
  const B = parseHex(b)
  if (!A || !B) return a
  return toHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t)
}

function rgbDist(a: string, b: string): number {
  const A = parseHex(a)
  const B = parseHex(b)
  if (!A || !B) return 999
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2])
}

function onColor(bg: string): string {
  return contrastRatio(bg, '#f8f8f8') >= contrastRatio(bg, '#161616') ? '#f8f8f8' : '#161616'
}

function bestOnSurfaces(preferred: string, surfaces: string[], fallbacks: string[]): string {
  const pool = [preferred, ...fallbacks]
  let best = pool[0]
  let score = -1
  for (const c of pool) {
    const s = Math.min(...surfaces.map((bg) => contrastRatio(c, bg)))
    if (s > score) {
      score = s
      best = c
    }
  }
  return best
}

export const THEME_PRESETS: ThemePreset[] = [
  // --------------------------------------------------------------------------
  // 1. DCC & PRO 3D STUDIOS
  // --------------------------------------------------------------------------
  {
    id: 'polyecho_default',
    name: 'PolyEcho Default',
    category: 'DCC & Pro Studios',
    description: 'The standard PolyEcho studio dark theme with warm charcoal panels, amber gold selections, and indigo grid.',
    colors: {
      bgBase: '#14161a',
      bgPanel: '#1e222b',
      bgHeader: '#181b22',
      bgInput: '#13151a',
      bgHover: '#2a303c',
      bgActive: '#384252',
      borderSubtle: '#262c38',
      borderDefault: '#363e4e',
      borderStrong: '#4c576d',
      textPrimary: '#f1f5f9',
      textSecondary: '#cbd5e1',
      textMuted: '#718096',
      textAccent: '#f59e0b',
      accentColor: '#f59e0b',
      selectionColor: '#f59e0b',
      viewportBg: '#121418',
      gridMajor: '#6366f1',
      gridMinor: '#222631',
      gizmoX: '#ef4444',
      gizmoY: '#22c55e',
      gizmoZ: '#3b82f6',
      gizmoAccent: '#f59e0b'
    }
  },
  {
    id: 'maya_charcoal',
    name: 'Maya Charcoal',
    category: 'DCC & Pro Studios',
    description: 'Autodesk Maya technical matte dark grey with electric cyan wireframes and technical grid.',
    colors: {
      bgBase: '#222222',
      bgPanel: '#2e2e2e',
      bgHeader: '#262626',
      bgInput: '#1a1a1a',
      bgHover: '#3c3c3c',
      bgActive: '#484848',
      borderSubtle: '#383838',
      borderDefault: '#4a4a4a',
      borderStrong: '#00c0ff',
      textPrimary: '#f5f5f5',
      textSecondary: '#d4d4d4',
      textMuted: '#888888',
      textAccent: '#00c0ff',
      accentColor: '#00c0ff',
      selectionColor: '#26c6da',
      viewportBg: '#1e1e1e',
      gridMajor: '#525252',
      gridMinor: '#2c2c2c',
      gizmoX: '#e53935',
      gizmoY: '#43a047',
      gizmoZ: '#1e88e5',
      gizmoAccent: '#26c6da'
    }
  },
  {
    id: 'dracula_studio',
    name: 'Dracula Studio',
    category: 'DCC & Pro Studios',
    description: 'Iconic gothic dark theme with vibrant purple, pink, and cyan neon highlights.',
    colors: {
      bgBase: '#1e1f29',
      bgPanel: '#282a36',
      bgHeader: '#21222c',
      bgInput: '#191a21',
      bgHover: '#383a59',
      bgActive: '#44475a',
      borderSubtle: '#3a3c4e',
      borderDefault: '#4d5069',
      borderStrong: '#bd93f9',
      textPrimary: '#f8f8f2',
      textSecondary: '#e2e8f0',
      textMuted: '#7988b8',
      textAccent: '#ff79c6',
      accentColor: '#bd93f9',
      selectionColor: '#50fa7b',
      viewportBg: '#191a24',
      gridMajor: '#bd93f9',
      gridMinor: '#343746',
      gizmoX: '#ff5555',
      gizmoY: '#50fa7b',
      gizmoZ: '#8be9fd',
      gizmoAccent: '#ff79c6'
    }
  },
  {
    id: 'solarized_dark',
    name: 'Solarized Dark',
    category: 'DCC & Pro Studios',
    description: 'Ethan Schoonover classic precision color palette for optimal optical contrast.',
    colors: {
      bgBase: '#001e26',
      bgPanel: '#002b36',
      bgHeader: '#073642',
      bgInput: '#001920',
      bgHover: '#094757',
      bgActive: '#0d596d',
      borderSubtle: '#094553',
      borderDefault: '#115b6d',
      borderStrong: '#268bd2',
      textPrimary: '#93a1a1',
      textSecondary: '#839496',
      textMuted: '#586e75',
      textAccent: '#b58900',
      accentColor: '#268bd2',
      selectionColor: '#cb4b16',
      viewportBg: '#00171f',
      gridMajor: '#268bd2',
      gridMinor: '#073642',
      gizmoX: '#dc322f',
      gizmoY: '#859900',
      gizmoZ: '#268bd2',
      gizmoAccent: '#b58900'
    }
  },
  {
    id: 'lightwave_3d',
    name: 'LightWave 3D Classic',
    category: 'DCC & Pro Studios',
    description: 'NewTek LightWave 3D production studio with warm copper amber docks and electric cyan coordinates.',
    colors: {
      bgBase: '#191c21',
      bgPanel: '#242831',
      bgHeader: '#1e2127',
      bgInput: '#17191f',
      bgHover: '#383d48',
      bgActive: '#d9822b',
      borderSubtle: '#303540',
      borderDefault: '#404654',
      borderStrong: '#d9822b',
      textPrimary: '#e4e8ee',
      textSecondary: '#bac1cc',
      textMuted: '#7c8594',
      textAccent: '#d9822b',
      accentColor: '#d9822b',
      selectionColor: '#00c4cc',
      viewportBg: '#14161a',
      gridMajor: '#4b5568',
      gridMinor: '#20242c',
      gizmoX: '#f97316',
      gizmoY: '#10b981',
      gizmoZ: '#00c4cc',
      gizmoAccent: '#d9822b'
    }
  },
  {
    id: 'softimage_xsi',
    name: 'Softimage|XSI',
    category: 'DCC & Pro Studios',
    description: 'Iconic Avid Softimage high-productivity slate palette with crimson red and cyan selection highlights.',
    colors: {
      bgBase: '#22272e',
      bgPanel: '#323842',
      bgHeader: '#2b3038',
      bgInput: '#1d2127',
      bgHover: '#424a57',
      bgActive: '#4f5969',
      borderSubtle: '#3c4450',
      borderDefault: '#4d5766',
      borderStrong: '#e74c3c',
      textPrimary: '#f4f6f8',
      textSecondary: '#d0d6de',
      textMuted: '#8490a0',
      textAccent: '#e74c3c',
      accentColor: '#e74c3c',
      selectionColor: '#00d2d3',
      viewportBg: '#1c2026',
      gridMajor: '#00d2d3',
      gridMinor: '#2c333d',
      gizmoX: '#e74c3c',
      gizmoY: '#a6e22e',
      gizmoZ: '#00d2d3',
      gizmoAccent: '#f39c12'
    }
  },
  {
    id: 'monokai_pro',
    name: 'Monokai Pro',
    category: 'DCC & Pro Studios',
    description: 'Deep obsidian dark theme with vibrant filtered neon yellow, orange, and mint green.',
    colors: {
      bgBase: '#1a191b',
      bgPanel: '#222225',
      bgHeader: '#1e1e21',
      bgInput: '#161618',
      bgHover: '#333338',
      bgActive: '#44444c',
      borderSubtle: '#2e2e34',
      borderDefault: '#3e3e46',
      borderStrong: '#ffd866',
      textPrimary: '#fcfcfa',
      textSecondary: '#d8d8d6',
      textMuted: '#78787e',
      textAccent: '#ffd866',
      accentColor: '#ffd866',
      selectionColor: '#fc9867',
      viewportBg: '#141416',
      gridMajor: '#ffd866',
      gridMinor: '#2a2a2f',
      gizmoX: '#ff6188',
      gizmoY: '#a9dc76',
      gizmoZ: '#78dce8',
      gizmoAccent: '#ffd866'
    }
  },
  {
    id: 'nord_frost',
    name: 'Nord Frost Arctic',
    category: 'DCC & Pro Studios',
    description: 'Arctic North Atlantic dark studio palette with crisp glacial blues and polar accents.',
    colors: {
      bgBase: '#20242c',
      bgPanel: '#2e3440',
      bgHeader: '#272c36',
      bgInput: '#1b1f26',
      bgHover: '#3b4252',
      bgActive: '#434c5e',
      borderSubtle: '#3b4252',
      borderDefault: '#4c566a',
      borderStrong: '#88c0d0',
      textPrimary: '#eceff4',
      textSecondary: '#e5e9f0',
      textMuted: '#7b88a1',
      textAccent: '#88c0d0',
      accentColor: '#88c0d0',
      selectionColor: '#81a1c1',
      viewportBg: '#1d2128',
      gridMajor: '#88c0d0',
      gridMinor: '#353c4a',
      gizmoX: '#bf616a',
      gizmoY: '#a3be8c',
      gizmoZ: '#81a1c1',
      gizmoAccent: '#ebcb8b'
    }
  },
  {
    id: 'tokyo_night',
    name: 'Tokyo Night Storm',
    category: 'DCC & Pro Studios',
    description: 'Clean midnight cyberpunk navy studio with lavender purple, cyber blue, and neon cyan.',
    colors: {
      bgBase: '#1a1b26',
      bgPanel: '#24283b',
      bgHeader: '#1f2335',
      bgInput: '#16161e',
      bgHover: '#2f354d',
      bgActive: '#3b4261',
      borderSubtle: '#2f354d',
      borderDefault: '#414868',
      borderStrong: '#7aa2f7',
      textPrimary: '#c0caf5',
      textSecondary: '#a9b1d6',
      textMuted: '#565f89',
      textAccent: '#7aa2f7',
      accentColor: '#7aa2f7',
      selectionColor: '#bb9af7',
      viewportBg: '#13141c',
      gridMajor: '#7aa2f7',
      gridMinor: '#222538',
      gizmoX: '#f7768e',
      gizmoY: '#9ece6a',
      gizmoZ: '#7dcfff',
      gizmoAccent: '#bb9af7'
    }
  },
  {
    id: 'catppuccin_mocha',
    name: 'Catppuccin Mocha',
    category: 'DCC & Pro Studios',
    description: 'Warm soothing espresso palette with rich mauve, sapphire, peach, and mint teal accents.',
    colors: {
      bgBase: '#14141f',
      bgPanel: '#1e1e2e',
      bgHeader: '#181825',
      bgInput: '#11111b',
      bgHover: '#2a2b3d',
      bgActive: '#363a4f',
      borderSubtle: '#313244',
      borderDefault: '#45475a',
      borderStrong: '#cba6f7',
      textPrimary: '#cdd6f4',
      textSecondary: '#bac2de',
      textMuted: '#6c7086',
      textAccent: '#cba6f7',
      accentColor: '#cba6f7',
      selectionColor: '#fab387',
      viewportBg: '#12121c',
      gridMajor: '#cba6f7',
      gridMinor: '#28283d',
      gizmoX: '#f38ba8',
      gizmoY: '#a6e3a1',
      gizmoZ: '#89b4fa',
      gizmoAccent: '#f9e2af'
    }
  },

  // --------------------------------------------------------------------------
  // 2. OPERATING SYSTEMS
  // --------------------------------------------------------------------------
  {
    id: 'win95_classic',
    name: 'Windows 95 Classic',
    category: 'Operating Systems',
    description: 'Authentic 1995 desktop with battleship grey panels, navy accents, crisp white inputs, and classic teal workspace.',
    colors: {
      bgBase: '#008080',
      bgPanel: '#c0c0c0',
      bgHeader: '#c0c0c0',
      bgInput: '#ffffff',
      bgHover: '#d4d4d4',
      bgActive: '#b8b8b8',
      borderSubtle: '#dfdfdf',
      borderDefault: '#808080',
      borderStrong: '#404040',
      textPrimary: '#000000',
      textSecondary: '#222222',
      textMuted: '#555555',
      textAccent: '#000080',
      accentColor: '#000080',
      selectionColor: '#ffff00',
      viewportBg: '#008080',
      gridMajor: '#c0c0c0',
      gridMinor: '#006666',
      gizmoX: '#e00000',
      gizmoY: '#00aa00',
      gizmoZ: '#0000e0',
      gizmoAccent: '#ffff00'
    }
  },
  {
    id: 'win_xp_luna',
    name: 'Windows XP Luna',
    category: 'Operating Systems',
    description: 'Authentic 2001 Luna Blue titlebars with classic warm silver-cream panels, crisp dark text, and 3D studio slate workspace.',
    colors: {
      bgBase: '#1e3b70',
      bgPanel: '#ece9d8',
      bgHeader: '#ece9d8',
      bgInput: '#ffffff',
      bgHover: '#c1d2ee',
      bgActive: '#316ac5',
      borderSubtle: '#d4cfbe',
      borderDefault: '#7f9db9',
      borderStrong: '#0055ea',
      textPrimary: '#0f172a',
      textSecondary: '#334155',
      textMuted: '#64748b',
      textAccent: '#0055ea',
      accentColor: '#245edb',
      selectionColor: '#ff8c00',
      viewportBg: '#363d4a',
      gridMajor: '#5c6e88',
      gridMinor: '#282d36',
      gizmoX: '#e52521',
      gizmoY: '#2e7d32',
      gizmoZ: '#245edb',
      gizmoAccent: '#ff8c00'
    }
  },
  {
    id: 'win_xp_royale',
    name: 'Windows XP Royale (Energy Blue)',
    category: 'Operating Systems',
    description: 'Iconic Windows XP Media Center Edition Royale theme with sleek cobalt styling, clean silver inputs, and emerald accents.',
    colors: {
      bgBase: '#1a3258',
      bgPanel: '#e8ecf4',
      bgHeader: '#e8ecf4',
      bgInput: '#ffffff',
      bgHover: '#c0d4f0',
      bgActive: '#2054a8',
      borderSubtle: '#c6d4ea',
      borderDefault: '#7c9cc8',
      borderStrong: '#1a4b9c',
      textPrimary: '#0c1938',
      textSecondary: '#253a66',
      textMuted: '#5a729e',
      textAccent: '#0066ff',
      accentColor: '#0066ff',
      selectionColor: '#ff9900',
      viewportBg: '#2c3442',
      gridMajor: '#4d6282',
      gridMinor: '#202630',
      gizmoX: '#e52521',
      gizmoY: '#00aa44',
      gizmoZ: '#0066ff',
      gizmoAccent: '#ff9900'
    }
  },
  {
    id: 'win_xp_silver',
    name: 'Windows XP Luna Silver',
    category: 'Operating Systems',
    description: 'Polished 2001 Windows XP Metallic Silver style with neutral brushed aluminum panels and Ruby accents.',
    colors: {
      bgBase: '#707279',
      bgPanel: '#e5e5e2',
      bgHeader: '#e5e5e2',
      bgInput: '#ffffff',
      bgHover: '#d0d2d8',
      bgActive: '#b0b3ba',
      borderSubtle: '#c8c8c5',
      borderDefault: '#8f9199',
      borderStrong: '#54565c',
      textPrimary: '#111827',
      textSecondary: '#374151',
      textMuted: '#6b7280',
      textAccent: '#d32f2f',
      accentColor: '#54565c',
      selectionColor: '#e65100',
      viewportBg: '#383b42',
      gridMajor: '#626670',
      gridMinor: '#27292e',
      gizmoX: '#e52521',
      gizmoY: '#2e7d32',
      gizmoZ: '#3f51b5',
      gizmoAccent: '#e65100'
    }
  },
  {
    id: 'macos_quartz',
    name: 'macOS Dark Quartz',
    category: 'Operating Systems',
    description: 'Polished Apple aluminum dark mode with vibrant traffic-light accents.',
    colors: {
      bgBase: '#161618',
      bgPanel: '#202024',
      bgHeader: '#2a2a2e',
      bgInput: '#131315',
      bgHover: '#323238',
      bgActive: '#0a84ff',
      borderSubtle: '#2e2e34',
      borderDefault: '#3e3e46',
      borderStrong: '#52525e',
      textPrimary: '#ffffff',
      textSecondary: '#e1e1e6',
      textMuted: '#8a8a98',
      textAccent: '#0a84ff',
      accentColor: '#0a84ff',
      selectionColor: '#ff9f0a',
      viewportBg: '#141416',
      gridMajor: '#444450',
      gridMinor: '#22222a',
      gizmoX: '#ff453a',
      gizmoY: '#32d74b',
      gizmoZ: '#0a84ff',
      gizmoAccent: '#ffd60a'
    }
  },
  {
    id: 'amiga_workbench',
    name: 'Amiga Workbench 2.0',
    category: 'Operating Systems',
    description: 'Workbench grey windows on a sapphire screen, with orange gadgets and the classic four-color Amiga palette.',
    colors: {
      bgBase: '#0055aa',
      bgPanel: '#aaaaaa',
      bgHeader: '#aaaaaa',
      bgInput: '#ffffff',
      bgHover: '#bbbbbb',
      bgActive: '#8e8e8e',
      borderSubtle: '#cccccc',
      borderDefault: '#666666',
      borderStrong: '#000000',
      textPrimary: '#000000',
      textSecondary: '#111111',
      textMuted: '#444444',
      textAccent: '#aa4400',
      accentColor: '#ee7700',
      selectionColor: '#ffcc66',
      viewportBg: '#0055aa',
      gridMajor: '#88aacc',
      gridMinor: '#003d7a',
      gizmoX: '#ee2200',
      gizmoY: '#22aa22',
      gizmoZ: '#ffffff',
      gizmoAccent: '#ee7700'
    }
  },
  {
    id: 'beos_haiku',
    name: 'BeOS / Haiku',
    category: 'Operating Systems',
    description: 'Iconic 1998 BeOS R5 desktop with signature golden-yellow window tabs, clean slate-grey panels, and sapphire studio workspace.',
    colors: {
      bgBase: '#336698',
      bgPanel: '#e4e4e4',
      bgHeader: '#e4e4e4',
      bgInput: '#ffffff',
      bgHover: '#ffe885',
      bgActive: '#ffc600',
      borderSubtle: '#d2d2d2',
      borderDefault: '#a4a4a4',
      borderStrong: '#686868',
      textPrimary: '#0f172a',
      textSecondary: '#334155',
      textMuted: '#64748b',
      textAccent: '#255888',
      accentColor: '#f5b800',
      selectionColor: '#ffc600',
      viewportBg: '#2c394b',
      gridMajor: '#4f6888',
      gridMinor: '#202936',
      gizmoX: '#d9383a',
      gizmoY: '#2ecc71',
      gizmoZ: '#336698',
      gizmoAccent: '#ffc600'
    }
  },
  {
    id: 'nextstep_industrial',
    name: 'NeXTSTEP Industrial',
    category: 'Operating Systems',
    description: 'Steve Jobs NeXT Computer sleek monolithic black and textured charcoal aesthetic.',
    colors: {
      bgBase: '#1c1c1c',
      bgPanel: '#383838',
      bgHeader: '#1a1a1a',
      bgInput: '#262626',
      bgHover: '#4a4a4a',
      bgActive: '#5a5a5a',
      borderSubtle: '#333333',
      borderDefault: '#505050',
      borderStrong: '#7f7f7f',
      textPrimary: '#ffffff',
      textSecondary: '#cccccc',
      textMuted: '#888888',
      textAccent: '#d4af37',
      accentColor: '#999999',
      selectionColor: '#d4af37',
      viewportBg: '#101010',
      gridMajor: '#555555',
      gridMinor: '#222222',
      gizmoX: '#f0f0f0',
      gizmoY: '#999999',
      gizmoZ: '#555555',
      gizmoAccent: '#d4af37'
    }
  },

  // --------------------------------------------------------------------------
  // 3. GAME SYSTEMS & RETRO HARDWARE
  // --------------------------------------------------------------------------
  {
    id: 'psx_console',
    name: 'Sony PlayStation 1',
    category: 'Game Systems',
    description: 'Authentic 1994 PS1 console chassis grey with teal and fuchsia controller accents.',
    colors: {
      bgBase: '#18181c',
      bgPanel: '#2c2c34',
      bgHeader: '#202026',
      bgInput: '#1a1a20',
      bgHover: '#3a3a46',
      bgActive: '#4a4a58',
      borderSubtle: '#383844',
      borderDefault: '#4c4c5c',
      borderStrong: '#66667c',
      textPrimary: '#f0f0f5',
      textSecondary: '#c8c8d4',
      textMuted: '#7c7c90',
      textAccent: '#00dfa2',
      accentColor: '#ff0055',
      selectionColor: '#00dfa2',
      viewportBg: '#14141c',
      gridMajor: '#ff0055',
      gridMinor: '#2a2a38',
      gizmoX: '#ff0055',
      gizmoY: '#00dfa2',
      gizmoZ: '#2979ff',
      gizmoAccent: '#ff4081'
    }
  },
  {
    id: 'n64_smoke',
    name: 'Nintendo 64 Smoke',
    category: 'Game Systems',
    description: 'Translucent N64 smoke charcoal cartridge chassis with golden Star Fox yellow.',
    colors: {
      bgBase: '#161622',
      bgPanel: '#232332',
      bgHeader: '#1a1a26',
      bgInput: '#13131c',
      bgHover: '#303044',
      bgActive: '#404058',
      borderSubtle: '#2d2d3e',
      borderDefault: '#3f3f56',
      borderStrong: '#5a5a78',
      textPrimary: '#f4f4f8',
      textSecondary: '#c4c4dc',
      textMuted: '#707090',
      textAccent: '#f5b324',
      accentColor: '#e52521',
      selectionColor: '#f5b324',
      viewportBg: '#12121c',
      gridMajor: '#f5b324',
      gridMinor: '#232336',
      gizmoX: '#e52521',
      gizmoY: '#00a040',
      gizmoZ: '#0066cc',
      gizmoAccent: '#f5b324'
    }
  },
  {
    id: 'gameboy_dmg',
    name: 'Game Boy Classic (DMG-01)',
    category: 'Game Systems',
    description: 'Original 1989 4-shade olive green dot-matrix LCD gaming aesthetic.',
    colors: {
      bgBase: '#8bac0f',
      bgPanel: '#9bbc0f',
      bgHeader: '#8bac0f',
      bgInput: '#9bbc0f',
      bgHover: '#8bac0f',
      bgActive: '#306230',
      borderSubtle: '#8bac0f',
      borderDefault: '#306230',
      borderStrong: '#0f380f',
      textPrimary: '#0f380f',
      textSecondary: '#0f380f',
      textMuted: '#306230',
      textAccent: '#0f380f',
      accentColor: '#306230',
      selectionColor: '#0f380f',
      viewportBg: '#8bac0f',
      gridMajor: '#0f380f',
      gridMinor: '#306230',
      gizmoX: '#0f380f',
      gizmoY: '#306230',
      gizmoZ: '#4e7a4e',
      gizmoAccent: '#0f380f'
    }
  },
  {
    id: 'gba_indigo',
    name: 'Game Boy Advance Indigo',
    category: 'Game Systems',
    description: 'Regal 32-bit GBA indigo violet shell with metallic silver-grey buttons.',
    colors: {
      bgBase: '#1e1a38',
      bgPanel: '#2c2650',
      bgHeader: '#221c40',
      bgInput: '#17142c',
      bgHover: '#3a3368',
      bgActive: '#4a4282',
      borderSubtle: '#362f62',
      borderDefault: '#4c428a',
      borderStrong: '#6a5db8',
      textPrimary: '#f5f3ff',
      textSecondary: '#ddd6fe',
      textMuted: '#8b83ba',
      textAccent: '#a78bfa',
      accentColor: '#8b5cf6',
      selectionColor: '#38bdf8',
      viewportBg: '#16132b',
      gridMajor: '#8b5cf6',
      gridMinor: '#252044',
      gizmoX: '#f43f5e',
      gizmoY: '#10b981',
      gizmoZ: '#8b5cf6',
      gizmoAccent: '#38bdf8'
    }
  },
  {
    id: 'gamecube_purple',
    name: 'Nintendo GameCube',
    category: 'Game Systems',
    description: 'Iconic 2001 GameCube royal purple cube styling with fiery sunset yellow buttons.',
    colors: {
      bgBase: '#221a44',
      bgPanel: '#322660',
      bgHeader: '#281e50',
      bgInput: '#1a1436',
      bgHover: '#42337e',
      bgActive: '#54429e',
      borderSubtle: '#3e2e78',
      borderDefault: '#5440a2',
      borderStrong: '#765cd6',
      textPrimary: '#faf5ff',
      textSecondary: '#e9d5ff',
      textMuted: '#9682c8',
      textAccent: '#fbbf24',
      accentColor: '#c084fc',
      selectionColor: '#fbbf24',
      viewportBg: '#1a1338',
      gridMajor: '#c084fc',
      gridMinor: '#2b2058',
      gizmoX: '#ef4444',
      gizmoY: '#22c55e',
      gizmoZ: '#3b82f6',
      gizmoAccent: '#fbbf24'
    }
  },
  {
    id: 'dreamcast_pearl',
    name: 'Sega Dreamcast',
    category: 'Game Systems',
    description: '1998 NA Dreamcast pearl shell, swirl-orange gadgets, Emerald Coast dusk viewport. Selected wells are seafoam — never a solid orange slab.',
    colors: {
      bgBase: '#d8cfc0',
      bgPanel: '#efe8dc',
      bgHeader: '#e6ddd0',
      bgInput: '#fffdf8',
      bgHover: '#e4dcc8',
      bgActive: '#c5ddd4',
      borderSubtle: '#ddd2c0',
      borderDefault: '#c2b49c',
      borderStrong: '#7a7060',
      textPrimary: '#1a1c1b',
      textSecondary: '#3a3e3c',
      textMuted: '#5c5a54',
      textAccent: '#8f3200',
      accentColor: '#d35400',
      selectionColor: '#2a9d8f',
      viewportBg: '#2a3840',
      gridMajor: '#5a7880',
      gridMinor: '#334850',
      gizmoX: '#d94a3d',
      gizmoY: '#3daf5c',
      gizmoZ: '#3d8fd0',
      gizmoAccent: '#e8b84a'
    }
  },
  {
    id: 'genesis_carbon',
    name: 'Sega Genesis 16-Bit',
    category: 'Game Systems',
    description: 'High-octane carbon black console chassis with gold 16-BIT branding and arcade cyan.',
    colors: {
      bgBase: '#121214',
      bgPanel: '#1e1e22',
      bgHeader: '#16161a',
      bgInput: '#101012',
      bgHover: '#2a2a30',
      bgActive: '#e60012',
      borderSubtle: '#26262c',
      borderDefault: '#383842',
      borderStrong: '#d4af37',
      textPrimary: '#ffffff',
      textSecondary: '#e0e0e6',
      textMuted: '#7c7c8a',
      textAccent: '#d4af37',
      accentColor: '#e60012',
      selectionColor: '#00e5ff',
      viewportBg: '#0d0d10',
      gridMajor: '#d4af37',
      gridMinor: '#202028',
      gizmoX: '#e60012',
      gizmoY: '#00e5ff',
      gizmoZ: '#d4af37',
      gizmoAccent: '#e60012'
    }
  },
  {
    id: 'psp_xmb',
    name: 'Sony PSP Piano Black',
    category: 'Game Systems',
    description: 'Sleek glossy piano-black multimedia aesthetic with translucent wave blue ribbons.',
    colors: {
      bgBase: '#0a0c10',
      bgPanel: '#141820',
      bgHeader: '#0e1016',
      bgInput: '#080a0e',
      bgHover: '#1e2430',
      bgActive: '#283244',
      borderSubtle: '#1a2230',
      borderDefault: '#263448',
      borderStrong: '#3b82f6',
      textPrimary: '#f8fafc',
      textSecondary: '#cbd5e1',
      textMuted: '#64748b',
      textAccent: '#38bdf8',
      accentColor: '#3b82f6',
      selectionColor: '#38bdf8',
      viewportBg: '#080a0e',
      gridMajor: '#38bdf8',
      gridMinor: '#161f2e',
      gizmoX: '#f43f5e',
      gizmoY: '#2dd4bf',
      gizmoZ: '#38bdf8',
      gizmoAccent: '#cbd5e1'
    }
  },
  {
    id: 'ds_polar',
    name: 'Nintendo DS Lite Polar',
    category: 'Game Systems',
    description: 'Dual-screen polar white minimalism with subtle graphite and teal stylus accents.',
    colors: {
      bgBase: '#202228',
      bgPanel: '#f3f4f6',
      bgHeader: '#e5e7eb',
      bgInput: '#ffffff',
      bgHover: '#d1d5db',
      bgActive: '#3b82f6',
      borderSubtle: '#e5e7eb',
      borderDefault: '#9ca3af',
      borderStrong: '#4b5563',
      textPrimary: '#111827',
      textSecondary: '#374151',
      textMuted: '#6b7280',
      textAccent: '#2563eb',
      accentColor: '#3b82f6',
      selectionColor: '#f59e0b',
      viewportBg: '#1c1e24',
      gridMajor: '#3b82f6',
      gridMinor: '#2a2d36',
      gizmoX: '#dc2626',
      gizmoY: '#059669',
      gizmoZ: '#2563eb',
      gizmoAccent: '#d97706'
    }
  },
  {
    id: 'cyberpunk_neon',
    name: 'Cyberpunk Neo-Tokyo',
    category: 'Game Systems',
    description: 'Futuristic high-contrast dark cyberpunk with neon pink, electric cyan, and laser amber.',
    colors: {
      bgBase: '#0b0c14',
      bgPanel: '#121422',
      bgHeader: '#0e0f1a',
      bgInput: '#080910',
      bgHover: '#1c2036',
      bgActive: '#ff007f',
      borderSubtle: '#1e223c',
      borderDefault: '#2e355c',
      borderStrong: '#00f0ff',
      textPrimary: '#ffffff',
      textSecondary: '#e0e7ff',
      textMuted: '#6b78a8',
      textAccent: '#00f0ff',
      accentColor: '#ff007f',
      selectionColor: '#ffe600',
      viewportBg: '#090a12',
      gridMajor: '#ff007f',
      gridMinor: '#161a30',
      gizmoX: '#ff007f',
      gizmoY: '#ffe600',
      gizmoZ: '#00f0ff',
      gizmoAccent: '#d946ef'
    }
  }
]

export const useThemeStore = defineStore('theme', () => {
  const currentThemeId = ref<string>('polyecho_default')
  const customColors = ref<Partial<ThemeColors>>({})
  const uiScale = ref<number>(100) // Percentage (80 to 140)

  const activeColors = computed<ThemeColors>(() => {
    const preset = THEME_PRESETS.find(t => t.id === currentThemeId.value) || THEME_PRESETS[0]
    return { ...preset.colors, ...customColors.value }
  })

  // Initialize from LocalStorage if available
  function initTheme() {
    try {
      const savedTheme = localStorage.getItem('polyecho_theme_id')
      if (savedTheme && THEME_PRESETS.some(t => t.id === savedTheme)) {
        currentThemeId.value = savedTheme
      }
      const savedScale = localStorage.getItem('polyecho_ui_scale')
      if (savedScale) {
        uiScale.value = Number(savedScale)
      }
    } catch {
      // Ignore local storage error
    }
    applyCurrentTheme()
  }

  function setTheme(themeId: string) {
    if (THEME_PRESETS.some(t => t.id === themeId)) {
      currentThemeId.value = themeId
      customColors.value = {}
      try {
        localStorage.setItem('polyecho_theme_id', themeId)
      } catch {
        // Ignore
      }
      applyCurrentTheme()
    }
  }

  function setScale(scale: number) {
    uiScale.value = Math.max(75, Math.min(150, scale))
    try {
      localStorage.setItem('polyecho_ui_scale', String(uiScale.value))
    } catch {
      // Ignore
    }
    applyCurrentTheme()
  }

  function applyCurrentTheme() {
    const active = activeColors.value

    const root = document.documentElement
    root.setAttribute('data-theme', currentThemeId.value)

    // Standard Tailwind UI Tokens
    root.style.setProperty('--ui-bg-root', active.bgBase)
    root.style.setProperty('--ui-bg-panel', active.bgPanel)
    root.style.setProperty('--ui-bg-header', active.bgHeader)
    root.style.setProperty('--ui-bg-surface', active.bgPanel)
    root.style.setProperty('--ui-bg-input', active.bgInput)
    root.style.setProperty('--ui-bg-hover', active.bgHover)

    let well = active.bgActive
    const wellReads =
      Math.max(contrastRatio(well, active.textPrimary), contrastRatio(well, active.textAccent)) >= 3.2
    if (rgbDist(well, active.accentColor) < 90 || !wellReads) {
      well = mixHex(active.bgPanel, active.accentColor, luminance(active.bgPanel) > 0.4 ? 0.14 : 0.26)
    }
    root.style.setProperty('--ui-bg-active', well)

    root.style.setProperty('--ui-border-subtle', active.borderSubtle)
    root.style.setProperty('--ui-border-default', active.borderDefault)
    root.style.setProperty('--ui-border-strong', active.borderStrong)
    root.style.setProperty('--ui-border-focus', active.accentColor)

    const muted = contrastRatio(active.textMuted, active.bgPanel) >= 4.5
      ? active.textMuted
      : mixHex(active.textPrimary, active.bgPanel, 0.38)
    const accentLabel = bestOnSurfaces(
      active.textAccent,
      [active.bgPanel, active.bgHeader, well],
      ['#8f3200', '#0d4f4c', '#1a1c1b', '#fff6ea']
    )
    root.style.setProperty('--ui-text-primary', active.textPrimary)
    root.style.setProperty('--ui-text-secondary', active.textSecondary)
    root.style.setProperty('--ui-text-muted', muted)
    root.style.setProperty('--ui-text-accent', accentLabel)

    root.style.setProperty('--ui-accent', active.accentColor)
    const onAccent = onColor(active.accentColor)
    root.style.setProperty('--ui-on-accent', onAccent)
    const accentRgb = parseHex(active.accentColor)
    if (accentRgb) {
      const [r, g, b] = accentRgb
      const dark = (n: number) => Math.max(0, Math.round(n * 0.72)).toString(16).padStart(2, '0')
      root.style.setProperty('--ui-accent-hover', `#${dark(r)}${dark(g)}${dark(b)}`)
      root.style.setProperty('--ui-accent-subtle', `rgba(${r}, ${g}, ${b}, 0.18)`)
    }
    root.style.setProperty('--ui-selection', active.selectionColor)
    root.style.setProperty('--ui-viewport-bg', active.viewportBg)

    // Legacy / direct aliases
    root.style.setProperty('--color-ui-base', active.bgBase)
    root.style.setProperty('--color-ui-panel', active.bgPanel)
    root.style.setProperty('--color-ui-header', active.bgHeader)
    root.style.setProperty('--color-ui-input', active.bgInput)
    root.style.setProperty('--color-ui-hover', active.bgHover)
    root.style.setProperty('--color-ui-active', well)
    root.style.setProperty('--color-ui-border-subtle', active.borderSubtle)
    root.style.setProperty('--color-ui-border-default', active.borderDefault)
    root.style.setProperty('--color-ui-border-strong', active.borderStrong)
    root.style.setProperty('--color-ui-text-primary', active.textPrimary)
    root.style.setProperty('--color-ui-text-secondary', active.textSecondary)
    root.style.setProperty('--color-ui-text-muted', muted)
    root.style.setProperty('--color-ui-text-accent', accentLabel)
    root.style.setProperty('--color-ui-accent', active.accentColor)
    root.style.setProperty('--color-ui-selection', active.selectionColor)
    root.style.setProperty('--color-viewport-bg', active.viewportBg)

    root.style.setProperty('--ui-scale-factor', `${uiScale.value / 100}`)

    // Dispatch event so Three.js scene background, grid, and gizmos update immediately
    window.dispatchEvent(new CustomEvent('theme-changed', { detail: active }))
  }

  watch(currentThemeId, () => {
    applyCurrentTheme()
  })

  return {
    currentThemeId,
    customColors,
    uiScale,
    activeColors,
    presets: THEME_PRESETS,
    initTheme,
    setTheme,
    setScale,
    applyCurrentTheme
  }
})
