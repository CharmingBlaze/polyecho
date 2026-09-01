<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAnimationStore } from '../../stores/animationStore'
import { useProjectStore } from '../../stores/projectStore'
import { useToolStore } from '../../stores/toolStore'
import UiSection from '../ui/UiSection.vue'
import UiButton from '../ui/UiButton.vue'
import { 
  Plus, 
  Trash2, 
  FolderTree, 
  Wrench,
  Crosshair,
  GitBranch,
  FlipHorizontal,
  GitCommitVertical,
  ExternalLink,
  Link,
  Eye
} from 'lucide-vue-next'

const animationStore = useAnimationStore()
const projectStore = useProjectStore()
const toolStore = useToolStore()

const editingBoneId = ref<string | null>(null)
const editingName = ref<string>('')
const editingSocketId = ref<string | null>(null)
const editingSocketName = ref<string>('')

const rootBones = computed(() => {
  return animationStore.armature.bones.filter(b => !b.parentId)
})

const selectedBone = computed(() => animationStore.selectedBone)
const selectedSocket = computed(() => animationStore.selectedSocket)

function getChildBones(parentId: string) {
  return animationStore.armature.bones.filter(b => b.parentId === parentId)
}

function selectBone(id: string) {
  animationStore.selectedSocketId = null
  animationStore.selectBone(id)
}

