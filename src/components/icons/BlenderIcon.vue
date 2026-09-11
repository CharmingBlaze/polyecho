<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  name: 
    // Selection modes
    | 'vertex-select' 
    | 'edge-select' 
    | 'face-select' 
    | 'object-mode'
    // Transform tools
    | 'tool-move' 
    | 'tool-rotate' 
    | 'tool-scale'
    | 'gizmo-combined'
    // Modeling tools
    | 'tool-extrude' 
    | 'tool-inset' 
    | 'tool-bevel'
    | 'tool-subdivide'
    | 'subdivide'
    | 'tool-merge'
    | 'tool-knife'
    | 'tool-loopcut'
    | 'flip-normals'
    | 'join-mesh'
    | 'separate-mesh'
    | 'flatten-mesh'
    | 'fill-face'
    | 'dissolve'
    | 'connect-verts'
    | 'clean-mesh'
    | 'bridge-edges'
    | 'flip-edge'
    | 'grow-select'
    | 'shrink-select'
    // Primitives
    | 'mesh-cube'
    | 'mesh-plane'
    | 'mesh-cylinder'
    | 'mesh-cone'
    | 'mesh-sphere'
    | 'mesh-icosphere'
    | 'mesh-circle'
    | 'mesh-torus'
    // Shading
    | 'shading-solid'
    | 'shading-textured'
    | 'shading-wire'
    | 'shading-rendered'
    | 'xray'
    // Rigging & Animation
    | 'bone'
    | 'bone-data'
    | 'armature'
    | 'pose'
    | 'keyframe'
    | 'play'
    | 'pause'
    | 'skip-start'
    | 'skip-end'
    | 'chevron-left'
    | 'record'
    | 'film'
    | 'marker'
    | 'onion-skin'
    | 'vertex-group'
    | 'constraint'
    | 'empty-axis'
    | 'modifier-mirror'
    | 'ik'
    // Painting & UV
    | 'uv'
    | 'uv-data'
    | 'brush'
    | 'draw'
    | 'tool-draw'
    | 'paint'
    | 'fill'
    | 'eraser'
    | 'picker'
    | 'dither'
    | 'line'
    | 'rect'
    | 'square'
    | 'circle'
    | 'shade'
    | 'marquee'
    | 'select-box'
    | 'material'
    | 'texture'
    // Outliner & UI
    | 'eye-open'
    | 'eye-closed'
    | 'lock'
    | 'unlock'
    | 'duplicate'
    | 'trash'
    | 'plus'
    | 'snap'
    | 'origin'
    | 'pivot-point'
    | 'undo'
    | 'redo'
    | 'export'
    | 'import'
    | 'rotate-ccw'
    | 'rotate-cw'
    | 'flip-horizontal'
    | 'flip-vertical'
    | 'zoom-in'
    | 'zoom-out'
    | 'grid'
    | 'quad-view'
    | 'view-fit'
    | 'maximize'
    | 'minimize'
    | 'pack-islands'
    | 'uv-smart'
    | 'cursor-select'
    | 'chevron-down'
    | 'chevron-right'
    | 'search'
    | 'save'
    | 'folder'
    | 'close'
    | 'warning'
    | 'check'
    | 'settings'
    | 'sidebar'
    | 'link'
    | 'image'
    | 'swap-colors'
    | 'modifier'
    | 'tools'
    | 'layers'
    | 'display'
    | 'keyframe-map'
    | 'keyboard'
  size?: number | string
  color?: string
}>(), {
  size: 16,
  color: 'currentColor'
})

const sizePx = computed(() => typeof props.size === 'number' ? `${props.size}px` : props.size)
</script>

