<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { useToolStore } from '../../stores/toolStore'
import BlenderIcon from '../icons/BlenderIcon.vue'
import { DEFAULT_PALETTES, loadCustomPalettes, saveCustomPalettes } from '../../utils/color'
import { Palette } from '../../types/texture'
import { 
  Plus, 
  Trash2, 
  Copy, 
  Tv, 
  Check, 
  Zap, 
  CheckCheck, 
  Sparkles, 
  X, 
  ArrowLeftRight, 
  Save 
} from 'lucide-vue-next'
import { DEFAULT_GRADIENT_PRESETS, loadCustomGradients, saveCustomGradients, SavedGradient } from '../../utils/gradient'
import { 
  DITHER_PRESETS, 
  DitherPreset, 
  renderDitherCanvasPreview,
  applyFloydSteinbergDither,
  applyAtkinsonDither 
} from '../../utils/dithering'

const projectStore = useProjectStore()
const toolStore = useToolStore()

// ----------------------------------------------------
// WORKFLOW TABS
// ----------------------------------------------------
type MaterialCategory = 'surface' | 'consoles' | 'dithering' | 'palettes' | 'gradients' | 'all'
const activeCategory = ref<MaterialCategory>('surface')

// ----------------------------------------------------
// ACTIVE MATERIAL SELECTION & ASSIGNMENT
// ----------------------------------------------------
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

const isAssignedToActiveMesh = computed(() => {
  return activeMesh.value?.materialId === activeMaterial.value?.id
})

const isMaterialShared = computed(() => {
  if (!activeMesh.value) return false
  const curMatId = activeMesh.value.materialId || 'default_material'
  return projectStore.meshes.filter(m => m.materialId === curMatId).length > 1
})

function handleMakeMaterialUnique() {
  const newMat = projectStore.makeActiveMeshMaterialUnique()
  if (newMat) {
    selectedMaterialId.value = newMat.id
  }
}

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

const showCreateTexModal = ref(false)
const newTexName = ref('')
const newTexSize = ref(64)

function handleCreateNewTexture() {
  const name = newTexName.value.trim() || `Texture_${projectStore.textures.length + 1}`
  const newTex = projectStore.addTexture(name, newTexSize.value, newTexSize.value)
  if (activeMaterial.value) {
    activeMaterial.value.textureId = newTex.id
    projectStore.markGeometryUpdated()
  }
  showCreateTexModal.value = false
  newTexName.value = ''
}

// Rename state
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

