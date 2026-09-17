<script setup lang="ts">
import { computed, ref } from 'vue'
import { operatorManager } from '../../core/operators/OperatorManager'
import { ShapeDrawOperator } from '../../core/operators/ShapeDrawOperator'
import { shapeSourceIsCurrent } from '../../core/shapeDraw/ShapeRecipe'
import { useProjectStore } from '../../stores/projectStore'
import { useHistoryStore } from '../../stores/historyStore'
import { useFloatingDrag } from '../../composables/useFloatingDrag'

const emit = defineEmits<{ start: [fresh: boolean] }>()
const project = useProjectStore(), history = useHistoryStore()
const revision = computed(() => operatorManager.state.value.previewTick)
const minimized = ref(false)
const position = ref({ x: Math.max(60, window.innerWidth - 340), y: 100 })
const { startDrag } = useFloatingDrag(position, { minX: 8, minY: 42, maxPadX: 280, maxPadY: 240 })
const op = computed(() => {
  void operatorManager.state.value.previewTick
  if (!operatorManager.state.value.active) return null
  return operatorManager.activeOperator instanceof ShapeDrawOperator ? operatorManager.activeOperator : null
})
const visible = computed(() => !!op.value || (!operatorManager.state.value.active && !!project.activeMesh?.shapeSource))
const current = computed(() => !!project.activeMesh && shapeSourceIsCurrent(project.activeMesh))
const points = computed(() => { void revision.value; return op.value?.overlayPoints() ?? [] })
const depthHandle = computed(() => { void revision.value; return op.value?.closed && !op.value.editingSide ? op.value.depthHandle() : null })
function refresh() { operatorManager.state.value.previewTick++ }
function parameter(key: 'depth' | 'roundness' | 'density' | 'style' | 'taper' | 'frontBias' | 'topology', event: Event) {
  const raw = (event.target as HTMLInputElement).value
  op.value?.setParameter(key, key === 'style' || key === 'topology' ? raw : Number(raw)); refresh()
}
function finish(bake: boolean) {
  if (!op.value?.canFinish) return
  op.value.bake = bake; operatorManager.confirm()
}
function bakeSelected() {
  if (!project.activeMesh) return
  history.recordState('Make Shape Editable Mesh')
  const next = { ...project.activeMesh }; delete next.shapeSource
  project.replaceMesh(next)
}
</script>

