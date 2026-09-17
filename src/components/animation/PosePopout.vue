<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useAnimationStore } from '../../stores/animationStore'
import { useProjectStore } from '../../stores/projectStore'
import { useToolStore } from '../../stores/toolStore'
import { useHistoryStore } from '../../stores/historyStore'
import UiButton from '../ui/UiButton.vue'

const animation = useAnimationStore()
const project = useProjectStore()
const tools = useToolStore()
const pos = ref({ x: 58, y: 85 })
const history = useHistoryStore()
const size = ref({ width: 336, height: 570 })
const showSearch = ref(false)
const showHelp = ref(false)
const placementOpen = ref(false)
let endPointerGesture: (() => void) | undefined
function startPanelGesture(event: PointerEvent, resize = false) {
  if (event.button !== 0) return
  event.preventDefault()
  endPointerGesture?.()
  const start = { ...pos.value, width: size.value.width, height: size.value.height }
  const pointerX = event.clientX, pointerY = event.clientY
  const move = (e: PointerEvent) => {
    if (resize) size.value = { width: Math.max(300, Math.min(window.innerWidth - pos.value.x - 8, start.width + e.clientX - pointerX)), height: Math.max(390, Math.min(window.innerHeight - pos.value.y - 8, start.height + e.clientY - pointerY)) }
    else pos.value = { x: start.x + e.clientX - pointerX, y: start.y + e.clientY - pointerY }
    clampPanel()
  }
  const end = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', end)
    window.removeEventListener('pointercancel', end)
    endPointerGesture = undefined
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', end)
  window.addEventListener('pointercancel', end)
  endPointerGesture = end
}
function placePanel(side: 'left' | 'right' | 'center') {
  pos.value = { x: side === 'left' ? 52 : side === 'right' ? window.innerWidth - size.value.width - 16 : (window.innerWidth - size.value.width) / 2, y: 62 }
  placementOpen.value = false
  clampPanel()
}
function movePanelByKey(event: KeyboardEvent) {
  const offsets: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
  const offset = offsets[event.key]
  if (!offset) return
  event.preventDefault()
  const step = event.shiftKey ? 40 : 10
  pos.value = { x: pos.value.x + offset[0] * step, y: pos.value.y + offset[1] * step }
  clampPanel()
}
function undoPose(redo = false) {
  if (animation.isPlaying) animation.togglePlay()
  if (redo) history.redo()
  else history.undo()
}
function panelKey(event: KeyboardEvent) {
  if (event.key === 'Escape') { animation.showPosePopup = false; return }
  if (event.target instanceof HTMLElement && event.target.closest('input, select, textarea')) return
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undoPose(event.shiftKey) }
}

const minimized = ref(false)
const search = ref('')
type Channel = 'position' | 'rotation' | 'scale'
const channel = ref<Channel>('rotation')
const axes = ['x', 'y', 'z'] as const
const steps = ref({ position: 0.1, rotation: 5, scale: 0.05 })
const frameStep = ref(3)
const target = computed(() => animation.selectedBone || project.activeMesh)
const targetType = computed(() => animation.selectedBone ? 'bone' as const : 'mesh' as const)
const targetKey = computed(() => target.value ? `${targetType.value}:${target.value.id}` : '')
const bones = computed(() => animation.armature.bones.filter(b => b.name.toLowerCase().includes(search.value.trim().toLowerCase())))
const meshes = computed(() => project.meshes.filter(m => m.name.toLowerCase().includes(search.value.trim().toLowerCase())))
const parent = computed(() => animation.armature.bones.find(b => b.id === animation.selectedBone?.parentId))
const children = computed(() => animation.armature.bones.filter(b => b.parentId === animation.selectedBone?.id))
const currentKeys = computed(() => animation.activeClip?.tracks.find(t => t.targetId === target.value?.id && t.targetType === targetType.value))
const keyed = computed(() => currentKeys.value && [...currentKeys.value.positionKeys, ...currentKeys.value.rotationKeys, ...currentKeys.value.scaleKeys].some(k => k.frame === animation.currentFrame))
const visible = computed(() => animation.showPosePopup && tools.appMode === 'animate')

