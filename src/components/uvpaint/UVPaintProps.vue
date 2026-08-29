<script setup lang="ts">
import { ref, computed } from 'vue'
import { useToolStore } from '../../stores/toolStore'
import { useProjectStore } from '../../stores/projectStore'
import BlenderIcon from '../icons/BlenderIcon.vue'
import { 
  Sliders, 
  Check, 
  Zap, 
  Wand2, 
  RotateCw 
} from 'lucide-vue-next'

const toolStore = useToolStore()
const projectStore = useProjectStore()

const activeTab = ref<'material' | 'color' | 'gradient' | 'shading'>('material')

// ----------------------------------------------------
// 1. MATERIAL SYSTEM (Zero Emojis, Clean DCC Style)
// ----------------------------------------------------
interface MaterialPreset {
  name: string
  color: string
  roughness: number
  metalness: number
  emissive: string
  emissiveIntensity: number
  opacity: number
  shading: 'solid' | 'psx' | 'textured'
}

const materialPresets: MaterialPreset[] = [
  { name: 'Retro PSX', color: '#ffffff', roughness: 0.8, metalness: 0.0, emissive: '#000000', emissiveIntensity: 0, opacity: 1, shading: 'psx' },
  { name: 'Matte Diffuse', color: '#e2e8f0', roughness: 0.9, metalness: 0.0, emissive: '#000000', emissiveIntensity: 0, opacity: 1, shading: 'solid' },
  { name: 'Glossy Specular', color: '#38bdf8', roughness: 0.2, metalness: 0.1, emissive: '#000000', emissiveIntensity: 0, opacity: 1, shading: 'textured' },
  { name: 'Metallic Chrome', color: '#cbd5e1', roughness: 0.15, metalness: 0.9, emissive: '#000000', emissiveIntensity: 0, opacity: 1, shading: 'textured' },
  { name: 'Gold Lustre', color: '#f59e0b', roughness: 0.25, metalness: 0.85, emissive: '#000000', emissiveIntensity: 0, opacity: 1, shading: 'textured' },
  { name: 'Neon Glow', color: '#a855f7', roughness: 0.5, metalness: 0.0, emissive: '#c084fc', emissiveIntensity: 1.5, opacity: 1, shading: 'textured' },
  { name: 'Toon Cel-Shaded', color: '#ec4899', roughness: 0.9, metalness: 0.0, emissive: '#000000', emissiveIntensity: 0, opacity: 1, shading: 'solid' },
  { name: 'Glass Crystal', color: '#67e8f9', roughness: 0.05, metalness: 0.2, emissive: '#000000', emissiveIntensity: 0, opacity: 0.6, shading: 'textured' }
]

const matColor = ref<string>('#ffffff')
const matRoughness = ref<number>(0.5)
const matMetalness = ref<number>(0.0)
const matEmissive = ref<string>('#000000')
const matEmissiveIntensity = ref<number>(0.0)
const matOpacity = ref<number>(1.0)

function applyPreset(preset: MaterialPreset) {
  matColor.value = preset.color
  matRoughness.value = preset.roughness
  matMetalness.value = preset.metalness
  matEmissive.value = preset.emissive
  matEmissiveIntensity.value = preset.emissiveIntensity
  matOpacity.value = preset.opacity
  toolStore.viewport.shading = preset.shading
  applyMaterialToMesh()
}

function applyMaterialToMesh() {
  const mesh = projectStore.activeMesh
  if (!mesh) return
  projectStore.recordState('Apply Material')
  const mat = projectStore.materials.find(m => m.id === mesh.materialId) || projectStore.materials[0]
  if (mat) {
    mat.color = matColor.value
    mat.shading = toolStore.viewport.shading === 'psx' ? 'psx' : 'textured'
  }
}

