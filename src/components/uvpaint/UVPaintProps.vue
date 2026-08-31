<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useToolStore } from '../../stores/toolStore'
import { useProjectStore } from '../../stores/projectStore'
import BlenderIcon from '../icons/BlenderIcon.vue'
import { 
  Sliders, 
  Zap, 
  Wand2, 
  RotateCw,
  Plus,
  Trash2,
  Copy,
  Sparkles,
  Save
} from 'lucide-vue-next'
import { DEFAULT_GRADIENT_PRESETS, loadCustomGradients, saveCustomGradients, SavedGradient } from '../../utils/gradient'
import { DITHER_PRESETS, DitherPreset, renderDitherCanvasPreview } from '../../utils/dithering'

const toolStore = useToolStore()
const projectStore = useProjectStore()

const activeTab = ref<'material' | 'color' | 'gradient' | 'shading'>('material')

// ----------------------------------------------------
// 1. MATERIAL SYSTEM & REAL-TIME PLUMBING
// ----------------------------------------------------
const activeMaterialId = ref<string>(projectStore.activeMesh?.materialId || projectStore.materials[0]?.id || 'default_material')

watch(() => projectStore.activeMesh?.materialId, (newId) => {
  if (newId) activeMaterialId.value = newId
}, { immediate: true })

const activeMaterial = computed(() => {
  return projectStore.materials.find(m => m.id === activeMaterialId.value) || projectStore.materials[0]
})

function selectMaterial(id: string) {
  activeMaterialId.value = id
  if (projectStore.activeMesh) {
    projectStore.assignMaterialToActiveMesh(id)
  }
}

function createNewMaterial() {
  const newMat = projectStore.addMaterial()
  selectMaterial(newMat.id)
}

function duplicateCurrentMaterial() {
  if (!activeMaterial.value) return
  const cur = activeMaterial.value
  const cloned = projectStore.addMaterial(`${cur.name} Copy`, cur.textureId)
  cloned.color = cur.color
  cloned.roughness = cur.roughness
  cloned.metalness = cur.metalness
  cloned.emissive = cur.emissive
  cloned.emissiveIntensity = cur.emissiveIntensity
  cloned.shading = cur.shading
  cloned.dither = cur.dither
  cloned.ditherPattern = cur.ditherPattern
  cloned.ditherLevel = cur.ditherLevel
  cloned.colorDepth = cur.colorDepth
  selectMaterial(cloned.id)
}

function deleteCurrentMaterial() {
  if (projectStore.materials.length <= 1) return
  projectStore.deleteMaterial(activeMaterialId.value)
  activeMaterialId.value = projectStore.materials[0]?.id || 'default_material'
}

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

function applyPreset(preset: MaterialPreset) {
  if (!activeMaterial.value) return
  projectStore.recordState(`Apply Material Preset ${preset.name}`)
  activeMaterial.value.color = preset.color
  activeMaterial.value.roughness = preset.roughness
  activeMaterial.value.metalness = preset.metalness
  activeMaterial.value.emissive = preset.emissive
  activeMaterial.value.emissiveIntensity = preset.emissiveIntensity
  activeMaterial.value.shading = preset.shading === 'psx' ? 'psx' : 'textured'
  projectStore.markGeometryUpdated()
}

// ----------------------------------------------------
// DITHERING PREVIEWS & PRESETS ENGINE
// ----------------------------------------------------
const ditherPreviewCanvasRef = ref<HTMLCanvasElement | null>(null)

function updateDitherPreview() {
  if (!ditherPreviewCanvasRef.value) return
  const mat = activeMaterial.value
  if (!mat) return
  renderDitherCanvasPreview(
    ditherPreviewCanvasRef.value,
    mat.ditherPattern || 'bayer4x4',
    mat.ditherLevel ?? 32,
    mat.colorDepth ?? 32,
    mat.ditherScale ?? 1,
    mat.color || '#38bdf8'
  )
}

function applyDitherPreset(preset: DitherPreset) {
  if (!activeMaterial.value) return
  projectStore.recordState(`Apply Dither Preset: ${preset.name}`)
  activeMaterial.value.dither = true
  activeMaterial.value.ditherPattern = preset.pattern
  activeMaterial.value.ditherLevel = preset.ditherLevel
  activeMaterial.value.colorDepth = preset.colorDepth
  activeMaterial.value.ditherScale = preset.scale
  projectStore.markGeometryUpdated()
  nextTick(() => {
    updateDitherPreview()
  })
}

onMounted(() => {
  customGradients.value = loadCustomGradients()
  nextTick(() => {
    updateDitherPreview()
  })
})

watch([
  () => activeMaterial.value?.dither,
  () => activeMaterial.value?.ditherPattern,
  () => activeMaterial.value?.ditherLevel,
  () => activeMaterial.value?.colorDepth,
  () => activeMaterial.value?.ditherScale,
  () => activeMaterial.value?.color
], () => {
  updateDitherPreview()
})

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

// Custom Gradient Management
const customGradients = ref<SavedGradient[]>([])
const gradientName = ref<string>('Sunset Horizon')
const selectedGradientId = ref<string>(DEFAULT_GRADIENT_PRESETS[0]?.id || 'sunset-horizon')

