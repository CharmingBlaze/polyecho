<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
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

import { useToolStore } from './stores/toolStore'
import { useProjectStore } from './stores/projectStore'
import { useAnimationStore } from './stores/animationStore'
import { useHistoryStore } from './stores/historyStore'
import { useLayoutStore } from './stores/layoutStore'
import { useThemeStore } from './stores/themeStore'
import { useKeymapStore } from './stores/keymapStore'
import { ProjectSerializer } from './core/project/ProjectSerializer'

const toolStore = useToolStore()
const projectStore = useProjectStore()
const animationStore = useAnimationStore()
const historyStore = useHistoryStore()
const layoutStore = useLayoutStore()
const themeStore = useThemeStore()
const keymapStore = useKeymapStore()

const showExportModal = ref(false)
const showHotkeyModal = ref(false)
const showNewProjectModal = ref(false)
const showPreferencesModal = ref(false)

// UV / Paint Split Pane Resizing
const uvSplitRatio = ref<number>(50) // percentage
const isUvSplitting = ref<boolean>(false)

function startUvSplit(e: MouseEvent) {
  isUvSplitting.value = true
  const container = (e.target as HTMLElement).closest('main')
  if (!container) return
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

function handleKeyDown(e: KeyboardEvent) {
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
    return
  }

  // Ctrl / Cmd combos
  if (e.ctrlKey || e.metaKey) {
    if (e.key === 'z' || e.key === 'Z') {
      e.preventDefault()
      if (e.shiftKey) {
        historyStore.redo()
      } else {
        historyStore.undo()
      }
      return
    }
    if (e.key === 'y' || e.key === 'Y') {
      e.preventDefault()
      historyStore.redo()
      return
    }
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
    if (e.key === 'j' || e.key === 'J') {
      e.preventDefault()
      projectStore.performJoinMeshes()
      return
    }
    if (e.key === 's' || e.key === 'S') {
      e.preventDefault()
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
      return
    }
    if (e.key === 'e' || e.key === 'E') {
      e.preventDefault()
      showExportModal.value = true
      return
    }
    if (e.key === 'n' || e.key === 'N') {
      e.preventDefault()
      showNewProjectModal.value = true
      return
    }
    if (e.key === ',' || e.key === '<') {
      e.preventDefault()
      showPreferencesModal.value = true
      return
    }
    if ((e.key === 'q' || e.key === 'Q') && e.altKey) {
      e.preventDefault()
      toolStore.viewport.quadView = !toolStore.viewport.quadView
      return
    }
  }

  // Alt+Z: Toggle X-Ray Mode (Blender)
  if (e.altKey && (e.key === 'z' || e.key === 'Z') && !e.ctrlKey && !e.metaKey) {
    e.preventDefault()
    toolStore.viewport.xray = !toolStore.viewport.xray
    return
  }

  // Loop Cut Shortcut (Ctrl+R)
  if ((e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R')) {
    e.preventDefault()
    if (toolStore.appMode === 'model') {
      window.dispatchEvent(new CustomEvent('blender-modal-op', { detail: 'loop_cut' }))
    }
    return
  }

  // Bevel (Model) / Bind to Bone (Rig/Animate) Shortcut (Ctrl+B)
  if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
    e.preventDefault()
    if (toolStore.appMode === 'model') {
      window.dispatchEvent(new CustomEvent('blender-modal-op', { detail: 'bevel' }))
    } else if (toolStore.appMode === 'rig' || toolStore.appMode === 'animate') {
      const mode = toolStore.selectMode === 'object' ? 'object' : (toolStore.selectMode === 'edge' ? 'edges' : (toolStore.selectMode === 'vertex' ? 'vertices' : 'faces'))
      animationStore.bindSelectedGeometry(mode)
    }
    return
  }

  // Parent to Bone (Ctrl+P) / Unbind (Alt+P) (Blender)
  if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
    e.preventDefault()
    const mode = toolStore.selectMode === 'object' ? 'object' : (toolStore.selectMode === 'edge' ? 'edges' : (toolStore.selectMode === 'vertex' ? 'vertices' : 'faces'))
    animationStore.bindSelectedGeometry(mode)
    return
  }
  if (e.altKey && (e.key === 'p' || e.key === 'P') && !e.ctrlKey && !e.metaKey) {
    e.preventDefault()
    if (projectStore.activeMesh) {
      animationStore.unbindGeometry(projectStore.activeMesh.id)
    }
    return
  }

  // Duplicate Shortcut (Shift+D)
  if (e.shiftKey && (e.key === 'd' || e.key === 'D')) {
    e.preventDefault()
    projectStore.duplicateSelection(toolStore.selectMode)
    return
  }

  // Select All (A) / Deselect All (Alt+A)
  if (e.key === 'a' || e.key === 'A') {
    e.preventDefault()
    if (e.altKey) {
      projectStore.deselectAll()
    } else {
      projectStore.selectAll(toolStore.selectMode)
    }
    return
  }

  // Desktop Numpad View Hotkeys
  if (e.code === 'Numpad7') {
    e.preventDefault()
    toolStore.viewport.quadView = false
    // Emit top view via custom event or global viewport event
    window.dispatchEvent(new CustomEvent('set-camera-view', { detail: 'top' }))
    return
  } else if (e.code === 'Numpad1') {
    e.preventDefault()
    toolStore.viewport.quadView = false
    window.dispatchEvent(new CustomEvent('set-camera-view', { detail: 'front' }))
    return
  } else if (e.code === 'Numpad3') {
    e.preventDefault()
    toolStore.viewport.quadView = false
    window.dispatchEvent(new CustomEvent('set-camera-view', { detail: 'right' }))
    return
  } else if (e.code === 'Numpad0') {
    e.preventDefault()
    toolStore.viewport.quadView = false
    window.dispatchEvent(new CustomEvent('set-camera-view', { detail: 'iso' }))
    return
  } else if (e.code === 'Numpad5') {
    e.preventDefault()
    toolStore.viewport.quadView = !toolStore.viewport.quadView
    return
  }

  // General Hotkeys
  switch (e.key.toLowerCase()) {
    case 'tab':
      e.preventDefault()
      toolStore.selectMode = toolStore.selectMode === 'object' ? 'face' : 'object'
      projectStore.clearSubSelections()
      break
    case '1':
      toolStore.selectMode = 'vertex'
      projectStore.clearSubSelections()
      break
    case '2':
      toolStore.selectMode = 'edge'
      projectStore.clearSubSelections()
      break
    case '3':
      toolStore.selectMode = 'face'
      projectStore.clearSubSelections()
      break
    case '4':
      toolStore.selectMode = 'object'
      projectStore.clearSubSelections()
      break
    case '5':
    case 'p':
      toolStore.selectMode = 'origin'
      projectStore.clearSubSelections()
      break
    case '6':
      toolStore.selectMode = 'bone'
      toolStore.setAppMode('rig')
      projectStore.clearSubSelections()
      break
    case 'g':
      if (toolStore.appMode === 'model') {
        window.dispatchEvent(new CustomEvent('blender-modal-op', { detail: 'grab' }))
      } else if (toolStore.appMode === 'rig' || toolStore.appMode === 'animate') {
        toolStore.setModelTool('move')
      } else if (toolStore.appMode === 'uvpaint') {
        toolStore.setPaintTool('bucket')
      }
      break
    case 'w':
      if (toolStore.appMode === 'model' || toolStore.appMode === 'rig' || toolStore.appMode === 'animate') {
        toolStore.setModelTool('move')
      } else if (toolStore.appMode === 'uvpaint') {
        toolStore.setPaintTool('bucket')
      }
      break
    case 'r':
      if (toolStore.appMode === 'model') {
        window.dispatchEvent(new CustomEvent('blender-modal-op', { detail: 'rotate' }))
      } else if (toolStore.appMode === 'rig' || toolStore.appMode === 'animate') {
        toolStore.setModelTool('rotate')
      }
      break
    case 's':
      if (toolStore.appMode === 'model') {
        window.dispatchEvent(new CustomEvent('blender-modal-op', { detail: 'scale' }))
      } else if (toolStore.appMode === 'rig' || toolStore.appMode === 'animate') {
        toolStore.setModelTool('scale')
      }
      break
    case 'e':
      if (toolStore.appMode === 'model') {
        window.dispatchEvent(new CustomEvent('blender-modal-op', { detail: 'extrude' }))
      } else if (toolStore.appMode === 'rig' || toolStore.appMode === 'animate') {
        animationStore.extrudeBone(animationStore.selectedBoneId)
      } else if (toolStore.appMode === 'uvpaint') {
        toolStore.setPaintTool('eraser')
      }
      break
    case 'i':
      if (toolStore.appMode === 'model') {
        window.dispatchEvent(new CustomEvent('blender-modal-op', { detail: 'inset' }))
      } else if (toolStore.appMode === 'uvpaint') {
        toolStore.setPaintTool('picker')
      }
      break
    case 'b':
      if (toolStore.appMode === 'model') {
        toolStore.setModelTool('select')
      } else if (toolStore.appMode === 'uvpaint') {
        toolStore.setPaintTool('brush')
      }
      break
    case 'k':
      if (toolStore.appMode === 'model') {
        window.dispatchEvent(new CustomEvent('blender-modal-op', { detail: 'knife' }))
      }
      break
    case 'f':
      if (toolStore.appMode === 'model') projectStore.performFillFace()
      break
    case 'm':
      if (toolStore.appMode === 'model') projectStore.performMerge('center')
      break
    case 'd':
      if (toolStore.appMode === 'uvpaint') toolStore.setPaintTool('dither')
      break
    case 'h':
    case 'H':
      if (e.shiftKey || toolStore.appMode === 'rig' || toolStore.appMode === 'animate') {
        e.preventDefault()
        animationStore.toggleBoneHierarchyPopout()
      }
      break
    case ' ':
      e.preventDefault()
      if (toolStore.appMode === 'animate') {
        animationStore.togglePlay()
      }
      break
    case 'delete':
    case 'x':
      if (toolStore.appMode === 'model') {
        if (toolStore.selectMode === 'object') projectStore.performDelete('object')
        else if (toolStore.selectMode === 'face') projectStore.performDelete('face')
        else if (toolStore.selectMode === 'edge') projectStore.performDelete('edge')
        else projectStore.performDelete('vertex')
      } else if (toolStore.appMode === 'rig' && animationStore.selectedBoneId) {
        animationStore.deleteBone(animationStore.selectedBoneId)
      }
      break
  }
}

