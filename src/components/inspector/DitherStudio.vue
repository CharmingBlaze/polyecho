<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import UiSection from '../ui/UiSection.vue'
import UiButton from '../ui/UiButton.vue'
import { Sparkles } from 'lucide-vue-next'
import type { DitherPattern } from '../../types/texture'
import { PixelBuffer } from '../../core/painting/PixelCanvas'
import { DITHER_LOOK_GROUPS, ditherPresetsInGroup, type DitherPreset } from '../../utils/dithering'
import { resolveMaterialFill } from '../../core/materials/MaterialFill'
import {
  COLOR_DEPTH_OPTIONS,
  DITHER_PATTERN_OPTIONS,
  paintDitherPreview,
  rasterizeDitheredFill,
  suggestedPreviewSource,
  type DitherPreviewSource
} from '../../core/materials/DitherPreview'

const projectStore = useProjectStore()
const previewRef = ref<HTMLCanvasElement | null>(null)
const splitCompare = ref(true)
const sourceOverride = ref<DitherPreviewSource | 'auto'>('auto')
const thumbCanvases = ref<Record<string, HTMLCanvasElement | null>>({})

const mat = computed(() => projectStore.activeMaterial)

const previewSource = computed<DitherPreviewSource>(() => {
  if (sourceOverride.value !== 'auto') return sourceOverride.value
  return mat.value ? suggestedPreviewSource(mat.value) : 'ramp'
})

const boundImage = computed(() => {
  const id = mat.value?.textureId
  if (!id) return null
  return projectStore.textures.find(tex => tex.id === id)?.pixelBuffer?.canvas ?? null
})

function beginEdit() {
  projectStore.recordState('Edit Dither')
}

function redraw() {
  const canvas = previewRef.value
  const material = mat.value
  if (!canvas || !material) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  paintDitherPreview(ctx, canvas.width, canvas.height, { ...material, dither: true }, {
    source: previewSource.value,
    split: splitCompare.value,
    image: boundImage.value
  })
}

function setThumb(id: string, el: HTMLCanvasElement | null) {
  thumbCanvases.value[id] = el
  if (!el) return
  const ctx = el.getContext('2d')
  if (!ctx || !mat.value) return
  const fake = { ...mat.value, dither: true, ditherPattern: id as DitherPattern }
  paintDitherPreview(ctx, el.width, el.height, fake, { source: 'ramp', split: false })
}

function choosePattern(id: DitherPattern) {
  if (!mat.value) return
  beginEdit()
  mat.value.dither = true
  mat.value.ditherPattern = id
  projectStore.markGeometryUpdated()
}

function applyLook(preset: DitherPreset) {
  if (!mat.value) return
  projectStore.recordState(`Dither look: ${preset.name}`)
  mat.value.dither = true
  mat.value.ditherPattern = preset.pattern
  mat.value.ditherLevel = preset.ditherLevel
  mat.value.colorDepth = preset.colorDepth
  mat.value.ditherScale = preset.scale
  if (preset.space) mat.value.ditherSpace = preset.space
  if (preset.channel) mat.value.ditherChannel = preset.channel
  projectStore.markGeometryUpdated()
}

function writePixels(buf: PixelBuffer, pixels: ImageData) {
  buf.ensureDrawable()
  buf.layerCtx().putImageData(pixels, 0, 0)
  buf.commitLayers()
}

function applyDitherToImage() {
  const material = mat.value
  if (!material) return
  const source = previewSource.value
  const fill = resolveMaterialFill(material)
  const bound = material.textureId
    ? projectStore.textures.find(tex => tex.id === material.textureId)
    : null
  const overwrite = Boolean(
    bound?.pixelBuffer
    && (source === 'image' || (source === 'material' && fill === 'image'))
  )
  const width = bound?.pixelBuffer?.width || bound?.width || 64
  const height = bound?.pixelBuffer?.height || bound?.height || 64
  const pixels = rasterizeDitheredFill(material, width, height, source, boundImage.value)

  if (overwrite && bound?.pixelBuffer) {
    projectStore.recordPixels('Apply Dither')
    writePixels(bound.pixelBuffer, pixels)
    bound.width = pixels.width
    bound.height = pixels.height
    bound.dataUrl = bound.pixelBuffer.toDataURL()
    material.dither = false
    projectStore.markTextureUpdated(bound.id)
    projectStore.markGeometryUpdated()
    return
  }

  const buf = new PixelBuffer(pixels.width, pixels.height)
  writePixels(buf, pixels)
  const tex = projectStore.createTexture(
    `${material.name} dither`,
    pixels.width,
    pixels.height,
    undefined,
    buf
  )
  projectStore.applyTextureToMaterial(material.id, tex.id, { record: false })
  material.dither = false
  projectStore.markGeometryUpdated()
}

