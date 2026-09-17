<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { useToolStore } from '../../stores/toolStore'
import { useHistoryStore } from '../../stores/historyStore'
import { useAnimationStore } from '../../stores/animationStore'
import { useKeymapStore } from '../../stores/keymapStore'
import BlenderIcon from '../icons/BlenderIcon.vue'
import PolyEchoLogo from '../icons/PolyEchoLogo.vue'
import ImportTextureModal from '../modals/ImportTextureModal.vue'

import type { PivotPoint } from '../../types/tools'
import { loadOpenProject, saveOpenProject } from '../../core/project/projectIo'
import { ObjImport } from '../../core/import/ObjImport'
import { GltfImport } from '../../core/import/GltfImport'
import { importBlockbench } from '../../core/import/BlockbenchImport'
import {
  getLastProjectPath,
  isDesktopApp,
  listRecentProjects,
  openBinaryFile,
  openProjectPath,
  openTextFile,
  requestDesktopQuit,
  revealCrashLog,
  revealInFolder,
  showDesktopAbout
} from '../../core/desktop/desktopApi'
import { EDITOR_EVENTS, requestCameraView, requestFillFace, requestModalTool } from '../../core/commands/editorCommands'

type NavMenu = 'file' | 'edit' | 'mesh' | 'workspace' | 'space' | 'view' | 'snap' | 'overlays' | null
type CameraView = 'persp' | 'top' | 'front' | 'right' | 'iso'

const projectStore = useProjectStore()
const toolStore = useToolStore()
const historyStore = useHistoryStore()
const animationStore = useAnimationStore()
const keymapStore = useKeymapStore()

const undoDescription = computed(() =>
  historyStore.undoStack[historyStore.undoStack.length - 1]?.description || ''
)
const redoDescription = computed(() =>
  historyStore.redoStack[historyStore.redoStack.length - 1]?.description || ''
)

const isImporting = ref(false)
const recentProjects = ref<string[]>([])
const lastSavedPath = ref<string | null>(null)
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
const importBbInput = ref<HTMLInputElement | null>(null)
const importTextureInput = ref<HTMLInputElement | null>(null)
const showImportModal = ref(false)
const pendingImportFile = ref<File | null>(null)

