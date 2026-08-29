<script setup lang="ts">
import { ref } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { useToolStore } from '../../stores/toolStore'
import { useHistoryStore } from '../../stores/historyStore'
import { useAnimationStore } from '../../stores/animationStore'
import { useLayoutStore } from '../../stores/layoutStore'
import BlenderIcon from '../icons/BlenderIcon.vue'
import { 
  Download, 
  Upload,
  Undo2, 
  Redo2, 
  Keyboard, 
  FolderOpen,
  Save,
  Plus,
  Copy,
  ClipboardPaste,
  CopyPlus,
  Image as ImageIcon,
  LogOut,
  Sparkles,
  FileCode,
  PanelLeft,
  PanelRight,
  Tv,
  Eye,
  RotateCcw,
  LayoutGrid
} from 'lucide-vue-next'

import { PrimitiveType } from '../../core/primitives/PrimitiveTypes'
import { PrimitivePlacementMode } from '../../core/operators/placement/PrimitivePlacementOperator'
import { PlacementOrientation } from '../../core/placement/SurfacePlacementSolver'
import { ProjectSerializer } from '../../core/project/ProjectSerializer'
import { ObjImport } from '../../core/import/ObjImport'
import { GltfImport } from '../../core/import/GltfImport'

const projectStore = useProjectStore()
const toolStore = useToolStore()
const historyStore = useHistoryStore()
const animationStore = useAnimationStore()
const layoutStore = useLayoutStore()

const currentPlacementMode = ref<PrimitivePlacementMode>(PrimitivePlacementMode.CAD_DRAW)
const currentOrientation = ref<PlacementOrientation>('WORLD')

const emit = defineEmits<{
  (e: 'open-export'): void
  (e: 'open-hotkeys'): void
  (e: 'new-project'): void
}>()

const activeDropdown = ref<string | null>(null)

// Hidden file input refs
const loadProjectInput = ref<HTMLInputElement | null>(null)
const importObjInput = ref<HTMLInputElement | null>(null)
const importGltfInput = ref<HTMLInputElement | null>(null)
const importTextureInput = ref<HTMLInputElement | null>(null)

function toggleDropdown(name: string) {
  activeDropdown.value = activeDropdown.value === name ? null : name
}

function closeDropdowns() {
  activeDropdown.value = null
}

function setCameraView(view: 'persp' | 'top' | 'front' | 'right' | 'iso') {
  window.dispatchEvent(new CustomEvent('set-camera-view', { detail: view }))
}

function handleStartPrimitivePlacement(type: PrimitiveType) {
  window.dispatchEvent(
    new CustomEvent('start-primitive-placement', {
      detail: {
        type,
        mode: currentPlacementMode.value,
        orientation: currentOrientation.value
      }
    })
  )
  closeDropdowns()
}

function handleOpenAddDialog() {
  window.dispatchEvent(new CustomEvent('open-add-primitive-menu', { detail: { x: 100, y: 150 } }))
  closeDropdowns()
}

// File operations
function saveProject() {
  const json = ProjectSerializer.serialize(
    projectStore.projectName,
    projectStore.meshes,
    projectStore.pixelBuffer.canvas,
    projectStore.activePalette,
    projectStore.materials,
    animationStore.armature,
    animationStore.armature.clips,
    animationStore.armature.activeClipId,
    animationStore.currentFrame,
    toolStore.viewport
  )
  ProjectSerializer.downloadProject(json, projectStore.projectName)
  closeDropdowns()
}

function saveProjectAs() {
  const newName = prompt('Enter project name:', projectStore.projectName)
  if (newName) {
    projectStore.projectName = newName
    saveProject()
  }
}

