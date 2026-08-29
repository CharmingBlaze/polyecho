<script setup lang="ts">
import { ref, computed } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { useAnimationStore } from '../../stores/animationStore'
import { useToolStore } from '../../stores/toolStore'
import BlenderIcon from '../icons/BlenderIcon.vue'
import { GitBranch, Search, Filter } from 'lucide-vue-next'

const projectStore = useProjectStore()
const animationStore = useAnimationStore()
const toolStore = useToolStore()

const activeTab = ref<'meshes' | 'armature'>('meshes')
const searchQuery = ref<string>('')
const editingItemId = ref<string | null>(null)
const editingName = ref<string>('')
const showAddMeshMenu = ref<boolean>(false)

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

function selectMesh(id: string) {
  projectStore.activeMeshId = id
  projectStore.selectedMeshIds = [id]
  toolStore.appMode = 'model'
}

function toggleVisibility(id: string) {
  const mesh = projectStore.meshes.find(m => m.id === id)
  if (mesh) {
    mesh.visible = !mesh.visible
  }
}

function toggleLock(id: string) {
  const mesh = projectStore.meshes.find(m => m.id === id)
  if (mesh) {
    mesh.locked = !mesh.locked
  }
}

function duplicateMesh(id: string) {
  const mesh = projectStore.meshes.find(m => m.id === id)
  if (!mesh) return
  projectStore.recordState('Duplicate Mesh')
  const cloned = JSON.parse(JSON.stringify(mesh))
  cloned.id = `mesh_${Math.random().toString(36).substring(2, 8)}`
  cloned.name = `${mesh.name}_Copy`
  cloned.position.x += 0.5
  projectStore.meshes.push(cloned)
  projectStore.activeMeshId = cloned.id
}

function deleteMesh(id: string) {
  if (projectStore.meshes.length <= 1) return
  projectStore.recordState('Delete Mesh')
  projectStore.meshes = projectStore.meshes.filter(m => m.id !== id)
  if (projectStore.activeMeshId === id) {
    projectStore.activeMeshId = projectStore.meshes[0].id
  }
}

function startRename(id: string, currentName: string) {
  editingItemId.value = id
  editingName.value = currentName
}

function commitRenameMesh(id: string) {
  if (!editingName.value.trim()) return
  const mesh = projectStore.meshes.find(m => m.id === id)
  if (mesh) {
    mesh.name = editingName.value.trim()
  }
  editingItemId.value = null
}

