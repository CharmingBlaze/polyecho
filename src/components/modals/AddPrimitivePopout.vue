<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { PrimitiveType } from '../../core/primitives/PrimitiveTypes'
import { PrimitivePlacementOperator, PrimitivePlacementMode, PrimitivePlacementState } from '../../core/operators/placement/PrimitivePlacementOperator'
import { PrimitiveRegistry } from '../../core/primitives/PrimitiveRegistry'
import { operatorManager } from '../../core/operators/OperatorManager'
import { useLayoutStore } from '../../stores/layoutStore'
import { useFloatingDrag } from '../../composables/useFloatingDrag'
import { PlacementOrientation } from '../../core/placement/SurfacePlacementSolver'
import BlenderIcon from '../icons/BlenderIcon.vue'
import UiButton from '../ui/UiButton.vue'
import { EDITOR_EVENTS, requestPrimitivePlacement } from '../../core/commands/editorCommands'
import { X, GripHorizontal, Minus, Plus } from 'lucide-vue-next'

const layoutStore = useLayoutStore()
const visible = ref(false)
const isMinimized = ref(false)
const position = ref({ x: 120, y: 70 })
const activeTab = ref<'BASIC' | 'SHAPES' | 'BUILD'>('BASIC')
const searchQuery = ref('')

const placementMode = ref<PrimitivePlacementMode>(PrimitivePlacementMode.CAD_DRAW)
const orientation = ref<PlacementOrientation>('SURFACE')
const chosenType = ref<PrimitiveType>('BOX')
const settings = ref<Record<string, any>>({ ...PrimitiveRegistry.get('BOX')!.defaultParameters })
const fieldLabels: Record<string, string> = {
  heightSegments: 'Height divisions',
  segmentsX: 'Width divisions',
  segmentsY: 'Height divisions',
  segmentsZ: 'Depth divisions',
  sides: 'Sides',
  segments: 'Segments',
  rings: 'Rings',
  subdivisions: 'Subdivisions',
  capTop: 'Top cap',
  capBottom: 'Bottom cap',
  majorRadius: 'Ring radius',
  tubeRadius: 'Tube radius',
  majorSegments: 'Ring segments',
  tubeSegments: 'Tube segments',
  outerRadius: 'Outer radius',
  innerRadius: 'Inner radius',
  totalRun: 'Run',
  totalHeight: 'Height',
  openingWidth: 'Opening width',
  openingHeight: 'Opening height'
}
const fields = computed(() => Object.keys(settings.value).filter(key => placementMode.value === PrimitivePlacementMode.PLACE || /segments|rings|sides|steps|subdivisions|cap|filled|flip/i.test(key)))
const chosenLabel = computed(() => PrimitiveRegistry.get(chosenType.value)?.label || 'Box')
const placing = computed(() => {
  void operatorManager.state.value.active
  void operatorManager.state.value.previewTick
  void operatorManager.state.value.statusText
  const op = operatorManager.activeOperator
  return op instanceof PrimitivePlacementOperator ? op : null
})
const liveOrientation = computed(() => placing.value?.placementOrientation ?? orientation.value)
const canConfirm = computed(() => {
  const op = placing.value
  if (!op) return false
  if (op.mode === PrimitivePlacementMode.PLACE) return op.state === PrimitivePlacementState.PLACE_PREVIEW
  return op.state === PrimitivePlacementState.DRAWING_PRIMARY || op.state === PrimitivePlacementState.DRAWING_SECONDARY
})
const sessionHint = computed(() => {
  const op = placing.value
  if (!op) return placementMode.value === PrimitivePlacementMode.PLACE ? 'Set size, then click a surface.' : 'Draw the size. Scroll adjusts detail.'
  if (op.mode === PrimitivePlacementMode.PLACE) return 'Click a surface to drop.'
  if (op.state === PrimitivePlacementState.WAITING_FOR_START) return 'Click to start the footprint.'
  if (op.state === PrimitivePlacementState.DRAWING_PRIMARY) return 'Drag size. Shift for square. LMB locks.'
  return 'Pull height. LMB finishes.'
})

function setOrientation(next: PlacementOrientation) {
  orientation.value = next
  const op = placing.value
  if (!op) return
  op.placementOrientation = next
  op.updateStatus()
}

function setPlacementMode(next: PrimitivePlacementMode) {
  placementMode.value = next
  if (placing.value) selectPrimitive(chosenType.value)
}

function confirmPlacement() {
  const op = placing.value
  if (!op) return
  if (op.mode === PrimitivePlacementMode.PLACE) operatorManager.confirm()
  else op.handlePointerDown(0)
}

function stepBack() {
  placing.value?.handlePointerDown(2)
}

