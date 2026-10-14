<script setup lang="ts">
import { ref, computed } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { useAnimationStore } from '../../stores/animationStore'
import { useHistoryStore } from '../../stores/historyStore'
import { useToolStore } from '../../stores/toolStore'
import BlenderIcon from '../icons/BlenderIcon.vue'
import { resolveMeshBoneParentId } from '../../core/animation/Armature'
import { requestPrimitiveMenu } from '../../core/commands/editorCommands'
import { canHideSelected, canIsolateSelected, canShowHidden, hideSelected, isolateSelected, showHidden } from '../../core/geometry/ObjectVisibility'
import {
  collectionAllLocked,
  collectionAllVisible,
  groupByCollection,
  nextCollectionName,
  normalizeCollectionName,
  renameCollection,
  setCollectionLocked,
  setCollectionVisible,
  setMeshesCollection,
} from '../../core/geometry/ObjectCollections'
import type { MeshObject } from '../../types/mesh'

const projectStore = useProjectStore()
const animationStore = useAnimationStore()
const historyStore = useHistoryStore()
const toolStore = useToolStore()

const activeTab = ref<'meshes' | 'armature' | 'history'>('meshes')

const historyQuery = computed(() => searchQuery.value.trim().toLowerCase())
const undoEntries = computed(() => {
  const rows = historyStore.undoStack.map((record, index) => ({
    key: `undo-${index}-${record.timestamp}`,
    description: record.description,
    steps: historyStore.undoStack.length - index,
  }))
  if (!historyQuery.value) return rows
  return rows.filter(row => row.description.toLowerCase().includes(historyQuery.value))
})
const redoEntries = computed(() => {
  const stack = historyStore.redoStack
  const rows = stack.map((record, index) => ({
    key: `redo-${index}-${record.timestamp}`,
    description: record.description,
    steps: stack.length - index,
  })).reverse()
  if (!historyQuery.value) return rows
  return rows.filter(row => row.description.toLowerCase().includes(historyQuery.value))
})
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
  return projectStore.meshes.filter(m =>
    m.name.toLowerCase().includes(q)
    || m.id.toLowerCase().includes(q)
    || (m.collection || '').toLowerCase().includes(q)
  )
})

const meshGroups = computed(() => groupByCollection(filteredMeshes.value))
const dragOverCollection = ref<string | null>(null)
const editingCollection = ref<string | null>(null)
const editingCollectionName = ref('')

const filteredBones = computed(() => {
  if (!searchQuery.value.trim()) return animationStore.armature.bones
  const q = searchQuery.value.toLowerCase()
  return animationStore.armature.bones.filter(b => b.name.toLowerCase().includes(q) || b.id.toLowerCase().includes(q))
})

function clickOffOutliner() {
  if (activeTab.value === 'history') return
  if (activeTab.value === 'meshes') projectStore.deselectAll()
  else animationStore.selectBone(null)
}

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

function hideSelectedMeshes() {
  if (!canHideSelected(projectStore.meshes, projectStore.selectedMeshIds)) return
  projectStore.recordState('Hide Selected')
  hideSelected(projectStore.meshes, projectStore.selectedMeshIds)
}

function isolateSelectedMeshes() {
  if (!canIsolateSelected(projectStore.meshes, projectStore.selectedMeshIds)) return
  projectStore.recordState('Isolate Selected')
  isolateSelected(projectStore.meshes, projectStore.selectedMeshIds)
}

