<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useToolStore } from '../../stores/toolStore'
import { useAnimationStore } from '../../stores/animationStore'
import { useProjectStore } from '../../stores/projectStore'
import BlenderIcon from '../icons/BlenderIcon.vue'
import {
  LayoutGrid,
  ChevronDown,
  Magnet,
  Crosshair,
  Search,
  Layers,
  Compass,
  Check,
  FlipHorizontal,
} from 'lucide-vue-next'
import type { PivotPoint, TransformOrientation } from '../../types/tools'
import { EDITOR_EVENTS, requestCameraView } from '../../core/commands/editorCommands'

type NavMenu = 'mode' | 'space' | 'snap' | 'view' | 'overlays' | 'shade' | null
type CameraView = 'persp' | 'top' | 'front' | 'right' | 'iso'

const toolStore = useToolStore()
const animationStore = useAnimationStore()
const projectStore = useProjectStore()

const openMenu = ref<NavMenu>(null)
const cameraView = ref<CameraView>('persp')
const modeBtn = ref<HTMLButtonElement | null>(null)
const spaceBtn = ref<HTMLButtonElement | null>(null)
const snapBtn = ref<HTMLButtonElement | null>(null)
const viewBtn = ref<HTMLButtonElement | null>(null)
const overlayBtn = ref<HTMLButtonElement | null>(null)
const shadeBtn = ref<HTMLButtonElement | null>(null)
const menuBtn = {
  mode: modeBtn,
  space: spaceBtn,
  snap: snapBtn,
  view: viewBtn,
  overlays: overlayBtn,
  shade: shadeBtn
}
const popStyle = ref({ top: 0, left: 0, width: 220 })

const POP_WIDTH: Record<Exclude<NavMenu, null>, number> = {
  mode: 160,
  space: 256,
  snap: 192,
  view: 160,
  overlays: 220,
  shade: 160
}

const POP_ALIGN_RIGHT: Exclude<NavMenu, null>[] = ['view', 'overlays', 'shade']

function placePop() {
  const menu = openMenu.value
  if (!menu) return
  const el = menuBtn[menu].value
  if (!el) return
  const r = el.getBoundingClientRect()
  const width = POP_WIDTH[menu]
  let left = POP_ALIGN_RIGHT.includes(menu) ? r.right - width : r.left
  if (left < 8) left = 8
  if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8)
  popStyle.value = { top: r.bottom + 4, left, width }
}

const objectShade = computed(() => projectStore.activeMesh?.shadeMode || toolStore.viewport.shadeMode)
const snapTargetOn = computed(() => toolStore.snapping.vertex || toolStore.snapping.edge || toolStore.snapping.face)
const overlayOn = computed(() =>
  toolStore.viewport.faceOrientation || !toolStore.viewport.showGrid || !toolStore.viewport.showAxes
)

const modeLabel = computed(() => {
  if (toolStore.appMode === 'animate') return 'Pose'
  if (toolStore.appMode === 'rig') return 'Rig'
  if (toolStore.appMode === 'uvpaint') return 'Paint'
  if (toolStore.appMode === 'blockout') return 'Blockout'
  return toolStore.selectMode === 'object' ? 'Object' : 'Edit'
})

const showObjectEdit = computed(() => toolStore.appMode === 'model')
const showComponentSelect = computed(() =>
  toolStore.appMode === 'model' && toolStore.selectMode !== 'object' && toolStore.selectMode !== 'origin'
)

const pivotLabel: Record<PivotPoint, string> = {
  median: 'Median',
  active: 'Active',
  individual: 'Indiv',
  cursor: 'Cursor',
}

const viewLabel: Record<CameraView, string> = {
  persp: 'Persp',
  top: 'Top',
  front: 'Front',
  right: 'Right',
  iso: 'Iso',
}

const shadingModes = [
  { id: 'textured' as const, icon: 'shading-textured' as const, title: 'Textured' },
  { id: 'solid' as const, icon: 'shading-solid' as const, title: 'Solid' },
  { id: 'wireframe' as const, icon: 'shading-wire' as const, title: 'Wireframe' },
  { id: 'psx' as const, icon: 'shading-rendered' as const, title: 'PSX preview' },
]

function onCameraViewEvent(e: Event) {
  const view = (e as CustomEvent).detail as CameraView | undefined
  if (view) cameraView.value = view
}

