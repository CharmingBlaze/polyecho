<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { X, Search, BookOpen, Layers, Box, Paintbrush, Bone, Film, Monitor, Sliders, Palette, Share2, Keyboard, HelpCircle, ChevronRight } from 'lucide-vue-next'

const props = defineProps<{
  initialTopic?: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const activeTopicId = ref(props.initialTopic || 'overview')
const searchQuery = ref('')
const searchInput = ref<HTMLInputElement | null>(null)

watch(() => props.initialTopic, (val) => {
  if (val) activeTopicId.value = val
})

interface HelpTopic {
  id: string
  title: string
  category: 'Getting Started' | 'Workspaces' | 'Systems & Shading' | 'Reference'
  icon: any
  summary: string
  keywords: string[]
}

const topics: HelpTopic[] = [
  {
    id: 'overview',
    title: 'Overview & Interface',
    category: 'Getting Started',
    icon: BookOpen,
    summary: 'Layout structure, main toolbar, viewport, inspector, and outliner.',
    keywords: ['interface', 'layout', 'header', 'toolbar', 'inspector', 'outliner', 'status bar', 'palette']
  },
  {
    id: 'navigation',
    title: 'Navigation & Camera',
    category: 'Getting Started',
    icon: Monitor,
    summary: 'Orbit, pan, zoom, orthographic views, quad view, transform spaces, and pivot points.',
    keywords: ['orbit', 'pan', 'zoom', 'camera', 'orthographic', 'perspective', 'quad view', 'pivot', 'transform space']
  },
  {
    id: 'blockout',
    title: 'Blockout Workspace',
    category: 'Workspaces',
    icon: Box,
    summary: 'Rapid shape drafting, reference image planes, Poly Draw, and Shape Draw volume conversion.',
    keywords: ['blockout', 'reference', 'images', 'poly draw', 'shape draw', 'sketch', 'volume', 'tracing']
  },
  {
    id: 'modeling',
    title: 'Modeling & Topology',
    category: 'Workspaces',
    icon: Layers,
    summary: 'Selection modes (1-5), modal tools (G, R, S, E, I, Bevel, Knife, Loop Cut), and mesh operations.',
    keywords: ['model', 'extrude', 'inset', 'bevel', 'loop cut', 'knife', 'subdivide', 'merge', 'bridge', 'fill', 'normals', 'boolean', 'topology']
  },
  {
    id: 'uv',
    title: 'UV Mapping & Unwrapping',
    category: 'Workspaces',
    icon: Sliders,
    summary: 'Smart UV projection, seam marking, island packing, pinning, stitching, and UV transforms.',
    keywords: ['uv', 'unwrap', 'seams', 'island', 'smart uv', 'conformal', 'pack', 'pin', 'stitch']
  },
  {
    id: 'paint',
    title: 'Pixel Texture Painting',
    category: 'Workspaces',
    icon: Paintbrush,
    summary: '2D pixel editor, layers, color palettes, dithering brushes, and direct 3D surface painting.',
    keywords: ['paint', 'pixel', 'texture', 'brush', 'eraser', 'bucket', 'dither', 'layers', 'color', 'palette', 'eyedropper']
  },
  {
    id: 'tileset',
    title: 'Tileset Atlas & Stamping',
    category: 'Workspaces',
    icon: Palette,
    summary: 'Grid atlas definition, cell selection, face stamping, and UV tile alignment.',
    keywords: ['tileset', 'atlas', 'stamp', 'grid', 'cells', 'subdivide', 'trim sheet']
  },
  {
    id: 'rigging',
    title: 'Rigging & Armatures',
    category: 'Workspaces',
    icon: Bone,
    summary: 'Bone creation, joint hierarchy, rigid part parenting, 4-weight smooth skinning, and weight painting.',
    keywords: ['rig', 'bone', 'armature', 'skeleton', 'skinning', 'weights', 'joints', 'parenting', 'rigid']
  },
  {
    id: 'humanoid',
    title: 'Humanoid Auto-Rig',
    category: 'Workspaces',
    icon: Bone,
    summary: 'Anatomical landmark placement, automated 15-bone or 19-bone generation, and test posing.',
    keywords: ['humanoid', 'auto rig', 'wizard', 'landmarks', 'chin', 'shoulders', 'pelvis', 'knees', 'ankles']
  },
  {
    id: 'animation',
    title: 'Animation & Keyframing',
    category: 'Workspaces',
    icon: Film,
    summary: 'Multi-action clip management, dope sheet timeline, auto-keying, pose mirroring, and event markers.',
    keywords: ['animation', 'keyframes', 'timeline', 'dope sheet', 'clips', 'actions', 'interpolation', 'pose', 'mirror', 'markers']
  },
  {
    id: 'shading',
    title: 'Retro Shading & CRT Filters',
    category: 'Systems & Shading',
    icon: Monitor,
    summary: 'Textured, Solid, Wireframe, Dreamcast lighting, affine jitter emulation, and CRT retro scanlines.',
    keywords: ['shading', 'psx', 'crt', 'scanlines', 'dreamcast', 'wireframe', 'affine', 'lighting', 'retro', 'xray']
  },
  {
    id: 'modifiers',
    title: 'Modifiers System',
    category: 'Systems & Shading',
    icon: Sliders,
    summary: 'Non-destructive Mirror, Subdivision Surface, and Solidify modifier workflows.',
    keywords: ['modifiers', 'mirror', 'subdivision', 'solidify', 'stack', 'non-destructive']
  },
  {
    id: 'export',
    title: 'Game Engine Export',
    category: 'Systems & Shading',
    icon: Share2,
    summary: 'Exporting GLB/GLTF, Wavefront OBJ, and Blockbench files for Godot, Unity, Unreal, and Blender.',
    keywords: ['export', 'import', 'glb', 'gltf', 'obj', 'blockbench', 'godot', 'unity', 'unreal', 'blender']
  },
  {
    id: 'shortcuts',
    title: 'Keyboard Shortcuts Reference',
    category: 'Reference',
    icon: Keyboard,
    summary: 'Fast reference table of common keyboard commands and modal shortcuts.',
    keywords: ['shortcuts', 'hotkeys', 'keymap', 'keys', 'bindings', 'commands']
  },
  {
    id: 'faq',
    title: 'FAQ & Troubleshooting',
    category: 'Reference',
    icon: HelpCircle,
    summary: 'Common questions, export tips, geometry cleanup, and performance optimization.',
    keywords: ['faq', 'troubleshooting', 'help', 'issues', 'black faces', 't-junctions', 'normals', 'performance']
  }
]

const categories = ['Getting Started', 'Workspaces', 'Systems & Shading', 'Reference'] as const

const filteredTopics = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return topics
  return topics.filter(t =>
    t.title.toLowerCase().includes(q) ||
    t.summary.toLowerCase().includes(q) ||
    t.keywords.some(k => k.toLowerCase().includes(q))
  )
})

