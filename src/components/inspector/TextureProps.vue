<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { useToolStore } from '../../stores/toolStore'
import UiButton from '../ui/UiButton.vue'
import ImportTextureModal from '../modals/ImportTextureModal.vue'
import NewTextureModal from '../modals/NewTextureModal.vue'
import TextureSharePrompt from '../modals/TextureSharePrompt.vue'
import { activateTileset, openTileset } from '../../composables/useTilesetWindow'
import { useTextureApply } from '../../composables/useTextureApply'
import { saveBlobDocument } from '../../core/desktop/desktopApi'

const projectStore = useProjectStore()
const toolStore = useToolStore()
const { isOpen: sharePromptOpen, sharedCount: sharePromptCount, applyToActiveMesh,
  confirm: confirmShareApply, cancel: cancelShareApply } = useTextureApply()
const tab = ref<'image' | 'library' | 'advanced'>('image')
const activeTexture = computed(() => projectStore.activeTexture)
const query = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const fileIntent = ref<'import' | 'replace'>('import')
const pendingFile = ref<File | null>(null)
const showNew = ref(false)
const dragging = ref(false)
const imageName = ref('')
const width = ref(64)
const height = ref(64)
const resizeMode = ref<'resample' | 'crop'>('resample')
const cols = ref(2)
const rows = ref(2)
const layerCount = computed(() => { projectStore.textureRevision; return activeTexture.value?.pixelBuffer?.layers.length || 1 })
const preview = computed(() => { projectStore.textureRevision; return activeTexture.value?.pixelBuffer?.toDataURL() || activeTexture.value?.dataUrl })
const usedBy = computed(() => {
  const ids = new Set(projectStore.materials.filter(m => m.textureId === activeTexture.value?.id).map(m => m.id))
  return projectStore.meshes.filter(m => ids.has(m.materialId || ''))
})
const assigned = computed(() => usedBy.value.some(m => m.id === projectStore.activeMeshId))
const library = computed(() => projectStore.textures.filter(t => t.name.toLowerCase().includes(query.value.trim().toLowerCase())))
watch(() => [activeTexture.value?.id, activeTexture.value?.width, activeTexture.value?.height, activeTexture.value?.name, activeTexture.value?.atlas?.cols, activeTexture.value?.atlas?.rows], () => {
  const t = activeTexture.value
  imageName.value = t?.name || ''
  width.value = t?.width || 64
  height.value = t?.height || 64
  cols.value = t?.atlas?.cols || 2
  rows.value = t?.atlas?.rows || 2
}, { immediate: true })

