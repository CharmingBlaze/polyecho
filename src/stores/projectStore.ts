import { serializePaintLayers, restorePaintLayers } from '../core/painting/PaintLayerStorage'
import { defineStore } from 'pinia'
import { ref, computed, markRaw, onScopeDispose, watch } from 'vue'
import * as THREE from 'three'
import { MeshObject, Vertex, Face, MeshShadeMode } from '../types/mesh'
import { Material, MaterialFill, Palette, TextureMap, TextureApplyPolicy } from '../types/texture'
import { defaultGradient } from '../core/materials/MaterialFill'
import { normalizeTextureTile, resolveTextureTiling } from '../core/materials/TextureTiling'
import { SelectMode } from '../types/tools'
import { createCube } from '../core/geometry/Primitives'
import { isDescendantOf as hierarchyIsDescendantOf } from '../core/geometry/ObjectHierarchy'
import { 
  extrudeSelection, 
  insetFaces, 
  bevelFaces, 
  subdivideFaces,
  catmullClarkSubdivide,
  spherizeVertices,
  snapVertices,
  pokeFaces,
  triangulateFaces,
  mergeVerticesAdvanced,
  splitEdges,
  type MergeMode,
  fillFaceFromVertices,
  flattenVerticesOnAxis,
  dissolveElements,
  connectTwoVertices,
  cleanupMeshGeometry,
  gridFill,
  flipNormals, 
  deleteElements,
  deleteOnlyFaces,
  deleteOnlyEdges,
  setSeamEdges,
  setSharpEdges,
  clearAllSeamEdges,
  flipEdges,
  recalculateOutside,
  connectVertexPath,
  trisToQuads,
  makePlanarFaces,
  fillHoles,
  limitedDissolve,
  ripEdges,
  splitSelectedFaces,
  knifeProjectOnMesh,
  vertexBevel,
  bridgeEdgeLoopsAdvanced,
  solidifySelectedFaces,
  latheProfile,
  shellMesh,
  symmetrizeMesh,
  smoothMeshVertices,
  circleMeshVertices,
  circleFaceOutline,
  straightenVertices,
  randomizeMeshVertices,
  unsubdivideMesh,
  decimateMesh,
  booleanMeshes,
  type BooleanOp
} from '../core/geometry/Operations'
import { getMeshEdges, getEdgeLoop, getEdgeRing, boundaryEdgeIdsForFaces, undirectedEdgeId } from '../core/geometry/EdgeUtils'
import type { ComponentMode } from '../core/geometry/SelectionConversion'
import {
  pruneSelection, selectEverything, selectInverse as selectInverseOp, selectLess, selectLinked, selectMore,
  type ComponentSelection
} from '../core/geometry/SelectionOps'
import { DEFAULT_PALETTES, loadCustomPalettes, saveCustomPalettes } from '../utils/color'
import { PixelBuffer } from '../core/painting/PixelCanvas'
import {
  createStarterTextureContents,
  generateRetroAtlas,
  loadDefaultTexturePref,
  normalizeDefaultTexturePref,
  saveDefaultTexturePref,
  type DefaultTexturePref
} from '../core/painting/DefaultTextures'
import { PrimitiveType, PrimitiveParameters } from '../core/primitives/PrimitiveTypes'
import { PrimitiveBuilder } from '../core/primitives/PrimitiveBuilder'
import { MeshBridge } from '../core/mesh/MeshBridge'
import { EditableMesh } from '../core/mesh/MeshKernel'
import { MeshRepository, type MeshBridgeData, type ResidentMeshSnapshot } from '../core/mesh/MeshRepository'
import { editMesh, type MeshEditResult, type MeshChange } from '../core/mesh/MeshTransaction'
import { MeshValidator } from '../core/mesh/MeshValidator'
import type { OperationResult } from '../core/geometry/Operations'
import { placeOriginAtBoundsCenter } from '../core/geometry/MeshOrigin'
import { meshObjectWorldMatrix } from '../core/geometry/MeshTransform'
import { joinMeshObjects, separateMeshFaces } from '../core/geometry/MeshJoin'
import { MeshEditOps } from '../core/mesh/operations/MeshEditOps'
import { addObjectRotation, flipMeshGeometry, type SymmetryAxis } from '../core/geometry/ObjectSymmetry'
import { offsetObjectAlong, reflectMeshAcrossPlane, rotateObjectAround, snapObjectPosition, type SnapTarget } from '../core/geometry/DuplicateTools'
import {
  alignObjects, alignVertices, applyRotationAndScaleToEditableMesh, hasObjectRotationOrScale,
  makeUniqueMesh, type AlignAxis, type AlignMode,
} from '../core/geometry/ObjectEditTools'
import { boundaryEdgeIds, nonManifoldEdgeIds, sharpEdgeIds } from '../core/geometry/EdgeQueries'
import { SeamUnwrapper } from '../core/uv/SeamUnwrapper'
import { AtlasBaker } from '../core/uv/AtlasBaker'
import { clampAtlasGrid, mapFacesToAtlasCell, sliceBufferIntoTiles } from '../core/uv/AtlasCells'
import {
  applyTargetTexelDensity,
  boxUnwrap,
  coneUnwrap,
  cubemapCrossUnwrap,
  cylinderUnwrap,
  equalizeTexelDensity,
  gridifyQuadIslands,
  packUVIslands,
  planarUnwrap,
  projectFromView,
  restorePinnedUvs,
  seamEdgesFromUvIslands,
  smartUvProject,
  sphereUnwrap,
  type SmartUvProjectOptions,
  type ViewProjection
} from '../core/geometry/UVUnwrap'
import {
  applyModifier,
  defaultMirrorModifier,
  defaultSolidifyModifier,
  defaultSubdivisionModifier
} from '../core/geometry/Modifiers'
import { computeCentroid } from '../utils/math'
import { Vector3D, PrimitiveTransform } from '../types/mesh'
import { createImagePlane, imageCardMaterialSettings, type ImageCardKind } from '../core/geometry/ImagePlane'
import { ReferenceImage, ReferencePlane } from '../types/reference'
import { useHistoryStore } from './historyStore'
import { useAnimationStore } from './animationStore'
import { SpringPhysicsSolver } from '../core/animation/SpringPhysics'
import { useToolStore } from './toolStore'
import { ProjectStorage, type ProjectStorageData } from '../core/storage/ProjectStorage'
import { enqueueDocumentWrite } from '../core/project/documentWriteQueue'

export interface DroppedImageSource {
  name: string
  width: number
  height: number
  dataUrl: string
}

export interface CreateImageCardOptions extends DroppedImageSource {
  kind: ImageCardKind
  cardHeight?: number
  position?: Vector3D
  rotationY?: number
  opacity?: number
  alphaTest?: number
}