const primitiveIcons: Record<PrimitiveType, string> = {
  BOX: 'mesh-cube',
  PLANE: 'mesh-plane',
  SPHERE: 'mesh-sphere',
  ICOSPHERE: 'mesh-icosphere',
  CYLINDER: 'mesh-cylinder',
  CONE: 'mesh-cone',
  PYRAMID: 'mesh-cone',
  CIRCLE: 'mesh-circle',
  PRISM: 'mesh-cylinder',
  TORUS: 'mesh-torus',
  CAPSULE: 'mesh-cylinder',
  WEDGE: 'mesh-cube',
  TUBE: 'mesh-torus',
  WALL: 'mesh-plane',
  STAIRS: 'mesh-cube',
  ARCH: 'mesh-torus'
}

const filteredPrimitives = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  const all = PrimitiveRegistry.getAll()
  if (q) {
    return all.filter(p => p.label.toLowerCase().includes(q) || p.type.toLowerCase().includes(q))
  }
  return PrimitiveRegistry.getByCategory(activeTab.value)
})

function updateSetting(key: string, event: Event) {
  const input = event.target as HTMLInputElement
  const value = input.type === 'checkbox' ? input.checked : Number(input.value)
  if (typeof value === 'number' && !Number.isFinite(value)) return
  settings.value[key] = value
  const op = operatorManager.activeOperator
  if (op instanceof PrimitivePlacementOperator && op.primitiveType === chosenType.value) op.setParameters(settings.value)
}

const { startDrag } = useFloatingDrag(position, { minX: 10, minY: 40, maxPadX: 320, maxPadY: 80 })

watch(placing, (op, was) => {
  if (op && !was && !visible.value) openAt()
})

function openAt(x?: number, y?: number) {
  if (x !== undefined && y !== undefined) {
    const panelWidth = 320
    const panelHeight = 440
    const clampedX = Math.min(x, window.innerWidth - panelWidth - 20)
    const clampedY = Math.min(y, window.innerHeight - panelHeight - 20)
    position.value = { x: Math.max(20, clampedX), y: Math.max(40, clampedY) }
  } else if (!visible.value) {
    position.value = { x: 56, y: 42 }
  }
  searchQuery.value = ''
  isMinimized.value = false
  visible.value = true
  layoutStore.showPrimitivePanel = true
}

function toggle() {
  if (visible.value) close()
  else openAt()
}

function close() {
  visible.value = false
  layoutStore.showPrimitivePanel = false
}

function selectPrimitive(type: PrimitiveType) {
  if (chosenType.value !== type) {
    chosenType.value = type
    settings.value = { ...PrimitiveRegistry.get(type)!.defaultParameters }
  }
  requestPrimitivePlacement({
    type,
    mode: placementMode.value,
    orientation: orientation.value,
    parameters: { ...settings.value }
  })
}

function handleGlobalKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && visible.value) close()
}

function handleOpenEvent(e: any) {
  if (visible.value) {
    isMinimized.value = false
    return
  }
  const pos = e?.detail
  if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
    openAt(pos.x, pos.y)
  } else {
    openAt()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeyDown)
  window.addEventListener(EDITOR_EVENTS.openPrimitiveMenu, handleOpenEvent)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeyDown)
  window.removeEventListener(EDITOR_EVENTS.openPrimitiveMenu, handleOpenEvent)
})

defineExpose({
  openAt,
  toggle,
  close
})
</script>

