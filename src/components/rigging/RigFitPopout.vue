<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { X, GripHorizontal, Crosshair, ChevronLeft, ChevronRight, Wand2 } from 'lucide-vue-next'
import { useAnimationStore } from '../../stores/animationStore'
import { useProjectStore } from '../../stores/projectStore'
import { useLayoutStore } from '../../stores/layoutStore'
import { useFloatingDrag } from '../../composables/useFloatingDrag'
import { requestCameraView } from '../../core/commands/editorCommands'
import { rigPresets, type RigPresetId } from '../../core/animation/RiggingWorkflow'
import UiButton from '../ui/UiButton.vue'

const animation = useAnimationStore(), project = useProjectStore(), layout = useLayoutStore()
const pos = ref({ x: Math.max(8, window.innerWidth - 400), y: 85 })
const { startDrag } = useFloatingDrag(pos, { maxPadX: 320, maxPadY: 100 })
const preset = ref<RigPresetId>('human')
const notice = ref('')
const bones = computed(() => animation.armature.bones)
const selected = computed(() => animation.selectedBone)
const index = computed(() => bones.value.findIndex(b => b.id === selected.value?.id))
const pointName = computed(() => {
  const name = selected.value?.name || ''
  if (name.includes('Forearm')) return 'Elbow'
  if (name.includes('UpperArm')) return 'Shoulder joint'
  if (name.includes('Hand')) return 'Wrist'
  if (name.includes('Shin')) return 'Knee'
  if (name.includes('Thigh')) return 'Hip joint'
  if (name.includes('Foot')) return 'Ankle'
  return name
})
function close() { animation.jointPlacementActive = false; animation.showRigFitPopup = false }
function prepare() {
  animation.toggleWeightPaint(false)
  animation.toggleTestPose(false)
  animation.clickToPlaceMode = false
  animation.setShowBones(true)
  animation.xrayBones = true
  if (!selected.value && bones.value.length) animation.selectBone(bones.value[0].id)
}
watch(() => animation.showRigFitPopup, open => { if (open) { prepare(); notice.value = '' } else animation.jointPlacementActive = false }, { immediate: true })
watch(() => project.activeMeshId, () => { animation.jointPlacementActive = false; notice.value = '' })
onBeforeUnmount(() => { animation.jointPlacementActive = false })
function add() {
  if (!project.activeMesh) return
  animation.addRigPreset(project.activeMesh.id, preset.value)
  requestCameraView('front')
  notice.value = 'Skeleton added. Fit the highlighted joint, then move to the next.'
}
function choose(offset: number) {
  const next = bones.value[Math.max(0, Math.min(bones.value.length - 1, index.value + offset))]
  if (next) animation.selectBone(next.id)
}
function edit(axis: 'x' | 'y' | 'z', event: Event) {
  const value = (event.target as HTMLInputElement).valueAsNumber
  if (selected.value && Number.isFinite(value)) animation.placeRigJoint({ ...selected.value.head, [axis]: value })
}
function bind() {
  if (!project.activeMesh || !bones.value.length) return
  animation.jointPlacementActive = false
  project.recordState('Attach Fitted Rig')
  animation.autoWeightMeshToBones(project.activeMesh)
  notice.value = 'Weights applied to ' + project.activeMesh.name + '. Test the bends before animating. Ctrl+Z restores the previous binding.'
}
function test() {
  close()
  layout.setInspectorTab('props', 'rig')
  layout.showRightSidebar = true
  animation.toggleTestPose(true)
}
</script>