onMounted(() => {
  themeStore.initTheme()
  keymapStore.initKeymaps()
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
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

    <!-- Main Workspace Area -->
    <div class="flex-1 flex overflow-hidden">
      <!-- Left Tool Palette -->
      <LeftToolbar v-if="layoutStore.showLeftToolbar" />

      <!-- Center Work Area -->
      <main class="flex-1 flex flex-col overflow-hidden bg-ui-root relative">
        <!-- 3D Viewport / UV Paint Viewport Split -->
        <div class="flex-1 flex overflow-hidden relative">
          <!-- 3D Viewport Pane (Left in UV mode, Full in Model/Rig/Animate mode) -->
          <div 
            class="h-full relative flex flex-col overflow-hidden transition-[width] duration-75"
            :class="{ 'transition-none': isUvSplitting }"
            :style="{ width: toolStore.appMode === 'uvpaint' ? uvSplitRatio + '%' : '100%' }"
          >
            <Viewport3D />
          </div>

          <!-- Vertical Draggable Resizer Bar (between 3D Viewport & UV Canvas) -->
          <div 
            v-if="toolStore.appMode === 'uvpaint'"
            @mousedown="startUvSplit"
            @dblclick="toggleUvSplitPreset"
            class="w-1.5 h-full bg-ui-header hover:bg-ui-hover border-x border-ui-borderSubtle cursor-col-resize flex items-center justify-center transition group shrink-0 relative select-none z-10"
            title="Drag left/right to resize 3D vs UV Canvas. Double-click to toggle layout."
          >
            <div class="h-12 w-0.5 rounded-full bg-ui-borderDefault group-hover:bg-ui-accent transition"></div>
          </div>

          <!-- 2D UV & Pixel Canvas Pane (Right in UV mode) -->
          <div 
            v-if="toolStore.appMode === 'uvpaint'" 
            class="h-full bg-ui-panel relative flex flex-col overflow-hidden transition-[width] duration-75"
            :class="{ 'transition-none': isUvSplitting }"
            :style="{ width: (100 - uvSplitRatio) + '%' }"
          >
            <PixelCanvas />
          </div>
        </div>

        <!-- Bottom Animation Timeline (Visible when in Animate mode) -->
        <div v-if="toolStore.appMode === 'animate'" class="w-full">
          <Timeline />
        </div>
      </main>

      <!-- Right Sidebar (Outliner + Inspector + Material & Palette) -->
      <RightSidebar v-if="layoutStore.showRightSidebar" />
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
  </div>
</template>
