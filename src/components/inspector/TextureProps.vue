<script setup lang="ts">
import { ref, computed } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { useToolStore } from '../../stores/toolStore'
import BlenderIcon from '../icons/BlenderIcon.vue'
import ImportTextureModal from '../modals/ImportTextureModal.vue'
import { 
  Plus, 
  Trash2, 
  Copy, 
  ExternalLink,
  Upload, 
  Download, 
  Check, 
  CheckCheck,
  Sparkles,
  ArrowLeftRight,
  ArrowUpDown,
  RotateCw,
  Sun,
  Moon,
  EyeOff,
  Paintbrush,
  Search,
  Grid
} from 'lucide-vue-next'
import { applyFloydSteinbergDither, applyAtkinsonDither } from '../../utils/dithering'
import { DEFAULT_PALETTES, loadCustomPalettes } from '../../utils/color'
import { PixelBuffer } from '../../core/painting/PixelCanvas'

const projectStore = useProjectStore()
const toolStore = useToolStore()

// ----------------------------------------------------
// WORKFLOW TABS
// ----------------------------------------------------
type TextureTab = 'canvas' | 'gallery' | 'materials' | 'filters' | 'all'
const activeTab = ref<TextureTab>('canvas')

// ----------------------------------------------------
// ACTIVE TEXTURE SELECTION & METRICS
// ----------------------------------------------------
const fileInputRef = ref<HTMLInputElement | null>(null)
const showImportModal = ref(false)
const pendingImportFile = ref<File | null>(null)
const isDraggingFile = ref(false)
const textureSearchQuery = ref('')

const showNewTextureModal = ref(false)
const newTextureName = ref('')
const newTextureSize = ref<number>(64)

const showResizeModal = ref(false)
const resizeW = ref(64)
const resizeH = ref(64)
const resizeMode = ref<'crop' | 'scale'>('crop')

// Slicing existing active texture
const showSliceOptions = ref(false)
const sliceCols = ref<number>(2)
const sliceRows = ref<number>(2)

const activeTexture = computed(() => {
  return projectStore.textures.find(t => t.id === projectStore.activeTextureId) || projectStore.textures[0]
})

const filteredTextures = computed(() => {
  const query = textureSearchQuery.value.trim().toLowerCase()
  if (!query) return projectStore.textures
  return projectStore.textures.filter(t => t.name.toLowerCase().includes(query))
})

// Material and Mesh usage of active texture
const materialsUsingActiveTexture = computed(() => {
  if (!activeTexture.value) return []
  return projectStore.materials.filter(m => m.textureId === activeTexture.value.id)
})

const meshesUsingActiveTexture = computed(() => {
  if (!activeTexture.value) return []
  const matIds = new Set(materialsUsingActiveTexture.value.map(m => m.id))
  return projectStore.meshes.filter(mesh => mesh.materialId && matIds.has(mesh.materialId))
})

const isTextureAssignedToActiveMesh = computed(() => {
  if (!projectStore.activeMesh || !activeTexture.value) return false
  const mat = projectStore.materials.find(m => m.id === projectStore.activeMesh?.materialId)
  return mat?.textureId === activeTexture.value.id
})

// Rename state
const editingName = ref(false)
const nameInput = ref('')

function startRename() {
  if (!activeTexture.value) return
  nameInput.value = activeTexture.value.name
  editingName.value = true
}

function commitRename() {
  if (!editingName.value || !activeTexture.value) return
  const trimmed = nameInput.value.trim()
  if (trimmed) {
    activeTexture.value.name = trimmed
  }
  editingName.value = false
}

// ----------------------------------------------------
// TEXTURE ASSET ACTIONS & DRAG AND DROP
// ----------------------------------------------------
function handleCreateCustomTexture() {
  const name = newTextureName.value.trim() || `Texture_${projectStore.textures.length + 1}`
  const size = newTextureSize.value || 64
  projectStore.recordState('Add Texture')
  const newTex = projectStore.addTexture(name, size, size)
  projectStore.activeTextureId = newTex.id
  projectStore.markTextureUpdated(newTex.id)
  showNewTextureModal.value = false
  newTextureName.value = ''
}

function handleDuplicateTexture() {
  if (!activeTexture.value) return
  const cloned = projectStore.duplicateTexture(activeTexture.value.id)
  if (cloned) {
    projectStore.activeTextureId = cloned.id
    projectStore.markTextureUpdated(cloned.id)
  }
}

function handleDeleteTexture() {
  if (!activeTexture.value || projectStore.textures.length <= 1) return
  const idToDelete = activeTexture.value.id
  projectStore.deleteTexture(idToDelete)
}

function assignToActiveMaterial() {
  if (!activeTexture.value || !projectStore.activeMesh) return
  projectStore.assignTextureToActiveMesh(activeTexture.value.id)
}

function unbindFromActiveMaterial() {
  if (!projectStore.activeMesh) return
  const meshMat = projectStore.materials.find(m => m.id === projectStore.activeMesh?.materialId)
  if (meshMat) {
    projectStore.recordState('Unbind Texture from Material')
    meshMat.textureId = null
    projectStore.markGeometryUpdated()
  }
}

function assignToAllMaterials() {
  if (!activeTexture.value) return
  projectStore.recordState('Assign Texture to All Materials')
  for (const mat of projectStore.materials) {
    mat.textureId = activeTexture.value.id
  }
  projectStore.markTextureUpdated(activeTexture.value.id)
  projectStore.markGeometryUpdated()
}

function handleQuickResize(size: number) {
  if (!activeTexture.value) return
  projectStore.recordState(`Resize Texture to ${size}px`)
  if (activeTexture.value.pixelBuffer) {
    activeTexture.value.pixelBuffer.resize(size, size, 'crop')
  }
  activeTexture.value.width = size
  activeTexture.value.height = size
  if (activeTexture.value.pixelBuffer) {
    activeTexture.value.dataUrl = activeTexture.value.pixelBuffer.toDataURL()
  }
  projectStore.markTextureUpdated(activeTexture.value.id)
  projectStore.markGeometryUpdated()
}

