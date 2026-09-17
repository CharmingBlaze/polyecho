<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useThemeStore } from '../../stores/themeStore'
import { TOKEN_GROUPS, TOKEN_META, type ThemeColorKey } from '../../core/theme/themeTokens'
import { useKeymapStore } from '../../stores/keymapStore'
import { useToolStore } from '../../stores/toolStore'
import { useProjectStore } from '../../stores/projectStore'
import { useFloatingDrag } from '../../composables/useFloatingDrag'
import { 
  X, 
  Palette, 
  Keyboard, 
  Sliders, 
  PenTool, 
  Monitor, 
  RotateCcw, 
  Search, 
  HardDrive,
  GripHorizontal,
  Download,
  Upload,
  Copy,
  Trash2,
  Image
} from 'lucide-vue-next'
import { DEFAULT_TEXTURE_PRESETS, fillDefaultTexture } from '../../core/painting/DefaultTextures'
import { PixelBuffer } from '../../core/painting/PixelCanvas'

const emit = defineEmits<{
  (e: 'close'): void
}>()

const themeStore = useThemeStore()
const keymapStore = useKeymapStore()
const toolStore = useToolStore()
const projectStore = useProjectStore()

type PrefTab = 'themes' | 'keymap' | 'interface' | 'viewport' | 'input' | 'system'
const activeTab = ref<PrefTab>('themes')

// Movable modal position state
const modalPos = ref({ x: Math.max(16, Math.round(window.innerWidth / 2 - 540)), y: 40 })
const { startDrag } = useFloatingDrag(modalPos, { minX: 10, minY: 10, maxPadX: 300, maxPadY: 100 })

// ----------------------------------------------------
// THEMES TAB STATE & FILTERS
// ----------------------------------------------------
const themeCategoryFilter = ref<string>('All')
const themeSearchQuery = ref<string>('')

const filteredThemes = computed(() => {
  let list = themeStore.presets
  if (themeCategoryFilter.value !== 'All') {
    list = list.filter(t => t.category === themeCategoryFilter.value)
  }
  if (themeSearchQuery.value.trim()) {
    const q = themeSearchQuery.value.toLowerCase()
    list = list.filter(t => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q))
  }
  return list
})

const importError = ref('')
const studioGroup = ref(TOKEN_GROUPS[0]!.id)

function tokenValue(key: ThemeColorKey) {
  return themeStore.activeColors[key]
}

function isOverridden(key: ThemeColorKey) {
  return key in themeStore.customColors
}

function onTokenInput(key: ThemeColorKey, event: Event) {
  const value = (event.target as HTMLInputElement).value
  themeStore.setColor(key, value)
}

