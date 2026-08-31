export interface GradientStop {
  id: string
  color: string
  position: number // 0 to 100
}

export interface SavedGradient {
  id: string
  name: string
  type: 'Linear' | 'Radial' | 'Angle' | 'Reflected'
  angle: number // in degrees
  stops: GradientStop[]
  isCustom?: boolean
}

export const DEFAULT_GRADIENT_PRESETS: SavedGradient[] = [
  {
    id: 'sunset-horizon',
    name: 'Sunset Horizon',
    type: 'Linear',
    angle: 90,
    stops: [
      { id: '1', color: '#1a0826', position: 0 },
      { id: '2', color: '#6d1847', position: 35 },
      { id: '3', color: '#e8453c', position: 65 },
      { id: '4', color: '#ffb347', position: 100 }
    ]
  },
  {
    id: 'psx-retro-sky',
    name: 'PSX Retro Sky',
    type: 'Linear',
    angle: 90,
    stops: [
      { id: '1', color: '#1e3c72', position: 0 },
      { id: '2', color: '#2a5298', position: 45 },
      { id: '3', color: '#7e8ce0', position: 80 },
      { id: '4', color: '#d8b5ff', position: 100 }
    ]
  },
  {
    id: 'cyberpunk-neon',
    name: 'Cyberpunk Neon',
    type: 'Linear',
    angle: 45,
    stops: [
      { id: '1', color: '#0d0221', position: 0 },
      { id: '2', color: '#b12a90', position: 40 },
      { id: '3', color: '#00f0ff', position: 85 },
      { id: '4', color: '#ffffff', position: 100 }
    ]
  },
  {
    id: 'forest-canopy',
    name: 'Forest Canopy',
    type: 'Linear',
    angle: 90,
    stops: [
      { id: '1', color: '#0d1f12', position: 0 },
      { id: '2', color: '#1c4a27', position: 40 },
      { id: '3', color: '#448c3b', position: 75 },
      { id: '4', color: '#a7d656', position: 100 }
    ]
  },
  {
    id: 'molten-lava',
    name: 'Molten Lava',
    type: 'Linear',
    angle: 90,
    stops: [
      { id: '1', color: '#120504', position: 0 },
      { id: '2', color: '#590d08', position: 30 },
      { id: '3', color: '#d9381e', position: 65 },
      { id: '4', color: '#ffbd38', position: 90 },
      { id: '5', color: '#ffffff', position: 100 }
    ]
  },
  {
    id: 'ocean-depths',
    name: 'Ocean Depths',
    type: 'Linear',
    angle: 90,
    stops: [
      { id: '1', color: '#020b14', position: 0 },
      { id: '2', color: '#092540', position: 45 },
      { id: '3', color: '#146085', position: 75 },
      { id: '4', color: '#43c6ac', position: 100 }
    ]
  },
  {
    id: 'golden-hour',
    name: 'Golden Hour',
    type: 'Linear',
    angle: 90,
    stops: [
      { id: '1', color: '#421c0e', position: 0 },
      { id: '2', color: '#a3481b', position: 45 },
      { id: '3', color: '#f59e0b', position: 80 },
      { id: '4', color: '#fef08a', position: 100 }
    ]
  },
  {
    id: 'monochrome-chrome',
    name: 'Monochrome Chrome',
    type: 'Linear',
    angle: 90,
    stops: [
      { id: '1', color: '#0a0a0a', position: 0 },
      { id: '2', color: '#3f3f46', position: 35 },
      { id: '3', color: '#a1a1aa', position: 70 },
      { id: '4', color: '#ffffff', position: 100 }
    ]
  },
  {
    id: 'vaporwave-dream',
    name: 'Vaporwave Dream',
    type: 'Linear',
    angle: 45,
    stops: [
      { id: '1', color: '#2c1654', position: 0 },
      { id: '2', color: '#7a226e', position: 40 },
      { id: '3', color: '#e85d9e', position: 75 },
      { id: '4', color: '#88f7e2', position: 100 }
    ]
  },
  {
    id: 'anime-cel-ambient',
    name: 'Anime Cel Ambient',
    type: 'Linear',
    angle: 90,
    stops: [
      { id: '1', color: '#1a1829', position: 0 },
      { id: '2', color: '#4a4468', position: 40 },
      { id: '3', color: '#9d8ec2', position: 75 },
      { id: '4', color: '#f5efff', position: 100 }
    ]
  }
]

const CUSTOM_GRADIENTS_KEY = 'polyecho_custom_gradients_v1'

export function loadCustomGradients(): SavedGradient[] {
  try {
    const raw = localStorage.getItem(CUSTOM_GRADIENTS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return parsed
      }
    }
    return []
  } catch {
    return []
  }
}

export function saveCustomGradients(gradients: SavedGradient[]) {
  try {
    const customOnly = gradients.filter(g => g.isCustom)
    localStorage.setItem(CUSTOM_GRADIENTS_KEY, JSON.stringify(customOnly))
  } catch (err) {
    console.error('Failed to save custom gradients:', err)
  }
}

export function generateGradientCssString(stops: GradientStop[], angle = 90, type: 'Linear' | 'Radial' | 'Angle' | 'Reflected' = 'Linear'): string {
  const sorted = [...stops].sort((a, b) => a.position - b.position)
  const stopsStr = sorted.map(s => `${s.color} ${s.position}%`).join(', ')
  if (type === 'Radial') {
    return `radial-gradient(circle, ${stopsStr})`
  }
  return `linear-gradient(${angle}deg, ${stopsStr})`
}
