<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAnimationStore } from '../../stores/animationStore'
import { useProjectStore } from '../../stores/projectStore'
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
  Link
} from 'lucide-vue-next'

const animationStore = useAnimationStore()
const projectStore = useProjectStore()

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
  <div class="h-full w-full bg-ui-panel p-3 text-ui-textPrimary flex flex-col space-y-3 font-sans text-xs select-none overflow-y-auto">
    <!-- Top Setup Actions Bar -->
    <div class="space-y-2 border-b border-ui-borderSubtle pb-2.5">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-1.5 font-semibold text-ui-textPrimary">
          <FolderTree class="w-3.5 h-3.5 text-ui-accent" />
          <span class="text-[11px] uppercase tracking-wider text-ui-textMuted font-bold">Rig Setup & Skeleton</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="text-[10px] text-ui-textMuted font-medium">
            {{ animationStore.armature.bones.length }} Bones
          </span>
          <button 
            @click="animationStore.toggleBoneHierarchyPopout(true)"
            class="p-0.5 hover:bg-ui-hover text-ui-textSecondary hover:text-ui-accent rounded-xs transition cursor-pointer"
            title="Pop out Floating Bone Hierarchy (H)"
          >
            <ExternalLink class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <!-- Quick Add Toolbar -->
      <div class="grid grid-cols-2 gap-1.5">
        <button 
          @click="handleAddRoot"
          class="py-1.5 px-2.5 bg-ui-accent hover:bg-ui-accentHover text-white rounded-xs font-semibold text-[11px] flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
          title="Add Center Root Bone at base of mesh"
        >
          <Plus class="w-3.5 h-3.5" />
          <span>Add Bone</span>
        </button>

        <button 
          @click="handleToggleDrawBone"
          class="py-1.5 px-2.5 rounded-xs font-semibold text-[11px] flex items-center justify-center gap-1.5 transition border cursor-pointer"
          :class="animationStore.clickToPlaceMode ? 'bg-amber-500/20 text-amber-300 border-amber-500/60 shadow-xs' : 'bg-ui-input/70 border-ui-borderSubtle text-ui-textSecondary hover:bg-ui-hover'"
          title="Click to place bone head and tail directly in 3D viewport (B)"
        >
          <Crosshair class="w-3.5 h-3.5" />
          <span>Draw (B)</span>
        </button>
      </div>

      <!-- Secondary Tools -->
      <div class="grid grid-cols-3 gap-1.5 text-[10px]">
        <button 
          @click="handleExtrude"
          class="py-1 px-1.5 bg-ui-input/70 hover:bg-ui-hover border border-ui-borderSubtle text-ui-textSecondary hover:text-ui-textPrimary rounded-xs font-medium flex items-center justify-center gap-1 transition cursor-pointer"
          title="Extrude new child bone from active joint (E)"
        >
          <GitBranch class="w-3 h-3 text-amber-400" />
          <span>Extrude (E)</span>
        </button>

        <button 
          @click="handleSymmetrize"
          class="py-1 px-1.5 bg-ui-input/70 hover:bg-ui-hover border border-ui-borderSubtle text-ui-textSecondary hover:text-ui-textPrimary rounded-xs font-medium flex items-center justify-center gap-1 transition cursor-pointer"
          title="Mirror .L bones across X-axis to .R"
        >
          <FlipHorizontal class="w-3 h-3 text-sky-400" />
          <span>Mirror X</span>
        </button>

        <button 
          v-if="selectedBone"
          @click="handleAddSocket(selectedBone.id)"
          class="py-1 px-1.5 bg-ui-input/70 hover:bg-ui-hover border border-ui-borderSubtle text-ui-textSecondary hover:text-sky-300 rounded-xs font-medium flex items-center justify-center gap-1 transition cursor-pointer"
          title="Add accessory/weapon socket to selected bone"
        >
          <Wrench class="w-3 h-3 text-sky-400" />
          <span>+ Socket</span>
        </button>
      </div>
    </div>

    <!-- Empty State Quick Setup (When 0 bones) -->
    <div v-if="animationStore.armature.bones.length === 0" class="bg-ui-surface/60 p-4 rounded-xs border border-ui-borderSubtle text-center space-y-3 my-auto">
      <div class="w-9 h-9 mx-auto rounded-full bg-ui-input/80 border border-ui-borderSubtle flex items-center justify-center text-ui-accent">
        <GitCommitVertical class="w-5 h-5" />
      </div>
      <div class="space-y-1">
        <h4 class="font-semibold text-xs text-ui-textPrimary">No Skeleton Created</h4>
        <p class="text-[11px] text-ui-textMuted leading-relaxed">
          Create bones to animate your model. Press <strong>B</strong> or click below to build your custom rig.
        </p>
      </div>
      <div class="space-y-1.5 pt-1">
        <button 
          @click="handleAddRoot"
          class="w-full py-2 px-3 bg-ui-accent hover:bg-ui-accentHover text-white rounded-xs font-semibold text-xs flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer"
        >
          <Plus class="w-3.5 h-3.5" />
          <span>Add Center Bone</span>
        </button>
        <button 
          @click="handleToggleDrawBone"
          class="w-full py-1.5 px-3 bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle text-ui-textSecondary rounded-xs font-medium text-[11px] flex items-center justify-center gap-1.5 transition cursor-pointer"
        >
          <Crosshair class="w-3 h-3 text-amber-400" />
          <span>Draw in Viewport (B)</span>
        </button>
      </div>
    </div>

    <!-- Active Hierarchy Tree View -->
    <div v-else class="flex-1 flex flex-col space-y-2 min-h-0">
      <div class="flex items-center justify-between text-[10px] text-ui-textMuted font-semibold uppercase tracking-wider">
        <span>Bone Hierarchy</span>
        <span class="text-ui-textSecondary truncate max-w-[130px]">{{ selectedSocket ? selectedSocket.socket.name : (selectedBone ? selectedBone.name : 'Select item') }}</span>
      </div>

      <div class="flex-1 bg-ui-input/50 rounded-xs border border-ui-borderSubtle p-1 space-y-0.5 overflow-y-auto min-h-[160px]">
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

      <!-- Selected Socket Inspector Tray -->
      <div v-if="selectedSocket" class="bg-sky-950/20 p-2 rounded-xs border border-ui-borderSubtle space-y-1.5 text-[10px]">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1 text-sky-300 font-semibold truncate">
            <Wrench class="w-3 h-3 shrink-0" />
            <span class="truncate">Socket: {{ selectedSocket.socket.name }}</span>
            <span class="text-ui-textMuted font-normal">({{ selectedSocket.bone.name }})</span>
          </div>
          <button @click="handleRemoveSocket(selectedSocket.bone.id, selectedSocket.socket.id)" class="text-ui-textMuted hover:text-rose-400 p-0.5 transition cursor-pointer">
            <Trash2 class="w-3 h-3" />
          </button>
        </div>

        <div class="flex items-center gap-2">
          <div class="flex items-center gap-1 flex-1">
            <span class="text-ui-textMuted">Offset:</span>
            <input type="number" step="0.1" v-model.number="selectedSocket.socket.position.x" class="w-10 bg-ui-input px-1 py-0.5 text-right rounded-xs border border-ui-borderSubtle font-mono text-ui-textPrimary" title="Offset X" />
            <input type="number" step="0.1" v-model.number="selectedSocket.socket.position.y" class="w-10 bg-ui-input px-1 py-0.5 text-right rounded-xs border border-ui-borderSubtle font-mono text-ui-textPrimary" title="Offset Y" />
            <input type="number" step="0.1" v-model.number="selectedSocket.socket.position.z" class="w-10 bg-ui-input px-1 py-0.5 text-right rounded-xs border border-ui-borderSubtle font-mono text-ui-textPrimary" title="Offset Z" />
          </div>
          <button 
            v-if="projectStore.activeMesh"
            @click="handleAttachActiveMeshToSocket(selectedSocket.socket.id)"
            class="px-2 py-0.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xs font-semibold flex items-center gap-1 transition cursor-pointer shadow-xs"
            :title="'Attach ' + projectStore.activeMesh.name + ' to this socket'"
          >
            <Link class="w-2.5 h-2.5" />
            <span>Attach Mesh</span>
          </button>
        </div>
      </div>

      <!-- Quick Parenting & Spring Physics Inspector for Selected Bone -->
      <div v-else-if="selectedBone" class="bg-ui-surface/60 p-2 rounded-xs border border-ui-borderSubtle space-y-2">
        <div class="space-y-1">
          <div class="text-[10px] text-ui-textMuted font-semibold uppercase">Parent Bone</div>
          <select 
            :value="selectedBone.parentId || 'root'"
            @change="handleReparent(selectedBone.id, ($event.target as HTMLSelectElement).value)"
            class="w-full bg-ui-input border border-ui-borderDefault rounded-xs px-2 py-1 text-ui-textPrimary text-xs focus:outline-none focus:border-ui-accent cursor-pointer"
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

        <!-- Spring / Jiggle Physics Section -->
        <div class="space-y-1.5 pt-1.5 border-t border-ui-borderSubtle/60">
          <div class="flex items-center justify-between">
            <span class="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">Spring Physics (Jiggle)</span>
            <input 
              type="checkbox"
              :checked="selectedBone?.springConstraint?.enabled || false"
              @change="(e) => {
                if (!selectedBone) return
                if (!selectedBone.springConstraint) {
                  selectedBone.springConstraint = { enabled: true, stiffness: 0.3, damping: 0.25, gravity: 0.0 }
                } else {
                  selectedBone.springConstraint.enabled = (e.target as HTMLInputElement).checked
                }
              }"
              class="rounded-xs accent-emerald-500 cursor-pointer"
            />
          </div>

          <template v-if="selectedBone && selectedBone.springConstraint?.enabled">
            <div class="space-y-1 text-[10px]">
              <div class="flex items-center justify-between text-ui-textMuted">
                <span>Stiffness:</span>
                <span class="font-mono text-ui-textPrimary">{{ selectedBone.springConstraint.stiffness }}</span>
              </div>
              <input 
                type="range" 
                min="0.05" 
                max="1.0" 
                step="0.05" 
                v-model.number="selectedBone.springConstraint.stiffness"
                class="w-full accent-emerald-500 h-1 bg-ui-input rounded-xs cursor-pointer"
              />

              <div class="flex items-center justify-between text-ui-textMuted">
                <span>Damping:</span>
                <span class="font-mono text-ui-textPrimary">{{ selectedBone.springConstraint.damping }}</span>
              </div>
              <input 
                type="range" 
                min="0.05" 
                max="1.0" 
                step="0.05" 
                v-model.number="selectedBone.springConstraint.damping"
                class="w-full accent-emerald-500 h-1 bg-ui-input rounded-xs cursor-pointer"
              />

              <div class="flex items-center justify-between text-ui-textMuted">
                <span>Gravity Sag:</span>
                <span class="font-mono text-ui-textPrimary">{{ selectedBone.springConstraint.gravity }}</span>
              </div>
              <input 
                type="range" 
                min="0.0" 
                max="1.0" 
                step="0.05" 
                v-model.number="selectedBone.springConstraint.gravity"
                class="w-full accent-emerald-500 h-1 bg-ui-input rounded-xs cursor-pointer"
              />
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
