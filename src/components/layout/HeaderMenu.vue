<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { useToolStore } from '../../stores/toolStore'
import { useHistoryStore } from '../../stores/historyStore'
import { useAnimationStore } from '../../stores/animationStore'
import BlenderIcon from '../icons/BlenderIcon.vue'
import PolyEchoLogo from '../icons/PolyEchoLogo.vue'
import ImportTextureModal from '../modals/ImportTextureModal.vue'
import { 
  Download, 
  Upload,
  Undo2, 
  Redo2, 
  Keyboard, 
  FolderOpen,
  Save,
  Plus,
  Image as ImageIcon,
  Tv,
  Palette,
  Compass,
  Crosshair,
  Magnet,
  FlipHorizontal,
  ChevronDown,
  Check,
  Sliders,
  Layers,
  Search
} from 'lucide-vue-next'

import type { PivotPoint } from '../../types/tools'
import { ProjectSerializer } from '../../core/project/ProjectSerializer'
import { ObjImport } from '../../core/import/ObjImport'
import { GltfImport } from '../../core/import/GltfImport'
import { EDITOR_EVENTS, requestCameraView, requestPrimitiveMenu } from '../../core/commands/editorCommands'

type NavMenu = 'file' | 'edit' | 'add' | 'workspace' | 'space' | 'view' | 'snap' | 'overlays' | 'shade' | null
type CameraView = 'persp' | 'top' | 'front' | 'right' | 'iso'

const projectStore = useProjectStore()
const toolStore = useToolStore()
const historyStore = useHistoryStore()
const animationStore = useAnimationStore()

const isImporting = ref(false)
const activeDropdown = ref<NavMenu>(null)
const cameraView = ref<CameraView>('persp')

defineEmits<{
  (e: 'open-export'): void
  (e: 'open-hotkeys'): void
  (e: 'open-preferences'): void
  (e: 'new-project'): void
}>()

// Hidden file input refs
const loadProjectInput = ref<HTMLInputElement | null>(null)
const importObjInput = ref<HTMLInputElement | null>(null)
const importGltfInput = ref<HTMLInputElement | null>(null)
const importTextureInput = ref<HTMLInputElement | null>(null)
const showImportModal = ref(false)
const pendingImportFile = ref<File | null>(null)

function toggleDropdown(name: NavMenu) {
  activeDropdown.value = activeDropdown.value === name ? null : name
}

function closeDropdowns() {
  activeDropdown.value = null
}

function setCameraView(view: CameraView) {
  cameraView.value = view
  toolStore.viewport.quadView = false
  requestCameraView(view)
  closeDropdowns()
}

function onCameraViewEvent(e: Event) {
  const view = (e as CustomEvent).detail as CameraView | undefined
  if (view) cameraView.value = view
}

const pivotLabel: Record<PivotPoint, string> = {
  median: 'Median',
  active: 'Active',
  individual: 'Indiv',
  cursor: 'Cursor',
}

const viewLabel: Record<CameraView, string> = {
  persp: 'Persp',
  top: 'Top',
  front: 'Front',
  right: 'Right',
  iso: 'Iso',
}

const objectShade = computed(() => projectStore.activeMesh?.shadeMode || toolStore.viewport.shadeMode)
const snapTargetOn = computed(() => toolStore.snapping.vertex || toolStore.snapping.edge || toolStore.snapping.face)
const overlayOn = computed(() =>
  toolStore.viewport.faceOrientation || !toolStore.viewport.showGrid || !toolStore.viewport.showAxes
)

function applyObjectShade(mode: 'flat' | 'smooth' | 'auto') {
  projectStore.setShadeMode(mode)
  if (mode !== 'auto') toolStore.viewport.shadeMode = mode
  closeDropdowns()
}

function triggerCommandPalette() {
  closeDropdowns()
  window.dispatchEvent(new CustomEvent('open-command-palette'))
}

const shadingModes = [
  { id: 'textured' as const, icon: 'shading-textured' as const, title: 'Textured' },
  { id: 'solid' as const, icon: 'shading-solid' as const, title: 'Solid' },
  { id: 'wireframe' as const, icon: 'shading-wire' as const, title: 'Wireframe' },
  { id: 'psx' as const, icon: 'shading-rendered' as const, title: 'PSX Retro' },
]

