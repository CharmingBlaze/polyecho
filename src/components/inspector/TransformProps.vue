<script setup lang="ts">
import { computed, ref, toRaw, watch } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { useAnimationStore } from '../../stores/animationStore'
import { useToolStore } from '../../stores/toolStore'
import UiSection from '../ui/UiSection.vue'
import UiNumberField from '../ui/UiNumberField.vue'
import UiButton from '../ui/UiButton.vue'
import { useLayoutStore } from '../../stores/layoutStore'
import BlenderIcon from '../icons/BlenderIcon.vue'
import { MeshBridge } from '../../core/mesh/MeshBridge'
import { MeshValidator } from '../../core/mesh/MeshValidator'
import {
  FlipHorizontal,
  FlipVertical,
  Crosshair,
  Move,
  RotateCw,
  Maximize2,
  Image as ImageIcon,
  Palette,
  Link,
  Wrench,
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
  if (
    (toolStore.appMode === 'model' || toolStore.appMode === 'blockout') &&
    toolStore.selectMode === 'object' &&
    projectStore.selectedMeshIds.length === 0
  ) {
    return undefined
  }
  return projectStore.activeMesh
})

const activeMesh = computed(() => projectStore.activeMesh)

const activeMaterial = computed(() => {
  if (!activeMesh.value) return null
  const matId = activeMesh.value.materialId || 'default_material'
  return projectStore.materials.find(m => m.id === matId) || projectStore.materials[0]
})

const meshHealth = computed(() => {
  void projectStore.geometryRevision
  const meshObj = activeMesh.value
  if (!meshObj) return null
  const { mesh } = MeshBridge.meshObjectToEditableMesh(toRaw(meshObj))
  return MeshValidator.validate(mesh)
})

function beginTransformEdit() {
  projectStore.recordState('Transform Input')
}

function updateTransform() {
  projectStore.markObjectTransformUpdated()
}

const objectMultiSelect = computed(() =>
  (toolStore.appMode === 'model' || toolStore.appMode === 'blockout') &&
  toolStore.selectMode === 'object' &&
  projectStore.selectedMeshIds.length > 1
)

function applyObjectChannel(
  channel: 'position' | 'rotation' | 'scale',
  axis: 'x' | 'y' | 'z',
  value: number
) {
  if (toolStore.appMode === 'animate') {
    const bone = animationStore.selectedBone
    if (!bone) return
    bone[channel][axis] = value
    updateTransform()
    return
  }
  const mesh = projectStore.activeMesh
  if (!mesh) return
  const previous = mesh[channel][axis]
  mesh[channel][axis] = value
  if (objectMultiSelect.value) {
    if (channel === 'scale') {
      const ratio = previous === 0 ? 1 : value / previous
      for (const id of projectStore.selectedMeshIds) {
        if (id === mesh.id) continue
        const other = projectStore.meshes.find(m => m.id === id)
        if (other) other.scale[axis] *= ratio
      }
    } else {
      const delta = value - previous
      for (const id of projectStore.selectedMeshIds) {
        if (id === mesh.id) continue
        const other = projectStore.meshes.find(m => m.id === id)
        if (other) other[channel][axis] += delta
      }
    }
  }
  updateTransform()
}

function commitRotationScale() {
  updateTransform()
}

const rotateAxis = ref<'x' | 'y' | 'z'>('y')
const rotateAmount = ref(90)
const originOpen = ref(false)
const symmetryOpen = ref(false)

const showObjectSymmetry = computed(() =>
  !!activeMesh.value && (toolStore.appMode === 'model' || toolStore.appMode === 'blockout')
)

watch(
  () => toolStore.selectMode,
  (mode) => {
    if (mode === 'origin') originOpen.value = true
  }
)

function handleCleanMesh() {
  if (!activeMesh.value) return
  projectStore.performCleanupMesh()
}

function openUvWorkspace() {
  if (!activeMesh.value) return
  toolStore.setAppMode('uvpaint')
}

function handleOriginPreset(preset: 'center' | 'bottom' | 'top' | 'min_x' | 'max_x' | 'min_z' | 'max_z' | 'world_zero' | 'selection') {
  if (!activeMesh.value) return
  projectStore.setOriginToPreset(activeMesh.value.id, preset)
}

