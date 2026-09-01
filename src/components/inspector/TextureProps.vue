<script setup lang="ts">
import { ref, computed } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { useToolStore } from '../../stores/toolStore'
import UiSection from '../ui/UiSection.vue'
import UiButton from '../ui/UiButton.vue'
import BlenderIcon from '../icons/BlenderIcon.vue'
import ImportTextureModal from '../modals/ImportTextureModal.vue'
import TextureSharePrompt from '../modals/TextureSharePrompt.vue'
import { useTextureApply } from '../../composables/useTextureApply'
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
  Grid,
  Image as ImageIcon,
  Layers,
  Maximize2,
  Filter
} from 'lucide-vue-next'

const projectStore = useProjectStore()
const toolStore = useToolStore()
const {
  isOpen: sharePromptOpen,
  sharedCount: sharePromptCount,
  applyToActiveMesh,
  confirm: confirmShareApply,
  cancel: cancelShareApply
} = useTextureApply()

// ----------------------------------------------------
// WORKFLOW TABS
// ----------------------------------------------------
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

const libraryRows = computed(() => {
  return filteredTextures.value.map((tex) => {
    const matIds = new Set(
      projectStore.materials.filter(m => m.textureId === tex.id).map(m => m.id)
    )
    const objCount = projectStore.meshes.filter(
      mesh => mesh.materialId && matIds.has(mesh.materialId)
    ).length
    return {
      tex,
      objCount,
      selected: projectStore.activeTextureId === tex.id
    }
  })
})

const canDeleteTexture = computed(() => projectStore.textures.length > 1)

const atlasCellButtons = computed(() => {
  const a = activeTexture.value?.atlas
  if (!a) return [] as { col: number; row: number }[]
  const cells: { col: number; row: number }[] = []
  for (let row = 0; row < a.rows; row++) {
    for (let col = 0; col < a.cols; col++) cells.push({ col, row })
  }
  return cells
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
    projectStore.renameTexture(activeTexture.value.id, trimmed)
  }
  editingName.value = false
}

// ----------------------------------------------------
// TEXTURE ASSET ACTIONS & DRAG AND DROP
// ----------------------------------------------------
function handleCreateCustomTexture() {
  const name = newTextureName.value.trim() || `Texture_${projectStore.textures.length + 1}`
  const size = newTextureSize.value || 64
  projectStore.createTexture(name, size, size)
  showNewTextureModal.value = false
  newTextureName.value = ''
}

function handleDuplicateTexture() {
  if (!activeTexture.value) return
  projectStore.duplicateTexture(activeTexture.value.id)
}

function handleDeleteTexture(id?: string) {
  const idToDelete = id || activeTexture.value?.id
  if (!idToDelete || projectStore.textures.length <= 1) return
  projectStore.deleteTexture(idToDelete)
}

function handleSelectLibraryTexture(id: string) {
  if (toolStore.appMode === 'uvpaint' && projectStore.activeMesh) {
    projectStore.applyTextureToMesh(projectStore.activeMesh.id, id, 'this_object')
    return
  }
  projectStore.selectTexture(id)
}

function assignToActiveMaterial() {
  if (!activeTexture.value || !projectStore.activeMesh) return
  applyToActiveMesh(activeTexture.value.id)
}

function unbindFromActiveMaterial() {
  const matId = projectStore.activeMesh?.materialId
  if (!matId) return
  projectStore.unbindTextureFromMaterial(matId)
}

function assignToAllMaterials() {
  if (!activeTexture.value) return
  if (!confirm(`Apply "${activeTexture.value.name}" to every material in the scene?`)) return
  projectStore.applyTextureToAllMaterials(activeTexture.value.id)
}

function bakeSceneAtlas() {
  if (!confirm('Pack all mesh UVs into a new master atlas? This remaps every object. Undo is available.')) return
  projectStore.bakeSceneAtlas(2)
}

