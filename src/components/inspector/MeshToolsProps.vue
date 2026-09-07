<script setup lang="ts">
import { computed } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { useToolStore } from '../../stores/toolStore'
import UiSection from '../ui/UiSection.vue'
import UiButton from '../ui/UiButton.vue'
import UiNumberField from '../ui/UiNumberField.vue'
import BlenderIcon from '../icons/BlenderIcon.vue'
import { requestFillFace, requestModalTool } from '../../core/commands/editorCommands'

const projectStore = useProjectStore()
const toolStore = useToolStore()

const activeMesh = computed(() => projectStore.activeMesh)
const isEdit = computed(() =>
  toolStore.selectMode === 'vertex' || toolStore.selectMode === 'edge' || toolStore.selectMode === 'face'
)
const hasFaces = computed(() => projectStore.selectedFaceIds.length > 0)
const hasEdges = computed(() => projectStore.selectedEdgeIds.length > 0)
const hasVerts = computed(() => projectStore.selectedVertexIds.length >= 2)
const canSubdivide = computed(() => {
  if (!activeMesh.value) return false
  if (toolStore.selectMode === 'object') return activeMesh.value.faces.length > 0
  return isEdit.value && (hasFaces.value || hasEdges.value || projectStore.selectedVertexIds.length > 0)
})

function enterEdit(mode: 'vertex' | 'edge' | 'face') {
  toolStore.selectMode = mode
}