function toggleDropdown(name: NavMenu) {
  const next = activeDropdown.value === name ? null : name
  activeDropdown.value = next
  if (next === 'file' && isDesktopApp()) void refreshRecent()
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

const snapTargetOn = computed(() => toolStore.snapping.vertex || toolStore.snapping.edge || toolStore.snapping.face)
const snapToggleChord = computed(() => keymapStore.bindings.find(b => b.id === 'toggle_snap')?.currentKey || 'Shift+Tab')
const gridSnapOn = computed(() => toolStore.snapping.grid)

function setGridSnap(on: boolean) {
  toolStore.snapping.grid = on
}

function toggleGridSnap() {
  toolStore.snapping.grid = !toolStore.snapping.grid
}

function setGridStep(size: number) {
  toolStore.snapping.gridSize = size
  toolStore.snapping.grid = true
}
const overlayOn = computed(() =>
  toolStore.viewport.faceOrientation || !toolStore.viewport.showGrid || !toolStore.viewport.showAxes
)

function runMeshSubdivide() {
  if (toolStore.selectMode === 'object' || toolStore.selectMode === 'vertex' || toolStore.selectMode === 'edge' || toolStore.selectMode === 'face') {
    projectStore.performSubdivide(toolStore.selectMode)
  }
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
  { id: 'model' as const, label: 'Modeling', icon: 'workspace-model' as const, desc: '3D Mesh Polygon Editing' },
  { id: 'blockout' as const, label: 'Blockout', icon: 'workspace-blockout' as const, desc: 'Multi-View Reference Tracing' },
  { id: 'uvpaint' as const, label: 'UV / Paint', icon: 'workspace-paint' as const, desc: 'UV Unwrap & Pixel Texture Painting' },
  { id: 'rig' as const, label: 'Rigging', icon: 'workspace-rig' as const, desc: 'Skeletal Armature & Weight Painting' },
  { id: 'animate' as const, label: 'Animation', icon: 'workspace-animation' as const, desc: 'Keyframe Timeline & Posing' }
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

async function saveProject(saveAs = false) {
  await saveOpenProject({ saveAs })
  closeDropdowns()
}

async function refreshRecent() {
  recentProjects.value = await listRecentProjects()
  lastSavedPath.value = getLastProjectPath()
}

function recentLabel(filePath: string) {
  const parts = filePath.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || filePath
}

async function applyProjectText(text: string, filePath?: string | null) {
  await loadOpenProject(text, filePath)
}

async function openProject() {
  closeDropdowns()
  if (isDesktopApp()) {
    const file = await openTextFile([{ name: 'PolyEcho Project', extensions: ['psxproj'] }])
    if (!file) return
    try {
      await applyProjectText(file.text, file.path)
      await refreshRecent()
    } catch (err) {
      alert('Failed to load project: ' + err)
    }
    return
  }
  loadProjectInput.value?.click()
}

async function openRecent(filePath: string) {
  closeDropdowns()
  const file = await openProjectPath(filePath)
  if (!file) {
    alert('Could not open that project. It may have been moved or deleted.')
    await refreshRecent()
    return
  }
  try {
    await applyProjectText(file.text, file.path)
  } catch (err) {
    alert('Failed to load project: ' + err)
  }
}

async function handleLoadProject(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    await applyProjectText(await file.text())
  } catch (err) {
    alert('Failed to load project: ' + err)
  } finally {
    if (loadProjectInput.value) loadProjectInput.value.value = ''
    closeDropdowns()
  }
}

async function importObj() {
  closeDropdowns()
  if (isDesktopApp()) {
    const file = await openTextFile([{ name: 'Wavefront OBJ', extensions: ['obj'] }])
    if (!file) return
    await importObjText(file.text, file.name)
    return
  }
  importObjInput.value?.click()
}

async function importObjText(text: string, fileName: string) {
  if (isImporting.value) return
  isImporting.value = true
  try {
    const result = ObjImport.parse(text, fileName.replace('.obj', ''))
    if (result.meshes.length > 0) {
      projectStore.recordPixels(`Import OBJ (${fileName})`)
      for (const name of result.materialNames) {
        if (name === 'default_material') continue
        if (projectStore.materials.some(m => m.id === name || m.name === name)) continue
        const created = projectStore.createMaterial(name, '#ffffff', null, { record: false, select: false })
        for (const mesh of result.meshes) {
          if (mesh.materialId === name) mesh.materialId = created.id
        }
      }
      for (const m of result.meshes) {
        projectStore.meshes.push(m)
      }
      projectStore.activeMeshId = result.meshes[0].id
      projectStore.selectedMeshIds = [result.meshes[0].id]
      projectStore.markGeometryUpdated()
    }
  } catch {
    alert('Failed to import OBJ')
  } finally {
    isImporting.value = false
  }
}

async function handleImportObj(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    await importObjText(await file.text(), file.name)
  } finally {
    if (importObjInput.value) importObjInput.value.value = ''
    closeDropdowns()
  }
}

async function importGltf() {
  closeDropdowns()
  if (isDesktopApp()) {
    const file = await openBinaryFile([{ name: 'glTF', extensions: ['glb', 'gltf'] }])
    if (!file) return
    await importGltfBuffer(file.bytes, file.name)
    return
  }
  importGltfInput.value?.click()
}

