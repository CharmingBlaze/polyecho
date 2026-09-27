<script setup lang="ts">
import { computed, ref } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { useToolStore } from '../../stores/toolStore'
import { bisectAxisEnabled, flipAxisEnabled } from '../../core/geometry/MirrorModifier'
import UiNumberField from '../ui/UiNumberField.vue'
import {
  Wrench,
  Trash2,
  ChevronDown,
  ChevronRight,
  Layers,
  Shield,
  FlipHorizontal,
  Monitor,
  Camera,
  Pipette,
  Triangle
} from 'lucide-vue-next'

const projectStore = useProjectStore()
const toolStore = useToolStore()
const activeMesh = computed(() => projectStore.activeMesh)

const showAddMenu = ref(false)

const openModifiers = ref<Record<string, boolean>>({
  mirror: true,
  subdivision: true,
  solidify: true
})
const mirrorDataOpen = ref(false)

function toggleSection(name: string) {
  openModifiers.value[name] = !openModifiers.value[name]
}

function bump() {
  projectStore.markGeometryUpdated()
}

function beginModifierEdit() {
  projectStore.recordState('Edit Modifier')
}

function setFillRim(on: boolean) {
  if (!activeMesh.value?.solidify) return
  beginModifierEdit()
  activeMesh.value.solidify.fillRim = on
  bump()
}

type MirrorBool =
  | 'axisX' | 'axisY' | 'axisZ'
  | 'bisectX' | 'bisectY' | 'bisectZ'
  | 'flipX' | 'flipY' | 'flipZ'
  | 'merge' | 'clipping' | 'flipU' | 'flipV'
  | 'enabled' | 'showEdit' | 'showRender'

function toggleMirrorFlag(key: MirrorBool) {
  const mirror = activeMesh.value?.mirror
  if (!mirror) return
  beginModifierEdit()
  if (key === 'showEdit' || key === 'showRender') {
    mirror[key] = mirror[key] === false
  } else if (key === 'bisectX' || key === 'bisectY' || key === 'bisectZ') {
    const axis = key === 'bisectX' ? 'x' : key === 'bisectY' ? 'y' : 'z'
    const nextX = bisectAxisEnabled(mirror, 'x')
    const nextY = bisectAxisEnabled(mirror, 'y')
    const nextZ = bisectAxisEnabled(mirror, 'z')
    mirror.bisect = false
    mirror.bisectX = axis === 'x' ? !nextX : nextX
    mirror.bisectY = axis === 'y' ? !nextY : nextY
    mirror.bisectZ = axis === 'z' ? !nextZ : nextZ
  } else if (key === 'flipX' || key === 'flipY' || key === 'flipZ') {
    const axis = key === 'flipX' ? 'x' : key === 'flipY' ? 'y' : 'z'
    mirror.flipX = axis === 'x' ? !flipAxisEnabled(mirror, 'x') : flipAxisEnabled(mirror, 'x')
    mirror.flipY = axis === 'y' ? !flipAxisEnabled(mirror, 'y') : flipAxisEnabled(mirror, 'y')
    mirror.flipZ = axis === 'z' ? !flipAxisEnabled(mirror, 'z') : flipAxisEnabled(mirror, 'z')
  } else {
    mirror[key] = !mirror[key]
  }
  bump()
}

function setMirrorNumber(key: 'mergeThreshold' | 'bisectDistance' | 'offsetU' | 'offsetV', value: number) {
  const mirror = activeMesh.value?.mirror
  if (!mirror || mirror[key] === value) return
  mirror[key] = value
  bump()
}

function onMirrorObjectChange(event: Event) {
  setMirrorObject((event.target as HTMLSelectElement).value)
}

function setMirrorObject(id: string) {
  const mirror = activeMesh.value?.mirror
  if (!mirror) return
  const next = id || undefined
  if (mirror.mirrorObjectId === next) return
  beginModifierEdit()
  mirror.mirrorObjectId = next
  bump()
}

function toggleMirrorPick() {
  const id = activeMesh.value?.id
  if (!id) return
  toolStore.mirrorObjectPickForId = toolStore.mirrorObjectPickForId === id ? null : id
}

const mirrorTargets = computed(() => {
  const id = activeMesh.value?.id
  return projectStore.meshes.filter(mesh => mesh.id !== id)
})

