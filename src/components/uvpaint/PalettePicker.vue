<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useToolStore } from '../../stores/toolStore'
import { useProjectStore } from '../../stores/projectStore'
import { DEFAULT_PALETTES, loadCustomPalettes, saveCustomPalettes, snapColorToPalette, generateShadingRamp } from '../../utils/color'
import { Palette } from '../../types/texture'
import PaletteLibraryModal from '../modals/PaletteLibraryModal.vue'
import UiSection from '../ui/UiSection.vue'
import { ChevronDown, Pipette, Plus, Trash2, X, Sparkles } from 'lucide-vue-next'

const toolStore = useToolStore()
const projectStore = useProjectStore()

const showPaletteLibrary = ref(false)
const customPalettes = ref<Palette[]>([])
const showNewPaletteDialog = ref(false)
const newPaletteName = ref('')

const activeShadingRamp = computed(() => {
  return generateShadingRamp(toolStore.primaryColor || '#ffffff')
})

onMounted(() => {
  customPalettes.value = loadCustomPalettes()
})

const allPalettes = computed<Palette[]>(() => {
  return [...DEFAULT_PALETTES, ...customPalettes.value]
})

function selectPalette(p: Palette) {
  projectStore.activePalette = p
}

function setColor(hex: string) {
  toolStore.primaryColor = hex
}

function setSecondaryColor(e: MouseEvent, hex: string) {
  e.preventDefault()
  toolStore.secondaryColor = hex
}

function createNewCustomPalette() {
  const name = newPaletteName.value.trim() || `Custom Set ${customPalettes.value.length + 1}`
  const newPal: Palette = {
    id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name,
    category: 'Custom',
    isCustom: true,
    colors: [toolStore.primaryColor, toolStore.secondaryColor, '#ffffff', '#000000']
  }
  customPalettes.value.push(newPal)
  saveCustomPalettes(customPalettes.value)
  projectStore.activePalette = newPal
  showNewPaletteDialog.value = false
  newPaletteName.value = ''
}

function addCurrentColorToPalette() {
  const cur = projectStore.activePalette
  const colorToAdd = toolStore.primaryColor
  if (cur.isCustom) {
    if (!cur.colors.includes(colorToAdd)) {
      cur.colors.push(colorToAdd)
      saveCustomPalettes(customPalettes.value)
    }
  } else {
    // Clone preset into a custom palette
    const cloned: Palette = {
      id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: `${cur.name} (Custom)`,
      category: 'Custom',
      isCustom: true,
      colors: [...cur.colors, colorToAdd]
    }
    customPalettes.value.push(cloned)
    saveCustomPalettes(customPalettes.value)
    projectStore.activePalette = cloned
  }
}

function removeColorFromPalette(idx: number) {
  const cur = projectStore.activePalette
  if (cur.isCustom && cur.colors.length > 1) {
    cur.colors.splice(idx, 1)
    saveCustomPalettes(customPalettes.value)
  }
}

function deleteCurrentCustomPalette() {
  const cur = projectStore.activePalette
  if (!cur.isCustom) return
  customPalettes.value = customPalettes.value.filter(p => p.id !== cur.id)
  saveCustomPalettes(customPalettes.value)
  projectStore.activePalette = DEFAULT_PALETTES[0]
}

function quantizeActiveTexture() {
  const pb = projectStore.pixelBuffer
  const paletteColors = projectStore.activePalette.colors
  if (!pb || !paletteColors || paletteColors.length === 0) return

  for (let y = 0; y < pb.height; y++) {
    for (let x = 0; x < pb.width; x++) {
      const curHex = pb.getPixelHex(x, y)
      const closest = snapColorToPalette(curHex, paletteColors)
      pb.setPixel(x, y, closest)
    }
  }
  projectStore.markTextureUpdated()
}
</script>