async function importGltfBuffer(buffer: ArrayBuffer, fileName: string) {
  if (isImporting.value) return
  isImporting.value = true
  try {
    const result = await GltfImport.loadFromArrayBuffer(buffer, fileName)
    projectStore.recordPixels(`Import GLTF (${fileName})`)
    const texIdMap = new Map<string, string>()
    for (const tex of result.textures ?? []) {
      const created = projectStore.createTexture(
        tex.name,
        tex.width || 64,
        tex.height || 64,
        tex.dataUrl,
        undefined,
        { record: false, select: false }
      )
      texIdMap.set(tex.id, created.id)
    }
    const matIdMap = new Map<string, string>()
    for (const mat of result.materials ?? []) {
      const created = projectStore.createMaterial(
        mat.name,
        mat.color,
        mat.textureId ? (texIdMap.get(mat.textureId) ?? null) : null,
        { record: false, select: false }
      )
      created.roughness = mat.roughness
      created.metalness = mat.metalness
      created.opacity = mat.opacity
      created.alphaTest = mat.alphaTest
      created.blendMode = mat.blendMode
      created.doubleSided = mat.doubleSided
      created.wireframe = mat.wireframe
      if (mat.shading) created.shading = mat.shading
      matIdMap.set(mat.id, created.id)
    }
    if (result.meshes.length > 0) {
      for (const m of result.meshes) {
        const remapped = m.materialId ? matIdMap.get(m.materialId) : undefined
        if (remapped) m.materialId = remapped
        projectStore.meshes.push(m)
      }
      projectStore.activeMeshId = result.meshes[0].id
      projectStore.selectedMeshIds = [result.meshes[0].id]
    }
    if (result.armature) {
      animationStore.armature = result.armature
    } else if (result.animations?.length) {
      animationStore.armature.clips.push(...result.animations)
    }
    projectStore.markGeometryUpdated()
  } catch {
    alert('Failed to import GLTF')
  } finally {
    isImporting.value = false
  }
}

async function handleImportGltf(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    await importGltfBuffer(await file.arrayBuffer(), file.name)
  } finally {
    if (importGltfInput.value) importGltfInput.value.value = ''
    closeDropdowns()
  }
}

async function importBlockbenchFile() {
  closeDropdowns()
  if (isDesktopApp()) {
    const file = await openTextFile([{ name: 'Blockbench', extensions: ['bbmodel', 'json'] }])
    if (!file) return
    await importBlockbenchText(file.text, file.name)
    return
  }
  importBbInput.value?.click()
}

async function importBlockbenchText(text: string, fileName: string) {
  if (isImporting.value) return
  isImporting.value = true
  try {
    const result = importBlockbench(text)
    projectStore.recordPixels(`Import Blockbench (${fileName})`)
    let boundMatId: string | undefined
    for (const tex of result.textures) {
      if (!tex.dataUrl) continue
      const created = projectStore.createTexture(tex.name, tex.width, tex.height, tex.dataUrl, undefined, { record: false, select: false })
      if (!boundMatId) {
        const mat = projectStore.createMaterial(
          result.projectName || tex.name,
          '#ffffff',
          created.id,
          { record: false, select: false }
        )
        boundMatId = mat.id
      }
    }
    for (const m of result.meshes) {
      if (boundMatId) m.materialId = boundMatId
      projectStore.meshes.push(m)
    }
    if (result.meshes[0]) {
      projectStore.activeMeshId = result.meshes[0].id
      projectStore.selectedMeshIds = [result.meshes[0].id]
    }
    projectStore.markGeometryUpdated()
  } catch {
    alert('Failed to import Blockbench model')
  } finally {
    isImporting.value = false
  }
}

async function handleImportBlockbench(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    await importBlockbenchText(await file.text(), file.name)
  } finally {
    if (importBbInput.value) importBbInput.value.value = ''
    closeDropdowns()
  }
}