function toggleMenu(menu: Exclude<NavMenu, null>) {
  openMenu.value = openMenu.value === menu ? null : menu
  if (openMenu.value) nextTick(placePop)
}

function closeMenus() {
  openMenu.value = null
}

function onDocPointerDown(e: PointerEvent) {
  const root = (e.target as HTMLElement | null)?.closest?.('[data-vp-nav]')
  if (!root) closeMenus()
}

function setEditMode(mode: 'vertex' | 'edge' | 'face' | 'bone') {
  toolStore.selectMode = mode
  if (mode !== 'bone') projectStore.clearSubSelections()
}

function setInteractionMode(mode: 'object' | 'edit') {
  toolStore.setAppMode('model')
  if (mode === 'object') {
    toolStore.selectMode = 'object'
  } else if (toolStore.selectMode === 'object' || toolStore.selectMode === 'origin') {
    toolStore.selectMode = 'face'
  }
  closeMenus()
}

function setOrientation(ori: TransformOrientation) {
  toolStore.transformOrientation = ori
}

function setPivot(piv: PivotPoint) {
  toolStore.pivotPoint = piv
}

function applyObjectShade(mode: 'flat' | 'smooth' | 'auto') {
  projectStore.setShadeMode(mode)
  if (mode !== 'auto') toolStore.viewport.shadeMode = mode
  closeMenus()
}

function setView(view: CameraView) {
  requestCameraView(view)
  closeMenus()
}

function toggleSymmetry(axis: 'X' | 'Y' | 'Z') {
  if (axis === 'X') toolStore.viewport.symmetryX = !toolStore.viewport.symmetryX
  else if (axis === 'Y') toolStore.viewport.symmetryY = !toolStore.viewport.symmetryY
  else toolStore.viewport.symmetryZ = !toolStore.viewport.symmetryZ
}

function triggerCommandPalette() {
  closeMenus()
  window.dispatchEvent(new CustomEvent('open-command-palette'))
}

watch(openMenu, (menu) => {
  if (menu) nextTick(placePop)
})

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDown)
  window.addEventListener(EDITOR_EVENTS.cameraView, onCameraViewEvent)
  window.addEventListener('resize', placePop)
})
onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocPointerDown)
  window.removeEventListener(EDITOR_EVENTS.cameraView, onCameraViewEvent)
  window.removeEventListener('resize', placePop)
})
</script>

