<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { useToolStore } from '../../stores/toolStore'

const MIN = 8
const MAX = 4096

const SQUARE_PRESETS = [16, 32, 64, 128, 256, 512, 1024] as const
const WIDE_PRESETS = [
  { w: 64, h: 32 },
  { w: 128, h: 64 },
  { w: 256, h: 128 },
  { w: 320, h: 240 }
] as const

export type NewTextureFill = 'transparent' | 'white' | 'black' | 'primary'

withDefaults(defineProps<{
  bindHint?: string
}>(), {
  bindHint: ''
})

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'create', payload: { name: string; width: number; height: number; fill: NewTextureFill }): void
}>()

const projectStore = useProjectStore()
const toolStore = useToolStore()

const nameInputRef = ref<HTMLInputElement | null>(null)
const textureName = ref('')
const width = ref(64)
const height = ref(64)
const squareLock = ref(true)
const fill = ref<NewTextureFill>('transparent')

const placeholderName = computed(() => `Texture_${projectStore.textures.length + 1}`)

const isSquarePreset = computed(() => squareLock.value && width.value === height.value)

function clampSize(n: number) {
  if (!Number.isFinite(n)) return 64
  return Math.max(MIN, Math.min(MAX, Math.round(n)))
}

function setSquare(size: number) {
  const s = clampSize(size)
  squareLock.value = true
  width.value = s
  height.value = s
}

function setSize(w: number, h: number) {
  squareLock.value = w === h
  width.value = clampSize(w)
  height.value = clampSize(h)
}

function parseSize(raw: string | number) {
  const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10)
  return Number.isFinite(n) ? Math.round(n) : null
}

function onWidthInput(raw: string | number) {
  const next = parseSize(raw)
  if (next === null) return
  width.value = next
  if (squareLock.value) height.value = next
}

function onHeightInput(raw: string | number) {
  const next = parseSize(raw)
  if (next === null) return
  height.value = next
  if (squareLock.value) width.value = next
}

function commitWidth() {
  onWidthInput(clampSize(width.value))
}

function commitHeight() {
  onHeightInput(clampSize(height.value))
}

function toggleSquareLock() {
  squareLock.value = !squareLock.value
  if (squareLock.value) height.value = width.value
}

const previewStyle = computed(() => {
  const maxEdge = 112
  const aspect = width.value / Math.max(1, height.value)
  let w = maxEdge
  let h = maxEdge / aspect
  if (h > maxEdge) {
    h = maxEdge
    w = maxEdge * aspect
  }
  return {
    width: `${Math.round(w)}px`,
    height: `${Math.round(h)}px`
  }
})

const fillHex = computed(() => {
  if (fill.value === 'white') return '#ffffff'
  if (fill.value === 'black') return '#111111'
  if (fill.value === 'primary') return toolStore.primaryColor || '#ffffff'
  return 'transparent'
})

function submit() {
  const name = textureName.value.trim() || placeholderName.value
  emit('create', {
    name,
    width: clampSize(width.value),
    height: clampSize(height.value),
    fill: fill.value
  })
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
  }
  if (e.key === 'Enter' && (e.target as HTMLElement)?.tagName !== 'BUTTON') {
    e.preventDefault()
    submit()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  nextTick(() => nameInputRef.value?.focus())
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
})