function handleOriginToCursor() {
  const mesh = activeMesh.value
  if (!mesh) return
  const c = toolStore.cursor3D
  projectStore.offsetMeshOrigin(
    mesh.id,
    c.x - mesh.position.x,
    c.y - mesh.position.y,
    c.z - mesh.position.z,
    'Origin to 3D Cursor'
  )
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

function beginOriginNumericEdit() {
  projectStore.recordState('Edit Origin')
}

function handleOriginNumericChange(axis: 'x' | 'y' | 'z', newPos: number) {
  if (!activeMesh.value) return
  const currentPos = activeMesh.value.position[axis]
  const delta = newPos - currentPos
  if (axis === 'x') projectStore.offsetMeshOrigin(activeMesh.value.id, delta, 0, 0, 'Edit Origin X', { record: false })
  else if (axis === 'y') projectStore.offsetMeshOrigin(activeMesh.value.id, 0, delta, 0, 'Edit Origin Y', { record: false })
  else if (axis === 'z') projectStore.offsetMeshOrigin(activeMesh.value.id, 0, 0, delta, 'Edit Origin Z', { record: false })
}

function chooseShade(mode: 'flat' | 'smooth' | 'auto') {
  if ((activeMesh.value?.shadeMode || 'flat') === mode) return
  projectStore.setShadeMode(mode)
}

function handleAutoSmoothAngle(angle: number) {
  projectStore.setAutoSmoothAngle(angle, { record: false })
}

const objectShade = computed(() => activeMesh.value?.shadeMode || 'flat')
const autoSmoothAngle = computed(() => activeMesh.value?.autoSmoothAngle ?? 30)

function toggleOriginMode() {
  if (toolStore.selectMode === 'origin') {
    toolStore.selectMode = 'object'
    return
  }
  if (!projectStore.activeMesh && projectStore.meshes.length > 0) {
    projectStore.activeMeshId = projectStore.meshes[0].id
    projectStore.selectedMeshIds = [projectStore.meshes[0].id]
  }
  if (toolStore.appMode !== 'model' && toolStore.appMode !== 'blockout') {
    toolStore.setAppMode('model')
  }
  toolStore.selectMode = 'origin'
}
</script>

<template>
  <div class="flex flex-col select-none text-xs font-sans">
    <div class="inspector-head">
      <div class="inspector-head-kicker">
        <BlenderIcon name="empty-axis" :size="12" />
        <span>Object</span>
      </div>
      <span class="inspector-head-name">{{ activeItem?.name || 'No selection' }}</span>
    </div>

    <div v-if="activeItem" class="flex flex-col">
      <UiSection v-if="activeMesh" title="Shading" blender-icon="shading-solid" :default-open="true">
        <nav class="inspector-seg is-stretch" aria-label="Object shading">
          <button
            type="button"
            class="inspector-seg-btn"
            :class="{ 'is-active': objectShade === 'flat' }"
            :aria-pressed="objectShade === 'flat'"
            title="Flat — each face keeps its own normal"
            @click="chooseShade('flat')"
          >
            Flat
          </button>
          <button
            type="button"
            class="inspector-seg-btn"
            :class="{ 'is-active': objectShade === 'smooth' }"
            :aria-pressed="objectShade === 'smooth'"
            title="Smooth — interpolate vertex normals"
            @click="chooseShade('smooth')"
          >
            Smooth
          </button>
          <button
            type="button"
            class="inspector-seg-btn"
            :class="{ 'is-active': objectShade === 'auto' }"
            :aria-pressed="objectShade === 'auto'"
            title="Smooth, but edges sharper than the angle stay flat"
            @click="chooseShade('auto')"
          >
            Angle
          </button>
        </nav>
        <UiNumberField
          v-if="objectShade === 'auto'"
          class="w-full"
          :model-value="autoSmoothAngle"
          label="Angle °"
          :min="0"
          :max="180"
          :step="1"
          :precision="0"
          @before-change="projectStore.recordState('Set Auto Smooth Angle')"
          @update:model-value="handleAutoSmoothAngle"
        />
      </UiSection>

      <UiSection title="Transform" :icon="Move" :default-open="true">
        <div class="space-y-1">
          <div class="flex items-center text-[10px] text-ui-textSecondary font-medium gap-1">
            <Move class="w-3 h-3 text-ui-textMuted" />
            <span>Location</span>
            <span v-if="objectMultiSelect" class="text-ui-textMuted font-normal">· {{ projectStore.selectedMeshIds.length }}</span>
          </div>
          <div class="grid grid-cols-3 gap-1">
            <UiNumberField :model-value="activeItem.position.x" label="X" label-color="text-rose-400" @before-change="beginTransformEdit" @update:model-value="applyObjectChannel('position', 'x', $event)" @change="updateTransform" />
            <UiNumberField :model-value="activeItem.position.y" label="Y" label-color="text-emerald-400" @before-change="beginTransformEdit" @update:model-value="applyObjectChannel('position', 'y', $event)" @change="updateTransform" />
            <UiNumberField :model-value="activeItem.position.z" label="Z" label-color="text-sky-400" @before-change="beginTransformEdit" @update:model-value="applyObjectChannel('position', 'z', $event)" @change="updateTransform" />
          </div>
        </div>

        <div class="space-y-1 pt-1.5">
          <div class="flex items-center text-[10px] text-ui-textSecondary font-medium gap-1">
            <RotateCw class="w-3 h-3 text-ui-textMuted" />
            <span>Rotation (°)</span>
          </div>
          <div class="grid grid-cols-3 gap-1">
            <UiNumberField :model-value="activeItem.rotation.x" label="X" label-color="text-rose-400" :step="1" :precision="1" @before-change="beginTransformEdit" @update:model-value="applyObjectChannel('rotation', 'x', $event)" @change="updateTransform" @commit="commitRotationScale" />
            <UiNumberField :model-value="activeItem.rotation.y" label="Y" label-color="text-emerald-400" :step="1" :precision="1" @before-change="beginTransformEdit" @update:model-value="applyObjectChannel('rotation', 'y', $event)" @change="updateTransform" @commit="commitRotationScale" />
            <UiNumberField :model-value="activeItem.rotation.z" label="Z" label-color="text-sky-400" :step="1" :precision="1" @before-change="beginTransformEdit" @update:model-value="applyObjectChannel('rotation', 'z', $event)" @change="updateTransform" @commit="commitRotationScale" />
          </div>
        </div>

        <div class="space-y-1 pt-1.5">
          <div class="flex items-center text-[10px] text-ui-textSecondary font-medium gap-1">
            <Maximize2 class="w-3 h-3 text-ui-textMuted" />
            <span>Scale</span>
          </div>
          <div class="grid grid-cols-3 gap-1">
            <UiNumberField :model-value="activeItem.scale.x" label="X" label-color="text-rose-400" :step="0.05" @before-change="beginTransformEdit" @update:model-value="applyObjectChannel('scale', 'x', $event)" @change="updateTransform" @commit="commitRotationScale" />
            <UiNumberField :model-value="activeItem.scale.y" label="Y" label-color="text-emerald-400" :step="0.05" @before-change="beginTransformEdit" @update:model-value="applyObjectChannel('scale', 'y', $event)" @change="updateTransform" @commit="commitRotationScale" />
            <UiNumberField :model-value="activeItem.scale.z" label="Z" label-color="text-sky-400" :step="0.05" @before-change="beginTransformEdit" @update:model-value="applyObjectChannel('scale', 'z', $event)" @change="updateTransform" @commit="commitRotationScale" />
          </div>
        </div>
      </UiSection>

      <UiSection
        v-if="showObjectSymmetry"
        v-model:is-open="symmetryOpen"
        title="Flip & rotate"
        :icon="FlipHorizontal"
      >
        <div class="flex items-center gap-1">
          <span class="text-[9.5px] text-ui-textMuted font-semibold w-9 shrink-0">Flip</span>
          <UiButton size="xs" class="flex-1" title="Flip left/right through the object origin" @click="projectStore.performFlipAxis('x')">
            <FlipHorizontal class="w-3 h-3 text-ui-textMuted" />
            <span>X</span>
          </UiButton>
          <UiButton size="xs" class="flex-1" title="Flip up/down through the object origin" @click="projectStore.performFlipAxis('y')">
            <FlipVertical class="w-3 h-3 text-ui-textMuted" />
            <span>Y</span>
          </UiButton>
          <UiButton size="xs" class="flex-1" title="Flip front/back through the object origin" @click="projectStore.performFlipAxis('z')">
            <span>Z</span>
          </UiButton>
        </div>

        <div class="flex items-center gap-1">
          <span class="text-[9.5px] text-ui-textMuted font-semibold w-9 shrink-0">Copy</span>
          <UiButton size="xs" class="flex-1" title="Duplicate then flip X" @click="projectStore.performDuplicateMirror('x')">X</UiButton>
          <UiButton size="xs" class="flex-1" title="Duplicate then flip Y" @click="projectStore.performDuplicateMirror('y')">Y</UiButton>
          <UiButton size="xs" class="flex-1" title="Duplicate then flip Z" @click="projectStore.performDuplicateMirror('z')">Z</UiButton>
        </div>

        <div class="flex items-center gap-1">
          <span class="text-[9.5px] text-ui-textMuted font-semibold w-9 shrink-0">Axis</span>
          <UiButton size="xs" class="flex-1" :active="rotateAxis === 'x'" @click="rotateAxis = 'x'">X</UiButton>
          <UiButton size="xs" class="flex-1" :active="rotateAxis === 'y'" @click="rotateAxis = 'y'">Y</UiButton>
          <UiButton size="xs" class="flex-1" :active="rotateAxis === 'z'" @click="rotateAxis = 'z'">Z</UiButton>
          <UiNumberField
            v-model="rotateAmount"
            class="w-16 shrink-0"
            label="°"
            :step="15"
            :precision="1"
          />
        </div>
        <div class="grid grid-cols-4 gap-1">
          <UiButton size="xs" title="Rotate −90° on the selected axis" @click="projectStore.performRotateObject(rotateAxis, -90)">−90</UiButton>
          <UiButton size="xs" title="Rotate +90° on the selected axis" @click="projectStore.performRotateObject(rotateAxis, 90)">+90</UiButton>
          <UiButton size="xs" title="Rotate 180° on the selected axis" @click="projectStore.performRotateObject(rotateAxis, 180)">180</UiButton>
          <UiButton size="xs" title="Rotate by the amount in the degree field" @click="projectStore.performRotateObject(rotateAxis, rotateAmount)">Apply</UiButton>
        </div>
      </UiSection>

      <UiSection
        v-if="toolStore.appMode === 'model' || toolStore.appMode === 'blockout'"
        v-model:is-open="originOpen"
        title="Origin"
        :icon="Crosshair"
      >
        <template #actions>
          <UiButton
            size="xs"
            :variant="toolStore.selectMode === 'origin' ? 'accent' : 'default'"
            :title="toolStore.selectMode === 'origin' ? 'Exit Origin Edit Mode' : 'Enter Interactive 3D Origin Edit Mode'"
            @click="toggleOriginMode"
          >
            <Crosshair class="w-3 h-3" />
            <span>{{ toolStore.selectMode === 'origin' ? 'Done' : 'Edit' }}</span>
          </UiButton>
        </template>

        <div
          v-if="toolStore.selectMode === 'origin'"
          class="px-2 py-1.5 bg-amber-950/30 border border-amber-500/40 rounded-xs text-[10.5px] text-amber-300 font-medium flex items-center justify-between"
        >
          <div class="flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span>Drag the gizmo</span>
          </div>
          <button
            type="button"
            class="px-2 py-0.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xs text-[10px] cursor-pointer"
            @click="toolStore.selectMode = 'object'"
          >
            Done
          </button>
        </div>

        <div v-if="activeMesh" class="space-y-1">
          <div class="text-[9.5px] text-ui-textMuted font-semibold">World pivot</div>
          <div class="grid grid-cols-3 gap-1">
            <UiNumberField
              :model-value="activeMesh.position.x"
              label="X"
              label-color="text-rose-400"
              @before-change="beginOriginNumericEdit"
              @update:model-value="handleOriginNumericChange('x', $event)"
            />
            <UiNumberField
              :model-value="activeMesh.position.y"
              label="Y"
              label-color="text-emerald-400"
              @before-change="beginOriginNumericEdit"
              @update:model-value="handleOriginNumericChange('y', $event)"
            />
            <UiNumberField
              :model-value="activeMesh.position.z"
              label="Z"
              label-color="text-sky-400"
              @before-change="beginOriginNumericEdit"
              @update:model-value="handleOriginNumericChange('z', $event)"
            />
          </div>
        </div>

        <div class="text-[9.5px] text-ui-textMuted font-semibold">Snap to</div>
        <div class="grid grid-cols-3 gap-1">
          <UiButton size="xs" title="Snap pivot to mesh bounding box center" @click="handleOriginPreset('center')">Center</UiButton>
          <UiButton size="xs" title="Snap pivot to mesh bottom center (Base / Floor)" @click="handleOriginPreset('bottom')">Bottom</UiButton>
          <UiButton size="xs" title="Snap pivot to mesh top center" @click="handleOriginPreset('top')">Top</UiButton>
          <UiButton size="xs" title="Snap pivot to Left face center (-X)" @click="handleOriginPreset('min_x')">−X</UiButton>
          <UiButton size="xs" title="Snap pivot to Right face center (+X)" @click="handleOriginPreset('max_x')">+X</UiButton>
          <UiButton size="xs" title="Snap pivot to World Origin (0, 0, 0)" @click="handleOriginPreset('world_zero')">World</UiButton>
          <UiButton size="xs" title="Snap pivot to Front face center (-Z)" @click="handleOriginPreset('min_z')">−Z</UiButton>
          <UiButton size="xs" title="Snap pivot to Back face center (+Z)" @click="handleOriginPreset('max_z')">+Z</UiButton>
          <UiButton size="xs" title="Snap pivot to currently selected Vertices, Edges, or Faces" @click="handleOriginPreset('selection')">To Sel</UiButton>
          <UiButton size="xs" title="Snap pivot to the 3D cursor" @click="handleOriginToCursor">To Cursor</UiButton>
        </div>
        <UiButton size="xs" class="w-full" title="Recenter mesh geometry around its local origin" @click="handleGeometryToOrigin">
          Geometry to origin
        </UiButton>
      </UiSection>

      <UiSection v-if="activeMesh && toolStore.appMode === 'model'" title="Parent" :icon="Link" :default-open="false">
        <select
          :value="activeMesh.parentId || ''"
          class="w-full bg-ui-surface border border-ui-borderDefault rounded-xs px-2 py-1 text-[11px] text-ui-textPrimary focus:outline-none focus:border-ui-accent cursor-pointer"
          @change="setParent(($event.target as HTMLSelectElement).value)"
        >
          <option value="">Scene root</option>
          <option v-for="m in parentOptions" :key="m.id" :value="m.id">{{ m.name }}</option>
        </select>
      </UiSection>

      <UiSection v-if="showObjectSymmetry" title="Actions" :icon="Wrench" :default-open="false">
        <div class="grid grid-cols-2 gap-1">
          <UiButton size="xs" title="Open this object in the UV / Paint workspace" @click="openUvWorkspace">
            <ImageIcon class="w-3 h-3 text-ui-textMuted" />
            <span>UV / Paint</span>
          </UiButton>
          <UiButton size="xs" title="Fit a skeleton to this object" @click="toolStore.setAppMode('rig')">
            <span>Rig</span>
          </UiButton>
        </div>
      </UiSection>

      <UiSection v-if="activeMesh && meshHealth" title="Mesh health" :icon="Box" :badge="meshHealth.valid ? undefined : '!'" :default-open="false">
        <div
          class="rounded-xs border px-2 py-1.5 text-[10px] leading-snug"
          :class="meshHealth.valid ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/40 bg-amber-500/10 text-amber-200'"
        >
          <template v-if="meshHealth.valid">Topology looks ready for UVs, modifiers, and export.</template>
          <template v-else>Topology needs attention before export.</template>
        </div>
        <div v-if="!meshHealth.valid" class="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] text-ui-textMuted">
          <span v-if="meshHealth.nonManifoldEdges.length">{{ meshHealth.nonManifoldEdges.length }} non-manifold edge{{ meshHealth.nonManifoldEdges.length === 1 ? '' : 's' }}</span>
          <span v-if="meshHealth.zeroAreaFaces.length">{{ meshHealth.zeroAreaFaces.length }} zero-area face{{ meshHealth.zeroAreaFaces.length === 1 ? '' : 's' }}</span>
          <span v-if="meshHealth.brokenHalfEdges.length">{{ meshHealth.brokenHalfEdges.length }} broken connection{{ meshHealth.brokenHalfEdges.length === 1 ? '' : 's' }}</span>
          <span v-if="meshHealth.orphanVertices.length">{{ meshHealth.orphanVertices.length }} unused vertex{{ meshHealth.orphanVertices.length === 1 ? '' : 'es' }}</span>
        </div>
        <UiButton size="xs" class="w-full" @click="handleCleanMesh">Clean mesh</UiButton>
      </UiSection>

      <UiSection v-if="activeMesh" title="Material" :icon="Palette" :default-open="false">
        <div class="grid grid-cols-2 gap-1">
          <UiButton size="xs" @click="layoutStore.materialLook = 'surface'; layoutStore.setInspectorTab('material', toolStore.appMode)">
            <Palette class="w-3 h-3 text-ui-textMuted" />
            <span class="truncate">{{ activeMaterial?.name || 'Material' }}</span>
          </UiButton>
          <UiButton size="xs" @click="layoutStore.setInspectorTab('texture', toolStore.appMode)">
            <ImageIcon class="w-3 h-3 text-ui-textMuted" />
            <span>Pixels</span>
          </UiButton>
        </div>
      </UiSection>
    </div>

    <div v-else class="p-6 text-center text-ui-textMuted italic text-xs">
      No object or bone selected.
    </div>
  </div>
</template>