function lookActive(preset: DitherPreset) {
  const material = mat.value
  if (!material?.dither) return false
  return (material.ditherPattern || 'bayer4x4') === preset.pattern
    && (material.ditherLevel ?? 32) === preset.ditherLevel
    && (material.colorDepth ?? 32) === preset.colorDepth
    && (material.ditherScale ?? 1) === preset.scale
}

watch(
  () => {
    const material = mat.value
    return [
      material?.id,
      material?.dither,
      material?.ditherPattern,
      material?.ditherLevel,
      material?.ditherScale,
      material?.ditherChannel,
      material?.colorDepth,
      material?.color,
      material?.fill,
      material?.gradient,
      material?.textureId,
      previewSource.value,
      splitCompare.value,
      projectStore.textureRevision,
      boundImage.value
    ]
  },
  () => nextTick(redraw),
  { immediate: true }
)

watch(
  () => [mat.value?.ditherPattern, mat.value?.ditherLevel, mat.value?.colorDepth, mat.value?.ditherScale],
  () => {
    for (const [id, el] of Object.entries(thumbCanvases.value)) setThumb(id, el)
  }
)

onMounted(() => nextTick(redraw))

const strengthPct = computed(() => Math.round(((mat.value?.ditherLevel ?? 32) / 32) * 100))
</script>

