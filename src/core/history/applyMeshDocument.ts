import type { MeshObject } from '../../types/mesh'

/** Mesh + selection fields history restores (textures stay on PixelBuffer.clone). */
export interface MeshDocumentSlice {
  meshes: MeshObject[]
  activeMeshId: string
  selectedMeshIds: string[]
  selectedVertexIds: string[]
  selectedEdgeIds: string[]
  selectedFaceIds: string[]
}

export function cloneMeshDocumentSlice(slice: MeshDocumentSlice): MeshDocumentSlice {
  return {
    meshes: JSON.parse(JSON.stringify(slice.meshes)),
    activeMeshId: slice.activeMeshId,
    selectedMeshIds: [...slice.selectedMeshIds],
    selectedVertexIds: [...slice.selectedVertexIds],
    selectedEdgeIds: [...slice.selectedEdgeIds],
    selectedFaceIds: [...slice.selectedFaceIds]
  }
}

export function applyMeshDocumentSlice(target: MeshDocumentSlice, snapshot: MeshDocumentSlice) {
  const next = cloneMeshDocumentSlice(snapshot)
  target.meshes = next.meshes
  target.activeMeshId = next.activeMeshId
  target.selectedMeshIds = next.selectedMeshIds
  target.selectedVertexIds = next.selectedVertexIds
  target.selectedEdgeIds = next.selectedEdgeIds
  target.selectedFaceIds = next.selectedFaceIds
}

export function selectionExistsOnMeshes(slice: MeshDocumentSlice): boolean {
  const meshIds = new Set(slice.meshes.map(m => m.id))
  if (slice.activeMeshId && !meshIds.has(slice.activeMeshId)) return false
  if (slice.selectedMeshIds.some(id => !meshIds.has(id))) return false
  const mesh = slice.meshes.find(m => m.id === slice.activeMeshId)
  if (!mesh) {
    return slice.selectedVertexIds.length === 0 && slice.selectedFaceIds.length === 0
  }
  const verts = new Set(mesh.vertices.map(v => v.id))
  const faces = new Set(mesh.faces.map(f => f.id))
  return slice.selectedVertexIds.every(id => verts.has(id))
    && slice.selectedFaceIds.every(id => faces.has(id))
}