function handleQuickResize(size: number) {
  if (!activeTexture.value) return
  projectStore.recordState(`Resize Texture to ${size}px`)
  if (activeTexture.value.pixelBuffer) {
    activeTexture.value.pixelBuffer.resize(size, size, resizeMode.value === 'scale' ? 'resample' : 'crop')
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
    activeTexture.value.pixelBuffer.resize(w, h, resizeMode.value === 'scale' ? 'resample' : 'crop')
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
  if (toolStore.appMode === 'uvpaint' && projectStore.activeMesh) {
    projectStore.applyTextureToMesh(projectStore.activeMesh.id, texId, 'this_object')
  } else {
    projectStore.selectTexture(texId)
  }
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

function handleRestoreDefaultTexture() {
  projectStore.restoreDefaultTexture()
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

function handleLayerPreview() {
  const tex = activeTexture.value
  if (!tex || !tex.pixelBuffer) return
  tex.pixelBuffer.composite()
  projectStore.markTexturePreview()
}

function handleLayerChange() {
  const tex = activeTexture.value
  if (!tex || !tex.pixelBuffer) return
  tex.pixelBuffer.composite()
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

// ----------------------------------------------------
// 2D PIXEL FILTERS & TRANSFORMS
// ----------------------------------------------------
function flipHorizontal() {
  const tex = activeTexture.value
  if (!tex || !tex.pixelBuffer) return
  projectStore.recordState('Flip Texture Horizontal')
  tex.pixelBuffer.flip(true, false, true)
  projectStore.markTextureUpdated(tex.id)
}

function flipVertical() {
  const tex = activeTexture.value
  if (!tex || !tex.pixelBuffer) return
  projectStore.recordState('Flip Texture Vertical')
  tex.pixelBuffer.flip(false, true, true)
  projectStore.markTextureUpdated(tex.id)
}

function rotate90CW() {
  const tex = activeTexture.value
  if (!tex || !tex.pixelBuffer) return
  projectStore.recordState('Rotate Texture 90° CW')
  tex.pixelBuffer.rotate(90)
  tex.width = tex.pixelBuffer.width
  tex.height = tex.pixelBuffer.height
  projectStore.markTextureUpdated(tex.id)
}

function applyPixelFilter(action: 'invert' | 'grayscale' | 'brighten' | 'darken') {
  const tex = activeTexture.value
  if (!tex || !tex.pixelBuffer) return
  projectStore.recordState(`Apply Filter: ${action.toUpperCase()}`)
  if (action === 'invert') tex.pixelBuffer.invertColors()
  else if (action === 'grayscale') tex.pixelBuffer.desaturate()
  else if (action === 'brighten') tex.pixelBuffer.adjustBrightness(40)
  else tex.pixelBuffer.adjustBrightness(-40)
  projectStore.markTextureUpdated(tex.id)
}

function clearCanvas(transparent: boolean) {
  const tex = activeTexture.value
  if (!tex || !tex.pixelBuffer) return
  projectStore.recordState(transparent ? 'Clear Texture Transparent' : 'Fill Texture with Color')
  tex.pixelBuffer.clear(transparent ? undefined : (toolStore.primaryColor || '#ffffff'))
  projectStore.markTextureUpdated(tex.id)
}

function ditherTextureToPalette(algorithm: 'floyd' | 'atkinson') {
  const tex = activeTexture.value
  if (!tex || !tex.pixelBuffer) return
  const pal = projectStore.activePalette?.colors || ['#ffffff', '#000000', '#ef4444', '#22c55e', '#3b82f6', '#f59e0b']
  projectStore.recordState(`Dither Texture (${algorithm === 'floyd' ? 'Floyd-Steinberg' : 'Atkinson'})`)
  tex.pixelBuffer.remapToPalette(pal, algorithm === 'floyd' ? 'floyd-steinberg' : 'atkinson')
  projectStore.markTextureUpdated(tex.id)
}
</script>

<template>
  <div
    class="flex flex-col select-none text-xs font-sans relative"
    @dragover.prevent="isDraggingFile = true"
    @dragleave.prevent="isDraggingFile = false"
    @drop.prevent="handleDropFile"
  >
    <input ref="fileInputRef" type="file" accept="image/*" class="hidden" @change="handleFileInput" />

    <div
      v-if="isDraggingFile"
      class="absolute inset-0 bg-ui-accent/20 backdrop-blur-xs border-2 border-dashed border-ui-accent z-50 flex flex-col items-center justify-center p-4 text-center pointer-events-none"
    >
      <Upload class="w-7 h-7 text-ui-accent mb-1.5" />
      <span class="font-semibold text-xs text-ui-textPrimary">Drop image to import</span>
    </div>

    <div class="h-7 bg-ui-header border-b border-ui-borderSubtle px-2.5 flex items-center justify-between">
      <div class="flex items-center space-x-1.5 min-w-0">
        <BlenderIcon name="texture" :size="12" color="#10b981" class="shrink-0" />
        <span class="text-[11px] font-medium text-ui-textMuted">Texture</span>
      </div>
      <span class="font-semibold text-ui-textPrimary truncate max-w-[150px]">
        {{ activeTexture?.name || 'No texture' }}
      </span>
    </div>

    <UiSection v-if="activeTexture" title="Image" :icon="ImageIcon" :default-open="true">
      <template #actions>
        <UiButton size="xs" variant="ghost" title="New — does not assign" @click="showNewTextureModal = true">
          <Plus class="w-3 h-3 text-emerald-400" />
        </UiButton>
        <UiButton size="xs" variant="ghost" title="Duplicate" @click="handleDuplicateTexture">
          <Copy class="w-3 h-3" />
        </UiButton>
        <UiButton size="xs" variant="ghost" :disabled="projectStore.textures.length <= 1" title="Delete" @click="handleDeleteTexture()">
          <Trash2 class="w-3 h-3" />
        </UiButton>
      </template>

      <div class="w-full aspect-square max-h-36 rounded-xs border border-ui-borderDefault overflow-hidden tex-checker flex items-center justify-center">
        <img
          :src="activeTexture.dataUrl || activeTexture.pixelBuffer?.toDataURL()"
          class="max-w-full max-h-full object-contain [image-rendering:pixelated]"
          alt=""
        />
      </div>

      <div class="flex items-baseline justify-between gap-2 min-w-0">
        <span class="font-semibold text-ui-textPrimary truncate">{{ activeTexture.name }}</span>
        <span class="font-mono text-[10px] text-emerald-400 shrink-0">{{ activeTexture.width }}×{{ activeTexture.height }}</span>
      </div>
      <p class="text-[10px] text-ui-textMuted leading-snug">
        <span v-if="isTextureAssignedToActiveMesh" class="text-emerald-400">On {{ projectStore.activeMesh?.name }}</span>
        <span v-else>Editing — not on {{ projectStore.activeMesh?.name || 'this object' }} yet</span>
        <span class="text-ui-textMuted"> · {{ meshesUsingActiveTexture.length }} obj</span>
      </p>

      <div v-if="editingName" class="flex items-center gap-1">
        <input
          v-model="nameInput"
          class="flex-1 h-5.5 bg-ui-surface text-ui-textPrimary px-2 rounded-xs font-mono text-xs border border-emerald-500 focus:outline-none"
          autoFocus
          @blur="commitRename"
          @keydown.enter="commitRename"
        />
        <UiButton size="xs" variant="accent" @click="commitRename">Done</UiButton>
      </div>
      <div v-else class="grid grid-cols-2 gap-1">
        <UiButton size="xs" @click="startRename">Rename</UiButton>
        <UiButton size="xs" title="Import image" @click="triggerImport">
          <Upload class="w-3 h-3 text-ui-accent" />
          Import
        </UiButton>
      </div>

      <div class="grid grid-cols-2 gap-1">
        <UiButton
          size="xs"
          :variant="isTextureAssignedToActiveMesh ? 'accent' : 'default'"
          :disabled="!projectStore.activeMesh"
          :title="`Put ${activeTexture.name} on ${projectStore.activeMesh?.name || 'object'} (prompts if shared)`"
          @click="assignToActiveMaterial"
        >
          <Check v-if="isTextureAssignedToActiveMesh" class="w-3 h-3 text-emerald-400" />
          <span class="truncate">{{ isTextureAssignedToActiveMesh ? `On ${projectStore.activeMesh?.name}` : `Use on ${projectStore.activeMesh?.name || 'object'}` }}</span>
        </UiButton>
        <UiButton size="xs" title="Apply to every material" @click="assignToAllMaterials">
          <CheckCheck class="w-3 h-3 text-ui-accent" />
          All
        </UiButton>
      </div>
      <div class="grid grid-cols-2 gap-1">
        <UiButton size="xs" title="Paint this image" @click="openPaintStudio">
          <ExternalLink class="w-3 h-3" />
          Paint
        </UiButton>
        <UiButton size="xs" @click="openUvStudio">
          <BlenderIcon name="uv" :size="10" />
          UV
        </UiButton>
      </div>
      <div class="grid grid-cols-2 gap-1">
        <UiButton
          size="xs"
          variant="ghost"
          :disabled="!projectStore.activeMesh?.materialId"
          title="Remove map from the object's material"
          @click="unbindFromActiveMaterial"
        >
          Unbind
        </UiButton>
        <UiButton
          size="xs"
          variant="danger"
          :disabled="!canDeleteTexture"
          title="Delete from library. Objects using it lose the map."
          @click="handleDeleteTexture()"
        >
          <Trash2 class="w-3 h-3" />
          Delete
        </UiButton>
      </div>
    </UiSection>

    <UiSection title="Library" :icon="Grid" :badge="projectStore.textures.length" :default-open="true">
      <p class="text-[10px] text-ui-textMuted leading-snug">Click to paint/UV this image. Delete does not bind another map.</p>
      <div class="flex items-center gap-1.5 px-2 h-5.5 bg-ui-input border border-ui-borderSubtle rounded-xs">
        <Search class="w-3 h-3 text-ui-textMuted shrink-0" />
        <input
          v-model="textureSearchQuery"
          placeholder="Find texture…"
          class="bg-transparent text-ui-textPrimary focus:outline-none w-full font-mono text-[10px]"
        />
      </div>
      <div class="space-y-1 max-h-56 overflow-y-auto custom-scrollbar">
        <div
          v-for="row in libraryRows"
          :key="row.tex.id"
          class="flex items-center gap-1.5 px-1 py-1 rounded-xs border cursor-pointer"
          :class="row.selected ? 'bg-ui-surface border-emerald-500/50' : 'bg-ui-surface/40 border-ui-borderSubtle hover:bg-ui-hover'"
          @click="handleSelectLibraryTexture(row.tex.id)"
        >
          <div class="w-8 h-8 shrink-0 rounded-xs border border-ui-borderSubtle overflow-hidden tex-checker">
            <img :src="row.tex.dataUrl || row.tex.pixelBuffer?.toDataURL()" class="w-full h-full object-contain [image-rendering:pixelated]" alt="" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="text-[10px] font-medium text-ui-textPrimary truncate">{{ row.tex.name }}</div>
            <div class="text-[9px] text-ui-textMuted font-mono">
              {{ row.tex.width }}×{{ row.tex.height }}
              <span v-if="row.tex.atlas"> · {{ row.tex.atlas.cols }}×{{ row.tex.atlas.rows }} atlas</span>
              <span v-else-if="row.objCount"> · {{ row.objCount }} obj</span>
              <span v-else> · unused</span>
            </div>
          </div>
          <button
            type="button"
            class="p-1 text-ui-textMuted hover:text-rose-400 disabled:opacity-30"
            :disabled="!canDeleteTexture"
            title="Delete texture"
            @click.stop="handleDeleteTexture(row.tex.id)"
          >
            <Trash2 class="w-3 h-3" />
          </button>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-1">
        <UiButton size="xs" title="Export PNG" @click="exportTexturePng">
          <Download class="w-3 h-3" />
          PNG
        </UiButton>
        <UiButton size="xs" title="Restore default 2×2 atlas" @click="handleRestoreDefaultTexture">
          <Sparkles class="w-3 h-3 text-amber-400" />
          Default
        </UiButton>
      </div>
    </UiSection>

    <UiSection v-if="activeTexture" title="Atlas" :icon="Grid" :badge="activeTexture.atlas ? `${activeTexture.atlas.cols}×${activeTexture.atlas.rows}` : undefined" :default-open="true">
      <p class="text-[10px] text-ui-textMuted leading-snug">
        One shared map. Set a grid, put selected faces in a cell (UV), or slice cells into library images.
      </p>
      <div class="grid grid-cols-2 gap-1">
        <UiButton size="xs" :variant="activeTexture.atlas?.cols === 2 && activeTexture.atlas?.rows === 2 ? 'accent' : 'default'" @click="projectStore.setTextureAtlasGrid(activeTexture.id, 2, 2)">2×2</UiButton>
        <UiButton size="xs" :variant="activeTexture.atlas?.cols === 4 && activeTexture.atlas?.rows === 4 ? 'accent' : 'default'" @click="projectStore.setTextureAtlasGrid(activeTexture.id, 4, 4)">4×4</UiButton>
      </div>
      <div class="grid grid-cols-2 gap-1">
        <input
          type="number"
          min="1"
          max="16"
          :value="sliceCols"
          class="h-5.5 bg-ui-input border border-ui-borderSubtle rounded-xs px-1.5 text-ui-textPrimary font-mono text-[10px]"
          title="Columns"
          @change="sliceCols = Number(($event.target as HTMLInputElement).value) || 2"
        />
        <input
          type="number"
          min="1"
          max="16"
          :value="sliceRows"
          class="h-5.5 bg-ui-input border border-ui-borderSubtle rounded-xs px-1.5 text-ui-textPrimary font-mono text-[10px]"
          title="Rows"
          @change="sliceRows = Number(($event.target as HTMLInputElement).value) || 2"
        />
      </div>
      <div class="grid grid-cols-2 gap-1">
        <UiButton size="xs" @click="projectStore.setTextureAtlasGrid(activeTexture.id, sliceCols, sliceRows)">Set grid</UiButton>
        <UiButton size="xs" :disabled="!activeTexture.atlas" @click="projectStore.clearTextureAtlasGrid(activeTexture.id)">Clear grid</UiButton>
      </div>
      <div
        v-if="activeTexture.atlas"
        class="grid gap-0.5"
        :style="{ gridTemplateColumns: `repeat(${activeTexture.atlas.cols}, minmax(0, 1fr))` }"
      >
        <button
          v-for="cell in atlasCellButtons"
          :key="`${cell.col}-${cell.row}`"
          type="button"
          class="h-6 rounded-xs border border-ui-borderSubtle bg-ui-input text-[9px] font-mono text-ui-textSecondary hover:bg-ui-hover hover:text-ui-textPrimary"
          :title="`Fit selected UVs into cell ${cell.col + 1},${cell.row + 1}`"
          @click="projectStore.performMapUVsToAtlasCell(cell.col, cell.row)"
        >
          {{ cell.col + 1 }},{{ cell.row + 1 }}
        </button>
      </div>
      <UiButton
        size="xs"
        class="w-full"
        :title="`Extract ${sliceCols * sliceRows} tiles into the library`"
        @click="projectStore.sliceTextureIntoTiles(activeTexture.id, sliceCols, sliceRows)"
      >
        Slice to library
      </UiButton>
      <UiButton size="xs" class="w-full" title="Pack every object's map into one image and remap UVs" @click="bakeSceneAtlas">
        Bake scene atlas
      </UiButton>
    </UiSection>

    <UiSection v-if="activeTexture" title="Size" :icon="Maximize2" :default-open="false">
      <div class="grid grid-cols-2 gap-1">
        <UiButton
          v-for="s in [16, 32, 64, 128]"
          :key="s"
          size="xs"
          :active="activeTexture.width === s && activeTexture.height === s"
          @click="handleQuickResize(s)"
        >
          {{ s }}
        </UiButton>
      </div>
      <div class="grid grid-cols-2 gap-1">
        <UiButton size="xs" :active="activeTexture.width === 256 && activeTexture.height === 256" @click="handleQuickResize(256)">256</UiButton>
        <UiButton
          size="xs"
          @click="resizeW = activeTexture.width; resizeH = activeTexture.height; showResizeModal = true"
        >
          Custom
        </UiButton>
      </div>
      <div class="flex h-6 rounded-xs bg-ui-input border border-ui-borderSubtle p-0.5">
        <button
          type="button"
          class="flex-1 rounded-[2px] text-[10px] font-semibold cursor-pointer"
          :class="resizeMode === 'crop' ? 'bg-ui-surface text-ui-textPrimary shadow-xs' : 'text-ui-textMuted hover:text-ui-textSecondary'"
          @click="resizeMode = 'crop'"
        >
          Crop
        </button>
        <button
          type="button"
          class="flex-1 rounded-[2px] text-[10px] font-semibold cursor-pointer"
          :class="resizeMode === 'scale' ? 'bg-ui-surface text-ui-textPrimary shadow-xs' : 'text-ui-textMuted hover:text-ui-textSecondary'"
          @click="resizeMode = 'scale'"
        >
          Scale
        </button>
      </div>
    </UiSection>

    <UiSection v-if="activeTexture" title="Filter" :icon="Filter" :default-open="false">
      <div class="grid grid-cols-2 gap-1">
        <UiButton size="xs" title="Flip X" @click="flipHorizontal">
          <ArrowLeftRight class="w-3 h-3 text-sky-400" />
          Flip X
        </UiButton>
        <UiButton size="xs" title="Flip Y" @click="flipVertical">
          <ArrowUpDown class="w-3 h-3 text-sky-400" />
          Flip Y
        </UiButton>
        <UiButton size="xs" class="col-span-2" title="Rotate 90° CW" @click="rotate90CW">
          <RotateCw class="w-3 h-3 text-amber-400" />
          Rotate 90°
        </UiButton>
      </div>
    </UiSection>

    <UiSection v-if="activeTexture && activeTexture.pixelBuffer?.layers" title="Layers" :icon="Layers" :default-open="true" :badge="activeTexture.pixelBuffer.layers.length">
      <template #actions>
        <UiButton size="xs" variant="ghost" title="Add layer" @click="handleAddLayer">
          <Plus class="w-3 h-3 text-emerald-400" />
        </UiButton>
      </template>
      <div class="space-y-1 max-h-36 overflow-y-auto custom-scrollbar">
        <div
          v-for="layer in activeTexture.pixelBuffer.layers"
          :key="layer.id"
          class="flex items-center gap-1.5 px-1.5 h-6 rounded-xs border text-[10px] cursor-pointer"
          :class="activeTexture.pixelBuffer.activeLayerId === layer.id ? 'bg-ui-surface border-emerald-500/50' : 'bg-ui-surface/40 border-ui-borderSubtle hover:bg-ui-hover'"
          @click="activeTexture.pixelBuffer.activeLayerId = layer.id"
        >
          <input
            type="checkbox"
            v-model="layer.visible"
            class="accent-emerald-500 cursor-pointer w-3 h-3"
            title="Visibility"
            @change="handleLayerChange"
          />
          <span class="flex-1 min-w-0 font-medium truncate text-ui-textPrimary" :class="{ 'opacity-40': !layer.visible }">{{ layer.name }}</span>
          <div class="flex items-center gap-1 shrink-0" @click.stop>
            <select
              v-model="layer.blendMode"
              class="h-5 bg-ui-input text-[9px] text-ui-textSecondary border border-ui-borderSubtle rounded-xs px-1"
              @change="handleLayerChange"
            >
              <option value="normal">Norm</option>
              <option value="multiply">Mul</option>
              <option value="screen">Scr</option>
              <option value="overlay">Ovl</option>
              <option value="additive">Add</option>
            </select>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              v-model.number="layer.opacity"
              class="w-10 accent-emerald-500 cursor-pointer h-1"
              :title="`Opacity ${Math.round(layer.opacity * 100)}%`"
              @input="handleLayerPreview"
            />
            <button type="button" class="p-0.5 text-ui-textMuted hover:text-ui-textPrimary" title="Duplicate" @click="handleDuplicateLayer(layer.id)">
              <Copy class="w-2.5 h-2.5" />
            </button>
            <button
              v-if="activeTexture.pixelBuffer.layers.length > 1"
              type="button"
              class="p-0.5 text-ui-textMuted hover:text-rose-400"
              title="Delete"
              @click="handleDeleteLayer(layer.id)"
            >
              <Trash2 class="w-2.5 h-2.5" />
            </button>
          </div>
        </div>
      </div>
    </UiSection>

    <UiSection v-if="activeTexture" title="Pixels" :icon="Paintbrush" :default-open="false">
      <div class="grid grid-cols-2 gap-1">
        <UiButton size="xs" title="Clear transparent" @click="clearCanvas(true)">
          <EyeOff class="w-3 h-3 text-rose-400" />
          Clear
        </UiButton>
        <UiButton size="xs" title="Fill with paint color" @click="clearCanvas(false)">
          <Paintbrush class="w-3 h-3 text-emerald-400" />
          Fill
        </UiButton>
        <UiButton size="xs" @click="applyPixelFilter('brighten')">
          <Sun class="w-3 h-3 text-amber-400" />
          Light
        </UiButton>
        <UiButton size="xs" @click="applyPixelFilter('darken')">
          <Moon class="w-3 h-3 text-sky-400" />
          Dark
        </UiButton>
        <UiButton size="xs" @click="applyPixelFilter('grayscale')">Mono</UiButton>
        <UiButton size="xs" @click="applyPixelFilter('invert')">Invert</UiButton>
        <UiButton size="xs" title="Floyd-Steinberg to palette" @click="ditherTextureToPalette('floyd')">Floyd</UiButton>
        <UiButton size="xs" title="Atkinson to palette" @click="ditherTextureToPalette('atkinson')">Atkinson</UiButton>
      </div>
    </UiSection>

    <div v-if="showNewTextureModal" class="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div class="bg-ui-panel border border-ui-borderStrong rounded-xs shadow-2xl p-3 w-80 space-y-3">
        <div class="flex items-center justify-between text-xs font-semibold text-ui-textPrimary border-b border-ui-borderSubtle pb-1">
          <span>New texture</span>
        </div>
        <div>
          <label class="text-[10px] text-ui-textMuted block mb-0.5">Name</label>
          <input
            v-model="newTextureName"
            :placeholder="`Texture_${projectStore.textures.length + 1}`"
            class="w-full h-6 bg-ui-input border border-ui-borderSubtle rounded-xs px-2 text-ui-textPrimary text-xs focus:outline-none font-mono"
          />
        </div>
        <div class="grid grid-cols-2 gap-1">
          <UiButton
            v-for="s in [16, 32, 64, 128]"
            :key="s"
            size="xs"
            :active="newTextureSize === s"
            @click="newTextureSize = s"
          >
            {{ s }}
          </UiButton>
        </div>
        <UiButton size="xs" :active="newTextureSize === 256" class="w-full" @click="newTextureSize = 256">256</UiButton>
        <div class="flex gap-2">
          <UiButton size="xs" variant="accent" class="flex-1" @click="handleCreateCustomTexture">Create</UiButton>
          <UiButton size="xs" @click="showNewTextureModal = false">Cancel</UiButton>
        </div>
      </div>
    </div>

    <div v-if="showResizeModal" class="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div class="bg-ui-panel border border-ui-borderStrong rounded-xs shadow-2xl p-3 w-72 space-y-3">
        <div class="text-xs font-semibold text-ui-textPrimary border-b border-ui-borderSubtle pb-1">Resize</div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="text-[10px] text-ui-textMuted block mb-0.5">W</label>
            <input type="number" v-model.number="resizeW" min="8" max="2048" class="w-full h-6 bg-ui-input border border-ui-borderSubtle rounded-xs px-2 text-ui-textPrimary text-xs font-mono focus:outline-none" />
          </div>
          <div>
            <label class="text-[10px] text-ui-textMuted block mb-0.5">H</label>
            <input type="number" v-model.number="resizeH" min="8" max="2048" class="w-full h-6 bg-ui-input border border-ui-borderSubtle rounded-xs px-2 text-ui-textPrimary text-xs font-mono focus:outline-none" />
          </div>
        </div>
        <div class="flex gap-2">
          <UiButton size="xs" variant="accent" class="flex-1" @click="handleCustomResize">Apply</UiButton>
          <UiButton size="xs" @click="showResizeModal = false">Cancel</UiButton>
        </div>
      </div>
    </div>

    <ImportTextureModal
      v-if="showImportModal && pendingImportFile"
      :file="pendingImportFile"
      @close="() => { showImportModal = false; pendingImportFile = null }"
      @imported="handleTextureImported"
    />
    <TextureSharePrompt
      v-if="sharePromptOpen"
      :object-count="sharePromptCount"
      @confirm="confirmShareApply"
      @cancel="cancelShareApply"
    />
  </div>
</template>

<style scoped>
.tex-checker {
  background-color: #18181b;
  background-image:
    linear-gradient(45deg, #27272a 25%, transparent 25%),
    linear-gradient(-45deg, #27272a 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #27272a 75%),
    linear-gradient(-45deg, transparent 75%, #27272a 75%);
  background-size: 8px 8px;
  background-position: 0 0, 0 4px, 4px -4px, -4px 0;
}
</style>
