<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Bone, Check, ChevronRight, Paintbrush, Play, Sparkles } from 'lucide-vue-next'
import { useAnimationStore } from '../../stores/animationStore'
import { useProjectStore } from '../../stores/projectStore'
import { useLayoutStore } from '../../stores/layoutStore'
import { useToolStore } from '../../stores/toolStore'
import { inspectRig, rigPresets, type RigPresetId } from '../../core/animation/RiggingWorkflow'
import UiButton from '../ui/UiButton.vue'
import SkeletonPanel from './SkeletonPanel.vue'
import RiggingPanel from './RiggingPanel.vue'
import BindingsPanel from './BindingsPanel.vue'
import WeightsPanel from './WeightsPanel.vue'

const animation = useAnimationStore()
const project = useProjectStore()
const layout = useLayoutStore()
const tools = useToolStore()
const mesh = computed(() => project.activeMesh)
const health = computed(() => inspectRig(mesh.value, animation.armature.bones))
const preset = ref<RigPresetId>('human')
const message = ref('')
const showPresets = ref(false)
const advancedBinding = ref(false)
const search = ref('')
const content = ref<HTMLElement | null>(null)
const step = computed(() => animation.isTestPoseActive ? 'test' : animation.isWeightPaintActive || layout.inspectorTab === 'weights' ? 'weights' : layout.inspectorTab === 'bindings' ? 'attach' : 'skeleton')
const steps = [
  { id: 'skeleton', label: 'Skeleton', icon: Bone },
  { id: 'attach', label: 'Attach', icon: Sparkles },
  { id: 'weights', label: 'Weights', icon: Paintbrush },
  { id: 'test', label: 'Test', icon: Play },
] as const
const filteredBones = computed(() => animation.armature.bones.filter(b => b.name.toLowerCase().includes(search.value.toLowerCase())))
watch(() => mesh.value?.id, () => { message.value = '' })
watch(() => animation.isWeightPaintActive, active => {
  if (active) layout.setInspectorTab('weights', 'rig')
})
watch(step, async () => { await nextTick(); content.value?.scrollTo({ top: 0 }) })
function go(next: string) {
  animation.toggleWeightPaint(false)
  animation.toggleTestPose(next === 'test')
  animation.clickToPlaceMode = false
  layout.setInspectorTab(next === 'weights' ? 'weights' : next === 'attach' ? 'bindings' : next === 'test' ? 'props' : 'skeleton', 'rig')
  tools.setSelectMode('bone')
  message.value = ''
}
function addPreset() {
  if (!mesh.value) return
  if (animation.addRigPreset(mesh.value.id, preset.value)) {
    showPresets.value = false
    message.value = 'Skeleton added. Move its joints to match your model before attaching.'
  }
}
function attachSmooth() {
  if (!mesh.value || !animation.armature.bones.length) return
  project.recordState('Attach Mesh with Automatic Weights')
  animation.autoWeightMeshToBones(mesh.value)
  message.value = 'Automatic weights applied. Test a bend next; refine any problem areas with the brush. Undo restores previous weights.'
}
function attachRigid() {
  if (!mesh.value || !animation.selectedBone) return
  message.value = animation.bindSelectedGeometry('object', animation.selectedBone.id).message
}
function animate() {
  animation.toggleWeightPaint(false)
  animation.toggleTestPose(false)
  animation.clickToPlaceMode = false
  tools.setAppMode('animate')
}
</script>

