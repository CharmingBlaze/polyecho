<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { useToolStore } from '../../stores/toolStore'
import BlenderIcon from '../icons/BlenderIcon.vue'
import UiSection from '../ui/UiSection.vue'
import { 
  Plus, 
  Trash2, 
  Copy, 
  ExternalLink,
  Tv, 
  Check, 
  Zap,
  Upload,
  Download,
  CheckCheck
} from 'lucide-vue-next'

const projectStore = useProjectStore()
const toolStore = useToolStore()

// Active Material Management
const activeMesh = computed(() => projectStore.activeMesh)
const selectedMaterialId = ref<string>(activeMesh.value?.materialId || projectStore.materials[0]?.id || 'default_material')

watch(() => activeMesh.value?.materialId, (newMatId) => {
  if (newMatId) {
    selectedMaterialId.value = newMatId
  }
}, { immediate: true })

const activeMaterial = computed(() => {
  return projectStore.materials.find(m => m.id === selectedMaterialId.value) || projectStore.materials[0]
})

const activeTextureForMaterial = computed(() => {
  if (!activeMaterial.value) return projectStore.textures[0]
  return projectStore.getTextureForMaterial(activeMaterial.value.id) || projectStore.textures[0]
})

const isAssignedToActiveMesh = computed(() => {
  return activeMesh.value?.materialId === activeMaterial.value?.id
})

function assignToActiveMesh() {
  if (activeMaterial.value && activeMesh.value) {
    projectStore.assignMaterialToActiveMesh(activeMaterial.value.id)
  }
}

function assignToSelectedMeshes() {
  if (activeMaterial.value) {
    projectStore.assignMaterialToSelectedMeshes(activeMaterial.value.id)
  }
}

const textureUploadInput = ref<HTMLInputElement | null>(null)

function triggerTextureUpload() {
  textureUploadInput.value?.click()
}

async function handleTextureImageUpload(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !activeMaterial.value) return

  let currentTex = projectStore.getTextureForMaterial(activeMaterial.value.id)
  if (!currentTex || currentTex.id === 'tex_default') {
    currentTex = projectStore.addTexture(`${activeMaterial.value.name}_Texture`, 64, 64)
    projectStore.assignTextureToMaterial(activeMaterial.value.id, currentTex.id)
  }

  await currentTex.pixelBuffer.loadFromFile(file, true)
  currentTex.name = file.name.replace(/\.[^/.]+$/, '')
  currentTex.width = currentTex.pixelBuffer.width
  currentTex.height = currentTex.pixelBuffer.height
  currentTex.dataUrl = currentTex.pixelBuffer.toDataURL()
  projectStore.activeTextureId = currentTex.id
  projectStore.markTextureUpdated(currentTex.id)
  projectStore.recordState('Load Texture Image')
  input.value = ''
}

function openUvWorkspace() {
  if (activeTextureForMaterial.value) {
    projectStore.activeTextureId = activeTextureForMaterial.value.id
  }
  toolStore.appMode = 'uvpaint'
}

