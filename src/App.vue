<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted } from 'vue'
import HeaderMenu from './components/layout/HeaderMenu.vue'
import LeftToolbar from './components/layout/LeftToolbar.vue'
import RightSidebar from './components/layout/RightSidebar.vue'
import Viewport3D from './components/viewport/Viewport3D.vue'
import PixelCanvas from './components/uvpaint/PixelCanvas.vue'
import Timeline from './components/animation/Timeline.vue'
import StatusBar from './components/layout/StatusBar.vue'
import ExportModal from './components/modals/ExportModal.vue'
import HotkeyModal from './components/modals/HotkeyModal.vue'
import NewProjectModal from './components/modals/NewProjectModal.vue'
import AddPrimitivePopout from './components/modals/AddPrimitivePopout.vue'
import BlenderPieMenu from './components/viewport/BlenderPieMenu.vue'
import CommandPaletteModal from './components/modals/CommandPaletteModal.vue'
import PreferencesModal from './components/modals/PreferencesModal.vue'
import BoneHierarchyPopout from './components/rigging/BoneHierarchyPopout.vue'
import BlenderIcon from './components/icons/BlenderIcon.vue'
import { RotateCcw, PanelRightOpen, Box, Wrench, Image as ImageIcon, FolderTree, Link, Paintbrush } from 'lucide-vue-next'

import { useToolStore } from './stores/toolStore'
import { useProjectStore } from './stores/projectStore'
import { useAnimationStore } from './stores/animationStore'
import { useHistoryStore } from './stores/historyStore'
import { useLayoutStore } from './stores/layoutStore'
import { useThemeStore } from './stores/themeStore'
import { useKeymapStore } from './stores/keymapStore'
import { ProjectSerializer } from './core/project/ProjectSerializer'
import { EDITOR_EVENTS, requestCameraView, requestModalTool, requestFillFace, requestPrimitiveMenu, requestOpenPie, requestToggleUvOverlay } from './core/commands/editorCommands'
import { setupDefaultActions } from './core/commands/setupDefaultActions'
import { operatorManager } from './core/operators/OperatorManager'
import { useFastTitleTips } from './composables/useFastTitleTips'

const toolStore = useToolStore()
const projectStore = useProjectStore()
const animationStore = useAnimationStore()
const historyStore = useHistoryStore()
const layoutStore = useLayoutStore()
const themeStore = useThemeStore()
const keymapStore = useKeymapStore()
const fastTip = useFastTitleTips()

type DockTab = {
  id: 'props' | 'modifiers' | 'material' | 'texture' | 'refs' | 'skeleton' | 'bindings' | 'weights'
  title: string
  blender?: 'material' | 'texture'
  icon?: typeof Box
}

const collapsedPropTabs = computed<DockTab[]>(() => {
  const mode = toolStore.appMode
  if (mode === 'rig') {
    return [
      { id: 'skeleton', title: 'Skeleton & Joint Hierarchy', icon: FolderTree },
      { id: 'props', title: 'Bone Joint Transforms & IK', icon: Box },
      { id: 'bindings', title: 'Mesh Bindings & Parents', icon: Link },
      { id: 'weights', title: 'Vertex Weight Painting', icon: Paintbrush },
    ]
  }
  if (mode === 'blockout') {
    return [
      { id: 'props', title: 'Transform & Object Properties', icon: Box },
      { id: 'refs', title: 'Reference Images for Blockout', icon: ImageIcon },
      { id: 'modifiers', title: 'Modifiers', icon: Wrench },
    ]
  }
  if (mode === 'uvpaint') {
    return [
      { id: 'props', title: 'UV & Seams Properties', icon: Box },
      { id: 'texture', title: 'Textures & Pixel Maps', blender: 'texture' },
      { id: 'material', title: 'Material & Shading', blender: 'material' },
      { id: 'modifiers', title: 'Modifiers', icon: Wrench },
    ]
  }
  return [
    { id: 'props', title: mode === 'animate' ? 'Animation & Keyframes' : 'Transform & Object Properties', icon: Box },
    { id: 'modifiers', title: 'Modifiers', icon: Wrench },
    { id: 'material', title: 'Material & Shading', blender: 'material' },
    { id: 'texture', title: 'Textures & Pixel Maps', blender: 'texture' },
  ]
})