// Material slot actions
function handleAddMaterial() {
  const newMat = projectStore.addMaterial()
  newMat.shading = 'pbr'
  newMat.roughness = 0.7
  newMat.metalness = 0.05
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
  cloned.emissive = activeMaterial.value.emissive
  cloned.emissiveIntensity = activeMaterial.value.emissiveIntensity
  cloned.psxJitter = activeMaterial.value.psxJitter
  cloned.psxAffine = activeMaterial.value.psxAffine
  cloned.dither = activeMaterial.value.dither
  cloned.wireframe = activeMaterial.value.wireframe
  cloned.saturnMeshAlpha = activeMaterial.value.saturnMeshAlpha
  cloned.dreamcastVQ = activeMaterial.value.dreamcastVQ
  cloned.dreamcastSpecular = activeMaterial.value.dreamcastSpecular
  cloned.dreamcastCelOutline = activeMaterial.value.dreamcastCelOutline
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

function purgeUnusedMaterials() {
  const usedMatIds = new Set(projectStore.meshes.map(m => m.materialId))
  const keep = projectStore.materials.filter(m => usedMatIds.has(m.id))
  if (keep.length === 0 && projectStore.materials.length > 0) {
    keep.push(projectStore.materials[0])
  }
  projectStore.materials = keep
  if (!keep.some(m => m.id === selectedMaterialId.value)) {
    selectedMaterialId.value = keep[0]?.id || 'default_material'
  }
}

// ----------------------------------------------------
// MATERIAL PRESETS LIBRARY (Zero Emojis)
// ----------------------------------------------------
interface MaterialPreset {
  category: string
  name: string
  label: string
  color: string
  roughness: number
  metalness: number
  shading: 'pbr' | 'textured' | 'psx' | 'saturn' | 'dreamcast' | 'n64' | 'flat' | 'gouraud' | 'unlit'
  hasTexture: boolean
  emissive?: string
  emissiveIntensity?: number
  opacity?: number
  doubleSided?: boolean
  saturnMeshAlpha?: boolean
  dreamcastVQ?: boolean
  dreamcastSpecular?: boolean
  dreamcastCelOutline?: boolean
}

const selectedPresetCategory = ref<string>('All')
const presetCategories = ['All', 'Metals', 'Minerals', 'Organics', 'Plastics', 'Retro FX']

const materialPresets: MaterialPreset[] = [
  // Metals
  { category: 'Metals', name: 'Polished Gold', label: 'Gold', color: '#FBBF24', roughness: 0.18, metalness: 0.95, shading: 'pbr', hasTexture: false },
  { category: 'Metals', name: 'Chrome Mirror', label: 'Chrome', color: '#F8FAFC', roughness: 0.05, metalness: 1.0, shading: 'pbr', hasTexture: false },
  { category: 'Metals', name: 'Raw Copper', label: 'Copper', color: '#EA580C', roughness: 0.28, metalness: 0.90, shading: 'pbr', hasTexture: false },
  { category: 'Metals', name: 'Rusted Iron', label: 'Rusted Iron', color: '#78350F', roughness: 0.85, metalness: 0.40, shading: 'pbr', hasTexture: false },
  
  // Minerals & Gems
  { category: 'Minerals', name: 'Obsidian Black', label: 'Obsidian', color: '#1E293B', roughness: 0.12, metalness: 0.20, shading: 'pbr', hasTexture: false },
  { category: 'Minerals', name: 'Ruby Crystal', label: 'Ruby', color: '#E11D48', roughness: 0.10, metalness: 0.10, shading: 'pbr', hasTexture: false },
  { category: 'Minerals', name: 'Emerald Gem', label: 'Emerald', color: '#059669', roughness: 0.15, metalness: 0.10, shading: 'pbr', hasTexture: false },
  { category: 'Minerals', name: 'Rough Granite', label: 'Granite', color: '#64748B', roughness: 0.95, metalness: 0.05, shading: 'pbr', hasTexture: false },

  // Organics
  { category: 'Organics', name: 'Matte Clay', label: 'Clay', color: '#CBD5E1', roughness: 0.85, metalness: 0.0, shading: 'pbr', hasTexture: false },
  { category: 'Organics', name: 'Oak Wood', label: 'Wood', color: '#92400E', roughness: 0.75, metalness: 0.0, shading: 'pbr', hasTexture: false },
  { category: 'Organics', name: 'Lush Moss', label: 'Moss', color: '#15803D', roughness: 0.90, metalness: 0.0, shading: 'pbr', hasTexture: false },
  { category: 'Organics', name: 'Aged Bone', label: 'Bone', color: '#FEF3C7', roughness: 0.65, metalness: 0.05, shading: 'pbr', hasTexture: false },

  // Plastics & Neon
  { category: 'Plastics', name: 'Glossy Plastic', label: 'Plastic', color: '#EF4444', roughness: 0.15, metalness: 0.0, shading: 'pbr', hasTexture: false },
  { category: 'Plastics', name: 'Cyber Neon', label: 'Neon Glow', color: '#22C55E', roughness: 0.30, metalness: 0.1, shading: 'pbr', hasTexture: false, emissive: '#22C55E', emissiveIntensity: 2.5 },
  { category: 'Plastics', name: 'Holo Cyan', label: 'Holo Glow', color: '#06B6D4', roughness: 0.20, metalness: 0.3, shading: 'pbr', hasTexture: false, emissive: '#06B6D4', emissiveIntensity: 2.0 },
  { category: 'Plastics', name: 'Rubber Matte', label: 'Rubber', color: '#334155', roughness: 0.95, metalness: 0.0, shading: 'pbr', hasTexture: false },

  // Retro FX & Consoles
  { category: 'Retro FX', name: 'PlayStation 1 Classic', label: 'PS1 Retro', color: '#FFFFFF', roughness: 0.80, metalness: 0.0, shading: 'psx', hasTexture: true },
  { category: 'Retro FX', name: 'Sega Saturn VDP1', label: 'Saturn VDP1', color: '#FFFFFF', roughness: 0.75, metalness: 0.0, shading: 'saturn', hasTexture: true, saturnMeshAlpha: true },
  { category: 'Retro FX', name: 'Sega Dreamcast PowerVR', label: 'Dreamcast', color: '#FFFFFF', roughness: 0.25, metalness: 0.15, shading: 'dreamcast', hasTexture: true, dreamcastVQ: true, dreamcastSpecular: true },
  { category: 'Retro FX', name: 'Jet Set Radio Cel', label: 'JSR Cel-Ink', color: '#38BDF8', roughness: 0.30, metalness: 0.0, shading: 'dreamcast', hasTexture: true, dreamcastCelOutline: true, dreamcastVQ: true },
  { category: 'Retro FX', name: 'Nintendo 64 TMEM', label: 'N64 LowPoly', color: '#FFFFFF', roughness: 0.85, metalness: 0.0, shading: 'n64', hasTexture: true },
  { category: 'Retro FX', name: 'Pixel Textured Clean', label: 'Pixel Clean', color: '#FFFFFF', roughness: 0.70, metalness: 0.0, shading: 'textured', hasTexture: true },
  { category: 'Retro FX', name: 'Gouraud LowPoly', label: 'Gouraud Stone', color: '#94A3B8', roughness: 0.60, metalness: 0.0, shading: 'gouraud', hasTexture: false }
]

const filteredPresets = computed(() => {
  if (selectedPresetCategory.value === 'All') return materialPresets
  return materialPresets.filter(p => p.category === selectedPresetCategory.value)
})

function applyMaterialPreset(p: MaterialPreset) {
  if (!activeMaterial.value) return
  projectStore.recordState(`Apply Material Preset: ${p.name}`)
  activeMaterial.value.color = p.color
  activeMaterial.value.roughness = p.roughness
  activeMaterial.value.metalness = p.metalness
  activeMaterial.value.shading = p.shading
  if (p.hasTexture) {
    if (!activeMaterial.value.textureId) {
      activeMaterial.value.textureId = projectStore.textures[0]?.id || 'tex_default'
    }
  } else {
    activeMaterial.value.textureId = null
  }
  if (p.emissive) {
    activeMaterial.value.emissive = p.emissive
    activeMaterial.value.emissiveIntensity = p.emissiveIntensity || 1.0
  } else {
    activeMaterial.value.emissive = '#000000'
    activeMaterial.value.emissiveIntensity = 0
  }
  if (p.saturnMeshAlpha !== undefined) activeMaterial.value.saturnMeshAlpha = p.saturnMeshAlpha
  if (p.dreamcastVQ !== undefined) activeMaterial.value.dreamcastVQ = p.dreamcastVQ
  if (p.dreamcastSpecular !== undefined) activeMaterial.value.dreamcastSpecular = p.dreamcastSpecular
  if (p.dreamcastCelOutline !== undefined) activeMaterial.value.dreamcastCelOutline = p.dreamcastCelOutline
  projectStore.markGeometryUpdated()
}

// ----------------------------------------------------
// CONSOLE PROFILES
// ----------------------------------------------------
function applyConsoleProfile(profile: 'psx' | 'saturn' | 'dreamcast' | 'n64') {
  if (!activeMaterial.value) return
  projectStore.recordState(`Apply Console Profile: ${profile.toUpperCase()}`)
  activeMaterial.value.shading = profile
  if (profile === 'psx') {
    activeMaterial.value.psxJitter = true
    activeMaterial.value.psxAffine = true
    activeMaterial.value.dither = true
    activeMaterial.value.ditherPattern = 'bayer4x4'
    activeMaterial.value.colorDepth = 32
    activeMaterial.value.saturnMeshAlpha = false
    activeMaterial.value.dreamcastVQ = false
    activeMaterial.value.dreamcastSpecular = false
    activeMaterial.value.dreamcastCelOutline = false
  } else if (profile === 'saturn') {
    activeMaterial.value.psxJitter = false
    activeMaterial.value.psxAffine = true
    activeMaterial.value.saturnMeshAlpha = true
    activeMaterial.value.dither = true
    activeMaterial.value.ditherPattern = 'checker'
    activeMaterial.value.colorDepth = 32
    activeMaterial.value.dreamcastVQ = false
    activeMaterial.value.dreamcastSpecular = false
    activeMaterial.value.dreamcastCelOutline = false
  } else if (profile === 'dreamcast') {
    activeMaterial.value.psxJitter = false
    activeMaterial.value.psxAffine = false
    activeMaterial.value.saturnMeshAlpha = false
    activeMaterial.value.dreamcastVQ = true
    activeMaterial.value.dreamcastSpecular = true
    activeMaterial.value.dreamcastCelOutline = false
    activeMaterial.value.dither = false
    activeMaterial.value.colorDepth = 0
  } else if (profile === 'n64') {
    activeMaterial.value.psxJitter = false
    activeMaterial.value.psxAffine = false
    activeMaterial.value.saturnMeshAlpha = false
    activeMaterial.value.dreamcastVQ = false
    activeMaterial.value.dreamcastSpecular = false
    activeMaterial.value.dreamcastCelOutline = false
    activeMaterial.value.dither = true
    activeMaterial.value.ditherPattern = 'bluenoise'
    activeMaterial.value.colorDepth = 16
  }
  projectStore.markGeometryUpdated()
}

// ----------------------------------------------------
// COLOR ADJUSTMENTS & HARMONIES
// ----------------------------------------------------
function adjustMaterialColor(action: 'invert' | 'grayscale' | 'brighten' | 'darken' | 'warm' | 'cool') {
  if (!activeMaterial.value) return
  let hex = activeMaterial.value.color.replace('#', '')
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('')
  let r = parseInt(hex.substring(0, 2), 16) || 255
  let g = parseInt(hex.substring(2, 4), 16) || 255
  let b = parseInt(hex.substring(4, 6), 16) || 255

  if (action === 'invert') {
    r = 255 - r; g = 255 - g; b = 255 - b
  } else if (action === 'grayscale') {
    const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
    r = gray; g = gray; b = gray
  } else if (action === 'brighten') {
    r = Math.min(255, Math.round(r * 1.2 + 15))
    g = Math.min(255, Math.round(g * 1.2 + 15))
    b = Math.min(255, Math.round(b * 1.2 + 15))
  } else if (action === 'darken') {
    r = Math.max(0, Math.round(r * 0.8 - 15))
    g = Math.max(0, Math.round(g * 0.8 - 15))
    b = Math.max(0, Math.round(b * 0.8 - 15))
  } else if (action === 'warm') {
    r = Math.min(255, r + 25)
    b = Math.max(0, b - 20)
  } else if (action === 'cool') {
    b = Math.min(255, b + 25)
    r = Math.max(0, r - 20)
  }

  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  const newHex = `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase()
  activeMaterial.value.color = newHex
  projectStore.markGeometryUpdated()
}

function clearMaterialTint() {
  if (activeMaterial.value) {
    activeMaterial.value.color = '#ffffff'
    toolStore.primaryColor = '#ffffff'
    projectStore.recordState('Clear Material Tint')
    projectStore.markGeometryUpdated()
  }
}

// ----------------------------------------------------
// DITHERING ENGINE
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
    mat.color || '#38bdf8',
    mat.ditherChannel || 'rgb'
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
  if (preset.space) activeMaterial.value.ditherSpace = preset.space
  if (preset.channel) activeMaterial.value.ditherChannel = preset.channel
  projectStore.markGeometryUpdated()
  nextTick(() => {
    updateDitherPreview()
  })
}

function ditherActiveTextureImage(algorithm: 'floyd' | 'atkinson') {
  const buf = projectStore.pixelBuffer
  if (!buf || !buf.ctx) return
  const pal = activePalette.value?.colors || ['#ffffff', '#000000', '#ef4444', '#22c55e', '#3b82f6', '#f59e0b']
  if (!pal || pal.length === 0) return

  projectStore.recordState(`Dither Texture (${algorithm === 'floyd' ? 'Floyd-Steinberg' : 'Atkinson'})`)
  if (algorithm === 'floyd') {
    applyFloydSteinbergDither(buf.ctx, buf.width, buf.height, pal)
  } else {
    applyAtkinsonDither(buf.ctx, buf.width, buf.height, pal)
  }

  if (projectStore.activeTexture) {
    projectStore.activeTexture.dataUrl = buf.toDataURL()
  }
  projectStore.markTextureUpdated()
}

// ----------------------------------------------------
// PALETTE SETS MANAGEMENT
// ----------------------------------------------------
const customPalettes = ref<Palette[]>([])
const selectedPaletteId = ref<string>('psx-classic')
const showNewPaletteDialog = ref(false)
const newPaletteName = ref('')

onMounted(() => {
  customPalettes.value = loadCustomPalettes()
  customGradients.value = loadCustomGradients()
  nextTick(() => {
    updateDitherPreview()
  })
})

const allPalettes = computed<Palette[]>(() => {
  return [...DEFAULT_PALETTES, ...customPalettes.value]
})

const activePalette = computed<Palette>(() => {
  return allPalettes.value.find(p => p.id === selectedPaletteId.value) || allPalettes.value[0]
})

const selectedPaletteCategory = ref<string>('All')

const paletteCategories = computed(() => {
  const cats = new Set<string>(['All'])
  allPalettes.value.forEach(p => {
    if (p.category) cats.add(p.category)
  })
  return Array.from(cats)
})

const filteredPalettes = computed(() => {
  if (selectedPaletteCategory.value === 'All') return allPalettes.value
  return allPalettes.value.filter(p => p.category === selectedPaletteCategory.value)
})

function pickPaletteColor(hex: string) {
  if (activeMaterial.value) {
    projectStore.recordState('Change Material Color')
    activeMaterial.value.color = hex
    toolStore.primaryColor = hex
    projectStore.markGeometryUpdated()
  }
}

function createNewCustomPalette() {
  const name = newPaletteName.value.trim() || `Custom Set ${customPalettes.value.length + 1}`
  const newPal: Palette = {
    id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name,
    category: 'Custom',
    isCustom: true,
    colors: [activeMaterial.value?.color || '#ffffff', '#000000', '#64748b', '#ef4444', '#22c55e', '#3b82f6', '#f59e0b', '#8b5cf6']
  }
  customPalettes.value.push(newPal)
  saveCustomPalettes(customPalettes.value)
  selectedPaletteId.value = newPal.id
  showNewPaletteDialog.value = false
  newPaletteName.value = ''
}

function addCurrentColorToActivePalette() {
  const pal = activePalette.value
  const col = activeMaterial.value?.color || '#ffffff'
  if (pal.isCustom) {
    if (!pal.colors.includes(col)) {
      pal.colors.push(col)
      saveCustomPalettes(customPalettes.value)
    }
  } else {
    const cloned: Palette = {
      id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: `${pal.name} (Custom)`,
      category: 'Custom',
      isCustom: true,
      colors: [...pal.colors, col]
    }
    customPalettes.value.push(cloned)
    saveCustomPalettes(customPalettes.value)
    selectedPaletteId.value = cloned.id
  }
}

function deleteCurrentCustomPalette() {
  if (!activePalette.value.isCustom) return
  customPalettes.value = customPalettes.value.filter(p => p.id !== activePalette.value.id)
  saveCustomPalettes(customPalettes.value)
  selectedPaletteId.value = allPalettes.value[0]?.id || 'psx-classic'
}

// ----------------------------------------------------
// MULTI-STOP GRADIENT & VERTEX BAKING ENGINE
// ----------------------------------------------------
interface GradientStop {
  id: string
  pos: number // 0 to 1
  color: string
}

const gradientStops = ref<GradientStop[]>([
  { id: 'stop_1', pos: 0.0, color: '#1e1b4b' },
  { id: 'stop_2', pos: 0.5, color: '#4338ca' },
  { id: 'stop_3', pos: 1.0, color: '#38bdf8' }
])

const activeStopId = ref<string>('stop_1')
const activeStop = computed(() => {
  return gradientStops.value.find(s => s.id === activeStopId.value) || gradientStops.value[0]
})

const gradAxis = ref<'y' | 'x' | 'z' | 'radial' | 'sun' | 'ao'>('y')
const gradCurve = ref<'linear' | 'ease' | 'contrast' | 'stepped'>('linear')
const gradBlendMode = ref<'replace' | 'multiply' | 'add'>('replace')
const sunElevation = ref<number>(45)
const sunAzimuth = ref<number>(45)
const sunShadowDepth = ref<number>(80)

const customGradients = ref<SavedGradient[]>([])
const newGradientName = ref('')
const showSaveGradientDialog = ref(false)

const allGradientPresets = computed(() => {
  return [...DEFAULT_GRADIENT_PRESETS, ...customGradients.value]
})

function applyGradientPreset(preset: SavedGradient) {
  gradientStops.value = preset.stops.map((s, idx) => ({
    id: `stop_${idx}_${Date.now()}`,
    pos: s.position / 100,
    color: s.color
  }))
  activeStopId.value = gradientStops.value[0]?.id || 'stop_1'
}

function addGradientStopAt(normX: number) {
  const col = sampleGradientAt(normX, 'linear')
  const newStop: GradientStop = {
    id: `stop_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    pos: Math.round(normX * 100) / 100,
    color: rgbToHex(col.r, col.g, col.b)
  }
  gradientStops.value.push(newStop)
  gradientStops.value.sort((a, b) => a.pos - b.pos)
  activeStopId.value = newStop.id
}

function removeActiveStop() {
  if (gradientStops.value.length <= 2) return
  gradientStops.value = gradientStops.value.filter(s => s.id !== activeStopId.value)
  activeStopId.value = gradientStops.value[0]?.id || 'stop_1'
}

function reverseGradientStops() {
  gradientStops.value.forEach(s => {
    s.pos = Math.round((1 - s.pos) * 100) / 100
  })
  gradientStops.value.sort((a, b) => a.pos - b.pos)
}

function saveCurrentGradient() {
  const name = newGradientName.value.trim() || `Gradient ${customGradients.value.length + 1}`
  const saved: SavedGradient = {
    id: `grad_${Date.now()}`,
    name,
    type: 'Linear',
    angle: 90,
    isCustom: true,
    stops: gradientStops.value.map((s, idx) => ({
      id: `stop_${idx}`,
      position: Math.round(s.pos * 100),
      color: s.color
    }))
  }
  customGradients.value.push(saved)
  saveCustomGradients(customGradients.value)
  showSaveGradientDialog.value = false
  newGradientName.value = ''
}

const gradientCss = computed(() => {
  const sorted = [...gradientStops.value].sort((a, b) => a.pos - b.pos)
  const stopsStr = sorted.map(s => `${s.color} ${Math.round(s.pos * 100)}%`).join(', ')
  return `linear-gradient(to right, ${stopsStr})`
})