async function importTexture() {
  closeDropdowns()
  if (isDesktopApp()) {
    const file = await openBinaryFile([{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }])
    if (!file) return
    pendingImportFile.value = new File([file.bytes], file.name)
    showImportModal.value = true
    return
  }
  importTextureInput.value?.click()
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
  <header class="master-header-container relative h-8 w-full min-w-0 bg-ui-header border-b border-ui-borderSubtle px-2 flex items-center justify-between text-xs select-none z-40 font-sans shrink-0">
    <!-- Hidden Inputs for File Import -->
    <input ref="loadProjectInput" type="file" accept=".psxproj" class="hidden" @change="handleLoadProject" />
    <input ref="importObjInput" type="file" accept=".obj" class="hidden" @change="handleImportObj" />
    <input ref="importGltfInput" type="file" accept=".gltf,.glb" class="hidden" @change="handleImportGltf" />
    <input ref="importBbInput" type="file" accept=".bbmodel,.json" class="hidden" @change="handleImportBlockbench" />
    <input ref="importTextureInput" type="file" accept="image/*" class="hidden" @change="handleImportTexture" />

    <!-- 1. LEFT: Logo + File, Edit, Mesh + Space/Snap/Symmetry -->
    <div class="flex items-center space-x-1 shrink-0 z-20">
      <PolyEchoLogo class="hidden min-[1366px]:flex mr-2 ml-0.5" />

      <!-- File Menu -->
      <div class="relative">
        <button 
          class="px-1.5 py-0.5 text-[11.5px] font-medium rounded-xs hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textPrimary transition"
          :class="{ 'bg-ui-hover text-ui-textPrimary font-bold': activeDropdown === 'file' }"
          @click="toggleDropdown('file')"
        >
          File
        </button>

        <div v-if="activeDropdown === 'file'" class="absolute left-0 top-full mt-0.5 w-64 bg-ui-panel text-ui-textPrimary border border-ui-borderStrong rounded-xs shadow-2xl py-1 z-50 text-xs">
          <button @click="$emit('new-project'); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between font-medium">
            <span class="flex items-center gap-2"><BlenderIcon name="plus" :size="14" /> New Project</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Ctrl+N</span>
          </button>
          <button @click="openProject" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
            <span class="flex items-center gap-2"><BlenderIcon name="folder" :size="14" color="#fbbf24" /> Open (.psxproj)</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Ctrl+O</span>
          </button>
          <button @click="saveProject(false)" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
            <span class="flex items-center gap-2"><BlenderIcon name="save" :size="14" color="#34d399" /> Save Project</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Ctrl+S</span>
          </button>
          <button v-if="isDesktopApp()" @click="saveProject(true)" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
            <span class="flex items-center gap-2"><BlenderIcon name="save" :size="14" color="#34d399" /> Save As…</span>
          </button>
          <button
            v-if="isDesktopApp() && lastSavedPath"
            class="w-full text-left px-3 py-1.5 hover:bg-ui-hover"
            @click="void revealInFolder(lastSavedPath!); closeDropdowns()"
          >
            Show Project in Folder
          </button>

          <template v-if="isDesktopApp() && recentProjects.length > 0">
            <div class="h-px bg-ui-borderSubtle my-1"></div>
            <div class="px-3 py-1 text-[9.5px] font-bold text-ui-textMuted uppercase tracking-wider">Open Recent</div>
            <button
              v-for="item in recentProjects"
              :key="item"
              :title="item"
              class="w-full text-left px-3 py-1.5 hover:bg-ui-hover truncate"
              @click="openRecent(item)"
            >
              {{ recentLabel(item) }}
            </button>
          </template>

          <div class="h-px bg-ui-borderSubtle my-1"></div>

          <div class="px-3 py-1 text-[9.5px] font-bold text-ui-textMuted uppercase tracking-wider">Import</div>
          <button @click="importObj" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center gap-2">
            <BlenderIcon name="import" :size="14" /> Wavefront (.obj)
          </button>
          <button @click="importGltf" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center gap-2">
            <BlenderIcon name="import" :size="14" /> GLTF / GLB (.glb)
          </button>
          <button @click="importBlockbenchFile" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center gap-2">
            <BlenderIcon name="import" :size="14" /> Blockbench (.bbmodel)
          </button>
          <button @click="importTexture" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center gap-2">
            <BlenderIcon name="image" :size="14" /> Texture (PNG, JPG)
          </button>

          <div class="h-px bg-ui-borderSubtle my-1"></div>
          <div class="px-3 py-1 text-[9.5px] font-bold text-ui-textMuted uppercase tracking-wider">Export</div>
          <button @click="$emit('open-export'); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
            <span class="flex items-center gap-2"><BlenderIcon name="export" :size="14" /> Game Assets…</span>
            <span class="text-ui-textMuted font-mono text-[10px]">GLB · OBJ · BB</span>
          </button>

          <div class="h-px bg-ui-borderSubtle my-1"></div>

          <button @click="$emit('open-preferences'); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
            <span class="flex items-center gap-2"><BlenderIcon name="settings" :size="14" color="#38bdf8" /> Properties & Preferences</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Ctrl+,</span>
          </button>
          <button
            v-if="isDesktopApp()"
            class="w-full text-left px-3 py-1.5 hover:bg-ui-hover"
            @click="void showDesktopAbout(); closeDropdowns()"
          >
            About PolyEcho
          </button>
          <button
            v-if="isDesktopApp()"
            class="w-full text-left px-3 py-1.5 hover:bg-ui-hover"
            @click="void revealCrashLog(); closeDropdowns()"
          >
            Open Crash Log
          </button>
          <button
            v-if="isDesktopApp()"
            class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between"
            @click="void requestDesktopQuit(); closeDropdowns()"
          >
            <span>Quit</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Alt+F4</span>
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

        <div v-if="activeDropdown === 'edit'" class="absolute left-0 top-full mt-0.5 w-56 bg-ui-panel text-ui-textPrimary border border-ui-borderStrong rounded-xs shadow-2xl py-1 z-50 text-xs">
          <button
            :disabled="historyStore.undoStack.length === 0"
            @click="historyStore.undo(); closeDropdowns()"
            class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between disabled:opacity-40 disabled:pointer-events-none"
          >
            <span class="flex items-center gap-2"><BlenderIcon name="undo" :size="14" /> {{ undoDescription ? `Undo ${undoDescription}` : 'Undo' }}</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Ctrl+Z</span>
          </button>
          <button
            :disabled="historyStore.redoStack.length === 0"
            @click="historyStore.redo(); closeDropdowns()"
            class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between disabled:opacity-40 disabled:pointer-events-none"
          >
            <span class="flex items-center gap-2"><BlenderIcon name="redo" :size="14" /> {{ redoDescription ? `Redo ${redoDescription}` : 'Redo' }}</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Ctrl+Y</span>
          </button>
          <div class="h-px bg-ui-borderSubtle my-1"></div>
          <button @click="projectStore.selectAll(toolStore.selectMode); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
            <span>Select All</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Ctrl+A</span>
          </button>
          <button @click="projectStore.deselectAll(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
            <span>Deselect All</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Alt+A</span>
          </button>
          <div class="h-px bg-ui-borderSubtle my-1"></div>
          <button @click="$emit('open-preferences'); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center gap-2">
            <BlenderIcon name="material" :size="14" color="#f59e0b" /> Preferences & Themes
          </button>
          <button @click="$emit('open-hotkeys'); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center gap-2">
            <BlenderIcon name="keyboard" :size="14" color="#38bdf8" /> Hotkey Map
          </button>
        </div>
      </div>

      <!-- Mesh Menu -->
      <div v-if="toolStore.appMode === 'model' || toolStore.appMode === 'blockout'" class="relative">
        <button 
          class="px-1.5 py-0.5 text-[11.5px] font-medium rounded-xs hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textPrimary transition"
          :class="{ 'bg-ui-hover text-ui-textPrimary font-bold': activeDropdown === 'mesh' }"
          @click="toggleDropdown('mesh')"
        >
          Mesh
        </button>

        <div v-if="activeDropdown === 'mesh'" class="absolute left-0 top-full mt-0.5 w-56 bg-ui-panel text-ui-textPrimary border border-ui-borderStrong rounded-xs shadow-2xl py-1 z-50 text-xs">
          <button @click="requestModalTool('extrude'); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
            <span class="flex items-center gap-2"><BlenderIcon name="tool-extrude" :size="14" /> Extrude</span>
            <span class="text-ui-textMuted font-mono text-[10px]">E</span>
          </button>
          <button @click="requestModalTool('inset'); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
            <span class="flex items-center gap-2"><BlenderIcon name="tool-inset" :size="14" /> Inset Faces</span>
            <span class="text-ui-textMuted font-mono text-[10px]">I</span>
          </button>
          <button @click="requestModalTool('bevel'); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
            <span class="flex items-center gap-2"><BlenderIcon name="tool-bevel" :size="14" /> Bevel</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Ctrl+B</span>
          </button>
          <button @click="requestModalTool('loop_cut'); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
            <span class="flex items-center gap-2"><BlenderIcon name="tool-loopcut" :size="14" /> Loop Cut</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Ctrl+R</span>
          </button>
          <button @click="requestModalTool('knife'); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
            <span class="flex items-center gap-2"><BlenderIcon name="tool-knife" :size="14" /> Knife</span>
            <span class="text-ui-textMuted font-mono text-[10px]">K</span>
          </button>
          <div class="h-px bg-ui-borderSubtle my-1"></div>
          <button
            @click="runMeshSubdivide()"
            class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between"
          >
            <span class="flex items-center gap-2"><BlenderIcon name="tool-subdivide" :size="14" /> Subdivide</span>
            <span class="text-ui-textMuted font-mono text-[10px]">W</span>
          </button>
          <button @click="projectStore.performPokeFaces(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
            <span>Poke Faces</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Alt+P</span>
          </button>
          <button @click="projectStore.performTriangulate(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
            <span>Triangulate Faces</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Ctrl+T</span>
          </button>
          <button @click="requestFillFace(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
            <span class="flex items-center gap-2"><BlenderIcon name="fill-face" :size="14" /> Fill</span>
            <span class="text-ui-textMuted font-mono text-[10px]">{{ toolStore.appMode === 'model' ? 'F' : '' }}</span>
          </button>
          <button @click="projectStore.performGridFill(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover">
            Grid Fill
          </button>
          <button @click="projectStore.performBridgeEdges(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center gap-2">
            <BlenderIcon name="bridge-edges" :size="14" /> Bridge Edge Loops
          </button>
          <div class="h-px bg-ui-borderSubtle my-1"></div>
          <button @click="projectStore.performMerge('center'); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
            <span class="flex items-center gap-2"><BlenderIcon name="tool-merge" :size="14" /> Merge at Center</span>
            <span class="text-ui-textMuted font-mono text-[10px]">M</span>
          </button>
          <button @click="projectStore.performConnectVertices(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
            <span class="flex items-center gap-2"><BlenderIcon name="connect-verts" :size="14" /> Connect Vertices</span>
            <span class="text-ui-textMuted font-mono text-[10px]">J</span>
          </button>
          <button @click="projectStore.performFlipNormals(); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
            <span class="flex items-center gap-2"><BlenderIcon name="flip-normals" :size="14" /> Flip Normals</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Shift+N</span>
          </button>
          <button @click="projectStore.setShadeMode('smooth'); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
            <span class="flex items-center gap-2"><BlenderIcon name="shading-solid" :size="14" /> Shade Smooth</span>
          </button>
          <button @click="projectStore.setShadeMode('flat'); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
            <span class="flex items-center gap-2"><BlenderIcon name="shading-wire" :size="14" /> Shade Flat</span>
          </button>
          <button @click="projectStore.setShadeMode('auto'); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between">
            <span>Shade Smooth by Angle</span>
          </button>
          <div class="h-px bg-ui-borderSubtle my-1"></div>
          <button @click="projectStore.performFlipAxis('x'); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover">
            Flip Horizontal (X)
          </button>
          <button @click="projectStore.performFlipAxis('y'); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover">
            Flip Vertical (Y)
          </button>
          <button @click="projectStore.performFlipAxis('z'); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover">
            Flip Z
          </button>
          <button @click="projectStore.performDuplicateMirror('x'); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover">
            Mirror Copy X
          </button>
          <button @click="projectStore.performDuplicateMirror('y'); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover">
            Mirror Copy Y
          </button>
          <button @click="projectStore.performDuplicateMirror('z'); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover">
            Mirror Copy Z
          </button>
          <button @click="projectStore.performRotateObject('y', 90); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover">
            Rotate +90° Y
          </button>
          <button @click="projectStore.performRotateObject('y', -90); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover">
            Rotate −90° Y
          </button>
          <button @click="projectStore.performRotateObject('y', 180); closeDropdowns()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover">
            Rotate 180° Y
          </button>
          <button
            @click="(toolStore.selectMode === 'edge' ? projectStore.performDissolve('edge') : projectStore.performDissolve('vertex')); closeDropdowns()"
            class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between"
          >
            <span class="flex items-center gap-2"><BlenderIcon name="dissolve" :size="14" /> Dissolve</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Ctrl+X</span>
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
          <BlenderIcon name="empty-axis" :size="12" color="#38bdf8" />
          <span class="capitalize">{{ toolStore.transformOrientation }}</span>
          <span class="text-ui-textMuted">·</span>
          <BlenderIcon name="pivot-point" :size="12" />
          <span>{{ pivotLabel[toolStore.pivotPoint] }}</span>
          <BlenderIcon name="chevron-down" :size="12" />
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
              <BlenderIcon v-if="toolStore.transformOrientation === ori" name="check" :size="12" />
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
              <BlenderIcon v-if="toolStore.pivotPoint === piv.id" name="check" :size="12" />
            </button>
          </div>
        </div>
      </div>

      <!-- Grid snap: on/off is the left button; step + element targets in the chevron menu -->
      <div
        class="relative flex items-center h-6 rounded-xs border"
        :class="gridSnapOn
          ? 'bg-ui-accentSubtle border-ui-accent/50'
          : 'bg-ui-input border-ui-borderDefault'"
      >
        <button
          type="button"
          class="h-full px-1.5 flex items-center gap-1 rounded-l-xs text-[10.5px] transition cursor-pointer min-w-[4.25rem]"
          :class="gridSnapOn ? 'text-ui-textAccent font-bold' : 'text-ui-textMuted hover:text-ui-textPrimary'"
          :aria-pressed="gridSnapOn"
          :aria-label="gridSnapOn ? `Grid snap on, step ${toolStore.snapping.gridSize}. Click to turn off.` : 'Grid snap off. Click to turn on.'"
          :title="gridSnapOn
            ? `Grid snap ON · step ${toolStore.snapping.gridSize}. Click to turn off (${snapToggleChord}).`
            : `Grid snap OFF. Click to turn on (${snapToggleChord}).`"
          @click="toggleGridSnap"
        >
          <BlenderIcon name="snap" :size="12" />
          <span class="leading-none">{{ gridSnapOn ? 'On' : 'Off' }}</span>
          <span v-if="gridSnapOn" class="tabular-nums font-mono text-[10px]">{{ toolStore.snapping.gridSize }}</span>
        </button>
        <button
          type="button"
          class="h-full px-1 border-l text-ui-textMuted hover:text-ui-textPrimary relative cursor-pointer"
          :class="[
            gridSnapOn ? 'border-ui-accent/30' : 'border-ui-borderSubtle',
            { 'bg-ui-hover text-ui-textPrimary': activeDropdown === 'snap' }
          ]"
          title="Grid step and snap-to vertices / edges / faces"
          @click="toggleDropdown('snap')"
        >
          <BlenderIcon name="chevron-down" :size="12" />
          <span
            v-if="snapTargetOn"
            class="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-ui-accent"
          />
        </button>
        <div v-if="activeDropdown === 'snap'" class="absolute left-0 top-full mt-0.5 w-56 bg-ui-panel border border-ui-borderStrong rounded-xs shadow-2xl p-2 z-50 text-[11px] font-mono space-y-2">
          <div class="flex items-center justify-between gap-2">
            <span class="text-[9px] font-bold uppercase tracking-wider text-ui-textMuted">Grid snap</span>
            <span class="text-[9px] text-ui-textMuted font-sans">{{ snapToggleChord }}</span>
          </div>
          <div class="grid grid-cols-2 gap-1">
            <button
              type="button"
              class="py-1.5 rounded-xs border text-[10px] font-bold cursor-pointer"
              :class="gridSnapOn
                ? 'bg-ui-accentSubtle text-ui-textAccent border-ui-accent/40'
                : 'border-ui-borderSubtle text-ui-textMuted hover:text-ui-textPrimary'"
              @click="setGridSnap(true)"
            >
              On
            </button>
            <button
              type="button"
              class="py-1.5 rounded-xs border text-[10px] font-bold cursor-pointer"
              :class="!gridSnapOn
                ? 'bg-ui-hover text-ui-textPrimary border-ui-borderDefault'
                : 'border-ui-borderSubtle text-ui-textMuted hover:text-ui-textPrimary'"
              @click="setGridSnap(false)"
            >
              Off
            </button>
          </div>
          <p class="text-[9px] leading-snug text-ui-textMuted font-sans">
            {{ gridSnapOn ? 'Moves snap to the grid step below.' : 'Snap is off. Turn on, or pick a step to enable it.' }}
          </p>
          <div class="border-t border-ui-borderSubtle pt-1.5">
            <div class="text-[9px] font-bold uppercase tracking-wider text-ui-textMuted mb-1">Grid step</div>
            <div class="grid grid-cols-4 gap-1">
              <button
                v-for="sz in [0.1, 0.25, 0.5, 1.0]"
                :key="sz"
                type="button"
                class="py-1 rounded-xs border text-[10px] cursor-pointer"
                :class="toolStore.snapping.gridSize === sz
                  ? 'bg-ui-accentSubtle text-ui-textAccent border-ui-accent/40 font-semibold'
                  : 'border-ui-borderSubtle text-ui-textMuted hover:text-ui-textPrimary'"
                @click="setGridStep(sz)"
              >{{ sz }}</button>
            </div>
          </div>
          <div class="border-t border-ui-borderSubtle pt-1.5 space-y-1">
            <div class="text-[9px] font-bold uppercase tracking-wider text-ui-textMuted">Also snap to</div>
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
        <BlenderIcon name="flip-horizontal" :size="12" class="mr-0.5" />
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

    <!-- 2. CENTER: Primary workspace navigation -->
    <nav class="flex items-center justify-center shrink-0 z-10 px-2" aria-label="Workspaces">
      <div class="workspace-switcher flex items-center gap-0.5 bg-ui-input/90 p-0.5 rounded-xs border border-ui-borderSubtle font-sans text-xs shrink-0 shadow-inner">
        <button
          v-for="w in workspaces"
          :key="w.id"
          @click="toolStore.setAppMode(w.id)"
          class="workspace-switcher__item relative h-6 px-2.5 rounded-xs text-[11px] font-semibold transition-[color,background-color,border-color,box-shadow] duration-150 cursor-pointer flex items-center gap-1.5 whitespace-nowrap select-none"
          :class="toolStore.appMode === w.id 
            ? 'bg-ui-active text-ui-textPrimary font-bold shadow-xs border border-ui-borderDefault/80' 
            : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover/80 border border-transparent'"
          :title="w.desc"
          :aria-label="w.label + ' workspace'"
          :aria-current="toolStore.appMode === w.id ? 'page' : undefined"
        >
          <BlenderIcon :name="w.icon" :size="16" :class="toolStore.appMode === w.id ? 'text-ui-textAccent' : ''" />
          <span class="hidden min-[1280px]:inline">{{ w.label }}</span>
          <span
            v-if="toolStore.appMode === w.id"
            class="absolute left-2 right-2 -bottom-px h-0.5 rounded-full bg-ui-accent"
            aria-hidden="true"
          ></span>
        </button>
      </div>
    </nav>

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
          <BlenderIcon name="chevron-down" :size="12" />
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
          <BlenderIcon name="layers" :size="12" />
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
            <span class="flex items-center gap-1.5" title="Voluma combined translate / rotate / scale">
              <BlenderIcon name="gizmo-combined" :size="12" />
              Combined gizmo
            </span>
            <input type="checkbox" v-model="toolStore.viewport.combinedGizmo" class="rounded-xs accent-ui-accent" />
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
        <BlenderIcon name="search" :size="12" />
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
        <BlenderIcon name="display" :size="12" :color="toolStore.viewport.crtFilter ? '#fbbf24' : 'currentColor'" />
      </button>

      <!-- Main Export Button -->
      <button 
        @click="$emit('open-export')"
        class="flex items-center gap-1 px-2.5 h-6 bg-ui-accent hover:bg-ui-accentHover text-white rounded-xs text-[11px] font-semibold shadow-xs transition active:scale-95 cursor-pointer ml-1"
      >
        <BlenderIcon name="export" :size="12" />
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
