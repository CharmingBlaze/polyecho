<script setup lang="ts">
import { ref, computed } from 'vue'
import { useFloatingDrag } from '../../composables/useFloatingDrag'
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
const { startDrag } = useFloatingDrag(pos, { maxPadX: 100, maxPadY: 40 })
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
        const seen = new Set<string>()
        while (cur.parentId && !seen.has(cur.id)) {
          seen.add(cur.id)
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
  const pBone = animationStore.armature.bones.find(b => b.id === parentId)
  animationStore.addChildBone(parentId, animationStore.generateSmartBoneName(pBone?.name))
}

function handleExtrude() {
  if (!animationStore.selectedBoneId) {
    handleAddRoot()
    return
  }
  animationStore.extrudeBone(animationStore.selectedBoneId)
}

function handleToggleDrawBone() {
  animationStore.clickToPlaceMode = !animationStore.clickToPlaceMode
}

function handleAddSocket(boneId: string) {
  const s = animationStore.addSocket(boneId, `Socket_${Date.now().toString(36).slice(-3)}`)
  if (s) {
    animationStore.selectSocket(s.id)
  }
}

function handleRemoveSocket(boneId: string, socketId: string) {
  animationStore.removeSocket(boneId, socketId)
  if (animationStore.selectedSocketId === socketId) {
    animationStore.selectedSocketId = null
  }
}

function handleDeleteBone(id: string) {
  animationStore.deleteBone(id)
}