function selectImage(id: string) { projectStore.selectTexture(id); tab.value = 'image' }
async function openEditor(mode: 'paint' | 'uv') {
  const imageId = activeTexture.value?.id
  toolStore.setAppMode('uvpaint')
  toolStore.uvWorkspaceTab = mode
  // Workspace entry follows the selected mesh; an explicit image action keeps its image.
  await nextTick()
  if (imageId) projectStore.selectTexture(imageId)
}
function pickFile(intent: 'import' | 'replace') {
  fileIntent.value = intent
  fileInput.value?.click()
}
function importFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] || null
  input.value = ''
  if (!file) return
  if (fileIntent.value === 'replace') void replaceImage(file)
  else pendingFile.value = file
}
function dropFile(event: DragEvent) {
  dragging.value = false
  const file = event.dataTransfer?.files[0]
  if (!file?.type.startsWith('image/')) return
  if (event.shiftKey && activeTexture.value) void replaceImage(file)
  else pendingFile.value = file
}
async function replaceImage(file: File) {
  const t = activeTexture.value
  if (!t) return
  projectStore.selectTexture(t.id)
  projectStore.recordPixels('Replace image')
  await t.pixelBuffer.loadFromFile(file, true)
  t.width = t.pixelBuffer.width
  t.height = t.pixelBuffer.height
  projectStore.markTextureUpdated(t.id)
}
function deleteImage() {
  const t = activeTexture.value
  if (!t || projectStore.textures.length < 2) return
  const users = usedBy.value.length
  if (users && !confirm(`Delete "${t.name}"? It will be removed from ${users} object${users === 1 ? '' : 's'}.`)) return
  projectStore.deleteTexture(t.id)
}
function imported(id: string) {
  selectImage(id)
  pendingFile.value = null
  if (id) activateTileset(id)
  if (id && projectStore.activeMesh && !projectStore.activeMesh.locked) {
    projectStore.applyTextureToMesh(projectStore.activeMesh.id, id, 'this_object')
  }
}
function bindCreatedImage(textureId: string) {
  const mesh = projectStore.activeMesh
  if (!mesh || mesh.locked) return
  projectStore.applyTextureToMesh(mesh.id, textureId, 'this_object', { record: false })
}
function createImage(payload: { name: string; width: number; height: number; fill: 'transparent' | 'white' | 'black' | 'primary' }) {
  const t = projectStore.createTexture(payload.name, payload.width, payload.height)
  if (payload.fill !== 'transparent') {
    t.pixelBuffer.clear(payload.fill === 'primary' ? toolStore.primaryColor : payload.fill === 'white' ? '#ffffff' : '#111111')
    projectStore.markTextureUpdated(t.id)
  }
  bindCreatedImage(t.id)
  showNew.value = false
  tab.value = 'image'
}
function rename() {
  if (imageName.value.trim() && activeTexture.value) projectStore.renameTexture(activeTexture.value.id, imageName.value.trim())
  else imageName.value = activeTexture.value?.name || ''
}
function resize() {
  const t = activeTexture.value
  if (!t) return
  const w = Math.max(8, Math.min(4096, Math.round(Number(width.value) || t.width)))
  const h = Math.max(8, Math.min(4096, Math.round(Number(height.value) || t.height)))
  if (w === t.width && h === t.height) return
  projectStore.recordPixels(resizeMode.value === 'crop' ? 'Change Canvas Size' : 'Resize Image')
  const pb = projectStore.ensureTextureBuffer(t)
  pb.resize(w, h, resizeMode.value)
  t.width = w; t.height = h
  projectStore.markTextureUpdated(t.id)
}
function exportPng() {
  const t = activeTexture.value
  if (!t) return
  projectStore.ensureTextureBuffer(t).canvas.toBlob(blob => {
    if (blob) void saveBlobDocument(blob, `${t.name}.png`, [{ name: 'PNG image', extensions: ['png'] }])
  })
}
function setGrid() {
  if (!activeTexture.value) return
  cols.value = Math.max(1, Math.min(16, Math.round(Number(cols.value) || 1)))
  rows.value = Math.max(1, Math.min(16, Math.round(Number(rows.value) || 1)))
  projectStore.setTextureAtlasGrid(activeTexture.value.id, cols.value, rows.value)
}
function applyEverywhere() {
  if (activeTexture.value && confirm(`Use "${activeTexture.value.name}" on every material in the scene? This can be undone.`)) projectStore.applyTextureToAllMaterials(activeTexture.value.id)
}
function bakeAtlas() {
  if (confirm('Combine all object textures into one image and rearrange their UVs? This can be undone.')) projectStore.bakeSceneAtlas(2)
}
</script>

