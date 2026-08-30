<script setup lang="ts">
import { computed } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { useAnimationStore } from '../../stores/animationStore'
import { useToolStore } from '../../stores/toolStore'
import { computeCentroid } from '../../utils/math'
import { getMeshEdges } from '../../core/geometry/EdgeUtils'
import { Vector3D } from '../../types/mesh'
import UiSection from '../ui/UiSection.vue'
import UiNumberField from '../ui/UiNumberField.vue'
import UiButton from '../ui/UiButton.vue'
import { 
  Copy, 
  FlipHorizontal, 
  Crosshair, 
  Move,
  RotateCw,
  Maximize2
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
// ORIGIN / PIVOT PRESETS
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
</script>

<template>
  <div class="flex flex-col select-none text-xs font-sans">
    <!-- Active Object Identity Header -->
    <div class="h-7 bg-ui-header border-b border-ui-borderSubtle px-2.5 flex items-center justify-between">
      <div class="flex items-center space-x-1.5">
        <span class="w-1.5 h-1.5 rounded-full bg-ui-accent"></span>
        <span class="text-[11px] font-medium text-ui-textMuted">Object</span>
      </div>
      <span class="font-semibold text-ui-textPrimary truncate max-w-[150px]">{{ activeItem?.name || 'No Selection' }}</span>
    </div>

    <div v-if="activeItem" class="flex flex-col divide-y divide-ui-borderSubtle">
      <!-- 1. Transform Section -->
      <UiSection title="Transform" :default-open="true">
        <!-- Quick Actions -->
        <div v-if="toolStore.appMode === 'model'" class="grid grid-cols-2 gap-1.5 mb-2.5">
          <UiButton @click="handleDuplicateMesh" size="xs">
            <Copy class="w-3 h-3 text-ui-textMuted" />
            <span>Duplicate</span>
          </UiButton>
          <UiButton @click="handleMirrorX" size="xs">
            <FlipHorizontal class="w-3 h-3 text-ui-textMuted" />
            <span>Mirror X</span>
          </UiButton>
        </div>

        <!-- Location -->
        <div class="space-y-1">
          <div class="flex items-center text-[10px] text-ui-textSecondary font-medium gap-1">
            <Move class="w-3 h-3 text-ui-textMuted" />
            <span>Location</span>
          </div>
          <div class="grid grid-cols-3 gap-1">
            <UiNumberField v-model="activeItem.position.x" label="X" label-color="text-rose-400" @change="updateTransform" />
            <UiNumberField v-model="activeItem.position.y" label="Y" label-color="text-emerald-400" @change="updateTransform" />
            <UiNumberField v-model="activeItem.position.z" label="Z" label-color="text-sky-400" @change="updateTransform" />
          </div>
        </div>

        <!-- Rotation -->
        <div class="space-y-1 pt-1.5">
          <div class="flex items-center text-[10px] text-ui-textSecondary font-medium gap-1">
            <RotateCw class="w-3 h-3 text-ui-textMuted" />
            <span>Rotation (°)</span>
          </div>
          <div class="grid grid-cols-3 gap-1">
            <UiNumberField v-model="activeItem.rotation.x" label="X" label-color="text-rose-400" :step="1" :precision="1" @change="updateTransform" />
            <UiNumberField v-model="activeItem.rotation.y" label="Y" label-color="text-emerald-400" :step="1" :precision="1" @change="updateTransform" />
            <UiNumberField v-model="activeItem.rotation.z" label="Z" label-color="text-sky-400" :step="1" :precision="1" @change="updateTransform" />
          </div>
        </div>

        <!-- Scale -->
        <div class="space-y-1 pt-1.5">
          <div class="flex items-center text-[10px] text-ui-textSecondary font-medium gap-1">
            <Maximize2 class="w-3 h-3 text-ui-textMuted" />
            <span>Scale</span>
          </div>
          <div class="grid grid-cols-3 gap-1">
            <UiNumberField v-model="activeItem.scale.x" label="X" label-color="text-rose-400" :step="0.05" @change="updateTransform" />
            <UiNumberField v-model="activeItem.scale.y" label="Y" label-color="text-emerald-400" :step="0.05" @change="updateTransform" />
            <UiNumberField v-model="activeItem.scale.z" label="Z" label-color="text-sky-400" :step="0.05" @change="updateTransform" />
          </div>
        </div>
      </UiSection>

      <!-- 2. Origin / Pivot Section -->
      <UiSection v-if="toolStore.appMode === 'model'" title="Origin / Pivot" :default-open="false">
        <template #actions>
          <UiButton 
            size="xs" 
            :variant="toolStore.selectMode === 'origin' ? 'accent' : 'default'"
            @click="toolStore.selectMode = toolStore.selectMode === 'origin' ? 'object' : 'origin'"
          >
            <Crosshair class="w-3 h-3" />
            <span>{{ toolStore.selectMode === 'origin' ? 'Done' : 'Edit' }}</span>
          </UiButton>
        </template>

        <div class="grid grid-cols-3 gap-1">
          <UiButton @click="setOriginToCenter" size="xs">Center</UiButton>
          <UiButton @click="setOriginToBottom" size="xs">Bottom</UiButton>
          <UiButton @click="setOriginToTop" size="xs">Top</UiButton>
        </div>
        <div class="grid grid-cols-3 gap-1 pt-1">
          <UiButton @click="setOriginToWorldZero" size="xs">World 0,0</UiButton>
          <UiButton @click="setOriginToSelection" size="xs">To Selection</UiButton>
          <UiButton @click="handleGeometryToOrigin" size="xs">Geo to Orig</UiButton>
        </div>
      </UiSection>
    </div>

    <div v-else class="p-6 text-center text-ui-textMuted italic text-xs">
      No object or bone selected.
    </div>
  </div>
</template>
