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
  { id: 'polydraw', label: 'Poly Draw (Blockout F)', category: 'Modeling', defaultKey: 'f', currentKey: 'f', description: 'Blockout workspace only. Model F is Fill.' },
  { id: 'polybuild', label: 'Poly Build (Blockout V)', category: 'Modeling', defaultKey: 'v', currentKey: 'v', description: 'Click empty space for a new vert, click an old vert to reuse it, close the loop to fill.' },
  { id: 'subdivide', label: 'Subdivide Mesh', category: 'Modeling', defaultKey: 'w', currentKey: 'w' },
  { id: 'fill_face', label: 'Fill Face from Boundary (Model F)', category: 'Modeling', defaultKey: 'f', currentKey: 'f', description: 'Model workspace. Blockout F is Poly Draw.' },
  { id: 'connect_verts', label: 'Connect Vertex Path', category: 'Modeling', defaultKey: 'j', currentKey: 'j' },
  { id: 'merge_verts', label: 'Merge Vertices (Center)', category: 'Modeling', defaultKey: 'm', currentKey: 'm' },
  { id: 'flip_normals', label: 'Flip Normals', category: 'Modeling', defaultKey: 'Shift+n', currentKey: 'Shift+n' },
  { id: 'delete_element', label: 'Delete Selected', category: 'Modeling', defaultKey: 'Delete / X', currentKey: 'Delete / X' },
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
  { id: 'toggle_quad_view', label: 'Toggle Quad View', category: 'Viewport', defaultKey: 'Numpad5 / Ctrl+Alt+q', currentKey: 'Numpad5 / Ctrl+Alt+q' },

  // SYSTEM
  { id: 'open_preferences', label: 'Open Preferences / Properties', category: 'System', defaultKey: 'Ctrl+,', currentKey: 'Ctrl+,' },
  { id: 'save_project', label: 'Save Project JSON', category: 'System', defaultKey: 'Ctrl+s', currentKey: 'Ctrl+s' },
  { id: 'undo', label: 'Undo', category: 'System', defaultKey: 'Ctrl+z', currentKey: 'Ctrl+z' },
  { id: 'redo', label: 'Redo', category: 'System', defaultKey: 'Ctrl+Shift+z / Ctrl+y', currentKey: 'Ctrl+Shift+z / Ctrl+y' },
  { id: 'export_model', label: 'Export 3D Model', category: 'System', defaultKey: 'Ctrl+e', currentKey: 'Ctrl+e' },
  { id: 'new_project', label: 'New Project', category: 'System', defaultKey: 'Ctrl+n', currentKey: 'Ctrl+n' },
  { id: 'toggle_left_toolbar', label: 'Toggle Left Toolbar', category: 'System', defaultKey: 't', currentKey: 't' },
  { id: 'toggle_right_sidebar', label: 'Toggle Right Sidebar', category: 'System', defaultKey: 'n', currentKey: 'n' },
  { id: 'restore_autosave', label: 'Restore Autosave Session', category: 'System', defaultKey: 'Ctrl+Shift+t', currentKey: 'Ctrl+Shift+t' },

  // ANIMATION
  { id: 'play_pause', label: 'Play / Pause Timeline', category: 'Animation', defaultKey: 'space', currentKey: 'space' },
  { id: 'frame_prev', label: 'Previous Frame', category: 'Animation', defaultKey: 'ArrowLeft / ,', currentKey: 'ArrowLeft / ,' },
  { id: 'frame_next', label: 'Next Frame', category: 'Animation', defaultKey: 'ArrowRight / .', currentKey: 'ArrowRight / .' },
  { id: 'toggle_bone_hierarchy', label: 'Bone Hierarchy Popout', category: 'Animation', defaultKey: 'h / Shift+h', currentKey: 'h / Shift+h' },
  { id: 'bind_geometry', label: 'Bind Selected Geometry', category: 'Animation', defaultKey: 'Ctrl+p', currentKey: 'Ctrl+p' },
  { id: 'unbind_geometry', label: 'Unbind Geometry', category: 'Animation', defaultKey: 'Alt+p', currentKey: 'Alt+p' },

  // UV & PAINTING
  { id: 'paint_brush', label: 'Paint Brush', category: 'UV & Painting', defaultKey: 'b', currentKey: 'b' },
  { id: 'paint_eraser', label: 'Paint Eraser', category: 'UV & Painting', defaultKey: 'e', currentKey: 'e' },
  { id: 'paint_bucket', label: 'Paint Bucket', category: 'UV & Painting', defaultKey: 'g', currentKey: 'g' },
  { id: 'paint_picker', label: 'Eyedropper', category: 'UV & Painting', defaultKey: 'i', currentKey: 'i' },
  { id: 'paint_line', label: 'Line Tool', category: 'UV & Painting', defaultKey: 'l', currentKey: 'l' },
  { id: 'paint_rect', label: 'Rectangle Tool', category: 'UV & Painting', defaultKey: 'u', currentKey: 'u' },
  { id: 'paint_circle', label: 'Circle Tool', category: 'UV & Painting', defaultKey: 'c', currentKey: 'c' },
  { id: 'paint_dither', label: 'Dither Brush', category: 'UV & Painting', defaultKey: 'd', currentKey: 'd' },
  { id: 'paint_shade', label: 'Shading Brush (UV/Paint)', category: 'UV & Painting', defaultKey: 'h', currentKey: 'h' },
  { id: 'paint_uv_overlay', label: 'Toggle UV Overlay (Paint)', category: 'UV & Painting', defaultKey: 'o', currentKey: 'o' }
]

