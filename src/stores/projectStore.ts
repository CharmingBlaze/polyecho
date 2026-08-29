import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { MeshObject, Vertex, Face } from '../types/mesh'
import { Material, Palette, TextureMap } from '../types/texture'
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
  flipNormals, 
  deleteElements 
} from '../core/geometry/Operations'
import { getMeshEdges } from '../core/geometry/EdgeUtils'
import { DEFAULT_PALETTES } from '../utils/color'
import { PixelBuffer } from '../core/painting/PixelCanvas'
import { generateRetroAtlas } from '../core/painting/DefaultTextures'
import { PrimitiveType, PrimitiveParameters } from '../core/primitives/PrimitiveTypes'
import { PrimitiveBuilder } from '../core/primitives/PrimitiveBuilder'
import { MeshBridge } from '../core/mesh/MeshBridge'
import { PrimitiveTransform } from '../core/history/commands/CreatePrimitiveCommand'
import { useHistoryStore } from './historyStore'

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

  // Textures & Materials
  const activePalette = ref<Palette>(DEFAULT_PALETTES[0])
  const pixelBuffer = ref<PixelBuffer>(new PixelBuffer(64, 64))
  const textureRevision = ref<number>(0)

  // Initialize high quality 64x64 Texture Atlas
  function initDefaultTexture() {
    generateRetroAtlas(pixelBuffer.value)
    textureRevision.value++
  }
  initDefaultTexture()

  const textures = ref<TextureMap[]>([
    {
      id: 'tex_default',
      name: 'Texture_Atlas_64x64',
      width: 64,
      height: 64,
      dataUrl: pixelBuffer.value.toDataURL()
    }
  ])

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

  // Computed
  const activeMesh = computed<MeshObject | undefined>(() => meshes.value.find((m: MeshObject) => m.id === activeMeshId.value) || meshes.value[0])

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
    const prevMeshes = JSON.parse(JSON.stringify(meshes.value))
    const prevActiveId = activeMeshId.value
    const prevSelectedVerts = [...selectedVertexIds.value]
    const prevSelectedFaces = [...selectedFaceIds.value]

    setTimeout(() => {
      const nextMeshes = JSON.parse(JSON.stringify(meshes.value))
      const nextActiveId = activeMeshId.value
      const nextSelectedVerts = [...selectedVertexIds.value]
      const nextSelectedFaces = [...selectedFaceIds.value]

      historyStore.pushAction({
        description: desc,
        timestamp: Date.now(),
        undo: () => {
          meshes.value = JSON.parse(JSON.stringify(prevMeshes))
          activeMeshId.value = prevActiveId
          selectedVertexIds.value = [...prevSelectedVerts]
          selectedFaceIds.value = [...prevSelectedFaces]
        },
        redo: () => {
          meshes.value = JSON.parse(JSON.stringify(nextMeshes))
          activeMeshId.value = nextActiveId
          selectedVertexIds.value = [...nextSelectedVerts]
          selectedFaceIds.value = [...nextSelectedFaces]
        }
      })
    }, 0)
  }

  // Primitive adding
  function addPrimitive(
    type: PrimitiveType | 'cube' | 'plane' | 'cylinder' | 'cone' | 'sphere' = 'BOX',
    params?: PrimitiveParameters,
    transform?: PrimitiveTransform
  ) {
    const normType = (type.toUpperCase() === 'CUBE' ? 'BOX' : type.toUpperCase()) as PrimitiveType
    recordState(`Add ${normType}`)
    const count = meshes.value.length + 1

    const editableMesh = PrimitiveBuilder.create(normType, params || {})
    const label = `${normType.charAt(0) + normType.slice(1).toLowerCase()}_${count}`
    const newMesh = MeshBridge.editableMeshToMeshObject(editableMesh, label)

    if (transform) {
      newMesh.position = { ...transform.position }
      newMesh.rotation = { ...transform.rotation }
      newMesh.scale = { ...transform.scale }
    }

    meshes.value.push(newMesh)
    activeMeshId.value = newMesh.id
    selectedMeshIds.value = [newMesh.id]
    clearSubSelections()
    return newMesh
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

  function performInset(scale = 0.7) {
    if (!activeMesh.value || selectedFaceIds.value.length === 0) return
    recordState('Inset Face(s)')
    const result = insetFaces(activeMesh.value, selectedFaceIds.value, scale)
    selectedFaceIds.value = result.selectedFaceIds
    selectedVertexIds.value = result.selectedVertexIds
    replaceMesh(result.mesh)
  }

  function performBevel(offset = 0.2) {
    if (!activeMesh.value || selectedFaceIds.value.length === 0) return
    recordState('Bevel Face(s)')
    const result = bevelFaces(activeMesh.value, selectedFaceIds.value, offset)
    selectedFaceIds.value = result.selectedFaceIds
    selectedVertexIds.value = result.selectedVertexIds
    replaceMesh(result.mesh)
  }

  function performSubdivide() {
    if (!activeMesh.value) return
    recordState('Subdivide')
    const targetFaceIds = selectedFaceIds.value.length > 0 ? selectedFaceIds.value : activeMesh.value.faces.map(f => f.id)
    const result = subdivideFaces(activeMesh.value, targetFaceIds)
    selectedFaceIds.value = result.selectedFaceIds
    replaceMesh(result.mesh)
  }

  function performMerge(type: 'center' | 'first' | 'last' | 'distance' = 'center', threshold = 0.05) {
    if (!activeMesh.value) return
    if (type !== 'distance' && selectedVertexIds.value.length < 2) return
    recordState(`Merge Vertices (${type})`)
    const result = mergeVerticesAdvanced(activeMesh.value, selectedVertexIds.value, type, threshold)
    selectedVertexIds.value = result.selectedVertexIds
    replaceMesh(result.mesh)
  }

  function performFillFace() {
    if (!activeMesh.value || selectedVertexIds.value.length < 3) return
    recordState('Fill Face (F)')
    const result = fillFaceFromVertices(activeMesh.value, selectedVertexIds.value)
    selectedFaceIds.value = result.selectedFaceIds
    replaceMesh(result.mesh)
  }

  function performFlatten(axis: 'x' | 'y' | 'z') {
    if (!activeMesh.value || selectedVertexIds.value.length === 0) return
    recordState(`Flatten on ${axis.toUpperCase()}`)
    const result = flattenVerticesOnAxis(activeMesh.value, selectedVertexIds.value, axis)
    replaceMesh(result.mesh)
  }

  function performSeparateMesh() {
    if (!activeMesh.value || selectedFaceIds.value.length === 0) return
    recordState('Separate Selection')
    const sourceMesh = activeMesh.value
    const facesToMove = sourceMesh.faces.filter(f => selectedFaceIds.value.includes(f.id))
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
      vertices: JSON.parse(JSON.stringify(vertsToMove)),
      faces: JSON.parse(JSON.stringify(facesToMove))
    }

    // Remove from source mesh
    sourceMesh.faces = sourceMesh.faces.filter(f => !selectedFaceIds.value.includes(f.id))
    const remainingUsedVerts = new Set(sourceMesh.faces.flatMap(f => f.vertexIds))
    sourceMesh.vertices = sourceMesh.vertices.filter(v => remainingUsedVerts.has(v.id))

    meshes.value.push(newMesh)
    activeMeshId.value = newMesh.id
    clearSubSelections()
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

    const otherIds = new Set(otherMeshes.map(m => m.id))
    meshes.value = meshes.value.filter(m => !otherIds.has(m.id))
    selectedMeshIds.value = [primary.id]
    activeMeshId.value = primary.id
    clearSubSelections()
  }

  function performFlipNormals() {
    if (!activeMesh.value) return
    recordState('Flip Normals')
    const targetFaceIds = selectedFaceIds.value.length > 0 ? selectedFaceIds.value : activeMesh.value.faces.map(f => f.id)
    const result = flipNormals(activeMesh.value, targetFaceIds)
    replaceMesh(result.mesh)
  }

  function performDelete(mode: 'vertex' | 'edge' | 'face') {
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

  function replaceMesh(newMesh: MeshObject) {
    const idx = meshes.value.findIndex(m => m.id === newMesh.id)
    if (idx !== -1) {
      meshes.value[idx] = newMesh
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
    activeMeshId.value = ''
    clearSubSelections()
  }

  function growSelection(mode: SelectMode) {
    if (!activeMesh.value) return
    if (mode === 'vertex') {
      const neighborVerts = new Set<string>(selectedVertexIds.value)
      for (const face of activeMesh.value.faces) {
        if (face.vertexIds.some(vid => selectedVertexIds.value.includes(vid))) {
          face.vertexIds.forEach(vid => neighborVerts.add(vid))
        }
      }
      selectedVertexIds.value = Array.from(neighborVerts)
    } else if (mode === 'face') {
      const selectedVerts = new Set<string>()
      for (const face of activeMesh.value.faces) {
        if (selectedFaceIds.value.includes(face.id)) {
          face.vertexIds.forEach(vid => selectedVerts.add(vid))
        }
      }
      const newFaces = new Set<string>(selectedFaceIds.value)
      for (const face of activeMesh.value.faces) {
        if (face.vertexIds.some(vid => selectedVerts.has(vid))) {
          newFaces.add(face.id)
        }
      }
      selectedFaceIds.value = Array.from(newFaces)
    }
  }

  function shrinkSelection(mode: SelectMode) {
    if (!activeMesh.value) return
    if (mode === 'face') {
      const unselectedFaces = activeMesh.value.faces.filter(f => !selectedFaceIds.value.includes(f.id))
      const unselectedVerts = new Set(unselectedFaces.flatMap(f => f.vertexIds))
      selectedFaceIds.value = selectedFaceIds.value.filter(fId => {
        const face = activeMesh.value!.faces.find(f => f.id === fId)
        return face && !face.vertexIds.some(vid => unselectedVerts.has(vid))
      })
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

  // Clipboard State & Operations
  const clipboard = ref<{ type: 'meshes' | 'faces'; data: any } | null>(null)

  function copySelection(mode: SelectMode = 'object'): boolean {
    if (mode === 'object' || (selectedFaceIds.value.length === 0 && selectedVertexIds.value.length === 0)) {
      const targetMeshes = meshes.value.filter(m => selectedMeshIds.value.includes(m.id))
      const toCopy = targetMeshes.length > 0 ? targetMeshes : (activeMesh.value ? [activeMesh.value] : [])
      if (toCopy.length === 0) return false
      clipboard.value = {
        type: 'meshes',
        data: JSON.parse(JSON.stringify(toCopy))
      }
      return true
    } else if (mode === 'face' && activeMesh.value && selectedFaceIds.value.length > 0) {
      const targetFaces: Face[] = activeMesh.value.faces.filter(f => selectedFaceIds.value.includes(f.id))
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

  function markTextureUpdated() {
    textureRevision.value++
    if (textures.value[0]) {
      textures.value[0].dataUrl = pixelBuffer.value.toDataURL()
    }
  }

  function setShadeMode(mode: 'flat' | 'smooth') {
    for (const mesh of meshes.value) {
      if (selectedMeshIds.value.includes(mesh.id) || mesh.id === activeMeshId.value) {
        mesh.shadeMode = mode
      }
    }
    recordState(`Set Shade ${mode === 'flat' ? 'Flat' : 'Smooth'}`)
  }

  function toggleShadeMode() {
    const current = activeMesh.value?.shadeMode || 'flat'
    setShadeMode(current === 'flat' ? 'smooth' : 'flat')
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
    pixelBuffer,
    textureRevision,
    textures,
    materials,
    stats,
    clipboard,
    addPrimitive,
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
    performDelete,
    performDissolve,
    performConnectVertices,
    performCleanupMesh,
    growSelection,
    shrinkSelection,
    selectConnected,
    replaceMesh,
    setShadeMode,
    toggleShadeMode,
    markTextureUpdated,
    recordState,
  }
})