<template>
  <div class="flex flex-col select-none text-xs font-sans">
    <UiSection title="Palette & Color Sets" :default-open="true">
      <template #actions>
        <!-- Primary & Secondary Color Overlapping Indicator -->
        <div class="flex items-center space-x-2">
          <div class="relative w-7 h-6 cursor-pointer" title="Active Colors: LMB Primary / RMB Secondary">
            <!-- Primary Color Box -->
            <div 
              class="absolute top-0 left-0 w-4 h-4 rounded-xs border border-ui-borderStrong shadow-sm z-10"
              :style="{ backgroundColor: toolStore.primaryColor }"
              title="Primary Color"
            ></div>
            <!-- Secondary Color Box -->
            <div 
              class="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-xs border border-ui-borderStrong shadow-sm"
              :style="{ backgroundColor: toolStore.secondaryColor }"
              title="Secondary Color"
            ></div>
          </div>

          <!-- Native Color Picker Trigger -->
          <label class="cursor-pointer relative flex items-center justify-center w-5 h-5 rounded-xs border border-ui-borderDefault bg-[#14161a] hover:border-ui-borderStrong transition text-ui-textMuted hover:text-ui-textPrimary" title="Pick Custom Color">
            <input 
              type="color" 
              v-model="toolStore.primaryColor" 
              class="opacity-0 absolute inset-0 w-full h-full cursor-pointer" 
            />
            <Pipette class="w-3 h-3 pointer-events-none" />
          </label>
        </div>
      </template>

      <!-- Palette Selector & Actions Toolbar -->
      <div class="space-y-1.5">
        <div class="flex items-center gap-1">
          <div class="relative flex-1 flex items-center">
            <select 
              :value="projectStore.activePalette.id" 
              @change="(e) => {
                const target = e.target as HTMLSelectElement
                const found = allPalettes.find(p => p.id === target.value)
                if (found) selectPalette(found)
              }"
              style="background-color: #14161a !important; color: #d8dbe0 !important;"
              class="w-full appearance-none border border-ui-borderDefault hover:border-ui-borderStrong focus:border-ui-accent rounded-xs pl-2.5 pr-7 h-7 text-xs font-sans focus:outline-none cursor-pointer transition shadow-inner"
            >
              <optgroup label="Custom Color Sets" v-if="customPalettes.length > 0">
                <option 
                  v-for="pal in customPalettes" 
                  :key="pal.id" 
                  :value="pal.id"
                  style="background-color: #14161a; color: #d8dbe0;"
                >
                  {{ pal.name }} ({{ pal.colors.length }} colors)
                </option>
              </optgroup>
              <optgroup label="Preset Palettes">
                <option 
                  v-for="pal in DEFAULT_PALETTES" 
                  :key="pal.id" 
                  :value="pal.id"
                  style="background-color: #14161a; color: #d8dbe0;"
                >
                  {{ pal.name }} ({{ pal.colors.length }} colors)
                </option>
              </optgroup>
            </select>
            <ChevronDown class="w-3.5 h-3.5 text-ui-textMuted absolute right-2 pointer-events-none" />
          </div>

          <button 
            @click="showNewPaletteDialog = !showNewPaletteDialog"
            class="h-7 px-1.5 rounded-xs bg-ui-surface hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textPrimary border border-ui-borderSubtle transition flex items-center gap-0.5 text-[10px]"
            title="Create New Custom Color Set"
          >
            <Plus class="w-3 h-3 text-emerald-400" />
            <span>New</span>
          </button>

          <button 
            v-if="projectStore.activePalette.isCustom"
            @click="deleteCurrentCustomPalette"
            class="h-7 px-1.5 rounded-xs bg-ui-surface hover:bg-rose-950/40 text-ui-textMuted hover:text-rose-400 border border-ui-borderSubtle transition"
            title="Delete Custom Color Set"
          >
            <Trash2 class="w-3 h-3" />
          </button>
        </div>

        <!-- Inline New Palette Dialog -->
        <div v-if="showNewPaletteDialog" class="p-1.5 bg-ui-input rounded-xs border border-ui-accent/40 space-y-1">
          <input 
            v-model="newPaletteName" 
            placeholder="Color Set Name" 
            class="w-full bg-ui-surface border border-ui-borderSubtle rounded-xs px-1.5 py-0.5 text-xs text-ui-textPrimary focus:outline-none"
            @keydown.enter="createNewCustomPalette"
          />
          <div class="flex gap-1">
            <button 
              @click="createNewCustomPalette" 
              class="flex-1 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xs text-[10px] font-bold transition"
            >
              Create
            </button>
            <button 
              @click="showNewPaletteDialog = false" 
              class="px-2 py-0.5 bg-ui-surface text-ui-textSecondary rounded-xs text-[10px] transition"
            >
              Cancel
            </button>
          </div>
        </div>

        <!-- 5-Tone Shading Ramp Picker for Active Color -->
        <div class="space-y-1 p-1 bg-ui-input/70 rounded-xs border border-ui-borderSubtle">
          <div class="flex items-center justify-between text-[8.5px] font-bold text-amber-300 uppercase">
            <span class="flex items-center gap-1">
              <Sparkles class="w-2.5 h-2.5 text-amber-400" />
              <span>Color Shading Ramp</span>
            </span>
            <span class="text-[8px] font-mono text-ui-textMuted">1-Click</span>
          </div>

          <div class="grid grid-cols-5 gap-1">
            <button 
              @click="setColor(activeShadingRamp.highlight)"
              @contextmenu="setSecondaryColor($event, activeShadingRamp.highlight)"
              class="flex flex-col items-center gap-0.5 p-1 rounded-xs border border-black/40 hover:scale-105 transition shadow-2xs cursor-pointer"
              :style="{ backgroundColor: activeShadingRamp.highlight }"
              :title="'Highlight (+45%): ' + activeShadingRamp.highlight + ' · Right-Click for Secondary'"
            >
              <span class="text-[7px] font-mono text-black font-bold uppercase bg-white/80 px-0.5 rounded-xs">High</span>
            </button>
            <button 
              @click="setColor(activeShadingRamp.light)"
              @contextmenu="setSecondaryColor($event, activeShadingRamp.light)"
              class="flex flex-col items-center gap-0.5 p-1 rounded-xs border border-black/40 hover:scale-105 transition shadow-2xs cursor-pointer"
              :style="{ backgroundColor: activeShadingRamp.light }"
              :title="'Light (+22%): ' + activeShadingRamp.light + ' · Right-Click for Secondary'"
            >
              <span class="text-[7px] font-mono text-black font-bold uppercase bg-white/80 px-0.5 rounded-xs">Light</span>
            </button>
            <button 
              @click="setColor(activeShadingRamp.base)"
              @contextmenu="setSecondaryColor($event, activeShadingRamp.base)"
              class="flex flex-col items-center gap-0.5 p-1 rounded-xs border-2 border-amber-400 hover:scale-105 transition shadow-2xs cursor-pointer"
              :style="{ backgroundColor: activeShadingRamp.base }"
              :title="'Base Midtone: ' + activeShadingRamp.base + ' · Right-Click for Secondary'"
            >
              <span class="text-[7px] font-mono text-black font-bold uppercase bg-white/80 px-0.5 rounded-xs">Base</span>
            </button>
            <button 
              @click="setColor(activeShadingRamp.shadow)"
              @contextmenu="setSecondaryColor($event, activeShadingRamp.shadow)"
              class="flex flex-col items-center gap-0.5 p-1 rounded-xs border border-black/40 hover:scale-105 transition shadow-2xs cursor-pointer"
              :style="{ backgroundColor: activeShadingRamp.shadow }"
              :title="'Shadow (-35%): ' + activeShadingRamp.shadow + ' · Right-Click for Secondary'"
            >
              <span class="text-[7px] font-mono text-white font-bold uppercase bg-black/80 px-0.5 rounded-xs">Shad</span>
            </button>
            <button 
              @click="setColor(activeShadingRamp.deepShadow)"
              @contextmenu="setSecondaryColor($event, activeShadingRamp.deepShadow)"
              class="flex flex-col items-center gap-0.5 p-1 rounded-xs border border-black/40 hover:scale-105 transition shadow-2xs cursor-pointer"
              :style="{ backgroundColor: activeShadingRamp.deepShadow }"
              :title="'Deep Shadow (-65%): ' + activeShadingRamp.deepShadow + ' · Right-Click for Secondary'"
            >
              <span class="text-[7px] font-mono text-white font-bold uppercase bg-black/80 px-0.5 rounded-xs">Deep</span>
            </button>
          </div>
        </div>

        <!-- Color Swatches Grid -->
        <div class="grid grid-cols-8 gap-1 p-1 bg-ui-input/50 rounded-xs border border-ui-borderSubtle max-h-48 overflow-y-auto">
          <div 
            v-for="(color, idx) in projectStore.activePalette.colors" 
            :key="idx"
            class="relative group w-full h-5"
          >
            <button 
              class="w-full h-full rounded-xs border transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-2xs flex items-center justify-center"
              :class="toolStore.primaryColor.toLowerCase() === color.toLowerCase() ? 'border-white ring-1.5 ring-amber-400 ring-offset-1 ring-offset-[#181a20] z-10' : 'border-black/40 hover:border-white/70'"
              :style="{ backgroundColor: color }"
              :title="`Left-Click: Primary, Right-Click: Secondary (${color})`"
              @click="setColor(color)"
              @contextmenu="setSecondaryColor($event, color)"
            ></button>

            <!-- Delete Swatch Button on Custom Palettes -->
            <button 
              v-if="projectStore.activePalette.isCustom"
              @click.stop="removeColorFromPalette(idx)"
              class="absolute -top-1 -right-1 hidden group-hover:flex w-3 h-3 bg-rose-600 text-white rounded-full items-center justify-center z-20 shadow-xs hover:bg-rose-500"
              title="Remove Color"
            >
              <X class="w-2 h-2 stroke-[3]" />
            </button>
          </div>

          <!-- Add Current Color Button -->
          <button 
            @click="addCurrentColorToPalette"
            class="w-full h-5 rounded-xs border border-dashed border-ui-borderDefault hover:border-amber-400 bg-ui-surface hover:bg-ui-hover flex items-center justify-center text-ui-textMuted hover:text-amber-400 transition cursor-pointer"
            title="Add active color to palette"
          >
            <Plus class="w-3 h-3" />
          </button>
        </div>

        <!-- Palette Snapping & Utility Controls -->
        <div class="flex items-center justify-between pt-1 border-t border-ui-borderSubtle/60 text-[10px] text-ui-textSecondary font-mono">
          <label class="flex items-center gap-1.5 cursor-pointer select-none">
            <input 
              type="checkbox" 
              v-model="toolStore.paletteSnapEnabled" 
              class="rounded-xs text-amber-500 focus:ring-0 focus:ring-offset-0 bg-[#14161a] border-ui-borderStrong w-3 h-3 cursor-pointer" 
            />
            <span>Lock to Palette</span>
          </label>
          <div class="flex items-center gap-1">
            <button 
              @click="showPaletteLibrary = true"
              class="px-1.5 py-0.5 rounded-xs bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/40 text-[9.5px] font-bold transition cursor-pointer"
              title="Open full palette library (50+ presets, Lospec Import/Export)"
            >
              Browse Library...
            </button>
            <button 
              @click="quantizeActiveTexture" 
              class="px-1.5 py-0.5 rounded-xs bg-ui-panel hover:bg-ui-hover border border-ui-borderSubtle text-ui-textMuted hover:text-ui-textPrimary transition cursor-pointer"
              title="Quantize all pixels in the active texture to this palette"
            >
              Quantize
            </button>
          </div>
        </div>
      </div>
    </UiSection>

    <!-- Full Palette Library Modal -->
    <PaletteLibraryModal 
      v-if="showPaletteLibrary"
      @close="showPaletteLibrary = false"
      @selected="(pal) => { selectPalette(pal); showPaletteLibrary = false }"
    />
  </div>
</template>