function handleSymmetrize() {
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
    data-floating-panel
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
      class="h-8 bg-ui-header px-2.5 flex items-center justify-between border-b border-ui-borderSubtle cursor-move shrink-0"
      @pointerdown="startDrag"
    >
      <div class="flex items-center gap-1.5 font-semibold text-ui-textPrimary">
        <GripHorizontal class="w-3.5 h-3.5 text-ui-textMuted opacity-60" />
        <FolderTree class="w-3.5 h-3.5 text-ui-textMuted" />
        <span class="text-[11px] font-bold uppercase tracking-wider text-ui-textMuted">Bone Hierarchy</span>
        <span class="text-[10px] px-1.5 py-0.2 bg-ui-input/80 border border-ui-borderSubtle rounded-xs inspector-value font-mono">
          {{ animationStore.armature.bones.length }}
        </span>
      </div>

      <!-- Controls (Expand/Collapse All / Minimize / Close) -->
      <div class="flex items-center gap-1">
        <button 
          class="p-1 text-ui-textMuted hover:text-ui-textPrimary rounded-xs hover:bg-ui-hover transition cursor-pointer" 
          title="Expand All Bone Branches"
          @click="handleExpandAll"
        >
          <ChevronsDown class="w-3 h-3" />
        </button>
        <button 
          class="p-1 text-ui-textMuted hover:text-ui-textPrimary rounded-xs hover:bg-ui-hover transition cursor-pointer" 
          title="Collapse All Bone Branches"
          @click="handleCollapseAll"
        >
          <ChevronsUp class="w-3 h-3" />
        </button>
        <div class="w-px h-3.5 bg-ui-borderSubtle mx-0.5" />
        <button 
          class="p-1 text-ui-textMuted hover:text-ui-textPrimary rounded-xs hover:bg-ui-hover transition cursor-pointer"
          :title="isMinimized ? 'Expand' : 'Minimize'"
          @click="isMinimized = !isMinimized"
        >
          <Plus v-if="isMinimized" class="w-3 h-3" />
          <Minus v-else class="w-3 h-3" />
        </button>
        <button 
          class="p-1 text-ui-textMuted hover:text-rose-400 rounded-xs hover:bg-ui-hover transition cursor-pointer"
          title="Close Hierarchy Popout (H)"
          @click="closePopout"
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
          >
          <button 
            v-if="searchQuery" 
            class="absolute right-2 text-ui-textMuted hover:text-ui-textPrimary text-[10px] cursor-pointer"
            @click="searchQuery = ''"
          >
            ×
          </button>
        </div>

        <!-- Quick Traversal & Pose Controls -->
        <div class="flex items-center justify-between gap-1 text-[10px]">
          <!-- Parent / Child Traversal Island -->
          <div class="flex items-center gap-0.5 bg-ui-input/70 p-0.5 rounded-xs border border-ui-borderSubtle">
            <button 
              :disabled="!selectedBone || !selectedBone.parentId" 
              class="p-1 text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover rounded-xs transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              title="Select Parent Bone (Up)"
              @click="animationStore.selectParentBone()"
            >
              <ArrowUp class="w-3 h-3" />
            </button>
            <button 
              :disabled="!selectedBone || selectedBone.childrenIds.length === 0" 
              class="p-1 text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover rounded-xs transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              title="Select First Child Bone (Down)"
              @click="animationStore.selectFirstChildBone()"
            >
              <ArrowDown class="w-3 h-3" />
            </button>
            <button 
              class="p-1 text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover rounded-xs transition cursor-pointer" 
              title="Select Previous Bone in Skeleton"
              @click="animationStore.selectPreviousBone()"
            >
              <ArrowLeft class="w-3 h-3" />
            </button>
            <button 
              class="p-1 text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover rounded-xs transition cursor-pointer" 
              title="Select Next Bone in Skeleton"
              @click="animationStore.selectNextBone()"
            >
              <ArrowRight class="w-3 h-3" />
            </button>
          </div>

          <!-- Animation Workspace Tools -->
          <template v-if="toolStore.appMode === 'animate' || animationStore.isTestPoseActive">
            <button 
              :disabled="!selectedBone"
              class="flex-1 py-1 px-1.5 bg-ui-accent hover:bg-ui-accentHover text-white rounded-xs font-semibold flex items-center justify-center gap-1 shadow-xs transition cursor-pointer disabled:opacity-40"
              title="Key Selected Bone (K)"
              @click="handleKeySelected"
            >
              <Key class="w-2.5 h-2.5" />
              <span>Key (K)</span>
            </button>
            <button 
              class="py-1 px-1.5 bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle text-ui-textPrimary rounded-xs font-semibold flex items-center justify-center gap-1 transition cursor-pointer"
              title="Key Entire Skeleton"
              @click="handleKeyAll"
            >
              <span>All</span>
            </button>
            <button 
              class="py-1 px-1.5 bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle text-ui-textSecondary rounded-xs font-semibold flex items-center justify-center gap-1 transition cursor-pointer"
              title="Reset Rest Pose (Alt+R)"
              @click="handleResetPose"
            >
              <RotateCcw class="w-2.5 h-2.5" />
            </button>
            <button 
              class="p-1 bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle text-ui-textSecondary rounded-xs transition cursor-pointer"
              title="Copy Pose"
              @click="handleCopyPose"
            >
              <Copy class="w-2.5 h-2.5" />
            </button>
            <button 
              class="p-1 bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle text-ui-textSecondary rounded-xs transition cursor-pointer"
              title="Paste Pose"
              @click="handlePastePose"
            >
              <Clipboard class="w-2.5 h-2.5" />
            </button>
          </template>

          <!-- Rigging Workspace Setup Tools -->
          <template v-else>
            <button 
              class="flex-1 py-1 px-1.5 bg-ui-accent hover:bg-ui-accentHover text-white rounded-xs font-semibold flex items-center justify-center gap-1 shadow-xs transition cursor-pointer"
              title="Add Center Bone"
              @click="handleAddRoot"
            >
              <Plus class="w-2.5 h-2.5" />
              <span>+ Root</span>
            </button>
            <button 
              class="flex-1 py-1 px-1.5 bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle text-ui-textSecondary hover:text-ui-textPrimary rounded-xs font-semibold flex items-center justify-center gap-1 transition cursor-pointer"
              title="Extrude Child Bone (E)"
              @click="handleExtrude"
            >
              <GitBranch class="w-2.5 h-2.5" />
              <span>Extrude</span>
            </button>
            <button 
              class="py-1 px-1.5 rounded-xs font-semibold flex items-center justify-center gap-1 transition border cursor-pointer"
              :class="animationStore.clickToPlaceMode ? 'bg-ui-active text-ui-textPrimary border-ui-borderStrong' : 'bg-ui-input border-ui-borderSubtle text-ui-textSecondary hover:bg-ui-hover'"
              title="Draw Bone in 3D (B)"
              @click="handleToggleDrawBone"
            >
              <Crosshair class="w-2.5 h-2.5" />
            </button>
            <button 
              class="py-1 px-1.5 bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle text-ui-textSecondary hover:text-ui-textPrimary rounded-xs font-semibold flex items-center justify-center gap-1 transition cursor-pointer"
              title="Mirror Skeleton X"
              @click="handleSymmetrize"
            >
              <FlipHorizontal class="w-2.5 h-2.5" />
            </button>
          </template>
        </div>
      </div>

      <!-- 3. Full Recursive Hierarchy Tree Scroll View -->
      <div class="flex-1 p-1.5 overflow-y-auto space-y-0.5 min-h-[140px] custom-scrollbar">
        <div v-if="animationStore.armature.bones.length === 0" class="py-10 text-center text-ui-textMuted space-y-2">
          <p class="text-[11px]">No bones in skeleton yet.</p>
          <button 
            class="py-1 px-2.5 bg-ui-accent hover:bg-ui-accentHover text-white rounded-xs font-semibold text-[11px] inline-flex items-center gap-1 transition cursor-pointer shadow-xs"
            @click="handleAddRoot"
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
              class="flex items-center justify-between pr-2 py-1 rounded-xs cursor-pointer text-[11px] transition group"
              :style="{ paddingLeft: `${8 + node.depth * 14}px` }"
              :class="animationStore.selectedBoneId === node.bone.id && !animationStore.selectedSocketId ? 'bg-ui-active text-ui-textPrimary font-semibold border border-ui-borderStrong' : 'hover:bg-ui-hover text-ui-textSecondary'"
              @click="selectBone(node.bone.id)"
            >
              <div class="flex items-center gap-1.5 truncate flex-1 min-w-0">
                <!-- Branch Expand / Collapse Toggle -->
                <button 
                  v-if="node.hasChildren"
                  class="p-0.5 text-ui-textMuted hover:text-ui-textPrimary cursor-pointer"
                  @click.stop="toggleBranch(node.bone.id)"
                >
                  <ChevronRight v-if="node.isCollapsed" class="w-3 h-3" />
                  <ChevronDown v-else class="w-3 h-3" />
                </button>
                <span v-else class="w-3 text-ui-borderSubtle text-[9px] text-center font-mono">
                  {{ node.depth > 0 ? '└' : '' }}
                </span>

                <GitCommitVertical 
                  class="w-3.5 h-3.5 shrink-0" 
                  :class="animationStore.selectedBoneId === node.bone.id && !animationStore.selectedSocketId ? 'text-ui-textPrimary' : 'text-ui-textMuted'" 
                />
                
                <input 
                  v-if="editingBoneId === node.bone.id"
                  v-model="editingName"
                  class="bg-ui-input text-ui-textPrimary px-1 py-0.5 rounded-xs text-[11px] w-full border border-ui-accent focus:outline-none"
                  autoFocus
                  @blur="commitRename(node.bone.id)"
                  @keydown.enter="commitRename(node.bone.id)"
                >
                <span 
                  v-else 
                  class="truncate select-none font-mono" 
                  :class="node.isMatching && searchQuery ? 'text-ui-textPrimary font-bold' : ''"
                  :title="node.bone.name + ' (Double-click to rename)'"
                  @dblclick="startRename(node.bone.id, node.bone.name)"
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
                <button class="p-0.5 text-ui-textMuted hover:text-ui-textPrimary cursor-pointer" title="Toggle Visibility" @click.stop="toggleBoneVisibility(node.bone.id)">
                  <EyeOff v-if="hiddenBoneIds.has(node.bone.id)" class="w-3 h-3 text-rose-400" />
                  <Eye v-else class="w-3 h-3" />
                </button>
                <button class="p-0.5 text-ui-textMuted hover:text-ui-textPrimary cursor-pointer" title="Add Socket (+S)" @click.stop="handleAddSocket(node.bone.id)">
                  <Wrench class="w-3 h-3" />
                </button>
                <button class="p-0.5 text-ui-textMuted hover:text-ui-textPrimary cursor-pointer" title="Add Child Bone" @click.stop="handleAddChild(node.bone.id)">
                  <Plus class="w-3 h-3" />
                </button>
                <button class="p-0.5 text-ui-textMuted hover:text-rose-400 cursor-pointer" title="Delete Bone" @click.stop="handleDeleteBone(node.bone.id)">
                  <Trash2 class="w-3 h-3" />
                </button>
              </div>
            </div>

            <!-- Sockets directly under this bone -->
            <div v-show="!node.isCollapsed && node.sockets.length > 0">
              <div 
                v-for="s in node.sockets" 
                :key="s.id" 
                class="flex items-center justify-between pr-2 py-0.5 rounded-xs cursor-pointer text-[10px] transition group"
                :style="{ paddingLeft: `${22 + node.depth * 14}px` }"
                :class="animationStore.selectedSocketId === s.id ? 'bg-ui-active text-ui-textPrimary font-semibold border border-ui-borderStrong' : 'text-ui-textSecondary hover:bg-ui-hover'"
                @click.stop="selectSocket(s.id)"
              >
                <div class="flex items-center gap-1.5 truncate flex-1 min-w-0">
                  <Wrench class="w-2.5 h-2.5 shrink-0" />
                  <input 
                    v-if="editingSocketId === s.id"
                    v-model="editingSocketName"
                    class="bg-ui-input text-ui-textPrimary px-1 py-0.5 rounded-xs text-[10px] w-full border border-ui-accent focus:outline-none"
                    autoFocus
                    @blur="commitSocketRename(node.bone.id, s.id)"
                    @keydown.enter="commitSocketRename(node.bone.id, s.id)"
                  >
                  <span v-else class="truncate select-none font-mono" @dblclick="startSocketRename(s.id, s.name)">
                    [S] {{ s.name }}
                  </span>
                </div>
                <div class="flex items-center gap-1 opacity-60 group-hover:opacity-100">
                  <button class="p-0.5 text-ui-textMuted hover:text-rose-400 cursor-pointer" title="Delete Socket" @click.stop="handleRemoveSocket(node.bone.id, s.id)">
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
      <div v-if="selectedSocket" class="p-2 border-t border-ui-borderSubtle bg-ui-surface space-y-1.5 text-[10px] shrink-0">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1.5 text-ui-textPrimary font-semibold truncate">
            <Wrench class="w-3 h-3 shrink-0" />
            <span class="truncate">Socket: {{ selectedSocket.socket.name }}</span>
            <span class="text-ui-textMuted font-normal">({{ selectedSocket.bone.name }})</span>
          </div>
          <button 
            class="text-ui-textMuted hover:text-rose-400 p-0.5 transition cursor-pointer"
            title="Delete Socket"
            @click="handleRemoveSocket(selectedSocket.bone.id, selectedSocket.socket.id)"
          >
            <Trash2 class="w-3 h-3" />
          </button>
        </div>

        <div class="flex items-center gap-2">
          <div class="flex items-center gap-1 flex-1">
            <span class="text-ui-textMuted">Offset:</span>
            <input v-model.number="selectedSocket.socket.position.x" type="number" step="0.1" class="w-10 bg-ui-input px-1 py-0.5 text-right rounded-xs border border-ui-borderSubtle font-mono text-ui-textPrimary" title="Offset X">
            <input v-model.number="selectedSocket.socket.position.y" type="number" step="0.1" class="w-10 bg-ui-input px-1 py-0.5 text-right rounded-xs border border-ui-borderSubtle font-mono text-ui-textPrimary" title="Offset Y">
            <input v-model.number="selectedSocket.socket.position.z" type="number" step="0.1" class="w-10 bg-ui-input px-1 py-0.5 text-right rounded-xs border border-ui-borderSubtle font-mono text-ui-textPrimary" title="Offset Z">
          </div>
          <button 
            v-if="projectStore.activeMesh"
            class="px-2 py-0.5 bg-ui-accent hover:bg-ui-accentHover text-white rounded-xs font-semibold flex items-center gap-1 transition cursor-pointer shadow-xs"
            :title="'Attach ' + projectStore.activeMesh.name + ' to this socket'"
            @click="handleAttachActiveMeshToSocket(selectedSocket.socket.id)"
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
          <span v-else class="text-ui-textMuted font-semibold">(Root)</span>
        </div>
        <button 
          class="px-1.5 py-0.5 bg-ui-input hover:bg-ui-hover border border-ui-borderSubtle rounded-xs text-[10px] text-ui-textSecondary font-semibold transition cursor-pointer"
          @click="handleAddSocket(selectedBone.id)"
        >
          + Socket
        </button>
      </div>
    </div>

    <!-- Window Resize Handle (Bottom-Right Corner) -->
    <div 
      class="absolute bottom-0 right-0 w-3.5 h-3.5 cursor-nwse-resize z-50 flex items-end justify-end p-0.5 text-ui-textMuted hover:text-ui-textPrimary"
      @mousedown="startResize"
    >
      <div class="w-1.5 h-1.5 border-r-2 border-b-2 border-ui-borderStrong" />
    </div>
  </div>
</template>