export const useProjectStore = defineStore('project', () => {
  const historyStore = useHistoryStore()
  const meshRepository = new MeshRepository()
  onScopeDispose(() => meshRepository.clear())
  const meshEditError = ref<Extract<MeshEditResult<unknown>, { success: false }> | null>(null)

  // Project state
  const projectName = ref<string>('PSX_LowPoly_Model')
  const meshes = ref<MeshObject[]>([createCube('Cube_1', 2)])
  const activeMeshId = ref<string>(meshes.value[0]?.id || '')

  // Selections
  const selectedMeshIds = ref<string[]>([meshes.value[0]?.id || ''])
  const selectedVertexIds = ref<string[]>([])
  const selectedEdgeIds = ref<string[]>([])
  const selectedFaceIds = ref<string[]>([])

  // Textures & Materials & Geometry & Palettes
  const customSavedPalettes = loadCustomPalettes()
  const palettes = ref<Palette[]>([...DEFAULT_PALETTES, ...customSavedPalettes])
  const activePaletteId = ref<string>(DEFAULT_PALETTES[0].id)
  const activePalette = computed<Palette>({
    get: () => palettes.value.find(p => p.id === activePaletteId.value) || palettes.value[0] || DEFAULT_PALETTES[0],
    set: (p: Palette) => {
      if (!palettes.value.some(existing => existing.id === p.id)) {
        palettes.value.push(p)
      }
      activePaletteId.value = p.id
    }
  })
  const textureRevision = ref<number>(0)
  const geometryRevision = ref<number>(0)
  // Per-object revision counters (slice: revisions). Key = MeshObject.id, same id space as
  // MeshRepository. Derived, non-serialized state — never in .psxproj or history.
  type MeshRevisions = { topology: number; position: number; attribute: number }
  const meshRevisions = new Map<string, MeshRevisions>()
  // Whole-object attribute-only writers (the UV unwrap family) report this synthesized change:
  // they replace the mesh but change only UVs, never topology or positions.
  const ATTRIBUTE_ONLY_CHANGE: MeshChange = {
    topologyChanged: false, positionsChanged: false, attributesChanged: true,
    createdVertices: [], deletedVertices: [], createdEdges: [], deletedEdges: [],
    createdFaces: [], deletedFaces: [],
  }
  const activeTextureId = ref<string>('tex_default')
  const referenceImages = ref<ReferenceImage[]>([])
  const referenceRevision = ref<number>(0)
  const selectedReferenceId = ref<string>('')

  const defaultTexturePref = ref<DefaultTexturePref>(loadDefaultTexturePref())
  const starter = createStarterTextureContents(defaultTexturePref.value)
  const textures = ref<TextureMap[]>([
    {
      id: 'tex_default',
      name: starter.name,
      width: starter.width,
      height: starter.height,
      dataUrl: starter.dataUrl,
      pixelBuffer: markRaw(starter.pixelBuffer),
      atlas: starter.atlas
    }
  ])

  const activeTexture = computed<TextureMap>(() => {
    return textures.value.find(t => t.id === activeTextureId.value) || textures.value[0]
  })

  // Backward compatibility: projectStore.pixelBuffer transparently accesses active texture's pixel buffer
  function attachPixelBuffer(tex: TextureMap, buf: PixelBuffer) {
    tex.pixelBuffer = markRaw(buf)
    tex.width = buf.width
    tex.height = buf.height
    return buf
  }

  function ensureTextureBuffer(tex?: TextureMap | null): PixelBuffer {
    const target = tex || activeTexture.value
    const existing = target.pixelBuffer
    if (existing && typeof existing.drawBrush === 'function') {
      existing.ensureDrawable()
      return existing
    }
    const buf = markRaw(new PixelBuffer(target.width || 64, target.height || 64))
    if (target.dataUrl) {
      const img = new Image()
      img.onload = () => {
        buf.ctx.drawImage(img, 0, 0, buf.width, buf.height)
        buf.syncToActiveLayer()
        markTextureUpdated(target.id)
      }
      img.src = target.dataUrl
    }
    return attachPixelBuffer(target, buf)
  }

  const pixelBuffer = computed<PixelBuffer>({
    get: () => ensureTextureBuffer(activeTexture.value),
    set: (buf: PixelBuffer) => {
      attachPixelBuffer(activeTexture.value, buf)
    }
  })

  const materials = ref<Material[]>([
    {
      id: 'default_material',
      name: 'Default_Material',
      textureId: 'tex_default',
      tileX: 1,
      tileY: 1,
      color: '#ffffff',
      shading: 'textured', // Standard clean textured shading by default
      psxJitter: false,
      psxJitterResolution: 240,
      psxAffine: false,
      dither: false,
      ditherLevel: 32,
      wireframe: false,
      blendMode: 'mask',
      alphaTest: 0.05
    }
  ])

  const activeMaterialId = ref<string>('default_material')

  const activeMaterial = computed<Material>(() => {
    return materials.value.find(m => m.id === activeMaterialId.value) || materials.value[0]
  })

  // Computed
  const activeMesh = computed<MeshObject | undefined>(() => meshes.value.find((m: MeshObject) => m.id === activeMeshId.value) || meshes.value[0])

  function selectTexture(textureId: string) {
    if (!textures.value.some(t => t.id === textureId)) return
    activeTextureId.value = textureId
  }

  function setMaterialFill(matId: string, fill: MaterialFill) {
    const mat = materials.value.find(m => m.id === matId)
    if (!mat || mat.fill === fill) return
    recordState(`Material Fill (${fill})`)
    mat.fill = fill
    if (fill === 'gradient' && !mat.gradient) {
      mat.gradient = defaultGradient(mat.color)
    }
    if (fill === 'image' && !mat.textureId) {
      const fallback = textures.value[0]?.id
      if (fallback) {
        mat.textureId = fallback
        selectTexture(fallback)
      }
    }
    markGeometryUpdated()
  }

  function setMaterialTextureTiling(
    matId: string,
    tileX: number,
    tileY: number,
    options?: { record?: boolean },
  ) {
    const mat = materials.value.find(m => m.id === matId)
    if (!mat) return
    const nextX = normalizeTextureTile(tileX)
    const nextY = normalizeTextureTile(tileY)
    const current = resolveTextureTiling(mat)
    if (current.tileX === nextX && current.tileY === nextY) return
    if (options?.record !== false) recordState(`Texture Tiling (${nextX}×${nextY})`)
    mat.tileX = nextX
    mat.tileY = nextY
    markGeometryUpdated()
  }

  function selectMaterial(materialId: string) {
    if (!materials.value.some(m => m.id === materialId)) return
    activeMaterialId.value = materialId
  }

  function countMeshesUsingMaterial(matId: string): number {
    return meshes.value.filter(m => (m.materialId || 'default_material') === matId).length
  }

  function isMaterialShared(matId?: string | null): boolean {
    if (!matId) return false
    return countMeshesUsingMaterial(matId) > 1
  }

  function syncPaintTargetFromMesh(meshId?: string) {
    const mesh = meshes.value.find(m => m.id === (meshId || activeMeshId.value))
    if (!mesh) return
    const mat = materials.value.find(m => m.id === (mesh.materialId || 'default_material'))
    if (mat?.textureId) selectTexture(mat.textureId)
  }

  const stats = computed(() => {
    let verts = 0
    let faces = 0
    let tris = 0
    for (const m of meshes.value) {
      verts += m.vertices.length
      faces += m.faces.length
      for (const f of m.faces) {
        tris += f.vertexIds.length === 4 ? 2 : f.vertexIds.length - 2
      }
    }
    return {
      verts,
      faces,
      tris,
      selectedVerts: selectedVertexIds.value.length,
      selectedFaces: selectedFaceIds.value.length
    }
  })

  // History Helper
  function recordState(desc: string, options?: { includeTextures?: boolean }) {
    historyStore.recordState(desc, { includeTextures: options?.includeTextures === true })
  }

  function recordPixels(desc: string) {
    historyStore.recordState(desc, { includeTextures: true })
  }

  // ----------------------------------------------------
  // OBJECTS & HIERARCHY (Three Verbs — see docs/HIERARCHY.md)
  //   selectMesh         active object & inspector target
  //   createMesh         add a 3D object to the scene
  //   parentMesh         set transform hierarchy between objects
  // ----------------------------------------------------
  function selectMesh(meshId: string, options?: { multi?: boolean }) {
    if (!meshes.value.some(m => m.id === meshId)) return
    activeMeshId.value = meshId
    if (options?.multi) {
      if (!selectedMeshIds.value.includes(meshId)) {
        selectedMeshIds.value.push(meshId)
      }
    } else {
      selectedMeshIds.value = [meshId]
    }
    selectedReferenceId.value = ''
    syncPaintTargetFromMesh(meshId)
    const mesh = meshes.value.find(m => m.id === meshId)
    if (mesh?.materialId) {
      selectMaterial(mesh.materialId)
    }
  }

  function selectMeshes(meshIds: string[]) {
    const valid = meshIds.filter(id => meshes.value.some(m => m.id === id))
    selectedMeshIds.value = valid
    if (valid.length > 0) {
      activeMeshId.value = valid[0]
      syncPaintTargetFromMesh(valid[0])
      const mesh = meshes.value.find(m => m.id === valid[0])
      if (mesh?.materialId) selectMaterial(mesh.materialId)
    }
  }

  function isDescendantOf(childId: string, potentialAncestorId: string): boolean {
    return hierarchyIsDescendantOf(meshes.value, childId, potentialAncestorId)
  }

  function parentMesh(childId: string, parentId: string | null) {
    const child = meshes.value.find(m => m.id === childId)
    if (!child) return
    if (!parentId) {
      unparentMesh(childId)
      return
    }
    if (childId === parentId || isDescendantOf(childId, parentId)) {
      console.warn(`Cannot parent ${child.name} to ${parentId}: would create a circular dependency.`)
      return
    }
    const parent = meshes.value.find(m => m.id === parentId)
    const parentName = parent ? parent.name : parentId
    recordState(`Parent ${child.name} to ${parentName}`)
    child.parentId = parentId
    markGeometryUpdated()
  }

  function unparentMesh(childId: string) {
    const child = meshes.value.find(m => m.id === childId)
    if (child && child.parentId) {
      recordState(`Unparent ${child.name}`)
      child.parentId = undefined
      markGeometryUpdated()
    }
  }

  function getMeshChildren(meshId: string): MeshObject[] {
    return meshes.value.filter(m => m.parentId === meshId)
  }

  // Primitive adding & mesh creation
  function createMesh(
    type: PrimitiveType | 'cube' | 'plane' | 'cylinder' | 'cone' | 'sphere' = 'BOX',
    params?: PrimitiveParameters,
    transform?: PrimitiveTransform,
    options?: { record?: boolean; select?: boolean; materialId?: string }
  ): MeshObject {
    const normType = (type.toUpperCase() === 'CUBE' ? 'BOX' : type.toUpperCase()) as PrimitiveType
    const shouldRecord = options?.record !== false
    const shouldSelect = options?.select !== false
    if (shouldRecord) recordState(`Add ${normType}`)
    const count = meshes.value.length + 1

    const editableMesh = PrimitiveBuilder.create(normType, params || {})
    const label = `${normType.charAt(0) + normType.slice(1).toLowerCase()}_${count}`
    const newMesh = MeshBridge.editableMeshToMeshObject(editableMesh, label)

    if (transform) {
      newMesh.position = { ...transform.position }
      newMesh.rotation = { ...transform.rotation }
      newMesh.scale = { ...transform.scale }
    }
    if (options?.materialId) {
      newMesh.materialId = options.materialId
    }

    meshes.value.push(newMesh)
    if (shouldSelect) {
      selectMesh(newMesh.id)
    }
    clearSubSelections()
    markGeometryUpdated()
    return newMesh
  }

  function createImageCard(options: CreateImageCardOptions): MeshObject {
    const label = options.kind === 'vegetation'
      ? 'Add Crossed Vegetation'
      : options.kind === 'reference'
        ? 'Add Reference Card'
        : 'Add Image Card'
    recordState(label, { includeTextures: true })

    const texture = createTexture(
      options.name,
      options.width,
      options.height,
      options.dataUrl,
      undefined,
      { record: false, select: true }
    )
    const material = createMaterial(
      `${options.name || 'Image'} Material`,
      '#ffffff',
      texture.id,
      { record: false, select: true }
    )
    Object.assign(material, imageCardMaterialSettings(options.kind))
    if (options.opacity !== undefined) material.opacity = Math.max(0, Math.min(1, options.opacity))
    if (options.alphaTest !== undefined) material.alphaTest = Math.max(0, Math.min(1, options.alphaTest))

    const mesh = createImagePlane({
      name: options.kind === 'vegetation'
        ? `${options.name || 'Image'} Cross`
        : options.kind === 'reference'
          ? `${options.name || 'Image'} Reference`
          : `${options.name || 'Image'} Card`,
      imageWidth: options.width,
      imageHeight: options.height,
      height: options.cardHeight,
      crossed: options.kind === 'vegetation',
      materialId: material.id,
      transform: {
        position: options.position || { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: options.rotationY ?? 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
    })

    meshes.value.push(mesh)
    selectMesh(mesh.id)
    clearSubSelections()
    markGeometryUpdated()
    return mesh
  }

  function applyDroppedImageToMesh(meshId: string, source: DroppedImageSource): TextureMap | null {
    if (!meshes.value.some(mesh => mesh.id === meshId)) return null
    recordState(`Apply Dropped Image (${source.name || 'untitled'})`, { includeTextures: true })
    const texture = createTexture(
      source.name,
      source.width,
      source.height,
      source.dataUrl,
      undefined,
      { record: false, select: true }
    )
    applyTextureToMesh(meshId, texture.id, 'this_object', { record: false })
    return texture
  }

  /** @deprecated Use createMesh — same behavior, kept for compatibility */
  function addPrimitive(
    type: PrimitiveType | 'cube' | 'plane' | 'cylinder' | 'cone' | 'sphere' = 'BOX',
    params?: PrimitiveParameters,
    transform?: PrimitiveTransform
  ): MeshObject {
    return createMesh(type, params, transform)
  }

  function addEditableMesh(mesh: EditableMesh, name: string): MeshObject {
    recordState(name)
    const obj = MeshBridge.editableMeshToMeshObject(mesh, name)
    placeOriginAtBoundsCenter(obj)
    meshes.value.push(obj)
    selectMesh(obj.id)
    clearSubSelections()
    markGeometryUpdated()
    return obj
  }

  function centerMeshOrigin(meshId: string, options?: { record?: boolean }) {
    const mesh = meshes.value.find(m => m.id === meshId)
    if (!mesh) return
    if (options?.record !== false) recordState('Origin to Center')
    if (placeOriginAtBoundsCenter(mesh)) markGeometryUpdated()
  }

  function addReferenceImage(plane: ReferencePlane, dataUrl: string, name?: string): ReferenceImage {
    recordState('Add Reference Image')
    const img: ReferenceImage = {
      id: `ref_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      name: name || `${plane[0].toUpperCase() + plane.slice(1)} Ref`,
      plane,
      dataUrl,
      opacity: 0.65,
      scale: 4,
      offsetX: 0,
      offsetY: 0,
      flipX: false,
      visible: true,
      locked: false
    }
    referenceImages.value = [...referenceImages.value, img]
    referenceRevision.value++
    return img
  }

  /** One lightbox image per plane — replace if that plane already has a ref. */
  function setReferenceOnPlane(plane: ReferencePlane, dataUrl: string, name?: string): ReferenceImage {
    const existing = referenceImages.value.find(img => img.plane === plane)
    if (existing) {
      recordState(`Replace ${plane} Reference`)
      updateReferenceImage(existing.id, { dataUrl, name: name || existing.name, visible: true })
      return referenceImages.value.find(img => img.id === existing.id) || existing
    }
    return addReferenceImage(plane, dataUrl, name)
  }

  function selectReference(id: string) {
    selectedReferenceId.value = id
    selectedMeshIds.value = []
  }

  function updateReferenceImage(id: string, patch: Partial<ReferenceImage>, opts?: { rebuild?: boolean }) {
    referenceImages.value = referenceImages.value.map(img => img.id === id ? { ...img, ...patch, id: img.id } : img)
    const rebuild = opts?.rebuild ?? ('dataUrl' in patch || 'plane' in patch || 'visible' in patch)
    if (rebuild) referenceRevision.value++
  }

  /** Start one undoable reference adjustment; callers can then stream slider/drag updates. */
  function recordReferenceEdit(label = 'Edit Reference') {
    recordState(label)
  }

  function resetReferenceImageTransform(id: string) {
    const image = referenceImages.value.find(img => img.id === id)
    if (!image) return
    recordState('Reset Reference Alignment')
    updateReferenceImage(id, {
      scale: 4,
      offsetX: 0,
      offsetY: 0,
      flipX: false
    }, { rebuild: false })
  }

  function removeReferenceImage(id: string) {
    recordState('Remove Reference Image')
    if (selectedReferenceId.value === id) selectedReferenceId.value = ''
    referenceImages.value = referenceImages.value.filter(img => img.id !== id)
    referenceRevision.value++
  }

  function clearSubSelections() {
    selectedVertexIds.value = []
    selectedEdgeIds.value = []
    selectedFaceIds.value = []
    if (activeMesh.value) {
      activeMesh.value.vertices.forEach(v => (v.selected = false))
      activeMesh.value.faces.forEach(f => (f.selected = false))
    }
  }

  // Modeling operations on active mesh
  function runKernelOperation(
    description: string,
    operation: (document: MeshObject, bridge: MeshBridgeData) => OperationResult,
    options?: { record?: boolean; mesh?: MeshObject; applySelection?: boolean }
  ) {
    const document = options?.mesh ?? activeMesh.value
    if (!document || document.locked) return
    meshEditError.value = null
    const resident = acquireEditableMesh(document)
    const staged: MeshBridgeData = {
      mesh: resident.mesh.clone(),
      strToNumVertId: new Map(resident.strToNumVertId), numToStrVertId: new Map(resident.numToStrVertId),
      strToNumFaceId: new Map(resident.strToNumFaceId), numToStrFaceId: new Map(resident.numToStrFaceId),
    }
    const result = editMesh(staged.mesh, () => operation(document, staged))
    if (!result.success) { meshEditError.value = result; return result }
    if (!result.change.topologyChanged && !result.change.positionsChanged && !result.change.attributesChanged) return result
    // Validate the staged result before recording. History still precedes mutation
    // of either the resident kernel or its document projection.
    if (options?.record !== false) recordState(description)
    resident.mesh.restoreSnapshot(staged.mesh.createSnapshot())
    staged.mesh = resident.mesh
    const nextSelection: ComponentSelection = options?.applySelection !== false
      ? { vertices: result.value.selectedVertexIds, edges: result.value.selectedEdgeIds ?? [], faces: result.value.selectedFaceIds }
      : currentComponentSelection()
    // An edit that keeps the old selection can still delete or re-id its elements.
    if (document.id === activeMeshId.value && result.change.topologyChanged) {
      const pruned = pruneSelection(result.value.mesh, nextSelection)
      selectedVertexIds.value = pruned.vertices
      selectedEdgeIds.value = pruned.edges
      selectedFaceIds.value = pruned.faces
    } else if (options?.applySelection !== false) {
      selectedVertexIds.value = nextSelection.vertices
      selectedEdgeIds.value = nextSelection.edges
      selectedFaceIds.value = nextSelection.faces
    }
    publishEditableMesh(result.value.mesh, staged, false, result.change)
    return result
  }

  function performExtrude(distance = 0.5) {
    if (!activeMesh.value || activeMesh.value.locked) return
    return runKernelOperation('Extrude', (document, bridge) => extrudeSelection(document, {
      faceIds: selectedFaceIds.value,
      edgeIds: selectedEdgeIds.value,
      vertexIds: selectedFaceIds.value.length || selectedEdgeIds.value.length ? [] : selectedVertexIds.value,
      distance,
    }, bridge))
  }

  function performInset(thickness = 0.1) {
    if (!activeMesh.value || activeMesh.value.locked || selectedFaceIds.value.length === 0) return
    return runKernelOperation('Inset Faces', (document, bridge) => insetFaces(document, selectedFaceIds.value, thickness, undefined, bridge))
  }

  function performBevel(offset = 0.2) {
    if (!activeMesh.value || activeMesh.value.locked) return
    if (!selectedFaceIds.value.length && !selectedEdgeIds.value.length) return
    const result = runKernelOperation('Bevel', (document, bridge) =>
      bevelFaces(document, selectedFaceIds.value, offset, selectedEdgeIds.value, bridge))
    if (result?.success) selectedEdgeIds.value = []
    return result
  }

  function performSubdivide(mode?: 'object' | 'vertex' | 'edge' | 'face', options?: { smoothness?: number; label?: string }) {
    if (!activeMesh.value || activeMesh.value.locked) return
    const toolStore = useToolStore()
    const smoothness = options?.smoothness ?? toolStore.subdivideSmoothness
    const label = options?.label ?? 'Subdivide'
    const resolved = mode ?? (
      toolStore.selectMode === 'object' || toolStore.selectMode === 'vertex'
        || toolStore.selectMode === 'edge' || toolStore.selectMode === 'face'
        ? toolStore.selectMode
        : null
    )
    if (!resolved) return

    if (resolved === 'object') {
      const ids = selectedMeshIds.value.length > 0
        ? [...selectedMeshIds.value]
        : (activeMeshId.value ? [activeMeshId.value] : [])
      const targets = meshes.value.filter(m => ids.includes(m.id) && !m.locked && m.faces.length > 0)
      if (targets.length === 0) return
      recordState(label)
      for (const mesh of targets) {
        runKernelOperation(label, (document, bridge) => subdivideFaces(document, document.faces.map(f => f.id), {
          cuts: toolStore.subdivideCuts,
          smoothness
        }, bridge), { record: false, mesh, applySelection: false })
      }
      clearSubSelections()
      return
    }

    let targetFaceIds: string[] = []
    let edgeIds: string[] = []

    if (resolved === 'face') {
      targetFaceIds = [...selectedFaceIds.value]
    } else if (resolved === 'edge') {
      edgeIds = [...selectedEdgeIds.value]
    } else {
      const sel = new Set(selectedVertexIds.value)
      edgeIds = getMeshEdges(activeMesh.value)
        .filter(e => sel.has(e.v1) && sel.has(e.v2))
        .map(e => e.id)
      if (edgeIds.length === 0) {
        targetFaceIds = activeMesh.value.faces
          .filter(face => face.vertexIds.every(id => sel.has(id)))
          .map(f => f.id)
      }
    }

    if (targetFaceIds.length === 0 && edgeIds.length === 0) return

    return runKernelOperation(label, (document, bridge) => subdivideFaces(document, targetFaceIds, {
      cuts: toolStore.subdivideCuts,
      smoothness,
      edgeIds
    }, bridge))
  }

  function performSimpleSubdivide(mode?: 'object' | 'vertex' | 'edge' | 'face') {
    return performSubdivide(mode, { smoothness: 0, label: 'Simple Subdivide' })
  }

  function performCatmullClark(level?: number) {
    if (!activeMesh.value || activeMesh.value.locked) return
    const tools = useToolStore()
    const steps = level ?? tools.catmullLevels
    const selected = meshes.value.filter(mesh => selectedMeshIds.value.includes(mesh.id) && !mesh.locked && mesh.faces.length > 0)
    const targets = tools.selectMode === 'object' && selected.length > 0 ? selected : [activeMesh.value]
    const run = (mesh: MeshObject, record: boolean) => runKernelOperation('Catmull-Clark Subdivide', (document, bridge) =>
      catmullClarkSubdivide(document, steps, bridge), { record, mesh, applySelection: false })
    if (targets.length > 1) {
      recordState('Catmull-Clark Subdivide')
      for (const mesh of targets) run(mesh, false)
      clearSubSelections()
      return
    }
    return run(targets[0], true)
  }

  function performSpherize(factor?: number) {
    if (!activeMesh.value || activeMesh.value.locked) return
    const ids = selectionVertexIds()
    if (ids.length < 2) return
    const tools = useToolStore()
    return runKernelOperation('Spherize', (document, bridge) =>
      spherizeVertices(document, ids, factor ?? tools.spherizeFactor, bridge), { applySelection: false })
  }

  function performPokeFaces() {
    if (!activeMesh.value) return
    let targetFaceIds = [...selectedFaceIds.value]
    if (targetFaceIds.length === 0 && selectedEdgeIds.value.length > 0) {
      const selectedEdges = getMeshEdges(activeMesh.value).filter(e => selectedEdgeIds.value.includes(e.id))
      targetFaceIds = activeMesh.value.faces
        .filter(face => selectedEdges.some(edge => face.vertexIds.includes(edge.v1) && face.vertexIds.includes(edge.v2)))
        .map(face => face.id)
    }
    if (targetFaceIds.length === 0) return
    return runKernelOperation('Poke Faces', (document, bridge) => pokeFaces(document, targetFaceIds, bridge))
  }

  function performTriangulate() {
    if (!activeMesh.value) return
    if (selectedFaceIds.value.length === 0) return
    return runKernelOperation('Triangulate Faces', (document, bridge) =>
      triangulateFaces(document, selectedFaceIds.value, bridge))
  }

  function selectionVertexIdsForMerge(): string[] {
    if (!activeMesh.value) return []
    let targetVertIds = [...selectedVertexIds.value]
    if (targetVertIds.length < 2 && selectedEdgeIds.value.length > 0) {
      const selectedEdges = getMeshEdges(activeMesh.value).filter(e => selectedEdgeIds.value.includes(e.id))
      targetVertIds = Array.from(new Set(selectedEdges.flatMap(edge => [edge.v1, edge.v2])))
    }
    if (targetVertIds.length < 2 && selectedFaceIds.value.length) {
      targetVertIds = [...new Set(activeMesh.value.faces.filter(f => selectedFaceIds.value.includes(f.id)).flatMap(f => f.vertexIds))]
    }
    return targetVertIds
  }

  function performMerge(type: MergeMode = 'center', threshold?: number) {
    if (!activeMesh.value || activeMesh.value.locked) return
    const tools = useToolStore()
    const weldDistance = threshold ?? tools.weldDistance
    let targetVertIds = selectionVertexIdsForMerge()

    if (type === 'distance') {
      if (targetVertIds.length < 2) targetVertIds = activeMesh.value.vertices.map(v => v.id)
      if (targetVertIds.length < 2) return
      const result = runKernelOperation('Weld by Distance', (document, bridge) =>
        mergeVerticesAdvanced(document, targetVertIds, 'distance', weldDistance, bridge))
      if (result?.success) {
        selectedFaceIds.value = []
        selectedEdgeIds.value = []
      }
      return result
    }

    if (type === 'vertex') {
      const keepId = tools.mergeTargetVertexId
      if (!keepId || !activeMesh.value.vertices.some(v => v.id === keepId)) return
      if (!targetVertIds.includes(keepId)) targetVertIds.push(keepId)
    }

    if (targetVertIds.length < 2) return

    let target: { position: { x: number; y: number; z: number }; keepId?: string } | undefined
    if (type === 'cursor') {
      const local = new THREE.Vector3(tools.cursor3D.x, tools.cursor3D.y, tools.cursor3D.z)
      local.applyMatrix4(meshObjectWorldMatrix(activeMesh.value).invert())
      target = { position: { x: local.x, y: local.y, z: local.z } }
    } else if (type === 'vertex' && tools.mergeTargetVertexId) {
      const kept = activeMesh.value.vertices.find(v => v.id === tools.mergeTargetVertexId)
      if (!kept) return
      target = { position: { ...kept.position }, keepId: kept.id }
    }

    const label = type === 'cursor' ? 'Merge at Cursor'
      : type === 'vertex' ? 'Merge at Vertex'
      : `Merge Vertices (${type})`
    const result = runKernelOperation(label, (document, bridge) =>
      mergeVerticesAdvanced(document, targetVertIds, type, weldDistance, bridge, target))
    if (result?.success) {
      selectedFaceIds.value = []
      selectedEdgeIds.value = []
      if (type === 'vertex') tools.mergeTargetVertexId = result.value.selectedVertexIds[0] ?? tools.mergeTargetVertexId
    }
    return result
  }

  function performSplitEdges(t?: number) {
    if (!activeMesh.value || activeMesh.value.locked) return
    const tools = useToolStore()
    let edgeIds = [...selectedEdgeIds.value]
    if (edgeIds.length === 0 && selectedVertexIds.value.length >= 2) {
      const selected = new Set(selectedVertexIds.value)
      edgeIds = getMeshEdges(activeMesh.value)
        .filter(edge => selected.has(edge.v1) && selected.has(edge.v2))
        .map(edge => undirectedEdgeId(edge.v1, edge.v2))
    }
    if (edgeIds.length === 0) return
    return runKernelOperation('Split Edge', (document, bridge) =>
      splitEdges(document, edgeIds, t ?? tools.splitEdgeFactor, bridge))
  }

  function performFillFace(viewDirection?: { x: number; y: number; z: number }) {
    if (!activeMesh.value) return
    let boundaryVertexIds = [...selectedVertexIds.value]
    if (boundaryVertexIds.length < 3 && selectedEdgeIds.value.length > 0) {
      const selectedEdges = getMeshEdges(activeMesh.value).filter(e => selectedEdgeIds.value.includes(e.id))
      boundaryVertexIds = Array.from(new Set(selectedEdges.flatMap(edge => [edge.v1, edge.v2])))
    }
    if (boundaryVertexIds.length === 2) {
      return runKernelOperation('Split Face', (document, bridge) =>
        connectTwoVertices(document, boundaryVertexIds[0], boundaryVertexIds[1], bridge))
    }
    if (boundaryVertexIds.length < 3) return
    return runKernelOperation('Fill Face (F)', (document, bridge) =>
      fillFaceFromVertices(document, boundaryVertexIds, viewDirection, bridge))
  }

  function performFlatten(axis: 'x' | 'y' | 'z') {
    if (!activeMesh.value) return
    let targetVertIds = [...selectedVertexIds.value]
    if (targetVertIds.length === 0 && selectedEdgeIds.value.length > 0) {
      const selectedEdges = getMeshEdges(activeMesh.value).filter(e => selectedEdgeIds.value.includes(e.id))
      targetVertIds = Array.from(new Set(selectedEdges.flatMap(edge => [edge.v1, edge.v2])))
    } else if (targetVertIds.length === 0 && selectedFaceIds.value.length > 0) {
      const faces = activeMesh.value.faces.filter(f => selectedFaceIds.value.includes(f.id))
      targetVertIds = Array.from(new Set(faces.flatMap(f => f.vertexIds)))
    }
    if (targetVertIds.length === 0) return
    return runKernelOperation(`Flatten on ${axis.toUpperCase()}`, (document, bridge) =>
      flattenVerticesOnAxis(document, targetVertIds, axis, bridge), { applySelection: false })
  }

  function selectionForStraighten(): string[] {
    const mesh = activeMesh.value
    if (!mesh) return []
    if (selectedVertexIds.value.length >= 2) return [...selectedVertexIds.value]
    if (selectedEdgeIds.value.length) {
      const edges = getMeshEdges(mesh).filter(edge => selectedEdgeIds.value.includes(edge.id))
      return [...new Set(edges.flatMap(edge => [edge.v1, edge.v2]))]
    }
    if (selectedFaceIds.value.length) {
      return [...new Set(mesh.faces.filter(face => selectedFaceIds.value.includes(face.id)).flatMap(face => face.vertexIds))]
    }
    return []
  }

  function performStraighten(direction: 'horizontal' | 'vertical') {
    const verts = selectionForStraighten()
    if (verts.length < 2) return
    const label = direction === 'horizontal' ? 'Straighten Horizontal' : 'Straighten Vertical'
    return runKernelOperation(label, (document, bridge) =>
      straightenVertices(document, verts, direction, bridge), { applySelection: false })
  }

  function performSeparateMesh() {
    if (!activeMesh.value) return
    let targetFaceIds = [...selectedFaceIds.value]
    if (targetFaceIds.length === 0 && selectedEdgeIds.value.length > 0) {
      const selectedEdges = getMeshEdges(activeMesh.value).filter(e => selectedEdgeIds.value.includes(e.id))
      targetFaceIds = activeMesh.value.faces
        .filter(face => selectedEdges.some(edge => face.vertexIds.includes(edge.v1) && face.vertexIds.includes(edge.v2)))
        .map(face => face.id)
    } else if (targetFaceIds.length === 0 && selectedVertexIds.value.length > 0) {
      targetFaceIds = activeMesh.value.faces
        .filter(face => face.vertexIds.every(id => selectedVertexIds.value.includes(id)))
        .map(face => face.id)
    }
    if (targetFaceIds.length === 0) return

    const sourceMesh = activeMesh.value
    const resident = acquireEditableMesh(sourceMesh)
    const staged = separateMeshFaces(sourceMesh, targetFaceIds, resident, {
      id: `mesh_sep_${Date.now()}`,
      name: `${sourceMesh.name}_Separated`
    })
    if (!staged) return
    // The new object gets its own resident kernel here instead of a throwaway import.
    const separated = MeshBridge.meshObjectToEditableMesh(staged.separated)
    // Validate before recording: history precedes mutation of either kernel or document.
    if (!validateEditableMesh(staged.kernel) || !validateEditableMesh(separated.mesh)) return

    recordState('Separate Selection')
    resident.mesh.restoreSnapshot(staged.kernel.createSnapshot())
    meshes.value.push(staged.separated)
    publishEditableMesh(
      MeshBridge.editableMeshToMeshObject(resident.mesh, sourceMesh, resident.numToStrVertId, resident.numToStrFaceId),
      resident
    )
    publishEditableMesh(staged.separated, separated)
    activeMeshId.value = staged.separated.id
    clearSubSelections()
  }

  function performJoinMeshes() {
    const targetMeshes = meshes.value.filter(m => selectedMeshIds.value.includes(m.id))
    if (targetMeshes.length < 2) return

    const primary = targetMeshes[0]
    const otherMeshes = targetMeshes.slice(1)
    const resident = acquireEditableMesh(primary)
    const staged = joinMeshObjects(primary, otherMeshes, resident)
    // Validate before recording: history precedes mutation of either kernel or document.
    if (!validateEditableMesh(staged)) return

    recordState('Join Meshes (Ctrl+J)')
    resident.mesh.restoreSnapshot(staged.createSnapshot())
    meshes.value = meshes.value.filter(m => !otherMeshes.some(other => other.id === m.id))
    publishEditableMesh(
      MeshBridge.editableMeshToMeshObject(resident.mesh, primary, resident.numToStrVertId, resident.numToStrFaceId),
      resident
    )
    // publish() only registers survivors, so the joined-away objects must drop their kernels.
    meshRepository.retain(meshes.value.map(mesh => mesh.id))
    pruneMeshRevisions()
    selectedMeshIds.value = [primary.id]
    activeMeshId.value = primary.id
  }

  function performFlipNormals() {
    if (!activeMesh.value) return
    const targetFaceIds = selectedFaceIds.value.length > 0 ? selectedFaceIds.value : activeMesh.value.faces.map(f => f.id)
    return runKernelOperation('Flip Normals', (document, bridge) =>
      flipNormals(document, targetFaceIds, bridge), { applySelection: false })
  }

  function performBridgeEdges(segments = 1, twist = 0) {
    if (!activeMesh.value || selectedEdgeIds.value.length < 2) return
    return runKernelOperation('Bridge Edge Loops', (document, bridge) =>
      bridgeEdgeLoopsAdvanced(document, selectedEdgeIds.value, segments, twist, bridge), { applySelection: false })
  }

  function performGridFill() {
    if (!activeMesh.value) return
    let boundaryVertexIds = [...selectedVertexIds.value]
    if (boundaryVertexIds.length < 4 && selectedEdgeIds.value.length > 0) {
      const selectedEdges = getMeshEdges(activeMesh.value).filter(e => selectedEdgeIds.value.includes(e.id))
      boundaryVertexIds = Array.from(new Set(selectedEdges.flatMap(edge => [edge.v1, edge.v2])))
    }
    if (boundaryVertexIds.length < 4) return
    return runKernelOperation('Grid Fill', (document, bridge) =>
      gridFill(document, boundaryVertexIds, bridge), { applySelection: false })
  }

  function deleteMesh(id: string) {
    recordState('Delete Mesh')
    meshes.value = meshes.value.filter(m => m.id !== id)
    meshRepository.retain(meshes.value.map(mesh => mesh.id))
    if (activeMeshId.value === id) {
      activeMeshId.value = meshes.value[0]?.id || ''
    }
    selectedMeshIds.value = selectedMeshIds.value.filter(mId => mId !== id)
    if (selectedMeshIds.value.length === 0 && activeMeshId.value) {
      selectedMeshIds.value = [activeMeshId.value]
    }
    clearSubSelections()
    pruneMeshRevisions()
    markGeometryUpdated()
  }

  function deleteSelectedMeshes() {
    const toDelete = selectedMeshIds.value.length > 0 ? selectedMeshIds.value : (activeMeshId.value ? [activeMeshId.value] : [])
    if (toDelete.length === 0) return
    recordState('Delete Selected Meshes')
    meshes.value = meshes.value.filter(m => !toDelete.includes(m.id))
    meshRepository.retain(meshes.value.map(mesh => mesh.id))
    activeMeshId.value = meshes.value[0]?.id || ''
    selectedMeshIds.value = activeMeshId.value ? [activeMeshId.value] : []
    clearSubSelections()
    pruneMeshRevisions()
    markGeometryUpdated()
  }

  function performDelete(mode: 'vertex' | 'edge' | 'face' | 'object') {
    if (mode === 'object') {
      deleteSelectedMeshes()
      return
    }
    if (!activeMesh.value) return
    const ids = mode === 'face' ? selectedFaceIds.value : (mode === 'edge' ? selectedEdgeIds.value : selectedVertexIds.value)
    const result = runKernelOperation(`Delete ${mode}`, (document, bridge) =>
      deleteElements(document, mode, ids, bridge), { applySelection: false })
    if (result?.success) clearSubSelections()
    return result
  }

  function performDissolve(mode: 'vertex' | 'edge' | 'face') {
    if (!activeMesh.value) return
    const ids = mode === 'edge' ? selectedEdgeIds.value : mode === 'face' ? selectedFaceIds.value : selectedVertexIds.value
    const result = runKernelOperation(`Dissolve ${mode}`, (document, bridge) =>
      dissolveElements(document, mode, ids, bridge), { applySelection: false })
    if (result?.success) clearSubSelections()
    return result
  }

  function performConnectVertices() {
    if (!activeMesh.value || selectedVertexIds.value.length < 2) return
    return runKernelOperation('Connect Vertices (J)', (document, bridge) =>
      connectVertexPath(document, selectedVertexIds.value, bridge))
  }

  function performCleanupMesh() {
    if (!activeMesh.value) return
    return runKernelOperation('Clean Mesh', (document, bridge) =>
      cleanupMeshGeometry(document, bridge), { applySelection: false })
  }

  function incidentFacesFromSelection(): string[] {
    const mesh = activeMesh.value
    if (!mesh) return []
    if (selectedFaceIds.value.length) return [...selectedFaceIds.value]
    if (selectedEdgeIds.value.length) {
      const edges = getMeshEdges(mesh).filter(e => selectedEdgeIds.value.includes(e.id))
      return mesh.faces
        .filter(face => edges.some(edge => face.vertexIds.includes(edge.v1) && face.vertexIds.includes(edge.v2)))
        .map(f => f.id)
    }
    if (selectedVertexIds.value.length) {
      const verts = new Set(selectedVertexIds.value)
      return mesh.faces.filter(f => f.vertexIds.some(id => verts.has(id))).map(f => f.id)
    }
    return []
  }

  function selectionVertexIds(): string[] {
    const mesh = activeMesh.value
    if (!mesh) return []
    if (selectedVertexIds.value.length) return [...selectedVertexIds.value]
    if (selectedEdgeIds.value.length) {
      const edges = getMeshEdges(mesh).filter(e => selectedEdgeIds.value.includes(e.id))
      return [...new Set(edges.flatMap(e => [e.v1, e.v2]))]
    }
    if (selectedFaceIds.value.length) {
      return [...new Set(mesh.faces.filter(f => selectedFaceIds.value.includes(f.id)).flatMap(f => f.vertexIds))]
    }
    return mesh.vertices.map(v => v.id)
  }

  function performFlipEdge() {
    if (!activeMesh.value || selectedEdgeIds.value.length === 0) return
    return runKernelOperation('Rotate Edge', (document, bridge) =>
      flipEdges(document, selectedEdgeIds.value, bridge), { applySelection: false })
  }

  function performRecalculateOutside() {
    if (!activeMesh.value) return
    return runKernelOperation('Recalculate Outside', (document, bridge) =>
      recalculateOutside(document, bridge), { applySelection: false })
  }

  function performTrisToQuads() {
    if (!activeMesh.value) return
    return runKernelOperation('Tris to Quads', (document, bridge) =>
      trisToQuads(document, selectedFaceIds.value, bridge), { applySelection: false })
  }

  function performMakePlanar() {
    if (!activeMesh.value) return
    return runKernelOperation('Make Planar Faces', (document, bridge) =>
      makePlanarFaces(document, selectedFaceIds.value, selectedVertexIds.value, bridge), { applySelection: false })
  }

  function performFillHoles() {
    if (!activeMesh.value) return
    return runKernelOperation('Fill Holes', (document, bridge) =>
      fillHoles(document, bridge))
  }

  function performLimitedDissolve(angleDeg = 5) {
    if (!activeMesh.value) return
    return runKernelOperation('Limited Dissolve', (document, bridge) =>
      limitedDissolve(document, angleDeg, bridge), { applySelection: false })
  }

  function performDeleteOnlyFaces() {
    const ids = incidentFacesFromSelection()
    if (!ids.length) return
    const result = runKernelOperation('Delete Only Faces', (document, bridge) =>
      deleteOnlyFaces(document, ids, bridge), { applySelection: false })
    if (result?.success) clearSubSelections()
    return result
  }

  function performDeleteOnlyEdges() {
    if (!activeMesh.value || selectedEdgeIds.value.length === 0) return
    const result = runKernelOperation('Delete Only Edges', (document, bridge) =>
      deleteOnlyEdges(document, selectedEdgeIds.value, bridge), { applySelection: false })
    if (result?.success) clearSubSelections()
    return result
  }

  function performRip(fill = false) {
    if (!activeMesh.value || selectedEdgeIds.value.length === 0) return
    return runKernelOperation(fill ? 'Rip Fill' : 'Rip', (document, bridge) =>
      ripEdges(document, selectedEdgeIds.value, fill, bridge))
  }

  function performSplit() {
    const ids = incidentFacesFromSelection()
    if (!ids.length) return
    return runKernelOperation('Detach', (document, bridge) =>
      splitSelectedFaces(document, ids, bridge))
  }

  function performVertexBevel(width?: number, segments?: number) {
    const verts = selectionVertexIds()
    if (verts.length === 0) return
    const tools = useToolStore()
    return runKernelOperation('Vertex Bevel', (document, bridge) =>
      vertexBevel(document, verts, width ?? tools.vertexBevelWidth, bridge, segments ?? tools.vertexBevelSegments))
  }

  function performSolidifyFaces(thickness?: number) {
    const ids = incidentFacesFromSelection()
    if (!ids.length) return
    const tools = useToolStore()
    return runKernelOperation('Solidify', (document, bridge) =>
      solidifySelectedFaces(document, ids, thickness ?? tools.solidifyThickness, bridge), { applySelection: false })
  }

  function performLathe() {
    if (!activeMesh.value || activeMesh.value.locked) return
    const tools = useToolStore()
    let vertexIds = [...selectedVertexIds.value]
    if (vertexIds.length < 2 && selectedEdgeIds.value.length > 0) {
      const edges = getMeshEdges(activeMesh.value).filter(edge => selectedEdgeIds.value.includes(edge.id))
      vertexIds = [...new Set(edges.flatMap(edge => [edge.v1, edge.v2]))]
    }
    if (vertexIds.length < 2) return
    return runKernelOperation('Lathe', (document, bridge) =>
      latheProfile(document, vertexIds, tools.latheAxis, tools.latheSteps, bridge), { applySelection: false })
  }

  function performShell(thickness?: number) {
    if (!activeMesh.value || activeMesh.value.locked || activeMesh.value.faces.length === 0) return
    const tools = useToolStore()
    const selected = selectedFaceIds.value.filter(id => activeMesh.value!.faces.some(face => face.id === id))
    const openings = selected.length > 0 && selected.length < activeMesh.value.faces.length ? selected : []
    return runKernelOperation('Shell', (document, bridge) =>
      shellMesh(document, openings, thickness ?? tools.shellThickness, bridge), { applySelection: false })
  }

  function performSymmetrize(axis: 'x' | 'y' | 'z' = 'x') {
    if (!activeMesh.value) return
    return runKernelOperation(`Symmetrize ${axis.toUpperCase()}`, (document, bridge) =>
      symmetrizeMesh(document, axis, bridge), { applySelection: false })
  }

  function performSmoothVertices(factor = 0.5) {
    const verts = selectionVertexIds()
    if (!verts.length) return
    return runKernelOperation('Smooth Vertices', (document, bridge) =>
      smoothMeshVertices(document, verts, factor, bridge), { applySelection: false })
  }

  function performCircle() {
    const mesh = activeMesh.value
    if (!mesh) return
    if (selectedVertexIds.value.length >= 3) {
      return runKernelOperation('Circle', (document, bridge) =>
        circleMeshVertices(document, [...selectedVertexIds.value], bridge), { applySelection: false })
    }
    if (selectedEdgeIds.value.length) {
      const edges = getMeshEdges(mesh).filter(edge => selectedEdgeIds.value.includes(edge.id))
      const verts = [...new Set(edges.flatMap(edge => [edge.v1, edge.v2]))]
      if (verts.length < 3) return
      return runKernelOperation('Circle', (document, bridge) =>
        circleMeshVertices(document, verts, bridge), { applySelection: false })
    }
    if (selectedFaceIds.value.length) {
      return runKernelOperation('Circle', (document, bridge) =>
        circleFaceOutline(document, [...selectedFaceIds.value], bridge), { applySelection: false })
    }
  }

  function performRandomizeVertices(amount = 0.05) {
    const verts = selectionVertexIds()
    if (!verts.length) return
    return runKernelOperation('Randomize Vertices', (document, bridge) =>
      randomizeMeshVertices(document, verts, amount, bridge), { applySelection: false })
  }

  function performUnsubdivide() {
    if (!activeMesh.value) return
    return runKernelOperation('Unsubdivide', (document, bridge) =>
      unsubdivideMesh(document, bridge), { applySelection: false })
  }

  function performDecimate(ratio = 0.5) {
    if (!activeMesh.value) return
    return runKernelOperation('Decimate', (document, bridge) =>
      decimateMesh(document, ratio, bridge), { applySelection: false })
  }

  function performBoolean(op: BooleanOp) {
    const ids = selectedMeshIds.value.length >= 2
      ? selectedMeshIds.value
      : (activeMeshId.value ? [activeMeshId.value] : [])
    if (ids.length < 2) return
    const primary = meshes.value.find(m => m.id === ids[0])
    const cutter = meshes.value.find(m => m.id === ids[1])
    if (!primary || !cutter || primary.locked) return
    const result = runKernelOperation(`Boolean ${op}`, (document, bridge) =>
      booleanMeshes(document, cutter, op, bridge), { mesh: primary, applySelection: false })
    if (!result?.success) return result
    meshes.value = meshes.value.filter(m => m.id !== cutter.id)
    meshRepository.retain(meshes.value.map(mesh => mesh.id))
    pruneMeshRevisions()
    selectedMeshIds.value = [primary.id]
    activeMeshId.value = primary.id
    return result
  }

  function performKnifeProject(polylines: { x: number; y: number; z: number }[][]) {
    if (!activeMesh.value || polylines.length === 0) return
    return runKernelOperation('Knife Project', (document, bridge) =>
      knifeProjectOnMesh(document, polylines, bridge), { applySelection: false })
  }

  function performSeparateByLooseParts() {
    const source = activeMesh.value
    if (!source) return
    const resident = acquireEditableMesh(source)
    const groups = MeshEditOps.connectedFaceGroups(resident.mesh)
    if (groups.length < 2) return
    const toNum = resident.strToNumFaceId
    const groupsDoc = groups.map(g => source.faces.filter(f => {
      const n = toNum.get(f.id)
      return n !== undefined && g.includes(n)
    }).map(f => f.id)).filter(ids => ids.length > 0)
    if (groupsDoc.length < 2) return
    recordState('Separate by Loose Parts')
    const sourceId = source.id
    for (let i = 1; i < groupsDoc.length; i++) {
      const liveDoc = meshes.value.find(m => m.id === sourceId)
      if (!liveDoc) break
      const live = acquireEditableMesh(liveDoc)
      const staged = separateMeshFaces(liveDoc, groupsDoc[i], live, {
        id: `mesh_part_${Date.now()}_${i}`,
        name: `${liveDoc.name}.${i}`
      })
      if (!staged) continue
      const separated = MeshBridge.meshObjectToEditableMesh(staged.separated)
      live.mesh.restoreSnapshot(staged.kernel.createSnapshot())
      meshes.value.push(staged.separated)
      publishEditableMesh(
        MeshBridge.editableMeshToMeshObject(live.mesh, liveDoc, live.numToStrVertId, live.numToStrFaceId),
        live
      )
      publishEditableMesh(staged.separated, separated)
    }
    clearSubSelections()
  }

  function performSeparateByMaterial() {
    const source = activeMesh.value
    if (!source) return
    const byMat = new Map<number, string[]>()
    for (const face of source.faces) {
      const key = face.materialIndex ?? 0
      const list = byMat.get(key) ?? []
      list.push(face.id)
      byMat.set(key, list)
    }
    if (byMat.size < 2) return
    const groups = [...byMat.values()]
    recordState('Separate by Material')
    const sourceId = source.id
    for (let i = 1; i < groups.length; i++) {
      const liveDoc = meshes.value.find(m => m.id === sourceId)
      if (!liveDoc) break
      const live = acquireEditableMesh(liveDoc)
      const staged = separateMeshFaces(liveDoc, groups[i], live, {
        id: `mesh_mat_${Date.now()}_${i}`,
        name: `${liveDoc.name}_mat${i}`
      })
      if (!staged) continue
      const separated = MeshBridge.meshObjectToEditableMesh(staged.separated)
      live.mesh.restoreSnapshot(staged.kernel.createSnapshot())
      meshes.value.push(staged.separated)
      publishEditableMesh(
        MeshBridge.editableMeshToMeshObject(live.mesh, liveDoc, live.numToStrVertId, live.numToStrFaceId),
        live
      )
      publishEditableMesh(staged.separated, separated)
    }
    clearSubSelections()
  }

  type GenerateModifier = 'mirror' | 'subdivision' | 'solidify'

  function addModifier(type: GenerateModifier) {
    if (!activeMesh.value) return
    recordState(`Add ${type} Modifier`)
    if (type === 'mirror') {
      activeMesh.value.mirror = { ...defaultMirrorModifier(), ...activeMesh.value.mirror, enabled: true }
    } else if (type === 'subdivision') {
      activeMesh.value.subdivision = {
        ...defaultSubdivisionModifier(),
        ...activeMesh.value.subdivision,
        enabled: true
      }
    } else {
      activeMesh.value.solidify = { ...defaultSolidifyModifier(), ...activeMesh.value.solidify, enabled: true }
    }
    markGeometryUpdated()
  }

  function applyMeshModifier(type: GenerateModifier | 'all') {
    if (!activeMesh.value) return
    const label = type === 'all' ? 'Apply All Modifiers' : `Apply ${type} Modifier`
    let evaluated: MeshObject | undefined
    const result = runKernelOperation(label, (document, bridge) => {
      evaluated = JSON.parse(JSON.stringify(document)) as MeshObject
      applyModifier(evaluated, type, meshes.value)
      const rebuilt = MeshBridge.meshObjectToEditableMesh(evaluated, bridge)
      bridge.mesh.restoreSnapshot(rebuilt.mesh.createSnapshot())
      bridge.strToNumVertId = rebuilt.strToNumVertId
      bridge.numToStrVertId = rebuilt.numToStrVertId
      bridge.strToNumFaceId = rebuilt.strToNumFaceId
      bridge.numToStrFaceId = rebuilt.numToStrFaceId
      return {
        mesh: MeshBridge.editableMeshToMeshObject(
          bridge.mesh, evaluated, bridge.numToStrVertId, bridge.numToStrFaceId,
        ),
        selectedVertexIds: [],
        selectedEdgeIds: [],
        selectedFaceIds: [],
      }
    }, { applySelection: false })
    if (result?.success && !result.change.topologyChanged && !result.change.positionsChanged
      && !result.change.attributesChanged && evaluated) {
      // Applying a modifier can be geometry-neutral (for example, mirroring a centered cube)
      // while still disabling the stack entry. Commit that metadata change explicitly.
      recordState(label)
      replaceMesh(evaluated, ATTRIBUTE_ONLY_CHANGE)
    }
    return result
  }

  function removeMeshModifier(type: GenerateModifier) {
    if (!activeMesh.value) return
    recordState(`Remove ${type} Modifier`)
    if (type === 'mirror') delete activeMesh.value.mirror
    else if (type === 'subdivision') delete activeMesh.value.subdivision
    else delete activeMesh.value.solidify
    markGeometryUpdated()
  }

  function acquireEditableMesh(document: MeshObject) {
    meshRepository.retain(meshes.value.map(mesh => mesh.id))
    pruneMeshRevisions()
    return meshRepository.acquire(document)
  }

  function holdEditableMesh(document: MeshObject) {
    meshRepository.retain(meshes.value.map(mesh => mesh.id))
    pruneMeshRevisions()
    return meshRepository.hold(document)
  }

  function releaseEditableMesh(objectId: string) {
    meshRepository.release(objectId)
  }

  function captureResidentMeshes(): ResidentMeshSnapshot[] {
    return meshRepository.capture()
  }

  function restoreResidentMeshes(snapshots: ResidentMeshSnapshot[]) {
    meshRepository.restore(snapshots, meshes.value)
  }

  function clearResidentMeshes() {
    meshRepository.clear()
    meshRevisions.clear()
  }

  function validateEditableMesh(mesh: EditableMesh): boolean {
    mesh.recalculateNormals()
    const validation = MeshValidator.validate(mesh)
    meshEditError.value = validation.valid ? null : {
      success: false, code: 'invalid-topology', reason: 'The edit would leave invalid mesh topology.', validation,
    }
    return validation.valid
  }

  function publishEditableMesh(document: MeshObject, bridge: MeshBridgeData, preview = false, change?: MeshChange) {
    const idx = meshes.value.findIndex(mesh => mesh.id === document.id)
    if (idx === -1) return
    meshRepository.publish(document, bridge)
    meshRepository.assertPublished(document, bridge)
    meshes.value[idx] = document
    bumpMeshCounters(document.id, change)
    if (!preview) triggerAutosave()
  }

  function replaceMesh(newMesh: MeshObject, change?: MeshChange) {
    const idx = meshes.value.findIndex(m => m.id === newMesh.id)
    if (idx !== -1) {
      meshes.value[idx] = newMesh
      bumpMeshCounters(newMesh.id, change)
      triggerAutosave()
    }
  }

  // Per-object revision accounting. `bumpMeshCounters` advances the per-object counters and the
  // umbrella; autosave is the caller's job. A no-op MeshChange (all three false) bumps nothing.
  function bumpMeshCounters(objectId: string, change?: MeshChange) {
    if (change && !change.topologyChanged && !change.positionsChanged && !change.attributesChanged) return
    const c = meshRevisions.get(objectId) ?? { topology: 0, position: 0, attribute: 0 }
    if (change) {
      if (change.topologyChanged) { c.topology++; c.position++; c.attribute++ }
      else {
        if (change.positionsChanged) c.position++
        if (change.attributesChanged) c.attribute++
      }
    } else {
      c.topology++; c.position++; c.attribute++
    }
    meshRevisions.set(objectId, c)
    geometryRevision.value++
  }

  // Restore invalidation: undo/redo / session load / new project bump every counter for every
  // object (a restored document has no claim on kernel identity).
  function invalidateAllGeometryRevisions() {
    for (const mesh of meshes.value) {
      const c = meshRevisions.get(mesh.id) ?? { topology: 0, position: 0, attribute: 0 }
      c.topology++; c.position++; c.attribute++
      meshRevisions.set(mesh.id, c)
    }
    geometryRevision.value++
    triggerAutosave()
  }

  function pruneMeshRevisions() {
    const live = new Set(meshes.value.map(m => m.id))
    for (const id of [...meshRevisions.keys()]) {
      if (!live.has(id)) meshRevisions.delete(id)
    }
  }

  function meshRevision(id: string): Readonly<MeshRevisions> | undefined {
    const c = meshRevisions.get(id)
    return c ? { ...c } : undefined
  }

  // Selection Helpers
  const isComponentMode = (mode: SelectMode): mode is ComponentMode => mode === 'vertex' || mode === 'edge' || mode === 'face'

  /** Replace the whole component selection. Arrays for other modes are cleared, never left stale. */
  function setComponentSelection(next: ComponentSelection) {
    selectedVertexIds.value = next.vertices
    selectedEdgeIds.value = next.edges
    selectedFaceIds.value = next.faces
    const mesh = activeMesh.value
    if (!mesh) return
    const verts = new Set(next.vertices), faces = new Set(next.faces)
    mesh.vertices.forEach(v => (v.selected = verts.has(v.id)))
    mesh.faces.forEach(f => (f.selected = faces.has(f.id)))
  }

  function currentComponentSelection(): ComponentSelection {
    return { vertices: selectedVertexIds.value, edges: selectedEdgeIds.value, faces: selectedFaceIds.value }
  }

  function selectAll(mode: SelectMode = 'object') {
    if (mode === 'object') {
      selectedMeshIds.value = meshes.value.map(m => m.id)
      if (!activeMeshId.value && meshes.value.length > 0) {
        activeMeshId.value = meshes.value[0].id
      }
    } else if (isComponentMode(mode) && activeMesh.value) {
      setComponentSelection(selectEverything(activeMesh.value, mode))
    }
  }

  /** Ctrl+I. Object mode inverts which objects are selected. */
  function selectInverse(mode: SelectMode) {
    if (mode === 'object') {
      const picked = new Set(selectedMeshIds.value)
      selectedMeshIds.value = meshes.value.filter(m => !picked.has(m.id) && m.visible !== false).map(m => m.id)
      if (selectedMeshIds.value.length && !selectedMeshIds.value.includes(activeMeshId.value)) activeMeshId.value = selectedMeshIds.value[0]
    } else if (isComponentMode(mode) && activeMesh.value) {
      setComponentSelection(selectInverseOp(activeMesh.value, mode, currentComponentSelection()))
    }
  }

  function deselectAll() {
    selectedMeshIds.value = []
    selectedVertexIds.value = []
    selectedEdgeIds.value = []
    selectedFaceIds.value = []
    selectedReferenceId.value = ''
    if (activeMesh.value) {
      activeMesh.value.vertices.forEach(v => (v.selected = false))
      activeMesh.value.faces.forEach(f => (f.selected = false))
    }
  }

  /** Ctrl+Numpad+ (Blender Select More, face step). */
  function growSelection(mode: SelectMode) {
    if (!activeMesh.value || !isComponentMode(mode)) return
    setComponentSelection(selectMore(activeMesh.value, mode, currentComponentSelection()))
  }

  /** Ctrl+Numpad- (Blender Select Less). */
  function shrinkSelection(mode: SelectMode) {
    if (!activeMesh.value || !isComponentMode(mode)) return
    setComponentSelection(selectLess(activeMesh.value, mode, currentComponentSelection()))
  }

  /** Ctrl+L: select everything linked to the current selection. Faces link through shared edges. */
  function selectConnected(mode: SelectMode) {
    if (!activeMesh.value || !isComponentMode(mode)) return
    setComponentSelection(selectLinked(activeMesh.value, mode, currentComponentSelection()))
  }

  function selectEdgeLoop(edgeId: string, addToSelection = false) {
    if (!activeMesh.value) return
    const loopIds = getEdgeLoop(activeMesh.value, edgeId)
    if (addToSelection) {
      const merged = new Set([...selectedEdgeIds.value, ...loopIds])
      selectedEdgeIds.value = Array.from(merged)
    } else {
      selectedEdgeIds.value = loopIds
    }
  }

  function selectEdgeRing(edgeId: string, addToSelection = false) {
    if (!activeMesh.value) return
    const ringIds = getEdgeRing(activeMesh.value, edgeId)
    if (addToSelection) {
      const merged = new Set([...selectedEdgeIds.value, ...ringIds])
      selectedEdgeIds.value = Array.from(merged)
    } else {
      selectedEdgeIds.value = ringIds
    }
  }

  function selectQueriedEdges(ids: string[]) {
    if (!activeMesh.value) return
    useToolStore().setSelectMode('edge')
    selectedVertexIds.value = []
    selectedFaceIds.value = []
    selectedEdgeIds.value = ids
  }

  function selectBoundaryEdges() {
    if (!activeMesh.value) return
    selectQueriedEdges(boundaryEdgeIds(activeMesh.value))
  }

  function selectNonManifoldEdges() {
    if (!activeMesh.value) return
    selectQueriedEdges(nonManifoldEdgeIds(activeMesh.value))
  }

  function selectSharpEdges() {
    if (!activeMesh.value) return
    selectQueriedEdges(sharpEdgeIds(activeMesh.value))
  }

  function performAutoMerge(meshId: string, threshold = 0.01) {
    const mesh = meshes.value.find(m => m.id === meshId)
    if (!mesh) return
    return runKernelOperation('Auto Merge', (document, bridge) =>
      mergeVerticesAdvanced(document, document.vertices.map(v => v.id), 'distance', threshold, bridge),
      { record: false, mesh, applySelection: false })
  }

  // Clipboard State & Operations
  const clipboard = ref<{ type: 'meshes' | 'faces'; data: any } | null>(null)

  function copySelection(mode: SelectMode = 'object'): boolean {
    if (mode === 'object' || (selectedFaceIds.value.length === 0 && selectedVertexIds.value.length === 0 && selectedEdgeIds.value.length === 0)) {
      const targetMeshes = meshes.value.filter(m => selectedMeshIds.value.includes(m.id))
      const toCopy = targetMeshes.length > 0 ? targetMeshes : (activeMesh.value ? [activeMesh.value] : [])
      if (toCopy.length === 0) return false
      clipboard.value = {
        type: 'meshes',
        data: JSON.parse(JSON.stringify(toCopy))
      }
      return true
    } else if (activeMesh.value) {
      let targetFaceIds = [...selectedFaceIds.value]
      if (targetFaceIds.length === 0 && selectedEdgeIds.value.length > 0) {
        const selectedEdges = getMeshEdges(activeMesh.value).filter(e => selectedEdgeIds.value.includes(e.id))
        targetFaceIds = activeMesh.value.faces
          .filter(face => selectedEdges.some(edge => face.vertexIds.includes(edge.v1) && face.vertexIds.includes(edge.v2)))
          .map(face => face.id)
      } else if (targetFaceIds.length === 0 && selectedVertexIds.value.length > 0) {
        targetFaceIds = activeMesh.value.faces
          .filter(face => face.vertexIds.some(id => selectedVertexIds.value.includes(id)))
          .map(face => face.id)
      }

      if (targetFaceIds.length > 0) {
        const targetFaces: Face[] = activeMesh.value.faces.filter(f => targetFaceIds.includes(f.id))
        const usedVertIds = new Set(targetFaces.flatMap(f => f.vertexIds))
        const targetVerts: Vertex[] = activeMesh.value.vertices.filter(v => usedVertIds.has(v.id))
        clipboard.value = {
          type: 'faces',
          data: {
            faces: JSON.parse(JSON.stringify(targetFaces)),
            vertices: JSON.parse(JSON.stringify(targetVerts))
          }
        }
        return true
      }
    }
    return false
  }

  function pasteClipboard(): boolean {
    if (!clipboard.value) return false

    if (clipboard.value.type === 'meshes') {
      recordState('Paste Object(s)')
      const clonedMeshes: MeshObject[] = JSON.parse(JSON.stringify(clipboard.value.data))
      const newMeshIds: string[] = []

      clonedMeshes.forEach(mesh => {
        const newId = `mesh_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
        mesh.id = newId
        mesh.name = `${mesh.name}_Copy`
        mesh.position.x += 0.5
        mesh.position.z += 0.5

        // Remap vertex IDs
        const vertIdMap = new Map<string, string>()
        mesh.vertices.forEach((v, idx) => {
          const newVId = `v_${newId}_${idx}`
          vertIdMap.set(v.id, newVId)
          v.id = newVId
        })

        // Remap face vertex references and face IDs
        mesh.faces.forEach((f, idx) => {
          f.id = `f_${newId}_${idx}`
          f.vertexIds = f.vertexIds.map(vId => vertIdMap.get(vId) || vId)
        })

        meshes.value.push(mesh)
        newMeshIds.push(newId)
      })

      selectedMeshIds.value = newMeshIds
      activeMeshId.value = newMeshIds[0] || ''
      clearSubSelections()
      markGeometryUpdated()
      return true
    } else if (clipboard.value.type === 'faces' && activeMesh.value) {
      recordState('Paste Face(s)')
      const { faces, vertices } = clipboard.value.data as { faces: Face[]; vertices: Vertex[] }
      const vertIdMap = new Map<string, string>()
      const newFaceIds: string[] = []

      // Clone vertices with offset
      vertices.forEach((v: Vertex) => {
        const newVId = `v_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
        vertIdMap.set(v.id, newVId)
        activeMesh.value!.vertices.push({
          id: newVId,
          position: { x: v.position.x + 0.2, y: v.position.y + 0.2, z: v.position.z + 0.2 },
          normal: { x: v.normal?.x ?? 0, y: v.normal?.y ?? 1, z: v.normal?.z ?? 0 },
          color: v.color,
          selected: false
        })
      })

      // Clone faces
      faces.forEach((f: Face) => {
        const newFId = `f_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
        newFaceIds.push(newFId)
        activeMesh.value!.faces.push({
          id: newFId,
          vertexIds: f.vertexIds.map(id => vertIdMap.get(id) || id),
          normal: { x: f.normal?.x ?? 0, y: f.normal?.y ?? 1, z: f.normal?.z ?? 0 },
          uvs: JSON.parse(JSON.stringify(f.uvs)),
          materialIndex: f.materialIndex ?? 0,
          selected: true
        })
      })

      selectedFaceIds.value = newFaceIds
      markGeometryUpdated()
      return true
    }
    return false
  }

  function duplicateSelection(mode: SelectMode = 'object'): boolean {
    if (copySelection(mode)) {
      return pasteClipboard()
    }
    return false
  }

  function objectMeshesForEdit(): MeshObject[] {
    const selected = meshes.value.filter(m => selectedMeshIds.value.includes(m.id) && !m.locked)
    if (selected.length > 0) return selected
    if (activeMesh.value && !activeMesh.value.locked) return [activeMesh.value]
    return []
  }

  function cloneMeshObject(source: MeshObject, suffix: string): MeshObject {
    const mesh: MeshObject = JSON.parse(JSON.stringify(source))
    const newId = `mesh_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    mesh.id = newId
    mesh.name = `${source.name}${suffix}`
    const vertIdMap = new Map<string, string>()
    mesh.vertices.forEach((v, idx) => {
      const newVId = `v_${newId}_${idx}`
      vertIdMap.set(v.id, newVId)
      v.id = newVId
    })
    mesh.faces.forEach((f, idx) => {
      f.id = `f_${newId}_${idx}`
      f.vertexIds = f.vertexIds.map(vId => vertIdMap.get(vId) || vId)
    })
    delete mesh.instanceOf
    return mesh
  }

  function performFlipAxis(axis: SymmetryAxis) {
    const targets = objectMeshesForEdit()
    if (targets.length === 0) return
    const label = axis === 'x' ? 'H / X' : axis === 'y' ? 'V / Y' : 'Z'
    recordState(`Flip ${label}`)
    for (const mesh of targets) {
      const scale = { x: 1, y: 1, z: 1 }
      scale[axis] = -1
      runKernelOperation(`Flip ${label}`, (document, bridge) => {
        applyRotationAndScaleToEditableMesh(bridge.mesh, { x: 0, y: 0, z: 0 }, scale)
        return {
          mesh: MeshBridge.editableMeshToMeshObject(
            bridge.mesh, document, bridge.numToStrVertId, bridge.numToStrFaceId,
          ),
          selectedVertexIds: [],
          selectedEdgeIds: [],
          selectedFaceIds: [],
        }
      }, { record: false, mesh, applySelection: false })
    }
  }

  function performRotateObject(axis: SymmetryAxis, degrees: number) {
    const targets = objectMeshesForEdit()
    if (targets.length === 0 || !degrees) return
    recordState(`Rotate ${axis.toUpperCase()} ${degrees}°`)
    for (const mesh of targets) addObjectRotation(mesh, axis, degrees)
    // Object TRS is editor state, not a kernel mutation. Baking is an explicit action.
    markObjectTransformUpdated()
  }

  /** Bake rotation and scale through each resident kernel without adding a history step. */
  function bakeObjectRotationScale(targets = objectMeshesForEdit()) {
    if (useToolStore().appMode === 'animate') return
    const lookup = (id: string) => meshes.value.find(mesh => mesh.id === id)
    for (const mesh of targets) {
      if (mesh.locked || !hasObjectRotationOrScale(mesh)) continue
      if (mesh.instanceOf) makeUniqueMesh(mesh, lookup)
      runKernelOperation('Apply Rotation & Scale', (document, bridge) => {
        applyRotationAndScaleToEditableMesh(bridge.mesh, document.rotation, document.scale)
        const projected = MeshBridge.editableMeshToMeshObject(
          bridge.mesh, document, bridge.numToStrVertId, bridge.numToStrFaceId,
        )
        projected.rotation = { x: 0, y: 0, z: 0 }
        projected.scale = { x: 1, y: 1, z: 1 }
        return {
          mesh: projected,
          selectedVertexIds: [...selectedVertexIds.value],
          selectedEdgeIds: [...selectedEdgeIds.value],
          selectedFaceIds: [...selectedFaceIds.value],
        }
      }, { record: false, mesh, applySelection: false })
    }
  }

  function performDuplicateMirror(axis: SymmetryAxis) {
    const sources = objectMeshesForEdit()
    if (sources.length === 0) return
    recordState(`Mirror Copy ${axis.toUpperCase()}`)
    const copies = sources.map(src => {
      const copy = cloneMeshObject(src, `_M${axis.toUpperCase()}`)
      flipMeshGeometry(copy, axis)
      return copy
    })
    meshes.value.push(...copies)
    selectedMeshIds.value = copies.map(m => m.id)
    activeMeshId.value = copies[0]?.id || ''
    clearSubSelections()
    markGeometryUpdated()
  }

  function performApplyRotationScale() {
    const targets = objectMeshesForEdit().filter(mesh => !mesh.locked && hasObjectRotationOrScale(mesh))
    if (targets.length === 0) return
    recordState('Apply Rotation & Scale')
    bakeObjectRotationScale(targets)
  }

  function performMakeUnique() {
    const targets = objectMeshesForEdit().filter(mesh => mesh.instanceOf)
    if (targets.length === 0) return
    recordState('Make Unique')
    const lookup = (id: string) => meshes.value.find(mesh => mesh.id === id)
    for (const mesh of targets) makeUniqueMesh(mesh, lookup)
    markGeometryUpdated()
  }

  function performAlign(axis: AlignAxis, mode: AlignMode) {
    const tools = useToolStore()
    if (tools.selectMode === 'object') {
      const targets = objectMeshesForEdit()
      if (targets.length === 0) return
      recordState(`Align ${axis.toUpperCase()} ${mode}`)
      alignObjects(targets, axis, mode, tools.cursor3D, id => meshes.value.find(mesh => mesh.id === id))
      geometryRevision.value++
      triggerAutosave()
      return
    }
    if (!activeMesh.value || activeMesh.value.locked) return
    const ids = selectionVertexIds()
    if (ids.length === 0) return
    recordState(`Align ${axis.toUpperCase()} ${mode}`)
    let cursor = tools.cursor3D[axis]
    if (mode === 'cursor') {
      const local = new THREE.Vector3(tools.cursor3D.x, tools.cursor3D.y, tools.cursor3D.z)
      local.applyMatrix4(meshObjectWorldMatrix(activeMesh.value).invert())
      cursor = local[axis]
    }
    alignVertices(activeMesh.value, ids, axis, mode, cursor)
    markGeometryUpdated()
  }

  function performMirror(axis: SymmetryAxis = 'x') {
    const sources = objectMeshesForEdit()
    if (sources.length === 0) return
    const offset = useToolStore().mirrorOffset
    recordState(`Mirror ${axis.toUpperCase()}`)
    const copies = sources.map(src => {
      const copy = cloneMeshObject(src, `_M${axis.toUpperCase()}`)
      reflectMeshAcrossPlane(copy, axis, offset)
      return copy
    })
    meshes.value.push(...copies)
    selectedMeshIds.value = copies.map(mesh => mesh.id)
    activeMeshId.value = copies[0]?.id || ''
    clearSubSelections()
    markGeometryUpdated()
  }

  function performLinearArray() {
    const sources = objectMeshesForEdit()
    if (sources.length === 0) return
    const tools = useToolStore()
    const count = Math.max(2, Math.min(24, Math.round(tools.arrayCount) || 2))
    const axis = tools.arrayAxis
    recordState('Linear Array')
    const copies = sources.flatMap(src => Array.from({ length: count - 1 }, (_, index) => {
      const copy = cloneMeshObject(src, `_A${index + 1}`)
      offsetObjectAlong(copy, axis, tools.arrayOffset, index + 1)
      return copy
    }))
    meshes.value.push(...copies)
    selectedMeshIds.value = copies.map(mesh => mesh.id)
    activeMeshId.value = copies[0]?.id || activeMeshId.value
    clearSubSelections()
    markGeometryUpdated()
  }

  function performRadialArray() {
    const sources = objectMeshesForEdit()
    if (sources.length === 0) return
    const tools = useToolStore()
    const count = Math.max(2, Math.min(24, Math.round(tools.arrayCount) || 2))
    const axis = tools.arrayAxis
    recordState('Radial Array')
    const copies = sources.flatMap(src => Array.from({ length: count - 1 }, (_, index) => {
      const copy = cloneMeshObject(src, `_R${index + 1}`)
      rotateObjectAround(copy, axis, index + 1, count)
      return copy
    }))
    meshes.value.push(...copies)
    selectedMeshIds.value = copies.map(mesh => mesh.id)
    activeMeshId.value = copies[0]?.id || activeMeshId.value
    clearSubSelections()
    markGeometryUpdated()
  }

  function performInstanceDuplicate() {
    const sources = objectMeshesForEdit()
    if (sources.length === 0) return
    recordState('Instance Duplicate')
    const copies = sources.map(src => {
      const copy = cloneMeshObject(src, '_Inst')
      copy.instanceOf = src.instanceOf || src.id
      copy.vertices = []
      copy.faces = []
      copy.position = { ...copy.position, x: copy.position.x + 1 }
      return copy
    })
    meshes.value.push(...copies)
    selectedMeshIds.value = copies.map(mesh => mesh.id)
    activeMeshId.value = copies[0]?.id || ''
    clearSubSelections()
    markGeometryUpdated()
  }

  function performSnap(mode: SnapTarget) {
    const tools = useToolStore()
    if (tools.selectMode === 'object') {
      const targets = objectMeshesForEdit()
      if (targets.length === 0) return
      const others = meshes.value.filter(mesh => !targets.some(target => target.id === mesh.id))
      const lookup = (id: string) => meshes.value.find(mesh => mesh.id === id)
      recordState(`Snap to ${mode}`)
      for (const mesh of targets) snapObjectPosition(mesh, others, mode, tools.snapping.gridSize, lookup)
      geometryRevision.value++
      triggerAutosave()
      return
    }
    if (!activeMesh.value || activeMesh.value.locked) return
    const ids = selectionVertexIds()
    if (ids.length === 0) return
    return runKernelOperation(`Snap to ${mode}`, (document, bridge) =>
      snapVertices(document, ids, mode, tools.snapping.gridSize, bridge), { applySelection: false })
  }

  watch(() => useToolStore().selectMode, (mode) => {
    if (mode !== 'vertex' && mode !== 'edge' && mode !== 'face') return
    const mesh = meshes.value.find(item => item.id === activeMeshId.value)
    const sourceId = mesh?.instanceOf
    if (!sourceId || !meshes.value.some(item => item.id === sourceId)) return
    activeMeshId.value = sourceId
    selectedMeshIds.value = [sourceId]
    clearSubSelections()
  })

  const hasAutosaveSession = ref<boolean>(false)
  const autosaveRecord = ref<ProjectStorageData | null>(null)
  const showRecoveryBanner = ref<boolean>(false)
  const isRestoringSession = ref<boolean>(false)
  const DOCUMENT_RECOVERY_KEY = 'polyecho.documentRecovery'
  const documentRecoveryEnabled = ref(false)
  if (typeof localStorage !== 'undefined') {
    try {
      documentRecoveryEnabled.value = localStorage.getItem(DOCUMENT_RECOVERY_KEY) === '1'
    } catch {
      documentRecoveryEnabled.value = false
    }
  }

  function persistDocumentRecoveryPref() {
    try {
      localStorage.setItem(DOCUMENT_RECOVERY_KEY, documentRecoveryEnabled.value ? '1' : '0')
    } catch {
      /* ignore quota / private mode */
    }
  }

  function setDocumentRecoveryEnabled(on: boolean) {
    documentRecoveryEnabled.value = on
    persistDocumentRecoveryPref()
    showRecoveryBanner.value = on && !!autosaveRecord.value
  }
  let autosaveTimer: any = null

  function triggerAutosave() {
    if (typeof window === 'undefined') return
    if (autosaveTimer) clearTimeout(autosaveTimer)
    autosaveTimer = setTimeout(async () => {
      if (isRestoringSession.value) return
      if (useAnimationStore().isPlaying) {
        triggerAutosave()
        return
      }
      try {
        await enqueueDocumentWrite(async () => {
          const animationStore = useAnimationStore()
          const textureData = textures.value.map(t => ({
            id: t.id,
            name: t.name,
            width: t.width,
            height: t.height,
            dataUrl: t.pixelBuffer ? t.pixelBuffer.canvas.toDataURL() : '',
            ...serializePaintLayers(t.pixelBuffer),
            atlas: t.atlas ? { ...t.atlas } : undefined
          }))

          await ProjectStorage.saveProject({
            name: projectName.value,
            meshes: JSON.parse(JSON.stringify(meshes.value)),
            materials: JSON.parse(JSON.stringify(materials.value)),
            activePalette: JSON.parse(JSON.stringify(activePalette.value)),
            textures: textureData,
            armature: JSON.parse(JSON.stringify(animationStore.armature))
          })
          hasAutosaveSession.value = true
        })
      } catch (e) {
        console.warn('Autosave error:', e)
      }
    }, 1200)
  }

  onScopeDispose(() => {
    if (autosaveTimer) {
      clearTimeout(autosaveTimer)
      autosaveTimer = null
    }
  })

  async function checkAutosaveSession(): Promise<boolean> {
    const data = await ProjectStorage.loadProject()
    if (data && Array.isArray(data.meshes) && data.meshes.length > 0) {
      hasAutosaveSession.value = true
      autosaveRecord.value = data
      showRecoveryBanner.value = documentRecoveryEnabled.value
      return true
    }
    hasAutosaveSession.value = false
    autosaveRecord.value = null
    showRecoveryBanner.value = false
    return false
  }

  function dismissRecoverySession() {
    showRecoveryBanner.value = false
  }

  async function discardRecoverySession() {
    await ProjectStorage.clearAutosave()
    hasAutosaveSession.value = false
    autosaveRecord.value = null
    showRecoveryBanner.value = false
  }

  async function restoreAutosaveSession(): Promise<boolean> {
    const data = await ProjectStorage.loadProject()
    if (!data || !Array.isArray(data.meshes) || data.meshes.length === 0) return false

    isRestoringSession.value = true
    try {
      projectName.value = data.name || 'Restored_Project'
      clearResidentMeshes()
      meshes.value = data.meshes
      activeMeshId.value = data.meshes[0]?.id || ''
      selectedMeshIds.value = [data.meshes[0]?.id || '']

      if (Array.isArray(data.materials) && data.materials.length > 0) {
        materials.value = data.materials
      }

      if (data.activePalette) {
        activePalette.value = data.activePalette
      }

      const textureLoads: Promise<void>[] = []
      if (Array.isArray(data.textures) && data.textures.length > 0) {
        textures.value = data.textures.map(t => {
          const buf = new PixelBuffer(t.width || 64, t.height || 64)
          // If this is default texture and dataUrl is missing or too short, generate retro atlas
          if (t.layers?.length) {
            textureLoads.push(restorePaintLayers(buf, t.layers, t.activeLayerId))
          } else if (t.id === 'tex_default' && (!t.dataUrl || t.dataUrl.length < 100)) {
            generateRetroAtlas(buf)
            t.dataUrl = buf.toDataURL()
          } else if (t.dataUrl) {
            textureLoads.push(new Promise<void>(resolve => {
              const img = new Image()
              img.onload = () => {
                buf.ctx.clearRect(0, 0, buf.width, buf.height)
                buf.ctx.drawImage(img, 0, 0)
                buf.syncToActiveLayer()
                resolve()
              }
              img.onerror = () => {
                if (t.id === 'tex_default') {
                  generateRetroAtlas(buf)
                }
                resolve()
              }
              img.src = t.dataUrl
            }))
          } else if (t.id === 'tex_default') {
            generateRetroAtlas(buf)
            t.dataUrl = buf.toDataURL()
          }
          return {
            id: t.id,
            name: t.name,
            width: t.width,
            height: t.height,
            dataUrl: t.dataUrl,
            pixelBuffer: markRaw(buf),
            atlas: t.atlas || (t.id === 'tex_default' ? { cols: 2, rows: 2 } : undefined)
          }
        })
        activeTextureId.value = textures.value[0]?.id || 'tex_default'
        await Promise.all(textureLoads)
      }

      // Ensure the starter texture is always available
      let defTex = textures.value.find(t => t.id === 'tex_default')
      if (!defTex) {
        defTex = makeStarterTexture()
        textures.value.unshift(defTex)
      }

      // Ensure materials are well-formed and linked to valid textures
      if (Array.isArray(data.materials) && data.materials.length > 0) {
        materials.value = data.materials.map(m => {
          if (m.id === 'default_material' && !m.textureId) {
            return { ...m, textureId: 'tex_default', color: '#ffffff', shading: m.shading || 'textured' }
          }
          return m
        })
      }

      if (data.armature) {
        const animationStore = useAnimationStore()
        animationStore.armature = data.armature
        SpringPhysicsSolver.reset()
      }

      clearSubSelections()
      meshRevisions.clear()
      markGeometryUpdated()
      markTextureUpdated()
      historyStore.clearHistory()
      historyStore.markDirty()
      showRecoveryBanner.value = false
      return true
    } finally {
      isRestoringSession.value = false
    }
  }

  function markGeometryUpdated() {
    // Legacy path: bump the active object's `attribute` counter (plus the umbrella) until the
    // writer is classified (see §3.4.2). Non-mesh sites still get an umbrella-only render bump.
    const id = activeMesh.value?.id
    if (id) {
      const c = meshRevisions.get(id) ?? { topology: 0, position: 0, attribute: 0 }
      c.attribute++
      meshRevisions.set(id, c)
    }
    geometryRevision.value++
    triggerAutosave()
  }

  /** Object TRS redraw/autosave without invalidating resident mesh data. */
  function markObjectTransformUpdated() {
    geometryRevision.value++
    triggerAutosave()
  }

  let texturePreviewRaf: number | null = null

  /** Live stroke preview: bump revision so CanvasTextures refresh. No toDataURL / autosave. */
  function markTexturePreview() {
    if (texturePreviewRaf != null) return
    const schedule = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (cb: () => void) => setTimeout(cb, 16) as unknown as number
    texturePreviewRaf = schedule(() => {
      texturePreviewRaf = null
      textureRevision.value++
    })
  }

  function markTextureUpdated(textureId?: string) {
    textureRevision.value++
    const targetId = textureId || activeTextureId.value
    const targetTex = textures.value.find(t => t.id === targetId) || activeTexture.value
    if (targetTex && targetTex.pixelBuffer) {
      targetTex.dataUrl = targetTex.pixelBuffer.toDataURL()
    }
    triggerAutosave()
  }

  // Multi-Texture Store Management
  //
  // Three verbs — see docs/TEXTURES.md
  //   selectTexture          paint/UV target only
  //   createTexture          add an image to the library (does not bind a mesh)
  //   applyTextureToMesh     bind an image onto an object (optional material fork)
  //   applyTextureToMaterial bind an image onto a material (all sharers update)

  function createTexture(
    name: string,
    width = 64,
    height = 64,
    initialDataUrl?: string,
    customBuffer?: PixelBuffer,
    options?: { record?: boolean; select?: boolean; atlas?: { cols: number; rows: number } }
  ): TextureMap {
    const record = options?.record !== false
    const shouldSelect = options?.select !== false
    if (record) recordPixels(`Add Texture (${name || 'untitled'})`)

    const id = `tex_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
    const buf = markRaw(customBuffer || new PixelBuffer(width, height))
    if (!customBuffer && initialDataUrl) {
      const img = new Image()
      img.onload = () => {
        buf.ctx.drawImage(img, 0, 0)
        buf.syncToActiveLayer()
        markTextureUpdated(id)
      }
      img.src = initialDataUrl
    }
    const newTex: TextureMap = {
      id,
      name: name || `Texture_${textures.value.length + 1}`,
      width,
      height,
      dataUrl: initialDataUrl || buf.toDataURL(),
      pixelBuffer: buf,
      atlas: options?.atlas ? clampAtlasGrid(options.atlas.cols, options.atlas.rows) : undefined
    }
    textures.value.push(newTex)
    if (shouldSelect) activeTextureId.value = id
    markTextureUpdated(id)
    return newTex
  }

  /** @deprecated Use createTexture — same behavior, kept for existing call sites. */
  function addTexture(
    name: string,
    width = 64,
    height = 64,
    initialDataUrl?: string,
    customBuffer?: PixelBuffer
  ): TextureMap {
    return createTexture(name, width, height, initialDataUrl, customBuffer)
  }

  function duplicateTexture(id: string): TextureMap | null {
    const src = textures.value.find(t => t.id === id)
    if (!src) return null
    recordPixels(`Duplicate Texture (${src.name})`)
    const clonedBuf = src.pixelBuffer
      ? src.pixelBuffer.clone()
      : new PixelBuffer(src.width, src.height)
    const newTex: TextureMap = {
      id: `tex_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: `${src.name}_Copy`,
      width: src.width,
      height: src.height,
      dataUrl: clonedBuf.toDataURL(),
      pixelBuffer: markRaw(clonedBuf),
      atlas: src.atlas ? { ...src.atlas } : undefined
    }
    textures.value.push(newTex)
    selectTexture(newTex.id)
    markTextureUpdated()
    return newTex
  }

  function renameTexture(id: string, newName: string) {
    const tex = textures.value.find(t => t.id === id)
    if (tex && newName.trim()) {
      recordPixels('Rename Texture')
      tex.name = newName.trim()
    }
  }

  function deleteTexture(id: string) {
    if (textures.value.length <= 1) return
    recordPixels('Delete Texture')
    textures.value = textures.value.filter(t => t.id !== id)
    for (const mat of materials.value) {
      if (mat.textureId === id) {
        mat.textureId = null
      }
    }
    if (activeTextureId.value === id) {
      selectTexture(textures.value[0]?.id || 'tex_default')
    }
    markTextureUpdated()
    markGeometryUpdated()
  }

  function setTextureAtlasGrid(id: string, cols: number, rows: number) {
    const tex = textures.value.find(t => t.id === id)
    if (!tex) return
    recordState(`Atlas Grid ${cols}×${rows}`)
    const grid = clampAtlasGrid(cols, rows, tex.atlas)
    tex.atlas = grid.cols === 1 && grid.rows === 1 ? undefined : grid
    markTextureUpdated(id)
  }

  function clearTextureAtlasGrid(id: string) {
    const tex = textures.value.find(t => t.id === id)
    if (!tex || !tex.atlas) return
    recordState('Clear Atlas Grid')
    tex.atlas = undefined
    markTextureUpdated(id)
  }

  function sliceTextureIntoTiles(id: string, cols?: number, rows?: number) {
    const tex = textures.value.find(t => t.id === id)
    if (!tex?.pixelBuffer) return
    const grid = clampAtlasGrid(cols ?? tex.atlas?.cols ?? 2, rows ?? tex.atlas?.rows ?? 2)
    if (grid.cols * grid.rows < 2) return
    recordPixels(`Slice Atlas ${tex.name} (${grid.cols}×${grid.rows})`)
    tex.atlas = grid
    const tiles = sliceBufferIntoTiles(tex.pixelBuffer, grid.cols, grid.rows)
    for (const tile of tiles) {
      createTexture(
        `${tex.name}_${tile.row}_${tile.col}`,
        tile.width,
        tile.height,
        tile.buffer.toDataURL(),
        tile.buffer,
        { record: false, select: false }
      )
    }
    selectTexture(tex.id)
  }

  function performMapUVsToAtlasCell(col: number, row: number) {
    const mesh = activeMesh.value
    const tex = activeTexture.value
    if (!mesh) return
    const grid = tex.atlas || { cols: 2, rows: 2 }
    recordState(`Map UVs to atlas cell ${col + 1},${row + 1}`)
    mapFacesToAtlasCell(mesh.faces, selectedFaceIds.value, grid, col, row)
    markGeometryUpdated()
  }

  function getTextureForMaterial(matId?: string | null): TextureMap | undefined {
    if (!matId) return activeTexture.value
    const mat = materials.value.find(m => m.id === matId)
    if (mat && mat.textureId) {
      return textures.value.find(t => t.id === mat.textureId) || activeTexture.value
    }
    return activeTexture.value
  }

  function getTextureById(id: string): TextureMap | undefined {
    return textures.value.find(t => t.id === id)
  }

  function applyTextureToMaterial(
    matId: string,
    textureId: string | null,
    options?: { record?: boolean }
  ) {
    const mat = materials.value.find(m => m.id === matId)
    if (!mat) return
    if (options?.record !== false) recordState(`Apply Texture to Material (${mat.name})`)
    mat.textureId = textureId
    if (textureId) {
      mat.fill = 'image'
      selectTexture(textureId)
      markTextureUpdated(textureId)
    } else if (mat.fill === 'image') {
      mat.fill = 'solid'
    }
    markGeometryUpdated()
  }

  function assignTextureToMaterial(matId: string, textureId: string | null) {
    applyTextureToMaterial(matId, textureId)
  }

  function applyTextureToAllMaterials(textureId: string) {
    recordState('Apply Texture to All Materials')
    for (const mat of materials.value) {
      mat.textureId = textureId
    }
    selectTexture(textureId)
    markTextureUpdated(textureId)
    markGeometryUpdated()
  }

  function unbindTextureFromMaterial(matId: string) {
    const mat = materials.value.find(m => m.id === matId)
    if (!mat) return
    recordState(`Unbind Texture from Material (${mat.name})`)
    mat.textureId = null
    if (mat.fill === 'image') mat.fill = 'solid'
    markGeometryUpdated()
  }

  // Multi-Material Store Management
  //
  // Three verbs — see docs/MATERIALS.md
  //   selectMaterial         inspector target only (no mesh change, no undo)
  //   createMaterial         add a material to the library (does not bind a mesh)
  //   applyMaterialToMesh    bind a material onto an object
  //   forkMaterialForMesh    duplicate material exclusively for a mesh

  function createMaterial(
    name?: string,
    colorOrTextureId?: string | null,
    textureId?: string | null,
    options?: { record?: boolean; select?: boolean }
  ): Material {
    const record = options?.record !== false
    const shouldSelect = options?.select !== false
    if (record) recordState(`Add Material (${name || 'untitled'})`)
    const id = `mat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
    let color = '#ffffff'
    let texId: string | null = null

    if (textureId !== undefined) {
      if (colorOrTextureId && colorOrTextureId.startsWith('#')) {
        color = colorOrTextureId
      }
      texId = textureId
    } else if (colorOrTextureId) {
      if (colorOrTextureId.startsWith('#') || colorOrTextureId.startsWith('rgb')) {
        color = colorOrTextureId
      } else {
        texId = colorOrTextureId
      }
    }

    const newMat: Material = {
      id,
      name: name || `Material_${materials.value.length + 1}`,
      color,
      textureId: texId ?? null,
      tileX: 1,
      tileY: 1,
      fill: texId ? 'image' : 'solid',
      shading: 'textured',
      psxJitter: false,
      psxJitterResolution: 240,
      psxAffine: false,
      dither: false,
      ditherLevel: 32,
      wireframe: false,
      blendMode: 'mask',
      alphaTest: 0.05
    }
    materials.value.push(newMat)
    if (shouldSelect) selectMaterial(newMat.id)
    return newMat
  }

  /** @deprecated Use createMaterial — same behavior, kept for compatibility */
  function addMaterial(name?: string, colorOrTextureId?: string | null, textureId?: string | null): Material {
    return createMaterial(name, colorOrTextureId, textureId)
  }

  function deleteMaterial(id: string) {
    if (materials.value.length <= 1) return
    recordState('Delete Material')
    materials.value = materials.value.filter(m => m.id !== id)
    const fallbackMatId = materials.value[0]?.id || 'default_material'
    for (const mesh of meshes.value) {
      if (mesh.materialId === id) {
        mesh.materialId = fallbackMatId
      }
    }
    if (activeMaterialId.value === id) {
      selectMaterial(fallbackMatId)
    }
    markGeometryUpdated()
  }

  function applyMaterialToMesh(meshId: string, materialId: string) {
    const mesh = meshes.value.find(m => m.id === meshId)
    const mat = materials.value.find(m => m.id === materialId)
    if (mesh && mat) {
      recordState(`Assign Material (${mat.name}) to ${mesh.name}`)
      mesh.materialId = materialId
      selectMaterial(materialId)
      markGeometryUpdated()
    }
  }

  function assignMaterialToActiveMesh(matId: string) {
    if (activeMesh.value) {
      applyMaterialToMesh(activeMesh.value.id, matId)
    }
  }

  function assignMaterialToSelectedMeshes(matId: string) {
    recordState('Assign Material to Selection')
    for (const id of selectedMeshIds.value) {
      const m = meshes.value.find(mesh => mesh.id === id)
      if (m) m.materialId = matId
    }
    if (activeMesh.value) {
      activeMesh.value.materialId = matId
      selectMaterial(matId)
    }
    markGeometryUpdated()
  }

  function forkMaterialForMesh(meshId: string, options?: { record?: boolean }): Material | null {
    const mesh = meshes.value.find(m => m.id === meshId)
    if (!mesh) return null
    const currentMatId = mesh.materialId || 'default_material'
    const currentMat = materials.value.find(m => m.id === currentMatId)
    if (!currentMat) return null

    if (options?.record !== false) recordState(`Fork Material for ${mesh.name}`)
    const newMat: Material = {
      ...JSON.parse(JSON.stringify(currentMat)),
      id: `mat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: `${mesh.name}_Mat`
    }
    materials.value.push(newMat)
    mesh.materialId = newMat.id
    selectMaterial(newMat.id)
    markGeometryUpdated()
    return newMat
  }

  function duplicateMaterial(id: string): Material | null {
    const src = materials.value.find(m => m.id === id)
    if (!src) return null
    recordState(`Duplicate Material (${src.name})`)
    const newMat: Material = {
      ...JSON.parse(JSON.stringify(src)),
      id: `mat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: `${src.name}_Copy`
    }
    materials.value.push(newMat)
    selectMaterial(newMat.id)
    return newMat
  }

  function renameMaterial(id: string, newName: string) {
    const mat = materials.value.find(m => m.id === id)
    if (mat && newName.trim()) {
      recordState('Rename Material')
      mat.name = newName.trim()
    }
  }

  function purgeUnusedMaterials() {
    const used = new Set(meshes.value.map(m => m.materialId).filter(Boolean) as string[])
    const keep = materials.value.filter(m => used.has(m.id))
    if (keep.length === materials.value.length) return
    if (keep.length === 0 && materials.value.length > 0) {
      keep.push(materials.value[0])
    }
    recordState('Purge Unused Materials')
    materials.value = keep
    if (!keep.some(m => m.id === activeMaterialId.value)) {
      selectMaterial(keep[0]?.id || 'default_material')
    }
    markGeometryUpdated()
  }

  /** Clone the mesh material's texture; fork the material if it is shared. */
  function forkTextureForMesh(meshId: string): TextureMap | null {
    const mesh = meshes.value.find(m => m.id === meshId)
    if (!mesh) return null
    const mat = materials.value.find(m => m.id === (mesh.materialId || 'default_material'))
    const src = textures.value.find(t => t.id === mat?.textureId) || activeTexture.value
    if (!src?.pixelBuffer) return null

    recordPixels(`Fork Texture for ${mesh.name}`)
    const clonedBuf = src.pixelBuffer.clone()
    const newTex = createTexture(
      `${mesh.name}_Texture`,
      src.width,
      src.height,
      clonedBuf.toDataURL(),
      clonedBuf,
      { record: false, select: true }
    )
    let targetMat = mat
    if (mat && isMaterialShared(mat.id)) {
      targetMat = forkMaterialForMesh(meshId, { record: false }) || mat
    }
    if (targetMat) {
      applyTextureToMaterial(targetMat.id, newTex.id, { record: false })
    }
    return newTex
  }

  function makeActiveMeshMaterialUnique(): Material | null {
    if (!activeMesh.value) return null
    return forkMaterialForMesh(activeMesh.value.id)
  }

  function applyTextureToMesh(
    meshId: string,
    textureId: string,
    policy: TextureApplyPolicy = 'this_object',
    options?: { record?: boolean }
  ) {
    const mesh = meshes.value.find(m => m.id === meshId)
    if (!mesh) {
      selectTexture(textureId)
      markTextureUpdated(textureId)
      return
    }

    const currentMatId = mesh.materialId || 'default_material'
    const currentMat = materials.value.find(m => m.id === currentMatId)
    const shared = isMaterialShared(currentMatId)

    if (options?.record !== false) recordState(`Apply Texture to ${mesh.name}`)

    if (policy === 'this_object' && shared && currentMat) {
      const newMat: Material = {
        ...JSON.parse(JSON.stringify(currentMat)),
        id: `mat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: `${mesh.name}_Mat`,
        color: '#ffffff',
        fill: 'image',
        textureId
      }
      materials.value.push(newMat)
      mesh.materialId = newMat.id
    } else if (currentMat) {
      currentMat.textureId = textureId
      currentMat.fill = 'image'
      currentMat.color = '#ffffff'
    } else {
      const newMat = addMaterial(`${mesh.name}_Mat`, '#ffffff', textureId)
      mesh.materialId = newMat.id
    }

    selectTexture(textureId)
    markTextureUpdated(textureId)
    markGeometryUpdated()
  }

  function assignTextureToActiveMesh(textureId: string, policy: TextureApplyPolicy = 'this_object') {
    if (!activeMesh.value) {
      selectTexture(textureId)
      markTextureUpdated(textureId)
      return
    }
    applyTextureToMesh(activeMesh.value.id, textureId, policy)
  }

  function makeStarterTexture(): TextureMap {
    const contents = createStarterTextureContents(defaultTexturePref.value)
    return {
      id: 'tex_default',
      name: contents.name,
      width: contents.width,
      height: contents.height,
      dataUrl: contents.dataUrl,
      pixelBuffer: markRaw(contents.pixelBuffer),
      atlas: contents.atlas
    }
  }

  function paintStarterOnto(target: TextureMap) {
    const starterTex = makeStarterTexture()
    target.name = starterTex.name
    target.width = starterTex.width
    target.height = starterTex.height
    target.dataUrl = starterTex.dataUrl
    target.pixelBuffer = starterTex.pixelBuffer
    target.atlas = starterTex.atlas
  }

  function setDefaultTexturePref(next: Partial<DefaultTexturePref>) {
    defaultTexturePref.value = normalizeDefaultTexturePref({ ...defaultTexturePref.value, ...next })
    saveDefaultTexturePref(defaultTexturePref.value)
    restoreDefaultTexture({ select: false })
  }

  function restoreDefaultTexture(options?: { record?: boolean; select?: boolean }): TextureMap {
    if (options?.record !== false) recordPixels('Restore Default Texture')
    let target = textures.value.find(t => t.id === 'tex_default')
    if (!target) {
      target = makeStarterTexture()
      textures.value.unshift(target)
    } else {
      paintStarterOnto(target)
    }
    if (options?.select !== false) selectTexture(target.id)
    markTextureUpdated(target.id)
    return target
  }

  function generateRetroAtlasOnActive(): TextureMap | null {
    const target = activeTexture.value
    if (!target) return null
    recordPixels('Generate Retro Atlas')
    const buf = new PixelBuffer(64, 64)
    generateRetroAtlas(buf)
    target.width = 64
    target.height = 64
    target.pixelBuffer = markRaw(buf)
    target.dataUrl = buf.toDataURL()
    target.atlas = { cols: 2, rows: 2 }
    markTextureUpdated(target.id)
    return target
  }

  // --- Palettes Subsystem (Three Verbs — see docs/PALETTES.md) ---
  function selectPalette(id: string) {
    const pal = palettes.value.find(p => p.id === id)
    if (!pal) return
    activePaletteId.value = id
  }

  function createPalette(
    name: string,
    colors: string[],
    options?: { category?: string; record?: boolean; select?: boolean; isCustom?: boolean }
  ): Palette {
    const record = options?.record !== false
    const shouldSelect = options?.select !== false
    if (record) recordState(`Add Palette (${name || 'untitled'})`)
    const id = `pal_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
    const newPal: Palette = {
      id,
      name: name || `Palette_${palettes.value.length + 1}`,
      category: options?.category || 'Custom',
      isCustom: options?.isCustom ?? true,
      colors: colors.length > 0 ? [...colors] : ['#ffffff', '#000000']
    }
    palettes.value.push(newPal)
    saveCustomPalettes(palettes.value.filter(p => p.isCustom))
    if (shouldSelect) selectPalette(newPal.id)
    return newPal
  }

  function applyPaletteToTexture(
    textureId: string,
    paletteId: string,
    ditherMode: 'nearest' | 'floyd-steinberg' | 'atkinson' = 'nearest'
  ) {
    const tex = textures.value.find(t => t.id === textureId)
    const pal = palettes.value.find(p => p.id === paletteId)
    if (!tex || !tex.pixelBuffer || !pal || pal.colors.length === 0) return

    recordPixels(`Apply Palette (${pal.name}) to ${tex.name}`)
    tex.pixelBuffer.remapToPalette(pal.colors, ditherMode)
    selectPalette(paletteId)
    markTextureUpdated(textureId)
    markGeometryUpdated()
  }

  function applyPaletteToAllTextures(
    paletteId: string,
    ditherMode: 'nearest' | 'floyd-steinberg' | 'atkinson' = 'nearest'
  ) {
    const pal = palettes.value.find(p => p.id === paletteId)
    if (!pal || pal.colors.length === 0) return

    recordPixels(`Apply Palette (${pal.name}) to All Textures`)
    for (const tex of textures.value) {
      if (tex.pixelBuffer) {
        tex.pixelBuffer.remapToPalette(pal.colors, ditherMode)
        markTextureUpdated(tex.id)
      }
    }
    selectPalette(paletteId)
    markGeometryUpdated()
  }

  function extractPaletteFromActiveTexture(name?: string, colorCount = 16): Palette {
    const tex = activeTexture.value
    const colors = tex?.pixelBuffer ? tex.pixelBuffer.extractPalette(colorCount) : ['#ffffff', '#000000']
    const palName = name || `Extracted_${tex?.name || 'Texture'}`
    return createPalette(palName, colors, { category: 'Custom', isCustom: true })
  }

  function deletePalette(id: string) {
    const pal = palettes.value.find(p => p.id === id)
    if (!pal || !pal.isCustom) return
    recordState(`Delete Palette (${pal.name})`)
    palettes.value = palettes.value.filter(p => p.id !== id)
    saveCustomPalettes(palettes.value.filter(p => p.isCustom))
    if (activePaletteId.value === id) {
      selectPalette(DEFAULT_PALETTES[0].id)
    }
  }

  function resetToDefaultProject() {
    recordPixels('New Project')
    const starterTex = makeStarterTexture()

    projectName.value = 'New Project'
    clearResidentMeshes()
    const defaultCube = createCube('Cube_1', 2)
    defaultCube.materialId = 'default_material'
    meshes.value = [defaultCube]
    activeMeshId.value = defaultCube.id
    selectedMeshIds.value = [defaultCube.id]

    textures.value = [starterTex]
    activeTextureId.value = 'tex_default'
    referenceImages.value = []
    referenceRevision.value++

    materials.value = [
      {
        id: 'default_material',
        name: 'Default_Material',
        textureId: 'tex_default',
        color: '#ffffff',
        shading: 'textured',
        psxJitter: false,
        psxJitterResolution: 240,
        psxAffine: false,
        dither: false,
        ditherLevel: 32,
        wireframe: false,
        blendMode: 'mask',
        alphaTest: 0.05
      }
    ]

    const animationStore = useAnimationStore()
    animationStore.armature = {
      id: 'armature_default',
      name: 'Armature',
      bones: [],
      rootBoneIds: [],
      clips: [],
      activeClipId: null
    }
    SpringPhysicsSolver.reset()

    clearSubSelections()
    meshRevisions.clear()
    markGeometryUpdated()
    markTextureUpdated('tex_default')
    ProjectStorage.clearAutosave()
  }

  function setShadeMode(mode: MeshShadeMode) {
    const targets = meshes.value.filter(m => selectedMeshIds.value.includes(m.id) || m.id === activeMeshId.value)
    if (targets.length === 0) return
    const label = mode === 'flat' ? 'Shade Flat' : mode === 'smooth' ? 'Shade Smooth' : 'Shade Smooth by Angle'
    recordState(label)
    for (const mesh of targets) {
      mesh.shadeMode = mode
      if (mode === 'auto' && mesh.autoSmoothAngle === undefined) {
        mesh.autoSmoothAngle = 30
      }
    }
    markGeometryUpdated()
  }

  function setAutoSmoothAngle(angle: number, options?: { record?: boolean }) {
    if (options?.record !== false) recordState('Set Auto Smooth Angle')
    const clamped = Math.max(0, Math.min(180, angle))
    for (const mesh of meshes.value) {
      if (selectedMeshIds.value.includes(mesh.id) || mesh.id === activeMeshId.value) {
        mesh.autoSmoothAngle = clamped
      }
    }
    markGeometryUpdated()
  }

  function toggleShadeMode() {
    const current = activeMesh.value?.shadeMode || 'flat'
    setShadeMode(current === 'flat' ? 'smooth' : 'flat')
  }

  function seamTargetEdgeIds(): string[] {
    if (!activeMesh.value) return []
    if (selectedEdgeIds.value.length > 0) return selectedEdgeIds.value
    if (selectedFaceIds.value.length > 0) {
      return boundaryEdgeIdsForFaces(activeMesh.value, selectedFaceIds.value)
    }
    return []
  }

  function markSelectedEdgesAsSeam() {
    if (!activeMesh.value) return
    const targets = seamTargetEdgeIds()
    if (targets.length === 0) return
    const existing = new Set(activeMesh.value.seamEdgeIds || [])
    const toAdd = targets.filter(id => !existing.has(id))
    if (toAdd.length === 0) return
    return runKernelOperation('Mark Seam', (document, bridge) =>
      setSeamEdges(document, toAdd, true, bridge), { applySelection: false })
  }

  function clearSelectedEdgesSeam() {
    if (!activeMesh.value || !activeMesh.value.seamEdgeIds) return
    const targets = seamTargetEdgeIds()
    if (targets.length === 0) return
    const remove = targets.filter(id => activeMesh.value!.seamEdgeIds!.includes(id))
    if (remove.length === 0) return
    return runKernelOperation('Clear Seam', (document, bridge) =>
      setSeamEdges(document, remove, false, bridge), { applySelection: false })
  }

  function markSelectedEdgesSharp() {
    if (!activeMesh.value) return
    const targets = seamTargetEdgeIds()
    if (targets.length === 0) return
    const existing = new Set(activeMesh.value.sharpEdgeIds || [])
    const toAdd = targets.filter(id => !existing.has(id))
    if (toAdd.length === 0) return
    const promote = (activeMesh.value.shadeMode || 'flat') === 'flat'
    return runKernelOperation('Mark Sharp', (document, bridge) => {
      if (promote) document.shadeMode = 'auto'
      return setSharpEdges(document, toAdd, true, bridge)
    }, { applySelection: false })
  }

  function clearSelectedEdgesSharp() {
    if (!activeMesh.value || !activeMesh.value.sharpEdgeIds?.length) return
    const targets = seamTargetEdgeIds()
    if (targets.length === 0) return
    const remove = targets.filter(id => activeMesh.value!.sharpEdgeIds!.includes(id))
    if (remove.length === 0) return
    return runKernelOperation('Clear Sharp', (document, bridge) =>
      setSharpEdges(document, remove, false, bridge), { applySelection: false })
  }

  function clearAllSeams() {
    if (!activeMesh.value || !activeMesh.value.seamEdgeIds?.length) return
    return runKernelOperation('Clear All Seams', (document, bridge) =>
      clearAllSeamEdges(document, bridge), { applySelection: false })
  }

  function selectedFaceIndices(): number[] | undefined {
    if (!activeMesh.value || selectedFaceIds.value.length === 0) return undefined
    const indices = selectedFaceIds.value
      .map(id => activeMesh.value!.faces.findIndex(face => face.id === id))
      .filter(index => index >= 0)
    return indices.length > 0 ? indices : undefined
  }

  function performSmartUvProject(options: SmartUvProjectOptions = {}) {
    const tools = useToolStore()
    const angle = Number.isFinite(Number(options.angleLimitDegrees))
      ? Number(options.angleLimitDegrees)
      : tools.smartUvAngle
    const margin = Number.isFinite(Number(options.marginPixels))
      ? Number(options.marginPixels)
      : tools.smartUvMargin
    const jobs = unwrapJobs(options.onlyFaceIndices)
    if (jobs.length === 0) return
    const selection = jobs.some(job => (job.faces?.length ?? 0) > 0)
    const scope = selection ? 'Selection' : jobs.length > 1 ? 'Objects' : 'Mesh'
    recordState(`Smart UV Project (${scope}, ${angle}°)`)
    for (const job of jobs) {
      const next = restorePinnedUvs(job.mesh, smartUvProject(job.mesh, {
        angleLimitDegrees: angle,
        marginPixels: margin,
        textureSize: options.textureSize ?? pixelBuffer.value.width,
        textureHeight: options.textureHeight ?? pixelBuffer.value.height,
        onlyFaceIndices: job.faces
      }))
      // Chart borders become seams so a later seam unwrap keeps these islands.
      next.seamEdgeIds = seamEdgesFromUvIslands(next, job.faces)
      replaceMesh(next, ATTRIBUTE_ONLY_CHANGE)
    }
  }

  function performSeamUnwrap(onlyFaceIndices?: number[]) {
    applyUnwrap(
      onlyFaceIndices,
      scope => `Unwrap Along Seams (${scope === 'selection' ? 'Selection' : scope === 'objects' ? 'Objects' : 'Mesh'})`,
      (mesh, faces) => {
        const next: MeshObject = JSON.parse(JSON.stringify(mesh))
        SeamUnwrapper.unwrapMesh(next, faces, pixelBuffer.value.width || 64, 2, pixelBuffer.value.height || pixelBuffer.value.width || 64)
        return next
      }
    )
  }

  function performProjectFromView(view: ViewProjection, onlyFaceIndices?: number[]) {
    applyUnwrap(
      onlyFaceIndices,
      scope => scope === 'selection' ? 'Project From View (Selection)' : scope === 'objects' ? 'Project From View (Objects)' : 'Project From View',
      (mesh, faces) => projectFromView(mesh, view, faces, pixelBuffer.value.width || 64, pixelBuffer.value.height || pixelBuffer.value.width || 64)
    )
  }

  /** Mark every UV island border (in the selection, or the whole mesh) as a seam. */
  function performSeamsFromIslands(onlyFaceIndices?: number[]) {
    if (!activeMesh.value || activeMesh.value.locked) return
    const faces = onlyFaceIndices && onlyFaceIndices.length > 0 ? onlyFaceIndices : selectedFaceIndices()
    const existing = new Set(activeMesh.value.seamEdgeIds || [])
    const toAdd = seamEdgesFromUvIslands(activeMesh.value, faces).filter(id => !existing.has(id))
    if (toAdd.length === 0) return
    return runKernelOperation('Seams from Islands', (document, bridge) =>
      setSeamEdges(document, toAdd, true, bridge), { applySelection: false })
  }

  /** Replace the active mesh's pinned UV corners (`faceId:vertexId`). */
  function setUvPins(keys: string[], label = 'Pin UVs') {
    const mesh = activeMesh.value
    if (!mesh) return
    const next = Array.from(new Set(keys))
    const current = mesh.uvPinKeys || []
    if (next.length === current.length && next.every(k => current.includes(k))) return
    recordState(label)
    if (next.length > 0) mesh.uvPinKeys = next
    else delete mesh.uvPinKeys
    triggerAutosave()
  }

  function performPackUVIslands(padding = 0.02, onlyFaceIndices?: number[]) {
    if (!activeMesh.value) return
    const faces = onlyFaceIndices && onlyFaceIndices.length > 0
      ? onlyFaceIndices
      : selectedFaceIndices()
    recordState(faces && faces.length > 0 ? 'Pack Selected UV Islands' : 'Pack UV Islands')
    const texSize = pixelBuffer.value.width || 64
    replaceMesh(packUVIslands(
      activeMesh.value,
      Number.isFinite(padding) && padding >= 1 ? padding : Math.round(padding * texSize),
      texSize,
      faces,
      pixelBuffer.value.height
    ), ATTRIBUTE_ONLY_CHANGE)
  }

  function performApplyTexelDensity(targetDensity: number, faceIndices?: number[]) {
    if (!activeMesh.value || targetDensity <= 0) return
    recordState(`Set Texel Density (${targetDensity} px/unit)`)
    const texSize = activeTexture.value?.width || 64
    const indices = faceIndices !== undefined ? faceIndices : (
      selectedFaceIds.value.length > 0
        ? selectedFaceIds.value.map(id => activeMesh.value!.faces.findIndex(f => f.id === id)).filter(idx => idx >= 0)
        : undefined
    )
    const updated = applyTargetTexelDensity(activeMesh.value, targetDensity, texSize, indices)
    replaceMesh(updated, ATTRIBUTE_ONLY_CHANGE)
  }

  function performEqualizeTexelDensity() {
    if (!activeMesh.value) return
    recordState('Equalize Texel Density')
    const updated = equalizeTexelDensity(activeMesh.value)
    replaceMesh(updated, ATTRIBUTE_ONLY_CHANGE)
  }

  /**
   * Explicit face indices unwrap just those faces on the active mesh.
   * An empty array unwraps every face of the active mesh.
   * Omitted: selected faces, edges, or vertices; in object mode, every selected object.
   */
  function unwrapJobs(onlyFaceIndices?: number[]): { mesh: MeshObject; faces?: number[] }[] {
    const explicit = Array.isArray(onlyFaceIndices)
    if (explicit) {
      if (!activeMesh.value || activeMesh.value.locked) return []
      return onlyFaceIndices.length > 0
        ? [{ mesh: activeMesh.value, faces: onlyFaceIndices }]
        : [{ mesh: activeMesh.value }]
    }

    const tools = useToolStore()
    if (tools.selectMode === 'object' && tools.appMode !== 'uvpaint') {
      const ids = selectedMeshIds.value.length > 0 ? selectedMeshIds.value : [activeMeshId.value]
      const list = meshes.value.filter(mesh => ids.includes(mesh.id) && !mesh.locked && mesh.faces.length > 0)
      if (list.length > 0) return list.map(mesh => ({ mesh }))
    }

    if (!activeMesh.value || activeMesh.value.locked) return []
    const faceIds = incidentFacesFromSelection()
    if (faceIds.length === 0) return [{ mesh: activeMesh.value }]
    const faces = faceIds
      .map(id => activeMesh.value!.faces.findIndex(face => face.id === id))
      .filter(index => index >= 0)
    return faces.length > 0 ? [{ mesh: activeMesh.value, faces }] : [{ mesh: activeMesh.value }]
  }

  function applyUnwrap(
    onlyFaceIndices: number[] | undefined,
    label: (scope: 'selection' | 'mesh' | 'objects') => string,
    op: (mesh: MeshObject, faces?: number[]) => MeshObject
  ) {
    const jobs = unwrapJobs(onlyFaceIndices)
    if (jobs.length === 0) return
    const selection = jobs.some(job => (job.faces?.length ?? 0) > 0)
    const scope = selection ? 'selection' : jobs.length > 1 ? 'objects' : 'mesh'
    recordState(label(scope))
    for (const job of jobs) replaceMesh(restorePinnedUvs(job.mesh, op(job.mesh, job.faces)), ATTRIBUTE_ONLY_CHANGE)
  }

  function performBoxUnwrap(onlyFaceIndices?: number[]) {
    applyUnwrap(
      onlyFaceIndices,
      scope => scope === 'selection' ? 'Box Unwrap (Selection)' : scope === 'objects' ? 'Box UV Projection (Objects)' : 'Box UV Projection',
      (mesh, faces) => boxUnwrap(mesh, faces)
    )
  }

  function generateBoxUVs() {
    performBoxUnwrap()
  }

  function performPlanarUnwrap(axis: 'x' | 'y' | 'z' = 'z', onlyFaceIndices?: number[]) {
    applyUnwrap(
      onlyFaceIndices,
      scope => `Planar Unwrap (${axis.toUpperCase()}${scope === 'selection' ? ', Selection' : scope === 'objects' ? ', Objects' : ''})`,
      (mesh, faces) => planarUnwrap(mesh, axis, faces)
    )
  }

  function performCylinderUnwrap(onlyFaceIndices?: number[]) {
    applyUnwrap(onlyFaceIndices, scope => scope === 'selection' ? 'Cylindrical Unwrap (Selection)' : scope === 'objects' ? 'Cylindrical Unwrap (Objects)' : 'Cylindrical Unwrap', (mesh, faces) => cylinderUnwrap(mesh, faces))
  }

  function performSphereUnwrap(onlyFaceIndices?: number[]) {
    applyUnwrap(onlyFaceIndices, scope => scope === 'selection' ? 'Spherical Unwrap (Selection)' : scope === 'objects' ? 'Spherical Unwrap (Objects)' : 'Spherical Unwrap', (mesh, faces) => sphereUnwrap(mesh, faces))
  }

  function performConeUnwrap(onlyFaceIndices?: number[]) {
    applyUnwrap(onlyFaceIndices, scope => scope === 'selection' ? 'Conical Fan Unwrap (Selection)' : scope === 'objects' ? 'Conical Fan Unwrap (Objects)' : 'Conical Fan Unwrap', (mesh, faces) => coneUnwrap(mesh, faces))
  }

  function performCubemapCrossUnwrap(onlyFaceIndices?: number[]) {
    applyUnwrap(onlyFaceIndices, scope => scope === 'selection' ? 'Cubemap Cross Unwrap (Selection)' : scope === 'objects' ? 'Cubemap Cross Unwrap (Objects)' : 'Cubemap Cross Unwrap', (mesh, faces) => cubemapCrossUnwrap(mesh, faces))
  }

  function performGridifyUvQuads(onlyFaceIndices?: number[]) {
    applyUnwrap(onlyFaceIndices, scope => scope === 'selection' ? 'Gridify Quad Loops (Selection)' : scope === 'objects' ? 'Gridify Quad Loops (Objects)' : 'Gridify Quad Loops', (mesh, faces) => gridifyQuadIslands(mesh, faces))
  }

  function bakeSceneAtlas(padding = 2) {
    if (meshes.value.length === 0) return
    recordPixels('Bake Scene Texture Atlas')
    try {
      const result = AtlasBaker.bakeSceneAtlas(
        meshes.value,
        textures.value,
        materials.value,
        padding
      )

      textures.value.push(result.atlasTexture)
      materials.value.push(result.atlasMaterial)
      activeTextureId.value = result.atlasTexture.id
      meshes.value = result.remappedMeshes
      markTextureUpdated()
      markGeometryUpdated()
    } catch (e: any) {
      console.error('Atlas Bake Error:', e)
    }
  }

  // ----------------------------------------------------
  // OBJECT ORIGIN / PIVOT OPERATIONS
  // ----------------------------------------------------
  function offsetMeshOrigin(meshId: string, dx: number, dy: number, dz: number, actionName = 'Set Origin', options?: { record?: boolean }) {
    const mesh = meshes.value.find(m => m.id === meshId)
    if (!mesh) return
    if (options?.record !== false) recordState(actionName)

    for (const v of mesh.vertices) {
      v.position.x -= dx
      v.position.y -= dy
      v.position.z -= dz
    }
    mesh.position.x += dx
    mesh.position.y += dy
    mesh.position.z += dz

    markGeometryUpdated()
  }

  function setOriginToPreset(
    meshId: string, 
    preset: 'center' | 'bottom' | 'top' | 'min_x' | 'max_x' | 'min_z' | 'max_z' | 'world_zero' | 'selection'
  ) {
    const mesh = meshes.value.find(m => m.id === meshId)
    if (!mesh || mesh.vertices.length === 0) return

    if (preset === 'world_zero') {
      offsetMeshOrigin(meshId, -mesh.position.x, -mesh.position.y, -mesh.position.z, 'Origin to World (0,0,0)')
      return
    }

    if (preset === 'selection') {
      let targetVerts: Vector3D[] = []
      if (selectedVertexIds.value.length > 0) {
        targetVerts = mesh.vertices.filter(v => selectedVertexIds.value.includes(v.id)).map(v => v.position)
      } else if (selectedEdgeIds.value.length > 0) {
        const allEdges = getMeshEdges(mesh)
        const vertMap = new Map(mesh.vertices.map(v => [v.id, v]))
        for (const e of allEdges) {
          if (selectedEdgeIds.value.includes(e.id)) {
            const v1 = vertMap.get(e.v1)
            const v2 = vertMap.get(e.v2)
            if (v1) targetVerts.push(v1.position)
            if (v2) targetVerts.push(v2.position)
          }
        }
      } else if (selectedFaceIds.value.length > 0) {
        const vertMap = new Map(mesh.vertices.map(v => [v.id, v]))
        for (const f of mesh.faces) {
          if (selectedFaceIds.value.includes(f.id)) {
            f.vertexIds.forEach(id => {
              const v = vertMap.get(id)
              if (v) targetVerts.push(v.position)
            })
          }
        }
      }

      if (targetVerts.length > 0) {
        const centroid = computeCentroid(targetVerts)
        offsetMeshOrigin(meshId, centroid.x, centroid.y, centroid.z, 'Origin to Selection')
        return
      }
    }

    // Bounding Box calculations
    let minX = Infinity, maxX = -Infinity
    let minY = Infinity, maxY = -Infinity
    let minZ = Infinity, maxZ = -Infinity

    for (const v of mesh.vertices) {
      if (v.position.x < minX) minX = v.position.x
      if (v.position.x > maxX) maxX = v.position.x
      if (v.position.y < minY) minY = v.position.y
      if (v.position.y > maxY) maxY = v.position.y
      if (v.position.z < minZ) minZ = v.position.z
      if (v.position.z > maxZ) maxZ = v.position.z
    }

    const midX = (minX + maxX) / 2
    const midY = (minY + maxY) / 2
    const midZ = (minZ + maxZ) / 2

    let targetX = midX
    let targetY = midY
    let targetZ = midZ
    let label = 'Origin to Center'

    if (preset === 'bottom') {
      targetY = minY
      label = 'Origin to Bottom'
    } else if (preset === 'top') {
      targetY = maxY
      label = 'Origin to Top'
    } else if (preset === 'min_x') {
      targetX = minX
      label = 'Origin to Left (-X)'
    } else if (preset === 'max_x') {
      targetX = maxX
      label = 'Origin to Right (+X)'
    } else if (preset === 'min_z') {
      targetZ = minZ
      label = 'Origin to Front (-Z)'
    } else if (preset === 'max_z') {
      targetZ = maxZ
      label = 'Origin to Back (+Z)'
    }

    offsetMeshOrigin(meshId, targetX, targetY, targetZ, label)
  }

  function setGeometryToOrigin(meshId: string) {
    const mesh = meshes.value.find(m => m.id === meshId)
    if (!mesh || mesh.vertices.length === 0) return
    recordState('Geometry to Origin')

    let cx = 0, cy = 0, cz = 0
    for (const v of mesh.vertices) {
      cx += v.position.x
      cy += v.position.y
      cz += v.position.z
    }
    cx /= mesh.vertices.length
    cy /= mesh.vertices.length
    cz /= mesh.vertices.length

    for (const v of mesh.vertices) {
      v.position.x -= cx
      v.position.y -= cy
      v.position.z -= cz
    }

    markGeometryUpdated()
  }

  return {
    projectName,
    meshes,
    activeMeshId,
    activeMesh,
    selectedMeshIds,
    selectedVertexIds,
    selectedEdgeIds,
    selectedFaceIds,
    activePalette,
    palettes,
    activePaletteId,
    selectPalette,
    createPalette,
    applyPaletteToTexture,
    applyPaletteToAllTextures,
    extractPaletteFromActiveTexture,
    deletePalette,
    pixelBuffer,
    activeTextureId,
    activeTexture,
    activeMaterialId,
    activeMaterial,
    textureRevision,
    textures,
    materials,
    stats,
    clipboard,
    selectMesh,
    selectMeshes,
    createMesh,
    createImageCard,
    applyDroppedImageToMesh,
    addPrimitive,
    addEditableMesh,
    referenceImages,
    referenceRevision,
    selectedReferenceId,
    addReferenceImage,
    setReferenceOnPlane,
    selectReference,
    updateReferenceImage,
    recordReferenceEdit,
    resetReferenceImageTransform,
    removeReferenceImage,
    parentMesh,
    unparentMesh,
    getMeshChildren,
    isDescendantOf,
    clearSubSelections,
    selectAll,
    deselectAll,
    copySelection,
    pasteClipboard,
    duplicateSelection,
    performFlipAxis,
    performApplyRotationScale,
    bakeObjectRotationScale,
    performMakeUnique,
    performAlign,
    performRotateObject,
    performDuplicateMirror,
    performMirror,
    performLinearArray,
    performRadialArray,
    performInstanceDuplicate,
    performSnap,
    performExtrude,
    performInset,
    performBevel,
    performSubdivide,
    performSimpleSubdivide,
    performCatmullClark,
    performSpherize,
    performPokeFaces,
    performTriangulate,
    performMerge,
    performSplitEdges,
    performFillFace,
    performFlatten,
    performStraighten,
    performSeparateMesh,
    performJoinMeshes,
    performFlipNormals,
    performBridgeEdges,
    performGridFill,
    performDelete,
    deleteMesh,
    deleteSelectedMeshes,
    performDissolve,
    performConnectVertices,
    performCleanupMesh,
    performFlipEdge,
    performRecalculateOutside,
    performTrisToQuads,
    performMakePlanar,
    performFillHoles,
    performLimitedDissolve,
    performDeleteOnlyFaces,
    performDeleteOnlyEdges,
    performRip,
    performSplit,
    performVertexBevel,
    performSolidifyFaces,
    performLathe,
    performShell,
    performSymmetrize,
    performSmoothVertices,
    performCircle,
    performRandomizeVertices,
    performUnsubdivide,
    performDecimate,
    performBoolean,
    performKnifeProject,
    performSeparateByLooseParts,
    performSeparateByMaterial,
    addModifier,
    applyMeshModifier,
    removeMeshModifier,
    growSelection,
    selectInverse,
    shrinkSelection,
    selectConnected,
    replaceMesh,
    acquireEditableMesh,
    holdEditableMesh,
    releaseEditableMesh,
    publishEditableMesh,
    meshEditError,
    validateEditableMesh,
    setShadeMode,
    setAutoSmoothAngle,
    toggleShadeMode,
    geometryRevision,
    markGeometryUpdated,
    markObjectTransformUpdated,
    meshRevision,
    invalidateAllGeometryRevisions,
    captureResidentMeshes,
    restoreResidentMeshes,
    clearResidentMeshes,
    markTexturePreview,
    markTextureUpdated,
    selectTexture,
    ensureTextureBuffer,
    selectMaterial,
    setMaterialFill,
    setMaterialTextureTiling,
    syncPaintTargetFromMesh,
    countMeshesUsingMaterial,
    isMaterialShared,
    createTexture,
    addTexture,
    duplicateTexture,
    renameTexture,
    deleteTexture,
    setTextureAtlasGrid,
    clearTextureAtlasGrid,
    sliceTextureIntoTiles,
    performMapUVsToAtlasCell,
    getTextureForMaterial,
    getTextureById,
    applyTextureToMaterial,
    assignTextureToMaterial,
    applyTextureToAllMaterials,
    unbindTextureFromMaterial,
    applyTextureToMesh,
    createMaterial,
    addMaterial,
    duplicateMaterial,
    renameMaterial,
    purgeUnusedMaterials,
    forkTextureForMesh,
    deleteMaterial,
    applyMaterialToMesh,
    forkMaterialForMesh,
    assignMaterialToActiveMesh,
    assignMaterialToSelectedMeshes,
    assignTextureToActiveMesh,
    makeActiveMeshMaterialUnique,
    defaultTexturePref,
    setDefaultTexturePref,
    restoreDefaultTexture,
    generateRetroAtlasOnActive,
    resetToDefaultProject,
    markSelectedEdgesAsSeam,
    clearSelectedEdgesSeam,
    markSelectedEdgesSharp,
    clearSelectedEdgesSharp,
    clearAllSeams,
    performSmartUvProject,
    performSeamUnwrap,
    performProjectFromView,
    performSeamsFromIslands,
    setUvPins,
    performPackUVIslands,
    performApplyTexelDensity,
    performEqualizeTexelDensity,
    generateBoxUVs,
    performBoxUnwrap,
    performPlanarUnwrap,
    performCylinderUnwrap,
    performSphereUnwrap,
    performConeUnwrap,
    performCubemapCrossUnwrap,
    performGridifyUvQuads,
    bakeSceneAtlas,
    offsetMeshOrigin,
    centerMeshOrigin,
    setOriginToPreset,
    setGeometryToOrigin,
    selectEdgeLoop,
    selectEdgeRing,
    selectBoundaryEdges,
    selectNonManifoldEdges,
    selectSharpEdges,
    performAutoMerge,
    recordState,
    recordPixels,
    hasAutosaveSession,
    autosaveRecord,
    showRecoveryBanner,
    documentRecoveryEnabled,
    setDocumentRecoveryEnabled,
    checkAutosaveSession,
    restoreAutosaveSession,
    dismissRecoverySession,
    discardRecoverySession,
    triggerAutosave,
  }
})
