<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAnimationStore } from '../../stores/animationStore'
import { useProjectStore } from '../../stores/projectStore'
import { useToolStore } from '../../stores/toolStore'
import type { Bone, BoneSocket } from '../../types/animation'
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
  ChevronRight,
  Link,
  ChevronsDown,
  ChevronsUp,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight
} from 'lucide-vue-next'

const animationStore = useAnimationStore()
const projectStore = useProjectStore()
const toolStore = useToolStore()

// Popout Window Dimensions & Position State
const pos = ref({ x: Math.max(20, window.innerWidth - 400), y: 70 })
const width = ref(340)
const height = ref(520)
const isMinimized = ref(false)
const isDragging = ref(false)
const isResizing = ref(false)
const searchQuery = ref('')
const collapsedBranchIds = ref<Set<string>>(new Set())

// Editing inline state
const editingBoneId = ref<string | null>(null)
const editingName = ref<string>('')
const editingSocketId = ref<string | null>(null)
const editingSocketName = ref<string>('')

// Hidden bones visibility set
const hiddenBoneIds = ref<Set<string>>(new Set())

let dragOffset = { x: 0, y: 0 }
let resizeStart = { x: 0, y: 0, w: 0, h: 0 }

const selectedBone = computed(() => animationStore.selectedBone)
const selectedSocket = computed(() => animationStore.selectedSocket)

export interface FlattenedTreeNode {
  bone: Bone
  depth: number
  hasChildren: boolean
  isCollapsed: boolean
  isVisible: boolean
  isMatching: boolean
  sockets: BoneSocket[]
}

// Arbitrary Depth Recursive Tree Flattener
const flattenedBoneTree = computed<FlattenedTreeNode[]>(() => {
  const allBones = animationStore.armature.bones
  const boneMap = new Map(allBones.map(b => [b.id, b]))
  const q = searchQuery.value.trim().toLowerCase()

  const matchSet = new Set<string>()
  if (q) {
    for (const b of allBones) {
      const matchBone = b.name.toLowerCase().includes(q)
      const matchSocket = b.sockets?.some(s => s.name.toLowerCase().includes(q))
      if (matchBone || matchSocket) {
        matchSet.add(b.id)
        let cur = b
        while (cur.parentId) {
          const parent = boneMap.get(cur.parentId)
          if (!parent) break
          matchSet.add(parent.id)
          cur = parent
        }
      }
    }
  }

  const result: FlattenedTreeNode[] = []

  function traverse(boneId: string, depth: number, parentVisible: boolean) {
    const bone = boneMap.get(boneId)
    if (!bone) return

    const isCollapsed = collapsedBranchIds.value.has(bone.id)
    const hasChildren = (bone.childrenIds && bone.childrenIds.length > 0) || (bone.sockets && bone.sockets.length > 0)
    const isMatching = !q || matchSet.has(bone.id)
    const isVisible = parentVisible && (!q || isMatching)

    result.push({
      bone,
      depth,
      hasChildren: Boolean(hasChildren),
      isCollapsed,
      isVisible,
      isMatching,
      sockets: bone.sockets || []
    })

    const childrenVisible = isVisible && !isCollapsed
    if (bone.childrenIds && bone.childrenIds.length > 0) {
      for (const childId of bone.childrenIds) {
        traverse(childId, depth + 1, childrenVisible)
      }
    }
  }

  const rootBones = allBones.filter(b => !b.parentId)
  for (const root of rootBones) {
    traverse(root.id, 0, true)
  }

  return result
})

function toggleBranch(id: string) {
  if (collapsedBranchIds.value.has(id)) {
    collapsedBranchIds.value.delete(id)
  } else {
    collapsedBranchIds.value.add(id)
  }
}

function handleExpandAll() {
  collapsedBranchIds.value.clear()
}

function handleCollapseAll() {
  const newSet = new Set<string>()
  for (const b of animationStore.armature.bones) {
    if ((b.childrenIds && b.childrenIds.length > 0) || (b.sockets && b.sockets.length > 0)) {
      newSet.add(b.id)
    }
  }
  collapsedBranchIds.value = newSet
}

function toggleBoneVisibility(id: string) {
  if (hiddenBoneIds.value.has(id)) {
    hiddenBoneIds.value.delete(id)
  } else {
    hiddenBoneIds.value.add(id)
  }
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
    width.value = Math.max(280, Math.min(700, resizeStart.w + dw))
    height.value = Math.max(220, Math.min(window.innerHeight - 80, resizeStart.h + dh))
  }

  const onMouseUp = () => {
    isResizing.value = false
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
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
  const bone = animationStore.addBoneFromPoints(head, tail, null, animationStore.generateSmartBoneName())
  animationStore.selectedBoneId = bone.id
}