// ----------------------------------------------------
// 2. COLOR HARMONIES & PALETTES
// ----------------------------------------------------
const retroPalettes = [
  {
    name: 'PSX Classic 16',
    colors: ['#000000', '#181425', '#262b44', '#3a4466', '#5a6988', '#8b9bb4', '#c0cbdc', '#ffffff', '#b13e53', '#ef7d57', '#ffcd75', '#a7f070', '#38b764', '#257179', '#29366f', '#3b5dc9']
  },
  {
    name: 'Cyberpunk Neon',
    colors: ['#0d0221', '#0f084b', '#26408b', '#0d0887', '#6a00a8', '#b12a90', '#e16462', '#fca636', '#00f0ff', '#ff003c', '#fcee0a', '#00ff66', '#ff00a0', '#7b00ff', '#ffffff', '#121212']
  },
  {
    name: 'PICO-8 16',
    colors: ['#000000', '#1D2B53', '#7E2553', '#008751', '#AB5236', '#5F574F', '#C2C3C7', '#FFF1E8', '#FF004D', '#FFA300', '#FFEC27', '#00E436', '#29ADFF', '#83769C', '#FF77A8', '#FFCCAA']
  },
  {
    name: 'Warm Earth 16',
    colors: ['#2b1810', '#4a2818', '#734125', '#a06037', '#cd8852', '#e5b682', '#f3d9b1', '#fff4e4', '#3e4a28', '#63753b', '#8ea64e', '#c1db70', '#8c2d19', '#b54b28', '#d67443', '#f0a36e']
  },
  {
    name: 'Pastel Vaporwave',
    colors: ['#2e1f47', '#493267', '#7b4e85', '#b36a8c', '#e38d94', '#f8b595', '#ffe0b5', '#ffffff', '#8be9fd', '#50fa7b', '#ffb86c', '#ff79c6', '#bd93f9', '#ff5555', '#f1fa8c', '#6272a4']
  }
]

const selectedPaletteIndex = ref<number>(0)
const currentPalette = computed(() => retroPalettes[selectedPaletteIndex.value])

const colorHarmonies = computed(() => {
  const hex = toolStore.primaryColor
  return {
    complementary: getShiftedColor(hex, 180),
    analogous1: getShiftedColor(hex, -30),
    analogous2: getShiftedColor(hex, 30),
    triadic1: getShiftedColor(hex, 120),
    triadic2: getShiftedColor(hex, 240),
    shades: [
      getTintShade(hex, 0.4),
      getTintShade(hex, 0.2),
      hex,
      getTintShade(hex, -0.2),
      getTintShade(hex, -0.4)
    ]
  }
})

// ----------------------------------------------------
// 3. BLOCKBENCH MULTI-STOP INTERACTIVE GRADIENT STUDIO
// ----------------------------------------------------
interface GradientStop {
  id: string
  color: string
  offset: number // 0 to 100
}

const gradientType = ref<'Linear' | 'Radial' | 'Angle' | 'Reflected'>('Linear')
const gradientStops = ref<GradientStop[]>([
  { id: '1', color: '#b95c5c', offset: 0 },
  { id: '2', color: '#ffffff', offset: 100 }
])
const selectedStopId = ref<string>('1')
const gradientAngle = ref<number>(0) // 0deg: left to right, 90deg: top to bottom

const selectedStop = computed(() => {
  return gradientStops.value.find(s => s.id === selectedStopId.value) || gradientStops.value[0]
})

const gradientCss = computed(() => {
  const sorted = [...gradientStops.value].sort((a, b) => a.offset - b.offset)
  const stopsStr = sorted.map(s => `${s.color} ${s.offset}%`).join(', ')
  if (gradientType.value === 'Radial') {
    return `radial-gradient(circle, ${stopsStr})`
  }
  return `linear-gradient(${gradientAngle.value}deg, ${stopsStr})`
})

const gradientHorizontalCss = computed(() => {
  const sorted = [...gradientStops.value].sort((a, b) => a.offset - b.offset)
  const stopsStr = sorted.map(s => `${s.color} ${s.offset}%`).join(', ')
  return `linear-gradient(to right, ${stopsStr})`
})

function handleBarClick(e: MouseEvent) {
  const target = e.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const clickPercent = Math.max(0, Math.min(100, Math.round(((e.clientX - rect.left) / rect.width) * 100)))

  const newColor = interpolateGradientColor(clickPercent)
  const newId = String(Date.now())
  gradientStops.value.push({ id: newId, color: newColor, offset: clickPercent })
  selectedStopId.value = newId
}

