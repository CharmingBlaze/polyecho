<script setup lang="ts">
import { computed, ref } from 'vue'
import { operatorManager } from '../../core/operators/OperatorManager'
import { PolyDrawOperator } from '../../core/operators/PolyDrawOperator'
import { useFloatingDrag } from '../../composables/useFloatingDrag'

const minimized = ref(false)
const position = ref({ x: Math.max(48, window.innerWidth - 330), y: 110 })
const { startDrag } = useFloatingDrag(position, { minX: 8, minY: 40, maxPadX: 290, maxPadY: 100 })
const op = computed(() => {
  void operatorManager.state.value.previewTick
  return operatorManager.state.value.active && operatorManager.activeOperator instanceof PolyDrawOperator
    ? operatorManager.activeOperator : null
})
function refresh() {
  operatorManager.state.value.previewTick++
  if (op.value) operatorManager.state.value.statusText = op.value.statusText
}
function update(key: keyof PolyDrawOperator['options'], event: Event) {
  const input = event.target as HTMLInputElement
  if (input.value === '' || !input.validity.valid) return
  op.value?.setOption(key, key === 'centered' ? input.checked : Number(input.value))
  refresh()
}
</script>

<template>
  <section v-if="op" data-floating-panel class="poly-draw-panel fixed z-50 hud-panel"
    :data-revision="operatorManager.state.value.previewTick"
    :style="{ left: `${position.x}px`, top: `${position.y}px` }" aria-label="Poly Draw options"
    @pointerdown.stop @pointermove.stop @mousedown.stop @click.stop @dblclick.stop @wheel.stop
    @keydown.stop @keydown.esc.prevent="operatorManager.cancel()" @keyup.stop @contextmenu.prevent>
    <header @pointerdown="startDrag">
      <strong>Poly Draw</strong><span>LIVE</span>
      <button :aria-label="minimized ? 'Expand options' : 'Minimize options'" @pointerdown.stop @click="minimized = !minimized">{{ minimized ? '+' : '−' }}</button>
    </header>
    <div v-if="!minimized" class="body">
      <template v-if="op.phase === 'draw'">
        <p>Click to draw your outline. Close it to adjust thickness, taper, and bevel in real time.</p>
        <p>{{ op.points.length }} points · Right-click to undo a point</p>
        <button class="primary" :disabled="!op.canClose" @click="op.closeFromHud(); refresh()">Close outline</button>
      </template>
      <template v-else>
        <p>Changes preview instantly. Editing an option holds the thickness steady.</p>
        <label>Thickness<input aria-label="Poly Draw thickness" type="number" min="-1000" max="1000" step="0.01" :value="Number(op.options.depth.toFixed(3))" @input="update('depth', $event)" /></label>
        <label>Centered extrusion<input type="checkbox" :checked="op.options.centered" @change="update('centered', $event)" /></label>
        <label>End size <output>{{ Math.round(op.options.taper * 100) }}%</output></label>
        <input aria-label="Poly Draw end size" type="range" min="0.05" max="3" step="0.05" :value="op.options.taper" @input="update('taper', $event)" />
        <h4>Bevel</h4>
        <label>Width<input aria-label="Poly Draw bevel width" type="number" min="0" max="100" step="0.01" :value="op.options.bevel" @input="update('bevel', $event)" /></label>
        <input aria-label="Poly Draw bevel slider" type="range" min="0" max="1" step="0.01" :value="op.options.bevel" @input="update('bevel', $event)" />
        <label>Segments<input aria-label="Poly Draw bevel segments" type="number" min="1" max="8" step="1" :value="op.options.segments" @input="update('segments', $event)" /></label>
        <label>Profile<select :value="op.options.profile" @change="update('profile', $event)"><option :value="0">Chamfer</option><option :value="0.5">Rounded</option><option :value="1">Concave</option></select></label>
        <p>Width is limited to fit the edges. Use 3 or more segments for curved profiles.</p>
        <p v-if="op.optionsError" role="status" class="error">{{ op.optionsError }}</p>
        <div class="actions"><button @click="op.flipFromHud(); refresh()">Flip direction</button><button :disabled="!op.depthLocked" @click="op.depthLocked = false; refresh()">Drag thickness</button></div>
        <button class="primary" @click="operatorManager.confirm()">Apply shape</button>
      </template>
      <button @click="operatorManager.cancel()">Cancel</button>
    </div>
  </section>
</template>

<style scoped>
.poly-draw-panel { width: 280px; max-height: calc(100vh - 150px); overflow: auto; color: #dddde5; background: #222229; border: 1px solid #50505d; border-radius: 8px; box-shadow: 0 12px 36px #0008; font-size: 12px; }
header { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-bottom: 1px solid #41414b; cursor: move; }
header span { color: #6ee7b7; font-size: 10px; flex: 1; }
.body { display: flex; flex-direction: column; gap: 10px; padding: 12px; }
p { color: #aaaab9; font-size: 11px; line-height: 1.5; margin: 0; }
label, .actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
h4 { border-top: 1px solid #41414b; padding-top: 10px; margin: 0; }
input[type=number], select { width: 108px; background: #15151b; color: #eee; border: 1px solid #50505d; padding: 5px; border-radius: 4px; }
input[type=range] { width: 100%; accent-color: #34d399; }
button { border: 1px solid #50505d; border-radius: 4px; padding: 6px 8px; background: #30303a; color: #eee; cursor: pointer; }
button:hover { background: #41414c; } button:disabled { opacity: .4; cursor: default; }
button.primary { background: #17624d; border-color: #2a9575; }
.error { color: #fbbf24; }
</style>
