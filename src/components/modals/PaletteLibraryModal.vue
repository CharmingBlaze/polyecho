<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { useToolStore } from '../../stores/toolStore'
import { 
  DEFAULT_PALETTES, 
  loadCustomPalettes, 
  saveCustomPalettes, 
  parseHexPalette, 
  parseGplPalette, 
  parseJascPal, 
  extractColorsFromImage, 
  exportPaletteToHex, 
  exportPaletteToGpl, 
  exportPaletteToPng,
  sortPaletteColors,
  snapColorToPalette
} from '../../utils/color'
import { Palette } from '../../types/texture'
import { 
  X, 
  Search, 
  Download, 
  Upload, 
  Plus, 
  Trash2, 
  Check, 
  Palette as PaletteIcon,
  ArrowDownUp,
  FileCode,
  Image as ImageIcon
} from 'lucide-vue-next'

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'selected', palette: Palette): void
}>()

const projectStore = useProjectStore()
const toolStore = useToolStore()

const searchQuery = ref('')
const selectedCategory = ref<string>('All')
const customPalettes = ref<Palette[]>([])

// Import / Export & Create Modal sub-states
const showImportDialog = ref(false)
const importRawText = ref('')
const importName = ref('')
const fileInputRef = ref<HTMLInputElement | null>(null)

const showCreateDialog = ref(false)
const newCustomName = ref('')

onMounted(() => {
  customPalettes.value = loadCustomPalettes()
})

const categories = ['All', 'Consoles', 'Pixel Art', 'Biomes', 'Materials', 'Stylized', 'Custom']

const allPalettes = computed<Palette[]>(() => {
  return [...DEFAULT_PALETTES, ...customPalettes.value]
})

const filteredPalettes = computed<Palette[]>(() => {
  let list = allPalettes.value

  if (selectedCategory.value !== 'All') {
    list = list.filter(p => p.category === selectedCategory.value)
  }

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim()
    list = list.filter(p => 
      p.name.toLowerCase().includes(q) || 
      (p.category || '').toLowerCase().includes(q) ||
      `${p.colors.length}` === q ||
      `${p.colors.length}c` === q
    )
  }

  return list
})

function selectPalette(p: Palette) {
  projectStore.activePalette = p
  emit('selected', p)
  emit('close')
}

function handleAddCustomPalette() {
  const name = newCustomName.value.trim() || `Custom Set ${customPalettes.value.length + 1}`
  const newPal: Palette = {
    id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name,
    category: 'Custom',
    isCustom: true,
    colors: [toolStore.primaryColor || '#ffffff', toolStore.secondaryColor || '#000000', '#be4a2f', '#3b5dc9']
  }
  customPalettes.value.push(newPal)
  saveCustomPalettes(customPalettes.value)
  projectStore.activePalette = newPal
  showCreateDialog.value = false
  newCustomName.value = ''
  selectedCategory.value = 'Custom'
}

function handleDeleteCustomPalette(p: Palette, e: MouseEvent) {
  e.stopPropagation()
  if (!p.isCustom) return
  if (confirm(`Delete custom palette "${p.name}"?`)) {
    customPalettes.value = customPalettes.value.filter(item => item.id !== p.id)
    saveCustomPalettes(customPalettes.value)
    if (projectStore.activePalette.id === p.id) {
      projectStore.activePalette = DEFAULT_PALETTES[0]
    }
  }
}

function handleSortPalette(p: Palette, by: 'hue' | 'brightness' | 'saturation', e: MouseEvent) {
  e.stopPropagation()
  if (!p.isCustom) {
    // Clone as custom first
    const cloned: Palette = {
      id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: `${p.name} (Sorted)`,
      category: 'Custom',
      isCustom: true,
      colors: sortPaletteColors(p.colors, by)
    }
    customPalettes.value.push(cloned)
    saveCustomPalettes(customPalettes.value)
    projectStore.activePalette = cloned
    selectedCategory.value = 'Custom'
  } else {
    p.colors = sortPaletteColors(p.colors, by)
    saveCustomPalettes(customPalettes.value)
  }
}

