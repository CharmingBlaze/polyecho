<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAnimationStore } from '../../stores/animationStore'
import { useProjectStore } from '../../stores/projectStore'
import { useToolStore } from '../../stores/toolStore'
import { 
  FolderTree, 
  Plus, 
  Trash2, 
  Wrench, 
  Crosshair, 
  GitBranch, 
  FlipHorizontal, 
  GitCommitVertical,
  Minus, 
  X, 
  GripHorizontal,
  Search,
  Key,
  RotateCcw,
  Copy,
  Clipboard,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight
} from 'lucide-vue-next'

const animationStore = useAnimationStore()
const projectStore = useProjectStore()
const toolStore = useToolStore()

// Popout Window Dimensions & Position State
const pos = ref({ x: Math.max(20, window.innerWidth - 380), y: 70 })
const width = ref(320)
const height = ref(480)
const isMinimized = ref(false)
const isDragging = ref(false)
const isResizing = ref(false)
const searchQuery = ref('')
const collapsedBranchIds = ref<Set<string>>(new Set())

// Editing inline state
const editingBoneId = ref<string | null>(null)
const editingName = ref<string>('')

// Hidden bones visibility set
const hiddenBoneIds = ref<Set<string>>(new Set())

let dragOffset = { x: 0, y: 0 }
let resizeStart = { x: 0, y: 0, w: 0, h: 0 }

const selectedBone = computed(() => animationStore.selectedBone)

const rootBones = computed(() => {
  const roots = animationStore.armature.bones.filter(b => !b.parentId)
  if (!searchQuery.value.trim()) return roots
  const q = searchQuery.value.toLowerCase()
  return roots.filter(b => b.name.toLowerCase().includes(q) || hasMatchingChild(b.id, q))
})

function hasMatchingChild(parentId: string, query: string): boolean {
  const children = animationStore.armature.bones.filter(b => b.parentId === parentId)
  for (const c of children) {
    if (c.name.toLowerCase().includes(query) || hasMatchingChild(c.id, query)) return true
  }
  return false
}

function getChildBones(parentId: string) {
  const children = animationStore.armature.bones.filter(b => b.parentId === parentId)
  if (!searchQuery.value.trim()) return children
  const q = searchQuery.value.toLowerCase()
  return children.filter(b => b.name.toLowerCase().includes(q) || hasMatchingChild(b.id, q))
}

function toggleBranch(id: string) {
  if (collapsedBranchIds.value.has(id)) {
    collapsedBranchIds.value.delete(id)
  } else {
    collapsedBranchIds.value.add(id)
  }
}

