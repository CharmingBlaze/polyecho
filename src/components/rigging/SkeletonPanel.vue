<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAnimationStore } from '../../stores/animationStore'
import { useProjectStore } from '../../stores/projectStore'
import BlenderIcon from '../icons/BlenderIcon.vue'
import { 
  Plus, 
  Trash2, 
  FolderTree, 
  Wrench,
  Crosshair,
  GitBranch,
  FlipHorizontal
} from 'lucide-vue-next'

const animationStore = useAnimationStore()
const projectStore = useProjectStore()

const editingBoneId = ref<string | null>(null)
const editingName = ref<string>('')

const rootBones = computed(() => {
  return animationStore.armature.bones.filter(b => !b.parentId)
})

const selectedBone = computed(() => animationStore.selectedBone)

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
  const mesh = projectStore.activeMesh
  let head = { x: 0, y: 0, z: 0 }
  let tail = { x: 0, y: 1.2, z: 0 }
  if (mesh && mesh.vertices.length > 0) {
    let minX = Infinity, minY = Infinity, minZ = Infinity
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
    for (const v of mesh.vertices) {
      const wx = mesh.position.x + v.position.x
      const wy = mesh.position.y + v.position.y
      const wz = mesh.position.z + v.position.z
      if (wx < minX) minX = wx
      if (wy < minY) minY = wy
      if (wz < minZ) minZ = wz
      if (wx > maxX) maxX = wx
      if (wy > maxY) maxY = wy
      if (wz > maxZ) maxZ = wz
    }
    const cx = (minX + maxX) / 2
    const cz = (minZ + maxZ) / 2
    const h = Math.max(0.4, maxY - minY)
    head = { x: Number(cx.toFixed(3)), y: Number(minY.toFixed(3)), z: Number(cz.toFixed(3)) }
    tail = { x: Number(cx.toFixed(3)), y: Number((minY + h).toFixed(3)), z: Number(cz.toFixed(3)) }
  }
  const bone = animationStore.addBoneFromPoints(head, tail, null, `Bone_Root_${animationStore.armature.bones.length + 1}`)
  animationStore.selectedBoneId = bone.id
}

function handleAddChild(parentId: string) {
  projectStore.recordState('Add Child Bone')
  animationStore.addChildBone(parentId, `Bone_${animationStore.armature.bones.length + 1}`)
}

function handleExtrude() {
  if (!animationStore.selectedBoneId) {
    handleAddRoot()
    return
  }
  projectStore.recordState('Extrude Bone')
  animationStore.extrudeBone(animationStore.selectedBoneId)
}