async function handleLoadProject(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return

  try {
    const text = await file.text()
    const data = ProjectSerializer.deserialize(text)

    projectStore.projectName = data.projectName
    projectStore.meshes = data.meshes
    if (data.materials) projectStore.materials = data.materials
    if (data.activePalette) projectStore.activePalette = data.activePalette

    if (data.textureDataUrl) {
      const img = new Image()
      img.onload = () => {
        projectStore.pixelBuffer.canvas.width = img.width
        projectStore.pixelBuffer.canvas.height = img.height
        projectStore.pixelBuffer.ctx.drawImage(img, 0, 0)
        projectStore.markTextureUpdated()
      }
      img.src = data.textureDataUrl
    }

    if (data.armature) {
      animationStore.armature = data.armature
    }
  } catch (err) {
    console.error('Failed to load project:', err)
    alert('Failed to load project file')
  } finally {
    if (loadProjectInput.value) loadProjectInput.value.value = ''
    closeDropdowns()
  }
}

async function handleImportObj(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    const result = ObjImport.parse(text, file.name.replace('.obj', ''))
    for (const m of result.meshes) {
      projectStore.meshes.push(m)
    }
  } catch (err) {
    console.error('Failed to import OBJ:', err)
    alert('Failed to import OBJ')
  } finally {
    if (importObjInput.value) importObjInput.value.value = ''
    closeDropdowns()
  }
}

async function handleImportGltf(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    const buffer = await file.arrayBuffer()
    const result = await GltfImport.loadFromArrayBuffer(buffer, file.name)
    for (const m of result.meshes) {
      projectStore.meshes.push(m)
    }
    if (result.armature) {
      animationStore.armature = result.armature
    }
  } catch (err) {
    console.error('Failed to import GLTF:', err)
    alert('Failed to import GLTF')
  } finally {
    if (importGltfInput.value) importGltfInput.value.value = ''
    closeDropdowns()
  }
}

async function handleImportTexture(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    const buffer = await file.arrayBuffer()
    const blob = new Blob([buffer], { type: file.type })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      projectStore.pixelBuffer.canvas.width = img.width
      projectStore.pixelBuffer.canvas.height = img.height
      projectStore.pixelBuffer.ctx.drawImage(img, 0, 0)
      projectStore.markTextureUpdated()
      URL.revokeObjectURL(url)
    }
    img.src = url
  } catch (err) {
    console.error('Failed to import texture:', err)
    alert('Failed to import texture image')
  } finally {
    if (importTextureInput.value) importTextureInput.value.value = ''
    closeDropdowns()
  }
}

function handleExitProject() {
  if (confirm('Exit without saving? Any unsaved progress will be lost.')) {
    emit('new-project')
  }
  closeDropdowns()
}
</script>

