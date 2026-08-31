<script setup lang="ts">
import { ref, computed } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { useAnimationStore } from '../../stores/animationStore'
import { useToolStore } from '../../stores/toolStore'
import UiSection from '../ui/UiSection.vue'
import UiNumberField from '../ui/UiNumberField.vue'
import UiButton from '../ui/UiButton.vue'
import { 
  Copy, 
  FlipHorizontal, 
  Crosshair, 
  Move,
  RotateCw,
  Maximize2,
  Image as ImageIcon,
  Plus,
  Palette,
  X
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

const activeMaterial = computed(() => {
  if (!activeMesh.value) return null
  const matId = activeMesh.value.materialId || 'default_material'
  return projectStore.materials.find(m => m.id === matId) || projectStore.materials[0]
})

const activeTextureId = computed(() => {
  return activeMaterial.value?.textureId || projectStore.textures[0]?.id || 'tex_default'
})

const activeTextureObj = computed(() => {
  return projectStore.textures.find(t => t.id === activeTextureId.value) || projectStore.textures[0]
})

const isSharedMaterial = computed(() => {
  if (!activeMesh.value) return false
  const matId = activeMesh.value.materialId || 'default_material'
  return projectStore.meshes.filter(m => m.materialId === matId).length > 1
})

function onTextureSelectChange(newTexId: string) {
  projectStore.assignTextureToActiveMesh(newTexId)
}

const showCreateTexModal = ref(false)
const newTexName = ref('')
const newTexSize = ref(64)

function handleCreateNewTexture() {
  const name = newTexName.value.trim() || `Texture_${projectStore.textures.length + 1}`
  const newTex = projectStore.addTexture(name, newTexSize.value, newTexSize.value)
  projectStore.assignTextureToActiveMesh(newTex.id)
  showCreateTexModal.value = false
  newTexName.value = ''
}

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

function handleOriginNumericChange(axis: 'x' | 'y' | 'z', newPos: number) {
  if (!activeMesh.value) return
  const currentPos = activeMesh.value.position[axis]
  const delta = newPos - currentPos
  if (axis === 'x') projectStore.offsetMeshOrigin(activeMesh.value.id, delta, 0, 0, 'Edit Origin X')
  else if (axis === 'y') projectStore.offsetMeshOrigin(activeMesh.value.id, 0, delta, 0, 'Edit Origin Y')
  else if (axis === 'z') projectStore.offsetMeshOrigin(activeMesh.value.id, 0, 0, delta, 'Edit Origin Z')
}

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
      <UiSection v-if="toolStore.appMode === 'model'" title="Origin / Pivot" :default-open="true">
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
          <div class="text-[9.5px] text-ui-textMuted uppercase font-semibold">Snap Origin To</div>
          
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

      <!-- 3. Material & Texture Quick Assignment Section (Model Mode) -->
      <UiSection v-if="toolStore.appMode === 'model' && activeMesh" title="Material & Texture" :default-open="true">
        <div class="space-y-2 text-xs">
          <!-- Active Texture Selector -->
          <div class="space-y-1">
            <div class="flex items-center justify-between text-[10px] text-ui-textMuted uppercase font-semibold">
              <span class="flex items-center gap-1"><ImageIcon class="w-3 h-3 text-sky-400" /> Texture</span>
              <span class="font-mono text-amber-300 text-[9px]">{{ activeTextureObj?.width || 64 }}x{{ activeTextureObj?.height || 64 }}px</span>
            </div>
            
            <div class="flex items-center gap-1.5">
              <select 
                :value="activeTextureId"
                @change="onTextureSelectChange(($event.target as HTMLSelectElement).value)"
                class="flex-1 bg-ui-surface border border-ui-borderDefault rounded-xs px-2 py-1 text-sky-300 font-mono text-[11px] focus:outline-none focus:border-ui-accent cursor-pointer font-bold truncate"
              >
                <option v-for="tex in projectStore.textures" :key="tex.id" :value="tex.id">
                  {{ tex.name }} ({{ tex.width }}x{{ tex.height }})
                </option>
              </select>
              
              <button 
                @click="showCreateTexModal = true"
                class="px-2 py-1 rounded-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/50 transition text-[10px] font-bold cursor-pointer flex items-center gap-1 shrink-0"
                title="Create a new texture and assign it to this object"
              >
                <Plus class="w-3 h-3" /> New
              </button>
            </div>
          </div>

          <!-- Active Material Selector -->
          <div class="space-y-1 pt-1.5 border-t border-ui-borderSubtle">
            <div class="flex items-center justify-between text-[10px] text-ui-textMuted uppercase font-semibold">
              <span class="flex items-center gap-1"><Palette class="w-3 h-3 text-amber-400" /> Material</span>
              <span v-if="isSharedMaterial" class="text-amber-400 text-[9px] font-bold">Shared</span>
            </div>

            <div class="flex items-center gap-1.5">
              <select 
                :value="activeMesh.materialId || 'default_material'"
                @change="projectStore.assignMaterialToActiveMesh(($event.target as HTMLSelectElement).value)"
                class="flex-1 bg-ui-surface border border-ui-borderDefault rounded-xs px-2 py-1 text-ui-textPrimary font-mono text-[11px] focus:outline-none focus:border-ui-accent cursor-pointer truncate"
              >
                <option v-for="mat in projectStore.materials" :key="mat.id" :value="mat.id">
                  {{ mat.name }}
                </option>
              </select>

              <button 
                v-if="isSharedMaterial"
                @click="projectStore.makeActiveMeshMaterialUnique()"
                class="px-1.5 py-1 rounded-xs bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-500/50 transition text-[9.5px] font-bold cursor-pointer shrink-0"
                title="Fork into a dedicated unique material for this object"
              >
                Fork
              </button>
            </div>
          </div>
        </div>
      </UiSection>
    </div>

    <div v-else class="p-6 text-center text-ui-textMuted italic text-xs">
      No object or bone selected.
    </div>

    <!-- Create Texture Mini Modal -->
    <div v-if="showCreateTexModal" class="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center z-50 select-none p-4" @click.self="showCreateTexModal = false">
      <div class="bg-ui-panel border border-ui-borderStrong rounded-md shadow-2xl w-80 overflow-hidden flex flex-col">
        <div class="h-9 bg-ui-header border-b border-ui-borderDefault px-3 flex items-center justify-between">
          <div class="flex items-center gap-1.5 font-bold text-xs text-ui-textPrimary">
            <ImageIcon class="w-4 h-4 text-amber-400" />
            <span>New Texture for {{ activeMesh?.name }}</span>
          </div>
          <button @click="showCreateTexModal = false" class="p-1 hover:bg-ui-hover text-ui-textMuted hover:text-ui-textPrimary rounded-xs cursor-pointer">
            <X class="w-3.5 h-3.5" />
          </button>
        </div>

        <div class="p-3 space-y-3 text-xs">
          <div class="space-y-1">
            <label class="text-[10px] uppercase font-bold text-ui-textMuted">Texture Name</label>
            <input 
              v-model="newTexName"
              placeholder="e.g. Wood_Crate_Texture"
              class="w-full bg-ui-input border border-ui-borderDefault focus:border-ui-accent rounded-xs px-2 py-1 text-ui-textPrimary font-mono text-xs focus:outline-none"
              autoFocus
              @keydown.enter="handleCreateNewTexture"
            />
          </div>

          <div class="space-y-1">
            <label class="text-[10px] uppercase font-bold text-ui-textMuted">Resolution (Square)</label>
            <div class="grid grid-cols-4 gap-1">
              <button 
                v-for="s in [16, 32, 64, 128]" 
                :key="s"
                type="button"
                @click="newTexSize = s"
                class="py-1 rounded-xs font-mono text-[10px] font-bold border transition cursor-pointer text-center"
                :class="newTexSize === s ? 'bg-amber-500/25 text-amber-300 border-amber-500/60 shadow-xs' : 'bg-ui-surface text-ui-textSecondary border-ui-borderSubtle hover:bg-ui-hover'"
              >
                {{ s }}px
              </button>
            </div>
          </div>
        </div>

        <div class="p-2.5 bg-ui-header border-t border-ui-borderDefault flex justify-end gap-1.5">
          <button 
            @click="showCreateTexModal = false"
            class="px-2.5 py-1 rounded-xs text-[11px] font-medium text-ui-textSecondary hover:bg-ui-hover border border-ui-borderSubtle cursor-pointer"
          >
            Cancel
          </button>
          <button 
            @click="handleCreateNewTexture"
            class="px-3 py-1 rounded-xs text-[11px] font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-xs cursor-pointer flex items-center gap-1"
          >
            <Plus class="w-3.5 h-3.5" />
            <span>Create & Assign</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
