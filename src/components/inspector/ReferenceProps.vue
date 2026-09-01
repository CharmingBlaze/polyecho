<script setup lang="ts">
import { ref } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import type { ReferencePlane } from '../../types/reference'
import UiSection from '../ui/UiSection.vue'
import UiButton from '../ui/UiButton.vue'
import { Image, Eye, EyeOff, Trash2, Lock, Unlock, FlipHorizontal } from 'lucide-vue-next'

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
</script>

<template>
  <div class="flex flex-col gap-2 p-2">
    <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFile" />

    <UiSection title="Import" :icon="Image" hint="lightbox" :default-open="true">
      <p class="text-[10px] text-ui-textMuted mb-2 leading-relaxed">
        Drop onto Front or Side, then drag the photo to line it up. Alt-drag in a pane moves that pane’s ref. Shift-drag or Alt-wheel scales.
      </p>
      <div class="grid grid-cols-3 gap-1">
        <UiButton size="xs" @click="pickFile('front')">Front</UiButton>
        <UiButton size="xs" @click="pickFile('side')">Side</UiButton>
        <UiButton size="xs" @click="pickFile('top')">Top</UiButton>
      </div>
    </UiSection>

    <UiSection title="References" :icon="Image" :default-open="true">
      <div v-if="projectStore.referenceImages.length === 0" class="text-[10px] text-ui-textMuted py-2">
        No references yet. Drop an image onto Front or Side.
      </div>
      <div
        v-for="img in projectStore.referenceImages"
        :key="img.id"
        class="border rounded-xs p-2 mb-2 cursor-pointer"
        :class="projectStore.selectedReferenceId === img.id ? 'border-amber-400/70 bg-amber-500/10' : 'border-ui-borderSubtle bg-ui-input/40'"
        @click="projectStore.selectReference(img.id)"
      >
        <div class="flex items-center justify-between gap-1 mb-1.5">
          <span class="text-[10px] font-semibold text-ui-textPrimary truncate">{{ img.name }}</span>
          <div class="flex items-center gap-0.5" @click.stop>
            <button
              type="button"
              class="p-0.5"
              :class="img.locked ? 'text-amber-400' : 'text-ui-textMuted hover:text-ui-textPrimary'"
              :title="img.locked ? 'Unlock to drag' : 'Lock'"
              @click="projectStore.updateReferenceImage(img.id, { locked: !img.locked }, { rebuild: false })"
            >
              <Lock v-if="img.locked" class="w-3 h-3" />
              <Unlock v-else class="w-3 h-3" />
            </button>
            <button
              type="button"
              class="p-0.5 text-ui-textMuted hover:text-ui-textPrimary"
              title="Flip X"
              @click="projectStore.updateReferenceImage(img.id, { flipX: !img.flipX }, { rebuild: false })"
            >
              <FlipHorizontal class="w-3 h-3" />
            </button>
            <button
              type="button"
              class="p-0.5 text-ui-textMuted hover:text-ui-textPrimary"
              :title="img.visible ? 'Hide' : 'Show'"
              @click="projectStore.updateReferenceImage(img.id, { visible: !img.visible })"
            >
              <EyeOff v-if="!img.visible" class="w-3 h-3" />
              <Eye v-else class="w-3 h-3" />
            </button>
            <button
              type="button"
              class="p-0.5 text-ui-textMuted hover:text-rose-400"
              title="Remove"
              @click="projectStore.removeReferenceImage(img.id)"
            >
              <Trash2 class="w-3 h-3" />
            </button>
          </div>
        </div>
        <label class="flex items-center justify-between text-[10px] text-ui-textMuted mb-1">
          <span>Plane</span>
          <select
            class="bg-ui-input border border-ui-borderDefault rounded-xs text-[10px] text-ui-textPrimary px-1 py-0.5"
            :value="img.plane"
            @click.stop
            @change="projectStore.updateReferenceImage(img.id, { plane: ($event.target as HTMLSelectElement).value as ReferencePlane })"
          >
            <option value="front">Front</option>
            <option value="side">Side</option>
            <option value="top">Top</option>
          </select>
        </label>
        <label class="block text-[10px] text-ui-textMuted mb-1">
          Opacity {{ Math.round(img.opacity * 100) }}%
          <input type="range" min="0.1" max="1" step="0.05" class="w-full" :value="img.opacity" @click.stop @input="patch(img.id, { opacity: Number(($event.target as HTMLInputElement).value) })" />
        </label>
        <label class="block text-[10px] text-ui-textMuted mb-1">
          Scale {{ img.scale.toFixed(1) }}
          <input type="range" min="0.5" max="16" step="0.25" class="w-full" :value="img.scale" @click.stop @input="patch(img.id, { scale: Number(($event.target as HTMLInputElement).value) })" />
        </label>
        <label class="block text-[10px] text-ui-textMuted mb-1">
          Move X {{ img.offsetX.toFixed(2) }}
          <input type="range" min="-12" max="12" step="0.05" class="w-full" :value="img.offsetX" @click.stop @input="patch(img.id, { offsetX: Number(($event.target as HTMLInputElement).value) })" />
        </label>
        <label class="block text-[10px] text-ui-textMuted">
          Move Y {{ img.offsetY.toFixed(2) }}
          <input type="range" min="-12" max="12" step="0.05" class="w-full" :value="img.offsetY" @click.stop @input="patch(img.id, { offsetY: Number(($event.target as HTMLInputElement).value) })" />
        </label>
      </div>
    </UiSection>
  </div>
</template>
