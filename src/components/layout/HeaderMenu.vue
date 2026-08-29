<script setup lang="ts">
import { ref } from 'vue'
import * as THREE from 'three'
import { useProjectStore } from '../../stores/projectStore'
import { useToolStore } from '../../stores/toolStore'
import { useHistoryStore } from '../../stores/historyStore'
import { useAnimationStore } from '../../stores/animationStore'
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
  CheckSquare,
  SquareDashed,
  Image as ImageIcon,
  LogOut,
  Sparkles,
  FileCode
} from 'lucide-vue-next'

import { PrimitiveType } from '../../core/primitives/PrimitiveTypes'
import { PrimitivePlacementMode } from '../../core/operators/placement/PrimitivePlacementOperator'
import { PlacementOrientation } from '../../core/placement/SurfacePlacementSolver'
import { ProjectSerializer } from '../../core/project/ProjectSerializer'
import { ObjImport } from '../../core/import/ObjImport'
import { GltfImport } from '../../core/import/GltfImport'
import { ImageImport } from '../../core/import/ImageImport'
import { exportToOBJ, exportToMTL } from '../../core/export/ObjExport'
import { exportToGLTF } from '../../core/export/GltfExport'

const projectStore = useProjectStore()
const toolStore = useToolStore()
const historyStore = useHistoryStore()
const animationStore = useAnimationStore()

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

function handleStartPrimitivePlacement(type: PrimitiveType) {
  window.dispatchEvent(
    new CustomEvent('blender-modal-op', {
      detail: {
        tool: 'primitive',
        primitiveType: type,
        mode: currentPlacementMode.value,
        orientation: currentOrientation.value
      }
    })
  )
  closeDropdowns()
}

// ----------------------------------------------------
// PROJECT SAVE / LOAD
// ----------------------------------------------------
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
    toolStore.viewport
  )
  ProjectSerializer.downloadProject(jsonStr, projectStore.projectName || 'PSX_Model')
  closeDropdowns()
}

function saveProjectAs() {
  const customName = prompt('Enter project file name:', projectStore.projectName || 'PSX_Model')
  if (!customName) return
  projectStore.projectName = customName
  saveProject()
}

function handleLoadProject(event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.files || input.files.length === 0) return
  const file = input.files[0]
  const reader = new FileReader()
  reader.onload = async (e) => {
    try {
      const proj = ProjectSerializer.deserialize(e.target?.result as string)
      projectStore.projectName = proj.projectName || 'PSX_Model'
      projectStore.meshes = proj.meshes || []
      projectStore.materials = proj.materials || []
      if (proj.activePalette) projectStore.activePalette = proj.activePalette
      
      // Load texture image onto pixel buffer
      if (proj.textureDataUrl) {
        const img = new Image()
        img.onload = () => {
          projectStore.pixelBuffer.ctx.drawImage(img, 0, 0)
        }
        img.src = proj.textureDataUrl
      }

      // Load Armature & Animation
      if (proj.armature) {
        animationStore.armature = proj.armature
        animationStore.selectedBoneId = proj.armature.bones[0]?.id || null
      }
      if (proj.viewportSettings) {
        toolStore.viewport = { ...toolStore.viewport, ...proj.viewportSettings }
      }

      projectStore.activeMeshId = projectStore.meshes[0]?.id || ''
      projectStore.clearSubSelections()
      projectStore.recordState('Load Project')
    } catch (err) {
      alert(`Failed to load project file: ${err}`)
    }
  }
  reader.readAsText(file)
  input.value = ''
  closeDropdowns()
}

// ----------------------------------------------------
// 3D & TEXTURE IMPORTERS
// ----------------------------------------------------
function handleImportObj(event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.files || input.files.length === 0) return
  const file = input.files[0]
  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const result = ObjImport.parse(e.target?.result as string, file.name.replace('.obj', ''))
      if (result.meshes.length > 0) {
        projectStore.meshes.push(...result.meshes)
        projectStore.activeMeshId = result.meshes[0].id
        projectStore.recordState(`Import OBJ (${file.name})`)
      }
    } catch (err) {
      alert(`Failed to import OBJ: ${err}`)
    }
  }
  reader.readAsText(file)
  input.value = ''
  closeDropdowns()
}