<template>
  <div
    data-floating-panel
    v-if="visible"
    class="fixed z-50 flex flex-col bg-ui-panel border border-ui-borderStrong rounded-xs shadow-2xl font-sans select-none pointer-events-auto w-[320px] text-xs"
    :style="{ left: `${position.x}px`, top: `${position.y}px` }"
  >
    <div
      class="inspector-head cursor-move"
      @pointerdown="startDrag"
    >
      <div class="inspector-head-kicker">
        <GripHorizontal class="w-3.5 h-3.5 shrink-0" />
        <BlenderIcon name="mesh-cube" :size="12" />
        <span>Add</span>
      </div>
      <span class="inspector-head-name">{{ chosenLabel }}</span>
      <div class="flex items-center shrink-0" @mousedown.stop @pointerdown.stop>
        <button
          type="button"
          class="p-1 rounded-xs hover:bg-ui-hover text-ui-textMuted hover:text-ui-textPrimary"
          :aria-label="isMinimized ? 'Expand' : 'Minimize'"
          @click="isMinimized = !isMinimized"
        >
          <Plus v-if="isMinimized" class="w-3.5 h-3.5" />
          <Minus v-else class="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          class="p-1 rounded-xs hover:bg-ui-hover text-ui-textMuted hover:text-ui-textPrimary"
          aria-label="Close"
          @click="close"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <div v-show="!isMinimized" class="px-2.5 py-2 flex flex-col gap-2">
      <div class="inspector-seg is-stretch" aria-label="Placement">
        <button
          type="button"
          class="inspector-seg-btn"
          :class="{ 'is-active': placementMode === PrimitivePlacementMode.CAD_DRAW }"
          title="Draw footprint, then height"
          @click="setPlacementMode(PrimitivePlacementMode.CAD_DRAW)"
        >Draw</button>
        <button
          type="button"
          class="inspector-seg-btn"
          :class="{ 'is-active': placementMode === PrimitivePlacementMode.PLACE }"
          title="Click to drop at exact size"
          @click="setPlacementMode(PrimitivePlacementMode.PLACE)"
        >Place</button>
      </div>
      <div class="inspector-seg is-stretch" aria-label="Align">
        <button
          type="button"
          class="inspector-seg-btn"
          :class="{ 'is-active': liveOrientation === 'SURFACE' }"
          title="Follow the clicked surface"
          @click="setOrientation('SURFACE')"
        >Surface</button>
        <button
          type="button"
          class="inspector-seg-btn"
          :class="{ 'is-active': liveOrientation === 'WORLD' }"
          title="Stay upright on world axes"
          @click="setOrientation('WORLD')"
        >World</button>
      </div>

      <div class="relative">
        <BlenderIcon name="search" :size="12" class="absolute left-2 top-1/2 -translate-y-1/2 text-ui-textMuted pointer-events-none" />
        <input
          v-model="searchQuery"
          type="search"
          aria-label="Filter primitives"
          placeholder="Filter…"
          class="w-full bg-ui-input border border-ui-borderSubtle rounded-xs pl-7 pr-2 py-1 text-[11px] text-ui-textPrimary placeholder-ui-textMuted focus:outline-none focus:border-ui-accent"
        />
      </div>

      <div v-if="!searchQuery" class="inspector-seg is-stretch" aria-label="Category">
        <button type="button" class="inspector-seg-btn" :class="{ 'is-active': activeTab === 'BASIC' }" @click="activeTab = 'BASIC'">Basic</button>
        <button type="button" class="inspector-seg-btn" :class="{ 'is-active': activeTab === 'SHAPES' }" @click="activeTab = 'SHAPES'">Shapes</button>
        <button type="button" class="inspector-seg-btn" :class="{ 'is-active': activeTab === 'BUILD' }" @click="activeTab = 'BUILD'">Build</button>
      </div>

      <div class="grid grid-cols-2 gap-1 max-h-52 overflow-y-auto custom-scrollbar">
        <button
          v-for="item in filteredPrimitives"
          :key="item.type"
          type="button"
          class="inspector-chip w-full justify-start"
          :class="{ 'is-active': chosenType === item.type }"
          @click="selectPrimitive(item.type)"
        >
          <BlenderIcon :name="(primitiveIcons[item.type] as any)" :size="14" />
          <span class="truncate">{{ item.label }}</span>
        </button>
      </div>

      <div class="border-t border-ui-borderSubtle pt-2 space-y-1.5">
        <p class="text-[10px] font-semibold text-ui-textSecondary">{{ chosenLabel }}</p>
        <div class="grid grid-cols-2 gap-1.5">
          <label v-for="key in fields" :key="key" class="flex flex-col gap-0.5 text-[10px] text-ui-textMuted">
            {{ fieldLabels[key] || key.charAt(0).toUpperCase() + key.slice(1) }}
            <input
              v-if="typeof settings[key] === 'boolean'"
              type="checkbox"
              :checked="settings[key]"
              class="accent-ui-accent"
              @change="updateSetting(key, $event)"
            />
            <input
              v-else
              type="number"
              :value="settings[key]"
              :step="/segments|rings|sides|steps|subdivisions/i.test(key) ? 1 : 0.1"
              min="0"
              class="w-full bg-ui-input border border-ui-borderSubtle rounded-xs px-1.5 py-0.5 font-mono text-[10px] text-ui-textPrimary"
              @change="updateSetting(key, $event)"
            />
          </label>
        </div>
        <p class="text-[10px] text-ui-textMuted leading-snug">{{ sessionHint }}</p>
        <p v-if="placing?.dimensionText" class="font-mono text-[10px] inspector-value">{{ placing.dimensionText }}</p>
        <div v-if="placing" class="grid grid-cols-2 gap-1">
          <UiButton size="xs" @click="stepBack">Back</UiButton>
          <UiButton size="xs" variant="accent" :disabled="!canConfirm" @click="confirmPlacement">Confirm</UiButton>
        </div>
      </div>
    </div>
  </div>
</template>
