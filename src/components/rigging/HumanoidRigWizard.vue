<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { X, Check, ChevronRight, RotateCcw, PersonStanding } from 'lucide-vue-next'
import { useAnimationStore } from '../../stores/animationStore'
import { useProjectStore } from '../../stores/projectStore'
import { useLayoutStore } from '../../stores/layoutStore'
import { suggestHumanoidMarkers, buildHumanoidRig, landmarkGroups, moveHumanoidMarker, validateHumanoidMarkers, type LandmarkGroup } from '../../core/animation/HumanoidRig'
import { autoWeightMeshToArmature } from '../../core/animation/AutoSkinning'
import { inspectRig } from '../../core/animation/RiggingWorkflow'
import type { Bone } from '../../types/animation'
import type { MeshObject, Vector3D } from '../../types/mesh'
import HumanoidRigPreview from './HumanoidRigPreview.vue'
import UiButton from '../ui/UiButton.vue'

const animation = useAnimationStore(), project = useProjectStore(), layout = useLayoutStore()
const panel = ref<HTMLElement | null>(null)
const meshId = ref(project.activeMeshId || project.meshes[0]?.id || '')
const draft = ref<MeshObject | null>(null)
const markers = ref<ReturnType<typeof suggestHumanoidMarkers>>([])
const stage = ref<0 | 1 | 2>(0)
const group = ref<LandmarkGroup>('chin')
const confirmed = ref<LandmarkGroup[]>([])
const symmetry = ref(true), pose = ref<'t' | 'a'>('t'), detail = ref<'standard' | 'simple'>('standard')
const view = ref<'front' | 'side' | 'perspective'>('front')
const method = ref<'surface' | 'distance'>('surface')
const previewBones = ref<Bone[]>([])
const busy = ref(false), message = ref('')
const testBone = ref('Forearm.L'), bend = ref(0)
const activeGroup = computed(() => landmarkGroups.find(g => g.id === group.value)!)
const errors = computed(() => validateHumanoidMarkers(markers.value))
const status = computed(() => inspectRig(draft.value, previewBones.value))
const draftBones = computed(() => draft.value ? buildHumanoidRig(draft.value, markers.value, detail.value) : [])