<template>
  <div
    data-vp-nav
    class="h-8 shrink-0 bg-ui-panel border-b border-ui-borderSubtle px-2.5 flex items-center text-[11px] text-ui-textSecondary select-none z-20 font-mono overflow-x-auto custom-scrollbar"
  >
    <!-- Interact -->
    <div class="flex items-center gap-1.5 min-w-0">
      <div class="relative">
        <button
          ref="modeBtn"
          type="button"
          class="h-6 pl-1.5 pr-1 rounded-xs flex items-center gap-1.5 text-[11px] font-semibold transition"
          :class="showObjectEdit
            ? 'bg-ui-input border border-ui-borderDefault text-ui-textPrimary hover:bg-ui-hover'
            : 'text-ui-textMuted cursor-default'"
          :disabled="!showObjectEdit"
          title="Interaction mode (Tab)"
          @click="showObjectEdit && toggleMenu('mode')"
        >
          <BlenderIcon
            :name="toolStore.selectMode === 'object' ? 'mesh-cube' : toolStore.appMode === 'animate' ? 'bone' : 'vertex-select'"
            :size="12"
            :color="toolStore.selectMode === 'object' ? 'var(--ui-accent)' : '#38bdf8'"
          />
          <span>{{ modeLabel }}</span>
          <ChevronDown v-if="showObjectEdit" class="w-3 h-3 text-ui-textMuted" />
        </button>
      </div>

      <div
        v-if="showComponentSelect"
        class="flex items-center h-6 px-0.5 rounded-xs bg-ui-input border border-ui-borderDefault"
      >
        <button
          type="button"
          class="w-6 h-5 rounded-xs flex items-center justify-center"
          :class="toolStore.selectMode === 'vertex' ? 'bg-ui-active text-ui-textPrimary' : 'text-ui-textMuted hover:text-ui-textPrimary'"
          title="Vertex (1)"
          @click="setEditMode('vertex')"
        >
          <BlenderIcon name="vertex-select" :size="11" />
        </button>
        <button
          type="button"
          class="w-6 h-5 rounded-xs flex items-center justify-center"
          :class="toolStore.selectMode === 'edge' ? 'bg-ui-active text-ui-textPrimary' : 'text-ui-textMuted hover:text-ui-textPrimary'"
          title="Edge (2)"
          @click="setEditMode('edge')"
        >
          <BlenderIcon name="edge-select" :size="11" />
        </button>
        <button
          type="button"
          class="w-6 h-5 rounded-xs flex items-center justify-center"
          :class="toolStore.selectMode === 'face' ? 'bg-ui-active text-ui-textPrimary' : 'text-ui-textMuted hover:text-ui-textPrimary'"
          title="Face (3)"
          @click="setEditMode('face')"
        >
          <BlenderIcon name="face-select" :size="11" />
        </button>
      </div>
    </div>

    <div class="w-px h-4 bg-ui-borderSubtle mx-2 shrink-0" />

    <!-- Transform -->
    <div class="relative shrink-0">
      <button
        ref="spaceBtn"
        type="button"
        class="h-6 px-1.5 rounded-xs bg-ui-input border border-ui-borderDefault text-ui-textPrimary hover:bg-ui-hover flex items-center gap-1.5"
        title="Transform space and pivot"
        @click="toggleMenu('space')"
      >
        <Compass class="w-3 h-3 text-sky-400 shrink-0" />
        <span class="capitalize">{{ toolStore.transformOrientation }}</span>
        <span class="text-ui-textMuted">·</span>
        <Crosshair class="w-3 h-3 text-ui-textAccent shrink-0" />
        <span>{{ pivotLabel[toolStore.pivotPoint] }}</span>
        <ChevronDown class="w-3 h-3 text-ui-textMuted" />
      </button>
    </div>

    <div class="w-px h-4 bg-ui-borderSubtle mx-2 shrink-0" />

    <!-- Snap + mirror -->
    <div class="flex items-center gap-1.5 shrink-0">
      <div class="relative flex items-center h-6 rounded-xs bg-ui-input border border-ui-borderDefault">
        <button
          type="button"
          class="h-full px-1.5 flex items-center gap-1 rounded-l-xs"
          :class="toolStore.snapping.grid ? 'text-ui-textAccent' : 'text-ui-textMuted hover:text-ui-textPrimary'"
          title="Grid increment (Ctrl while grabbing). Magnet does not lock G to the grid."
          @click="toolStore.snapping.grid = !toolStore.snapping.grid"
        >
          <Magnet class="w-3 h-3" />
          <span class="text-[10px] tabular-nums">{{ toolStore.snapping.gridSize }}</span>
        </button>
        <button
          ref="snapBtn"
          type="button"
          class="h-full px-1 border-l border-ui-borderSubtle text-ui-textMuted hover:text-ui-textPrimary relative"
          title="Snap increment and targets"
          @click="toggleMenu('snap')"
        >
          <ChevronDown class="w-3 h-3" />
          <span
            v-if="snapTargetOn"
            class="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-ui-accent"
          />
        </button>
      </div>

      <div
        class="flex items-center h-6 pl-1 pr-0.5 gap-0.5 rounded-xs bg-ui-input border border-ui-borderDefault"
        title="Live mirror while dragging vertices"
      >
        <FlipHorizontal class="w-3 h-3 text-ui-textMuted mx-0.5" />
        <button
          v-for="axis in (['X', 'Y', 'Z'] as const)"
          :key="axis"
          type="button"
          class="w-5 h-5 rounded-xs text-[10px] font-bold"
          :class="(axis === 'X' ? toolStore.viewport.symmetryX : axis === 'Y' ? toolStore.viewport.symmetryY : toolStore.viewport.symmetryZ)
            ? 'bg-ui-accentSubtle text-ui-textAccent'
            : 'text-ui-textMuted hover:text-ui-textPrimary'"
          :title="'Live ' + axis + ' symmetry'"
          @click="toggleSymmetry(axis)"
        >{{ axis }}</button>
      </div>
    </div>

    <div class="flex-1 min-w-3" />

    <!-- Look -->
    <div class="flex items-center gap-1.5 shrink-0">
      <div class="relative">
        <button
          ref="viewBtn"
          type="button"
          class="h-6 px-1.5 rounded-xs bg-ui-input border border-ui-borderDefault text-ui-textPrimary hover:bg-ui-hover flex items-center gap-1"
          title="Camera view"
          @click="toggleMenu('view')"
        >
          <span class="text-ui-textMuted">View</span>
          <span class="text-ui-textAccent font-semibold">{{ toolStore.viewport.quadView ? 'Quad' : viewLabel[cameraView] }}</span>
          <ChevronDown class="w-3 h-3 text-ui-textMuted" />
        </button>
      </div>

      <div class="relative">
        <button
          ref="overlayBtn"
          type="button"
          class="h-6 w-6 rounded-xs border flex items-center justify-center relative"
          :class="overlayOn
            ? 'bg-ui-accentSubtle text-ui-textAccent border-ui-accent/40'
            : 'bg-ui-input text-ui-textMuted border-ui-borderDefault hover:text-ui-textPrimary'"
          title="Overlays"
          @click="toggleMenu('overlays')"
        >
          <Layers class="w-3 h-3" />
        </button>
      </div>

      <div class="flex items-center h-6 px-0.5 rounded-xs bg-ui-input border border-ui-borderDefault">
        <button
          v-for="mode in shadingModes"
          :key="mode.id"
          type="button"
          class="w-6 h-5 rounded-xs flex items-center justify-center"
          :class="toolStore.viewport.shading === mode.id ? 'bg-ui-active text-ui-textPrimary' : 'text-ui-textMuted hover:text-ui-textPrimary'"
          :title="mode.title"
          @click="toolStore.viewport.shading = mode.id"
        >
          <BlenderIcon :name="mode.icon" :size="11" />
        </button>
      </div>

      <div class="relative">
        <button
          ref="shadeBtn"
          type="button"
          class="h-6 px-1.5 rounded-xs bg-ui-input border border-ui-borderDefault text-ui-textPrimary hover:bg-ui-hover flex items-center gap-1"
          title="Object shade"
          @click="toggleMenu('shade')"
        >
          <span class="capitalize">{{ objectShade }}</span>
          <ChevronDown class="w-3 h-3 text-ui-textMuted" />
        </button>
      </div>

      <button
        type="button"
        class="h-6 w-6 rounded-xs border flex items-center justify-center"
        :class="toolStore.viewport.xray
          ? 'bg-ui-accentSubtle text-ui-textAccent border-ui-accent/40'
          : 'bg-ui-input text-ui-textMuted border-ui-borderDefault hover:text-ui-textPrimary'"
        title="X-Ray (Alt+Z)"
        @click="toolStore.viewport.xray = !toolStore.viewport.xray"
      >
        <BlenderIcon name="xray" :size="11" :color="toolStore.viewport.xray ? 'var(--ui-accent)' : 'currentColor'" />
      </button>

      <button
        type="button"
        class="h-6 w-6 rounded-xs bg-ui-input border border-ui-borderDefault text-ui-textMuted hover:text-ui-textPrimary flex items-center justify-center"
        title="Command search (F3)"
        @click="triggerCommandPalette"
      >
        <Search class="w-3 h-3" />
      </button>

      <button
        type="button"
        class="h-6 w-6 rounded-xs border flex items-center justify-center"
        :class="toolStore.viewport.quadView
          ? 'bg-ui-accentSubtle text-ui-textAccent border-ui-accent/40'
          : 'bg-ui-input text-ui-textMuted border-ui-borderDefault hover:text-ui-textPrimary'"
        title="Quad view (Ctrl+Alt+Q)"
        @click="toolStore.viewport.quadView = !toolStore.viewport.quadView"
      >
        <LayoutGrid class="w-3 h-3" />
      </button>
    </div>
  </div>

  <Teleport to="body">
    <div
      v-if="openMenu"
      data-vp-nav
      class="fixed z-[80] bg-ui-panel border border-ui-borderStrong rounded-xs shadow-2xl font-mono text-ui-textSecondary text-[11px]"
      :style="{ top: popStyle.top + 'px', left: popStyle.left + 'px', width: popStyle.width + 'px' }"
      @pointerdown.stop
    >
      <div v-if="openMenu === 'mode'" class="p-1">
        <button
          type="button"
          class="w-full text-left px-2 py-1.5 hover:bg-ui-hover rounded-xs flex items-center justify-between"
          :class="{ 'text-ui-textAccent font-semibold': toolStore.selectMode === 'object' }"
          @click="setInteractionMode('object')"
        >
          <span class="flex items-center gap-2">
            <BlenderIcon name="mesh-cube" :size="12" color="var(--ui-accent)" />
            Object
          </span>
          <span class="text-[10px] text-ui-textMuted">Tab</span>
        </button>
        <button
          type="button"
          class="w-full text-left px-2 py-1.5 hover:bg-ui-hover rounded-xs flex items-center justify-between"
          :class="{ 'text-sky-400 font-semibold': toolStore.selectMode !== 'object' }"
          @click="setInteractionMode('edit')"
        >
          <span class="flex items-center gap-2">
            <BlenderIcon name="vertex-select" :size="12" color="#38bdf8" />
            Edit
          </span>
          <span class="text-[10px] text-ui-textMuted">Tab</span>
        </button>
      </div>

      <div v-else-if="openMenu === 'space'" class="p-2 grid grid-cols-2 gap-2">
        <div>
          <div class="px-1 pb-1 text-[9px] font-bold uppercase tracking-wider text-ui-textMuted">Space</div>
          <button
            v-for="ori in (['global', 'local', 'normal', 'view'] as const)"
            :key="ori"
            type="button"
            class="w-full text-left px-1.5 py-1 rounded-xs capitalize hover:bg-ui-hover flex items-center justify-between"
            :class="{ 'text-sky-400 font-semibold': toolStore.transformOrientation === ori }"
            @click="setOrientation(ori)"
          >
            <span>{{ ori }}</span>
            <Check v-if="toolStore.transformOrientation === ori" class="w-3 h-3" />
          </button>
        </div>
        <div>
          <div class="px-1 pb-1 text-[9px] font-bold uppercase tracking-wider text-ui-textMuted">Pivot</div>
          <button
            v-for="piv in ([
              { id: 'median' as const, label: 'Median' },
              { id: 'active' as const, label: 'Active' },
              { id: 'cursor' as const, label: '3D Cursor' },
            ])"
            :key="piv.id"
            type="button"
            class="w-full text-left px-1.5 py-1 rounded-xs hover:bg-ui-hover flex items-center justify-between"
            :class="{ 'text-ui-textAccent font-semibold': toolStore.pivotPoint === piv.id }"
            @click="setPivot(piv.id)"
          >
            <span>{{ piv.label }}</span>
            <Check v-if="toolStore.pivotPoint === piv.id" class="w-3 h-3" />
          </button>
        </div>
      </div>

      <div v-else-if="openMenu === 'snap'" class="p-2 space-y-2">
        <div class="text-[9px] font-bold uppercase tracking-wider text-ui-textMuted">Increment</div>
        <div class="grid grid-cols-4 gap-1">
          <button
            v-for="sz in [0.1, 0.25, 0.5, 1.0]"
            :key="sz"
            type="button"
            class="py-1 rounded-xs border text-[10px]"
            :class="toolStore.snapping.gridSize === sz
              ? 'bg-ui-accentSubtle text-ui-textAccent border-ui-accent/40 font-semibold'
              : 'border-ui-borderSubtle text-ui-textMuted hover:text-ui-textPrimary'"
            @click="toolStore.snapping.gridSize = sz"
          >{{ sz }}</button>
        </div>
        <div class="border-t border-ui-borderSubtle pt-1.5 space-y-1">
          <div class="text-[9px] font-bold uppercase tracking-wider text-ui-textMuted">Snap to</div>
          <label class="flex items-center justify-between cursor-pointer py-0.5 px-0.5">
            <span>Vertex</span>
            <input type="checkbox" v-model="toolStore.snapping.vertex" class="rounded-xs accent-ui-accent" />
          </label>
          <label class="flex items-center justify-between cursor-pointer py-0.5 px-0.5">
            <span>Edge midpoint</span>
            <input type="checkbox" v-model="toolStore.snapping.edge" class="rounded-xs accent-ui-accent" />
          </label>
          <label class="flex items-center justify-between cursor-pointer py-0.5 px-0.5">
            <span>Face center</span>
            <input type="checkbox" v-model="toolStore.snapping.face" class="rounded-xs accent-ui-accent" />
          </label>
        </div>
      </div>

      <div v-else-if="openMenu === 'view'" class="p-1">
        <button
          v-for="opt in ([
            { id: 'persp' as const, label: 'Perspective', hint: '' },
            { id: 'top' as const, label: 'Top', hint: 'Num 7' },
            { id: 'front' as const, label: 'Front', hint: 'Num 1' },
            { id: 'right' as const, label: 'Right', hint: 'Num 3' },
            { id: 'iso' as const, label: 'Isometric', hint: 'Num 0' },
          ])"
          :key="opt.id"
          type="button"
          class="w-full text-left px-2 py-1 rounded-xs hover:bg-ui-hover flex items-center justify-between"
          :class="{ 'text-ui-textAccent font-semibold': cameraView === opt.id && !toolStore.viewport.quadView }"
          @click="toolStore.viewport.quadView = false; setView(opt.id)"
        >
          <span>{{ opt.label }}</span>
          <span v-if="opt.hint" class="text-[10px] text-ui-textMuted">{{ opt.hint }}</span>
        </button>
      </div>

      <div v-else-if="openMenu === 'overlays'" class="p-2 space-y-1.5">
        <div class="text-[9px] font-bold uppercase tracking-wider text-ui-textMuted">Overlays</div>
        <label class="flex items-center justify-between cursor-pointer py-0.5 px-0.5 hover:bg-ui-hover rounded-xs">
          <span>Face orientation</span>
          <input type="checkbox" v-model="toolStore.viewport.faceOrientation" class="rounded-xs accent-ui-accent" />
        </label>
        <label class="flex items-center justify-between cursor-pointer py-0.5 px-0.5 hover:bg-ui-hover rounded-xs">
          <span>Grid</span>
          <input type="checkbox" v-model="toolStore.viewport.showGrid" class="rounded-xs accent-ui-accent" />
        </label>
        <label class="flex items-center justify-between cursor-pointer py-0.5 px-0.5 hover:bg-ui-hover rounded-xs">
          <span>World axes</span>
          <input type="checkbox" v-model="toolStore.viewport.showAxes" class="rounded-xs accent-ui-accent" />
        </label>
        <label class="flex items-center justify-between cursor-pointer py-0.5 px-0.5 hover:bg-ui-hover rounded-xs">
          <span>Bones</span>
          <input
            type="checkbox"
            :checked="animationStore.showBones"
            class="rounded-xs accent-ui-accent"
            @change="animationStore.setShowBones(!animationStore.showBones)"
          />
        </label>
        <div class="border-t border-ui-borderSubtle pt-1.5 space-y-1">
          <div class="flex items-center justify-between text-[10px] text-ui-textMuted">
            <span>Wire opacity</span>
            <span class="tabular-nums">{{ Math.round(toolStore.viewport.wireframeOpacity * 100) }}%</span>
          </div>
          <input
            type="range"
            min="0.1"
            max="1.0"
            step="0.05"
            v-model.number="toolStore.viewport.wireframeOpacity"
            class="w-full h-1 bg-ui-borderStrong rounded-lg appearance-none cursor-pointer accent-ui-accent"
          />
        </div>
      </div>

      <div v-else-if="openMenu === 'shade'" class="p-1">
        <button
          type="button"
          class="w-full text-left px-2 py-1.5 rounded-xs hover:bg-ui-hover"
          :class="{ 'text-ui-textAccent font-semibold': objectShade === 'flat' }"
          title="One normal per face"
          @click="applyObjectShade('flat')"
        >Flat</button>
        <button
          type="button"
          class="w-full text-left px-2 py-1.5 rounded-xs hover:bg-ui-hover"
          :class="{ 'text-ui-textAccent font-semibold': objectShade === 'smooth' }"
          title="Interpolated vertex normals"
          @click="applyObjectShade('smooth')"
        >Smooth</button>
        <button
          type="button"
          class="w-full text-left px-2 py-1.5 rounded-xs hover:bg-ui-hover"
          :class="{ 'text-ui-textAccent font-semibold': objectShade === 'auto' }"
          title="Smooth, keep sharp edges by angle"
          @click="applyObjectShade('auto')"
        >Auto smooth</button>
      </div>
    </div>
  </Teleport>
</template>
