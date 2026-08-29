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
  Flag
} from 'lucide-vue-next'

const animationStore = useAnimationStore()
const projectStore = useProjectStore()

const activeTab = ref<'keyframe' | 'clip'>('keyframe')
const showNewClipModal = ref<boolean>(false)
const newClipName = ref<string>('New_Action')
const expandedTracks = ref<Record<string, boolean>>({})
const showMarkerInput = ref<boolean>(false)
const newMarkerName = ref<string>('Event')

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
</script>

<template>
  <div 
    :style="{ height: timelineHeight + 'px' }"
    class="bg-dcc-900 border-t border-dcc-750 flex flex-col select-none text-xs z-30 font-mono text-slate-200 transition-[height] duration-75"
    :class="{ 'transition-none': isResizing }"
  >
    <!-- Top Draggable Resizer Bar (Drag Up/Down to Resize, Double-click to Toggle) -->
    <div 
      @mousedown="startResize"
      @dblclick="toggleExpandPreset"
      class="h-2 w-full bg-dcc-850 hover:bg-indigo-600/70 border-t border-dcc-700 cursor-ns-resize flex items-center justify-center transition group shrink-0 relative select-none"
      title="Drag up/down to resize timeline height. Double-click to toggle height."
    >
      <div class="w-14 h-1 rounded-full bg-dcc-600 group-hover:bg-indigo-200 transition"></div>
    </div>

    <!-- Top Tab Header & Action Switcher -->
    <div class="h-8 bg-dcc-850 border-b border-dcc-750 flex items-center justify-between px-3 text-xs shrink-0">
      <div class="flex items-center space-x-1">
        <button 
          @click="activeTab = 'keyframe'"
          class="px-3 py-1 rounded transition text-[11px]"
          :class="activeTab === 'keyframe' ? 'bg-dcc-800 text-indigo-400 font-bold border border-indigo-500/40 shadow-xs' : 'text-slate-400 hover:text-slate-200'"
        >
          Keyframe Editor
        </button>

        <button 
          @click="activeTab = 'clip'"
          class="px-3 py-1 rounded transition text-[11px]"
          :class="activeTab === 'clip' ? 'bg-dcc-800 text-indigo-400 font-bold border border-indigo-500/40 shadow-xs' : 'text-slate-400 hover:text-slate-200'"
        >
          Clip Timeline
        </button>

        <!-- Quick Height Preset Switcher -->
        <button 
          @click="toggleExpandPreset"
          class="p-1 rounded bg-dcc-900 hover:bg-dcc-750 text-slate-400 hover:text-indigo-300 border border-dcc-750 transition ml-1"
          :title="timelineHeight > 300 ? 'Collapse Timeline Height' : 'Expand Timeline Height'"
        >
          <Minimize2 v-if="timelineHeight > 300" class="w-3 h-3" />
          <Maximize2 v-else class="w-3 h-3" />
        </button>
      </div>

      <!-- Blockbench Pose Quick Tools (Copy, Paste, Flip, Reset) -->
      <div class="flex items-center space-x-1 bg-dcc-900 px-1.5 py-0.5 rounded border border-dcc-750 text-[10px]">
        <button 
          @click="animationStore.copyPose" 
          class="px-2 py-0.5 rounded hover:bg-dcc-800 text-slate-300 hover:text-white transition flex items-center gap-1"
          title="Copy Pose (Ctrl+C)"
        >
          <Copy class="w-2.5 h-2.5" />
          <span>Copy</span>
        </button>

        <button 
          @click="animationStore.pastePose" 
          class="px-2 py-0.5 rounded hover:bg-dcc-800 text-slate-300 hover:text-white transition flex items-center gap-1"
          title="Paste Pose (Ctrl+V)"
        >
          <span>Paste</span>
        </button>

        <button 
          @click="animationStore.pasteFlippedPose" 
          class="px-2 py-0.5 rounded hover:bg-dcc-800 text-amber-300 hover:text-amber-200 transition flex items-center gap-1"
          title="Paste Flipped (Mirror Left/Right for Walk Cycles)"
        >
          <FlipHorizontal class="w-2.5 h-2.5" />
          <span>Flip (Walk Mirror)</span>
        </button>

        <button 
          @click="animationStore.resetPose" 
          class="px-2 py-0.5 rounded hover:bg-dcc-800 text-slate-400 hover:text-white transition flex items-center gap-1"
          title="Reset Pose (Alt+R)"
        >
          <RotateCcw class="w-2.5 h-2.5" />
          <span>Reset</span>
        </button>
      </div>

      <!-- Active Action Selector -->
      <div class="flex items-center space-x-1.5 text-[11px]">
        <span class="text-slate-400">Action:</span>
        <select 
          :value="animationStore.activeClip?.id"
          @change="animationStore.selectClip(($event.target as HTMLSelectElement).value)"
          class="bg-dcc-800 text-indigo-300 px-2 py-0.5 rounded border border-dcc-700 font-bold focus:outline-none"
        >
          <option v-for="c in animationStore.armature.clips" :key="c.id" :value="c.id" class="bg-dcc-900">
            {{ c.name }} ({{ c.durationFrames }}f)
          </option>
        </select>

        <button 
          @click="showNewClipModal = true" 
          class="p-1 rounded bg-dcc-800 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-dcc-700 transition" 
          title="Add New Animation"
        >
          <Plus class="w-3 h-3" />
        </button>

        <button 
          @click="handleDuplicateActiveClip" 
          class="p-1 rounded bg-dcc-800 hover:bg-dcc-750 text-slate-300 hover:text-white border border-dcc-700 transition" 
          title="Duplicate Current Animation"
        >
          <Copy class="w-3 h-3" />
        </button>

        <button 
          v-if="animationStore.armature.clips.length > 1"
          @click="handleDeleteActiveClip" 
          class="p-1 rounded bg-dcc-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-dcc-700 transition" 
          title="Delete Current Animation"
        >
          <Trash2 class="w-3 h-3" />
        </button>
      </div>
    </div>

    <!-- GLB Animator / Blockbench Control Bar -->
    <div class="h-9 bg-dcc-850 border-b border-dcc-750 px-3 flex items-center justify-between gap-3 shrink-0 overflow-x-auto text-[11px]">
      <!-- Left: Frame & Time Controls -->
      <div class="flex items-center space-x-2 shrink-0">
        <!-- Frame Navigation Steppers -->
        <div class="flex items-center space-x-0.5 bg-dcc-900 border border-dcc-750 rounded p-0.5">
          <button @click="animationStore.setFrame(0)" class="p-1 rounded hover:bg-dcc-800 text-slate-400 hover:text-white" title="First Frame">
            <SkipBack class="w-3 h-3" />
          </button>
          <button @click="stepFrame(-1)" class="p-1 rounded hover:bg-dcc-800 text-slate-400 hover:text-white" title="Prev Frame">
            <ChevronLeft class="w-3 h-3" />
          </button>
          <button 
            @click="animationStore.togglePlay"
            class="px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center shadow-xs transition"
            title="Play / Pause (Space)"
          >
            <Pause v-if="animationStore.isPlaying" class="w-3 h-3" />
            <Play v-else class="w-3 h-3 fill-current ml-0.5" />
          </button>
          <button @click="stepFrame(1)" class="p-1 rounded hover:bg-dcc-800 text-slate-400 hover:text-white" title="Next Frame">
            <ChevronRight class="w-3 h-3" />
          </button>
          <button @click="animationStore.setFrame(maxFrames)" class="p-1 rounded hover:bg-dcc-800 text-slate-400 hover:text-white" title="Last Frame">
            <SkipForward class="w-3 h-3" />
          </button>
        </div>

        <!-- Time input scrubber -->
        <div class="flex items-center bg-dcc-900 border border-dcc-700 rounded px-2 py-0.5 text-slate-100">
          <span class="text-slate-400 mr-1 text-[10px]">Time:</span>
          <input 
            type="text" 
            :value="timeSecondsFormatted"
            @change="timeSecondsFormatted = ($event.target as HTMLInputElement).value"
            class="w-14 bg-transparent font-bold text-center focus:outline-none text-indigo-300"
          />
          <div class="flex flex-col ml-1 border-l border-dcc-750 pl-1 space-y-0.5">
            <button @click="stepTime(1)" class="text-[8px] text-slate-400 hover:text-white leading-none">▲</button>
            <button @click="stepTime(-1)" class="text-[8px] text-slate-400 hover:text-white leading-none">▼</button>
          </div>
        </div>
      </div>

      <!-- Clip Duration / Length Scrubber & Presets -->
      <div class="flex items-center space-x-1.5 shrink-0 border-l border-dcc-750 pl-3">
        <span class="text-slate-400 font-bold">Len:</span>
        <div class="flex items-center bg-dcc-900 border border-dcc-700 rounded px-1.5 py-0.5 text-slate-100">
          <input 
            type="number" 
            step="0.5"
            min="0.5"
            v-model.number="clipDurationSeconds"
            class="w-10 bg-transparent font-bold text-center focus:outline-none text-indigo-300 text-xs"
          />
          <span class="text-slate-400 text-[10px] pr-1">s</span>
          <div class="flex flex-col border-l border-dcc-750 pl-1 space-y-0.5">
            <button @click="stepClipDuration(0.5)" class="text-[8px] text-slate-400 hover:text-white leading-none">▲</button>
            <button @click="stepClipDuration(-0.5)" class="text-[8px] text-slate-400 hover:text-white leading-none">▼</button>
          </div>
        </div>

        <div class="flex items-center space-x-0.5">
          <button 
            v-for="sec in [1.0, 2.0, 3.0, 5.0]" 
            :key="sec"
            @click="setPresetClipDuration(sec)"
            class="px-1.5 py-0.5 rounded text-[9px] border transition"
            :class="Math.abs(clipDurationSeconds - sec) < 0.1 ? 'bg-indigo-600/40 border-indigo-500 text-indigo-200 font-bold' : 'bg-dcc-900 border-dcc-750 text-slate-400 hover:text-slate-200'"
          >
            {{ sec }}s
          </button>
        </div>
      </div>

      <!-- Interpolation Mode Selectors (Smooth, Linear, Step) -->
      <div class="flex items-center space-x-1 shrink-0 border-l border-dcc-750 pl-3">
        <button 
          @click="animationStore.interpolationMode = 'cubic'"
          class="flex items-center space-x-1 px-2 py-1 rounded transition border text-[10px]"
          :class="animationStore.interpolationMode === 'cubic' ? 'bg-indigo-600 text-white font-bold border-indigo-400 shadow-xs' : 'bg-dcc-800 text-slate-400 border-dcc-700 hover:text-slate-200'"
        >
          <Circle class="w-2.5 h-2.5 fill-current" />
          <span>Smooth</span>
        </button>

        <button 
          @click="animationStore.interpolationMode = 'linear'"
          class="flex items-center space-x-1 px-2 py-1 rounded transition border text-[10px]"
          :class="animationStore.interpolationMode === 'linear' ? 'bg-indigo-600 text-white font-bold border-indigo-400 shadow-xs' : 'bg-dcc-800 text-slate-400 border-dcc-700 hover:text-slate-200'"
        >
          <Diamond class="w-2.5 h-2.5 fill-current" />
          <span>Linear</span>
        </button>

        <button 
          @click="animationStore.interpolationMode = 'step'"
          class="flex items-center space-x-1 px-2 py-1 rounded transition border text-[10px]"
          :class="animationStore.interpolationMode === 'step' ? 'bg-indigo-600 text-white font-bold border-indigo-400 shadow-xs' : 'bg-dcc-800 text-slate-400 border-dcc-700 hover:text-slate-200'"
        >
          <Square class="w-2.5 h-2.5 fill-current" />
          <span>Step</span>
        </button>
      </div>

      <!-- Auto Key Toggle -->
      <div class="flex items-center space-x-1 shrink-0 border-l border-dcc-750 pl-3">
        <button 
          @click="animationStore.autoKey = !animationStore.autoKey" 
          class="flex items-center space-x-1 px-2 py-1 rounded transition text-[10px] border"
          :class="animationStore.autoKey ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 shadow-xs' : 'bg-dcc-800 text-slate-400 border-dcc-700 hover:text-slate-200'"
          title="Auto Keyframing (Automatically records keyframes upon transform)"
        >
          <span class="w-1.5 h-1.5 rounded-full" :class="animationStore.autoKey ? 'bg-rose-400 animate-pulse' : 'bg-slate-500'"></span>
          <span>Auto Key</span>
        </button>

        <!-- Add Event Marker Button -->
        <div class="relative">
          <button 
            @click="showMarkerInput = !showMarkerInput"
            class="flex items-center space-x-1 px-2 py-1 rounded bg-dcc-800 hover:bg-dcc-750 text-cyan-300 border border-cyan-500/30 transition text-[10px]"
            title="Add Game Event Marker at Active Frame"
          >
            <Flag class="w-2.5 h-2.5" />
            <span>+ Event</span>
          </button>

          <!-- Marker Input Popover -->
          <div v-if="showMarkerInput" class="absolute left-0 top-8 bg-dcc-850 border border-dcc-700 p-2 rounded shadow-xl z-50 flex items-center space-x-1.5 w-48">
            <input 
              v-model="newMarkerName" 
              placeholder="Event Name (e.g. Footstep)"
              class="w-full bg-dcc-900 border border-dcc-750 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none focus:border-cyan-400"
              @keydown.enter="handleAddMarker"
            />
            <button @click="handleAddMarker" class="px-2 py-0.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-[10px]">
              Add
            </button>
          </div>
        </div>
      </div>

      <!-- Keyframe REC & Clear Buttons -->
      <div class="flex items-center space-x-1.5 shrink-0 border-l border-dcc-750 pl-3">
        <button 
          @click="animationStore.recordAllBonesKeyframe()"
          class="flex items-center space-x-1.5 px-3 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold shadow-xs transition border border-rose-400/30 active:scale-95 text-[10px]"
          title="Record Keyframe for All Bones at Active Time"
        >
          <span class="w-2 h-2 rounded-full bg-white animate-pulse"></span>
          <span>REC</span>
        </button>

        <button 
          @click="animationStore.clearKeyframeAtCurrentTime()"
          class="px-2 py-1 rounded bg-dcc-800 hover:bg-dcc-750 text-slate-300 hover:text-white border border-dcc-700 transition text-[10px]"
          title="Clear Keyframes at Active Time"
        >
          Clear
        </button>
      </div>

      <!-- Live Recorded Status Text Banner (Right) -->
      <div class="text-[10px] text-slate-400 font-mono italic shrink-0 text-right truncate max-w-xs">
        {{ animationStore.recordedStatusMessage }}
      </div>
    </div>

    <!-- VIEW 1: KEYFRAME EDITOR (Blockbench Expandable Dope Sheet Matrix) -->
    <div v-show="activeTab === 'keyframe'" class="flex-1 overflow-x-auto overflow-y-auto bg-dcc-900 relative min-h-0 flex flex-col">
      <!-- Time Ruler Row -->
      <div class="h-6 bg-dcc-850 border-b border-dcc-750 flex items-center pl-44 sticky top-0 z-20 shrink-0">
        <div 
          v-for="marker in timeMarkers" 
          :key="marker.frame"
          @click="animationStore.setFrame(marker.frame)"
          class="w-7 text-center font-mono text-[9px] cursor-pointer shrink-0 border-r border-dcc-800 relative"
          :class="animationStore.currentFrame === marker.frame ? 'text-amber-400 font-bold bg-amber-500/20' : 'text-slate-400 hover:text-white'"
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
      <div class="divide-y divide-dcc-800">
        <!-- 1. Armature Bones Tracks -->
        <template v-for="bone in allRigBones" :key="bone.id">
          <!-- Main Bone Row -->
          <div 
            @click="selectTrackItem('bone', bone.id)"
            class="h-6 flex items-center hover:bg-dcc-800/60 cursor-pointer shrink-0 transition"
            :class="{ 'bg-indigo-950/40': animationStore.selectedBoneId === bone.id }"
          >
            <!-- Expand Chevron + Name -->
            <div class="w-44 px-2 truncate text-slate-300 font-mono text-[10px] font-medium flex items-center justify-between gap-1.5 shrink-0 bg-dcc-850 border-r border-dcc-750 h-full sticky left-0 z-10">
              <div class="flex items-center space-x-1 truncate">
                <button @click.stop="toggleTrackExpand(bone.id)" class="text-slate-400 hover:text-white p-0.5">
                  <ChevronDown v-if="expandedTracks[bone.id]" class="w-3 h-3 text-indigo-400" />
                  <ChevronRight v-else class="w-3 h-3 text-slate-500" />
                </button>
                <BlenderIcon name="bone" :size="11" color="#a855f7" />
                <span class="truncate">{{ bone.name }}</span>
              </div>

              <!-- Quick 1-Click Keyframe All Channels Button -->
              <button 
                @click.stop="animationStore.recordCurrentKeyframe()" 
                class="text-[9px] text-slate-500 hover:text-amber-300 font-bold px-1 rounded hover:bg-dcc-800"
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
                class="w-7 h-6 flex items-center justify-center border-r border-dcc-800 hover:bg-dcc-750/50 shrink-0 relative"
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
            <div class="h-5 flex items-center bg-dcc-900/90 hover:bg-dcc-800/40 text-[9px] shrink-0 border-b border-dcc-850">
              <div class="w-44 pl-6 pr-2 truncate text-purple-300 flex items-center justify-between shrink-0 bg-dcc-850/80 border-r border-dcc-750 h-full sticky left-0 z-10">
                <span class="flex items-center gap-1">
                  <span class="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                  <span>Rotation (Deg)</span>
                </span>
                <button 
                  @click.stop="animationStore.addChannelKeyframe(bone.id, 'bone', 'rotation')" 
                  class="text-[8px] text-purple-400 hover:text-white px-1 rounded hover:bg-purple-900/40"
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
                  class="w-7 h-5 flex items-center justify-center border-r border-dcc-850 hover:bg-purple-900/20 shrink-0 relative"
                >
                  <div 
                    v-if="hasChannelKeyframe(bone.id, 'rotation', m.frame)"
                    class="w-2 h-2 rotate-45 bg-purple-400 border border-purple-200 rounded-xs shadow-xs"
                  ></div>
                </div>
              </div>
            </div>

            <!-- Position Channel -->
            <div class="h-5 flex items-center bg-dcc-900/90 hover:bg-dcc-800/40 text-[9px] shrink-0 border-b border-dcc-850">
              <div class="w-44 pl-6 pr-2 truncate text-sky-300 flex items-center justify-between shrink-0 bg-dcc-850/80 border-r border-dcc-750 h-full sticky left-0 z-10">
                <span class="flex items-center gap-1">
                  <span class="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
                  <span>Position</span>
                </span>
                <button 
                  @click.stop="animationStore.addChannelKeyframe(bone.id, 'bone', 'position')" 
                  class="text-[8px] text-sky-400 hover:text-white px-1 rounded hover:bg-sky-900/40"
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
                  class="w-7 h-5 flex items-center justify-center border-r border-dcc-850 hover:bg-sky-900/20 shrink-0 relative"
                >
                  <div 
                    v-if="hasChannelKeyframe(bone.id, 'position', m.frame)"
                    class="w-2 h-2 rotate-45 bg-sky-400 border border-sky-200 rounded-xs shadow-xs"
                  ></div>
                </div>
              </div>
            </div>

            <!-- Scale Channel -->
            <div class="h-5 flex items-center bg-dcc-900/90 hover:bg-dcc-800/40 text-[9px] shrink-0 border-b border-dcc-850">
              <div class="w-44 pl-6 pr-2 truncate text-emerald-300 flex items-center justify-between shrink-0 bg-dcc-850/80 border-r border-dcc-750 h-full sticky left-0 z-10">
                <span class="flex items-center gap-1">
                  <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  <span>Scale</span>
                </span>
                <button 
                  @click.stop="animationStore.addChannelKeyframe(bone.id, 'bone', 'scale')" 
                  class="text-[8px] text-emerald-400 hover:text-white px-1 rounded hover:bg-emerald-900/40"
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
                  class="w-7 h-5 flex items-center justify-center border-r border-dcc-850 hover:bg-emerald-900/20 shrink-0 relative"
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
            class="h-6 flex items-center hover:bg-dcc-800/60 cursor-pointer shrink-0 transition"
            :class="{ 'bg-indigo-950/40': projectStore.activeMeshId === mesh.id && !animationStore.selectedBoneId }"
          >
            <div class="w-44 px-2 truncate text-slate-300 font-mono text-[10px] font-medium flex items-center justify-between gap-1.5 shrink-0 bg-dcc-850 border-r border-dcc-750 h-full sticky left-0 z-10">
              <div class="flex items-center space-x-1 truncate">
                <button @click.stop="toggleTrackExpand(mesh.id)" class="text-slate-400 hover:text-white p-0.5">
                  <ChevronDown v-if="expandedTracks[mesh.id]" class="w-3 h-3 text-indigo-400" />
                  <ChevronRight v-else class="w-3 h-3 text-slate-500" />
                </button>
                <BlenderIcon name="mesh-cube" :size="11" color="#38bdf8" />
                <span class="truncate">{{ mesh.name }}</span>
              </div>

              <button 
                @click.stop="animationStore.recordCurrentKeyframe()" 
                class="text-[9px] text-slate-500 hover:text-amber-300 font-bold px-1 rounded hover:bg-dcc-800"
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
                class="w-7 h-6 flex items-center justify-center border-r border-dcc-800 hover:bg-dcc-750/50 shrink-0 relative"
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
            <div class="h-5 flex items-center bg-dcc-900/90 hover:bg-dcc-800/40 text-[9px] shrink-0 border-b border-dcc-850">
              <div class="w-44 pl-6 pr-2 truncate text-purple-300 flex items-center justify-between shrink-0 bg-dcc-850/80 border-r border-dcc-750 h-full sticky left-0 z-10">
                <span class="flex items-center gap-1">
                  <span class="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                  <span>Rotation</span>
                </span>
                <button 
                  @click.stop="animationStore.addChannelKeyframe(mesh.id, 'mesh', 'rotation')" 
                  class="text-[8px] text-purple-400 hover:text-white px-1 rounded hover:bg-purple-900/40"
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
                  class="w-7 h-5 flex items-center justify-center border-r border-dcc-850 hover:bg-purple-900/20 shrink-0 relative"
                >
                  <div 
                    v-if="hasChannelKeyframe(mesh.id, 'rotation', m.frame)"
                    class="w-2 h-2 rotate-45 bg-purple-400 border border-purple-200 rounded-xs shadow-xs"
                  ></div>
                </div>
              </div>
            </div>

            <div class="h-5 flex items-center bg-dcc-900/90 hover:bg-dcc-800/40 text-[9px] shrink-0 border-b border-dcc-850">
              <div class="w-44 pl-6 pr-2 truncate text-sky-300 flex items-center justify-between shrink-0 bg-dcc-850/80 border-r border-dcc-750 h-full sticky left-0 z-10">
                <span class="flex items-center gap-1">
                  <span class="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
                  <span>Position</span>
                </span>
                <button 
                  @click.stop="animationStore.addChannelKeyframe(mesh.id, 'mesh', 'position')" 
                  class="text-[8px] text-sky-400 hover:text-white px-1 rounded hover:bg-sky-900/40"
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
                  class="w-7 h-5 flex items-center justify-center border-r border-dcc-850 hover:bg-sky-900/20 shrink-0 relative"
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

    <!-- VIEW 2: CLIP TIMELINE (Clips Strip Manager) -->
    <div v-show="activeTab === 'clip'" class="flex-1 p-3 overflow-y-auto bg-dcc-900 space-y-2">
      <div class="flex items-center justify-between pb-1 border-b border-dcc-750">
        <span class="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Animation Clips Strip</span>
        <button 
          @click="showNewClipModal = true"
          class="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] flex items-center space-x-1 transition"
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
          class="p-2.5 rounded bg-dcc-850 border transition cursor-pointer flex flex-col space-y-2"
          :class="animationStore.activeClip?.id === clip.id ? 'border-indigo-500 shadow-md ring-1 ring-indigo-500' : 'border-dcc-750 hover:border-dcc-700'"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-1.5 truncate">
              <Film class="w-3.5 h-3.5 text-indigo-400" />
              <span class="font-bold text-slate-100 truncate">{{ clip.name }}</span>
            </div>

            <div class="flex items-center space-x-1" @click.stop>
              <button @click="animationStore.duplicateClip(clip.id)" class="text-slate-400 hover:text-slate-200 p-1" title="Duplicate">
                <Copy class="w-3 h-3" />
              </button>
              <button 
                v-if="animationStore.armature.clips.length > 1" 
                @click="animationStore.deleteClip(clip.id)" 
                class="text-slate-400 hover:text-rose-400 p-1" 
                title="Delete"
              >
                <Trash2 class="w-3 h-3" />
              </button>
            </div>
          </div>

          <div class="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-dcc-750">
            <span>{{ clip.durationFrames }} frames ({{ (clip.durationFrames / clip.fps).toFixed(1) }}s)</span>
            <span :class="clip.loop ? 'text-emerald-400' : 'text-slate-500'">{{ clip.loop ? 'Looping' : 'Once' }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- New Clip Modal -->
    <div 
      v-if="showNewClipModal"
      class="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center"
      @click.self="showNewClipModal = false"
    >
      <div class="bg-dcc-850 border border-dcc-750 rounded-lg shadow-2xl p-4 w-80 space-y-3 font-mono">
        <h3 class="font-bold text-slate-100 text-xs uppercase">New Animation Clip</h3>
        <input 
          v-model="newClipName" 
          placeholder="e.g. Run_Cycle"
          class="w-full bg-dcc-900 border border-dcc-700 text-slate-100 px-2.5 py-1 rounded text-xs focus:outline-none focus:border-indigo-500"
          autoFocus
          @keydown.enter="handleAddClip"
        />
        <div class="flex items-center justify-end space-x-2 pt-1">
          <button 
            @click="showNewClipModal = false"
            class="px-2.5 py-1 rounded bg-dcc-800 text-slate-300 text-xs hover:bg-dcc-750 border border-dcc-700"
          >
            Cancel
          </button>
          <button 
            @click="handleAddClip"
            class="px-3 py-1 rounded bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-500 shadow transition"
          >
            Create Clip
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