function loadModel() {
  const mesh = project.meshes.find(m => m.id === meshId.value)
  draft.value = mesh ? JSON.parse(JSON.stringify(mesh)) : null
  resetMarkers()
}
function resetMarkers() {
  markers.value = draft.value ? suggestHumanoidMarkers(draft.value, pose.value) : []
  confirmed.value = []; previewBones.value = []; bend.value = 0; group.value = 'chin'; message.value = ''
}
function move(id: string, point: Vector3D) {
  moveHumanoidMarker(markers.value, id, point, symmetry.value)
  const changed = markers.value.find(m => m.id === id)?.group
  confirmed.value = confirmed.value.filter(g => g !== changed)
}
function confirmGroup() {
  if (!confirmed.value.includes(group.value)) confirmed.value.push(group.value)
  const next = landmarkGroups.find(g => !confirmed.value.includes(g.id))
  if (next) group.value = next.id
}
async function review() {
  if (!draft.value || errors.value.length || confirmed.value.length !== landmarkGroups.length) return
  busy.value = true; message.value = ''
  await nextTick(); await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  try {
    previewBones.value = buildHumanoidRig(draft.value, markers.value, detail.value)
    if (previewBones.value.some(b => Math.hypot(b.tail.x - b.head.x, b.tail.y - b.head.y, b.tail.z - b.head.z) < 1e-6)) throw new Error('Two joint markers overlap. Separate them before continuing.')
    autoWeightMeshToArmature(draft.value, previewBones.value, { method: method.value })
    bend.value = 0; stage.value = 2; view.value = 'perspective'
  } catch (error) { message.value = error instanceof Error ? error.message : 'Could not generate the preview.' }
  finally { busy.value = false }
}
function applyBend() {
  for (const bone of previewBones.value) bone.rotation = { x: 0, y: 0, z: bone.name === testBone.value ? bend.value : 0 }
}
function close() { if (!busy.value) animation.showHumanoidRigWizard = false }
function commit() {
  if (!draft.value || !status.value.ready) return
  if (!animation.commitHumanoidRig(draft.value, previewBones.value)) { message.value = 'The source model changed. Go back to Choose model and reload it before applying.'; return }
  project.selectMesh(meshId.value)
  close(); layout.setInspectorTab('props', 'rig'); layout.showRightSidebar = true
  animation.toggleTestPose(true)
}
function back() { if (stage.value === 2) { stage.value = 1; view.value = 'front'; bend.value = 0 } else stage.value = 0 }
function keys(event: KeyboardEvent) {
  event.stopPropagation()
  if (event.key === 'Escape') close()
  if (event.key !== 'Tab' || !panel.value) return
  const elements = [...panel.value.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), input:not(:disabled), [tabindex="0"]')].filter(el => el.getClientRects().length)
  const first = elements[0], last = elements[elements.length - 1]
  if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.value)) { event.preventDefault(); last?.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
}
onMounted(() => { loadModel(); panel.value?.focus() })
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 p-3 backdrop-blur-sm" @keydown="keys">
      <section ref="panel" role="dialog" aria-modal="true" aria-labelledby="humanoid-title" tabindex="-1" class="flex h-[min(820px,94vh)] w-[min(1200px,96vw)] min-h-0 flex-col overflow-hidden rounded-xl border border-ui-borderStrong bg-ui-panel text-ui-textPrimary shadow-2xl outline-none">
        <header class="flex shrink-0 items-center justify-between border-b border-ui-borderSubtle bg-ui-header px-6 py-4">
          <div class="flex items-center gap-3"><PersonStanding class="h-5 w-5 text-ui-textAccent" /><div><h2 id="humanoid-title" class="text-sm font-semibold">Humanoid auto-rigger</h2><p class="mt-0.5 text-[11px] text-ui-textMuted">Fit to your character. Preview before applying.</p></div></div>
          <button type="button" aria-label="Close humanoid auto-rigger" :disabled="busy" class="rounded p-2 hover:bg-ui-hover disabled:opacity-40" @click="close"><X class="h-4 w-4" /></button>
        </header>
        <div class="flex shrink-0 items-center gap-3 border-b border-ui-borderSubtle px-6 py-3 text-xs"><template v-for="(label, index) in ['Choose model', 'Place markers', 'Review rig']" :key="label"><ChevronRight v-if="index" class="h-3 w-3 text-ui-textMuted" /><span :class="stage === index ? 'font-semibold text-ui-textAccent' : 'text-ui-textMuted'">{{ index + 1 }} · {{ label }}</span></template></div>
        <div class="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_320px] max-[760px]:grid-cols-[minmax(0,1fr)_260px]">
          <div class="relative min-h-0 border-r border-ui-borderSubtle">
            <HumanoidRigPreview v-if="draft?.vertices.length" :mesh="draft" :markers="stage === 0 ? [] : markers" :bones="stage === 2 ? previewBones : draftBones" :active-group="group" :view="view" :review="stage === 2" @move="move" @select="group = $event as LandmarkGroup" />
            <div v-else class="flex h-full items-center justify-center p-8 text-sm text-ui-textMuted">Choose a model with geometry to begin.</div>
            <div v-if="draft" class="absolute left-4 top-4 rounded bg-black/35 px-3 py-2 text-xs text-white">{{ draft.name }}</div>
            <div v-if="draft" class="absolute right-4 top-4 flex gap-1 rounded border border-white/10 bg-ui-header/90 p-1"><UiButton v-for="option in (['front', 'side', 'perspective'] as const)" :key="option" :variant="view === option ? 'accent' : 'ghost'" @click="view = option">{{ option === 'side' ? 'Side' : option === 'front' ? 'Front' : '3D' }}</UiButton></div>
          </div>
          <aside class="min-h-0 overflow-y-auto p-5 text-xs custom-scrollbar space-y-5">
            <template v-if="stage === 0">
              <div><h3 class="text-sm font-semibold">Start with your character</h3><p class="mt-2 leading-relaxed text-ui-textMuted">Use an upright humanoid with visible limbs. T-poses and A-poses both work as starting points.</p></div>
              <label class="block space-y-2"><span>Model</span><select v-model="meshId" aria-label="Humanoid model" class="w-full rounded border border-ui-borderDefault bg-ui-input p-2" @change="loadModel"><option value="" disabled>Choose a model</option><option v-for="mesh in project.meshes" :key="mesh.id" :value="mesh.id">{{ mesh.name }}</option></select></label>
              <label class="block space-y-2"><span>Starting pose</span><select v-model="pose" aria-label="Starting pose" class="w-full rounded border border-ui-borderDefault bg-ui-input p-2" @change="resetMarkers"><option value="t">T-pose · arms out</option><option value="a">A-pose · arms lowered</option></select></label>
              <p class="rounded border border-ui-borderSubtle bg-ui-surface p-3 leading-relaxed text-ui-textMuted">The preview uses neutral shading to make joints easier to see. Your materials and textures are preserved.</p>
              <p class="leading-relaxed text-ui-textMuted">Model should face +Z with Y up. If it is lying down or facing sideways, orient it in Modeling first. Custom and non-humanoid rigs remain in guided rig fitting.</p>
            </template>
            <template v-else-if="stage === 1">
              <div><h3 class="text-sm font-semibold">Place markers</h3><p class="mt-2 leading-relaxed text-ui-textMuted">Drag the colored rings onto your model. Check Front for position and Side for depth.</p></div>
              <div class="rounded border border-ui-borderSubtle bg-ui-surface p-3"><strong :style="{ color: activeGroup.color }">{{ activeGroup.label }}</strong><p class="mt-2 leading-relaxed text-ui-textMuted">{{ activeGroup.hint }}</p></div>
              <UiButton class="w-full" size="md" @click="confirmGroup">Confirm {{ activeGroup.label.toLowerCase() }} <ChevronRight class="h-3 w-3" /></UiButton>
              <div class="space-y-1"><button v-for="item in landmarkGroups" :key="item.id" type="button" class="flex w-full items-center gap-3 rounded border px-3 py-1.5 text-left" :class="group === item.id ? 'border-ui-accent/40 bg-ui-accentSubtle' : 'border-transparent hover:bg-ui-hover'" @click="group = item.id"><span class="h-4 w-4 rounded-full border-[3px]" :style="{ borderColor: item.color }" /><span class="flex-1">{{ item.label }}</span><Check v-if="confirmed.includes(item.id)" class="h-3.5 w-3.5 text-emerald-400" /></button></div>


              <label class="flex items-center justify-between"><span>Use symmetry</span><input v-model="symmetry" type="checkbox" class="accent-ui-accent" /></label>
              <p class="text-[11px] text-ui-textMuted">Turn symmetry off for asymmetric characters. Marker positions are editable independently.</p>
              <label class="block space-y-2"><span>Skeleton detail</span><select v-model="detail" aria-label="Skeleton detail" class="w-full rounded border border-ui-borderDefault bg-ui-input p-2"><option value="standard">Standard · 19 bones</option><option value="simple">Simple · 15 bones</option></select></label>
              <p class="text-[11px] text-ui-textMuted">Includes hands and feet. Individual fingers are not generated.</p>
              <details><summary class="cursor-pointer text-ui-textMuted">Quick start and reset</summary><div class="mt-2 space-y-2"><UiButton class="w-full" @click="confirmed = landmarkGroups.map(g => g.id)">Use all suggested markers</UiButton><UiButton class="w-full" @click="resetMarkers"><RotateCcw class="h-3 w-3" /> Reset markers</UiButton></div></details>
            </template>
            <template v-else>
              <div><h3 class="text-sm font-semibold">Check the deformation</h3><p class="mt-2 leading-relaxed text-ui-textMuted">Try a bend. Go back if a joint is misplaced; weights can also be painted after applying.</p></div>
              <p class="rounded border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-300">{{ previewBones.length }} bones · {{ status.ready ? 'Binding checks passed' : 'Check binding before applying' }}</p>
              <label class="block space-y-2"><span>Test joint</span><select v-model="testBone" aria-label="Preview test joint" class="w-full rounded border border-ui-borderDefault bg-ui-input p-2" @change="applyBend"><option v-for="bone in previewBones" :key="bone.id" :value="bone.name">{{ bone.name }}</option></select></label>
              <label class="block space-y-2"><span>Bend · {{ bend }}°</span><input v-model.number="bend" aria-label="Preview bend" type="range" min="-75" max="75" step="1" class="w-full accent-ui-accent" @input="applyBend" /></label>
              <UiButton class="w-full" @click="bend = 0; applyBend()">Reset preview pose</UiButton>
              <p class="leading-relaxed text-ui-textMuted">Apply adds this skeleton and replaces weights on {{ draft?.name }}. Existing bones and clips are kept. One Undo restores the previous state.</p>
            </template>
            <template v-if="stage === 1"><label class="block space-y-2"><span>Weighting method</span><select v-model="method" aria-label="Wizard weighting method" class="w-full rounded border border-ui-borderDefault bg-ui-input p-2"><option value="surface">Surface smoothing</option><option value="distance">Distance blend</option></select></label><p v-for="error in errors" :key="error" class="text-amber-300 leading-relaxed">{{ error }}</p></template>
            <p v-if="message" role="alert" class="text-amber-300 leading-relaxed">{{ message }}</p>
          </aside>
        </div>
        <footer class="flex shrink-0 items-center justify-between gap-3 border-t border-ui-borderSubtle bg-ui-header px-6 py-4">
          <UiButton size="md" :disabled="busy" @click="stage ? back() : close()">{{ stage ? 'Back' : 'Cancel' }}</UiButton>
          <span class="text-[11px] text-ui-textMuted" aria-live="polite">{{ busy ? 'Calculating preview…' : stage === 1 ? `${confirmed.length} / ${landmarkGroups.length} marker groups confirmed` : 'Changes are applied only when you choose Apply rig' }}</span>
          <UiButton v-if="stage === 0" size="md" variant="primary" :disabled="!draft?.vertices.length" @click="stage = 1; view = 'front'">Place markers <ChevronRight class="h-3.5 w-3.5" /></UiButton>
          <UiButton v-else-if="stage === 1" size="md" variant="primary" :disabled="busy || !!errors.length || confirmed.length !== landmarkGroups.length" @click="review">Review rig <ChevronRight class="h-3.5 w-3.5" /></UiButton>
          <UiButton v-else size="md" variant="primary" :disabled="!status.ready" @click="commit">Apply rig</UiButton>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