function selectTopic(id: string) {
  activeTopicId.value = id
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close')
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center z-50 select-none p-4">
    <div class="bg-ui-panel border border-ui-borderStrong rounded-sm w-[940px] max-w-[96vw] h-[680px] max-h-[92vh] shadow-2xl flex flex-col overflow-hidden text-ui-textPrimary font-sans">
      
      <!-- Header -->
      <div class="h-11 bg-ui-header border-b border-ui-borderSubtle px-4 flex items-center justify-between shrink-0">
        <div class="flex items-center gap-2">
          <BookOpen class="w-4 h-4 text-ui-textAccent" />
          <span class="font-bold text-xs tracking-wide">PolyEcho Documentation & Help</span>
          <span class="text-[10px] text-ui-textMuted border border-ui-borderSubtle px-1.5 py-0.5 rounded-xs font-mono">v1.1</span>
        </div>

        <!-- Search Bar -->
        <div class="relative w-64 max-w-[40%]">
          <Search class="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ui-textMuted" />
          <input
            ref="searchInput"
            v-model="searchQuery"
            type="text"
            placeholder="Search topics, tools, shortcuts..."
            class="w-full bg-ui-input border border-ui-borderSubtle rounded-xs pl-8 pr-2.5 py-1 text-xs text-ui-textPrimary placeholder-ui-textMuted focus:outline-none focus:border-ui-accent"
          />
        </div>

        <button
          @click="$emit('close')"
          class="p-1 rounded-xs text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover transition cursor-pointer"
          title="Close Help (Esc)"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Main Body -->
      <div class="flex-1 min-h-0 flex">
        
        <!-- Left Topic Index -->
        <div class="w-64 border-r border-ui-borderSubtle bg-ui-header/50 flex flex-col shrink-0 overflow-y-auto p-2 space-y-3">
          <div v-for="cat in categories" :key="cat" class="space-y-0.5">
            <div class="px-2 py-1 text-[9.5px] font-bold uppercase tracking-wider text-ui-textMuted">
              {{ cat }}
            </div>
            <button
              v-for="t in filteredTopics.filter(item => item.category === cat)"
              :key="t.id"
              @click="selectTopic(t.id)"
              class="w-full text-left px-2 py-1.5 rounded-xs text-xs flex items-center justify-between transition cursor-pointer"
              :class="activeTopicId === t.id
                ? 'bg-ui-active text-ui-textPrimary font-semibold border-l-2 border-ui-accent shadow-xs'
                : 'text-ui-textSecondary hover:bg-ui-hover hover:text-ui-textPrimary'"
            >
              <div class="flex items-center gap-2 truncate">
                <component :is="t.icon" class="w-3.5 h-3.5 shrink-0" :class="activeTopicId === t.id ? 'text-ui-textAccent' : 'text-ui-textMuted'" />
                <span class="truncate">{{ t.title }}</span>
              </div>
              <ChevronRight v-if="activeTopicId === t.id" class="w-3 h-3 text-ui-textAccent shrink-0" />
            </button>
          </div>

          <div v-if="filteredTopics.length === 0" class="p-4 text-center text-xs text-ui-textMuted">
            No help topics match your query.
          </div>
        </div>

        <!-- Right Content Pane -->
        <div class="flex-1 min-h-0 overflow-y-auto p-6 text-xs leading-relaxed text-ui-textSecondary space-y-6">
          
          <!-- Topic: Overview & Interface -->
          <div v-if="activeTopicId === 'overview'" class="space-y-4">
            <div>
              <h2 class="text-base font-bold text-ui-textPrimary mb-1">Overview & Interface Tour</h2>
              <p class="text-ui-textSecondary">
                PolyEcho is a focused 3D low-poly creation suite tailored for retro games, indie titles, and asset prototyping. The interface is organized into five main workspaces across a unified viewport.
              </p>
            </div>

            <div class="border border-ui-borderSubtle rounded-xs p-3 bg-ui-input/40 space-y-2">
              <h3 class="font-bold text-ui-textPrimary text-xs uppercase tracking-wider">The 5 Screen Regions</h3>
              <ul class="space-y-1.5 list-disc list-inside">
                <li><strong class="text-ui-textPrimary">Top Master Header:</strong> Application menus (File, Edit, Mesh, Help), transform space mode, pivot center, grid snapping, symmetry toggles, workspace switcher, and viewport shading options.</li>
                <li><strong class="text-ui-textPrimary">Left Toolbar:</strong> Primary interactive tools for the current workspace (Select, Move, Rotate, Scale, Draw, Extrude, Inset, Knife, Bones).</li>
                <li><strong class="text-ui-textPrimary">Central 3D Viewport:</strong> Real-time WebGL rendering canvas with support for orthographic grids, retro scanline filters, X-ray mode, and direct manipulation gizmos.</li>
                <li><strong class="text-ui-textPrimary">Right Sidebar & Inspector:</strong> Outliner hierarchy tree, Object Transform values, Mesh Tools, Modifiers stack, Material slots, and Texture buffer manager.</li>
                <li><strong class="text-ui-textPrimary">Bottom Status Bar:</strong> Active selection statistics (vertices, edges, faces, triangles count), active tool prompt, coordinate feedback, and modal tips.</li>
              </ul>
            </div>

            <div class="border border-ui-borderSubtle rounded-xs p-3 bg-ui-input/40 space-y-2">
              <h3 class="font-bold text-ui-textPrimary text-xs uppercase tracking-wider">Quick Command Palette</h3>
              <p>
                Press <kbd class="px-1.5 py-0.5 rounded bg-ui-active text-ui-textPrimary border border-ui-borderDefault font-mono text-[10px]">F3</kbd> or click the search icon on the top right at any time to open the Command Palette. You can type the name of any tool, mesh operation, or view setting to run it immediately.
              </p>
            </div>
          </div>

          <!-- Topic: Navigation & Camera -->
          <div v-if="activeTopicId === 'navigation'" class="space-y-4">
            <div>
              <h2 class="text-base font-bold text-ui-textPrimary mb-1">Navigation & Camera Controls</h2>
              <p>Viewport navigation matches industry CAD and DCC standards for immediate muscle memory.</p>
            </div>

            <div class="border border-ui-borderSubtle rounded-xs overflow-hidden">
              <table class="w-full text-left text-xs">
                <thead class="bg-ui-header border-b border-ui-borderSubtle text-[10px] uppercase font-bold text-ui-textMuted">
                  <tr>
                    <th class="py-2 px-3">Action</th>
                    <th class="py-2 px-3">Input Chord</th>
                    <th class="py-2 px-3">Description</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-ui-borderSubtle">
                  <tr>
                    <td class="py-2 px-3 font-semibold text-ui-textPrimary">Orbit View</td>
                    <td class="py-2 px-3 font-mono"><kbd class="bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">MMB Drag</kbd> or <kbd class="bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">Alt + LMB Drag</kbd></td>
                    <td class="py-2 px-3">Rotates the camera smoothly around the current pivot point.</td>
                  </tr>
                  <tr>
                    <td class="py-2 px-3 font-semibold text-ui-textPrimary">Pan View</td>
                    <td class="py-2 px-3 font-mono"><kbd class="bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">Shift + MMB Drag</kbd> or <kbd class="bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">RMB Drag</kbd></td>
                    <td class="py-2 px-3">Slides the camera horizontally and vertically across the screen plane.</td>
                  </tr>
                  <tr>
                    <td class="py-2 px-3 font-semibold text-ui-textPrimary">Zoom View</td>
                    <td class="py-2 px-3 font-mono"><kbd class="bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">Mouse Wheel</kbd> or <kbd class="bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">Ctrl + MMB Drag</kbd></td>
                    <td class="py-2 px-3">Dolly camera in and out toward the cursor position.</td>
                  </tr>
                  <tr>
                    <td class="py-2 px-3 font-semibold text-ui-textPrimary">Front View</td>
                    <td class="py-2 px-3 font-mono"><kbd class="bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">Numpad 1</kbd></td>
                    <td class="py-2 px-3">Snaps camera to front orthographic view along the Y/Z plane.</td>
                  </tr>
                  <tr>
                    <td class="py-2 px-3 font-semibold text-ui-textPrimary">Right View</td>
                    <td class="py-2 px-3 font-mono"><kbd class="bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">Numpad 3</kbd></td>
                    <td class="py-2 px-3">Snaps camera to right side orthographic view.</td>
                  </tr>
                  <tr>
                    <td class="py-2 px-3 font-semibold text-ui-textPrimary">Top View</td>
                    <td class="py-2 px-3 font-mono"><kbd class="bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">Numpad 7</kbd></td>
                    <td class="py-2 px-3">Snaps camera to top orthographic view looking down the Y axis.</td>
                  </tr>
                  <tr>
                    <td class="py-2 px-3 font-semibold text-ui-textPrimary">Isometric View</td>
                    <td class="py-2 px-3 font-mono"><kbd class="bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">Numpad 0</kbd></td>
                    <td class="py-2 px-3">Toggles true isometric angle view for tactical/retro game layout.</td>
                  </tr>
                  <tr>
                    <td class="py-2 px-3 font-semibold text-ui-textPrimary">Quad View</td>
                    <td class="py-2 px-3 font-mono"><kbd class="bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">Ctrl + Alt + Q</kbd></td>
                    <td class="py-2 px-3">Splits viewport into Top, Front, Right orthographic, and 3D Perspective cameras.</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="border border-ui-borderSubtle rounded-xs p-3 bg-ui-input/40 space-y-2">
              <h3 class="font-bold text-ui-textPrimary text-xs uppercase tracking-wider">Transform Space and Pivot Points</h3>
              <p>In the top header, choose between:</p>
              <ul class="list-disc list-inside space-y-1">
                <li><strong class="text-ui-textPrimary">Global:</strong> Aligns gizmo axes to world coordinates (X=East, Y=Up, Z=South).</li>
                <li><strong class="text-ui-textPrimary">Local:</strong> Aligns gizmo axes to the selected object's local rotation.</li>
                <li><strong class="text-ui-textPrimary">Normal:</strong> Aligns transform axes along the normal vector of selected faces or edges.</li>
                <li><strong class="text-ui-textPrimary">Pivot Points:</strong> Choose Median (selection centroid), Active Element (last selected element), or 3D Cursor.</li>
              </ul>
            </div>
          </div>

          <!-- Topic: Blockout Workspace -->
          <div v-if="activeTopicId === 'blockout'" class="space-y-4">
            <div>
              <h2 class="text-base font-bold text-ui-textPrimary mb-1">Blockout Workspace</h2>
              <p>
                The Blockout workspace is designed for rapid concept proportioning, silhouette sketching, and multi-view reference tracing prior to detailed polygon editing.
              </p>
            </div>

            <div class="space-y-3">
              <div class="border border-ui-borderSubtle rounded-xs p-3 bg-ui-input/40 space-y-1.5">
                <h3 class="font-bold text-ui-textPrimary text-xs">Reference Images</h3>
                <p>
                  Switch to the <strong class="text-ui-textPrimary">Refs</strong> tab in the right sidebar. Load front, side, or top concept art onto aligned image planes. You can adjust opacity, scale, and offset so your geometry lines up accurately.
                </p>
              </div>

              <div class="border border-ui-borderSubtle rounded-xs p-3 bg-ui-input/40 space-y-1.5">
                <h3 class="font-bold text-ui-textPrimary text-xs">Poly Draw (<kbd class="bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded font-mono text-[10px]">F</kbd>)</h3>
                <p>
                  Click on the grid or surface to place polygon vertices. Clicking near the starting vertex closes the loop and automatically builds a planar face. Press <kbd class="bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded font-mono text-[10px]">Enter</kbd> to confirm or <kbd class="bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded font-mono text-[10px]">Esc</kbd> to cancel.
                </p>
              </div>

              <div class="border border-ui-borderSubtle rounded-xs p-3 bg-ui-input/40 space-y-1.5">
                <h3 class="font-bold text-ui-textPrimary text-xs">Shape Draw</h3>
                <p>
                  Draft 3D volumes by drawing outlines, extrusion paths, or cross-sectional slices. The volume renders as a live procedural preview. When you are happy with the silhouette, click <strong class="text-ui-textPrimary">Make Editable Mesh</strong> to convert the shape into standard vertices, edges, and faces for the Modeling workspace.
                </p>
              </div>
            </div>
          </div>

          <!-- Topic: Modeling & Topology -->
          <div v-if="activeTopicId === 'modeling'" class="space-y-4">
            <div>
              <h2 class="text-base font-bold text-ui-textPrimary mb-1">Low-Poly Modeling & Topology</h2>
              <p>
                PolyEcho provides full box modeling, polygon manipulation, and low-poly CAD tools inspired by classic 3D suites.
              </p>
            </div>

            <div class="border border-ui-borderSubtle rounded-xs p-3 bg-ui-input/40 space-y-2">
              <h3 class="font-bold text-ui-textPrimary text-xs uppercase tracking-wider">Selection Modes</h3>
              <div class="grid grid-cols-2 gap-2 text-xs">
                <div><kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">1</kbd> <strong class="text-ui-textPrimary">Vertex Mode:</strong> Move and weld individual points.</div>
                <div><kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">2</kbd> <strong class="text-ui-textPrimary">Edge Mode:</strong> Select and split boundary edges.</div>
                <div><kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">3</kbd> <strong class="text-ui-textPrimary">Face Mode:</strong> Select polygons for extrusion and insets.</div>
                <div><kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">4</kbd> <strong class="text-ui-textPrimary">Object Mode:</strong> Transform entire mesh objects.</div>
                <div><kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">5</kbd> <strong class="text-ui-textPrimary">Origin Mode:</strong> Relocate the mesh pivot center.</div>
                <div><kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">Tab</kbd> <strong class="text-ui-textPrimary">Toggle:</strong> Fast switch between Edit and Object mode.</div>
              </div>
            </div>

            <div class="border border-ui-borderSubtle rounded-xs p-3 bg-ui-input/40 space-y-2">
              <h3 class="font-bold text-ui-textPrimary text-xs uppercase tracking-wider">Modal CAD Operators</h3>
              <ul class="space-y-1.5 list-disc list-inside">
                <li><kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">G</kbd> / <kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">R</kbd> / <kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">S</kbd> — Move, Rotate, and Scale. Press <kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">X</kbd>, <kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">Y</kbd>, or <kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">Z</kbd> during the operation to lock movement to a single axis.</li>
                <li><kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">E</kbd> — Extrude selected faces along their surface normal.</li>
                <li><kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">I</kbd> — Inset selected faces inward with uniform border thickness.</li>
                <li><kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">Ctrl + B</kbd> — Bevel edges to create chamfers or rounded corners.</li>
                <li><kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">Ctrl + R</kbd> — Loop Cut and Slide. Hover an edge ring, left click to place, slide along the edge loop, and click to commit.</li>
                <li><kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">K</kbd> — Knife Tool. Click across edges to cut custom topology cuts. Press Enter to confirm.</li>
                <li><kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">Shift + A</kbd> — Add Primitive. Place boxes, cylinders, cones, planes, or spheres directly onto the grid or active geometry surface.</li>
              </ul>
            </div>

            <div class="border border-ui-borderSubtle rounded-xs p-3 bg-ui-input/40 space-y-2">
              <h3 class="font-bold text-ui-textPrimary text-xs uppercase tracking-wider">Topology Operators</h3>
              <ul class="space-y-1 list-disc list-inside">
                <li><strong class="text-ui-textPrimary">Subdivide (<kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">W</kbd>):</strong> Splits selected geometry. In Object mode, splits the whole mesh. Adjust cuts in the Mesh Tools panel.</li>
                <li><strong class="text-ui-textPrimary">Fill Face (<kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">F</kbd>):</strong> Generates a new polygon face between selected boundary edges or vertices.</li>
                <li><strong class="text-ui-textPrimary">Connect Vertices (<kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">J</kbd>):</strong> Splits an existing face by drawing a clean edge between two selected vertices.</li>
                <li><strong class="text-ui-textPrimary">Merge Vertices (<kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">M</kbd>):</strong> Weld points at Center, First, Last, Cursor, or by distance threshold.</li>
                <li><strong class="text-ui-textPrimary">Dissolve (<kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">Ctrl + X</kbd>):</strong> Removes edges or vertices while preserving neighboring surface faces.</li>
                <li><strong class="text-ui-textPrimary">Separate (<kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">P</kbd>) & Join (<kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">Ctrl + J</kbd>):</strong> Split selected faces into a separate mesh object, or merge multiple mesh objects into one.</li>
              </ul>
            </div>
          </div>

          <!-- Topic: UV Mapping & Unwrapping -->
          <div v-if="activeTopicId === 'uv'" class="space-y-4">
            <div>
              <h2 class="text-base font-bold text-ui-textPrimary mb-1">UV Mapping & Unwrapping</h2>
              <p>
                The UV Editor runs side-by-side with the 3D viewport. UV unwrapping generates 2D coordinates so textures map properly onto low-poly meshes.
              </p>
            </div>

            <div class="border border-ui-borderSubtle rounded-xs p-3 bg-ui-input/40 space-y-2">
              <h3 class="font-bold text-ui-textPrimary text-xs uppercase tracking-wider">Unwrapping Methods</h3>
              <ul class="space-y-1.5 list-disc list-inside">
                <li><strong class="text-ui-textPrimary">Smart UV Project (<kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">U</kbd>):</strong> Automatically clusters faces by surface angle thresholds and packs them into the 0-1 UV texture square.</li>
                <li><strong class="text-ui-textPrimary">Conformal / LSCM Unwrap:</strong> Unfolds organic meshes based on seams you have marked along boundary edges.</li>
                <li><strong class="text-ui-textPrimary">Planar, Box, and Cylindrical:</strong> Fast geometric projections ideal for architectural walls, crates, pillars, and prop models.</li>
              </ul>
            </div>

            <div class="border border-ui-borderSubtle rounded-xs p-3 bg-ui-input/40 space-y-2">
              <h3 class="font-bold text-ui-textPrimary text-xs uppercase tracking-wider">UV Editor Controls</h3>
              <div class="grid grid-cols-2 gap-2 text-xs">
                <div><kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">1</kbd>–<kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">4</kbd>: Vertex, Edge, Face, or Island selection.</div>
                <div><kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">A</kbd> / <kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">Alt + A</kbd>: Select All or Deselect All UV components.</div>
                <div><kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">F</kbd>: Frame selection in the UV window.</div>
                <div><kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">P</kbd>: Pin UV vertices to prevent them from moving during unwrap.</div>
                <div><kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">V</kbd>: Stitch neighboring UV seams together.</div>
                <div><kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">Space + Drag</kbd>: Pan UV canvas. <kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">Wheel</kbd>: Zoom canvas.</div>
              </div>
            </div>
          </div>

          <!-- Topic: Pixel Texture Painting -->
          <div v-if="activeTopicId === 'paint'" class="space-y-4">
            <div>
              <h2 class="text-base font-bold text-ui-textPrimary mb-1">Pixel Texture Painting</h2>
              <p>
                PolyEcho includes an authentic retro pixel canvas with layer support, Bayer matrix dithering brushes, and direct 3D viewport surface painting.
              </p>
            </div>

            <div class="border border-ui-borderSubtle rounded-xs p-3 bg-ui-input/40 space-y-2">
              <h3 class="font-bold text-ui-textPrimary text-xs uppercase tracking-wider">Painting Tools</h3>
              <div class="grid grid-cols-2 gap-2 text-xs">
                <div><kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">B</kbd> <strong class="text-ui-textPrimary">Brush:</strong> Standard pixel pencil.</div>
                <div><kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">E</kbd> <strong class="text-ui-textPrimary">Eraser:</strong> Erases pixels to alpha transparency.</div>
                <div><kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">I</kbd> <strong class="text-ui-textPrimary">Eyedropper:</strong> Samples pixel color from canvas or 3D mesh.</div>
                <div><kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">G</kbd> <strong class="text-ui-textPrimary">Bucket Fill:</strong> Flood-fills contiguous color regions.</div>
                <div><kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">L</kbd> <strong class="text-ui-textPrimary">Line Tool:</strong> Draws straight pixel lines with Bresenham algorithm.</div>
                <div><kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">H</kbd> <strong class="text-ui-textPrimary">Dither Shader:</strong> Stamps ordered Bayer 8x8 halftone dithering patterns.</div>
                <div><kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">[</kbd> / <kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">]</kbd>: Brush size. Shift-drag or the pen side button drags it. Alt-wheel steps it. Pen pressure paints up to that size.</div>
                <div><kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">X</kbd>: Swap primary and secondary palette colors.</div>
              </div>
            </div>

            <div class="border border-ui-borderSubtle rounded-xs p-3 bg-ui-input/40 space-y-2">
              <h3 class="font-bold text-ui-textPrimary text-xs uppercase tracking-wider">Layers & Direct 3D Surface Painting</h3>
              <p>
                Create, reorder, merge, and toggle visibility on multiple texture layers. Any stroke drawn on the 2D canvas updates the 3D model in real time. You can also paint directly onto the 3D model surface by holding the paint tool and clicking on faces in the 3D viewport.
              </p>
            </div>
          </div>

          <!-- Topic: Tileset Atlas & Stamping -->
          <div v-if="activeTopicId === 'tileset'" class="space-y-4">
            <div>
              <h2 class="text-base font-bold text-ui-textPrimary mb-1">Tileset Atlas & 3D Stamping</h2>
              <p>
                Construct texture atlases and stamp architectural or terrain tiles directly onto selected 3D polygons without manual UV unwrapping.
              </p>
            </div>

            <div class="border border-ui-borderSubtle rounded-xs p-3 bg-ui-input/40 space-y-2">
              <h3 class="font-bold text-ui-textPrimary text-xs uppercase tracking-wider">Workflow Steps</h3>
              <ol class="space-y-1.5 list-decimal list-inside">
                <li>Open the <strong class="text-ui-textPrimary">Tileset Editor</strong> panel in the UV / Paint workspace.</li>
                <li>Set cell resolution (e.g. 16x16, 32x32, or 64x64 pixels) to divide the texture into a clean grid.</li>
                <li>Select a tile from the palette grid.</li>
                <li>In the 3D viewport, click on any mesh face to stamp that exact texture tile onto the polygon.</li>
                <li>Use rotation and flip controls to align the tile pattern (brick courses, metal panelling, cobblestones).</li>
              </ol>
            </div>
          </div>

          <!-- Topic: Rigging & Armatures -->
          <div v-if="activeTopicId === 'rigging'" class="space-y-4">
            <div>
              <h2 class="text-base font-bold text-ui-textPrimary mb-1">Rigging & Skeletal Armatures</h2>
              <p>
                Create joint armatures, define skeletal parent hierarchies, and bind meshes using either lightweight rigid part attachment or smooth skin weighting.
              </p>
            </div>

            <div class="border border-ui-borderSubtle rounded-xs p-3 bg-ui-input/40 space-y-2">
              <h3 class="font-bold text-ui-textPrimary text-xs uppercase tracking-wider">Rigid Part Parenting vs Smooth Skinning</h3>
              <div class="space-y-2">
                <div>
                  <strong class="text-ui-textPrimary">Rigid Part Binding (Recommended for PS1 / Retro Characters & Mechs):</strong>
                  <p class="mt-0.5">Assigns entire mesh objects or limbs directly to a single bone with 100% influence. Eliminates polygon stretching, perfectly mimics classic PlayStation and Nintendo 64 character models, and performs with zero CPU skinning overhead.</p>
                </div>
                <div>
                  <strong class="text-ui-textPrimary">Smooth Skinned Meshes:</strong>
                  <p class="mt-0.5">Assigns vertex weights across up to 4 bone influences with automatic distance-based falloff. Allows joint elbows and knees to bend organically.</p>
                </div>
              </div>
            </div>

            <div class="border border-ui-borderSubtle rounded-xs p-3 bg-ui-input/40 space-y-2">
              <h3 class="font-bold text-ui-textPrimary text-xs uppercase tracking-wider">Bone Operations</h3>
              <ul class="space-y-1 list-disc list-inside">
                <li><kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">E</kbd> — Extrude a new child bone from an active joint.</li>
                <li><strong class="text-ui-textPrimary">Symmetrize X:</strong> Automatically mirrors bones across the X axis, generating corresponding Left and Right joint pairs.</li>
                <li><strong class="text-ui-textPrimary">Weight Painting:</strong> Use the interactive weight brush to add, subtract, or smooth vertex weights on selected bones.</li>
              </ul>
            </div>
          </div>

          <!-- Topic: Humanoid Auto-Rig -->
          <div v-if="activeTopicId === 'humanoid'" class="space-y-4">
            <div>
              <h2 class="text-base font-bold text-ui-textPrimary mb-1">Humanoid Auto-Rig Wizard</h2>
              <p>
                Generate a ready-to-animate biped skeleton in seconds by positioning landmark markers over your character mesh.
              </p>
            </div>

            <div class="border border-ui-borderSubtle rounded-xs p-3 bg-ui-input/40 space-y-2">
              <h3 class="font-bold text-ui-textPrimary text-xs uppercase tracking-wider">How to Use the Wizard</h3>
              <ol class="space-y-1.5 list-decimal list-inside">
                <li>Switch to the <strong class="text-ui-textPrimary">Rigging</strong> workspace and click <strong class="text-ui-textPrimary">Humanoid Auto-Rig</strong>.</li>
                <li>Select a skeleton preset (15-bone classic low-poly or 19-bone extended with foot/hand joints).</li>
                <li>Move the colored reference markers to align with your character's anatomical points: Chin, Shoulders, Elbows, Wrists, Pelvis, Knees, and Ankles.</li>
                <li>Click <strong class="text-ui-textPrimary">Generate Armature</strong>. The wizard generates the complete hierarchy with correct bone roll and left/right naming conventions.</li>
                <li>Click <strong class="text-ui-textPrimary">Auto-Bind Mesh</strong> to calculate initial skin weights.</li>
              </ol>
            </div>
          </div>

          <!-- Topic: Animation & Keyframing -->
          <div v-if="activeTopicId === 'animation'" class="space-y-4">
            <div>
              <h2 class="text-base font-bold text-ui-textPrimary mb-1">Animation & Keyframe Timeline</h2>
              <p>
                PolyEcho supports multiple named animation clips stored in a single model file. Animate characters and props with a responsive dope sheet timeline.
              </p>
            </div>

            <div class="border border-ui-borderSubtle rounded-xs p-3 bg-ui-input/40 space-y-2">
              <h3 class="font-bold text-ui-textPrimary text-xs uppercase tracking-wider">Timeline Controls & Shortcuts</h3>
              <div class="grid grid-cols-2 gap-2 text-xs">
                <div><kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">Space</kbd>: Play / Pause animation playback.</div>
                <div><kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">Left</kbd> / <kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">Right Arrow</kbd>: Step backward or forward by one frame.</div>
                <div><kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">Home</kbd> / <kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">End</kbd>: Jump to first or last frame.</div>
                <div><kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">Shift + D</kbd>: Duplicate keyframes on current frame to next frame.</div>
                <div><kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">Ctrl + C</kbd>: Copy current pose.</div>
                <div><kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">Ctrl + Shift + V</kbd>: Paste mirrored pose (inverts X axis for walking cycles).</div>
              </div>
            </div>

            <div class="border border-ui-borderSubtle rounded-xs p-3 bg-ui-input/40 space-y-2">
              <h3 class="font-bold text-ui-textPrimary text-xs uppercase tracking-wider">Interpolation Modes</h3>
              <ul class="space-y-1 list-disc list-inside">
                <li><strong class="text-ui-textPrimary">Linear:</strong> Standard constant velocity interpolation between keyframes.</li>
                <li><strong class="text-ui-textPrimary">Step:</strong> Holds previous keyframe value until the next frame. Gives a distinctive retro stop-motion aesthetic.</li>
                <li><strong class="text-ui-textPrimary">Cubic Spline:</strong> Smooth acceleration and deceleration easing.</li>
              </ul>
            </div>

            <div class="border border-ui-borderSubtle rounded-xs p-3 bg-ui-input/40 space-y-2">
              <h3 class="font-bold text-ui-textPrimary text-xs uppercase tracking-wider">Timeline Event Markers</h3>
              <p>
                Add named event flags directly to the timeline (such as <code class="text-ui-textAccent font-mono">footstep_l</code>, <code class="text-ui-textAccent font-mono">attack_hit</code>, or <code class="text-ui-textAccent font-mono">spawn_dust</code>). These markers are saved in GLB animation metadata and can be read by Godot or Unity animation event systems.
              </p>
            </div>
          </div>

          <!-- Topic: Retro Shading & CRT Filters -->
          <div v-if="activeTopicId === 'shading'" class="space-y-4">
            <div>
              <h2 class="text-base font-bold text-ui-textPrimary mb-1">Retro Shading & Display Modes</h2>
              <p>
                Preview your 3D assets in authentic retro hardware conditions directly inside the modeling viewport.
              </p>
            </div>

            <div class="border border-ui-borderSubtle rounded-xs p-3 bg-ui-input/40 space-y-2">
              <h3 class="font-bold text-ui-textPrimary text-xs uppercase tracking-wider">Viewport Shading Modes</h3>
              <ul class="space-y-1.5 list-disc list-inside">
                <li><strong class="text-ui-textPrimary">Textured:</strong> Full base texture map display with unfiltered pixel sampling.</li>
                <li><strong class="text-ui-textPrimary">Solid:</strong> Neutral surface shading with directional key lighting for evaluating polygon form.</li>
                <li><strong class="text-ui-textPrimary">Wireframe:</strong> Displays polygon edges and vertex topology. You can adjust wire opacity in Overlays.</li>
                <li><strong class="text-ui-textPrimary">Dreamcast:</strong> Vibrant Gouraud shading with specular highlights replicating late 90s console visuals.</li>
                <li><strong class="text-ui-textPrimary">X-Ray Mode (<kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">Alt + Z</kbd>):</strong> Semi-transparent mesh display for selecting occluded back vertices and interior bones.</li>
              </ul>
            </div>

            <div class="border border-ui-borderSubtle rounded-xs p-3 bg-ui-input/40 space-y-2">
              <h3 class="font-bold text-ui-textPrimary text-xs uppercase tracking-wider">CRT Scanline Emulation</h3>
              <p>
                Click the display monitor icon on the top right bar to toggle CRT retro scanlines. This overlays curved cathode-ray tube raster lines, phosphor mask simulation, and slight bloom over the viewport.
              </p>
            </div>
          </div>

          <!-- Topic: Modifiers System -->
          <div v-if="activeTopicId === 'modifiers'" class="space-y-4">
            <div>
              <h2 class="text-base font-bold text-ui-textPrimary mb-1">Modifiers System</h2>
              <p>
                Modifiers provide non-destructive geometry generation. They calculate dynamically over base geometry and can be applied permanently at any time.
              </p>
            </div>

            <div class="border border-ui-borderSubtle rounded-xs p-3 bg-ui-input/40 space-y-2">
              <h3 class="font-bold text-ui-textPrimary text-xs uppercase tracking-wider">Available Modifiers</h3>
              <ul class="space-y-1.5 list-disc list-inside">
                <li><strong class="text-ui-textPrimary">Mirror:</strong> Mirrors geometry across X, Y, or Z axes with clipping limits and automatic seam vertex welding. Essential for character modeling.</li>
                <li><strong class="text-ui-textPrimary">Subdivision Surface:</strong> Smooths polygon surfaces using Catmull-Clark or simple subdivision algorithms.</li>
                <li><strong class="text-ui-textPrimary">Solidify:</strong> Extrudes a hollow surface outward or inward to give walls and cloth geometric thickness.</li>
              </ul>
            </div>
          </div>

          <!-- Topic: Game Engine Export -->
          <div v-if="activeTopicId === 'export'" class="space-y-4">
            <div>
              <h2 class="text-base font-bold text-ui-textPrimary mb-1">Game Engine Export Pipelines</h2>
              <p>
                PolyEcho produces production-ready 3D assets formatted for modern game engines and external DCC software.
              </p>
            </div>

            <div class="border border-ui-borderSubtle rounded-xs p-3 bg-ui-input/40 space-y-2">
              <h3 class="font-bold text-ui-textPrimary text-xs uppercase tracking-wider">Supported Export Formats</h3>
              <ul class="space-y-1.5 list-disc list-inside">
                <li><strong class="text-ui-textPrimary">glTF / GLB (.glb):</strong> Binary single-file export containing meshes, bone hierarchies, materials, embedded textures, and all animation clips with marker events.</li>
                <li><strong class="text-ui-textPrimary">Wavefront OBJ (.obj + .mtl):</strong> Universal polygonal mesh format compatible with all 3D applications.</li>
                <li><strong class="text-ui-textPrimary">Blockbench (.bbmodel):</strong> Exports low-poly box and cube hierarchy models for Minecraft and Blockbench workflows.</li>
                <li><strong class="text-ui-textPrimary">PolyEcho Project (.psxproj):</strong> JSON project format preserving complete scene geometry, textures, animations, and undo snapshots.</li>
              </ul>
            </div>

            <div class="border border-ui-borderSubtle rounded-xs p-3 bg-ui-input/40 space-y-2">
              <h3 class="font-bold text-ui-textPrimary text-xs uppercase tracking-wider">Engine Compatibility Guidelines</h3>
              <div class="space-y-1.5">
                <div><strong class="text-ui-textPrimary">Godot Engine 4:</strong> Drag and drop your exported <code class="font-mono text-ui-textAccent">.glb</code> directly into your Godot project. Godot automatically creates an Inherited Scene with AnimationPlayer, skeleton nodes, and material slots. Set texture filter to Nearest in Import settings for crisp pixels.</div>
                <div><strong class="text-ui-textPrimary">Unity:</strong> Import the <code class="font-mono text-ui-textAccent">.glb</code> or convert via Unity GLTFast. In the texture inspector, set Filter Mode to Point (no filter) and Compression to None.</div>
                <div><strong class="text-ui-textPrimary">Unreal Engine:</strong> Import Interchange glTF. Disable texture mipmaps to prevent pixel texture blurring.</div>
              </div>
            </div>
          </div>

          <!-- Topic: Keyboard Shortcuts Reference -->
          <div v-if="activeTopicId === 'shortcuts'" class="space-y-4">
            <div>
              <h2 class="text-base font-bold text-ui-textPrimary mb-1">Keyboard Shortcuts Reference</h2>
              <p>All shortcuts can be remapped in <strong class="text-ui-textPrimary">Preferences (Ctrl+,) &rarr; Keyboard</strong>.</p>
            </div>

            <div class="border border-ui-borderSubtle rounded-xs overflow-hidden">
              <table class="w-full text-left text-xs">
                <thead class="bg-ui-header border-b border-ui-borderSubtle text-[10px] uppercase font-bold text-ui-textMuted">
                  <tr>
                    <th class="py-1.5 px-3">Shortcut</th>
                    <th class="py-1.5 px-3">Command</th>
                    <th class="py-1.5 px-3">Workspace</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-ui-borderSubtle font-mono text-[11px]">
                  <tr>
                    <td class="py-1.5 px-3 text-ui-textAccent font-bold">1 / 2 / 3</td>
                    <td class="py-1.5 px-3 text-ui-textPrimary font-sans">Vertex / Edge / Face Selection Mode</td>
                    <td class="py-1.5 px-3 text-ui-textMuted font-sans">Modeling</td>
                  </tr>
                  <tr>
                    <td class="py-1.5 px-3 text-ui-textAccent font-bold">4 / 5</td>
                    <td class="py-1.5 px-3 text-ui-textPrimary font-sans">Object / Origin (Pivot) Mode</td>
                    <td class="py-1.5 px-3 text-ui-textMuted font-sans">All</td>
                  </tr>
                  <tr>
                    <td class="py-1.5 px-3 text-ui-textAccent font-bold">Tab</td>
                    <td class="py-1.5 px-3 text-ui-textPrimary font-sans">Toggle Object / Edit Mode</td>
                    <td class="py-1.5 px-3 text-ui-textMuted font-sans">Modeling</td>
                  </tr>
                  <tr>
                    <td class="py-1.5 px-3 text-ui-textAccent font-bold">G / R / S</td>
                    <td class="py-1.5 px-3 text-ui-textPrimary font-sans">Move / Rotate / Scale Selection</td>
                    <td class="py-1.5 px-3 text-ui-textMuted font-sans">Modeling / Rigging</td>
                  </tr>
                  <tr>
                    <td class="py-1.5 px-3 text-ui-textAccent font-bold">E / I</td>
                    <td class="py-1.5 px-3 text-ui-textPrimary font-sans">Extrude / Inset Faces</td>
                    <td class="py-1.5 px-3 text-ui-textMuted font-sans">Modeling</td>
                  </tr>
                  <tr>
                    <td class="py-1.5 px-3 text-ui-textAccent font-bold">Ctrl + B</td>
                    <td class="py-1.5 px-3 text-ui-textPrimary font-sans">Bevel Edges</td>
                    <td class="py-1.5 px-3 text-ui-textMuted font-sans">Modeling</td>
                  </tr>
                  <tr>
                    <td class="py-1.5 px-3 text-ui-textAccent font-bold">Ctrl + R</td>
                    <td class="py-1.5 px-3 text-ui-textPrimary font-sans">Loop Cut and Slide</td>
                    <td class="py-1.5 px-3 text-ui-textMuted font-sans">Modeling</td>
                  </tr>
                  <tr>
                    <td class="py-1.5 px-3 text-ui-textAccent font-bold">K</td>
                    <td class="py-1.5 px-3 text-ui-textPrimary font-sans">Knife Topology Tool</td>
                    <td class="py-1.5 px-3 text-ui-textMuted font-sans">Modeling</td>
                  </tr>
                  <tr>
                    <td class="py-1.5 px-3 text-ui-textAccent font-bold">W</td>
                    <td class="py-1.5 px-3 text-ui-textPrimary font-sans">Subdivide Selected Geometry</td>
                    <td class="py-1.5 px-3 text-ui-textMuted font-sans">Modeling</td>
                  </tr>
                  <tr>
                    <td class="py-1.5 px-3 text-ui-textAccent font-bold">F</td>
                    <td class="py-1.5 px-3 text-ui-textPrimary font-sans">Fill Face (Modeling) / Poly Draw (Blockout)</td>
                    <td class="py-1.5 px-3 text-ui-textMuted font-sans">Contextual</td>
                  </tr>
                  <tr>
                    <td class="py-1.5 px-3 text-ui-textAccent font-bold">J</td>
                    <td class="py-1.5 px-3 text-ui-textPrimary font-sans">Connect Two Selected Vertices</td>
                    <td class="py-1.5 px-3 text-ui-textMuted font-sans">Modeling</td>
                  </tr>
                  <tr>
                    <td class="py-1.5 px-3 text-ui-textAccent font-bold">M</td>
                    <td class="py-1.5 px-3 text-ui-textPrimary font-sans">Merge Vertices Menu</td>
                    <td class="py-1.5 px-3 text-ui-textMuted font-sans">Modeling</td>
                  </tr>
                  <tr>
                    <td class="py-1.5 px-3 text-ui-textAccent font-bold">Alt + Z</td>
                    <td class="py-1.5 px-3 text-ui-textPrimary font-sans">Toggle X-Ray Transparency</td>
                    <td class="py-1.5 px-3 text-ui-textMuted font-sans">All</td>
                  </tr>
                  <tr>
                    <td class="py-1.5 px-3 text-ui-textAccent font-bold">Shift + A</td>
                    <td class="py-1.5 px-3 text-ui-textPrimary font-sans">Add Primitive Placement Menu</td>
                    <td class="py-1.5 px-3 text-ui-textMuted font-sans">Modeling</td>
                  </tr>
                  <tr>
                    <td class="py-1.5 px-3 text-ui-textAccent font-bold">Space</td>
                    <td class="py-1.5 px-3 text-ui-textPrimary font-sans">Play / Pause Animation Playback</td>
                    <td class="py-1.5 px-3 text-ui-textMuted font-sans">Animation</td>
                  </tr>
                  <tr>
                    <td class="py-1.5 px-3 text-ui-textAccent font-bold">F3</td>
                    <td class="py-1.5 px-3 text-ui-textPrimary font-sans">Command Search Palette</td>
                    <td class="py-1.5 px-3 text-ui-textMuted font-sans">Global</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Topic: FAQ & Troubleshooting -->
          <div v-if="activeTopicId === 'faq'" class="space-y-4">
            <div>
              <h2 class="text-base font-bold text-ui-textPrimary mb-1">FAQ & Troubleshooting</h2>
              <p>Solutions to common questions and mesh editing scenarios.</p>
            </div>

            <div class="space-y-3">
              <div class="border border-ui-borderSubtle rounded-xs p-3 bg-ui-input/40 space-y-1">
                <h3 class="font-bold text-ui-textPrimary text-xs">Why do some faces appear black or dark in the viewport?</h3>
                <p>
                  Face normals may be pointed backward. In Modeling workspace, select all faces (<kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">Ctrl + A</kbd>), open the Mesh menu, and choose <strong class="text-ui-textPrimary">Recalculate Outside (Ctrl+Shift+N)</strong> or <strong class="text-ui-textPrimary">Flip Normals (Shift+N)</strong>. You can enable <strong class="text-ui-textPrimary">Face Orientation</strong> in the Overlays menu to inspect normals (blue is front, red is back).
                </p>
              </div>

              <div class="border border-ui-borderSubtle rounded-xs p-3 bg-ui-input/40 space-y-1">
                <h3 class="font-bold text-ui-textPrimary text-xs">How do I fix textures looking blurry in my game engine?</h3>
                <p>
                  Modern game engines apply bilinear or trilinear texture filtering by default. In Godot, set the texture filter to <strong class="text-ui-textPrimary">Nearest</strong>. In Unity, set Filter Mode to <strong class="text-ui-textPrimary">Point (no filter)</strong> and compression to <strong class="text-ui-textPrimary">None</strong>. In Unreal Engine, set Texture Group to <strong class="text-ui-textPrimary">2D Pixels (unfiltered)</strong>.
                </p>
              </div>

              <div class="border border-ui-borderSubtle rounded-xs p-3 bg-ui-input/40 space-y-1">
                <h3 class="font-bold text-ui-textPrimary text-xs">How do I prevent unwanted polygon stretching during animation?</h3>
                <p>
                  For retro low-poly characters, use <strong class="text-ui-textPrimary">Rigid Part Parenting</strong> in the Rigging workspace. Separate your limbs into distinct sub-meshes (head, torso, upper arm, forearm, hand) and bind each to its parent bone with 100% rigid influence.
                </p>
              </div>

              <div class="border border-ui-borderSubtle rounded-xs p-3 bg-ui-input/40 space-y-1">
                <h3 class="font-bold text-ui-textPrimary text-xs">Where are my autosaves stored?</h3>
                <p>
                  PolyEcho periodically caches session snapshots in local application storage. If your session was interrupted, press <kbd class="font-mono bg-ui-input border border-ui-borderDefault px-1 py-0.5 rounded">Ctrl + Shift + T</kbd> to restore your last autosave state.
                </p>
              </div>
            </div>
          </div>

        </div>

      </div>

      <!-- Footer Bar -->
      <div class="h-9 bg-ui-header border-t border-ui-borderSubtle px-4 flex items-center justify-between shrink-0 text-[11px] text-ui-textMuted">
        <div class="flex items-center gap-3">
          <span>Press <kbd class="px-1 py-0.2 bg-ui-input border border-ui-borderDefault rounded font-mono text-[10px] text-ui-textPrimary">Esc</kbd> to close</span>
          <span>·</span>
          <span>Press <kbd class="px-1 py-0.2 bg-ui-input border border-ui-borderDefault rounded font-mono text-[10px] text-ui-textPrimary">F1</kbd> to reopen</span>
        </div>
        <div class="flex items-center gap-2">
          <span>PolyEcho — Retro 3D Studio</span>
        </div>
      </div>

    </div>
  </div>
</template>
