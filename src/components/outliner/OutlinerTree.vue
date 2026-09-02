<script setup lang="ts">
import { ref, computed } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { useAnimationStore } from '../../stores/animationStore'
import { useToolStore } from '../../stores/toolStore'
import BlenderIcon from '../icons/BlenderIcon.vue'
import { GitBranch, Search, Plus } from 'lucide-vue-next'
import { resolveMeshBoneParentId } from '../../core/animation/Armature'
import { requestPrimitiveMenu } from '../../core/commands/editorCommands'
import type { MeshObject } from '../../types/mesh'

const projectStore = useProjectStore()
const animationStore = useAnimationStore()
const toolStore = useToolStore()

const activeTab = ref<'meshes' | 'armature'>('meshes')
const searchQuery = ref<string>('')
const editingItemId = ref<string | null>(null)
const editingName = ref<string>('')

function handleAddMeshClick(e: MouseEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  requestPrimitiveMenu({ x: Math.max(20, rect.left - 370), y: Math.max(40, rect.top) })
}

const filteredMeshes = computed(() => {
  if (!searchQuery.value.trim()) return projectStore.meshes
  const q = searchQuery.value.toLowerCase()
  return projectStore.meshes.filter(m => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q))
})

const filteredBones = computed(() => {
  if (!searchQuery.value.trim()) return animationStore.armature.bones
  const q = searchQuery.value.toLowerCase()
  return animationStore.armature.bones.filter(b => b.name.toLowerCase().includes(q) || b.id.toLowerCase().includes(q))
})

function selectMesh(id: string, e?: MouseEvent) {
  if (e && e.shiftKey) {
    if (projectStore.selectedMeshIds.includes(id)) {
      projectStore.selectedMeshIds = projectStore.selectedMeshIds.filter(mid => mid !== id)
      if (projectStore.activeMeshId === id) {
        projectStore.activeMeshId = projectStore.selectedMeshIds[0] || ''
      }
    } else {
      projectStore.selectedMeshIds.push(id)
      projectStore.activeMeshId = id
    }
  } else {
    projectStore.activeMeshId = id
    projectStore.selectedMeshIds = [id]
  }
}

function toggleVisibility(id: string) {
  const mesh = projectStore.meshes.find(m => m.id === id)
  if (mesh) {
    projectStore.recordState('Toggle Visibility')
    mesh.visible = !mesh.visible
  }
}

function toggleLock(id: string) {
  const mesh = projectStore.meshes.find(m => m.id === id)
  if (mesh) {
    projectStore.recordState('Toggle Lock')
    mesh.locked = !mesh.locked
  }
}

function duplicateMesh(id: string) {
  const mesh = projectStore.meshes.find(m => m.id === id)
  if (!mesh) return
  projectStore.selectedMeshIds = [id]
  projectStore.activeMeshId = id
  projectStore.duplicateSelection('object')
}

function deleteMesh(id: string) {
  projectStore.deleteMesh(id)
}

function startRename(id: string, currentName: string) {
  editingItemId.value = id
  editingName.value = currentName
}

function commitRenameMesh(id: string) {
  if (!editingName.value.trim()) return
  const mesh = projectStore.meshes.find(m => m.id === id)
  if (mesh) {
    projectStore.recordState('Rename Mesh')
    mesh.name = editingName.value.trim()
  }
  editingItemId.value = null
}

function commitRenameBone(id: string) {
  if (!editingName.value.trim()) return
  animationStore.renameBone(id, editingName.value.trim())
  editingItemId.value = null
}

const draggedMeshId = ref<string | null>(null)
const dragOverTargetId = ref<string | null>(null)

function onDragStartMesh(e: DragEvent, meshId: string) {
  draggedMeshId.value = meshId
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', meshId)
  }
}

function onDragOverMesh(e: DragEvent, targetId: string) {
  e.preventDefault()
  if (draggedMeshId.value && draggedMeshId.value !== targetId) {
    dragOverTargetId.value = targetId
  }
}

function onDragLeaveMesh() {
  dragOverTargetId.value = null
}