const allGradients = computed<SavedGradient[]>(() => {
  return [...DEFAULT_GRADIENT_PRESETS, ...customGradients.value]
})

function applySavedGradient(g: SavedGradient) {
  gradientName.value = g.name
  selectedGradientId.value = g.id
  gradientType.value = g.type || 'Linear'
  gradientAngle.value = g.angle || 90
  gradientStops.value = g.stops.map((s, idx) => ({
    id: String(idx + 1),
    color: s.color,
    offset: s.position
  }))
  selectedStopId.value = gradientStops.value[0]?.id || '1'
}

function saveCurrentCustomGradient() {
  const name = gradientName.value.trim() || `Custom Gradient ${customGradients.value.length + 1}`
  const existingIdx = customGradients.value.findIndex(g => g.id === selectedGradientId.value && g.isCustom)
  const stopsToSave = gradientStops.value.map((s, idx) => ({
    id: String(idx + 1),
    color: s.color,
    position: s.offset
  }))

  if (existingIdx >= 0) {
    customGradients.value[existingIdx].name = name
    customGradients.value[existingIdx].stops = stopsToSave
    customGradients.value[existingIdx].type = gradientType.value
    customGradients.value[existingIdx].angle = gradientAngle.value
  } else {
    const newG: SavedGradient = {
      id: `custom_grad_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      type: gradientType.value,
      angle: gradientAngle.value,
      stops: stopsToSave,
      isCustom: true
    }
    customGradients.value.push(newG)
    selectedGradientId.value = newG.id
  }
  saveCustomGradients(customGradients.value)
}

function createNewCustomGradient() {
  const newName = `New Gradient ${customGradients.value.length + 1}`
  gradientName.value = newName
  const newG: SavedGradient = {
    id: `custom_grad_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: newName,
    type: 'Linear',
    angle: 90,
    stops: [
      { id: '1', color: toolStore.primaryColor || '#1e1b4b', position: 0 },
      { id: '2', color: toolStore.secondaryColor || '#fef08a', position: 100 }
    ],
    isCustom: true
  }
  customGradients.value.push(newG)
  saveCustomGradients(customGradients.value)
  applySavedGradient(newG)
}

function deleteCurrentCustomGradient() {
  const curId = selectedGradientId.value
  customGradients.value = customGradients.value.filter(g => g.id !== curId)
  saveCustomGradients(customGradients.value)
  applySavedGradient(DEFAULT_GRADIENT_PRESETS[0])
}

const gradientPresets = [
  { name: 'Ambient Occlusion', stops: [{ color: '#ffffff', offset: 0 }, { color: '#181a20', offset: 100 }], angle: 90 },
  { name: 'Warm Sunset', stops: [{ color: '#7c3aed', offset: 0 }, { color: '#f97316', offset: 60 }, { color: '#facc15', offset: 100 }], angle: 90 },
  { name: 'Cyber Neon', stops: [{ color: '#06b6d4', offset: 0 }, { color: '#d946ef', offset: 100 }], angle: 45 },
  { name: 'Sky Horizon', stops: [{ color: '#0284c7', offset: 0 }, { color: '#38bdf8', offset: 50 }, { color: '#f59e0b', offset: 100 }], angle: 90 },
  { name: 'Gold Chrome', stops: [{ color: '#fef08a', offset: 0 }, { color: '#ca8a04', offset: 50 }, { color: '#713f12', offset: 100 }], angle: 135 }
]

function applyGradPreset(p: any) {
  gradientName.value = p.name
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
  <div class="h-full w-full bg-ui-panel flex flex-col select-none overflow-y-auto p-2 text-ui-textPrimary space-y-2 font-mono text-xs">
    <!-- Studio Header Navigation (Material | Color | Gradient | Shading) -->
    <div class="border-b border-ui-borderSubtle pb-1.5 shrink-0">
      <div class="text-[9px] text-ui-textMuted font-bold mb-1 uppercase tracking-wider">Paint & Material Studio</div>
      <div class="grid grid-cols-4 gap-1 bg-ui-input p-0.5 rounded-xs border border-ui-borderSubtle text-[10px]">
        <button 
          @click="activeTab = 'material'"
          class="py-1 rounded-xs text-center transition flex items-center justify-center gap-1"
          :class="activeTab === 'material' ? 'bg-ui-accent text-white font-bold shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
        >
          <BlenderIcon name="material" :size="11" />
          <span>Material</span>
        </button>

        <button 
          @click="activeTab = 'color'"
          class="py-1 rounded-xs text-center transition flex items-center justify-center gap-1"
          :class="activeTab === 'color' ? 'bg-ui-accent text-white font-bold shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
        >
          <BlenderIcon name="brush" :size="11" />
          <span>Color</span>
        </button>

        <button 
          @click="activeTab = 'gradient'"
          class="py-1 rounded-xs text-center transition flex items-center justify-center gap-1"
          :class="activeTab === 'gradient' ? 'bg-ui-accent text-white font-bold shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
        >
          <BlenderIcon name="texture" :size="11" />
          <span>Gradient</span>
        </button>

        <button 
          @click="activeTab = 'shading'"
          class="py-1 rounded-xs text-center transition flex items-center justify-center gap-1"
          :class="activeTab === 'shading' ? 'bg-ui-accent text-white font-bold shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
        >
          <BlenderIcon name="shading-rendered" :size="11" />
          <span>Shading</span>
        </button>
      </div>
    </div>

    <!-- TAB 1: MATERIAL MANAGER & REAL-TIME CONTROLS -->
    <div v-show="activeTab === 'material'" class="space-y-2">
      <!-- Material Slot Selector & Toolbar -->
      <div class="bg-ui-surface p-2 rounded-xs border border-ui-borderSubtle space-y-1.5">
        <div class="flex items-center justify-between">
          <span class="text-[10px] font-bold text-ui-textAccent uppercase tracking-wider flex items-center gap-1.5">
            <BlenderIcon name="material" :size="12" />
            <span>Active Material Slot</span>
          </span>
          <span class="text-[9px] font-mono text-ui-textMuted">{{ projectStore.materials.length }} Slots</span>
        </div>

        <div class="flex items-center gap-1">
          <select 
            :value="activeMaterialId"
            @change="selectMaterial(($event.target as HTMLSelectElement).value)"
            class="flex-1 bg-ui-input border border-ui-borderSubtle rounded-xs px-2 py-1 text-ui-textPrimary text-[11px] focus:outline-none focus:border-ui-accent cursor-pointer font-bold"
          >
            <option v-for="mat in projectStore.materials" :key="mat.id" :value="mat.id">
              {{ mat.name }} ({{ (mat.shading || 'pbr').toUpperCase() }})
            </option>
          </select>

          <button 
            @click="createNewMaterial"
            class="h-7 px-1.5 rounded-xs bg-ui-input hover:bg-ui-hover text-emerald-400 border border-ui-borderSubtle transition flex items-center gap-0.5 text-[10px] font-bold cursor-pointer"
            title="Create New Material"
          >
            <Plus class="w-3 h-3" />
            <span>New</span>
          </button>

          <button 
            @click="duplicateCurrentMaterial"
            class="h-7 px-1.5 rounded-xs bg-ui-input hover:bg-ui-hover text-sky-400 border border-ui-borderSubtle transition flex items-center text-[10px] cursor-pointer"
            title="Duplicate Material"
          >
            <Copy class="w-3 h-3" />
          </button>

          <button 
            v-if="projectStore.materials.length > 1"
            @click="deleteCurrentMaterial"
            class="h-7 px-1.5 rounded-xs bg-ui-input hover:bg-rose-950/40 text-ui-textMuted hover:text-rose-400 border border-ui-borderSubtle transition cursor-pointer"
            title="Delete Material"
          >
            <Trash2 class="w-3 h-3" />
          </button>
        </div>
      </div>

      <!-- 1-Click Material Presets Grid -->
      <div class="bg-ui-surface p-2 rounded-xs border border-ui-borderSubtle space-y-1.5">
        <span class="text-[10px] font-bold text-ui-textPrimary uppercase tracking-wider flex items-center gap-1.5">
          <Zap class="w-3 h-3 text-amber-400" />
          <span>Quick Presets</span>
        </span>

        <div class="grid grid-cols-2 gap-1 pt-0.5">
          <button 
            v-for="preset in materialPresets" 
            :key="preset.name"
            @click="applyPreset(preset)"
            class="p-1.5 rounded-xs bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle hover:border-ui-accent text-left flex items-center space-x-1.5 transition group cursor-pointer"
          >
            <div 
              class="w-2.5 h-2.5 rounded-full border border-white/40 shrink-0"
              :style="{ backgroundColor: preset.color }"
            ></div>
            <div class="truncate">
              <div class="text-[10px] font-bold text-ui-textPrimary group-hover:text-ui-textAccent truncate">{{ preset.name }}</div>
              <div class="text-[8px] text-ui-textMuted uppercase">{{ preset.shading }}</div>
            </div>
          </button>
        </div>
      </div>

      <!-- Material Properties Customizer -->
      <div v-if="activeMaterial" class="bg-ui-surface p-2 rounded-xs border border-ui-borderSubtle space-y-2">
        <span class="text-[10px] font-bold text-ui-textPrimary uppercase tracking-wider flex items-center gap-1.5">
          <Sliders class="w-3 h-3 text-ui-textMuted" />
          <span>Parameters: {{ activeMaterial.name }}</span>
        </span>

        <!-- Base Tint Color -->
        <div class="space-y-0.5">
          <div class="flex items-center justify-between text-[9px] text-ui-textMuted">
            <span>Base Tint:</span>
            <span class="font-mono text-ui-textPrimary">{{ activeMaterial.color }}</span>
          </div>
          <div class="flex items-center space-x-1.5">
            <input 
              type="color" 
              v-model="activeMaterial.color" 
              @change="projectStore.markGeometryUpdated()"
              class="w-6 h-6 rounded-xs border border-ui-borderDefault bg-transparent cursor-pointer" 
            />
            <input 
              type="text" 
              v-model="activeMaterial.color" 
              @change="projectStore.markGeometryUpdated()"
              class="flex-1 bg-ui-input border border-ui-borderDefault rounded-xs px-1.5 py-0.5 text-ui-textPrimary text-[10px] focus:outline-none focus:border-ui-accent font-mono" 
            />
          </div>
        </div>

        <!-- Roughness Slider -->
        <div class="space-y-0.5 pt-1 border-t border-ui-borderSubtle">
          <div class="flex items-center justify-between text-[9px] text-ui-textMuted">
            <span>Roughness / Matte:</span>
            <span class="text-ui-textAccent font-bold">{{ Math.round((activeMaterial.roughness ?? 0.5) * 100) }}%</span>
          </div>
          <input 
            type="range" 
            min="0" 
            max="1" 
            step="0.05" 
            v-model.number="activeMaterial.roughness" 
            @input="projectStore.markGeometryUpdated()" 
            class="w-full accent-ui-accent bg-ui-input h-1.5 rounded-xs cursor-pointer" 
          />
        </div>

        <!-- Metalness Slider -->
        <div class="space-y-0.5">
          <div class="flex items-center justify-between text-[9px] text-ui-textMuted">
            <span>Metalness:</span>
            <span class="text-ui-textAccent font-bold">{{ Math.round((activeMaterial.metalness ?? 0.0) * 100) }}%</span>
          </div>
          <input 
            type="range" 
            min="0" 
            max="1" 
            step="0.05" 
            v-model.number="activeMaterial.metalness" 
            @input="projectStore.markGeometryUpdated()" 
            class="w-full accent-ui-accent bg-ui-input h-1.5 rounded-xs cursor-pointer" 
          />
        </div>

        <!-- Emission Glow -->
        <div class="space-y-0.5">
          <div class="flex items-center justify-between text-[9px] text-ui-textMuted">
            <span>Emissive Glow:</span>
            <span class="text-ui-textAccent font-bold">{{ (activeMaterial.emissiveIntensity || 0).toFixed(1) }}x</span>
          </div>
          <div class="flex items-center space-x-1.5">
            <input 
              type="color" 
              v-model="activeMaterial.emissive" 
              @change="projectStore.markGeometryUpdated()" 
              class="w-6 h-6 rounded-xs border border-ui-borderDefault bg-transparent cursor-pointer" 
            />
            <input 
              type="range" 
              min="0" 
              max="5" 
              step="0.1" 
              v-model.number="activeMaterial.emissiveIntensity" 
              @input="projectStore.markGeometryUpdated()" 
              class="flex-1 accent-ui-accent bg-ui-input h-1.5 rounded-xs cursor-pointer" 
            />
          </div>
        </div>

        <!-- Real-Time Matrix Dithering Controls -->
        <div class="space-y-1.5 pt-1.5 border-t border-ui-borderSubtle">
          <div class="flex items-center justify-between">
            <label class="flex items-center gap-1.5 text-[9.5px] font-semibold text-ui-textPrimary cursor-pointer">
              <input 
                type="checkbox" 
                v-model="activeMaterial.dither"
                @change="projectStore.markGeometryUpdated(); updateDitherPreview()"
                class="rounded-xs text-amber-500 bg-ui-panel border-ui-borderDefault focus:ring-0 cursor-pointer" 
              />
              <span class="flex items-center gap-1">
                <Sparkles class="w-3 h-3 text-amber-400" />
                <span>Real-Time Matrix Dithering</span>
              </span>
            </label>
            <span class="text-[8.5px] font-mono font-bold text-amber-400" v-if="activeMaterial.dither">LIVE</span>
          </div>

          <div v-if="activeMaterial.dither" class="p-1.5 bg-ui-input rounded-xs border border-ui-borderSubtle space-y-2">
            <!-- Live Dithering Canvas Preview Window -->
            <div class="space-y-1">
              <div class="flex items-center justify-between text-[8.5px] text-amber-300 font-bold uppercase">
                <span>Live Dither Preview</span>
                <span class="text-[7.5px] text-ui-textMuted font-mono">Sphere & Ramp</span>
              </div>
              <canvas 
                ref="ditherPreviewCanvasRef" 
                width="240" 
                height="80" 
                class="w-full h-16 rounded-xs border border-ui-borderSubtle bg-black block shadow-inner"
              ></canvas>
            </div>

            <!-- Dithering Presets Shelf -->
            <div class="space-y-1 pt-1 border-t border-ui-borderSubtle">
              <div class="flex items-center justify-between text-[8.5px] text-ui-textMuted font-semibold uppercase">
                <span>Dither Presets</span>
                <span class="text-[7.5px] font-mono text-amber-400">1-Click</span>
              </div>
              <div class="grid grid-cols-3 gap-1">
                <button 
                  v-for="dp in DITHER_PRESETS" 
                  :key="dp.id"
                  @click="applyDitherPreset(dp)"
                  class="p-1 rounded-xs bg-ui-surface hover:bg-ui-hover border border-ui-borderSubtle hover:border-amber-400 text-left transition cursor-pointer flex flex-col"
                  :title="dp.description"
                >
                  <span class="text-[8.5px] font-bold text-ui-textPrimary truncate">{{ dp.name }}</span>
                  <span class="text-[7px] font-mono text-ui-textMuted uppercase truncate">{{ dp.pattern }} · {{ dp.colorDepth ? dp.colorDepth + 'lv' : '24b' }}</span>
                </button>
              </div>
            </div>

            <!-- Matrix Pattern -->
            <div class="space-y-0.5 pt-1 border-t border-ui-borderSubtle">
              <span class="text-[8.5px] text-ui-textMuted">Matrix Pattern:</span>
              <select 
                v-model="activeMaterial.ditherPattern"
                @change="projectStore.markGeometryUpdated(); updateDitherPreview()"
                class="w-full bg-ui-surface border border-ui-borderSubtle rounded-xs px-1.5 py-0.5 text-ui-textPrimary text-[9.5px] focus:outline-none cursor-pointer font-medium"
              >
                <option value="bayer4x4">4x4 Bayer (PS1 Retro)</option>
                <option value="bayer8x8">8x8 Bayer (Smooth)</option>
                <option value="bayer2x2">2x2 Bayer (Coarse)</option>
                <option value="checker">Checkerboard 50% (Weave)</option>
                <option value="noise">Film Grain (Noise)</option>
              </select>
            </div>

            <!-- Dither Strength -->
            <div class="space-y-0.5">
              <div class="flex items-center justify-between text-[8.5px] text-ui-textMuted">
                <span>Dither Strength:</span>
                <span class="font-mono text-amber-400 font-bold">{{ Math.round(((activeMaterial.ditherLevel ?? 32) / 32) * 100) }}%</span>
              </div>
              <input 
                type="range" 
                min="4" 
                max="64" 
                step="1" 
                v-model.number="activeMaterial.ditherLevel" 
                @input="projectStore.markGeometryUpdated(); updateDitherPreview()"
                class="w-full accent-amber-500 bg-ui-surface h-1 rounded cursor-pointer" 
              />
            </div>

            <!-- Color Quantization -->
            <div class="space-y-0.5">
              <div class="flex items-center justify-between text-[8.5px] text-ui-textMuted">
                <span>Color Depth Quantizer:</span>
                <span class="font-mono text-ui-textAccent text-[8px]">{{ activeMaterial.colorDepth ? activeMaterial.colorDepth + ' Levels' : '24-Bit Smooth' }}</span>
              </div>
              <select 
                v-model.number="activeMaterial.colorDepth"
                @change="projectStore.markGeometryUpdated(); updateDitherPreview()"
                class="w-full bg-ui-surface border border-ui-borderSubtle rounded-xs px-1.5 py-0.5 text-ui-textPrimary text-[9.5px] focus:outline-none cursor-pointer font-medium"
              >
                <option :value="32">15-Bit PSX RGB555 (32 lvls)</option>
                <option :value="16">12-Bit Retro (16 lvls)</option>
                <option :value="8">8-Bit Low-Fi (8 lvls)</option>
                <option :value="4">4-Bit Posterize (4 lvls)</option>
                <option :value="2">1-Bit / 2-Tone (2 lvls)</option>
                <option :value="0">Full 24-Bit (Smooth)</option>
              </select>
            </div>

            <!-- Pixel Grain Scale -->
            <div class="space-y-0.5">
              <div class="flex items-center justify-between text-[8.5px] text-ui-textMuted">
                <span>Pixel Grain Scale:</span>
                <span class="font-mono text-amber-400 font-bold">{{ activeMaterial.ditherScale || 1 }}x</span>
              </div>
              <input 
                type="range" 
                min="1" 
                max="4" 
                step="1" 
                v-model.number="activeMaterial.ditherScale" 
                @input="projectStore.markGeometryUpdated(); updateDitherPreview()"
                class="w-full accent-amber-500 bg-ui-surface h-1 rounded cursor-pointer" 
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 2: ADVANCED COLOR & HARMONIES -->
    <div v-show="activeTab === 'color'" class="space-y-3">
      <!-- Primary / Secondary Swatches -->
      <div class="bg-ui-surface p-2.5 rounded-xs border border-ui-borderSubtle flex items-center justify-between">
        <div class="flex items-center space-x-3">
          <div class="relative w-10 h-10">
            <!-- Secondary swatch -->
            <div 
              class="absolute bottom-0 right-0 w-6 h-6 rounded-xs border border-ui-borderDefault shadow"
              :style="{ backgroundColor: toolStore.secondaryColor }"
              title="Secondary Color (Background)"
            ></div>
            <!-- Primary swatch -->
            <div 
              class="absolute top-0 left-0 w-6 h-6 rounded-xs border border-white shadow-md z-10"
              :style="{ backgroundColor: toolStore.primaryColor }"
              title="Primary Paint Color"
            ></div>
          </div>
          <div>
            <div class="text-[11px] font-bold text-ui-textPrimary font-mono">{{ toolStore.primaryColor.toUpperCase() }}</div>
            <div class="text-[9px] text-ui-textMuted">Active Paint Color</div>
          </div>
        </div>

        <input 
          type="color" 
          v-model="toolStore.primaryColor" 
          class="w-8 h-8 rounded-xs border border-ui-borderDefault bg-transparent cursor-pointer"
        />
      </div>

      <!-- Color Harmonies Generator -->
      <div class="bg-ui-surface p-2.5 rounded-xs border border-ui-borderSubtle space-y-2">
        <span class="text-[11px] font-bold text-ui-textPrimary uppercase tracking-wider flex items-center gap-1.5">
          <Wand2 class="w-3.5 h-3.5 text-ui-textAccent" />
          <span>Color Harmonies</span>
        </span>

        <!-- Complementary & Triadic -->
        <div class="space-y-1 text-[10px]">
          <span class="text-ui-textMuted">Complementary & Triadic:</span>
          <div class="flex items-center gap-1.5">
            <button 
              @click="toolStore.primaryColor = colorHarmonies.complementary"
              class="flex-1 h-6 rounded-xs border border-ui-borderDefault hover:scale-105 transition"
              :style="{ backgroundColor: colorHarmonies.complementary }"
              title="Complementary Color"
            ></button>
            <button 
              @click="toolStore.primaryColor = colorHarmonies.triadic1"
              class="flex-1 h-6 rounded-xs border border-ui-borderDefault hover:scale-105 transition"
              :style="{ backgroundColor: colorHarmonies.triadic1 }"
              title="Triadic 1"
            ></button>
            <button 
              @click="toolStore.primaryColor = colorHarmonies.triadic2"
              class="flex-1 h-6 rounded-xs border border-ui-borderDefault hover:scale-105 transition"
              :style="{ backgroundColor: colorHarmonies.triadic2 }"
              title="Triadic 2"
            ></button>
          </div>
        </div>

        <!-- Monochromatic Shades Ramp -->
        <div class="space-y-1 text-[10px] pt-1">
          <span class="text-ui-textMuted">Shades & Tints:</span>
          <div class="grid grid-cols-5 gap-1">
            <button 
              v-for="(shd, idx) in colorHarmonies.shades" 
              :key="idx"
              @click="toolStore.primaryColor = shd"
              class="h-6 rounded-xs border border-ui-borderDefault hover:scale-105 transition"
              :style="{ backgroundColor: shd }"
            ></button>
          </div>
        </div>
      </div>

      <!-- Curated Retro Palettes Switcher -->
      <div class="bg-ui-surface p-2.5 rounded-xs border border-ui-borderSubtle space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-bold text-ui-textPrimary uppercase tracking-wider flex items-center gap-1.5">
            <BlenderIcon name="brush" :size="13" />
            <span>Palettes</span>
          </span>
          <select 
            v-model="selectedPaletteIndex"
            class="bg-ui-input text-ui-textPrimary border border-ui-borderDefault text-[10px] rounded-xs px-1.5 py-0.5 focus:outline-none cursor-pointer"
          >
            <option v-for="(p, idx) in retroPalettes" :key="p.name" :value="idx" class="bg-ui-panel text-ui-textPrimary">
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
            class="w-full aspect-square rounded-xs border border-ui-borderSubtle hover:border-white hover:scale-110 transition shadow-xs"
            :style="{ backgroundColor: c }"
            :title="`${c} (Left-click: Primary, Right-click: Secondary)`"
          ></button>
        </div>
      </div>
    </div>

    <!-- TAB 3: BLOCKBENCH MULTI-STOP INTERACTIVE GRADIENT STUDIO -->
    <div v-show="activeTab === 'gradient'" class="space-y-3">
      <!-- Custom Gradient Manager: Name, Save, New, Delete, Selector -->
      <div class="bg-ui-surface p-2.5 rounded-xs border border-ui-borderSubtle space-y-2">
        <div class="flex items-center justify-between text-[10px] font-bold text-amber-300 uppercase">
          <span>Custom Gradient Manager</span>
          <span class="text-[9px] font-mono text-ui-textMuted font-normal">{{ allGradients.length }} Gradients</span>
        </div>

        <!-- Gradient Selector & Action Buttons -->
        <div class="flex items-center gap-1.5">
          <select 
            v-model="selectedGradientId"
            @change="(() => { const g = allGradients.find(x => x.id === selectedGradientId); if (g) applySavedGradient(g) })()"
            class="flex-1 bg-ui-input border border-ui-borderDefault rounded-xs px-2 py-1 text-ui-textPrimary text-[10px] font-medium focus:outline-none cursor-pointer"
          >
            <optgroup label="Saved Custom Gradients" v-if="customGradients.length > 0">
              <option v-for="cg in customGradients" :key="cg.id" :value="cg.id">
                * {{ cg.name }} (Custom)
              </option>
            </optgroup>
            <optgroup label="Built-in Presets">
              <option v-for="pg in DEFAULT_GRADIENT_PRESETS" :key="pg.id" :value="pg.id">
                {{ pg.name }}
              </option>
            </optgroup>
          </select>

          <button 
            @click="createNewCustomGradient"
            class="p-1 px-1.5 rounded-xs bg-ui-input hover:bg-ui-hover text-emerald-400 border border-ui-borderSubtle hover:border-emerald-500/50 flex items-center gap-1 text-[10px] font-bold transition cursor-pointer"
            title="Create New Custom Gradient"
          >
            <Plus class="w-3 h-3" />
            <span>New</span>
          </button>
          <button 
            @click="saveCurrentCustomGradient"
            class="p-1 px-1.5 rounded-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/50 flex items-center gap-1 text-[10px] font-bold transition cursor-pointer"
            title="Save current stops & name to custom gradients"
          >
            <Save class="w-3 h-3" />
            <span>Save</span>
          </button>
          <button 
            @click="deleteCurrentCustomGradient"
            :disabled="!customGradients.some(g => g.id === selectedGradientId)"
            class="p-1.5 rounded-xs bg-ui-input hover:bg-rose-950/40 text-ui-textMuted hover:text-rose-400 border border-ui-borderSubtle disabled:opacity-30 transition cursor-pointer"
            title="Delete Selected Custom Gradient"
          >
            <Trash2 class="w-3 h-3" />
          </button>
        </div>

        <!-- Gradient Name Input -->
        <div class="flex items-center gap-1.5 pt-0.5">
          <span class="text-[9px] text-ui-textMuted font-semibold">Name:</span>
          <input 
            v-model="gradientName" 
            placeholder="Gradient Name..." 
            class="flex-1 bg-ui-input border border-ui-borderDefault rounded-xs px-2 py-0.5 text-ui-textPrimary text-[10px] focus:outline-none font-medium"
          />
        </div>
      </div>

      <div class="bg-ui-surface p-3 rounded-xs border border-ui-borderSubtle space-y-3">
        <!-- Header Type Selector -->
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-bold text-ui-textPrimary uppercase flex items-center gap-1.5">
            <BlenderIcon name="texture" :size="13" />
            <span>Gradient Stops & Angle</span>
          </span>
          <select 
            v-model="gradientType"
            class="bg-ui-input text-ui-textPrimary border border-ui-borderDefault text-[10px] rounded-xs px-2 py-1 focus:outline-none cursor-pointer"
          >
            <option value="Linear" class="bg-ui-panel text-ui-textPrimary">Linear</option>
            <option value="Radial" class="bg-ui-panel text-ui-textPrimary">Radial</option>
            <option value="Angle" class="bg-ui-panel text-ui-textPrimary">Angle</option>
            <option value="Reflected" class="bg-ui-panel text-ui-textPrimary">Reflected</option>
          </select>
        </div>

        <!-- Interactive Multi-Stop Gradient Bar with Draggable Handles -->
        <div class="space-y-1.5 pt-1">
          <div 
            @click="handleBarClick"
            class="gradient-rail relative h-12 w-full rounded-xs border border-ui-borderDefault shadow-inner cursor-pointer select-none"
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
              :class="selectedStopId === stop.id ? 'border-white scale-125 ring-2 ring-ui-accent z-20' : 'border-slate-800 z-10 hover:scale-110'"
              :style="{ left: `${stop.offset}%`, backgroundColor: stop.color }"
              :title="`Stop ${stop.offset}% (${stop.color})`"
            ></div>

            <!-- Delete selected stop button '-' -->
            <button 
              v-if="gradientStops.length > 2"
              @click.stop="deleteSelectedStop"
              class="absolute bottom-1 right-1 px-1.5 py-0.5 rounded-xs bg-ui-panel/90 hover:bg-rose-600 text-ui-textPrimary hover:text-white text-[9px] border border-ui-borderDefault transition"
              title="Delete Selected Stop"
            >
              -
            </button>
          </div>
        </div>

        <!-- Selected Stop Controls (Color Swatch Pill & Offset Input) -->
        <div v-if="selectedStop" class="flex items-center justify-between gap-3 pt-1">
          <div class="flex items-center space-x-2">
            <span class="text-[11px] text-ui-textMuted">Color</span>
            <div class="flex items-center space-x-1.5">
              <input 
                type="color" 
                v-model="selectedStop.color" 
                class="w-7 h-7 rounded-xs border border-ui-borderDefault bg-transparent cursor-pointer" 
              />
              <input 
                type="text" 
                v-model="selectedStop.color" 
                class="w-18 bg-ui-input border border-ui-borderDefault rounded-xs px-1.5 py-1 text-ui-textPrimary text-[10px] focus:outline-none font-mono" 
              />
            </div>
          </div>

          <div class="flex items-center space-x-1.5">
            <span class="text-[11px] text-ui-textMuted">Offset</span>
            <input 
              type="number" 
              min="0" 
              max="100" 
              v-model.number="selectedStop.offset" 
              class="w-14 bg-ui-input border border-ui-borderDefault rounded-xs px-1.5 py-1 text-center text-ui-textPrimary text-xs font-bold focus:outline-none font-mono" 
            />
          </div>
        </div>

        <!-- Interactive 2D Angle / Direction Control Box -->
        <div class="space-y-1.5 pt-1 border-t border-ui-borderSubtle">
          <div class="flex items-center justify-between text-[10px] text-ui-textMuted">
            <span>2D Angle & Direction:</span>
            <div class="flex items-center space-x-1 text-ui-textAccent font-bold">
              <span>{{ gradientAngle }}°</span>
              <button @click="gradientAngle = (gradientAngle + 90) % 360" class="p-0.5 hover:bg-ui-hover rounded-xs text-ui-textMuted hover:text-ui-textPrimary" title="Rotate 90°">
                <RotateCw class="w-3 h-3" />
              </button>
            </div>
          </div>

          <!-- Angle Preview & Drag Box -->
          <div class="flex items-center justify-center pt-1">
            <div 
              id="angle-preview-box"
              @mousedown="startAngleDrag"
              class="w-36 h-36 rounded-xs border border-ui-borderDefault shadow-xl relative cursor-crosshair overflow-hidden select-none flex items-center justify-center"
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
          class="w-full py-2 px-3 rounded-xs bg-ui-accent hover:bg-ui-accentHover text-white font-bold text-[11px] shadow-xs flex items-center justify-center space-x-1.5 transition active:scale-98"
        >
          <Zap class="w-3.5 h-3.5" />
          <span>Bake Gradient to Active UV / Face</span>
        </button>
      </div>

      <!-- Preset Gradient Ramps -->
      <div class="bg-ui-surface p-2.5 rounded-xs border border-ui-borderSubtle space-y-1.5">
        <span class="text-[10px] text-ui-textMuted font-bold uppercase">Popular Presets</span>
        <div class="space-y-1">
          <button 
            v-for="p in gradientPresets" 
            :key="p.name"
            @click="applyGradPreset(p)"
            class="w-full h-6 rounded-xs border border-ui-borderDefault flex items-center justify-between px-2 text-[10px] font-bold text-white drop-shadow hover:scale-[1.02] transition"
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
      <div class="bg-ui-surface p-2.5 rounded-xs border border-ui-borderSubtle space-y-2">
        <span class="text-[11px] font-bold text-ui-textAccent uppercase tracking-wider flex items-center gap-1.5">
          <BlenderIcon name="shading-rendered" :size="13" />
          <span>PSX Shading & Lighting</span>
        </span>

        <!-- Shading Mode -->
        <div class="space-y-1">
          <span class="text-[10px] text-ui-textMuted">Viewport Shading Mode:</span>
          <div class="grid grid-cols-2 gap-1 text-[10px]">
            <button 
              @click="toolStore.viewport.shading = 'textured'"
              class="py-1 rounded-xs border transition flex items-center justify-center gap-1"
              :class="toolStore.viewport.shading === 'textured' ? 'bg-ui-accent text-white font-bold border-ui-accent' : 'bg-ui-input border-ui-borderSubtle text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
            >
              <BlenderIcon name="shading-textured" :size="12" />
              <span>Textured</span>
            </button>
            <button 
              @click="toolStore.viewport.shading = 'psx'"
              class="py-1 rounded-xs border transition flex items-center justify-center gap-1"
              :class="toolStore.viewport.shading === 'psx' ? 'bg-ui-accent text-white font-bold border-ui-accent' : 'bg-ui-input border-ui-borderSubtle text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
            >
              <BlenderIcon name="shading-rendered" :size="12" />
              <span>Retro PSX</span>
            </button>
            <button 
              @click="toolStore.viewport.shading = 'solid'"
              class="py-1 rounded-xs border transition flex items-center justify-center gap-1"
              :class="toolStore.viewport.shading === 'solid' ? 'bg-ui-accent text-white font-bold border-ui-accent' : 'bg-ui-input border-ui-borderSubtle text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
            >
              <BlenderIcon name="shading-solid" :size="12" />
              <span>Solid</span>
            </button>
            <button 
              @click="toolStore.viewport.shading = 'wireframe'"
              class="py-1 rounded-xs border transition flex items-center justify-center gap-1"
              :class="toolStore.viewport.shading === 'wireframe' ? 'bg-ui-accent text-white font-bold border-ui-accent' : 'bg-ui-input border-ui-borderSubtle text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
            >
              <BlenderIcon name="shading-wire" :size="12" />
              <span>Wireframe</span>
            </button>
          </div>
        </div>

        <!-- PSX Retro Features Toggles -->
        <div class="space-y-1.5 pt-1 border-t border-ui-borderSubtle">
          <label class="flex items-center justify-between p-1.5 bg-ui-input rounded-xs border border-ui-borderSubtle cursor-pointer">
            <span class="text-ui-textPrimary">Affine Texture Warping</span>
            <input type="checkbox" v-model="toolStore.viewport.psxAffine" class="rounded-xs bg-ui-panel border-ui-borderDefault text-ui-accent" />
          </label>

          <label class="flex items-center justify-between p-1.5 bg-ui-input rounded-xs border border-ui-borderSubtle cursor-pointer">
            <span class="text-ui-textPrimary">Vertex Coordinate Jitter</span>
            <input type="checkbox" v-model="toolStore.viewport.psxJitter" class="rounded-xs bg-ui-panel border-ui-borderDefault text-ui-accent" />
          </label>

          <label class="flex items-center justify-between p-1.5 bg-ui-input rounded-xs border border-ui-borderSubtle cursor-pointer">
            <span class="text-ui-textPrimary">Bayer Matrix Dithering</span>
            <input type="checkbox" v-model="toolStore.viewport.dither" class="rounded-xs bg-ui-panel border-ui-borderDefault text-ui-accent" />
          </label>

          <label class="flex items-center justify-between p-1.5 bg-ui-input rounded-xs border border-ui-borderSubtle cursor-pointer">
            <span class="text-ui-textPrimary">CRT Scanline Filter</span>
            <input type="checkbox" v-model="toolStore.viewport.crtFilter" class="rounded-xs bg-ui-panel border-ui-borderDefault text-ui-accent" />
          </label>
        </div>
      </div>
    </div>
  </div>
</template>