<template>
  <div class="texture-inspector" @dragover.prevent="dragging = true" @dragleave.prevent="dragging = false" @drop.prevent="dropFile">
    <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="importFile" />
    <div v-if="dragging" class="texture-drop">Drop to import · Shift-drop replaces this image</div>
    <header class="texture-heading"><strong>Textures</strong><span>{{ projectStore.textures.length }} {{ projectStore.textures.length === 1 ? 'image' : 'images' }}</span></header>
    <nav class="texture-tabs" aria-label="Texture inspector sections">
      <button v-for="item in (['image', 'library', 'advanced'] as const)" :key="item" :aria-pressed="tab === item" :class="{ active: tab === item }" @click="tab = item">{{ item === 'image' ? 'Image' : item === 'library' ? 'Library' : 'Advanced' }}</button>
    </nav>

    <template v-if="tab === 'image' && activeTexture">
      <section class="texture-card">
        <button class="texture-preview checker" @click="openEditor('paint')" title="Open image in Paint"><img :src="preview" alt="Active texture preview" /></button>
        <div class="texture-summary"><strong :title="activeTexture.name">{{ activeTexture.name }}</strong><span>{{ activeTexture.width }} × {{ activeTexture.height }} px</span><span>{{ layerCount }} {{ layerCount === 1 ? 'layer' : 'layers' }} · {{ usedBy.length ? `${usedBy.length} ${usedBy.length === 1 ? 'object uses' : 'objects use'} this` : 'Not applied to an object' }}</span></div>
      </section>
      <div class="texture-actions">
        <UiButton size="xs" variant="accent" @click="showNew = true">New</UiButton>
        <UiButton size="xs" @click="pickFile('import')">Import</UiButton>
        <UiButton size="xs" @click="pickFile('replace')">Replace</UiButton>
        <UiButton size="xs" variant="danger" :disabled="projectStore.textures.length < 2" @click="deleteImage">Delete</UiButton>
      </div>
      <div class="texture-actions"><UiButton size="xs" variant="accent" @click="openEditor('paint')">Open Paint</UiButton><UiButton size="xs" @click="openEditor('uv')">Edit UV layout</UiButton><UiButton size="xs" @click="exportPng">Export PNG</UiButton></div>
      <div class="texture-actions"><UiButton size="xs" @click="openTileset(projectStore.activeTextureId)">Tileset atlas · Browse & edit tiles</UiButton></div>
      <section class="texture-section">
        <h3>Use on object</h3>
        <div class="texture-assignment"><strong>{{ projectStore.activeMesh?.name || 'No object selected' }}</strong><span :class="{ assigned }">{{ assigned ? 'Using this image' : 'Not using this image' }}</span></div>
        <UiButton size="xs" class="w-full" :variant="assigned ? 'default' : 'accent'" :disabled="!projectStore.activeMesh || assigned" @click="applyToActiveMesh(activeTexture.id)">{{ assigned ? 'Applied to this object' : 'Apply to selected object' }}</UiButton>
        <p v-if="usedBy.length > 1">Painting updates all {{ usedBy.length }} objects that use this image. Duplicate the image to paint a separate version.</p>
        <p v-else>Choose an image in Library, then apply it here.</p>
      </section>
      <section class="texture-section">
        <h3>Image settings</h3>
        <label>Name<input v-model="imageName" aria-label="Texture image name" @change="rename" @keydown.enter="($event.target as HTMLInputElement).blur()" /></label>
        <details class="texture-details"><summary>Resize image or canvas <span>{{ activeTexture.width }} × {{ activeTexture.height }}</span></summary>
          <div class="texture-details-body">
            <label>Width<input type="number" min="8" max="4096" v-model.number="width" aria-label="Texture width" /></label>
            <label>Height<input type="number" min="8" max="4096" v-model.number="height" aria-label="Texture height" /></label>
            <select v-model="resizeMode" aria-label="Texture resize method"><option value="resample">Scale pixels (nearest neighbor)</option><option value="crop">Change canvas (keep pixel size)</option></select>
            <p>{{ resizeMode === 'crop' ? 'Adds or removes space at the right and bottom edges.' : 'Scales every layer to the new dimensions with crisp pixels.' }}</p>
            <UiButton size="xs" @click="resize">{{ resizeMode === 'crop' ? 'Change canvas size' : 'Resize image' }}</UiButton>
          </div>
        </details>
        <div class="texture-actions"><UiButton size="xs" @click="projectStore.duplicateTexture(activeTexture.id)">Duplicate image</UiButton></div>
        <p>New adds a blank image and puts it on the selected object. Import adds a file and does the same. Replace updates this image’s pixels. Delete removes it from the project.</p>
      </section>
      <details class="texture-details texture-maintenance"><summary>Remove or reset…</summary><div class="texture-details-body">
        <p>These actions can be undone. Deleting an image also removes it from objects using it.</p>
        <UiButton size="xs" :disabled="!assigned" @click="projectStore.unbindTextureFromMaterial(projectStore.activeMesh!.materialId!)">Remove from object's material</UiButton>
        <UiButton size="xs" variant="danger" :disabled="projectStore.textures.length < 2" @click="projectStore.deleteTexture(activeTexture.id)">Delete image from project</UiButton>
        <UiButton size="xs" @click="projectStore.restoreDefaultTexture()">Restore starter texture</UiButton>
      </div></details>
    </template>

    <section v-else-if="tab === 'library'" class="texture-section">
      <div class="texture-actions"><UiButton size="xs" variant="accent" @click="showNew = true">+ New image</UiButton><UiButton size="xs" @click="fileInput?.click()">Import image</UiButton></div>
      <input class="texture-search" v-model="query" type="search" aria-label="Search texture images" placeholder="Search images…" />
      <p>Choose the image to edit. Apply it to an object from the Image tab.</p>
      <div class="texture-library" aria-label="Project images">
        <button v-for="texture in library" :key="texture.id" class="texture-library-row" :class="{ active: texture.id === activeTexture?.id }" :aria-pressed="texture.id === activeTexture?.id" @click="selectImage(texture.id)">
          <img class="checker" :src="texture.dataUrl || texture.pixelBuffer?.toDataURL()" alt="" /><span><strong>{{ texture.name }}</strong><small>{{ texture.width }} × {{ texture.height }} px</small></span><span v-if="texture.id === activeTexture?.id" class="texture-selected">Editing</span>
        </button>
        <p v-if="!library.length">No images match “{{ query }}”.</p>
      </div>
    </section>

    <section v-else-if="tab === 'advanced' && activeTexture" class="texture-section">
      <h3>Texture atlas</h3>
      <UiButton size="xs" variant="accent" @click="openTileset(projectStore.activeTextureId)">Open tileset editor</UiButton>
      <p>An atlas divides one image into tiles. Use this for multiple surfaces or sprites sharing one texture.</p>
      <details class="texture-details"><summary>Tile grid <span>{{ activeTexture.atlas ? `${activeTexture.atlas.cols} × ${activeTexture.atlas.rows}` : 'Off' }}</span></summary><div class="texture-details-body">
        <label>Columns<input type="number" min="1" max="16" v-model.number="cols" /></label><label>Rows<input type="number" min="1" max="16" v-model.number="rows" /></label>
        <div class="texture-actions"><UiButton size="xs" @click="setGrid">Apply grid</UiButton><UiButton size="xs" :disabled="!activeTexture.atlas" @click="projectStore.clearTextureAtlasGrid(activeTexture.id)">Remove grid</UiButton></div>
        <p>Arrange faces within tiles in the UV editor.</p><UiButton size="xs" @click="openEditor('uv')">Open UV editor</UiButton>
        <UiButton size="xs" :disabled="!activeTexture.atlas" @click="projectStore.sliceTextureIntoTiles(activeTexture.id, activeTexture.atlas!.cols, activeTexture.atlas!.rows)">Create separate images from tiles</UiButton>
      </div></details>
      <details class="texture-details"><summary>Scene-wide tools</summary><div class="texture-details-body"><p>These actions affect more than the selected object.</p><UiButton size="xs" @click="applyEverywhere">Apply image to all materials…</UiButton><UiButton size="xs" @click="bakeAtlas">Combine scene textures into atlas…</UiButton></div></details>
    </section>
    <section v-else class="texture-section"><p>Create or import an image to begin.</p><UiButton size="xs" @click="showNew = true">New image</UiButton><UiButton size="xs" @click="fileInput?.click()">Import image</UiButton></section>
    <NewTextureModal v-if="showNew" :bind-hint="projectStore.activeMesh?.name" @close="showNew = false" @create="createImage" />
    <ImportTextureModal v-if="pendingFile" :file="pendingFile" @close="pendingFile = null" @imported="imported" />
    <TextureSharePrompt v-if="sharePromptOpen" :object-count="sharePromptCount" @confirm="confirmShareApply" @cancel="cancelShareApply" />
  </div>