function handleToggleDrawBone() {
  animationStore.clickToPlaceMode = !animationStore.clickToPlaceMode
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

function handleReparent(boneId: string, parentBoneId: string) {
  const bone = animationStore.armature.bones.find(b => b.id === boneId)
  if (!bone || bone.id === parentBoneId) return

  if (bone.parentId) {
    const oldP = animationStore.armature.bones.find(b => b.id === bone.parentId)
    if (oldP) {
      oldP.childrenIds = oldP.childrenIds.filter(id => id !== bone.id)
    }
  } else {
    animationStore.armature.rootBoneIds = animationStore.armature.rootBoneIds.filter(id => id !== bone.id)
  }

  if (parentBoneId === 'root') {
    bone.parentId = null
    animationStore.armature.rootBoneIds.push(bone.id)
  } else {
    bone.parentId = parentBoneId
    const newP = animationStore.armature.bones.find(b => b.id === parentBoneId)
    if (newP && !newP.childrenIds.includes(bone.id)) {
      newP.childrenIds.push(bone.id)
    }
  }
}
</script>

<template>
  <div class="h-full w-full bg-ui-panel p-3 text-ui-textPrimary flex flex-col space-y-3 font-mono text-xs select-none overflow-y-auto">
    <!-- Top Setup Actions Bar -->
    <div class="space-y-2 border-b border-ui-borderSubtle pb-2.5">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-1.5">
          <FolderTree class="w-3.5 h-3.5 text-ui-accent" />
          <span class="text-[11px] font-bold uppercase tracking-wider text-ui-textAccent">Rig Setup & Skeleton</span>
        </div>
        <span class="text-[10px] text-ui-textMuted font-bold">
          {{ animationStore.armature.bones.length }} Bones
        </span>
      </div>

      <!-- Quick Add Toolbar -->
      <div class="grid grid-cols-2 gap-1.5">
        <button 
          @click="handleAddRoot"
          class="py-1.5 px-2 bg-ui-accent hover:bg-ui-accentHover text-white rounded-xs font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition"
          title="Add Center Root Bone at base of mesh"
        >
          <Plus class="w-3.5 h-3.5" />
          <span>+ Add Bone</span>
        </button>

        <button 
          @click="handleToggleDrawBone"
          class="py-1.5 px-2 rounded-xs font-bold text-xs flex items-center justify-center gap-1.5 transition border"
          :class="animationStore.clickToPlaceMode ? 'bg-amber-500 text-slate-950 border-amber-400 font-extrabold shadow-xs' : 'bg-ui-input border-ui-borderSubtle text-ui-textSecondary hover:bg-ui-hover'"
          title="Click to place bone head and tail directly in 3D viewport (B)"
        >
          <Crosshair class="w-3.5 h-3.5" />
          <span>Draw (B)</span>
        </button>
      </div>

      <!-- Secondary Tools -->
      <div class="grid grid-cols-3 gap-1 text-[10px]">
        <button 
          @click="handleExtrude"
          class="py-1 px-1.5 bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle text-ui-textSecondary hover:text-ui-textPrimary rounded-xs font-bold flex items-center justify-center gap-1 transition"
          title="Extrude new child bone from active joint (E)"
        >
          <GitBranch class="w-3 h-3 text-amber-400" />
          <span>Extrude (E)</span>
        </button>

        <button 
          @click="handleSymmetrize"
          class="py-1 px-1.5 bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle text-ui-textSecondary hover:text-ui-textPrimary rounded-xs font-bold flex items-center justify-center gap-1 transition"
          title="Mirror .L bones across X-axis to .R"
        >
          <FlipHorizontal class="w-3 h-3 text-sky-400" />
          <span>Mirror .L/.R</span>
        </button>

        <button 
          v-if="selectedBone"
          @click="handleAddSocket(selectedBone.id)"
          class="py-1 px-1.5 bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle text-ui-textSecondary hover:text-sky-300 rounded-xs font-bold flex items-center justify-center gap-1 transition"
          title="Add accessory/weapon socket to selected bone"
        >
          <Wrench class="w-3 h-3 text-sky-400" />
          <span>+ Socket</span>
        </button>
      </div>
    </div>

    <!-- Empty State Quick Setup (When 0 bones) -->
    <div v-if="animationStore.armature.bones.length === 0" class="bg-ui-surface p-4 rounded-xs border border-ui-borderSubtle text-center space-y-3 my-auto">
      <div class="w-10 h-10 mx-auto rounded-full bg-ui-input border border-ui-borderSubtle flex items-center justify-center">
        <BlenderIcon name="bone" :size="20" color="#f59e0b" />
      </div>
      <div>
        <h4 class="font-bold text-xs text-ui-textPrimary">No Skeleton Created Yet</h4>
        <p class="text-[10px] text-ui-textMuted mt-1 leading-relaxed">
          Create bones to control your model. Press <strong>B</strong> or click below to start building your custom rig.
        </p>
      </div>
      <div class="space-y-1.5 pt-1">
        <button 
          @click="handleAddRoot"
          class="w-full py-2 px-3 bg-ui-accent hover:bg-ui-accentHover text-white rounded-xs font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition"
        >
          <Plus class="w-3.5 h-3.5" />
          <span>+ Add First Center Bone</span>
        </button>
        <button 
          @click="handleToggleDrawBone"
          class="w-full py-1.5 px-3 bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle text-ui-textSecondary rounded-xs font-bold text-[11px] flex items-center justify-center gap-1.5 transition"
        >
          <Crosshair class="w-3 h-3 text-amber-400" />
          <span>Draw Bone in Viewport (B)</span>
        </button>
      </div>
    </div>

    <!-- Active Hierarchy Tree View -->
    <div v-else class="flex-1 flex flex-col space-y-2 min-h-0">
      <div class="flex items-center justify-between text-[10px] text-ui-textMuted font-bold uppercase">
        <span>Bone Hierarchy Tree</span>
        <span class="text-ui-textSecondary">{{ selectedBone ? selectedBone.name : 'Click to select' }}</span>
      </div>

      <div class="flex-1 bg-ui-input rounded-xs border border-ui-borderSubtle p-1.5 space-y-0.5 overflow-y-auto min-h-[160px]">
        <template v-for="root in rootBones" :key="root.id">
          <!-- Root Bone Row -->
          <div 
            @click="selectBone(root.id)"
            class="flex items-center justify-between px-2 py-1 rounded-xs cursor-pointer text-[11px] transition group"
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

            <!-- Row Actions -->
            <div class="flex items-center gap-1 opacity-80 group-hover:opacity-100">
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

          <!-- Nested Child Bones -->
          <template v-for="child in getChildBones(root.id)" :key="child.id">
            <div 
              @click="selectBone(child.id)"
              class="flex items-center justify-between pl-5 pr-2 py-1 rounded-xs cursor-pointer text-[11px] transition group"
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

              <div class="flex items-center gap-1 opacity-80 group-hover:opacity-100">
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
      </div>

      <!-- Quick Parenting Inspector for Selected Bone -->
      <div v-if="selectedBone" class="bg-ui-surface p-2.5 rounded-xs border border-ui-borderSubtle space-y-1.5">
        <span class="text-[10px] text-ui-textMuted font-bold uppercase">Parenting: {{ selectedBone.name }}</span>
        <div class="flex items-center gap-2">
          <select 
            :value="selectedBone.parentId || 'root'"
            @change="handleReparent(selectedBone.id, ($event.target as HTMLSelectElement).value)"
            class="flex-1 bg-ui-input border border-ui-borderDefault rounded-xs px-2 py-1 text-ui-textPrimary text-xs focus:outline-none focus:border-ui-accent cursor-pointer"
          >
            <option value="root" class="bg-ui-panel text-ui-textMuted">-- None (Root Bone) --</option>
            <option 
              v-for="b in animationStore.armature.bones.filter(b => b.id !== selectedBone?.id)" 
              :key="b.id" 
              :value="b.id"
              class="bg-ui-panel text-ui-textPrimary"
            >
              {{ b.name }}
            </option>
          </select>
        </div>
      </div>
    </div>
  </div>
</template>