const workspaces = [
  { id: 'model' as const, label: 'Modeling', icon: 'mesh-cube' as const, desc: '3D Mesh Polygon Editing' },
  { id: 'blockout' as const, label: 'Blockout', icon: 'tool-draw' as const, desc: 'Multi-View Reference Tracing' },
  { id: 'uvpaint' as const, label: 'UV / Paint', icon: 'brush' as const, desc: 'UV Unwrap & Pixel Texture Painting' },
  { id: 'rig' as const, label: 'Rigging', icon: 'bone' as const, desc: 'Skeletal Armature & Weight Painting' },
  { id: 'animate' as const, label: 'Animation', icon: 'pose' as const, desc: 'Keyframe Timeline & Posing' }
]

function toggleSymmetry(axis: 'X' | 'Y' | 'Z') {
  if (axis === 'X') toolStore.viewport.symmetryX = !toolStore.viewport.symmetryX
  if (axis === 'Y') toolStore.viewport.symmetryY = !toolStore.viewport.symmetryY
  if (axis === 'Z') toolStore.viewport.symmetryZ = !toolStore.viewport.symmetryZ
}

function onDocPointerDown(e: PointerEvent) {
  const root = (e.target as HTMLElement | null)?.closest?.('.master-header-container')
  if (!root) closeDropdowns()
}

// File / Project handlers
function saveProject() {
  const jsonStr = ProjectSerializer.serialize(
    projectStore.projectName,
    projectStore.meshes,
    projectStore.pixelBuffer.canvas,
    projectStore.activePalette,
    projectStore.materials,
    animationStore.armature,
    animationStore.armature.clips,
    animationStore.armature.activeClipId,
    animationStore.currentFrame,
    toolStore.viewport,
    projectStore.textures,
    projectStore.referenceImages
  )
  ProjectSerializer.downloadProject(jsonStr, projectStore.projectName || 'PSX_Model')
  closeDropdowns()
}

async function handleLoadProject(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    const proj = ProjectSerializer.deserialize(text)
    projectStore.projectName = proj.projectName || 'Project'
    projectStore.meshes = proj.meshes || []
    if (proj.materials) projectStore.materials = proj.materials
    if (proj.activePalette) projectStore.activePalette = proj.activePalette
    if (proj.referenceImages) projectStore.referenceImages = proj.referenceImages
    if (proj.armature) animationStore.armature = proj.armature
    if (proj.animations) animationStore.armature.clips = proj.animations
    if (proj.textures && proj.textures.length > 0) {
      projectStore.textures = []
      for (const t of proj.textures) {
        projectStore.createTexture(t.name, t.width, t.height, t.dataUrl, undefined, { record: false, select: false, atlas: t.atlas })
      }
    }
    projectStore.markGeometryUpdated()
    projectStore.recordState('Load Project')
  } catch (err) {
    alert('Failed to load project: ' + err)
  } finally {
    if (loadProjectInput.value) loadProjectInput.value.value = ''
    closeDropdowns()
  }
}

async function handleImportObj(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (isImporting.value) return
  isImporting.value = true
  try {
    const text = await file.text()
    const result = ObjImport.parse(text, file.name.replace('.obj', ''))
    if (result.meshes.length > 0) {
      for (const m of result.meshes) {
        projectStore.meshes.push(m)
      }
      projectStore.activeMeshId = result.meshes[0].id
      projectStore.selectedMeshIds = [result.meshes[0].id]
      projectStore.markGeometryUpdated()
      projectStore.recordState(`Import OBJ (${file.name})`)
    }
  } catch (err) {
    alert('Failed to import OBJ')
  } finally {
    isImporting.value = false
    if (importObjInput.value) importObjInput.value.value = ''
    closeDropdowns()
  }
}