<template>
  <UiSection v-if="mat" title="Dither" :icon="Sparkles" :default-open="true">
    <p class="text-[10px] leading-snug text-ui-textMuted">
      Preview a pattern on color, a gradient, or an image. Live dither runs in the 3D view. Apply writes those pixels into a texture so UV/Paint and export keep them.
    </p>

    <label class="flex items-center justify-between cursor-pointer bg-ui-surface px-2 h-7 rounded-xs border border-ui-borderSubtle">
      <span class="text-ui-textSecondary text-[10px] font-semibold">Show dither in the viewport</span>
      <input
        v-model="mat.dither"
        type="checkbox"
        class="rounded-xs text-ui-accent bg-ui-panel border-ui-borderDefault focus:ring-0 cursor-pointer"
        @mousedown="beginEdit"
        @change="projectStore.markGeometryUpdated()"
      >
    </label>

    <div class="space-y-1">
      <div class="flex items-center justify-between">
        <span class="text-[9px] uppercase tracking-wide text-ui-textMuted">Preview</span>
        <label class="flex items-center gap-1 text-[10px] text-ui-textSecondary cursor-pointer">
          <input v-model="splitCompare" type="checkbox" class="rounded-xs">
          Split
        </label>
      </div>
      <div class="relative">
        <canvas
          ref="previewRef"
          width="320"
          height="140"
          class="w-full h-[140px] rounded-xs border border-ui-borderSubtle bg-black block [image-rendering:pixelated]"
        />
        <div
          v-if="splitCompare"
          class="pointer-events-none absolute inset-0 flex text-[9px] font-bold uppercase tracking-wide"
        >
          <span class="flex-1 px-1.5 pt-1 text-white/70">Original</span>
          <span class="w-px bg-white/40 self-stretch" />
          <span class="flex-1 px-1.5 pt-1 text-right text-white/70">Dithered</span>
        </div>
      </div>
      <nav class="inspector-seg is-stretch" aria-label="What to dither in the preview">
        <button
          v-for="item in ([
            { id: 'auto', label: 'This look' },
            { id: 'ramp', label: 'Gray ramp' },
            { id: 'color', label: 'Color' },
            { id: 'gradient', label: 'Gradient' },
            { id: 'image', label: 'Image' }
          ] as const)"
          :key="item.id"
          type="button"
          class="inspector-seg-btn"
          :class="{ 'is-active': sourceOverride === item.id || (item.id === 'auto' && sourceOverride === 'auto') }"
          @click="sourceOverride = item.id"
        >
          {{ item.label }}
        </button>
      </nav>
      <UiButton
        variant="primary"
        size="sm"
        class="w-full"
        title="Write the dithered preview into a texture. Live viewport dither turns off so it is not applied twice."
        @click="applyDitherToImage"
      >
        Apply dither to image
      </UiButton>
    </div>

    <div class="space-y-1">
      <div class="text-[9px] uppercase tracking-wide text-ui-textMuted">Pattern</div>
      <div class="grid grid-cols-3 gap-1">
        <button
          v-for="item in DITHER_PATTERN_OPTIONS"
          :key="item.id"
          type="button"
          class="flex flex-col gap-0.5 p-0.5 rounded-xs border text-left cursor-pointer"
          :class="(mat.ditherPattern || 'bayer4x4') === item.id
            ? 'border-ui-accent bg-ui-active'
            : 'border-ui-borderSubtle bg-ui-surface hover:border-ui-borderDefault'"
          :title="item.hint"
          @click="choosePattern(item.id)"
        >
          <canvas
            :ref="el => setThumb(item.id, el as HTMLCanvasElement | null)"
            width="72"
            height="20"
            class="w-full h-5 rounded-[1px] [image-rendering:pixelated]"
          />
          <span class="px-0.5 text-[9px] text-ui-textSecondary truncate">{{ item.label }}</span>
        </button>
      </div>
    </div>

    <div class="flex items-center justify-between text-[10px]">
      <span class="text-ui-textSecondary">Strength</span>
      <span class="font-mono inspector-value">{{ strengthPct }}%</span>
    </div>
    <input
      v-model.number="mat.ditherLevel"
      type="range"
      min="4"
      max="64"
      step="1"
      class="inspector-range"
      aria-label="Dither strength"
      @mousedown="beginEdit"
      @input="projectStore.markGeometryUpdated()"
    >

    <div class="flex items-center justify-between text-[10px]">
      <span class="text-ui-textSecondary">Pixel size</span>
      <span class="font-mono inspector-value">{{ mat.ditherScale ?? 1 }}×</span>
    </div>
    <input
      type="range"
      min="1"
      max="4"
      step="1"
      :value="mat.ditherScale ?? 1"
      class="inspector-range"
      aria-label="Dither pixel size"
      @mousedown="beginEdit"
      @input="mat.ditherScale = Number(($event.target as HTMLInputElement).value); projectStore.markGeometryUpdated()"
    >

    <label class="block space-y-0.5">
      <span class="text-[10px] text-ui-textSecondary">Reduce colors to</span>
      <select
        v-model.number="mat.colorDepth"
        class="w-full h-7 bg-ui-surface border border-ui-borderSubtle rounded-xs px-2 text-ui-textPrimary text-[10px] focus:outline-none cursor-pointer"
        @mousedown="beginEdit"
        @change="projectStore.markGeometryUpdated()"
      >
        <option v-for="option in COLOR_DEPTH_OPTIONS" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
    </label>

    <div class="grid grid-cols-2 gap-1.5">
      <label class="block space-y-0.5">
        <span class="text-[10px] text-ui-textSecondary">Dither</span>
        <select
          v-model="mat.ditherChannel"
          class="w-full h-7 bg-ui-surface border border-ui-borderSubtle rounded-xs px-1.5 text-ui-textPrimary text-[10px] focus:outline-none cursor-pointer"
          @mousedown="beginEdit"
          @change="projectStore.markGeometryUpdated()"
        >
          <option value="rgb">All colors</option>
          <option value="luma">Brightness</option>
          <option value="alpha">Holes (stipple)</option>
        </select>
      </label>
      <label class="block space-y-0.5">
        <span class="text-[10px] text-ui-textSecondary">Pattern sticks to</span>
        <select
          v-model="mat.ditherSpace"
          class="w-full h-7 bg-ui-surface border border-ui-borderSubtle rounded-xs px-1.5 text-ui-textPrimary text-[10px] focus:outline-none cursor-pointer"
          @mousedown="beginEdit"
          @change="projectStore.markGeometryUpdated()"
        >
          <option value="screen">Screen</option>
          <option value="uv">Texture UVs</option>
          <option value="world">Object</option>
        </select>
      </label>
    </div>

    <div class="space-y-1 pt-1">
      <div class="text-[9px] uppercase tracking-wide text-ui-textMuted">Looks</div>
      <div v-for="group in DITHER_LOOK_GROUPS" :key="group.id" class="space-y-0.5">
        <div class="text-[9px] text-ui-textMuted">{{ group.label }}</div>
        <div class="flex flex-wrap gap-1">
          <button
            v-for="preset in ditherPresetsInGroup(group)"
            :key="preset.id"
            type="button"
            class="h-6 px-1.5 rounded-xs border text-[10px] cursor-pointer"
            :class="lookActive(preset)
              ? 'bg-ui-active border-ui-accent text-ui-textPrimary'
              : 'bg-ui-surface border-ui-borderSubtle text-ui-textSecondary hover:text-ui-textPrimary'"
            :title="preset.description"
            @click="applyLook(preset)"
          >
            {{ preset.name }}
          </button>
        </div>
      </div>
    </div>
  </UiSection>
</template>
