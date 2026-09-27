<script setup lang="ts">
import { computed, ref } from 'vue'
import { Image, Layers3, Sprout, X } from 'lucide-vue-next'
import type { ImageDropChoice } from '../../core/geometry/ImagePlane'

const props = defineProps<{
  previewUrl: string
  fileName: string
  width: number
  height: number
  canApply: boolean
}>()

const emit = defineEmits<{
  confirm: [options: {
    mode: ImageDropChoice
    cardHeight: number
    alphaTest: number
    opacity: number
  }]
  cancel: []
}>()

const selected = ref<ImageDropChoice>(props.canApply ? 'apply' : 'card')
const cardHeight = ref(2)
const alphaTest = ref(0.05)
const opacity = ref(0.65)
const isCard = computed(() => selected.value !== 'apply')
const isReference = computed(() => selected.value === 'reference')

const choices: {
  id: ImageDropChoice
  title: string
  description: string
  icon: typeof Image
}[] = [
  { id: 'apply', title: 'Apply to object', description: 'Texture the object under the cursor.', icon: Image },
  { id: 'card', title: 'Image card', description: 'One clean, double-sided plane.', icon: Layers3 },
  { id: 'vegetation', title: 'Crossed vegetation', description: 'Two planes for trees and grass.', icon: Sprout },
  { id: 'reference', title: 'Reference card', description: 'A translucent, exportable guide.', icon: Image },
]

function confirm() {
  emit('confirm', {
    mode: selected.value,
    cardHeight: Math.max(0.01, Number(cardHeight.value) || 2),
    alphaTest: Math.max(0, Math.min(1, Number(alphaTest.value) || 0)),
    opacity: Math.max(0, Math.min(1, Number(opacity.value) || 0)),
  })
}
</script>

<template>
  <div
    class="absolute inset-0 z-[85] flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
    @click.self="emit('cancel')"
    @keydown.esc="emit('cancel')"
  >
    <section class="w-full max-w-xl overflow-hidden rounded-md border border-ui-borderStrong bg-ui-panel shadow-2xl">
      <header class="flex items-center justify-between border-b border-ui-borderDefault px-4 py-3">
        <div>
          <h2 class="text-sm font-bold text-ui-textPrimary">Place dropped image</h2>
          <p class="mt-0.5 text-[10px] text-ui-textMuted">Choose how this image enters the scene.</p>
        </div>
        <button
          type="button"
          class="rounded-xs p-1 text-ui-textMuted hover:bg-ui-hover hover:text-ui-textPrimary"
          title="Cancel"
          @click="emit('cancel')"
        >
          <X :size="16" />
        </button>
      </header>

      <div class="grid gap-4 p-4 sm:grid-cols-[150px_1fr]">
        <div>
          <div class="flex h-36 items-center justify-center overflow-hidden rounded-xs border border-ui-borderDefault bg-black/30 p-2">
            <img :src="previewUrl" :alt="fileName" class="max-h-full max-w-full object-contain checker-bg" />
          </div>
          <div class="mt-2 truncate text-[11px] font-semibold text-ui-textPrimary" :title="fileName">{{ fileName }}</div>
          <div class="text-[10px] text-ui-textMuted">{{ width }} × {{ height }} px</div>
        </div>

        <div class="space-y-3">
          <div class="grid grid-cols-2 gap-2">
            <button
              v-for="choice in choices"
              :key="choice.id"
              type="button"
              class="flex min-h-20 gap-2 rounded-xs border p-2 text-left transition"
              :class="[
                selected === choice.id
                  ? 'border-ui-accent bg-ui-active text-ui-textAccent'
                  : 'border-ui-borderDefault bg-ui-input text-ui-textSecondary hover:border-ui-borderStrong hover:bg-ui-hover',
                choice.id === 'apply' && !canApply ? 'cursor-not-allowed opacity-40' : ''
              ]"
              :disabled="choice.id === 'apply' && !canApply"
              @click="selected = choice.id"
            >
              <component :is="choice.icon" :size="17" class="mt-0.5 shrink-0" />
              <span>
                <span class="block text-[11px] font-bold text-ui-textPrimary">{{ choice.title }}</span>
                <span class="mt-0.5 block text-[9px] leading-snug">{{ choice.description }}</span>
              </span>
            </button>
          </div>

          <div v-if="isCard" class="grid grid-cols-2 gap-2 rounded-xs border border-ui-borderDefault bg-ui-input p-2">
            <label class="text-[9px] font-semibold uppercase tracking-wide text-ui-textMuted">
              Height
              <input
                v-model.number="cardHeight"
                type="number"
                min="0.01"
                step="0.1"
                class="mt-1 w-full rounded-xs border border-ui-borderDefault bg-ui-root px-2 py-1 text-[11px] text-ui-textPrimary"
              />
            </label>
            <label v-if="isReference" class="text-[9px] font-semibold uppercase tracking-wide text-ui-textMuted">
              Opacity
              <input
                v-model.number="opacity"
                type="number"
                min="0"
                max="1"
                step="0.05"
                class="mt-1 w-full rounded-xs border border-ui-borderDefault bg-ui-root px-2 py-1 text-[11px] text-ui-textPrimary"
              />
            </label>
            <label v-else class="text-[9px] font-semibold uppercase tracking-wide text-ui-textMuted">
              Alpha cutoff
              <input
                v-model.number="alphaTest"
                type="number"
                min="0"
                max="1"
                step="0.01"
                class="mt-1 w-full rounded-xs border border-ui-borderDefault bg-ui-root px-2 py-1 text-[11px] text-ui-textPrimary"
              />
            </label>
          </div>
        </div>
      </div>

      <footer class="flex items-center justify-between border-t border-ui-borderDefault bg-ui-root/30 px-4 py-3">
        <span class="text-[9px] text-ui-textMuted">Cards preserve image aspect ratio and use normal object transforms.</span>
        <div class="flex gap-2">
          <button type="button" class="rounded-xs px-3 py-1.5 text-[11px] text-ui-textSecondary hover:bg-ui-hover" @click="emit('cancel')">
            Cancel
          </button>
          <button type="button" class="rounded-xs bg-ui-accent px-4 py-1.5 text-[11px] font-bold text-white hover:brightness-110" @click="confirm">
            {{ selected === 'apply' ? 'Apply' : 'Create' }}
          </button>
        </div>
      </footer>
    </section>
  </div>
</template>