function clampPanel() {
  size.value.width = Math.min(size.value.width, Math.max(240, window.innerWidth - 16))
  size.value.height = Math.min(size.value.height, Math.max(280, window.innerHeight - 54))
  pos.value = { x: Math.max(8, Math.min(pos.value.x, window.innerWidth - size.value.width - 8)), y: Math.max(38, Math.min(pos.value.y, window.innerHeight - (minimized.value ? 38 : size.value.height) - 8)) }
}
watch(minimized, clampPanel)
watch(visible, open => { if (open) { clampPanel(); chooseChannel(channel.value) } }, { immediate: true })
watch(() => tools.modelTool, tool => {
  if (tool === 'move') channel.value = 'position'
  else if (tool === 'rotate') channel.value = 'rotation'
  else if (tool === 'scale') channel.value = 'scale'
})
window.addEventListener('resize', clampPanel)
onBeforeUnmount(() => { window.removeEventListener('resize', clampPanel); endPointerGesture?.() })

function chooseTarget(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  const separator = value.indexOf(':')
  const type = value.slice(0, separator), id = value.slice(separator + 1)
  if (type === 'bone') animation.selectBone(id)
  else if (type === 'mesh') {
    animation.selectBone(null)
    project.activeMeshId = id
    project.selectedMeshIds = [id]
  }
}
function chooseChannel(value: Channel) {
  channel.value = value
  tools.setModelTool(value === 'position' ? 'move' : value === 'rotation' ? 'rotate' : 'scale')
}
function setValue(axis: 'x' | 'y' | 'z', event: Event) {
  const input = event.target as HTMLInputElement
  if (!target.value) return
  if (input.value.trim()) animation.setPoseValues(target.value.id, targetType.value, channel.value, { [axis]: Number(input.value) })
  input.value = String(target.value[channel.value][axis])
}
function nudge(axis: 'x' | 'y' | 'z', direction: number, event: MouseEvent) {
  if (!target.value) return
  const step = Number(steps.value[channel.value])
  if (!Number.isFinite(step) || step <= 0) return
  const value = target.value[channel.value][axis] + direction * step * (event.shiftKey ? 0.1 : 1)
  animation.setPoseValues(target.value.id, targetType.value, channel.value, { [axis]: Number(value.toFixed(6)) })
}
function resetChannel() {
  if (!target.value) return
  const value = channel.value === 'scale' ? 1 : 0
  animation.setPoseValues(target.value.id, targetType.value, channel.value, { x: value, y: value, z: value })
}
function moveFrame(direction: number) {
  if (animation.isPlaying) animation.togglePlay()
  const raw = Number(frameStep.value)
  const step = Number.isFinite(raw) ? Math.max(1, Math.round(raw)) : 1
  animation.setFrame(animation.currentFrame + direction * step)
}
function setFrame(event: Event) {
  const input = event.target as HTMLInputElement
  if (animation.isPlaying) animation.togglePlay()
  if (input.value.trim() && Number.isFinite(Number(input.value))) animation.setFrame(Math.round(Number(input.value)))
  input.value = String(animation.currentFrame)
}
function keyAndAdvance() {
  if (!target.value || !animation.activeClip) return
  animation.recordCurrentKeyframe()
  moveFrame(1)
}
</script>

