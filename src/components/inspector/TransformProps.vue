<script setup lang="ts">
import { computed } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { useAnimationStore } from '../../stores/animationStore'
import { useToolStore } from '../../stores/toolStore'
import { computeCentroid } from '../../utils/math'
import { getMeshEdges } from '../../core/geometry/EdgeUtils'
import { applyMirror } from '../../core/geometry/MirrorModifier'
import { Vector3D } from '../../types/mesh'
import { 
  Copy, 
  FlipHorizontal, 
  Crosshair, 
  Move,
  RotateCw,
  Maximize2,
  Check,
  Trash2,
  Eye,
  EyeOff,
  Sparkles
} from 'lucide-vue-next'

const projectStore = useProjectStore()
const animationStore = useAnimationStore()
const toolStore = useToolStore()

const activeItem = computed(() => {
  if (toolStore.appMode === 'animate') {
    return animationStore.selectedBone
  }
  return projectStore.activeMesh
})

const activeMesh = computed(() => projectStore.activeMesh)

function updateTransform() {
  projectStore.recordState('Transform Input')
}

function handleDuplicateMesh() {
  if (!activeMesh.value) return
  projectStore.recordState('Duplicate Mesh')
  const cloned = JSON.parse(JSON.stringify(activeMesh.value))
  cloned.id = `mesh_${Math.random().toString(36).substring(2, 8)}`
  cloned.name = `${activeMesh.value.name}_Copy`
  cloned.position.x += 0.5
  projectStore.meshes.push(cloned)
  projectStore.activeMeshId = cloned.id
}

function handleMirrorX() {
  if (!activeMesh.value) return
  projectStore.recordState('Mirror X')
  for (const v of activeMesh.value.vertices) {
    v.position.x = -v.position.x
  }
  for (const f of activeMesh.value.faces) {
    f.vertexIds.reverse()
    f.uvs.reverse()
  }
}

// ---------------------------------------------
// BLOCKBENCH-STYLE ORIGIN / PIVOT PRESETS
// ---------------------------------------------
function offsetOrigin(dx: number, dy: number, dz: number) {
  const mesh = activeMesh.value
  if (!mesh) return

  for (const v of mesh.vertices) {
    v.position.x -= dx
    v.position.y -= dy
    v.position.z -= dz
  }
  mesh.position.x += dx
  mesh.position.y += dy
  mesh.position.z += dz
}

function setOriginToCenter() {
  const mesh = activeMesh.value
  if (!mesh || mesh.vertices.length === 0) return
  projectStore.recordState('Origin to Center')

  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  let minZ = Infinity, maxZ = -Infinity

  for (const v of mesh.vertices) {
    if (v.position.x < minX) minX = v.position.x
    if (v.position.x > maxX) maxX = v.position.x
    if (v.position.y < minY) minY = v.position.y
    if (v.position.y > maxY) maxY = v.position.y
    if (v.position.z < minZ) minZ = v.position.z
    if (v.position.z > maxZ) maxZ = v.position.z
  }

  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const cz = (minZ + maxZ) / 2

  offsetOrigin(cx, cy, cz)
}

function setOriginToBottom() {
  const mesh = activeMesh.value
  if (!mesh || mesh.vertices.length === 0) return
  projectStore.recordState('Origin to Bottom')

  let minX = Infinity, maxX = -Infinity
  let minY = Infinity
  let minZ = Infinity, maxZ = -Infinity

  for (const v of mesh.vertices) {
    if (v.position.x < minX) minX = v.position.x
    if (v.position.x > maxX) maxX = v.position.x
    if (v.position.y < minY) minY = v.position.y
    if (v.position.z < minZ) minZ = v.position.z
    if (v.position.z > maxZ) maxZ = v.position.z
  }

  const cx = (minX + maxX) / 2
  const cy = minY
  const cz = (minZ + maxZ) / 2

  offsetOrigin(cx, cy, cz)
}

function setOriginToTop() {
  const mesh = activeMesh.value
  if (!mesh || mesh.vertices.length === 0) return
  projectStore.recordState('Origin to Top')

  let minX = Infinity, maxX = -Infinity
  let maxY = -Infinity
  let minZ = Infinity, maxZ = -Infinity

  for (const v of mesh.vertices) {
    if (v.position.x < minX) minX = v.position.x
    if (v.position.x > maxX) maxX = v.position.x
    if (v.position.y > maxY) maxY = v.position.y
    if (v.position.z < minZ) minZ = v.position.z
    if (v.position.z > maxZ) maxZ = v.position.z
  }

  const cx = (minX + maxX) / 2
  const cy = maxY
  const cz = (minZ + maxZ) / 2

  offsetOrigin(cx, cy, cz)
}

