import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface KeyBinding {
  id: string
  label: string
  category: 'Modeling' | 'Selection' | 'Viewport' | 'Transform' | 'UV & Painting' | 'Animation' | 'System'
  defaultKey: string
  currentKey: string
  description?: string
}

export const DEFAULT_KEYBINDINGS: KeyBinding[] = [
  // MODELING
  { id: 'extrude', label: 'Extrude Region', category: 'Modeling', defaultKey: 'e', currentKey: 'e' },
  { id: 'extrude_individual', label: 'Extrude Individual', category: 'Modeling', defaultKey: 'Alt+e', currentKey: 'Alt+e' },
  { id: 'inset', label: 'Inset Faces', category: 'Modeling', defaultKey: 'i', currentKey: 'i' },
  { id: 'bevel', label: 'Bevel Edges / Vertices', category: 'Modeling', defaultKey: 'Ctrl+b', currentKey: 'Ctrl+b' },
  { id: 'loopcut', label: 'Loop Cut and Slide', category: 'Modeling', defaultKey: 'Ctrl+r', currentKey: 'Ctrl+r' },
  { id: 'knife', label: 'Knife Topology', category: 'Modeling', defaultKey: 'k', currentKey: 'k' },
  { id: 'subdivide', label: 'Subdivide Mesh', category: 'Modeling', defaultKey: 'w', currentKey: 'w' },
  { id: 'fill_face', label: 'Fill Face from Boundary', category: 'Modeling', defaultKey: 'f', currentKey: 'f' },
  { id: 'connect_verts', label: 'Connect Vertex Path', category: 'Modeling', defaultKey: 'j', currentKey: 'j' },
  { id: 'merge_verts', label: 'Merge Vertices (Center)', category: 'Modeling', defaultKey: 'm', currentKey: 'm' },
  { id: 'flip_normals', label: 'Flip Normals', category: 'Modeling', defaultKey: 'Shift+n', currentKey: 'Shift+n' },
  { id: 'delete_element', label: 'Delete Selected', category: 'Modeling', defaultKey: 'x', currentKey: 'x' },
  { id: 'separate_mesh', label: 'Separate Selection', category: 'Modeling', defaultKey: 'p', currentKey: 'p' },
  { id: 'join_meshes', label: 'Join Meshes', category: 'Modeling', defaultKey: 'Ctrl+j', currentKey: 'Ctrl+j' },
  { id: 'duplicate', label: 'Duplicate Selection', category: 'Modeling', defaultKey: 'Shift+d', currentKey: 'Shift+d' },
  { id: 'add_primitive', label: 'Add Primitive Placement', category: 'Modeling', defaultKey: 'Shift+a', currentKey: 'Shift+a' },

  // TRANSFORM
  { id: 'grab', label: 'Move / Translate', category: 'Transform', defaultKey: 'g', currentKey: 'g' },
  { id: 'rotate', label: 'Rotate Tool', category: 'Transform', defaultKey: 'r', currentKey: 'r' },
  { id: 'scale', label: 'Scale Tool', category: 'Transform', defaultKey: 's', currentKey: 's' },
  { id: 'toggle_snap', label: 'Toggle Snapping', category: 'Transform', defaultKey: 'Shift+Tab', currentKey: 'Shift+Tab' },

  // SELECTION
  { id: 'select_all', label: 'Select All', category: 'Selection', defaultKey: 'a', currentKey: 'a' },
  { id: 'deselect_all', label: 'Deselect All', category: 'Selection', defaultKey: 'Alt+a', currentKey: 'Alt+a' },
  { id: 'box_select', label: 'Box Select (Marquee)', category: 'Selection', defaultKey: 'b', currentKey: 'b' },
  { id: 'mode_vertex', label: 'Vertex Mode', category: 'Selection', defaultKey: '1', currentKey: '1' },
  { id: 'mode_edge', label: 'Edge Mode', category: 'Selection', defaultKey: '2', currentKey: '2' },
  { id: 'mode_face', label: 'Face Mode', category: 'Selection', defaultKey: '3', currentKey: '3' },
  { id: 'mode_object', label: 'Object Mode', category: 'Selection', defaultKey: '4', currentKey: '4' },
  { id: 'mode_origin', label: 'Origin / Pivot Mode', category: 'Selection', defaultKey: '5', currentKey: '5' },
  { id: 'mode_bone', label: 'Bone Selection Mode', category: 'Selection', defaultKey: '6', currentKey: '6' },
  { id: 'toggle_edit_object', label: 'Toggle Edit/Object Mode', category: 'Selection', defaultKey: 'Tab', currentKey: 'Tab' },

  // VIEWPORT
  { id: 'toggle_xray', label: 'Toggle X-Ray Mode', category: 'Viewport', defaultKey: 'Alt+z', currentKey: 'Alt+z' },
  { id: 'shading_pie', label: 'Shading Pie Menu', category: 'Viewport', defaultKey: 'z', currentKey: 'z' },
  { id: 'snap_pie', label: 'Cursor & Snapping Pie', category: 'Viewport', defaultKey: 'Shift+s', currentKey: 'Shift+s' },
  { id: 'command_palette', label: 'Command Search Palette', category: 'Viewport', defaultKey: 'F3', currentKey: 'F3' },
  { id: 'view_top', label: 'Top Orthographic View', category: 'Viewport', defaultKey: 'Numpad7', currentKey: 'Numpad7' },
  { id: 'view_front', label: 'Front Orthographic View', category: 'Viewport', defaultKey: 'Numpad1', currentKey: 'Numpad1' },
  { id: 'view_right', label: 'Right Orthographic View', category: 'Viewport', defaultKey: 'Numpad3', currentKey: 'Numpad3' },
  { id: 'view_camera', label: 'Toggle Perspective / Camera', category: 'Viewport', defaultKey: 'Numpad0', currentKey: 'Numpad0' },

  // SYSTEM
  { id: 'open_preferences', label: 'Open Preferences / Properties', category: 'System', defaultKey: 'Ctrl+,', currentKey: 'Ctrl+,' },
  { id: 'save_project', label: 'Save Project JSON', category: 'System', defaultKey: 'Ctrl+s', currentKey: 'Ctrl+s' },
  { id: 'undo', label: 'Undo', category: 'System', defaultKey: 'Ctrl+z', currentKey: 'Ctrl+z' },
  { id: 'redo', label: 'Redo', category: 'System', defaultKey: 'Ctrl+Shift+z', currentKey: 'Ctrl+Shift+z' },
  { id: 'export_model', label: 'Export 3D Model', category: 'System', defaultKey: 'Ctrl+e', currentKey: 'Ctrl+e' }
]

