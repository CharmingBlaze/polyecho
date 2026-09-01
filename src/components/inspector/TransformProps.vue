<script setup lang="ts">
import { computed } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { useAnimationStore } from '../../stores/animationStore'
import { useToolStore } from '../../stores/toolStore'
import UiSection from '../ui/UiSection.vue'
import UiNumberField from '../ui/UiNumberField.vue'
import UiButton from '../ui/UiButton.vue'
import { useLayoutStore } from '../../stores/layoutStore'
import { 
  Copy, 
  FlipHorizontal, 
  Crosshair, 
  Move,
  RotateCw,
  Maximize2,
  Image as ImageIcon,
  Palette,
  Link,
  Wrench,
  Eye,
  Box
} from 'lucide-vue-next'

const projectStore = useProjectStore()
const animationStore = useAnimationStore()
const toolStore = useToolStore()
const layoutStore = useLayoutStore()

const activeItem = computed(() => {
  if (toolStore.appMode === 'animate') {
    return animationStore.selectedBone
  }
  return projectStore.activeMesh
})

const activeMesh = computed(() => projectStore.activeMesh)

const activeMaterial = computed(() => {
  if (!activeMesh.value) return null
  const matId = activeMesh.value.materialId || 'default_material'
  return projectStore.materials.find(m => m.id === matId) || projectStore.materials[0]
})


function updateTransform() {
  projectStore.recordState('Transform Input')
  projectStore.markGeometryUpdated()
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
  projectStore.markGeometryUpdated()
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
  projectStore.markGeometryUpdated()
}

// ---------------------------------------------
// ORIGIN / PIVOT OPERATIONS
// ---------------------------------------------
function handleOriginPreset(preset: 'center' | 'bottom' | 'top' | 'min_x' | 'max_x' | 'min_z' | 'max_z' | 'world_zero' | 'selection') {
  if (!activeMesh.value) return
  projectStore.setOriginToPreset(activeMesh.value.id, preset)
}

function handleGeometryToOrigin() {
  if (!activeMesh.value) return
  projectStore.setGeometryToOrigin(activeMesh.value.id)
}

const parentOptions = computed(() => {
  const mesh = activeMesh.value
  if (!mesh) return []
  return projectStore.meshes.filter(m => m.id !== mesh.id && !projectStore.isDescendantOf(mesh.id, m.id))
})

function setParent(parentId: string) {
  if (!activeMesh.value) return
  if (!parentId) projectStore.unparentMesh(activeMesh.value.id)
  else projectStore.parentMesh(activeMesh.value.id, parentId)
}

function handleOriginNumericChange(axis: 'x' | 'y' | 'z', newPos: number) {
  if (!activeMesh.value) return
  const currentPos = activeMesh.value.position[axis]
  const delta = newPos - currentPos
  if (axis === 'x') projectStore.offsetMeshOrigin(activeMesh.value.id, delta, 0, 0, 'Edit Origin X')
  else if (axis === 'y') projectStore.offsetMeshOrigin(activeMesh.value.id, 0, delta, 0, 'Edit Origin Y')
  else if (axis === 'z') projectStore.offsetMeshOrigin(activeMesh.value.id, 0, 0, delta, 'Edit Origin Z')
}

function handleShade(mode: 'flat' | 'smooth' | 'auto') {
  projectStore.setShadeMode(mode)
}

function handleAutoSmoothAngle(angle: number) {
  projectStore.setAutoSmoothAngle(angle)
}

const objectShade = computed(() => activeMesh.value?.shadeMode || 'flat')
const autoSmoothAngle = computed(() => activeMesh.value?.autoSmoothAngle ?? 30)