function setOriginToWorldZero() {
  const mesh = activeMesh.value
  if (!mesh) return
  projectStore.recordState('Origin to World Zero')

  const dx = -mesh.position.x
  const dy = -mesh.position.y
  const dz = -mesh.position.z

  offsetOrigin(dx, dy, dz)
}

function setOriginToSelection() {
  const mesh = activeMesh.value
  if (!mesh) return

  let targetVerts: Vector3D[] = []

  if (toolStore.selectMode === 'vertex' && projectStore.selectedVertexIds.length > 0) {
    targetVerts = mesh.vertices.filter(v => projectStore.selectedVertexIds.includes(v.id)).map(v => v.position)
  } else if (toolStore.selectMode === 'edge' && projectStore.selectedEdgeIds.length > 0) {
    const allEdges = getMeshEdges(mesh)
    const vertMap = new Map(mesh.vertices.map(v => [v.id, v]))
    for (const e of allEdges) {
      if (projectStore.selectedEdgeIds.includes(e.id)) {
        const v1 = vertMap.get(e.v1)
        const v2 = vertMap.get(e.v2)
        if (v1) targetVerts.push(v1.position)
        if (v2) targetVerts.push(v2.position)
      }
    }
  } else if (toolStore.selectMode === 'face' && projectStore.selectedFaceIds.length > 0) {
    const vertMap = new Map(mesh.vertices.map(v => [v.id, v]))
    for (const f of mesh.faces) {
      if (projectStore.selectedFaceIds.includes(f.id)) {
        f.vertexIds.forEach(id => {
          const v = vertMap.get(id)
          if (v) targetVerts.push(v.position)
        })
      }
    }
  }

  if (targetVerts.length === 0) return
  projectStore.recordState('Origin to Selection')
  const centroid = computeCentroid(targetVerts)
  offsetOrigin(centroid.x, centroid.y, centroid.z)
}

function handleGeometryToOrigin() {
  const mesh = activeMesh.value
  if (!mesh || mesh.vertices.length === 0) return
  projectStore.recordState('Geometry to Origin')

  let cx = 0, cy = 0, cz = 0
  for (const v of mesh.vertices) {
    cx += v.position.x
    cy += v.position.y
    cz += v.position.z
  }
  cx /= mesh.vertices.length
  cy /= mesh.vertices.length
  cz /= mesh.vertices.length

  for (const v of mesh.vertices) {
    v.position.x -= cx
    v.position.y -= cy
    v.position.z -= cz
  }
}

// ---------------------------------------------
// BLENDER-STYLE MIRROR MODIFIER CONTROLS
// ---------------------------------------------
function enableMirrorModifier() {
  const mesh = activeMesh.value
  if (!mesh) return
  projectStore.recordState('Add Mirror Modifier')

  if (!mesh.mirror) {
    mesh.mirror = {
      enabled: true,
      axisX: true,
      axisY: false,
      axisZ: false,
      clipping: true,
      merge: true,
      mergeThreshold: 0.01,
      flipU: false,
      flipV: false
    }
  } else {
    mesh.mirror.enabled = true
  }
}

function handleApplyMirrorModifier() {
  const mesh = activeMesh.value
  if (!mesh || !mesh.mirror) return
  projectStore.recordState('Apply Mirror Modifier')
  applyMirror(mesh)
}

function removeMirrorModifier() {
  const mesh = activeMesh.value
  if (!mesh || !mesh.mirror) return
  projectStore.recordState('Remove Mirror Modifier')
  mesh.mirror.enabled = false
}
</script>