function onDropOnMesh(e: DragEvent, targetId: string) {
  e.preventDefault()
  if (!draggedMeshId.value || draggedMeshId.value === targetId) {
    draggedMeshId.value = null
    dragOverTargetId.value = null
    return
  }

  projectStore.parentMesh(draggedMeshId.value, targetId)

  draggedMeshId.value = null
  dragOverTargetId.value = null
}

function unparentMesh(meshId: string) {
  projectStore.unparentMesh(meshId)
}

function getParentMeshName(parentId?: string): string {
  if (!parentId) return ''
  const m = projectStore.meshes.find(x => x.id === parentId)
  if (m) return m.name
  const b = animationStore.armature.bones.find(x => x.id === parentId)
  if (b) return b.name
  return parentId
}

function meshParentLabel(mesh: MeshObject): string {
  const boneId = resolveMeshBoneParentId(mesh, animationStore.armature.bones)
  if (boneId) {
    const b = animationStore.armature.bones.find(x => x.id === boneId)
    return b ? b.name : boneId
  }
  if (mesh.parentId) return getParentMeshName(mesh.parentId)
  return ''
}

function handleAddBone() {
  if (animationStore.selectedBoneId) {
    animationStore.addChildBone(animationStore.selectedBoneId, `Bone_${animationStore.armature.bones.length + 1}`)
  } else {
    animationStore.addRootBone(`Bone_Root_${animationStore.armature.bones.length + 1}`)
  }
  toolStore.appMode = 'animate'
}
</script>