function handleExportHex(p: Palette, e: MouseEvent) {
  e.stopPropagation()
  const hexData = exportPaletteToHex(p)
  const blob = new Blob([hexData], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${p.name.replace(/\s+/g, '_').toLowerCase()}.hex`
  a.click()
  URL.revokeObjectURL(url)
}

function handleExportGpl(p: Palette, e: MouseEvent) {
  e.stopPropagation()
  const gplData = exportPaletteToGpl(p)
  const blob = new Blob([gplData], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${p.name.replace(/\s+/g, '_').toLowerCase()}.gpl`
  a.click()
  URL.revokeObjectURL(url)
}

function handleExportPng(p: Palette, e: MouseEvent) {
  e.stopPropagation()
  const dataUrl = exportPaletteToPng(p, 16)
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = `${p.name.replace(/\s+/g, '_').toLowerCase()}_swatch.png`
  a.click()
}

async function handleFileUpload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return

  const fileName = file.name.replace(/\.[^/.]+$/, '')
  let colors: string[] = []

  if (file.name.endsWith('.hex') || file.name.endsWith('.txt')) {
    const text = await file.text()
    colors = parseHexPalette(text)
  } else if (file.name.endsWith('.gpl')) {
    const text = await file.text()
    const result = parseGplPalette(text)
    colors = result.colors
    if (result.name) importName.value = result.name
  } else if (file.name.endsWith('.pal')) {
    const text = await file.text()
    colors = parseJascPal(text)
  } else if (file.type.startsWith('image/')) {
    colors = await extractColorsFromImage(file, 64)
  }

  if (colors.length > 0) {
    const newPal: Palette = {
      id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: importName.value.trim() || fileName || 'Imported Palette',
      category: 'Custom',
      isCustom: true,
      colors
    }
    customPalettes.value.push(newPal)
    saveCustomPalettes(customPalettes.value)
    projectStore.activePalette = newPal
    showImportDialog.value = false
    importRawText.value = ''
    importName.value = ''
    selectedCategory.value = 'Custom'
  } else {
    alert('No valid colors found in file.')
  }
}

function handlePasteImport() {
  const colors = parseHexPalette(importRawText.value)
  if (colors.length === 0) {
    alert('Please enter valid hex codes (e.g. #ff0000, #00ff00 or hex list from Lospec)')
    return
  }

  const newPal: Palette = {
    id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: importName.value.trim() || `Pasted Set (${colors.length})`,
    category: 'Custom',
    isCustom: true,
    colors
  }
  customPalettes.value.push(newPal)
  saveCustomPalettes(customPalettes.value)
  projectStore.activePalette = newPal
  showImportDialog.value = false
  importRawText.value = ''
  importName.value = ''
  selectedCategory.value = 'Custom'
}