<template>
  <div class="bg-dcc-850 border border-dcc-750 rounded-lg p-2.5 flex flex-col space-y-3 select-none text-xs">
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-dcc-750 pb-1.5">
      <span class="font-bold text-slate-300 uppercase tracking-wider font-mono text-[11px]">Transform</span>
      <span class="font-mono text-amber-400 truncate max-w-[120px]">{{ activeItem?.name || 'None' }}</span>
    </div>

    <div v-if="activeItem" class="flex flex-col space-y-3">
      <!-- Quick Object Utility Actions -->
      <div v-if="toolStore.appMode === 'model'" class="grid grid-cols-2 gap-1.5">
        <button 
          @click="handleDuplicateMesh" 
          class="flex items-center justify-center gap-1.5 py-1.5 rounded bg-dcc-800 hover:bg-dcc-750 text-slate-200 font-mono text-[10px] border border-dcc-700 transition shadow-sm"
          title="Duplicate active object"
        >
          <Copy class="w-3 h-3 text-indigo-400" />
          <span>Duplicate</span>
        </button>
        <button 
          @click="handleMirrorX" 
          class="flex items-center justify-center gap-1.5 py-1.5 rounded bg-dcc-800 hover:bg-dcc-750 text-slate-200 font-mono text-[10px] border border-dcc-700 transition shadow-sm"
          title="Mirror X Axis Immediately"
        >
          <FlipHorizontal class="w-3 h-3 text-emerald-400" />
          <span>Flip Mirror X</span>
        </button>
      </div>

      <!-- 1. Position (X, Y, Z) -->
      <div class="flex flex-col space-y-1">
        <span class="text-[10px] uppercase font-bold text-slate-400 font-mono flex items-center gap-1">
          <Move class="w-3 h-3 text-indigo-400" />
          <span>Location / Pos</span>
        </span>
        <div class="grid grid-cols-3 gap-1.5">
          <div class="flex items-center bg-dcc-900 border border-dcc-700 rounded px-1.5 py-0.5">
            <span class="text-rose-400 font-bold font-mono text-[10px] mr-1">X</span>
            <input 
              type="number" 
              step="0.1" 
              v-model.number="activeItem.position.x" 
              @change="updateTransform"
              class="w-full bg-transparent text-slate-200 font-mono text-xs focus:outline-none" 
            />
          </div>
          <div class="flex items-center bg-dcc-900 border border-dcc-700 rounded px-1.5 py-0.5">
            <span class="text-emerald-400 font-bold font-mono text-[10px] mr-1">Y</span>
            <input 
              type="number" 
              step="0.1" 
              v-model.number="activeItem.position.y" 
              @change="updateTransform"
              class="w-full bg-transparent text-slate-200 font-mono text-xs focus:outline-none" 
            />
          </div>
          <div class="flex items-center bg-dcc-900 border border-dcc-700 rounded px-1.5 py-0.5">
            <span class="text-sky-400 font-bold font-mono text-[10px] mr-1">Z</span>
            <input 
              type="number" 
              step="0.1" 
              v-model.number="activeItem.position.z" 
              @change="updateTransform"
              class="w-full bg-transparent text-slate-200 font-mono text-xs focus:outline-none" 
            />
          </div>
        </div>
      </div>

      <!-- 2. Rotation (X, Y, Z) -->
      <div class="flex flex-col space-y-1">
        <span class="text-[10px] uppercase font-bold text-slate-400 font-mono flex items-center gap-1">
          <RotateCw class="w-3 h-3 text-emerald-400" />
          <span>Rotation (Deg)</span>
        </span>
        <div class="grid grid-cols-3 gap-1.5">
          <div class="flex items-center bg-dcc-900 border border-dcc-700 rounded px-1.5 py-0.5">
            <span class="text-rose-400 font-bold font-mono text-[10px] mr-1">X</span>
            <input 
              type="number" 
              step="5" 
              v-model.number="activeItem.rotation.x" 
              @change="updateTransform"
              class="w-full bg-transparent text-slate-200 font-mono text-xs focus:outline-none" 
            />
          </div>
          <div class="flex items-center bg-dcc-900 border border-dcc-700 rounded px-1.5 py-0.5">
            <span class="text-emerald-400 font-bold font-mono text-[10px] mr-1">Y</span>
            <input 
              type="number" 
              step="5" 
              v-model.number="activeItem.rotation.y" 
              @change="updateTransform"
              class="w-full bg-transparent text-slate-200 font-mono text-xs focus:outline-none" 
            />
          </div>
          <div class="flex items-center bg-dcc-900 border border-dcc-700 rounded px-1.5 py-0.5">
            <span class="text-sky-400 font-bold font-mono text-[10px] mr-1">Z</span>
            <input 
              type="number" 
              step="5" 
              v-model.number="activeItem.rotation.z" 
              @change="updateTransform"
              class="w-full bg-transparent text-slate-200 font-mono text-xs focus:outline-none" 
            />
          </div>
        </div>
      </div>

      <!-- 3. Scale (X, Y, Z) -->
      <div class="flex flex-col space-y-1">
        <span class="text-[10px] uppercase font-bold text-slate-400 font-mono flex items-center gap-1">
          <Maximize2 class="w-3 h-3 text-sky-400" />
          <span>Scale</span>
        </span>
        <div class="grid grid-cols-3 gap-1.5">
          <div class="flex items-center bg-dcc-900 border border-dcc-700 rounded px-1.5 py-0.5">
            <span class="text-rose-400 font-bold font-mono text-[10px] mr-1">X</span>
            <input 
              type="number" 
              step="0.1" 
              v-model.number="activeItem.scale.x" 
              @change="updateTransform"
              class="w-full bg-transparent text-slate-200 font-mono text-xs focus:outline-none" 
            />
          </div>
          <div class="flex items-center bg-dcc-900 border border-dcc-700 rounded px-1.5 py-0.5">
            <span class="text-emerald-400 font-bold font-mono text-[10px] mr-1">Y</span>
            <input 
              type="number" 
              step="0.1" 
              v-model.number="activeItem.scale.y" 
              @change="updateTransform"
              class="w-full bg-transparent text-slate-200 font-mono text-xs focus:outline-none" 
            />
          </div>
          <div class="flex items-center bg-dcc-900 border border-dcc-700 rounded px-1.5 py-0.5">
            <span class="text-sky-400 font-bold font-mono text-[10px] mr-1">Z</span>
            <input 
              type="number" 
              step="0.1" 
              v-model.number="activeItem.scale.z" 
              @change="updateTransform"
              class="w-full bg-transparent text-slate-200 font-mono text-xs focus:outline-none" 
            />
          </div>
        </div>
      </div>

      <!-- 4. BLOCKBENCH ANIMATION POSE CONTROLS & KEYFRAMING -->
      <div v-if="toolStore.appMode === 'animate'" class="pt-2 border-t border-dcc-750 flex flex-col space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-[10px] uppercase font-bold text-amber-400 font-mono flex items-center gap-1">
            <Sparkles class="w-3.5 h-3.5" />
            <span>Blockbench Pose Tools</span>
          </span>
          <span class="text-[9px] font-mono text-slate-400">Frame {{ animationStore.currentFrame }}</span>
        </div>

        <!-- Pose Clipboard & Reset -->
        <div class="grid grid-cols-2 gap-1.5">
          <button 
            @click="animationStore.copyPose"
            class="py-1.5 px-2 rounded bg-dcc-800 hover:bg-dcc-750 border border-dcc-700 text-slate-200 font-mono text-[10px] flex items-center justify-center space-x-1 transition shadow-xs"
            title="Copy current frame pose to clipboard"
          >
            <span>Copy Pose</span>
          </button>
          <button 
            @click="animationStore.pastePose"
            class="py-1.5 px-2 rounded bg-dcc-800 hover:bg-dcc-750 border border-dcc-700 text-indigo-300 font-mono text-[10px] flex items-center justify-center space-x-1 transition shadow-xs"
            title="Paste pose onto active frame"
          >
            <span>Paste Pose</span>
          </button>
          <button 
            @click="animationStore.pasteFlippedPose"
            class="py-1.5 px-2 rounded bg-dcc-800 hover:bg-dcc-750 border border-dcc-700 text-amber-400 font-mono text-[10px] flex items-center justify-center space-x-1 transition shadow-xs"
            title="Paste flipped pose for symmetrical walk cycles"
          >
            <span>Paste Flipped</span>
          </button>
          <button 
            @click="animationStore.resetPose"
            class="py-1.5 px-2 rounded bg-dcc-800 hover:bg-dcc-750 border border-dcc-700 text-slate-400 hover:text-white font-mono text-[10px] flex items-center justify-center space-x-1 transition shadow-xs"
            title="Reset active element rotation & position to 0 (Alt+R)"
          >
            <span>Reset Pose</span>
          </button>
        </div>

        <!-- 1-Click Keyframe Active Target -->
        <button 
          @click="animationStore.recordCurrentKeyframe()"
          class="w-full py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-mono font-bold text-[10px] flex items-center justify-center space-x-1.5 shadow transition"
        >
          <span>Keyframe {{ activeItem.name }} (Frame {{ animationStore.currentFrame }})</span>
        </button>
      </div>

      <!-- 5. BLOCKBENCH ORIGIN / PIVOT CONTROL -->
      <div v-if="toolStore.appMode === 'model' && activeMesh" class="pt-2 border-t border-dcc-750 flex flex-col space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-[10px] uppercase font-bold text-amber-400 font-mono flex items-center gap-1">
            <Crosshair class="w-3.5 h-3.5" />
            <span>Origin / Pivot Point</span>
          </span>

          <button 
            @click="toolStore.selectMode = toolStore.selectMode === 'origin' ? 'object' : 'origin'"
            class="px-2 py-0.5 rounded text-[10px] font-mono transition border"
            :class="toolStore.selectMode === 'origin' ? 'bg-amber-500 text-slate-950 font-bold border-amber-400 shadow' : 'bg-dcc-800 text-slate-300 hover:text-white border-dcc-700'"
            title="Toggle interactive 3D pivot gizmo dragging (P / 5)"
          >
            {{ toolStore.selectMode === 'origin' ? 'Done' : 'Edit Pivot' }}
          </button>
        </div>

        <div class="grid grid-cols-3 gap-1 pt-0.5">
          <button 
            @click="setOriginToCenter"
            class="py-1 px-1.5 rounded bg-dcc-800 hover:bg-dcc-750 text-slate-200 text-[10px] font-mono border border-dcc-700 text-center transition"
            title="Snap origin to geometry center"
          >
            Center
          </button>
          <button 
            @click="setOriginToBottom"
            class="py-1 px-1.5 rounded bg-dcc-800 hover:bg-dcc-750 text-slate-200 text-[10px] font-mono border border-dcc-700 text-center transition"
            title="Snap origin to bottom center (ground)"
          >
            Bottom
          </button>
          <button 
            @click="setOriginToTop"
            class="py-1 px-1.5 rounded bg-dcc-800 hover:bg-dcc-750 text-slate-200 text-[10px] font-mono border border-dcc-700 text-center transition"
            title="Snap origin to top center"
          >
            Top
          </button>
          <button 
            @click="setOriginToWorldZero"
            class="py-1 px-1.5 rounded bg-dcc-800 hover:bg-dcc-750 text-slate-200 text-[10px] font-mono border border-dcc-700 text-center transition"
            title="Snap origin to world (0,0,0)"
          >
            World 0,0
          </button>
          <button 
            @click="setOriginToSelection"
            class="py-1 px-1.5 rounded bg-dcc-800 hover:bg-dcc-750 text-amber-300 text-[10px] font-mono border border-dcc-700 text-center transition"
            title="Snap origin to selected vertex/face"
          >
            To Selection
          </button>
          <button 
            @click="handleGeometryToOrigin"
            class="py-1 px-1.5 rounded bg-dcc-800 hover:bg-dcc-750 text-slate-200 text-[10px] font-mono border border-dcc-700 text-center transition"
            title="Center geometry vertices to current origin"
          >
            Geo to Orig
          </button>
        </div>
      </div>

      <!-- 5. BLENDER-STYLE LIVE MIRROR MODIFIER -->
      <div v-if="toolStore.appMode === 'model' && activeMesh" class="pt-2 border-t border-dcc-750 flex flex-col space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-[10px] uppercase font-bold text-indigo-400 font-mono flex items-center gap-1">
            <FlipHorizontal class="w-3.5 h-3.5" />
            <span>Mirror Modifier</span>
          </span>

          <button 
            v-if="!activeMesh.mirror?.enabled"
            @click="enableMirrorModifier"
            class="px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-[10px] font-bold shadow transition"
          >
            + Add Mirror
          </button>
          <div v-else class="flex items-center gap-1">
            <button 
              @click="activeMesh.mirror.enabled = !activeMesh.mirror.enabled"
              class="p-1 hover:bg-dcc-750 rounded text-slate-400 hover:text-white"
              :title="activeMesh.mirror.enabled ? 'Disable live preview' : 'Enable live preview'"
            >
              <Eye v-if="activeMesh.mirror.enabled" class="w-3 h-3 text-indigo-400" />
              <EyeOff v-else class="w-3 h-3 text-slate-600" />
            </button>
            <button 
              @click="removeMirrorModifier"
              class="p-1 hover:bg-rose-500/20 rounded text-slate-400 hover:text-rose-400"
              title="Remove Modifier"
            >
              <Trash2 class="w-3 h-3" />
            </button>
          </div>
        </div>

        <!-- Modifier Settings (When Enabled) -->
        <div v-if="activeMesh.mirror?.enabled" class="bg-dcc-900/90 border border-dcc-700 rounded p-2 flex flex-col space-y-2">
          <!-- Mirror Axis Toggles -->
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-mono text-slate-400">Axis</span>
            <div class="flex items-center gap-1">
              <button 
                @click="activeMesh.mirror.axisX = !activeMesh.mirror.axisX"
                class="px-2 py-0.5 rounded font-mono font-bold text-[10px] border transition"
                :class="activeMesh.mirror.axisX ? 'bg-rose-500/30 text-rose-300 border-rose-500/60' : 'bg-dcc-800 text-slate-500 border-dcc-700'"
              >
                X
              </button>
              <button 
                @click="activeMesh.mirror.axisY = !activeMesh.mirror.axisY"
                class="px-2 py-0.5 rounded font-mono font-bold text-[10px] border transition"
                :class="activeMesh.mirror.axisY ? 'bg-emerald-500/30 text-emerald-300 border-emerald-500/60' : 'bg-dcc-800 text-slate-500 border-dcc-700'"
              >
                Y
              </button>
              <button 
                @click="activeMesh.mirror.axisZ = !activeMesh.mirror.axisZ"
                class="px-2 py-0.5 rounded font-mono font-bold text-[10px] border transition"
                :class="activeMesh.mirror.axisZ ? 'bg-sky-500/30 text-sky-300 border-sky-500/60' : 'bg-dcc-800 text-slate-500 border-dcc-700'"
              >
                Z
              </button>
            </div>
          </div>

          <!-- Options: Clipping & Merge -->
          <div class="grid grid-cols-2 gap-2 pt-1 border-t border-dcc-750/60">
            <label class="flex items-center space-x-1.5 cursor-pointer text-[10px] font-mono text-slate-300">
              <input type="checkbox" v-model="activeMesh.mirror.clipping" class="rounded accent-indigo-500" />
              <span>Clipping</span>
            </label>

            <label class="flex items-center space-x-1.5 cursor-pointer text-[10px] font-mono text-slate-300">
              <input type="checkbox" v-model="activeMesh.mirror.merge" class="rounded accent-indigo-500" />
              <span>Merge Seam</span>
            </label>
          </div>

          <!-- Merge Threshold -->
          <div v-if="activeMesh.mirror.merge" class="space-y-1 pt-1">
            <div class="flex items-center justify-between text-[9px] font-mono text-slate-400">
              <span>Merge Distance</span>
              <span class="text-indigo-400">{{ (activeMesh.mirror.mergeThreshold * 100).toFixed(1) }}cm</span>
            </div>
            <input 
              type="range" 
              v-model.number="activeMesh.mirror.mergeThreshold" 
              min="0.001" 
              max="0.1" 
              step="0.002"
              class="w-full accent-indigo-500 bg-dcc-800 h-1.5 rounded appearance-none cursor-pointer"
            />
          </div>

          <!-- Flip UVs -->
          <div class="grid grid-cols-2 gap-2 pt-1 border-t border-dcc-750/60">
            <label class="flex items-center space-x-1.5 cursor-pointer text-[10px] font-mono text-slate-300">
              <input type="checkbox" v-model="activeMesh.mirror.flipU" class="rounded accent-indigo-500" />
              <span>Flip UV (U)</span>
            </label>

            <label class="flex items-center space-x-1.5 cursor-pointer text-[10px] font-mono text-slate-300">
              <input type="checkbox" v-model="activeMesh.mirror.flipV" class="rounded accent-indigo-500" />
              <span>Flip UV (V)</span>
            </label>
          </div>

          <!-- Apply Button -->
          <button 
            @click="handleApplyMirrorModifier"
            class="w-full py-1.5 mt-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-mono font-bold text-[10px] flex items-center justify-center space-x-1.5 shadow transition"
          >
            <Check class="w-3.5 h-3.5" />
            <span>Apply Modifier (Bake)</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