<template>
  <section v-if="visible" role="dialog" aria-label="Quick pose & animate" :aria-modal="false" data-floating-panel
    class="pose-popout fixed z-[65] flex flex-col rounded-lg border border-ui-borderDefault bg-ui-panel text-ui-textPrimary shadow-2xl select-none"
    :style="{ left: `${pos.x}px`, top: `${pos.y}px`, width: `${size.width}px`, height: minimized ? '38px' : `${size.height}px` }"
    @keydown.stop="panelKey" @keyup.stop @pointerdown.stop>
    <header class="pose-header flex items-center gap-1 bg-ui-header border-b border-ui-borderSubtle rounded-t-lg shrink-0">
      <button type="button" aria-label="Move pose panel" title="Drag to move · arrow keys to reposition" class="flex-1 text-left cursor-grab active:cursor-grabbing touch-none px-3 h-full text-xs font-semibold" @pointerdown="startPanelGesture($event)" @keydown="movePanelByKey">⠿ Pose & animate <span class="text-ui-textMuted font-normal text-[10px] ml-1">drag to move</span></button>
      <button class="header-action" aria-label="Position pose panel" :aria-expanded="placementOpen" title="Panel position" @click="placementOpen = !placementOpen">↔</button>
      <button class="header-action" :aria-label="minimized ? 'Expand pose panel' : 'Minimize pose panel'" @click="minimized = !minimized">{{ minimized ? '+' : '−' }}</button>
      <button class="header-action mr-1" aria-label="Close pose panel" @click="animation.showPosePopup = false">×</button>
    </header>
    <div v-if="placementOpen" class="absolute top-10 right-2 z-10 flex gap-1 bg-ui-header border border-ui-borderDefault rounded p-2 shadow-lg">
      <UiButton size="xs" @click="placePanel('left')">Left</UiButton><UiButton size="xs" @click="placePanel('center')">Center</UiButton><UiButton size="xs" @click="placePanel('right')">Right</UiButton>
    </div>
    <template v-if="!minimized">
      <div class="pose-body min-h-0 overflow-y-auto flex-1 p-3 space-y-2.5 text-[11px]">
        <div class="flex items-center justify-between gap-2">
          <span class="section-label">1 · {{ targetType === 'bone' ? 'Bone' : 'Target' }}</span>
          <button class="text-ui-textAccent" :aria-expanded="showSearch" @click="showSearch = !showSearch">{{ showSearch ? 'Hide search' : 'Find target' }}</button>
        </div>
        <input v-if="showSearch" v-model="search" aria-label="Find pose target" placeholder="Find a bone or object…" class="pose-input" />
        <select :value="targetKey" aria-label="Pose target" class="pose-input font-semibold" @change="chooseTarget">
          <option v-if="!target" value="" disabled>Select a bone or object</option>
          <option v-if="target && ![...bones, ...meshes].some(item => item.id === target!.id)" :value="targetKey">{{ target.name }} (selected)</option>
          <optgroup v-if="bones.length" label="Bones"><option v-for="bone in bones" :key="bone.id" :value="`bone:${bone.id}`">{{ bone.name }}</option></optgroup>
          <optgroup v-if="meshes.length" label="Objects"><option v-for="mesh in meshes" :key="mesh.id" :value="`mesh:${mesh.id}`">{{ mesh.name }}</option></optgroup>
        </select>
        <p v-if="search && !bones.length && !meshes.length" class="text-ui-textMuted">No matches. <button class="text-ui-textAccent" @click="search = ''">Clear search</button></p>
        <div v-if="!target" class="empty-target rounded border border-ui-borderSubtle p-3 space-y-2 leading-relaxed">
          <p class="font-semibold">Choose something to animate</p>
          <p class="text-ui-textMuted">Click a bone or object in the viewport, or choose one above.</p>
          <p v-if="!animation.armature.bones.length && !project.meshes.length" class="text-ui-textMuted">Your scene is empty. Add or import a model in Modeling first.</p>
          <UiButton v-if="!animation.armature.bones.length && !project.meshes.length" size="sm" @click="tools.setAppMode('model')">Open Modeling</UiButton>
        </div>
        <template v-else>
          <div v-if="animation.selectedBone" class="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
            <UiButton size="xs" :disabled="!parent" @click="parent && animation.selectBone(parent.id)">↑ Parent</UiButton>
            <UiButton v-for="child in children" :key="child.id" size="xs" @click="animation.selectBone(child.id)">↳ {{ child.name }}</UiButton>
          </div>
          <div class="flex items-center justify-between"><span class="section-label">2 · Adjust pose</span><span class="text-ui-textMuted text-[10px]">{{ targetType === 'bone' ? 'Local offset' : 'Object' }}{{ channel === 'rotation' ? ' · degrees' : '' }}</span></div>
          <div class="grid grid-cols-3 gap-1" aria-label="Pose transform mode">
            <UiButton v-for="mode in (['position', 'rotation', 'scale'] as const)" :key="mode" size="sm" :aria-pressed="channel === mode" :variant="channel === mode ? 'accent' : 'default'" @click="chooseChannel(mode)">{{ mode === 'position' ? 'Move' : mode === 'rotation' ? 'Rotate' : 'Scale' }}</UiButton>
          </div>
          <p v-if="animation.selectedBone?.ikConstraint?.enabled" class="text-amber-400 text-[10px]">IK enabled: playback uses the rig’s target to solve this bone.</p>
          <div class="space-y-1.5">
            <div v-for="axis in axes" :key="axis" class="axis-row flex items-center gap-2">
              <label :for="`quick-pose-${axis}`" class="w-4 font-bold" :class="axis === 'x' ? 'text-rose-400' : axis === 'y' ? 'text-emerald-400' : 'text-sky-400'">{{ axis.toUpperCase() }}</label>
              <button type="button" class="pose-nudge" :aria-label="`Decrease ${axis.toUpperCase()}`" title="Shift-click for a fine adjustment" @click="nudge(axis, -1, $event)">−</button>
              <input :id="`quick-pose-${axis}`" type="number" :step="steps[channel]" :aria-label="`Pose ${channel} ${axis.toUpperCase()}`" :value="target[channel][axis]" class="pose-input text-right font-mono min-w-0" @change="setValue(axis, $event)" />
              <button type="button" class="pose-nudge" :aria-label="`Increase ${axis.toUpperCase()}`" title="Shift-click for a fine adjustment" @click="nudge(axis, 1, $event)">+</button>
            </div>
          </div>
          <div class="flex items-center justify-between gap-2">
            <label class="flex items-center gap-1 text-ui-textMuted">Step<input v-model.number="steps[channel]" aria-label="Pose adjustment step" type="number" min="0.000001" step="any" class="pose-input !w-16" /></label>
            <UiButton size="xs" @click="resetChannel">Reset {{ channel === 'position' ? 'move' : channel === 'rotation' ? 'rotation' : 'scale' }}</UiButton>
          </div>
          <div class="flex items-center gap-1">
            <UiButton size="xs" :disabled="!history.undoStack.length" title="Undo the latest project edit" @click="undoPose()">Undo</UiButton>
            <UiButton size="xs" :disabled="!history.redoStack.length" title="Redo the latest undone project edit" @click="undoPose(true)">Redo</UiButton>
            <label v-if="animation.selectedBone" class="flex items-center gap-1 ml-auto"><input type="checkbox" v-model="animation.xrayBones" /> X-ray bones</label>
          </div>
        </template>
      </div>
      <footer class="pose-transport shrink-0 border-t border-ui-borderDefault p-3 space-y-2 text-[11px] rounded-b-lg bg-ui-surface">
        <div class="flex items-center justify-between"><span class="section-label">3 · Animate</span><label class="flex items-center gap-1.5"><input type="checkbox" v-model="animation.autoKey" /> Auto-key</label></div>
        <select :value="animation.activeClip?.id" aria-label="Pose animation clip" class="pose-input" @change="animation.selectClip(($event.target as HTMLSelectElement).value)">
          <option v-for="clip in animation.armature.clips" :key="clip.id" :value="clip.id">{{ clip.name }} · {{ clip.durationFrames }}f / {{ clip.fps }} fps</option>
        </select>
        <input aria-label="Scrub animation frame" type="range" min="0" :max="animation.activeClip?.durationFrames || 1" step="1" :value="animation.currentFrame" :disabled="!animation.activeClip" class="w-full accent-ui-accent block" @input="setFrame" />
        <div class="flex items-center gap-1.5">
          <UiButton size="xs" :disabled="animation.currentFrame <= 0" @click="moveFrame(-1)">← Back</UiButton>
          <input type="number" min="0" :max="animation.activeClip?.durationFrames" :value="animation.currentFrame" aria-label="Pose frame" class="pose-input !w-14 text-center" @change="setFrame" />
          <UiButton size="xs" :disabled="animation.currentFrame >= (animation.activeClip?.durationFrames || 0)" @click="moveFrame(1)">Next →</UiButton>
          <label class="flex items-center gap-1 ml-auto text-ui-textMuted" title="Frames to advance">By<input v-model.number="frameStep" aria-label="Pose frame step" type="number" min="1" step="1" class="pose-input !w-12" /></label>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <UiButton size="md" :disabled="!target || !animation.activeClip" @click="animation.recordCurrentKeyframe()">Insert key</UiButton>
          <UiButton size="md" variant="primary" :disabled="!target || !animation.activeClip || animation.currentFrame >= animation.activeClip.durationFrames" @click="keyAndAdvance">Key & next →</UiButton>
        </div>
        <div class="flex gap-2 items-center">
          <UiButton class="flex-1" size="sm" :disabled="!animation.activeClip" @click="animation.togglePlay()">{{ animation.isPlaying ? 'Pause' : '▶ Play' }}</UiButton>
          <UiButton size="sm" :disabled="!animation.activeClip" @click="animation.setLoopMode(animation.loopMode === 'loop' ? 'once' : 'loop')">{{ animation.loopMode === 'loop' ? 'Loop on' : 'Loop off' }}</UiButton>
          <button aria-label="Pose workflow help" :aria-expanded="showHelp" class="header-action" @click="showHelp = !showHelp">?</button>
        </div>
        <p v-if="showHelp" class="text-[10px] text-ui-textMuted">Pose, insert a key, advance, and pose again. Shift-click ± for fine adjustments. {{ animation.autoKey ? 'Auto-key saves edits automatically.' : 'Insert a key before changing frames to save your pose.' }}</p>
        <p class="text-[10px] text-ui-textMuted truncate pr-3" role="status" :title="animation.recordedStatusMessage">{{ keyed ? '◆ Key on this frame' : '◇ No target key here' }} · {{ animation.autoKey ? 'Auto-key on' : 'Manual keying' }}</p>
      </footer>
      <button aria-label="Resize pose panel" title="Drag to resize" class="resize-grip absolute bottom-0 right-0 w-4 h-4 cursor-se-resize touch-none" @pointerdown.stop="startPanelGesture($event, true)">◢</button>
    </template>
  </section>
</template>

<style scoped>
.pose-popout { max-width: calc(100vw - 16px); max-height: calc(100vh - 46px); }
.pose-header { height: 38px; }
.header-action { width: 24px; height: 26px; border-radius: 4px; flex-shrink: 0; }
.header-action:hover, .pose-nudge:hover { background: var(--ui-bg-hover); }
.section-label { font-size: 10px; font-weight: 600; color: var(--ui-text-muted); text-transform: uppercase; letter-spacing: .06em; }
.pose-input { width: 100%; border: 1px solid var(--ui-border-default); background: var(--ui-bg-input); border-radius: 4px; padding: 4px 6px; color: inherit; }
.pose-nudge { flex-shrink: 0; width: 28px; height: 27px; border: 1px solid var(--ui-border-default); border-radius: 4px; }
.pose-popout button:focus-visible, .pose-input:focus-visible { outline: 1px solid var(--ui-accent); outline-offset: 2px; }
.resize-grip { color: var(--ui-text-muted); font-size: 12px; }
</style>