function handleStopMouseDown(e: MouseEvent, stopId: string) {
  e.stopPropagation()
  selectedStopId.value = stopId
  const stop = gradientStops.value.find(s => s.id === stopId)
  if (!stop) return

  const bar = (e.target as HTMLElement).closest('.gradient-rail') as HTMLElement
  if (!bar) return
  const rect = bar.getBoundingClientRect()

  const onMouseMove = (moveEvent: MouseEvent) => {
    const percent = Math.max(0, Math.min(100, Math.round(((moveEvent.clientX - rect.left) / rect.width) * 100)))
    stop.offset = percent
  }

  const onMouseUp = () => {
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

function deleteSelectedStop() {
  if (gradientStops.value.length <= 2) return
  const idx = gradientStops.value.findIndex(s => s.id === selectedStopId.value)
  if (idx !== -1) {
    gradientStops.value.splice(idx, 1)
    selectedStopId.value = gradientStops.value[0].id
  }
}

let isDraggingAngle = false
function startAngleDrag(e: MouseEvent) {
  isDraggingAngle = true
  updateAngleFromBox(e)

  const onMouseMove = (moveEvent: MouseEvent) => {
    if (!isDraggingAngle) return
    updateAngleFromBox(moveEvent)
  }

  const onMouseUp = () => {
    isDraggingAngle = false
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

function updateAngleFromBox(e: MouseEvent) {
  const box = document.getElementById('angle-preview-box')
  if (!box) return
  const rect = box.getBoundingClientRect()
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const rad = Math.atan2(e.clientY - cy, e.clientX - cx)
  let deg = Math.round(rad * (180 / Math.PI)) + 90
  if (deg < 0) deg += 360
  gradientAngle.value = deg
}

function bakeGradientToActiveFace() {
  projectStore.recordState('Bake Gradient to UV')
  const sorted = [...gradientStops.value].sort((a, b) => a.offset - b.offset)
  window.dispatchEvent(new CustomEvent('bake-gradient', {
    detail: {
      stops: sorted,
      angle: gradientAngle.value,
      type: gradientType.value,
      startColor: sorted[0]?.color || '#000000',
      endColor: sorted[sorted.length - 1]?.color || '#ffffff',
      direction: gradientAngle.value === 90 ? 'vertical' : 'horizontal'
    }
  }))
}

const gradientPresets = [
  { name: 'Ambient Occlusion', stops: [{ color: '#ffffff', offset: 0 }, { color: '#181a20', offset: 100 }], angle: 90 },
  { name: 'Warm Sunset', stops: [{ color: '#7c3aed', offset: 0 }, { color: '#f97316', offset: 60 }, { color: '#facc15', offset: 100 }], angle: 90 },
  { name: 'Cyber Neon', stops: [{ color: '#06b6d4', offset: 0 }, { color: '#d946ef', offset: 100 }], angle: 45 },
  { name: 'Sky Horizon', stops: [{ color: '#0284c7', offset: 0 }, { color: '#38bdf8', offset: 50 }, { color: '#f59e0b', offset: 100 }], angle: 90 },
  { name: 'Gold Chrome', stops: [{ color: '#fef08a', offset: 0 }, { color: '#ca8a04', offset: 50 }, { color: '#713f12', offset: 100 }], angle: 135 }
]

function applyGradPreset(p: any) {
  gradientStops.value = p.stops.map((s: any, idx: number) => ({ id: String(idx + 1), color: s.color, offset: s.offset }))
  selectedStopId.value = gradientStops.value[0].id
  gradientAngle.value = p.angle
}

// ----------------------------------------------------
// COLOR MATH HELPERS
// ----------------------------------------------------
function interpolateGradientColor(percent: number): string {
  const sorted = [...gradientStops.value].sort((a, b) => a.offset - b.offset)
  if (percent <= sorted[0].offset) return sorted[0].color
  if (percent >= sorted[sorted.length - 1].offset) return sorted[sorted.length - 1].color

  for (let i = 0; i < sorted.length - 1; i++) {
    const s1 = sorted[i]
    const s2 = sorted[i + 1]
    if (percent >= s1.offset && percent <= s2.offset) {
      const factor = (percent - s1.offset) / (s2.offset - s1.offset)
      const c1 = hexToRgb(s1.color)
      const c2 = hexToRgb(s2.color)
      return rgbToHex(
        Math.round(c1.r + (c2.r - c1.r) * factor),
        Math.round(c1.g + (c2.g - c1.g) * factor),
        Math.round(c1.b + (c2.b - c1.b) * factor)
      )
    }
  }
  return sorted[0].color
}

function getShiftedColor(hex: string, degree: number): string {
  const rgb = hexToRgb(hex)
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b)
  hsl.h = (hsl.h + degree + 360) % 360
  const outRgb = hslToRgb(hsl.h, hsl.s, hsl.l)
  return rgbToHex(outRgb.r, outRgb.g, outRgb.b)
}

function getTintShade(hex: string, factor: number): string {
  const rgb = hexToRgb(hex)
  if (factor > 0) {
    return rgbToHex(
      Math.round(rgb.r + (255 - rgb.r) * factor),
      Math.round(rgb.g + (255 - rgb.g) * factor),
      Math.round(rgb.b + (255 - rgb.b) * factor)
    )
  } else {
    const f = 1 + factor
    return rgbToHex(Math.round(rgb.r * f), Math.round(rgb.g * f), Math.round(rgb.b * f))
  }
}

function hexToRgb(hex: string) {
  let c = hex.replace('#', '')
  if (c.length === 3) c = c.split('').map(x => x + x).join('')
  const num = parseInt(c, 16) || 0
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 }
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => {
    const hex = Math.max(0, Math.min(255, x)).toString(16)
    return hex.length === 1 ? '0' + hex : hex
  }).join('')
}

function rgbToHsl(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break
      case g: h = (b - r) / d + 2; break
      case b: h = (r - g) / d + 4; break
    }
    h *= 60
  }
  return { h, s, l }
}