function handleQuantizeTexture(p: Palette, e: MouseEvent) {
  e.stopPropagation()
  const pb = projectStore.pixelBuffer
  if (!pb || p.colors.length === 0) return

  if (confirm(`Remap all pixels on active canvas to "${p.name}" palette (${p.colors.length} colors)?`)) {
    projectStore.recordState(`Quantize to ${p.name}`)
    for (let y = 0; y < pb.height; y++) {
      for (let x = 0; x < pb.width; x++) {
        const curHex = pb.getPixelHex(x, y)
        const closest = snapColorToPalette(curHex, p.colors)
        pb.setPixel(x, y, closest)
      }
    }
    projectStore.activePalette = p
    projectStore.markTextureUpdated()
    emit('close')
  }
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 font-sans text-xs select-none">
    <div class="bg-ui-panel border border-ui-borderStrong rounded-xs shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-100">
      
      <!-- Top Header -->
      <div class="h-11 px-4 border-b border-ui-borderSubtle flex items-center justify-between bg-ui-header shrink-0">
        <div class="flex items-center gap-2">
          <PaletteIcon class="w-4 h-4 text-amber-400" />
          <h2 class="font-bold text-sm text-ui-textPrimary">Pixel Art Palette Library & Manager</h2>
          <span class="px-1.5 py-0.5 bg-ui-accentSubtle text-ui-textAccent rounded-xs text-[10px] font-mono font-semibold">
            {{ allPalettes.length }} Palettes
          </span>
        </div>

        <div class="flex items-center gap-2">
          <button 
            @click="showCreateDialog = true"
            class="flex items-center gap-1 px-2.5 py-1 bg-ui-accent hover:bg-ui-accentHover text-white rounded-xs font-semibold shadow-xs transition"
          >
            <Plus class="w-3.5 h-3.5" />
            <span>New Custom</span>
          </button>

          <button 
            @click="showImportDialog = true"
            class="flex items-center gap-1 px-2.5 py-1 bg-ui-surface hover:bg-ui-hover text-ui-textPrimary border border-ui-borderSubtle rounded-xs font-medium transition"
          >
            <Upload class="w-3.5 h-3.5 text-amber-400" />
            <span>Import Palette...</span>
          </button>

          <button 
            @click="$emit('close')"
            class="p-1 text-ui-textMuted hover:text-ui-textPrimary rounded-xs hover:bg-ui-hover transition ml-2"
          >
            <X class="w-4 h-4" />
          </button>
        </div>
      </div>

      <!-- Controls Bar (Search + Category Filter Tabs) -->
      <div class="px-4 py-2.5 bg-ui-surface/60 border-b border-ui-borderSubtle flex flex-wrap items-center justify-between gap-3 shrink-0">
        <!-- Search Input -->
        <div class="relative w-72">
          <Search class="w-3.5 h-3.5 text-ui-textMuted absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input 
            type="text"
            v-model="searchQuery"
            placeholder="Search palettes by name, type, or color count..."
            class="w-full bg-ui-input border border-ui-borderDefault rounded-xs pl-8 pr-3 py-1 text-xs text-ui-textPrimary placeholder:text-ui-textMuted focus:outline-none focus:border-ui-accent"
          />
        </div>

        <!-- Category Filter Tabs -->
        <div class="flex items-center gap-1 bg-ui-input p-0.5 rounded-xs border border-ui-borderSubtle overflow-x-auto">
          <button 
            v-for="cat in categories"
            :key="cat"
            @click="selectedCategory = cat"
            class="px-2.5 py-1 rounded-xs text-[11px] font-medium transition whitespace-nowrap"
            :class="selectedCategory === cat ? 'bg-ui-active text-ui-textAccent shadow-xs font-semibold' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
          >
            {{ cat }}
          </button>
        </div>
      </div>

      <!-- Main Palette Grid -->
      <div class="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 gap-3 bg-ui-bg">
        <div 
          v-for="pal in filteredPalettes"
          :key="pal.id"
          @click="selectPalette(pal)"
          class="bg-ui-panel border rounded-xs p-3 transition flex flex-col justify-between group cursor-pointer hover:shadow-lg"
          :class="projectStore.activePalette.id === pal.id 
            ? 'border-ui-accent bg-ui-accentSubtle/20 shadow-md ring-1 ring-ui-accent/40' 
            : 'border-ui-borderSubtle hover:border-ui-borderStrong hover:bg-ui-hover/40'"
        >
          <!-- Card Header -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-2 truncate">
                <span class="font-bold text-xs text-ui-textPrimary group-hover:text-ui-textAccent transition truncate">
                  {{ pal.name }}
                </span>
                <span v-if="projectStore.activePalette.id === pal.id" class="px-1.5 py-0.2 bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-mono font-bold rounded-xs flex items-center gap-0.5">
                  <Check class="w-2.5 h-2.5" /> ACTIVE
                </span>
              </div>

              <div class="flex items-center gap-1 shrink-0 text-ui-textMuted text-[10px]">
                <span class="px-1.5 py-0.5 bg-ui-input rounded-xs font-mono font-semibold">
                  {{ pal.colors.length }} colors
                </span>
                <span class="px-1.5 py-0.5 bg-ui-input rounded-xs text-ui-textSecondary">
                  {{ pal.category }}
                </span>
              </div>
            </div>

            <!-- Color Swatch Strip -->
            <div class="flex flex-wrap gap-0.5 p-1 bg-ui-input rounded-xs border border-ui-borderSubtle mb-2.5 max-h-16 overflow-hidden">
              <div 
                v-for="(hex, idx) in pal.colors"
                :key="idx"
                class="w-4 h-4 rounded-xs border border-black/20 shrink-0"
                :style="{ backgroundColor: hex }"
                :title="`${hex} (#${idx + 1})`"
              ></div>
            </div>
          </div>

          <!-- Card Actions Footer -->
          <div class="flex items-center justify-between border-t border-ui-borderSubtle pt-2 text-[10px]">
            <div class="flex items-center gap-1.5">
              <!-- Activate -->
              <button 
                @click.stop="selectPalette(pal)"
                class="px-2 py-0.5 bg-ui-accent hover:bg-ui-accentHover text-white rounded-xs font-semibold transition cursor-pointer"
              >
                Use Palette
              </button>

              <!-- Quantize Texture -->
              <button 
                @click.stop="handleQuantizeTexture(pal, $event)"
                class="px-2 py-0.5 bg-ui-surface hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textPrimary rounded-xs border border-ui-borderSubtle transition cursor-pointer"
                title="Remap and snap active texture pixels to this palette"
              >
                Quantize
              </button>
            </div>

            <!-- Export / Sort / Delete Actions -->
            <div class="flex items-center gap-1">
              <!-- Sort -->
              <button 
                @click.stop="handleSortPalette(pal, 'hue', $event)" 
                class="p-1 text-ui-textMuted hover:text-ui-textPrimary rounded-xs hover:bg-ui-hover transition" 
                title="Sort by Hue"
              >
                <ArrowDownUp class="w-3.5 h-3.5" />
              </button>

              <!-- Export .hex -->
              <button 
                @click.stop="handleExportHex(pal, $event)" 
                class="p-1 text-ui-textMuted hover:text-amber-400 rounded-xs hover:bg-ui-hover transition" 
                title="Download .hex (Lospec)"
              >
                <FileCode class="w-3.5 h-3.5" />
              </button>

              <!-- Export .gpl -->
              <button 
                @click.stop="handleExportGpl(pal, $event)" 
                class="p-1 text-ui-textMuted hover:text-sky-400 rounded-xs hover:bg-ui-hover transition" 
                title="Download .gpl (Aseprite)"
              >
                <Download class="w-3.5 h-3.5" />
              </button>

              <!-- Export .png -->
              <button 
                @click.stop="handleExportPng(pal, $event)" 
                class="p-1 text-ui-textMuted hover:text-emerald-400 rounded-xs hover:bg-ui-hover transition" 
                title="Download PNG Swatch Strip"
              >
                <ImageIcon class="w-3.5 h-3.5" />
              </button>

              <!-- Delete (Custom only) -->
              <button 
                v-if="pal.isCustom"
                @click.stop="handleDeleteCustomPalette(pal, $event)"
                class="p-1 text-ui-textMuted hover:text-rose-400 rounded-xs hover:bg-rose-950/30 transition"
                title="Delete Custom Palette"
              >
                <Trash2 class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        <div v-if="filteredPalettes.length === 0" class="col-span-full py-12 text-center text-ui-textMuted">
          <PaletteIcon class="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p class="font-medium text-xs">No palettes found matching "{{ searchQuery }}"</p>
          <p class="text-[11px] mt-1">Try another search term or import a custom palette from Lospec.</p>
        </div>
      </div>

      <!-- Import Dialog Modal (Sub-overlay) -->
      <div v-if="showImportDialog" class="absolute inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
        <div class="bg-ui-panel border border-ui-borderStrong rounded-xs shadow-2xl w-full max-w-lg p-4 space-y-3">
          <div class="flex items-center justify-between border-b border-ui-borderSubtle pb-2">
            <h3 class="font-bold text-xs text-ui-textPrimary flex items-center gap-1.5">
              <Upload class="w-4 h-4 text-amber-400" /> Import Palette (.hex, .gpl, .pal, PNG)
            </h3>
            <button @click="showImportDialog = false" class="text-ui-textMuted hover:text-white">
              <X class="w-4 h-4" />
            </button>
          </div>

          <div>
            <label class="block text-[11px] text-ui-textMuted mb-1">Palette Name (Optional)</label>
            <input 
              v-model="importName"
              placeholder="e.g. My Cool Game Palette"
              class="w-full bg-ui-input border border-ui-borderDefault rounded-xs px-2.5 py-1 text-xs text-ui-textPrimary"
            />
          </div>

          <!-- File Upload Option -->
          <div class="p-3 border border-dashed border-ui-borderDefault rounded-xs text-center bg-ui-surface/40 hover:bg-ui-hover/30 transition">
            <input 
              ref="fileInputRef" 
              type="file" 
              accept=".hex,.gpl,.pal,.txt,image/*" 
              class="hidden" 
              @change="handleFileUpload" 
            />
            <button 
              @click="fileInputRef?.click()"
              class="px-3 py-1.5 bg-ui-accent hover:bg-ui-accentHover text-white rounded-xs font-semibold shadow-xs transition"
            >
              Choose Palette File (.hex, .gpl, .pal, PNG)
            </button>
            <p class="text-[10px] text-ui-textMuted mt-1">Supports Lospec .hex files, Aseprite .gpl palettes, or swatch images</p>
          </div>

          <!-- Raw Paste Option -->
          <div>
            <label class="block text-[11px] text-ui-textMuted mb-1">Or Paste Hex Codes</label>
            <textarea 
              v-model="importRawText"
              rows="4"
              placeholder="Paste hex codes separated by newlines or commas (e.g. #000000, #ffffff, #ff0044, #00e436)..."
              class="w-full bg-ui-input border border-ui-borderDefault rounded-xs p-2 text-xs font-mono text-ui-textPrimary resize-none"
            ></textarea>
          </div>

          <div class="flex items-center justify-end gap-2 pt-2 border-t border-ui-borderSubtle">
            <button @click="showImportDialog = false" class="px-3 py-1 bg-ui-surface hover:bg-ui-hover text-ui-textSecondary rounded-xs">
              Cancel
            </button>
            <button 
              @click="handlePasteImport" 
              :disabled="!importRawText.trim()"
              class="px-3 py-1 bg-ui-accent hover:bg-ui-accentHover text-white rounded-xs font-semibold disabled:opacity-40"
            >
              Import Pasted Colors
            </button>
          </div>
        </div>
      </div>

      <!-- Create Custom Dialog Modal (Sub-overlay) -->
      <div v-if="showCreateDialog" class="absolute inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
        <div class="bg-ui-panel border border-ui-borderStrong rounded-xs shadow-2xl w-full max-w-sm p-4 space-y-3">
          <div class="flex items-center justify-between border-b border-ui-borderSubtle pb-2">
            <h3 class="font-bold text-xs text-ui-textPrimary flex items-center gap-1.5">
              <Plus class="w-4 h-4 text-ui-accent" /> Create New Custom Palette
            </h3>
            <button @click="showCreateDialog = false" class="text-ui-textMuted hover:text-white">
              <X class="w-4 h-4" />
            </button>
          </div>

          <div>
            <label class="block text-[11px] text-ui-textMuted mb-1">Palette Name</label>
            <input 
              v-model="newCustomName"
              placeholder="e.g. Hero Sprite Colors"
              class="w-full bg-ui-input border border-ui-borderDefault rounded-xs px-2.5 py-1 text-xs text-ui-textPrimary focus:outline-none focus:border-ui-accent"
              @keyup.enter="handleAddCustomPalette"
            />
          </div>

          <div class="flex items-center justify-end gap-2 pt-2 border-t border-ui-borderSubtle">
            <button @click="showCreateDialog = false" class="px-3 py-1 bg-ui-surface hover:bg-ui-hover text-ui-textSecondary rounded-xs">
              Cancel
            </button>
            <button 
              @click="handleAddCustomPalette"
              class="px-3 py-1 bg-ui-accent hover:bg-ui-accentHover text-white rounded-xs font-semibold shadow-xs"
            >
              Create Palette
            </button>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>