function handleImportGltf(event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.files || input.files.length === 0) return
  const file = input.files[0]
  const reader = new FileReader()
  reader.onload = async (e) => {
    try {
      const buffer = e.target?.result as ArrayBuffer
      const result = await GltfImport.loadFromArrayBuffer(buffer, file.name.replace(/\.(gltf|glb)$/i, ''))
      if (result.meshes.length > 0) {
        projectStore.meshes.push(...result.meshes)
        projectStore.activeMeshId = result.meshes[0].id
      }
      if (result.armature) {
        animationStore.armature = result.armature
        animationStore.selectedBoneId = result.armature.bones[0]?.id || null
      }
      projectStore.recordState(`Import GLTF (${file.name})`)
    } catch (err) {
      alert(`Failed to import GLTF/GLB: ${err}`)
    }
  }
  reader.readAsArrayBuffer(file)
  input.value = ''
  closeDropdowns()
}

function handleImportTexture(event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.files || input.files.length === 0) return
  const file = input.files[0]
  ImageImport.loadToPixelBuffer(file, projectStore.pixelBuffer).then(() => {
    projectStore.recordState(`Import Texture (${file.name})`)
  })
  input.value = ''
  closeDropdowns()
}

// ----------------------------------------------------
// QUICK EXPORTERS
// ----------------------------------------------------
async function handleQuickExportGltf() {
  const tex = new THREE.CanvasTexture(projectStore.pixelBuffer.canvas)
  const textureMap = new Map<string, THREE.Texture>()
  textureMap.set('default_material', tex)

  const blob = await exportToGLTF(projectStore.meshes, textureMap, animationStore.armature.clips, true)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${projectStore.projectName}.glb`
  a.click()
  URL.revokeObjectURL(url)
  closeDropdowns()
}

function handleQuickExportObj() {
  const objText = exportToOBJ(projectStore.meshes, `${projectStore.projectName}.mtl`)
  const mtlText = exportToMTL('default_material', `${projectStore.projectName}_texture.png`)

  const objBlob = new Blob([objText], { type: 'text/plain' })
  const url1 = URL.createObjectURL(objBlob)
  const a1 = document.createElement('a')
  a1.href = url1
  a1.download = `${projectStore.projectName}.obj`
  a1.click()
  URL.revokeObjectURL(url1)

  const mtlBlob = new Blob([mtlText], { type: 'text/plain' })
  const url2 = URL.createObjectURL(mtlBlob)
  const a2 = document.createElement('a')
  a2.href = url2
  a2.download = `${projectStore.projectName}.mtl`
  a2.click()
  URL.revokeObjectURL(url2)
  closeDropdowns()
}

function handleExitProject() {
  if (confirm('Are you sure you want to exit? Any unsaved changes will be lost.')) {
    emit('new-project')
  }
  closeDropdowns()
}
</script>

<template>
  <header class="h-11 bg-dcc-900 border-b border-dcc-750 flex items-center justify-between px-3 z-30 select-none" @click="closeDropdowns">
    <!-- Hidden File Inputs -->
    <input ref="loadProjectInput" type="file" accept=".psxproj,.json" class="hidden" @change="handleLoadProject" />
    <input ref="importObjInput" type="file" accept=".obj" class="hidden" @change="handleImportObj" />
    <input ref="importGltfInput" type="file" accept=".gltf,.glb" class="hidden" @change="handleImportGltf" />
    <input ref="importTextureInput" type="file" accept="image/*" class="hidden" @change="handleImportTexture" />

    <!-- Left: Brand + Menus -->
    <div class="flex items-center space-x-1">
      <div class="flex items-center space-x-2 mr-3 px-1.5 py-0.5 bg-dcc-800 rounded border border-dcc-700">
        <BlenderIcon name="mesh-cube" :size="16" color="#f59e0b" />
        <span class="font-bold tracking-wider text-xs uppercase text-slate-200 font-mono">POLY<span class="text-indigo-400">ECHO</span></span>
      </div>

      <!-- File Menu -->
      <div class="relative" @click.stop>
        <button 
          class="px-2.5 py-1 text-xs font-medium rounded hover:bg-dcc-750 text-slate-300 hover:text-white transition"
          :class="{ 'bg-dcc-750 text-white': activeDropdown === 'file' }"
          @click="toggleDropdown('file')"
        >
          File
        </button>

        <div v-if="activeDropdown === 'file'" class="absolute left-0 top-full mt-1 w-56 bg-dcc-850 border border-dcc-700 rounded-lg shadow-2xl py-1 z-50 text-xs animate-in fade-in zoom-in-95 duration-100">
          <!-- New -->
          <button @click="$emit('new-project'); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-dcc-750 flex items-center justify-between">
            <span class="flex items-center gap-2"><Plus class="w-3.5 h-3.5 text-indigo-400" /> New Project...</span>
            <span class="text-slate-500 font-mono text-[10px]">Ctrl+N</span>
          </button>

          <!-- Open -->
          <button @click="loadProjectInput?.click()" class="w-full text-left px-3 py-1.5 hover:bg-dcc-750 flex items-center justify-between">
            <span class="flex items-center gap-2"><FolderOpen class="w-3.5 h-3.5 text-amber-400" /> Open Project (.psxproj)</span>
            <span class="text-slate-500 font-mono text-[10px]">Ctrl+O</span>
          </button>

          <!-- Save -->
          <button @click="saveProject" class="w-full text-left px-3 py-1.5 hover:bg-dcc-750 flex items-center justify-between">
            <span class="flex items-center gap-2"><Save class="w-3.5 h-3.5 text-emerald-400" /> Save Project</span>
            <span class="text-slate-500 font-mono text-[10px]">Ctrl+S</span>
          </button>

          <!-- Save As -->
          <button @click="saveProjectAs" class="w-full text-left px-3 py-1.5 hover:bg-dcc-750 flex items-center justify-between text-slate-300">
            <span class="flex items-center gap-2"><FileCode class="w-3.5 h-3.5" /> Save Project As...</span>
          </button>

          <div class="h-px bg-dcc-750 my-1"></div>

          <!-- Import Submenu Header -->
          <div class="px-3 py-1 text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
            Import Assets
          </div>
          <button @click="importObjInput?.click()" class="w-full text-left px-3 py-1.5 hover:bg-dcc-750 flex items-center gap-2 text-slate-200">
            <Upload class="w-3.5 h-3.5 text-sky-400" /> Import Wavefront (.obj)
          </button>
          <button @click="importGltfInput?.click()" class="w-full text-left px-3 py-1.5 hover:bg-dcc-750 flex items-center gap-2 text-slate-200">
            <Upload class="w-3.5 h-3.5 text-indigo-400" /> Import GLTF / GLB (.glb, .gltf)
          </button>
          <button @click="importTextureInput?.click()" class="w-full text-left px-3 py-1.5 hover:bg-dcc-750 flex items-center gap-2 text-slate-200">
            <ImageIcon class="w-3.5 h-3.5 text-pink-400" /> Import Texture Image (PNG, JPG)
          </button>

          <div class="h-px bg-dcc-750 my-1"></div>

          <!-- Export Submenu Header -->
          <div class="px-3 py-1 text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
            Export Assets
          </div>
          <button @click="handleQuickExportGltf" class="w-full text-left px-3 py-1.5 hover:bg-dcc-750 flex items-center justify-between text-slate-200">
            <span class="flex items-center gap-2"><Download class="w-3.5 h-3.5 text-indigo-400" /> Quick Export .GLB</span>
          </button>
          <button @click="handleQuickExportObj" class="w-full text-left px-3 py-1.5 hover:bg-dcc-750 flex items-center justify-between text-slate-200">
            <span class="flex items-center gap-2"><Download class="w-3.5 h-3.5 text-sky-400" /> Quick Export .OBJ</span>
          </button>
          <button @click="$emit('open-export'); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-dcc-750 flex items-center justify-between text-amber-400 font-bold">
            <span class="flex items-center gap-2"><Sparkles class="w-3.5 h-3.5" /> Export Game Assets...</span>
            <span class="text-slate-500 font-mono text-[10px]">Ctrl+E</span>
          </button>

          <div class="h-px bg-dcc-750 my-1"></div>

          <!-- Exit -->
          <button @click="handleExitProject" class="w-full text-left px-3 py-1.5 hover:bg-rose-950/60 hover:text-rose-300 flex items-center gap-2 text-slate-400">
            <LogOut class="w-3.5 h-3.5" /> Exit / Reset Scene
          </button>
        </div>
      </div>

      <!-- Edit Menu -->
      <div class="relative" @click.stop>
        <button 
          class="px-2.5 py-1 text-xs font-medium rounded hover:bg-dcc-750 text-slate-300 hover:text-white transition"
          :class="{ 'bg-dcc-750 text-white': activeDropdown === 'edit' }"
          @click="toggleDropdown('edit')"
        >
          Edit
        </button>
        <div v-if="activeDropdown === 'edit'" class="absolute left-0 top-full mt-1 w-52 bg-dcc-850 border border-dcc-700 rounded shadow-2xl py-1 z-50 text-xs">
          <button @click="historyStore.undo(); closeDropdowns()" :disabled="historyStore.undoStack.length === 0" class="w-full text-left px-3 py-1.5 hover:bg-dcc-750 flex items-center justify-between disabled:opacity-40">
            <span class="flex items-center gap-2"><Undo2 class="w-3.5 h-3.5" /> Undo</span>
            <span class="text-slate-500 font-mono text-[10px]">Ctrl+Z</span>
          </button>
          <button @click="historyStore.redo(); closeDropdowns()" :disabled="historyStore.redoStack.length === 0" class="w-full text-left px-3 py-1.5 hover:bg-dcc-750 flex items-center justify-between disabled:opacity-40">
            <span class="flex items-center gap-2"><Redo2 class="w-3.5 h-3.5" /> Redo</span>
            <span class="text-slate-500 font-mono text-[10px]">Ctrl+Y</span>
          </button>

          <div class="h-px bg-dcc-750 my-1"></div>

          <button @click="projectStore.duplicateSelection(toolStore.selectMode); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-dcc-750 flex items-center justify-between text-amber-300">
            <span class="flex items-center gap-2"><CopyPlus class="w-3.5 h-3.5" /> Duplicate</span>
            <span class="text-slate-500 font-mono text-[10px]">Shift+D</span>
          </button>
          <button @click="projectStore.copySelection(toolStore.selectMode); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-dcc-750 flex items-center justify-between">
            <span class="flex items-center gap-2"><Copy class="w-3.5 h-3.5" /> Copy</span>
            <span class="text-slate-500 font-mono text-[10px]">Ctrl+C</span>
          </button>
          <button @click="projectStore.pasteClipboard(); closeDropdowns()" :disabled="!projectStore.clipboard" class="w-full text-left px-3 py-1.5 hover:bg-dcc-750 flex items-center justify-between disabled:opacity-40">
            <span class="flex items-center gap-2"><ClipboardPaste class="w-3.5 h-3.5" /> Paste</span>
            <span class="text-slate-500 font-mono text-[10px]">Ctrl+V</span>
          </button>

          <div class="h-px bg-dcc-750 my-1"></div>

          <button @click="projectStore.selectAll(toolStore.selectMode); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-dcc-750 flex items-center justify-between">
            <span class="flex items-center gap-2"><CheckSquare class="w-3.5 h-3.5" /> Select All</span>
            <span class="text-slate-500 font-mono text-[10px]">A</span>
          </button>
          <button @click="projectStore.deselectAll(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-dcc-750 flex items-center justify-between">
            <span class="flex items-center gap-2"><SquareDashed class="w-3.5 h-3.5" /> Deselect All</span>
            <span class="text-slate-500 font-mono text-[10px]">Alt+A</span>
          </button>
        </div>
      </div>

      <!-- Add Primitive Menu with Blender Icons -->
      <div class="relative" @click.stop>
        <button 
          class="px-2.5 py-1 text-xs font-medium rounded hover:bg-dcc-750 text-slate-300 hover:text-white transition flex items-center gap-1"
          :class="{ 'bg-dcc-750 text-white': activeDropdown === 'add' }"
          @click="toggleDropdown('add')"
        >
          <span>Add</span>
        </button>
        <div v-if="activeDropdown === 'add'" class="absolute left-0 top-full mt-1 w-60 bg-dcc-850 border border-dcc-700 rounded shadow-2xl py-1.5 z-50 text-xs max-h-[85vh] overflow-y-auto">
          <!-- Mode & Orientation Options -->
          <div class="px-2.5 py-1 mb-1 border-b border-dcc-750 flex flex-col gap-1.5">
            <div class="flex items-center justify-between text-[11px] text-slate-400">
              <span>Mode:</span>
              <div class="flex bg-dcc-800 rounded p-0.5 border border-dcc-700">
                <button 
                  @click="currentPlacementMode = PrimitivePlacementMode.CAD_DRAW" 
                  class="px-2 py-0.5 rounded text-[10px] font-medium transition"
                  :class="currentPlacementMode === PrimitivePlacementMode.CAD_DRAW ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'"
                >
                  CAD Draw
                </button>
                <button 
                  @click="currentPlacementMode = PrimitivePlacementMode.PLACE" 
                  class="px-2 py-0.5 rounded text-[10px] font-medium transition"
                  :class="currentPlacementMode === PrimitivePlacementMode.PLACE ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-slate-200'"
                >
                  Place
                </button>
              </div>
            </div>

            <div class="flex items-center justify-between text-[11px] text-slate-400">
              <span>Orientation:</span>
              <div class="flex bg-dcc-800 rounded p-0.5 border border-dcc-700">
                <button 
                  @click="currentOrientation = 'WORLD'" 
                  class="px-2 py-0.5 rounded text-[10px] font-medium transition"
                  :class="currentOrientation === 'WORLD' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'"
                >
                  World
                </button>
                <button 
                  @click="currentOrientation = 'SURFACE'" 
                  class="px-2 py-0.5 rounded text-[10px] font-medium transition"
                  :class="currentOrientation === 'SURFACE' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'"
                >
                  Surface
                </button>
              </div>
            </div>
          </div>

          <!-- BASIC PRIMITIVES -->
          <div class="px-2.5 py-0.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Basic</div>
          <button @click="handleStartPrimitivePlacement('BOX')" class="w-full text-left px-3 py-1 hover:bg-dcc-750 flex items-center gap-2">
            <BlenderIcon name="mesh-cube" :size="14" color="#f59e0b" /> Box / Cube
          </button>
          <button @click="handleStartPrimitivePlacement('PLANE')" class="w-full text-left px-3 py-1 hover:bg-dcc-750 flex items-center gap-2">
            <BlenderIcon name="mesh-plane" :size="14" color="#38bdf8" /> Plane / Grid
          </button>
          <button @click="handleStartPrimitivePlacement('SPHERE')" class="w-full text-left px-3 py-1 hover:bg-dcc-750 flex items-center gap-2">
            <BlenderIcon name="mesh-sphere" :size="14" color="#a855f7" /> Sphere
          </button>
          <button @click="handleStartPrimitivePlacement('ICOSPHERE')" class="w-full text-left px-3 py-1 hover:bg-dcc-750 flex items-center gap-2">
            <BlenderIcon name="mesh-icosphere" :size="14" color="#818cf8" /> Icosphere
          </button>
          <button @click="handleStartPrimitivePlacement('CYLINDER')" class="w-full text-left px-3 py-1 hover:bg-dcc-750 flex items-center gap-2">
            <BlenderIcon name="mesh-cylinder" :size="14" color="#10b981" /> Cylinder
          </button>
          <button @click="handleStartPrimitivePlacement('CONE')" class="w-full text-left px-3 py-1 hover:bg-dcc-750 flex items-center gap-2">
            <BlenderIcon name="mesh-cone" :size="14" color="#f43f5e" /> Cone
          </button>
          <button @click="handleStartPrimitivePlacement('PYRAMID')" class="w-full text-left px-3 py-1 hover:bg-dcc-750 flex items-center gap-2">
            <BlenderIcon name="mesh-cone" :size="14" color="#fb923c" /> Pyramid
          </button>

          <div class="h-px bg-dcc-750 my-1"></div>

          <!-- SHAPES PRIMITIVES -->
          <div class="px-2.5 py-0.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Shapes</div>
          <button @click="handleStartPrimitivePlacement('CIRCLE')" class="w-full text-left px-3 py-1 hover:bg-dcc-750 flex items-center gap-2">
            <BlenderIcon name="mesh-circle" :size="14" color="#22d3ee" /> Circle / Disc
          </button>
          <button @click="handleStartPrimitivePlacement('PRISM')" class="w-full text-left px-3 py-1 hover:bg-dcc-750 flex items-center gap-2">
            <BlenderIcon name="mesh-cylinder" :size="14" color="#34d399" /> Prism (3-8 Sided)
          </button>
          <button @click="handleStartPrimitivePlacement('TORUS')" class="w-full text-left px-3 py-1 hover:bg-dcc-750 flex items-center gap-2">
            <BlenderIcon name="mesh-torus" :size="14" color="#ec4899" /> Torus / Donut
          </button>
          <button @click="handleStartPrimitivePlacement('CAPSULE')" class="w-full text-left px-3 py-1 hover:bg-dcc-750 flex items-center gap-2">
            <BlenderIcon name="mesh-cylinder" :size="14" color="#a78bfa" /> Capsule
          </button>
          <button @click="handleStartPrimitivePlacement('WEDGE')" class="w-full text-left px-3 py-1 hover:bg-dcc-750 flex items-center gap-2">
            <BlenderIcon name="mesh-cube" :size="14" color="#eab308" /> Wedge / Ramp
          </button>
          <button @click="handleStartPrimitivePlacement('TUBE')" class="w-full text-left px-3 py-1 hover:bg-dcc-750 flex items-center gap-2">
            <BlenderIcon name="mesh-torus" :size="14" color="#14b8a6" /> Tube / Pipe
          </button>

          <div class="h-px bg-dcc-750 my-1"></div>

          <!-- BUILD PRIMITIVES -->
          <div class="px-2.5 py-0.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Build</div>
          <button @click="handleStartPrimitivePlacement('WALL')" class="w-full text-left px-3 py-1 hover:bg-dcc-750 flex items-center gap-2">
            <BlenderIcon name="mesh-plane" :size="14" color="#f97316" /> Wall Segment
          </button>
          <button @click="handleStartPrimitivePlacement('STAIRS')" class="w-full text-left px-3 py-1 hover:bg-dcc-750 flex items-center gap-2">
            <BlenderIcon name="mesh-cube" :size="14" color="#06b6d4" /> Stairs
          </button>
          <button @click="handleStartPrimitivePlacement('ARCH')" class="w-full text-left px-3 py-1 hover:bg-dcc-750 flex items-center gap-2">
            <BlenderIcon name="mesh-torus" :size="14" color="#6366f1" /> Arch
          </button>
        </div>
      </div>
    </div>

    <!-- Center: Workspace Mode Switcher Tabs with Blender Icons -->
    <!-- Center: Application Workspaces (MODEL, UV/PAINT, RIG, ANIMATE) -->
    <div class="flex items-center bg-ui-input p-0.5 rounded-xs border border-ui-borderSubtle">
      <button 
        @click="toolStore.setAppMode('model')"
        class="flex items-center gap-1.5 px-3 h-6 rounded-xs text-xs font-mono font-medium transition"
        :class="toolStore.appMode === 'model' ? 'bg-ui-accent text-white font-bold shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
      >
        <BlenderIcon name="mesh-cube" :size="13" />
        <span>MODEL</span>
      </button>

      <button 
        @click="toolStore.setAppMode('uvpaint')"
        class="flex items-center gap-1.5 px-3 h-6 rounded-xs text-xs font-mono font-medium transition"
        :class="toolStore.appMode === 'uvpaint' ? 'bg-ui-accent text-white font-bold shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
      >
        <BlenderIcon name="uv" :size="13" />
        <span>UV / PAINT</span>
      </button>

      <button 
        @click="toolStore.setAppMode('rig')"
        class="flex items-center gap-1.5 px-3 h-6 rounded-xs text-xs font-mono font-medium transition"
        :class="toolStore.appMode === 'rig' ? 'bg-cyan-600 text-white font-bold shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
        title="Custom Skeletal Rigging Workspace"
      >
        <BlenderIcon name="bone" :size="13" />
        <span>RIG</span>
      </button>

      <button 
        @click="toolStore.setAppMode('animate')"
        class="flex items-center gap-1.5 px-3 h-6 rounded-xs text-xs font-mono font-medium transition"
        :class="toolStore.appMode === 'animate' ? 'bg-ui-accent text-white font-bold shadow-xs' : 'text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover'"
      >
        <BlenderIcon name="keyframe" :size="13" />
        <span>ANIMATE</span>
      </button>
    </div>

    <!-- Right: Hotkeys & Main Export -->
    <div class="flex items-center space-x-1.5">
      <!-- Hotkeys modal button -->
      <button 
        @click="$emit('open-hotkeys')"
        title="Keyboard Shortcuts"
        class="p-1.5 text-ui-textSecondary hover:text-ui-textPrimary rounded-xs hover:bg-ui-hover transition"
      >
        <Keyboard class="w-4 h-4" />
      </button>

      <!-- Main Export Button -->
      <button 
        @click="$emit('open-export')"
        class="flex items-center gap-1.5 px-3 h-7 bg-ui-accent hover:bg-ui-accentHover text-white rounded-xs text-xs font-mono font-bold shadow-xs transition active:scale-95 border border-ui-accent/80"
      >
        <Download class="w-3.5 h-3.5" />
        <span>Export</span>
      </button>
    </div>
  </header>
</template>