function downloadTexturePng() {
  const tex = activeTextureForMaterial.value
  if (!tex || !tex.pixelBuffer) return
  tex.pixelBuffer.canvas.toBlob((blob: Blob | null) => {
    if (blob) {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${tex.name}_${tex.width}x${tex.height}.png`
      a.click()
      URL.revokeObjectURL(url)
    }
  })
}

const editingName = ref(false)
const matNameInput = ref('')

function startRename() {
  if (activeMaterial.value) {
    matNameInput.value = activeMaterial.value.name
    editingName.value = true
  }
}

function commitRename() {
  if (activeMaterial.value && matNameInput.value.trim()) {
    activeMaterial.value.name = matNameInput.value.trim()
  }
  editingName.value = false
}

function handleAddMaterial() {
  const newMat = projectStore.addMaterial()
  selectedMaterialId.value = newMat.id
  if (activeMesh.value) {
    projectStore.assignMaterialToActiveMesh(newMat.id)
  }
}

function handleDuplicateMaterial() {
  if (!activeMaterial.value) return
  const cloned = projectStore.addMaterial(`${activeMaterial.value.name}_Copy`, activeMaterial.value.textureId)
  cloned.color = activeMaterial.value.color
  cloned.shading = activeMaterial.value.shading
  cloned.roughness = activeMaterial.value.roughness
  cloned.metalness = activeMaterial.value.metalness
  cloned.psxJitter = activeMaterial.value.psxJitter
  cloned.psxAffine = activeMaterial.value.psxAffine
  cloned.dither = activeMaterial.value.dither
  selectedMaterialId.value = cloned.id
  if (activeMesh.value) {
    projectStore.assignMaterialToActiveMesh(cloned.id)
  }
}

function handleDeleteMaterial() {
  if (activeMaterial.value && projectStore.materials.length > 1) {
    const toDeleteId = activeMaterial.value.id
    projectStore.deleteMaterial(toDeleteId)
    selectedMaterialId.value = projectStore.materials[0]?.id || 'default_material'
  }
}

// Built-in Color Palettes
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
  },
  {
    name: 'GameBoy 4-Color',
    colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f']
  }
]

const selectedPaletteIndex = ref(0)
const currentPalette = computed(() => retroPalettes[selectedPaletteIndex.value])

function pickPaletteColor(hex: string) {
  if (activeMaterial.value) {
    activeMaterial.value.color = hex
    toolStore.primaryColor = hex
    projectStore.recordState('Change Material Color')
  }
}

// ----------------------------------------------------
// VERTEX COLOR & PROCEDURAL BAKES LOGIC
// ----------------------------------------------------
type GradAxis = 'y' | 'x' | 'z' | 'radial' | 'sun' | 'ao'
const gradAxis = ref<GradAxis>('y')
const gradStartColor = ref<string>('#1e1b4b')
const gradEndColor = ref<string>('#fef08a')
const gradBlendMode = ref<'replace' | 'multiply' | 'add'>('replace')
const gradCurve = ref<'linear' | 'ease' | 'contrast'>('linear')

const sunElevation = ref<number>(60)
const sunAzimuth = ref<number>(45)
const sunShadowDepth = ref<number>(40)

const retroPalette = [
  '#ffffff', '#e2e8f0', '#94a3b8', '#475569', '#1e293b', '#0f172a',
  '#f87171', '#dc2626', '#991b1b', '#fb923c', '#ea580c', '#c2410c',
  '#fde047', '#eab308', '#ca8a04', '#4ade80', '#16a34a', '#15803d',
  '#38bdf8', '#0284c7', '#0369a1', '#a855f7', '#7e22ce', '#581c87'
]

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
    const r5 = Math.round(rgb.r / 8.225) * 8.225
    const g5 = Math.round(rgb.g / 8.225) * 8.225
    const b5 = Math.round(rgb.b / 8.225) * 8.225
    v.color = rgbToHex(Math.round(r5), Math.round(g5), Math.round(b5))
  }
}

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
</script>

<template>
  <div class="flex flex-col select-none text-xs font-sans p-1.5 space-y-2">
    <!-- 1. MATERIAL SLOTS & HEADER (Blender Style) -->
    <div class="bg-ui-input/80 rounded-xs border border-ui-borderSubtle p-2 space-y-2">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-1.5 font-bold text-[11px] text-ui-textPrimary">
          <BlenderIcon name="material" :size="14" color="#f59e0b" />
          <span>Material Slots</span>
        </div>
        <div class="flex items-center gap-1">
          <button 
            @click="handleAddMaterial" 
            class="p-1 rounded-xs bg-ui-surface hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textPrimary border border-ui-borderSubtle transition" 
            title="New Material Slot"
          >
            <Plus class="w-3 h-3" />
          </button>
          <button 
            @click="handleDuplicateMaterial" 
            class="p-1 rounded-xs bg-ui-surface hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textPrimary border border-ui-borderSubtle transition" 
            title="Duplicate Active Material"
          >
            <Copy class="w-3 h-3" />
          </button>
          <button 
            @click="handleDeleteMaterial" 
            :disabled="projectStore.materials.length <= 1"
            class="p-1 rounded-xs bg-ui-surface hover:bg-rose-950/40 text-ui-textMuted hover:text-rose-400 border border-ui-borderSubtle disabled:opacity-30 transition" 
            title="Delete Material"
          >
            <Trash2 class="w-3 h-3" />
          </button>
        </div>
      </div>

      <!-- Material Slot Selector Dropdown -->
      <div class="flex items-center gap-1.5">
        <select 
          v-model="selectedMaterialId"
          class="flex-1 bg-ui-surface border border-ui-borderDefault rounded-xs px-2 py-1 text-ui-textPrimary font-mono text-[11px] focus:outline-none focus:border-ui-accent cursor-pointer"
        >
          <option v-for="mat in projectStore.materials" :key="mat.id" :value="mat.id">
            {{ mat.name }} {{ activeMesh?.materialId === mat.id ? '(Active Mesh)' : '' }}
          </option>
        </select>
      </div>

      <!-- Material Assignment Actions -->
      <div class="grid grid-cols-2 gap-1 pt-0.5">
        <button 
          @click="assignToActiveMesh"
          :disabled="isAssignedToActiveMesh"
          class="py-1 px-1.5 rounded-xs text-[10px] font-bold border transition flex items-center justify-center gap-1 cursor-pointer"
          :class="isAssignedToActiveMesh ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50' : 'bg-ui-surface hover:bg-ui-hover text-ui-textPrimary border-ui-borderSubtle'"
          :title="isAssignedToActiveMesh ? 'Currently assigned to active object' : 'Apply this material to active object'"
        >
          <Check v-if="isAssignedToActiveMesh" class="w-3 h-3 text-emerald-400" />
          <span>{{ isAssignedToActiveMesh ? 'Applied' : 'Apply to Active' }}</span>
        </button>
        <button 
          @click="assignToSelectedMeshes"
          class="py-1 px-1.5 bg-ui-surface hover:bg-ui-hover border border-ui-borderSubtle text-ui-textSecondary hover:text-ui-textPrimary rounded-xs text-[10px] font-medium flex items-center justify-center gap-1 transition cursor-pointer"
          :title="`Apply this material to all ${projectStore.selectedMeshIds.length} selected objects`"
        >
          <CheckCheck class="w-3 h-3 text-ui-accent" />
          <span>Apply to Sel ({{ projectStore.selectedMeshIds.length }})</span>
        </button>
      </div>

      <!-- Rename Material Field -->
      <div v-if="activeMaterial" class="flex items-center gap-1.5 pt-0.5">
        <span class="text-[10px] text-ui-textMuted w-12 shrink-0">Name:</span>
        <input 
          v-if="editingName"
          v-model="matNameInput"
          @blur="commitRename"
          @keydown.enter="commitRename"
          class="flex-1 bg-ui-surface text-ui-textPrimary px-1.5 py-0.5 rounded-xs font-mono text-xs border border-amber-500 focus:outline-none"
          autoFocus
        />
        <div 
          v-else 
          @dblclick="startRename"
          class="flex-1 bg-ui-surface/60 hover:bg-ui-surface px-1.5 py-0.5 rounded-xs font-mono text-xs text-ui-textPrimary border border-ui-borderSubtle cursor-text truncate"
          title="Double click to rename"
        >
          {{ activeMaterial.name }}
        </div>
      </div>
    </div>

    <!-- 2. SURFACE & SHADING MODEL -->
    <UiSection title="Surface & Shading" :default-open="true">
      <div v-if="activeMaterial" class="space-y-2">
        <!-- Shader Mode Selector -->
        <div class="space-y-1">
          <label class="text-[10px] font-semibold text-ui-textMuted uppercase">Shader Model</label>
          <select 
            v-model="activeMaterial.shading"
            class="w-full bg-ui-input border border-ui-borderSubtle rounded-xs px-2 py-1 text-ui-textPrimary text-[11px] focus:outline-none focus:border-ui-accent cursor-pointer"
          >
            <option value="psx">PSX Retro (Affine Warping + Jitter)</option>
            <option value="textured">Textured Low-Poly (Clean Unlit)</option>
            <option value="flat">Flat Shading (Face Normals)</option>
            <option value="gouraud">Gouraud (Vertex Normals)</option>
            <option value="unlit">Constant Unlit (Pure Color)</option>
          </select>
        </div>

        <!-- Shading Viewport Mode Sync -->
        <div class="grid grid-cols-3 gap-1 pt-1">
          <button 
            @click="toolStore.viewport.shading = 'psx'"
            class="px-2 py-1 rounded-xs text-[10px] font-bold border transition text-center"
            :class="toolStore.viewport.shading === 'psx' ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-xs' : 'bg-ui-input text-ui-textSecondary border-ui-borderSubtle hover:bg-ui-hover'"
          >
            PSX Shading
          </button>
          <button 
            @click="toolStore.viewport.shading = 'solid'"
            class="px-2 py-1 rounded-xs text-[10px] font-bold border transition text-center"
            :class="toolStore.viewport.shading === 'solid' ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50 shadow-xs' : 'bg-ui-input text-ui-textSecondary border-ui-borderSubtle hover:bg-ui-hover'"
          >
            Solid
          </button>
          <button 
            @click="toolStore.viewport.shading = 'wireframe'"
            class="px-2 py-1 rounded-xs text-[10px] font-bold border transition text-center"
            :class="toolStore.viewport.shading === 'wireframe' ? 'bg-sky-500/20 text-sky-300 border-sky-500/50 shadow-xs' : 'bg-ui-input text-ui-textSecondary border-ui-borderSubtle hover:bg-ui-hover'"
          >
            Wireframe
          </button>
        </div>

        <!-- Wireframe Overlay Toggle -->
        <div class="space-y-1.5 pt-1">
          <label class="flex items-center justify-between cursor-pointer bg-ui-input p-1.5 rounded-xs border border-ui-borderSubtle hover:border-ui-borderDefault transition">
            <span class="text-ui-textSecondary text-[11px]">Wireframe Overlay</span>
            <input 
              type="checkbox" 
              v-model="activeMaterial.wireframe" 
              class="rounded-xs text-ui-accent bg-ui-panel border-ui-borderDefault focus:ring-0 cursor-pointer" 
            />
          </label>
        </div>
      </div>
    </UiSection>

    <!-- 3. BASE COLOR & COLOR PALETTE -->
    <UiSection title="Base Color & Palette" :default-open="true">
      <div v-if="activeMaterial" class="space-y-1.5">
        <!-- Color Picker & Hex Input -->
        <div class="flex items-center gap-2 bg-ui-input p-1 rounded-xs border border-ui-borderSubtle">
          <input 
            type="color" 
            v-model="activeMaterial.color"
            class="w-5 h-5 rounded-xs cursor-pointer border border-ui-borderDefault bg-transparent p-0 shrink-0" 
          />
          <div class="flex-1 flex items-center justify-between">
            <span class="text-ui-textMuted text-[10px]">Base Tint</span>
            <span class="font-mono text-ui-textPrimary text-[11px] font-bold uppercase">{{ activeMaterial.color }}</span>
          </div>
        </div>

        <!-- Palette Presets Selector -->
        <div class="space-y-1 pt-0.5">
          <div class="flex items-center justify-between">
            <label class="text-[10px] font-semibold text-ui-textMuted uppercase">Indexed Palette</label>
            <span class="text-[9px] text-slate-500 font-mono">{{ currentPalette.colors.length }} colors</span>
          </div>
          <select 
            v-model="selectedPaletteIndex"
            class="w-full bg-ui-input border border-ui-borderSubtle rounded-xs px-2 py-1 text-ui-textPrimary text-[11px] focus:outline-none focus:border-ui-accent cursor-pointer"
          >
            <option v-for="(pal, idx) in retroPalettes" :key="pal.name" :value="idx">
              {{ pal.name }}
            </option>
          </select>
        </div>

        <!-- Compact Stylus-Friendly Palette Swatches Grid -->
        <div class="grid grid-cols-8 gap-1 p-1 bg-ui-input/50 rounded-xs border border-ui-borderSubtle">
          <button 
            v-for="color in currentPalette.colors" 
            :key="color"
            @click="pickPaletteColor(color)"
            class="w-full h-5 rounded-xs border transition-all hover:scale-105 active:scale-95 shadow-2xs relative flex items-center justify-center cursor-pointer"
            :style="{ backgroundColor: color }"
            :class="activeMaterial.color.toLowerCase() === color.toLowerCase() ? 'border-white ring-1.5 ring-amber-400 ring-offset-1 ring-offset-[#181a20] z-10' : 'border-black/40 hover:border-white/70'"
            :title="`Click to set tint: ${color}`"
          >
            <Check v-if="activeMaterial.color.toLowerCase() === color.toLowerCase()" class="w-2.5 h-2.5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]" />
          </button>
        </div>
      </div>
    </UiSection>

    <!-- 4. VERTEX COLORS & PROCEDURAL BAKING (Minimized by Default) -->
    <UiSection title="Vertex Colors & Bakes" :default-open="false">
      <div class="space-y-2">
        <!-- Active Paint Color & Fill Row -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <label class="text-[10px] font-semibold text-ui-textMuted uppercase">Active Vertex Color</label>
            <span class="font-mono text-ui-textPrimary text-[10px] font-bold uppercase">{{ toolStore.vertexPaintColor }}</span>
          </div>

          <div class="flex items-center gap-1.5 bg-ui-input p-1 rounded-xs border border-ui-borderSubtle">
            <input 
              type="color" 
              v-model="toolStore.vertexPaintColor" 
              class="w-5 h-5 rounded-xs cursor-pointer border border-ui-borderDefault bg-transparent p-0 shrink-0" 
            />
            <input 
              type="text" 
              v-model="toolStore.vertexPaintColor" 
              class="flex-1 bg-transparent text-[11px] font-mono font-bold text-ui-textPrimary uppercase focus:outline-none" 
            />
          </div>

          <!-- Fill Actions -->
          <div class="grid grid-cols-3 gap-1">
            <button 
              @click="fillSelectedVertices" 
              class="py-1 px-1.5 bg-indigo-600/80 hover:bg-indigo-600 text-white rounded-xs text-[10px] font-bold transition text-center shadow-xs"
              title="Fill selected vertices or faces with active color"
            >
              Fill Sel
            </button>
            <button 
              @click="fillEntireMesh" 
              class="py-1 px-1.5 bg-ui-input hover:bg-ui-hover text-ui-textPrimary border border-ui-borderSubtle rounded-xs text-[10px] font-medium transition text-center"
              title="Fill entire mesh with active color"
            >
              Fill Mesh
            </button>
            <button 
              @click="resetVertexColors" 
              class="py-1 px-1.5 bg-ui-input hover:bg-rose-950/40 text-ui-textMuted hover:text-rose-300 border border-ui-borderSubtle rounded-xs text-[10px] font-medium transition text-center"
              title="Reset all vertices to white"
            >
              Reset
            </button>
          </div>

          <!-- Compact Stylus-Friendly 24-Swatch Quick Chips -->
          <div class="grid grid-cols-8 gap-1 p-1 bg-ui-input/50 rounded-xs border border-ui-borderSubtle">
            <button 
              v-for="c in retroPalette" 
              :key="c"
              @click="toolStore.vertexPaintColor = c"
              class="w-full h-4.5 rounded-xs border transition-all hover:scale-105 active:scale-95 shadow-2xs cursor-pointer"
              :style="{ backgroundColor: c }"
              :class="toolStore.vertexPaintColor.toLowerCase() === c.toLowerCase() ? 'border-white ring-1.5 ring-amber-400 ring-offset-1 ring-offset-[#181a20] z-10' : 'border-black/40 hover:border-white/70'"
              :title="c"
            ></button>
          </div>
        </div>

        <!-- Procedural Gradient Engine Sub-Panel -->
        <div class="space-y-1.5 pt-1.5 border-t border-ui-borderSubtle">
          <div class="flex items-center justify-between">
            <label class="text-[10px] font-semibold text-amber-300 uppercase flex items-center gap-1">
              <Zap class="w-3 h-3 text-amber-400" />
              <span>Gradient Bake Engine</span>
            </label>
            <span class="text-[9px] text-slate-500 font-mono">Axis Bake</span>
          </div>

          <!-- Axis Selector Grid -->
          <div class="grid grid-cols-3 gap-1 text-[9px]">
            <button 
              v-for="ax in [
                { id: 'y', label: 'Height Y' },
                { id: 'x', label: 'Horiz X' },
                { id: 'z', label: 'Depth Z' },
                { id: 'radial', label: 'Radial' },
                { id: 'sun', label: 'Sun Light' },
                { id: 'ao', label: 'Fake AO' }
              ]" 
              :key="ax.id"
              @click="gradAxis = ax.id as any"
              class="py-1 px-1 rounded-xs border text-center font-bold transition"
              :class="gradAxis === ax.id ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-xs' : 'bg-ui-input text-ui-textSecondary border-ui-borderSubtle hover:bg-ui-hover'"
            >
              {{ ax.label }}
            </button>
          </div>

          <!-- Shadow & Highlight Swatches -->
          <div class="grid grid-cols-2 gap-1.5 pt-1">
            <div class="space-y-0.5">
              <span class="text-[9px] text-ui-textMuted">Shadow Start:</span>
              <div class="flex items-center gap-1 bg-ui-input p-1 rounded-xs border border-ui-borderSubtle">
                <input type="color" v-model="gradStartColor" class="w-4 h-4 rounded-xs cursor-pointer border border-ui-borderDefault bg-transparent p-0 shrink-0" />
                <input type="text" v-model="gradStartColor" class="w-full bg-transparent text-[10px] font-mono text-ui-textPrimary uppercase focus:outline-none" />
              </div>
            </div>
            <div class="space-y-0.5">
              <span class="text-[9px] text-ui-textMuted">Peak Highlight:</span>
              <div class="flex items-center gap-1 bg-ui-input p-1 rounded-xs border border-ui-borderSubtle">
                <input type="color" v-model="gradEndColor" class="w-4 h-4 rounded-xs cursor-pointer border border-ui-borderDefault bg-transparent p-0 shrink-0" />
                <input type="text" v-model="gradEndColor" class="w-full bg-transparent text-[10px] font-mono text-ui-textPrimary uppercase focus:outline-none" />
              </div>
            </div>
          </div>

          <!-- Sun Controls (if Sun Light) -->
          <div v-if="gradAxis === 'sun'" class="grid grid-cols-2 gap-1.5 pt-1 text-[9px] text-ui-textMuted">
            <div>
              <div class="flex justify-between">
                <span>Elev:</span>
                <span class="text-amber-400 font-bold">{{ sunElevation }}°</span>
              </div>
              <input type="range" min="0" max="90" v-model.number="sunElevation" class="w-full accent-amber-500 bg-ui-input h-1 rounded cursor-pointer" />
            </div>
            <div>
              <div class="flex justify-between">
                <span>Azim:</span>
                <span class="text-amber-400 font-bold">{{ sunAzimuth }}°</span>
              </div>
              <input type="range" min="0" max="360" v-model.number="sunAzimuth" class="w-full accent-amber-500 bg-ui-input h-1 rounded cursor-pointer" />
            </div>
          </div>

          <!-- Blend & Curve Options -->
          <div class="grid grid-cols-2 gap-1.5 pt-1 text-[10px]">
            <div>
              <label class="block text-[9px] text-ui-textMuted mb-0.5">Blend:</label>
              <select v-model="gradBlendMode" class="w-full bg-ui-input border border-ui-borderSubtle rounded-xs px-1.5 py-0.5 text-[10px] text-ui-textPrimary focus:outline-none cursor-pointer">
                <option value="replace">Replace</option>
                <option value="multiply">Multiply</option>
                <option value="add">Add</option>
              </select>
            </div>
            <div>
              <label class="block text-[9px] text-ui-textMuted mb-0.5">Curve:</label>
              <select v-model="gradCurve" class="w-full bg-ui-input border border-ui-borderSubtle rounded-xs px-1.5 py-0.5 text-[10px] text-ui-textPrimary focus:outline-none cursor-pointer">
                <option value="linear">Linear</option>
                <option value="ease">Smoothstep</option>
                <option value="contrast">High Contrast</option>
              </select>
            </div>
          </div>

          <!-- Execute Bake Button -->
          <button 
            @click="executeGradientBake" 
            class="w-full py-1.5 px-2 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded-xs text-[10px] flex items-center justify-center gap-1.5 shadow-xs transition"
          >
            <Zap class="w-3.5 h-3.5 fill-slate-950" />
            <span>Bake {{ gradAxis.toUpperCase() }} Gradient</span>
          </button>
        </div>

        <!-- Post-Processing & Adjustments -->
        <div class="space-y-1 pt-1.5 border-t border-ui-borderSubtle">
          <label class="text-[10px] font-semibold text-ui-textMuted uppercase">Vertex Adjustments & PSX FX</label>
          <div class="grid grid-cols-3 gap-1">
            <button 
              @click="smoothVertexColors" 
              class="py-1 px-1 bg-ui-input hover:bg-ui-hover text-indigo-300 border border-ui-borderSubtle rounded-xs text-[9px] font-bold transition text-center"
              title="Smooth / Blur colors across connected vertices"
            >
              Smooth
            </button>
            <button 
              @click="clampPSX5Bit" 
              class="py-1 px-1 bg-ui-input hover:bg-ui-hover text-amber-300 border border-ui-borderSubtle rounded-xs text-[9px] font-bold transition text-center"
              title="Quantize to PSX 5-bit RGB555"
            >
              PSX 5-Bit
            </button>
            <button 
              @click="invertVertexColors" 
              class="py-1 px-1 bg-ui-input hover:bg-ui-hover text-ui-textPrimary border border-ui-borderSubtle rounded-xs text-[9px] font-bold transition text-center"
              title="Invert vertex colors"
            >
              Invert
            </button>
          </div>
        </div>

        <!-- 3D Brush Parameters -->
        <div class="space-y-1.5 pt-1.5 border-t border-ui-borderSubtle">
          <div class="flex items-center justify-between text-[10px]">
            <span class="text-ui-textMuted">3D Brush Radius:</span>
            <span class="font-mono text-indigo-400 font-bold">{{ toolStore.vertexBrushRadius }}m</span>
          </div>
          <input 
            type="range" 
            min="0.1" 
            max="3.0" 
            step="0.05" 
            v-model.number="toolStore.vertexBrushRadius" 
            class="w-full accent-indigo-500 bg-ui-input h-1 rounded cursor-pointer" 
          />
          <div class="flex items-center justify-between text-[10px]">
            <span class="text-ui-textMuted">Brush Softness:</span>
            <span class="font-mono text-indigo-400 font-bold">{{ Math.round(toolStore.vertexBrushFalloff * 100) }}%</span>
          </div>
          <input 
            type="range" 
            min="0" 
            max="1" 
            step="0.05" 
            v-model.number="toolStore.vertexBrushFalloff" 
            class="w-full accent-indigo-500 bg-ui-input h-1 rounded cursor-pointer" 
          />
        </div>
      </div>
    </UiSection>

    <!-- 4. TEXTURE MAP & ATLAS SAMPLING -->
    <UiSection title="Texture Map & Image" :default-open="true">
      <div v-if="activeMaterial" class="space-y-2">
        <input ref="textureUploadInput" type="file" accept="image/*" class="hidden" @change="handleTextureImageUpload" />

        <!-- Texture Slot Selector -->
        <div class="space-y-1">
          <div class="flex items-center justify-between text-[10px] text-ui-textMuted font-semibold uppercase">
            <span>Assigned Texture</span>
            <button 
              @click="projectStore.addTexture(`${activeMaterial.name}_Tex`, 64, 64)"
              class="text-ui-accent hover:underline flex items-center gap-0.5 lowercase font-normal cursor-pointer"
            >
              <Plus class="w-2.5 h-2.5" />
              <span>new</span>
            </button>
          </div>
          <select 
            v-model="activeMaterial.textureId"
            @change="projectStore.markTextureUpdated(activeMaterial.textureId || undefined)"
            class="w-full bg-ui-input border border-ui-borderSubtle rounded-xs px-2 py-1 text-ui-textPrimary text-[11px] focus:outline-none focus:border-ui-accent cursor-pointer font-mono"
          >
            <option :value="null">No Texture (Solid Tint Only)</option>
            <option v-for="tex in projectStore.textures" :key="tex.id" :value="tex.id">
              {{ tex.name }} ({{ tex.width }}x{{ tex.height }}px)
            </option>
          </select>
        </div>

        <!-- Active Texture Preview Card -->
        <div v-if="activeTextureForMaterial" class="bg-ui-input p-2 rounded-xs border border-ui-borderSubtle space-y-2">
          <div class="flex items-center gap-2.5">
            <div class="w-10 h-10 rounded-xs border border-ui-borderDefault overflow-hidden bg-black/60 flex items-center justify-center shrink-0 shadow-xs">
              <img 
                :src="activeTextureForMaterial.dataUrl || activeTextureForMaterial.pixelBuffer?.toDataURL()" 
                class="w-full h-full object-contain [image-rendering:pixelated]" 
                alt="Texture"
              />
            </div>
            <div class="flex flex-col min-w-0 flex-1">
              <span class="text-[11px] font-bold text-ui-textPrimary truncate">{{ activeTextureForMaterial.name }}</span>
              <span class="text-[9.5px] text-slate-400 font-mono">{{ activeTextureForMaterial.width }} × {{ activeTextureForMaterial.height }} px</span>
            </div>
          </div>

          <!-- Actions: Upload/Replace, Edit in UV, Download -->
          <div class="grid grid-cols-3 gap-1 pt-0.5">
            <button 
              @click="triggerTextureUpload"
              class="py-1 px-1.5 bg-ui-surface hover:bg-ui-hover text-ui-textPrimary border border-ui-borderSubtle rounded-xs text-[10px] font-medium flex items-center justify-center gap-1 transition cursor-pointer"
              title="Upload image or sprite sheet to replace texture"
            >
              <Upload class="w-3 h-3 text-ui-accent" />
              <span>Load Image</span>
            </button>
            <button 
              @click="openUvWorkspace"
              class="py-1 px-1.5 bg-ui-surface hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textPrimary border border-ui-borderSubtle rounded-xs text-[10px] font-medium flex items-center justify-center gap-1 transition cursor-pointer"
              title="Open texture in UV Editor & Pixel Painter"
            >
              <ExternalLink class="w-3 h-3 text-sky-400" />
              <span>UV Edit</span>
            </button>
            <button 
              @click="downloadTexturePng"
              class="py-1 px-1.5 bg-ui-surface hover:bg-ui-hover text-ui-textSecondary hover:text-emerald-400 border border-ui-borderSubtle rounded-xs text-[10px] font-medium flex items-center justify-center gap-1 transition cursor-pointer"
              title="Export texture as PNG"
            >
              <Download class="w-3 h-3 text-emerald-400" />
              <span>PNG</span>
            </button>
          </div>
        </div>
      </div>
    </UiSection>

    <!-- 5. RETRO PSX HARDWARE SHADING EFFECTS -->
    <UiSection title="PSX Hardware Shading" :default-open="false">
      <div class="space-y-1.5">
        <!-- Vertex Jitter -->
        <label class="flex items-center justify-between cursor-pointer bg-ui-input p-1.5 rounded-xs border border-ui-borderSubtle hover:border-ui-borderDefault transition">
          <span class="text-ui-textSecondary text-[11px]">PS1 Geometry Jitter</span>
          <input 
            type="checkbox" 
            v-model="toolStore.viewport.psxJitter" 
            class="rounded-xs text-ui-accent bg-ui-panel border-ui-borderDefault focus:ring-0 cursor-pointer" 
          />
        </label>

        <!-- Affine Texture Warping -->
        <label class="flex items-center justify-between cursor-pointer bg-ui-input p-1.5 rounded-xs border border-ui-borderSubtle hover:border-ui-borderDefault transition">
          <span class="text-ui-textSecondary text-[11px]">Affine Texture Distortion</span>
          <input 
            type="checkbox" 
            v-model="toolStore.viewport.psxAffine" 
            class="rounded-xs text-ui-accent bg-ui-panel border-ui-borderDefault focus:ring-0 cursor-pointer" 
          />
        </label>

        <!-- Bayer Dithering -->
        <label class="flex items-center justify-between cursor-pointer bg-ui-input p-1.5 rounded-xs border border-ui-borderSubtle hover:border-ui-borderDefault transition">
          <span class="text-ui-textSecondary text-[11px]">15-Bit Bayer Dithering</span>
          <input 
            type="checkbox" 
            v-model="toolStore.viewport.dither" 
            class="rounded-xs text-ui-accent bg-ui-panel border-ui-borderDefault focus:ring-0 cursor-pointer" 
          />
        </label>

        <!-- CRT Filter Overlay -->
        <label class="flex items-center justify-between cursor-pointer bg-ui-input p-1.5 rounded-xs border border-ui-borderSubtle hover:border-ui-borderDefault transition">
          <span class="text-ui-textSecondary text-[11px] flex items-center gap-1.5">
            <Tv class="w-3.5 h-3.5 text-ui-textMuted" />
            <span>CRT Scanlines Filter</span>
          </span>
          <input 
            type="checkbox" 
            v-model="toolStore.viewport.crtFilter" 
            class="rounded-xs text-ui-accent bg-ui-panel border-ui-borderDefault focus:ring-0 cursor-pointer" 
          />
        </label>
      </div>
    </UiSection>
  </div>
</template>
