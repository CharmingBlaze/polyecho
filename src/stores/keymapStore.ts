import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export interface KeyBinding {
  id: string
  label: string
  category: 'Modeling' | 'Selection' | 'Viewport' | 'Transform' | 'UV & Painting' | 'Animation' | 'System'
  defaultKey: string
  currentKey: string
  description?: string
}

export interface MouseInputSettings {
  navScheme: 'blender' | 'maya' | 'unreal' | 'industry' | 'custom'
  orbitButton: 'middle' | 'right' | 'alt_left' | 'left'
  panButton: 'shift_middle' | 'right' | 'middle' | 'alt_middle'
  zoomInput: 'wheel' | 'ctrl_middle' | 'alt_right' | 'right_drag'
  specialsTrigger: 'right' | 'middle' | 'w_key' | 'space'
  emulate3ButtonMouse: boolean
  invertWheelZoom: boolean
  orbitStyle: 'turntable' | 'trackball'
  mouseSensitivity: number
}

export interface InputPreset {
  id: string
  name: string
  isBuiltIn: boolean
  description: string
  keymaps: Record<string, string>
  mouse: MouseInputSettings
}

export const DEFAULT_MOUSE_SETTINGS: MouseInputSettings = {
  navScheme: 'blender',
  orbitButton: 'middle',
  panButton: 'shift_middle',
  zoomInput: 'wheel',
  specialsTrigger: 'right',
  emulate3ButtonMouse: false,
  invertWheelZoom: false,
  orbitStyle: 'turntable',
  mouseSensitivity: 1.0
}

export const BUILTIN_INPUT_PRESETS: InputPreset[] = [
  {
    id: 'blender_default',
    name: 'Blender Standard (Default)',
    isBuiltIn: true,
    description: 'Blender modal CAD hotkeys (G/R/S, E, I, Ctrl+B, K) with middle-click orbit and right-click context specials.',
    keymaps: {},
    mouse: { ...DEFAULT_MOUSE_SETTINGS }
  },
  {
    id: 'maya_industry',
    name: 'Maya / Industry Standard',
    isBuiltIn: true,
    description: 'W/E/R for Translate, Rotate, Scale. Q for Select. Alt+LMB to orbit, Alt+MMB to pan, Alt+RMB to zoom.',
    keymaps: {
      grab: 'w',
      rotate: 'e',
      scale: 'r',
      mode_object: 'q',
      duplicate: 'Ctrl+d',
      delete_element: 'Delete / Backspace',
      select_all: 'Ctrl+a',
      deselect_all: 'Ctrl+Shift+a'
    },
    mouse: {
      navScheme: 'maya',
      orbitButton: 'alt_left',
      panButton: 'alt_middle',
      zoomInput: 'alt_right',
      specialsTrigger: 'right',
      emulate3ButtonMouse: true,
      invertWheelZoom: false,
      orbitStyle: 'turntable',
      mouseSensitivity: 1.0
    }
  },
  {
    id: 'unreal_engine',
    name: 'Unreal Engine',
    isBuiltIn: true,
    description: 'W/E/R navigation gizmos with right-click mouse look/orbit and middle-click pan.',
    keymaps: {
      grab: 'w',
      rotate: 'e',
      scale: 'r',
      mode_object: 'q',
      duplicate: 'Ctrl+d'
    },
    mouse: {
      navScheme: 'unreal',
      orbitButton: 'right',
      panButton: 'middle',
      zoomInput: 'wheel',
      specialsTrigger: 'middle',
      emulate3ButtonMouse: false,
      invertWheelZoom: false,
      orbitStyle: 'turntable',
      mouseSensitivity: 1.0
    }
  },
  {
    id: 'max_3ds',
    name: '3ds Max',
    isBuiltIn: true,
    description: 'W/E/R transforms with Alt+MMB to orbit and MMB to pan.',
    keymaps: {
      grab: 'w',
      rotate: 'e',
      scale: 'r',
      mode_object: 'q'
    },
    mouse: {
      navScheme: 'industry',
      orbitButton: 'middle',
      panButton: 'middle',
      zoomInput: 'wheel',
      specialsTrigger: 'right',
      emulate3ButtonMouse: false,
      invertWheelZoom: false,
      orbitStyle: 'turntable',
      mouseSensitivity: 1.0
    }
  },
  {
    id: 'lightwave',
    name: 'LightWave 3D',
    isBuiltIn: true,
    description: 'Classic LightWave modeling chords with Alt+LMB drag orbit and Alt+Shift+LMB pan.',
    keymaps: {
      grab: 't',
      rotate: 'y',
      scale: 'h'
    },
    mouse: {
      navScheme: 'custom',
      orbitButton: 'alt_left',
      panButton: 'alt_middle',
      zoomInput: 'wheel',
      specialsTrigger: 'right',
      emulate3ButtonMouse: true,
      invertWheelZoom: false,
      orbitStyle: 'turntable',
      mouseSensitivity: 1.0
    }
  }
]