function commitRenameBone(id: string) {
  if (!editingName.value.trim()) return
  animationStore.renameBone(id, editingName.value.trim())
  editingItemId.value = null
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
  <div class="h-full w-full bg-dcc-900 flex flex-col select-none text-xs">
    <!-- Header with Tab Switcher & Quick Add -->
    <div class="p-2.5 bg-dcc-850 border-b border-dcc-750 flex items-center justify-between">
      <div class="flex items-center space-x-1">
        <button 
          @click="activeTab = 'meshes'"
          class="flex items-center gap-1.5 px-2.5 py-1 rounded font-mono font-bold text-[11px] transition"
          :class="activeTab === 'meshes' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200 bg-dcc-900'"
        >
          <BlenderIcon name="mesh-cube" :size="13" />
          <span>Objects ({{ projectStore.meshes.length }})</span>
        </button>
        <button 
          @click="activeTab = 'armature'"
          class="flex items-center gap-1.5 px-2.5 py-1 rounded font-mono font-bold text-[11px] transition"
          :class="activeTab === 'armature' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200 bg-dcc-900'"
        >
          <BlenderIcon name="bone" :size="13" />
          <span>Bones ({{ animationStore.armature.bones.length }})</span>
        </button>
      </div>

      <!-- Add Actions -->
      <div class="relative">
        <button 
          v-if="activeTab === 'meshes'"
          @click="showAddMeshMenu = !showAddMeshMenu" 
          class="flex items-center gap-1 px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-[11px] font-bold shadow transition"
          title="Add 3D Primitive"
        >
          <BlenderIcon name="plus" :size="12" />
          <span>Add</span>
        </button>

        <button 
          v-else
          @click="handleAddBone" 
          class="flex items-center gap-1 px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-[11px] font-bold shadow transition"
          title="Add Bone"
        >
          <BlenderIcon name="plus" :size="12" />
          <span>{{ animationStore.selectedBoneId ? 'Child Bone' : 'Root Bone' }}</span>
        </button>

        <!-- Primitive Dropdown with Blender Icons -->
        <div 
          v-if="showAddMeshMenu" 
          @mouseleave="showAddMeshMenu = false"
          class="absolute right-0 top-7 z-50 bg-dcc-800 border border-dcc-700 shadow-2xl rounded-md py-1.5 w-36 text-slate-200 text-[11px] font-mono flex flex-col divide-y divide-dcc-750"
        >
          <button @click="projectStore.addPrimitive('cube'); showAddMeshMenu = false" class="px-3 py-1.5 text-left hover:bg-dcc-700 flex items-center gap-2">
            <BlenderIcon name="mesh-cube" :size="14" color="#f59e0b" /> Cube
          </button>
          <button @click="projectStore.addPrimitive('plane'); showAddMeshMenu = false" class="px-3 py-1.5 text-left hover:bg-dcc-700 flex items-center gap-2">
            <BlenderIcon name="mesh-plane" :size="14" color="#38bdf8" /> Plane
          </button>
          <button @click="projectStore.addPrimitive('cylinder'); showAddMeshMenu = false" class="px-3 py-1.5 text-left hover:bg-dcc-700 flex items-center gap-2">
            <BlenderIcon name="mesh-cylinder" :size="14" color="#10b981" /> Cylinder
          </button>
          <button @click="projectStore.addPrimitive('cone'); showAddMeshMenu = false" class="px-3 py-1.5 text-left hover:bg-dcc-700 flex items-center gap-2">
            <BlenderIcon name="mesh-cone" :size="14" color="#f43f5e" /> Cone
          </button>
          <button @click="projectStore.addPrimitive('sphere'); showAddMeshMenu = false" class="px-3 py-1.5 text-left hover:bg-dcc-700 flex items-center gap-2">
            <BlenderIcon name="mesh-sphere" :size="14" color="#a855f7" /> Sphere
          </button>
        </div>
      </div>
    </div>

    <!-- Search Filter Bar -->
    <div class="px-2.5 py-1.5 bg-dcc-850/60 border-b border-dcc-750 flex items-center gap-2">
      <Search class="w-3.5 h-3.5 text-slate-500 shrink-0" />
      <input 
        v-model="searchQuery"
        type="text" 
        :placeholder="activeTab === 'meshes' ? 'Filter objects...' : 'Filter bones...'"
        class="bg-transparent text-slate-200 placeholder-slate-500 font-mono text-[11px] w-full focus:outline-none"
      />
      <Filter class="w-3 h-3 text-slate-600 shrink-0" />
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
          @click="selectMesh(mesh.id)"
          class="flex items-center justify-between px-2.5 py-2 rounded cursor-pointer transition border"
          :class="mesh.id === projectStore.activeMeshId ? 'bg-indigo-600/25 border-indigo-500/50 text-indigo-100 shadow-sm' : 'bg-dcc-850/70 border-dcc-750 text-slate-300 hover:bg-dcc-800 hover:text-white'"
        >
          <div class="flex items-center space-x-2 flex-1 min-w-0 mr-1.5">
            <BlenderIcon name="mesh-cube" :size="15" :color="mesh.id === projectStore.activeMeshId ? '#818cf8' : '#94a3b8'" />
            
            <input 
              v-if="editingItemId === mesh.id"
              v-model="editingName"
              @blur="commitRenameMesh(mesh.id)"
              @keydown.enter="commitRenameMesh(mesh.id)"
              class="bg-dcc-800 text-slate-200 px-1.5 py-0.5 rounded font-mono text-xs w-full focus:outline-none border border-indigo-500"
              autoFocus
            />
            <div v-else class="flex flex-col min-w-0" @dblclick="startRename(mesh.id, mesh.name)">
              <span class="font-mono font-bold text-[11px] truncate select-none">
                {{ mesh.name }}
              </span>
              <span class="font-mono text-[9px] text-slate-500">
                {{ mesh.faces.length }} faces · {{ mesh.vertices.length }} verts
              </span>
            </div>
          </div>

          <div class="flex items-center space-x-1 shrink-0">
            <button @click.stop="duplicateMesh(mesh.id)" class="p-1 hover:bg-dcc-700 rounded text-slate-400 hover:text-indigo-300 transition" title="Duplicate Object">
              <BlenderIcon name="duplicate" :size="13" />
            </button>
            <button @click.stop="toggleLock(mesh.id)" class="p-1 hover:bg-dcc-700 rounded transition" :class="mesh.locked ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'" title="Lock Object">
              <BlenderIcon v-if="mesh.locked" name="lock" :size="13" color="#f59e0b" />
              <BlenderIcon v-else name="unlock" :size="13" />
            </button>
            <button @click.stop="toggleVisibility(mesh.id)" class="p-1 hover:bg-dcc-700 rounded transition" :class="mesh.visible ? 'text-slate-300' : 'text-slate-600'" title="Toggle Visibility">
              <BlenderIcon v-if="mesh.visible" name="eye-open" :size="13" />
              <BlenderIcon v-else name="eye-closed" :size="13" />
            </button>
            <button 
              v-if="projectStore.meshes.length > 1"
              @click.stop="deleteMesh(mesh.id)" 
              class="p-1 hover:bg-rose-500/20 rounded text-slate-400 hover:text-rose-400 transition" 
              title="Delete Object"
            >
              <BlenderIcon name="trash" :size="13" />
            </button>
          </div>
        </div>
      </template>

      <!-- 2. BONES LIST -->
      <template v-else>
        <div v-if="filteredBones.length === 0" class="py-12 text-center text-slate-500 font-mono text-[11px] flex flex-col items-center gap-2">
          <span>No bones in armature</span>
          <button @click="handleAddBone" class="px-3 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-500 font-bold shadow transition">
            + Add First Root Bone
          </button>
        </div>

        <div 
          v-for="bone in filteredBones" 
          :key="bone.id"
          @click="animationStore.selectBone(bone.id); toolStore.appMode = 'animate'"
          class="flex items-center justify-between px-2.5 py-2 rounded cursor-pointer transition border"
          :style="{ paddingLeft: bone.parentId ? '1.5rem' : '0.625rem' }"
          :class="bone.id === animationStore.selectedBoneId ? 'bg-amber-500/20 border-amber-500/50 text-amber-100 shadow-sm' : 'bg-dcc-850/70 border-dcc-750 text-slate-300 hover:bg-dcc-800 hover:text-white'"
        >
          <div class="flex items-center space-x-2 flex-1 min-w-0 mr-1.5">
            <BlenderIcon name="bone" :size="15" :color="bone.id === animationStore.selectedBoneId ? '#f59e0b' : '#06b6d4'" />
            
            <input 
              v-if="editingItemId === bone.id"
              v-model="editingName"
              @blur="commitRenameBone(bone.id)"
              @keydown.enter="commitRenameBone(bone.id)"
              class="bg-dcc-800 text-slate-200 px-1.5 py-0.5 rounded font-mono text-xs w-full focus:outline-none border border-amber-500"
              autoFocus
            />
            <div v-else class="flex flex-col min-w-0" @dblclick="startRename(bone.id, bone.name)">
              <span class="font-mono font-bold text-[11px] truncate select-none">
                {{ bone.name }}
              </span>
              <span class="font-mono text-[9px] text-slate-500">
                Head: ({{ bone.head.x.toFixed(1) }}, {{ bone.head.y.toFixed(1) }}, {{ bone.head.z.toFixed(1) }})
              </span>
            </div>
          </div>

          <div class="flex items-center space-x-1 shrink-0">
            <button 
              @click.stop="animationStore.addChildBone(bone.id, `${bone.name}_Child`); toolStore.appMode = 'animate'" 
              class="p-1 hover:bg-dcc-700 rounded text-slate-400 hover:text-indigo-300 transition" 
              title="Add Child Bone"
            >
              <GitBranch class="w-3.5 h-3.5" />
            </button>
            <button 
              @click.stop="animationStore.deleteBone(bone.id)" 
              class="p-1 hover:bg-rose-500/20 rounded text-slate-400 hover:text-rose-400 transition" 
              title="Delete Bone"
            >
              <BlenderIcon name="trash" :size="13" />
            </button>
          </div>
        </div>
      </template>
    </div>

    <!-- Outliner Footer Stats -->
    <div class="p-2 bg-dcc-850 border-t border-dcc-750 text-[10px] font-mono text-slate-400 flex items-center justify-between">
      <span>Total Meshes: <strong class="text-slate-200">{{ projectStore.meshes.length }}</strong></span>
      <span>Bones: <strong class="text-slate-200">{{ animationStore.armature.bones.length }}</strong></span>
    </div>
  </div>
</template>