function startModal(tool: 'extrude' | 'inset' | 'bevel' | 'loop_cut' | 'knife' | 'grab' | 'rotate' | 'scale') {
  requestModalTool(tool)
}

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
    <div class="h-7 bg-ui-header border-b border-ui-borderSubtle px-2.5 flex items-center justify-between">
      <div class="flex items-center space-x-1.5">
        <BlenderIcon name="tools" :size="13" />
        <span class="text-[11px] font-medium text-ui-textMuted">Mesh Tools</span>
      </div>
      <span class="font-semibold text-ui-textPrimary truncate max-w-[150px]">{{ activeMesh?.name || 'No object' }}</span>
    </div>

    <div v-if="!activeMesh" class="p-6 text-center text-ui-textMuted italic text-xs">
      Select a mesh to use edit tools.
    </div>

    <div v-else class="flex flex-col divide-y divide-ui-borderSubtle">
      <div v-if="!isEdit" class="p-2 space-y-2 bg-amber-950/20">
        <p class="text-[10.5px] text-amber-200/90 leading-snug">
          Subdivide works on the whole object here. Extrude, Inset, Bevel, and Knife need Vertex, Edge, or Face mode (Tab).
        </p>
        <div class="grid grid-cols-3 gap-1">
          <UiButton size="xs" title="Vertex mode (1)" @click="enterEdit('vertex')">
            <BlenderIcon name="vertex-select" :size="12" />
            <span>Vertex</span>
          </UiButton>
          <UiButton size="xs" title="Edge mode (2)" @click="enterEdit('edge')">
            <BlenderIcon name="edge-select" :size="12" />
            <span>Edge</span>
          </UiButton>
          <UiButton size="xs" title="Face mode (3)" @click="enterEdit('face')">
            <BlenderIcon name="face-select" :size="12" />
            <span>Face</span>
          </UiButton>
        </div>
      </div>

      <UiSection title="Add" blender-icon="tool-extrude" hint="modal" :default-open="true">
        <div class="grid grid-cols-2 gap-1">
          <UiButton size="xs" :disabled="!isEdit" title="Extrude Region (E)" @click="startModal('extrude')">
            <BlenderIcon name="tool-extrude" :size="12" />
            <span>Extrude</span>
          </UiButton>
          <UiButton size="xs" :disabled="!isEdit || !hasFaces" title="Inset Faces (I)" @click="startModal('inset')">
            <BlenderIcon name="tool-inset" :size="12" />
            <span>Inset</span>
          </UiButton>
          <UiButton size="xs" :disabled="!isEdit" title="Bevel (Ctrl+B)" @click="startModal('bevel')">
            <BlenderIcon name="tool-bevel" :size="12" />
            <span>Bevel</span>
          </UiButton>
          <UiButton size="xs" :disabled="!isEdit" title="Loop Cut and Slide (Ctrl+R)" @click="startModal('loop_cut')">
            <BlenderIcon name="tool-loopcut" :size="12" />
            <span>Loop Cut</span>
          </UiButton>
          <UiButton size="xs" class="col-span-2" :disabled="!isEdit" title="Knife (K)" @click="startModal('knife')">
            <BlenderIcon name="tool-knife" :size="12" />
            <span>Knife</span>
          </UiButton>
        </div>
      </UiSection>

      <UiSection title="Subdivide" blender-icon="tool-subdivide" hint="W" :default-open="true">
        <p class="text-[10px] text-ui-textMuted leading-snug">
          Object mode splits every face on the selected mesh. Edit mode splits the current faces or edges, sharing new verts like Blender Subdivide.
        </p>
        <div class="grid grid-cols-2 gap-1">
          <div>
            <div class="text-[9.5px] text-ui-textMuted font-semibold mb-0.5">Number of Cuts</div>
            <UiNumberField
              v-model="toolStore.subdivideCuts"
              :min="1"
              :max="10"
              :step="1"
              :precision="0"
            />
          </div>
          <div>
            <div class="text-[9.5px] text-ui-textMuted font-semibold mb-0.5">Smoothness</div>
            <UiNumberField
              v-model="toolStore.subdivideSmoothness"
              :min="0"
              :max="1"
              :step="0.05"
              :precision="2"
            />
          </div>
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

      <UiSection title="Face" blender-icon="face-select" :default-open="true">
        <div class="grid grid-cols-2 gap-1">
          <UiButton size="xs" :disabled="!isEdit" title="Fill (F)" @click="requestFillFace()">
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
          <UiButton size="xs" class="col-span-2" title="Flip Normals (Shift+N)" @click="projectStore.performFlipNormals()">
            <BlenderIcon name="flip-normals" :size="12" />
            <span>Flip Normals</span>
          </UiButton>
        </div>
      </UiSection>

      <UiSection title="Edge" blender-icon="edge-select" :default-open="false">
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

      <UiSection title="Vertex" blender-icon="vertex-select" :default-open="false">
        <div class="grid grid-cols-2 gap-1">
          <UiButton size="xs" :disabled="!hasVerts" title="Merge at Center (M)" @click="merge('center')">
            <BlenderIcon name="tool-merge" :size="12" />
            <span>Merge Center</span>
          </UiButton>
          <UiButton size="xs" :disabled="!hasVerts" title="Merge at First" @click="merge('first')">
            <span>Merge First</span>
          </UiButton>
          <UiButton size="xs" :disabled="!hasVerts" title="Merge at Last" @click="merge('last')">
            <span>Merge Last</span>
          </UiButton>
          <UiButton size="xs" title="Merge by Distance" @click="merge('distance')">
            <span>By Distance</span>
          </UiButton>
          <UiButton size="xs" :disabled="projectStore.selectedVertexIds.length !== 2" title="Connect Vertex Path (J)" @click="projectStore.performConnectVertices()">
            <BlenderIcon name="connect-verts" :size="12" />
            <span>Connect</span>
          </UiButton>
          <UiButton size="xs" :disabled="projectStore.selectedVertexIds.length === 0" title="Dissolve Vertices (Ctrl+X)" @click="projectStore.performDissolve('vertex')">
            <BlenderIcon name="dissolve" :size="12" />
            <span>Dissolve</span>
          </UiButton>
        </div>
      </UiSection>

      <UiSection title="Mesh" blender-icon="mesh-cube" :default-open="false">
        <div class="grid grid-cols-2 gap-1">
          <UiButton size="xs" title="Delete (X)" variant="danger" @click="deleteSel">
            <BlenderIcon name="trash" :size="12" />
            <span>Delete</span>
          </UiButton>
          <UiButton size="xs" title="Duplicate (Shift+D)" @click="projectStore.duplicateSelection(toolStore.selectMode)">
            <BlenderIcon name="duplicate" :size="12" />
            <span>Duplicate</span>
          </UiButton>
          <UiButton size="xs" :disabled="!hasFaces" title="Separate Selection (P)" @click="projectStore.performSeparateMesh()">
            <BlenderIcon name="separate-mesh" :size="12" />
            <span>Separate</span>
          </UiButton>
          <UiButton size="xs" :disabled="projectStore.selectedMeshIds.length < 2" title="Join (Ctrl+J)" @click="projectStore.performJoinMeshes()">
            <BlenderIcon name="join-mesh" :size="12" />
            <span>Join</span>
          </UiButton>
          <UiButton size="xs" title="Flatten X" @click="projectStore.performFlatten('x')">
            <BlenderIcon name="flatten-mesh" :size="12" />
            <span>Flatten X</span>
          </UiButton>
          <UiButton size="xs" title="Flatten Y" @click="projectStore.performFlatten('y')">
            <span>Flatten Y</span>
          </UiButton>
          <UiButton size="xs" title="Flatten Z" @click="projectStore.performFlatten('z')">
            <span>Flatten Z</span>
          </UiButton>
          <UiButton size="xs" title="Clean degenerate geometry" @click="projectStore.performCleanupMesh()">
            <BlenderIcon name="clean-mesh" :size="12" />
            <span>Clean</span>
          </UiButton>
        </div>
      </UiSection>
    </div>
  </div>
</template>