function handleCustomResize() {
  if (!activeTexture.value) return
  const w = Math.max(8, Math.min(2048, resizeW.value || 64))
  const h = Math.max(8, Math.min(2048, resizeH.value || 64))
  projectStore.recordState(`Resize Texture to ${w}x${h}px`)
  
  if (activeTexture.value.pixelBuffer) {
    if (resizeMode.value === 'scale') {
      const oldCanvas = activeTexture.value.pixelBuffer.canvas
      const tempCanvas = document.createElement('canvas')
      tempCanvas.width = w
      tempCanvas.height = h
      const tempCtx = tempCanvas.getContext('2d')
      if (tempCtx) {
        tempCtx.imageSmoothingEnabled = false
        tempCtx.drawImage(oldCanvas, 0, 0, w, h)
        activeTexture.value.pixelBuffer.resize(w, h, 'crop')
        activeTexture.value.pixelBuffer.ctx.drawImage(tempCanvas, 0, 0)
      }
    } else {
      activeTexture.value.pixelBuffer.resize(w, h, 'crop')
    }
    activeTexture.value.dataUrl = activeTexture.value.pixelBuffer.toDataURL()
  }
  activeTexture.value.width = w
  activeTexture.value.height = h
  projectStore.markTextureUpdated(activeTexture.value.id)
  projectStore.markGeometryUpdated()
  showResizeModal.value = false
}

function triggerImport() {
  fileInputRef.value?.click()
}

function handleFileInput(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  pendingImportFile.value = file
  showImportModal.value = true
  input.value = ''
}

function handleDropFile(e: DragEvent) {
  isDraggingFile.value = false
  const file = e.dataTransfer?.files?.[0]
  if (!file || !file.type.startsWith('image/')) return
  pendingImportFile.value = file
  showImportModal.value = true
}

function handleTextureImported(texId: string) {
  projectStore.activeTextureId = texId
  showImportModal.value = false
  pendingImportFile.value = null
}