<template>
  <section class="rig-workspace flex min-h-0 flex-1 flex-col text-xs text-ui-textPrimary" aria-label="Rigging workspace">
    <header class="shrink-0 border-b border-ui-borderSubtle bg-ui-header p-3 space-y-3">
      <div class="flex items-center justify-between gap-2">
        <span class="flex items-center gap-2 font-semibold"><Bone class="h-4 w-4 text-ui-textAccent" /> Rig your model</span>
        <span class="text-[10px] text-ui-textMuted">{{ animation.armature.bones.length }} bones</span>
      </div>
      <div class="flex items-center justify-between gap-2">
        <label class="flex items-center gap-1.5 text-[11px] text-ui-textSecondary"><input type="checkbox" :checked="animation.showBones" class="accent-ui-accent" @change="animation.setShowBones(($event.target as HTMLInputElement).checked)" /> Show bones</label>
        <label class="flex items-center gap-1.5 text-[11px] text-ui-textSecondary"><input v-model="animation.xrayBones" type="checkbox" class="accent-ui-accent" /> Through mesh</label>
      </div>
      <label class="block text-[10px] text-ui-textMuted">Working on
        <select aria-label="Model to rig" :value="mesh?.id || ''" class="mt-1 w-full rounded-xs border border-ui-borderDefault bg-ui-input px-2 py-1.5 text-xs text-ui-textPrimary" @change="project.selectMesh(($event.target as HTMLSelectElement).value)">
          <option value="" disabled>Choose a model</option>
          <option v-for="item in project.meshes" :key="item.id" :value="item.id">{{ item.name }}</option>
        </select>
      </label>
      <nav class="grid grid-cols-4 gap-1" aria-label="Rigging steps">
        <button v-for="(item, index) in steps" :key="item.id" type="button" :aria-current="step === item.id ? 'step' : undefined" class="flex min-w-0 flex-col items-center gap-1 rounded-xs border px-1 py-2 transition focus-visible:outline focus-visible:outline-ui-accent" :class="step === item.id ? 'border-ui-accent/40 bg-ui-accentSubtle text-ui-textAccent' : 'border-transparent text-ui-textMuted hover:bg-ui-hover hover:text-ui-textPrimary'" @click="go(item.id)">
          <component :is="item.icon" class="h-3.5 w-3.5" />
          <span class="text-[10px]">{{ index + 1 }} {{ item.label }}</span>
        </button>
      </nav>
    </header>

    <div ref="content" class="min-h-0 flex-1 overflow-y-auto custom-scrollbar p-2 space-y-3">
      <p v-if="!project.meshes.length" class="rounded-xs border border-amber-500/30 bg-amber-950/30 p-3 leading-relaxed text-amber-100 space-y-2">
        Add a mesh in Modeling or Blockout, then come back here to fit a skeleton.
        <UiButton size="xs" class="w-full" variant="accent" @click="tools.setAppMode('model')">Go to Modeling</UiButton>
      </p>
      <p v-else-if="!mesh" class="rounded-xs border border-ui-borderSubtle bg-ui-surface p-3 leading-relaxed text-ui-textSecondary">Choose a model above to fit a skeleton and attach it. You can also build custom bones without a model.</p>
      <p v-if="message" role="status" class="rounded-xs border border-ui-accent/30 bg-ui-accentSubtle p-2 leading-relaxed text-ui-textSecondary">{{ message }}</p>

      <template v-if="step === 'skeleton'">
        <div class="px-1 space-y-1">
          <h2 class="font-semibold">Start with a shape. Make it yours.</h2>
          <p class="text-[11px] leading-relaxed text-ui-textMuted">Fit a starter skeleton, or draw joints for anything custom. Place pivots where your model should bend.</p>
        </div>
        <UiButton class="w-full" size="md" variant="accent" @click="animation.showRigFitPopup = false; animation.showHumanoidRigWizard = true">Humanoid auto-rigger</UiButton>
        <UiButton class="w-full" size="sm" @click="animation.showRigFitPopup = true">Custom rig fitting</UiButton>
        <div v-if="!animation.armature.bones.length || showPresets" class="space-y-2 rounded-xs border border-ui-borderSubtle bg-ui-surface p-2">
          <div class="grid grid-cols-2 gap-1.5">
            <button v-for="item in rigPresets" :key="item.id" type="button" :aria-pressed="preset === item.id" class="rounded-xs border p-2 text-left focus-visible:outline focus-visible:outline-ui-accent" :class="preset === item.id ? 'border-ui-accent/50 bg-ui-accentSubtle' : 'border-ui-borderSubtle hover:bg-ui-hover'" @click="preset = item.id">
              <span class="block text-[11px] font-medium">{{ item.name }}</span>
              <span class="mt-1 block text-[10px] leading-relaxed text-ui-textMuted">{{ item.description }}</span>
            </button>
          </div>
          <p class="text-[10px] leading-relaxed text-ui-textMuted">Fits the model’s bounds. Check front and side views and adjust joints to your model’s anatomy. Existing bones are kept.</p>
          <UiButton class="w-full" size="md" variant="primary" :disabled="!mesh?.vertices.length" @click="addPreset"><Sparkles class="h-3.5 w-3.5" /> Add fitted skeleton</UiButton>
        </div>
        <UiButton v-else class="w-full" @click="showPresets = true">Add another starter skeleton</UiButton>
        <SkeletonPanel />
        <details v-if="animation.selectedBone" class="rounded-xs border border-ui-borderSubtle">
          <summary class="cursor-pointer p-2 text-ui-textSecondary">Edit {{ animation.selectedBone.name }} · joint settings</summary>
          <RiggingPanel />
        </details>
        <UiButton class="w-full" size="md" variant="primary" :disabled="!mesh || !animation.armature.bones.length" @click="go('attach')">Next: attach model <ChevronRight class="h-3.5 w-3.5" /></UiButton>
      </template>

      <template v-else-if="step === 'attach'">
        <div class="px-1 space-y-1">
          <h2 class="font-semibold">How should this model move?</h2>
          <p class="text-[11px] leading-relaxed text-ui-textMuted">Attach each model part in turn. Flexible surfaces blend between joints; solid parts follow one bone.</p>
        </div>
        <p v-if="!animation.armature.bones.length" class="text-amber-300 p-2">Add a skeleton in step 1 first.</p>
        <div class="rounded-xs border border-ui-borderSubtle bg-ui-surface p-3 space-y-2">
          <h3 class="font-medium">Flexible surface</h3>
          <select v-model="animation.autoSkinMethod" aria-label="Skinning method" class="w-full rounded-xs border border-ui-borderDefault bg-ui-input p-1.5"><option value="surface">Surface smoothing</option><option value="distance">Distance blend</option></select>
          <p class="text-[11px] leading-relaxed text-ui-textMuted">Skin, clothing, wings and tails. Automatically blends up to four nearby bones per vertex.</p>
          <UiButton class="w-full" size="md" variant="primary" :disabled="!mesh?.vertices.length || !animation.armature.bones.length" @click="attachSmooth">{{ health.ready ? 'Recalculate automatic weights' : 'Attach with automatic weights' }}</UiButton>
          <p class="text-[10px] text-ui-textMuted">Replaces this model’s weights and rigid bone attachment.</p>
        </div>
        <div class="rounded-xs border border-ui-borderSubtle bg-ui-surface p-3 space-y-2">
          <h3 class="font-medium">Solid part</h3>
          <p class="text-[11px] leading-relaxed text-ui-textMuted">Robot parts, doors and props. Keeps the whole piece rigid.</p>
          <select aria-label="Attachment bone" :value="animation.selectedBoneId || ''" class="w-full rounded-xs border border-ui-borderDefault bg-ui-input p-1.5" @change="animation.selectBone(($event.target as HTMLSelectElement).value)">
            <option value="" disabled>Choose a bone</option>
            <option v-for="bone in animation.armature.bones" :key="bone.id" :value="bone.id">{{ bone.name }}</option>
          </select>
          <UiButton class="w-full" size="md" :disabled="!mesh || !animation.selectedBone" @click="attachRigid">Attach to selected bone</UiButton>
          <p class="text-[10px] text-ui-textMuted">Replaces this model’s painted weights. Undo restores them.</p>
        </div>
        <details :open="advancedBinding" @toggle="advancedBinding = ($event.target as HTMLDetailsElement).open">
          <summary class="cursor-pointer p-2 text-ui-textSecondary">Advanced: selected faces, vertices and unbinding</summary>
          <BindingsPanel />
        </details>
        <UiButton class="w-full" size="md" variant="primary" :disabled="!mesh || !animation.armature.bones.length" @click="go('test')">Test how it bends <Play class="h-3.5 w-3.5" /></UiButton>
      </template>

      <template v-else-if="step === 'weights'">
        <p class="px-1 text-[11px] leading-relaxed text-ui-textMuted">Refine only where needed. Choose a bone, turn on Paint, then brush the model. Red follows that bone strongly; blue has no influence.</p>
        <p v-if="health.rigid" class="rounded-xs border border-amber-500/30 p-2 text-amber-300 text-[11px]">This part is attached rigidly. Use automatic weights in Attach to switch to a flexible surface before painting.</p>
        <WeightsPanel />
        <UiButton class="w-full" size="md" @click="go('test')">Test your changes <Play class="h-3.5 w-3.5" /></UiButton>
      </template>

      <template v-else>
        <div class="px-1 space-y-1">
          <h2 class="font-semibold">Try a bend before animating</h2>
          <p class="text-[11px] leading-relaxed text-ui-textMuted">Select a bone and rotate it below or in the viewport. This is a temporary pose; no keyframes are recorded.</p>
        </div>
        <div class="rounded-xs border border-ui-borderSubtle bg-ui-surface p-3 space-y-2" aria-live="polite">
          <p class="flex items-center gap-2 font-medium"><Check v-if="health.ready" class="h-4 w-4 text-emerald-400" />{{ health.ready ? 'Binding checks passed' : 'Before you animate' }}</p>
          <p v-if="!mesh" class="text-ui-textMuted">Choose a model to check its binding.</p>
          <p v-if="!animation.armature.bones.length" class="text-ui-textMuted">Add bones in Skeleton.</p>
          <p v-if="health.unweighted" class="text-amber-300">{{ health.unweighted }} vertices have no bone influence. Attach or paint them.</p>
          <p v-if="health.invalid" class="text-amber-300">{{ health.invalid }} vertices have invalid or unnormalized weights. Recalculate or repair weights.</p>
          <p v-if="health.brokenBones" class="text-amber-300">{{ health.brokenBones }} bones need their length or parent fixed.</p>
          <p v-if="health.ready" class="text-[11px] text-ui-textMuted">{{ health.rigid ? 'Solid attachment found.' : 'Every vertex has normalized bone weights.' }} Check shoulders, knees and other joints visually.</p>
        </div>
        <input v-model="search" type="search" aria-label="Find a bone" placeholder="Find a bone…" class="w-full rounded-xs border border-ui-borderDefault bg-ui-input px-2 py-1.5" />
        <div class="max-h-36 overflow-y-auto rounded-xs border border-ui-borderSubtle">
          <button v-for="bone in filteredBones" :key="bone.id" type="button" class="block w-full px-2 py-1.5 text-left" :class="bone.id === animation.selectedBoneId ? 'bg-ui-active text-ui-textAccent' : 'hover:bg-ui-hover text-ui-textSecondary'" @click="animation.selectBone(bone.id)">{{ bone.name }}</button>
          <p v-if="!filteredBones.length" class="p-2 text-ui-textMuted">No matching bones.</p>
        </div>
        <div v-if="animation.selectedBone" class="space-y-3 rounded-xs border border-ui-borderSubtle p-3">
          <p class="font-medium truncate">{{ animation.selectedBone.name }}</p>
          <label v-for="axis in (['x', 'y', 'z'] as const)" :key="axis" class="block text-[11px] text-ui-textSecondary">
            <span class="flex justify-between"><span>Rotate {{ axis.toUpperCase() }}</span><span>{{ Math.round(animation.selectedBone.rotation[axis]) }}°</span></span>
            <input v-model.number="animation.selectedBone.rotation[axis]" :aria-label="`Test rotation ${axis.toUpperCase()}`" type="range" min="-90" max="90" step="1" class="mt-2 w-full accent-ui-accent" />
          </label>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <UiButton @click="animation.resetAllBonesToRest()">Reset test pose</UiButton>
          <UiButton @click="go('weights')">Refine weights</UiButton>
        </div>
        <UiButton class="w-full" size="md" variant="primary" :disabled="!animation.armature.bones.length" @click="animate">Open Animation <ChevronRight class="h-3.5 w-3.5" /></UiButton>
      </template>
    </div>
    <footer class="shrink-0 border-t border-ui-borderSubtle bg-ui-header px-3 py-2 text-[10px] text-ui-textMuted">{{ step === 'test' ? 'Temporary pose · reset when you leave this step' : 'Tip: Ctrl+Z undoes skeleton and binding changes' }}</footer>
  </section>
</template>
