<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { useToolStore } from '../../stores/toolStore'
import UiSection from '../ui/UiSection.vue'
import UiButton from '../ui/UiButton.vue'
import UiNumberField from '../ui/UiNumberField.vue'
import BlenderIcon from '../icons/BlenderIcon.vue'
import { requestFillFace } from '../../core/commands/editorCommands'

const projectStore = useProjectStore()
const toolStore = useToolStore()

const activeMesh = computed(() => projectStore.activeMesh)
const selectMode = computed(() => toolStore.selectMode)
const isEdit = computed(() =>
  selectMode.value === 'vertex' || selectMode.value === 'edge' || selectMode.value === 'face'
)
const vertCount = computed(() => projectStore.selectedVertexIds.length)
const edgeCount = computed(() => projectStore.selectedEdgeIds.length)
const faceCount = computed(() => projectStore.selectedFaceIds.length)
const hasFaces = computed(() => faceCount.value > 0)
const hasEdges = computed(() => edgeCount.value > 0)
const hasVerts = computed(() => vertCount.value >= 2)
const canSubdivide = computed(() => {
  if (!activeMesh.value) return false
  if (selectMode.value === 'object') return activeMesh.value.faces.length > 0
  return isEdit.value && (hasFaces.value || hasEdges.value || vertCount.value > 0)
})
const canSeparate = computed(() => hasFaces.value || hasEdges.value || vertCount.value > 0)
const canFlatten = computed(() => hasFaces.value || hasEdges.value || vertCount.value > 0)

const modeLabel = computed(() => {
  if (selectMode.value === 'vertex') return 'Vertex'
  if (selectMode.value === 'edge') return 'Edge'
  if (selectMode.value === 'face') return 'Face'
  if (selectMode.value === 'origin') return 'Origin'
  return 'Object'
})

const selectionHint = computed(() => {
  if (selectMode.value === 'vertex') {
    return vertCount.value ? `${vertCount.value} vert${vertCount.value === 1 ? '' : 's'}` : 'Select vertices'
  }
  if (selectMode.value === 'edge') {
    return edgeCount.value ? `${edgeCount.value} edge${edgeCount.value === 1 ? '' : 's'}` : 'Select edges'
  }
  if (selectMode.value === 'face') {
    return faceCount.value ? `${faceCount.value} face${faceCount.value === 1 ? '' : 's'}` : 'Select faces'
  }
  const n = projectStore.selectedMeshIds.length
  return n ? `${n} object${n === 1 ? '' : 's'}` : 'Object'
})

const sections = reactive({
  subdivide: true,
  face: false,
  edge: false,
  vert: false,
  mesh: true
})

watch(selectMode, (mode) => {
  if (mode === 'face') sections.face = true
  else if (mode === 'edge') sections.edge = true
  else if (mode === 'vertex') sections.vert = true
}, { immediate: true })

function subdivide() {
  const mode = toolStore.selectMode
  if (mode === 'object' || mode === 'vertex' || mode === 'edge' || mode === 'face') {
    projectStore.performSubdivide(mode)
  }
}

function merge(type: 'center' | 'first' | 'last' | 'distance') {
  projectStore.performMerge(type)
}

function deleteSel() {
  const mode = toolStore.selectMode
  if (mode === 'vertex' || mode === 'edge' || mode === 'face' || mode === 'object') {
    projectStore.performDelete(mode)
  }
}
</script>