setupDefaultActions(projectStore, toolStore, animationStore, historyStore)

function isMeshWorkspace() {
  return toolStore.isMeshWorkspace()
}

const showExportModal = ref(false)
const showHotkeyModal = ref(false)
const showNewProjectModal = ref(false)
const showPreferencesModal = ref(false)

watch(
  () => toolStore.appMode,
  (mode) => {
    if (mode === 'uvpaint') projectStore.syncPaintTargetFromMesh()
  }
)

watch(
  () => projectStore.activeMeshId,
  () => {
    if (toolStore.appMode === 'uvpaint') projectStore.syncPaintTargetFromMesh()
  }
)

// UV / Paint Split Pane Resizing
const uvSplitRatio = ref<number>(50) // percentage
const isUvSplitting = ref<boolean>(false)

function startUvSplit(e: MouseEvent) {
  const container = (e.target as HTMLElement).closest('main')
  if (!container) return

  isUvSplitting.value = true
  const rect = container.getBoundingClientRect()

  const onMouseMove = (moveEvent: MouseEvent) => {
    if (!isUvSplitting.value) return
    const offset = moveEvent.clientX - rect.left
    const percent = Math.max(15, Math.min(85, (offset / rect.width) * 100))
    uvSplitRatio.value = Number(percent.toFixed(1))
  }

  const onMouseUp = () => {
    isUvSplitting.value = false
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

function toggleUvSplitPreset() {
  if (uvSplitRatio.value < 40) {
    uvSplitRatio.value = 50
  } else if (uvSplitRatio.value < 60) {
    uvSplitRatio.value = 70
  } else {
    uvSplitRatio.value = 30
  }
}

function bindGeometryMode() {
  return toolStore.selectMode === 'object'
    ? 'object'
    : (toolStore.selectMode === 'edge' ? 'edges' : (toolStore.selectMode === 'vertex' ? 'vertices' : 'faces'))
}

function ensureMeshContext() {
  if (!isMeshWorkspace()) toolStore.setAppMode('model')
  if (!projectStore.activeMesh && projectStore.meshes.length > 0) {
    projectStore.activeMeshId = projectStore.meshes[0].id
    projectStore.selectedMeshIds = [projectStore.meshes[0].id]
  }
}

function resolveKeymapAction(ids: string[]): string | null {
  const mode = toolStore.appMode
  if (mode === 'uvpaint') {
    const paint = ids.find(id => id.startsWith('paint_'))
    if (paint) return paint
  }
  if (ids.includes('fill_face') || ids.includes('polydraw')) {
    if (mode === 'blockout' && ids.includes('polydraw')) return 'polydraw'
    if (mode === 'model' && ids.includes('fill_face')) return 'fill_face'
  }
  if (ids.includes('box_select') && isMeshWorkspace()) return 'box_select'
  for (const id of ids) {
    if (id.startsWith('paint_') && mode !== 'uvpaint') continue
    if (id === 'fill_face' || id === 'polydraw' || id === 'polybuild') continue
    return id
  }
  if (mode === 'blockout' && ids.includes('polybuild')) return 'polybuild'
  return null
}

function runKeymapAction(id: string) {
  switch (id) {
    case 'undo':
      if (!operatorManager.state.value.active) historyStore.undo()
      return
    case 'redo':
      if (!operatorManager.state.value.active) historyStore.redo()
      return
    case 'save_project': {
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
      return
    }
    case 'export_model':
      showExportModal.value = true
      return
    case 'open_preferences':
      showPreferencesModal.value = true
      return
    case 'command_palette':
      window.dispatchEvent(new CustomEvent('open-command-palette'))
      return
    case 'toggle_xray':
      toolStore.viewport.xray = !toolStore.viewport.xray
      return
    case 'toggle_snap':
      toolStore.snapping.grid = !toolStore.snapping.grid
      return
    case 'shading_pie':
      requestOpenPie('shading')
      return
    case 'snap_pie':
      requestOpenPie('snap')
      return
    case 'view_top':
      toolStore.viewport.quadView = false
      requestCameraView('top')
      return
    case 'view_front':
      toolStore.viewport.quadView = false
      requestCameraView('front')
      return
    case 'view_right':
      toolStore.viewport.quadView = false
      requestCameraView('right')
      return
    case 'view_camera':
      toolStore.viewport.quadView = false
      requestCameraView('iso')
      return
    case 'select_all':
      projectStore.selectAll(toolStore.selectMode)
      return
    case 'deselect_all':
      projectStore.deselectAll()
      return
    case 'box_select':
      if (isMeshWorkspace()) toolStore.isBoxSelectActive = !toolStore.isBoxSelectActive
      return
    case 'duplicate':
      projectStore.duplicateSelection(toolStore.selectMode)
      return
    case 'join_meshes':
      projectStore.performJoinMeshes()
      return
    case 'add_primitive':
      requestPrimitiveMenu()
      return
    case 'mode_vertex':
      ensureMeshContext()
      toolStore.selectMode = 'vertex'
      return
    case 'mode_edge':
      ensureMeshContext()
      toolStore.selectMode = 'edge'
      return
    case 'mode_face':
      ensureMeshContext()
      toolStore.selectMode = 'face'
      return
    case 'mode_object':
      ensureMeshContext()
      toolStore.selectMode = 'object'
      return
    case 'mode_origin':
      ensureMeshContext()
      toolStore.selectMode = 'origin'
      return
    case 'mode_bone':
      if (toolStore.appMode !== 'animate') toolStore.setAppMode('rig')
      toolStore.selectMode = 'bone'
      return
    case 'toggle_edit_object':
      ensureMeshContext()
      toolStore.selectMode = toolStore.selectMode === 'object' ? 'face' : 'object'
      return
    case 'grab':
      if (isMeshWorkspace()) requestModalTool('grab')
      else if (toolStore.appMode === 'rig' || toolStore.appMode === 'animate') toolStore.setModelTool('move')
      return
    case 'rotate':
      if (isMeshWorkspace()) requestModalTool('rotate')
      else if (toolStore.appMode === 'rig' || toolStore.appMode === 'animate') toolStore.setModelTool('rotate')
      return
    case 'scale':
      if (isMeshWorkspace()) requestModalTool('scale')
      else if (toolStore.appMode === 'rig' || toolStore.appMode === 'animate') toolStore.setModelTool('scale')
      return
    case 'extrude':
      if (isMeshWorkspace()) requestModalTool('extrude')
      else if (toolStore.appMode === 'rig') animationStore.extrudeBone(animationStore.selectedBoneId)
      return
    case 'extrude_individual':
      if (isMeshWorkspace()) requestModalTool('extrude')
      return
    case 'inset':
      if (toolStore.appMode === 'animate') animationStore.recordCurrentKeyframe()
      else if (isMeshWorkspace()) requestModalTool('inset')
      return
    case 'bevel':
      if (isMeshWorkspace()) requestModalTool('bevel')
      else if (toolStore.appMode === 'rig' || toolStore.appMode === 'animate') {
        animationStore.bindSelectedGeometry(bindGeometryMode())
      }
      return
    case 'loopcut':
      if (isMeshWorkspace()) requestModalTool('loop_cut')
      return
    case 'knife':
      if (toolStore.appMode === 'animate') animationStore.recordCurrentKeyframe()
      else if (isMeshWorkspace()) requestModalTool('knife')
      return
    case 'fill_face':
      if (toolStore.appMode === 'model') requestFillFace()
      return
    case 'polydraw':
      if (toolStore.appMode === 'blockout') requestModalTool('polydraw')
      return
    case 'polybuild':
      if (toolStore.appMode === 'blockout') requestModalTool('polybuild')
      return
    case 'subdivide':
      if (isMeshWorkspace() && projectStore.activeMesh) projectStore.performSubdivide()
      else if (toolStore.appMode === 'rig' || toolStore.appMode === 'animate') toolStore.setModelTool('move')
      return
    case 'connect_verts':
      if (isMeshWorkspace()) projectStore.performConnectVertices()
      return
    case 'merge_verts':
      if (isMeshWorkspace()) projectStore.performMerge('center')
      return
    case 'flip_normals':
      if (isMeshWorkspace()) projectStore.performFlipNormals()
      return
    case 'delete_element':
      if (isMeshWorkspace()) {
        if (toolStore.selectMode === 'object') {
          projectStore.performDelete('object')
        } else if (toolStore.selectMode === 'face') {
          if (projectStore.selectedFaceIds.length > 0) {
            projectStore.performDelete('face')
          } else {
            projectStore.performDelete('object')
          }
        } else if (toolStore.selectMode === 'edge') {
          if (projectStore.selectedEdgeIds.length > 0) {
            projectStore.performDelete('edge')
          } else {
            projectStore.performDelete('object')
          }
        } else if (toolStore.selectMode === 'vertex') {
          if (projectStore.selectedVertexIds.length > 0) {
            projectStore.performDelete('vertex')
          } else {
            projectStore.performDelete('object')
          }
        } else {
          projectStore.performDelete('object')
        }
      } else if (toolStore.appMode === 'rig' && animationStore.selectedBoneId) {
        animationStore.deleteBone(animationStore.selectedBoneId)
      } else if (toolStore.appMode === 'animate' && animationStore.selectedBoneId) {
        animationStore.deleteKeyframeAt(animationStore.selectedBoneId, animationStore.currentFrame)
      }
      return
    case 'separate_mesh':
      if (isMeshWorkspace()) {
        if (toolStore.selectMode === 'face' || toolStore.selectMode === 'edge' || toolStore.selectMode === 'vertex') {
          projectStore.performSeparateMesh()
        } else if (toolStore.appMode === 'model') {
          toolStore.selectMode = 'origin'
        }
      }
      return
    case 'paint_brush':
      if (toolStore.appMode === 'uvpaint') toolStore.setPaintTool('brush')
      return
    case 'paint_eraser':
      if (toolStore.appMode === 'uvpaint') toolStore.setPaintTool('eraser')
      return
    case 'paint_bucket':
      if (toolStore.appMode === 'uvpaint') toolStore.setPaintTool('bucket')
      return
    case 'paint_picker':
      if (toolStore.appMode === 'uvpaint') toolStore.setPaintTool('picker')
      return
    case 'paint_line':
      if (toolStore.appMode === 'uvpaint') toolStore.setPaintTool('line')
      return
    case 'paint_rect':
      if (toolStore.appMode === 'uvpaint') toolStore.setPaintTool('rect')
      return
    case 'paint_circle':
      if (toolStore.appMode === 'uvpaint') toolStore.setPaintTool('circle')
      return
    case 'paint_dither':
      if (toolStore.appMode === 'uvpaint') toolStore.setPaintTool('dither')
      return
    case 'paint_shade':
      if (toolStore.appMode === 'uvpaint') toolStore.setPaintTool('shade')
      return
    case 'paint_uv_overlay':
      if (toolStore.appMode === 'uvpaint') requestToggleUvOverlay()
      return
    case 'toggle_quad_view':
      toolStore.viewport.quadView = !toolStore.viewport.quadView
      return
    case 'new_project':
      showNewProjectModal.value = true
      return
    case 'toggle_left_toolbar':
      layoutStore.toggleLeftToolbar()
      return
    case 'toggle_right_sidebar':
      layoutStore.toggleRightSidebar()
      return
    case 'restore_autosave':
      void projectStore.restoreAutosaveSession()
      return
    case 'play_pause':
      if (toolStore.appMode === 'animate') animationStore.togglePlay()
      return
    case 'frame_prev':
      if (toolStore.appMode === 'animate') animationStore.setFrame(animationStore.currentFrame - 1)
      return
    case 'frame_next':
      if (toolStore.appMode === 'animate') animationStore.setFrame(animationStore.currentFrame + 1)
      return
    case 'toggle_bone_hierarchy':
      animationStore.toggleBoneHierarchyPopout()
      return
    case 'bind_geometry':
      if (toolStore.appMode === 'rig' || toolStore.appMode === 'animate') {
        animationStore.bindSelectedGeometry(bindGeometryMode())
      }
      return
    case 'unbind_geometry':
      if ((toolStore.appMode === 'rig' || toolStore.appMode === 'animate') && projectStore.activeMesh) {
        animationStore.unbindGeometry(projectStore.activeMesh.id)
      }
      return
  }
}

function tryKeymapDispatch(e: KeyboardEvent): boolean {
  const ids = keymapStore.matchingActionIds(e)
  if (!ids.length) return false
  const id = resolveKeymapAction(ids)
  if (!id) return false
  if (operatorManager.state.value.active && id !== 'command_palette') return false
  if (e.repeat && id !== 'frame_prev' && id !== 'frame_next') return false
  e.preventDefault()
  runKeymapAction(id)
  return true
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return Boolean(target.closest('input, select, textarea, [contenteditable="true"]'))
}

function handleKeyDown(e: KeyboardEvent) {
  if (isTypingTarget(e.target)) {
    return
  }

  if (e.ctrlKey || e.metaKey) {
    if (e.key === 'c' || e.key === 'C') {
      e.preventDefault()
      projectStore.copySelection(toolStore.selectMode)
      return
    }
    if (e.key === 'v' || e.key === 'V') {
      e.preventDefault()
      projectStore.pasteClipboard()
      return
    }
  }

  tryKeymapDispatch(e)
}

function handleOpenExportCommand() {
  showExportModal.value = true
}

function formatTimeAgo(timestamp?: number): string {
  if (!timestamp) return 'earlier'
  const diffSec = Math.floor((Date.now() - timestamp) / 1000)
  if (diffSec < 60) return 'just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  return new Date(timestamp).toLocaleDateString()
}

async function handleRestoreAutosave() {
  await projectStore.restoreAutosaveSession()
}

onMounted(async () => {
  themeStore.initTheme()
  keymapStore.initKeymaps()
  layoutStore.showRightSidebar = true
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener(EDITOR_EVENTS.openExport, handleOpenExportCommand)

  // Check if an unsaved recovery session is available, but start with a clean fresh scene
  await projectStore.checkAutosaveSession()
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener(EDITOR_EVENTS.openExport, handleOpenExportCommand)
})
</script>

<template>
  <div class="h-screen w-screen flex flex-col bg-ui-base text-ui-textPrimary overflow-hidden font-sans">
    <!-- Header Navigation -->
    <HeaderMenu 
      @open-export="showExportModal = true"
      @open-hotkeys="showHotkeyModal = true"
      @open-preferences="showPreferencesModal = true"
      @new-project="showNewProjectModal = true"
    />

    <!-- Document Recovery Banner (Microsoft Word / Docs Style) -->
    <div 
      v-if="projectStore.showRecoveryBanner && projectStore.autosaveRecord" 
      class="bg-amber-950/80 border-b border-amber-500/40 px-4 py-1.5 flex items-center justify-between text-xs text-amber-200 z-40 backdrop-blur-md shrink-0 shadow-md"
    >
      <div class="flex items-center gap-2 min-w-0">
        <RotateCcw class="w-4 h-4 text-amber-400 shrink-0" />
        <span class="truncate">
          <strong class="font-bold text-amber-300">Document Recovery:</strong> Unsaved session found from <span class="font-mono text-amber-100">{{ formatTimeAgo(projectStore.autosaveRecord.updatedAt) }}</span> ({{ projectStore.autosaveRecord.name || 'Project' }} • {{ projectStore.autosaveRecord.meshes?.length || 1 }} mesh{{ (projectStore.autosaveRecord.meshes?.length || 1) === 1 ? '' : 'es' }}).
        </span>
      </div>
      <div class="flex items-center gap-2 shrink-0 ml-4">
        <button 
          @click="handleRestoreAutosave" 
          class="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xs transition text-[11px] cursor-pointer shadow-xs flex items-center gap-1"
        >
          <RotateCcw class="w-3 h-3" /> Recover Session
        </button>
        <button 
          @click="projectStore.dismissRecoverySession()" 
          class="px-2.5 py-1 bg-ui-surface hover:bg-ui-hover text-ui-textSecondary hover:text-white border border-ui-borderSubtle rounded-xs transition text-[11px] cursor-pointer"
        >
          Dismiss
        </button>
        <button 
          @click="projectStore.discardRecoverySession()" 
          class="px-2 py-1 text-rose-400 hover:text-rose-300 hover:underline transition text-[10.5px] cursor-pointer" 
          title="Delete autosave data and keep current clean file"
        >
          Discard
        </button>
      </div>
    </div>

    <!-- Main Workspace Area -->
    <div class="flex-1 flex overflow-hidden relative min-h-0">
      <main class="flex-1 flex flex-col overflow-hidden bg-ui-root relative min-w-0 min-h-0">
        <div class="flex-1 flex overflow-hidden relative min-h-0">
          <LeftToolbar v-if="layoutStore.showLeftToolbar" />

          <div class="flex-1 flex overflow-hidden relative min-w-0 min-h-0">
            <div 
              class="h-full relative flex flex-col overflow-hidden transition-[width] duration-75 min-w-0"
              :class="{ 'transition-none': isUvSplitting }"
              :style="{ width: toolStore.appMode === 'uvpaint' ? uvSplitRatio + '%' : '100%' }"
            >
              <Viewport3D />
            </div>

            <div 
              v-if="toolStore.appMode === 'uvpaint'"
              @mousedown="startUvSplit"
              @dblclick="toggleUvSplitPreset"
              class="w-1.5 h-full bg-ui-header hover:bg-ui-hover border-x border-ui-borderSubtle cursor-col-resize flex items-center justify-center transition group shrink-0 relative select-none z-10"
              title="Drag left/right to resize 3D vs UV Canvas. Double-click to toggle layout."
            >
              <div class="h-12 w-0.5 rounded-full bg-ui-borderDefault group-hover:bg-ui-accent transition"></div>
            </div>

            <div 
              v-if="toolStore.appMode === 'uvpaint'" 
              class="h-full bg-ui-panel relative flex flex-col overflow-hidden transition-[width] duration-75"
              :class="{ 'transition-none': isUvSplitting }"
              :style="{ width: (100 - uvSplitRatio) + '%' }"
            >
              <PixelCanvas />
            </div>
          </div>
        </div>

        <div v-if="toolStore.appMode === 'animate'" class="w-full shrink-0">
          <Timeline />
        </div>
      </main>

      <!-- Right Sidebar (Outliner + Inspector + Material & Palette) -->
      <RightSidebar v-if="layoutStore.showRightSidebar" />

      <!-- Collapsed Right Sidebar Dock Strip (When hidden) -->
      <aside 
        v-else
        class="w-7 bg-ui-panel border-l border-ui-borderSubtle flex flex-col items-center py-2 gap-1 select-none z-30 shrink-0 font-sans shadow-sm"
      >
        <button 
          @click="layoutStore.showRightSidebar = true"
          class="w-6 h-6 flex items-center justify-center rounded-xs text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover transition cursor-pointer mb-1"
          title="Expand Properties & Outliner (Hotkey: N)"
        >
          <PanelRightOpen class="w-3.5 h-3.5 text-amber-400" />
        </button>

        <div class="w-4 h-px bg-ui-borderSubtle my-0.5"></div>

        <button
          v-for="tab in collapsedPropTabs"
          :key="tab.id"
          @click="layoutStore.showRightSidebar = true; layoutStore.setInspectorTab(tab.id, toolStore.appMode)"
          class="w-6 h-6 flex items-center justify-center rounded-xs text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover transition cursor-pointer"
          :title="tab.title"
        >
          <BlenderIcon v-if="tab.blender" :name="tab.blender" :size="13" />
          <component v-else-if="tab.icon" :is="tab.icon" class="w-3.5 h-3.5" />
        </button>
      </aside>
    </div>

    <!-- Desktop Bottom Status Bar Footer -->
    <StatusBar v-if="layoutStore.showStatusBar" />

    <!-- Modals & Overlays -->
    <ExportModal v-if="showExportModal" @close="showExportModal = false" />
    <HotkeyModal v-if="showHotkeyModal" @close="showHotkeyModal = false" />
    <NewProjectModal v-if="showNewProjectModal" @close="showNewProjectModal = false" />
    <PreferencesModal v-if="showPreferencesModal" @close="showPreferencesModal = false" />
    <AddPrimitivePopout />
    <BlenderPieMenu />
    <CommandPaletteModal />
    <BoneHierarchyPopout />
    <div
      v-show="fastTip.visible"
      class="fixed z-[80] max-w-xs px-2 py-1 bg-ui-header border border-ui-borderStrong rounded-xs text-[10px] font-mono text-ui-textPrimary shadow-xl pointer-events-none select-none whitespace-pre-wrap"
      :style="{
        left: fastTip.x + 'px',
        top: fastTip.y + 'px',
        transform: fastTip.side === 'right' ? 'translateY(-50%)' : 'translateX(-50%)'
      }"
    >{{ fastTip.text }}</div>
  </div>
</template>