function hslToRgb(h: number, s: number, l: number) {
  let r: number, g: number, b: number
  if (s === 0) {
    r = g = b = l
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1/6) return p + (q - p) * 6 * t
      if (t < 1/2) return q
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6
      return p
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, (h / 360) + 1/3)
    g = hue2rgb(p, q, (h / 360))
    b = hue2rgb(p, q, (h / 360) - 1/3)
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) }
}
</script>

<template>
  <div class="h-full w-full bg-dcc-900 flex flex-col select-none overflow-y-auto p-2 text-slate-200 space-y-2 font-mono text-xs">
    <!-- Studio Header Navigation (Material | Color | Gradient | Shading) -->
    <div class="border-b border-dcc-750 pb-1.5 shrink-0">
      <div class="text-[9px] text-slate-400 font-bold mb-1 uppercase tracking-wider">Paint & Material Studio</div>
      <div class="grid grid-cols-4 gap-1 bg-dcc-900 p-0.5 rounded border border-dcc-750 text-[10px]">
        <button 
          @click="activeTab = 'material'"
          class="py-1 rounded text-center transition flex items-center justify-center gap-1"
          :class="activeTab === 'material' ? 'bg-indigo-600 text-white font-bold shadow-xs' : 'text-slate-400 hover:text-slate-200'"
        >
          <BlenderIcon name="material" :size="11" />
          <span>Material</span>
        </button>

        <button 
          @click="activeTab = 'color'"
          class="py-1 rounded text-center transition flex items-center justify-center gap-1"
          :class="activeTab === 'color' ? 'bg-indigo-600 text-white font-bold shadow-xs' : 'text-slate-400 hover:text-slate-200'"
        >
          <BlenderIcon name="brush" :size="11" />
          <span>Color</span>
        </button>

        <button 
          @click="activeTab = 'gradient'"
          class="py-1 rounded text-center transition flex items-center justify-center gap-1"
          :class="activeTab === 'gradient' ? 'bg-indigo-600 text-white font-bold shadow-xs' : 'text-slate-400 hover:text-slate-200'"
        >
          <BlenderIcon name="texture" :size="11" />
          <span>Gradient</span>
        </button>

        <button 
          @click="activeTab = 'shading'"
          class="py-1 rounded text-center transition flex items-center justify-center gap-1"
          :class="activeTab === 'shading' ? 'bg-indigo-600 text-white font-bold shadow-xs' : 'text-slate-400 hover:text-slate-200'"
        >
          <BlenderIcon name="shading-rendered" :size="11" />
          <span>Shading</span>
        </button>
      </div>
    </div>

    <!-- TAB 1: 1-CLICK MATERIAL SYSTEM -->
    <div v-show="activeTab === 'material'" class="space-y-2">
      <!-- 1-Click Material Presets Grid -->
      <div class="bg-dcc-850 p-2 rounded border border-dcc-750 space-y-1.5">
        <span class="text-[10px] font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
          <BlenderIcon name="material" :size="12" color="#818cf8" />
          <span>Material Presets</span>
        </span>

        <div class="grid grid-cols-2 gap-1 pt-0.5">
          <button 
            v-for="preset in materialPresets" 
            :key="preset.name"
            @click="applyPreset(preset)"
            class="p-1.5 rounded bg-dcc-900 hover:bg-dcc-750 border border-dcc-750 hover:border-indigo-500 text-left flex items-center space-x-1.5 transition group"
          >
            <div 
              class="w-2.5 h-2.5 rounded-full border border-white/40 shrink-0"
              :style="{ backgroundColor: preset.color }"
            ></div>
            <div class="truncate">
              <div class="text-[10px] font-bold text-slate-200 group-hover:text-indigo-300 truncate">{{ preset.name }}</div>
              <div class="text-[8px] text-slate-500 uppercase">{{ preset.shading }}</div>
            </div>
          </button>
        </div>
      </div>

      <!-- Material Properties Customizer -->
      <div class="bg-dcc-850 p-2 rounded border border-dcc-750 space-y-2">
        <span class="text-[10px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
          <Sliders class="w-3 h-3 text-slate-400" />
          <span>Material Parameters</span>
        </span>

        <!-- Base Tint Color -->
        <div class="space-y-0.5">
          <div class="flex items-center justify-between text-[9px] text-slate-400">
            <span>Base Tint:</span>
            <span class="font-mono text-slate-200">{{ matColor }}</span>
          </div>
          <div class="flex items-center space-x-1.5">
            <input type="color" v-model="matColor" @input="applyMaterialToMesh" class="w-6 h-6 rounded border border-dcc-700 bg-transparent cursor-pointer" />
            <input type="text" v-model="matColor" @change="applyMaterialToMesh" class="flex-1 bg-dcc-900 border border-dcc-700 rounded px-1.5 py-0.5 text-slate-200 text-[10px] focus:outline-none" />
          </div>
        </div>

        <!-- Roughness Slider -->
        <div class="space-y-0.5">
          <div class="flex items-center justify-between text-[9px] text-slate-400">
            <span>Roughness / Matte:</span>
            <span class="text-indigo-400 font-bold">{{ Math.round(matRoughness * 100) }}%</span>
          </div>
          <input type="range" min="0" max="1" step="0.05" v-model.number="matRoughness" @input="applyMaterialToMesh" class="w-full accent-indigo-500 bg-dcc-900 h-1 rounded cursor-pointer" />
        </div>

        <!-- Metalness Slider -->
        <div class="space-y-0.5">
          <div class="flex items-center justify-between text-[9px] text-slate-400">
            <span>Metalness:</span>
            <span class="text-indigo-400 font-bold">{{ Math.round(matMetalness * 100) }}%</span>
          </div>
          <input type="range" min="0" max="1" step="0.05" v-model.number="matMetalness" @input="applyMaterialToMesh" class="w-full accent-indigo-500 bg-dcc-900 h-1 rounded cursor-pointer" />
        </div>

        <!-- Emission Glow -->
        <div class="space-y-0.5">
          <div class="flex items-center justify-between text-[9px] text-slate-400">
            <span>Emissive Glow:</span>
            <span class="text-indigo-400 font-bold">{{ matEmissiveIntensity }}x</span>
          </div>
          <div class="flex items-center space-x-1.5">
            <input type="color" v-model="matEmissive" @input="applyMaterialToMesh" class="w-6 h-6 rounded border border-dcc-700 bg-transparent cursor-pointer" />
            <input type="range" min="0" max="3" step="0.1" v-model.number="matEmissiveIntensity" @input="applyMaterialToMesh" class="flex-1 accent-indigo-500 bg-dcc-900 h-1 rounded cursor-pointer" />
          </div>
        </div>

        <!-- Apply Button -->
        <button 
          @click="applyMaterialToMesh"
          class="w-full py-1.5 px-2 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] shadow-xs flex items-center justify-center space-x-1.5 transition"
        >
          <Check class="w-3 h-3" />
          <span>Apply Material to Mesh</span>
        </button>
      </div>
    </div>

    <!-- TAB 2: ADVANCED COLOR & HARMONIES -->
    <div v-show="activeTab === 'color'" class="space-y-3">
      <!-- Primary / Secondary Swatches -->
      <div class="bg-dcc-850 p-2.5 rounded border border-dcc-750 flex items-center justify-between">
        <div class="flex items-center space-x-3">
          <div class="relative w-10 h-10">
            <!-- Secondary swatch -->
            <div 
              class="absolute bottom-0 right-0 w-6 h-6 rounded border border-dcc-700 shadow"
              :style="{ backgroundColor: toolStore.secondaryColor }"
              title="Secondary Color (Background)"
            ></div>
            <!-- Primary swatch -->
            <div 
              class="absolute top-0 left-0 w-6 h-6 rounded border border-white shadow-md z-10"
              :style="{ backgroundColor: toolStore.primaryColor }"
              title="Primary Paint Color"
            ></div>
          </div>
          <div>
            <div class="text-[11px] font-bold text-slate-200">{{ toolStore.primaryColor.toUpperCase() }}</div>
            <div class="text-[9px] text-slate-500">Active Paint Color</div>
          </div>
        </div>

        <input 
          type="color" 
          v-model="toolStore.primaryColor" 
          class="w-8 h-8 rounded border border-dcc-700 bg-transparent cursor-pointer"
        />
      </div>

      <!-- Color Harmonies Generator -->
      <div class="bg-dcc-850 p-2.5 rounded border border-dcc-750 space-y-2">
        <span class="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
          <Wand2 class="w-3.5 h-3.5 text-indigo-400" />
          <span>Color Harmonies</span>
        </span>

        <!-- Complementary & Triadic -->
        <div class="space-y-1 text-[10px]">
          <span class="text-slate-400">Complementary & Triadic:</span>
          <div class="flex items-center gap-1.5">
            <button 
              @click="toolStore.primaryColor = colorHarmonies.complementary"
              class="flex-1 h-6 rounded border border-dcc-700 hover:scale-105 transition"
              :style="{ backgroundColor: colorHarmonies.complementary }"
              title="Complementary Color"
            ></button>
            <button 
              @click="toolStore.primaryColor = colorHarmonies.triadic1"
              class="flex-1 h-6 rounded border border-dcc-700 hover:scale-105 transition"
              :style="{ backgroundColor: colorHarmonies.triadic1 }"
              title="Triadic 1"
            ></button>
            <button 
              @click="toolStore.primaryColor = colorHarmonies.triadic2"
              class="flex-1 h-6 rounded border border-dcc-700 hover:scale-105 transition"
              :style="{ backgroundColor: colorHarmonies.triadic2 }"
              title="Triadic 2"
            ></button>
          </div>
        </div>

        <!-- Monochromatic Shades Ramp -->
        <div class="space-y-1 text-[10px] pt-1">
          <span class="text-slate-400">Shades & Tints:</span>
          <div class="grid grid-cols-5 gap-1">
            <button 
              v-for="(shd, idx) in colorHarmonies.shades" 
              :key="idx"
              @click="toolStore.primaryColor = shd"
              class="h-6 rounded border border-dcc-700 hover:scale-105 transition"
              :style="{ backgroundColor: shd }"
            ></button>
          </div>
        </div>
      </div>

      <!-- Curated Retro Palettes Switcher -->
      <div class="bg-dcc-850 p-2.5 rounded border border-dcc-750 space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <BlenderIcon name="brush" :size="13" color="#818cf8" />
            <span>Palettes</span>
          </span>
          <select 
            v-model="selectedPaletteIndex"
            class="bg-dcc-900 text-slate-200 border border-dcc-700 text-[10px] rounded px-1.5 py-0.5 focus:outline-none"
          >
            <option v-for="(p, idx) in retroPalettes" :key="p.name" :value="idx">
              {{ p.name }}
            </option>
          </select>
        </div>

        <!-- Palette Swatches Grid -->
        <div class="grid grid-cols-8 gap-1 pt-1">
          <button 
            v-for="c in currentPalette.colors" 
            :key="c"
            @click="toolStore.primaryColor = c"
            @contextmenu.prevent="toolStore.secondaryColor = c"
            class="w-full aspect-square rounded border border-dcc-750 hover:border-white hover:scale-110 transition shadow-xs"
            :style="{ backgroundColor: c }"
            :title="`${c} (Left-click: Primary, Right-click: Secondary)`"
          ></button>
        </div>
      </div>
    </div>

    <!-- TAB 3: BLOCKBENCH MULTI-STOP INTERACTIVE GRADIENT STUDIO -->
    <div v-show="activeTab === 'gradient'" class="space-y-3">
      <div class="bg-dcc-850 p-3 rounded border border-dcc-750 space-y-3">
        <!-- Header Type Selector -->
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-bold text-slate-300 uppercase flex items-center gap-1.5">
            <BlenderIcon name="texture" :size="13" color="#818cf8" />
            <span>Gradient</span>
          </span>
          <select 
            v-model="gradientType"
            class="bg-dcc-900 text-slate-200 border border-dcc-700 text-[10px] rounded px-2 py-1 focus:outline-none"
          >
            <option value="Linear">Linear</option>
            <option value="Radial">Radial</option>
            <option value="Angle">Angle</option>
            <option value="Reflected">Reflected</option>
          </select>
        </div>

        <!-- Interactive Multi-Stop Gradient Bar with Draggable Handles -->
        <div class="space-y-1.5 pt-1">
          <div 
            @click="handleBarClick"
            class="gradient-rail relative h-12 w-full rounded border border-dcc-700 shadow-inner cursor-pointer select-none"
            :style="{ background: gradientHorizontalCss }"
            title="Click anywhere to add color stop. Drag handles to move."
          >
            <!-- Rail line -->
            <div class="absolute top-1/2 left-0 right-0 h-0.5 bg-black/40 pointer-events-none"></div>

            <!-- Stop Handles -->
            <div 
              v-for="stop in gradientStops"
              :key="stop.id"
              @mousedown="handleStopMouseDown($event, stop.id)"
              class="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full border-2 cursor-grab shadow-lg transition-transform"
              :class="selectedStopId === stop.id ? 'border-white scale-125 ring-2 ring-indigo-500 z-20' : 'border-slate-800 z-10 hover:scale-110'"
              :style="{ left: `${stop.offset}%`, backgroundColor: stop.color }"
              :title="`Stop ${stop.offset}% (${stop.color})`"
            ></div>

            <!-- Delete selected stop button '-' -->
            <button 
              v-if="gradientStops.length > 2"
              @click.stop="deleteSelectedStop"
              class="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-dcc-900/90 hover:bg-rose-600 text-slate-300 hover:text-white text-[9px] border border-dcc-700 transition"
              title="Delete Selected Stop"
            >
              -
            </button>
          </div>
        </div>

        <!-- Selected Stop Controls (Color Swatch Pill & Offset Input) -->
        <div v-if="selectedStop" class="flex items-center justify-between gap-3 pt-1">
          <div class="flex items-center space-x-2">
            <span class="text-[11px] text-slate-400">Color</span>
            <div class="flex items-center space-x-1.5">
              <input 
                type="color" 
                v-model="selectedStop.color" 
                class="w-7 h-7 rounded border border-dcc-700 bg-transparent cursor-pointer" 
              />
              <input 
                type="text" 
                v-model="selectedStop.color" 
                class="w-18 bg-dcc-900 border border-dcc-700 rounded px-1.5 py-1 text-slate-200 text-[10px] focus:outline-none" 
              />
            </div>
          </div>

          <div class="flex items-center space-x-1.5">
            <span class="text-[11px] text-slate-400">Offset</span>
            <input 
              type="number" 
              min="0" 
              max="100" 
              v-model.number="selectedStop.offset" 
              class="w-14 bg-dcc-900 border border-dcc-700 rounded px-1.5 py-1 text-center text-slate-100 text-xs font-bold focus:outline-none" 
            />
          </div>
        </div>

        <!-- Interactive 2D Angle / Direction Control Box -->
        <div class="space-y-1.5 pt-1 border-t border-dcc-750">
          <div class="flex items-center justify-between text-[10px] text-slate-400">
            <span>2D Angle & Direction:</span>
            <div class="flex items-center space-x-1 text-indigo-400 font-bold">
              <span>{{ gradientAngle }}°</span>
              <button @click="gradientAngle = (gradientAngle + 90) % 360" class="p-0.5 hover:bg-dcc-750 rounded text-slate-400 hover:text-white" title="Rotate 90°">
                <RotateCw class="w-3 h-3" />
              </button>
            </div>
          </div>

          <!-- Angle Preview & Drag Box -->
          <div class="flex items-center justify-center pt-1">
            <div 
              id="angle-preview-box"
              @mousedown="startAngleDrag"
              class="w-36 h-36 rounded-md border border-dcc-700 shadow-xl relative cursor-crosshair overflow-hidden select-none flex items-center justify-center"
              :style="{ background: gradientCss }"
              title="Click and drag around the center to freely rotate the gradient angle"
            >
              <!-- Center Pivot Indicator -->
              <div class="w-2 h-2 rounded-full bg-white/60 shadow pointer-events-none"></div>

              <!-- Direction Pointer Needle -->
              <div 
                class="absolute w-12 h-0.5 bg-white/80 origin-left pointer-events-none shadow"
                :style="{ transform: `rotate(${gradientAngle - 90}deg)` }"
              >
                <div class="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-white rounded-full shadow-md"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- 1-Click Bake Gradient to Active Face / Texture -->
        <button 
          @click="bakeGradientToActiveFace"
          class="w-full py-2 px-3 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] shadow-xs flex items-center justify-center space-x-1.5 transition active:scale-98"
        >
          <Zap class="w-3.5 h-3.5" />
          <span>Bake Gradient to Active UV / Face</span>
        </button>
      </div>

      <!-- Preset Gradient Ramps -->
      <div class="bg-dcc-850 p-2.5 rounded border border-dcc-750 space-y-1.5">
        <span class="text-[10px] text-slate-400 font-bold uppercase">Popular Presets</span>
        <div class="space-y-1">
          <button 
            v-for="p in gradientPresets" 
            :key="p.name"
            @click="applyGradPreset(p)"
            class="w-full h-6 rounded border border-dcc-700 flex items-center justify-between px-2 text-[10px] font-bold text-white drop-shadow hover:scale-[1.02] transition"
            :style="{ background: `linear-gradient(to right, ${p.stops.map(s => `${s.color} ${s.offset}%`).join(', ')})` }"
          >
            <span>{{ p.name }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- TAB 4: SHADING & LIGHTING -->
    <div v-show="activeTab === 'shading'" class="space-y-3">
      <!-- Retro Shading Controls -->
      <div class="bg-dcc-850 p-2.5 rounded border border-dcc-750 space-y-2">
        <span class="text-[11px] font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
          <BlenderIcon name="shading-rendered" :size="13" color="#818cf8" />
          <span>PSX Shading & Lighting</span>
        </span>

        <!-- Shading Mode -->
        <div class="space-y-1">
          <span class="text-[10px] text-slate-400">Viewport Shading Mode:</span>
          <div class="grid grid-cols-2 gap-1 text-[10px]">
            <button 
              @click="toolStore.viewport.shading = 'textured'"
              class="py-1 rounded border transition flex items-center justify-center gap-1"
              :class="toolStore.viewport.shading === 'textured' ? 'bg-indigo-600 text-white font-bold border-indigo-400' : 'bg-dcc-900 border-dcc-750 text-slate-400 hover:text-slate-200'"
            >
              <BlenderIcon name="shading-textured" :size="12" />
              <span>Textured</span>
            </button>
            <button 
              @click="toolStore.viewport.shading = 'psx'"
              class="py-1 rounded border transition flex items-center justify-center gap-1"
              :class="toolStore.viewport.shading === 'psx' ? 'bg-indigo-600 text-white font-bold border-indigo-400' : 'bg-dcc-900 border-dcc-750 text-slate-400 hover:text-slate-200'"
            >
              <BlenderIcon name="shading-rendered" :size="12" />
              <span>Retro PSX</span>
            </button>
            <button 
              @click="toolStore.viewport.shading = 'solid'"
              class="py-1 rounded border transition flex items-center justify-center gap-1"
              :class="toolStore.viewport.shading === 'solid' ? 'bg-indigo-600 text-white font-bold border-indigo-400' : 'bg-dcc-900 border-dcc-750 text-slate-400 hover:text-slate-200'"
            >
              <BlenderIcon name="shading-solid" :size="12" />
              <span>Solid</span>
            </button>
            <button 
              @click="toolStore.viewport.shading = 'wireframe'"
              class="py-1 rounded border transition flex items-center justify-center gap-1"
              :class="toolStore.viewport.shading === 'wireframe' ? 'bg-indigo-600 text-white font-bold border-indigo-400' : 'bg-dcc-900 border-dcc-750 text-slate-400 hover:text-slate-200'"
            >
              <BlenderIcon name="shading-wire" :size="12" />
              <span>Wireframe</span>
            </button>
          </div>
        </div>

        <!-- PSX Retro Features Toggles -->
        <div class="space-y-1.5 pt-1 border-t border-dcc-750">
          <label class="flex items-center justify-between p-1.5 bg-dcc-900 rounded border border-dcc-750 cursor-pointer">
            <span class="text-slate-300">Affine Texture Warping</span>
            <input type="checkbox" v-model="toolStore.viewport.psxAffine" class="rounded bg-dcc-800 border-dcc-700 text-indigo-600" />
          </label>

          <label class="flex items-center justify-between p-1.5 bg-dcc-900 rounded border border-dcc-750 cursor-pointer">
            <span class="text-slate-300">Vertex Coordinate Jitter</span>
            <input type="checkbox" v-model="toolStore.viewport.psxJitter" class="rounded bg-dcc-800 border-dcc-700 text-indigo-600" />
          </label>

          <label class="flex items-center justify-between p-1.5 bg-dcc-900 rounded border border-dcc-750 cursor-pointer">
            <span class="text-slate-300">Bayer Matrix Dithering</span>
            <input type="checkbox" v-model="toolStore.viewport.dither" class="rounded bg-dcc-800 border-dcc-700 text-indigo-600" />
          </label>

          <label class="flex items-center justify-between p-1.5 bg-dcc-900 rounded border border-dcc-750 cursor-pointer">
            <span class="text-slate-300">CRT Scanline Filter</span>
            <input type="checkbox" v-model="toolStore.viewport.crtFilter" class="rounded bg-dcc-800 border-dcc-700 text-indigo-600" />
          </label>
        </div>
      </div>
    </div>
  </div>
</template>