async function handleImportGltf(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (isImporting.value) return
  isImporting.value = true
  try {
    const buffer = await file.arrayBuffer()
    const result = await GltfImport.loadFromArrayBuffer(buffer, file.name)
    if (result.meshes.length > 0) {
      for (const m of result.meshes) {
        projectStore.meshes.push(m)
      }
      projectStore.activeMeshId = result.meshes[0].id
      projectStore.selectedMeshIds = [result.meshes[0].id]
    }
    if (result.armature) {
      animationStore.armature = result.armature
    }
    projectStore.markGeometryUpdated()
    projectStore.recordState(`Import GLTF (${file.name})`)
  } catch (err) {
    alert('Failed to import GLTF')
  } finally {
    isImporting.value = false
    if (importGltfInput.value) importGltfInput.value.value = ''
    closeDropdowns()
  }
}

function handleImportTexture(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  pendingImportFile.value = file
  showImportModal.value = true
  input.value = ''
  closeDropdowns()
}

onMounted(() => {
  window.addEventListener(EDITOR_EVENTS.cameraView, onCameraViewEvent)
  window.addEventListener('pointerdown', onDocPointerDown)
})

onUnmounted(() => {
  window.removeEventListener(EDITOR_EVENTS.cameraView, onCameraViewEvent)
  window.removeEventListener('pointerdown', onDocPointerDown)
})
</script>