function selectSocket(socketId: string) {
  animationStore.selectSocket(socketId)
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

function startSocketRename(id: string, name: string) {
  editingSocketId.value = id
  editingSocketName.value = name
}

function commitSocketRename(boneId: string, socketId: string) {
  if (editingSocketName.value.trim()) {
    const bone = animationStore.armature.bones.find(b => b.id === boneId)
    const sock = bone?.sockets?.find(s => s.id === socketId)
    if (sock) {
      sock.name = editingSocketName.value.trim()
    }
  }
  editingSocketId.value = null
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
  const s = animationStore.addSocket(boneId, `Socket_${Date.now().toString(36).slice(-3)}`)
  if (s) {
    animationStore.selectSocket(s.id)
  }
}

function handleRemoveSocket(boneId: string, socketId: string) {
  projectStore.recordState('Remove Bone Socket')
  animationStore.removeSocket(boneId, socketId)
  if (animationStore.selectedSocketId === socketId) {
    animationStore.selectedSocketId = null
  }
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

function handleAttachActiveMeshToSocket(socketId: string) {
  if (!projectStore.activeMesh) return
  projectStore.recordState('Attach Mesh to Socket')
  projectStore.activeMesh.parentId = socketId
}
</script>

<template>
  <div class="flex flex-col select-none text-xs font-sans">
    <div class="h-7 bg-ui-header border-b border-ui-borderSubtle px-2.5 flex items-center justify-between">
      <div class="flex items-center space-x-1.5">
        <FolderTree class="w-3 h-3 text-sky-400" />
        <span class="text-[11px] font-medium text-ui-textMuted">Skeleton</span>
      </div>
      <div class="flex items-center gap-1.5">
        <span class="font-mono text-[9px] text-ui-textMuted">{{ animationStore.armature.bones.length }}</span>
        <button
          type="button"
          class="p-0.5 text-ui-textMuted hover:text-ui-textPrimary rounded-xs hover:bg-ui-hover"
          title="Pop-out hierarchy (H)"
          @click="animationStore.toggleBoneHierarchyPopout(true)"
        >
          <ExternalLink class="w-3 h-3" />
        </button>
      </div>
    </div>

    <UiSection title="Add" :icon="Plus" hint="E · B" :default-open="true">
      <div class="grid grid-cols-2 gap-1">
        <UiButton size="xs" variant="primary" @click="handleAddRoot">
          <Plus class="w-3 h-3" /> Add
        </UiButton>
        <UiButton size="xs" :variant="animationStore.clickToPlaceMode ? 'accent' : 'default'" @click="handleToggleDrawBone">
          <Crosshair class="w-3 h-3" /> Draw
        </UiButton>
        <UiButton size="xs" @click="handleExtrude">
          <GitBranch class="w-3 h-3" /> Extrude
        </UiButton>
        <UiButton size="xs" @click="handleSymmetrize">
          <FlipHorizontal class="w-3 h-3" /> Mirror X
        </UiButton>
      </div>
      <p class="text-[9px] text-ui-textMuted leading-snug">Draw places in the viewport. First bone can auto-weight; later clicks only add joints.</p>
    </UiSection>

    <UiSection title="Display" :icon="Eye" :default-open="true">
      <label class="flex items-center justify-between text-[10px] cursor-pointer bg-ui-surface px-2 py-1 rounded-xs border border-ui-borderSubtle">
        <span>X-Ray mesh (Alt+Z)</span>
        <input type="checkbox" v-model="toolStore.viewport.xray" class="accent-amber-500" />
      </label>
      <label class="flex items-center justify-between text-[10px] cursor-pointer bg-ui-surface px-2 py-1 rounded-xs border border-ui-borderSubtle">
        <span>X-ray bones</span>
        <input type="checkbox" v-model="animationStore.xrayBones" class="accent-ui-accent" />
      </label>
    </UiSection>

    <UiSection
      v-if="animationStore.armature.bones.length === 0"
      title="Hierarchy"
      :icon="GitCommitVertical"
      :default-open="true"
    >
      <p class="text-[10px] text-ui-textMuted leading-snug">No bones yet. Add one at the mesh, or Draw in the viewport.</p>
    </UiSection>

    <UiSection
      v-else
      title="Hierarchy"
      :icon="GitCommitVertical"
      :badge="selectedSocket ? selectedSocket.socket.name : (selectedBone?.name || '')"
      :default-open="true"
    >
      <div class="bg-ui-input/50 rounded-xs border border-ui-borderSubtle p-1 space-y-0.5 overflow-y-auto max-h-[280px]">
        <template v-for="root in rootBones" :key="root.id">
          <!-- Root Bone Row -->
          <div 
            @click="selectBone(root.id)"
            class="flex items-center justify-between px-2 py-1 rounded-xs cursor-pointer text-[11px] transition group"
            :class="animationStore.selectedBoneId === root.id && !animationStore.selectedSocketId ? 'bg-ui-active text-ui-textAccent font-semibold border border-ui-accent/40 shadow-xs' : 'hover:bg-ui-hover text-ui-textSecondary'"
          >
            <div class="flex items-center gap-1.5 truncate flex-1 min-w-0">
              <GitCommitVertical class="w-3.5 h-3.5 shrink-0" :class="animationStore.selectedBoneId === root.id && !animationStore.selectedSocketId ? 'text-ui-accent' : 'text-ui-textMuted'" />
              <input 
                v-if="editingBoneId === root.id"
                v-model="editingName"
                @blur="commitRename(root.id)"
                @keydown.enter="commitRename(root.id)"
                class="bg-ui-input text-ui-textPrimary px-1 py-0.5 rounded-xs text-[11px] w-full border border-ui-accent focus:outline-none"
                autoFocus
              />
              <span v-else class="truncate select-none" @dblclick="startRename(root.id, root.name)">
                {{ root.name }}
              </span>
            </div>

            <!-- Row Actions -->
            <div class="flex items-center gap-1 opacity-60 group-hover:opacity-100">
              <button @click.stop="handleAddSocket(root.id)" class="p-0.5 text-ui-textMuted hover:text-sky-300" title="Add Socket (+S)">
                <Wrench class="w-3 h-3" />
              </button>
              <button @click.stop="handleAddChild(root.id)" class="p-0.5 text-ui-textMuted hover:text-ui-textPrimary" title="Add Child Bone">
                <Plus class="w-3 h-3" />
              </button>
              <button @click.stop="handleDeleteBone(root.id)" class="p-0.5 text-ui-textMuted hover:text-rose-400" title="Delete Bone">
                <Trash2 class="w-3 h-3" />
              </button>
            </div>
          </div>

          <!-- Sockets on Root -->
          <div 
            v-for="s in root.sockets || []" 
            :key="s.id" 
            @click.stop="selectSocket(s.id)"
            class="flex items-center justify-between pl-6 pr-2 py-0.5 rounded-xs cursor-pointer text-[10px] transition group"
            :class="animationStore.selectedSocketId === s.id ? 'bg-sky-500/20 text-sky-300 font-semibold border border-sky-500/50 shadow-xs' : 'text-sky-400 hover:bg-ui-hover'"
          >
            <div class="flex items-center gap-1.5 truncate flex-1 min-w-0">
              <Wrench class="w-2.5 h-2.5 shrink-0" />
              <input 
                v-if="editingSocketId === s.id"
                v-model="editingSocketName"
                @blur="commitSocketRename(root.id, s.id)"
                @keydown.enter="commitSocketRename(root.id, s.id)"
                class="bg-ui-input text-sky-200 px-1 py-0.5 rounded-xs text-[10px] w-full border border-sky-400 focus:outline-none"
                autoFocus
              />
              <span v-else class="truncate select-none" @dblclick="startSocketRename(s.id, s.name)">
                [S] {{ s.name }}
              </span>
            </div>
            <div class="flex items-center gap-1 opacity-60 group-hover:opacity-100">
              <button @click.stop="handleRemoveSocket(root.id, s.id)" class="p-0.5 text-ui-textMuted hover:text-rose-400" title="Delete Socket">
                <Trash2 class="w-2.5 h-2.5" />
              </button>
            </div>
          </div>

          <!-- Nested Child Bones -->
          <template v-for="child in getChildBones(root.id)" :key="child.id">
            <div 
              @click="selectBone(child.id)"
              class="flex items-center justify-between pl-5 pr-2 py-1 rounded-xs cursor-pointer text-[11px] transition group"
              :class="animationStore.selectedBoneId === child.id && !animationStore.selectedSocketId ? 'bg-ui-active text-ui-textAccent font-semibold border border-ui-accent/40 shadow-xs' : 'hover:bg-ui-hover text-ui-textSecondary'"
            >
              <div class="flex items-center gap-1.5 truncate flex-1 min-w-0">
                <span class="text-ui-borderSubtle">└</span>
                <GitCommitVertical class="w-3 h-3 shrink-0" :class="animationStore.selectedBoneId === child.id && !animationStore.selectedSocketId ? 'text-ui-accent' : 'text-ui-textMuted'" />
                <input 
                  v-if="editingBoneId === child.id"
                  v-model="editingName"
                  @blur="commitRename(child.id)"
                  @keydown.enter="commitRename(child.id)"
                  class="bg-ui-input text-ui-textPrimary px-1 py-0.5 rounded-xs text-[11px] w-full border border-ui-accent focus:outline-none"
                  autoFocus
                />
                <span v-else class="truncate select-none" @dblclick="startRename(child.id, child.name)">
                  {{ child.name }}
                </span>
              </div>

              <div class="flex items-center gap-1 opacity-60 group-hover:opacity-100">
                <button @click.stop="handleAddSocket(child.id)" class="p-0.5 text-ui-textMuted hover:text-sky-300" title="Add Socket (+S)">
                  <Wrench class="w-3 h-3" />
                </button>
                <button @click.stop="handleAddChild(child.id)" class="p-0.5 text-ui-textMuted hover:text-ui-textPrimary" title="Add Child Bone">
                  <Plus class="w-3 h-3" />
                </button>
                <button @click.stop="handleDeleteBone(child.id)" class="p-0.5 text-ui-textMuted hover:text-rose-400" title="Delete Bone">
                  <Trash2 class="w-3 h-3" />
                </button>
              </div>
            </div>

            <!-- Sockets on Child -->
            <div 
              v-for="s in child.sockets || []" 
              :key="s.id" 
              @click.stop="selectSocket(s.id)"
              class="flex items-center justify-between pl-10 pr-2 py-0.5 rounded-xs cursor-pointer text-[10px] transition group"
              :class="animationStore.selectedSocketId === s.id ? 'bg-sky-500/20 text-sky-300 font-semibold border border-sky-500/50 shadow-xs' : 'text-sky-400 hover:bg-ui-hover'"
            >
              <div class="flex items-center gap-1.5 truncate flex-1 min-w-0">
                <Wrench class="w-2.5 h-2.5 shrink-0" />
                <input 
                  v-if="editingSocketId === s.id"
                  v-model="editingSocketName"
                  @blur="commitSocketRename(child.id, s.id)"
                  @keydown.enter="commitSocketRename(child.id, s.id)"
                  class="bg-ui-input text-sky-200 px-1 py-0.5 rounded-xs text-[10px] w-full border border-sky-400 focus:outline-none"
                  autoFocus
                />
                <span v-else class="truncate select-none" @dblclick="startSocketRename(s.id, s.name)">
                  [S] {{ s.name }}
                </span>
              </div>
              <div class="flex items-center gap-1 opacity-60 group-hover:opacity-100">
                <button @click.stop="handleRemoveSocket(child.id, s.id)" class="p-0.5 text-ui-textMuted hover:text-rose-400" title="Delete Socket">
                  <Trash2 class="w-2.5 h-2.5" />
                </button>
              </div>
            </div>
          </template>
        </template>
      </div>

    </UiSection>

    <UiSection v-if="selectedSocket" title="Socket" :icon="Wrench" :default-open="true">
      <div class="flex items-center justify-between text-[10px]">
        <span class="text-sky-300 truncate">{{ selectedSocket.socket.name }} · {{ selectedSocket.bone.name }}</span>
        <button type="button" class="text-ui-textMuted hover:text-rose-400" @click="handleRemoveSocket(selectedSocket.bone.id, selectedSocket.socket.id)">
          <Trash2 class="w-3 h-3" />
        </button>
      </div>
      <div class="grid grid-cols-3 gap-1">
        <input type="number" step="0.1" v-model.number="selectedSocket.socket.position.x" class="w-full bg-ui-input px-1 py-0.5 text-right rounded-xs border border-ui-borderSubtle font-mono text-[10px]" title="X" />
        <input type="number" step="0.1" v-model.number="selectedSocket.socket.position.y" class="w-full bg-ui-input px-1 py-0.5 text-right rounded-xs border border-ui-borderSubtle font-mono text-[10px]" title="Y" />
        <input type="number" step="0.1" v-model.number="selectedSocket.socket.position.z" class="w-full bg-ui-input px-1 py-0.5 text-right rounded-xs border border-ui-borderSubtle font-mono text-[10px]" title="Z" />
      </div>
      <UiButton v-if="projectStore.activeMesh" size="xs" class="w-full" @click="handleAttachActiveMeshToSocket(selectedSocket.socket.id)">
        <Link class="w-3 h-3" /> Attach mesh
      </UiButton>
    </UiSection>

    <UiSection v-else-if="selectedBone" title="Parent" :icon="GitBranch" :default-open="true">
      <select
        :value="selectedBone.parentId || 'root'"
        class="w-full bg-ui-input border border-ui-borderDefault rounded-xs px-2 py-1 text-ui-textPrimary text-xs focus:outline-none cursor-pointer"
        @change="handleReparent(selectedBone.id, ($event.target as HTMLSelectElement).value)"
      >
        <option value="root" class="bg-ui-panel text-ui-textMuted">None (root)</option>
        <option
          v-for="b in animationStore.armature.bones.filter(b => b.id !== selectedBone?.id)"
          :key="b.id"
          :value="b.id"
          class="bg-ui-panel"
        >{{ b.name }}</option>
      </select>
      <p class="text-[9px] text-ui-textMuted">Rest pose, IK, and spring are on the Bone tab.</p>
    </UiSection>
  </div>
</template>
