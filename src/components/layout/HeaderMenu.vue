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
import { HelpCircle, BookOpen } from 'lucide-vue-next'

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
  toggleDesktopFullscreen,
  revealCrashLog,
  revealInFolder,
  showDesktopAbout
} from '../../core/desktop/desktopApi'
import { EDITOR_EVENTS, requestCameraView, requestFillFace, requestModalTool, requestKnifeProject } from '../../core/commands/editorCommands'
import { canHideSelected, canHideUnselected, canShowHidden, hideSelected, hideUnselected, isolateSelected, showHidden } from '../../core/geometry/ObjectVisibility'

type NavMenu = 'file' | 'edit' | 'mesh' | 'help' | 'workspace' | 'space' | 'view' | 'snap' | 'overlays' | null
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
const editUndoRows = computed(() =>
  historyStore.undoStack.slice(-12).map((record, offset, list) => ({
    key: `edit-undo-${record.timestamp}-${offset}`,
    description: record.description,
    steps: list.length - offset,
  }))
)
const editRedoRows = computed(() =>
  historyStore.redoStack.slice(-12).map((record, index, list) => ({
    key: `edit-redo-${record.timestamp}-${index}`,
    description: record.description,
    steps: list.length - index,
  })).reverse()
)

const isImporting = ref(false)
const recentProjects = ref<string[]>([])
const lastSavedPath = ref<string | null>(null)
const activeDropdown = ref<NavMenu>(null)
const cameraView = ref<CameraView>('persp')

const emit = defineEmits<{
  (e: 'open-export'): void
  (e: 'open-hotkeys'): void
  (e: 'open-preferences', tab?: 'themes' | 'keymap' | 'interface' | 'viewport' | 'input' | 'system'): void
  (e: 'new-project'): void
  (e: 'open-help', topic?: string): void
}>()

function triggerHelp(topic?: string) {
  closeDropdowns()
  emit('open-help', topic)
}

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

function runHideSelected() {
  if (!canHideSelected(projectStore.meshes, projectStore.selectedMeshIds)) return
  projectStore.recordState('Hide Selected')
  hideSelected(projectStore.meshes, projectStore.selectedMeshIds)
  closeDropdowns()
}

function runHideUnselected() {
  if (!canHideUnselected(projectStore.meshes, projectStore.selectedMeshIds)) return
  projectStore.recordState('Hide Unselected')
  hideUnselected(projectStore.meshes, projectStore.selectedMeshIds)
  closeDropdowns()
}

function runShowHidden() {
  if (!canShowHidden(projectStore.meshes)) return
  projectStore.recordState('Show Hidden')
  showHidden(projectStore.meshes)
  closeDropdowns()
}