function toggleBoneVisibility(id: string) {
  if (hiddenBoneIds.value.has(id)) {
    hiddenBoneIds.value.delete(id)
  } else {
    hiddenBoneIds.value.add(id)
  }
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

// Window Dragging Handlers
function startDrag(e: MouseEvent) {
  if (e.button !== 0) return
  isDragging.value = true
  dragOffset = {
    x: e.clientX - pos.value.x,
    y: e.clientY - pos.value.y
  }

  const onMouseMove = (moveEvent: MouseEvent) => {
    if (!isDragging.value) return
    const maxX = window.innerWidth - 100
    const maxY = window.innerHeight - 40
    pos.value.x = Math.max(0, Math.min(maxX, moveEvent.clientX - dragOffset.x))
    pos.value.y = Math.max(34, Math.min(maxY, moveEvent.clientY - dragOffset.y))
  }

  const onMouseUp = () => {
    isDragging.value = false
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

// Window Resizing Handlers
function startResize(e: MouseEvent) {
  e.preventDefault()
  isResizing.value = true
  resizeStart = {
    x: e.clientX,
    y: e.clientY,
    w: width.value,
    h: height.value
  }

  const onMouseMove = (moveEvent: MouseEvent) => {
    if (!isResizing.value) return
    const dw = moveEvent.clientX - resizeStart.x
    const dh = moveEvent.clientY - resizeStart.y
    width.value = Math.max(260, Math.min(600, resizeStart.w + dw))
    height.value = Math.max(220, Math.min(window.innerHeight - 100, resizeStart.h + dh))
  }

  const onMouseUp = () => {
    isResizing.value = false
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

// Quick Operations
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

function handleKeySelected() {
  animationStore.recordCurrentKeyframe()
}

function handleKeyAll() {
  animationStore.recordAllBonesKeyframe()
}

function handleResetPose() {
  animationStore.resetAllBonesToRest()
}

function handleCopyPose() {
  animationStore.copyPose()
}

function handlePastePose() {
  animationStore.pastePose()
}

function closePopout() {
  animationStore.showBoneHierarchyPopout = false
}
</script>

<template>
  <div 
    v-if="animationStore.showBoneHierarchyPopout"
    class="fixed z-50 bg-ui-panel border border-ui-borderStrong rounded-xs shadow-2xl flex flex-col font-sans text-xs select-none backdrop-blur-xs overflow-hidden"
    :style="{
      left: pos.x + 'px',
      top: pos.y + 'px',
      width: width + 'px',
      height: isMinimized ? '34px' : height + 'px'
    }"
  >
    <!-- 1. Header Bar (Draggable) -->
    <div 
      @mousedown="startDrag"
      class="h-8 bg-ui-header px-2.5 flex items-center justify-between border-b border-ui-borderSubtle cursor-move shrink-0"
    >
      <div class="flex items-center gap-1.5 font-semibold text-ui-textPrimary">
        <GripHorizontal class="w-3.5 h-3.5 text-ui-textMuted opacity-60" />
        <FolderTree class="w-3.5 h-3.5 text-ui-accent" />
        <span class="text-[11px] font-bold uppercase tracking-wider text-ui-textMuted">Bone Hierarchy</span>
        <span class="text-[10px] px-1.5 py-0.2 bg-ui-input/80 border border-ui-borderSubtle rounded-xs text-ui-textAccent font-mono">
          {{ animationStore.armature.bones.length }}
        </span>
      </div>

      <!-- Controls (Minimize / Close) -->
      <div class="flex items-center gap-1">
        <button 
          @click="isMinimized = !isMinimized"
          class="p-1 text-ui-textMuted hover:text-ui-textPrimary rounded-xs hover:bg-ui-hover transition cursor-pointer"
          :title="isMinimized ? 'Expand' : 'Minimize'"
        >
          <Plus v-if="isMinimized" class="w-3 h-3" />
          <Minus v-else class="w-3 h-3" />
        </button>
        <button 
          @click="closePopout"
          class="p-1 text-ui-textMuted hover:text-rose-400 rounded-xs hover:bg-ui-hover transition cursor-pointer"
          title="Close Hierarchy Popout"
        >
          <X class="w-3 h-3" />
        </button>
      </div>
    </div>

    <!-- 2. Body Content (When Not Minimized) -->
    <div v-show="!isMinimized" class="flex-1 flex flex-col min-h-0 bg-ui-panel/95">
      <!-- Fast Animator / Rigger Workflow Toolbar -->
      <div class="p-2 border-b border-ui-borderSubtle bg-ui-surface/40 space-y-1.5">
        <!-- Search filter -->
        <div class="relative flex items-center">
          <Search class="w-3 h-3 text-ui-textMuted absolute left-2 pointer-events-none" />
          <input 
            v-model="searchQuery"
            placeholder="Search skeleton bones..."
            class="w-full bg-ui-input border border-ui-borderSubtle rounded-xs pl-7 pr-2 py-1 text-[11px] text-ui-textPrimary focus:outline-none focus:border-ui-accent placeholder:text-ui-textMuted/60"
          />
          <button 
            v-if="searchQuery" 
            @click="searchQuery = ''"
            class="absolute right-2 text-ui-textMuted hover:text-ui-textPrimary text-[10px]"
          >
            ×
          </button>
        </div>

        <!-- Quick Action Buttons -->
        <div class="flex items-center justify-between gap-1 text-[10px]">
          <!-- Animation Workspace Tools -->
          <template v-if="toolStore.appMode === 'animate' || animationStore.isTestPoseActive">
            <button 
              @click="handleKeySelected"
              :disabled="!selectedBone"
              class="flex-1 py-1 px-1.5 bg-ui-accent hover:bg-ui-accentHover text-white rounded-xs font-semibold flex items-center justify-center gap-1 shadow-xs transition cursor-pointer disabled:opacity-40"
              title="Key Selected Bone (K)"
            >
              <Key class="w-2.5 h-2.5" />
              <span>Key (K)</span>
            </button>
            <button 
              @click="handleKeyAll"
              class="flex-1 py-1 px-1.5 bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle text-ui-textPrimary rounded-xs font-semibold flex items-center justify-center gap-1 transition cursor-pointer"
              title="Key Entire Skeleton"
            >
              <span>Key All</span>
            </button>
            <button 
              @click="handleResetPose"
              class="py-1 px-1.5 bg-ui-input hover:bg-amber-500/10 border border-ui-borderSubtle text-amber-300 rounded-xs font-semibold flex items-center justify-center gap-1 transition cursor-pointer"
              title="Reset Rest Pose (Alt+R)"
            >
              <RotateCcw class="w-2.5 h-2.5" />
              <span>Reset</span>
            </button>
            <button 
              @click="handleCopyPose"
              class="p-1 bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle text-ui-textSecondary rounded-xs transition cursor-pointer"
              title="Copy Pose"
            >
              <Copy class="w-2.5 h-2.5" />
            </button>
            <button 
              @click="handlePastePose"
              class="p-1 bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle text-ui-textSecondary rounded-xs transition cursor-pointer"
              title="Paste Pose"
            >
              <Clipboard class="w-2.5 h-2.5" />
            </button>
          </template>

          <!-- Rigging Workspace Setup Tools -->
          <template v-else>
            <button 
              @click="handleAddRoot"
              class="flex-1 py-1 px-1.5 bg-ui-accent hover:bg-ui-accentHover text-white rounded-xs font-semibold flex items-center justify-center gap-1 shadow-xs transition cursor-pointer"
              title="Add Center Bone"
            >
              <Plus class="w-2.5 h-2.5" />
              <span>Add Root</span>
            </button>
            <button 
              @click="handleExtrude"
              class="flex-1 py-1 px-1.5 bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle text-ui-textSecondary hover:text-ui-textPrimary rounded-xs font-semibold flex items-center justify-center gap-1 transition cursor-pointer"
              title="Extrude Child Bone (E)"
            >
              <GitBranch class="w-2.5 h-2.5 text-amber-400" />
              <span>Extrude (E)</span>
            </button>
            <button 
              @click="handleToggleDrawBone"
              class="py-1 px-1.5 rounded-xs font-semibold flex items-center justify-center gap-1 transition border cursor-pointer"
              :class="animationStore.clickToPlaceMode ? 'bg-amber-500/20 text-amber-300 border-amber-500/60' : 'bg-ui-input border-ui-borderSubtle text-ui-textSecondary hover:bg-ui-hover'"
              title="Draw Bone in 3D (B)"
            >
              <Crosshair class="w-2.5 h-2.5" />
              <span>Draw</span>
            </button>
            <button 
              @click="handleSymmetrize"
              class="py-1 px-1.5 bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle text-ui-textSecondary hover:text-sky-300 rounded-xs font-semibold flex items-center justify-center gap-1 transition cursor-pointer"
              title="Mirror Skeleton X"
            >
              <FlipHorizontal class="w-2.5 h-2.5 text-sky-400" />
            </button>
          </template>
        </div>
      </div>

      <!-- 3. Hierarchy Tree Scroll View -->
      <div class="flex-1 p-1.5 overflow-y-auto space-y-0.5 min-h-[140px]">
        <div v-if="animationStore.armature.bones.length === 0" class="py-10 text-center text-ui-textMuted space-y-2">
          <p class="text-[11px]">No bones in skeleton yet.</p>
          <button 
            @click="handleAddRoot"
            class="py-1 px-2.5 bg-ui-accent hover:bg-ui-accentHover text-white rounded-xs font-semibold text-[11px] inline-flex items-center gap-1 transition cursor-pointer shadow-xs"
          >
            <Plus class="w-3 h-3" />
            <span>Create First Bone</span>
          </button>
        </div>

        <template v-for="root in rootBones" :key="root.id">
          <!-- Root Bone Row -->
          <div 
            @click="selectBone(root.id)"
            class="flex items-center justify-between px-2 py-1 rounded-xs cursor-pointer text-[11px] transition group"
            :class="animationStore.selectedBoneId === root.id ? 'bg-ui-active text-ui-textAccent font-semibold border border-ui-accent/40 shadow-xs' : 'hover:bg-ui-hover text-ui-textSecondary'"
          >
            <div class="flex items-center gap-1.5 truncate flex-1 min-w-0">
              <!-- Expand / Collapse Branch -->
              <button 
                v-if="getChildBones(root.id).length > 0"
                @click.stop="toggleBranch(root.id)"
                class="p-0.5 text-ui-textMuted hover:text-ui-textPrimary"
              >
                <ChevronRight v-if="collapsedBranchIds.has(root.id)" class="w-3 h-3" />
                <ChevronDown v-else class="w-3 h-3" />
              </button>
              <span v-else class="w-3.5"></span>

              <GitCommitVertical class="w-3.5 h-3.5 shrink-0" :class="animationStore.selectedBoneId === root.id ? 'text-ui-accent' : 'text-ui-textMuted'" />
              
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

            <!-- Row Tools -->
            <div class="flex items-center gap-1 opacity-60 group-hover:opacity-100">
              <button @click.stop="toggleBoneVisibility(root.id)" class="p-0.5 text-ui-textMuted hover:text-ui-textPrimary" title="Toggle Visibility">
                <EyeOff v-if="hiddenBoneIds.has(root.id)" class="w-3 h-3 text-rose-400" />
                <Eye v-else class="w-3 h-3" />
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
          <div v-for="s in root.sockets || []" :key="s.id" class="flex items-center gap-1.5 pl-8 py-0.5 text-[10px] text-sky-400">
            <Wrench class="w-2.5 h-2.5 shrink-0" />
            <span>[S] {{ s.name }}</span>
          </div>

          <!-- Children Subtree -->
          <div v-show="!collapsedBranchIds.has(root.id)">
            <template v-for="child in getChildBones(root.id)" :key="child.id">
              <div 
                @click="selectBone(child.id)"
                class="flex items-center justify-between pl-6 pr-2 py-1 rounded-xs cursor-pointer text-[11px] transition group"
                :class="animationStore.selectedBoneId === child.id ? 'bg-ui-active text-ui-textAccent font-semibold border border-ui-accent/40 shadow-xs' : 'hover:bg-ui-hover text-ui-textSecondary'"
              >
                <div class="flex items-center gap-1.5 truncate flex-1 min-w-0">
                  <span class="text-ui-borderSubtle">└</span>
                  <GitCommitVertical class="w-3 h-3 shrink-0" :class="animationStore.selectedBoneId === child.id ? 'text-ui-accent' : 'text-ui-textMuted'" />
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
                  <button @click.stop="toggleBoneVisibility(child.id)" class="p-0.5 text-ui-textMuted hover:text-ui-textPrimary" title="Toggle Visibility">
                    <EyeOff v-if="hiddenBoneIds.has(child.id)" class="w-3 h-3 text-rose-400" />
                    <Eye v-else class="w-3 h-3" />
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
              <div v-for="s in child.sockets || []" :key="s.id" class="flex items-center gap-1.5 pl-12 py-0.5 text-[10px] text-sky-400">
                <Wrench class="w-2.5 h-2.5 shrink-0" />
                <span>[S] {{ s.name }}</span>
              </div>
            </template>
          </div>
        </template>
      </div>

      <!-- 4. Selected Joint Status Tray -->
      <div v-if="selectedBone" class="p-2 border-t border-ui-borderSubtle bg-ui-surface/60 flex items-center justify-between text-[10px] text-ui-textMuted">
        <div class="flex items-center gap-1.5 truncate">
          <span class="font-semibold text-ui-textPrimary truncate">{{ selectedBone.name }}</span>
          <span>·</span>
          <span>Parent: {{ selectedBone.parentId ? 'Linked' : 'Root' }}</span>
        </div>
        <button 
          @click="handleAddSocket(selectedBone.id)"
          class="text-sky-400 hover:text-sky-300 flex items-center gap-1 transition cursor-pointer"
        >
          <Wrench class="w-2.5 h-2.5" />
          <span>+ Socket</span>
        </button>
      </div>
    </div>

    <!-- Corner Resizer Handle -->
    <div 
      v-show="!isMinimized"
      @mousedown="startResize"
      class="absolute right-0 bottom-0 w-3 h-3 cursor-se-resize flex items-end justify-end p-0.5 opacity-40 hover:opacity-100 select-none z-10"
    >
      <div class="w-1.5 h-1.5 border-r-2 border-b-2 border-ui-borderDefault"></div>
    </div>
  </div>
</template>
