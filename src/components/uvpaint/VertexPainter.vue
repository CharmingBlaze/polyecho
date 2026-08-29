<script setup lang="ts">
import { ref, computed } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { useToolStore } from '../../stores/toolStore'
import BlenderIcon from '../icons/BlenderIcon.vue'
import { 
  Pipette, 
  Sparkles,
  Check,
  PenTool,
  Sliders,
  Zap,
  Wand2
} from 'lucide-vue-next'

const projectStore = useProjectStore()
const toolStore = useToolStore()

const activeMesh = computed(() => projectStore.activeMesh)

// ----------------------------------------------------
// 1. GRADIENT BAKING CONFIGURATION
// ----------------------------------------------------
type GradAxis = 'y' | 'x' | 'z' | 'radial' | 'sun' | 'ao'
const gradAxis = ref<GradAxis>('y')
const gradStartColor = ref<string>('#1e1b4b') // Deep dark shadow
const gradEndColor = ref<string>('#fef08a')   // Bright warm light
const gradMidpoint = ref<number>(50)          // 0 to 100%
const gradBlendMode = ref<'replace' | 'multiply' | 'add'>('replace')
const gradCurve = ref<'linear' | 'ease' | 'contrast'>('linear')

// Directional Sun lighting parameters
const sunElevation = ref<number>(60) // 0 to 90 degrees
const sunAzimuth = ref<number>(45)   // 0 to 360 degrees
const sunShadowDepth = ref<number>(40) // 0 to 100%

// 24 PSX Retro Vertex Shading Palette Swatches
const retroPalette = [
  '#ffffff', '#e2e8f0', '#94a3b8', '#475569', '#1e293b', '#0f172a',
  '#f87171', '#dc2626', '#991b1b', '#fb923c', '#ea580c', '#c2410c',
  '#fde047', '#eab308', '#ca8a04', '#4ade80', '#16a34a', '#15803d',
  '#38bdf8', '#0284c7', '#0369a1', '#a855f7', '#7e22ce', '#581c87'
]

// ----------------------------------------------------
// 2. FILL & BULK ACTIONS
// ----------------------------------------------------
function fillSelectedVertices() {
  if (!activeMesh.value) return
  projectStore.recordState('Fill Selected Vertex Colors')

  const targetIds = new Set(projectStore.selectedVertexIds)
  if (toolStore.selectMode === 'face') {
    activeMesh.value.faces.filter(f => projectStore.selectedFaceIds.includes(f.id)).forEach(f => {
      f.vertexIds.forEach(id => targetIds.add(id))
    })
  }

  for (const v of activeMesh.value.vertices) {
    if (targetIds.size === 0 || targetIds.has(v.id)) {
      v.color = toolStore.vertexPaintColor
    }
  }
}

function fillEntireMesh() {
  if (!activeMesh.value) return
  projectStore.recordState('Fill Entire Mesh Vertex Colors')
  for (const v of activeMesh.value.vertices) {
    v.color = toolStore.vertexPaintColor
  }
}

function resetVertexColors() {
  if (!activeMesh.value) return
  projectStore.recordState('Reset Vertex Colors')
  for (const v of activeMesh.value.vertices) {
    v.color = '#ffffff'
  }
}

function invertVertexColors() {
  if (!activeMesh.value) return
  projectStore.recordState('Invert Vertex Colors')
  for (const v of activeMesh.value.vertices) {
    const rgb = hexToRgb(v.color || '#ffffff')
    v.color = rgbToHex(255 - rgb.r, 255 - rgb.g, 255 - rgb.b)
  }
}

function clampPSX5Bit() {
  if (!activeMesh.value) return
  projectStore.recordState('Quantize to PSX 5-Bit RGB555')
  for (const v of activeMesh.value.vertices) {
    const rgb = hexToRgb(v.color || '#ffffff')
    // 5-bit color step is 255 / 31 = 8.225
    const r5 = Math.round(rgb.r / 8.225) * 8.225
    const g5 = Math.round(rgb.g / 8.225) * 8.225
    const b5 = Math.round(rgb.b / 8.225) * 8.225
    v.color = rgbToHex(Math.round(r5), Math.round(g5), Math.round(b5))
  }
}

