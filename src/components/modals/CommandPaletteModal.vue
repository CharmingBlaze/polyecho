<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useToolStore } from '../../stores/toolStore'
import { useProjectStore } from '../../stores/projectStore'
import BlenderIcon from '../icons/BlenderIcon.vue'
import { Search, CornerDownLeft, Sparkles } from 'lucide-vue-next'

const toolStore = useToolStore()
const projectStore = useProjectStore()

const isOpen = ref(false)
const searchQuery = ref('')
const selectedIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)

interface CommandItem {
  id: string
  title: string
  category: 'Modeling' | 'Topology' | 'Selection' | 'Primitives' | 'Modifiers' | 'Shading' | 'Export'
  shortcut?: string
  icon?: any
  action: () => void
}

const allCommands = computed<CommandItem[]>(() => [
  // 1. MODELING OPERATORS
  {
    id: 'extrude',
    title: 'Extrude Region',
    category: 'Modeling',
    shortcut: 'E',
    icon: 'extrude',
    action: () => window.dispatchEvent(new CustomEvent('blender-modal-op', { detail: 'extrude' }))
  },
  {
    id: 'extrude-individual',
    title: 'Extrude Individual Faces',
    category: 'Modeling',
    shortcut: 'Alt+E',
    icon: 'extrude',
    action: () => {
      if (projectStore.activeMesh && projectStore.selectedFaceIds.length > 0) {
        projectStore.recordState('Extrude Individual Faces')
        window.dispatchEvent(new CustomEvent('blender-modal-op', { detail: 'extrude' }))
      }
    }
  },
  {
    id: 'inset',
    title: 'Inset Faces',
    category: 'Modeling',
    shortcut: 'I',
    icon: 'inset',
    action: () => window.dispatchEvent(new CustomEvent('blender-modal-op', { detail: 'inset' }))
  },
  {
    id: 'bevel',
    title: 'Bevel Edges / Vertices',
    category: 'Modeling',
    shortcut: 'Ctrl+B',
    icon: 'bevel',
    action: () => window.dispatchEvent(new CustomEvent('blender-modal-op', { detail: 'bevel' }))
  },
  {
    id: 'loopcut',
    title: 'Loop Cut and Slide',
    category: 'Modeling',
    shortcut: 'Ctrl+R',
    icon: 'loop-cut',
    action: () => window.dispatchEvent(new CustomEvent('blender-modal-op', { detail: 'loopcut' }))
  },
  {
    id: 'knife',
    title: 'Knife Topology Tool',
    category: 'Modeling',
    shortcut: 'K',
    icon: 'knife',
    action: () => window.dispatchEvent(new CustomEvent('blender-modal-op', { detail: 'knife' }))
  },
  {
    id: 'move',
    title: 'Move / Translate Tool',
    category: 'Modeling',
    shortcut: 'G',
    icon: 'move',
    action: () => window.dispatchEvent(new CustomEvent('blender-modal-op', { detail: 'grab' }))
  },
  {
    id: 'rotate',
    title: 'Rotate Tool',
    category: 'Modeling',
    shortcut: 'R',
    icon: 'rotate',
    action: () => window.dispatchEvent(new CustomEvent('blender-modal-op', { detail: 'rotate' }))
  },
  {
    id: 'scale',
    title: 'Scale Tool',
    category: 'Modeling',
    shortcut: 'S',
    icon: 'scale',
    action: () => window.dispatchEvent(new CustomEvent('blender-modal-op', { detail: 'scale' }))
  },

  // 2. TOPOLOGY
  {
    id: 'subdivide',
    title: 'Subdivide Mesh',
    category: 'Topology',
    icon: 'subdivide',
    action: () => {
      if (projectStore.activeMesh) {
        projectStore.performSubdivide()
      }
    }
  },
  {
    id: 'merge-center',
    title: 'Merge Vertices at Center',
    category: 'Topology',
    shortcut: 'M',
    icon: 'merge',
    action: () => {
      if (projectStore.activeMesh) {
        projectStore.performMerge('center')
      }
    }
  },
  {
    id: 'connect-path',
    title: 'Connect Vertex Path',
    category: 'Topology',
    shortcut: 'J',
    action: () => {
      if (projectStore.activeMesh) {
        projectStore.performConnectVertices()
      }
    }
  },
  {
    id: 'fill-face',
    title: 'Fill Face from Boundary',
    category: 'Topology',
    shortcut: 'F',
    action: () => {
      if (projectStore.activeMesh) {
        projectStore.performFillFace()
      }
    }
  },
  {
    id: 'flip-normals',
    title: 'Flip Face Normals',
    category: 'Topology',
    shortcut: 'Shift+N',
    action: () => {
      if (projectStore.activeMesh) {
        projectStore.performFlipNormals()
      }
    }
  },
  {
    id: 'clean-mesh',
    title: 'Clean Degenerate Geometry',
    category: 'Topology',
    action: () => {
      if (projectStore.activeMesh) {
        projectStore.performCleanupMesh()
      }
    }
  },

  // 3. SELECTION
  {
    id: 'box-select',
    title: 'Box Select (Marquee)',
    category: 'Selection',
    shortcut: 'B',
    icon: 'marquee',
    action: () => { toolStore.isBoxSelectActive = true }
  },
  {
    id: 'select-all',
    title: 'Select All',
    category: 'Selection',
    shortcut: 'A',
    action: () => projectStore.selectAll()
  },
  {
    id: 'deselect-all',
    title: 'Deselect All',
    category: 'Selection',
    shortcut: 'Alt+A',
    action: () => projectStore.deselectAll()
  },
  {
    id: 'mode-vertex',
    title: 'Vertex Selection Mode',
    category: 'Selection',
    shortcut: '1',
    icon: 'vertex-select',
    action: () => { toolStore.selectMode = 'vertex'; toolStore.setAppMode('model') }
  },
  {
    id: 'mode-edge',
    title: 'Edge Selection Mode',
    category: 'Selection',
    shortcut: '2',
    icon: 'edge-select',
    action: () => { toolStore.selectMode = 'edge'; toolStore.setAppMode('model') }
  },
  {
    id: 'mode-face',
    title: 'Face Selection Mode',
    category: 'Selection',
    shortcut: '3',
    icon: 'face-select',
    action: () => { toolStore.selectMode = 'face'; toolStore.setAppMode('model') }
  },
  {
    id: 'mode-object',
    title: 'Object Selection Mode',
    category: 'Selection',
    shortcut: '4 / Tab',
    icon: 'mesh-cube',
    action: () => { toolStore.selectMode = 'object'; toolStore.setAppMode('model') }
  },
  {
    id: 'mode-bone',
    title: 'Bone Selection Mode',
    category: 'Selection',
    shortcut: '6',
    icon: 'bone',
    action: () => { toolStore.selectMode = 'bone'; toolStore.setAppMode('rig') }
  },

  // 4. PRIMITIVES
  {
    id: 'add-cube',
    title: 'Add Box / Cube',
    category: 'Primitives',
    shortcut: 'Shift+A',
    icon: 'mesh-cube',
    action: () => window.dispatchEvent(new CustomEvent('open-primitive-placement', { detail: { type: 'BOX' } }))
  },
  {
    id: 'add-plane',
    title: 'Add Plane / Grid Surface',
    category: 'Primitives',
    icon: 'mesh-plane',
    action: () => window.dispatchEvent(new CustomEvent('open-primitive-placement', { detail: { type: 'PLANE' } }))
  },
  {
    id: 'add-cylinder',
    title: 'Add Cylinder',
    category: 'Primitives',
    icon: 'mesh-cylinder',
    action: () => window.dispatchEvent(new CustomEvent('open-primitive-placement', { detail: { type: 'CYLINDER' } }))
  },
  {
    id: 'add-sphere',
    title: 'Add UV Sphere',
    category: 'Primitives',
    icon: 'mesh-uvsphere',
    action: () => window.dispatchEvent(new CustomEvent('open-primitive-placement', { detail: { type: 'SPHERE' } }))
  },

  // 5. MODIFIERS
  {
    id: 'mod-mirror',
    title: 'Add Mirror Modifier',
    category: 'Modifiers',
    icon: 'modifier-mirror',
    action: () => {
      if (projectStore.activeMesh) {
        projectStore.recordState('Add Mirror Modifier')
        projectStore.activeMesh.mirror = {
          enabled: true,
          axisX: true,
          axisY: false,
          axisZ: false,
          clipping: true,
          merge: true,
          mergeThreshold: 0.02,
          flipU: false,
          flipV: false
        }
      }
    }
  },
  {
    id: 'mod-solidify',
    title: 'Add Solidify Modifier',
    category: 'Modifiers',
    icon: 'modifier-solidify',
    action: () => {
      if (projectStore.activeMesh) {
        projectStore.recordState('Add Solidify Modifier')
        projectStore.activeMesh.solidify = {
          enabled: true,
          thickness: 0.1,
          offset: -1
        }
      }
    }
  },
  {
    id: 'mod-subdivide',
    title: 'Add Subdivision Surface Modifier',
    category: 'Modifiers',
    icon: 'subdivide',
    action: () => {
      if (projectStore.activeMesh) {
        projectStore.recordState('Add Subdivision Modifier')
        projectStore.activeMesh.subdivision = {
          enabled: true,
          level: 1
        }
      }
    }
  },
  {
    id: 'mod-bevel',
    title: 'Add Bevel Modifier',
    category: 'Modifiers',
    icon: 'modifier-bevel',
    action: () => {
      if (projectStore.activeMesh) {
        projectStore.recordState('Add Bevel Modifier')
        projectStore.activeMesh.bevelModifier = {
          enabled: true,
          offset: 0.05
        }
      }
    }
  },

  // 6. SHADING & DIAGNOSTICS
  {
    id: 'toggle-xray',
    title: 'Toggle X-Ray Mode',
    category: 'Shading',
    shortcut: 'Alt+Z',
    icon: 'xray',
    action: () => { toolStore.viewport.xray = !toolStore.viewport.xray }
  },
  {
    id: 'toggle-symmetry',
    title: 'Toggle Live X-Symmetry',
    category: 'Shading',
    action: () => { toolStore.viewport.symmetryX = !toolStore.viewport.symmetryX }
  },
  {
    id: 'toggle-face-orientation',
    title: 'Toggle Face Orientation (Blue/Red Normals)',
    category: 'Shading',
    action: () => { toolStore.viewport.faceOrientation = !toolStore.viewport.faceOrientation }
  },
  {
    id: 'shade-flat',
    title: 'Shade Flat (Low-Poly)',
    category: 'Shading',
    action: () => { toolStore.viewport.shadeMode = 'flat' }
  },
  {
    id: 'shade-smooth',
    title: 'Shade Smooth (Gouraud)',
    category: 'Shading',
    action: () => { toolStore.viewport.shadeMode = 'smooth' }
  },

  // 7. EXPORT
  {
    id: 'export-glb',
    title: 'Export GLTF / GLB Model',
    category: 'Export',
    shortcut: 'Ctrl+E',
    action: () => window.dispatchEvent(new CustomEvent('open-export-modal', { detail: 'glb' }))
  },
  {
    id: 'export-obj',
    title: 'Export Wavefront OBJ',
    category: 'Export',
    action: () => window.dispatchEvent(new CustomEvent('open-export-modal', { detail: 'obj' }))
  }
])