function sampleGradientAt(t: number, curve: string): { r: number; g: number; b: number } {
  let adjustedT = Math.max(0, Math.min(1, t))
  if (curve === 'ease') {
    adjustedT = adjustedT * adjustedT * (3 - 2 * adjustedT)
  } else if (curve === 'contrast') {
    adjustedT = adjustedT < 0.5 ? 2 * adjustedT * adjustedT : -1 + (4 - 2 * adjustedT) * adjustedT
  } else if (curve === 'stepped') {
    adjustedT = Math.floor(adjustedT * 4) / 3
  }

  const sorted = [...gradientStops.value].sort((a, b) => a.pos - b.pos)
  if (sorted.length === 0) return { r: 255, g: 255, b: 255 }
  if (adjustedT <= sorted[0].pos) return hexToRgb(sorted[0].color)
  if (adjustedT >= sorted[sorted.length - 1].pos) return hexToRgb(sorted[sorted.length - 1].color)

  for (let i = 0; i < sorted.length - 1; i++) {
    const s1 = sorted[i]
    const s2 = sorted[i + 1]
    if (adjustedT >= s1.pos && adjustedT <= s2.pos) {
      const segT = (s2.pos - s1.pos) === 0 ? 0 : (adjustedT - s1.pos) / (s2.pos - s1.pos)
      const c1 = hexToRgb(s1.color)
      const c2 = hexToRgb(s2.color)
      return {
        r: Math.round(c1.r + (c2.r - c1.r) * segT),
        g: Math.round(c1.g + (c2.g - c1.g) * segT),
        b: Math.round(c1.b + (c2.b - c1.b) * segT)
      }
    }
  }
  return hexToRgb(sorted[0].color)
}

function executeGradientBake() {
  if (!activeMesh.value) return
  projectStore.recordState(`Bake Multi-Stop Gradient (${gradAxis.value.toUpperCase()})`)

  if (gradAxis.value === 'sun') {
    bakeSunDirection()
    projectStore.markGeometryUpdated()
    return
  }
  if (gradAxis.value === 'ao') {
    bakeAOCavity()
    projectStore.markGeometryUpdated()
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

    const t = Math.max(0, Math.min(1, (val - minVal) / range))
    const sampledColor = sampleGradientAt(t, gradCurve.value)

    applyColorWithBlendMode(v, sampledColor)
  }

  projectStore.markGeometryUpdated()
}

function bakeSunDirection() {
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
    const sampledColor = sampleGradientAt(t, gradCurve.value)

    applyColorWithBlendMode(v, sampledColor)
  }
  projectStore.markGeometryUpdated()
}

