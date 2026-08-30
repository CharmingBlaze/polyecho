<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAnimationStore } from '../../stores/animationStore'
import { useProjectStore } from '../../stores/projectStore'
import BlenderIcon from '../icons/BlenderIcon.vue'
import { 
  Play, 
  Pause, 
  Square,
  Circle,
  Diamond,
  Plus,
  Trash2,
  Copy,
  Film,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  FlipHorizontal,
  SkipBack,
  SkipForward,
  ChevronLeft,
  Maximize2,
  Minimize2,
  Flag,
  TrendingUp,
  FolderTree
} from 'lucide-vue-next'
import { InterpolationType } from '../../types/animation'
import { sampleTrack } from '../../core/animation/Armature'

const animationStore = useAnimationStore()
const projectStore = useProjectStore()

const activeTab = ref<'keyframe' | 'graph' | 'clip'>('keyframe')
const showNewClipModal = ref<boolean>(false)
const newClipName = ref<string>('New_Action')
const expandedTracks = ref<Record<string, boolean>>({})
const showMarkerInput = ref<boolean>(false)
const newMarkerName = ref<string>('Event')

// Graph Editor State
const graphChannel = ref<'rotation' | 'position' | 'scale'>('rotation')
const graphShowX = ref<boolean>(true)
const graphShowY = ref<boolean>(true)
const graphShowZ = ref<boolean>(true)
const selectedGraphKey = ref<{
  targetId: string
  targetType: 'mesh' | 'bone'
  channel: 'position' | 'rotation' | 'scale'
  axis: 'x' | 'y' | 'z'
  frame: number
  value: number
  interpolation: InterpolationType
} | null>(null)

function handleAddMarker() {
  const name = newMarkerName.value.trim() || 'Event'
  animationStore.addMarker(name, animationStore.currentFrame)
  showMarkerInput.value = false
  newMarkerName.value = 'Event'
}

function getMarkersAtFrame(frame: number) {
  return (animationStore.activeClip?.markers || []).filter(m => m.frame === frame)
}

// Timeline Resizing
const timelineHeight = ref<number>(280)
const isResizing = ref<boolean>(false)
let startY = 0
let startHeight = 280