<template>
  <header class="master-header-container relative h-8 bg-ui-header border-b border-ui-borderSubtle px-2 flex items-center justify-between text-xs select-none z-40 font-sans shrink-0">
    <!-- Hidden Inputs for File Import -->
    <input ref="loadProjectInput" type="file" accept=".psxproj" class="hidden" @change="handleLoadProject" />
    <input ref="importObjInput" type="file" accept=".obj" class="hidden" @change="handleImportObj" />
    <input ref="importGltfInput" type="file" accept=".gltf,.glb" class="hidden" @change="handleImportGltf" />
    <input ref="importTextureInput" type="file" accept="image/*" class="hidden" @change="handleImportTexture" />

    <!-- 1. LEFT: Logo + File, Edit, Add Menus + Space/Snap/Symmetry -->
    <div class="flex items-center space-x-1 shrink-0 z-20">
      <PolyEchoLogo class="mr-2 ml-0.5" />

      <!-- File Menu -->
      <div class="relative">
        <button 
          class="px-1.5 py-0.5 text-[11.5px] font-medium rounded-xs hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textPrimary transition"
          :class="{ 'bg-ui-hover text-ui-textPrimary font-bold': activeDropdown === 'file' }"
          @click="toggleDropdown('file')"
        >
          File
        </button>

        <div v-if="activeDropdown === 'file'" class="absolute left-0 top-full mt-0.5 w-56 bg-ui-panel text-ui-textPrimary border border-ui-borderStrong rounded-xs shadow-2xl py-1 z-50 text-xs">
          <button @click="$emit('new-project'); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between font-medium">
            <span class="flex items-center gap-2"><Plus class="w-3.5 h-3.5 text-ui-accent" /> New Project</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Ctrl+N</span>
          </button>
          <button @click="loadProjectInput?.click()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
            <span class="flex items-center gap-2"><FolderOpen class="w-3.5 h-3.5 text-amber-400" /> Open (.psxproj)</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Ctrl+O</span>
          </button>
          <button @click="saveProject" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
            <span class="flex items-center gap-2"><Save class="w-3.5 h-3.5 text-emerald-400" /> Save Project</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Ctrl+S</span>
          </button>

          <div class="h-px bg-ui-borderSubtle my-1"></div>

          <div class="px-3 py-1 text-[9.5px] font-bold text-ui-textMuted uppercase tracking-wider">Import</div>
          <button @click="importObjInput?.click()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center gap-2">
            <Upload class="w-3.5 h-3.5 text-ui-textMuted" /> Wavefront (.obj)
          </button>
          <button @click="importGltfInput?.click()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center gap-2">
            <Upload class="w-3.5 h-3.5 text-ui-textMuted" /> GLTF / GLB (.glb)
          </button>
          <button @click="importTextureInput?.click()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center gap-2">
            <ImageIcon class="w-3.5 h-3.5 text-ui-textMuted" /> Texture (PNG, JPG)
          </button>

          <div class="h-px bg-ui-borderSubtle my-1"></div>

          <button @click="$emit('open-preferences'); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
            <span class="flex items-center gap-2"><Sliders class="w-3.5 h-3.5 text-sky-400" /> Properties & Preferences</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Ctrl+,</span>
          </button>
        </div>
      </div>

      <!-- Edit Menu -->
      <div class="relative">
        <button 
          class="px-1.5 py-0.5 text-[11.5px] font-medium rounded-xs hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textPrimary transition"
          :class="{ 'bg-ui-hover text-ui-textPrimary font-bold': activeDropdown === 'edit' }"
          @click="toggleDropdown('edit')"
        >
          Edit
        </button>

        <div v-if="activeDropdown === 'edit'" class="absolute left-0 top-full mt-0.5 w-52 bg-ui-panel text-ui-textPrimary border border-ui-borderStrong rounded-xs shadow-2xl py-1 z-50 text-xs">
          <button @click="historyStore.undo(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
            <span class="flex items-center gap-2"><Undo2 class="w-3.5 h-3.5" /> Undo</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Ctrl+Z</span>
          </button>
          <button @click="historyStore.redo(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
            <span class="flex items-center gap-2"><Redo2 class="w-3.5 h-3.5" /> Redo</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Ctrl+Y</span>
          </button>
          <div class="h-px bg-ui-borderSubtle my-1"></div>
          <button @click="$emit('open-preferences'); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center gap-2">
            <Palette class="w-3.5 h-3.5 text-amber-400" /> Preferences & Themes
          </button>
          <button @click="$emit('open-hotkeys'); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center gap-2">
            <Keyboard class="w-3.5 h-3.5 text-sky-400" /> Hotkey Map
          </button>
        </div>
      </div>

      <!-- Add Menu -->
      <div class="relative">
        <button 
          class="px-1.5 py-0.5 text-[11.5px] font-medium rounded-xs hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textPrimary transition"
          :class="{ 'bg-ui-hover text-ui-textPrimary font-bold': activeDropdown === 'add' }"
          @click="toggleDropdown('add')"
        >
          Add
        </button>

        <div v-if="activeDropdown === 'add'" class="absolute left-0 top-full mt-0.5 w-48 bg-ui-panel text-ui-textPrimary border border-ui-borderStrong rounded-xs shadow-2xl py-1 z-50 text-xs">
          <button @click="requestPrimitiveMenu(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between font-semibold text-amber-400">
            <span>3D Mesh Primitives...</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Shift+A</span>
          </button>
        </div>
      </div>

      <div class="w-px h-3.5 bg-ui-borderSubtle mx-0.5 shrink-0"></div>

      <!-- Space & Pivot Combo Dropdown -->
      <div class="relative">
        <button 
          @click="toggleDropdown('space')"
          class="h-6 px-1.5 rounded-xs bg-ui-input border border-ui-borderDefault text-ui-textPrimary hover:bg-ui-hover flex items-center gap-1 text-[10.5px]"
          title="Transform Space & Pivot Point"
        >
          <Compass class="w-3 h-3 text-sky-400 shrink-0" />
          <span class="capitalize">{{ toolStore.transformOrientation }}</span>
          <span class="text-ui-textMuted">·</span>
          <Crosshair class="w-3 h-3 text-ui-textAccent shrink-0" />
          <span>{{ pivotLabel[toolStore.pivotPoint] }}</span>
          <ChevronDown class="w-3 h-3 text-ui-textMuted" />
        </button>

        <div v-if="activeDropdown === 'space'" class="absolute left-0 top-full mt-0.5 w-60 bg-ui-panel border border-ui-borderStrong rounded-xs shadow-2xl p-2 grid grid-cols-2 gap-2 z-50 text-[11px] font-mono">
          <div>
            <div class="px-1 pb-1 text-[9px] font-bold uppercase tracking-wider text-ui-textMuted">Space</div>
            <button
              v-for="ori in (['global', 'local', 'normal', 'view'] as const)"
              :key="ori"
              @click="toolStore.transformOrientation = ori; closeDropdowns()"
              class="w-full text-left px-1.5 py-1 rounded-xs capitalize hover:bg-ui-hover flex items-center justify-between"
              :class="{ 'text-sky-400 font-semibold': toolStore.transformOrientation === ori }"
            >
              <span>{{ ori }}</span>
              <Check v-if="toolStore.transformOrientation === ori" class="w-3 h-3" />
            </button>
          </div>
          <div>
            <div class="px-1 pb-1 text-[9px] font-bold uppercase tracking-wider text-ui-textMuted">Pivot</div>
            <button
              v-for="piv in ([
                { id: 'median' as const, label: 'Median' },
                { id: 'active' as const, label: 'Active' },
                { id: 'cursor' as const, label: '3D Cursor' }
              ])"
              :key="piv.id"
              @click="toolStore.pivotPoint = piv.id; closeDropdowns()"
              class="w-full text-left px-1.5 py-1 rounded-xs hover:bg-ui-hover flex items-center justify-between"
              :class="{ 'text-ui-textAccent font-semibold': toolStore.pivotPoint === piv.id }"
            >
              <span>{{ piv.label }}</span>
              <Check v-if="toolStore.pivotPoint === piv.id" class="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      <!-- Snapping Toggle + Targets -->
      <div class="relative flex items-center h-6 rounded-xs bg-ui-input border border-ui-borderDefault">
        <button
          type="button"
          class="h-full px-1.5 flex items-center gap-1 rounded-l-xs text-[10.5px] transition cursor-pointer"
          :class="toolStore.snapping.grid ? 'text-ui-textAccent font-bold' : 'text-ui-textMuted hover:text-ui-textPrimary'"
          title="Toggle Grid Snap"
          @click="toolStore.snapping.grid = !toolStore.snapping.grid"
        >
          <Magnet class="w-3 h-3" />
          <span class="tabular-nums">{{ toolStore.snapping.gridSize }}</span>
        </button>
        <button
          type="button"
          class="h-full px-1 border-l border-ui-borderSubtle text-ui-textMuted hover:text-ui-textPrimary relative cursor-pointer"
          :class="{ 'bg-ui-hover text-ui-textPrimary': activeDropdown === 'snap' }"
          title="Snap increment and targets"
          @click="toggleDropdown('snap')"
        >
          <ChevronDown class="w-3 h-3" />
          <span
            v-if="snapTargetOn"
            class="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-ui-accent"
          />
        </button>
        <div v-if="activeDropdown === 'snap'" class="absolute left-0 top-full mt-0.5 w-48 bg-ui-panel border border-ui-borderStrong rounded-xs shadow-2xl p-2 z-50 text-[11px] font-mono space-y-2">
          <div class="text-[9px] font-bold uppercase tracking-wider text-ui-textMuted">Increment</div>
          <div class="grid grid-cols-4 gap-1">
            <button
              v-for="sz in [0.1, 0.25, 0.5, 1.0]"
              :key="sz"
              type="button"
              class="py-1 rounded-xs border text-[10px] cursor-pointer"
              :class="toolStore.snapping.gridSize === sz
                ? 'bg-ui-accentSubtle text-ui-textAccent border-ui-accent/40 font-semibold'
                : 'border-ui-borderSubtle text-ui-textMuted hover:text-ui-textPrimary'"
              @click="toolStore.snapping.gridSize = sz"
            >{{ sz }}</button>
          </div>
          <div class="border-t border-ui-borderSubtle pt-1.5 space-y-1">
            <div class="text-[9px] font-bold uppercase tracking-wider text-ui-textMuted">Snap to</div>
            <label class="flex items-center justify-between cursor-pointer py-0.5 px-0.5">
              <span>Vertex</span>
              <input type="checkbox" v-model="toolStore.snapping.vertex" class="rounded-xs accent-ui-accent" />
            </label>
            <label class="flex items-center justify-between cursor-pointer py-0.5 px-0.5">
              <span>Edge midpoint</span>
              <input type="checkbox" v-model="toolStore.snapping.edge" class="rounded-xs accent-ui-accent" />
            </label>
            <label class="flex items-center justify-between cursor-pointer py-0.5 px-0.5">
              <span>Face center</span>
              <input type="checkbox" v-model="toolStore.snapping.face" class="rounded-xs accent-ui-accent" />
            </label>
          </div>
        </div>
      </div>

      <!-- Symmetry Toggles (X Y Z) -->
      <div class="flex items-center h-6 px-1 gap-0.5 rounded-xs bg-ui-input border border-ui-borderDefault text-[10px] font-mono">
        <FlipHorizontal class="w-3 h-3 text-ui-textMuted mr-0.5" />
        <button
          v-for="axis in (['X', 'Y', 'Z'] as const)"
          :key="axis"
          type="button"
          class="w-4 h-4 rounded-xs text-[9.5px] font-bold transition"
          :class="(axis === 'X' ? toolStore.viewport.symmetryX : axis === 'Y' ? toolStore.viewport.symmetryY : toolStore.viewport.symmetryZ)
            ? 'bg-ui-accentSubtle text-ui-textAccent'
            : 'text-ui-textMuted hover:text-ui-textPrimary'"
          :title="'Live ' + axis + ' symmetry'"
          @click="toggleSymmetry(axis)"
        >
          {{ axis }}
        </button>
      </div>
    </div>

    <!-- 2. CENTER: Workspace Segmented Menu Strip -->
    <div class="flex items-center justify-center shrink-0 z-10 px-2">
      <div class="flex items-center gap-0.5 bg-ui-input/90 p-0.5 rounded-xs border border-ui-borderSubtle font-sans text-xs shrink-0 shadow-inner">
        <button
          v-for="w in workspaces"
          :key="w.id"
          @click="toolStore.setAppMode(w.id)"
          class="h-5.5 px-2.5 rounded-xs text-[11px] font-semibold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap select-none"
          :class="toolStore.appMode === w.id 
            ? 'bg-ui-active text-ui-textAccent font-bold shadow-xs border border-ui-borderDefault/80' 
            : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover/60 border border-transparent'"
          :title="w.desc"
        >
          <BlenderIcon :name="w.icon" :size="12" />
          <span>{{ w.label }}</span>
        </button>
      </div>
    </div>

    <!-- 3. RIGHT: Camera View + Shading + TV + Export -->
    <div class="flex items-center space-x-1 shrink-0 z-20">
      <!-- Camera View Dropdown -->
      <div class="relative">
        <button
          @click="toggleDropdown('view')"
          class="h-6 px-1.5 rounded-xs bg-ui-input border border-ui-borderDefault text-ui-textPrimary hover:bg-ui-hover flex items-center gap-1 text-[10.5px]"
          title="Camera View"
        >
          <span class="text-ui-textAccent font-semibold">{{ toolStore.viewport.quadView ? 'Quad' : viewLabel[cameraView] }}</span>
          <ChevronDown class="w-3 h-3 text-ui-textMuted" />
        </button>

        <div v-if="activeDropdown === 'view'" class="absolute right-0 top-full mt-0.5 w-44 bg-ui-panel border border-ui-borderStrong rounded-xs shadow-2xl p-1 z-50 text-[11px] font-mono">
          <button @click="setCameraView('persp')" class="w-full text-left px-2 py-1 hover:bg-ui-hover flex justify-between">
            <span>Perspective</span><span class="text-ui-textMuted">Home</span>
          </button>
          <button @click="setCameraView('front')" class="w-full text-left px-2 py-1 hover:bg-ui-hover flex justify-between">
            <span>Front Ortho</span><span class="text-ui-textMuted">Num 1</span>
          </button>
          <button @click="setCameraView('right')" class="w-full text-left px-2 py-1 hover:bg-ui-hover flex justify-between">
            <span>Right Ortho</span><span class="text-ui-textMuted">Num 3</span>
          </button>
          <button @click="setCameraView('top')" class="w-full text-left px-2 py-1 hover:bg-ui-hover flex justify-between">
            <span>Top Ortho</span><span class="text-ui-textMuted">Num 7</span>
          </button>
          <button @click="setCameraView('iso')" class="w-full text-left px-2 py-1 hover:bg-ui-hover flex justify-between">
            <span>Isometric</span><span class="text-ui-textMuted">Num 0</span>
          </button>
          <div class="h-px bg-ui-borderSubtle my-1"></div>
          <button @click="toolStore.viewport.quadView = !toolStore.viewport.quadView; closeDropdowns()" class="w-full text-left px-2 py-1 hover:bg-ui-hover flex justify-between text-amber-400">
            <span>Quad View</span><span class="text-ui-textMuted">Ctrl+Alt+Q</span>
          </button>
        </div>
      </div>

      <!-- Shading Mode Group (Wire, Solid, Textured, PSX) -->
      <div class="flex items-center h-6 px-0.5 rounded-xs bg-ui-input border border-ui-borderDefault">
        <button
          v-for="s in shadingModes"
          :key="s.id"
          type="button"
          class="w-5 h-5 rounded-xs flex items-center justify-center transition"
          :class="toolStore.viewport.shading === s.id ? 'bg-ui-active text-ui-textPrimary' : 'text-ui-textMuted hover:text-ui-textPrimary'"
          :title="s.title"
          @click="toolStore.viewport.shading = s.id"
        >
          <BlenderIcon :name="s.icon" :size="11" />
        </button>
      </div>

      <!-- Overlays -->
      <div class="relative">
        <button
          type="button"
          class="h-6 w-6 rounded-xs border flex items-center justify-center relative cursor-pointer"
          :class="overlayOn
            ? 'bg-ui-accentSubtle text-ui-textAccent border-ui-accent/40'
            : 'bg-ui-input text-ui-textMuted border-ui-borderDefault hover:text-ui-textPrimary'"
          title="Overlays"
          @click="toggleDropdown('overlays')"
        >
          <Layers class="w-3 h-3" />
        </button>
        <div v-if="activeDropdown === 'overlays'" class="absolute right-0 top-full mt-0.5 w-52 bg-ui-panel border border-ui-borderStrong rounded-xs shadow-2xl p-2 z-50 text-[11px] font-mono space-y-1.5">
          <div class="text-[9px] font-bold uppercase tracking-wider text-ui-textMuted">Overlays</div>
          <label class="flex items-center justify-between cursor-pointer py-0.5 px-0.5 hover:bg-ui-hover rounded-xs">
            <span>Face orientation</span>
            <input type="checkbox" v-model="toolStore.viewport.faceOrientation" class="rounded-xs accent-ui-accent" />
          </label>
          <label class="flex items-center justify-between cursor-pointer py-0.5 px-0.5 hover:bg-ui-hover rounded-xs">
            <span>Grid</span>
            <input type="checkbox" v-model="toolStore.viewport.showGrid" class="rounded-xs accent-ui-accent" />
          </label>
          <label class="flex items-center justify-between cursor-pointer py-0.5 px-0.5 hover:bg-ui-hover rounded-xs">
            <span>World axes</span>
            <input type="checkbox" v-model="toolStore.viewport.showAxes" class="rounded-xs accent-ui-accent" />
          </label>
          <label class="flex items-center justify-between cursor-pointer py-0.5 px-0.5 hover:bg-ui-hover rounded-xs">
            <span>Bones</span>
            <input
              type="checkbox"
              :checked="animationStore.showBones"
              class="rounded-xs accent-ui-accent"
              @change="animationStore.setShowBones(!animationStore.showBones)"
            />
          </label>
          <div class="border-t border-ui-borderSubtle pt-1.5 space-y-1">
            <div class="flex items-center justify-between text-[10px] text-ui-textMuted">
              <span>Wire opacity</span>
              <span class="tabular-nums">{{ Math.round(toolStore.viewport.wireframeOpacity * 100) }}%</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.05"
              v-model.number="toolStore.viewport.wireframeOpacity"
              class="w-full h-1 bg-ui-borderStrong rounded-lg appearance-none cursor-pointer accent-ui-accent"
            />
          </div>
        </div>
      </div>

      <!-- Object Shade -->
      <div class="relative">
        <button
          type="button"
          class="h-6 px-1.5 rounded-xs bg-ui-input border border-ui-borderDefault text-ui-textPrimary hover:bg-ui-hover flex items-center gap-1 cursor-pointer"
          title="Object shade"
          @click="toggleDropdown('shade')"
        >
          <span class="capitalize">{{ objectShade }}</span>
          <ChevronDown class="w-3 h-3 text-ui-textMuted" />
        </button>
        <div v-if="activeDropdown === 'shade'" class="absolute right-0 top-full mt-0.5 w-40 bg-ui-panel border border-ui-borderStrong rounded-xs shadow-2xl p-1 z-50 text-[11px] font-mono">
          <button
            type="button"
            class="w-full text-left px-2 py-1.5 rounded-xs hover:bg-ui-hover cursor-pointer"
            :class="{ 'text-ui-textAccent font-semibold': objectShade === 'flat' }"
            title="One normal per face"
            @click="applyObjectShade('flat')"
          >Flat</button>
          <button
            type="button"
            class="w-full text-left px-2 py-1.5 rounded-xs hover:bg-ui-hover cursor-pointer"
            :class="{ 'text-ui-textAccent font-semibold': objectShade === 'smooth' }"
            title="Interpolated vertex normals"
            @click="applyObjectShade('smooth')"
          >Smooth</button>
          <button
            type="button"
            class="w-full text-left px-2 py-1.5 rounded-xs hover:bg-ui-hover cursor-pointer"
            :class="{ 'text-ui-textAccent font-semibold': objectShade === 'auto' }"
            title="Smooth, keep sharp edges by angle"
            @click="applyObjectShade('auto')"
          >Auto smooth</button>
        </div>
      </div>

      <!-- X-Ray Mode (Alt+Z) -->
      <button
        type="button"
        class="h-6 w-6 rounded-xs border flex items-center justify-center transition cursor-pointer"
        :class="toolStore.viewport.xray
          ? 'bg-ui-accentSubtle text-ui-textAccent border-ui-accent/40 font-bold shadow-xs'
          : 'bg-ui-input text-ui-textMuted border-ui-borderDefault hover:text-ui-textPrimary'"
        title="X-Ray Transparent (Alt+Z)"
        @click="toolStore.viewport.xray = !toolStore.viewport.xray"
      >
        <BlenderIcon name="xray" :size="11" :color="toolStore.viewport.xray ? 'var(--ui-accent)' : 'currentColor'" />
      </button>

      <button
        type="button"
        class="h-6 w-6 rounded-xs bg-ui-input border border-ui-borderDefault text-ui-textMuted hover:text-ui-textPrimary flex items-center justify-center cursor-pointer"
        title="Command search (F3)"
        @click="triggerCommandPalette"
      >
        <Search class="w-3 h-3" />
      </button>

      <!-- CRT / TV Scanline Filter -->
      <button 
        @click="toolStore.viewport.crtFilter = !toolStore.viewport.crtFilter"
        class="h-6 px-1.5 rounded-xs flex items-center gap-1 text-[10px] font-mono transition border cursor-pointer select-none"
        :class="toolStore.viewport.crtFilter 
          ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-xs font-bold' 
          : 'text-ui-textMuted hover:text-ui-textPrimary border-ui-borderDefault bg-ui-input'"
        title="Toggle CRT Retro Scanlines"
      >
        <Tv class="w-3 h-3" :class="toolStore.viewport.crtFilter ? 'text-amber-400' : 'text-ui-textMuted'" />
      </button>

      <!-- Main Export Button -->
      <button 
        @click="$emit('open-export')"
        class="flex items-center gap-1 px-2.5 h-6 bg-ui-accent hover:bg-ui-accentHover text-white rounded-xs text-[11px] font-semibold shadow-xs transition active:scale-95 cursor-pointer ml-1"
      >
        <Download class="w-3 h-3" />
        <span>Export</span>
      </button>
    </div>

    <!-- Import Texture Modal -->
    <ImportTextureModal 
      v-if="showImportModal && pendingImportFile" 
      :file="pendingImportFile" 
      @close="() => { showImportModal = false; pendingImportFile = null }"
      @imported="() => { showImportModal = false; pendingImportFile = null }"
    />
  </header>
</template>
