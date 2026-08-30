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
    // Modeling tools
    | 'tool-extrude' 
    | 'tool-inset' 
    | 'tool-bevel'
    | 'tool-subdivide' 
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
    | 'armature'
    | 'pose'
    | 'keyframe'
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
    <g v-else-if="name === 'tool-subdivide'">
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

    <g v-else-if="name === 'keyframe'">
      <polygon points="12,4 19,12 12,20 5,12" fill="#eab308" stroke="#ca8a04" stroke-width="1.5" />
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

    <!-- DRAW & BRUSH (Exact Official Blender UI Draw / Grease Pencil / Annotate Icon) -->
    <g v-else-if="name === 'brush' || name === 'draw' || name === 'tool-draw' || name === 'paint'">
      <!-- Rounded Top Eraser Cap -->
      <path 
        d="M15.8 8.2L18.6 5.4C19.6 4.4 21.2 4.4 22.2 5.4C23.2 6.4 23.2 8.0 22.2 9.0L19.4 11.8L15.8 8.2Z" 
        fill="currentColor" 
      />
      <!-- Pencil Body & Sharp Tapered Tip -->
      <path 
        d="M14.2 9.8L17.8 13.4L11.6 19.6L4.5 21.5L6.4 14.4L14.2 9.8Z" 
        fill="currentColor" 
      />
    </g>

    <g v-else-if="name === 'fill'">
      <path d="M19 11L13 5L5 13L11 19L19 11Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
      <path d="M5 13L2 16C2 16 3 19 6 19C9 19 10 17 11 17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      <path d="M21 16C21 17.5 19.5 19 19.5 19C19.5 19 18 17.5 18 16C18 15 19 14 19.5 14C20 14 21 15 21 16Z" fill="#38bdf8" stroke="#38bdf8" />
    </g>

    <g v-else-if="name === 'eraser'">
      <path d="M16 4L20 8L11 17H7V13L16 4Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
      <path d="M7 17L4 20H15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    </g>

    <g v-else-if="name === 'picker'">
      <path d="M18 3L21 6L14 13L11 10L18 3Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
      <path d="M11 10L6 15V18H9L14 13" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
      <line x1="6" y1="18" x2="3" y2="21" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    </g>

    <g v-else-if="name === 'dither'">
      <rect x="4" y="4" width="4" height="4" fill="currentColor" />
      <rect x="12" y="4" width="4" height="4" fill="currentColor" />
      <rect x="8" y="8" width="4" height="4" fill="currentColor" />
      <rect x="16" y="8" width="4" height="4" fill="currentColor" />
      <rect x="4" y="12" width="4" height="4" fill="currentColor" />
      <rect x="12" y="12" width="4" height="4" fill="currentColor" />
      <rect x="8" y="16" width="4" height="4" fill="currentColor" />
      <rect x="16" y="16" width="4" height="4" fill="currentColor" />
    </g>

    <g v-else-if="name === 'line'">
      <line x1="4" y1="20" x2="20" y2="4" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </g>

    <g v-else-if="name === 'rect' || name === 'square'">
      <rect x="4" y="4" width="16" height="16" rx="1" fill="none" stroke="currentColor" stroke-width="1.8" />
    </g>

    <g v-else-if="name === 'circle'">
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8" />
    </g>

    <g v-else-if="name === 'shade'">
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.5" />
      <path d="M12 4A8 8 0 0 1 12 20Z" fill="currentColor" />
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
  </svg>
</template>