export const DEFAULT_KEYBINDINGS: KeyBinding[] = [
  // MODELING
  { id: 'extrude', label: 'Extrude Region', category: 'Modeling', defaultKey: 'e', currentKey: 'e' },
  { id: 'extrude_individual', label: 'Extrude Individual', category: 'Modeling', defaultKey: 'Alt+e', currentKey: 'Alt+e' },
  { id: 'inset', label: 'Inset Faces', category: 'Modeling', defaultKey: 'i', currentKey: 'i' },
  { id: 'bevel', label: 'Bevel Edges', category: 'Modeling', defaultKey: 'Ctrl+b', currentKey: 'Ctrl+b' },
  { id: 'vertex_bevel', label: 'Vertex Bevel', category: 'Modeling', defaultKey: 'Ctrl+Shift+b', currentKey: 'Ctrl+Shift+b' },
  { id: 'loopcut', label: 'Loop Cut and Slide', category: 'Modeling', defaultKey: 'Ctrl+r', currentKey: 'Ctrl+r' },
  { id: 'offset_loop', label: 'Offset Edge Loop', category: 'Modeling', defaultKey: 'Ctrl+Shift+r', currentKey: 'Ctrl+Shift+r' },
  { id: 'edge_slide', label: 'Edge Slide', category: 'Modeling', defaultKey: 'Shift+g', currentKey: 'Shift+g' },
  { id: 'vertex_slide', label: 'Vertex Slide', category: 'Modeling', defaultKey: 'Shift+v', currentKey: 'Shift+v' },
  { id: 'knife', label: 'Knife Topology', category: 'Modeling', defaultKey: 'k', currentKey: 'k' },
  { id: 'shrink_fatten', label: 'Shrink/Fatten', category: 'Transform', defaultKey: 'Alt+s', currentKey: 'Alt+s' },
  { id: 'to_sphere', label: 'Spherize', category: 'Transform', defaultKey: 'Shift+Alt+s', currentKey: 'Shift+Alt+s', description: 'Drag vertices toward a sphere. The Mesh Tools Sphere field applies a fixed amount.' },
  { id: 'flip_edge', label: 'Rotate Edge', category: 'Modeling', defaultKey: 'Ctrl+Shift+f', currentKey: 'Ctrl+Shift+f' },
  { id: 'recalculate_outside', label: 'Recalculate Outside', category: 'Modeling', defaultKey: 'Ctrl+Shift+n', currentKey: 'Ctrl+Shift+n' },
  { id: 'tris_to_quads', label: 'Tris to Quads', category: 'Modeling', defaultKey: 'Alt+j', currentKey: 'Alt+j' },
  { id: 'fill_holes', label: 'Fill Holes', category: 'Modeling', defaultKey: 'Alt+f', currentKey: 'Alt+f' },
  { id: 'rip', label: 'Rip', category: 'Modeling', defaultKey: 'Ctrl+Shift+v', currentKey: 'Ctrl+Shift+v', description: 'Model workspace. Animate: Paste Mirrored Pose uses the same chord.' },
  { id: 'rip_fill', label: 'Rip Fill', category: 'Modeling', defaultKey: 'Alt+v', currentKey: 'Alt+v' },
  { id: 'split_faces', label: 'Detach Faces', category: 'Modeling', defaultKey: 'y', currentKey: 'y', description: 'Disconnect selected faces without creating a new object.' },
  { id: 'polydraw', label: 'Poly Draw (Blockout F)', category: 'Modeling', defaultKey: 'f', currentKey: 'f', description: 'Blockout workspace only. Model F is Fill.' },
  { id: 'polybuild', label: 'Poly Build (Blockout V)', category: 'Modeling', defaultKey: 'v', currentKey: 'v', description: 'Click empty space for a new vert, click an old vert to reuse it, close the loop to fill.' },
  { id: 'subdivide', label: 'Subdivide', category: 'Modeling', defaultKey: 'w', currentKey: 'w', description: 'Object mode: whole mesh. Edit mode: selected faces/edges. Number of Cuts lives in the Tools panel.' },
  { id: 'poke_faces', label: 'Poke Faces', category: 'Modeling', defaultKey: 'Alt+p', currentKey: 'Alt+p' },
  { id: 'triangulate', label: 'Triangulate Faces', category: 'Modeling', defaultKey: 'Ctrl+t', currentKey: 'Ctrl+t' },
  { id: 'dissolve', label: 'Dissolve Selection', category: 'Modeling', defaultKey: 'Ctrl+x', currentKey: 'Ctrl+x' },
  { id: 'fill_face', label: 'Fill Face from Boundary (Model F)', category: 'Modeling', defaultKey: 'f', currentKey: 'f', description: 'Model workspace. Blockout F is Poly Draw.' },
  { id: 'connect_verts', label: 'Connect Vertex Path', category: 'Modeling', defaultKey: 'j', currentKey: 'j' },
  { id: 'merge_verts', label: 'Merge Vertices (Center)', category: 'Modeling', defaultKey: 'm', currentKey: 'm' },
  { id: 'flip_normals', label: 'Flip Normals', category: 'Modeling', defaultKey: 'Shift+n', currentKey: 'Shift+n' },
  { id: 'delete_element', label: 'Delete Selected', category: 'Modeling', defaultKey: 'Delete / X', currentKey: 'Delete / X' },
  { id: 'separate_mesh', label: 'Separate Selection', category: 'Modeling', defaultKey: 'p', currentKey: 'p' },
  { id: 'join_meshes', label: 'Join Meshes', category: 'Modeling', defaultKey: 'Ctrl+j', currentKey: 'Ctrl+j' },
  { id: 'duplicate', label: 'Duplicate Selection', category: 'Modeling', defaultKey: 'Shift+d', currentKey: 'Shift+d', description: 'Animate: duplicate keys on the current frame to the next frame. Elsewhere: duplicate the mesh selection.' },
  { id: 'copy_selection', label: 'Copy Selection / Pose', category: 'System', defaultKey: 'Ctrl+c', currentKey: 'Ctrl+c', description: 'Model: copy mesh selection. Animate: copy pose. Disabled on the Paint tab.' },
  { id: 'paste_clipboard', label: 'Paste Selection / Pose', category: 'System', defaultKey: 'Ctrl+v', currentKey: 'Ctrl+v', description: 'Model: paste clipboard. Animate: paste pose. Disabled on the Paint tab.' },
  { id: 'paste_flipped_pose', label: 'Paste Mirrored Pose', category: 'Animation', defaultKey: 'Ctrl+Shift+v', currentKey: 'Ctrl+Shift+v' },
  { id: 'add_primitive', label: 'Add Primitive Placement', category: 'Modeling', defaultKey: 'Shift+a', currentKey: 'Shift+a' },

  // TRANSFORM
  { id: 'grab', label: 'Move / Translate', category: 'Transform', defaultKey: 'g', currentKey: 'g' },
  { id: 'rotate', label: 'Rotate Tool', category: 'Transform', defaultKey: 'r', currentKey: 'r' },
  { id: 'scale', label: 'Scale Tool', category: 'Transform', defaultKey: 's', currentKey: 's' },
  { id: 'toggle_snap', label: 'Toggle Snapping', category: 'Transform', defaultKey: 'Shift+Tab', currentKey: 'Shift+Tab' },

  // SELECTION
  { id: 'select_all', label: 'Select All', category: 'Selection', defaultKey: 'Ctrl+a / a', currentKey: 'Ctrl+a / a' },
  { id: 'deselect_all', label: 'Deselect All', category: 'Selection', defaultKey: 'Alt+a', currentKey: 'Alt+a' },
  { id: 'box_select', label: 'Box Select (Marquee)', category: 'Selection', defaultKey: 'b', currentKey: 'b' },
  { id: 'select_invert', label: 'Invert Selection', category: 'Selection', defaultKey: 'Ctrl+i', currentKey: 'Ctrl+i' },
  { id: 'select_more', label: 'Select More', category: 'Selection', defaultKey: 'Ctrl+NumpadAdd / Ctrl+=', currentKey: 'Ctrl+NumpadAdd / Ctrl+=' },
  { id: 'select_less', label: 'Select Less', category: 'Selection', defaultKey: 'Ctrl+NumpadSubtract / Ctrl+-', currentKey: 'Ctrl+NumpadSubtract / Ctrl+-' },
  { id: 'select_linked', label: 'Select Linked', category: 'Selection', defaultKey: 'Ctrl+l', currentKey: 'Ctrl+l', description: 'Everything connected to the selection. Faces connect through shared edges.' },
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
  { id: 'open_help', label: 'Documentation & User Manual', category: 'System', defaultKey: 'F1', currentKey: 'F1' },
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
  { id: 'smart_uv_project', label: 'Smart UV Project', category: 'UV & Painting', defaultKey: 'u', currentKey: 'u', description: 'UV tab only. Automatically cuts, projects, and packs the current selection or whole mesh.' },
  { id: 'mark_seam', label: 'Mark Seam', category: 'UV & Painting', defaultKey: 'Ctrl+Shift+e', currentKey: 'Ctrl+Shift+e', description: 'Mark selected edges as seams, or the border of selected faces / UV islands.' },
  { id: 'clear_seam', label: 'Clear Seam', category: 'UV & Painting', defaultKey: 'Ctrl+Alt+e', currentKey: 'Ctrl+Alt+e', description: 'Clear seams on selected edges, or on the border of selected faces / UV islands.' },
  { id: 'paint_brush', label: 'Paint Brush', category: 'UV & Painting', defaultKey: 'b', currentKey: 'b' },
  { id: 'paint_eraser', label: 'Paint Eraser', category: 'UV & Painting', defaultKey: 'e', currentKey: 'e' },
  { id: 'paint_bucket', label: 'Paint Bucket', category: 'UV & Painting', defaultKey: 'g', currentKey: 'g' },
  { id: 'paint_picker', label: 'Eyedropper', category: 'UV & Painting', defaultKey: 'i', currentKey: 'i' },
  { id: 'paint_line', label: 'Line Tool', category: 'UV & Painting', defaultKey: 'l', currentKey: 'l' },
  { id: 'paint_rect', label: 'Rectangle Tool', category: 'UV & Painting', defaultKey: 'u', currentKey: 'u' },
  { id: 'paint_circle', label: 'Circle Tool', category: 'UV & Painting', defaultKey: 'c', currentKey: 'c' },
  { id: 'paint_dither', label: 'Dither Brush', category: 'UV & Painting', defaultKey: 'd', currentKey: 'd' },
  { id: 'paint_shade', label: 'Shading Brush (UV/Paint)', category: 'UV & Painting', defaultKey: 'h', currentKey: 'h' },
  { id: 'paint_wand', label: 'Select by Color', category: 'UV & Painting', defaultKey: 'q', currentKey: 'q' },
  { id: 'paint_uv_overlay', label: 'Toggle UV Overlay (Paint)', category: 'UV & Painting', defaultKey: 'o', currentKey: 'o' },
  { id: 'paint_swap_colors', label: 'Swap Paint Colors', category: 'UV & Painting', defaultKey: 'x', currentKey: 'x' }
]