<template>
  <div class="flex flex-col select-none text-xs font-sans">
    <div class="inspector-head">
      <div class="inspector-head-kicker">
        <BlenderIcon name="tools" :size="12" />
        <span>Mesh Tools</span>
      </div>
      <span class="inspector-head-name">{{ activeMesh?.name || 'No object' }}</span>
    </div>

    <div v-if="!activeMesh" class="p-6 text-center text-ui-textMuted italic text-xs">
      Select a mesh to use edit tools.
    </div>

    <div v-else class="flex flex-col">
      <div class="px-2.5 py-1.5 border-b border-ui-borderSubtle space-y-1">
        <div class="text-[10px] text-ui-textSecondary truncate">
          <span class="font-semibold text-ui-textPrimary">{{ modeLabel }}</span>
          <span class="text-ui-textMuted"> · {{ selectionHint }}</span>
        </div>
        <p v-if="toolStore.appMode === 'blockout'" class="text-[10px] leading-snug text-ui-textMuted">
          Shape Draw, Poly Draw, and Poly Build are on the left toolbar.
        </p>
      </div>

      <UiSection title="Subdivide" blender-icon="tool-subdivide" hint="W" v-model:is-open="sections.subdivide">
        <div class="grid grid-cols-2 gap-1">
          <UiNumberField
            v-model="toolStore.subdivideCuts"
            label="Cuts"
            :min="1"
            :max="10"
            :step="1"
            :precision="0"
          />
          <UiNumberField
            v-model="toolStore.subdivideSmoothness"
            label="Smooth"
            :min="0"
            :max="1"
            :step="0.05"
            :precision="2"
          />
        </div>
        <UiButton
          size="xs"
          class="w-full"
          variant="accent"
          :disabled="!canSubdivide"
          title="Subdivide (W). Object mode: whole mesh. Edit mode: selection."
          @click="subdivide"
        >
          <BlenderIcon name="tool-subdivide" :size="12" />
          <span>Subdivide</span>
        </UiButton>
      </UiSection>

      <UiSection
        title="Faces"
        blender-icon="face-select"
        :badge="faceCount || undefined"
        v-model:is-open="sections.face"
      >
        <div class="grid grid-cols-2 gap-1">
          <UiButton size="xs" :disabled="!isEdit" :title="toolStore.appMode === 'blockout' ? 'Fill a boundary (Mesh menu). F in Blockout is Poly Draw.' : 'Fill (F)'" @click="requestFillFace()">
            <BlenderIcon name="fill-face" :size="12" />
            <span>Fill</span>
          </UiButton>
          <UiButton size="xs" :disabled="!isEdit" title="Grid Fill" @click="projectStore.performGridFill()">
            <BlenderIcon name="grid" :size="12" />
            <span>Grid Fill</span>
          </UiButton>
          <UiButton size="xs" :disabled="!hasFaces" title="Poke Faces (Alt+P)" @click="projectStore.performPokeFaces()">
            <BlenderIcon name="tool-subdivide" :size="12" />
            <span>Poke</span>
          </UiButton>
          <UiButton size="xs" :disabled="!hasFaces" title="Triangulate Faces (Ctrl+T)" @click="projectStore.performTriangulate()">
            <BlenderIcon name="face-select" :size="12" />
            <span>Triangulate</span>
          </UiButton>
          <UiButton size="xs" class="col-span-2" title="Flip Normals (Shift+N). Uses selected faces, or the whole mesh." @click="projectStore.performFlipNormals()">
            <BlenderIcon name="flip-normals" :size="12" />
            <span>Flip Normals</span>
          </UiButton>
        </div>
      </UiSection>

      <UiSection
        title="Edges"
        blender-icon="edge-select"
        :badge="edgeCount || undefined"
        v-model:is-open="sections.edge"
      >
        <div class="grid grid-cols-2 gap-1">
          <UiButton size="xs" :disabled="!hasEdges" title="Bridge Edge Loops" @click="projectStore.performBridgeEdges()">
            <BlenderIcon name="bridge-edges" :size="12" />
            <span>Bridge</span>
          </UiButton>
          <UiButton size="xs" :disabled="!hasEdges" title="Dissolve Edges (Ctrl+X)" @click="projectStore.performDissolve('edge')">
            <BlenderIcon name="dissolve" :size="12" />
            <span>Dissolve</span>
          </UiButton>
        </div>
      </UiSection>

      <UiSection
        title="Vertices"
        blender-icon="vertex-select"
        :badge="vertCount || undefined"
        v-model:is-open="sections.vert"
      >
        <div class="text-[9px] font-semibold text-ui-textMuted uppercase tracking-wide">Merge</div>
        <div class="grid grid-cols-4 gap-1">
          <UiButton size="xs" :disabled="!hasVerts" title="Merge at Center (M)" @click="merge('center')">Center</UiButton>
          <UiButton size="xs" :disabled="!hasVerts" title="Merge at First" @click="merge('first')">First</UiButton>
          <UiButton size="xs" :disabled="!hasVerts" title="Merge at Last" @click="merge('last')">Last</UiButton>
          <UiButton size="xs" title="Merge by Distance" @click="merge('distance')">Dist</UiButton>
        </div>
        <div class="grid grid-cols-2 gap-1">
          <UiButton size="xs" :disabled="vertCount !== 2" title="Connect Vertex Path (J)" @click="projectStore.performConnectVertices()">
            <BlenderIcon name="connect-verts" :size="12" />
            <span>Connect</span>
          </UiButton>
          <UiButton size="xs" :disabled="vertCount === 0" title="Dissolve Vertices (Ctrl+X)" @click="projectStore.performDissolve('vertex')">
            <BlenderIcon name="dissolve" :size="12" />
            <span>Dissolve</span>
          </UiButton>
        </div>
      </UiSection>

      <UiSection title="Mesh" blender-icon="mesh-cube" v-model:is-open="sections.mesh">
        <div class="grid grid-cols-2 gap-1">
          <UiButton size="xs" title="Duplicate (Shift+D)" @click="projectStore.duplicateSelection(toolStore.selectMode)">
            <BlenderIcon name="duplicate" :size="12" />
            <span>Duplicate</span>
          </UiButton>
          <UiButton size="xs" :disabled="!canSeparate" title="Separate Selection (P)" @click="projectStore.performSeparateMesh()">
            <BlenderIcon name="separate-mesh" :size="12" />
            <span>Separate</span>
          </UiButton>
          <UiButton size="xs" :disabled="projectStore.selectedMeshIds.length < 2" title="Join (Ctrl+J)" @click="projectStore.performJoinMeshes()">
            <BlenderIcon name="join-mesh" :size="12" />
            <span>Join</span>
          </UiButton>
          <UiButton size="xs" title="Clean degenerate geometry" @click="projectStore.performCleanupMesh()">
            <BlenderIcon name="clean-mesh" :size="12" />
            <span>Clean</span>
          </UiButton>
        </div>
        <div class="flex items-center gap-1">
          <span class="text-[9.5px] text-ui-textMuted font-semibold w-11 shrink-0">Flatten</span>
          <UiButton size="xs" class="flex-1" :disabled="!canFlatten" title="Flatten X" @click="projectStore.performFlatten('x')">X</UiButton>
          <UiButton size="xs" class="flex-1" :disabled="!canFlatten" title="Flatten Y" @click="projectStore.performFlatten('y')">Y</UiButton>
          <UiButton size="xs" class="flex-1" :disabled="!canFlatten" title="Flatten Z" @click="projectStore.performFlatten('z')">Z</UiButton>
        </div>
        <UiButton size="xs" class="w-full" variant="danger" title="Delete (X)" @click="deleteSel">
          <BlenderIcon name="trash" :size="12" />
          <span>Delete</span>
        </UiButton>
      </UiSection>
    </div>
  </div>
</template>