function handleAddChild(parentId: string) {
  projectStore.recordState('Add Child Bone')
  const pBone = animationStore.armature.bones.find(b => b.id === parentId)
  animationStore.addChildBone(parentId, animationStore.generateSmartBoneName(pBone?.name))
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

function handleAttachActiveMeshToSocket(socketId: string) {
  if (!projectStore.activeMesh) return
  projectStore.recordState('Attach Mesh to Socket')
  projectStore.activeMesh.parentId = socketId
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

      <!-- Controls (Expand/Collapse All / Minimize / Close) -->
      <div class="flex items-center gap-1">
        <button 
          @click="handleExpandAll" 
          class="p-1 text-ui-textMuted hover:text-ui-textPrimary rounded-xs hover:bg-ui-hover transition cursor-pointer"
          title="Expand All Bone Branches"
        >
          <ChevronsDown class="w-3 h-3" />
        </button>
        <button 
          @click="handleCollapseAll" 
          class="p-1 text-ui-textMuted hover:text-ui-textPrimary rounded-xs hover:bg-ui-hover transition cursor-pointer"
          title="Collapse All Bone Branches"
        >
          <ChevronsUp class="w-3 h-3" />
        </button>
        <div class="w-px h-3.5 bg-ui-borderSubtle mx-0.5"></div>
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
          title="Close Hierarchy Popout (H)"
        >
          <X class="w-3 h-3" />
        </button>
      </div>
    </div>

    <!-- 2. Body Content (When Not Minimized) -->
    <div v-show="!isMinimized" class="flex-1 flex flex-col min-h-0 bg-ui-panel/95">
      <!-- Search and Quick Traversal Toolbar -->
      <div class="p-2 border-b border-ui-borderSubtle bg-ui-surface/40 space-y-1.5 shrink-0">
        <!-- Search filter -->
        <div class="relative flex items-center">
          <Search class="w-3 h-3 text-ui-textMuted absolute left-2 pointer-events-none" />
          <input 
            v-model="searchQuery"
            placeholder="Search skeleton bones..."
            class="w-full bg-ui-input border border-ui-borderSubtle rounded-xs pl-7 pr-7 py-1 text-[11px] text-ui-textPrimary focus:outline-none focus:border-ui-accent placeholder:text-ui-textMuted/60"
          />
          <button 
            v-if="searchQuery" 
            @click="searchQuery = ''"
            class="absolute right-2 text-ui-textMuted hover:text-ui-textPrimary text-[10px] cursor-pointer"
          >
            ×
          </button>
        </div>

        <!-- Quick Traversal & Pose Controls -->
        <div class="flex items-center justify-between gap-1 text-[10px]">
          <!-- Parent / Child Traversal Island -->
          <div class="flex items-center gap-0.5 bg-ui-input/70 p-0.5 rounded-xs border border-ui-borderSubtle">
            <button 
              @click="animationStore.selectParentBone()" 
              :disabled="!selectedBone || !selectedBone.parentId"
              class="p-1 text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover rounded-xs transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              title="Select Parent Bone (Up)"
            >
              <ArrowUp class="w-3 h-3" />
            </button>
            <button 
              @click="animationStore.selectFirstChildBone()" 
              :disabled="!selectedBone || selectedBone.childrenIds.length === 0"
              class="p-1 text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover rounded-xs transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              title="Select First Child Bone (Down)"
            >
              <ArrowDown class="w-3 h-3" />
            </button>
            <button 
              @click="animationStore.selectPreviousBone()" 
              class="p-1 text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover rounded-xs transition cursor-pointer"
              title="Select Previous Bone in Skeleton"
            >
              <ArrowLeft class="w-3 h-3" />
            </button>
            <button 
              @click="animationStore.selectNextBone()" 
              class="p-1 text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover rounded-xs transition cursor-pointer"
              title="Select Next Bone in Skeleton"
            >
              <ArrowRight class="w-3 h-3" />
            </button>
          </div>

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
              class="py-1 px-1.5 bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle text-ui-textPrimary rounded-xs font-semibold flex items-center justify-center gap-1 transition cursor-pointer"
              title="Key Entire Skeleton"
            >
              <span>All</span>
            </button>
            <button 
              @click="handleResetPose"
              class="py-1 px-1.5 bg-ui-input hover:bg-amber-500/10 border border-ui-borderSubtle text-amber-300 rounded-xs font-semibold flex items-center justify-center gap-1 transition cursor-pointer"
              title="Reset Rest Pose (Alt+R)"
            >
              <RotateCcw class="w-2.5 h-2.5" />
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
              <span>+ Root</span>
            </button>
            <button 
              @click="handleExtrude"
              class="flex-1 py-1 px-1.5 bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle text-ui-textSecondary hover:text-ui-textPrimary rounded-xs font-semibold flex items-center justify-center gap-1 transition cursor-pointer"
              title="Extrude Child Bone (E)"
            >
              <GitBranch class="w-2.5 h-2.5 text-amber-400" />
              <span>Extrude</span>
            </button>
            <button 
              @click="handleToggleDrawBone"
              class="py-1 px-1.5 rounded-xs font-semibold flex items-center justify-center gap-1 transition border cursor-pointer"
              :class="animationStore.clickToPlaceMode ? 'bg-amber-500/20 text-amber-300 border-amber-500/60' : 'bg-ui-input border-ui-borderSubtle text-ui-textSecondary hover:bg-ui-hover'"
              title="Draw Bone in 3D (B)"
            >
              <Crosshair class="w-2.5 h-2.5" />
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

      <!-- 3. Full Recursive Hierarchy Tree Scroll View -->
      <div class="flex-1 p-1.5 overflow-y-auto space-y-0.5 min-h-[140px] custom-scrollbar">
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

        <!-- Render each recursive tree node at any depth -->
        <template v-for="node in flattenedBoneTree" :key="node.bone.id">
          <div v-show="node.isVisible">
            <!-- Bone Row -->
            <div 
              @click="selectBone(node.bone.id)"
              class="flex items-center justify-between pr-2 py-1 rounded-xs cursor-pointer text-[11px] transition group"
              :style="{ paddingLeft: `${8 + node.depth * 14}px` }"
              :class="animationStore.selectedBoneId === node.bone.id && !animationStore.selectedSocketId ? 'bg-ui-active text-ui-textAccent font-semibold border border-ui-accent/40 shadow-xs' : 'hover:bg-ui-hover text-ui-textSecondary'"
            >
              <div class="flex items-center gap-1.5 truncate flex-1 min-w-0">
                <!-- Branch Expand / Collapse Toggle -->
                <button 
                  v-if="node.hasChildren"
                  @click.stop="toggleBranch(node.bone.id)"
                  class="p-0.5 text-ui-textMuted hover:text-ui-textPrimary cursor-pointer"
                >
                  <ChevronRight v-if="node.isCollapsed" class="w-3 h-3" />
                  <ChevronDown v-else class="w-3 h-3" />
                </button>
                <span v-else class="w-3 text-ui-borderSubtle text-[9px] text-center font-mono">
                  {{ node.depth > 0 ? '└' : '' }}
                </span>

                <GitCommitVertical 
                  class="w-3.5 h-3.5 shrink-0" 
                  :class="animationStore.selectedBoneId === node.bone.id && !animationStore.selectedSocketId ? 'text-ui-accent' : node.depth === 0 ? 'text-purple-400' : 'text-sky-400'" 
                />
                
                <input 
                  v-if="editingBoneId === node.bone.id"
                  v-model="editingName"
                  @blur="commitRename(node.bone.id)"
                  @keydown.enter="commitRename(node.bone.id)"
                  class="bg-ui-input text-ui-textPrimary px-1 py-0.5 rounded-xs text-[11px] w-full border border-ui-accent focus:outline-none"
                  autoFocus
                />
                <span 
                  v-else 
                  class="truncate select-none font-mono" 
                  :class="node.isMatching && searchQuery ? 'text-amber-300 font-bold' : ''"
                  @dblclick="startRename(node.bone.id, node.bone.name)"
                  :title="node.bone.name + ' (Double-click to rename)'"
                >
                  {{ node.bone.name }}
                </span>

                <!-- Child Count Pill -->
                <span 
                  v-if="node.bone.childrenIds.length > 0" 
                  class="text-[9px] text-ui-textMuted bg-ui-input/60 px-1 rounded-xs shrink-0 font-sans"
                >
                  {{ node.bone.childrenIds.length }}
                </span>
              </div>

              <!-- Row Tools -->
              <div class="flex items-center gap-1 opacity-60 group-hover:opacity-100">
                <button @click.stop="toggleBoneVisibility(node.bone.id)" class="p-0.5 text-ui-textMuted hover:text-ui-textPrimary cursor-pointer" title="Toggle Visibility">
                  <EyeOff v-if="hiddenBoneIds.has(node.bone.id)" class="w-3 h-3 text-rose-400" />
                  <Eye v-else class="w-3 h-3" />
                </button>
                <button @click.stop="handleAddSocket(node.bone.id)" class="p-0.5 text-ui-textMuted hover:text-sky-300 cursor-pointer" title="Add Socket (+S)">
                  <Wrench class="w-3 h-3" />
                </button>
                <button @click.stop="handleAddChild(node.bone.id)" class="p-0.5 text-ui-textMuted hover:text-ui-textPrimary cursor-pointer" title="Add Child Bone">
                  <Plus class="w-3 h-3" />
                </button>
                <button @click.stop="handleDeleteBone(node.bone.id)" class="p-0.5 text-ui-textMuted hover:text-rose-400 cursor-pointer" title="Delete Bone">
                  <Trash2 class="w-3 h-3" />
                </button>
              </div>
            </div>

            <!-- Sockets directly under this bone -->
            <div v-show="!node.isCollapsed && node.sockets.length > 0">
              <div 
                v-for="s in node.sockets" 
                :key="s.id" 
                @click.stop="selectSocket(s.id)"
                class="flex items-center justify-between pr-2 py-0.5 rounded-xs cursor-pointer text-[10px] transition group"
                :style="{ paddingLeft: `${22 + node.depth * 14}px` }"
                :class="animationStore.selectedSocketId === s.id ? 'bg-sky-500/20 text-sky-300 font-semibold border border-sky-500/50 shadow-xs' : 'text-sky-400 hover:bg-ui-hover'"
              >
                <div class="flex items-center gap-1.5 truncate flex-1 min-w-0">
                  <Wrench class="w-2.5 h-2.5 shrink-0" />
                  <input 
                    v-if="editingSocketId === s.id"
                    v-model="editingSocketName"
                    @blur="commitSocketRename(node.bone.id, s.id)"
                    @keydown.enter="commitSocketRename(node.bone.id, s.id)"
                    class="bg-ui-input text-sky-200 px-1 py-0.5 rounded-xs text-[10px] w-full border border-sky-400 focus:outline-none"
                    autoFocus
                  />
                  <span v-else class="truncate select-none font-mono" @dblclick="startSocketRename(s.id, s.name)">
                    [S] {{ s.name }}
                  </span>
                </div>
                <div class="flex items-center gap-1 opacity-60 group-hover:opacity-100">
                  <button @click.stop="handleRemoveSocket(node.bone.id, s.id)" class="p-0.5 text-ui-textMuted hover:text-rose-400 cursor-pointer" title="Delete Socket">
                    <Trash2 class="w-2.5 h-2.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- 4. Selected Joint / Socket Inspector Tray -->
      <!-- Case A: Selected Socket -->
      <div v-if="selectedSocket" class="p-2 border-t border-ui-borderSubtle bg-sky-950/20 space-y-1.5 text-[10px] shrink-0">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1.5 text-sky-300 font-semibold truncate">
            <Wrench class="w-3 h-3 shrink-0" />
            <span class="truncate">Socket: {{ selectedSocket.socket.name }}</span>
            <span class="text-ui-textMuted font-normal">({{ selectedSocket.bone.name }})</span>
          </div>
          <button 
            @click="handleRemoveSocket(selectedSocket.bone.id, selectedSocket.socket.id)"
            class="text-ui-textMuted hover:text-rose-400 p-0.5 transition cursor-pointer"
            title="Delete Socket"
          >
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

      <!-- Case B: Selected Bone -->
      <div v-else-if="selectedBone" class="p-2 border-t border-ui-borderSubtle bg-ui-surface/60 flex items-center justify-between text-[10px] text-ui-textMuted shrink-0">
        <div class="flex items-center gap-1.5 truncate">
          <span class="text-ui-textPrimary font-mono font-bold">{{ selectedBone.name }}</span>
          <span v-if="selectedBone.parentId" class="text-ui-textSecondary truncate max-w-[90px]">
            Parent: {{ animationStore.armature.bones.find(b => b.id === selectedBone?.parentId)?.name }}
          </span>
          <span v-else class="text-purple-400 font-semibold">(Root)</span>
        </div>
        <button 
          @click="handleAddSocket(selectedBone.id)"
          class="px-1.5 py-0.5 bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle rounded-xs text-[10px] text-sky-300 font-semibold transition cursor-pointer"
        >
          + Socket
        </button>
      </div>
    </div>

    <!-- Window Resize Handle (Bottom-Right Corner) -->
    <div 
      @mousedown="startResize"
      class="absolute bottom-0 right-0 w-3.5 h-3.5 cursor-nwse-resize z-50 flex items-end justify-end p-0.5 text-ui-textMuted hover:text-ui-textPrimary"
    >
      <div class="w-1.5 h-1.5 border-r-2 border-b-2 border-ui-borderStrong"></div>
    </div>
  </div>
</template>