export const useKeymapStore = defineStore('keymap', () => {
  const bindings = ref<KeyBinding[]>(JSON.parse(JSON.stringify(DEFAULT_KEYBINDINGS)))
  const recordingBindingId = ref<string | null>(null)
  const activePresetId = ref<string>('blender_default')
  const mouse = ref<MouseInputSettings>({ ...DEFAULT_MOUSE_SETTINGS })
  const customPresets = ref<InputPreset[]>([])

  const allPresets = computed<InputPreset[]>(() => {
    return [...BUILTIN_INPUT_PRESETS, ...customPresets.value]
  })

  const activePreset = computed<InputPreset>(() => {
    return allPresets.value.find(p => p.id === activePresetId.value) || BUILTIN_INPUT_PRESETS[0]
  })

  function initKeymaps() {
    const have = new Set(bindings.value.map(b => b.id))
    for (const def of DEFAULT_KEYBINDINGS) {
      if (!have.has(def.id)) bindings.value.push({ ...def })
    }
    try {
      const savedCustom = localStorage.getItem('polyecho_input_presets')
      if (savedCustom) {
        customPresets.value = JSON.parse(savedCustom)
      }
    } catch {}

    try {
      const savedMouse = localStorage.getItem('polyecho_mouse_settings')
      if (savedMouse) {
        mouse.value = { ...DEFAULT_MOUSE_SETTINGS, ...JSON.parse(savedMouse) }
      }
    } catch {}

    try {
      const savedPresetId = localStorage.getItem('polyecho_active_preset_id')
      if (savedPresetId) {
        activePresetId.value = savedPresetId
      }
    } catch {}

    try {
      const saved = localStorage.getItem('polyecho_keymaps')
      if (saved) {
        const parsed = JSON.parse(saved)
        bindings.value.forEach(b => {
          if (parsed[b.id]) {
            b.currentKey = parsed[b.id]
          }
        })
        const selectAll = bindings.value.find(b => b.id === 'select_all')
        if (selectAll && selectAll.currentKey.toLowerCase() === 'a') {
          selectAll.currentKey = selectAll.defaultKey
          saveKeymaps()
        }
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
    if ((e.key === 'a' || e.key === 'A') && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && !list.includes('select_all')) {
      list.push('select_all')
    }
    return list
  }

  function loadPreset(presetId: string): boolean {
    const preset = allPresets.value.find(p => p.id === presetId)
    if (!preset) return false
    activePresetId.value = preset.id

    // Apply keymaps
    bindings.value.forEach(b => {
      if (preset.keymaps && preset.keymaps[b.id] !== undefined) {
        b.currentKey = preset.keymaps[b.id]
      } else {
        b.currentKey = b.defaultKey
      }
    })

    // Apply mouse settings
    if (preset.mouse) {
      mouse.value = { ...DEFAULT_MOUSE_SETTINGS, ...preset.mouse }
    }

    saveKeymaps()
    saveMouseSettings()
    saveActivePresetId()
    return true
  }

  function saveCustomPreset(name: string, description?: string): InputPreset {
    const cleanName = name.trim() || 'Custom Preset'
    const id = 'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
    const keymaps: Record<string, string> = {}
    bindings.value.forEach(b => {
      keymaps[b.id] = b.currentKey
    })

    const newPreset: InputPreset = {
      id,
      name: cleanName,
      isBuiltIn: false,
      description: description?.trim() || 'Custom user shortcut and mouse configuration',
      keymaps,
      mouse: { ...mouse.value }
    }

    customPresets.value.push(newPreset)
    activePresetId.value = id
    saveCustomPresets()
    saveActivePresetId()
    return newPreset
  }

  function deleteCustomPreset(presetId: string): boolean {
    const idx = customPresets.value.findIndex(p => p.id === presetId)
    if (idx === -1) return false
    customPresets.value.splice(idx, 1)
    saveCustomPresets()
    if (activePresetId.value === presetId) {
      loadPreset('blender_default')
    }
    return true
  }

  function exportPresetJson(presetId?: string): string {
    const target = allPresets.value.find(p => p.id === (presetId || activePresetId.value)) || activePreset.value
    const exportData = {
      format: 'polyecho_input_preset',
      version: 1,
      preset: {
        id: target.id,
        name: target.name,
        description: target.description,
        keymaps: target.isBuiltIn && Object.keys(target.keymaps).length === 0
          ? bindings.value.reduce<Record<string, string>>((acc, b) => { acc[b.id] = b.currentKey; return acc }, {})
          : target.keymaps,
        mouse: target.mouse
      }
    }
    return JSON.stringify(exportData, null, 2)
  }

  function importPresetJson(jsonText: string): { success: boolean; error?: string; preset?: InputPreset } {
    try {
      const data = JSON.parse(jsonText)
      const p = data.preset || data
      if (!p || !p.name) {
        return { success: false, error: 'Invalid preset file: missing preset data' }
      }
      const id = 'imported_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
      const imported: InputPreset = {
        id,
        name: p.name + ' (Imported)',
        isBuiltIn: false,
        description: p.description || 'Imported custom preset',
        keymaps: p.keymaps || {},
        mouse: { ...DEFAULT_MOUSE_SETTINGS, ...(p.mouse || {}) }
      }
      customPresets.value.push(imported)
      saveCustomPresets()
      loadPreset(id)
      return { success: true, preset: imported }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to parse JSON preset' }
    }
  }

  function updateMouseSetting<K extends keyof MouseInputSettings>(key: K, val: MouseInputSettings[K]) {
    mouse.value[key] = val
    saveMouseSettings()
  }

  function applyMousePresetScheme(scheme: MouseInputSettings['navScheme']) {
    mouse.value.navScheme = scheme
    if (scheme === 'blender') {
      mouse.value.orbitButton = 'middle'
      mouse.value.panButton = 'shift_middle'
      mouse.value.zoomInput = 'wheel'
      mouse.value.specialsTrigger = 'right'
      mouse.value.emulate3ButtonMouse = false
    } else if (scheme === 'maya') {
      mouse.value.orbitButton = 'alt_left'
      mouse.value.panButton = 'alt_middle'
      mouse.value.zoomInput = 'alt_right'
      mouse.value.specialsTrigger = 'right'
      mouse.value.emulate3ButtonMouse = true
    } else if (scheme === 'unreal') {
      mouse.value.orbitButton = 'right'
      mouse.value.panButton = 'middle'
      mouse.value.zoomInput = 'wheel'
      mouse.value.specialsTrigger = 'middle'
      mouse.value.emulate3ButtonMouse = false
    } else if (scheme === 'industry') {
      mouse.value.orbitButton = 'alt_left'
      mouse.value.panButton = 'alt_middle'
      mouse.value.zoomInput = 'wheel'
      mouse.value.specialsTrigger = 'right'
      mouse.value.emulate3ButtonMouse = true
    }
    saveMouseSettings()
  }

  function saveMouseSettings() {
    try {
      localStorage.setItem('polyecho_mouse_settings', JSON.stringify(mouse.value))
    } catch {}
  }

  function saveCustomPresets() {
    try {
      localStorage.setItem('polyecho_input_presets', JSON.stringify(customPresets.value))
    } catch {}
  }

  function saveActivePresetId() {
    try {
      localStorage.setItem('polyecho_active_preset_id', activePresetId.value)
    } catch {}
  }

  return {
    bindings,
    recordingBindingId,
    activePresetId,
    activePreset,
    mouse,
    customPresets,
    allPresets,
    initKeymaps,
    rebind,
    resetToDefault,
    resetAllDefaults,
    loadPreset,
    saveCustomPreset,
    deleteCustomPreset,
    exportPresetJson,
    importPresetJson,
    updateMouseSetting,
    applyMousePresetScheme,
    getKeyFor,
    eventMatches,
    matchingActionIds
  }
})