// ----------------------------------------------------
// 3. ADVANCED VERTEX NEIGHBOR SMOOTHING / BLUR
// ----------------------------------------------------
function smoothVertexColors() {
  if (!activeMesh.value) return
  projectStore.recordState('Smooth Vertex Colors')

  const neighborMap = new Map<string, Set<string>>()
  for (const v of activeMesh.value.vertices) {
    neighborMap.set(v.id, new Set<string>())
  }

  for (const face of activeMesh.value.faces) {
    const ids = face.vertexIds
    for (let i = 0; i < ids.length; i++) {
      const next = ids[(i + 1) % ids.length]
      neighborMap.get(ids[i])?.add(next)
      neighborMap.get(next)?.add(ids[i])
    }
  }

  const oldColors = new Map<string, { r: number; g: number; b: number }>()
  for (const v of activeMesh.value.vertices) {
    oldColors.set(v.id, hexToRgb(v.color || '#ffffff'))
  }

  for (const v of activeMesh.value.vertices) {
    const selfRgb = oldColors.get(v.id) || { r: 255, g: 255, b: 255 }
    const neighbors = neighborMap.get(v.id)
    if (!neighbors || neighbors.size === 0) continue

    let totalR = selfRgb.r * 2
    let totalG = selfRgb.g * 2
    let totalB = selfRgb.b * 2
    let count = 2

    for (const nId of neighbors) {
      const nRgb = oldColors.get(nId)
      if (nRgb) {
        totalR += nRgb.r
        totalG += nRgb.g
        totalB += nRgb.b
        count++
      }
    }

    v.color = rgbToHex(
      Math.round(totalR / count),
      Math.round(totalG / count),
      Math.round(totalB / count)
    )
  }
}

// ----------------------------------------------------
// 4. MULTI-AXIS GRADIENT BAKING ENGINE
// ----------------------------------------------------
function executeGradientBake() {
  if (!activeMesh.value || activeMesh.value.vertices.length === 0) return
  projectStore.recordState(`Bake ${gradAxis.value.toUpperCase()} Gradient`)

  const cStart = hexToRgb(gradStartColor.value)
  const cEnd = hexToRgb(gradEndColor.value)

  if (gradAxis.value === 'sun') {
    bakeSunDirection(cStart, cEnd)
    return
  }
  if (gradAxis.value === 'ao') {
    bakeAOCavity(cStart, cEnd)
    return
  }

  // Calculate Bounds along active axis
  let minVal = Infinity
  let maxVal = -Infinity

  for (const v of activeMesh.value.vertices) {
    let val = 0
    if (gradAxis.value === 'y') val = v.position.y
    else if (gradAxis.value === 'x') val = v.position.x
    else if (gradAxis.value === 'z') val = v.position.z
    else if (gradAxis.value === 'radial') val = Math.hypot(v.position.x, v.position.z)

    if (val < minVal) minVal = val
    if (val > maxVal) maxVal = val
  }

  const range = Math.max(0.0001, maxVal - minVal)

  for (const v of activeMesh.value.vertices) {
    let val = 0
    if (gradAxis.value === 'y') val = v.position.y
    else if (gradAxis.value === 'x') val = v.position.x
    else if (gradAxis.value === 'z') val = v.position.z
    else if (gradAxis.value === 'radial') val = Math.hypot(v.position.x, v.position.z)

    let t = Math.max(0, Math.min(1, (val - minVal) / range))

    // Apply Midpoint bias & curve
    const midBias = gradMidpoint.value / 100
    if (t < midBias) {
      t = (t / midBias) * 0.5
    } else {
      t = 0.5 + ((t - midBias) / (1 - midBias)) * 0.5
    }

    if (gradCurve.value === 'ease') {
      t = t * t * (3 - 2 * t)
    } else if (gradCurve.value === 'contrast') {
      t = Math.pow(t, 2)
    }

    const bakedR = Math.round(cStart.r + (cEnd.r - cStart.r) * t)
    const bakedG = Math.round(cStart.g + (cEnd.g - cStart.g) * t)
    const bakedB = Math.round(cStart.b + (cEnd.b - cStart.b) * t)

    applyColorWithBlendMode(v, { r: bakedR, g: bakedG, b: bakedB })
  }
}