function showHiddenMeshes() {
  if (!canShowHidden(projectStore.meshes)) return
  projectStore.recordState('Show Hidden')
  showHidden(projectStore.meshes)
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

function onDragOverCollection(e: DragEvent, name: string) {
  e.preventDefault()
  if (draggedMeshId.value) dragOverCollection.value = name
}

function onDropOnCollection(e: DragEvent, name: string) {
  e.preventDefault()
  const id = draggedMeshId.value
  draggedMeshId.value = null
  dragOverCollection.value = null
  dragOverTargetId.value = null
  if (!id) return
  if (normalizeCollectionName(projectStore.meshes.find(m => m.id === id)?.collection) === name) return
  projectStore.recordState('Move to Collection')
  setMeshesCollection(projectStore.meshes, [id], name)
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
  dragOverCollection.value = null
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

function assignSelectedToNewCollection() {
  const ids = projectStore.selectedMeshIds
  if (!ids.length) return
  const name = nextCollectionName(projectStore.meshes)
  projectStore.recordState('New Collection')
  setMeshesCollection(projectStore.meshes, ids, name)
}

function selectCollection(name: string, e?: MouseEvent) {
  const ids = projectStore.meshes
    .filter(mesh => normalizeCollectionName(mesh.collection) === name)
    .map(mesh => mesh.id)
  if (!ids.length) return
  if (e?.shiftKey) {
    const have = new Set(projectStore.selectedMeshIds)
    for (const id of ids) have.add(id)
    projectStore.selectedMeshIds = [...have]
    projectStore.activeMeshId = ids[0] || projectStore.activeMeshId
    return
  }
  projectStore.selectedMeshIds = ids
  projectStore.activeMeshId = ids[0] || ''
}

function toggleCollectionVisibility(name: string) {
  const show = !collectionAllVisible(projectStore.meshes, name)
  projectStore.recordState(show ? 'Show Collection' : 'Hide Collection')
  setCollectionVisible(projectStore.meshes, name, show)
}

function toggleCollectionLock(name: string) {
  const lock = !collectionAllLocked(projectStore.meshes, name)
  projectStore.recordState(lock ? 'Lock Collection' : 'Unlock Collection')
  setCollectionLocked(projectStore.meshes, name, lock)
}

function startRenameCollection(name: string) {
  editingCollection.value = name
  editingCollectionName.value = name
}

function commitRenameCollection(from: string) {
  const next = normalizeCollectionName(editingCollectionName.value)
  editingCollection.value = null
  if (!next || next === from) return
  projectStore.recordState('Rename Collection')
  renameCollection(projectStore.meshes, from, next)
}

function removeFromCollection(name: string) {
  const ids = projectStore.meshes
    .filter(mesh => normalizeCollectionName(mesh.collection) === name)
    .map(mesh => mesh.id)
  if (!ids.length) return
  projectStore.recordState('Ungroup Collection')
  setMeshesCollection(projectStore.meshes, ids, undefined)
}

function handleAddBone() {
  if (animationStore.selectedBoneId) {
    animationStore.addChildBone(animationStore.selectedBoneId, `Bone_${animationStore.armature.bones.length + 1}`)
  } else {
    animationStore.addRootBone(`Bone_Root_${animationStore.armature.bones.length + 1}`)
  }
  toolStore.setAppMode('animate')
}
</script>

<template>
  <div class="h-full w-full bg-ui-panel flex flex-col select-none text-xs font-mono">
    <div class="h-7 px-1.5 bg-ui-header border-b border-ui-borderSubtle flex items-center justify-between gap-1">
      <div class="flex items-center">
        <button 
          class="flex items-center gap-1 px-1.5 h-5 rounded-xs font-semibold text-[10px] transition"
          :class="activeTab === 'meshes' ? 'bg-ui-panel text-ui-textPrimary' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Scene objects"
          @click="activeTab = 'meshes'"
        >
          <BlenderIcon name="mesh-cube" :size="11" />
          <span>Obj {{ projectStore.meshes.length }}</span>
        </button>
        <button 
          class="flex items-center gap-1 px-1.5 h-5 rounded-xs font-semibold text-[10px] transition"
          :class="activeTab === 'armature' ? 'bg-ui-panel text-ui-textPrimary' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Armature bones"
          @click="activeTab = 'armature'"
        >
          <BlenderIcon name="bone" :size="11" />
          <span>Bone {{ animationStore.armature.bones.length }}</span>
        </button>
        <button
          class="flex items-center gap-1 px-1.5 h-5 rounded-xs font-semibold text-[10px] transition"
          :class="activeTab === 'history' ? 'bg-ui-panel text-ui-textPrimary' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Undo and redo list"
          @click="activeTab = 'history'"
        >
          <BlenderIcon name="undo" :size="11" />
          <span>Hist {{ historyStore.undoStack.length }}</span>
        </button>
      </div>

      <!-- Add Actions -->
      <div class="flex items-center gap-1">
        <button 
          v-if="activeTab === 'meshes'"
          class="flex items-center gap-1 px-2.5 h-6 rounded-xs bg-ui-accent hover:bg-ui-accentHover text-white text-[11px] font-bold shadow-xs transition cursor-pointer" 
          title="Add 3D Primitive (Opens Primitives Panel / Shift+A)"
          @click="handleAddMeshClick($event)"
        >
          <BlenderIcon name="plus" :size="14" />
          <span>Add</span>
        </button>
        <button
          v-if="activeTab === 'meshes'"
          type="button"
          class="p-1 h-6 w-6 rounded-xs text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover"
          title="Hide selected (Ctrl+H)"
          @click="hideSelectedMeshes"
        >
          <BlenderIcon name="eye-closed" :size="13" />
        </button>
        <button
          v-if="activeTab === 'meshes'"
          type="button"
          class="p-1 h-6 w-6 rounded-xs text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover"
          title="Isolate selected — hide everything else. Click again to show all."
          @click="isolateSelectedMeshes"
        >
          <BlenderIcon name="eye-open" :size="13" />
        </button>
        <button
          v-if="activeTab === 'meshes'"
          type="button"
          class="px-1.5 h-6 rounded-xs text-[10px] font-semibold text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover"
          title="Show hidden (Ctrl+Alt+H)"
          @click="showHiddenMeshes"
        >
          All
        </button>
        <button
          v-if="activeTab === 'meshes'"
          type="button"
          class="px-1.5 h-6 rounded-xs text-[10px] font-semibold text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover"
          title="Put the selected objects in a new collection"
          @click="assignSelectedToNewCollection"
        >
          Col
        </button>

        <button 
          v-else-if="activeTab === 'armature'"
          class="flex items-center gap-1 px-2.5 h-6 rounded-xs bg-ui-accent hover:bg-ui-accentHover text-white text-[11px] font-bold shadow-xs transition cursor-pointer" 
          title="Add Bone"
          @click="handleAddBone"
        >
          <BlenderIcon name="plus" :size="14" />
          <span>{{ animationStore.selectedBoneId ? 'Child' : 'Root' }}</span>
        </button>
      </div>
    </div>

    <div class="h-6 px-2 bg-ui-input border-b border-ui-borderSubtle flex items-center gap-1.5">
      <BlenderIcon name="search" :size="12" />
      <input 
        v-model="searchQuery"
        type="text" 
        :placeholder="activeTab === 'meshes' ? 'Filter…' : activeTab === 'armature' ? 'Filter bones…' : 'Filter history…'"
        class="bg-transparent text-ui-textPrimary placeholder-ui-textMuted text-[10px] w-full focus:outline-none"
      >
    </div>

    <!-- FULL HEIGHT SCROLLABLE TREE LIST -->
    <div class="flex-1 overflow-y-auto p-2 space-y-1 min-h-0" @click="clickOffOutliner">
      <!-- 1. MESHES LIST -->
      <template v-if="activeTab === 'meshes'">
        <div v-if="filteredMeshes.length === 0" class="py-12 text-center text-slate-500 font-mono text-[11px]">
          No matching objects
        </div>

        <template v-for="group in meshGroups" :key="group.name ?? '__scene'">
          <div
            v-if="group.name"
            class="flex items-center justify-between px-2 py-1 rounded-xs border text-[10px] font-bold"
            :class="dragOverCollection === group.name ? 'border-ui-accent bg-ui-accent/15 text-ui-textAccent' : 'border-ui-borderSubtle bg-ui-header/80 text-ui-textSecondary'"
            @click.stop="selectCollection(group.name, $event)"
            @dragover="onDragOverCollection($event, group.name)"
            @drop="onDropOnCollection($event, group.name)"
            @dragleave="dragOverCollection = null"
          >
            <div class="flex items-center gap-1 min-w-0">
              <input
                v-if="editingCollection === group.name"
                v-model="editingCollectionName"
                class="bg-ui-input text-ui-textPrimary px-1 py-0.5 rounded-xs font-mono text-[10px] w-28 focus:outline-none border border-ui-accent"
                @click.stop
                @blur="commitRenameCollection(group.name!)"
                @keydown.enter="commitRenameCollection(group.name!)"
              >
              <span v-else class="truncate" @dblclick.stop="startRenameCollection(group.name!)">{{ group.name }}</span>
              <span class="text-ui-textMuted font-normal">{{ group.meshes.length }}</span>
            </div>
            <div class="flex items-center shrink-0">
              <button
                type="button"
                class="p-0.5"
                :class="collectionAllLocked(projectStore.meshes, group.name) ? 'text-amber-400' : 'text-ui-textMuted hover:text-ui-textPrimary'"
                title="Lock collection"
                @click.stop="toggleCollectionLock(group.name!)"
              >
                <BlenderIcon :name="collectionAllLocked(projectStore.meshes, group.name) ? 'lock' : 'unlock'" :size="12" />
              </button>
              <button
                type="button"
                class="p-0.5"
                :class="collectionAllVisible(projectStore.meshes, group.name) ? 'text-ui-textSecondary' : 'text-ui-textMuted opacity-50'"
                title="Toggle collection visibility"
                @click.stop="toggleCollectionVisibility(group.name!)"
              >
                <BlenderIcon :name="collectionAllVisible(projectStore.meshes, group.name) ? 'eye-open' : 'eye-closed'" :size="12" />
              </button>
              <button
                type="button"
                class="p-0.5 text-ui-textMuted hover:text-rose-400 font-bold"
                title="Remove objects from this collection"
                @click.stop="removeFromCollection(group.name!)"
              >
                ×
              </button>
            </div>
          </div>
          <div
            v-else-if="meshGroups.length > 1"
            class="px-2 pt-1 text-[9px] font-bold uppercase tracking-wide text-ui-textMuted"
          >
            Scene
          </div>

          <div 
            v-for="mesh in group.meshes" 
            :key="mesh.id"
            draggable="true"
            class="flex items-center justify-between px-2.5 py-1.5 rounded-xs cursor-pointer transition border text-xs"
            :class="[
              projectStore.selectedMeshIds.includes(mesh.id) ? 'bg-ui-active border-ui-accent/40 text-ui-textAccent' : 'bg-ui-surface/60 border-ui-borderSubtle text-ui-textSecondary hover:bg-ui-hover hover:text-ui-textAccent',
              dragOverTargetId === mesh.id ? 'ring-2 ring-ui-accent bg-ui-accent/20' : '',
              mesh.parentId ? 'ml-3' : ''
            ]"
            @dragstart="onDragStartMesh($event, mesh.id)"
            @dragover="onDragOverMesh($event, mesh.id)"
            @dragleave="onDragLeaveMesh"
            @drop="onDropOnMesh($event, mesh.id)"
            @click.stop="selectMesh(mesh.id, $event)"
          >
            <div class="flex items-center space-x-2 flex-1 min-w-0 mr-1.5">
              <BlenderIcon name="mesh-cube" :size="14" :color="projectStore.selectedMeshIds.includes(mesh.id) ? 'currentColor' : '#8d939d'" />
            
              <input 
                v-if="editingItemId === mesh.id"
                v-model="editingName"
                class="bg-ui-input text-ui-textPrimary px-1.5 py-0.5 rounded-xs font-mono text-xs w-full focus:outline-none border border-ui-accent"
                autoFocus
                @blur="commitRenameMesh(mesh.id)"
                @keydown.enter="commitRenameMesh(mesh.id)"
              >
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
                      class="hover:text-rose-400 ml-0.5 font-bold"
                      title="Unparent Object"
                      @click.stop="unparentMesh(mesh.id)"
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
              <button class="p-1 hover:bg-ui-hover rounded-xs text-ui-textMuted hover:text-ui-textAccent transition" title="Duplicate Object" @click.stop="duplicateMesh(mesh.id)">
                <BlenderIcon name="duplicate" :size="13" />
              </button>
              <button class="p-1 hover:bg-ui-hover rounded-xs transition" :class="mesh.locked ? 'text-amber-400' : 'text-ui-textMuted hover:text-ui-textPrimary'" title="Lock Object" @click.stop="toggleLock(mesh.id)">
                <BlenderIcon v-if="mesh.locked" name="lock" :size="13" color="#f59e0b" />
                <BlenderIcon v-else name="unlock" :size="13" />
              </button>
              <button class="p-1 hover:bg-ui-hover rounded-xs transition" :class="mesh.visible ? 'text-ui-textSecondary' : 'text-ui-textMuted opacity-50'" title="Toggle Visibility" @click.stop="toggleVisibility(mesh.id)">
                <BlenderIcon v-if="mesh.visible" name="eye-open" :size="13" />
                <BlenderIcon v-else name="eye-closed" :size="13" />
              </button>
              <button 
                class="p-1 hover:bg-rose-500/20 rounded-xs text-ui-textMuted hover:text-rose-400 transition" 
                title="Delete Object" 
                @click.stop="deleteMesh(mesh.id)"
              >
                <BlenderIcon name="trash" :size="13" />
              </button>
            </div>
          </div>
        </template>
      </template>

      <!-- 2. HISTORY LIST -->
      <template v-else-if="activeTab === 'history'">
        <div
          v-if="undoEntries.length === 0 && redoEntries.length === 0"
          class="py-12 text-center text-ui-textMuted font-mono text-[11px]"
        >
          No undo steps
        </div>
        <button
          v-for="row in undoEntries"
          :key="row.key"
          type="button"
          class="w-full text-left px-2.5 py-1.5 rounded-xs border border-ui-borderSubtle bg-ui-surface/60 text-ui-textSecondary hover:bg-ui-hover hover:text-ui-textAccent"
          :title="`Undo ${row.steps} step${row.steps === 1 ? '' : 's'}`"
          @click.stop="historyStore.undoSteps(row.steps)"
        >
          <span class="font-mono font-bold text-[11px] truncate block">{{ row.description }}</span>
          <span class="text-[9px] text-ui-textMuted">Undo {{ row.steps }}</span>
        </button>
        <div
          v-if="undoEntries.length || redoEntries.length"
          class="px-2.5 py-1 text-[10px] font-bold text-ui-textAccent"
        >
          Now
        </div>
        <button
          v-for="row in redoEntries"
          :key="row.key"
          type="button"
          class="w-full text-left px-2.5 py-1.5 rounded-xs border border-dashed border-ui-borderSubtle bg-transparent text-ui-textMuted hover:bg-ui-hover hover:text-ui-textAccent"
          :title="`Redo ${row.steps} step${row.steps === 1 ? '' : 's'}`"
          @click.stop="historyStore.redoSteps(row.steps)"
        >
          <span class="font-mono font-bold text-[11px] truncate block">{{ row.description }}</span>
          <span class="text-[9px] text-ui-textMuted">Redo {{ row.steps }}</span>
        </button>
      </template>

      <!-- 3. BONES LIST -->
      <template v-else>
        <div v-if="filteredBones.length === 0" class="py-12 text-center text-ui-textMuted font-mono text-[11px] flex flex-col items-center gap-2">
          <span>No bones in armature</span>
          <button class="px-3 py-1 rounded-xs bg-ui-accent text-white hover:bg-ui-accentHover font-bold shadow transition" @click.stop="handleAddBone">
            + Add First Root Bone
          </button>
        </div>

        <div 
          v-for="bone in filteredBones" 
          :key="bone.id"
          class="flex items-center justify-between px-2.5 py-2 rounded-xs cursor-pointer transition border"
          :style="{ paddingLeft: bone.parentId ? '1.5rem' : '0.625rem' }"
          :class="bone.id === animationStore.selectedBoneId ? 'bg-ui-active border-ui-accent/50 text-ui-textAccent shadow-xs' : 'bg-ui-surface/60 border-ui-borderSubtle text-ui-textSecondary hover:bg-ui-hover hover:text-ui-textAccent'"
          @click.stop="animationStore.selectBone(bone.id); toolStore.setAppMode('animate')"
        >
          <div class="flex items-center space-x-2 flex-1 min-w-0 mr-1.5">
            <BlenderIcon name="bone" :size="15" :color="bone.id === animationStore.selectedBoneId ? 'currentColor' : '#06b6d4'" />
            
            <input 
              v-if="editingItemId === bone.id"
              v-model="editingName"
              class="bg-ui-input text-ui-textPrimary px-1.5 py-0.5 rounded-xs font-mono text-xs w-full focus:outline-none border border-ui-accent"
              autoFocus
              @blur="commitRenameBone(bone.id)"
              @keydown.enter="commitRenameBone(bone.id)"
            >
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
              class="p-1 hover:bg-ui-hover rounded-xs text-ui-textMuted hover:text-ui-textAccent transition" 
              title="Add Child Bone" 
              @click.stop="animationStore.addChildBone(bone.id, `${bone.name}_Child`); toolStore.setAppMode('animate')"
            >
              <BlenderIcon name="link" :size="14" />
            </button>
            <button 
              class="p-1 hover:bg-rose-500/20 rounded-xs text-ui-textMuted hover:text-rose-400 transition" 
              title="Delete Bone" 
              @click.stop="animationStore.deleteBone(bone.id)"
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