function exportThemeFile() {
  const blob = new Blob([themeStore.exportThemeJson()], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${themeStore.activePreset.name.replace(/\s+/g, '-').toLowerCase()}.polyecho-theme.json`
  a.click()
  URL.revokeObjectURL(url)
}

function importThemeFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  void file.text().then((text) => {
    importError.value = themeStore.importThemeJson(text) ? '' : 'Could not read that theme file.'
  })
  ;(event.target as HTMLInputElement).value = ''
}

// ----------------------------------------------------
// KEYMAP TAB STATE & RECORDING
// ----------------------------------------------------
const keymapSearchQuery = ref<string>('')
const keymapCategoryFilter = ref<string>('All')
const activeRecordingId = ref<string | null>(null)

const filteredKeybindings = computed(() => {
  let list = keymapStore.bindings
  if (keymapCategoryFilter.value !== 'All') {
    list = list.filter(b => b.category === keymapCategoryFilter.value)
  }
  if (keymapSearchQuery.value.trim()) {
    const q = keymapSearchQuery.value.toLowerCase()
    list = list.filter(b => b.label.toLowerCase().includes(q) || b.currentKey.toLowerCase().includes(q))
  }
  return list
})

function startKeyRecording(bindingId: string) {
  activeRecordingId.value = bindingId
}

function handleKeyRecord(e: KeyboardEvent) {
  if (!activeRecordingId.value) return
  e.preventDefault()
  e.stopPropagation()

  if (e.key === 'Escape') {
    activeRecordingId.value = null
    return
  }

  // Build chord string
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (e.metaKey) parts.push('Meta')

  let key = e.key
  if (key === 'Control' || key === 'Alt' || key === 'Shift' || key === 'Meta') {
    return // Wait for base key
  }
  if (key === ' ') key = 'Space'
  if (key.length === 1) key = key.toLowerCase()

  parts.push(key)
  const fullChord = parts.join('+')

  keymapStore.rebind(activeRecordingId.value, fullChord)
  activeRecordingId.value = null
}

// ----------------------------------------------------
// VIEWPORT & INPUT SETTINGS
// ----------------------------------------------------
const stylusCurve = ref<'linear' | 'soft' | 'hard'>('linear')
const maxUndoSteps = ref<number>(50)
const autoSaveInterval = ref<number>(5) // minutes

const starterPreview = computed(() => {
  const pb = new PixelBuffer(64, 64)
  fillDefaultTexture(pb, projectStore.defaultTexturePref)
  return pb.toDataURL()
})

function chooseStarter(kind: (typeof DEFAULT_TEXTURE_PRESETS)[number]['kind']) {
  projectStore.setDefaultTexturePref({ kind })
}

function chooseStarterColor(event: Event) {
  projectStore.setDefaultTexturePref({
    kind: 'color',
    color: (event.target as HTMLInputElement).value
  })
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyRecord, true)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyRecord, true)
})
</script>

<template>
  <div 
    class="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-start justify-center select-none font-sans"
    @click.self="emit('close')"
  >
    <!-- Draggable Properties Window -->
    <div 
      data-floating-panel
      class="w-[1080px] max-w-[96vw] h-[680px] max-h-[92vh] bg-ui-panel border border-ui-borderStrong rounded-xs shadow-2xl overflow-hidden flex flex-col"
      :style="{ position: 'absolute', left: `${modalPos.x}px`, top: `${modalPos.y}px` }"
    >
      <!-- Titlebar / Header -->
      <div 
        @pointerdown="startDrag"
        class="h-9 bg-ui-header border-b border-ui-borderSubtle px-3 flex items-center justify-between cursor-move select-none shrink-0 touch-none"
      >
        <div class="flex items-center gap-2 text-xs font-mono font-bold text-ui-textPrimary">
          <GripHorizontal class="w-4 h-4 text-ui-textMuted" />
          <Sliders class="w-3.5 h-3.5 text-amber-400" />
          <span>PolyEcho Preferences & Properties</span>
        </div>

        <button 
          @click="emit('close')"
          class="p-1 rounded-xs hover:bg-rose-900/60 text-ui-textMuted hover:text-rose-200 transition"
          title="Close Properties (Esc)"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Main Body: Tabs Left + Content Right -->
      <div class="flex-1 flex overflow-hidden">
        <!-- Sidebar Navigation -->
        <div class="w-44 bg-ui-input/40 border-r border-ui-borderSubtle p-1.5 space-y-1 font-mono text-xs shrink-0 flex flex-col justify-between">
          <div class="space-y-0.5">
            <button 
              @click="activeTab = 'themes'"
              class="w-full text-left px-2.5 py-1.5 rounded-xs flex items-center gap-2 transition"
              :class="activeTab === 'themes' ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/50 shadow-xs' : 'text-ui-textSecondary hover:bg-ui-hover'"
            >
              <Palette class="w-3.5 h-3.5" />
              <span>Themes ({{ themeStore.presets.length }})</span>
            </button>

            <button 
              @click="activeTab = 'keymap'"
              class="w-full text-left px-2.5 py-1.5 rounded-xs flex items-center gap-2 transition"
              :class="activeTab === 'keymap' ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/50 shadow-xs' : 'text-ui-textSecondary hover:bg-ui-hover'"
            >
              <Keyboard class="w-3.5 h-3.5" />
              <span>Keymap & Keys</span>
            </button>

            <button 
              @click="activeTab = 'viewport'"
              class="w-full text-left px-2.5 py-1.5 rounded-xs flex items-center gap-2 transition"
              :class="activeTab === 'viewport' ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/50 shadow-xs' : 'text-ui-textSecondary hover:bg-ui-hover'"
            >
              <Monitor class="w-3.5 h-3.5" />
              <span>3D Viewport</span>
            </button>

            <button 
              @click="activeTab = 'input'"
              class="w-full text-left px-2.5 py-1.5 rounded-xs flex items-center gap-2 transition"
              :class="activeTab === 'input' ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/50 shadow-xs' : 'text-ui-textSecondary hover:bg-ui-hover'"
            >
              <PenTool class="w-3.5 h-3.5" />
              <span>Input & Stylus</span>
            </button>

            <button 
              @click="activeTab = 'interface'"
              class="w-full text-left px-2.5 py-1.5 rounded-xs flex items-center gap-2 transition"
              :class="activeTab === 'interface' ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/50 shadow-xs' : 'text-ui-textSecondary hover:bg-ui-hover'"
            >
              <Sliders class="w-3.5 h-3.5" />
              <span>Interface UI</span>
            </button>

            <button 
              @click="activeTab = 'system'"
              class="w-full text-left px-2.5 py-1.5 rounded-xs flex items-center gap-2 transition"
              :class="activeTab === 'system' ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/50 shadow-xs' : 'text-ui-textSecondary hover:bg-ui-hover'"
            >
              <HardDrive class="w-3.5 h-3.5" />
              <span>System & Memory</span>
            </button>
          </div>

          <div class="p-2 border-t border-ui-borderSubtle/60 text-[10px] text-ui-textMuted">
            <span>PolyEcho v1.0.0</span>
          </div>
        </div>

        <!-- Content Area -->
        <div
          class="flex-1 bg-ui-panel p-4 font-mono text-xs min-h-0"
          :class="activeTab === 'themes' ? 'overflow-hidden flex flex-col' : 'overflow-y-auto custom-scrollbar'"
        >
          <!-- ==================================================== -->
          <!-- 1. THEMES TAB -->
          <!-- ==================================================== -->
          <div v-if="activeTab === 'themes'" class="flex-1 min-h-0 flex flex-col gap-2">
            <div class="flex items-start justify-between border-b border-ui-borderSubtle pb-2 shrink-0 gap-3">
              <div>
                <h3 class="font-bold text-sm text-ui-textPrimary flex items-center gap-1.5">
                  <Palette class="w-4 h-4 text-amber-400" />
                  <span>Theme engine</span>
                </h3>
                <p class="text-[11px] text-ui-textMuted mt-0.5">
                  {{ themeStore.activePreset.name }} · {{ Object.keys(themeStore.activeColors).length }} tokens
                  <span v-if="themeStore.hasCustomOverrides" class="text-amber-300"> · edited</span>
                </p>
              </div>
              <div class="flex items-center gap-2 flex-wrap justify-end">
                <select
                  v-model="themeCategoryFilter"
                  class="bg-ui-input border border-ui-borderDefault rounded-xs px-2 py-1 text-xs text-ui-textPrimary focus:outline-none"
                >
                  <option value="All">All Categories</option>
                  <option value="Custom">Custom</option>
                  <option value="Operating Systems">Operating Systems</option>
                  <option value="Game Systems">Game Systems</option>
                  <option value="DCC & Pro Studios">DCC & Pro Studios</option>
                </select>
                <div class="relative">
                  <input
                    type="text"
                    v-model="themeSearchQuery"
                    placeholder="Search theme..."
                    class="bg-ui-input border border-ui-borderDefault rounded-xs pl-6 pr-2 py-1 text-xs text-ui-textPrimary focus:outline-none w-36"
                  />
                  <Search class="w-3 h-3 text-ui-textMuted absolute left-2 top-2" />
                </div>
              </div>
            </div>

            <div class="flex-1 min-h-0 grid grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)] gap-3">
              <div class="min-h-0 overflow-y-auto custom-scrollbar pr-1 space-y-2">
                <div class="grid grid-cols-2 gap-2">
                  <div
                    v-for="theme in filteredThemes"
                    :key="theme.id"
                    role="button"
                    tabindex="0"
                    @click="themeStore.setTheme(theme.id)"
                    @keydown.enter="themeStore.setTheme(theme.id)"
                    @keydown.space.prevent="themeStore.setTheme(theme.id)"
                    class="p-2 rounded-xs border transition cursor-pointer flex flex-col justify-between select-none group"
                    :class="themeStore.currentThemeId === theme.id ? 'border-amber-500 bg-amber-500/15 shadow-md ring-1 ring-amber-400/50' : 'border-ui-borderDefault bg-ui-input/30 hover:border-ui-borderStrong hover:bg-ui-hover'"
                  >
                    <div>
                      <div class="flex items-center justify-between gap-1">
                        <span class="font-bold text-xs truncate" :class="themeStore.currentThemeId === theme.id ? 'text-amber-300' : 'text-ui-textPrimary'">
                          {{ theme.name }}
                        </span>
                        <span class="text-[9px] uppercase px-1 rounded-xs bg-ui-input border border-ui-borderSubtle text-ui-textMuted shrink-0">
                          {{ theme.category === 'Custom' ? 'Custom' : theme.category.split(' ')[0] }}
                        </span>
                      </div>
                      <p class="text-[10px] text-ui-textMuted mt-1 line-clamp-2 leading-relaxed">
                        {{ theme.description }}
                      </p>
                    </div>
                    <div class="mt-2 flex items-center justify-between pt-2 border-t border-ui-borderSubtle/40">
                      <div class="flex items-center gap-0.5">
                        <span class="w-3 h-3 rounded-xs border border-black/30" :style="{ backgroundColor: theme.colors.bgPanel }" />
                        <span class="w-3 h-3 rounded-xs border border-black/30" :style="{ backgroundColor: theme.colors.accentColor }" />
                        <span class="w-3 h-3 rounded-xs border border-black/30" :style="{ backgroundColor: theme.colors.selectionColor }" />
                        <span class="w-3 h-3 rounded-xs border border-black/30" :style="{ backgroundColor: theme.colors.viewportBg }" />
                        <span class="w-3 h-3 rounded-xs border border-black/30" :style="{ backgroundColor: theme.colors.gizmoX }" />
                        <span class="w-3 h-3 rounded-xs border border-black/30" :style="{ backgroundColor: theme.colors.gizmoY }" />
                        <span class="w-3 h-3 rounded-xs border border-black/30" :style="{ backgroundColor: theme.colors.gizmoZ }" />
                      </div>
                      <button
                        v-if="theme.category === 'Custom'"
                        type="button"
                        class="p-0.5 text-ui-textMuted hover:text-rose-300"
                        title="Delete custom theme"
                        @click.stop="themeStore.deleteUserTheme(theme.id)"
                      >
                        <Trash2 class="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div class="min-h-0 overflow-y-auto custom-scrollbar border border-ui-borderSubtle rounded-xs bg-ui-input/20 p-2.5 flex flex-col gap-2">
                <div class="flex items-center justify-between gap-1">
                  <span class="font-bold text-ui-textPrimary">Color studio</span>
                  <div class="flex items-center gap-1">
                    <button
                      type="button"
                      class="px-1.5 py-0.5 rounded-xs border border-ui-borderSubtle hover:bg-ui-hover text-[10px] flex items-center gap-1"
                      title="Duplicate as custom theme"
                      @click="themeStore.duplicateAsUserTheme()"
                    >
                      <Copy class="w-3 h-3" /> Save copy
                    </button>
                    <button
                      type="button"
                      class="px-1.5 py-0.5 rounded-xs border border-ui-borderSubtle hover:bg-ui-hover text-[10px] flex items-center gap-1"
                      @click="exportThemeFile"
                    >
                      <Download class="w-3 h-3" /> Export
                    </button>
                    <label class="px-1.5 py-0.5 rounded-xs border border-ui-borderSubtle hover:bg-ui-hover text-[10px] flex items-center gap-1 cursor-pointer">
                      <Upload class="w-3 h-3" /> Import
                      <input type="file" accept="application/json,.json" class="hidden" @change="importThemeFile" />
                    </label>
                  </div>
                </div>
                <p v-if="importError" class="text-[10px] text-rose-300">{{ importError }}</p>
                <div class="flex flex-wrap gap-1">
                  <button
                    v-for="group in TOKEN_GROUPS"
                    :key="group.id"
                    type="button"
                    class="px-1.5 py-0.5 rounded-xs text-[10px] border"
                    :class="studioGroup === group.id ? 'border-amber-500 bg-amber-500/20 text-amber-200' : 'border-ui-borderSubtle text-ui-textMuted hover:bg-ui-hover'"
                    @click="studioGroup = group.id"
                  >
                    {{ group.label }}
                  </button>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-[10px] text-ui-textMuted">{{ TOKEN_GROUPS.find(g => g.id === studioGroup)?.hint }}</span>
                  <button
                    type="button"
                    class="text-[10px] text-ui-textMuted hover:text-ui-textPrimary flex items-center gap-1 disabled:opacity-40"
                    :disabled="!themeStore.hasCustomOverrides"
                    @click="themeStore.resetAllColors()"
                  >
                    <RotateCcw class="w-3 h-3" /> Reset edits
                  </button>
                </div>
                <div class="space-y-1">
                  <div
                    v-for="key in TOKEN_GROUPS.find(g => g.id === studioGroup)?.keys || []"
                    :key="key"
                    class="flex items-center gap-2"
                  >
                    <input
                      type="color"
                      class="w-7 h-6 rounded-xs border border-ui-borderDefault bg-transparent cursor-pointer shrink-0"
                      :value="tokenValue(key)"
                      :title="TOKEN_META[key].hint"
                      @input="onTokenInput(key, $event)"
                    />
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center justify-between gap-1">
                        <span class="text-[11px] text-ui-textPrimary truncate">{{ TOKEN_META[key].label }}</span>
                        <button
                          v-if="isOverridden(key)"
                          type="button"
                          class="text-[9px] text-amber-300 hover:underline"
                          @click="themeStore.resetColor(key)"
                        >
                          reset
                        </button>
                      </div>
                      <input
                        type="text"
                        class="w-full bg-ui-input border border-ui-borderSubtle rounded-xs px-1 py-0.5 text-[10px] font-mono text-ui-textSecondary"
                        :value="tokenValue(key)"
                        @change="onTokenInput(key, $event)"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- ==================================================== -->
          <!-- 2. KEYMAP TAB -->
          <!-- ==================================================== -->
          <div v-else-if="activeTab === 'keymap'" class="space-y-3">
            <div class="flex items-center justify-between border-b border-ui-borderSubtle pb-2">
              <div>
                <h3 class="font-bold text-sm text-ui-textPrimary flex items-center gap-1.5">
                  <Keyboard class="w-4 h-4 text-amber-400" />
                  <span>Interactive Keyboard Shortcut Customizer</span>
                </h3>
                <p class="text-[11px] text-ui-textMuted mt-0.5">Click any shortcut button to record a new key chord.</p>
              </div>

              <div class="flex items-center gap-2">
                <button 
                  @click="keymapStore.resetAllDefaults()"
                  class="px-2 py-1 bg-ui-input hover:bg-ui-hover border border-ui-borderDefault rounded-xs text-[10px] text-ui-textMuted hover:text-white flex items-center gap-1 transition"
                  title="Reset all keybindings to Blender defaults"
                >
                  <RotateCcw class="w-3 h-3" />
                  <span>Reset All</span>
                </button>

                <select 
                  v-model="keymapCategoryFilter"
                  class="bg-ui-input border border-ui-borderDefault rounded-xs px-2 py-1 text-xs text-ui-textPrimary focus:outline-none"
                >
                  <option value="All">All Categories</option>
                  <option value="Modeling">Modeling</option>
                  <option value="Selection">Selection</option>
                  <option value="Transform">Transform</option>
                  <option value="Viewport">Viewport</option>
                  <option value="System">System</option>
                </select>

                <div class="relative">
                  <input 
                    type="text" 
                    v-model="keymapSearchQuery"
                    placeholder="Search action or key..."
                    class="bg-ui-input border border-ui-borderDefault rounded-xs pl-6 pr-2 py-1 text-xs text-ui-textPrimary focus:outline-none w-36"
                  />
                  <Search class="w-3 h-3 text-ui-textMuted absolute left-2 top-2" />
                </div>
              </div>
            </div>

            <!-- Keybindings Table -->
            <div class="border border-ui-borderDefault rounded-xs overflow-hidden divide-y divide-ui-borderSubtle/60">
              <div 
                v-for="item in filteredKeybindings"
                :key="item.id"
                class="px-3 py-1.5 flex items-center justify-between hover:bg-ui-hover transition"
                :class="{ 'bg-amber-500/10': activeRecordingId === item.id }"
              >
                <div>
                  <span class="font-medium text-ui-textPrimary">{{ item.label }}</span>
                  <span class="ml-2 text-[10px] text-ui-textMuted">({{ item.category }})</span>
                </div>

                <div class="flex items-center gap-2">
                  <button 
                    @click="startKeyRecording(item.id)"
                    class="px-2 py-1 rounded-xs border text-xs font-bold transition min-w-[70px] text-center"
                    :class="activeRecordingId === item.id ? 'bg-amber-500 text-black border-amber-400 animate-pulse' : 'bg-ui-input border-ui-borderStrong text-amber-400 hover:border-amber-400 hover:text-white'"
                  >
                    {{ activeRecordingId === item.id ? 'Press Key...' : item.currentKey }}
                  </button>

                  <button 
                    v-if="item.currentKey !== item.defaultKey"
                    @click="keymapStore.resetToDefault(item.id)"
                    class="p-1 text-ui-textMuted hover:text-rose-300"
                    title="Reset to default key"
                  >
                    <RotateCcw class="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- ==================================================== -->
          <!-- 3. VIEWPORT TAB -->
          <!-- ==================================================== -->
          <div v-else-if="activeTab === 'viewport'" class="space-y-4">
            <div class="border-b border-ui-borderSubtle pb-2">
              <h3 class="font-bold text-sm text-ui-textPrimary">3D Viewport & Rendering Engine</h3>
              <p class="text-[11px] text-ui-textMuted mt-0.5">Configure 3D viewport display, diagnostic overlays, and shading defaults.</p>
            </div>

            <div class="space-y-3">
              <div class="flex items-center justify-between py-1 border-b border-ui-borderSubtle/40">
                <div>
                  <span class="text-ui-textPrimary font-medium">Sticky CAD Viewport Controls</span>
                  <p class="text-[10px] text-ui-textMuted">Click Pan, Orbit, or Zoom to lock that view tool until you click it again or press Esc. Off uses click-and-hold.</p>
                </div>
                <input type="checkbox" v-model="toolStore.stickyViewportControls" class="rounded-xs text-amber-500" />
              </div>

              <div class="flex items-center justify-between py-1 border-b border-ui-borderSubtle/40">
                <div>
                  <span class="text-ui-textPrimary font-medium">Default Shading Model</span>
                  <p class="text-[10px] text-ui-textMuted">Initial viewport shading when loading scenes.</p>
                </div>
                <select v-model="toolStore.viewport.shading" class="bg-ui-input border border-ui-borderDefault rounded-xs px-2 py-1 text-xs text-ui-textPrimary">
                  <option value="textured">Clean Textured (Default)</option>
                  <option value="solid">Solid Shaded</option>
                  <option value="wireframe">Wireframe</option>
                  <option value="psx">PSX Retro Affine / Jitter</option>
                </select>
              </div>

              <div class="flex items-start justify-between py-2 border-b border-ui-borderSubtle/40 gap-3">
                <div class="min-w-0">
                  <span class="text-ui-textPrimary font-medium flex items-center gap-1.5">
                    <Image class="w-3.5 h-3.5 text-amber-400" />
                    Starter texture
                  </span>
                  <p class="text-[10px] text-ui-textMuted mt-0.5">Image used for new projects and Restore starter texture. Solid colors replace the retro atlas on the default cube.</p>
                </div>
                <div class="flex flex-col items-end gap-2 shrink-0">
                  <img
                    :src="starterPreview"
                    alt="Starter texture preview"
                    class="w-16 h-16 rounded-xs border border-ui-borderDefault bg-ui-input object-contain"
                    style="image-rendering: pixelated"
                  />
                  <div class="flex flex-wrap gap-1 justify-end max-w-[18rem]">
                    <button
                      v-for="preset in DEFAULT_TEXTURE_PRESETS"
                      :key="preset.kind"
                      type="button"
                      class="px-1.5 py-1 rounded-xs border text-[10px] font-bold uppercase flex items-center gap-1"
                      :class="projectStore.defaultTexturePref.kind === preset.kind ? 'border-amber-500 bg-amber-500/20 text-amber-200' : 'border-ui-borderSubtle text-ui-textMuted hover:bg-ui-hover'"
                      @click="chooseStarter(preset.kind)"
                    >
                      <span
                        v-if="preset.kind !== 'color'"
                        class="w-2.5 h-2.5 rounded-xs border border-black/30 shrink-0"
                        :class="preset.kind === 'checker' ? 'starter-check' : ''"
                        :style="preset.kind === 'checker' ? undefined : { backgroundColor: preset.swatch }"
                      />
                      {{ preset.label }}
                    </button>
                  </div>
                  <label
                    v-if="projectStore.defaultTexturePref.kind === 'color'"
                    class="flex items-center gap-2 text-[10px] text-ui-textMuted"
                  >
                    Color
                    <input
                      type="color"
                      class="w-8 h-6 rounded-xs border border-ui-borderDefault bg-transparent cursor-pointer"
                      :value="projectStore.defaultTexturePref.color"
                      @change="chooseStarterColor"
                    />
                  </label>
                </div>
              </div>

              <div class="flex items-center justify-between py-1 border-b border-ui-borderSubtle/40">
                <div>
                  <span class="text-ui-textPrimary font-medium">Wireframe Overlay Opacity</span>
                  <p class="text-[10px] text-ui-textMuted">Dark mesh-edge overlay (creases). Higher = more Blockbench-like.</p>
                </div>
                <div class="flex items-center gap-2">
                  <input type="range" min="0.1" max="1.0" step="0.05" v-model.number="toolStore.viewport.wireframeOpacity" class="w-32 accent-amber-500" />
                  <span class="w-10 text-right">{{ Math.round((toolStore.viewport.wireframeOpacity || 0.6) * 100) }}%</span>
                </div>
              </div>

              <div class="flex items-center justify-between py-1 border-b border-ui-borderSubtle/40">
                <div>
                  <span class="text-ui-textPrimary font-medium">Invert Zoom Direction</span>
                  <p class="text-[10px] text-ui-textMuted">Reverse mouse wheel and trackpad zoom direction.</p>
                </div>
                <input type="checkbox" v-model="toolStore.viewport.invertZoom" class="rounded-xs text-amber-500" />
              </div>

              <div class="flex items-center justify-between py-1 border-b border-ui-borderSubtle/40">
                <div>
                  <span class="text-ui-textPrimary font-medium">Diagnostic Face Orientation</span>
                  <p class="text-[10px] text-ui-textMuted">Display Cobalt Blue for outside normals and Crimson Red for flipped backfaces.</p>
                </div>
                <input type="checkbox" v-model="toolStore.viewport.faceOrientation" class="rounded-xs text-amber-500" />
              </div>
            </div>
          </div>

          <!-- ==================================================== -->
          <!-- 4. INPUT & STYLUS TAB -->
          <!-- ==================================================== -->
          <div v-else-if="activeTab === 'input'" class="space-y-4">
            <div class="border-b border-ui-borderSubtle pb-2">
              <h3 class="font-bold text-sm text-ui-textPrimary">Input, Stylus & Touch Optimization</h3>
              <p class="text-[11px] text-ui-textMuted mt-0.5">Stylus pen pressure calibration and mouse button routing.</p>
            </div>

            <div class="space-y-3">
              <div class="flex items-center justify-between py-1 border-b border-ui-borderSubtle/40">
                <div>
                  <span class="text-ui-textPrimary font-medium">Enable Stylus Pressure Sensitivity</span>
                  <p class="text-[10px] text-ui-textMuted">Modulate brush size and vertex falloff dynamically based on pen pressure.</p>
                </div>
                <input type="checkbox" v-model="toolStore.stylusPressureEnabled" class="rounded-xs text-amber-500" />
              </div>

              <div class="flex items-center justify-between py-1 border-b border-ui-borderSubtle/40">
                <div>
                  <span class="text-ui-textPrimary font-medium">Stylus mode notifications</span>
                  <p class="text-[10px] text-ui-textMuted">Show the floating Move / Rotate / Scale panel. Off by default. Tool status stays in the status bar.</p>
                </div>
                <input type="checkbox" v-model="toolStore.stylusModeNotifications" class="rounded-xs text-amber-500" />
              </div>

              <div class="flex items-center justify-between py-1 border-b border-ui-borderSubtle/40">
                <div>
                  <span class="text-ui-textPrimary font-medium">Sticky CAD Viewport Controls</span>
                  <p class="text-[10px] text-ui-textMuted">Same as File → Properties → Viewport. Click Pan, Orbit, or Zoom to lock that view tool until you click it again or press Esc.</p>
                </div>
                <input type="checkbox" v-model="toolStore.stickyViewportControls" class="rounded-xs text-amber-500" />
              </div>

              <div class="flex items-center justify-between py-1 border-b border-ui-borderSubtle/40">
                <div>
                  <span class="text-ui-textPrimary font-medium">Stylus Pressure Curve</span>
                  <p class="text-[10px] text-ui-textMuted">Pressure response curve for graphic drawing tablets.</p>
                </div>
                <select v-model="stylusCurve" class="bg-ui-input border border-ui-borderDefault rounded-xs px-2 py-1 text-xs text-ui-textPrimary">
                  <option value="linear">Linear (1:1 Standard)</option>
                  <option value="soft">Soft (Easy Light Strokes)</option>
                  <option value="hard">Hard (High Force Threshold)</option>
                </select>
              </div>

              <div class="flex items-center justify-between py-1 border-b border-ui-borderSubtle/40">
                <div>
                  <span class="text-ui-textPrimary font-medium">Specials Context Menu Trigger</span>
                  <p class="text-[10px] text-ui-textMuted">Button used to open 3D specials popup menu.</p>
                </div>
                <span class="text-amber-400 font-bold">Middle Mouse Button / W</span>
              </div>
            </div>
          </div>

          <!-- ==================================================== -->
          <!-- 5. INTERFACE TAB -->
          <!-- ==================================================== -->
          <div v-else-if="activeTab === 'interface'" class="space-y-4">
            <div class="border-b border-ui-borderSubtle pb-2">
              <h3 class="font-bold text-sm text-ui-textPrimary">Interface & UI Scaling</h3>
              <p class="text-[11px] text-ui-textMuted mt-0.5">Scale UI elements for High-DPI screens, 4K monitors, or compact laptop displays.</p>
            </div>

            <div class="space-y-3">
              <div class="flex items-center justify-between py-1 border-b border-ui-borderSubtle/40">
                <div>
                  <span class="text-ui-textPrimary font-medium">Interface Scale Factor</span>
                  <p class="text-[10px] text-ui-textMuted">Adjust overall size of buttons, toolbars, and panels.</p>
                </div>
                <div class="flex items-center gap-2">
                  <input type="range" min="80" max="140" step="5" :value="themeStore.uiScale" @input="themeStore.setScale(Number(($event.target as HTMLInputElement).value))" class="w-32 accent-amber-500" />
                  <span class="w-12 text-right">{{ themeStore.uiScale }}%</span>
                </div>
              </div>

              <div class="flex items-center justify-between py-1 border-b border-ui-borderSubtle/40">
                <div>
                  <span class="text-ui-textPrimary font-medium">Compact Stylus Color Chips</span>
                  <p class="text-[10px] text-ui-textMuted">Use streamlined 20px color swatches in inspector and UV painting.</p>
                </div>
                <span class="text-emerald-400 font-bold">Enabled</span>
              </div>
            </div>
          </div>

          <!-- ==================================================== -->
          <!-- 6. SYSTEM & MEMORY TAB -->
          <!-- ==================================================== -->
          <div v-else-if="activeTab === 'system'" class="space-y-4">
            <div class="border-b border-ui-borderSubtle pb-2">
              <h3 class="font-bold text-sm text-ui-textPrimary">System, Memory & Auto-Save</h3>
              <p class="text-[11px] text-ui-textMuted mt-0.5">Undo history depth and automatic session persistence.</p>
            </div>

            <div class="space-y-3">
              <div class="flex items-center justify-between py-1 border-b border-ui-borderSubtle/40">
                <div>
                  <span class="text-ui-textPrimary font-medium">Document Recovery</span>
                  <p class="text-[10px] text-ui-textMuted">Show the unsaved-session banner when an autosave is found. Off by default.</p>
                </div>
                <input
                  type="checkbox"
                  :checked="projectStore.documentRecoveryEnabled"
                  class="accent-amber-500"
                  @change="projectStore.setDocumentRecoveryEnabled(($event.target as HTMLInputElement).checked)"
                />
              </div>

              <div class="flex items-center justify-between py-1 border-b border-ui-borderSubtle/40">
                <div>
                  <span class="text-ui-textPrimary font-medium">Max Undo Steps</span>
                  <p class="text-[10px] text-ui-textMuted">Depth of the geometry and canvas undo/redo history stack.</p>
                </div>
                <div class="flex items-center gap-2">
                  <input type="range" min="10" max="100" step="5" v-model.number="maxUndoSteps" class="w-32 accent-amber-500" />
                  <span class="w-12 text-right">{{ maxUndoSteps }} steps</span>
                </div>
              </div>

              <div class="flex items-center justify-between py-1 border-b border-ui-borderSubtle/40">
                <div>
                  <span class="text-ui-textPrimary font-medium">Auto-Save Backup Interval</span>
                  <p class="text-[10px] text-ui-textMuted">Periodic snapshot frequency saved to browser local database.</p>
                </div>
                <select v-model.number="autoSaveInterval" class="bg-ui-input border border-ui-borderDefault rounded-xs px-2 py-1 text-xs text-ui-textPrimary">
                  <option :value="1">Every 1 minute</option>
                  <option :value="5">Every 5 minutes</option>
                  <option :value="10">Every 10 minutes</option>
                  <option :value="0">Disabled</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer Buttons -->
      <div class="h-10 bg-ui-header border-t border-ui-borderSubtle px-4 flex items-center justify-between shrink-0 font-mono text-xs">
        <div class="text-[11px] text-ui-textMuted">
          <span>Settings automatically persist in local storage.</span>
        </div>

        <div class="flex items-center gap-2">
          <button 
            @click="emit('close')"
            class="px-4 py-1 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xs shadow-xs transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.starter-check {
  background: repeating-conic-gradient(#d1d5db 0% 25%, #6b7280 0% 50%) 0 0 / 6px 6px;
}
</style>