watch(squareLock, (locked) => {
  if (locked) height.value = width.value
})
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[400] bg-black/65 backdrop-blur-xs flex items-center justify-center p-4" @click.self="emit('close')">
      <div class="bg-ui-panel border border-ui-borderStrong rounded-xs shadow-2xl w-[22.5rem] max-w-[calc(100vw-2rem)] p-3 space-y-3 font-mono text-xs" @click.stop>
        <div class="flex items-center justify-between border-b border-ui-borderSubtle pb-1.5">
          <span class="text-xs font-bold text-amber-300 uppercase tracking-wide">New Image</span>
          <button type="button" class="text-ui-textMuted hover:text-white transition px-1" title="Close (Esc)" @click="emit('close')">✕</button>
        </div>

        <div class="space-y-1">
          <label class="text-[10px] text-ui-textMuted font-bold uppercase">Name</label>
          <input
            ref="nameInputRef"
            v-model="textureName"
            :placeholder="placeholderName"
            class="w-full bg-ui-input border border-ui-borderSubtle rounded-xs px-2 py-1.5 text-ui-textPrimary text-xs focus:outline-none focus:border-amber-400"
          />
        </div>

        <div class="flex gap-3">
          <div
            class="shrink-0 rounded-xs border border-ui-borderSubtle overflow-hidden relative bg-[#141619]"
            :style="previewStyle"
            :title="`${width} × ${height}`"
          >
            <div class="absolute inset-0 new-tex-checker" />
            <div v-if="fill !== 'transparent'" class="absolute inset-0" :style="{ backgroundColor: fillHex }" />
          </div>
          <div class="flex-1 min-w-0 space-y-2">
            <div class="text-[10px] text-ui-textMuted font-bold uppercase">Size</div>
            <div class="flex items-center gap-1">
              <input
                :value="width"
                type="number"
                :min="MIN"
                :max="MAX"
                class="w-full bg-ui-input border border-ui-borderSubtle rounded-xs px-1.5 py-1 text-right text-ui-textPrimary font-bold focus:outline-none focus:border-amber-400"
                aria-label="Width in pixels"
                @input="onWidthInput(($event.target as HTMLInputElement).value)"
                @blur="commitWidth"
              />
              <span class="text-ui-textMuted">×</span>
              <input
                :value="height"
                type="number"
                :min="MIN"
                :max="MAX"
                class="w-full bg-ui-input border border-ui-borderSubtle rounded-xs px-1.5 py-1 text-right text-ui-textPrimary font-bold focus:outline-none focus:border-amber-400"
                aria-label="Height in pixels"
                @input="onHeightInput(($event.target as HTMLInputElement).value)"
                @blur="commitHeight"
              />
              <button
                type="button"
                class="shrink-0 px-1.5 py-1 rounded-xs border text-[9px] font-bold uppercase"
                :class="squareLock ? 'border-amber-500/50 bg-amber-500/15 text-amber-300' : 'border-ui-borderSubtle bg-ui-input text-ui-textMuted hover:text-ui-textPrimary'"
                :title="squareLock ? 'Unlock width and height' : 'Lock square'"
                @click="toggleSquareLock"
              >
                {{ squareLock ? '1:1' : 'Free' }}
              </button>
            </div>
            <p class="text-[9px] text-ui-textMuted leading-snug">Any size from {{ MIN }} to {{ MAX }} px. Type it, or pick a preset.</p>
          </div>
        </div>

        <div class="space-y-1">
          <label class="text-[10px] text-ui-textMuted font-bold uppercase">Square</label>
          <div class="grid grid-cols-4 gap-1">
            <button
              v-for="s in SQUARE_PRESETS"
              :key="s"
              type="button"
              class="py-1 text-center rounded-xs border text-[10px] font-mono transition cursor-pointer"
              :class="isSquarePreset && width === s ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-bold' : 'bg-ui-input text-ui-textSecondary border-ui-borderSubtle hover:bg-ui-hover'"
              @click="setSquare(s)"
            >
              {{ s }}
            </button>
          </div>
        </div>

        <div class="space-y-1">
          <label class="text-[10px] text-ui-textMuted font-bold uppercase">Wide</label>
          <div class="grid grid-cols-2 gap-1">
            <button
              v-for="p in WIDE_PRESETS"
              :key="`${p.w}x${p.h}`"
              type="button"
              class="py-1 text-center rounded-xs border text-[10px] font-mono transition cursor-pointer"
              :class="width === p.w && height === p.h ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-bold' : 'bg-ui-input text-ui-textSecondary border-ui-borderSubtle hover:bg-ui-hover'"
              @click="setSize(p.w, p.h)"
            >
              {{ p.w }} × {{ p.h }}
            </button>
          </div>
        </div>

        <div class="space-y-1">
          <label class="text-[10px] text-ui-textMuted font-bold uppercase">Fill</label>
          <div class="grid grid-cols-4 gap-1">
            <button
              type="button"
              class="py-1 rounded-xs border text-[9px] font-bold uppercase"
              :class="fill === 'transparent' ? 'border-amber-500/50 bg-amber-500/15 text-amber-300' : 'border-ui-borderSubtle bg-ui-input text-ui-textSecondary hover:bg-ui-hover'"
              @click="fill = 'transparent'"
            >
              Clear
            </button>
            <button
              type="button"
              class="py-1 rounded-xs border text-[9px] font-bold uppercase"
              :class="fill === 'white' ? 'border-amber-500/50 bg-amber-500/15 text-amber-300' : 'border-ui-borderSubtle bg-ui-input text-ui-textSecondary hover:bg-ui-hover'"
              @click="fill = 'white'"
            >
              White
            </button>
            <button
              type="button"
              class="py-1 rounded-xs border text-[9px] font-bold uppercase"
              :class="fill === 'black' ? 'border-amber-500/50 bg-amber-500/15 text-amber-300' : 'border-ui-borderSubtle bg-ui-input text-ui-textSecondary hover:bg-ui-hover'"
              @click="fill = 'black'"
            >
              Black
            </button>
            <button
              type="button"
              class="py-1 rounded-xs border text-[9px] font-bold uppercase truncate"
              :class="fill === 'primary' ? 'border-amber-500/50 bg-amber-500/15 text-amber-300' : 'border-ui-borderSubtle bg-ui-input text-ui-textSecondary hover:bg-ui-hover'"
              :title="toolStore.primaryColor"
              @click="fill = 'primary'"
            >
              Paint
            </button>
          </div>
        </div>

        <p v-if="bindHint" class="text-[9px] text-sky-300/90">Applies to {{ bindHint }} (this object).</p>

        <div class="flex gap-1 pt-0.5">
          <button
            type="button"
            class="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xs text-xs font-bold transition cursor-pointer shadow-xs"
            @click="submit"
          >
            Create {{ width }} × {{ height }}
          </button>
          <button
            type="button"
            class="px-3 py-1.5 bg-ui-input hover:bg-ui-hover text-ui-textSecondary rounded-xs text-xs transition cursor-pointer"
            @click="emit('close')"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.new-tex-checker {
  background-color: #1e2025;
  background-image:
    linear-gradient(45deg, #141619 25%, transparent 25%),
    linear-gradient(-45deg, #141619 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #141619 75%),
    linear-gradient(-45deg, transparent 75%, #141619 75%);
  background-size: 10px 10px;
  background-position: 0 0, 0 5px, 5px -5px, -5px 0;
}
</style>