function startResize(e: MouseEvent) {
  isResizing.value = true
  startY = e.clientY
  startHeight = timelineHeight.value

  const onMouseMove = (moveEvent: MouseEvent) => {
    if (!isResizing.value) return
    const deltaY = startY - moveEvent.clientY
    const newH = Math.max(130, Math.min(650, startHeight + deltaY))
    timelineHeight.value = newH
  }

  const onMouseUp = () => {
    isResizing.value = false
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

function toggleExpandPreset() {
  if (timelineHeight.value < 240) {
    timelineHeight.value = 340
  } else if (timelineHeight.value < 400) {
    timelineHeight.value = 480
  } else {
    timelineHeight.value = 180
  }
}

const fps = computed(() => animationStore.activeClip?.fps || 12)
const maxFrames = computed(() => animationStore.activeClip?.durationFrames || 24)

const timeSecondsFormatted = computed({
  get: () => `${(animationStore.currentFrame / fps.value).toFixed(2)} s`,
  set: (val: string) => {
    const num = parseFloat(val)
    if (!isNaN(num)) {
      animationStore.setFrame(Math.round(num * fps.value))
    }
  }
})

const clipDurationSeconds = computed({
  get: () => Number(((animationStore.activeClip?.durationFrames || 24) / fps.value).toFixed(1)),
  set: (sec: number) => {
    if (!animationStore.activeClip) return
    animationStore.setClipDuration(sec)
  }
})

function stepClipDuration(deltaSec: number) {
  if (!animationStore.activeClip) return
  const newSec = Math.max(0.5, Number((clipDurationSeconds.value + deltaSec).toFixed(1)))
  animationStore.setClipDuration(newSec)
}

function setPresetClipDuration(sec: number) {
  if (!animationStore.activeClip) return
  animationStore.setClipDuration(sec)
}

function stepTime(direction: number) {
  const currentSec = animationStore.currentFrame / fps.value
  const newSec = Math.max(0, currentSec + direction * 0.1)
  animationStore.setFrame(Math.round(newSec * fps.value))
}

function stepFrame(delta: number) {
  const newFrame = Math.max(0, Math.min(maxFrames.value, animationStore.currentFrame + delta))
  animationStore.setFrame(newFrame)
}

function toggleTrackExpand(id: string) {
  expandedTracks.value[id] = !expandedTracks.value[id]
}

function selectTrackItem(type: 'mesh' | 'bone', id: string) {
  if (type === 'bone') {
    animationStore.selectBone(id)
  } else {
    projectStore.activeMeshId = id
    projectStore.selectedMeshIds = [id]
    animationStore.selectedBoneId = null
  }
}

function hasAnyKeyframe(targetId: string, frame: number): boolean {
  const track = animationStore.activeClip?.tracks.find(t => t.targetId === targetId)
  if (!track) return false
  return track.rotationKeys.some(k => k.frame === frame) || 
         track.positionKeys.some(k => k.frame === frame) ||
         track.scaleKeys.some(k => k.frame === frame)
}

function hasChannelKeyframe(targetId: string, channel: 'rotation' | 'position' | 'scale', frame: number): boolean {
  const track = animationStore.activeClip?.tracks.find(t => t.targetId === targetId)
  if (!track) return false
  if (channel === 'rotation') return track.rotationKeys.some(k => k.frame === frame)
  if (channel === 'position') return track.positionKeys.some(k => k.frame === frame)
  if (channel === 'scale') return track.scaleKeys.some(k => k.frame === frame)
  return false
}

function handleCellClick(targetId: string, targetType: 'mesh' | 'bone', frame: number) {
  animationStore.setFrame(frame)
  selectTrackItem(targetType, targetId)
}

function toggleCellKeyframe(targetId: string, targetType: 'mesh' | 'bone', frame: number) {
  animationStore.setFrame(frame)
  selectTrackItem(targetType, targetId)

  if (hasAnyKeyframe(targetId, frame)) {
    animationStore.deleteKeyframeAt(targetId, frame)
  } else {
    animationStore.recordCurrentKeyframe()
  }
}

function toggleChannelCellKeyframe(targetId: string, targetType: 'mesh' | 'bone', channel: 'rotation' | 'position' | 'scale', frame: number) {
  animationStore.setFrame(frame)
  selectTrackItem(targetType, targetId)

  if (hasChannelKeyframe(targetId, channel, frame)) {
    animationStore.deleteKeyframeAt(targetId, frame, channel)
  } else {
    animationStore.addChannelKeyframe(targetId, targetType, channel, frame)
  }
}

function handleAddClip() {
  if (!newClipName.value.trim()) return
  animationStore.addClip(newClipName.value.trim(), 24, 12)
  newClipName.value = 'New_Action'
  showNewClipModal.value = false
}

function handleDeleteActiveClip() {
  if (!animationStore.activeClip || animationStore.armature.clips.length <= 1) return
  animationStore.deleteClip(animationStore.activeClip.id)
}

function handleDuplicateActiveClip() {
  if (!animationStore.activeClip) return
  animationStore.duplicateClip(animationStore.activeClip.id)
}

// Flat list of all rig bones
const allRigBones = computed(() => {
  return animationStore.armature.bones
})

// Timeline seconds markers list
const timeMarkers = computed(() => {
  const markers: { frame: number; label: string; isMajor: boolean }[] = []
  for (let i = 0; i <= maxFrames.value; i++) {
    const sec = i / fps.value
    const isMajor = (i % (fps.value / 2)) === 0
    markers.push({
      frame: i,
      label: isMajor ? `${sec.toFixed(1)}s` : '',
      isMajor
    })
  }
  return markers
})

// ----------------------------------------------------
// GRAPH EDITOR COMPUTATIONS
// ----------------------------------------------------
const activeGraphTarget = computed(() => {
  if (animationStore.selectedBoneId) {
    const bone = animationStore.selectedBone
    return bone ? { id: bone.id, type: 'bone' as const, name: bone.name } : null
  } else if (projectStore.activeMesh) {
    const mesh = projectStore.activeMesh
    return { id: mesh.id, type: 'mesh' as const, name: mesh.name }
  }
  return null
})

const activeGraphTrack = computed(() => {
  if (!activeGraphTarget.value || !animationStore.activeClip) return null
  return animationStore.activeClip.tracks.find(t => t.targetId === activeGraphTarget.value!.id) || null
})

const activeGraphKeyframes = computed(() => {
  if (!activeGraphTrack.value) return []
  if (graphChannel.value === 'position') return activeGraphTrack.value.positionKeys
  if (graphChannel.value === 'rotation') return activeGraphTrack.value.rotationKeys
  return activeGraphTrack.value.scaleKeys
})

const graphYRange = computed(() => {
  const keys = activeGraphKeyframes.value
  let min = 0
  let max = 0

  if (graphChannel.value === 'rotation') {
    min = -45
    max = 45
  } else if (graphChannel.value === 'position') {
    min = -1.5
    max = 1.5
  } else {
    min = 0
    max = 2
  }

  for (const k of keys) {
    min = Math.min(min, k.value.x, k.value.y, k.value.z)
    max = Math.max(max, k.value.x, k.value.y, k.value.z)
  }

  const pad = Math.max(0.5, (max - min) * 0.15)
  return {
    min: Number((min - pad).toFixed(2)),
    max: Number((max + pad).toFixed(2))
  }
})

function mapGraphCoords(frame: number, val: number, svgW = 800, svgH = 220) {
  const padL = 45
  const padR = 25
  const padT = 20
  const padB = 30
  const plotW = svgW - padL - padR
  const plotH = svgH - padT - padB

  const duration = Math.max(1, maxFrames.value)
  const normX = Math.max(0, Math.min(1, frame / duration))
  const x = padL + normX * plotW

  const { min, max } = graphYRange.value
  const normY = (val - min) / Math.max(0.001, max - min)
  const y = padT + plotH * (1 - Math.max(0, Math.min(1, normY)))

  return { x, y }
}

const graphSampledCurves = computed(() => {
  if (!activeGraphTrack.value) return { pathX: '', pathY: '', pathZ: '' }

  const totalSteps = maxFrames.value * 2
  let pathX = ''
  let pathY = ''
  let pathZ = ''

  for (let s = 0; s <= totalSteps; s++) {
    const f = (s / totalSteps) * maxFrames.value
    const sample = sampleTrack(activeGraphTrack.value, f)
    const val = sample[graphChannel.value]

    const ptX = mapGraphCoords(f, val.x)
    const ptY = mapGraphCoords(f, val.y)
    const ptZ = mapGraphCoords(f, val.z)

    if (s === 0) {
      pathX += `M ${ptX.x.toFixed(1)} ${ptX.y.toFixed(1)}`
      pathY += `M ${ptY.x.toFixed(1)} ${ptY.y.toFixed(1)}`
      pathZ += `M ${ptZ.x.toFixed(1)} ${ptZ.y.toFixed(1)}`
    } else {
      pathX += ` L ${ptX.x.toFixed(1)} ${ptX.y.toFixed(1)}`
      pathY += ` L ${ptY.x.toFixed(1)} ${ptY.y.toFixed(1)}`
      pathZ += ` L ${ptZ.x.toFixed(1)} ${ptZ.y.toFixed(1)}`
    }
  }

  return { pathX, pathY, pathZ }
})

const graphKeyNodes = computed(() => {
  if (!activeGraphTrack.value) return []
  const keys = activeGraphKeyframes.value
  const target = activeGraphTarget.value
  if (!target) return []

  const nodes: {
    axis: 'x' | 'y' | 'z'
    frame: number
    value: number
    x: number
    y: number
    interpolation: InterpolationType
    color: string
  }[] = []

  for (const k of keys) {
    const interp = (k.interpolation || 'cubic') as InterpolationType
    if (graphShowX.value) {
      const pt = mapGraphCoords(k.frame, k.value.x)
      nodes.push({ axis: 'x', frame: k.frame, value: k.value.x, x: pt.x, y: pt.y, interpolation: interp, color: '#f43f5e' })
    }
    if (graphShowY.value) {
      const pt = mapGraphCoords(k.frame, k.value.y)
      nodes.push({ axis: 'y', frame: k.frame, value: k.value.y, x: pt.x, y: pt.y, interpolation: interp, color: '#10b981' })
    }
    if (graphShowZ.value) {
      const pt = mapGraphCoords(k.frame, k.value.z)
      nodes.push({ axis: 'z', frame: k.frame, value: k.value.z, x: pt.x, y: pt.y, interpolation: interp, color: '#38bdf8' })
    }
  }

  return nodes
})

function selectGraphNode(node: { axis: 'x' | 'y' | 'z'; frame: number; value: number; interpolation: InterpolationType }) {
  if (!activeGraphTarget.value) return
  selectedGraphKey.value = {
    targetId: activeGraphTarget.value.id,
    targetType: activeGraphTarget.value.type,
    channel: graphChannel.value,
    axis: node.axis,
    frame: node.frame,
    value: node.value,
    interpolation: node.interpolation
  }
  animationStore.setFrame(node.frame)
}

function updateGraphKeyVal(val: number) {
  if (!selectedGraphKey.value) return
  selectedGraphKey.value.value = val
  animationStore.updateKeyframeValue(
    selectedGraphKey.value.targetId,
    selectedGraphKey.value.channel,
    selectedGraphKey.value.frame,
    selectedGraphKey.value.axis,
    val
  )
}

function updateGraphKeyInterp(mode: InterpolationType) {
  if (!selectedGraphKey.value) return
  selectedGraphKey.value.interpolation = mode
  animationStore.setKeyframeInterpolation(
    selectedGraphKey.value.targetId,
    selectedGraphKey.value.channel,
    selectedGraphKey.value.frame,
    mode
  )
}

function deleteSelectedGraphNode() {
  if (!selectedGraphKey.value) return
  animationStore.deleteKeyframeAt(
    selectedGraphKey.value.targetId,
    selectedGraphKey.value.frame,
    selectedGraphKey.value.channel
  )
  selectedGraphKey.value = null
}

function handleGraphSvgClick(e: MouseEvent) {
  const svg = (e.currentTarget as SVGElement).getBoundingClientRect()
  const clickX = e.clientX - svg.left
  const padL = 45
  const padR = 25
  const plotW = svg.width - padL - padR
  const ratio = Math.max(0, Math.min(1, (clickX - padL) / plotW))
  const targetFrame = Math.round(ratio * maxFrames.value)
  animationStore.setFrame(targetFrame)
}
</script>

<template>
  <div 
    :style="{ height: timelineHeight + 'px' }"
    class="bg-ui-panel border-t border-ui-borderSubtle flex flex-col select-none text-xs z-30 font-mono text-ui-textPrimary transition-[height] duration-75"
    :class="{ 'transition-none': isResizing }"
  >
    <!-- Top Draggable Resizer Bar (Drag Up/Down to Resize, Double-click to Toggle) -->
    <div 
      @mousedown="startResize"
      @dblclick="toggleExpandPreset"
      class="h-2 w-full bg-ui-header hover:bg-ui-hover border-t border-ui-borderSubtle cursor-ns-resize flex items-center justify-center transition group shrink-0 relative select-none"
      title="Drag up/down to resize timeline height. Double-click to toggle height."
    >
      <div class="w-14 h-1 rounded-full bg-ui-borderDefault group-hover:bg-ui-accent transition"></div>
    </div>

    <!-- Top Tab Header & Action Switcher -->
    <div class="h-8 bg-ui-header border-b border-ui-borderSubtle flex items-center justify-between px-3 text-xs shrink-0">
      <div class="flex items-center space-x-1">
        <button 
          @click="activeTab = 'keyframe'"
          class="px-3 py-1 rounded-xs transition text-[11px]"
          :class="activeTab === 'keyframe' ? 'bg-ui-active text-ui-textAccent font-bold border border-ui-accent/40 shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
        >
          Keyframe Editor
        </button>

        <button 
          @click="activeTab = 'graph'"
          class="px-3 py-1 rounded-xs transition text-[11px] flex items-center gap-1.5"
          :class="activeTab === 'graph' ? 'bg-ui-active text-ui-textAccent font-bold border border-ui-accent/40 shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
        >
          <TrendingUp class="w-3 h-3 text-emerald-500" />
          <span>Graph Curves</span>
        </button>

        <button 
          @click="activeTab = 'clip'"
          class="px-3 py-1 rounded-xs transition text-[11px]"
          :class="activeTab === 'clip' ? 'bg-ui-active text-ui-textAccent font-bold border border-ui-accent/40 shadow-xs' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
        >
          Clip Timeline
        </button>

        <!-- Quick Height Preset Switcher -->
        <button 
          @click="toggleExpandPreset"
          class="p-1 rounded-xs bg-ui-input hover:bg-ui-hover text-ui-textMuted hover:text-ui-textPrimary border border-ui-borderSubtle transition ml-1"
          :title="timelineHeight > 300 ? 'Collapse Timeline Height' : 'Expand Timeline Height'"
        >
          <Minimize2 v-if="timelineHeight > 300" class="w-3 h-3" />
          <Maximize2 v-else class="w-3 h-3" />
        </button>
      </div>

      <!-- Blockbench Pose Quick Tools (Copy, Paste, Flip, Reset) -->
      <div class="flex items-center space-x-1 bg-ui-input px-1.5 py-0.5 rounded-xs border border-ui-borderSubtle text-[10px]">
        <button 
          @click="animationStore.copyPose" 
          class="px-2 py-0.5 rounded-xs hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textPrimary transition flex items-center gap-1"
          title="Copy Pose (Ctrl+C)"
        >
          <Copy class="w-2.5 h-2.5" />
          <span>Copy</span>
        </button>

        <button 
          @click="animationStore.pastePose" 
          class="px-2 py-0.5 rounded-xs hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textPrimary transition flex items-center gap-1"
          title="Paste Pose (Ctrl+V)"
        >
          <span>Paste</span>
        </button>

        <button 
          @click="animationStore.pasteFlippedPose" 
          class="px-2 py-0.5 rounded-xs hover:bg-ui-hover text-ui-textAccent hover:opacity-80 transition flex items-center gap-1"
          title="Paste Flipped (Mirror Left/Right for Walk Cycles)"
        >
          <FlipHorizontal class="w-2.5 h-2.5" />
          <span>Flip (Walk Mirror)</span>
        </button>

        <button 
          @click="animationStore.resetPose" 
          class="px-2 py-0.5 rounded-xs hover:bg-ui-hover text-ui-textMuted hover:text-ui-textPrimary transition flex items-center gap-1"
          title="Reset Pose (Alt+R)"
        >
          <RotateCcw class="w-2.5 h-2.5" />
          <span>Reset</span>
        </button>

        <button 
          @click="animationStore.toggleBoneHierarchyPopout()" 
          class="px-2 py-0.5 rounded-xs hover:bg-ui-hover text-ui-textSecondary hover:text-ui-accent transition flex items-center gap-1 cursor-pointer"
          :class="animationStore.showBoneHierarchyPopout ? 'bg-ui-active text-ui-textAccent font-bold' : ''"
          title="Toggle Floating Bone Hierarchy (H)"
        >
          <FolderTree class="w-2.5 h-2.5 text-ui-accent" />
          <span>Hierarchy (H)</span>
        </button>
      </div>

      <!-- Active Action Selector -->
      <div class="flex items-center space-x-1.5 text-[11px]">
        <span class="text-ui-textMuted">Action:</span>
        <select 
          :value="animationStore.activeClip?.id"
          @change="animationStore.selectClip(($event.target as HTMLSelectElement).value)"
          class="bg-ui-input text-ui-textAccent px-2 py-0.5 rounded-xs border border-ui-borderSubtle font-bold focus:outline-none cursor-pointer"
        >
          <option v-for="c in animationStore.armature.clips" :key="c.id" :value="c.id" class="bg-ui-panel text-ui-textPrimary">
            {{ c.name }} ({{ c.durationFrames }}f)
          </option>
        </select>

        <button 
          @click="showNewClipModal = true" 
          class="p-1 rounded-xs bg-ui-input hover:bg-ui-accent hover:text-white text-ui-textAccent border border-ui-borderSubtle transition" 
          title="Add New Animation"
        >
          <Plus class="w-3 h-3" />
        </button>

        <button 
          @click="handleDuplicateActiveClip" 
          class="p-1 rounded-xs bg-ui-input hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textPrimary border border-ui-borderSubtle transition" 
          title="Duplicate Current Animation"
        >
          <Copy class="w-3 h-3" />
        </button>

        <button 
          v-if="animationStore.armature.clips.length > 1"
          @click="handleDeleteActiveClip" 
          class="p-1 rounded-xs bg-ui-input hover:bg-rose-500/20 text-ui-textMuted hover:text-rose-400 border border-ui-borderSubtle transition" 
          title="Delete Current Animation"
        >
          <Trash2 class="w-3 h-3" />
        </button>
      </div>
    </div>

    <!-- GLB Animator / Blockbench Control Bar -->
    <div class="h-9 bg-ui-panel border-b border-ui-borderSubtle px-3 flex items-center justify-between gap-3 shrink-0 overflow-x-auto text-[11px]">
      <!-- Left: Frame & Time Controls -->
      <div class="flex items-center space-x-2 shrink-0">
        <!-- Frame Navigation Steppers -->
        <div class="flex items-center space-x-0.5 bg-ui-input border border-ui-borderSubtle rounded-xs p-0.5">
          <button @click="animationStore.setFrame(0)" class="p-1 rounded-xs hover:bg-ui-hover text-ui-textMuted hover:text-ui-textPrimary" title="First Frame">
            <SkipBack class="w-3 h-3" />
          </button>
          <button @click="stepFrame(-1)" class="p-1 rounded-xs hover:bg-ui-hover text-ui-textMuted hover:text-ui-textPrimary" title="Prev Frame">
            <ChevronLeft class="w-3 h-3" />
          </button>
          <button 
            @click="animationStore.togglePlay"
            class="px-2 py-0.5 rounded-xs bg-ui-accent hover:bg-ui-accentHover text-white flex items-center justify-center shadow-xs transition"
            title="Play / Pause (Space)"
          >
            <Pause v-if="animationStore.isPlaying" class="w-3 h-3" />
            <Play v-else class="w-3 h-3 fill-current ml-0.5" />
          </button>
          <button @click="stepFrame(1)" class="p-1 rounded-xs hover:bg-ui-hover text-ui-textMuted hover:text-ui-textPrimary" title="Next Frame">
            <ChevronRight class="w-3 h-3" />
          </button>
          <button @click="animationStore.setFrame(maxFrames)" class="p-1 rounded-xs hover:bg-ui-hover text-ui-textMuted hover:text-ui-textPrimary" title="Last Frame">
            <SkipForward class="w-3 h-3" />
          </button>
        </div>

        <!-- Time input scrubber -->
        <div class="flex items-center bg-ui-input border border-ui-borderSubtle rounded-xs px-2 py-0.5 text-ui-textPrimary">
          <span class="text-ui-textMuted mr-1 text-[10px]">Time:</span>
          <input 
            type="text" 
            :value="timeSecondsFormatted"
            @change="timeSecondsFormatted = ($event.target as HTMLInputElement).value"
            class="w-14 bg-transparent font-bold text-center focus:outline-none text-ui-textAccent font-mono"
          />
          <div class="flex flex-col ml-1 border-l border-ui-borderSubtle pl-1 space-y-0.5">
            <button @click="stepTime(1)" class="text-[8px] text-ui-textMuted hover:text-ui-textPrimary leading-none">▲</button>
            <button @click="stepTime(-1)" class="text-[8px] text-ui-textMuted hover:text-ui-textPrimary leading-none">▼</button>
          </div>
        </div>
      </div>

      <!-- Clip Duration / Length Scrubber & Presets -->
      <div class="flex items-center space-x-1.5 shrink-0 border-l border-ui-borderSubtle pl-3">
        <span class="text-ui-textMuted font-bold">Len:</span>
        <div class="flex items-center bg-ui-input border border-ui-borderSubtle rounded-xs px-1.5 py-0.5 text-ui-textPrimary">
          <input 
            type="number" 
            step="0.5"
            min="0.5"
            v-model.number="clipDurationSeconds"
            class="w-10 bg-transparent font-bold text-center focus:outline-none text-ui-textAccent text-xs font-mono"
          />
          <span class="text-ui-textMuted text-[10px] pr-1">s</span>
          <div class="flex flex-col border-l border-ui-borderSubtle pl-1 space-y-0.5">
            <button @click="stepClipDuration(0.5)" class="text-[8px] text-ui-textMuted hover:text-ui-textPrimary leading-none">▲</button>
            <button @click="stepClipDuration(-0.5)" class="text-[8px] text-ui-textMuted hover:text-ui-textPrimary leading-none">▼</button>
          </div>
        </div>

        <div class="flex items-center space-x-0.5">
          <button 
            v-for="sec in [1.0, 2.0, 3.0, 5.0]" 
            :key="sec"
            @click="setPresetClipDuration(sec)"
            class="px-1.5 py-0.5 rounded-xs text-[9px] border transition"
            :class="Math.abs(clipDurationSeconds - sec) < 0.1 ? 'bg-ui-active border-ui-accent/40 text-ui-textAccent font-bold' : 'bg-ui-input border-ui-borderSubtle text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
          >
            {{ sec }}s
          </button>
        </div>
      </div>

      <!-- Interpolation Mode Selectors (Smooth, Linear, Step) -->
      <div class="flex items-center space-x-1 shrink-0 border-l border-ui-borderSubtle pl-3">
        <button 
          @click="animationStore.interpolationMode = 'cubic'"
          class="flex items-center space-x-1 px-2 py-1 rounded-xs transition border text-[10px]"
          :class="animationStore.interpolationMode === 'cubic' ? 'bg-ui-active text-ui-textAccent font-bold border-ui-accent/40 shadow-xs' : 'bg-ui-input text-ui-textMuted border-ui-borderSubtle hover:text-ui-textPrimary hover:bg-ui-hover'"
        >
          <Circle class="w-2.5 h-2.5 fill-current" />
          <span>Smooth</span>
        </button>

        <button 
          @click="animationStore.interpolationMode = 'linear'"
          class="flex items-center space-x-1 px-2 py-1 rounded-xs transition border text-[10px]"
          :class="animationStore.interpolationMode === 'linear' ? 'bg-ui-active text-ui-textAccent font-bold border-ui-accent/40 shadow-xs' : 'bg-ui-input text-ui-textMuted border-ui-borderSubtle hover:text-ui-textPrimary hover:bg-ui-hover'"
        >
          <Diamond class="w-2.5 h-2.5 fill-current" />
          <span>Linear</span>
        </button>

        <button 
          @click="animationStore.interpolationMode = 'step'"
          class="flex items-center space-x-1 px-2 py-1 rounded-xs transition border text-[10px]"
          :class="animationStore.interpolationMode === 'step' ? 'bg-ui-active text-ui-textAccent font-bold border-ui-accent/40 shadow-xs' : 'bg-ui-input text-ui-textMuted border-ui-borderSubtle hover:text-ui-textPrimary hover:bg-ui-hover'"
        >
          <Square class="w-2.5 h-2.5 fill-current" />
          <span>Step</span>
        </button>
      </div>

      <!-- Auto Key Toggle -->
      <div class="flex items-center space-x-1 shrink-0 border-l border-ui-borderSubtle pl-3">
        <button 
          @click="animationStore.autoKey = !animationStore.autoKey" 
          class="flex items-center space-x-1 px-2 py-1 rounded-xs transition text-[10px] border"
          :class="animationStore.autoKey ? 'bg-rose-500/20 text-rose-500 border-rose-500/50 shadow-xs font-bold' : 'bg-ui-input text-ui-textMuted border-ui-borderSubtle hover:text-ui-textPrimary hover:bg-ui-hover'"
          title="Auto Keyframing (Automatically records keyframes upon transform)"
        >
          <span class="w-1.5 h-1.5 rounded-full" :class="animationStore.autoKey ? 'bg-rose-500 animate-pulse' : 'bg-ui-textMuted'"></span>
          <span>Auto Key</span>
        </button>

        <!-- Add Event Marker Button -->
        <div class="relative">
          <button 
            @click="showMarkerInput = !showMarkerInput"
            class="flex items-center space-x-1 px-2 py-1 rounded-xs bg-ui-input hover:bg-ui-hover text-ui-textAccent border border-ui-borderSubtle transition text-[10px]"
            title="Add Game Event Marker at Active Frame"
          >
            <Flag class="w-2.5 h-2.5" />
            <span>+ Event</span>
          </button>

          <!-- Marker Input Popover -->
          <div v-if="showMarkerInput" class="absolute left-0 top-8 bg-ui-panel border border-ui-borderStrong p-2 rounded-xs shadow-xl z-50 flex items-center space-x-1.5 w-48">
            <input 
              v-model="newMarkerName" 
              placeholder="Event Name (e.g. Footstep)"
              class="w-full bg-ui-input border border-ui-borderSubtle rounded-xs px-1.5 py-0.5 text-xs text-ui-textPrimary focus:outline-none focus:border-ui-accent"
              @keydown.enter="handleAddMarker"
            />
            <button @click="handleAddMarker" class="px-2 py-0.5 rounded-xs bg-ui-accent hover:bg-ui-accentHover text-white font-bold text-[10px]">
              Add
            </button>
          </div>
        </div>
      </div>

      <!-- Keyframe REC & Clear Buttons -->
      <div class="flex items-center space-x-1.5 shrink-0 border-l border-ui-borderSubtle pl-3">
        <button 
          @click="animationStore.recordAllBonesKeyframe()"
          class="flex items-center space-x-1.5 px-3 py-1 rounded-xs bg-rose-600 hover:bg-rose-500 text-white font-bold shadow-xs transition border border-rose-400/30 active:scale-95 text-[10px]"
          title="Record Keyframe for All Bones at Active Time"
        >
          <span class="w-2 h-2 rounded-full bg-white animate-pulse"></span>
          <span>REC</span>
        </button>

        <button 
          @click="animationStore.clearKeyframeAtCurrentTime()"
          class="px-2 py-1 rounded-xs bg-ui-input hover:bg-ui-hover text-ui-textSecondary hover:text-ui-textPrimary border border-ui-borderSubtle transition text-[10px]"
          title="Clear Keyframes at Active Time"
        >
          Clear
        </button>
      </div>

      <!-- Live Recorded Status Text Banner (Right) -->
      <div class="text-[10px] text-ui-textMuted font-mono italic shrink-0 text-right truncate max-w-xs">
        {{ animationStore.recordedStatusMessage }}
      </div>
    </div>

    <!-- VIEW 1: KEYFRAME EDITOR (Blockbench Expandable Dope Sheet Matrix) -->
    <div v-show="activeTab === 'keyframe'" class="flex-1 overflow-x-auto overflow-y-auto bg-ui-root relative min-h-0 flex flex-col">
      <!-- Time Ruler Row -->
      <div class="h-6 bg-ui-header border-b border-ui-borderSubtle flex items-center pl-44 sticky top-0 z-20 shrink-0">
        <div 
          v-for="marker in timeMarkers" 
          :key="marker.frame"
          @click="animationStore.setFrame(marker.frame)"
          class="w-7 text-center font-mono text-[9px] cursor-pointer shrink-0 border-r border-ui-borderSubtle relative"
          :class="animationStore.currentFrame === marker.frame ? 'text-ui-textAccent font-bold bg-ui-active' : 'text-ui-textMuted hover:text-ui-textPrimary'"
        >
          <span>{{ marker.label }}</span>
          <!-- Event Marker Tag indicator -->
          <div 
            v-for="ev in getMarkersAtFrame(marker.frame)" 
            :key="ev.id"
            @click.stop="animationStore.deleteMarker(ev.id)"
            class="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-cyan-400 cursor-pointer shadow-[0_0_5px_rgba(6,182,212,0.8)]"
            :title="`Event: ${ev.name} (Click to remove)`"
          ></div>
        </div>
      </div>

      <!-- Vertical Red Playhead Indicator -->
      <div 
        class="absolute top-0 bottom-0 w-0.5 bg-rose-500 pointer-events-none z-10 shadow-[0_0_8px_rgba(244,63,94,0.8)]"
        :style="{ left: `${176 + animationStore.currentFrame * 28 + 14}px` }"
      ></div>

      <!-- Dope Sheet Rows (Expandable Blockbench Channel Tracks) -->
      <div class="divide-y divide-ui-borderSubtle">
        <!-- 1. Armature Bones Tracks -->
        <template v-for="bone in allRigBones" :key="bone.id">
          <!-- Main Bone Row -->
          <div 
            @click="selectTrackItem('bone', bone.id)"
            class="h-6 flex items-center hover:bg-ui-hover/60 cursor-pointer shrink-0 transition"
            :class="{ 'bg-ui-active': animationStore.selectedBoneId === bone.id }"
          >
            <!-- Expand Chevron + Name -->
            <div class="w-44 px-2 truncate text-ui-textPrimary font-mono text-[10px] font-medium flex items-center justify-between gap-1.5 shrink-0 bg-ui-panel border-r border-ui-borderSubtle h-full sticky left-0 z-10">
              <div class="flex items-center space-x-1 truncate">
                <button @click.stop="toggleTrackExpand(bone.id)" class="text-ui-textMuted hover:text-ui-textPrimary p-0.5">
                  <ChevronDown v-if="expandedTracks[bone.id]" class="w-3 h-3 text-ui-textAccent" />
                  <ChevronRight v-else class="w-3 h-3 text-ui-textMuted" />
                </button>
                <BlenderIcon name="bone" :size="11" color="#a855f7" />
                <span class="truncate">{{ bone.name }}</span>
              </div>

              <!-- Quick 1-Click Keyframe All Channels Button -->
              <button 
                @click.stop="animationStore.recordCurrentKeyframe()" 
                class="text-[9px] text-ui-textMuted hover:text-ui-textAccent font-bold px-1 rounded-xs hover:bg-ui-hover"
                title="Keyframe All Channels"
              >
                +Key
              </button>
            </div>

            <!-- Keyframe Diamond Grid -->
            <div class="flex items-center shrink-0">
              <div 
                v-for="m in timeMarkers" 
                :key="m.frame"
                @click.stop="handleCellClick(bone.id, 'bone', m.frame)"
                @dblclick.stop="toggleCellKeyframe(bone.id, 'bone', m.frame)"
                class="w-7 h-6 flex items-center justify-center border-r border-ui-borderSubtle hover:bg-ui-hover/40 shrink-0 relative"
              >
                <div 
                  v-if="hasAnyKeyframe(bone.id, m.frame)"
                  class="w-2.5 h-2.5 rotate-45 bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.9)] border border-amber-200 rounded-xs"
                  title="Keyframe"
                ></div>
              </div>
            </div>
          </div>

          <!-- Expanded Blockbench Channels (Rotation, Position, Scale) -->
          <template v-if="expandedTracks[bone.id]">
            <!-- Rotation Channel -->
            <div class="h-5 flex items-center bg-ui-surface/90 hover:bg-ui-hover/40 text-[9px] shrink-0 border-b border-ui-borderSubtle">
              <div class="w-44 pl-6 pr-2 truncate text-purple-400 flex items-center justify-between shrink-0 bg-ui-panel/80 border-r border-ui-borderSubtle h-full sticky left-0 z-10">
                <span class="flex items-center gap-1">
                  <span class="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                  <span>Rotation (Deg)</span>
                </span>
                <button 
                  @click.stop="animationStore.addChannelKeyframe(bone.id, 'bone', 'rotation')" 
                  class="text-[8px] text-purple-400 hover:text-ui-textPrimary px-1 rounded-xs hover:bg-purple-900/40"
                  title="Keyframe Rotation Only"
                >
                  +Rot
                </button>
              </div>

              <div class="flex items-center shrink-0">
                <div 
                  v-for="m in timeMarkers" 
                  :key="m.frame"
                  @click.stop="handleCellClick(bone.id, 'bone', m.frame)"
                  @dblclick.stop="toggleChannelCellKeyframe(bone.id, 'bone', 'rotation', m.frame)"
                  class="w-7 h-5 flex items-center justify-center border-r border-ui-borderSubtle hover:bg-purple-900/20 shrink-0 relative"
                >
                  <div 
                    v-if="hasChannelKeyframe(bone.id, 'rotation', m.frame)"
                    class="w-2 h-2 rotate-45 bg-purple-400 border border-purple-200 rounded-xs shadow-xs"
                  ></div>
                </div>
              </div>
            </div>

            <!-- Position Channel -->
            <div class="h-5 flex items-center bg-ui-surface/90 hover:bg-ui-hover/40 text-[9px] shrink-0 border-b border-ui-borderSubtle">
              <div class="w-44 pl-6 pr-2 truncate text-sky-400 flex items-center justify-between shrink-0 bg-ui-panel/80 border-r border-ui-borderSubtle h-full sticky left-0 z-10">
                <span class="flex items-center gap-1">
                  <span class="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
                  <span>Position</span>
                </span>
                <button 
                  @click.stop="animationStore.addChannelKeyframe(bone.id, 'bone', 'position')" 
                  class="text-[8px] text-sky-400 hover:text-ui-textPrimary px-1 rounded-xs hover:bg-sky-900/40"
                  title="Keyframe Position Only"
                >
                  +Pos
                </button>
              </div>

              <div class="flex items-center shrink-0">
                <div 
                  v-for="m in timeMarkers" 
                  :key="m.frame"
                  @click.stop="handleCellClick(bone.id, 'bone', m.frame)"
                  @dblclick.stop="toggleChannelCellKeyframe(bone.id, 'bone', 'position', m.frame)"
                  class="w-7 h-5 flex items-center justify-center border-r border-ui-borderSubtle hover:bg-sky-900/20 shrink-0 relative"
                >
                  <div 
                    v-if="hasChannelKeyframe(bone.id, 'position', m.frame)"
                    class="w-2 h-2 rotate-45 bg-sky-400 border border-sky-200 rounded-xs shadow-xs"
                  ></div>
                </div>
              </div>
            </div>

            <!-- Scale Channel -->
            <div class="h-5 flex items-center bg-ui-surface/90 hover:bg-ui-hover/40 text-[9px] shrink-0 border-b border-ui-borderSubtle">
              <div class="w-44 pl-6 pr-2 truncate text-emerald-400 flex items-center justify-between shrink-0 bg-ui-panel/80 border-r border-ui-borderSubtle h-full sticky left-0 z-10">
                <span class="flex items-center gap-1">
                  <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  <span>Scale</span>
                </span>
                <button 
                  @click.stop="animationStore.addChannelKeyframe(bone.id, 'bone', 'scale')" 
                  class="text-[8px] text-emerald-400 hover:text-ui-textPrimary px-1 rounded-xs hover:bg-emerald-900/40"
                  title="Keyframe Scale Only"
                >
                  +Scl
                </button>
              </div>

              <div class="flex items-center shrink-0">
                <div 
                  v-for="m in timeMarkers" 
                  :key="m.frame"
                  @click.stop="handleCellClick(bone.id, 'bone', m.frame)"
                  @dblclick.stop="toggleChannelCellKeyframe(bone.id, 'bone', 'scale', m.frame)"
                  class="w-7 h-5 flex items-center justify-center border-r border-ui-borderSubtle hover:bg-emerald-900/20 shrink-0 relative"
                >
                  <div 
                    v-if="hasChannelKeyframe(bone.id, 'scale', m.frame)"
                    class="w-2 h-2 rotate-45 bg-emerald-400 border border-emerald-200 rounded-xs shadow-xs"
                  ></div>
                </div>
              </div>
            </div>
          </template>
        </template>

        <!-- 2. Scene Meshes Tracks -->
        <template v-for="mesh in projectStore.meshes" :key="mesh.id">
          <div 
            @click="selectTrackItem('mesh', mesh.id)"
            class="h-6 flex items-center hover:bg-ui-hover/60 cursor-pointer shrink-0 transition"
            :class="{ 'bg-ui-active': projectStore.activeMeshId === mesh.id && !animationStore.selectedBoneId }"
          >
            <div class="w-44 px-2 truncate text-ui-textPrimary font-mono text-[10px] font-medium flex items-center justify-between gap-1.5 shrink-0 bg-ui-panel border-r border-ui-borderSubtle h-full sticky left-0 z-10">
              <div class="flex items-center space-x-1 truncate">
                <button @click.stop="toggleTrackExpand(mesh.id)" class="text-ui-textMuted hover:text-ui-textPrimary p-0.5">
                  <ChevronDown v-if="expandedTracks[mesh.id]" class="w-3 h-3 text-ui-textAccent" />
                  <ChevronRight v-else class="w-3 h-3 text-ui-textMuted" />
                </button>
                <BlenderIcon name="mesh-cube" :size="11" color="#38bdf8" />
                <span class="truncate">{{ mesh.name }}</span>
              </div>

              <button 
                @click.stop="animationStore.recordCurrentKeyframe()" 
                class="text-[9px] text-ui-textMuted hover:text-ui-textAccent font-bold px-1 rounded-xs hover:bg-ui-hover"
                title="Keyframe All Channels"
              >
                +Key
              </button>
            </div>

            <div class="flex items-center shrink-0">
              <div 
                v-for="m in timeMarkers" 
                :key="m.frame"
                @click.stop="handleCellClick(mesh.id, 'mesh', m.frame)"
                @dblclick.stop="toggleCellKeyframe(mesh.id, 'mesh', m.frame)"
                class="w-7 h-6 flex items-center justify-center border-r border-ui-borderSubtle hover:bg-ui-hover/40 shrink-0 relative"
              >
                <div 
                  v-if="hasAnyKeyframe(mesh.id, m.frame)"
                  class="w-2.5 h-2.5 rotate-45 bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.9)] border border-amber-200 rounded-xs"
                  title="Keyframe"
                ></div>
              </div>
            </div>
          </div>

          <!-- Expanded Channels for Mesh -->
          <template v-if="expandedTracks[mesh.id]">
            <div class="h-5 flex items-center bg-ui-surface/90 hover:bg-ui-hover/40 text-[9px] shrink-0 border-b border-ui-borderSubtle">
              <div class="w-44 pl-6 pr-2 truncate text-purple-400 flex items-center justify-between shrink-0 bg-ui-panel/80 border-r border-ui-borderSubtle h-full sticky left-0 z-10">
                <span class="flex items-center gap-1">
                  <span class="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                  <span>Rotation</span>
                </span>
                <button 
                  @click.stop="animationStore.addChannelKeyframe(mesh.id, 'mesh', 'rotation')" 
                  class="text-[8px] text-purple-400 hover:text-ui-textPrimary px-1 rounded-xs hover:bg-purple-900/40"
                >
                  +Rot
                </button>
              </div>

              <div class="flex items-center shrink-0">
                <div 
                  v-for="m in timeMarkers" 
                  :key="m.frame"
                  @click.stop="handleCellClick(mesh.id, 'mesh', m.frame)"
                  @dblclick.stop="toggleChannelCellKeyframe(mesh.id, 'mesh', 'rotation', m.frame)"
                  class="w-7 h-5 flex items-center justify-center border-r border-ui-borderSubtle hover:bg-purple-900/20 shrink-0 relative"
                >
                  <div 
                    v-if="hasChannelKeyframe(mesh.id, 'rotation', m.frame)"
                    class="w-2 h-2 rotate-45 bg-purple-400 border border-purple-200 rounded-xs shadow-xs"
                  ></div>
                </div>
              </div>
            </div>

            <div class="h-5 flex items-center bg-ui-surface/90 hover:bg-ui-hover/40 text-[9px] shrink-0 border-b border-ui-borderSubtle">
              <div class="w-44 pl-6 pr-2 truncate text-sky-400 flex items-center justify-between shrink-0 bg-ui-panel/80 border-r border-ui-borderSubtle h-full sticky left-0 z-10">
                <span class="flex items-center gap-1">
                  <span class="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
                  <span>Position</span>
                </span>
                <button 
                  @click.stop="animationStore.addChannelKeyframe(mesh.id, 'mesh', 'position')" 
                  class="text-[8px] text-sky-400 hover:text-ui-textPrimary px-1 rounded-xs hover:bg-sky-900/40"
                >
                  +Pos
                </button>
              </div>

              <div class="flex items-center shrink-0">
                <div 
                  v-for="m in timeMarkers" 
                  :key="m.frame"
                  @click.stop="handleCellClick(mesh.id, 'mesh', m.frame)"
                  @dblclick.stop="toggleChannelCellKeyframe(mesh.id, 'mesh', 'position', m.frame)"
                  class="w-7 h-5 flex items-center justify-center border-r border-ui-borderSubtle hover:bg-sky-900/20 shrink-0 relative"
                >
                  <div 
                    v-if="hasChannelKeyframe(mesh.id, 'position', m.frame)"
                    class="w-2 h-2 rotate-45 bg-sky-400 border border-sky-200 rounded-xs shadow-xs"
                  ></div>
                </div>
              </div>
            </div>
          </template>
        </template>
      </div>
    </div>

    <!-- VIEW 2: GRAPH EDITOR / CURVE EDITOR -->
    <div v-show="activeTab === 'graph'" class="flex-1 flex flex-col bg-ui-root overflow-hidden font-mono">
      <!-- Graph Top Controls Bar -->
      <div class="h-8 bg-ui-header border-b border-ui-borderSubtle px-3 flex items-center justify-between gap-3 shrink-0 text-xs">
        <!-- Target & Channel Switcher -->
        <div class="flex items-center space-x-2">
          <span class="text-ui-textMuted font-bold text-[10px] uppercase">Target:</span>
          <span class="text-ui-textAccent font-bold text-[11px]">{{ activeGraphTarget?.name || 'No Target Selected' }}</span>

          <div class="h-4 w-px bg-ui-borderSubtle mx-1"></div>

          <!-- Channel buttons: Rot / Pos / Scale -->
          <div class="flex items-center space-x-0.5 bg-ui-input border border-ui-borderSubtle rounded-xs p-0.5 text-[10px]">
            <button 
              @click="graphChannel = 'rotation'" 
              class="px-2 py-0.5 rounded-xs transition"
              :class="graphChannel === 'rotation' ? 'bg-purple-600 text-white font-bold' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
            >
              Rotation (°)
            </button>
            <button 
              @click="graphChannel = 'position'" 
              class="px-2 py-0.5 rounded-xs transition"
              :class="graphChannel === 'position' ? 'bg-sky-600 text-white font-bold' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
            >
              Position
            </button>
            <button 
              @click="graphChannel = 'scale'" 
              class="px-2 py-0.5 rounded-xs transition"
              :class="graphChannel === 'scale' ? 'bg-emerald-600 text-white font-bold' : 'text-ui-textMuted hover:text-ui-textPrimary hover:bg-ui-hover'"
            >
              Scale
            </button>
          </div>

          <!-- Axis Visibility Toggles -->
          <div class="flex items-center space-x-1 ml-2 text-[10px]">
            <button 
              @click="graphShowX = !graphShowX" 
              class="px-1.5 py-0.5 rounded-xs flex items-center gap-1 border transition"
              :class="graphShowX ? 'bg-rose-500/20 text-rose-500 border-rose-500/50' : 'bg-ui-input text-ui-textMuted border-ui-borderSubtle hover:bg-ui-hover'"
            >
              <span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
              <span>X</span>
            </button>
            <button 
              @click="graphShowY = !graphShowY" 
              class="px-1.5 py-0.5 rounded-xs flex items-center gap-1 border transition"
              :class="graphShowY ? 'bg-emerald-500/20 text-emerald-500 border-emerald-500/50' : 'bg-ui-input text-ui-textMuted border-ui-borderSubtle hover:bg-ui-hover'"
            >
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              <span>Y</span>
            </button>
            <button 
              @click="graphShowZ = !graphShowZ" 
              class="px-1.5 py-0.5 rounded-xs flex items-center gap-1 border transition"
              :class="graphShowZ ? 'bg-sky-500/20 text-sky-500 border-sky-500/50' : 'bg-ui-input text-ui-textMuted border-ui-borderSubtle hover:bg-ui-hover'"
            >
              <span class="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
              <span>Z</span>
            </button>
          </div>
        </div>

        <!-- Selected Key Info / Controls -->
        <div v-if="selectedGraphKey" class="flex items-center space-x-2 text-[10px] bg-ui-input px-2 py-0.5 rounded-xs border border-ui-borderSubtle">
          <span class="text-ui-textAccent font-bold uppercase">{{ selectedGraphKey.axis.toUpperCase() }} Frame {{ selectedGraphKey.frame }}:</span>
          <div class="flex items-center gap-1">
            <span class="text-ui-textMuted">Val:</span>
            <input 
              type="number" 
              step="0.1"
              :value="selectedGraphKey.value"
              @input="updateGraphKeyVal(parseFloat(($event.target as HTMLInputElement).value) || 0)"
              class="w-14 bg-ui-panel border border-ui-borderDefault px-1 py-0.5 rounded-xs text-ui-textPrimary text-[10px] font-mono"
            />
          </div>

          <div class="flex items-center space-x-0.5 border border-ui-borderDefault rounded-xs p-0.5">
            <button 
              @click="updateGraphKeyInterp('step')"
              class="px-1.5 py-0.5 rounded-xs text-[9px]"
              :class="selectedGraphKey.interpolation === 'step' ? 'bg-amber-600 text-white font-bold' : 'text-ui-textMuted hover:text-ui-textPrimary'"
            >
              Step
            </button>
            <button 
              @click="updateGraphKeyInterp('linear')"
              class="px-1.5 py-0.5 rounded-xs text-[9px]"
              :class="selectedGraphKey.interpolation === 'linear' ? 'bg-amber-600 text-white font-bold' : 'text-ui-textMuted hover:text-ui-textPrimary'"
            >
              Linear
            </button>
            <button 
              @click="updateGraphKeyInterp('cubic')"
              class="px-1.5 py-0.5 rounded-xs text-[9px]"
              :class="selectedGraphKey.interpolation === 'cubic' ? 'bg-amber-600 text-white font-bold' : 'text-ui-textMuted hover:text-ui-textPrimary'"
            >
              Cubic Smooth
            </button>
          </div>

          <button 
            @click="deleteSelectedGraphNode" 
            class="text-rose-500 hover:text-white p-1 hover:bg-rose-900/40 rounded-xs"
            title="Delete Selected Key"
          >
            <Trash2 class="w-3 h-3" />
          </button>
        </div>
        <div v-else class="text-[10px] text-ui-textMuted italic">
          Click any key point on curve to edit value / easing
        </div>
      </div>

      <!-- Main SVG Graph Viewport -->
      <div class="flex-1 relative bg-ui-root overflow-hidden flex flex-col justify-center">
        <svg 
          viewBox="0 0 800 220" 
          preserveAspectRatio="none"
          class="w-full h-full cursor-crosshair select-none"
          @click="handleGraphSvgClick"
        >
          <!-- Grid Lines (Horizontal values) -->
          <line x1="45" y1="20" x2="775" y2="20" stroke="currentColor" class="text-ui-borderSubtle opacity-40" stroke-dasharray="3 3" stroke-width="1" />
          <line x1="45" y1="115" x2="775" y2="115" stroke="currentColor" class="text-ui-borderSubtle opacity-60" stroke-width="1" />
          <line x1="45" y1="210" x2="775" y2="210" stroke="currentColor" class="text-ui-borderSubtle opacity-40" stroke-dasharray="3 3" stroke-width="1" />

          <!-- Value Axis Labels -->
          <text x="5" y="24" fill="currentColor" class="text-ui-textMuted" font-size="9" font-family="monospace">{{ graphYRange.max }}</text>
          <text x="5" y="118" fill="currentColor" class="text-ui-textSecondary" font-size="9" font-family="monospace">0.0</text>
          <text x="5" y="214" fill="currentColor" class="text-ui-textMuted" font-size="9" font-family="monospace">{{ graphYRange.min }}</text>

          <!-- Frame Vertical Grid Lines & Frame Labels -->
          <g v-for="m in timeMarkers" :key="m.frame">
            <line 
              v-if="m.isMajor || m.frame === 0 || m.frame === maxFrames"
              :x1="mapGraphCoords(m.frame, 0).x" 
              y1="10" 
              :x2="mapGraphCoords(m.frame, 0).x" 
              y2="215" 
              stroke="currentColor" 
              class="text-ui-borderSubtle opacity-30"
              stroke-width="1" 
            />
            <text 
              v-if="m.isMajor || m.frame === 0 || m.frame === maxFrames"
              :x="mapGraphCoords(m.frame, 0).x" 
              y="218" 
              fill="currentColor" 
              class="text-ui-textMuted"
              font-size="8" 
              text-anchor="middle"
              font-family="monospace"
            >
              {{ m.frame }}f
            </text>
          </g>

          <!-- Spline Curves -->
          <path 
            v-if="graphShowX && graphSampledCurves.pathX" 
            :d="graphSampledCurves.pathX" 
            stroke="#f43f5e" 
            stroke-width="2" 
            fill="none" 
            class="transition-all duration-75"
          />
          <path 
            v-if="graphShowY && graphSampledCurves.pathY" 
            :d="graphSampledCurves.pathY" 
            stroke="#10b981" 
            stroke-width="2" 
            fill="none" 
            class="transition-all duration-75"
          />
          <path 
            v-if="graphShowZ && graphSampledCurves.pathZ" 
            :d="graphSampledCurves.pathZ" 
            stroke="#38bdf8" 
            stroke-width="2" 
            fill="none" 
            class="transition-all duration-75"
          />

          <!-- Keyframe Nodes / Control Points -->
          <g v-for="(node, idx) in graphKeyNodes" :key="idx">
            <circle 
              :cx="node.x" 
              :cy="node.y" 
              r="4.5" 
              :fill="node.color" 
              stroke="#0f172a" 
              stroke-width="1.5"
              class="cursor-pointer hover:r-6 hover:stroke-white transition-all"
              :class="{ 'stroke-white stroke-[2.5] ring-2': selectedGraphKey?.frame === node.frame && selectedGraphKey?.axis === node.axis }"
              @click.stop="selectGraphNode(node)"
            >
              <title>{{ node.axis.toUpperCase() }}: {{ node.value.toFixed(2) }} at {{ node.frame }}f ({{ node.interpolation }})</title>
            </circle>
          </g>

          <!-- Scrubber Playhead Line -->
          <line 
            :x1="mapGraphCoords(animationStore.currentFrame, 0).x" 
            y1="5" 
            :x2="mapGraphCoords(animationStore.currentFrame, 0).x" 
            y2="215" 
            stroke="#e11d48" 
            stroke-width="1.5" 
          />
          <polygon 
            :points="`${mapGraphCoords(animationStore.currentFrame, 0).x - 4},5 ${mapGraphCoords(animationStore.currentFrame, 0).x + 4},5 ${mapGraphCoords(animationStore.currentFrame, 0).x},12`" 
            fill="#e11d48" 
          />
        </svg>
      </div>
    </div>

    <!-- VIEW 3: CLIP TIMELINE (Clips Strip Manager) -->
    <div v-show="activeTab === 'clip'" class="flex-1 p-3 overflow-y-auto bg-ui-root space-y-2">
      <div class="flex items-center justify-between pb-1 border-b border-ui-borderSubtle">
        <span class="text-[11px] font-bold text-ui-textPrimary uppercase tracking-wider">Animation Clips Strip</span>
        <button 
          @click="showNewClipModal = true"
          class="px-2.5 py-1 rounded-xs bg-ui-accent hover:bg-ui-accentHover text-white font-bold text-[10px] flex items-center space-x-1 transition"
        >
          <Plus class="w-3 h-3" />
          <span>+ Add Animation</span>
        </button>
      </div>

      <div class="grid grid-cols-3 gap-2 pt-1">
        <div 
          v-for="clip in animationStore.armature.clips" 
          :key="clip.id"
          @click="animationStore.selectClip(clip.id)"
          class="p-2.5 rounded-xs bg-ui-surface border transition cursor-pointer flex flex-col space-y-2"
          :class="animationStore.activeClip?.id === clip.id ? 'border-ui-accent shadow-md ring-1 ring-ui-accent bg-ui-active' : 'border-ui-borderSubtle hover:border-ui-borderDefault'"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-1.5 truncate">
              <Film class="w-3.5 h-3.5 text-ui-textAccent" />
              <span class="font-bold text-ui-textPrimary truncate">{{ clip.name }}</span>
            </div>

            <div class="flex items-center space-x-1" @click.stop>
              <button @click="animationStore.duplicateClip(clip.id)" class="text-ui-textMuted hover:text-ui-textPrimary p-1" title="Duplicate">
                <Copy class="w-3 h-3" />
              </button>
              <button 
                v-if="animationStore.armature.clips.length > 1" 
                @click="animationStore.deleteClip(clip.id)" 
                class="text-ui-textMuted hover:text-rose-400 p-1" 
                title="Delete"
              >
                <Trash2 class="w-3 h-3" />
              </button>
            </div>
          </div>

          <div class="flex items-center justify-between text-[10px] text-ui-textMuted pt-1 border-t border-ui-borderSubtle">
            <span>{{ clip.durationFrames }} frames ({{ (clip.durationFrames / clip.fps).toFixed(1) }}s)</span>
            <span :class="clip.loop ? 'text-emerald-500 font-medium' : 'text-ui-textMuted'">{{ clip.loop ? 'Looping' : 'Once' }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- New Clip Modal -->
    <div 
      v-if="showNewClipModal"
      class="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
      @click.self="showNewClipModal = false"
    >
      <div class="bg-ui-panel border border-ui-borderStrong rounded-xs shadow-2xl p-4 w-80 space-y-3 font-mono">
        <h3 class="font-bold text-ui-textPrimary text-xs uppercase">New Animation Clip</h3>
        <input 
          v-model="newClipName" 
          placeholder="e.g. Run_Cycle"
          class="w-full bg-ui-input border border-ui-borderDefault text-ui-textPrimary px-2.5 py-1 rounded-xs text-xs focus:outline-none focus:border-ui-accent"
          autoFocus
          @keydown.enter="handleAddClip"
        />
        <div class="flex items-center justify-end space-x-2 pt-1">
          <button 
            @click="showNewClipModal = false"
            class="px-2.5 py-1 rounded-xs bg-ui-input text-ui-textMuted text-xs hover:text-ui-textPrimary hover:bg-ui-hover border border-ui-borderSubtle"
          >
            Cancel
          </button>
          <button 
            @click="handleAddClip"
            class="px-3 py-1 rounded-xs bg-ui-accent text-white text-xs font-bold hover:bg-ui-accentHover shadow transition"
          >
            Create Clip
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
