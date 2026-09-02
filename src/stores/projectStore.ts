import { defineStore } from 'pinia'
import { ref, computed, markRaw } from 'vue'
import { MeshObject, Vertex, Face, MeshShadeMode } from '../types/mesh'
import { Material, Palette, TextureMap, TextureApplyPolicy } from '../types/texture'
import { SelectMode } from '../types/tools'
import { createCube } from '../core/geometry/Primitives'
import { 
  extrudeFaces, 
  insetFaces, 
  bevelFaces, 
  subdivideFaces, 
  mergeVerticesAdvanced,
  fillFaceFromVertices,
  flattenVerticesOnAxis,
  dissolveElements,
  connectTwoVertices,
  cleanupMeshGeometry,
  bridgeEdgeLoops,
  gridFill,
  flipNormals, 
  deleteElements 
} from '../core/geometry/Operations'
import { getMeshEdges, getEdgeLoop, getEdgeRing } from '../core/geometry/EdgeUtils'
import { DEFAULT_PALETTES, loadCustomPalettes, saveCustomPalettes } from '../utils/color'
import { PixelBuffer } from '../core/painting/PixelCanvas'
import { generateRetroAtlas } from '../core/painting/DefaultTextures'
import { PrimitiveType, PrimitiveParameters } from '../core/primitives/PrimitiveTypes'
import { PrimitiveBuilder } from '../core/primitives/PrimitiveBuilder'
import { MeshBridge } from '../core/mesh/MeshBridge'
import { EditableMesh } from '../core/mesh/MeshKernel'
import { SeamUnwrapper } from '../core/uv/SeamUnwrapper'
import { UVIslandPacker } from '../core/uv/UVIslandPacker'
import { AtlasBaker } from '../core/uv/AtlasBaker'
import { clampAtlasGrid, mapFacesToAtlasCell, sliceBufferIntoTiles } from '../core/uv/AtlasCells'
import { applyTargetTexelDensity, equalizeTexelDensity } from '../core/geometry/UVUnwrap'
import {
  applyModifier,
  defaultMirrorModifier,
  defaultSolidifyModifier,
  defaultSubdivisionModifier
} from '../core/geometry/Modifiers'
import { computeFaceNormal, computeCentroid } from '../utils/math'
import { Vector3D, PrimitiveTransform } from '../types/mesh'
import { ReferenceImage, ReferencePlane } from '../types/reference'
import { useHistoryStore } from './historyStore'
import { useAnimationStore } from './animationStore'
import { ProjectStorage, type ProjectStorageData } from '../core/storage/ProjectStorage'