function exportTexturePng() {
  if (!activeTexture.value || !activeTexture.value.pixelBuffer) return
  activeTexture.value.pixelBuffer.canvas.toBlob((blob: Blob | null) => {
    if (blob) {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${activeTexture.value?.name || 'texture'}_${activeTexture.value?.width}x${activeTexture.value?.height}.png`
      a.click()
      URL.revokeObjectURL(url)
    }
  })
}

function handleAddLayer() {
  const tex = activeTexture.value
  if (!tex || !tex.pixelBuffer) return
  projectStore.recordState('Add Texture Layer')
  tex.pixelBuffer.addLayer()
  tex.dataUrl = tex.pixelBuffer.toDataURL()
  projectStore.markTextureUpdated(tex.id)
}

function handleDeleteLayer(id: string) {
  const tex = activeTexture.value
  if (!tex || !tex.pixelBuffer) return
  projectStore.recordState('Delete Texture Layer')
  tex.pixelBuffer.deleteLayer(id)
  tex.dataUrl = tex.pixelBuffer.toDataURL()
  projectStore.markTextureUpdated(tex.id)
}

function handleDuplicateLayer(id: string) {
  const tex = activeTexture.value
  if (!tex || !tex.pixelBuffer) return
  projectStore.recordState('Duplicate Texture Layer')
  tex.pixelBuffer.duplicateLayer(id)
  tex.dataUrl = tex.pixelBuffer.toDataURL()
  projectStore.markTextureUpdated(tex.id)
}

function handleLayerChange() {
  const tex = activeTexture.value
  if (!tex || !tex.pixelBuffer) return
  tex.pixelBuffer.composite()
  tex.dataUrl = tex.pixelBuffer.toDataURL()
  projectStore.markTextureUpdated(tex.id)
}

function openPaintStudio() {
  toolStore.appMode = 'uvpaint'
  toolStore.uvWorkspaceTab = 'paint'
}

function openUvStudio() {
  toolStore.appMode = 'uvpaint'
  toolStore.uvWorkspaceTab = 'uv'
}

function sliceActiveTextureIntoTiles() {
  const tex = activeTexture.value
  if (!tex || !tex.pixelBuffer) return
  const cols = Math.max(1, sliceCols.value)
  const rows = Math.max(1, sliceRows.value)
  const tw = Math.floor(tex.width / cols)
  const th = Math.floor(tex.height / rows)

  projectStore.recordState(`Slice Atlas ${tex.name} (${cols}x${rows})`)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tileBuf = new PixelBuffer(tw, th)
      tileBuf.ctx.imageSmoothingEnabled = false
      tileBuf.ctx.drawImage(
        tex.pixelBuffer.canvas,
        c * tw, r * th, tw, th,
        0, 0, tw, th
      )
      const tileTex = projectStore.addTexture(`${tex.name}_${r}_${c}`, tw, th)
      tileTex.pixelBuffer = tileBuf
      tileTex.dataUrl = tileBuf.toDataURL()
      projectStore.markTextureUpdated(tileTex.id)
    }
  }
  showSliceOptions.value = false
}

// ----------------------------------------------------
// 2D PIXEL FILTERS & TRANSFORMS
// ----------------------------------------------------
function flipHorizontal() {
  const tex = activeTexture.value
  if (!tex || !tex.pixelBuffer) return
  projectStore.recordState('Flip Texture Horizontal')
  const ctx = tex.pixelBuffer.ctx
  const w = tex.width
  const h = tex.height
  const temp = document.createElement('canvas')
  temp.width = w
  temp.height = h
  const tempCtx = temp.getContext('2d')
  if (!tempCtx) return
  tempCtx.drawImage(tex.pixelBuffer.canvas, 0, 0)

  ctx.clearRect(0, 0, w, h)
  ctx.save()
  ctx.translate(w, 0)
  ctx.scale(-1, 1)
  ctx.drawImage(temp, 0, 0)
  ctx.restore()

  tex.dataUrl = tex.pixelBuffer.toDataURL()
  projectStore.markTextureUpdated(tex.id)
}

function flipVertical() {
  const tex = activeTexture.value
  if (!tex || !tex.pixelBuffer) return
  projectStore.recordState('Flip Texture Vertical')
  const ctx = tex.pixelBuffer.ctx
  const w = tex.width
  const h = tex.height
  const temp = document.createElement('canvas')
  temp.width = w
  temp.height = h
  const tempCtx = temp.getContext('2d')
  if (!tempCtx) return
  tempCtx.drawImage(tex.pixelBuffer.canvas, 0, 0)

  ctx.clearRect(0, 0, w, h)
  ctx.save()
  ctx.translate(0, h)
  ctx.scale(1, -1)
  ctx.drawImage(temp, 0, 0)
  ctx.restore()

  tex.dataUrl = tex.pixelBuffer.toDataURL()
  projectStore.markTextureUpdated(tex.id)
}

function rotate90CW() {
  const tex = activeTexture.value
  if (!tex || !tex.pixelBuffer) return
  projectStore.recordState('Rotate Texture 90° CW')
  const w = tex.width
  const h = tex.height
  const temp = document.createElement('canvas')
  temp.width = w
  temp.height = h
  const tempCtx = temp.getContext('2d')
  if (!tempCtx) return
  tempCtx.drawImage(tex.pixelBuffer.canvas, 0, 0)

  tex.pixelBuffer.resize(h, w, 'crop')
  const ctx = tex.pixelBuffer.ctx
  ctx.save()
  ctx.translate(h, 0)
  ctx.rotate(Math.PI / 2)
  ctx.drawImage(temp, 0, 0)
  ctx.restore()

  tex.width = h
  tex.height = w
  tex.dataUrl = tex.pixelBuffer.toDataURL()
  projectStore.markTextureUpdated(tex.id)
}

function applyPixelFilter(action: 'invert' | 'grayscale' | 'brighten' | 'darken') {
  const tex = activeTexture.value
  if (!tex || !tex.pixelBuffer) return
  projectStore.recordState(`Apply Filter: ${action.toUpperCase()}`)
  const ctx = tex.pixelBuffer.ctx
  const imgData = ctx.getImageData(0, 0, tex.width, tex.height)
  const d = imgData.data

  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue // Skip transparent
    let r = d[i]
    let g = d[i + 1]
    let b = d[i + 2]

    if (action === 'invert') {
      d[i] = 255 - r
      d[i + 1] = 255 - g
      d[i + 2] = 255 - b
    } else if (action === 'grayscale') {
      const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
      d[i] = gray
      d[i + 1] = gray
      d[i + 2] = gray
    } else if (action === 'brighten') {
      d[i] = Math.min(255, Math.round(r * 1.2 + 15))
      d[i + 1] = Math.min(255, Math.round(g * 1.2 + 15))
      d[i + 2] = Math.min(255, Math.round(b * 1.2 + 15))
    } else if (action === 'darken') {
      d[i] = Math.max(0, Math.round(r * 0.8 - 15))
      d[i + 1] = Math.max(0, Math.round(g * 0.8 - 15))
      d[i + 2] = Math.max(0, Math.round(b * 0.8 - 15))
    }
  }

  ctx.putImageData(imgData, 0, 0)
  tex.dataUrl = tex.pixelBuffer.toDataURL()
  projectStore.markTextureUpdated(tex.id)
}

function clearCanvas(transparent: boolean) {
  const tex = activeTexture.value
  if (!tex || !tex.pixelBuffer) return
  projectStore.recordState(transparent ? 'Clear Texture Transparent' : 'Fill Texture with Color')
  const ctx = tex.pixelBuffer.ctx
  if (transparent) {
    ctx.clearRect(0, 0, tex.width, tex.height)
  } else {
    ctx.fillStyle = toolStore.primaryColor || '#ffffff'
    ctx.fillRect(0, 0, tex.width, tex.height)
  }
  tex.dataUrl = tex.pixelBuffer.toDataURL()
  projectStore.markTextureUpdated(tex.id)
}

function ditherTextureToPalette(algorithm: 'floyd' | 'atkinson') {
  const tex = activeTexture.value
  if (!tex || !tex.pixelBuffer) return
  const customPals = loadCustomPalettes()
  const allPals = [...DEFAULT_PALETTES, ...customPals]
  const pal = allPals[0]?.colors || ['#ffffff', '#000000', '#ef4444', '#22c55e', '#3b82f6', '#f59e0b']

  projectStore.recordState(`Dither Texture (${algorithm === 'floyd' ? 'Floyd-Steinberg' : 'Atkinson'})`)
  if (algorithm === 'floyd') {
    applyFloydSteinbergDither(tex.pixelBuffer.ctx, tex.width, tex.height, pal)
  } else {
    applyAtkinsonDither(tex.pixelBuffer.ctx, tex.width, tex.height, pal)
  }

  tex.dataUrl = tex.pixelBuffer.toDataURL()
  projectStore.markTextureUpdated(tex.id)
}
</script>

<template>
  <div 
    class="flex flex-col select-none text-xs font-sans p-1.5 space-y-2 relative"
    @dragover.prevent="isDraggingFile = true"
    @dragleave.prevent="isDraggingFile = false"
    @drop.prevent="handleDropFile"
  >
    <input ref="fileInputRef" type="file" accept="image/*" class="hidden" @change="handleFileInput" />

    <!-- Drag & Drop Full Overlay -->
    <div 
      v-if="isDraggingFile"
      class="absolute inset-1 bg-ui-accent/20 backdrop-blur-xs border-2 border-dashed border-ui-accent rounded-xs z-50 flex flex-col items-center justify-center p-4 text-center pointer-events-none"
    >
      <Upload class="w-8 h-8 text-ui-accent animate-bounce mb-2" />
      <span class="font-bold text-xs text-white">Drop Image or Atlas to Import</span>
      <span class="text-[9.5px] text-ui-textMuted font-mono">PNG, JPG, WebP</span>
    </div>

    <!-- 1. PERSISTENT TEXTURE HEADER & ASSET TOOLBAR -->
    <div class="p-2 bg-ui-header rounded-xs border border-ui-borderSubtle space-y-2">
      <!-- Row 1: Title, Active Pill, and Quick Actions -->
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-1.5 min-w-0">
          <BlenderIcon name="texture" :size="13" color="#10b981" class="shrink-0" />
          <span class="font-bold text-[11px] text-ui-textPrimary whitespace-nowrap">Textures</span>
          <div 
            v-if="activeTexture"
            class="flex items-center gap-1 px-1.5 py-0.5 bg-ui-surface rounded-xs border border-ui-borderSubtle max-w-[130px] truncate"
            :title="`${activeTexture.name} (${activeTexture.width}x${activeTexture.height}px)`"
          >
            <span class="w-2 h-2 rounded-full shrink-0 shadow-2xs bg-emerald-400 border border-black/40"></span>
            <span class="text-[9.5px] font-mono text-emerald-300 truncate font-bold">{{ activeTexture.name }}</span>
          </div>
        </div>
        
        <div class="flex items-center gap-1 shrink-0">
          <button 
            @click="showNewTextureModal = true" 
            class="p-1 rounded-xs bg-ui-surface hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textPrimary border border-ui-borderSubtle transition flex items-center gap-1 text-[9.5px] cursor-pointer" 
            title="Create New Texture Map"
          >
            <Plus class="w-3 h-3 text-emerald-400" />
            <span>New</span>
          </button>
          <button 
            @click="handleDuplicateTexture" 
            class="p-1 rounded-xs bg-ui-surface hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textPrimary border border-ui-borderSubtle transition cursor-pointer" 
            title="Duplicate Active Texture"
          >
            <Copy class="w-3 h-3" />
          </button>
          <button 
            @click="handleDeleteTexture" 
            :disabled="projectStore.textures.length <= 1"
            class="p-1 rounded-xs bg-ui-surface hover:bg-rose-950/40 text-ui-textMuted hover:text-rose-400 border border-ui-borderSubtle disabled:opacity-30 transition cursor-pointer" 
            title="Delete Texture Map"
          >
            <Trash2 class="w-3 h-3" />
          </button>
          <button 
            @click="triggerImport" 
            class="p-1 rounded-xs bg-ui-surface hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textAccent border border-ui-borderSubtle transition cursor-pointer" 
            title="Import Texture or Atlas Image"
          >
            <Upload class="w-3 h-3 text-ui-accent" />
          </button>
          <button 
            @click="exportTexturePng" 
            class="p-1 rounded-xs bg-ui-surface hover:bg-ui-hover text-ui-textSecondary hover:text-emerald-400 border border-ui-borderSubtle transition cursor-pointer" 
            title="Export Texture as PNG"
          >
            <Download class="w-3 h-3 text-emerald-400" />
          </button>
        </div>
      </div>

      <!-- Row 2: Texture Selector Dropdown & Rename -->
      <div class="flex items-center gap-1.5">
        <select 
          v-model="projectStore.activeTextureId"
          class="flex-1 bg-ui-surface border border-ui-borderDefault rounded-xs px-2 py-1 text-emerald-400 font-mono text-[11px] focus:outline-none focus:border-ui-accent cursor-pointer font-bold"
        >
          <option v-for="tex in projectStore.textures" :key="tex.id" :value="tex.id">
            {{ tex.name }} ({{ tex.width }}x{{ tex.height }}px)
          </option>
        </select>
        <button 
          v-if="!editingName"
          @click="startRename"
          class="px-2 py-1 rounded-xs bg-ui-surface hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textPrimary border border-ui-borderSubtle transition text-[9.5px] cursor-pointer"
          title="Rename Texture"
        >
          Rename
        </button>
      </div>

      <!-- Inline Rename Field (if editing) -->
      <div v-if="editingName && activeTexture" class="flex items-center gap-1.5 pt-0.5">
        <input 
          v-model="nameInput"
          @blur="commitRename"
          @keydown.enter="commitRename"
          class="flex-1 bg-ui-surface text-ui-textPrimary px-2 py-0.5 rounded-xs font-mono text-xs border border-emerald-500 focus:outline-none"
          autoFocus
        />
        <button @click="commitRename" class="px-2 py-0.5 bg-emerald-600 text-white rounded-xs text-[10px] font-bold cursor-pointer">Done</button>
      </div>

      <!-- Row 3: 1-Click Assign to Active Object / Apply to All -->
      <div class="grid grid-cols-2 gap-1 pt-1 border-t border-ui-borderSubtle">
        <button 
          @click="assignToActiveMaterial"
          :disabled="!projectStore.activeMesh"
          class="py-1 px-1.5 rounded-xs text-[10px] font-bold border transition flex items-center justify-center gap-1 cursor-pointer"
          :class="isTextureAssignedToActiveMesh ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50' : 'bg-ui-surface hover:bg-ui-hover text-ui-textPrimary border-ui-borderSubtle'"
          :title="`Assign ${activeTexture?.name} directly to ${projectStore.activeMesh?.name || 'Active Mesh'}`"
        >
          <Check v-if="isTextureAssignedToActiveMesh" class="w-3 h-3 text-emerald-400" />
          <span class="truncate">{{ isTextureAssignedToActiveMesh ? `Assigned to ${projectStore.activeMesh?.name}` : `Assign to ${projectStore.activeMesh?.name || 'Object'}` }}</span>
        </button>

        <button 
          @click="assignToAllMaterials"
          class="py-1 px-1.5 bg-ui-surface hover:bg-ui-hover border border-ui-borderSubtle text-ui-textSecondary hover:text-ui-textPrimary rounded-xs text-[10px] font-medium flex items-center justify-center gap-1 transition cursor-pointer"
          title="Apply this texture across all scene materials"
        >
          <CheckCheck class="w-3 h-3 text-ui-accent" />
          <span>Apply to All</span>
        </button>
      </div>
    </div>

    <!-- 2. 4-TAB WORKFLOW NAVIGATION STRIP -->
    <div class="grid grid-cols-4 gap-1 p-0.5 bg-ui-input/70 rounded-xs border border-ui-borderSubtle text-[9.5px]">
      <button 
        @click="activeTab = 'canvas'"
        class="py-1 rounded-xs font-bold transition text-center cursor-pointer border"
        :class="activeTab === 'canvas' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-xs' : 'bg-ui-surface text-ui-textMuted border-ui-borderSubtle hover:text-ui-textPrimary hover:bg-ui-hover'"
      >
        Canvas
      </button>
      <button 
        @click="activeTab = 'gallery'"
        class="py-1 rounded-xs font-bold transition text-center cursor-pointer border"
        :class="activeTab === 'gallery' ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-xs' : 'bg-ui-surface text-ui-textMuted border-ui-borderSubtle hover:text-ui-textPrimary hover:bg-ui-hover'"
      >
        Atlas & Grid
      </button>
      <button 
        @click="activeTab = 'materials'"
        class="py-1 rounded-xs font-bold transition text-center cursor-pointer border"
        :class="activeTab === 'materials' ? 'bg-sky-500/20 text-sky-300 border-sky-500/50 shadow-xs' : 'bg-ui-surface text-ui-textMuted border-ui-borderSubtle hover:text-ui-textPrimary hover:bg-ui-hover'"
      >
        Materials
      </button>
      <button 
        @click="activeTab = 'filters'"
        class="py-1 rounded-xs font-bold transition text-center cursor-pointer border"
        :class="activeTab === 'filters' ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50 shadow-xs' : 'bg-ui-surface text-ui-textMuted border-ui-borderSubtle hover:text-ui-textPrimary hover:bg-ui-hover'"
      >
        Filters & FX
      </button>
    </div>

    <!-- ==================================================== -->
    <!-- TAB 1: CANVAS & DIMENSIONS                           -->
    <!-- ==================================================== -->
    <div v-show="activeTab === 'canvas' || activeTab === 'all'" class="space-y-2">
      <!-- Live Preview Card -->
      <div v-if="activeTexture" class="p-2 bg-ui-input/40 rounded-xs border border-ui-borderSubtle space-y-2">
        <div class="flex items-center gap-3">
          <div class="w-16 h-16 rounded-xs border border-ui-borderDefault overflow-hidden bg-black/80 flex items-center justify-center shrink-0 shadow-inner">
            <img 
              :src="activeTexture.dataUrl || activeTexture.pixelBuffer?.toDataURL()" 
              class="w-full h-full object-contain [image-rendering:pixelated]" 
              alt="Texture Preview"
            />
          </div>
          <div class="flex flex-col min-w-0 flex-1 space-y-1">
            <div class="flex items-center justify-between">
              <span class="text-[11px] font-bold text-ui-textPrimary truncate">{{ activeTexture.name }}</span>
            </div>
            <div class="flex items-center gap-1 text-[10px] font-mono text-emerald-400">
              <span class="font-bold">{{ activeTexture.width }} × {{ activeTexture.height }} px</span>
              <span class="text-ui-textMuted text-[8.5px]">({{ (activeTexture.width * activeTexture.height) }} px)</span>
            </div>
            <!-- Quick Studio Links -->
            <div class="flex gap-1 pt-0.5">
              <button 
                @click="openPaintStudio"
                class="px-2 py-0.5 bg-ui-surface hover:bg-ui-hover text-ui-accent border border-ui-borderSubtle rounded-xs text-[9.5px] font-bold flex items-center gap-1 transition cursor-pointer"
                title="Paint directly onto 2D canvas in Paint Studio"
              >
                <ExternalLink class="w-2.5 h-2.5" />
                <span>Paint Studio</span>
              </button>
              <button 
                @click="openUvStudio"
                class="px-2 py-0.5 bg-ui-surface hover:bg-ui-hover text-sky-400 border border-ui-borderSubtle rounded-xs text-[9.5px] font-bold flex items-center gap-1 transition cursor-pointer"
                title="Unwrap & Map UV islands"
              >
                <BlenderIcon name="uv" :size="10" />
                <span>UV Map</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Texture Layers Card -->
      <div v-if="activeTexture && activeTexture.pixelBuffer?.layers" class="p-2 bg-ui-input/40 rounded-xs border border-ui-borderSubtle space-y-1.5">
        <div class="flex items-center justify-between text-[9.5px] text-ui-textMuted uppercase font-semibold">
          <span>Layers ({{ activeTexture.pixelBuffer.layers.length }})</span>
          <button 
            @click="handleAddLayer"
            class="flex items-center gap-0.5 text-emerald-400 hover:text-emerald-300 font-bold cursor-pointer text-[9.5px]"
            title="Add New Layer"
          >
            <Plus class="w-3 h-3" />
            <span>New Layer</span>
          </button>
        </div>

        <div class="space-y-1 max-h-36 overflow-y-auto custom-scrollbar">
          <div 
            v-for="layer in activeTexture.pixelBuffer.layers" 
            :key="layer.id"
            @click="activeTexture.pixelBuffer.activeLayerId = layer.id"
            class="flex items-center justify-between p-1.5 rounded-xs border text-[10px] cursor-pointer transition"
            :class="activeTexture.pixelBuffer.activeLayerId === layer.id ? 'bg-ui-surface border-emerald-500/60 shadow-xs' : 'bg-ui-surface/40 border-ui-borderSubtle hover:bg-ui-hover'"
          >
            <div class="flex items-center gap-1.5 min-w-0">
              <input 
                type="checkbox" 
                v-model="layer.visible" 
                @change="handleLayerChange"
                class="accent-emerald-500 cursor-pointer w-3 h-3"
                title="Toggle Visibility"
              />
              <span class="font-medium truncate text-ui-textPrimary" :class="{ 'opacity-40': !layer.visible }">{{ layer.name }}</span>
            </div>

            <div class="flex items-center gap-1 shrink-0" @click.stop>
              <!-- Blend Mode -->
              <select 
                v-model="layer.blendMode" 
                @change="handleLayerChange"
                class="bg-ui-input text-[9px] text-ui-textSecondary border border-ui-borderSubtle rounded-xs px-1 py-0.5"
              >
                <option value="normal">Normal</option>
                <option value="multiply">Multiply</option>
                <option value="screen">Screen</option>
                <option value="overlay">Overlay</option>
                <option value="additive">Add</option>
              </select>

              <!-- Opacity Slider -->
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.05" 
                v-model.number="layer.opacity" 
                @input="handleLayerChange"
                class="w-12 accent-emerald-500 cursor-pointer h-1"
                :title="`Opacity: ${Math.round(layer.opacity * 100)}%`"
              />

              <!-- Duplicate -->
              <button 
                @click="handleDuplicateLayer(layer.id)"
                class="p-0.5 hover:bg-ui-hover text-ui-textMuted hover:text-ui-textPrimary rounded-xs transition"
                title="Duplicate Layer"
              >
                <Copy class="w-2.5 h-2.5" />
              </button>

              <!-- Delete -->
              <button 
                v-if="activeTexture.pixelBuffer.layers.length > 1"
                @click="handleDeleteLayer(layer.id)"
                class="p-0.5 hover:bg-rose-950/40 text-ui-textMuted hover:text-rose-400 rounded-xs transition"
                title="Delete Layer"
              >
                <Trash2 class="w-2.5 h-2.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Quick Resolution Presets Card -->
      <div v-if="activeTexture" class="p-2 bg-ui-input/40 rounded-xs border border-ui-borderSubtle space-y-1.5">
        <div class="flex items-center justify-between text-[9.5px] text-ui-textMuted uppercase font-semibold">
          <span>Resolution Presets</span>
          <button 
            @click="resizeW = activeTexture.width; resizeH = activeTexture.height; showResizeModal = true"
            class="text-ui-accent hover:underline lowercase font-normal cursor-pointer text-[9px]"
          >
            custom size...
          </button>
        </div>
        <div class="grid grid-cols-5 gap-1">
          <button 
            v-for="s in [16, 32, 64, 128, 256]" 
            :key="s"
            @click="handleQuickResize(s)"
            class="py-1 px-1 rounded-xs border text-[9.5px] font-mono transition text-center cursor-pointer"
            :class="activeTexture.width === s && activeTexture.height === s ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 font-bold shadow-xs' : 'bg-ui-surface text-ui-textSecondary border-ui-borderSubtle hover:bg-ui-hover hover:text-ui-textPrimary'"
          >
            {{ s }}px
          </button>
        </div>
      </div>

      <!-- Drag & Drop Import Banner Card -->
      <div 
        @click="triggerImport"
        class="p-2.5 bg-ui-surface/60 hover:bg-ui-surface border border-dashed border-ui-borderDefault hover:border-ui-accent rounded-xs text-center cursor-pointer transition space-y-1"
        title="Click to browse image or drag & drop files"
      >
        <div class="flex items-center justify-center gap-1 text-ui-textAccent font-bold text-[10px]">
          <Upload class="w-3.5 h-3.5" />
          <span>Import Image or Atlas Sheet</span>
        </div>
        <div class="text-[8.5px] text-ui-textMuted font-mono">
          Drag & drop PNG, JPG, or WebP files here
        </div>
      </div>

      <!-- Canvas Clear & Fill Card -->
      <div v-if="activeTexture" class="p-2 bg-ui-input/40 rounded-xs border border-ui-borderSubtle space-y-1.5">
        <div class="text-[10px] font-semibold text-ui-textMuted uppercase">Canvas Operations</div>
        <div class="grid grid-cols-2 gap-1">
          <button 
            @click="clearCanvas(true)"
            class="py-1 px-1.5 bg-ui-surface hover:bg-rose-950/40 text-ui-textSecondary hover:text-rose-300 border border-ui-borderSubtle rounded-xs text-[9.5px] font-medium flex items-center justify-center gap-1 transition cursor-pointer"
            title="Clear canvas to transparent pixels"
          >
            <EyeOff class="w-3 h-3 text-rose-400" />
            <span>Clear Transparent</span>
          </button>
          <button 
            @click="clearCanvas(false)"
            class="py-1 px-1.5 bg-ui-surface hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textPrimary border border-ui-borderSubtle rounded-xs text-[9.5px] font-medium flex items-center justify-center gap-1 transition cursor-pointer"
            title="Fill entire canvas with active primary paint color"
          >
            <Paintbrush class="w-3 h-3 text-emerald-400" />
            <span>Fill Color</span>
          </button>
        </div>
      </div>
    </div>

    <!-- ==================================================== -->
    <!-- TAB 2: ATLAS, GRID & SCENE MASTER BAKER              -->
    <!-- ==================================================== -->
    <div v-show="activeTab === 'gallery' || activeTab === 'all'" class="space-y-2">
      <!-- Search & Filter Bar -->
      <div class="flex items-center gap-1.5 px-2 py-1 bg-ui-input border border-ui-borderSubtle rounded-xs text-[10px]">
        <Search class="w-3 h-3 text-ui-textMuted shrink-0" />
        <input 
          v-model="textureSearchQuery"
          placeholder="Filter texture maps..."
          class="bg-transparent text-ui-textPrimary focus:outline-none w-full font-mono text-[10px]"
        />
      </div>

      <!-- Project Texture Gallery Card -->
      <div class="p-2 bg-ui-input/40 rounded-xs border border-ui-borderSubtle space-y-1.5">
        <div class="flex items-center justify-between text-[10px] font-semibold text-ui-textMuted uppercase">
          <span>Textures & Atlas Tiles ({{ filteredTextures.length }})</span>
          <span class="font-mono text-[8.5px] text-emerald-400">Click to Select</span>
        </div>
        <div class="grid grid-cols-4 gap-1.5 max-h-48 overflow-y-auto custom-scrollbar p-0.5">
          <button 
            v-for="tex in filteredTextures" 
            :key="tex.id"
            @click="projectStore.activeTextureId = tex.id"
            class="aspect-square rounded-xs border overflow-hidden relative transition cursor-pointer bg-black/60 flex items-center justify-center group shadow-2xs"
            :class="projectStore.activeTextureId === tex.id ? 'border-emerald-400 ring-1.5 ring-emerald-400 shadow-xs' : 'border-ui-borderSubtle hover:border-white/60'"
            :title="`${tex.name} (${tex.width}x${tex.height}px)`"
          >
            <img 
              :src="tex.dataUrl || tex.pixelBuffer?.toDataURL()" 
              class="w-full h-full object-contain [image-rendering:pixelated]" 
              alt="tex"
            />
            <span v-if="projectStore.activeTextureId === tex.id" class="absolute bottom-0 right-0 p-0.5 bg-emerald-500 text-black rounded-tl-xs">
              <Check class="w-2 h-2 stroke-[3]" />
            </span>
            <div class="absolute inset-x-0 bottom-0 bg-black/80 px-0.5 py-0.2 opacity-0 group-hover:opacity-100 transition text-[7.5px] font-mono text-white truncate text-center">
              {{ tex.name }}
            </div>
          </button>
        </div>
      </div>

      <!-- Atlas Slicing Tool for Active Texture -->
      <div v-if="activeTexture" class="p-2 bg-amber-950/20 rounded-xs border border-amber-500/30 space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-[10px] font-bold text-amber-300 flex items-center gap-1.5">
            <Grid class="w-3.5 h-3.5 text-amber-400" />
            <span>Slice Active Atlas Map</span>
          </span>
          <button 
            @click="showSliceOptions = !showSliceOptions"
            class="text-[9px] text-amber-400 hover:underline font-mono cursor-pointer"
          >
            {{ showSliceOptions ? 'Hide' : 'Configure...' }}
          </button>
        </div>

        <div v-if="showSliceOptions" class="space-y-1.5 pt-1 border-t border-amber-500/20">
          <div class="grid grid-cols-2 gap-2 text-[10px]">
            <div>
              <span class="text-ui-textMuted text-[9px] block">Columns:</span>
              <input type="number" min="1" max="32" v-model.number="sliceCols" class="w-full bg-ui-input border border-ui-borderSubtle rounded-xs px-1.5 py-0.5 text-ui-textPrimary font-mono" />
            </div>
            <div>
              <span class="text-ui-textMuted text-[9px] block">Rows:</span>
              <input type="number" min="1" max="32" v-model.number="sliceRows" class="w-full bg-ui-input border border-ui-borderSubtle rounded-xs px-1.5 py-0.5 text-ui-textPrimary font-mono" />
            </div>
          </div>
          <button 
            @click="sliceActiveTextureIntoTiles"
            class="w-full py-1 bg-amber-600 hover:bg-amber-500 text-slate-950 rounded-xs text-[10px] font-bold transition cursor-pointer shadow-xs"
          >
            Extract {{ sliceCols * sliceRows }} Sub-Textures ({{ Math.floor(activeTexture.width / sliceCols) }}×{{ Math.floor(activeTexture.height / sliceRows) }}px)
          </button>
        </div>
      </div>

      <!-- 1-Click Scene Atlas Packing Card -->
      <div class="p-2 bg-ui-input/40 rounded-xs border border-ui-borderSubtle space-y-1.5">
        <div class="text-[10px] font-semibold text-ui-textMuted uppercase">Master Texture Atlas</div>
        <button 
          @click="projectStore.bakeSceneAtlas(2)" 
          class="w-full py-1.5 px-2 bg-amber-600 hover:bg-amber-500 text-slate-950 rounded-xs text-[10.5px] font-bold flex items-center justify-center gap-1.5 transition cursor-pointer shadow-xs active:scale-98"
          title="Pack UV islands from all scene meshes into a unified master texture atlas"
        >
          <Sparkles class="w-3.5 h-3.5 fill-slate-950" />
          <span>Bake Scene Atlas (All Meshes)</span>
        </button>
      </div>
    </div>

    <!-- ==================================================== -->
    <!-- TAB 3: MATERIAL BINDING & USAGE                      -->
    <!-- ==================================================== -->
    <div v-show="activeTab === 'materials' || activeTab === 'all'" class="space-y-2">
      <div v-if="activeTexture" class="p-2 bg-ui-input/40 rounded-xs border border-ui-borderSubtle space-y-2">
        <div class="text-[10px] font-semibold text-ui-textMuted uppercase">Material Assignment</div>
        
        <div class="text-[10px] text-ui-textSecondary">
          <span>Bound to </span>
          <span class="font-bold text-amber-300 font-mono">{{ materialsUsingActiveTexture.length }} Material(s)</span>
          <span> and </span>
          <span class="font-bold text-sky-300 font-mono">{{ meshesUsingActiveTexture.length }} Object(s)</span>
        </div>

        <!-- Assignment Buttons -->
        <div class="grid grid-cols-2 gap-1">
          <button 
            @click="assignToActiveMaterial"
            class="py-1 px-1.5 bg-ui-surface hover:bg-ui-hover text-ui-textPrimary border border-ui-borderSubtle rounded-xs text-[10px] font-medium flex items-center justify-center gap-1 transition cursor-pointer"
            title="Bind this texture to the active object's material"
          >
            <Check class="w-3 h-3 text-emerald-400" />
            <span>Apply to Active</span>
          </button>
          <button 
            @click="assignToAllMaterials"
            class="py-1 px-1.5 bg-ui-surface hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textPrimary border border-ui-borderSubtle rounded-xs text-[10px] font-medium flex items-center justify-center gap-1 transition cursor-pointer"
            title="Bind this texture to all scene materials"
          >
            <CheckCheck class="w-3 h-3 text-ui-accent" />
            <span>Apply to All ({{ projectStore.materials.length }})</span>
          </button>
        </div>

        <!-- Unbind Button -->
        <button 
          @click="unbindFromActiveMaterial"
          class="w-full py-1 bg-ui-surface hover:bg-rose-950/40 text-ui-textMuted hover:text-rose-300 border border-ui-borderSubtle rounded-xs text-[9.5px] font-medium transition cursor-pointer"
          title="Remove texture binding from active material (revert to pure procedural color)"
        >
          Unbind from Active Material
        </button>

        <!-- Material Usage Tags -->
        <div v-if="materialsUsingActiveTexture.length > 0" class="space-y-1 pt-1 border-t border-ui-borderSubtle">
          <span class="text-[9px] text-ui-textMuted uppercase font-semibold">Materials using this Map:</span>
          <div class="flex flex-wrap gap-1">
            <span 
              v-for="m in materialsUsingActiveTexture" 
              :key="m.id"
              class="px-1.5 py-0.5 rounded-xs bg-ui-surface text-amber-300 border border-ui-borderSubtle font-mono text-[9px] flex items-center gap-1"
            >
              <BlenderIcon name="material" :size="9" color="#f59e0b" />
              <span>{{ m.name }}</span>
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- ==================================================== -->
    <!-- TAB 4: 2D FILTERS & PIXEL FX                         -->
    <!-- ==================================================== -->
    <div v-show="activeTab === 'filters' || activeTab === 'all'" class="space-y-2">
      <!-- 2D Transforms Card -->
      <div v-if="activeTexture" class="p-2 bg-ui-input/40 rounded-xs border border-ui-borderSubtle space-y-1.5">
        <div class="text-[10px] font-semibold text-ui-textMuted uppercase">Transform & Orient</div>
        <div class="grid grid-cols-3 gap-1">
          <button 
            @click="flipHorizontal"
            class="py-1 px-1 bg-ui-surface hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textPrimary border border-ui-borderSubtle rounded-xs text-[9.5px] font-medium flex items-center justify-center gap-1 transition cursor-pointer"
            title="Flip texture horizontally"
          >
            <ArrowLeftRight class="w-3 h-3 text-sky-400" />
            <span>Flip X</span>
          </button>
          <button 
            @click="flipVertical"
            class="py-1 px-1 bg-ui-surface hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textPrimary border border-ui-borderSubtle rounded-xs text-[9.5px] font-medium flex items-center justify-center gap-1 transition cursor-pointer"
            title="Flip texture vertically"
          >
            <ArrowUpDown class="w-3 h-3 text-sky-400" />
            <span>Flip Y</span>
          </button>
          <button 
            @click="rotate90CW"
            class="py-1 px-1 bg-ui-surface hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textPrimary border border-ui-borderSubtle rounded-xs text-[9.5px] font-medium flex items-center justify-center gap-1 transition cursor-pointer"
            title="Rotate texture 90 degrees clockwise"
          >
            <RotateCw class="w-3 h-3 text-amber-400" />
            <span>Rotate 90°</span>
          </button>
        </div>
      </div>

      <!-- Color & Contrast Filters Card -->
      <div v-if="activeTexture" class="p-2 bg-ui-input/40 rounded-xs border border-ui-borderSubtle space-y-1.5">
        <div class="text-[10px] font-semibold text-ui-textMuted uppercase">Color Adjustments</div>
        <div class="grid grid-cols-4 gap-1">
          <button 
            @click="applyPixelFilter('brighten')"
            class="py-1 px-1 bg-ui-surface hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textPrimary border border-ui-borderSubtle rounded-xs text-[9px] font-mono transition text-center cursor-pointer flex items-center justify-center gap-0.5"
            title="Brighten image (+20%)"
          >
            <Sun class="w-2.5 h-2.5 text-amber-400" />
            <span>+Light</span>
          </button>
          <button 
            @click="applyPixelFilter('darken')"
            class="py-1 px-1 bg-ui-surface hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textPrimary border border-ui-borderSubtle rounded-xs text-[9px] font-mono transition text-center cursor-pointer flex items-center justify-center gap-0.5"
            title="Darken image (-20%)"
          >
            <Moon class="w-2.5 h-2.5 text-sky-400" />
            <span>-Dark</span>
          </button>
          <button 
            @click="applyPixelFilter('grayscale')"
            class="py-1 px-1 bg-ui-surface hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textPrimary border border-ui-borderSubtle rounded-xs text-[9px] font-mono transition text-center cursor-pointer"
            title="Desaturate into grayscale"
          >
            Mono
          </button>
          <button 
            @click="applyPixelFilter('invert')"
            class="py-1 px-1 bg-ui-surface hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textPrimary border border-ui-borderSubtle rounded-xs text-[9px] font-mono transition text-center cursor-pointer"
            title="Invert color channels"
          >
            Invert
          </button>
        </div>
      </div>

      <!-- 2D Error Diffusion Dithering Card -->
      <div v-if="activeTexture" class="p-2 bg-ui-input/40 rounded-xs border border-ui-borderSubtle space-y-1.5">
        <div class="text-[10px] font-semibold text-ui-textMuted uppercase">Convert to Palette Dither</div>
        <div class="grid grid-cols-2 gap-1">
          <button 
            @click="ditherTextureToPalette('floyd')"
            class="py-1 px-1.5 bg-ui-surface hover:bg-ui-hover border border-ui-borderSubtle hover:border-indigo-400 text-ui-textSecondary hover:text-white rounded-xs text-[9px] font-medium transition cursor-pointer flex flex-col items-center"
            title="Convert texture using Floyd-Steinberg error diffusion"
          >
            <span class="font-bold">Floyd-Steinberg</span>
            <span class="text-[7.5px] text-ui-textMuted">Smooth Diffusion</span>
          </button>
          <button 
            @click="ditherTextureToPalette('atkinson')"
            class="py-1 px-1.5 bg-ui-surface hover:bg-ui-hover border border-ui-borderSubtle hover:border-indigo-400 text-ui-textSecondary hover:text-white rounded-xs text-[9px] font-medium transition cursor-pointer flex flex-col items-center"
            title="Convert texture using Atkinson 1-bit dithering"
          >
            <span class="font-bold">Atkinson Dither</span>
            <span class="text-[7.5px] text-ui-textMuted">Crisp Edge 1-Bit</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Mini-Modal: Create New Texture -->
    <div v-if="showNewTextureModal" class="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div class="bg-ui-panel border border-ui-borderStrong rounded-xs shadow-2xl p-3 w-80 space-y-3">
        <div class="flex items-center justify-between text-xs font-bold text-emerald-400 border-b border-ui-borderSubtle pb-1">
          <span class="flex items-center gap-1.5">
            <BlenderIcon name="texture" :size="13" color="#10b981" />
            <span>Create New Texture Map</span>
          </span>
        </div>
        <div class="space-y-2">
          <div>
            <label class="text-[10px] text-ui-textMuted block mb-0.5">Texture Name:</label>
            <input 
              v-model="newTextureName" 
              :placeholder="`Texture_${projectStore.textures.length + 1}`" 
              class="w-full bg-ui-input border border-ui-borderSubtle rounded-xs px-2 py-1 text-ui-textPrimary text-xs focus:outline-none font-mono"
            />
          </div>
          <div>
            <label class="text-[10px] text-ui-textMuted block mb-1">Canvas Resolution:</label>
            <div class="grid grid-cols-5 gap-1">
              <button 
                v-for="s in [16, 32, 64, 128, 256]" 
                :key="s"
                @click="newTextureSize = s"
                class="py-1 rounded-xs border text-[10px] font-mono transition text-center cursor-pointer"
                :class="newTextureSize === s ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 font-bold' : 'bg-ui-surface text-ui-textSecondary border-ui-borderSubtle hover:bg-ui-hover'"
              >
                {{ s }}px
              </button>
            </div>
          </div>
        </div>
        <div class="flex gap-2 pt-1 border-t border-ui-borderSubtle">
          <button 
            @click="handleCreateCustomTexture"
            class="flex-1 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xs text-[11px] font-bold transition cursor-pointer"
          >
            Create Texture
          </button>
          <button 
            @click="showNewTextureModal = false"
            class="px-3 py-1 bg-ui-surface hover:bg-ui-hover text-ui-textSecondary rounded-xs text-[11px] transition cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>

    <!-- Mini-Modal: Custom Resize Texture -->
    <div v-if="showResizeModal" class="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div class="bg-ui-panel border border-ui-borderStrong rounded-xs shadow-2xl p-3 w-72 space-y-3">
        <div class="flex items-center justify-between text-xs font-bold text-amber-300 border-b border-ui-borderSubtle pb-1">
          <span>Resize Texture Canvas</span>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="text-[10px] text-ui-textMuted block mb-0.5">Width (px):</label>
            <input 
              type="number"
              v-model.number="resizeW"
              min="8"
              max="2048"
              class="w-full bg-ui-input border border-ui-borderSubtle rounded-xs px-2 py-1 text-ui-textPrimary text-xs focus:outline-none font-mono"
            />
          </div>
          <div>
            <label class="text-[10px] text-ui-textMuted block mb-0.5">Height (px):</label>
            <input 
              type="number"
              v-model.number="resizeH"
              min="8"
              max="2048"
              class="w-full bg-ui-input border border-ui-borderSubtle rounded-xs px-2 py-1 text-ui-textPrimary text-xs focus:outline-none font-mono"
            />
          </div>
        </div>
        <!-- Resize Mode Selector -->
        <div class="space-y-1">
          <label class="text-[10px] text-ui-textMuted block mb-0.5">Resize Mode:</label>
          <div class="grid grid-cols-2 gap-1">
            <button 
              @click="resizeMode = 'crop'"
              class="py-1 rounded-xs border text-[9.5px] font-medium transition text-center cursor-pointer"
              :class="resizeMode === 'crop' ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-bold' : 'bg-ui-surface text-ui-textSecondary border-ui-borderSubtle hover:bg-ui-hover'"
            >
              Fit / Crop
            </button>
            <button 
              @click="resizeMode = 'scale'"
              class="py-1 rounded-xs border text-[9.5px] font-medium transition text-center cursor-pointer"
              :class="resizeMode === 'scale' ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-bold' : 'bg-ui-surface text-ui-textSecondary border-ui-borderSubtle hover:bg-ui-hover'"
            >
              Nearest Scale
            </button>
          </div>
        </div>
        <div class="flex gap-2 pt-1 border-t border-ui-borderSubtle">
          <button 
            @click="handleCustomResize"
            class="flex-1 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-xs text-[11px] font-bold transition cursor-pointer"
          >
            Apply Resize
          </button>
          <button 
            @click="showResizeModal = false"
            class="px-3 py-1 bg-ui-surface hover:bg-ui-hover text-ui-textSecondary rounded-xs text-[11px] transition cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>

    <!-- Import Modal -->
    <ImportTextureModal 
      v-if="showImportModal && pendingImportFile" 
      :file="pendingImportFile" 
      @close="() => { showImportModal = false; pendingImportFile = null }"
      @imported="handleTextureImported"
    />
  </div>
</template>