</template>

<style scoped>
.texture-inspector { color: var(--ui-text-secondary); font: 11px var(--font-sans, sans-serif); position: relative; }
.texture-heading { display: flex; align-items: center; justify-content: space-between; padding: 10px; background: var(--ui-bg-header); }
.texture-heading strong { color: var(--ui-text-primary); } .texture-heading span { color: var(--ui-text-muted); font-size: 10px; }
.texture-tabs { display: flex; padding: 4px 8px 8px; gap: 3px; border-bottom: 1px solid var(--ui-border-subtle); }
.texture-tabs button { flex: 1; padding: 6px 4px; border-radius: 3px; border: 1px solid transparent; }
.texture-tabs button.active { color: var(--ui-text-accent); background: var(--ui-bg-active); border-color: var(--ui-border-strong); }
button { cursor: pointer; } button:hover { background-color: var(--ui-bg-hover); } button:focus-visible, input:focus-visible, select:focus-visible, summary:focus-visible { outline: 2px solid var(--ui-text-accent); outline-offset: 1px; }
.texture-card { display: flex; gap: 10px; padding: 12px 10px 8px; align-items: center; }
.checker { background: repeating-conic-gradient(#35363c 0% 25%, #222329 0% 50%) 0 0 / 8px 8px; image-rendering: pixelated; }
.texture-preview { width: 76px; height: 76px; padding: 4px; border: 1px solid var(--ui-border-subtle); border-radius: 3px; flex-shrink: 0; }
.texture-preview img { width: 100%; height: 100%; object-fit: contain; image-rendering: pixelated; }
.texture-summary { display: flex; flex-direction: column; min-width: 0; gap: 6px; font-size: 10px; color: var(--ui-text-muted); }
.texture-summary strong { font-size: 11px; color: var(--ui-text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.texture-actions { display: flex; gap: 5px; } .texture-actions > * { flex: 1; min-width: 0; } .texture-inspector > .texture-actions { margin: 0 10px 10px; }
.texture-section { padding: 12px 10px; display: flex; flex-direction: column; gap: 10px; border-top: 1px solid var(--ui-border-subtle); }
h3 { font-weight: 600; color: var(--ui-text-primary); font-size: 11px; } p { color: var(--ui-text-muted); font-size: 10px; line-height: 1.6; margin: 0; }
.texture-assignment { display: flex; flex-direction: column; gap: 4px; background: var(--ui-bg-input); padding: 8px; border-radius: 3px; } .texture-assignment strong { color: var(--ui-text-primary); } .texture-assignment span { font-size: 10px; } .texture-assignment .assigned { color: var(--ui-text-accent); }
label { display: flex; align-items: center; justify-content: space-between; gap: 8px; } input, select { min-width: 0; background: var(--ui-bg-input); color: var(--ui-text-primary); border: 1px solid var(--ui-border-subtle); border-radius: 3px; padding: 5px 6px; font: inherit; } label input { width: 65%; } input[type=number] { width: 80px; }
.texture-details { border: 1px solid var(--ui-border-subtle); border-radius: 3px; } summary { padding: 8px; cursor: pointer; font-size: 10px; } summary span { color: var(--ui-text-muted); float: right; } .texture-details-body { padding: 4px 8px 10px; display: flex; flex-direction: column; gap: 10px; }
.texture-maintenance { margin: 2px 10px 12px; } .texture-search { width: 100%; }
.texture-library { display: flex; flex-direction: column; gap: 5px; }
.texture-library-row { display: flex; align-items: center; gap: 8px; text-align: left; border: 1px solid var(--ui-border-subtle); padding: 6px; border-radius: 3px; min-width: 0; }
.texture-library-row.active { background: var(--ui-bg-active); border-color: var(--ui-border-strong); } .texture-library-row img { width: 38px; height: 38px; object-fit: contain; flex-shrink: 0; } .texture-library-row > span { min-width: 0; } .texture-library-row strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; color: var(--ui-text-primary); } .texture-library-row small { color: var(--ui-text-muted); font-size: 9px; } .texture-selected { margin-left: auto; font-size: 9px; color: var(--ui-text-accent); }
.texture-drop { position: absolute; inset: 0; z-index: 50; background: var(--ui-bg-active); border: 2px dashed var(--ui-text-accent); display: grid; place-items: center; pointer-events: none; }
</style>