export const useProjectStore = defineStore('project', () => {
  const historyStore = useHistoryStore()

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
  const activeTextureId = ref<string>('tex_default')
  const referenceImages = ref<ReferenceImage[]>([])
  const referenceRevision = ref<number>(0)
  const selectedReferenceId = ref<string>('')

  // Create default 64x64 pixel buffer atlas
  const defaultBuffer = new PixelBuffer(64, 64)
  generateRetroAtlas(defaultBuffer)

  const textures = ref<TextureMap[]>([
    {
      id: 'tex_default',
      name: 'Texture_Atlas_64x64',
      width: 64,
      height: 64,
      dataUrl: defaultBuffer.toDataURL(),
      pixelBuffer: markRaw(defaultBuffer),
      atlas: { cols: 2, rows: 2 }
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
      color: '#ffffff',
      shading: 'textured', // Standard clean textured shading by default
      psxJitter: false,
      psxJitterResolution: 240,
      psxAffine: false,
      dither: false,
      ditherLevel: 32,
      wireframe: false
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
  function recordState(desc: string) {
    historyStore.recordState(desc)
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
    let cur = meshes.value.find(m => m.id === potentialAncestorId)
    while (cur && cur.parentId) {
      if (cur.parentId === childId) return true
      cur = meshes.value.find(m => m.id === cur!.parentId)
    }
    return false
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
    meshes.value.push(obj)
    selectMesh(obj.id)
    clearSubSelections()
    markGeometryUpdated()
    return obj
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
  function performExtrude(distance = 0.5) {
    if (!activeMesh.value || selectedFaceIds.value.length === 0) return
    recordState('Extrude Face(s)')
    const result = extrudeFaces(activeMesh.value, selectedFaceIds.value, distance)
    selectedFaceIds.value = result.selectedFaceIds
    selectedVertexIds.value = result.selectedVertexIds
    replaceMesh(result.mesh)
  }

  function performInset(thickness = 0.1) {
    if (!activeMesh.value || selectedFaceIds.value.length === 0) return
    recordState('Inset Faces')
    const result = insetFaces(activeMesh.value, selectedFaceIds.value, thickness)
    selectedFaceIds.value = result.selectedFaceIds
    selectedVertexIds.value = result.selectedVertexIds
    replaceMesh(result.mesh)
  }

  function performBevel(offset = 0.2) {
    if (!activeMesh.value) return
    let targetFaceIds = [...selectedFaceIds.value]
    if (targetFaceIds.length === 0 && selectedEdgeIds.value.length > 0) {
      const selectedEdges = getMeshEdges(activeMesh.value).filter(e => selectedEdgeIds.value.includes(e.id))
      targetFaceIds = activeMesh.value.faces
        .filter(face => selectedEdges.some(edge => face.vertexIds.includes(edge.v1) && face.vertexIds.includes(edge.v2)))
        .map(face => face.id)
    }
    if (targetFaceIds.length === 0) return
    recordState('Bevel Face(s)')
    const result = bevelFaces(activeMesh.value, targetFaceIds, offset)
    selectedFaceIds.value = result.selectedFaceIds
    selectedVertexIds.value = result.selectedVertexIds
    replaceMesh(result.mesh)
  }

  function performSubdivide(mode?: 'vertex' | 'edge' | 'face') {
    if (!activeMesh.value) return
    let targetFaceIds = [...selectedFaceIds.value]

    if (mode === 'edge' && selectedEdgeIds.value.length > 0) {
      const selectedEdges = getMeshEdges(activeMesh.value).filter(e => selectedEdgeIds.value.includes(e.id))
      targetFaceIds = activeMesh.value.faces
        .filter(face => selectedEdges.some(edge => face.vertexIds.includes(edge.v1) && face.vertexIds.includes(edge.v2)))
        .map(face => face.id)
    } else if (mode === 'vertex' && selectedVertexIds.value.length > 0) {
      targetFaceIds = activeMesh.value.faces
        .filter(face => face.vertexIds.some(id => selectedVertexIds.value.includes(id)))
        .map(face => face.id)
    }

    if (mode && targetFaceIds.length === 0) return
    if (targetFaceIds.length === 0) targetFaceIds = activeMesh.value.faces.map(f => f.id)

    recordState('Subdivide')
    const result = subdivideFaces(activeMesh.value, targetFaceIds)
    selectedFaceIds.value = result.selectedFaceIds
    replaceMesh(result.mesh)
  }

  function performMerge(type: 'center' | 'first' | 'last' | 'distance' = 'center', threshold = 0.05) {
    if (!activeMesh.value) return
    let targetVertIds = [...selectedVertexIds.value]
    if (targetVertIds.length < 2 && selectedEdgeIds.value.length > 0) {
      const selectedEdges = getMeshEdges(activeMesh.value).filter(e => selectedEdgeIds.value.includes(e.id))
      targetVertIds = Array.from(new Set(selectedEdges.flatMap(edge => [edge.v1, edge.v2])))
    }
    if (type !== 'distance' && targetVertIds.length < 2) return
    recordState(`Merge Vertices (${type})`)
    const result = mergeVerticesAdvanced(activeMesh.value, targetVertIds, type, threshold)
    selectedVertexIds.value = result.selectedVertexIds
    replaceMesh(result.mesh)
  }

  function performFillFace(viewDirection?: { x: number; y: number; z: number }) {
    if (!activeMesh.value) return
    let boundaryVertexIds = [...selectedVertexIds.value]
    if (boundaryVertexIds.length < 3 && selectedEdgeIds.value.length > 0) {
      const selectedEdges = getMeshEdges(activeMesh.value).filter(e => selectedEdgeIds.value.includes(e.id))
      boundaryVertexIds = Array.from(new Set(selectedEdges.flatMap(edge => [edge.v1, edge.v2])))
    }
    if (boundaryVertexIds.length === 2) {
      recordState('Split Face')
      const result = connectTwoVertices(activeMesh.value, boundaryVertexIds[0], boundaryVertexIds[1])
      selectedFaceIds.value = result.selectedFaceIds
      replaceMesh(result.mesh)
      return
    }
    if (boundaryVertexIds.length < 3) return
    recordState('Fill Face (F)')
    const result = fillFaceFromVertices(activeMesh.value, boundaryVertexIds, viewDirection)
    selectedFaceIds.value = result.selectedFaceIds
    replaceMesh(result.mesh)
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
    recordState(`Flatten on ${axis.toUpperCase()}`)
    const result = flattenVerticesOnAxis(activeMesh.value, targetVertIds, axis)
    replaceMesh(result.mesh)
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

    recordState('Separate Selection')
    const sourceMesh = activeMesh.value
    const facesToMove = sourceMesh.faces.filter(f => targetFaceIds.includes(f.id))
    const usedVertIds = new Set(facesToMove.flatMap(f => f.vertexIds))
    const vertsToMove = sourceMesh.vertices.filter(v => usedVertIds.has(v.id))

    // Create new detached mesh
    const newMesh: MeshObject = {
      id: `mesh_sep_${Date.now()}`,
      name: `${sourceMesh.name}_Separated`,
      visible: true,
      locked: false,
      position: { ...sourceMesh.position },
      rotation: { ...sourceMesh.rotation },
      scale: { ...sourceMesh.scale },
      materialId: sourceMesh.materialId,
      shadeMode: sourceMesh.shadeMode,
      autoSmoothAngle: sourceMesh.autoSmoothAngle,
      vertices: JSON.parse(JSON.stringify(vertsToMove)),
      faces: JSON.parse(JSON.stringify(facesToMove))
    }

    // Remove from source mesh
    sourceMesh.faces = sourceMesh.faces.filter(f => !targetFaceIds.includes(f.id))
    const remainingUsedVerts = new Set(sourceMesh.faces.flatMap(f => f.vertexIds))
    sourceMesh.vertices = sourceMesh.vertices.filter(v => remainingUsedVerts.has(v.id))

    meshes.value.push(newMesh)
    activeMeshId.value = newMesh.id
    clearSubSelections()
    markGeometryUpdated()
  }

  function performJoinMeshes() {
    const targetMeshes = meshes.value.filter(m => selectedMeshIds.value.includes(m.id))
    if (targetMeshes.length < 2) return
    recordState('Join Meshes (Ctrl+J)')

    const primary = targetMeshes[0]
    const otherMeshes = targetMeshes.slice(1)

    for (const other of otherMeshes) {
      const vertIdMap = new Map<string, string>()

      for (const v of other.vertices) {
        const newVId = `v_join_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
        vertIdMap.set(v.id, newVId)
        // Transform vertex to primary space offset
        primary.vertices.push({
          id: newVId,
          position: {
            x: v.position.x + (other.position.x - primary.position.x),
            y: v.position.y + (other.position.y - primary.position.y),
            z: v.position.z + (other.position.z - primary.position.z)
          },
          color: v.color,
          selected: false
        })
      }

      for (const f of other.faces) {
        const newFId = `f_join_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
        primary.faces.push({
          id: newFId,
          vertexIds: f.vertexIds.map(vid => vertIdMap.get(vid) || vid),
          uvs: JSON.parse(JSON.stringify(f.uvs)),
          normal: f.normal ? { ...f.normal } : undefined,
          materialIndex: f.materialIndex,
          selected: false
        })
      }
    }

    meshes.value = meshes.value.filter(m => !otherMeshes.some(o => o.id === m.id))
    selectedMeshIds.value = [primary.id]
    activeMeshId.value = primary.id
    markGeometryUpdated()
  }

  function performFlipNormals() {
    if (!activeMesh.value) return
    recordState('Flip Normals')
    const targetFaceIds = selectedFaceIds.value.length > 0 ? selectedFaceIds.value : activeMesh.value.faces.map(f => f.id)
    const result = flipNormals(activeMesh.value, targetFaceIds)
    replaceMesh(result.mesh)
  }

  function performBridgeEdges() {
    if (!activeMesh.value || selectedEdgeIds.value.length < 2) return
    recordState('Bridge Edge Loops')
    const result = bridgeEdgeLoops(activeMesh.value, selectedEdgeIds.value)
    replaceMesh(result.mesh)
  }

  function performGridFill() {
    if (!activeMesh.value) return
    let boundaryVertexIds = [...selectedVertexIds.value]
    if (boundaryVertexIds.length < 4 && selectedEdgeIds.value.length > 0) {
      const selectedEdges = getMeshEdges(activeMesh.value).filter(e => selectedEdgeIds.value.includes(e.id))
      boundaryVertexIds = Array.from(new Set(selectedEdges.flatMap(edge => [edge.v1, edge.v2])))
    }
    if (boundaryVertexIds.length < 4) return
    recordState('Grid Fill')
    const result = gridFill(activeMesh.value, boundaryVertexIds)
    replaceMesh(result.mesh)
  }

  function deleteMesh(id: string) {
    if (meshes.value.length <= 1) return
    recordState('Delete Mesh')
    meshes.value = meshes.value.filter(m => m.id !== id)
    if (activeMeshId.value === id) {
      activeMeshId.value = meshes.value[0]?.id || ''
    }
    selectedMeshIds.value = selectedMeshIds.value.filter(mId => mId !== id)
    markGeometryUpdated()
  }

  function deleteSelectedMeshes() {
    if (meshes.value.length <= 1) return
    recordState('Delete Selected Meshes')
    meshes.value = meshes.value.filter(m => !selectedMeshIds.value.includes(m.id))
    if (meshes.value.length === 0) {
      meshes.value = [createCube('Cube_1', 2)]
    }
    activeMeshId.value = meshes.value[0]?.id || ''
    selectedMeshIds.value = [activeMeshId.value]
    clearSubSelections()
    markGeometryUpdated()
  }

  function performDelete(mode: 'vertex' | 'edge' | 'face' | 'object') {
    if (mode === 'object') {
      deleteSelectedMeshes()
      return
    }
    if (!activeMesh.value) return
    recordState(`Delete ${mode}`)
    const ids = mode === 'face' ? selectedFaceIds.value : (mode === 'edge' ? selectedEdgeIds.value : selectedVertexIds.value)
    const result = deleteElements(activeMesh.value, mode, ids)
    clearSubSelections()
    replaceMesh(result.mesh)
  }

  function performDissolve(mode: 'vertex' | 'edge') {
    if (!activeMesh.value) return
    recordState(`Dissolve ${mode}`)
    const ids = mode === 'edge' ? selectedEdgeIds.value : selectedVertexIds.value
    const result = dissolveElements(activeMesh.value, mode, ids)
    clearSubSelections()
    replaceMesh(result.mesh)
  }

  function performConnectVertices() {
    if (!activeMesh.value || selectedVertexIds.value.length !== 2) return
    recordState('Connect Vertices (J)')
    const result = connectTwoVertices(activeMesh.value, selectedVertexIds.value[0], selectedVertexIds.value[1])
    replaceMesh(result.mesh)
  }

  function performCleanupMesh() {
    if (!activeMesh.value) return
    recordState('Clean Mesh')
    const result = cleanupMeshGeometry(activeMesh.value)
    replaceMesh(result.mesh)
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
    recordState(type === 'all' ? 'Apply All Modifiers' : `Apply ${type} Modifier`)
    applyModifier(activeMesh.value, type)
    markGeometryUpdated()
  }

  function removeMeshModifier(type: GenerateModifier) {
    if (!activeMesh.value) return
    recordState(`Remove ${type} Modifier`)
    if (type === 'mirror') delete activeMesh.value.mirror
    else if (type === 'subdivision') delete activeMesh.value.subdivision
    else delete activeMesh.value.solidify
    markGeometryUpdated()
  }

  function replaceMesh(newMesh: MeshObject) {
    const idx = meshes.value.findIndex(m => m.id === newMesh.id)
    if (idx !== -1) {
      meshes.value[idx] = newMesh
      markGeometryUpdated()
    }
  }

  // Selection Helpers
  function selectAll(mode: SelectMode = 'object') {
    if (mode === 'object') {
      selectedMeshIds.value = meshes.value.map(m => m.id)
      if (!activeMeshId.value && meshes.value.length > 0) {
        activeMeshId.value = meshes.value[0].id
      }
    } else if (mode === 'vertex' && activeMesh.value) {
      selectedVertexIds.value = activeMesh.value.vertices.map(v => v.id)
      activeMesh.value.vertices.forEach(v => (v.selected = true))
    } else if (mode === 'edge' && activeMesh.value) {
      selectedEdgeIds.value = getMeshEdges(activeMesh.value).map(e => e.id)
    } else if (mode === 'face' && activeMesh.value) {
      selectedFaceIds.value = activeMesh.value.faces.map(f => f.id)
      activeMesh.value.faces.forEach(f => (f.selected = true))
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

  function growSelection(mode: SelectMode) {
    if (!activeMesh.value) return
    if (mode === 'vertex') {
      const neighborVerts = new Set<string>(selectedVertexIds.value)
      for (const face of activeMesh.value.faces) {
        if (face.vertexIds.some(v => selectedVertexIds.value.includes(v))) {
          face.vertexIds.forEach(v => neighborVerts.add(v))
        }
      }
      selectedVertexIds.value = Array.from(neighborVerts)
    } else if (mode === 'face') {
      const neighborFaces = new Set<string>(selectedFaceIds.value)
      const selectedVerts = new Set<string>()
      for (const face of activeMesh.value.faces) {
        if (selectedFaceIds.value.includes(face.id)) {
          face.vertexIds.forEach(v => selectedVerts.add(v))
        }
      }
      for (const face of activeMesh.value.faces) {
        if (face.vertexIds.some(v => selectedVerts.has(v))) {
          neighborFaces.add(face.id)
        }
      }
      selectedFaceIds.value = Array.from(neighborFaces)
    }
  }

  function shrinkSelection(mode: SelectMode) {
    if (!activeMesh.value) return
    if (mode === 'vertex') {
      const boundaryVerts = new Set<string>()
      for (const face of activeMesh.value.faces) {
        const containsSelected = face.vertexIds.some(v => selectedVertexIds.value.includes(v))
        const containsUnselected = face.vertexIds.some(v => !selectedVertexIds.value.includes(v))
        if (containsSelected && containsUnselected) {
          face.vertexIds.forEach(v => {
            if (selectedVertexIds.value.includes(v)) boundaryVerts.add(v)
          })
        }
      }
      selectedVertexIds.value = selectedVertexIds.value.filter(v => !boundaryVerts.has(v))
    } else if (mode === 'face') {
      const boundaryFaces = new Set<string>()
      for (const face of activeMesh.value.faces) {
        if (!selectedFaceIds.value.includes(face.id)) continue
        for (const other of activeMesh.value.faces) {
          if (!selectedFaceIds.value.includes(other.id)) {
            if (other.vertexIds.some(v => face.vertexIds.includes(v))) {
              boundaryFaces.add(face.id)
              break
            }
          }
        }
      }
      selectedFaceIds.value = selectedFaceIds.value.filter(f => !boundaryFaces.has(f))
    }
  }

  function selectConnected(mode: SelectMode) {
    if (!activeMesh.value) return
    if (mode === 'vertex' && selectedVertexIds.value.length > 0) {
      const visited = new Set<string>(selectedVertexIds.value)
      const queue = [...selectedVertexIds.value]
      while (queue.length > 0) {
        const curr = queue.shift()!
        for (const face of activeMesh.value.faces) {
          if (face.vertexIds.includes(curr)) {
            for (const v of face.vertexIds) {
              if (!visited.has(v)) {
                visited.add(v)
                queue.push(v)
              }
            }
          }
        }
      }
      selectedVertexIds.value = Array.from(visited)
    } else if (mode === 'edge' && selectedEdgeIds.value.length > 0) {
      const allEdges = getMeshEdges(activeMesh.value)
      const edgeMap = new Map<string, { v1: string; v2: string }>()
      for (const e of allEdges) edgeMap.set(e.id, { v1: e.v1, v2: e.v2 })
      
      const visitedVerts = new Set<string>()
      for (const eId of selectedEdgeIds.value) {
        const e = edgeMap.get(eId)
        if (e) {
          visitedVerts.add(e.v1)
          visitedVerts.add(e.v2)
        }
      }
      const queue = Array.from(visitedVerts)
      while (queue.length > 0) {
        const curr = queue.shift()!
        for (const face of activeMesh.value.faces) {
          if (face.vertexIds.includes(curr)) {
            for (const v of face.vertexIds) {
              if (!visitedVerts.has(v)) {
                visitedVerts.add(v)
                queue.push(v)
              }
            }
          }
        }
      }
      selectedEdgeIds.value = allEdges
        .filter(e => visitedVerts.has(e.v1) && visitedVerts.has(e.v2))
        .map(e => e.id)
    } else if (mode === 'face' && selectedFaceIds.value.length > 0) {
      const visitedFaces = new Set<string>(selectedFaceIds.value)
      const queue = [...selectedFaceIds.value]
      while (queue.length > 0) {
        const currFId = queue.shift()!
        const currFace = activeMesh.value.faces.find(f => f.id === currFId)
        if (!currFace) continue
        for (const other of activeMesh.value.faces) {
          if (!visitedFaces.has(other.id) && other.vertexIds.some(v => currFace.vertexIds.includes(v))) {
            visitedFaces.add(other.id)
            queue.push(other.id)
          }
        }
      }
      selectedFaceIds.value = Array.from(visitedFaces)
    }
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

  function performAutoMerge(meshId: string, threshold = 0.01) {
    const mesh = meshes.value.find(m => m.id === meshId)
    if (!mesh) return
    const result = mergeVerticesAdvanced(mesh, mesh.vertices.map(v => v.id), 'distance', threshold)
    replaceMesh(result.mesh)
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

  const hasAutosaveSession = ref<boolean>(false)
  const autosaveRecord = ref<ProjectStorageData | null>(null)
  const showRecoveryBanner = ref<boolean>(false)
  const isRestoringSession = ref<boolean>(false)
  let autosaveTimer: any = null

  function triggerAutosave() {
    if (typeof window === 'undefined') return
    if (autosaveTimer) clearTimeout(autosaveTimer)
    autosaveTimer = setTimeout(async () => {
      if (isRestoringSession.value) return
      try {
        const animationStore = useAnimationStore()
        const textureData = textures.value.map(t => ({
          id: t.id,
          name: t.name,
          width: t.width,
          height: t.height,
          dataUrl: t.pixelBuffer ? t.pixelBuffer.canvas.toDataURL() : '',
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
      } catch (e) {
        console.warn('Autosave error:', e)
      }
    }, 1200)
  }

  async function checkAutosaveSession(): Promise<boolean> {
    const data = await ProjectStorage.loadProject()
    if (data && Array.isArray(data.meshes) && data.meshes.length > 0) {
      hasAutosaveSession.value = true
      autosaveRecord.value = data
      showRecoveryBanner.value = true
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
          if (t.id === 'tex_default' && (!t.dataUrl || t.dataUrl.length < 100)) {
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

      // Ensure default retro atlas texture is always available
      let defTex = textures.value.find(t => t.id === 'tex_default')
      if (!defTex) {
        const defBuf = new PixelBuffer(64, 64)
        generateRetroAtlas(defBuf)
        defTex = {
          id: 'tex_default',
          name: 'Texture_Atlas_64x64',
          width: 64,
          height: 64,
          dataUrl: defBuf.toDataURL(),
          pixelBuffer: markRaw(defBuf),
          atlas: { cols: 2, rows: 2 }
        }
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
      }

      clearSubSelections()
      markGeometryUpdated()
      markTextureUpdated()
      return true
    } finally {
      isRestoringSession.value = false
    }
  }

  function markGeometryUpdated() {
    geometryRevision.value++
    triggerAutosave()
  }

  /** Live stroke preview: bump revision so CanvasTextures refresh. No toDataURL / autosave. */
  function markTexturePreview() {
    textureRevision.value++
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
    if (record) recordState(`Add Texture (${name || 'untitled'})`)

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
    recordState(`Duplicate Texture (${src.name})`)
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
      recordState('Rename Texture')
      tex.name = newName.trim()
    }
  }

  function deleteTexture(id: string) {
    if (textures.value.length <= 1) return
    recordState('Delete Texture')
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
    const grid = clampAtlasGrid(cols, rows)
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
    recordState(`Slice Atlas ${tex.name} (${grid.cols}×${grid.rows})`)
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
      selectTexture(textureId)
      markTextureUpdated(textureId)
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
      shading: 'textured',
      psxJitter: false,
      psxJitterResolution: 240,
      psxAffine: false,
      dither: false,
      ditherLevel: 32,
      wireframe: false
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

    recordState(`Fork Texture for ${mesh.name}`)
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

  function applyTextureToMesh(meshId: string, textureId: string, policy: TextureApplyPolicy = 'this_object') {
    const mesh = meshes.value.find(m => m.id === meshId)
    if (!mesh) {
      selectTexture(textureId)
      markTextureUpdated(textureId)
      return
    }

    const currentMatId = mesh.materialId || 'default_material'
    const currentMat = materials.value.find(m => m.id === currentMatId)
    const shared = isMaterialShared(currentMatId)

    recordState(`Apply Texture to ${mesh.name}`)

    if (policy === 'this_object' && shared && currentMat) {
      const newMat: Material = {
        ...JSON.parse(JSON.stringify(currentMat)),
        id: `mat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: `${mesh.name}_Mat`,
        color: '#ffffff',
        textureId
      }
      materials.value.push(newMat)
      mesh.materialId = newMat.id
    } else if (currentMat) {
      currentMat.textureId = textureId
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

  function restoreDefaultTexture(): TextureMap {
    recordState('Restore Default Texture')
    const defBuf = new PixelBuffer(64, 64)
    generateRetroAtlas(defBuf)

    const target = activeTexture.value || textures.value.find(t => t.id === 'tex_default')
    if (target) {
      target.width = 64
      target.height = 64
      target.pixelBuffer = defBuf
      target.dataUrl = defBuf.toDataURL()
      target.atlas = { cols: 2, rows: 2 }
      if (activeTextureId.value !== target.id) {
        activeTextureId.value = target.id
      }
      markTextureUpdated(target.id)
      return target
    }

    const created: TextureMap = {
      id: 'tex_default',
      name: 'Texture_Atlas_64x64',
      width: 64,
      height: 64,
      dataUrl: defBuf.toDataURL(),
      pixelBuffer: markRaw(defBuf),
      atlas: { cols: 2, rows: 2 }
    }
    textures.value.unshift(created)
    activeTextureId.value = created.id
    markTextureUpdated(created.id)
    return created
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

    recordState(`Apply Palette (${pal.name}) to ${tex.name}`)
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

    recordState(`Apply Palette (${pal.name}) to All Textures`)
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
    recordState('New Project')
    const defBuf = new PixelBuffer(64, 64)
    generateRetroAtlas(defBuf)

    projectName.value = 'New Project'
    const defaultCube = createCube('Cube_1', 2)
    defaultCube.materialId = 'default_material'
    meshes.value = [defaultCube]
    activeMeshId.value = defaultCube.id
    selectedMeshIds.value = [defaultCube.id]

    textures.value = [
      {
        id: 'tex_default',
        name: 'Texture_Atlas_64x64',
        width: 64,
        height: 64,
        dataUrl: defBuf.toDataURL(),
        pixelBuffer: markRaw(defBuf),
        atlas: { cols: 2, rows: 2 }
      }
    ]
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
        wireframe: false
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

    clearSubSelections()
    markGeometryUpdated()
    markTextureUpdated('tex_default')
    ProjectStorage.clearAutosave()
  }

  function setShadeMode(mode: MeshShadeMode) {
    const label = mode === 'flat' ? 'Shade Flat' : mode === 'smooth' ? 'Shade Smooth' : 'Shade Auto Smooth'
    recordState(label)
    for (const mesh of meshes.value) {
      if (selectedMeshIds.value.includes(mesh.id) || mesh.id === activeMeshId.value) {
        mesh.shadeMode = mode
        if (mode === 'auto' && mesh.autoSmoothAngle === undefined) {
          mesh.autoSmoothAngle = 30
        }
      }
    }
    markGeometryUpdated()
  }

  function setAutoSmoothAngle(angle: number) {
    recordState('Set Auto Smooth Angle')
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

  function markSelectedEdgesAsSeam() {
    if (!activeMesh.value) return
    recordState('Mark Seam')
    if (!activeMesh.value.seamEdgeIds) {
      activeMesh.value.seamEdgeIds = []
    }
    for (const eId of selectedEdgeIds.value) {
      if (!activeMesh.value.seamEdgeIds.includes(eId)) {
        activeMesh.value.seamEdgeIds.push(eId)
      }
    }
  }

  function clearSelectedEdgesSeam() {
    if (!activeMesh.value || !activeMesh.value.seamEdgeIds) return
    recordState('Clear Seam')
    activeMesh.value.seamEdgeIds = activeMesh.value.seamEdgeIds.filter(id => !selectedEdgeIds.value.includes(id))
  }

  function clearAllSeams() {
    if (!activeMesh.value) return
    recordState('Clear All Seams')
    activeMesh.value.seamEdgeIds = []
  }

  function performSeamUnwrap() {
    if (!activeMesh.value) return
    recordState('Unwrap Along Seams')
    SeamUnwrapper.unwrapMesh(activeMesh.value)
  }

  function performPackUVIslands(padding = 0.02) {
    if (!activeMesh.value) return
    recordState('Pack UV Islands')
    UVIslandPacker.packIslands(activeMesh.value, padding)
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
    replaceMesh(updated)
  }

  function performEqualizeTexelDensity() {
    if (!activeMesh.value) return
    recordState('Equalize Texel Density')
    const updated = equalizeTexelDensity(activeMesh.value)
    replaceMesh(updated)
  }

  function generateBoxUVs() {
    if (!activeMesh.value) return
    recordState('Box UV Projection')
    for (const f of activeMesh.value.faces) {
      const verts = f.vertexIds.map(id => activeMesh.value!.vertices.find(v => v.id === id)?.position).filter(Boolean)
      if (verts.length < 3) continue
      const fn = f.normal || computeFaceNormal(verts as Vector3D[])
      const ax = Math.abs(fn.x), ay = Math.abs(fn.y), az = Math.abs(fn.z)
      
      f.uvs = f.vertexIds.map(vId => {
        const v = activeMesh.value!.vertices.find(vert => vert.id === vId)?.position || { x: 0, y: 0, z: 0 }
        if (ax >= ay && ax >= az) {
          return { u: Number(((v.z + 2) / 4).toFixed(4)), v: Number(((v.y + 2) / 4).toFixed(4)) }
        } else if (ay >= ax && ay >= az) {
          return { u: Number(((v.x + 2) / 4).toFixed(4)), v: Number(((v.z + 2) / 4).toFixed(4)) }
        } else {
          return { u: Number(((v.x + 2) / 4).toFixed(4)), v: Number(((v.y + 2) / 4).toFixed(4)) }
        }
      })
    }
  }

  function bakeSceneAtlas(padding = 2) {
    if (meshes.value.length === 0) return
    recordState('Bake Scene Texture Atlas')
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
    } catch (e: any) {
      console.error('Atlas Bake Error:', e)
    }
  }

  // ----------------------------------------------------
  // OBJECT ORIGIN / PIVOT OPERATIONS
  // ----------------------------------------------------
  function offsetMeshOrigin(meshId: string, dx: number, dy: number, dz: number, actionName = 'Set Origin') {
    const mesh = meshes.value.find(m => m.id === meshId)
    if (!mesh) return
    recordState(actionName)

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
    addPrimitive,
    addEditableMesh,
    referenceImages,
    referenceRevision,
    selectedReferenceId,
    addReferenceImage,
    setReferenceOnPlane,
    selectReference,
    updateReferenceImage,
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
    performExtrude,
    performInset,
    performBevel,
    performSubdivide,
    performMerge,
    performFillFace,
    performFlatten,
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
    addModifier,
    applyMeshModifier,
    removeMeshModifier,
    growSelection,
    shrinkSelection,
    selectConnected,
    replaceMesh,
    setShadeMode,
    setAutoSmoothAngle,
    toggleShadeMode,
    geometryRevision,
    markGeometryUpdated,
    markTexturePreview,
    markTextureUpdated,
    selectTexture,
    ensureTextureBuffer,
    selectMaterial,
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
    restoreDefaultTexture,
    resetToDefaultProject,
    markSelectedEdgesAsSeam,
    clearSelectedEdgesSeam,
    clearAllSeams,
    performSeamUnwrap,
    performPackUVIslands,
    performApplyTexelDensity,
    performEqualizeTexelDensity,
    generateBoxUVs,
    bakeSceneAtlas,
    offsetMeshOrigin,
    setOriginToPreset,
    setGeometryToOrigin,
    selectEdgeLoop,
    selectEdgeRing,
    performAutoMerge,
    recordState,
    hasAutosaveSession,
    autosaveRecord,
    showRecoveryBanner,
    checkAutosaveSession,
    restoreAutosaveSession,
    dismissRecoverySession,
    discardRecoverySession,
    triggerAutosave,
  }
})
