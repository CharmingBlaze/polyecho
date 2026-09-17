<script setup lang="ts">
import { ref } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import type { ReferencePlane } from '../../types/reference'
import UiSection from '../ui/UiSection.vue'
import UiButton from '../ui/UiButton.vue'
import BlenderIcon from '../icons/BlenderIcon.vue'

const projectStore = useProjectStore()
const fileInput = ref<HTMLInputElement | null>(null)
const importPlane = ref<ReferencePlane>('front')

function pickFile(plane: ReferencePlane) {
  importPlane.value = plane
  fileInput.value?.click()
}

function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    const dataUrl = typeof reader.result === 'string' ? reader.result : ''
    if (dataUrl) projectStore.setReferenceOnPlane(importPlane.value, dataUrl, file.name)
  }
  reader.readAsDataURL(file)
}

function patch(id: string, data: Record<string, unknown>) {
  projectStore.updateReferenceImage(id, data as any, { rebuild: false })
}

function beginAdjustment() {
  projectStore.recordReferenceEdit('Adjust Reference')
}

function edit(id: string, data: Record<string, unknown>, label = 'Edit Reference') {
  projectStore.recordReferenceEdit(label)
  projectStore.updateReferenceImage(id, data as any, { rebuild: false })
}
</script>

<template>
  <div class="flex flex-col">
    <div class="inspector-head">
      <div class="inspector-head-kicker">
        <BlenderIcon name="image" :size="12" />
        <span>References</span>
      </div>
      <span class="inspector-head-name">{{ projectStore.referenceImages.length ? `${projectStore.referenceImages.length}` : 'None' }}</span>
    </div>
    <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFile" />

    <UiSection title="Import" blender-icon="image" hint="lightbox" :default-open="true">
      <p class="text-[10px] text-ui-textMuted mb-2 leading-relaxed">
        Drop a drawing on Front or Side, then line it up in the matching view. Drag the image to move it; Shift-drag or Alt-wheel scales it. Lock it before tracing.
      </p>
      <div class="grid grid-cols-3 gap-1">
        <UiButton size="xs" @click="pickFile('front')">Front</UiButton>
        <UiButton size="xs" @click="pickFile('side')">Side</UiButton>
        <UiButton size="xs" @click="pickFile('top')">Top</UiButton>
      </div>
    </UiSection>

    <UiSection title="References" blender-icon="image" :default-open="true">
      <div v-if="projectStore.referenceImages.length === 0" class="text-[10px] text-ui-textMuted py-2">
        No references yet. Drop an image onto Front or Side.
      </div>
      <div
        v-for="img in projectStore.referenceImages"
        :key="img.id"
        class="border rounded-xs p-2 mb-2 cursor-pointer"
        :class="projectStore.selectedReferenceId === img.id ? 'border-ui-borderStrong bg-ui-active' : 'border-ui-borderSubtle bg-ui-input/40'"
        @click="projectStore.selectReference(img.id)"
      >
        <div class="flex items-center justify-between gap-1 mb-1.5">
          <span class="text-[10px] font-semibold text-ui-textPrimary truncate">{{ img.name }}</span>
          <div class="flex items-center gap-0.5" @click.stop>
            <button
              type="button"
              class="p-0.5"
              :class="img.locked ? 'text-ui-textAccent' : 'text-ui-textMuted hover:text-ui-textPrimary'"
              :title="img.locked ? 'Unlock to drag' : 'Lock'"
              @click="edit(img.id, { locked: !img.locked }, img.locked ? 'Unlock Reference' : 'Lock Reference')"
            >
              <BlenderIcon v-if="img.locked" name="lock" :size="12" />
              <BlenderIcon v-else name="unlock" :size="12" />
            </button>
            <button
              type="button"
              class="p-0.5 text-ui-textMuted hover:text-ui-textPrimary"
              title="Flip X"
              @click="edit(img.id, { flipX: !img.flipX }, 'Flip Reference')"
            >
              <BlenderIcon name="flip-horizontal" :size="12" />
            </button>
            <button
              type="button"
              class="p-0.5 text-ui-textMuted hover:text-ui-textPrimary"
              :title="img.visible ? 'Hide' : 'Show'"
              @click="edit(img.id, { visible: !img.visible }, img.visible ? 'Hide Reference' : 'Show Reference')"
            >
              <BlenderIcon v-if="!img.visible" name="eye-closed" :size="12" />
              <BlenderIcon v-else name="eye-open" :size="12" />
            </button>
            <button
              type="button"
              class="p-0.5 text-ui-textMuted hover:text-rose-400"
              title="Remove"
              @click="projectStore.removeReferenceImage(img.id)"
            >
              <BlenderIcon name="trash" :size="12" />
            </button>
          </div>
        </div>
        <label class="flex items-center justify-between text-[10px] text-ui-textMuted mb-1">
          <span>Plane</span>
          <select
            class="bg-ui-input border border-ui-borderDefault rounded-xs text-[10px] text-ui-textPrimary px-1 py-0.5"
            :value="img.plane"
            @click.stop
            @change="edit(img.id, { plane: ($event.target as HTMLSelectElement).value as ReferencePlane }, 'Move Reference Plane')"
          >
            <option value="front">Front</option>
            <option value="side">Side</option>
            <option value="top">Top</option>
          </select>
        </label>
        <label class="block text-[10px] text-ui-textMuted mb-1">
          Opacity {{ Math.round(img.opacity * 100) }}%
          <input type="range" min="0.1" max="1" step="0.05" class="w-full" :value="img.opacity" @click.stop @pointerdown="beginAdjustment" @input="patch(img.id, { opacity: Number(($event.target as HTMLInputElement).value) })" />
        </label>
        <label class="block text-[10px] text-ui-textMuted mb-1">
          Scale {{ img.scale.toFixed(1) }}
          <input type="range" min="0.5" max="16" step="0.25" class="w-full" :value="img.scale" @click.stop @pointerdown="beginAdjustment" @input="patch(img.id, { scale: Number(($event.target as HTMLInputElement).value) })" />
        </label>
        <label class="block text-[10px] text-ui-textMuted mb-1">
          Move X {{ img.offsetX.toFixed(2) }}
          <input type="range" min="-12" max="12" step="0.05" class="w-full" :value="img.offsetX" @click.stop @pointerdown="beginAdjustment" @input="patch(img.id, { offsetX: Number(($event.target as HTMLInputElement).value) })" />
        </label>
        <label class="block text-[10px] text-ui-textMuted">
          Move Y {{ img.offsetY.toFixed(2) }}
          <input type="range" min="-12" max="12" step="0.05" class="w-full" :value="img.offsetY" @click.stop @pointerdown="beginAdjustment" @input="patch(img.id, { offsetY: Number(($event.target as HTMLInputElement).value) })" />
        </label>
        <UiButton size="xs" class="w-full mt-1" @click.stop="projectStore.resetReferenceImageTransform(img.id)">
          Reset alignment
        </UiButton>
      </div>
    </UiSection>
  </div>
</template>