const pickingMirrorObject = computed(() =>
  !!activeMesh.value && toolStore.mirrorObjectPickForId === activeMesh.value.id
)

function axisOn(axis: 'X' | 'Y' | 'Z') {
  const mirror = activeMesh.value?.mirror
  if (!mirror) return false
  return axis === 'X' ? mirror.axisX : axis === 'Y' ? mirror.axisY : mirror.axisZ
}

function bisectOn(axis: 'x' | 'y' | 'z') {
  const mirror = activeMesh.value?.mirror
  return !!mirror && bisectAxisEnabled(mirror, axis)
}

function setSubdivType(type: 'catmull-clark' | 'simple') {
  if (!activeMesh.value?.subdivision) return
  if ((activeMesh.value.subdivision.type || 'catmull-clark') === type) return
  beginModifierEdit()
  activeMesh.value.subdivision.type = type
  bump()
}

function setSubdivLevel(level: number) {
  if (!activeMesh.value?.subdivision) return
  if (activeMesh.value.subdivision.level === level) return
  beginModifierEdit()
  activeMesh.value.subdivision.level = level
  bump()
}

function toggleSubdivEnabled() {
  if (!activeMesh.value?.subdivision) return
  beginModifierEdit()
  activeMesh.value.subdivision.enabled = !activeMesh.value.subdivision.enabled
  bump()
}

function toggleSolidifyEnabled() {
  if (!activeMesh.value?.solidify) return
  beginModifierEdit()
  activeMesh.value.solidify.enabled = !activeMesh.value.solidify.enabled
  bump()
}

const activeModifiersCount = computed(() => {
  if (!activeMesh.value) return 0
  let count = 0
  if (activeMesh.value.mirror) count++
  if (activeMesh.value.subdivision) count++
  if (activeMesh.value.solidify) count++
  return count
})
</script>