<template>
  <svg v-if="op" :data-revision="revision" class="absolute inset-0 w-full h-full pointer-events-none z-30" aria-hidden="true">
    <g v-if="depthHandle">
      <line :x1="depthHandle.start.x" :y1="depthHandle.start.y" :x2="depthHandle.end.x" :y2="depthHandle.end.y" stroke="#fbbf24" stroke-width="2" />
      <circle :cx="depthHandle.end.x" :cy="depthHandle.end.y" r="8" fill="#fbbf24" stroke="#45300e" stroke-width="2" />
      <text :x="depthHandle.end.x + 12" :y="depthHandle.end.y + 4" fill="#fbbf24" font-size="11">Depth</text>
    </g>
    <g v-for="(point, index) in points" :key="index">
      <circle :cx="point.x" :cy="point.y" :r="index === op.selected ? 6 : 4" :fill="index === op.selected ? '#fff' : '#6ee7b7'" stroke="#183b32" stroke-width="1.5" />
      <circle v-if="index === 0 && !op.closed" :cx="point.x" :cy="point.y" r="12" fill="none" stroke="#6ee7b7" stroke-dasharray="3 3" />
    </g>
  </svg>
  <section v-if="visible" :data-revision="revision" data-floating-panel class="shape-panel fixed z-50 hud-panel" :style="{ left: `${position.x}px`, top: `${position.y}px` }" aria-label="Shape Draw">
    <header @pointerdown="startDrag">
      <strong>Shape Draw</strong><span class="tag">{{ op?.recipe.kind === 'path' ? 'PATH' : op?.recipe.kind === 'loft' ? 'SECTIONS' : 'OUTLINE' }}</span>
      <button title="Minimize Shape Draw" @pointerdown.stop @click="minimized = !minimized">{{ minimized ? '+' : '−' }}</button>
      <button v-if="op" title="Cancel this edit (Esc)" @pointerdown.stop @click="operatorManager.cancel()">×</button>
    </header>
    <div v-if="!minimized" class="body">
      <template v-if="op">
        <label v-if="!op.recipe.points.length">Start with<select :value="op.recipe.kind ?? 'outline'" @change="op.setKind(($event.target as HTMLSelectElement).value as 'outline' | 'path' | 'loft'); refresh()"><option value="outline">Outline</option><option value="path">Path with thickness</option><option value="loft">Cross-sections</option></select></label>
        <label v-if="!op.closed">Draw<select v-model="op.drawingMode"><option value="points">Click points</option><option value="freehand">Freehand</option></select></label>
        <label v-if="!op.isPath && op.recipe.kind !== 'loft'">Symmetry<select :value="op.recipe.symmetry ?? 'none'" @change="op.setSymmetry(($event.target as HTMLSelectElement).value as 'none' | 'x' | 'y'); refresh()"><option value="none">Off</option><option value="x">Half outline · X</option><option value="y">Half outline · Y</option></select></label>
        <p v-if="op.recipe.symmetry && op.recipe.symmetry !== 'none'" class="hint">Draw one side. First and last points meet the drawing's {{ op.recipe.symmetry.toUpperCase() }} = 0 line.</p>
        <p class="hint">{{ op.closed ? 'Shape the volume. Your outline stays editable.' : 'Draw any silhouette over a reference or empty space.' }}</p>
        <p v-if="op.editingSide" class="hint">Edit the depth outline in the Side view. Keep its top and bottom aligned with the front outline.</p>
        <div v-if="op.recipe.sideProfile" class="row"><button @click="op.sideProfile(!op.editingSide); refresh()">{{ op.editingSide ? 'Edit front outline' : 'Edit side profile' }}</button><button @click="op.removeSideProfile(); refresh()">Remove side</button></div>
        <label v-if="op.recipe.holes?.length">Contour<select :value="op.selectedHole" @change="op.setHole(Number(($event.target as HTMLSelectElement).value)); refresh()"><option :value="-1">Outer outline</option><option v-for="(_, index) in op.recipe.holes" :key="index" :value="index">Hole {{ index + 1 }}</option></select></label>
        <button v-if="op.selectedHole >= 0" @click="op.removeHole(); refresh()">Remove this hole</button>
        <div class="row"><button :disabled="!op.canUndo" @click="op.history(); refresh()">Undo</button><button :disabled="!op.canRedo" @click="op.history(true); refresh()">Redo</button><button :disabled="op.points.length < 4" @click="op.simplify(); refresh()">Simplify</button><span>{{ op.points.length }} points</span></div>
        <div v-if="op.selected >= 0" class="row"><button @click="op.insertPoint(); refresh()">Insert after point</button><button @click="op.removePoint(); refresh()">Remove</button></div>
        <button v-if="op.selected >= 0 && !op.isPath" @click="op.smoothPoint(); refresh()">{{ op.points[op.selected]?.smooth ? 'Make corner' : 'Smooth this point' }}</button>
        <button v-if="!op.closed" class="primary" :disabled="op.points.length < (op.isPath ? 2 : 3)" @click="op.closeOutline(); refresh()">{{ op.isPath ? 'Give path thickness' : 'Close outline' }} · Enter</button>
        <template v-else>
          <template v-if="op.recipe.kind === 'loft'">
            <label>Section<select :value="op.selectedSection" @change="op.setSection(Number(($event.target as HTMLSelectElement).value)); refresh()"><option :value="0">1 · Start</option><option v-for="(section, index) in op.recipe.sections" :key="index" :value="index + 1">{{ index + 2 }} · {{ Math.round(section.at * 100) }}%</option></select></label>
            <div class="row"><button @click="op.addSection(); refresh()">Add section</button><button @click="op.scaleSection(0.9); refresh()">Narrower</button><button @click="op.scaleSection(1.1); refresh()">Wider</button></div>
          </template>
          <label v-else>Form<select :value="op.recipe.style" @change="parameter('style', $event)"><option v-if="!op.isPath" value="flat">Flat</option><option value="rounded">Rounded</option><option v-if="!op.isPath" value="inflated">Inflated</option><option value="blocky">Blocky</option><option v-if="!op.isPath" value="organic">Organic</option><option value="hard-surface">Hard Surface</option></select></label>
          <p v-if="!op.isPath && op.recipe.kind !== 'loft' && ['rounded', 'blocky', 'organic'].includes(op.recipe.style) && op.recipe.topology !== 'triangles' && !op.recipe.holes?.length" class="hint">Draw flat top and bottom edges for full end caps. Use a side profile to shape the depth along the body.</p>
          <label>{{ op.isPath ? 'Thickness' : 'Depth' }}<input aria-label="Shape depth" type="number" min="0.001" max="1000" step="0.1" :value="op.recipe.depth" @change="parameter('depth', $event)" /></label>
          <label v-if="op.isPath">End thickness<input aria-label="Path taper" type="range" min="0.05" max="2" step="0.05" :value="op.recipe.taper ?? 1" @pointerdown="op.beginParameterGesture()" @input="parameter('taper', $event)" @change="op.endParameterGesture()" @blur="op.endParameterGesture()" /></label>
          <label v-if="!op.isPath && op.recipe.kind !== 'loft' && !['flat', 'hard-surface'].includes(op.recipe.style)">Roundness<input aria-label="Shape roundness" type="range" min="0" max="1" step="0.05" :value="op.recipe.roundness" @pointerdown="op.beginParameterGesture()" @keydown="op.beginParameterGesture()" @input="parameter('roundness', $event)" @change="op.endParameterGesture()" @blur="op.endParameterGesture()" /></label>
          <label v-if="op.recipe.kind !== 'loft'">Detail<select :value="op.recipe.density" @change="parameter('density', $event)"><option :value="0">Very low</option><option :value="1">Low</option><option :value="2">Medium</option></select></label>
          <label v-if="!op.isPath && op.recipe.kind !== 'loft'">Surface layout<select :value="op.recipe.topology ?? 'auto'" @change="parameter('topology', $event)"><option value="auto">Auto · quad flow</option><option value="quad-grid">Quad grid</option><option value="triangles">Even triangles</option></select></label>
          <p class="hint">{{ op.triangleCount }} tris · {{ op.faceCount }} faces · {{ op.quadCount }} quads</p>
          <details v-if="!op.isPath && op.recipe.kind !== 'loft'"><summary>More shaping</summary><label>Front / back<input aria-label="Front back balance" type="range" min="-0.9" max="0.9" step="0.05" :value="op.recipe.frontBias ?? 0" @pointerdown="op.beginParameterGesture()" @input="parameter('frontBias', $event)" @change="op.endParameterGesture()" @blur="op.endParameterGesture()" /></label><div class="row"><button @click="op.addHole(); refresh()">Draw a hole</button><button v-if="!op.recipe.sideProfile" @click="op.sideProfile(true); refresh()">Add side profile</button></div></details>
          <button @click="op.reopen(); refresh()">Reopen drawing</button>
        </template>
        <p :class="op.error ? 'error' : 'hint'" role="status">{{ op.statusText }}</p>
        <div v-if="op.closed" class="actions"><button class="primary" :disabled="!op.canFinish" @click="finish(false)">Done</button><button :disabled="!op.canFinish" @click="finish(true)">Make Editable Mesh</button></div>
      </template>
      <template v-else>
        <p class="hint">{{ current ? 'This object retains its Shape Draw outline.' : 'This mesh has changed since Shape Draw. Keep those edits by making it an editable mesh.' }}</p>
        <button class="primary" :disabled="!current" @click="emit('start', false)">Edit outline & volume</button>
        <div class="row"><button @click="bakeSelected">Make Editable Mesh</button><button @click="emit('start', true)">New shape</button></div>
      </template>
    </div>
  </section>