function bakeSunDirection(cStart: any, cEnd: any) {
  if (!activeMesh.value) return
  const radElev = sunElevation.value * (Math.PI / 180)
  const radAzim = sunAzimuth.value * (Math.PI / 180)

  const sunDir = {
    x: Math.cos(radElev) * Math.sin(radAzim),
    y: Math.sin(radElev),
    z: Math.cos(radElev) * Math.cos(radAzim)
  }

  const vertNormals = new Map<string, { x: number; y: number; z: number; count: number }>()
  for (const v of activeMesh.value.vertices) {
    vertNormals.set(v.id, { x: 0, y: 0, z: 0, count: 0 })
  }

  for (const face of activeMesh.value.faces) {
    if (face.vertexIds.length < 3) continue
    const v0 = activeMesh.value.vertices.find(v => v.id === face.vertexIds[0])
    const v1 = activeMesh.value.vertices.find(v => v.id === face.vertexIds[1])
    const v2 = activeMesh.value.vertices.find(v => v.id === face.vertexIds[2])
    if (!v0 || !v1 || !v2) continue

    const e1 = { x: v1.position.x - v0.position.x, y: v1.position.y - v0.position.y, z: v1.position.z - v0.position.z }
    const e2 = { x: v2.position.x - v0.position.x, y: v2.position.y - v0.position.y, z: v2.position.z - v0.position.z }
    let nx = e1.y * e2.z - e1.z * e2.y
    let ny = e1.z * e2.x - e1.x * e2.z
    let nz = e1.x * e2.y - e1.y * e2.x
    const nl = Math.hypot(nx, ny, nz) || 1
    nx /= nl; ny /= nl; nz /= nl

    for (const vid of face.vertexIds) {
      const vn = vertNormals.get(vid)
      if (vn) {
        vn.x += nx; vn.y += ny; vn.z += nz; vn.count++
      }
    }
  }

  const shadowMin = (100 - sunShadowDepth.value) / 100

  for (const v of activeMesh.value.vertices) {
    const vn = vertNormals.get(v.id)
    let nx = vn && vn.count > 0 ? vn.x / vn.count : 0
    let ny = vn && vn.count > 0 ? vn.y / vn.count : 1
    let nz = vn && vn.count > 0 ? vn.z / vn.count : 0
    const l = Math.hypot(nx, ny, nz) || 1
    nx /= l; ny /= l; nz /= l

    const dot = Math.max(0, nx * sunDir.x + ny * sunDir.y + nz * sunDir.z)
    const t = shadowMin + dot * (1 - shadowMin)

    const bakedR = Math.round(cStart.r + (cEnd.r - cStart.r) * t)
    const bakedG = Math.round(cStart.g + (cEnd.g - cStart.g) * t)
    const bakedB = Math.round(cStart.b + (cEnd.b - cStart.b) * t)

    applyColorWithBlendMode(v, { r: bakedR, g: bakedG, b: bakedB })
  }
}

function bakeAOCavity(cStart: any, cEnd: any) {
  if (!activeMesh.value) return
  for (const v of activeMesh.value.vertices) {
    const distFromOrigin = Math.hypot(v.position.x, v.position.z)
    const heightFactor = Math.max(0, Math.min(1, (v.position.y + 1) / 2))
    const ao = Math.max(0, Math.min(1, 0.35 + (heightFactor * 0.45) + (Math.min(distFromOrigin, 1) * 0.2)))

    const bakedR = Math.round(cStart.r + (cEnd.r - cStart.r) * ao)
    const bakedG = Math.round(cStart.g + (cEnd.g - cStart.g) * ao)
    const bakedB = Math.round(cStart.b + (cEnd.b - cStart.b) * ao)

    applyColorWithBlendMode(v, { r: bakedR, g: bakedG, b: bakedB })
  }
}

function applyColorWithBlendMode(v: any, newRgb: { r: number; g: number; b: number }) {
  if (gradBlendMode.value === 'replace') {
    v.color = rgbToHex(newRgb.r, newRgb.g, newRgb.b)
    return
  }

  const cur = hexToRgb(v.color || '#ffffff')
  if (gradBlendMode.value === 'multiply') {
    v.color = rgbToHex(
      Math.round((cur.r * newRgb.r) / 255),
      Math.round((cur.g * newRgb.g) / 255),
      Math.round((cur.b * newRgb.b) / 255)
    )
  } else if (gradBlendMode.value === 'add') {
    v.color = rgbToHex(
      Math.min(255, cur.r + newRgb.r),
      Math.min(255, cur.g + newRgb.g),
      Math.min(255, cur.b + newRgb.b)
    )
  }
}