<template>
  <div class="h-full w-full bg-ui-panel flex flex-col select-none text-xs font-mono">
    <div class="h-7 px-1.5 bg-ui-header border-b border-ui-borderSubtle flex items-center justify-between gap-1">
      <div class="flex items-center">
        <button 
          @click="activeTab = 'meshes'"
          class="flex items-center gap-1 px-1.5 h-5 rounded-xs font-semibold text-[10px] transition"
          :class="activeTab === 'meshes' ? 'bg-ui-panel text-ui-textPrimary' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Scene objects"
        >
          <BlenderIcon name="mesh-cube" :size="11" />
          <span>Obj {{ projectStore.meshes.length }}</span>
        </button>
        <button 
          @click="activeTab = 'armature'"
          class="flex items-center gap-1 px-1.5 h-5 rounded-xs font-semibold text-[10px] transition"
          :class="activeTab === 'armature' ? 'bg-ui-panel text-ui-textPrimary' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Armature bones"
        >
          <BlenderIcon name="bone" :size="11" />
          <span>Bone {{ animationStore.armature.bones.length }}</span>
        </button>
      </div>

      <!-- Add Actions -->
      <div class="flex items-center gap-1">
        <button 
          v-if="activeTab === 'meshes'"
          @click="handleAddMeshClick($event)" 
          class="flex items-center gap-1 px-2.5 h-6 rounded-xs bg-ui-accent hover:bg-ui-accentHover text-white text-[11px] font-bold shadow-xs transition cursor-pointer"
          title="Add 3D Primitive (Opens Primitives Panel / Shift+A)"
        >
          <Plus class="w-3.5 h-3.5" />
          <span>Add</span>
        </button>

        <button 
          v-else
          @click="handleAddBone" 
          class="flex items-center gap-1 px-2.5 h-6 rounded-xs bg-ui-accent hover:bg-ui-accentHover text-white text-[11px] font-bold shadow-xs transition cursor-pointer"
          title="Add Bone"
        >
          <Plus class="w-3.5 h-3.5" />
          <span>{{ animationStore.selectedBoneId ? 'Child' : 'Root' }}</span>
        </button>
      </div>
    </div>

    <div class="h-6 px-2 bg-ui-input border-b border-ui-borderSubtle flex items-center gap-1.5">
      <Search class="w-3 h-3 text-ui-textMuted shrink-0" />
      <input 
        v-model="searchQuery"
        type="text" 
        :placeholder="activeTab === 'meshes' ? 'Filter…' : 'Filter bones…'"
        class="bg-transparent text-ui-textPrimary placeholder-ui-textMuted text-[10px] w-full focus:outline-none"
      />
    </div>

    <!-- FULL HEIGHT SCROLLABLE TREE LIST -->
    <div class="flex-1 overflow-y-auto p-2 space-y-1 min-h-0">
      <!-- 1. MESHES LIST -->
      <template v-if="activeTab === 'meshes'">
        <div v-if="filteredMeshes.length === 0" class="py-12 text-center text-slate-500 font-mono text-[11px]">
          No matching objects
        </div>

        <div 
          v-for="mesh in filteredMeshes" 
          :key="mesh.id"
          draggable="true"
          @dragstart="onDragStartMesh($event, mesh.id)"
          @dragover="onDragOverMesh($event, mesh.id)"
          @dragleave="onDragLeaveMesh"
          @drop="onDropOnMesh($event, mesh.id)"
          @click="selectMesh(mesh.id, $event)"
          class="flex items-center justify-between px-2.5 py-1.5 rounded-xs cursor-pointer transition border text-xs"
          :class="[
            projectStore.selectedMeshIds.includes(mesh.id) ? 'bg-ui-active border-ui-accent/40 text-ui-textAccent' : 'bg-ui-surface/60 border-ui-borderSubtle text-ui-textSecondary hover:bg-ui-hover hover:text-ui-textAccent',
            dragOverTargetId === mesh.id ? 'ring-2 ring-ui-accent bg-ui-accent/20' : '',
            mesh.parentId ? 'ml-3' : ''
          ]"
        >
          <div class="flex items-center space-x-2 flex-1 min-w-0 mr-1.5">
            <BlenderIcon name="mesh-cube" :size="14" :color="projectStore.selectedMeshIds.includes(mesh.id) ? 'currentColor' : '#8d939d'" />
            
            <input 
              v-if="editingItemId === mesh.id"
              v-model="editingName"
              @blur="commitRenameMesh(mesh.id)"
              @keydown.enter="commitRenameMesh(mesh.id)"
              class="bg-ui-input text-ui-textPrimary px-1.5 py-0.5 rounded-xs font-mono text-xs w-full focus:outline-none border border-ui-accent"
              autoFocus
            />
            <div v-else class="flex flex-col min-w-0" @dblclick="startRename(mesh.id, mesh.name)">
              <div class="flex items-center gap-1.5 truncate">
                <span class="font-mono font-bold text-[11px] truncate select-none">
                  {{ mesh.name }}
                </span>
                <span v-if="meshParentLabel(mesh)" class="text-[9px] text-amber-400/80 font-mono flex items-center gap-0.5">
                  <span>↳</span>
                  <span class="truncate">{{ meshParentLabel(mesh) }}</span>
                  <button
                    v-if="mesh.parentId && !resolveMeshBoneParentId(mesh, animationStore.armature.bones)"
                    @click.stop="unparentMesh(mesh.id)"
                    class="hover:text-rose-400 ml-0.5 font-bold"
                    title="Unparent Object"
                  >×</button>
                </span>
              </div>
              <span 
                class="font-mono text-[9px]"
                :class="projectStore.selectedMeshIds.includes(mesh.id) ? 'opacity-80' : 'text-ui-textMuted'"
              >
                {{ mesh.faces.length }} faces · {{ mesh.vertices.length }} verts
              </span>
            </div>
          </div>

          <div class="flex items-center space-x-1 shrink-0">
            <button @click.stop="duplicateMesh(mesh.id)" class="p-1 hover:bg-ui-hover rounded-xs text-ui-textMuted hover:text-ui-textAccent transition" title="Duplicate Object">
              <BlenderIcon name="duplicate" :size="13" />
            </button>
            <button @click.stop="toggleLock(mesh.id)" class="p-1 hover:bg-ui-hover rounded-xs transition" :class="mesh.locked ? 'text-amber-400' : 'text-ui-textMuted hover:text-ui-textPrimary'" title="Lock Object">
              <BlenderIcon v-if="mesh.locked" name="lock" :size="13" color="#f59e0b" />
              <BlenderIcon v-else name="unlock" :size="13" />
            </button>
            <button @click.stop="toggleVisibility(mesh.id)" class="p-1 hover:bg-ui-hover rounded-xs transition" :class="mesh.visible ? 'text-ui-textSecondary' : 'text-ui-textMuted opacity-50'" title="Toggle Visibility">
              <BlenderIcon v-if="mesh.visible" name="eye-open" :size="13" />
              <BlenderIcon v-else name="eye-closed" :size="13" />
            </button>
            <button 
              @click.stop="deleteMesh(mesh.id)" 
              class="p-1 hover:bg-rose-500/20 rounded-xs text-ui-textMuted hover:text-rose-400 transition" 
              title="Delete Object"
            >
              <BlenderIcon name="trash" :size="13" />
            </button>
          </div>
        </div>
      </template>

      <!-- 2. BONES LIST -->
      <template v-else>
        <div v-if="filteredBones.length === 0" class="py-12 text-center text-ui-textMuted font-mono text-[11px] flex flex-col items-center gap-2">
          <span>No bones in armature</span>
          <button @click="handleAddBone" class="px-3 py-1 rounded-xs bg-ui-accent text-white hover:bg-ui-accentHover font-bold shadow transition">
            + Add First Root Bone
          </button>
        </div>

        <div 
          v-for="bone in filteredBones" 
          :key="bone.id"
          @click="animationStore.selectBone(bone.id); toolStore.appMode = 'animate'"
          class="flex items-center justify-between px-2.5 py-2 rounded-xs cursor-pointer transition border"
          :style="{ paddingLeft: bone.parentId ? '1.5rem' : '0.625rem' }"
          :class="bone.id === animationStore.selectedBoneId ? 'bg-ui-active border-ui-accent/50 text-ui-textAccent shadow-xs' : 'bg-ui-surface/60 border-ui-borderSubtle text-ui-textSecondary hover:bg-ui-hover hover:text-ui-textAccent'"
        >
          <div class="flex items-center space-x-2 flex-1 min-w-0 mr-1.5">
            <BlenderIcon name="bone" :size="15" :color="bone.id === animationStore.selectedBoneId ? 'currentColor' : '#06b6d4'" />
            
            <input 
              v-if="editingItemId === bone.id"
              v-model="editingName"
              @blur="commitRenameBone(bone.id)"
              @keydown.enter="commitRenameBone(bone.id)"
              class="bg-ui-input text-ui-textPrimary px-1.5 py-0.5 rounded-xs font-mono text-xs w-full focus:outline-none border border-ui-accent"
              autoFocus
            />
            <div v-else class="flex flex-col min-w-0" @dblclick="startRename(bone.id, bone.name)">
              <span class="font-mono font-bold text-[11px] truncate select-none">
                {{ bone.name }}
              </span>
              <span 
                class="font-mono text-[9px]"
                :class="bone.id === animationStore.selectedBoneId ? 'opacity-80' : 'text-ui-textMuted'"
              >
                Head: ({{ bone.head.x.toFixed(1) }}, {{ bone.head.y.toFixed(1) }}, {{ bone.head.z.toFixed(1) }})
              </span>
            </div>
          </div>

          <div class="flex items-center space-x-1 shrink-0">
            <button 
              @click.stop="animationStore.addChildBone(bone.id, `${bone.name}_Child`); toolStore.appMode = 'animate'" 
              class="p-1 hover:bg-ui-hover rounded-xs text-ui-textMuted hover:text-ui-textAccent transition" 
              title="Add Child Bone"
            >
              <GitBranch class="w-3.5 h-3.5" />
            </button>
            <button 
              @click.stop="animationStore.deleteBone(bone.id)" 
              class="p-1 hover:bg-rose-500/20 rounded-xs text-ui-textMuted hover:text-rose-400 transition" 
              title="Delete Bone"
            >
              <BlenderIcon name="trash" :size="13" />
            </button>
          </div>
        </div>
      </template>
    </div>

    <!-- Outliner Footer Stats -->
    <div class="p-2 bg-ui-header border-t border-ui-borderSubtle text-[10px] font-mono text-ui-textMuted flex items-center justify-between">
      <span>Total Meshes: <strong class="text-ui-textPrimary">{{ projectStore.meshes.length }}</strong></span>
      <span>Bones: <strong class="text-ui-textPrimary">{{ animationStore.armature.bones.length }}</strong></span>
    </div>
  </div>
</template>
