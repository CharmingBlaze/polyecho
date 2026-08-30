<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAnimationStore } from '../../stores/animationStore'
import { useProjectStore } from '../../stores/projectStore'
import BlenderIcon from '../icons/BlenderIcon.vue'
import { 
  Plus, 
  Trash2, 
  FolderTree, 
  Wrench
} from 'lucide-vue-next'

const animationStore = useAnimationStore()
const projectStore = useProjectStore()

const editingBoneId = ref<string | null>(null)
const editingName = ref<string>('')

const rootBones = computed(() => {
  return animationStore.armature.bones.filter(b => !b.parentId)
})

function getChildBones(parentId: string) {
  return animationStore.armature.bones.filter(b => b.parentId === parentId)
}

function selectBone(id: string) {
  animationStore.selectBone(id)
}

function startRename(id: string, name: string) {
  editingBoneId.value = id
  editingName.value = name
}

function commitRename(id: string) {
  if (editingName.value.trim()) {
    animationStore.renameBone(id, editingName.value.trim())
  }
  editingBoneId.value = null
}

function handleAddRoot() {
  projectStore.recordState('Add Root Bone')
  animationStore.addRootBone(`Bone_Root_${animationStore.armature.bones.length + 1}`)
}

function handleAddChild(parentId: string) {
  projectStore.recordState('Add Child Bone')
  animationStore.addChildBone(parentId, `Bone_${animationStore.armature.bones.length + 1}`)
}

function handleAddSocket(boneId: string) {
  projectStore.recordState('Add Bone Socket')
  animationStore.addSocket(boneId, `Socket_${Date.now().toString(36).slice(-3)}`)
}

function handleDeleteBone(id: string) {
  projectStore.recordState('Delete Bone')
  animationStore.deleteBone(id)
}

function handleSymmetrize() {
  projectStore.recordState('Symmetrize Skeleton')
  animationStore.symmetrizeArmature()
}
</script>