function toggleOriginMode() {
  if (toolStore.selectMode === 'origin') {
    toolStore.selectMode = 'object'
  } else {
    if (!projectStore.activeMesh && projectStore.meshes.length > 0) {
      projectStore.activeMeshId = projectStore.meshes[0].id
      projectStore.selectedMeshIds = [projectStore.meshes[0].id]
    }
    toolStore.appMode = 'model'
    toolStore.selectMode = 'origin'
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
      <UiSection title="Transform" :icon="Move" :default-open="true">
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

      <UiSection v-if="activeMesh" title="Normals" :icon="Box" hint="object" :default-open="true">
        <p class="text-[10px] text-ui-textMuted leading-snug mb-1.5">
          Applies to selected objects, like Blender Object ▸ Shade.
        </p>
        <div class="grid grid-cols-3 gap-1">
          <UiButton
            size="xs"
            :active="objectShade === 'smooth'"
            title="Interpolate vertex normals across the whole mesh"
            @click="handleShade('smooth')"
          >
            Smooth
          </UiButton>
          <UiButton
            size="xs"
            :active="objectShade === 'auto'"
            title="Smooth faces, keep edges sharper than the angle threshold"
            @click="handleShade('auto')"
          >
            Auto Smooth
          </UiButton>
          <UiButton
            size="xs"
            :active="objectShade === 'flat'"
            title="One normal per face (faceted)"
            @click="handleShade('flat')"
          >
            Flat
          </UiButton>
        </div>
        <div v-if="objectShade === 'auto'" class="pt-2">
          <div class="flex items-center justify-between text-[10px] text-ui-textMuted uppercase font-semibold mb-1">
            <span>Angle</span>
            <span class="font-mono text-ui-textSecondary normal-case">{{ autoSmoothAngle }}°</span>
          </div>
          <UiNumberField
            :model-value="autoSmoothAngle"
            label="°"
            :min="0"
            :max="180"
            :step="1"
            :precision="0"
            @update:model-value="handleAutoSmoothAngle"
          />
          <p class="text-[9.5px] text-ui-textMuted mt-1 leading-snug">
            Edges whose face angle is greater than this stay sharp. Default 30°.
          </p>
        </div>
      </UiSection>

      <!-- 2. Origin / Pivot Section -->
      <UiSection v-if="toolStore.appMode === 'model'" title="Origin" :icon="Crosshair" hint="pivot" :default-open="true">
        <template #actions>
          <UiButton 
            size="xs" 
            :variant="toolStore.selectMode === 'origin' ? 'accent' : 'default'"
            @click="toggleOriginMode"
            :title="toolStore.selectMode === 'origin' ? 'Exit Origin Edit Mode' : 'Enter Interactive 3D Origin Edit Mode'"
          >
            <Crosshair class="w-3 h-3" />
            <span>{{ toolStore.selectMode === 'origin' ? 'Done' : 'Edit Origin' }}</span>
          </UiButton>
        </template>

        <!-- Active Origin Edit Mode Banner -->
        <div 
          v-if="toolStore.selectMode === 'origin'" 
          class="p-2 bg-amber-950/30 border border-amber-500/40 rounded-xs mb-2 text-[10.5px] text-amber-300 font-medium flex items-center justify-between"
        >
          <div class="flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
            <span>Origin Edit Active: Drag gizmo in 3D</span>
          </div>
          <button 
            @click="toolStore.selectMode = 'object'" 
            class="px-2 py-0.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xs text-[10px] cursor-pointer"
          >
            Done
          </button>
        </div>

        <!-- Numeric Origin World Position Inputs -->
        <div v-if="activeMesh" class="space-y-1 pb-2">
          <div class="flex items-center justify-between text-[10px] text-ui-textMuted uppercase font-semibold">
            <span>Pivot Position</span>
            <span class="font-mono text-amber-400 text-[9px]">World Coordinates</span>
          </div>
          <div class="grid grid-cols-3 gap-1">
            <UiNumberField 
              :model-value="activeMesh.position.x" 
              label="X" 
              label-color="text-rose-400" 
              @update:model-value="handleOriginNumericChange('x', $event)" 
            />
            <UiNumberField 
              :model-value="activeMesh.position.y" 
              label="Y" 
              label-color="text-emerald-400" 
              @update:model-value="handleOriginNumericChange('y', $event)" 
            />
            <UiNumberField 
              :model-value="activeMesh.position.z" 
              label="Z" 
              label-color="text-sky-400" 
              @update:model-value="handleOriginNumericChange('z', $event)" 
            />
          </div>
        </div>

        <!-- 1-Click Bounding Box & Snap Presets -->
        <div class="space-y-1.5 pt-1 border-t border-ui-borderSubtle">
          <div class="text-[9.5px] text-ui-textMuted font-semibold">Snap origin to</div>
          
          <div class="grid grid-cols-3 gap-1">
            <UiButton @click="handleOriginPreset('center')" size="xs" title="Snap pivot to mesh bounding box center">
              Center
            </UiButton>
            <UiButton @click="handleOriginPreset('bottom')" size="xs" title="Snap pivot to mesh bottom center (Base / Floor)">
              Bottom
            </UiButton>
            <UiButton @click="handleOriginPreset('top')" size="xs" title="Snap pivot to mesh top center">
              Top
            </UiButton>
          </div>

          <div class="grid grid-cols-4 gap-1 pt-0.5">
            <UiButton @click="handleOriginPreset('min_x')" size="xs" title="Snap pivot to Left face center (-X)">
              Left (-X)
            </UiButton>
            <UiButton @click="handleOriginPreset('max_x')" size="xs" title="Snap pivot to Right face center (+X)">
              Right (+X)
            </UiButton>
            <UiButton @click="handleOriginPreset('min_z')" size="xs" title="Snap pivot to Front face center (-Z)">
              Front (-Z)
            </UiButton>
            <UiButton @click="handleOriginPreset('max_z')" size="xs" title="Snap pivot to Back face center (+Z)">
              Back (+Z)
            </UiButton>
          </div>

          <div class="grid grid-cols-3 gap-1 pt-0.5">
            <UiButton @click="handleOriginPreset('world_zero')" size="xs" title="Snap pivot to World Origin (0, 0, 0)">
              World 0,0,0
            </UiButton>
            <UiButton @click="handleOriginPreset('selection')" size="xs" title="Snap pivot to currently selected Vertices, Edges, or Faces">
              To Selection
            </UiButton>
            <UiButton @click="handleGeometryToOrigin" size="xs" title="Recenter mesh geometry around its local origin">
              Geo to Origin
            </UiButton>
          </div>
        </div>
      </UiSection>

      <UiSection v-if="activeMesh && toolStore.appMode === 'model'" title="Parent" :icon="Link" :default-open="false">
        <select
          :value="activeMesh.parentId || ''"
          @change="setParent(($event.target as HTMLSelectElement).value)"
          class="w-full bg-ui-surface border border-ui-borderDefault rounded-xs px-2 py-1 text-[11px] text-ui-textPrimary focus:outline-none focus:border-ui-accent cursor-pointer"
        >
          <option value="">Scene root</option>
          <option v-for="m in parentOptions" :key="m.id" :value="m.id">{{ m.name }}</option>
        </select>
      </UiSection>

      <UiSection v-if="toolStore.appMode === 'model'" title="Actions" :icon="Wrench" :default-open="false">
        <div class="grid grid-cols-2 gap-1">
          <UiButton @click="handleDuplicateMesh" size="xs">
            <Copy class="w-3 h-3 text-ui-textMuted" />
            <span>Duplicate</span>
          </UiButton>
          <UiButton @click="handleMirrorX" size="xs">
            <FlipHorizontal class="w-3 h-3 text-ui-textMuted" />
            <span>Mirror X</span>
          </UiButton>
        </div>
      </UiSection>

      <UiSection title="Display" :icon="Eye" :default-open="false">
        <label class="flex items-center justify-between text-[10px] cursor-pointer bg-ui-surface px-2 py-1 rounded-xs border border-ui-borderSubtle">
          <span>X-Ray (Alt+Z)</span>
          <input type="checkbox" v-model="toolStore.viewport.xray" class="accent-amber-500" />
        </label>
      </UiSection>

      <UiSection v-if="activeMesh" title="Shading" :icon="Palette" :default-open="false">
        <div class="grid grid-cols-2 gap-1">
          <UiButton size="xs" @click="layoutStore.setInspectorTab('material', toolStore.appMode)">
            <Palette class="w-3 h-3 text-amber-400" />
            <span class="truncate">{{ activeMaterial?.name || 'Material' }}</span>
          </UiButton>
          <UiButton size="xs" @click="layoutStore.setInspectorTab('texture', toolStore.appMode)">
            <ImageIcon class="w-3 h-3 text-sky-400" />
            <span>Texture</span>
          </UiButton>
        </div>
      </UiSection>
    </div>

    <div v-else class="p-6 text-center text-ui-textMuted italic text-xs">
      No object or bone selected.
    </div>
  </div>
</template>