export const useKeymapStore = defineStore('keymap', () => {
  const bindings = ref<KeyBinding[]>(JSON.parse(JSON.stringify(DEFAULT_KEYBINDINGS)))
  const recordingBindingId = ref<string | null>(null)

  function initKeymaps() {
    const have = new Set(bindings.value.map(b => b.id))
    for (const def of DEFAULT_KEYBINDINGS) {
      if (!have.has(def.id)) bindings.value.push({ ...def })
    }
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

  function parseChord(chord: string): { ctrl: boolean; alt: boolean; shift: boolean; key: string; code: string } {
    const parts = chord.split('+').map(p => p.trim()).filter(Boolean)
    let ctrl = false
    let alt = false
    let shift = false
    let key = ''
    let code = ''
    for (const p of parts) {
      const l = p.toLowerCase()
      if (l === 'ctrl' || l === 'control' || l === 'cmd' || l === 'meta') ctrl = true
      else if (l === 'alt') alt = true
      else if (l === 'shift') shift = true
      else if (l.startsWith('numpad')) code = p
      else if (l.startsWith('arrow')) key = l
      else key = l
    }
    return { ctrl, alt, shift, key, code }
  }

  function eventKeyToken(e: KeyboardEvent): string {
    const code = e.code
    if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase()
    if (/^Digit[0-9]$/.test(code)) return code.slice(5)
    const fromCode: Record<string, string> = {
      Space: 'space',
      Tab: 'tab',
      Enter: 'enter',
      Escape: 'escape',
      Backspace: 'backspace',
      Delete: 'delete',
      Comma: ',',
      Period: '.',
      Slash: '/',
      Minus: '-',
      Equal: '=',
      ArrowLeft: 'arrowleft',
      ArrowRight: 'arrowright',
      ArrowUp: 'arrowup',
      ArrowDown: 'arrowdown',
      F1: 'f1', F2: 'f2', F3: 'f3', F4: 'f4', F5: 'f5', F6: 'f6',
      F7: 'f7', F8: 'f8', F9: 'f9', F10: 'f10', F11: 'f11', F12: 'f12'
    }
    if (fromCode[code]) return fromCode[code]
    let key = e.key
    if (key === ' ') key = 'space'
    return key.toLowerCase()
  }

  function eventMatchesBinding(e: KeyboardEvent, chord: string): boolean {
    if (!chord) return false
    
    // Support composite bindings like "Delete / X" or "Tab / 4"
    if (chord.includes('/')) {
      return chord.split('/').some(c => eventMatchesBinding(e, c.trim()))
    }

    const want = parseChord(chord)
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return false
    const ctrl = e.ctrlKey || e.metaKey
    const alt = e.altKey
    const shift = e.shiftKey
    if (want.ctrl !== ctrl || want.alt !== alt || want.shift !== shift) return false
    if (want.code) return e.code.toLowerCase() === want.code.toLowerCase()

    // Digit-row "1" must not steal Numpad1 (camera views)
    if (e.code.startsWith('Numpad')) return false

    const key = eventKeyToken(e)

    if (want.key === 'delete' || want.key === 'backspace') {
      return key === 'delete' || key === 'backspace'
    }

    return want.key === key
  }

  function eventMatches(actionId: string, e: KeyboardEvent): boolean {
    return eventMatchesBinding(e, getKeyFor(actionId))
  }

  function matchingActionIds(e: KeyboardEvent): string[] {
    const list = bindings.value.filter(b => eventMatchesBinding(e, b.currentKey)).map(b => b.id)
    // Fallback: Delete and Backspace always delete elements if no other key overrides
    if ((e.key === 'Delete' || e.key === 'Backspace') && !e.ctrlKey && !e.altKey && !e.metaKey && !list.includes('delete_element')) {
      list.push('delete_element')
    }
    if ((e.key === 'y' || e.key === 'Y') && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && !list.includes('redo')) {
      list.push('redo')
    }
    return list
  }

  return {
    bindings,
    recordingBindingId,
    initKeymaps,
    rebind,
    resetToDefault,
    resetAllDefaults,
    getKeyFor,
    eventMatches,
    matchingActionIds
  }
})