<template>
  <Teleport to="body">
    <section v-if="animation.showRigFitPopup" role="dialog" data-floating-panel aria-label="Fit your rig" class="fixed z-[100] flex w-[360px] max-w-[calc(100vw-16px)] max-h-[calc(100vh-100px)] flex-col overflow-hidden rounded-lg border border-ui-borderStrong bg-ui-panel text-xs text-ui-textPrimary shadow-2xl" :style="{ left: `${pos.x}px`, top: `${pos.y}px` }" @keydown.esc.stop="close">
      <header class="flex shrink-0 cursor-move items-center justify-between border-b border-ui-borderSubtle bg-ui-header px-4 py-3" @pointerdown="startDrag">
        <div class="flex items-center gap-2"><GripHorizontal class="h-4 w-4 text-ui-textMuted" /><strong>Fit your rig</strong></div>
        <button type="button" aria-label="Close rig fitting" class="rounded p-1 hover:bg-ui-hover" @pointerdown.stop @click="close"><X class="h-4 w-4" /></button>
      </header>
      <div class="overflow-y-auto p-4 space-y-4 custom-scrollbar">
        <p class="text-ui-textMuted leading-relaxed">Place joints where the model bends. This window floats so you can work directly on the model.</p>
        <label class="block space-y-1"><span class="text-ui-textMuted">Model</span>
          <select aria-label="Fitting model" :value="project.activeMeshId || ''" class="w-full border border-ui-borderDefault rounded bg-ui-input p-2" @change="project.selectMesh(($event.target as HTMLSelectElement).value)">
            <option value="" disabled>Choose a model</option><option v-for="mesh in project.meshes" :key="mesh.id" :value="mesh.id">{{ mesh.name }}</option>
          </select>
        </label>
        <div v-if="!bones.length" class="space-y-2">
          <select v-model="preset" aria-label="Starter skeleton" class="w-full border border-ui-borderDefault rounded bg-ui-input p-2"><option v-for="item in rigPresets" :key="item.id" :value="item.id">{{ item.name }}</option></select>
          <UiButton variant="primary" size="md" class="w-full" :disabled="!project.activeMesh?.vertices.length" @click="add">Add starter skeleton</UiButton>
        </div>
        <template v-else>
          <div class="space-y-2">
            <div class="flex justify-between"><strong>1 · Fit joints</strong><span class="text-ui-textMuted">{{ index + 1 }} / {{ bones.length }}</span></div>
            <select aria-label="Joint to fit" :value="selected?.id || ''" class="w-full border border-ui-borderDefault rounded bg-ui-input p-2" @change="animation.selectBone(($event.target as HTMLSelectElement).value)"><option v-for="bone in bones" :key="bone.id" :value="bone.id">{{ bone.name }}</option></select>
            <p class="rounded border border-ui-accent/30 bg-ui-accentSubtle p-2 text-ui-textAccent">{{ pointName }} · place the highlighted pivot, not the bone’s tip.</p>
            <div class="grid grid-cols-3 gap-1"><UiButton @click="requestCameraView('front')">Front</UiButton><UiButton @click="requestCameraView('right')">Side</UiButton><UiButton @click="requestCameraView('persp')">Perspective</UiButton></div>
            <UiButton size="md" class="w-full" :variant="animation.jointPlacementActive ? 'accent' : 'primary'" :disabled="!selected" @click="animation.jointPlacementActive = !animation.jointPlacementActive"><Crosshair class="h-3.5 w-3.5" />{{ animation.jointPlacementActive ? 'Placing joint · click model view' : 'Place joint in viewport' }}</UiButton>
            <p class="text-[11px] text-ui-textMuted leading-relaxed">Front adjusts left/right and height. Side adjusts depth. Click to place; depth along the view stays fixed. Connected endpoints move together.</p>
            <label class="flex justify-between items-center"><span>Mirror left / right joints</span><input v-model="animation.jointPlacementMirror" type="checkbox" class="accent-ui-accent" /></label>
            <div v-if="selected" class="grid grid-cols-3 gap-2"><label v-for="axis in (['x', 'y', 'z'] as const)" :key="axis" class="text-ui-textMuted">{{ axis.toUpperCase() }}<input :aria-label="`Joint ${axis.toUpperCase()}`" :value="Number(selected.head[axis].toFixed(3))" type="number" step="0.01" class="mt-1 w-full border border-ui-borderSubtle rounded bg-ui-input p-1.5 text-ui-textPrimary" @change="edit(axis, $event)" /></label></div>
            <div class="grid grid-cols-2 gap-2"><UiButton :disabled="index <= 0" @click="choose(-1)"><ChevronLeft class="h-3 w-3" /> Previous</UiButton><UiButton :disabled="index >= bones.length - 1" @click="choose(1)">Next joint <ChevronRight class="h-3 w-3" /></UiButton></div>
          </div>
          <div class="space-y-2 border-t border-ui-borderSubtle pt-3">
            <strong>2 · Attach and test</strong>
            <select v-model="animation.autoSkinMethod" aria-label="Automatic weighting method" class="w-full rounded border border-ui-borderDefault bg-ui-input p-2"><option value="surface">Surface smoothing · connected geometry</option><option value="distance">Distance blend · nearby bones</option></select>
            <p class="text-[11px] leading-relaxed text-ui-textMuted">Surface smoothing spreads weights along edges to reduce influence across separate parts. Distance blend is useful for very coarse meshes. Replaces this model’s weights.</p>
            <UiButton class="w-full" size="md" :disabled="!project.activeMesh?.vertices.length" @click="bind"><Wand2 class="h-3.5 w-3.5" /> Calculate weights</UiButton>
            <UiButton class="w-full" size="md" variant="primary" @click="test">Test deformation</UiButton>
          </div>
        </template>
        <p v-if="notice" role="status" class="text-[11px] leading-relaxed text-ui-textAccent">{{ notice }}</p>
      </div>
      <footer class="border-t border-ui-borderSubtle bg-ui-header p-3 text-[10px] text-ui-textMuted">Drag the title to move · Ctrl+Z to undo joint placement</footer>
    </section>
  </Teleport>
</template>