function bakeAOCavity() {
  if (!activeMesh.value) return
  for (const v of activeMesh.value.vertices) {
    const distFromOrigin = Math.hypot(v.position.x, v.position.z)
    const heightFactor = Math.max(0, Math.min(1, (v.position.y + 1) / 2))
    const ao = Math.max(0, Math.min(1, 0.35 + (heightFactor * 0.45) + (Math.min(distFromOrigin, 1) * 0.2)))
    const sampledColor = sampleGradientAt(ao, gradCurve.value)

    applyColorWithBlendMode(v, sampledColor)
  }
  projectStore.markGeometryUpdated()
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

// Vertex Fill utilities
function fillSelectedVertices() {
  if (!activeMesh.value) return
  projectStore.recordState('Fill Selected Vertices')
  const col = toolStore.vertexPaintColor
  const selVerts = new Set(projectStore.selectedVertexIds)
  for (const fId of projectStore.selectedFaceIds) {
    const face = activeMesh.value.faces.find(f => f.id === fId)
    if (face) face.vertexIds.forEach(id => selVerts.add(id))
  }
  for (const v of activeMesh.value.vertices) {
    if (selVerts.has(v.id)) v.color = col
  }
  projectStore.markGeometryUpdated()
}

function fillEntireMesh() {
  if (!activeMesh.value) return
  projectStore.recordState('Fill Entire Mesh')
  const col = toolStore.vertexPaintColor
  for (const v of activeMesh.value.vertices) {
    v.color = col
  }
  projectStore.markGeometryUpdated()
}

function resetVertexColors() {
  if (!activeMesh.value) return
  projectStore.recordState('Reset Vertex Colors')
  for (const v of activeMesh.value.vertices) {
    v.color = '#ffffff'
  }
  projectStore.markGeometryUpdated()
}

function smoothVertexColors() {
  if (!activeMesh.value) return
  projectStore.recordState('Smooth Vertex Colors')
  const neighborColors = new Map<string, { r: number; g: number; b: number; count: number }>()
  for (const v of activeMesh.value.vertices) {
    neighborColors.set(v.id, { r: 0, g: 0, b: 0, count: 0 })
  }
  for (const face of activeMesh.value.faces) {
    const vIds = face.vertexIds
    for (let i = 0; i < vIds.length; i++) {
      const v1Id = vIds[i]
      const v2Id = vIds[(i + 1) % vIds.length]
      const v1 = activeMesh.value.vertices.find(v => v.id === v1Id)
      const v2 = activeMesh.value.vertices.find(v => v.id === v2Id)
      if (!v1 || !v2) continue
      const c1 = hexToRgb(v1.color || '#ffffff')
      const c2 = hexToRgb(v2.color || '#ffffff')
      const n1 = neighborColors.get(v1.id)!
      const n2 = neighborColors.get(v2.id)!
      n1.r += c2.r; n1.g += c2.g; n1.b += c2.b; n1.count++
      n2.r += c1.r; n2.g += c1.g; n2.b += c1.b; n2.count++
    }
  }
  for (const v of activeMesh.value.vertices) {
    const n = neighborColors.get(v.id)
    if (n && n.count > 0) {
      const cur = hexToRgb(v.color || '#ffffff')
      const avgR = n.r / n.count
      const avgG = n.g / n.count
      const avgB = n.b / n.count
      v.color = rgbToHex(
        Math.round(cur.r * 0.4 + avgR * 0.6),
        Math.round(cur.g * 0.4 + avgG * 0.6),
        Math.round(cur.b * 0.4 + avgB * 0.6)
      )
    }
  }
  projectStore.markGeometryUpdated()
}

function clampPSX5Bit() {
  if (!activeMesh.value) return
  projectStore.recordState('Quantize Vertex Colors to 5-Bit')
  for (const v of activeMesh.value.vertices) {
    const c = hexToRgb(v.color || '#ffffff')
    const r5 = Math.round(c.r / 8) * 8
    const g5 = Math.round(c.g / 8) * 8
    const b5 = Math.round(c.b / 8) * 8
    v.color = rgbToHex(Math.min(255, r5), Math.min(255, g5), Math.min(255, b5))
  }
  projectStore.markGeometryUpdated()
}

function invertVertexColors() {
  if (!activeMesh.value) return
  projectStore.recordState('Invert Vertex Colors')
  for (const v of activeMesh.value.vertices) {
    const c = hexToRgb(v.color || '#ffffff')
    v.color = rgbToHex(255 - c.r, 255 - c.g, 255 - c.b)
  }
  projectStore.markGeometryUpdated()
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
    <!-- 1. PERSISTENT MATERIAL HEADER & SLOT MANAGER -->
    <div class="p-2 bg-ui-header rounded-xs border border-ui-borderSubtle space-y-2">
      <!-- Row 1: Title, Active Pill, and Quick Slot Actions -->
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-1.5 min-w-0">
          <BlenderIcon name="material" :size="13" color="#f59e0b" class="shrink-0" />
          <span class="font-bold text-[11px] text-ui-textPrimary whitespace-nowrap">Materials</span>
          <div 
            v-if="activeMaterial"
            class="flex items-center gap-1 px-1.5 py-0.5 bg-ui-surface rounded-xs border border-ui-borderSubtle max-w-[120px] truncate"
            :title="activeMaterial.name"
          >
            <span class="w-2 h-2 rounded-full shrink-0 shadow-2xs border border-black/40" :style="{ backgroundColor: activeMaterial.color }"></span>
            <span class="text-[9.5px] font-mono text-amber-300 truncate font-bold">{{ activeMaterial.name }}</span>
          </div>
        </div>
        
        <div class="flex items-center gap-1 shrink-0">
          <button 
            @click="handleAddMaterial" 
            class="p-1 rounded-xs bg-ui-surface hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textPrimary border border-ui-borderSubtle transition flex items-center gap-1 text-[9.5px] cursor-pointer" 
            title="Create New Material Slot"
          >
            <Plus class="w-3 h-3 text-emerald-400" />
            <span>New</span>
          </button>
          <button 
            @click="handleDuplicateMaterial" 
            class="p-1 rounded-xs bg-ui-surface hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textPrimary border border-ui-borderSubtle transition cursor-pointer" 
            title="Duplicate Active Material"
          >
            <Copy class="w-3 h-3" />
          </button>
          <button 
            @click="handleDeleteMaterial" 
            :disabled="projectStore.materials.length <= 1"
            class="p-1 rounded-xs bg-ui-surface hover:bg-rose-950/40 text-ui-textMuted hover:text-rose-400 border border-ui-borderSubtle disabled:opacity-30 transition cursor-pointer" 
            title="Delete Material"
          >
            <Trash2 class="w-3 h-3" />
          </button>
          <button 
            @click="purgeUnusedMaterials" 
            class="p-1 rounded-xs bg-ui-surface hover:bg-amber-950/40 text-ui-textMuted hover:text-amber-400 border border-ui-borderSubtle transition text-[9px] font-mono cursor-pointer" 
            title="Purge Unused Material Slots"
          >
            Purge
          </button>
        </div>
      </div>

      <!-- Row 2: Slot Dropdown Selector & Rename -->
      <div class="flex items-center gap-1.5">
        <select 
          v-model="selectedMaterialId"
          class="flex-1 bg-ui-surface border border-ui-borderDefault rounded-xs px-2 py-1 text-amber-300 font-mono text-[11px] focus:outline-none focus:border-ui-accent cursor-pointer font-bold"
        >
          <option v-for="mat in projectStore.materials" :key="mat.id" :value="mat.id">
            {{ mat.name }} {{ activeMesh?.materialId === mat.id ? '(Active Object)' : '' }}
          </option>
        </select>
        <button 
          v-if="!editingName"
          @click="startRename"
          class="px-2 py-1 rounded-xs bg-ui-surface hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textPrimary border border-ui-borderSubtle transition text-[9.5px] cursor-pointer"
          title="Rename Material"
        >
          Rename
        </button>
      </div>

      <!-- Inline Rename Field (if editing) -->
      <div v-if="editingName && activeMaterial" class="flex items-center gap-1.5 pt-0.5">
        <input 
          v-model="matNameInput"
          @blur="commitRename"
          @keydown.enter="commitRename"
          class="flex-1 bg-ui-surface text-ui-textPrimary px-2 py-0.5 rounded-xs font-mono text-xs border border-amber-500 focus:outline-none"
          autoFocus
        />
        <button @click="commitRename" class="px-2 py-0.5 bg-amber-600 text-slate-950 rounded-xs text-[10px] font-bold cursor-pointer">Done</button>
      </div>

      <!-- Row 3: Scene Materials Swatch Gallery -->
      <div class="space-y-1">
        <div class="flex items-center justify-between text-[9px] text-ui-textMuted uppercase font-semibold">
          <span>Project Materials ({{ projectStore.materials.length }})</span>
          <span class="font-mono text-amber-300/80">Click to Select</span>
        </div>
        <div class="grid grid-cols-4 gap-1 max-h-20 overflow-y-auto custom-scrollbar p-0.5 bg-ui-input/40 rounded-xs border border-ui-borderSubtle">
          <button 
            v-for="mat in projectStore.materials" 
            :key="mat.id"
            @click="selectedMaterialId = mat.id"
            class="p-1 rounded-xs border transition cursor-pointer flex items-center gap-1.5 text-left truncate"
            :class="selectedMaterialId === mat.id ? 'bg-amber-500/20 text-amber-300 border-amber-500/60 shadow-xs font-bold' : 'bg-ui-surface text-ui-textSecondary border-ui-borderSubtle hover:bg-ui-hover'"
            :title="`${mat.name} (${mat.shading.toUpperCase()})`"
          >
            <span class="w-2.5 h-2.5 rounded-full border border-black/40 shadow-2xs shrink-0" :style="{ backgroundColor: mat.color }"></span>
            <span class="truncate text-[9px]">{{ mat.name }}</span>
          </button>
        </div>
      </div>

      <!-- Row 4: Apply to Active / Selected Object Buttons & Make Unique -->
      <div class="grid grid-cols-2 gap-1 pt-0.5">
        <button 
          @click="assignToActiveMesh"
          :disabled="isAssignedToActiveMesh"
          class="py-1 px-1.5 rounded-xs text-[10px] font-bold border transition flex items-center justify-center gap-1 cursor-pointer"
          :class="isAssignedToActiveMesh ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50' : 'bg-ui-surface hover:bg-ui-hover text-ui-textPrimary border-ui-borderSubtle'"
          :title="isAssignedToActiveMesh ? 'Currently assigned to active mesh' : 'Apply this material to the active mesh'"
        >
          <Check v-if="isAssignedToActiveMesh" class="w-3 h-3 text-emerald-400" />
          <span>{{ isAssignedToActiveMesh ? 'Applied to Active' : 'Apply to Active' }}</span>
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

      <!-- Shared Material Fork Notice / 1-Click Make Unique -->
      <div v-if="isMaterialShared && activeMesh" class="flex items-center justify-between p-1.5 bg-amber-500/10 border border-amber-500/30 rounded-xs text-[10px]">
        <span class="text-amber-300 font-medium">Shared by multiple objects</span>
        <button 
          @click="handleMakeMaterialUnique"
          class="px-2 py-0.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xs shadow-xs transition cursor-pointer"
          title="Fork this material into a unique instance for this object"
        >
          Make Unique
        </button>
      </div>
    </div>

    <!-- 2. 5-TAB WORKFLOW NAVIGATION STRIP -->
    <div class="grid grid-cols-5 gap-1 p-0.5 bg-ui-input/70 rounded-xs border border-ui-borderSubtle text-[9.5px]">
      <button 
        @click="activeCategory = 'surface'"
        class="py-1 rounded-xs font-bold transition text-center cursor-pointer border"
        :class="activeCategory === 'surface' ? 'bg-sky-500/20 text-sky-300 border-sky-500/50 shadow-xs' : 'bg-ui-surface text-ui-textMuted border-ui-borderSubtle hover:text-ui-textPrimary hover:bg-ui-hover'"
      >
        Surface
      </button>
      <button 
        @click="activeCategory = 'consoles'"
        class="py-1 rounded-xs font-bold transition text-center cursor-pointer border"
        :class="activeCategory === 'consoles' ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 shadow-xs' : 'bg-ui-surface text-ui-textMuted border-ui-borderSubtle hover:text-ui-textPrimary hover:bg-ui-hover'"
      >
        Consoles
      </button>
      <button 
        @click="activeCategory = 'dithering'"
        class="py-1 rounded-xs font-bold transition text-center cursor-pointer border"
        :class="activeCategory === 'dithering' ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-xs' : 'bg-ui-surface text-ui-textMuted border-ui-borderSubtle hover:text-ui-textPrimary hover:bg-ui-hover'"
      >
        Dither
      </button>
      <button 
        @click="activeCategory = 'palettes'"
        class="py-1 rounded-xs font-bold transition text-center cursor-pointer border"
        :class="activeCategory === 'palettes' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-xs' : 'bg-ui-surface text-ui-textMuted border-ui-borderSubtle hover:text-ui-textPrimary hover:bg-ui-hover'"
      >
        Palettes
      </button>
      <button 
        @click="activeCategory = 'gradients'"
        class="py-1 rounded-xs font-bold transition text-center cursor-pointer border"
        :class="activeCategory === 'gradients' ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50 shadow-xs' : 'bg-ui-surface text-ui-textMuted border-ui-borderSubtle hover:text-ui-textPrimary hover:bg-ui-hover'"
      >
        Gradients
      </button>
    </div>

    <!-- ==================================================== -->
    <!-- TAB 1: SURFACE & PBR SHADING                         -->
    <!-- ==================================================== -->
    <div v-show="activeCategory === 'surface' || activeCategory === 'all'" class="space-y-2">
      <!-- Shader Model Card -->
      <div class="p-2 bg-ui-input/40 rounded-xs border border-ui-borderSubtle space-y-1.5">
        <label class="text-[10px] font-semibold text-ui-textMuted uppercase">Shader Model</label>
        <select 
          v-if="activeMaterial"
          v-model="activeMaterial.shading"
          class="w-full bg-ui-surface border border-ui-borderDefault rounded-xs px-2 py-1 text-ui-textPrimary text-[11px] focus:outline-none focus:border-ui-accent cursor-pointer font-bold"
        >
          <option value="pbr">PBR Standard (Lit Metallic / Roughness)</option>
          <option value="psx">PlayStation 1 (Affine + Jitter + 15-Bit Dither)</option>
          <option value="saturn">Sega Saturn (VDP1 Quads + Mesh Alpha + Gouraud)</option>
          <option value="dreamcast">Sega Dreamcast (PowerVR VQ + Specular + Cel)</option>
          <option value="n64">Nintendo 64 (RDP 3-Point Bilinear + TMEM)</option>
          <option value="textured">Textured Low-Poly (Clean Unlit Retro)</option>
          <option value="flat">Flat Shading (Faceted Low-Poly Normals)</option>
          <option value="gouraud">Gouraud (Vertex Normals Smooth)</option>
          <option value="unlit">Constant Unlit (Pure Color Flat)</option>
        </select>
      </div>

      <!-- Texture Map Assignment Card -->
      <div v-if="activeMaterial" class="p-2 bg-ui-input/40 rounded-xs border border-ui-borderSubtle space-y-2">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1.5 text-[10px] font-semibold text-ui-textMuted uppercase">
            <ImageIcon class="w-3.5 h-3.5 text-sky-400" />
            <span>Texture Map</span>
          </div>
          <span v-if="activeMaterial.textureId" class="text-[9px] font-mono text-amber-300">
            {{ projectStore.textures.find(t => t.id === activeMaterial.textureId)?.width || 64 }}x{{ projectStore.textures.find(t => t.id === activeMaterial.textureId)?.height || 64 }}px
          </span>
          <span v-else class="text-[9px] text-ui-textMuted italic">No Texture (Solid Color)</span>
        </div>

        <div class="flex items-center gap-1.5">
          <select 
            :value="activeMaterial.textureId || ''"
            @change="activeMaterial.textureId = ($event.target as HTMLSelectElement).value || null; projectStore.markGeometryUpdated()"
            class="flex-1 bg-ui-surface border border-ui-borderDefault rounded-xs px-2 py-1 text-sky-300 font-mono text-[11px] focus:outline-none focus:border-ui-accent cursor-pointer font-bold truncate"
          >
            <option value="">[ None - Solid Color ]</option>
            <option v-for="tex in projectStore.textures" :key="tex.id" :value="tex.id">
              {{ tex.name }} ({{ tex.width }}x{{ tex.height }})
            </option>
          </select>

          <button 
            @click="showCreateTexModal = true"
            class="px-2 py-1 rounded-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/50 transition text-[10px] font-bold cursor-pointer flex items-center gap-1 shrink-0"
            title="Create new texture"
          >
            <Plus class="w-3 h-3" /> New
          </button>
        </div>

        <!-- Visual Scene Textures Strip -->
        <div class="space-y-1">
          <div class="text-[9px] text-ui-textMuted uppercase font-semibold">Scene Textures (Click to Assign)</div>
          <div class="grid grid-cols-4 gap-1 max-h-24 overflow-y-auto custom-scrollbar p-1 bg-ui-surface rounded-xs border border-ui-borderSubtle">
            <button 
              v-for="tex in projectStore.textures" 
              :key="tex.id"
              @click="activeMaterial.textureId = tex.id; projectStore.markGeometryUpdated()"
              class="p-1 rounded-xs border transition cursor-pointer flex flex-col items-center gap-1 text-center"
              :class="activeMaterial.textureId === tex.id ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-xs font-bold' : 'bg-ui-input/50 border-ui-borderSubtle hover:bg-ui-hover text-ui-textSecondary'"
              :title="`Assign ${tex.name} (${tex.width}x${tex.height})`"
            >
              <div class="w-8 h-8 rounded-xs overflow-hidden bg-black/40 border border-black/30 flex items-center justify-center">
                <img v-if="tex.dataUrl" :src="tex.dataUrl" class="w-full h-full object-cover pixelated" />
                <span v-else class="text-[8px] font-mono opacity-50">{{ tex.width }}</span>
              </div>
              <span class="text-[8.5px] truncate max-w-[50px] font-mono leading-none">{{ tex.name }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Base Color & Tint Card -->
      <div v-if="activeMaterial" class="p-2 bg-ui-input/40 rounded-xs border border-ui-borderSubtle space-y-1.5">
        <div class="text-[10px] font-semibold text-ui-textMuted uppercase">Base Tint Color</div>
        <div class="flex items-center gap-2 bg-ui-surface p-1.5 rounded-xs border border-ui-borderSubtle">
          <input 
            type="color" 
            v-model="activeMaterial.color"
            @change="projectStore.markGeometryUpdated()"
            class="w-6 h-6 rounded-xs cursor-pointer border border-ui-borderDefault bg-transparent p-0 shrink-0 shadow-xs" 
          />
          <div class="flex-1 flex items-center justify-between">
            <div class="flex flex-col">
              <span class="text-ui-textMuted text-[9.5px]">Hex Color</span>
              <span class="font-mono text-ui-textPrimary text-[11px] font-bold uppercase">{{ activeMaterial.color }}</span>
            </div>
            <button 
              @click="clearMaterialTint"
              class="px-2 py-0.5 bg-ui-input hover:bg-ui-hover text-ui-textSecondary hover:text-white border border-ui-borderSubtle rounded-xs text-[10px] font-medium transition cursor-pointer"
              title="Reset tint to pure white"
            >
              Reset White
            </button>
          </div>
        </div>
      </div>

      <!-- Quick Material Presets Shelf -->
      <div class="p-2 bg-ui-input/40 rounded-xs border border-ui-borderSubtle space-y-1.5">
        <div class="flex items-center justify-between">
          <span class="text-[10px] font-semibold text-ui-textMuted uppercase">Quick Presets</span>
          <span class="text-[8.5px] text-ui-textMuted font-mono">1-Click</span>
        </div>
        <!-- Filter Pills -->
        <div class="flex items-center gap-1 overflow-x-auto pb-0.5 text-[9px] custom-scrollbar">
          <button 
            v-for="cat in presetCategories" 
            :key="cat"
            @click="selectedPresetCategory = cat"
            class="px-1.5 py-0.5 rounded-xs border shrink-0 transition cursor-pointer"
            :class="selectedPresetCategory === cat ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-bold' : 'bg-ui-surface text-ui-textSecondary border-ui-borderSubtle hover:bg-ui-hover'"
          >
            {{ cat }}
          </button>
        </div>
        <!-- Preset Chips -->
        <div class="grid grid-cols-4 gap-1">
          <button 
            v-for="preset in filteredPresets" 
            :key="preset.name"
            @click="applyMaterialPreset(preset)"
            class="py-1 px-1 bg-ui-surface hover:bg-ui-hover border border-ui-borderSubtle hover:border-amber-500/50 rounded-xs text-[9.5px] font-medium text-ui-textSecondary hover:text-ui-textPrimary flex flex-col items-center gap-1 transition cursor-pointer"
            :title="`${preset.name} (${preset.shading.toUpperCase()})`"
          >
            <span class="w-3 h-3 rounded-full border border-black/40 shadow-2xs shrink-0" :style="{ backgroundColor: preset.color }"></span>
            <span class="truncate w-full text-center">{{ preset.label }}</span>
          </button>
        </div>
      </div>

      <!-- PBR Properties Card (Active when PBR/lit) -->
      <div v-if="activeMaterial && ['pbr', 'textured', 'flat', 'gouraud'].includes(activeMaterial.shading)" class="p-2 bg-ui-input/40 rounded-xs border border-ui-borderSubtle space-y-2">
        <div class="text-[10px] font-semibold text-ui-textMuted uppercase">Surface & Lighting</div>

        <!-- Roughness Slider -->
        <div class="space-y-1">
          <div class="flex items-center justify-between text-[10px]">
            <span class="text-ui-textSecondary font-medium">Roughness:</span>
            <span class="font-mono text-amber-400 font-bold">{{ ((activeMaterial.roughness ?? 0.7) * 100).toFixed(0) }}%</span>
          </div>
          <input 
            type="range" 
            min="0" 
            max="1" 
            step="0.01" 
            v-model.number="activeMaterial.roughness" 
            class="w-full accent-amber-500 bg-ui-input h-1 rounded cursor-pointer" 
          />
          <div class="flex justify-between gap-1 text-[8.5px] text-ui-textMuted font-mono pt-0.5">
            <button @click="activeMaterial.roughness = 0.05" class="hover:text-amber-300">Glossy (5%)</button>
            <button @click="activeMaterial.roughness = 0.3" class="hover:text-amber-300">Plastic (30%)</button>
            <button @click="activeMaterial.roughness = 0.7" class="hover:text-amber-300">Satin (70%)</button>
            <button @click="activeMaterial.roughness = 0.95" class="hover:text-amber-300">Chalk (95%)</button>
          </div>
        </div>

        <!-- Metalness Slider -->
        <div class="space-y-1 pt-1 border-t border-ui-borderSubtle">
          <div class="flex items-center justify-between text-[10px]">
            <span class="text-ui-textSecondary font-medium">Metallic:</span>
            <span class="font-mono text-sky-400 font-bold">{{ ((activeMaterial.metalness ?? 0.05) * 100).toFixed(0) }}%</span>
          </div>
          <input 
            type="range" 
            min="0" 
            max="1" 
            step="0.01" 
            v-model.number="activeMaterial.metalness" 
            class="w-full accent-sky-500 bg-ui-input h-1 rounded cursor-pointer" 
          />
          <div class="flex justify-between gap-1 text-[8.5px] text-ui-textMuted font-mono pt-0.5">
            <button @click="activeMaterial.metalness = 0.0" class="hover:text-sky-300">Dielectric (0%)</button>
            <button @click="activeMaterial.metalness = 0.5" class="hover:text-sky-300">Semi (50%)</button>
            <button @click="activeMaterial.metalness = 0.9" class="hover:text-sky-300">Chrome (90%)</button>
            <button @click="activeMaterial.metalness = 1.0" class="hover:text-sky-300">Pure (100%)</button>
          </div>
        </div>

        <!-- Emissive Glow Controls -->
        <div class="space-y-1 pt-1.5 border-t border-ui-borderSubtle">
          <div class="flex items-center justify-between">
            <span class="text-[10px] text-ui-textSecondary font-medium">Emissive / Glow</span>
            <span class="text-[9px] font-mono text-emerald-400 font-bold">{{ (activeMaterial.emissiveIntensity || 0).toFixed(1) }}x</span>
          </div>
          <div class="flex items-center gap-1.5 bg-ui-surface p-1 rounded-xs border border-ui-borderSubtle">
            <input 
              type="color" 
              v-model="activeMaterial.emissive" 
              class="w-4 h-4 rounded-xs cursor-pointer border border-ui-borderDefault bg-transparent p-0 shrink-0" 
            />
            <input 
              type="range" 
              min="0" 
              max="5" 
              step="0.1" 
              v-model.number="activeMaterial.emissiveIntensity" 
              class="flex-1 accent-emerald-500 bg-ui-input h-1 rounded cursor-pointer" 
            />
          </div>
        </div>
      </div>

      <!-- Transparency & Alpha Card -->
      <div v-if="activeMaterial" class="p-2 bg-ui-input/40 rounded-xs border border-ui-borderSubtle space-y-2">
        <div class="text-[10px] font-semibold text-ui-textMuted uppercase">Transparency & Alpha</div>
        
        <!-- Opacity Slider -->
        <div class="space-y-1">
          <div class="flex items-center justify-between text-[10px]">
            <span class="text-ui-textSecondary font-medium">Opacity:</span>
            <span class="font-mono text-ui-textAccent font-bold">{{ Math.round((activeMaterial.opacity ?? 1.0) * 100) }}%</span>
          </div>
          <input 
            type="range" 
            min="0" 
            max="1" 
            step="0.01" 
            v-model.number="activeMaterial.opacity" 
            class="w-full accent-ui-accent bg-ui-surface h-1 rounded cursor-pointer" 
          />
        </div>

        <!-- Blend Mode -->
        <div class="grid grid-cols-2 gap-1.5">
          <div>
            <label class="text-[9px] text-ui-textMuted block mb-0.5">Blend Mode:</label>
            <select 
              v-model="activeMaterial.blendMode"
              class="w-full bg-ui-surface border border-ui-borderSubtle rounded-xs px-1.5 py-0.5 text-ui-textPrimary text-[10px] focus:outline-none cursor-pointer"
            >
              <option value="opaque">Opaque (Solid)</option>
              <option value="mask">Alpha Clip (Cutout)</option>
              <option value="blend">Alpha Blend (Glass)</option>
              <option value="additive">Additive (Glow/Fire)</option>
            </select>
          </div>
          <div>
            <label class="text-[9px] text-ui-textMuted block mb-0.5">Alpha Cutoff:</label>
            <input 
              type="range" 
              min="0" 
              max="1" 
              step="0.05" 
              v-model.number="activeMaterial.alphaTest"
              :disabled="activeMaterial.blendMode !== 'mask'"
              class="w-full accent-amber-500 bg-ui-surface h-1 rounded cursor-pointer disabled:opacity-30 mt-1.5" 
            />
          </div>
        </div>
      </div>

      <!-- Geometry & Rendering Card -->
      <div v-if="activeMaterial" class="p-2 bg-ui-input/40 rounded-xs border border-ui-borderSubtle space-y-1.5">
        <div class="text-[10px] font-semibold text-ui-textMuted uppercase">Render Options</div>
        <label class="flex items-center justify-between cursor-pointer bg-ui-surface p-1.5 rounded-xs border border-ui-borderSubtle hover:border-ui-borderDefault transition">
          <span class="text-ui-textSecondary text-[10.5px]">Double-Sided Rendering</span>
          <input 
            type="checkbox" 
            v-model="activeMaterial.doubleSided" 
            class="rounded-xs text-ui-accent bg-ui-panel border-ui-borderDefault focus:ring-0 cursor-pointer" 
          />
        </label>
        <label class="flex items-center justify-between cursor-pointer bg-ui-surface p-1.5 rounded-xs border border-ui-borderSubtle hover:border-ui-borderDefault transition">
          <span class="text-ui-textSecondary text-[10.5px]">Wireframe Overlay Lines</span>
          <input 
            type="checkbox" 
            v-model="activeMaterial.wireframe" 
            class="rounded-xs text-ui-accent bg-ui-panel border-ui-borderDefault focus:ring-0 cursor-pointer" 
          />
        </label>
      </div>
    </div>

    <!-- ==================================================== -->
    <!-- TAB 2: CONSOLES & HARDWARE EMULATION                 -->
    <!-- ==================================================== -->
    <div v-show="activeCategory === 'consoles' || activeCategory === 'all'" class="space-y-2">
      <!-- 1-Click Console Hero Selector Cards -->
      <div class="p-2 bg-ui-input/40 rounded-xs border border-ui-borderSubtle space-y-1.5">
        <div class="text-[10px] font-semibold text-ui-textMuted uppercase">1-Click Hardware Profile</div>
        <div class="grid grid-cols-4 gap-1">
          <button 
            @click="applyConsoleProfile('psx')"
            class="py-1.5 px-1 rounded-xs border text-center transition cursor-pointer flex flex-col items-center gap-0.5"
            :class="activeMaterial?.shading === 'psx' ? 'bg-rose-500/20 text-rose-300 border-rose-500/60 font-bold shadow-xs' : 'bg-ui-surface text-ui-textSecondary border-ui-borderSubtle hover:bg-ui-hover'"
          >
            <span class="text-[10px] font-bold">PS1</span>
            <span class="text-[7.5px] text-ui-textMuted">RGB555</span>
          </button>
          <button 
            @click="applyConsoleProfile('saturn')"
            class="py-1.5 px-1 rounded-xs border text-center transition cursor-pointer flex flex-col items-center gap-0.5"
            :class="activeMaterial?.shading === 'saturn' ? 'bg-sky-500/20 text-sky-300 border-sky-500/60 font-bold shadow-xs' : 'bg-ui-surface text-ui-textSecondary border-ui-borderSubtle hover:bg-ui-hover'"
          >
            <span class="text-[10px] font-bold">Saturn</span>
            <span class="text-[7.5px] text-ui-textMuted">VDP1</span>
          </button>
          <button 
            @click="applyConsoleProfile('dreamcast')"
            class="py-1.5 px-1 rounded-xs border text-center transition cursor-pointer flex flex-col items-center gap-0.5"
            :class="activeMaterial?.shading === 'dreamcast' ? 'bg-amber-500/20 text-amber-300 border-amber-500/60 font-bold shadow-xs' : 'bg-ui-surface text-ui-textSecondary border-ui-borderSubtle hover:bg-ui-hover'"
          >
            <span class="text-[10px] font-bold">Dreamcast</span>
            <span class="text-[7.5px] text-ui-textMuted">PowerVR</span>
          </button>
          <button 
            @click="applyConsoleProfile('n64')"
            class="py-1.5 px-1 rounded-xs border text-center transition cursor-pointer flex flex-col items-center gap-0.5"
            :class="activeMaterial?.shading === 'n64' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/60 font-bold shadow-xs' : 'bg-ui-surface text-ui-textSecondary border-ui-borderSubtle hover:bg-ui-hover'"
          >
            <span class="text-[10px] font-bold">N64</span>
            <span class="text-[7.5px] text-ui-textMuted">RDP</span>
          </button>
        </div>
      </div>

      <!-- PlayStation 1 Panel -->
      <div v-if="activeMaterial && activeMaterial.shading === 'psx'" class="p-2 bg-rose-950/20 rounded-xs border border-rose-500/30 space-y-1.5">
        <div class="text-[9.5px] font-bold text-rose-300 uppercase">Sony PlayStation 1 Controls</div>
        <label class="flex items-center justify-between cursor-pointer bg-ui-surface p-1.5 rounded-xs border border-ui-borderSubtle hover:border-ui-borderDefault transition">
          <span class="text-ui-textSecondary text-[10.5px]">Fixed-Point Vertex Jitter</span>
          <input 
            type="checkbox" 
            v-model="activeMaterial.psxJitter"
            @change="projectStore.markGeometryUpdated()"
            class="rounded-xs text-rose-500 bg-ui-panel border-ui-borderDefault focus:ring-0 cursor-pointer" 
          />
        </label>
        <label class="flex items-center justify-between cursor-pointer bg-ui-surface p-1.5 rounded-xs border border-ui-borderSubtle hover:border-ui-borderDefault transition">
          <span class="text-ui-textSecondary text-[10.5px]">Affine Texture Distortion</span>
          <input 
            type="checkbox" 
            v-model="activeMaterial.psxAffine"
            @change="projectStore.markGeometryUpdated()"
            class="rounded-xs text-rose-500 bg-ui-panel border-ui-borderDefault focus:ring-0 cursor-pointer" 
          />
        </label>
        <label class="flex items-center justify-between cursor-pointer bg-ui-surface p-1.5 rounded-xs border border-ui-borderSubtle hover:border-ui-borderDefault transition">
          <span class="text-ui-textSecondary text-[10.5px]">15-Bit Bayer Hardware Dither</span>
          <input 
            type="checkbox" 
            v-model="activeMaterial.dither"
            @change="projectStore.markGeometryUpdated()"
            class="rounded-xs text-rose-500 bg-ui-panel border-ui-borderDefault focus:ring-0 cursor-pointer" 
          />
        </label>
      </div>

      <!-- Sega Saturn Panel -->
      <div v-if="activeMaterial && activeMaterial.shading === 'saturn'" class="p-2 bg-sky-950/20 rounded-xs border border-sky-500/30 space-y-1.5">
        <div class="text-[9.5px] font-bold text-sky-300 uppercase">Sega Saturn (VDP1 / VDP2)</div>
        <label class="flex items-center justify-between cursor-pointer bg-ui-surface p-1.5 rounded-xs border border-ui-borderSubtle hover:border-ui-borderDefault transition">
          <span class="text-ui-textSecondary text-[10.5px]">VDP1 Mesh Alpha Dropouts</span>
          <input 
            type="checkbox" 
            v-model="activeMaterial.saturnMeshAlpha"
            @change="projectStore.markGeometryUpdated()"
            class="rounded-xs text-sky-500 bg-ui-panel border-ui-borderDefault focus:ring-0 cursor-pointer" 
          />
        </label>
        <label class="flex items-center justify-between cursor-pointer bg-ui-surface p-1.5 rounded-xs border border-ui-borderSubtle hover:border-ui-borderDefault transition">
          <span class="text-ui-textSecondary text-[10.5px]">Forward Quad Mapping (Affine)</span>
          <input 
            type="checkbox" 
            v-model="activeMaterial.psxAffine"
            @change="projectStore.markGeometryUpdated()"
            class="rounded-xs text-sky-500 bg-ui-panel border-ui-borderDefault focus:ring-0 cursor-pointer" 
          />
        </label>
      </div>

      <!-- Sega Dreamcast Panel -->
      <div v-if="activeMaterial && activeMaterial.shading === 'dreamcast'" class="p-2 bg-amber-950/20 rounded-xs border border-amber-500/30 space-y-1.5">
        <div class="text-[9.5px] font-bold text-amber-300 uppercase">Sega Dreamcast (PowerVR CLX2)</div>
        <label class="flex items-center justify-between cursor-pointer bg-ui-surface p-1.5 rounded-xs border border-ui-borderSubtle hover:border-ui-borderDefault transition">
          <span class="text-ui-textSecondary text-[10.5px]">PowerVR VQ Texture Compression</span>
          <input 
            type="checkbox" 
            v-model="activeMaterial.dreamcastVQ"
            @change="projectStore.markGeometryUpdated()"
            class="rounded-xs text-amber-500 bg-ui-panel border-ui-borderDefault focus:ring-0 cursor-pointer" 
          />
        </label>
        <label class="flex items-center justify-between cursor-pointer bg-ui-surface p-1.5 rounded-xs border border-ui-borderSubtle hover:border-ui-borderDefault transition">
          <span class="text-ui-textSecondary text-[10.5px]">Arcade Specular Highlight Sheen</span>
          <input 
            type="checkbox" 
            v-model="activeMaterial.dreamcastSpecular"
            @change="projectStore.markGeometryUpdated()"
            class="rounded-xs text-amber-500 bg-ui-panel border-ui-borderDefault focus:ring-0 cursor-pointer" 
          />
        </label>
        <label class="flex items-center justify-between cursor-pointer bg-ui-surface p-1.5 rounded-xs border border-ui-borderSubtle hover:border-ui-borderDefault transition">
          <span class="text-ui-textSecondary text-[10.5px]">Jet Set Radio Cel Outline</span>
          <input 
            type="checkbox" 
            v-model="activeMaterial.dreamcastCelOutline"
            @change="projectStore.markGeometryUpdated()"
            class="rounded-xs text-amber-500 bg-ui-panel border-ui-borderDefault focus:ring-0 cursor-pointer" 
          />
        </label>
      </div>

      <!-- Global CRT Filter -->
      <div class="p-2 bg-ui-input/40 rounded-xs border border-ui-borderSubtle space-y-1.5">
        <label class="flex items-center justify-between cursor-pointer bg-ui-surface p-1.5 rounded-xs border border-ui-borderSubtle hover:border-ui-borderDefault transition">
          <span class="text-ui-textSecondary text-[10.5px] flex items-center gap-1.5">
            <Tv class="w-3.5 h-3.5 text-ui-textMuted" />
            <span>Global CRT Scanlines Filter</span>
          </span>
          <input 
            type="checkbox" 
            v-model="toolStore.viewport.crtFilter" 
            class="rounded-xs text-ui-accent bg-ui-panel border-ui-borderDefault focus:ring-0 cursor-pointer" 
          />
        </label>
      </div>
    </div>

    <!-- ==================================================== -->
    <!-- TAB 3: DITHERING ENGINE                              -->
    <!-- ==================================================== -->
    <div v-show="activeCategory === 'dithering' || activeCategory === 'all'" class="space-y-2">
      <div v-if="activeMaterial" class="p-2 bg-ui-input/40 rounded-xs border border-ui-borderSubtle space-y-2">
        <!-- Dither Toggle Row -->
        <div class="flex items-center justify-between">
          <label class="flex items-center gap-1.5 text-[10.5px] font-semibold text-ui-textPrimary cursor-pointer">
            <input 
              type="checkbox" 
              v-model="activeMaterial.dither"
              @change="projectStore.markGeometryUpdated()"
              class="rounded-xs text-amber-500 bg-ui-panel border-ui-borderDefault focus:ring-0 cursor-pointer" 
            />
            <span class="flex items-center gap-1">
              <Sparkles class="w-3 h-3 text-amber-400" />
              <span>Enable GPU Dithering</span>
            </span>
          </label>
          <span class="text-[9px] font-mono font-bold text-amber-400" v-if="activeMaterial.dither">LIVE GPU</span>
        </div>

        <div v-if="activeMaterial.dither" class="space-y-2 pt-1 border-t border-ui-borderSubtle">
          <!-- Live Preview Canvas -->
          <div class="space-y-1">
            <div class="flex items-center justify-between text-[9px] text-amber-300 font-bold uppercase">
              <span>Live Matrix Dither Preview</span>
              <span class="text-[8px] text-ui-textMuted font-mono">Sphere & Ramp</span>
            </div>
            <canvas 
              ref="ditherPreviewCanvasRef" 
              width="280" 
              height="80" 
              class="w-full h-20 rounded-xs border border-ui-borderSubtle bg-black block shadow-inner"
            ></canvas>
          </div>

          <!-- 1-Click Dither Presets Shelf -->
          <div class="space-y-1 pt-1 border-t border-ui-borderSubtle">
            <div class="flex items-center justify-between text-[9px] text-ui-textMuted font-semibold uppercase">
              <span>1-Click Dither Presets</span>
              <span class="text-[8px] font-mono text-amber-400">Presets</span>
            </div>
            <div class="grid grid-cols-3 gap-1">
              <button 
                v-for="dp in DITHER_PRESETS" 
                :key="dp.id"
                @click="applyDitherPreset(dp)"
                class="p-1 rounded-xs bg-ui-surface hover:bg-ui-hover border border-ui-borderSubtle hover:border-amber-400 text-left transition cursor-pointer flex flex-col"
                :title="dp.description"
              >
                <span class="text-[9px] font-bold text-ui-textPrimary truncate">{{ dp.name }}</span>
                <span class="text-[7.5px] font-mono text-ui-textMuted uppercase truncate">{{ dp.pattern }} · {{ dp.colorDepth ? dp.colorDepth + 'lv' : '24b' }}</span>
              </button>
            </div>
          </div>

          <!-- Matrix Pattern Selector -->
          <div class="space-y-1 pt-1 border-t border-ui-borderSubtle">
            <label class="text-[9.5px] text-ui-textSecondary font-medium">Matrix Pattern:</label>
            <select 
              v-model="activeMaterial.ditherPattern"
              @change="projectStore.markGeometryUpdated(); updateDitherPreview()"
              class="w-full bg-ui-surface border border-ui-borderSubtle rounded-xs px-2 py-1 text-ui-textPrimary text-[10px] focus:outline-none cursor-pointer font-medium"
            >
              <option value="bayer4x4">4x4 Bayer Matrix (PS1 Retro Standard)</option>
              <option value="bayer8x8">8x8 Bayer Matrix (Fine Smooth Grain)</option>
              <option value="bayer2x2">2x2 Bayer Matrix (Coarse Chaff / PC-98)</option>
              <option value="bayer16x16">16x16 Bayer Matrix (Ultra-Smooth 256-Level)</option>
              <option value="bluenoise">Blue Noise Stochastic (Film Grain Anti-Banding)</option>
              <option value="halftone">Manga Screen Tone (Clustered Dots)</option>
              <option value="crosshatch">Comic Crosshatch (45° Diagonal Etching)</option>
              <option value="horizontal_lines">Interlaced Scanlines (Retro CRT TV)</option>
              <option value="vertical_lines">Aperture Grille (Arcade CRT Striping)</option>
              <option value="checker">Checkerboard 50% (Crosshatch Weave)</option>
              <option value="noise">Film Grain Stochastic (Random Noise)</option>
            </select>
          </div>

          <!-- Coordinate Space & Target Channel -->
          <div class="grid grid-cols-2 gap-1.5 pt-1">
            <div class="space-y-0.5">
              <label class="text-[9px] text-ui-textMuted font-medium">Coordinate Space:</label>
              <select 
                v-model="activeMaterial.ditherSpace"
                @change="projectStore.markGeometryUpdated()"
                class="w-full bg-ui-surface border border-ui-borderSubtle rounded-xs px-1.5 py-0.5 text-ui-textPrimary text-[9.5px] focus:outline-none cursor-pointer"
              >
                <option value="screen">Screen Space (Lens)</option>
                <option value="uv">UV Surface (Mesh)</option>
                <option value="world">World Triplanar</option>
              </select>
            </div>
            <div class="space-y-0.5">
              <label class="text-[9px] text-ui-textMuted font-medium">Target Channel:</label>
              <select 
                v-model="activeMaterial.ditherChannel"
                @change="projectStore.markGeometryUpdated(); updateDitherPreview()"
                class="w-full bg-ui-surface border border-ui-borderSubtle rounded-xs px-1.5 py-0.5 text-ui-textPrimary text-[9.5px] focus:outline-none cursor-pointer"
              >
                <option value="rgb">All RGB Channels</option>
                <option value="luma">Luma (Hue Pure)</option>
                <option value="alpha">Screen-Door Alpha</option>
              </select>
            </div>
          </div>

          <!-- Dither Strength & Color Depth -->
          <div class="space-y-1 pt-1">
            <div class="flex items-center justify-between text-[9.5px]">
              <span class="text-ui-textSecondary font-medium">Dither Strength:</span>
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

          <div class="space-y-1">
            <div class="flex items-center justify-between text-[9.5px]">
              <span class="text-ui-textSecondary font-medium">Color Depth Quantizer:</span>
              <span class="font-mono text-ui-textAccent text-[9px]">{{ activeMaterial.colorDepth ? activeMaterial.colorDepth + ' Levels' : '24-Bit Smooth' }}</span>
            </div>
            <select 
              v-model.number="activeMaterial.colorDepth"
              @change="projectStore.markGeometryUpdated(); updateDitherPreview()"
              class="w-full bg-ui-surface border border-ui-borderSubtle rounded-xs px-2 py-1 text-ui-textPrimary text-[10px] focus:outline-none cursor-pointer font-medium"
            >
              <option :value="32">15-Bit PSX RGB555 (32 levels per channel)</option>
              <option :value="16">12-Bit Retro (16 levels per channel)</option>
              <option :value="8">8-Bit Low-Fi (8 levels per channel)</option>
              <option :value="4">4-Bit Extreme Posterize (4 levels)</option>
              <option :value="2">1-Bit / 2-Tone High Contrast (2 levels)</option>
              <option :value="0">Full 24-Bit TrueColor (Smooth)</option>
            </select>
          </div>

          <!-- 2D Texture Image Error Diffusion Actions -->
          <div class="pt-1.5 border-t border-ui-borderSubtle space-y-1">
            <div class="flex items-center justify-between text-[9px] text-ui-textMuted font-semibold uppercase">
              <span>2D Texture Palette Dither</span>
              <span class="font-mono text-[8px] text-indigo-300">Bake to Map</span>
            </div>
            <div class="grid grid-cols-2 gap-1">
              <button 
                @click="ditherActiveTextureImage('floyd')"
                class="py-1 px-1.5 bg-ui-surface hover:bg-ui-hover border border-ui-borderSubtle hover:border-indigo-400 text-ui-textSecondary hover:text-white rounded-xs text-[9px] font-medium transition cursor-pointer flex flex-col items-center"
                title="Convert entire texture using Floyd-Steinberg error diffusion against active palette"
              >
                <span class="font-bold">Floyd-Steinberg</span>
                <span class="text-[7.5px] text-ui-textMuted">Smooth Diffusion</span>
              </button>
              <button 
                @click="ditherActiveTextureImage('atkinson')"
                class="py-1 px-1.5 bg-ui-surface hover:bg-ui-hover border border-ui-borderSubtle hover:border-indigo-400 text-ui-textSecondary hover:text-white rounded-xs text-[9px] font-medium transition cursor-pointer flex flex-col items-center"
                title="Convert entire texture using Atkinson dithering against active palette"
              >
                <span class="font-bold">Atkinson Dither</span>
                <span class="text-[7.5px] text-ui-textMuted">Crisp Edge 1-Bit</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ==================================================== -->
    <!-- TAB 4: PALETTES & COLOR HARMONIES                    -->
    <!-- ==================================================== -->
    <div v-show="activeCategory === 'palettes' || activeCategory === 'all'" class="space-y-2">
      <!-- Quick Color Adjustments Card -->
      <div class="p-2 bg-ui-input/40 rounded-xs border border-ui-borderSubtle space-y-1.5">
        <div class="text-[10px] font-semibold text-ui-textMuted uppercase">Color Adjustment Quick Filters</div>
        <div class="grid grid-cols-6 gap-1">
          <button 
            @click="adjustMaterialColor('brighten')"
            class="py-1 px-1 bg-ui-surface hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textPrimary border border-ui-borderSubtle rounded-xs text-[9px] font-mono transition text-center cursor-pointer"
            title="Brighten tint (+20%)"
          >
            +Light
          </button>
          <button 
            @click="adjustMaterialColor('darken')"
            class="py-1 px-1 bg-ui-surface hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textPrimary border border-ui-borderSubtle rounded-xs text-[9px] font-mono transition text-center cursor-pointer"
            title="Darken tint (-20%)"
          >
            -Dark
          </button>
          <button 
            @click="adjustMaterialColor('warm')"
            class="py-1 px-1 bg-ui-surface hover:bg-ui-hover text-amber-300/90 hover:text-amber-200 border border-ui-borderSubtle rounded-xs text-[9px] font-mono transition text-center cursor-pointer"
            title="Shift warmth towards red/gold"
          >
            +Warm
          </button>
          <button 
            @click="adjustMaterialColor('cool')"
            class="py-1 px-1 bg-ui-surface hover:bg-ui-hover text-sky-300/90 hover:text-sky-200 border border-ui-borderSubtle rounded-xs text-[9px] font-mono transition text-center cursor-pointer"
            title="Shift temperature towards blue"
          >
            +Cool
          </button>
          <button 
            @click="adjustMaterialColor('grayscale')"
            class="py-1 px-1 bg-ui-surface hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textPrimary border border-ui-borderSubtle rounded-xs text-[9px] font-mono transition text-center cursor-pointer"
            title="Desaturate into pure grayscale"
          >
            Mono
          </button>
          <button 
            @click="adjustMaterialColor('invert')"
            class="py-1 px-1 bg-ui-surface hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textPrimary border border-ui-borderSubtle rounded-xs text-[9px] font-mono transition text-center cursor-pointer"
            title="Invert color RGB channels"
          >
            Invert
          </button>
        </div>
      </div>

      <!-- Palette Library Card -->
      <div class="p-2 bg-ui-input/40 rounded-xs border border-ui-borderSubtle space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-[10px] font-semibold text-ui-textMuted uppercase">Palette Sets Library</span>
          <button 
            @click="showNewPaletteDialog = !showNewPaletteDialog"
            class="px-1.5 py-0.5 rounded-xs bg-ui-surface hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textPrimary border border-ui-borderSubtle transition flex items-center gap-0.5 text-[9.5px] cursor-pointer"
            title="Create New Custom Color Set"
          >
            <Plus class="w-3 h-3 text-emerald-400" />
            <span>New Set</span>
          </button>
        </div>

        <!-- Inline New Palette Dialog -->
        <div v-if="showNewPaletteDialog" class="p-1.5 bg-ui-surface rounded-xs border border-ui-accent/40 space-y-1">
          <input 
            v-model="newPaletteName" 
            placeholder="Custom Palette Name..."
            @keydown.enter="createNewCustomPalette"
            class="w-full bg-ui-input text-ui-textPrimary px-1.5 py-0.5 rounded-xs font-mono text-[10.5px] border border-ui-borderSubtle focus:outline-none"
            autoFocus
          />
          <div class="flex justify-end gap-1">
            <button @click="showNewPaletteDialog = false" class="px-2 py-0.5 text-[9px] text-ui-textMuted hover:text-ui-textPrimary">Cancel</button>
            <button @click="createNewCustomPalette" class="px-2 py-0.5 bg-emerald-600 text-white rounded-xs text-[9px] font-bold">Create</button>
          </div>
        </div>

        <!-- Palette Category Filter Chips -->
        <div class="flex items-center gap-1 overflow-x-auto pb-0.5 text-[9px] custom-scrollbar">
          <button 
            v-for="cat in paletteCategories" 
            :key="cat"
            @click="selectedPaletteCategory = cat"
            class="px-1.5 py-0.5 rounded-xs border shrink-0 transition cursor-pointer"
            :class="selectedPaletteCategory === cat ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-bold' : 'bg-ui-surface text-ui-textSecondary border-ui-borderSubtle hover:bg-ui-hover'"
          >
            {{ cat }}
          </button>
        </div>

        <!-- Palette Selector & Swatches Matrix -->
        <div class="space-y-1.5 pt-1 border-t border-ui-borderSubtle">
          <div class="flex items-center gap-1">
            <select 
              v-model="selectedPaletteId"
              class="flex-1 bg-ui-surface border border-ui-borderSubtle rounded-xs px-2 py-1 text-ui-textPrimary text-[11px] focus:outline-none focus:border-ui-accent cursor-pointer font-medium"
            >
              <option v-for="pal in filteredPalettes" :key="pal.id" :value="pal.id">
                {{ pal.name }} ({{ pal.colors.length }})
              </option>
            </select>
            <button 
              v-if="activePalette.isCustom"
              @click="deleteCurrentCustomPalette"
              class="p-1 rounded-xs bg-ui-surface hover:bg-rose-950/40 text-ui-textMuted hover:text-rose-400 border border-ui-borderSubtle transition cursor-pointer"
              title="Delete Custom Color Set"
            >
              <Trash2 class="w-3 h-3" />
            </button>
          </div>

          <!-- Swatches Grid -->
          <div class="grid grid-cols-8 gap-1 p-1 bg-ui-surface rounded-xs border border-ui-borderSubtle max-h-36 overflow-y-auto custom-scrollbar">
            <button 
              v-for="(hex, idx) in activePalette.colors" 
              :key="`${hex}_${idx}`"
              @click="pickPaletteColor(hex)"
              class="w-full aspect-square rounded-2xs border transition cursor-pointer hover:scale-110 shadow-2xs"
              :class="activeMaterial?.color.toLowerCase() === hex.toLowerCase() ? 'border-white ring-1 ring-amber-400' : 'border-black/30 hover:border-white/80'"
              :style="{ backgroundColor: hex }"
              :title="hex"
            ></button>
          </div>

          <!-- Add Color to Set Button -->
          <button 
            @click="addCurrentColorToActivePalette"
            class="w-full py-1 bg-ui-surface hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textPrimary border border-ui-borderSubtle rounded-xs text-[10px] font-medium flex items-center justify-center gap-1 transition cursor-pointer"
            title="Add current material color to this palette"
          >
            <Plus class="w-3 h-3 text-amber-400" />
            <span>Add Active Tint ({{ activeMaterial?.color }}) to Palette</span>
          </button>
        </div>
      </div>
    </div>

    <!-- ==================================================== -->
    <!-- TAB 5: GRADIENTS & VERTEX BAKES                      -->
    <!-- ==================================================== -->
    <div v-show="activeCategory === 'gradients' || activeCategory === 'all'" class="space-y-2">
      <!-- Multi-Stop Gradient Designer Card -->
      <div class="p-2 bg-ui-input/40 rounded-xs border border-ui-borderSubtle space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-[10px] font-semibold text-ui-textMuted uppercase">Procedural Gradient</span>
          <div class="flex items-center gap-1">
            <button 
              @click="reverseGradientStops"
              class="p-0.5 px-1 bg-ui-surface hover:bg-ui-hover border border-ui-borderSubtle rounded-xs text-[9px] text-ui-textSecondary transition cursor-pointer"
              title="Reverse gradient stops"
            >
              <ArrowLeftRight class="w-2.5 h-2.5 inline mr-0.5" />
              <span>Flip</span>
            </button>
            <button 
              @click="showSaveGradientDialog = !showSaveGradientDialog"
              class="p-0.5 px-1 bg-ui-surface hover:bg-ui-hover border border-ui-borderSubtle rounded-xs text-[9px] text-ui-textSecondary transition cursor-pointer"
              title="Save gradient preset"
            >
              <Save class="w-2.5 h-2.5 inline mr-0.5 text-emerald-400" />
              <span>Save</span>
            </button>
          </div>
        </div>

        <!-- Inline Save Gradient Dialog -->
        <div v-if="showSaveGradientDialog" class="p-1.5 bg-ui-surface rounded-xs border border-ui-accent/40 space-y-1">
          <input 
            v-model="newGradientName" 
            placeholder="Preset Name..."
            @keydown.enter="saveCurrentGradient"
            class="w-full bg-ui-input text-ui-textPrimary px-1.5 py-0.5 rounded-xs font-mono text-[10.5px] border border-ui-borderSubtle focus:outline-none"
            autoFocus
          />
          <div class="flex justify-end gap-1">
            <button @click="showSaveGradientDialog = false" class="px-2 py-0.5 text-[9px] text-ui-textMuted">Cancel</button>
            <button @click="saveCurrentGradient" class="px-2 py-0.5 bg-emerald-600 text-white rounded-xs text-[9px] font-bold">Save</button>
          </div>
        </div>

        <!-- Gradient Presets Quick Chips -->
        <div class="flex items-center gap-1 overflow-x-auto pb-0.5 custom-scrollbar">
          <button 
            v-for="gp in allGradientPresets" 
            :key="gp.id"
            @click="applyGradientPreset(gp)"
            class="px-1.5 py-0.5 bg-ui-surface hover:bg-ui-hover border border-ui-borderSubtle rounded-xs text-[9px] font-medium text-ui-textSecondary hover:text-ui-textPrimary shrink-0 transition cursor-pointer flex items-center gap-1"
          >
            <span class="w-2.5 h-2.5 rounded-full border border-black/40 shrink-0" :style="{ background: `linear-gradient(to right, ${gp.stops[0].color}, ${gp.stops[gp.stops.length-1].color})` }"></span>
            <span>{{ gp.name }}</span>
          </button>
        </div>

        <!-- Interactive Multi-Stop Gradient Bar -->
        <div class="space-y-1 pt-1">
          <div 
            @click="e => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
              const x = (e.clientX - rect.left) / rect.width
              addGradientStopAt(x)
            }"
            class="h-6 w-full rounded-xs border border-ui-borderDefault cursor-crosshair relative shadow-inner"
            :style="{ background: gradientCss }"
            title="Click anywhere on the bar to add a color stop"
          >
            <!-- Draggable Color Stop Pins -->
            <div 
              v-for="stop in gradientStops" 
              :key="stop.id"
              @click.stop="activeStopId = stop.id"
              class="absolute top-0 bottom-0 w-3 -ml-1.5 flex flex-col items-center justify-between cursor-pointer group"
              :style="{ left: `${stop.pos * 100}%` }"
            >
              <div 
                class="w-2.5 h-2.5 rounded-full border border-black shadow-md transition transform group-hover:scale-125"
                :class="activeStopId === stop.id ? 'ring-2 ring-white scale-125' : ''"
                :style="{ backgroundColor: stop.color }"
              ></div>
              <div class="w-0.5 flex-1 bg-white/60"></div>
            </div>
          </div>
        </div>

        <!-- Active Stop Color & Position Editor -->
        <div v-if="activeStop" class="flex items-center gap-2 bg-ui-surface p-1.5 rounded-xs border border-ui-borderSubtle">
          <input 
            type="color" 
            v-model="activeStop.color" 
            class="w-5 h-5 rounded-xs cursor-pointer border border-ui-borderDefault bg-transparent p-0 shrink-0" 
          />
          <div class="flex-1 flex items-center gap-2 text-[10px]">
            <input 
              type="text" 
              v-model="activeStop.color" 
              class="w-16 bg-ui-input px-1 py-0.5 rounded-xs font-mono font-bold text-ui-textPrimary uppercase border border-ui-borderSubtle text-[10px]" 
            />
            <div class="flex items-center gap-1 flex-1">
              <span class="text-ui-textMuted text-[9px]">Pos:</span>
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.01" 
                v-model.number="activeStop.pos" 
                class="flex-1 accent-indigo-500 bg-ui-input h-1 rounded cursor-pointer" 
              />
              <span class="font-mono text-ui-textSecondary text-[9px] w-6">{{ Math.round(activeStop.pos * 100) }}%</span>
            </div>
          </div>
          <button 
            @click="removeActiveStop" 
            :disabled="gradientStops.length <= 2"
            class="p-1 rounded-xs bg-ui-input hover:bg-rose-950/40 text-ui-textMuted hover:text-rose-400 border border-ui-borderSubtle disabled:opacity-20 transition"
            title="Delete this color stop"
          >
            <X class="w-3 h-3" />
          </button>
        </div>
      </div>

      <!-- 3D Mesh Vertex Baking Card -->
      <div class="p-2 bg-ui-input/40 rounded-xs border border-ui-borderSubtle space-y-2">
        <div class="text-[10px] font-semibold text-ui-textMuted uppercase">Bake Lighting / AO to Vertices</div>

        <!-- Axis Mode Selector -->
        <div class="grid grid-cols-3 gap-1 text-[9.5px]">
          <button 
            v-for="ax in [
              { id: 'y', label: 'Vertical Y' },
              { id: 'x', label: 'Horizontal X' },
              { id: 'z', label: 'Depth Z' },
              { id: 'radial', label: 'Radial' },
              { id: 'sun', label: 'Sun Light' },
              { id: 'ao', label: 'Fake AO' }
            ]" 
            :key="ax.id"
            @click="gradAxis = ax.id as any"
            class="py-1 px-1 rounded-xs border text-center font-bold transition cursor-pointer"
            :class="gradAxis === ax.id ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-xs' : 'bg-ui-surface text-ui-textSecondary border-ui-borderSubtle hover:bg-ui-hover'"
          >
            {{ ax.label }}
          </button>
        </div>

        <!-- Sun Elevation/Azimuth (if Sun axis) -->
        <div v-if="gradAxis === 'sun'" class="grid grid-cols-2 gap-1.5 pt-1 text-[9px] text-ui-textMuted">
          <div>
            <div class="flex justify-between">
              <span>Elev:</span>
              <span class="text-amber-400 font-bold">{{ sunElevation }} deg</span>
            </div>
            <input type="range" min="0" max="90" v-model.number="sunElevation" class="w-full accent-amber-500 bg-ui-surface h-1 rounded cursor-pointer" />
          </div>
          <div>
            <div class="flex justify-between">
              <span>Azim:</span>
              <span class="text-amber-400 font-bold">{{ sunAzimuth }} deg</span>
            </div>
            <input type="range" min="0" max="360" v-model.number="sunAzimuth" class="w-full accent-amber-500 bg-ui-surface h-1 rounded cursor-pointer" />
          </div>
        </div>

        <!-- Curve & Blend Mode -->
        <div class="grid grid-cols-2 gap-1.5 pt-1 text-[10px]">
          <div>
            <label class="block text-[9px] text-ui-textMuted mb-0.5">Curve:</label>
            <select v-model="gradCurve" class="w-full bg-ui-surface border border-ui-borderSubtle rounded-xs px-1.5 py-0.5 text-[10px] text-ui-textPrimary focus:outline-none cursor-pointer">
              <option value="linear">Linear Smooth</option>
              <option value="ease">Smoothstep Ease</option>
              <option value="contrast">High Contrast</option>
              <option value="stepped">Stepped (Cel Bands)</option>
            </select>
          </div>
          <div>
            <label class="block text-[9px] text-ui-textMuted mb-0.5">Blend Mode:</label>
            <select v-model="gradBlendMode" class="w-full bg-ui-surface border border-ui-borderSubtle rounded-xs px-1.5 py-0.5 text-[10px] text-ui-textPrimary focus:outline-none cursor-pointer">
              <option value="replace">Replace</option>
              <option value="multiply">Multiply</option>
              <option value="add">Add</option>
            </select>
          </div>
        </div>

        <!-- Execute Bake Button -->
        <button 
          @click="executeGradientBake" 
          class="w-full py-1.5 px-2 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded-xs text-[10.5px] flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer active:scale-98"
        >
          <Zap class="w-3.5 h-3.5 fill-slate-950" />
          <span>Bake Multi-Stop Gradient to Vertices</span>
        </button>
      </div>

      <!-- Vertex Color Fill & Post-Processing Utilities -->
      <div class="p-2 bg-ui-input/40 rounded-xs border border-ui-borderSubtle space-y-1.5">
        <div class="flex items-center justify-between">
          <label class="text-[10px] font-semibold text-ui-textMuted uppercase">Vertex Color Fill Utilities</label>
          <span class="font-mono text-ui-textPrimary text-[10px] font-bold uppercase">{{ toolStore.vertexPaintColor }}</span>
        </div>

        <div class="flex items-center gap-1.5 bg-ui-surface p-1 rounded-xs border border-ui-borderSubtle">
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

        <div class="grid grid-cols-3 gap-1">
          <button 
            @click="fillSelectedVertices" 
            class="py-1 px-1.5 bg-indigo-600/80 hover:bg-indigo-600 text-white rounded-xs text-[10px] font-bold transition text-center shadow-xs cursor-pointer"
            title="Fill selected vertices with active color"
          >
            Fill Sel
          </button>
          <button 
            @click="fillEntireMesh" 
            class="py-1 px-1.5 bg-ui-surface hover:bg-ui-hover text-ui-textPrimary border border-ui-borderSubtle rounded-xs text-[10px] font-medium transition text-center cursor-pointer"
            title="Fill entire mesh with active color"
          >
            Fill Mesh
          </button>
          <button 
            @click="resetVertexColors" 
            class="py-1 px-1.5 bg-ui-surface hover:bg-rose-950/40 text-ui-textMuted hover:text-rose-300 border border-ui-borderSubtle rounded-xs text-[10px] font-medium transition text-center cursor-pointer"
            title="Reset all vertices to white"
          >
            Reset
          </button>
        </div>

        <!-- Post-Processing Actions -->
        <div class="grid grid-cols-3 gap-1 pt-1 border-t border-ui-borderSubtle">
          <button 
            @click="smoothVertexColors" 
            class="py-1 px-1 bg-ui-surface hover:bg-ui-hover text-indigo-300 border border-ui-borderSubtle rounded-xs text-[9px] font-bold transition text-center cursor-pointer"
            title="Smooth / Blur colors across connected vertices"
          >
            Smooth Blur
          </button>
          <button 
            @click="clampPSX5Bit" 
            class="py-1 px-1 bg-ui-surface hover:bg-ui-hover text-amber-300 border border-ui-borderSubtle rounded-xs text-[9px] font-bold transition text-center cursor-pointer"
            title="Quantize to PSX 5-bit RGB555"
          >
            PSX 5-Bit
          </button>
          <button 
            @click="invertVertexColors" 
            class="py-1 px-1 bg-ui-surface hover:bg-ui-hover text-ui-textPrimary border border-ui-borderSubtle rounded-xs text-[9px] font-bold transition text-center cursor-pointer"
            title="Invert vertex colors"
          >
            Invert Colors
          </button>
        </div>
      </div>
    </div>

    <!-- Create Texture Mini Modal -->
    <div v-if="showCreateTexModal" class="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center z-50 select-none p-4" @click.self="showCreateTexModal = false">
      <div class="bg-ui-panel border border-ui-borderStrong rounded-md shadow-2xl w-80 overflow-hidden flex flex-col">
        <div class="h-9 bg-ui-header border-b border-ui-borderDefault px-3 flex items-center justify-between">
          <div class="flex items-center gap-1.5 font-bold text-xs text-ui-textPrimary">
            <ImageIcon class="w-4 h-4 text-amber-400" />
            <span>New Texture for {{ activeMaterial?.name }}</span>
          </div>
          <button @click="showCreateTexModal = false" class="p-1 hover:bg-ui-hover text-ui-textMuted hover:text-ui-textPrimary rounded-xs cursor-pointer">
            <X class="w-3.5 h-3.5" />
          </button>
        </div>

        <div class="p-3 space-y-3 text-xs">
          <div class="space-y-1">
            <label class="text-[10px] uppercase font-bold text-ui-textMuted">Texture Name</label>
            <input 
              v-model="newTexName"
              placeholder="e.g. Character_Skin_Texture"
              class="w-full bg-ui-input border border-ui-borderDefault focus:border-ui-accent rounded-xs px-2 py-1 text-ui-textPrimary font-mono text-xs focus:outline-none"
              autoFocus
              @keydown.enter="handleCreateNewTexture"
            />
          </div>

          <div class="space-y-1">
            <label class="text-[10px] uppercase font-bold text-ui-textMuted">Resolution (Square)</label>
            <div class="grid grid-cols-4 gap-1">
              <button 
                v-for="s in [16, 32, 64, 128]" 
                :key="s"
                type="button"
                @click="newTexSize = s"
                class="py-1 rounded-xs font-mono text-[10px] font-bold border transition cursor-pointer text-center"
                :class="newTexSize === s ? 'bg-amber-500/25 text-amber-300 border-amber-500/60 shadow-xs' : 'bg-ui-surface text-ui-textSecondary border-ui-borderSubtle hover:bg-ui-hover'"
              >
                {{ s }}px
              </button>
            </div>
          </div>
        </div>

        <div class="p-2.5 bg-ui-header border-t border-ui-borderDefault flex justify-end gap-1.5">
          <button 
            @click="showCreateTexModal = false"
            class="px-2.5 py-1 rounded-xs text-[11px] font-medium text-ui-textSecondary hover:bg-ui-hover border border-ui-borderSubtle cursor-pointer"
          >
            Cancel
          </button>
          <button 
            @click="handleCreateNewTexture"
            class="px-3 py-1 rounded-xs text-[11px] font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-xs cursor-pointer flex items-center gap-1"
          >
            <Plus class="w-3.5 h-3.5" />
            <span>Create & Assign</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