<template>
  <div class="flex flex-col select-none text-xs font-sans">
    <div class="inspector-head">
      <div class="inspector-head-kicker">
        <Wrench class="w-3 h-3" />
        <span>Modifiers</span>
      </div>
      <span class="inspector-head-name">{{ activeMesh?.name || 'No object' }}</span>
    </div>

    <div>
      <div class="relative px-2.5 py-1.5 border-b border-ui-borderSubtle">
        <button
          @click="showAddMenu = !showAddMenu"
          :disabled="!activeMesh"
          class="w-full py-1.5 px-3 bg-ui-input hover:bg-ui-hover text-ui-textPrimary border border-ui-borderDefault rounded-xs flex items-center justify-between font-medium transition shadow-xs disabled:opacity-40 disabled:pointer-events-none"
        >
          <div class="flex items-center gap-2">
            <Wrench class="w-3.5 h-3.5 text-ui-textMuted" />
            <span>Add Modifier</span>
          </div>
          <ChevronDown class="w-3.5 h-3.5 text-ui-textMuted" />
        </button>

        <div
          v-if="showAddMenu"
          class="absolute left-0 right-0 top-full mt-1 bg-[#1c1f26] border border-ui-borderStrong rounded-xs shadow-2xl z-50 p-1 text-xs divide-y divide-ui-borderSubtle"
        >
          <div class="py-1">
            <div class="px-2 py-0.5 text-[10px] font-bold text-ui-textMuted uppercase tracking-wider">Generate</div>

            <button
              @click="projectStore.addModifier('mirror'); showAddMenu = false"
              class="w-full text-left px-2.5 py-1.5 hover:bg-ui-hover rounded-xs flex items-center justify-between text-ui-textPrimary"
            >
              <div class="flex items-center gap-2">
                <FlipHorizontal class="w-3.5 h-3.5 text-ui-textMuted" />
                <span>Mirror</span>
              </div>
              <span class="text-[10px] text-ui-textMuted font-mono">X</span>
            </button>

            <button
              @click="projectStore.addModifier('subdivision'); showAddMenu = false"
              class="w-full text-left px-2.5 py-1.5 hover:bg-ui-hover rounded-xs flex items-center justify-between text-ui-textPrimary"
            >
              <div class="flex items-center gap-2">
                <Layers class="w-3.5 h-3.5 text-ui-textMuted" />
                <span>Subdivision Surface</span>
              </div>
              <span class="text-[10px] text-ui-textMuted font-mono">Catmull–Clark</span>
            </button>

            <button
              @click="projectStore.addModifier('solidify'); showAddMenu = false"
              class="w-full text-left px-2.5 py-1.5 hover:bg-ui-hover rounded-xs flex items-center justify-between text-ui-textPrimary"
            >
              <div class="flex items-center gap-2">
                <Shield class="w-3.5 h-3.5 text-ui-textMuted" />
                <span>Solidify</span>
              </div>
              <span class="text-[10px] text-ui-textMuted font-mono">Shell + rim</span>
            </button>
          </div>
        </div>
      </div>

      <div v-if="!activeMesh" class="rounded-xs border border-ui-borderSubtle bg-ui-surface p-3 text-[11px] leading-relaxed text-ui-textMuted">
        Select a mesh to add Mirror, Subdivision, or Solidify.
      </div>
      <div v-else-if="activeMesh && activeModifiersCount > 0" class="space-y-2">
        <div
          v-if="activeMesh.mirror"
          class="bg-ui-panel border border-ui-borderDefault rounded-xs overflow-hidden shadow-xs"
        >
          <div class="h-7 bg-ui-header px-2 flex items-center justify-between border-b border-ui-borderSubtle">
            <button @click="toggleSection('mirror')" class="flex items-center gap-1.5 font-semibold text-ui-textPrimary text-[11px]">
              <ChevronDown v-if="openModifiers.mirror" class="w-3 h-3 text-ui-textMuted" />
              <ChevronRight v-else class="w-3 h-3 text-ui-textMuted" />
              <FlipHorizontal class="w-3.5 h-3.5 text-ui-textMuted" />
              <span>Mirror</span>
            </button>

            <div class="flex items-center">
              <button
                class="mirror-vis"
                :class="{ 'is-on': activeMesh.mirror.showEdit !== false }"
                title="Show in edit mode"
                @click="toggleMirrorFlag('showEdit')"
              >
                <Triangle class="w-3 h-3" />
              </button>
              <button
                class="mirror-vis"
                :class="{ 'is-on': activeMesh.mirror.enabled }"
                title="Show in viewport"
                @click="toggleMirrorFlag('enabled')"
              >
                <Monitor class="w-3 h-3" />
              </button>
              <button
                class="mirror-vis"
                :class="{ 'is-on': activeMesh.mirror.showRender !== false }"
                title="Show in render"
                @click="toggleMirrorFlag('showRender')"
              >
                <Camera class="w-3 h-3" />
              </button>
              <button
                @click="projectStore.applyMeshModifier('mirror')"
                class="px-1.5 py-0.5 text-[10px] font-medium text-ui-textSecondary hover:text-ui-textPrimary hover:bg-ui-hover rounded-xs"
                title="Apply modifier"
              >
                Apply
              </button>
              <button
                @click="projectStore.removeMeshModifier('mirror')"
                class="mirror-vis hover:text-rose-400"
                title="Delete modifier"
              >
                <Trash2 class="w-3 h-3" />
              </button>
            </div>
          </div>

          <div v-show="openModifiers.mirror" class="mirror-body">
            <div class="mirror-row">
              <span class="mirror-label">Axis</span>
              <div class="mirror-xyz">
                <button :class="{ 'is-on': activeMesh.mirror.axisX }" @click="toggleMirrorFlag('axisX')">X</button>
                <button :class="{ 'is-on': activeMesh.mirror.axisY }" @click="toggleMirrorFlag('axisY')">Y</button>
                <button :class="{ 'is-on': activeMesh.mirror.axisZ }" @click="toggleMirrorFlag('axisZ')">Z</button>
              </div>
            </div>
            <div class="mirror-row">
              <span class="mirror-label">Bisect</span>
              <div class="mirror-xyz">
                <button :class="{ 'is-on': bisectOn('x') }" @click="toggleMirrorFlag('bisectX')">X</button>
                <button :class="{ 'is-on': bisectOn('y') }" @click="toggleMirrorFlag('bisectY')">Y</button>
                <button :class="{ 'is-on': bisectOn('z') }" @click="toggleMirrorFlag('bisectZ')">Z</button>
              </div>
            </div>
            <div class="mirror-row">
              <span class="mirror-label">Flip</span>
              <div class="mirror-xyz">
                <button :class="{ 'is-on': activeMesh.mirror.flipX }" @click="toggleMirrorFlag('flipX')">X</button>
                <button :class="{ 'is-on': activeMesh.mirror.flipY }" @click="toggleMirrorFlag('flipY')">Y</button>
                <button :class="{ 'is-on': activeMesh.mirror.flipZ }" @click="toggleMirrorFlag('flipZ')">Z</button>
              </div>
            </div>

            <div class="mirror-row mirror-gap">
              <span class="mirror-label">Mirror Object</span>
              <div class="mirror-object">
                <select
                  class="mirror-select"
                  :value="activeMesh.mirror.mirrorObjectId || ''"
                  @change="onMirrorObjectChange"
                >
                  <option value="">Object</option>
                  <option v-for="mesh in mirrorTargets" :key="mesh.id" :value="mesh.id">{{ mesh.name }}</option>
                </select>
                <button
                  class="mirror-pick"
                  :class="{ 'is-on': pickingMirrorObject }"
                  title="Pick an object in the viewport"
                  @click="toggleMirrorPick"
                >
                  <Pipette class="w-3 h-3" />
                </button>
              </div>
            </div>

            <label class="mirror-check">
              <input
                type="checkbox"
                class="mirror-box"
                :checked="activeMesh.mirror.clipping"
                @click.prevent="toggleMirrorFlag('clipping')"
              />
              <span>Clipping</span>
            </label>

            <div class="mirror-row">
              <label class="mirror-check">
                <input
                  type="checkbox"
                  class="mirror-box"
                  :checked="activeMesh.mirror.merge"
                  :disabled="!axisOn('X') && !axisOn('Y') && !axisOn('Z')"
                  @click.prevent="toggleMirrorFlag('merge')"
                />
                <span>Merge</span>
              </label>
              <UiNumberField
                :model-value="activeMesh.mirror.mergeThreshold"
                unit="m"
                :step="0.001"
                :min="0"
                :precision="3"
                :disabled="!activeMesh.mirror.merge || (!axisOn('X') && !axisOn('Y') && !axisOn('Z'))"
                @before-change="beginModifierEdit"
                @update:model-value="setMirrorNumber('mergeThreshold', $event)"
              />
            </div>

            <div class="mirror-row">
              <span class="mirror-label">Bisect Distance</span>
              <UiNumberField
                :model-value="activeMesh.mirror.bisectDistance ?? 0.001"
                unit="m"
                :step="0.001"
                :min="0"
                :precision="3"
                @before-change="beginModifierEdit"
                @update:model-value="setMirrorNumber('bisectDistance', $event)"
              />
            </div>

            <button class="mirror-data" @click="mirrorDataOpen = !mirrorDataOpen">
              <ChevronRight v-if="!mirrorDataOpen" class="w-3 h-3" />
              <ChevronDown v-else class="w-3 h-3" />
              <span>Data</span>
            </button>
            <div v-show="mirrorDataOpen" class="mirror-data-body">
              <label class="mirror-check">
                <input type="checkbox" class="mirror-box" :checked="activeMesh.mirror.flipU" @click.prevent="toggleMirrorFlag('flipU')" />
                <span>Mirror U</span>
              </label>
              <label class="mirror-check">
                <input type="checkbox" class="mirror-box" :checked="activeMesh.mirror.flipV" @click.prevent="toggleMirrorFlag('flipV')" />
                <span>Mirror V</span>
              </label>
              <div class="mirror-row">
                <span class="mirror-label" :class="{ 'is-dim': !activeMesh.mirror.flipU }">Offset U</span>
                <UiNumberField
                  :model-value="activeMesh.mirror.offsetU ?? 0"
                  :step="0.01"
                  :precision="3"
                  :disabled="!activeMesh.mirror.flipU"
                  @before-change="beginModifierEdit"
                  @update:model-value="setMirrorNumber('offsetU', $event)"
                />
              </div>
              <div class="mirror-row">
                <span class="mirror-label" :class="{ 'is-dim': !activeMesh.mirror.flipV }">Offset V</span>
                <UiNumberField
                  :model-value="activeMesh.mirror.offsetV ?? 0"
                  :step="0.01"
                  :precision="3"
                  :disabled="!activeMesh.mirror.flipV"
                  @before-change="beginModifierEdit"
                  @update:model-value="setMirrorNumber('offsetV', $event)"
                />
              </div>
            </div>
            <p v-if="pickingMirrorObject" class="mirror-hint">Click an object to use as the mirror center. Esc cancels.</p>
          </div>
        </div>

        <div
          v-if="activeMesh.subdivision"
          class="bg-ui-panel border border-ui-borderDefault rounded-xs overflow-hidden shadow-xs"
        >
          <div class="h-7 bg-ui-header px-2 flex items-center justify-between border-b border-ui-borderSubtle">
            <button @click="toggleSection('subdivision')" class="flex items-center gap-1.5 font-semibold text-ui-textPrimary text-[11px]">
              <ChevronDown v-if="openModifiers.subdivision" class="w-3 h-3 text-ui-textMuted" />
              <ChevronRight v-else class="w-3 h-3 text-ui-textMuted" />
              <Layers class="w-3.5 h-3.5 text-ui-textMuted" />
              <span>Subdivision Surface</span>
            </button>

            <div class="flex items-center space-x-1">
              <label class="flex items-center" title="Realtime">
                <input
                  type="checkbox"
                  :checked="activeMesh.subdivision.enabled"
                  class="accent-ui-accent"
                  @click.prevent="toggleSubdivEnabled"
                />
              </label>
              <button
                @click="projectStore.applyMeshModifier('subdivision')"
                class="px-2 py-0.5 bg-ui-accent hover:bg-indigo-500 text-white rounded-xs text-[10px] font-medium transition"
                title="Bake into mesh"
              >
                Apply
              </button>
              <button
                @click="projectStore.removeMeshModifier('subdivision')"
                class="p-1 text-ui-textMuted hover:text-rose-400 rounded-xs hover:bg-ui-hover transition"
                title="Remove Modifier"
              >
                <Trash2 class="w-3 h-3" />
              </button>
            </div>
          </div>

          <div v-show="openModifiers.subdivision" class="p-2.5 space-y-2">
            <div class="flex items-center justify-between text-[11px]">
              <span class="text-ui-textSecondary font-bold">Type</span>
              <div class="flex items-center space-x-1">
                <button
                  @click="setSubdivType('catmull-clark')"
                  class="px-2 py-0.5 rounded-xs border text-[10px] font-bold"
                  :class="(activeMesh.subdivision.type || 'catmull-clark') === 'catmull-clark' ? 'inspector-chip is-active' : 'inspector-chip'"
                >
                  Catmull–Clark
                </button>
                <button
                  @click="setSubdivType('simple')"
                  class="px-2 py-0.5 rounded-xs border text-[10px] font-bold"
                  :class="activeMesh.subdivision.type === 'simple' ? 'inspector-chip is-active' : 'inspector-chip'"
                >
                  Simple
                </button>
              </div>
            </div>
            <div class="flex items-center justify-between text-[11px]">
              <span class="text-ui-textSecondary font-bold">Levels</span>
              <div class="flex items-center space-x-1">
                <button
                  v-for="lv in [1, 2, 3]"
                  :key="lv"
                  @click="setSubdivLevel(lv)"
                  class="px-2.5 py-0.5 rounded-xs border text-[10px] font-bold"
                  :class="activeMesh.subdivision.level === lv ? 'inspector-chip is-active' : 'inspector-chip'"
                >
                  {{ lv }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div
          v-if="activeMesh.solidify"
          class="bg-ui-panel border border-ui-borderDefault rounded-xs overflow-hidden shadow-xs"
        >
          <div class="h-7 bg-ui-header px-2 flex items-center justify-between border-b border-ui-borderSubtle">
            <button @click="toggleSection('solidify')" class="flex items-center gap-1.5 font-semibold text-ui-textPrimary text-[11px]">
              <ChevronDown v-if="openModifiers.solidify" class="w-3 h-3 text-ui-textMuted" />
              <ChevronRight v-else class="w-3 h-3 text-ui-textMuted" />
              <Shield class="w-3.5 h-3.5 text-ui-textMuted" />
              <span>Solidify</span>
            </button>

            <div class="flex items-center space-x-1">
              <label class="flex items-center" title="Realtime">
                <input
                  type="checkbox"
                  :checked="activeMesh.solidify.enabled"
                  class="accent-ui-accent"
                  @click.prevent="toggleSolidifyEnabled"
                />
              </label>
              <button
                @click="projectStore.applyMeshModifier('solidify')"
                class="px-2 py-0.5 bg-ui-accent hover:bg-indigo-500 text-white rounded-xs text-[10px] font-medium transition"
                title="Bake into mesh"
              >
                Apply
              </button>
              <button
                @click="projectStore.removeMeshModifier('solidify')"
                class="p-1 text-ui-textMuted hover:text-rose-400 rounded-xs hover:bg-ui-hover transition"
                title="Remove Modifier"
              >
                <Trash2 class="w-3 h-3" />
              </button>
            </div>
          </div>

          <div v-show="openModifiers.solidify" class="p-2.5 space-y-2">
            <div class="space-y-1">
              <span class="text-[10px] text-ui-textSecondary font-bold">Thickness</span>
              <UiNumberField
                v-model="activeMesh.solidify.thickness"
                :step="0.01"
                :precision="3"
                @before-change="beginModifierEdit"
                @change="bump"
              />
            </div>
            <div class="space-y-1">
              <span class="text-[10px] text-ui-textSecondary font-bold">Offset</span>
              <UiNumberField
                v-model="activeMesh.solidify.offset"
                :step="0.1"
                :min="-1"
                :max="1"
                :precision="2"
                @before-change="beginModifierEdit"
                @change="bump"
              />
            </div>
            <label class="flex items-center space-x-1.5 cursor-pointer bg-ui-input p-1.5 rounded-xs border border-ui-borderSubtle text-[10px]">
              <input
                type="checkbox"
                :checked="activeMesh.solidify.fillRim !== false"
                class="rounded-xs bg-ui-panel border-ui-borderDefault text-ui-accent"
                @click.prevent="setFillRim(activeMesh.solidify.fillRim === false)"
              />
              <span>Fill Rim</span>
            </label>
          </div>
        </div>
      </div>

      <div v-else class="p-6 text-center text-ui-textMuted italic text-xs border border-dashed border-ui-borderSubtle rounded-xs">
        No modifiers on this object.
      </div>
    </div>
  </div>
</template>

<style scoped>
.mirror-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px 10px;
}
.mirror-row {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  min-height: 22px;
}
.mirror-gap {
  margin-top: 6px;
}
.mirror-label {
  font-size: 11px;
  color: var(--ui-text-secondary);
}
.mirror-label.is-dim {
  opacity: 0.4;
}
.mirror-xyz {
  display: flex;
  width: 100%;
  max-width: 148px;
  margin-left: auto;
}
.mirror-xyz button {
  flex: 1;
  height: 20px;
  background: #3a3a3a;
  color: #e6e6e6;
  border: 1px solid #1c1c1c;
  font-size: 11px;
  font-weight: 650;
  line-height: 1;
}
.mirror-xyz button + button {
  margin-left: -1px;
}
.mirror-xyz button.is-on {
  background: #e0872f;
  color: #fff;
  border-color: #b86a18;
  position: relative;
  z-index: 1;
}
.mirror-xyz button:first-child {
  border-radius: 3px 0 0 3px;
}
.mirror-xyz button:last-child {
  border-radius: 0 3px 3px 0;
}
.mirror-object {
  display: flex;
  gap: 4px;
  min-width: 0;
}
.mirror-select {
  min-width: 0;
  flex: 1;
  height: 22px;
  background: #2a2a2a;
  color: #ddd;
  border: 1px solid #1c1c1c;
  border-radius: 3px;
  padding: 0 4px;
  font-size: 11px;
}
.mirror-pick,
.mirror-vis {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 20px;
  color: #9a9a9a;
  border-radius: 3px;
}
.mirror-pick {
  background: #2a2a2a;
  border: 1px solid #1c1c1c;
}
.mirror-vis.is-on,
.mirror-pick.is-on {
  color: #e0872f;
}
.mirror-check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--ui-text-secondary);
  min-height: 22px;
}
.mirror-box {
  accent-color: #e0872f;
  width: 13px;
  height: 13px;
}
.mirror-data {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--ui-text-primary);
  text-align: left;
}
.mirror-data-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-left: 4px;
}
.mirror-hint {
  font-size: 10px;
  line-height: 1.35;
  color: #e0872f;
}
</style>