// ----------------------------------------------------
// COLOR MATH HELPERS
// ----------------------------------------------------
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

defineExpose({
  fillSelectedVertices,
  fillEntireMesh,
  executeGradientBake,
  resetVertexColors,
  smoothVertexColors,
  clampPSX5Bit
})
</script>

<template>
  <div class="h-full w-full bg-dcc-900 flex flex-col select-none overflow-y-auto p-2 text-slate-200 space-y-2 font-mono text-xs">
    <!-- Header Studio Bar -->
    <div class="bg-dcc-850 p-2 rounded border border-dcc-750 flex items-center justify-between">
      <div class="flex items-center space-x-2">
        <div class="p-1 rounded bg-indigo-600/30 text-indigo-400 border border-indigo-500/40">
          <BlenderIcon name="vertex-select" :size="13" />
        </div>
        <div>
          <div class="text-[11px] font-bold text-slate-200">Vertex Color Studio</div>
          <div class="text-[9px] text-slate-400">3D Gouraud tinting & procedural gradient lighting</div>
        </div>
      </div>

      <button 
        @click="resetVertexColors" 
        class="px-2 py-0.5 rounded bg-dcc-900 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-dcc-700 text-[9px] transition"
        title="Reset all vertices to default white"
      >
        Reset White
      </button>
    </div>

    <!-- 1. MULTI-AXIS VERTEX GRADIENT ENGINE -->
    <div class="bg-dcc-850 p-2 rounded border border-dcc-750 space-y-2">
      <div class="flex items-center justify-between">
        <span class="text-[10px] font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
          <Wand2 class="w-3 h-3 text-indigo-400" />
          <span>Procedural Gradient Engine</span>
        </span>
        <span class="text-[9px] text-slate-400">Axis & Shading Bakes</span>
      </div>

      <!-- Axis Mode Selector Tabs -->
      <div class="grid grid-cols-6 gap-1 bg-dcc-900 p-0.5 rounded border border-dcc-750 text-[9px]">
        <button 
          @click="gradAxis = 'y'"
          class="py-1 rounded text-center transition"
          :class="gradAxis === 'y' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'"
          title="Height Gradient (Y-Axis)"
        >
          Height Y
        </button>
        <button 
          @click="gradAxis = 'x'"
          class="py-1 rounded text-center transition"
          :class="gradAxis === 'x' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'"
          title="Horizontal Gradient (X-Axis)"
        >
          Horiz X
        </button>
        <button 
          @click="gradAxis = 'z'"
          class="py-1 rounded text-center transition"
          :class="gradAxis === 'z' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'"
          title="Depth Gradient (Z-Axis)"
        >
          Depth Z
        </button>
        <button 
          @click="gradAxis = 'radial'"
          class="py-1 rounded text-center transition"
          :class="gradAxis === 'radial' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'"
          title="Radial Distance Gradient"
        >
          Radial
        </button>
        <button 
          @click="gradAxis = 'sun'"
          class="py-1 rounded text-center transition"
          :class="gradAxis === 'sun' ? 'bg-amber-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'"
          title="Sun Directional Lighting Bake"
        >
          Sun Light
        </button>
        <button 
          @click="gradAxis = 'ao'"
          class="py-1 rounded text-center transition"
          :class="gradAxis === 'ao' ? 'bg-cyan-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'"
          title="Fake Ambient Occlusion (Cavity Shading)"
        >
          Fake AO
        </button>
      </div>

      <!-- Gradient Stop Color Swatches (Start -> End) -->
      <div class="grid grid-cols-2 gap-2 pt-0.5">
        <div class="space-y-0.5">
          <div class="flex items-center justify-between text-[9px] text-slate-400">
            <span>Shadow / Start:</span>
            <span class="font-mono text-slate-200">{{ gradStartColor }}</span>
          </div>
          <div class="flex items-center space-x-1.5">
            <input type="color" v-model="gradStartColor" class="w-6 h-6 rounded border border-dcc-700 bg-transparent cursor-pointer" />
            <input type="text" v-model="gradStartColor" class="flex-1 bg-dcc-900 border border-dcc-700 rounded px-1.5 py-0.5 text-slate-200 text-[10px] focus:outline-none" />
          </div>
        </div>

        <div class="space-y-0.5">
          <div class="flex items-center justify-between text-[9px] text-slate-400">
            <span>Peak / Highlight:</span>
            <span class="font-mono text-slate-200">{{ gradEndColor }}</span>
          </div>
          <div class="flex items-center space-x-1.5">
            <input type="color" v-model="gradEndColor" class="w-6 h-6 rounded border border-dcc-700 bg-transparent cursor-pointer" />
            <input type="text" v-model="gradEndColor" class="flex-1 bg-dcc-900 border border-dcc-700 rounded px-1.5 py-0.5 text-slate-200 text-[10px] focus:outline-none" />
          </div>
        </div>
      </div>

      <!-- Sun Controls (if Sun Light axis selected) -->
      <div v-if="gradAxis === 'sun'" class="space-y-1.5 pt-1 border-t border-dcc-750">
        <div class="grid grid-cols-2 gap-2 text-[9px] text-slate-400">
          <div>
            <div class="flex justify-between">
              <span>Elevation:</span>
              <span class="text-amber-400">{{ sunElevation }}°</span>
            </div>
            <input type="range" min="0" max="90" v-model.number="sunElevation" class="w-full accent-amber-500 bg-dcc-900 h-1 rounded cursor-pointer" />
          </div>
          <div>
            <div class="flex justify-between">
              <span>Azimuth:</span>
              <span class="text-amber-400">{{ sunAzimuth }}°</span>
            </div>
            <input type="range" min="0" max="360" v-model.number="sunAzimuth" class="w-full accent-amber-500 bg-dcc-900 h-1 rounded cursor-pointer" />
          </div>
        </div>
      </div>

      <!-- Gradient Options (Blend Mode & Curve) -->
      <div class="flex items-center justify-between gap-2 pt-1 border-t border-dcc-750 text-[10px]">
        <div class="flex items-center space-x-1.5">
          <span class="text-slate-400 text-[9px]">Blend:</span>
          <select v-model="gradBlendMode" class="bg-dcc-900 text-slate-200 border border-dcc-700 rounded px-1.5 py-0.5 text-[9px] focus:outline-none">
            <option value="replace">Replace</option>
            <option value="multiply">Multiply</option>
            <option value="add">Add</option>
          </select>
        </div>

        <div class="flex items-center space-x-1.5">
          <span class="text-slate-400 text-[9px]">Curve:</span>
          <select v-model="gradCurve" class="bg-dcc-900 text-slate-200 border border-dcc-700 rounded px-1.5 py-0.5 text-[9px] focus:outline-none">
            <option value="linear">Linear</option>
            <option value="ease">Smoothstep</option>
            <option value="contrast">High Contrast</option>
          </select>
        </div>
      </div>

      <!-- Execute Bake Button -->
      <button 
        @click="executeGradientBake"
        class="w-full py-1.5 px-3 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] shadow-xs flex items-center justify-center space-x-1.5 transition active:scale-98"
      >
        <Zap class="w-3 h-3" />
        <span>Bake {{ gradAxis.toUpperCase() }} Gradient to Vertices</span>
      </button>
    </div>

    <!-- 2. QUICK PALETTE & COLOR HARMONIES -->
    <div class="bg-dcc-850 p-2 rounded border border-dcc-750 space-y-1.5">
      <div class="flex items-center justify-between">
        <span class="text-[10px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
          <Pipette class="w-3 h-3 text-indigo-400" />
          <span>Active Paint Color</span>
        </span>
        <div class="flex items-center space-x-1.5">
          <div class="w-3 h-3 rounded-full border border-white/60 shadow-xs" :style="{ backgroundColor: toolStore.vertexPaintColor }"></div>
          <span class="text-[9px] font-mono text-slate-400">{{ toolStore.vertexPaintColor.toUpperCase() }}</span>
        </div>
      </div>

      <!-- Quick Action Buttons -->
      <div class="grid grid-cols-2 gap-1.5">
        <button 
          @click="fillSelectedVertices"
          class="py-1 px-2 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] flex items-center justify-center space-x-1 shadow-xs transition"
          title="Fill selected vertices or active faces with current color"
        >
          <Check class="w-3 h-3" />
          <span>Fill Selected</span>
        </button>

        <button 
          @click="fillEntireMesh"
          class="py-1 px-2 rounded bg-dcc-900 hover:bg-dcc-750 border border-dcc-750 text-slate-300 font-bold text-[10px] transition"
          title="Fill entire mesh with current color"
        >
          Fill Entire Mesh
        </button>
      </div>

      <!-- Compact 24-Color PSX Shading Swatches Grid -->
      <div class="grid grid-cols-12 gap-1 pt-1">
        <button 
          v-for="c in retroPalette" 
          :key="c"
          @click="toolStore.vertexPaintColor = c"
          class="w-full aspect-square rounded border border-dcc-750 hover:border-white hover:scale-110 transition shadow-xs"
          :style="{ backgroundColor: c }"
          :title="c"
        ></button>
      </div>
    </div>

    <!-- 3. POST-PROCESSING & ADJUSTMENT TOOLS -->
    <div class="bg-dcc-850 p-2 rounded border border-dcc-750 space-y-1.5">
      <span class="text-[10px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
        <Sparkles class="w-3 h-3 text-indigo-400" />
        <span>Vertex Adjustments & PSX FX</span>
      </span>

      <div class="grid grid-cols-3 gap-1.5 pt-0.5">
        <button 
          @click="smoothVertexColors"
          class="py-1 px-1.5 rounded bg-dcc-900 hover:bg-dcc-750 border border-dcc-750 text-indigo-300 text-[9px] font-bold transition flex items-center justify-center gap-1"
          title="Smooth / Blur colors across adjacent connected vertices"
        >
          <span>Smooth / Blur</span>
        </button>

        <button 
          @click="clampPSX5Bit"
          class="py-1 px-1.5 rounded bg-dcc-900 hover:bg-dcc-750 border border-dcc-750 text-amber-300 text-[9px] font-bold transition flex items-center justify-center gap-1"
          title="Quantize vertex colors to authentic PSX 5-bit RGB555"
        >
          <span>PSX 5-Bit</span>
        </button>

        <button 
          @click="invertVertexColors"
          class="py-1 px-1.5 rounded bg-dcc-900 hover:bg-dcc-750 border border-dcc-750 text-slate-300 text-[9px] font-bold transition flex items-center justify-center gap-1"
          title="Invert RGB colors"
        >
          <span>Invert</span>
        </button>
      </div>
    </div>

    <!-- 4. 3D BRUSH & STYLUS SETTINGS -->
    <div class="bg-dcc-850 p-2 rounded border border-dcc-750 space-y-1.5">
      <div class="flex items-center justify-between">
        <span class="text-[10px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
          <Sliders class="w-3 h-3 text-slate-400" />
          <span>3D Brush Parameters</span>
        </span>

        <!-- Stylus Pressure Status -->
        <button 
          @click="toolStore.stylusPressureEnabled = !toolStore.stylusPressureEnabled"
          class="flex items-center gap-1 text-[9px] font-bold transition"
          :class="toolStore.stylusPressureEnabled ? 'text-amber-400' : 'text-slate-500'"
        >
          <PenTool class="w-2.5 h-2.5" />
          <span>Stylus: {{ toolStore.stylusPressureEnabled ? 'ON' : 'OFF' }}</span>
        </button>
      </div>

      <!-- Brush Radius Slider -->
      <div class="space-y-0.5">
        <div class="flex items-center justify-between text-[9px] text-slate-400">
          <span>Brush Radius:</span>
          <span class="text-indigo-400 font-bold">{{ toolStore.vertexBrushRadius }}m</span>
        </div>
        <input 
          type="range" 
          min="0.1" 
          max="3.0" 
          step="0.05" 
          v-model.number="toolStore.vertexBrushRadius" 
          class="w-full accent-indigo-500 bg-dcc-900 h-1 rounded cursor-pointer" 
        />
      </div>

      <!-- Falloff Softness Slider -->
      <div class="space-y-0.5">
        <div class="flex items-center justify-between text-[9px] text-slate-400">
          <span>Falloff Softness:</span>
          <span class="text-indigo-400 font-bold">{{ Math.round(toolStore.vertexBrushFalloff * 100) }}%</span>
        </div>
        <input 
          type="range" 
          min="0" 
          max="1" 
          step="0.05" 
          v-model.number="toolStore.vertexBrushFalloff" 
          class="w-full accent-indigo-500 bg-dcc-900 h-1 rounded cursor-pointer" 
        />
      </div>
    </div>
  </div>
</template>