<template>
  <div class="h-full w-full bg-ui-panel p-3 text-ui-textPrimary flex flex-col space-y-3 font-mono text-xs select-none overflow-y-auto">
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-ui-borderSubtle pb-2">
      <div class="flex items-center gap-1.5">
        <FolderTree class="w-3.5 h-3.5 text-ui-accent" />
        <span class="text-[11px] font-bold uppercase tracking-wider text-ui-textAccent">Skeleton Hierarchy</span>
      </div>
      <div class="flex items-center gap-1">
        <button 
          @click="handleAddRoot"
          class="px-2 py-0.5 bg-ui-accent hover:bg-ui-accentHover text-white rounded-xs font-bold text-[10px] flex items-center gap-1 shadow-xs transition"
          title="Add Root Bone"
        >
          <Plus class="w-3 h-3" />
          <span>Bone</span>
        </button>
        <button 
          v-if="animationStore.selectedBoneId"
          @click="handleAddSocket(animationStore.selectedBoneId)"
          class="px-2 py-0.5 bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle text-ui-textPrimary rounded-xs text-[10px] font-bold flex items-center gap-1 transition"
          title="Add Socket to selected bone"
        >
          <Wrench class="w-3 h-3 text-sky-400" />
          <span>Socket</span>
        </button>
        <button 
          @click="handleSymmetrize"
          class="px-1.5 py-0.5 bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle text-ui-textMuted hover:text-ui-textPrimary rounded-xs text-[10px]"
          title="Symmetrize .L bones to .R"
        >
          Mirror .L/.R
        </button>
      </div>
    </div>

    <!-- Tree View -->
    <div class="flex-1 bg-ui-input rounded-xs border border-ui-borderSubtle p-1.5 space-y-0.5 overflow-y-auto min-h-[140px]">
      <template v-for="root in rootBones" :key="root.id">
        <!-- Root Item -->
        <div 
          @click="selectBone(root.id)"
          class="flex items-center justify-between px-2 py-1 rounded-xs cursor-pointer text-[11px] transition"
          :class="animationStore.selectedBoneId === root.id ? 'bg-ui-active text-ui-textAccent font-bold border border-ui-accent/40' : 'hover:bg-ui-hover text-ui-textSecondary'"
        >
          <div class="flex items-center gap-1.5 truncate flex-1 min-w-0">
            <BlenderIcon name="bone" :size="12" :color="animationStore.selectedBoneId === root.id ? '#f59e0b' : '#94a3b8'" />
            <input 
              v-if="editingBoneId === root.id"
              v-model="editingName"
              @blur="commitRename(root.id)"
              @keydown.enter="commitRename(root.id)"
              class="bg-ui-input text-ui-textPrimary px-1 py-0.5 rounded-xs text-[10px] w-full border border-ui-accent focus:outline-none"
              autoFocus
            />
            <span v-else class="truncate select-none" @dblclick="startRename(root.id, root.name)">
              {{ root.name }}
            </span>
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-1">
            <button @click.stop="handleAddChild(root.id)" class="p-0.5 text-ui-textMuted hover:text-ui-textPrimary" title="Add Child Bone">
              <Plus class="w-3 h-3" />
            </button>
            <button @click.stop="handleDeleteBone(root.id)" class="p-0.5 text-ui-textMuted hover:text-rose-400" title="Delete Bone">
              <Trash2 class="w-3 h-3" />
            </button>
          </div>
        </div>

        <!-- Sockets on Root -->
        <div v-for="s in root.sockets || []" :key="s.id" class="flex items-center gap-1.5 pl-6 py-0.5 text-[10px] text-sky-400">
          <Wrench class="w-2.5 h-2.5" />
          <span>[S] {{ s.name }}</span>
        </div>

        <!-- Recursive Children -->
        <template v-for="child in getChildBones(root.id)" :key="child.id">
          <div 
            @click="selectBone(child.id)"
            class="flex items-center justify-between pl-5 pr-2 py-1 rounded-xs cursor-pointer text-[11px] transition"
            :class="animationStore.selectedBoneId === child.id ? 'bg-ui-active text-ui-textAccent font-bold border border-ui-accent/40' : 'hover:bg-ui-hover text-ui-textSecondary'"
          >
            <div class="flex items-center gap-1.5 truncate flex-1 min-w-0">
              <span class="text-ui-borderSubtle">└</span>
              <BlenderIcon name="bone" :size="11" :color="animationStore.selectedBoneId === child.id ? '#f59e0b' : '#94a3b8'" />
              <input 
                v-if="editingBoneId === child.id"
                v-model="editingName"
                @blur="commitRename(child.id)"
                @keydown.enter="commitRename(child.id)"
                class="bg-ui-input text-ui-textPrimary px-1 py-0.5 rounded-xs text-[10px] w-full border border-ui-accent focus:outline-none"
                autoFocus
              />
              <span v-else class="truncate select-none" @dblclick="startRename(child.id, child.name)">
                {{ child.name }}
              </span>
            </div>

            <div class="flex items-center gap-1">
              <button @click.stop="handleAddChild(child.id)" class="p-0.5 text-ui-textMuted hover:text-ui-textPrimary" title="Add Child Bone">
                <Plus class="w-3 h-3" />
              </button>
              <button @click.stop="handleDeleteBone(child.id)" class="p-0.5 text-ui-textMuted hover:text-rose-400" title="Delete Bone">
                <Trash2 class="w-3 h-3" />
              </button>
            </div>
          </div>

          <!-- Sockets on Child -->
          <div v-for="s in child.sockets || []" :key="s.id" class="flex items-center gap-1.5 pl-10 py-0.5 text-[10px] text-sky-400">
            <Wrench class="w-2.5 h-2.5" />
            <span>[S] {{ s.name }}</span>
          </div>
        </template>
      </template>

      <div v-if="animationStore.armature.bones.length === 0" class="py-8 text-center text-ui-textMuted italic text-[11px]">
        No bones created yet. Click "+ Bone" or press B in the viewport.
      </div>
    </div>
  </div>
</template>
