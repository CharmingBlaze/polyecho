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
  projectStore.markGeometryUpdated()
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

function handleSmoothShading(on: boolean) {
  projectStore.setShadeMode(on ? 'smooth' : 'flat')
}

function handleShadeByAngle(on: boolean) {
  projectStore.setShadeMode(on ? 'auto' : 'smooth')
}

function handleAutoSmoothAngle(angle: number) {
  projectStore.setAutoSmoothAngle(angle, { record: false })
}

const objectShade = computed(() => activeMesh.value?.shadeMode || 'flat')
const smoothShadingOn = computed(() => objectShade.value !== 'flat')
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
        <label class="flex items-start justify-between gap-3 py-0.5 cursor-pointer">
          <div class="min-w-0">
            <span class="text-[11px] font-medium text-ui-textPrimary">Smooth shading</span>
            <p class="text-[10px] leading-snug text-ui-textMuted">On interpolates vertex normals. Off keeps faceted flat faces.</p>
          </div>
          <input
            type="checkbox"
            class="mt-0.5 rounded-xs text-amber-500 cursor-pointer"
            :checked="smoothShadingOn"
            :title="smoothShadingOn ? 'Smooth shading on — click to shade flat' : 'Smooth shading off — click to shade smooth'"
            @change="handleSmoothShading(($event.target as HTMLInputElement).checked)"
          />
        </label>
        <label
          v-if="smoothShadingOn"
          class="flex items-center justify-between gap-2 pt-1 cursor-pointer"
        >
          <span class="text-[10px] text-ui-textSecondary">Keep sharp edges by angle</span>
          <input
            type="checkbox"
            class="rounded-xs text-amber-500 cursor-pointer"
            :checked="objectShade === 'auto'"
            title="Shade Smooth by Angle"
            @change="handleShadeByAngle(($event.target as HTMLInputElement).checked)"
          />
        </label>
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
          </div>
          <div class="grid grid-cols-3 gap-1">
            <UiNumberField v-model="activeItem.position.x" label="X" label-color="text-rose-400" @before-change="beginTransformEdit" @change="updateTransform" />
            <UiNumberField v-model="activeItem.position.y" label="Y" label-color="text-emerald-400" @before-change="beginTransformEdit" @change="updateTransform" />
            <UiNumberField v-model="activeItem.position.z" label="Z" label-color="text-sky-400" @before-change="beginTransformEdit" @change="updateTransform" />
          </div>
        </div>

        <div class="space-y-1 pt-1.5">
          <div class="flex items-center text-[10px] text-ui-textSecondary font-medium gap-1">
            <RotateCw class="w-3 h-3 text-ui-textMuted" />
            <span>Rotation (°)</span>
          </div>
          <div class="grid grid-cols-3 gap-1">
            <UiNumberField v-model="activeItem.rotation.x" label="X" label-color="text-rose-400" :step="1" :precision="1" @before-change="beginTransformEdit" @change="updateTransform" />
            <UiNumberField v-model="activeItem.rotation.y" label="Y" label-color="text-emerald-400" :step="1" :precision="1" @before-change="beginTransformEdit" @change="updateTransform" />
            <UiNumberField v-model="activeItem.rotation.z" label="Z" label-color="text-sky-400" :step="1" :precision="1" @before-change="beginTransformEdit" @change="updateTransform" />
          </div>
        </div>

        <div class="space-y-1 pt-1.5">
          <div class="flex items-center text-[10px] text-ui-textSecondary font-medium gap-1">
            <Maximize2 class="w-3 h-3 text-ui-textMuted" />
            <span>Scale</span>
          </div>
          <div class="grid grid-cols-3 gap-1">
            <UiNumberField v-model="activeItem.scale.x" label="X" label-color="text-rose-400" :step="0.05" @before-change="beginTransformEdit" @change="updateTransform" />
            <UiNumberField v-model="activeItem.scale.y" label="Y" label-color="text-emerald-400" :step="0.05" @before-change="beginTransformEdit" @change="updateTransform" />
            <UiNumberField v-model="activeItem.scale.z" label="Z" label-color="text-sky-400" :step="0.05" @before-change="beginTransformEdit" @change="updateTransform" />
          </div>
        </div>
      </UiSection>

      <UiSection
        v-if="showObjectSymmetry"
        title="Flip & rotate"
        :icon="FlipHorizontal"
        v-model:is-open="symmetryOpen"
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
            class="w-16 shrink-0"
            v-model="rotateAmount"
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
        title="Origin"
        :icon="Crosshair"
        v-model:is-open="originOpen"
      >
        <template #actions>
          <UiButton
            size="xs"
            :variant="toolStore.selectMode === 'origin' ? 'accent' : 'default'"
            @click="toggleOriginMode"
            :title="toolStore.selectMode === 'origin' ? 'Exit Origin Edit Mode' : 'Enter Interactive 3D Origin Edit Mode'"
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
            <span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
            <span>Drag the gizmo</span>
          </div>
          <button
            type="button"
            @click="toolStore.selectMode = 'object'"
            class="px-2 py-0.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xs text-[10px] cursor-pointer"
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
          <UiButton @click="handleOriginPreset('center')" size="xs" title="Snap pivot to mesh bounding box center">Center</UiButton>
          <UiButton @click="handleOriginPreset('bottom')" size="xs" title="Snap pivot to mesh bottom center (Base / Floor)">Bottom</UiButton>
          <UiButton @click="handleOriginPreset('top')" size="xs" title="Snap pivot to mesh top center">Top</UiButton>
          <UiButton @click="handleOriginPreset('min_x')" size="xs" title="Snap pivot to Left face center (-X)">−X</UiButton>
          <UiButton @click="handleOriginPreset('max_x')" size="xs" title="Snap pivot to Right face center (+X)">+X</UiButton>
          <UiButton @click="handleOriginPreset('world_zero')" size="xs" title="Snap pivot to World Origin (0, 0, 0)">World</UiButton>
          <UiButton @click="handleOriginPreset('min_z')" size="xs" title="Snap pivot to Front face center (-Z)">−Z</UiButton>
          <UiButton @click="handleOriginPreset('max_z')" size="xs" title="Snap pivot to Back face center (+Z)">+Z</UiButton>
          <UiButton @click="handleOriginPreset('selection')" size="xs" title="Snap pivot to currently selected Vertices, Edges, or Faces">To Sel</UiButton>
        </div>
        <UiButton @click="handleGeometryToOrigin" size="xs" class="w-full" title="Recenter mesh geometry around its local origin">
          Geometry to origin
        </UiButton>
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

      <UiSection v-if="showObjectSymmetry" title="Actions" :icon="Wrench" :default-open="false">
        <div class="grid grid-cols-2 gap-1">
          <UiButton @click="openUvWorkspace" size="xs" title="Open this object in the UV / Paint workspace">
            <ImageIcon class="w-3 h-3 text-ui-textMuted" />
            <span>UV / Paint</span>
          </UiButton>
          <UiButton @click="toolStore.setAppMode('rig')" size="xs" title="Fit a skeleton to this object">
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
          <UiButton size="xs" @click="layoutStore.setInspectorTab('material', toolStore.appMode)">
            <Palette class="w-3 h-3 text-ui-textMuted" />
            <span class="truncate">{{ activeMaterial?.name || 'Material' }}</span>
          </UiButton>
          <UiButton size="xs" @click="layoutStore.setInspectorTab('texture', toolStore.appMode)">
            <ImageIcon class="w-3 h-3 text-ui-textMuted" />
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
