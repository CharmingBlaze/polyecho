<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
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
const alignAxis = ref<'x' | 'y' | 'z'>('x')
const alignMode = ref<'min' | 'center' | 'max' | 'cursor'>('center')

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

function merge(type: 'center' | 'first' | 'last' | 'distance' | 'cursor' | 'vertex') {
  projectStore.performMerge(type)
}

function setMergeTarget() {
  const ids = projectStore.selectedVertexIds
  toolStore.mergeTargetVertexId = ids.length ? ids[ids.length - 1] : null
}

function deleteSel() {
  const mode = toolStore.selectMode
  if (mode === 'vertex' || mode === 'edge' || mode === 'face' || mode === 'object') {
    projectStore.performDelete(mode)
  }
}

function chooseShade(mode: 'flat' | 'smooth' | 'auto') {
  if ((activeMesh.value?.shadeMode || 'flat') === mode) return
  projectStore.setShadeMode(mode)
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
        <nav class="inspector-seg is-stretch" aria-label="Object shading">
          <button
            type="button"
            class="inspector-seg-btn"
            :class="{ 'is-active': (activeMesh.shadeMode || 'flat') === 'flat' }"
            :aria-pressed="(activeMesh.shadeMode || 'flat') === 'flat'"
            title="Flat — each face keeps its own normal"
            @click="chooseShade('flat')"
          >Flat</button>
          <button
            type="button"
            class="inspector-seg-btn"
            :class="{ 'is-active': activeMesh.shadeMode === 'smooth' }"
            :aria-pressed="activeMesh.shadeMode === 'smooth'"
            title="Smooth — interpolate vertex normals"
            @click="chooseShade('smooth')"
          >Smooth</button>
          <button
            type="button"
            class="inspector-seg-btn"
            :class="{ 'is-active': activeMesh.shadeMode === 'auto' }"
            :aria-pressed="activeMesh.shadeMode === 'auto'"
            title="Smooth, but edges sharper than the angle stay flat"
            @click="chooseShade('auto')"
          >Angle</button>
        </nav>
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
        <div class="grid grid-cols-2 gap-1 pt-1">
          <UiButton size="xs" title="Mark Sharp — split normals on the selected edges. Flat shading switches to Auto so the split is visible." @click="projectStore.markSelectedEdgesSharp()">Mark Sharp</UiButton>
          <UiButton size="xs" title="Clear Sharp on the selected edges" @click="projectStore.clearSelectedEdgesSharp()">Clear Sharp</UiButton>
        </div>
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

      <UiSection title="Subdivision" blender-icon="tool-subdivide" hint="W" v-model:is-open="sections.subdivide">
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
            v-model="toolStore.catmullLevels"
            label="Levels"
            :min="1"
            :max="3"
            :step="1"
            :precision="0"
          />
        </div>
        <div class="grid grid-cols-2 gap-1">
          <UiButton
            size="xs"
            variant="accent"
            :disabled="!canSubdivide"
            title="Simple Subdivide — split faces and keep the current shape"
            @click="projectStore.performSimpleSubdivide(toolStore.selectMode === 'object' || toolStore.selectMode === 'vertex' || toolStore.selectMode === 'edge' || toolStore.selectMode === 'face' ? toolStore.selectMode : undefined)"
          >
            <span>Simple</span>
          </UiButton>
          <UiButton
            size="xs"
            :disabled="!activeMesh"
            title="Catmull–Clark — round the mesh. Levels is how many times."
            @click="projectStore.performCatmullClark()"
          >
            <span>Catmull–Clark</span>
          </UiButton>
        </div>
        <UiNumberField
          v-model="toolStore.subdivideSmoothness"
          label="Smooth"
          :min="0"
          :max="1"
          :step="0.05"
          :precision="2"
        />
        <UiButton
          size="xs"
          class="w-full"
          :disabled="!canSubdivide"
          title="Subdivide (W). Uses Cuts and Smooth. Object mode: whole mesh. Edit mode: selection."
          @click="subdivide"
        >
          <BlenderIcon name="tool-subdivide" :size="12" />
          <span>Subdivide</span>
        </UiButton>
      </UiSection>

      <UiSection title="Symmetry" blender-icon="flip-horizontal" :default-open="false">
        <div class="flex items-center gap-1">
          <span class="text-[9.5px] text-ui-textMuted font-semibold w-11 shrink-0">Falloff</span>
          <UiButton size="xs" class="flex-1" :variant="toolStore.proportionalEdit ? 'accent' : 'default'" title="Proportional move. Drag in the view to slide nearby vertices. Scroll changes the radius." @click="toolStore.toggleProportionalTool()">Proportional</UiButton>
        </div>
        <UiNumberField v-if="toolStore.proportionalEdit" v-model="toolStore.proportionalRadius" label="Radius" :min="0.05" :max="100" :step="0.05" :precision="2" />
        <div class="flex items-center gap-1">
          <span class="text-[9.5px] text-ui-textMuted font-semibold w-11 shrink-0">Live</span>
          <UiButton size="xs" class="flex-1" :variant="toolStore.viewport.symmetryX ? 'accent' : 'default'" title="Live symmetry across X" @click="toolStore.viewport.symmetryX = !toolStore.viewport.symmetryX">X</UiButton>
          <UiButton size="xs" class="flex-1" :variant="toolStore.viewport.symmetryY ? 'accent' : 'default'" title="Live symmetry across Y" @click="toolStore.viewport.symmetryY = !toolStore.viewport.symmetryY">Y</UiButton>
          <UiButton size="xs" class="flex-1" :variant="toolStore.viewport.symmetryZ ? 'accent' : 'default'" title="Live symmetry across Z" @click="toolStore.viewport.symmetryZ = !toolStore.viewport.symmetryZ">Z</UiButton>
        </div>
        <div class="flex items-center gap-1">
          <span class="text-[9.5px] text-ui-textMuted font-semibold w-11 shrink-0">Flip</span>
          <UiButton size="xs" class="flex-1" title="Flip horizontal (X)" @click="projectStore.performFlipAxis('x')">H</UiButton>
          <UiButton size="xs" class="flex-1" title="Flip vertical (Y)" @click="projectStore.performFlipAxis('y')">V</UiButton>
          <UiButton size="xs" class="flex-1" title="Flip Z" @click="projectStore.performFlipAxis('z')">Z</UiButton>
        </div>
        <div class="flex items-center gap-1">
          <span class="text-[9.5px] text-ui-textMuted font-semibold w-11 shrink-0">Mirror</span>
          <UiButton size="xs" class="flex-1" title="Mirror a copy across X. Plane is the offset along that axis." @click="projectStore.performMirror('x')">X</UiButton>
          <UiButton size="xs" class="flex-1" title="Mirror a copy across Y" @click="projectStore.performMirror('y')">Y</UiButton>
          <UiButton size="xs" class="flex-1" title="Mirror a copy across Z" @click="projectStore.performMirror('z')">Z</UiButton>
        </div>
        <UiNumberField v-model="toolStore.mirrorOffset" label="Plane" :min="-100" :max="100" :step="0.1" :precision="2" />
        <div class="flex items-center gap-1">
          <span class="text-[9.5px] text-ui-textMuted font-semibold w-11 shrink-0">Sym</span>
          <UiButton size="xs" class="flex-1" title="Symmetrize — copy the positive X side onto the negative side" @click="projectStore.performSymmetrize('x')">X</UiButton>
          <UiButton size="xs" class="flex-1" title="Symmetrize Y" @click="projectStore.performSymmetrize('y')">Y</UiButton>
          <UiButton size="xs" class="flex-1" title="Symmetrize Z" @click="projectStore.performSymmetrize('z')">Z</UiButton>
        </div>
        <div class="grid grid-cols-2 gap-1">
          <UiNumberField v-model="toolStore.arrayCount" label="Count" :min="2" :max="24" :step="1" :precision="0" />
          <UiNumberField v-model="toolStore.arrayOffset" label="Offset" :min="-100" :max="100" :step="0.1" :precision="2" />
        </div>
        <div class="flex items-center gap-1">
          <span class="text-[9.5px] text-ui-textMuted font-semibold w-11 shrink-0">Axis</span>
          <UiButton size="xs" class="flex-1" :variant="toolStore.arrayAxis === 'x' ? 'accent' : 'default'" @click="toolStore.arrayAxis = 'x'">X</UiButton>
          <UiButton size="xs" class="flex-1" :variant="toolStore.arrayAxis === 'y' ? 'accent' : 'default'" @click="toolStore.arrayAxis = 'y'">Y</UiButton>
          <UiButton size="xs" class="flex-1" :variant="toolStore.arrayAxis === 'z' ? 'accent' : 'default'" @click="toolStore.arrayAxis = 'z'">Z</UiButton>
        </div>
        <div class="grid grid-cols-2 gap-1">
          <UiButton size="xs" title="Linear array — repeat the selected objects along the axis" @click="projectStore.performLinearArray()">Linear</UiButton>
          <UiButton size="xs" title="Radial array — repeat the selected objects around the axis" @click="projectStore.performRadialArray()">Radial</UiButton>
          <UiButton size="xs" class="col-span-2" title="Instance duplicate — a linked copy. Editing it edits the source." @click="projectStore.performInstanceDuplicate()">Instance Duplicate</UiButton>
        </div>
      </UiSection>

      <UiSection title="Snap" blender-icon="snap" :default-open="false">
        <div class="grid grid-cols-2 gap-1">
          <UiButton size="xs" :variant="toolStore.snapping.grid ? 'accent' : 'default'" title="Snap moves to grid increments" @click="toolStore.snapping.grid = !toolStore.snapping.grid">Grid</UiButton>
          <UiButton size="xs" :variant="toolStore.snapping.vertex ? 'accent' : 'default'" title="Snap to vertices while moving" @click="toolStore.snapping.vertex = !toolStore.snapping.vertex">Vertex</UiButton>
          <UiButton size="xs" :variant="toolStore.snapping.edge ? 'accent' : 'default'" title="Snap to edge centers while moving" @click="toolStore.snapping.edge = !toolStore.snapping.edge">Edge</UiButton>
          <UiButton size="xs" :variant="toolStore.snapping.face ? 'accent' : 'default'" title="Snap onto faces while moving" @click="toolStore.snapping.face = !toolStore.snapping.face">Face</UiButton>
        </div>
        <div class="grid grid-cols-2 gap-1">
          <UiButton size="xs" title="Move the selection onto the grid" @click="projectStore.performSnap('grid')">To Grid</UiButton>
          <UiButton size="xs" title="Move the selection to the nearest other vertex" @click="projectStore.performSnap('vertex')">To Vertex</UiButton>
          <UiButton size="xs" title="Move the selection to the nearest edge center" @click="projectStore.performSnap('edge')">To Edge</UiButton>
          <UiButton size="xs" title="Place the selection on the nearest face" @click="projectStore.performSnap('face')">To Face</UiButton>
        </div>
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
          <UiButton size="xs" :disabled="!hasFaces" title="Solidify — add thickness to the selected surface" @click="projectStore.performSolidifyFaces()">
            <span>Solidify</span>
          </UiButton>
          <UiButton size="xs" class="col-span-2" title="Flip Normals (Shift+N). Uses selected faces, or the whole mesh." @click="projectStore.performFlipNormals()">
            <BlenderIcon name="flip-normals" :size="12" />
            <span>Flip Normals</span>
          </UiButton>
        </div>
        <UiNumberField
          v-model="toolStore.solidifyThickness"
          label="Thickness"
          :min="0.001"
          :max="10"
          :step="0.01"
          :precision="3"
        />
      </UiSection>

      <UiSection
        title="Edges"
        blender-icon="edge-select"
        :badge="edgeCount || undefined"
        v-model:is-open="sections.edge"
      >
        <div class="grid grid-cols-2 gap-1">
          <UiButton size="xs" :disabled="!hasEdges" title="Bridge Edge Loops — drag sets segments, scroll sets twist, click confirms" @click="requestModalTool('bridge')">
            <BlenderIcon name="bridge-edges" :size="12" />
            <span>Bridge Loops</span>
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
          <UiButton size="xs" data-modal-tool="edge_slide" :disabled="!hasEdges" title="Edge Slide (Shift+G)" @click="requestModalTool('edge_slide')">
            <span>Slide</span>
          </UiButton>
          <UiButton size="xs" data-modal-tool="offset_loop" :disabled="!hasEdges" title="Offset Edge Loop (Ctrl+Shift+R)" @click="requestModalTool('offset_loop')">
            <span>Offset Loop</span>
          </UiButton>
          <UiButton size="xs" :disabled="!hasEdges && vertCount < 2" title="Split Edge — insert a vertex along each selected edge" @click="projectStore.performSplitEdges()">
            <span>Split Edge</span>
          </UiButton>
          <UiButton size="xs" title="Select boundary edges" @click="projectStore.selectBoundaryEdges()">Boundary</UiButton>
          <UiButton size="xs" title="Select edges shared by three or more faces" @click="projectStore.selectNonManifoldEdges()">Non-manifold</UiButton>
          <UiButton size="xs" class="col-span-2" title="Select edges sharper than the auto-smooth angle, and edges marked sharp" @click="projectStore.selectSharpEdges()">Select Sharp</UiButton>
          <UiNumberField
            v-model="toolStore.splitEdgeFactor"
            label="Factor"
            :min="0.01"
            :max="0.99"
            :step="0.05"
            :precision="2"
          />
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
        <div class="grid grid-cols-3 gap-1">
          <UiButton size="xs" :disabled="!hasVerts" title="Merge at Center (M)" @click="merge('center')">Center</UiButton>
          <UiButton size="xs" :disabled="!hasVerts" title="Merge at First" @click="merge('first')">First</UiButton>
          <UiButton size="xs" :disabled="!hasVerts" title="Merge at Last" @click="merge('last')">Last</UiButton>
          <UiButton size="xs" :disabled="!hasVerts" title="Merge at 3D Cursor" @click="merge('cursor')">Cursor</UiButton>
          <UiButton size="xs" :disabled="vertCount < 1 || !toolStore.mergeTargetVertexId" title="Merge the selection onto the vertex chosen with Set Target" @click="merge('vertex')">Vertex</UiButton>
          <UiButton size="xs" title="Weld by Distance — merge vertices closer than the distance" @click="merge('distance')">Weld</UiButton>
        </div>
        <div class="grid grid-cols-2 gap-1">
          <UiButton size="xs" :disabled="vertCount === 0" title="Remember the last selected vertex as the merge target" @click="setMergeTarget">Set Target</UiButton>
          <UiNumberField
            v-model="toolStore.weldDistance"
            label="Weld"
            :min="0"
            :max="10"
            :step="0.001"
            :precision="4"
          />
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
          <UiButton size="xs" data-modal-tool="vertex_slide" :disabled="vertCount === 0" title="Vertex Slide (Shift+V)" @click="requestModalTool('vertex_slide')">
            <span>Slide</span>
          </UiButton>
          <UiButton size="xs" :disabled="vertCount === 0" title="Vertex Bevel — width and segments below. Edge bevel on the toolbar uses drag and scroll." @click="projectStore.performVertexBevel()">
            <span>Bevel</span>
          </UiButton>
          <UiButton size="xs" :disabled="vertCount === 0" title="Smooth Vertices" @click="projectStore.performSmoothVertices()">
            <span>Smooth</span>
          </UiButton>
          <UiButton size="xs" :disabled="vertCount < 3 && edgeCount < 3 && !hasFaces" title="Circle — reshape the selected loop into an even circle (LoopTools)" @click="projectStore.performCircle()">
            <span>Circle</span>
          </UiButton>
          <UiButton size="xs" :disabled="vertCount === 0" title="Randomize Vertices" @click="projectStore.performRandomizeVertices()">
            <span>Random</span>
          </UiButton>
        </div>
        <div class="grid grid-cols-2 gap-1">
          <UiNumberField
            v-model="toolStore.vertexBevelWidth"
            label="Bevel"
            :min="0.001"
            :max="10"
            :step="0.01"
            :precision="3"
          />
          <UiNumberField
            v-model="toolStore.vertexBevelSegments"
            label="Segs"
            :min="1"
            :max="8"
            :step="1"
            :precision="0"
          />
        </div>
      </UiSection>

      <UiSection title="Mesh" blender-icon="mesh-cube" v-model:is-open="sections.mesh">
        <div class="grid grid-cols-2 gap-1">
          <UiButton size="xs" title="Duplicate (Shift+D)" @click="projectStore.duplicateSelection(toolStore.selectMode)">
            <BlenderIcon name="duplicate" :size="12" />
            <span>Duplicate</span>
          </UiButton>
          <UiButton size="xs" title="Bake rotation and scale into the vertices. This also happens when you finish rotating or scaling an object." @click="projectStore.performApplyRotationScale()">Apply Rot/Scale</UiButton>
          <UiButton size="xs" class="col-span-2" title="Turn a linked instance into real geometry" @click="projectStore.performMakeUnique()">Make Unique</UiButton>
          <UiButton size="xs" :disabled="!canSeparate" title="Separate — move the selection into a new mesh object (P)" @click="projectStore.performSeparateMesh()">
            <BlenderIcon name="separate-mesh" :size="12" />
            <span>Separate</span>
          </UiButton>
          <UiButton size="xs" :disabled="projectStore.selectedMeshIds.length < 2" title="Join — combine the selected objects into one mesh (Ctrl+J)" @click="projectStore.performJoinMeshes()">
            <BlenderIcon name="join-mesh" :size="12" />
            <span>Join</span>
          </UiButton>
          <UiButton size="xs" title="Clean degenerate geometry" @click="projectStore.performCleanupMesh()">
            <BlenderIcon name="clean-mesh" :size="12" />
            <span>Clean</span>
          </UiButton>
          <UiButton size="xs" :disabled="!canSeparate" title="Detach — disconnect selected faces and keep them in this object (Y)" @click="projectStore.performSplit()">
            <span>Detach</span>
          </UiButton>
          <UiButton size="xs" title="Delete Only Faces" @click="projectStore.performDeleteOnlyFaces()">
            <span>Only Faces</span>
          </UiButton>
          <UiButton size="xs" title="Limited Dissolve" @click="projectStore.performLimitedDissolve(toolStore.limitedDissolveAngle)">
            <span>Ltd Dissolve</span>
          </UiButton>
        </div>
        <div class="flex items-center gap-1">
          <span class="text-[9.5px] text-ui-textMuted font-semibold w-11 shrink-0">Align</span>
          <UiButton size="xs" class="flex-1" :variant="alignAxis === 'x' ? 'accent' : 'default'" @click="alignAxis = 'x'">X</UiButton>
          <UiButton size="xs" class="flex-1" :variant="alignAxis === 'y' ? 'accent' : 'default'" @click="alignAxis = 'y'">Y</UiButton>
          <UiButton size="xs" class="flex-1" :variant="alignAxis === 'z' ? 'accent' : 'default'" @click="alignAxis = 'z'">Z</UiButton>
        </div>
        <div class="grid grid-cols-4 gap-1">
          <UiButton size="xs" :variant="alignMode === 'min' ? 'accent' : 'default'" title="Align to the selection minimum" @click="alignMode = 'min'">Min</UiButton>
          <UiButton size="xs" :variant="alignMode === 'center' ? 'accent' : 'default'" title="Align to the selection center" @click="alignMode = 'center'">Ctr</UiButton>
          <UiButton size="xs" :variant="alignMode === 'max' ? 'accent' : 'default'" title="Align to the selection maximum" @click="alignMode = 'max'">Max</UiButton>
          <UiButton size="xs" :variant="alignMode === 'cursor' ? 'accent' : 'default'" title="Align to the 3D cursor" @click="alignMode = 'cursor'">Cur</UiButton>
        </div>
        <UiButton size="xs" class="w-full" title="Object mode moves objects. Edit mode moves the selected vertices." @click="projectStore.performAlign(alignAxis, alignMode)">Align</UiButton>
        <div class="grid grid-cols-2 gap-1">
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
          <UiButton size="xs" data-modal-tool="bisect" title="Bisect" @click="requestModalTool('bisect')">
            <span>Bisect</span>
          </UiButton>
          <UiButton size="xs" data-modal-tool="spin" title="Spin — rotate and extrude the selection around an axis" @click="requestModalTool('spin')">
            <span>Spin</span>
          </UiButton>
          <UiButton size="xs" :disabled="vertCount < 2 && !hasEdges" title="Lathe — revolve a profile 360° around the object axis" @click="projectStore.performLathe()">
            <span>Lathe</span>
          </UiButton>
          <UiButton size="xs" title="Shell — hollow the object and keep an outer wall. Selected faces become openings." @click="projectStore.performShell()">
            <span>Shell</span>
          </UiButton>
          <UiButton size="xs" data-modal-tool="shrink_fatten" title="Shrink/Fatten (Alt+S)" @click="requestModalTool('shrink_fatten')">
            <span>Shrink/Fatten</span>
          </UiButton>
          <UiButton size="xs" data-modal-tool="shear" title="Shear" @click="requestModalTool('shear')">
            <span>Shear</span>
          </UiButton>
          <UiButton size="xs" data-modal-tool="curve" title="Curve — drag to bow the selected vertices or edges into a round arc" @click="requestModalTool('curve')">
            <span>Curve</span>
          </UiButton>
          <UiButton size="xs" title="Spherize — move the selection toward a sphere. Shift+Alt+S drags the amount." @click="projectStore.performSpherize()">
            <span>Spherize</span>
          </UiButton>
        </div>
        <div class="grid grid-cols-2 gap-1">
          <UiNumberField
            v-model="toolStore.latheSteps"
            label="Steps"
            :min="3"
            :max="64"
            :step="1"
            :precision="0"
          />
          <UiNumberField
            v-model="toolStore.shellThickness"
            label="Shell"
            :min="0.001"
            :max="10"
            :step="0.01"
            :precision="3"
          />
          <UiNumberField
            v-model="toolStore.spherizeFactor"
            label="Sphere"
            :min="0"
            :max="1"
            :step="0.05"
            :precision="2"
          />
        </div>
        <div class="flex items-center gap-1">
          <span class="text-[9.5px] text-ui-textMuted font-semibold w-11 shrink-0">Axis</span>
          <UiButton size="xs" class="flex-1" :variant="toolStore.latheAxis === 'x' ? 'accent' : 'default'" title="Lathe around X" @click="toolStore.latheAxis = 'x'">X</UiButton>
          <UiButton size="xs" class="flex-1" :variant="toolStore.latheAxis === 'y' ? 'accent' : 'default'" title="Lathe around Y" @click="toolStore.latheAxis = 'y'">Y</UiButton>
          <UiButton size="xs" class="flex-1" :variant="toolStore.latheAxis === 'z' ? 'accent' : 'default'" title="Lathe around Z" @click="toolStore.latheAxis = 'z'">Z</UiButton>
        </div>
        <div class="flex items-center gap-1">
          <span class="text-[9.5px] text-ui-textMuted font-semibold w-11 shrink-0">Flatten</span>
          <UiButton size="xs" class="flex-1" :disabled="!canFlatten" title="Flatten X" @click="projectStore.performFlatten('x')">X</UiButton>
          <UiButton size="xs" class="flex-1" :disabled="!canFlatten" title="Flatten Y" @click="projectStore.performFlatten('y')">Y</UiButton>
          <UiButton size="xs" class="flex-1" :disabled="!canFlatten" title="Flatten Z" @click="projectStore.performFlatten('z')">Z</UiButton>
        </div>
        <div class="flex items-center gap-1">
          <span class="text-[9.5px] text-ui-textMuted font-semibold w-16 shrink-0">Straighten</span>
          <UiButton size="xs" class="flex-1" :disabled="!canFlatten" title="Make the selection a straight level line. Faces lie flat." @click="projectStore.performStraighten('horizontal')">Horizontal</UiButton>
          <UiButton size="xs" class="flex-1" :disabled="!canFlatten" title="Make the selection a straight upright line. Faces stand in a vertical plane." @click="projectStore.performStraighten('vertical')">Vertical</UiButton>
        </div>
        <UiButton size="xs" class="w-full" variant="danger" title="Delete (X)" @click="deleteSel">
          <BlenderIcon name="trash" :size="12" />
          <span>Delete</span>
        </UiButton>
      </UiSection>
    </div>
  </div>
</template>