export const useKeymapStore = defineStore('keymap', () => {
  const bindings = ref<KeyBinding[]>(JSON.parse(JSON.stringify(DEFAULT_KEYBINDINGS)))
  const recordingBindingId = ref<string | null>(null)

  function initKeymaps() {
    try {
      const saved = localStorage.getItem('polyecho_keymaps')
      if (saved) {
        const parsed = JSON.parse(saved)
        bindings.value.forEach(b => {
          if (parsed[b.id]) {
            b.currentKey = parsed[b.id]
          }
        })
      }
    } catch {
      // Ignore
    }
  }

  function rebind(bindingId: string, newKey: string) {
    const item = bindings.value.find(b => b.id === bindingId)
    if (item) {
      item.currentKey = newKey
      saveKeymaps()
    }
    recordingBindingId.value = null
  }

  function resetToDefault(bindingId: string) {
    const item = bindings.value.find(b => b.id === bindingId)
    if (item) {
      item.currentKey = item.defaultKey
      saveKeymaps()
    }
  }

  function resetAllDefaults() {
    bindings.value.forEach(b => {
      b.currentKey = b.defaultKey
    })
    saveKeymaps()
  }

  function saveKeymaps() {
    try {
      const map: Record<string, string> = {}
      bindings.value.forEach(b => {
        map[b.id] = b.currentKey
      })
      localStorage.setItem('polyecho_keymaps', JSON.stringify(map))
    } catch {
      // Ignore
    }
  }

  function getKeyFor(actionId: string): string {
    const item = bindings.value.find(b => b.id === actionId)
    return item ? item.currentKey : ''
  }

  return {
    bindings,
    recordingBindingId,
    initKeymaps,
    rebind,
    resetToDefault,
    resetAllDefaults,
    getKeyFor
  }
})