<template>
  <svg 
    :width="sizePx" 
    :height="sizePx" 
    viewBox="0 0 24 24" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
    class="shrink-0 inline-block align-middle select-none"
    :style="{ color }"
  >
    <!-- 1. VERTEX SELECT (Blender 3D Mesh with orange/lit vertex handle) -->
    <g v-if="name === 'vertex-select'">
      <path d="M4 18L12 21L20 18L12 15L4 18Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" opacity="0.4" />
      <path d="M12 3L4 6L12 9L20 6L12 3Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" opacity="0.4" />
      <path d="M4 6V18M20 6V18M12 9V21" stroke="currentColor" stroke-width="1.5" opacity="0.4" />
      <!-- Selected Vertex Dot -->
      <circle cx="12" cy="3" r="3" fill="#f59e0b" stroke="#ffffff" stroke-width="1.2" />
      <circle cx="4" cy="6" r="1.8" fill="currentColor" opacity="0.7" />
      <circle cx="20" cy="6" r="1.8" fill="currentColor" opacity="0.7" />
      <circle cx="12" cy="9" r="1.8" fill="currentColor" opacity="0.7" />
    </g>

    <!-- 2. EDGE SELECT (Blender 3D Mesh with bold glowing edge) -->
    <g v-else-if="name === 'edge-select'">
      <path d="M4 18L12 21L20 18L12 15L4 18Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" opacity="0.3" />
      <path d="M4 6L12 9L20 6" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" opacity="0.3" />
      <path d="M4 6V18M20 6V18M12 9V21" stroke="currentColor" stroke-width="1.5" opacity="0.3" />
      <!-- Selected Edge Highlight -->
      <path d="M12 3L20 6" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round" />
      <path d="M12 3L4 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.4" />
      <circle cx="12" cy="3" r="1.5" fill="#f59e0b" />
      <circle cx="20" cy="6" r="1.5" fill="#f59e0b" />
    </g>

    <!-- 3. FACE SELECT (Blender 3D Mesh with highlighted center face dot / filled plane) -->
    <g v-else-if="name === 'face-select'">
      <path d="M4 18L12 21L20 18L12 15L4 18Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" opacity="0.3" />
      <path d="M4 6V18M20 6V18M12 9V21" stroke="currentColor" stroke-width="1.5" opacity="0.3" />
      <!-- Highlighted Top Face -->
      <polygon points="12,3 20,6 12,9 4,6" fill="#f59e0b" fill-opacity="0.35" stroke="#f59e0b" stroke-width="1.5" stroke-linejoin="round" />
      <circle cx="12" cy="6" r="2.2" fill="#f59e0b" stroke="#ffffff" stroke-width="1" />
    </g>

    <!-- 4. OBJECT MODE (Blender orange bounding box) -->
    <g v-else-if="name === 'object-mode'">
      <path d="M12 2L3 7L12 12L21 7L12 2Z" stroke="#f59e0b" stroke-width="1.6" stroke-linejoin="round" fill="#f59e0b" fill-opacity="0.15" />
      <path d="M3 7V17L12 22V12M21 7V17L12 22" stroke="#f59e0b" stroke-width="1.6" stroke-linejoin="round" />
    </g>

    <!-- 5. ORIGIN / PIVOT POINT (Blender 3D Cursor & Pivot Marker) -->
    <g v-else-if="name === 'origin' || name === 'pivot-point'">
      <circle cx="12" cy="12" r="7.5" stroke="currentColor" stroke-width="1.4" stroke-dasharray="4 2" />
      <circle cx="12" cy="12" r="2.2" fill="#f59e0b" />
      <line x1="12" y1="2" x2="12" y2="7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      <line x1="12" y1="17" x2="12" y2="22" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      <line x1="2" y1="12" x2="7" y2="12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      <line x1="17" y1="12" x2="22" y2="12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    </g>

    <!-- TRANSFORM MOVE (Blender Translate Gizmo Arrows) -->
    <g v-else-if="name === 'tool-move'">
      <path d="M12 2V22M2 12H22" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
      <path d="M12 2L9 5M12 2L15 5M12 22L9 19M12 22L15 19M2 12L5 9M2 12L5 15M22 12L19 9M22 12L19 15" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
    </g>

    <!-- TRANSFORM ROTATE (Blender Circular Gizmo Trackball) -->
    <g v-else-if="name === 'tool-rotate'">
      <circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.6" stroke-dasharray="14 3" />
      <path d="M12 4L15 7L12 10" stroke="#f59e0b" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M12 4C16.4183 4 20 7.58172 20 12" stroke="#f59e0b" stroke-width="1.8" stroke-linecap="round" />
    </g>

    <!-- COMBINED TRS GIZMO (readable at 12px header size) -->
    <g v-else-if="name === 'gizmo-combined'">
      <circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.5" fill="none" />
      <line x1="12" y1="3.5" x2="12" y2="20.5" stroke="#10b981" stroke-width="1.7" stroke-linecap="round" />
      <line x1="3.5" y1="12" x2="20.5" y2="12" stroke="#ef4444" stroke-width="1.7" stroke-linecap="round" />
      <line x1="6.2" y1="17.8" x2="17.8" y2="6.2" stroke="#38bdf8" stroke-width="1.5" stroke-linecap="round" />
      <rect x="10.2" y="10.2" width="3.6" height="3.6" rx="0.4" fill="currentColor" />
    </g>

    <!-- TRANSFORM SCALE (Blender Box Scale Gizmo) -->
    <g v-else-if="name === 'tool-scale'">
      <path d="M5 19L19 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
      <rect x="3" y="17" width="4" height="4" fill="currentColor" />
      <rect x="17" y="3" width="4" height="4" fill="#f59e0b" />
      <path d="M19 11V5H13M5 13V19H11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
    </g>

    <!-- EXTRUDE (Blender Extrude Face Upwards) -->
    <g v-else-if="name === 'tool-extrude'">
      <path d="M4 19L12 22L20 19L12 16L4 19Z" stroke="currentColor" stroke-width="1.5" opacity="0.4" />
      <path d="M4 11L12 14L20 11L12 8L4 11Z" stroke="#10b981" stroke-width="1.5" fill="#10b981" fill-opacity="0.25" />
      <path d="M4 11V19M20 11V19M12 14V22" stroke="currentColor" stroke-width="1.3" opacity="0.4" />
      <path d="M12 8V2M12 2L9 4.5M12 2L15 4.5" stroke="#10b981" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </g>

    <!-- INSET (Blender Inset Polygon) -->
    <g v-else-if="name === 'tool-inset'">
      <rect x="3" y="3" width="18" height="18" rx="1" stroke="currentColor" stroke-width="1.5" fill="none" opacity="0.4" />
      <rect x="7" y="7" width="10" height="10" stroke="#38bdf8" stroke-width="1.7" fill="#38bdf8" fill-opacity="0.25" />
      <line x1="3" y1="3" x2="7" y2="7" stroke="currentColor" stroke-width="1.3" opacity="0.4" />
      <line x1="21" y1="3" x2="17" y2="7" stroke="currentColor" stroke-width="1.3" opacity="0.4" />
      <line x1="3" y1="21" x2="7" y2="17" stroke="currentColor" stroke-width="1.3" opacity="0.4" />
      <line x1="21" y1="21" x2="17" y2="17" stroke="currentColor" stroke-width="1.3" opacity="0.4" />
    </g>

    <!-- BEVEL (Blender Chamfered Edge) -->
    <g v-else-if="name === 'tool-bevel'">
      <path d="M4 8L8 4H20V16L16 20H4V8Z" stroke="currentColor" stroke-width="1.5" fill="none" />
      <path d="M8 4V16H20" stroke="#a855f7" stroke-width="1.6" stroke-linecap="round" />
      <path d="M4 8H16V20" stroke="#a855f7" stroke-width="1.6" stroke-linecap="round" />
      <line x1="8" y1="4" x2="4" y2="8" stroke="#a855f7" stroke-width="1.8" />
      <line x1="20" y1="16" x2="16" y2="20" stroke="#a855f7" stroke-width="1.8" />
    </g>

    <!-- SUBDIVIDE -->
    <g v-else-if="name === 'tool-subdivide' || name === 'subdivide'">
      <rect x="4" y="4" width="16" height="16" stroke="currentColor" stroke-width="1.5" />
      <line x1="12" y1="4" x2="12" y2="20" stroke="#818cf8" stroke-width="1.5" />
      <line x1="4" y1="12" x2="20" y2="12" stroke="#818cf8" stroke-width="1.5" />
    </g>

    <!-- KNIFE TOOL -->
    <g v-else-if="name === 'tool-knife'">
      <path d="M4 20L11 13L15 17L8 24Z" stroke="currentColor" stroke-width="1.5" fill="none" opacity="0.3" />
      <path d="M19 3L21 5L13 13L11 11L19 3Z" stroke="#f43f5e" stroke-width="1.6" fill="#f43f5e" fill-opacity="0.3" />
      <line x1="3" y1="21" x2="12" y2="12" stroke="#f43f5e" stroke-width="1.8" stroke-linecap="round" />
    </g>

    <!-- LOOP CUT -->
    <g v-else-if="name === 'tool-loopcut'">
      <rect x="4" y="4" width="16" height="16" stroke="currentColor" stroke-width="1.5" fill="none" />
      <line x1="12" y1="2" x2="12" y2="22" stroke="#f59e0b" stroke-width="2" stroke-dasharray="3 2" />
      <circle cx="12" cy="12" r="2" fill="#f59e0b" />
    </g>

    <!-- MERGE (Blender Merge at Center) -->
    <g v-else-if="name === 'tool-merge'">
      <circle cx="12" cy="12" r="3.5" fill="#f59e0b" />
      <path d="M5 5L9.5 9.5M19 5L14.5 9.5M5 19L9.5 14.5M19 19L14.5 14.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
    </g>

    <!-- FLIP NORMALS (Inverted Surface Normal Vector) -->
    <g v-else-if="name === 'flip-normals'">
      <polygon points="4,16 12,20 20,16 12,12" stroke="currentColor" stroke-width="1.5" fill="currentColor" fill-opacity="0.15" />
      <path d="M12 14V4M12 4L9 7M12 4L15 7" stroke="#06b6d4" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M12 18V22" stroke="#06b6d4" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="2 2" />
    </g>

    <!-- FILL FACE (Blender 'F' Polygon creation) -->
    <g v-else-if="name === 'fill-face'">
      <polygon points="12,3 21,10 17,21 7,21 3,10" stroke="#14b8a6" stroke-width="1.5" fill="#14b8a6" fill-opacity="0.2" />
      <circle cx="12" cy="3" r="1.8" fill="#14b8a6" />
      <circle cx="21" cy="10" r="1.8" fill="#14b8a6" />
      <circle cx="17" cy="21" r="1.8" fill="#14b8a6" />
      <circle cx="7" cy="21" r="1.8" fill="#14b8a6" />
      <circle cx="3" cy="10" r="1.8" fill="#14b8a6" />
    </g>

    <!-- JOIN MESH (Blender Ctrl+J) -->
    <g v-else-if="name === 'join-mesh'">
      <rect x="2" y="5" width="8" height="8" rx="1" stroke="#3b82f6" stroke-width="1.4" fill="#3b82f6" fill-opacity="0.2" />
      <rect x="14" y="5" width="8" height="8" rx="1" stroke="#3b82f6" stroke-width="1.4" fill="#3b82f6" fill-opacity="0.2" />
      <path d="M10 9H14M12 7V11" stroke="#3b82f6" stroke-width="1.6" stroke-linecap="round" />
      <path d="M4 17L12 21L20 17" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
    </g>

    <!-- SEPARATE MESH (Blender P) -->
    <g v-else-if="name === 'separate-mesh'">
      <polygon points="4,18 12,21 20,18 12,15" stroke="currentColor" stroke-width="1.4" opacity="0.4" />
      <polygon points="4,10 12,13 20,10 12,7" stroke="#ec4899" stroke-width="1.6" fill="#ec4899" fill-opacity="0.25" />
      <path d="M12 7V3M12 3L9 5M12 3L15 5" stroke="#ec4899" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
    </g>

    <!-- FLATTEN AXIS (Align Vertices to Plane) -->
    <g v-else-if="name === 'flatten-mesh'">
      <line x1="3" y1="12" x2="21" y2="12" stroke="#f59e0b" stroke-width="1.8" stroke-dasharray="3 2" />
      <circle cx="6" cy="6" r="2" fill="currentColor" />
      <circle cx="12" cy="18" r="2" fill="currentColor" />
      <circle cx="18" cy="7" r="2" fill="currentColor" />
      <path d="M6 8V12M12 16V12M18 9V12" stroke="#f59e0b" stroke-width="1.3" stroke-linecap="round" />
    </g>

    <!-- DISSOLVE (Delete edge while preserving face) -->
    <g v-else-if="name === 'dissolve'">
      <rect x="4" y="4" width="16" height="16" rx="1" stroke="currentColor" stroke-width="1.5" fill="none" />
      <line x1="12" y1="4" x2="12" y2="20" stroke="#f43f5e" stroke-width="1.6" stroke-dasharray="2 2" />
      <path d="M9 12L15 12" stroke="#f43f5e" stroke-width="1.8" stroke-linecap="round" />
    </g>

    <!-- CONNECT VERTICES (Blender J) -->
    <g v-else-if="name === 'connect-verts'">
      <polygon points="4,4 20,4 20,20 4,20" stroke="currentColor" stroke-width="1.4" fill="none" opacity="0.4" />
      <line x1="4" y1="4" x2="20" y2="20" stroke="#10b981" stroke-width="2" stroke-linecap="round" />
      <circle cx="4" cy="4" r="2.5" fill="#10b981" />
      <circle cx="20" cy="20" r="2.5" fill="#10b981" />
    </g>

    <!-- BRIDGE EDGES -->
    <g v-else-if="name === 'bridge-edges'">
      <line x1="4" y1="6" x2="20" y2="6" stroke="#06b6d4" stroke-width="2" stroke-linecap="round" />
      <line x1="4" y1="18" x2="20" y2="18" stroke="#06b6d4" stroke-width="2" stroke-linecap="round" />
      <path d="M7 6V18M12 6V18M17 6V18" stroke="currentColor" stroke-width="1.3" stroke-dasharray="2 2" opacity="0.6" />
    </g>

    <!-- FLIP EDGE (Rotate Triangle Diagonal) -->
    <g v-else-if="name === 'flip-edge'">
      <polygon points="4,4 20,4 20,20 4,20" stroke="currentColor" stroke-width="1.4" fill="none" />
      <line x1="4" y1="4" x2="20" y2="20" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 2" opacity="0.3" />
      <line x1="4" y1="20" x2="20" y2="4" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" />
    </g>

    <!-- CLEAN MESH -->
    <g v-else-if="name === 'clean-mesh'">
      <path d="M4 19L19 4M15 4L20 9" stroke="#10b981" stroke-width="1.6" stroke-linecap="round" />
      <path d="M7 16L4 19L5 20L8 17" fill="#10b981" />
      <circle cx="16" cy="16" r="2" fill="#f59e0b" />
      <circle cx="19" cy="13" r="1.5" fill="#f59e0b" />
    </g>

    <!-- GROW SELECTION -->
    <g v-else-if="name === 'grow-select'">
      <rect x="6" y="6" width="12" height="12" stroke="currentColor" stroke-width="1.4" fill="none" opacity="0.4" />
      <path d="M3 12H1M23 12H21M12 3V1M12 23V21" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" />
    </g>

    <!-- SHRINK SELECTION -->
    <g v-else-if="name === 'shrink-select'">
      <rect x="3" y="3" width="18" height="18" stroke="currentColor" stroke-width="1.4" fill="none" opacity="0.4" />
      <path d="M8 12H10M16 12H14M12 8V10M12 16V14" stroke="#f43f5e" stroke-width="2" stroke-linecap="round" />
    </g>

    <!-- MESH PRIMITIVES -->
    <g v-else-if="name === 'mesh-cube'">
      <path d="M12 2L3 7L12 12L21 7L12 2Z" stroke="currentColor" stroke-width="1.5" fill="currentColor" fill-opacity="0.1" />
      <path d="M3 7V17L12 22V12M21 7V17L12 22" stroke="currentColor" stroke-width="1.5" />
    </g>

    <g v-else-if="name === 'mesh-plane'">
      <polygon points="12,4 21,10 12,20 3,10" stroke="currentColor" stroke-width="1.5" fill="currentColor" fill-opacity="0.1" />
      <line x1="7.5" y1="7" x2="16.5" y2="15" stroke="currentColor" stroke-width="1" opacity="0.6" />
      <line x1="16.5" y1="7" x2="7.5" y2="15" stroke="currentColor" stroke-width="1" opacity="0.6" />
    </g>

    <g v-else-if="name === 'mesh-cylinder'">
      <ellipse cx="12" cy="6" rx="8" ry="3" stroke="currentColor" stroke-width="1.5" />
      <path d="M4 6V18C4 19.65 7.58 21 12 21C16.42 21 20 19.65 20 18V6" stroke="currentColor" stroke-width="1.5" />
    </g>

    <g v-else-if="name === 'mesh-cone'">
      <ellipse cx="12" cy="18" rx="8" ry="3" stroke="currentColor" stroke-width="1.5" />
      <line x1="4" y1="18" x2="12" y2="3" stroke="currentColor" stroke-width="1.5" />
      <line x1="20" y1="18" x2="12" y2="3" stroke="currentColor" stroke-width="1.5" />
    </g>

    <g v-else-if="name === 'mesh-sphere'">
      <circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.5" />
      <ellipse cx="12" cy="12" rx="8" ry="3" stroke="currentColor" stroke-width="1.2" opacity="0.7" />
      <line x1="12" y1="4" x2="12" y2="20" stroke="currentColor" stroke-width="1.2" opacity="0.7" />
    </g>

    <g v-else-if="name === 'mesh-icosphere'">
      <polygon points="12,3 20,8 18,18 6,18 4,8" stroke="currentColor" stroke-width="1.5" fill="currentColor" fill-opacity="0.1" />
      <line x1="12" y1="3" x2="18" y2="18" stroke="currentColor" stroke-width="1.2" opacity="0.6" />
      <line x1="12" y1="3" x2="6" y2="18" stroke="currentColor" stroke-width="1.2" opacity="0.6" />
      <line x1="4" y1="8" x2="20" y2="8" stroke="currentColor" stroke-width="1.2" opacity="0.6" />
    </g>

    <g v-else-if="name === 'mesh-circle'">
      <circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.6" fill="none" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </g>

    <g v-else-if="name === 'mesh-torus'">
      <ellipse cx="12" cy="12" rx="9" ry="5" stroke="currentColor" stroke-width="1.5" fill="none" />
      <ellipse cx="12" cy="12" rx="4" ry="2" stroke="currentColor" stroke-width="1.5" fill="none" />
    </g>

    <!-- SHADING MODES -->
    <g v-else-if="name === 'shading-solid'">
      <circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.5" fill="currentColor" fill-opacity="0.3" />
    </g>

    <g v-else-if="name === 'shading-textured'">
      <circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.5" />
      <path d="M4 12H20M12 4V20" stroke="currentColor" stroke-width="1.3" opacity="0.5" />
      <rect x="4" y="4" width="8" height="8" fill="currentColor" fill-opacity="0.5" />
      <rect x="12" y="12" width="8" height="8" fill="currentColor" fill-opacity="0.5" />
    </g>

    <g v-else-if="name === 'shading-wire'">
      <circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.5" fill="none" />
      <ellipse cx="12" cy="12" rx="8" ry="3.5" stroke="currentColor" stroke-width="1.2" fill="none" />
      <line x1="12" y1="4" x2="12" y2="20" stroke="currentColor" stroke-width="1.2" />
    </g>

    <g v-else-if="name === 'shading-rendered'">
      <circle cx="12" cy="12" r="8" stroke="#f59e0b" stroke-width="1.5" fill="#f59e0b" fill-opacity="0.2" />
      <path d="M12 2L13.5 6.5L18 8L13.5 9.5L12 14L10.5 9.5L6 8L10.5 6.5L12 2Z" fill="#f59e0b" />
    </g>

    <g v-else-if="name === 'xray'">
      <rect x="3" y="3" width="12" height="12" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 2" fill="currentColor" fill-opacity="0.1" />
      <rect x="9" y="9" width="12" height="12" stroke="#38bdf8" stroke-width="1.5" fill="#38bdf8" fill-opacity="0.25" />
    </g>

    <!-- BONE / ARMATURE (Classic Blender Bone Octahedron Diamond) -->
    <g v-else-if="name === 'bone' || name === 'armature'">
      <!-- Diamond waist at 20% length -->
      <polygon points="12,3 16,8 12,21 8,8" stroke="currentColor" stroke-width="1.6" fill="currentColor" fill-opacity="0.25" stroke-linejoin="round" />
      <line x1="12" y1="3" x2="12" y2="21" stroke="currentColor" stroke-width="1.2" opacity="0.6" />
      <line x1="8" y1="8" x2="16" y2="8" stroke="currentColor" stroke-width="1.2" opacity="0.6" />
      <!-- Joint head & tail spheres -->
      <circle cx="12" cy="3" r="2" fill="#f59e0b" />
      <circle cx="12" cy="21" r="1.5" fill="currentColor" />
    </g>

    <!-- BONE DATA (Blender Green Bone Data Icon) -->
    <g v-else-if="name === 'bone-data'">
      <polygon points="12,4 15,8 12,19 9,8" stroke="#10b981" stroke-width="1.5" fill="#10b981" fill-opacity="0.3" stroke-linejoin="round" />
      <circle cx="12" cy="4" r="1.8" fill="#10b981" />
      <circle cx="12" cy="19" r="1.2" fill="#10b981" />
    </g>

    <!-- POSE (Blender Blue Pose Mode Icon) -->
    <g v-else-if="name === 'pose'">
      <polygon points="8,4 12,7 8,14 5,7" stroke="#38bdf8" stroke-width="1.4" fill="#38bdf8" fill-opacity="0.3" />
      <polygon points="16,10 19,13 15,20 12,13" stroke="#38bdf8" stroke-width="1.4" fill="#38bdf8" fill-opacity="0.3" />
      <circle cx="8" cy="4" r="1.5" fill="#38bdf8" />
      <circle cx="16" cy="10" r="1.5" fill="#38bdf8" />
    </g>

    <!-- VERTEX GROUP / WEIGHTS (Blender Green Mesh Grid + Vertex Weights Icon) -->
    <g v-else-if="name === 'vertex-group'">
      <rect x="4" y="4" width="16" height="16" rx="2" stroke="#10b981" stroke-width="1.5" fill="none" />
      <line x1="4" y1="12" x2="20" y2="12" stroke="#10b981" stroke-width="1.2" opacity="0.6" />
      <line x1="12" y1="4" x2="12" y2="20" stroke="#10b981" stroke-width="1.2" opacity="0.6" />
      <circle cx="12" cy="12" r="2.5" fill="#f59e0b" />
      <circle cx="4" cy="4" r="1.5" fill="#10b981" />
      <circle cx="20" cy="4" r="1.5" fill="#10b981" />
      <circle cx="4" cy="20" r="1.5" fill="#10b981" />
      <circle cx="20" cy="20" r="1.5" fill="#10b981" />
    </g>

    <!-- CONSTRAINT / BINDINGS (Blender Official Chain Links Icon) -->
    <g v-else-if="name === 'constraint'">
      <rect x="4" y="9" width="10" height="6" rx="3" stroke="#f59e0b" stroke-width="1.5" fill="none" transform="rotate(-45 9 12)" />
      <rect x="10" y="9" width="10" height="6" rx="3" stroke="#f59e0b" stroke-width="1.5" fill="none" transform="rotate(-45 15 12)" />
    </g>

    <!-- EMPTY / SOCKET (Blender Plain Axis Empty Icon) -->
    <g v-else-if="name === 'empty-axis'">
      <line x1="12" y1="3" x2="12" y2="21" stroke="#38bdf8" stroke-width="1.5" stroke-linecap="round" />
      <line x1="3" y1="12" x2="21" y2="12" stroke="#ef4444" stroke-width="1.5" stroke-linecap="round" />
      <line x1="6" y1="18" x2="18" y2="6" stroke="#10b981" stroke-width="1.5" stroke-linecap="round" />
      <circle cx="12" cy="12" r="2" fill="currentColor" opacity="0.6" />
    </g>

    <!-- MODIFIER MIRROR (Blender Butterfly / Symmetry Icon) -->
    <g v-else-if="name === 'modifier-mirror'">
      <line x1="12" y1="3" x2="12" y2="21" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 2" opacity="0.6" />
      <polygon points="10,6 4,12 10,18" stroke="#38bdf8" stroke-width="1.5" fill="#38bdf8" fill-opacity="0.2" />
      <polygon points="14,6 20,12 14,18" stroke="#38bdf8" stroke-width="1.5" fill="#38bdf8" fill-opacity="0.2" />
    </g>

    <!-- IK SOLVER ICON (Blender Bone with Target) -->
    <g v-else-if="name === 'ik'">
      <polygon points="9,5 12,8 9,18 6,8" stroke="#f59e0b" stroke-width="1.4" fill="#f59e0b" fill-opacity="0.25" />
      <circle cx="17" cy="17" r="4" stroke="#38bdf8" stroke-width="1.4" fill="none" />
      <line x1="17" y1="11" x2="17" y2="23" stroke="#38bdf8" stroke-width="1.2" />
      <line x1="11" y1="17" x2="23" y2="17" stroke="#38bdf8" stroke-width="1.2" />
    </g>

    <g v-else-if="name === 'keyframe'">
      <polygon points="12,4 19,12 12,20 5,12" fill="#eab308" stroke="#ca8a04" stroke-width="1.5" />
    </g>

    <g v-else-if="name === 'play'">
      <path d="M8 5L19 12L8 19V5Z" fill="currentColor" />
    </g>

    <g v-else-if="name === 'pause'">
      <rect x="6" y="5" width="4.5" height="14" rx="0.8" fill="currentColor" />
      <rect x="13.5" y="5" width="4.5" height="14" rx="0.8" fill="currentColor" />
    </g>

    <g v-else-if="name === 'skip-start'">
      <rect x="4.5" y="5" width="2.2" height="14" rx="0.4" fill="currentColor" />
      <path d="M19.5 5L8.5 12L19.5 19V5Z" fill="currentColor" />
    </g>

    <g v-else-if="name === 'skip-end'">
      <path d="M4.5 5L15.5 12L4.5 19V5Z" fill="currentColor" />
      <rect x="17.3" y="5" width="2.2" height="14" rx="0.4" fill="currentColor" />
    </g>

    <g v-else-if="name === 'record'">
      <circle cx="12" cy="12" r="7.5" fill="#e11d48" />
    </g>

    <g v-else-if="name === 'film'">
      <rect x="3" y="5" width="18" height="14" rx="1.5" stroke="currentColor" stroke-width="1.5" fill="none" />
      <path d="M3 9H21M3 15H21" stroke="currentColor" stroke-width="1.4" />
      <path d="M7 5V9M12 5V9M17 5V9M7 15V19M12 15V19M17 15V19" stroke="currentColor" stroke-width="1.4" />
    </g>

    <g v-else-if="name === 'marker'">
      <path d="M7 4H17V13L12 16.5L7 13V4Z" fill="currentColor" />
      <path d="M12 16.5V21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    </g>

    <g v-else-if="name === 'onion-skin'">
      <rect x="4" y="6" width="12" height="12" rx="1.5" stroke="currentColor" stroke-width="1.4" fill="none" opacity="0.45" />
      <rect x="8" y="6" width="12" height="12" rx="1.5" stroke="currentColor" stroke-width="1.4" fill="currentColor" fill-opacity="0.18" />
    </g>

    <!-- UV / UV_DATA / TEXTURE (Blender Official UV Workspace Icon) -->
    <g v-else-if="name === 'uv' || name === 'uv-data'">
      <!-- 2D Texture Frame with rounded corners -->
      <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5" fill="none" />
      <!-- Checkerboard UV background quadrants -->
      <rect x="3.5" y="3.5" width="8.5" height="8.5" fill="currentColor" fill-opacity="0.2" />
      <rect x="12" y="12" width="8.5" height="8.5" fill="currentColor" fill-opacity="0.2" />
      <!-- UV Face Wireframe Island with orange vertices -->
      <polygon points="6,18 12,6 18,14" stroke="#38bdf8" stroke-width="1.5" fill="#38bdf8" fill-opacity="0.25" stroke-linejoin="round" />
      <circle cx="6" cy="18" r="1.5" fill="#f59e0b" />
      <circle cx="12" cy="6" r="1.5" fill="#f59e0b" />
      <circle cx="18" cy="14" r="1.5" fill="#f59e0b" />
    </g>

    <!-- Paint / pixel tools: filled 24-grid silhouettes (readable at toolbar size) -->
    <g v-else-if="name === 'brush' || name === 'draw' || name === 'tool-draw' || name === 'paint'" transform="scale(0.09375)">
      <path fill="currentColor" d="M227.31,73.37,182.63,28.68a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31L227.31,96a16,16,0,0,0,0-22.63ZM192,108.68,147.31,64l24-24L216,84.68Z" />
    </g>

    <g v-else-if="name === 'fill'" transform="scale(0.09375)">
      <path fill="currentColor" d="M256,208a24,24,0,0,1-48,0c0-17.91,15.57-41.77,17.34-44.44a8,8,0,0,1,13.32,0C240.43,166.23,256,190.09,256,208ZM132.49,124.49a12,12,0,0,0-17-17l0,0s0,0,0,0a12,12,0,0,0,17,16.94ZM37.65,18.34A8,8,0,0,0,26.34,29.66l32.6,32.6L70.25,51ZM234.53,139.07a8,8,0,0,0,3.13-13.24L122.17,10.34a8,8,0,0,0-11.31,0L70.25,51l40.43,40.42a28,28,0,1,1-11.31,11.32L58.94,62.26,15,106.17a24,24,0,0,0,0,33.94L99.89,225a24,24,0,0,0,33.94,0l78.49-78.49Z" />
    </g>

    <g v-else-if="name === 'eraser'" transform="scale(0.09375)">
      <path fill="currentColor" d="M225,80.4,183.6,39a24,24,0,0,0-33.94,0L31,157.66a24,24,0,0,0,0,33.94l30.06,30.06A8,8,0,0,0,66.74,224H216a8,8,0,0,0,0-16h-84.7L225,114.34A24,24,0,0,0,225,80.4ZM213.67,103,160,156.69,107.31,104,161,50.34a8,8,0,0,1,11.32,0l41.38,41.38a8,8,0,0,1,0,11.31Z" />
    </g>

    <g v-else-if="name === 'picker'" transform="scale(0.09375)">
      <path fill="currentColor" d="M224,67.3a35.79,35.79,0,0,0-11.26-25.66c-14-13.28-36.72-12.78-50.62,1.13L138.8,66.2a24,24,0,0,0-33.14.77l-5,5a16,16,0,0,0,0,22.64l2,2.06-51,51a39.75,39.75,0,0,0-10.53,38l-8,18.41A13.68,13.68,0,0,0,36,219.3a15.92,15.92,0,0,0,17.71,3.35L71.23,215a39.89,39.89,0,0,0,37.06-10.75l51-51,2.06,2.06a16,16,0,0,0,22.62,0l5-5a24,24,0,0,0,.74-33.18l23.75-23.87A35.75,35.75,0,0,0,224,67.3ZM97,193a24,24,0,0,1-24,6,8,8,0,0,0-5.55.31l-18.1,7.91L57,189.41a8,8,0,0,0,.25-5.75A23.88,23.88,0,0,1,63,159l51-51,33.94,34Z" />
    </g>

    <g v-else-if="name === 'dither'" transform="scale(0.09375)">
      <path fill="currentColor" d="M208,32H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32Zm0,176H128V128H48V48h80v80h80v80Z" />
    </g>

    <g v-else-if="name === 'line'" transform="scale(0.09375)">
      <path fill="currentColor" d="M214.64,41.36a32,32,0,0,0-50.2,38.89L80.25,164.44a32.06,32.06,0,0,0-38.89,4.94h0a32,32,1,0,0,50.2,6.37l84.19-84.19a32,32,0,0,0,38.89-50.2Zm-139.33,162a16,16,0,0,1-22.64-22.64h0a16,16,0,0,1,22.63,0h0A16,16,0,0,1,75.31,203.33Zm128-128a16,16,0,1,1,0-22.63A16,16,0,0,1,203.33,75.3Z" />
    </g>

    <g v-else-if="name === 'rect' || name === 'square'" transform="scale(0.09375)">
      <path fill="currentColor" d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,160H40V56H216V200Z" />
    </g>

    <g v-else-if="name === 'circle'" transform="scale(0.09375)">
      <path fill="currentColor" d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Z" />
    </g>

    <g v-else-if="name === 'shade'" transform="scale(0.09375)">
      <path fill="currentColor" d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24ZM40,128a88.1,88.1,0,0,1,88-88V216A88.1,88.1,0,0,1,40,128Z" />
    </g>

    <g v-else-if="name === 'swap-colors'" transform="scale(0.09375)">
      <path fill="currentColor" d="M42.34,85.66a8,8,0,0,1,0-11.32l32-32A8,8,0,0,1,88,48V72H208a8,8,0,0,1,0,16H88v24a8,8,0,0,1-13.66,5.66Zm171.32,84.68-32-32A8,8,0,0,0,168,144v24H48a8,8,0,0,0,0,16H168v24a8,8,0,0,0,13.66,5.66l32-32A8,8,0,0,0,213.66,170.34Z" />
    </g>

    <g v-else-if="name === 'marquee' || name === 'select-box'">
      <rect x="4" y="4" width="16" height="16" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 2" fill="none" />
    </g>

    <!-- MATERIAL (Official Blender Material Sphere) -->
    <g v-else-if="name === 'material'">
      <!-- Outer Sphere -->
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.5" />
      <!-- Checkerboard quadrants -->
      <path d="M12 3.5C7.3 3.5 3.5 7.3 3.5 12C3.5 12 7.5 12 12 12C12 7.5 12 3.5 12 3.5Z" fill="currentColor" fill-opacity="0.35" />
      <path d="M12 12C12 16.5 12 20.5 12 20.5C16.7 20.5 20.5 16.7 20.5 12C20.5 12 16.5 12 12 12Z" fill="currentColor" fill-opacity="0.6" />
      <!-- Specular Highlight -->
      <circle cx="9" cy="9" r="1.8" fill="currentColor" />
    </g>

    <!-- TEXTURE -->
    <g v-else-if="name === 'texture'">
      <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5" fill="none" />
      <circle cx="8.5" cy="8.5" r="2" fill="currentColor" />
      <path d="M21 15L16 10L5 21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
    </g>

    <!-- OUTLINER & UI -->
    <g v-else-if="name === 'eye-open'">
      <path d="M2 12C2 12 5.5 5 12 5C18.5 5 22 12 22 12C22 12 18.5 19 12 19C5.5 19 2 12 2 12Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    </g>

    <g v-else-if="name === 'eye-closed'">
      <path d="M2 12C2 12 5.5 5 12 5C18.5 5 22 12 22 12C22 12 18.5 19 12 19C5.5 19 2 12 2 12Z" stroke="currentColor" stroke-width="1.5" opacity="0.4" />
      <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    </g>

    <g v-else-if="name === 'lock'">
      <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" stroke-width="1.5" fill="currentColor" fill-opacity="0.1" />
      <path d="M8 11V7C8 4.79 9.79 3 12 3C14.21 3 16 4.79 16 7V11" stroke="currentColor" stroke-width="1.5" />
    </g>

    <g v-else-if="name === 'unlock'">
      <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" stroke-width="1.5" fill="none" opacity="0.5" />
      <path d="M8 11V7C8 4.79 9.79 3 12 3C14.21 3 16 4.79 16 7" stroke="currentColor" stroke-width="1.5" />
    </g>

    <g v-else-if="name === 'duplicate'">
      <rect x="8" y="8" width="12" height="12" rx="1.5" stroke="currentColor" stroke-width="1.5" fill="currentColor" fill-opacity="0.1" />
      <path d="M4 16V5C4 4.45 4.45 4 5 4H16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    </g>

    <g v-else-if="name === 'trash'">
      <path d="M4 7H20M10 11V17M14 11V17M5 7L6 19C6 20.1 6.9 21 8 21H16C17.1 21 18 20.1 18 19L19 7M9 7V4C9 3.45 9.45 3 10 3H14C14.55 3 15 3.45 15 4V7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
    </g>

    <g v-else-if="name === 'plus'">
      <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    </g>

    <g v-else-if="name === 'snap'">
      <path d="M6 3V11C6 14.3 8.7 17 12 17C15.3 17 18 14.3 18 11V3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
      <line x1="4" y1="7" x2="8" y2="7" stroke="currentColor" stroke-width="1.6" />
      <line x1="16" y1="7" x2="20" y2="7" stroke="currentColor" stroke-width="1.6" />
    </g>

    <g v-else-if="name === 'undo'">
      <path d="M8 7H5V4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M5 7C7.2 4.4 10.4 3 14 3C18.4 3 22 6.6 22 11C22 15.4 18.4 19 14 19C10.8 19 8 17.2 6.5 14.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
    </g>

    <g v-else-if="name === 'redo'">
      <path d="M16 7H19V4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M19 7C16.8 4.4 13.6 3 10 3C5.6 3 2 6.6 2 11C2 15.4 5.6 19 10 19C13.2 19 16 17.2 17.5 14.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
    </g>

    <g v-else-if="name === 'export'">
      <rect x="4" y="10" width="16" height="11" rx="1.5" stroke="currentColor" stroke-width="1.5" fill="none" />
      <path d="M12 14V3M12 3L8.5 6.5M12 3L15.5 6.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
    </g>

    <g v-else-if="name === 'import'">
      <rect x="4" y="10" width="16" height="11" rx="1.5" stroke="currentColor" stroke-width="1.5" fill="none" />
      <path d="M12 3V13M12 13L8.5 9.5M12 13L15.5 9.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
    </g>

    <g v-else-if="name === 'rotate-ccw'">
      <path d="M8 6H4V10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M4 10C5.6 6.8 8.6 5 12 5C16.4 5 20 8.6 20 13C20 17.4 16.4 21 12 21C8.8 21 6 19.1 4.7 16.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
    </g>

    <g v-else-if="name === 'rotate-cw'">
      <path d="M16 6H20V10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M20 10C18.4 6.8 15.4 5 12 5C7.6 5 4 8.6 4 13C4 17.4 7.6 21 12 21C15.2 21 18 19.1 19.3 16.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
    </g>

    <g v-else-if="name === 'flip-horizontal'">
      <path d="M11 4V20" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2 2" />
      <path d="M3 7L10 12L3 17V7Z" fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" />
      <path d="M21 7L14 12L21 17V7Z" fill="#f59e0b" fill-opacity="0.3" stroke="#f59e0b" stroke-width="1.4" stroke-linejoin="round" />
    </g>

    <g v-else-if="name === 'flip-vertical'">
      <path d="M4 12H20" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2 2" />
      <path d="M7 3L12 10L17 3H7Z" fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" />
      <path d="M7 21L12 14L17 21H7Z" fill="#f59e0b" fill-opacity="0.3" stroke="#f59e0b" stroke-width="1.4" stroke-linejoin="round" />
    </g>

    <g v-else-if="name === 'zoom-in'">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.6" fill="none" />
      <path d="M8.5 11H13.5M11 8.5V13.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      <path d="M16 16L21 21" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    </g>

    <g v-else-if="name === 'zoom-out'">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.6" fill="none" />
      <path d="M8.5 11H13.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      <path d="M16 16L21 21" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    </g>

    <g v-else-if="name === 'grid'">
      <rect x="3.5" y="3.5" width="17" height="17" rx="1" stroke="currentColor" stroke-width="1.4" fill="none" />
      <path d="M9.2 3.5V20.5M14.8 3.5V20.5M3.5 9.2H20.5M3.5 14.8H20.5" stroke="currentColor" stroke-width="1.3" />
    </g>

    <g v-else-if="name === 'quad-view'">
      <rect x="3.5" y="3.5" width="17" height="17" rx="1" stroke="currentColor" stroke-width="1.5" fill="none" />
      <path d="M12 3.5V20.5M3.5 12H20.5" stroke="currentColor" stroke-width="1.5" />
    </g>

    <g v-else-if="name === 'view-fit'">
      <rect x="6" y="6" width="12" height="12" rx="1" stroke="currentColor" stroke-width="1.4" fill="none" />
      <path d="M3 8V3H8M16 3H21V8M21 16V21H16M8 21H3V16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
    </g>

    <g v-else-if="name === 'maximize'">
      <path d="M8 4H4V8M16 4H20V8M20 16V20H16M8 20H4V16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
    </g>

    <g v-else-if="name === 'minimize'">
      <path d="M8 4H4V8M16 4H20V8M20 16V20H16M8 20H4V16" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" opacity="0.35" />
      <rect x="7" y="7" width="10" height="10" rx="1" stroke="currentColor" stroke-width="1.5" fill="none" />
    </g>

    <g v-else-if="name === 'pack-islands'">
      <rect x="3" y="3" width="18" height="18" rx="1.5" stroke="currentColor" stroke-width="1.4" fill="none" />
      <rect x="5" y="5" width="7" height="6" fill="#38bdf8" fill-opacity="0.35" stroke="#38bdf8" stroke-width="1.2" />
      <rect x="13.5" y="5" width="5.5" height="9" fill="#f59e0b" fill-opacity="0.3" stroke="#f59e0b" stroke-width="1.2" />
      <rect x="5" y="13" width="7" height="6" fill="currentColor" fill-opacity="0.2" stroke="currentColor" stroke-width="1.2" />
    </g>

    <g v-else-if="name === 'uv-smart'">
      <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.4" fill="none" />
      <polygon points="5.5,17 10,6 16,12.5" stroke="#38bdf8" stroke-width="1.3" fill="#38bdf8" fill-opacity="0.22" stroke-linejoin="round" />
      <path d="M16 5.5L17.2 8L20 8.3L18 10.2L18.5 13L16 11.6L13.5 13L14 10.2L12 8.3L14.8 8Z" fill="#f59e0b" />
    </g>

    <g v-else-if="name === 'cursor-select'">
      <path d="M5 3L5 18L9.2 14.2L12.2 21L14.6 20L11.6 13.3L17 13.3L5 3Z" fill="currentColor" />
    </g>

    <g v-else-if="name === 'chevron-down'">
      <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </g>

    <g v-else-if="name === 'chevron-left'">
      <path d="M15 6L9 12L15 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </g>

    <g v-else-if="name === 'chevron-right'">
      <path d="M9 6L15 12L9 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </g>

    <g v-else-if="name === 'search'">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.6" fill="none" />
      <path d="M16 16L21 21" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    </g>

    <g v-else-if="name === 'save'">
      <path d="M5 4H16L20 8V20H5V4Z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round" />
      <rect x="8" y="13" width="8" height="7" fill="currentColor" fill-opacity="0.2" />
      <rect x="8" y="4" width="7" height="5" fill="currentColor" fill-opacity="0.25" />
    </g>

    <g v-else-if="name === 'folder'">
      <path d="M3 7H9L11 9.5H21V19H3V7Z" stroke="currentColor" stroke-width="1.5" fill="currentColor" fill-opacity="0.12" stroke-linejoin="round" />
      <path d="M3 7V5.5H8L9.5 7" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
    </g>

    <g v-else-if="name === 'close'">
      <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    </g>

    <g v-else-if="name === 'warning'">
      <path d="M12 3L22 20H2L12 3Z" stroke="#f59e0b" stroke-width="1.5" fill="#f59e0b" fill-opacity="0.2" stroke-linejoin="round" />
      <path d="M12 9V13.5" stroke="#f59e0b" stroke-width="1.7" stroke-linecap="round" />
      <circle cx="12" cy="16.8" r="1" fill="#f59e0b" />
    </g>

    <g v-else-if="name === 'check'">
      <path d="M5 12.5L10 17.5L19 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </g>

    <g v-else-if="name === 'settings'">
      <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.5" fill="none" />
      <path d="M12 3.5V6.2M12 17.8V20.5M20.5 12H17.8M6.2 12H3.5M18.1 5.9L16.2 7.8M7.8 16.2L5.9 18.1M18.1 18.1L16.2 16.2M7.8 7.8L5.9 5.9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    </g>

    <g v-else-if="name === 'sidebar'">
      <rect x="3" y="4" width="18" height="16" rx="1.5" stroke="currentColor" stroke-width="1.5" fill="none" />
      <path d="M15 4V20" stroke="currentColor" stroke-width="1.5" />
      <rect x="15.5" y="4.5" width="5" height="15" fill="#f59e0b" fill-opacity="0.25" />
    </g>

    <g v-else-if="name === 'link'">
      <path d="M9.5 14.5L14.5 9.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
      <path d="M8 11.5L5.8 13.7C4.3 15.2 4.3 17.6 5.8 19.1C7.3 20.6 9.7 20.6 11.2 19.1L13.5 16.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      <path d="M16 12.5L18.2 10.3C19.7 8.8 19.7 6.4 18.2 4.9C16.7 3.4 14.3 3.4 12.8 4.9L10.5 7.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    </g>

    <g v-else-if="name === 'image'">
      <rect x="3" y="5" width="18" height="14" rx="1.5" stroke="currentColor" stroke-width="1.5" fill="none" />
      <circle cx="8.5" cy="10" r="1.8" fill="currentColor" />
      <path d="M21 16L15.5 11L7 19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
    </g>

    <g v-else-if="name === 'modifier'">
      <rect x="4" y="4" width="16" height="16" rx="1.5" stroke="currentColor" stroke-width="1.5" fill="none" />
      <path d="M8 12H16M12 8V16" stroke="#38bdf8" stroke-width="1.6" stroke-linecap="round" />
      <circle cx="8" cy="8" r="1.3" fill="#f59e0b" />
      <circle cx="16" cy="16" r="1.3" fill="#f59e0b" />
    </g>

    <g v-else-if="name === 'tools'">
      <path d="M14.5 3.5L16 5L9 12L7.5 10.5L14.5 3.5Z" stroke="#f59e0b" stroke-width="1.5" fill="#f59e0b" fill-opacity="0.25" />
      <path d="M7 13.5L4 20L10.5 17" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round" />
      <path d="M15 14.5H20V17.5C20 19 18.5 20 17.5 20C16.5 20 15.5 19.2 15.5 18V16" stroke="#38bdf8" stroke-width="1.5" fill="none" stroke-linecap="round" />
    </g>

    <g v-else-if="name === 'layers'">
      <path d="M12 4L21 8.5L12 13L3 8.5L12 4Z" stroke="currentColor" stroke-width="1.4" fill="currentColor" fill-opacity="0.15" stroke-linejoin="round" />
      <path d="M3 12L12 16.5L21 12" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" />
      <path d="M3 15.5L12 20L21 15.5" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" />
    </g>

    <g v-else-if="name === 'display'">
      <rect x="3" y="4" width="18" height="12" rx="1.5" stroke="currentColor" stroke-width="1.5" fill="none" />
      <path d="M8 20H16M12 16V20" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      <rect x="5.5" y="6.5" width="13" height="7" fill="currentColor" fill-opacity="0.12" />
    </g>

    <g v-else-if="name === 'keyframe-map'">
      <rect x="3" y="5" width="18" height="14" rx="1.5" stroke="currentColor" stroke-width="1.4" fill="none" />
      <path d="M6 9H10M6 12H14M6 15H11" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
      <circle cx="17" cy="12" r="2.2" fill="#eab308" />
    </g>

    <g v-else-if="name === 'keyboard'">
      <rect x="2" y="7" width="20" height="11" rx="1.5" stroke="currentColor" stroke-width="1.5" fill="none" />
      <path d="M5 10H7M9 10H11M13 10H15M17 10H19M5 13H8M10 13H14M16 13H19M8 16H16" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
    </g>
  </svg>
</template>