<template>
  <header class="h-ui-header bg-ui-header border-b border-ui-borderSubtle px-2 flex items-center justify-between text-xs select-none z-30 font-sans">
    <!-- Hidden Inputs for File Import -->
    <input ref="loadProjectInput" type="file" accept=".psxproj" class="hidden" @change="handleLoadProject" />
    <input ref="importObjInput" type="file" accept=".obj" class="hidden" @change="handleImportObj" />
    <input ref="importGltfInput" type="file" accept=".gltf,.glb" class="hidden" @change="handleImportGltf" />
    <input ref="importTextureInput" type="file" accept="image/*" class="hidden" @change="handleImportTexture" />

    <!-- 1. LEFT: Brand & Application Dropdown Menus -->
    <div class="flex items-center space-x-1 shrink-0">
      <!-- Brand Logo -->
      <div class="flex items-center space-x-1.5 mr-2 px-1.5 py-0.5 bg-ui-input rounded-xs border border-ui-borderSubtle">
        <BlenderIcon name="mesh-cube" :size="13" color="#f59e0b" />
        <span class="font-bold tracking-wide text-xs uppercase text-ui-textPrimary font-mono">POLY<span class="text-ui-accent">ECHO</span></span>
      </div>

      <!-- File Menu -->
      <div class="relative" @mouseleave="closeDropdowns" @click.stop>
        <button 
          class="px-2 py-1 text-xs font-medium rounded-xs hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textPrimary transition"
          :class="{ 'bg-ui-hover text-ui-textPrimary': activeDropdown === 'file' }"
          @click="toggleDropdown('file')"
          @mouseenter="activeDropdown && (activeDropdown = 'file')"
        >
          File
        </button>

        <div v-if="activeDropdown === 'file'" class="absolute left-0 top-full mt-0.5 w-56 bg-[#181a1f] opacity-100 border border-ui-borderStrong rounded-xs shadow-2xl py-1 z-50 text-xs">
          <button @click="$emit('new-project'); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
            <span class="flex items-center gap-2"><Plus class="w-3.5 h-3.5 text-ui-accent" /> New Project...</span>
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
          <button @click="saveProjectAs" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between text-ui-textSecondary">
            <span class="flex items-center gap-2"><FileCode class="w-3.5 h-3.5" /> Save Project As...</span>
          </button>

          <div class="h-px bg-ui-borderSubtle my-1"></div>

          <div class="px-3 py-1 text-[10px] font-bold text-ui-textMuted uppercase tracking-wider">Import</div>
          <button @click="importObjInput?.click()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center gap-2 text-ui-textPrimary">
            <Upload class="w-3.5 h-3.5 text-ui-textMuted" /> Wavefront (.obj)
          </button>
          <button @click="importGltfInput?.click()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center gap-2 text-ui-textPrimary">
            <Upload class="w-3.5 h-3.5 text-ui-textMuted" /> GLTF / GLB (.glb)
          </button>
          <button @click="importTextureInput?.click()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center gap-2 text-ui-textPrimary">
            <ImageIcon class="w-3.5 h-3.5 text-ui-textMuted" /> Texture (PNG, JPG)
          </button>

          <div class="h-px bg-ui-borderSubtle my-1"></div>

          <button @click="$emit('open-export'); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between text-amber-400 font-medium">
            <span class="flex items-center gap-2"><Sparkles class="w-3.5 h-3.5" /> Export Game Assets...</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Ctrl+E</span>
          </button>

          <div class="h-px bg-ui-borderSubtle my-1"></div>
          <button @click="handleExitProject" class="w-full text-left px-3 py-1.5 hover:bg-rose-950/60 hover:text-rose-300 flex items-center gap-2 text-ui-textMuted">
            <LogOut class="w-3.5 h-3.5" /> Exit / Reset Scene
          </button>
        </div>
      </div>

      <!-- Edit Menu -->
      <div class="relative" @mouseleave="closeDropdowns" @click.stop>
        <button 
          class="px-2 py-1 text-xs font-medium rounded-xs hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textPrimary transition"
          :class="{ 'bg-ui-hover text-ui-textPrimary': activeDropdown === 'edit' }"
          @click="toggleDropdown('edit')"
          @mouseenter="activeDropdown && (activeDropdown = 'edit')"
        >
          Edit
        </button>
        <div v-if="activeDropdown === 'edit'" class="absolute left-0 top-full mt-0.5 w-52 bg-[#181a1f] opacity-100 border border-ui-borderStrong rounded-xs shadow-2xl py-1 z-50 text-xs">
          <button @click="historyStore.undo(); closeDropdowns()" :disabled="historyStore.undoStack.length === 0" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between disabled:opacity-40">
            <span class="flex items-center gap-2"><Undo2 class="w-3.5 h-3.5 text-ui-textMuted" /> Undo</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Ctrl+Z</span>
          </button>
          <button @click="historyStore.redo(); closeDropdowns()" :disabled="historyStore.redoStack.length === 0" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between disabled:opacity-40">
            <span class="flex items-center gap-2"><Redo2 class="w-3.5 h-3.5 text-ui-textMuted" /> Redo</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Ctrl+Y</span>
          </button>
          <div class="h-px bg-ui-borderSubtle my-1"></div>
          <button @click="projectStore.duplicateSelection(toolStore.selectMode); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between text-amber-300">
            <span class="flex items-center gap-2"><CopyPlus class="w-3.5 h-3.5 text-ui-textMuted" /> Duplicate</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Shift+D</span>
          </button>
          <button @click="projectStore.copySelection(toolStore.selectMode); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
            <span class="flex items-center gap-2"><Copy class="w-3.5 h-3.5 text-ui-textMuted" /> Copy</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Ctrl+C</span>
          </button>
          <button @click="projectStore.pasteClipboard(); closeDropdowns()" :disabled="!projectStore.clipboard" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between disabled:opacity-40">
            <span class="flex items-center gap-2"><ClipboardPaste class="w-3.5 h-3.5 text-ui-textMuted" /> Paste</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Ctrl+V</span>
          </button>
        </div>
      </div>

      <!-- Add Primitive & CAD Menu -->
      <div class="relative" @mouseleave="closeDropdowns" @click.stop>
        <button 
          class="px-2 py-1 text-xs font-medium rounded-xs hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textPrimary transition"
          :class="{ 'bg-ui-hover text-ui-textPrimary': activeDropdown === 'add' }"
          @click="toggleDropdown('add')"
          @mouseenter="activeDropdown && (activeDropdown = 'add')"
        >
          Add
        </button>
        <div v-if="activeDropdown === 'add'" class="absolute left-0 top-full mt-0.5 w-64 bg-[#181a1f] opacity-100 border border-ui-borderStrong rounded-xs shadow-2xl py-1.5 z-50 text-xs max-h-[85vh] overflow-y-auto">
          <!-- Placement Mode Selector -->
          <div class="px-2.5 py-1 border-b border-ui-borderSubtle mb-1 bg-ui-input/60">
            <div class="text-[10px] font-semibold text-ui-textMuted uppercase mb-1">Placement Mode</div>
            <div class="grid grid-cols-2 gap-1 text-[10px]">
              <button 
                @click="currentPlacementMode = PrimitivePlacementMode.CAD_DRAW"
                class="px-1.5 py-0.5 rounded-xs border text-left"
                :class="currentPlacementMode === PrimitivePlacementMode.CAD_DRAW ? 'bg-ui-active text-ui-textAccent border-ui-accent/40 font-medium' : 'bg-ui-surface text-ui-textSecondary border-ui-borderSubtle hover:bg-ui-hover'"
              >
                CAD Draw
              </button>
              <button 
                @click="currentPlacementMode = PrimitivePlacementMode.PLACE"
                class="px-1.5 py-0.5 rounded-xs border text-left"
                :class="currentPlacementMode === PrimitivePlacementMode.PLACE ? 'bg-ui-active text-ui-textAccent border-ui-accent/40 font-medium' : 'bg-ui-surface text-ui-textSecondary border-ui-borderSubtle hover:bg-ui-hover'"
              >
                Direct Place
              </button>
            </div>
          </div>

          <!-- Basic 3D -->
          <div class="px-2.5 py-0.5 text-[10px] font-semibold text-ui-textMuted uppercase tracking-wider">Basic 3D</div>
          <button @click="handleStartPrimitivePlacement('BOX')" class="w-full text-left px-3 py-1 hover:bg-ui-hover flex items-center gap-2 text-ui-textPrimary">
            <BlenderIcon name="mesh-cube" :size="14" color="#8d939d" /> Box / Cube
          </button>
          <button @click="handleStartPrimitivePlacement('PLANE')" class="w-full text-left px-3 py-1 hover:bg-ui-hover flex items-center gap-2 text-ui-textPrimary">
            <BlenderIcon name="mesh-plane" :size="14" color="#8d939d" /> Plane / Grid
          </button>
          <button @click="handleStartPrimitivePlacement('SPHERE')" class="w-full text-left px-3 py-1 hover:bg-ui-hover flex items-center gap-2 text-ui-textPrimary">
            <BlenderIcon name="mesh-sphere" :size="14" color="#8d939d" /> UV Sphere
          </button>
          <button @click="handleStartPrimitivePlacement('ICOSPHERE')" class="w-full text-left px-3 py-1 hover:bg-ui-hover flex items-center gap-2 text-ui-textPrimary">
            <BlenderIcon name="mesh-icosphere" :size="14" color="#8d939d" /> Icosphere
          </button>
          <button @click="handleStartPrimitivePlacement('CYLINDER')" class="w-full text-left px-3 py-1 hover:bg-ui-hover flex items-center gap-2 text-ui-textPrimary">
            <BlenderIcon name="mesh-cylinder" :size="14" color="#8d939d" /> Cylinder
          </button>
          <button @click="handleStartPrimitivePlacement('CONE')" class="w-full text-left px-3 py-1 hover:bg-ui-hover flex items-center gap-2 text-ui-textPrimary">
            <BlenderIcon name="mesh-cone" :size="14" color="#8d939d" /> Cone
          </button>
          <button @click="handleStartPrimitivePlacement('PYRAMID')" class="w-full text-left px-3 py-1 hover:bg-ui-hover flex items-center gap-2 text-ui-textPrimary">
            <BlenderIcon name="mesh-cone" :size="14" color="#8d939d" /> Pyramid
          </button>

          <div class="h-px bg-ui-borderSubtle my-1"></div>

          <!-- Extended Shapes -->
          <div class="px-2.5 py-0.5 text-[10px] font-semibold text-ui-textMuted uppercase tracking-wider">Shapes</div>
          <button @click="handleStartPrimitivePlacement('CIRCLE')" class="w-full text-left px-3 py-1 hover:bg-ui-hover flex items-center gap-2 text-ui-textPrimary">
            <BlenderIcon name="mesh-circle" :size="14" color="#8d939d" /> Circle / Disc
          </button>
          <button @click="handleStartPrimitivePlacement('PRISM')" class="w-full text-left px-3 py-1 hover:bg-ui-hover flex items-center gap-2 text-ui-textPrimary">
            <BlenderIcon name="mesh-cylinder" :size="14" color="#8d939d" /> Prism
          </button>
          <button @click="handleStartPrimitivePlacement('TORUS')" class="w-full text-left px-3 py-1 hover:bg-ui-hover flex items-center gap-2 text-ui-textPrimary">
            <BlenderIcon name="mesh-torus" :size="14" color="#8d939d" /> Torus / Donut
          </button>
          <button @click="handleStartPrimitivePlacement('CAPSULE')" class="w-full text-left px-3 py-1 hover:bg-ui-hover flex items-center gap-2 text-ui-textPrimary">
            <BlenderIcon name="mesh-cylinder" :size="14" color="#8d939d" /> Capsule
          </button>
          <button @click="handleStartPrimitivePlacement('WEDGE')" class="w-full text-left px-3 py-1 hover:bg-ui-hover flex items-center gap-2 text-ui-textPrimary">
            <BlenderIcon name="mesh-cube" :size="14" color="#8d939d" /> Wedge / Ramp
          </button>
          <button @click="handleStartPrimitivePlacement('TUBE')" class="w-full text-left px-3 py-1 hover:bg-ui-hover flex items-center gap-2 text-ui-textPrimary">
            <BlenderIcon name="mesh-torus" :size="14" color="#8d939d" /> Tube / Pipe
          </button>

          <div class="h-px bg-ui-borderSubtle my-1"></div>

          <!-- CAD & Architectural -->
          <div class="px-2.5 py-0.5 text-[10px] font-semibold text-ui-textMuted uppercase tracking-wider">CAD & Architectural</div>
          <button @click="handleStartPrimitivePlacement('WALL')" class="w-full text-left px-3 py-1 hover:bg-ui-hover flex items-center gap-2 text-ui-textPrimary">
            <BlenderIcon name="mesh-plane" :size="14" color="#8d939d" /> Wall Segment
          </button>
          <button @click="handleStartPrimitivePlacement('STAIRS')" class="w-full text-left px-3 py-1 hover:bg-ui-hover flex items-center gap-2 text-ui-textPrimary">
            <BlenderIcon name="mesh-cube" :size="14" color="#8d939d" /> Stairs
          </button>
          <button @click="handleStartPrimitivePlacement('ARCH')" class="w-full text-left px-3 py-1 hover:bg-ui-hover flex items-center gap-2 text-ui-textPrimary">
            <BlenderIcon name="mesh-torus" :size="14" color="#8d939d" /> Arch
          </button>

          <div class="h-px bg-ui-borderSubtle my-1"></div>
          <button @click="handleOpenAddDialog" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between text-amber-400 font-medium">
            <span>Browse All Primitives...</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Shift+A</span>
          </button>
        </div>
      </div>

      <!-- View & Window Menu (Panels, Layout, Cameras) -->
      <div class="relative" @mouseleave="closeDropdowns" @click.stop>
        <button 
          class="px-2 py-1 text-xs font-medium rounded-xs hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textPrimary transition"
          :class="{ 'bg-ui-hover text-ui-textPrimary': activeDropdown === 'view' }"
          @click="toggleDropdown('view')"
          @mouseenter="activeDropdown && (activeDropdown = 'view')"
        >
          View
        </button>
        <div v-if="activeDropdown === 'view'" class="absolute left-0 top-full mt-0.5 w-64 bg-[#181a1f] opacity-100 border border-ui-borderStrong rounded-xs shadow-2xl py-1 z-50 text-xs">
          <!-- Panels Toggle -->
          <div class="px-3 py-1 text-[10px] font-semibold text-ui-textMuted uppercase tracking-wider">Panels & Windows</div>
          <button @click="layoutStore.toggleLeftToolbar(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
            <span class="flex items-center gap-2">
              <PanelLeft class="w-3.5 h-3.5 text-ui-textMuted" />
              <span>Left Toolbar</span>
            </span>
            <span class="text-ui-textAccent font-medium text-[10px]">{{ layoutStore.showLeftToolbar ? 'VISIBLE' : 'HIDDEN' }}</span>
          </button>

          <button @click="layoutStore.toggleRightSidebar(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
            <span class="flex items-center gap-2">
              <PanelRight class="w-3.5 h-3.5 text-ui-textMuted" />
              <span>Right Inspector</span>
            </span>
            <span class="text-ui-textAccent font-medium text-[10px]">{{ layoutStore.showRightSidebar ? 'VISIBLE' : 'HIDDEN' }}</span>
          </button>

          <button @click="layoutStore.toggleStatusBar(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
            <span class="flex items-center gap-2">
              <Tv class="w-3.5 h-3.5 text-ui-textMuted" />
              <span>Status Bar Footer</span>
            </span>
            <span class="text-ui-textAccent font-medium text-[10px]">{{ layoutStore.showStatusBar ? 'VISIBLE' : 'HIDDEN' }}</span>
          </button>

          <div class="h-px bg-ui-borderSubtle my-1"></div>

          <!-- Viewport Layout -->
          <button @click="toolStore.viewport.quadView = !toolStore.viewport.quadView; closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
            <span class="flex items-center gap-2"><LayoutGrid class="w-3.5 h-3.5 text-ui-textMuted" /> Quad View Layout</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Ctrl+Alt+Q</span>
          </button>

          <button @click="toolStore.viewport.xray = !toolStore.viewport.xray; closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
            <span class="flex items-center gap-2"><Eye class="w-3.5 h-3.5 text-ui-textMuted" /> X-Ray Transparent</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Alt+Z</span>
          </button>

          <div class="h-px bg-ui-borderSubtle my-1"></div>

          <!-- Reset Layout -->
          <button @click="layoutStore.resetLayout(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center gap-2 text-amber-400 font-medium">
            <RotateCcw class="w-3.5 h-3.5" /> Reset Default Panel Layout
          </button>
        </div>
      </div>
    </div>

    <!-- 2. CENTER: Application Workspace Tabs (MODEL, UV/PAINT, RIG, ANIMATE) -->
    <div class="flex items-center bg-ui-input p-0.5 rounded-xs border border-ui-borderSubtle shrink-0">
      <button 
        @click="toolStore.setAppMode('model')"
        class="flex items-center gap-1.5 px-2.5 h-6 rounded-xs text-xs font-semibold transition"
        :class="toolStore.appMode === 'model' ? 'bg-ui-accent text-white shadow-xs' : 'text-ui-textMuted hover:text-ui-textSecondary hover:bg-ui-hover'"
      >
        <BlenderIcon name="mesh-cube" :size="13" />
        <span>MODEL</span>
      </button>

      <button 
        @click="toolStore.setAppMode('uvpaint')"
        class="flex items-center gap-1.5 px-2.5 h-6 rounded-xs text-xs font-semibold transition"
        :class="toolStore.appMode === 'uvpaint' ? 'bg-ui-accent text-white shadow-xs' : 'text-ui-textMuted hover:text-ui-textSecondary hover:bg-ui-hover'"
      >
        <BlenderIcon name="uv" :size="13" />
        <span>UV / PAINT</span>
      </button>

      <button 
        @click="toolStore.setAppMode('rig')"
        class="flex items-center gap-1.5 px-2.5 h-6 rounded-xs text-xs font-semibold transition"
        :class="toolStore.appMode === 'rig' ? 'bg-ui-accent text-white shadow-xs' : 'text-ui-textMuted hover:text-ui-textSecondary hover:bg-ui-hover'"
        title="Custom Skeletal Rigging Workspace"
      >
        <BlenderIcon name="bone" :size="13" />
        <span>RIG</span>
      </button>

      <button 
        @click="toolStore.setAppMode('animate')"
        class="flex items-center gap-1.5 px-2.5 h-6 rounded-xs text-xs font-semibold transition"
        :class="toolStore.appMode === 'animate' ? 'bg-ui-accent text-white shadow-xs' : 'text-ui-textMuted hover:text-ui-textSecondary hover:bg-ui-hover'"
      >
        <BlenderIcon name="keyframe" :size="13" />
        <span>ANIMATE</span>
      </button>
    </div>

    <!-- 3. RIGHT: In-Viewport Camera & Shading Ribbon + Panel Toggles + Export -->
    <div class="flex items-center space-x-1.5 shrink-0">
      <!-- Quick Camera View Dropdown -->
      <div class="flex items-center bg-ui-input rounded-xs px-1.5 py-0.5 border border-ui-borderDefault text-[10px]">
        <select 
          @change="setCameraView(($event.target as HTMLSelectElement).value as any)"
          class="bg-transparent text-ui-textAccent font-bold focus:outline-none cursor-pointer"
        >
          <option value="persp" class="bg-ui-panel text-ui-textPrimary">Perspective</option>
          <option value="top" class="bg-ui-panel text-ui-textPrimary">Top Ortho (Num 7)</option>
          <option value="front" class="bg-ui-panel text-ui-textPrimary">Front Ortho (Num 1)</option>
          <option value="right" class="bg-ui-panel text-ui-textPrimary">Right Ortho (Num 3)</option>
          <option value="iso" class="bg-ui-panel text-ui-textPrimary">Isometric (Num 0)</option>
        </select>
      </div>

      <!-- Shading Modes (Tex / Solid / Wire / PSX) -->
      <div class="flex items-center bg-ui-input rounded-xs p-0.5 border border-ui-borderDefault">
        <button 
          @click="toolStore.viewport.shading = 'textured'" 
          class="px-1.5 py-0.5 rounded-xs text-[10px] flex items-center space-x-1 transition"
          :class="toolStore.viewport.shading === 'textured' ? 'bg-ui-active text-ui-textPrimary font-bold border border-ui-borderStrong shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary'"
          title="Textured Shading"
        >
          <BlenderIcon name="shading-textured" :size="11" />
          <span>Tex</span>
        </button>

        <button 
          @click="toolStore.viewport.shading = 'solid'" 
          class="px-1.5 py-0.5 rounded-xs text-[10px] flex items-center space-x-1 transition"
          :class="toolStore.viewport.shading === 'solid' ? 'bg-ui-active text-ui-textPrimary font-bold border border-ui-borderStrong shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary'"
          title="Solid Shading"
        >
          <BlenderIcon name="shading-solid" :size="11" />
          <span>Solid</span>
        </button>

        <button 
          @click="toolStore.viewport.shading = 'wireframe'" 
          class="px-1.5 py-0.5 rounded-xs text-[10px] flex items-center space-x-1 transition"
          :class="toolStore.viewport.shading === 'wireframe' ? 'bg-ui-active text-ui-textPrimary font-bold border border-ui-borderStrong shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary'"
          title="Wireframe Mode"
        >
          <BlenderIcon name="shading-wire" :size="11" />
          <span>Wire</span>
        </button>

        <button 
          @click="toolStore.viewport.shading = 'psx'" 
          class="px-1.5 py-0.5 rounded-xs text-[10px] flex items-center space-x-1 transition"
          :class="toolStore.viewport.shading === 'psx' ? 'bg-ui-active text-ui-textPrimary font-bold border border-ui-borderStrong shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary'"
          title="PSX Retro Preview"
        >
          <BlenderIcon name="shading-rendered" :size="11" />
          <span>PSX</span>
        </button>
      </div>

      <!-- Quick Toggles: X-Ray & Quad View -->
      <div class="flex items-center bg-ui-input rounded-xs p-0.5 border border-ui-borderDefault">
        <button 
          @click="toolStore.viewport.xray = !toolStore.viewport.xray" 
          class="px-1.5 py-0.5 rounded-xs text-[10px] font-bold transition"
          :class="toolStore.viewport.xray ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-ui-textMuted hover:text-ui-textPrimary'"
          title="Toggle X-Ray Transparency (Alt+Z)"
        >
          X-Ray
        </button>

        <button 
          @click="toolStore.viewport.quadView = !toolStore.viewport.quadView" 
          class="px-1.5 py-0.5 rounded-xs text-[10px] font-bold transition"
          :class="toolStore.viewport.quadView ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'text-ui-textMuted hover:text-ui-textPrimary'"
          title="Toggle Quad Ortho View (Ctrl+Alt+Q)"
        >
          Quad
        </button>
      </div>

      <!-- Panel Visibility Quick Toggles -->
      <div class="flex items-center bg-ui-input rounded-xs p-0.5 border border-ui-borderDefault">
        <!-- Toggle Left Toolbar -->
        <button 
          @click="layoutStore.toggleLeftToolbar()"
          class="p-1 rounded-xs transition"
          :class="layoutStore.showLeftToolbar ? 'text-ui-accent bg-ui-active' : 'text-ui-textMuted hover:text-ui-textPrimary'"
          :title="layoutStore.showLeftToolbar ? 'Hide Left Toolbar' : 'Show Left Toolbar'"
        >
          <PanelLeft class="w-3.5 h-3.5" />
        </button>

        <!-- Toggle Right Sidebar -->
        <button 
          @click="layoutStore.toggleRightSidebar()"
          class="p-1 rounded-xs transition"
          :class="layoutStore.showRightSidebar ? 'text-ui-accent bg-ui-active' : 'text-ui-textMuted hover:text-ui-textPrimary'"
          :title="layoutStore.showRightSidebar ? 'Hide Right Inspector' : 'Show Right Inspector'"
        >
          <PanelRight class="w-3.5 h-3.5" />
        </button>
      </div>

      <!-- Hotkeys Button -->
      <button 
        @click="$emit('open-hotkeys')"
        title="Keyboard Shortcuts"
        class="p-1.5 text-ui-textSecondary hover:text-ui-textPrimary rounded-xs hover:bg-ui-hover transition"
      >
        <Keyboard class="w-3.5 h-3.5" />
      </button>

      <!-- Main Export Button -->
      <button 
        @click="$emit('open-export')"
        class="flex items-center gap-1.5 px-2.5 h-6 bg-ui-accent hover:bg-ui-accentHover text-white rounded-xs text-xs font-mono font-bold shadow-xs transition active:scale-95 border border-ui-accent/80"
      >
        <Download class="w-3 h-3" />
        <span>Export</span>
      </button>
    </div>
  </header>
</template>