</template>

<style scoped>
.shape-panel { width:280px; color:var(--color-text-primary, #e3e8ec); background:var(--color-panel, #202329); border:1px solid #465451; border-radius:8px; box-shadow:0 12px 32px #0006; font:12px/1.45 sans-serif; max-height:calc(100vh - 110px); overflow:auto; }
header { display:flex; align-items:center; gap:8px; padding:9px 12px; border-bottom:1px solid #3a4245; cursor:move; }
header strong { flex:1; } .tag { color:#86d9c5; font-size:9px; letter-spacing:1px; }
.body { padding:12px; display:flex; flex-direction:column; gap:10px; }
p { margin:0; } .hint { color:#acb9bd; font-size:11px; } .error { color:#fda4af; }
button, select, input { font:inherit; color:inherit; background:#30373d; border:1px solid #4a565a; border-radius:4px; padding:5px 7px; }
button { cursor:pointer; } button:hover:not(:disabled) { background:#40524d; } button:disabled { opacity:.4; cursor:default; }
button.primary { background:#285e51; border-color:#448875; color:#eafff9; }
header button { padding:0 5px; border:0; background:transparent; font-size:16px; }
label { display:flex; align-items:center; justify-content:space-between; gap:12px; }
label input, label select { width:145px; min-width:0; }
.row, .actions { display:flex; gap:6px; align-items:center; } .row span { margin-left:auto; color:#acb9bd; font-size:10px; }
.actions button:first-child { flex:1; } input[type=range] { padding:0; accent-color:#6ee7b7; }
</style>
