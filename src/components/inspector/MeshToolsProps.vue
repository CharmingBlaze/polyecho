<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { useToolStore } from '../../stores/toolStore'
import UiSection from '../ui/UiSection.vue'
import UiButton from '../ui/UiButton.vue'
import UiNumberField from '../ui/UiNumberField.vue'
import BlenderIcon from '../icons/BlenderIcon.vue'
import { requestFillFace, requestModalTool, requestKnifeProject } from '../../core/commands/editorCommands'

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
      <UiSection title="Object shading" blender-icon="shading-solid" :default-open="true">
        <label class="flex items-start justify-between gap-3 py-0.5 cursor-pointer">
          <div class="min-w-0">
            <span class="text-[11px] font-medium text-ui-textPrimary">Smooth shading</span>
            <p class="text-[10px] leading-snug text-ui-textMuted">On interpolates vertex normals. Off keeps faceted flat faces.</p>
          </div>
          <input
            type="checkbox"
            class="mt-0.5 rounded-xs text-amber-500 cursor-pointer"
            :checked="(activeMesh.shadeMode || 'flat') !== 'flat'"
            :title="(activeMesh.shadeMode || 'flat') !== 'flat' ? 'Smooth shading on — click to shade flat' : 'Smooth shading off — click to shade smooth'"
            @change="projectStore.setShadeMode(($event.target as HTMLInputElement).checked ? 'smooth' : 'flat')"
          />
        </label>
        <label
          v-if="(activeMesh.shadeMode || 'flat') !== 'flat'"
          class="flex items-center justify-between gap-2 pt-1 cursor-pointer"
        >
          <span class="text-[10px] text-ui-textSecondary">Keep sharp edges by angle</span>
          <input
            type="checkbox"
            class="rounded-xs text-amber-500 cursor-pointer"
            :checked="activeMesh.shadeMode === 'auto'"
            title="Shade Smooth by Angle"
            @change="projectStore.setShadeMode(($event.target as HTMLInputElement).checked ? 'auto' : 'smooth')"
          />
        </label>
        <UiNumberField
          v-if="activeMesh.shadeMode === 'auto'"
          class="w-full"
          :model-value="activeMesh.autoSmoothAngle ?? 30"
          label="Angle °"
          :min="0"
          :max="180"
          :step="1"
          :precision="0"
          @before-change="projectStore.recordState('Set Auto Smooth Angle')"
          @update:model-value="projectStore.setAutoSmoothAngle($event, { record: false })"
        />
      </UiSection>

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
          <UiButton size="xs" :disabled="!hasFaces" title="Dissolve Faces (Ctrl+X in Face mode)" @click="projectStore.performDissolve('face')">
            <BlenderIcon name="dissolve" :size="12" />
            <span>Dissolve</span>
          </UiButton>
          <UiButton size="xs" :disabled="!hasFaces" title="Tris to Quads (Alt+J)" @click="projectStore.performTrisToQuads()">
            <span>Tris to Quads</span>
          </UiButton>
          <UiButton size="xs" :disabled="!hasFaces" title="Make Planar Faces" @click="projectStore.performMakePlanar()">
            <span>Planar</span>
          </UiButton>
          <UiButton size="xs" title="Fill Holes (Alt+F)" @click="projectStore.performFillHoles()">
            <span>Fill Holes</span>
          </UiButton>
          <UiButton size="xs" :disabled="!hasFaces" title="Solidify Faces" @click="projectStore.performSolidifyFaces()">
            <span>Solidify</span>
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
          <UiButton size="xs" :disabled="!hasEdges" title="Bridge Edge Loops" @click="projectStore.performBridgeEdges(toolStore.bridgeSegments, toolStore.bridgeTwist)">
            <BlenderIcon name="bridge-edges" :size="12" />
            <span>Bridge</span>
          </UiButton>
          <UiButton size="xs" :disabled="!hasEdges" title="Dissolve Edges (Ctrl+X)" @click="projectStore.performDissolve('edge')">
            <BlenderIcon name="dissolve" :size="12" />
            <span>Dissolve</span>
          </UiButton>
          <UiButton size="xs" :disabled="!hasEdges" title="Rotate Edge (Ctrl+Shift+F)" @click="projectStore.performFlipEdge()">
            <span>Rotate Edge</span>
          </UiButton>
          <UiButton size="xs" :disabled="!hasEdges" title="Rip (Ctrl+Shift+V)" @click="projectStore.performRip(false)">
            <span>Rip</span>
          </UiButton>
          <UiButton size="xs" :disabled="!hasEdges" title="Rip Fill (Alt+V)" @click="projectStore.performRip(true)">
            <span>Rip Fill</span>
          </UiButton>
          <UiButton size="xs" :disabled="!hasEdges" title="Delete Only Edges" @click="projectStore.performDeleteOnlyEdges()">
            <span>Only Edges</span>
          </UiButton>
          <UiButton size="xs" :disabled="!hasEdges" title="Edge Slide (Shift+G)" @click="requestModalTool('edge_slide')">
            <span>Slide</span>
          </UiButton>
          <UiButton size="xs" :disabled="!hasEdges" title="Offset Edge Loop (Ctrl+Shift+R)" @click="requestModalTool('offset_loop')">
            <span>Offset Loop</span>
          </UiButton>
        </div>
        <div class="grid grid-cols-2 gap-1">
          <UiNumberField
            v-model="toolStore.bridgeSegments"
            label="Segs"
            :min="1"
            :max="16"
            :step="1"
            :precision="0"
          />
          <UiNumberField
            v-model="toolStore.bridgeTwist"
            label="Twist"
            :min="-16"
            :max="16"
            :step="1"
            :precision="0"
          />
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
          <UiButton size="xs" :disabled="vertCount < 2" title="Connect Vertex Path (J)" @click="projectStore.performConnectVertices()">
            <BlenderIcon name="connect-verts" :size="12" />
            <span>Connect</span>
          </UiButton>
          <UiButton size="xs" :disabled="vertCount === 0" title="Dissolve Vertices (Ctrl+X)" @click="projectStore.performDissolve('vertex')">
            <BlenderIcon name="dissolve" :size="12" />
            <span>Dissolve</span>
          </UiButton>
          <UiButton size="xs" :disabled="vertCount === 0" title="Vertex Slide (Shift+V)" @click="requestModalTool('vertex_slide')">
            <span>Slide</span>
          </UiButton>
          <UiButton size="xs" :disabled="vertCount === 0" title="Vertex Bevel (Ctrl+Shift+B)" @click="projectStore.performVertexBevel()">
            <span>Bevel</span>
          </UiButton>
          <UiButton size="xs" :disabled="vertCount === 0" title="Smooth Vertices" @click="projectStore.performSmoothVertices()">
            <span>Smooth</span>
          </UiButton>
          <UiButton size="xs" :disabled="vertCount === 0" title="Randomize Vertices" @click="projectStore.performRandomizeVertices()">
            <span>Random</span>
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
          <UiButton size="xs" :disabled="!canSeparate" title="Split (Y)" @click="projectStore.performSplit()">
            <span>Split</span>
          </UiButton>
          <UiButton size="xs" title="Delete Only Faces" @click="projectStore.performDeleteOnlyFaces()">
            <span>Only Faces</span>
          </UiButton>
          <UiButton size="xs" title="Limited Dissolve" @click="projectStore.performLimitedDissolve(toolStore.limitedDissolveAngle)">
            <span>Ltd Dissolve</span>
          </UiButton>
          <UiNumberField
            class="col-span-1"
            v-model="toolStore.limitedDissolveAngle"
            label="Angle °"
            :min="0"
            :max="90"
            :step="1"
            :precision="0"
          />
          <UiButton size="xs" title="Unsubdivide" @click="projectStore.performUnsubdivide()">
            <span>Unsubdivide</span>
          </UiButton>
          <UiButton size="xs" title="Decimate" @click="projectStore.performDecimate()">
            <span>Decimate</span>
          </UiButton>
          <UiButton size="xs" title="Recalculate Outside (Ctrl+Shift+N)" @click="projectStore.performRecalculateOutside()">
            <span>Recalc Outside</span>
          </UiButton>
          <UiButton size="xs" title="Symmetrize X" @click="projectStore.performSymmetrize('x')">
            <span>Symmetrize X</span>
          </UiButton>
          <UiButton size="xs" :disabled="projectStore.selectedMeshIds.length < 2" title="Boolean Union" @click="projectStore.performBoolean('union')">
            <span>Union</span>
          </UiButton>
          <UiButton size="xs" :disabled="projectStore.selectedMeshIds.length < 2" title="Boolean Difference" @click="projectStore.performBoolean('difference')">
            <span>Difference</span>
          </UiButton>
          <UiButton size="xs" :disabled="projectStore.selectedMeshIds.length < 2" title="Boolean Intersect" @click="projectStore.performBoolean('intersect')">
            <span>Intersect</span>
          </UiButton>
          <UiButton size="xs" :disabled="projectStore.selectedMeshIds.length < 2" title="Knife Project cutter onto active" @click="requestKnifeProject()">
            <span>Knife Project</span>
          </UiButton>
          <UiButton size="xs" title="Separate by Loose Parts" @click="projectStore.performSeparateByLooseParts()">
            <span>By Parts</span>
          </UiButton>
          <UiButton size="xs" title="Separate by Material" @click="projectStore.performSeparateByMaterial()">
            <span>By Material</span>
          </UiButton>
          <UiButton size="xs" title="Bisect" @click="requestModalTool('bisect')">
            <span>Bisect</span>
          </UiButton>
          <UiButton size="xs" title="Spin" @click="requestModalTool('spin')">
            <span>Spin</span>
          </UiButton>
          <UiButton size="xs" title="Shrink/Fatten (Alt+S)" @click="requestModalTool('shrink_fatten')">
            <span>Shrink/Fatten</span>
          </UiButton>
          <UiButton size="xs" title="Shear" @click="requestModalTool('shear')">
            <span>Shear</span>
          </UiButton>
          <UiButton size="xs" title="To Sphere (Shift+Alt+S)" @click="requestModalTool('to_sphere')">
            <span>To Sphere</span>
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