function runIsolateSelected() {
  if (!projectStore.selectedMeshIds.length) return
  projectStore.recordState('Isolate Selected')
  isolateSelected(projectStore.meshes, projectStore.selectedMeshIds)
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
  { id: 'dreamcast' as const, icon: 'shading-rendered' as const, title: 'Dreamcast' },
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
  <header class="master-header-container relative h-8 w-full min-w-0 bg-ui-header border-b border-ui-borderSubtle px-2 flex items-center justify-between text-xs select-none z-40 font-sans shrink-0 gap-1">
    <!-- Hidden Inputs for File Import -->
    <input ref="loadProjectInput" type="file" accept=".psxproj" class="hidden" @change="handleLoadProject">
    <input ref="importObjInput" type="file" accept=".obj" class="hidden" @change="handleImportObj">
    <input ref="importGltfInput" type="file" accept=".gltf,.glb" class="hidden" @change="handleImportGltf">
    <input ref="importBbInput" type="file" accept=".bbmodel,.json" class="hidden" @change="handleImportBlockbench">
    <input ref="importTextureInput" type="file" accept="image/*" class="hidden" @change="handleImportTexture">

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
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between font-medium" @click="$emit('new-project'); closeDropdowns()">
            <span class="flex items-center gap-2"><BlenderIcon name="plus" :size="14" /> New Project</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Ctrl+N</span>
          </button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between" @click="openProject">
            <span class="flex items-center gap-2"><BlenderIcon name="folder" :size="14" color="#fbbf24" /> Open (.psxproj)</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Ctrl+O</span>
          </button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between" @click="saveProject(false)">
            <span class="flex items-center gap-2"><BlenderIcon name="save" :size="14" color="#34d399" /> Save Project</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Ctrl+S</span>
          </button>
          <button v-if="isDesktopApp()" class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between" @click="saveProject(true)">
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
            <div class="h-px bg-ui-borderSubtle my-1" />
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

          <div class="h-px bg-ui-borderSubtle my-1" />

          <div class="px-3 py-1 text-[9.5px] font-bold text-ui-textMuted uppercase tracking-wider">Import</div>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center gap-2" @click="importObj">
            <BlenderIcon name="import" :size="14" /> Wavefront (.obj)
          </button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center gap-2" @click="importGltf">
            <BlenderIcon name="import" :size="14" /> GLTF / GLB (.glb)
          </button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center gap-2" @click="importBlockbenchFile">
            <BlenderIcon name="import" :size="14" /> Blockbench (.bbmodel)
          </button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center gap-2" @click="importTexture">
            <BlenderIcon name="image" :size="14" /> Texture (PNG, JPG)
          </button>

          <div class="h-px bg-ui-borderSubtle my-1" />
          <div class="px-3 py-1 text-[9.5px] font-bold text-ui-textMuted uppercase tracking-wider">Export</div>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between" @click="$emit('open-export'); closeDropdowns()">
            <span class="flex items-center gap-2"><BlenderIcon name="export" :size="14" /> Game Assets…</span>
            <span class="text-ui-textMuted font-mono text-[10px]">GLB · OBJ · BB</span>
          </button>

          <div class="h-px bg-ui-borderSubtle my-1" />

          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between" @click="$emit('open-preferences'); closeDropdowns()">
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
            class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between disabled:opacity-40 disabled:pointer-events-none"
            @click="historyStore.undo(); closeDropdowns()"
          >
            <span class="flex items-center gap-2"><BlenderIcon name="undo" :size="14" /> {{ undoDescription ? `Undo ${undoDescription}` : 'Undo' }}</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Ctrl+Z</span>
          </button>
          <button
            :disabled="historyStore.redoStack.length === 0"
            class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between disabled:opacity-40 disabled:pointer-events-none"
            @click="historyStore.redo(); closeDropdowns()"
          >
            <span class="flex items-center gap-2"><BlenderIcon name="redo" :size="14" /> {{ redoDescription ? `Redo ${redoDescription}` : 'Redo' }}</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Ctrl+Y</span>
          </button>
          <div v-if="editUndoRows.length || editRedoRows.length" class="max-h-48 overflow-y-auto border-y border-ui-borderSubtle my-1 py-1">
            <button
              v-for="row in editUndoRows"
              :key="row.key"
              type="button"
              class="w-full text-left px-3 py-1 hover:bg-ui-hover text-ui-textSecondary truncate"
              @click="historyStore.undoSteps(row.steps); closeDropdowns()"
            >
              {{ row.description }}
            </button>
            <div class="px-3 py-0.5 text-[10px] font-bold text-ui-textAccent">Now</div>
            <button
              v-for="row in editRedoRows"
              :key="row.key"
              type="button"
              class="w-full text-left px-3 py-1 hover:bg-ui-hover text-ui-textMuted truncate"
              @click="historyStore.redoSteps(row.steps); closeDropdowns()"
            >
              {{ row.description }}
            </button>
          </div>
          <div class="h-px bg-ui-borderSubtle my-1" />
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between" @click="projectStore.selectAll(toolStore.selectMode); closeDropdowns()">
            <span>Select All</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Ctrl+A</span>
          </button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between" @click="projectStore.deselectAll(); closeDropdowns()">
            <span>Deselect All</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Alt+A</span>
          </button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between" @click="projectStore.selectInverse(toolStore.selectMode); closeDropdowns()">
            <span>Invert</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Ctrl+I</span>
          </button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between" @click="projectStore.growSelection(toolStore.selectMode); closeDropdowns()">
            <span>Select More</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Ctrl+=</span>
          </button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between" @click="projectStore.shrinkSelection(toolStore.selectMode); closeDropdowns()">
            <span>Select Less</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Ctrl+-</span>
          </button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between" @click="projectStore.selectConnected(toolStore.selectMode); closeDropdowns()">
            <span>Select Linked</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Ctrl+L</span>
          </button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.selectBoundaryEdges(); closeDropdowns()">Select Boundary</button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.selectNonManifoldEdges(); closeDropdowns()">Select Non-manifold</button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.selectSharpEdges(); closeDropdowns()">Select Sharp</button>
          <div class="h-px bg-ui-borderSubtle my-1" />
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between" @click="$emit('open-preferences', 'keymap'); closeDropdowns()">
            <span class="flex items-center gap-2"><BlenderIcon name="keyboard" :size="14" color="#38bdf8" /> Shortkeys & Mouse Input Settings...</span>
          </button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center gap-2" @click="$emit('open-preferences', 'themes'); closeDropdowns()">
            <BlenderIcon name="material" :size="14" color="#f59e0b" /> Preferences & Themes
          </button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center gap-2" @click="$emit('open-hotkeys'); closeDropdowns()">
            <BlenderIcon name="keyboard" :size="14" color="#38bdf8" /> Hotkey Cheat Sheet
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

        <div v-if="activeDropdown === 'mesh'" class="absolute left-0 top-full mt-0.5 w-56 max-h-[min(80vh,36rem)] overflow-y-auto bg-ui-panel text-ui-textPrimary border border-ui-borderStrong rounded-xs shadow-2xl py-1 z-50 text-xs">
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between" @click="requestModalTool('extrude'); closeDropdowns()">
            <span class="flex items-center gap-2"><BlenderIcon name="tool-extrude" :size="14" /> Extrude</span>
            <span class="text-ui-textMuted font-mono text-[10px]">E</span>
          </button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between" @click="requestModalTool('inset'); closeDropdowns()">
            <span class="flex items-center gap-2"><BlenderIcon name="tool-inset" :size="14" /> Inset Faces</span>
            <span class="text-ui-textMuted font-mono text-[10px]">I</span>
          </button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between" @click="requestModalTool('bevel'); closeDropdowns()">
            <span class="flex items-center gap-2"><BlenderIcon name="tool-bevel" :size="14" /> Bevel</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Ctrl+B</span>
          </button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between" @click="requestModalTool('loop_cut'); closeDropdowns()">
            <span class="flex items-center gap-2"><BlenderIcon name="tool-loopcut" :size="14" /> Loop Cut</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Ctrl+R</span>
          </button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between" @click="requestModalTool('knife'); closeDropdowns()">
            <span class="flex items-center gap-2"><BlenderIcon name="tool-knife" :size="14" /> Knife</span>
            <span class="text-ui-textMuted font-mono text-[10px]">K</span>
          </button>
          <div class="h-px bg-ui-borderSubtle my-1" />
          <button
            class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between"
            @click="runMeshSubdivide()"
          >
            <span class="flex items-center gap-2"><BlenderIcon name="tool-subdivide" :size="14" /> Subdivide</span>
            <span class="text-ui-textMuted font-mono text-[10px]">W</span>
          </button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performSimpleSubdivide(toolStore.selectMode === 'object' || toolStore.selectMode === 'vertex' || toolStore.selectMode === 'edge' || toolStore.selectMode === 'face' ? toolStore.selectMode : undefined); closeDropdowns()">
            Simple Subdivide
          </button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performCatmullClark(); closeDropdowns()">
            Catmull–Clark Subdivide
          </button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between" @click="projectStore.performPokeFaces(); closeDropdowns()">
            <span>Poke Faces</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Alt+P</span>
          </button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between" @click="projectStore.performTriangulate(); closeDropdowns()">
            <span>Triangulate Faces</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Ctrl+T</span>
          </button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between" @click="requestFillFace(); closeDropdowns()">
            <span class="flex items-center gap-2"><BlenderIcon name="fill-face" :size="14" /> Fill</span>
            <span class="text-ui-textMuted font-mono text-[10px]">{{ toolStore.appMode === 'model' ? 'F' : '' }}</span>
          </button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performGridFill(); closeDropdowns()">
            Grid Fill
          </button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center gap-2" @click="requestModalTool('bridge'); closeDropdowns()">
            <BlenderIcon name="bridge-edges" :size="14" /> Bridge Edge Loops
          </button>
          <div class="h-px bg-ui-borderSubtle my-1" />
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between" @click="projectStore.performMerge('center'); closeDropdowns()">
            <span class="flex items-center gap-2"><BlenderIcon name="tool-merge" :size="14" /> Merge at Center</span>
            <span class="text-ui-textMuted font-mono text-[10px]">M</span>
          </button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performMerge('first'); closeDropdowns()">Merge at First</button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performMerge('last'); closeDropdowns()">Merge at Last</button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performMerge('cursor'); closeDropdowns()">Merge at Cursor</button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performMerge('vertex'); closeDropdowns()">Merge at Vertex</button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performMerge('distance'); closeDropdowns()">Weld by Distance</button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performSplitEdges(); closeDropdowns()">Split Edge</button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between" @click="projectStore.performConnectVertices(); closeDropdowns()">
            <span class="flex items-center gap-2"><BlenderIcon name="connect-verts" :size="14" /> Connect Vertices</span>
            <span class="text-ui-textMuted font-mono text-[10px]">J</span>
          </button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between" @click="projectStore.performFlipNormals(); closeDropdowns()">
            <span class="flex items-center gap-2"><BlenderIcon name="flip-normals" :size="14" /> Flip Normals</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Shift+N</span>
          </button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between" @click="projectStore.setShadeMode('smooth'); closeDropdowns()">
            <span class="flex items-center gap-2"><BlenderIcon name="shading-solid" :size="14" /> Shade Smooth</span>
          </button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between" @click="projectStore.setShadeMode('flat'); closeDropdowns()">
            <span class="flex items-center gap-2"><BlenderIcon name="shading-wire" :size="14" /> Shade Flat</span>
          </button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between" @click="projectStore.setShadeMode('auto'); closeDropdowns()">
            <span>Shade Smooth by Angle</span>
          </button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.markSelectedEdgesSharp(); closeDropdowns()">Mark Sharp</button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.clearSelectedEdgesSharp(); closeDropdowns()">Clear Sharp</button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performApplyRotationScale(); closeDropdowns()">Apply Rotation &amp; Scale</button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performMakeUnique(); closeDropdowns()">Make Unique</button>
          <div class="h-px bg-ui-borderSubtle my-1" />
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performFlipAxis('x'); closeDropdowns()">
            Flip Horizontal (X)
          </button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performFlipAxis('y'); closeDropdowns()">
            Flip Vertical (Y)
          </button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performFlipAxis('z'); closeDropdowns()">
            Flip Z
          </button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performDuplicateMirror('x'); closeDropdowns()">
            Mirror Copy X
          </button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performDuplicateMirror('y'); closeDropdowns()">
            Mirror Copy Y
          </button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performMirror('x'); closeDropdowns()">Mirror X</button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performMirror('y'); closeDropdowns()">Mirror Y</button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performMirror('z'); closeDropdowns()">Mirror Z</button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performLinearArray(); closeDropdowns()">Linear Array</button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performRadialArray(); closeDropdowns()">Radial Array</button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performInstanceDuplicate(); closeDropdowns()">Instance Duplicate</button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performDuplicateMirror('z'); closeDropdowns()">
            Mirror Copy Z
          </button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performRotateObject('y', 90); closeDropdowns()">
            Rotate +90° Y
          </button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performRotateObject('y', -90); closeDropdowns()">
            Rotate −90° Y
          </button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performRotateObject('y', 180); closeDropdowns()">
            Rotate 180° Y
          </button>
          <button
            class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between"
            @click="(toolStore.selectMode === 'face' ? projectStore.performDissolve('face') : toolStore.selectMode === 'edge' ? projectStore.performDissolve('edge') : projectStore.performDissolve('vertex')); closeDropdowns()"
          >
            <span class="flex items-center gap-2"><BlenderIcon name="dissolve" :size="14" /> Dissolve</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Ctrl+X</span>
          </button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performFlipEdge(); closeDropdowns()">Rotate Edge</button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between" @click="projectStore.performRecalculateOutside(); closeDropdowns()">
            <span>Recalculate Outside</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Ctrl+Shift+N</span>
          </button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performTrisToQuads(); closeDropdowns()">Tris to Quads</button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performFillHoles(); closeDropdowns()">Fill Holes</button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="requestModalTool('edge_slide'); closeDropdowns()">Edge Slide</button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="requestModalTool('vertex_slide'); closeDropdowns()">Vertex Slide</button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="requestModalTool('offset_loop'); closeDropdowns()">Offset Edge Loop</button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performRip(false); closeDropdowns()">Rip</button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performRip(true); closeDropdowns()">Rip Fill</button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between" @click="projectStore.performSplit(); closeDropdowns()">
            <span>Detach</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Y</span>
          </button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between" @click="projectStore.performSeparateMesh(); closeDropdowns()">
            <span>Separate</span>
            <span class="text-ui-textMuted font-mono text-[10px]">P</span>
          </button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between" @click="projectStore.performJoinMeshes(); closeDropdowns()">
            <span>Join</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Ctrl+J</span>
          </button>
          <div class="h-px bg-ui-borderSubtle my-1" />
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between" @click="runHideSelected()">
            <span>Hide Selected</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Ctrl+H</span>
          </button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between" @click="runHideUnselected()">
            <span>Hide Unselected</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Ctrl+Shift+H</span>
          </button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between" @click="runIsolateSelected()">
            <span>Isolate Selected</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Ctrl+Alt+I</span>
          </button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between" @click="runShowHidden()">
            <span>Show Hidden</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Ctrl+Alt+H</span>
          </button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performLathe(); closeDropdowns()">Lathe / Revolve</button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performShell(); closeDropdowns()">Shell</button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performMakePlanar(); closeDropdowns()">Make Planar Faces</button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performLimitedDissolve(toolStore.limitedDissolveAngle); closeDropdowns()">Limited Dissolve</button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performDeleteOnlyFaces(); closeDropdowns()">Delete Only Faces</button>
          <div class="h-px bg-ui-borderSubtle my-1" />
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performBoolean('union'); closeDropdowns()">Boolean Union</button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performBoolean('difference'); closeDropdowns()">Boolean Difference</button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performBoolean('intersect'); closeDropdowns()">Boolean Intersect</button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="requestKnifeProject(); closeDropdowns()">Knife Project</button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="requestModalTool('bisect'); closeDropdowns()">Bisect</button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="requestModalTool('spin'); closeDropdowns()">Spin</button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performSolidifyFaces(); closeDropdowns()">Solidify</button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performSymmetrize('x'); closeDropdowns()">Symmetrize X</button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performSymmetrize('y'); closeDropdowns()">Symmetrize Y</button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performSymmetrize('z'); closeDropdowns()">Symmetrize Z</button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performSeparateByLooseParts(); closeDropdowns()">Separate by Loose Parts</button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performSeparateByMaterial(); closeDropdowns()">Separate by Material</button>
          <div class="h-px bg-ui-borderSubtle my-1" />
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="requestModalTool('shrink_fatten'); closeDropdowns()">Shrink/Fatten</button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="requestModalTool('shear'); closeDropdowns()">Shear</button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="requestModalTool('curve'); closeDropdowns()">Curve</button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between" @click="projectStore.performSpherize(); closeDropdowns()">
            <span>Spherize</span>
            <span class="text-ui-textMuted font-mono text-[10px]">Shift+Alt+S</span>
          </button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performSmoothVertices(); closeDropdowns()">Smooth Vertices</button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performCircle(); closeDropdowns()">Circle</button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performStraighten('horizontal'); closeDropdowns()">Straighten Horizontal</button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performStraighten('vertical'); closeDropdowns()">Straighten Vertical</button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performRandomizeVertices(); closeDropdowns()">Randomize Vertices</button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performUnsubdivide(); closeDropdowns()">Unsubdivide</button>
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover" @click="projectStore.performDecimate(); closeDropdowns()">Decimate</button>
        </div>
      </div>

      <!-- Help Menu -->
      <div class="relative">
        <button 
          class="px-1.5 py-0.5 text-[11.5px] font-medium rounded-xs hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textPrimary transition cursor-pointer"
          :class="{ 'bg-ui-hover text-ui-textPrimary font-bold': activeDropdown === 'help' }"
          @click="toggleDropdown('help')"
        >
          Help
        </button>

        <div v-if="activeDropdown === 'help'" class="absolute left-0 top-full mt-0.5 w-72 bg-ui-panel text-ui-textPrimary border border-ui-borderStrong rounded-xs shadow-2xl py-1 z-50 text-xs max-h-[min(85vh,38rem)] overflow-y-auto">
          <!-- Main Documentation -->
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between font-medium cursor-pointer" @click="triggerHelp('overview')">
            <span class="flex items-center gap-2 text-ui-textAccent font-semibold">
              <BookOpen class="w-3.5 h-3.5 text-ui-textAccent" /> Documentation & User Manual
            </span>
            <span class="text-ui-textMuted font-mono text-[10px]">F1</span>
          </button>
          
          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between cursor-pointer" @click="$emit('open-hotkeys'); closeDropdowns()">
            <span class="flex items-center gap-2">
              <BlenderIcon name="keyboard" :size="14" color="#38bdf8" /> Keyboard Shortcuts Map
            </span>
            <span class="text-ui-textMuted font-mono text-[10px]">Ctrl+/</span>
          </button>

          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between cursor-pointer" @click="triggerHelp('navigation')">
            <span class="flex items-center gap-2">
              <BlenderIcon name="display" :size="14" color="#a78bfa" /> Mouse & Navigation Controls
            </span>
          </button>

          <div class="h-px bg-ui-borderSubtle my-1" />
          <div class="px-3 py-1 text-[9.5px] font-bold text-ui-textMuted uppercase tracking-wider">Workspace Guides</div>

          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between cursor-pointer" @click="triggerHelp('modeling')">
            <span class="flex items-center gap-2">
              <BlenderIcon name="workspace-model" :size="14" /> Modeling & Topology Guide
            </span>
            <span class="text-ui-textMuted text-[10px]">Extrude, Inset, Bevel</span>
          </button>

          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between cursor-pointer" @click="triggerHelp('blockout')">
            <span class="flex items-center gap-2">
              <BlenderIcon name="workspace-blockout" :size="14" /> Blockout & Tracing Guide
            </span>
            <span class="text-ui-textMuted text-[10px]">Shape Draw, Refs</span>
          </button>

          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between cursor-pointer" @click="triggerHelp('uv')">
            <span class="flex items-center gap-2">
              <BlenderIcon name="uv" :size="14" /> UV Mapping & Unwrapping Guide
            </span>
            <span class="text-ui-textMuted text-[10px]">Smart UV, Seams</span>
          </button>

          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between cursor-pointer" @click="triggerHelp('paint')">
            <span class="flex items-center gap-2">
              <BlenderIcon name="workspace-paint" :size="14" /> Pixel Texture Painting Guide
            </span>
            <span class="text-ui-textMuted text-[10px]">Layers, Dithering</span>
          </button>

          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between cursor-pointer" @click="triggerHelp('tileset')">
            <span class="flex items-center gap-2">
              <BlenderIcon name="material" :size="14" /> Tileset Atlas & Stamping Guide
            </span>
            <span class="text-ui-textMuted text-[10px]">Grid Atlas, Stamping</span>
          </button>

          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between cursor-pointer" @click="triggerHelp('rigging')">
            <span class="flex items-center gap-2">
              <BlenderIcon name="workspace-rig" :size="14" /> Rigging & Armatures Guide
            </span>
            <span class="text-ui-textMuted text-[10px]">Bones, Skinning</span>
          </button>

          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between cursor-pointer" @click="triggerHelp('humanoid')">
            <span class="flex items-center gap-2">
              <BlenderIcon name="armature" :size="14" /> Humanoid Auto-Rig Wizard
            </span>
            <span class="text-ui-textMuted text-[10px]">Landmark Setup</span>
          </button>

          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between cursor-pointer" @click="triggerHelp('animation')">
            <span class="flex items-center gap-2">
              <BlenderIcon name="workspace-animation" :size="14" /> Animation & Keyframes Guide
            </span>
            <span class="text-ui-textMuted text-[10px]">Dope Sheet, Events</span>
          </button>

          <div class="h-px bg-ui-borderSubtle my-1" />
          <div class="px-3 py-1 text-[9.5px] font-bold text-ui-textMuted uppercase tracking-wider">Systems & Shading</div>

          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between cursor-pointer" @click="triggerHelp('shading')">
            <span class="flex items-center gap-2">
              <BlenderIcon name="display" :size="14" /> Retro PSX & CRT Shading
            </span>
          </button>

          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between cursor-pointer" @click="triggerHelp('modifiers')">
            <span class="flex items-center gap-2">
              <BlenderIcon name="modifier" :size="14" /> Modifiers (Mirror, Subd)
            </span>
          </button>

          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between cursor-pointer" @click="triggerHelp('export')">
            <span class="flex items-center gap-2">
              <BlenderIcon name="export" :size="14" /> Game Engine Export (Godot/Unity)
            </span>
          </button>

          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between cursor-pointer" @click="triggerHelp('faq')">
            <span class="flex items-center gap-2">
              <HelpCircle class="w-3.5 h-3.5 text-amber-400" /> FAQ & Troubleshooting
            </span>
          </button>

          <div class="h-px bg-ui-borderSubtle my-1" />

          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between cursor-pointer" @click="triggerCommandPalette">
            <span class="flex items-center gap-2">
              <BlenderIcon name="search" :size="14" /> Search Commands
            </span>
            <span class="text-ui-textMuted font-mono text-[10px]">F3</span>
          </button>

          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between cursor-pointer" @click="$emit('open-preferences', 'keymap'); closeDropdowns()">
            <span class="flex items-center gap-2">
              <BlenderIcon name="keyboard" :size="14" color="#38bdf8" /> Shortkeys & Mouse Controls...
            </span>
          </button>

          <button class="w-full text-left px-3 py-1.5 hover:bg-ui-hover flex items-center justify-between cursor-pointer" @click="$emit('open-preferences'); closeDropdowns()">
            <span class="flex items-center gap-2">
              <BlenderIcon name="settings" :size="14" /> Properties & Preferences
            </span>
            <span class="text-ui-textMuted font-mono text-[10px]">Ctrl+,</span>
          </button>

          <button
            v-if="isDesktopApp()"
            class="w-full text-left px-3 py-1.5 hover:bg-ui-hover cursor-pointer"
            @click="void showDesktopAbout(); closeDropdowns()"
          >
            About PolyEcho
          </button>
          <button
            v-else
            class="w-full text-left px-3 py-1.5 hover:bg-ui-hover cursor-pointer"
            @click="triggerHelp('overview')"
          >
            About PolyEcho
          </button>
        </div>
      </div>

      <div class="w-px h-3.5 bg-ui-borderSubtle mx-0.5 shrink-0" />

      <!-- Space & Pivot Combo Dropdown -->
      <div class="relative">
        <button 
          class="h-6 px-1.5 rounded-xs bg-ui-input border border-ui-borderDefault text-ui-textPrimary hover:bg-ui-hover flex items-center gap-1 text-[10.5px]"
          title="Transform Space & Pivot Point"
          @click="toggleDropdown('space')"
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
              class="w-full text-left px-1.5 py-1 rounded-xs capitalize hover:bg-ui-hover flex items-center justify-between"
              :class="{ 'text-sky-400 font-semibold': toolStore.transformOrientation === ori }"
              @click="toolStore.transformOrientation = ori; closeDropdowns()"
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
              class="w-full text-left px-1.5 py-1 rounded-xs hover:bg-ui-hover flex items-center justify-between"
              :class="{ 'text-ui-textAccent font-semibold': toolStore.pivotPoint === piv.id }"
              @click="toolStore.pivotPoint = piv.id; closeDropdowns()"
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
              >
                {{ sz }}
              </button>
            </div>
          </div>
          <div class="border-t border-ui-borderSubtle pt-1.5 space-y-1">
            <div class="text-[9px] font-bold uppercase tracking-wider text-ui-textMuted">Also snap to</div>
            <label class="flex items-center justify-between cursor-pointer py-0.5 px-0.5">
              <span>Vertex</span>
              <input v-model="toolStore.snapping.vertex" type="checkbox" class="rounded-xs accent-ui-accent">
            </label>
            <label class="flex items-center justify-between cursor-pointer py-0.5 px-0.5">
              <span>Edge midpoint</span>
              <input v-model="toolStore.snapping.edge" type="checkbox" class="rounded-xs accent-ui-accent">
            </label>
            <label class="flex items-center justify-between cursor-pointer py-0.5 px-0.5">
              <span>Face center</span>
              <input v-model="toolStore.snapping.face" type="checkbox" class="rounded-xs accent-ui-accent">
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
    <nav class="flex items-center justify-center min-w-0 z-10 px-1" aria-label="Workspaces">
      <div class="workspace-switcher flex items-center gap-0.5 bg-ui-input/90 p-0.5 rounded-xs border border-ui-borderSubtle font-sans text-xs shrink-0 shadow-inner">
        <button
          v-for="w in workspaces"
          :key="w.id"
          class="workspace-switcher__item relative h-6 px-2.5 rounded-xs text-[11px] font-semibold transition-[color,background-color,border-color,box-shadow] duration-150 cursor-pointer flex items-center gap-1.5 whitespace-nowrap select-none"
          :class="toolStore.appMode === w.id 
            ? 'bg-ui-active text-ui-textPrimary font-bold shadow-xs border border-ui-borderDefault/80' 
            : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover/80 border border-transparent'"
          :title="w.desc"
          :aria-label="w.label + ' workspace'"
          :aria-current="toolStore.appMode === w.id ? 'page' : undefined"
          @click="toolStore.setAppMode(w.id)"
        >
          <BlenderIcon :name="w.icon" :size="16" :class="toolStore.appMode === w.id ? 'text-ui-textAccent' : ''" />
          <span class="hidden min-[1280px]:inline">{{ w.label }}</span>
          <span
            v-if="toolStore.appMode === w.id"
            class="absolute left-2 right-2 -bottom-px h-0.5 rounded-full bg-ui-accent"
            aria-hidden="true"
          />
        </button>
      </div>
    </nav>

    <!-- 3. RIGHT: Camera View + Shading + TV + Export -->
    <div class="flex items-center space-x-1 shrink-0 z-20">
      <!-- Camera View Dropdown -->
      <div class="relative">
        <button
          class="h-6 px-1.5 rounded-xs bg-ui-input border border-ui-borderDefault text-ui-textPrimary hover:bg-ui-hover flex items-center gap-1 text-[10.5px]"
          title="Camera View"
          @click="toggleDropdown('view')"
        >
          <span class="text-ui-textAccent font-semibold">{{ toolStore.viewport.quadView ? 'Quad' : viewLabel[cameraView] }}</span>
          <BlenderIcon name="chevron-down" :size="12" />
        </button>

        <div v-if="activeDropdown === 'view'" class="absolute right-0 top-full mt-0.5 w-44 bg-ui-panel border border-ui-borderStrong rounded-xs shadow-2xl p-1 z-50 text-[11px] font-mono">
          <button class="w-full text-left px-2 py-1 hover:bg-ui-hover flex justify-between" @click="setCameraView('persp')">
            <span>Perspective</span><span class="text-ui-textMuted">Home</span>
          </button>
          <button class="w-full text-left px-2 py-1 hover:bg-ui-hover flex justify-between" @click="setCameraView('front')">
            <span>Front Ortho</span><span class="text-ui-textMuted">Num 1</span>
          </button>
          <button class="w-full text-left px-2 py-1 hover:bg-ui-hover flex justify-between" @click="setCameraView('right')">
            <span>Right Ortho</span><span class="text-ui-textMuted">Num 3</span>
          </button>
          <button class="w-full text-left px-2 py-1 hover:bg-ui-hover flex justify-between" @click="setCameraView('top')">
            <span>Top Ortho</span><span class="text-ui-textMuted">Num 7</span>
          </button>
          <button class="w-full text-left px-2 py-1 hover:bg-ui-hover flex justify-between" @click="setCameraView('iso')">
            <span>Isometric</span><span class="text-ui-textMuted">Num 0</span>
          </button>
          <div class="h-px bg-ui-borderSubtle my-1" />
          <button class="w-full text-left px-2 py-1 hover:bg-ui-hover flex justify-between text-amber-400" @click="toolStore.viewport.quadView = !toolStore.viewport.quadView; closeDropdowns()">
            <span>Quad View</span><span class="text-ui-textMuted">Ctrl+Alt+Q</span>
          </button>
          <button
            v-if="isDesktopApp()"
            class="w-full text-left px-2 py-1 hover:bg-ui-hover flex justify-between"
            @click="void toggleDesktopFullscreen(); closeDropdowns()"
          >
            <span>Full Screen</span><span class="text-ui-textMuted">F11</span>
          </button>
        </div>
      </div>

      <!-- Shading Mode Group (Wire, Solid, Textured, Dreamcast) -->
      <div class="flex items-center h-6 px-0.5 rounded-xs bg-ui-input border border-ui-borderDefault">
        <button
          v-for="s in shadingModes"
          :key="s.id"
          type="button"
          class="h-5 rounded-xs flex items-center justify-center gap-1 transition"
          :class="[
            toolStore.viewport.shading === s.id ? 'bg-ui-active text-ui-textPrimary' : 'text-ui-textMuted hover:text-ui-textPrimary',
            s.id === 'dreamcast' && toolStore.viewport.shading === 'dreamcast' ? 'px-1.5' : 'w-5'
          ]"
          :title="s.title"
          @click="toolStore.viewport.shading = s.id"
        >
          <BlenderIcon :name="s.icon" :size="11" />
          <span
            v-if="s.id === 'dreamcast' && toolStore.viewport.shading === 'dreamcast'"
            class="text-[9px] font-semibold tracking-wide pr-0.5"
          >Dreamcast</span>
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
            <input v-model="toolStore.viewport.faceOrientation" type="checkbox" class="rounded-xs accent-ui-accent">
          </label>
          <label class="flex items-center justify-between cursor-pointer py-0.5 px-0.5 hover:bg-ui-hover rounded-xs">
            <span>Grid</span>
            <input v-model="toolStore.viewport.showGrid" type="checkbox" class="rounded-xs accent-ui-accent">
          </label>
          <label class="flex items-center justify-between cursor-pointer py-0.5 px-0.5 hover:bg-ui-hover rounded-xs">
            <span>World axes</span>
            <input v-model="toolStore.viewport.showAxes" type="checkbox" class="rounded-xs accent-ui-accent">
          </label>
          <label class="flex items-center justify-between cursor-pointer py-0.5 px-0.5 hover:bg-ui-hover rounded-xs">
            <span class="flex items-center gap-1.5" title="Voluma combined translate / rotate / scale">
              <BlenderIcon name="gizmo-combined" :size="12" />
              Combined gizmo
            </span>
            <input v-model="toolStore.viewport.combinedGizmo" type="checkbox" class="rounded-xs accent-ui-accent">
          </label>
          <label class="flex items-center justify-between cursor-pointer py-0.5 px-0.5 hover:bg-ui-hover rounded-xs">
            <span>Bones</span>
            <input
              type="checkbox"
              :checked="animationStore.showBones"
              class="rounded-xs accent-ui-accent"
              @change="animationStore.setShowBones(!animationStore.showBones)"
            >
          </label>
          <div class="border-t border-ui-borderSubtle pt-1.5 space-y-1">
            <div class="flex items-center justify-between text-[10px] text-ui-textMuted">
              <span>Wire opacity</span>
              <span class="tabular-nums">{{ Math.round(toolStore.viewport.wireframeOpacity * 100) }}%</span>
            </div>
            <input
              v-model.number="toolStore.viewport.wireframeOpacity"
              type="range"
              min="0.1"
              max="1.0"
              step="0.05"
              class="w-full h-1 bg-ui-borderStrong rounded-lg appearance-none cursor-pointer accent-ui-accent"
            >
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
        class="h-6 px-1.5 rounded-xs flex items-center gap-1 text-[10px] font-mono transition border cursor-pointer select-none max-[1080px]:hidden"
        :class="toolStore.viewport.crtFilter 
          ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-xs font-bold' 
          : 'text-ui-textMuted hover:text-ui-textPrimary border-ui-borderDefault bg-ui-input'"
        title="Toggle CRT Retro Scanlines"
        @click="toolStore.viewport.crtFilter = !toolStore.viewport.crtFilter"
      >
        <BlenderIcon name="display" :size="12" :color="toolStore.viewport.crtFilter ? '#fbbf24' : 'currentColor'" />
      </button>

      <!-- Main Export Button -->
      <button 
        class="flex items-center gap-1 px-2.5 h-6 bg-ui-accent hover:bg-ui-accentHover text-white rounded-xs text-[11px] font-semibold shadow-xs transition active:scale-95 cursor-pointer ml-1"
        @click="$emit('open-export')"
      >
        <BlenderIcon name="export" :size="12" />
        <span class="hidden min-[1180px]:inline">Export</span>
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