const filteredCommands = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return allCommands.value
  return allCommands.value.filter(cmd => 
    cmd.title.toLowerCase().includes(query) || 
    cmd.category.toLowerCase().includes(query) ||
    (cmd.shortcut && cmd.shortcut.toLowerCase().includes(query))
  )
})

function openPalette() {
  isOpen.value = true
  searchQuery.value = ''
  selectedIndex.value = 0
  nextTick(() => {
    inputRef.value?.focus()
  })
}

function closePalette() {
  isOpen.value = false
}

function executeSelected() {
  if (filteredCommands.value.length > 0) {
    const cmd = filteredCommands.value[selectedIndex.value] || filteredCommands.value[0]
    closePalette()
    cmd.action()
  }
}

function handleKeyDown(e: KeyboardEvent) {
  if (!isOpen.value) {
    if ((e.key === 'F3' || (e.code === 'Space' && (e.ctrlKey || e.shiftKey))) && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
      e.preventDefault()
      openPalette()
    }
    return
  }

  if (e.key === 'Escape') {
    e.preventDefault()
    closePalette()
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedIndex.value = (selectedIndex.value + 1) % filteredCommands.value.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedIndex.value = (selectedIndex.value - 1 + filteredCommands.value.length) % filteredCommands.value.length
  } else if (e.key === 'Enter') {
    e.preventDefault()
    executeSelected()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('open-command-palette', openPalette)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('open-command-palette', openPalette)
})
</script>

<template>
  <!-- Blender F3 / Space Command Search Palette Modal -->
  <div 
    v-if="isOpen"
    class="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-start justify-center pt-24 select-none font-sans"
    @click.self="closePalette"
  >
    <div class="w-full max-w-xl bg-ui-panel border border-ui-borderStrong rounded-xs shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100">
      <!-- Search Input Bar -->
      <div class="flex items-center px-3 py-2.5 bg-ui-header border-b border-ui-borderSubtle gap-2">
        <Search class="w-4 h-4 text-amber-400 shrink-0" />
        <input 
          ref="inputRef"
          type="text"
          v-model="searchQuery"
          placeholder="Search operator, modifier, tool, primitive (e.g. Extrude, Mirror, X-Ray)..."
          class="flex-1 bg-transparent text-ui-textPrimary placeholder:text-ui-textMuted text-xs font-mono focus:outline-none"
        />
        <span class="text-[10px] text-ui-textMuted font-mono">ESC to cancel</span>
        <button @click="closePalette" class="text-ui-textMuted hover:text-white">&times;</button>
      </div>

      <!-- Command Results List -->
      <div class="max-h-80 overflow-y-auto divide-y divide-ui-borderSubtle/60 p-1 custom-scrollbar">
        <template v-if="filteredCommands.length > 0">
          <button 
            v-for="(cmd, idx) in filteredCommands"
            :key="cmd.id"
            @click="selectedIndex = idx; executeSelected()"
            @mouseenter="selectedIndex = idx"
            class="w-full text-left px-3 py-1.5 rounded-xs flex items-center justify-between transition text-xs font-mono"
            :class="selectedIndex === idx ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-xs' : 'text-ui-textSecondary hover:bg-ui-hover'"
          >
            <div class="flex items-center gap-2.5">
              <BlenderIcon v-if="cmd.icon" :name="cmd.icon" :size="14" :color="selectedIndex === idx ? '#f59e0b' : 'currentColor'" />
              <Sparkles v-else class="w-3.5 h-3.5 text-slate-500" />
              <div>
                <span class="font-medium text-ui-textPrimary">{{ cmd.title }}</span>
                <span class="ml-2 text-[10px] px-1 py-0.2 rounded-xs bg-ui-input border border-ui-borderSubtle text-ui-textMuted">{{ cmd.category }}</span>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <span v-if="cmd.shortcut" class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-ui-input border border-ui-borderSubtle text-amber-400 font-bold">
                {{ cmd.shortcut }}
              </span>
              <CornerDownLeft v-if="selectedIndex === idx" class="w-3 h-3 text-amber-400" />
            </div>
          </button>
        </template>

        <div v-else class="py-8 text-center text-xs text-ui-textMuted">
          No matching operators or tools found.
        </div>
      </div>
    </div>
  </div>
</template>
