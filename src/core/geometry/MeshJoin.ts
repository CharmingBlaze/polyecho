import * as THREE from 'three'
import type { MeshObject } from '../../types/mesh'
import type { EditableMesh } from '../mesh/MeshKernel'
import { MeshTopologyService } from '../mesh/MeshTopologyService'
import type { MeshBridgeData } from '../mesh/MeshRepository'
import { parseUndirectedEdgeId, undirectedEdgeId } from './EdgeUtils'

/**
 * Object-level join / separate.
 *
 * These verbs create and destroy scene objects, so they are not a single
 * `runKernelOperation` on the active mesh: the store keeps one history entry per command and
 * publishes every surviving document itself. Geometry is staged on a clone of the resident
 * kernel here, then transplanted back into that same instance by the store.
 */

/**
 * Appends the other objects to `primary` and returns the staged primary kernel.
 *
 * Only translation is baked (`other.position - primary.position`), matching the legacy Ctrl+J
 * loop; the other objects' rotation and scale are still not baked. Vertex weights, colors,
 * face UVs/materials and the other objects' seams all cross onto the kernel, and the primary's
 * own attributes and seams are carried by the clone.
 */
export function joinMeshObjects(primary: MeshObject, others: MeshObject[], bridge: MeshBridgeData): EditableMesh {
  const kernel = bridge.mesh.clone()

  for (const other of others) {
    const offset = {
      x: other.position.x - primary.position.x,
      y: other.position.y - primary.position.y,
      z: other.position.z - primary.position.z
    }
    const kernelVertIds = new Map<string, number>()

    for (const v of other.vertices) {
      const id = kernel.allocVertexId()
      const vertex = kernel.addVertex(
        new THREE.Vector3(v.position.x + offset.x, v.position.y + offset.y, v.position.z + offset.z),
        id
      )
      // Document ids are remapped so a joined object can be joined again without collisions.
      vertex.documentId = `v_join_${other.id}_${v.id}`
      vertex.color = v.color
      vertex.boneWeights = v.boneWeights ? { ...v.boneWeights } : undefined
      kernelVertIds.set(v.id, id)
    }

    for (const f of other.faces) {
      const numVertIds: number[] = []
      for (const vertId of f.vertexIds) {
        const id = kernelVertIds.get(vertId)
        if (id === undefined) {
          numVertIds.length = 0
          break
        }
        numVertIds.push(id)
      }
      if (numVertIds.length < 3) continue
      const uvs = f.uvs.length === numVertIds.length ? f.uvs.map(u => new THREE.Vector2(u.u, u.v)) : undefined
      const face = kernel.addFace(numVertIds, uvs, f.materialIndex ?? 0, undefined, kernel.allocFaceId())
      if (face) face.documentId = `f_join_${other.id}_${f.id}`
    }

    // Seams are a kernel flag: a document-only `seamEdgeIds` write would be wiped by the next
    // projection. Remap each entry onto the new vertex ids and mark the kernel edge.
    for (const seamEdgeId of other.seamEdgeIds ?? []) {
      const parsed = parseUndirectedEdgeId(seamEdgeId, other.vertices.map(v => v.id))
      if (!parsed) continue
      const v1 = kernelVertIds.get(parsed.v1)
      const v2 = kernelVertIds.get(parsed.v2)
      const edge = v1 === undefined || v2 === undefined ? undefined : kernel.findEdge(v1, v2)
      if (edge) edge.seam = true
    }
  }

  return kernel
}

export interface StagedSeparate {
  /** Clone of the resident source kernel with the moved faces and their released vertices removed. */
  kernel: EditableMesh
  /** Detached object holding the moved faces, their weights/colors/UVs and the seams that moved. */
  separated: MeshObject
}

/**
 * Splits `faceIds` off `source` and returns the staged source kernel plus the new object.
 *
 * Border vertices stay on the source while a remaining face still uses them, so a seam edge
 * shared across the split survives on the source (shared border keeps the seam flag); the
 * separated object only takes seams whose both vertices moved. Returns null for no faces.
 */
export function separateMeshFaces(
  source: MeshObject,
  faceIds: string[],
  bridge: MeshBridgeData,
  identity: { id: string; name: string }
): StagedSeparate | null {
  const wanted = new Set(faceIds)
  const movedFaces = source.faces.filter(f => wanted.has(f.id))
  if (movedFaces.length === 0) return null

  const movedVertIds = new Set(movedFaces.flatMap(f => f.vertexIds))
  const kernel = bridge.mesh.clone()
  const kernelFaceIds: number[] = []
  for (const face of movedFaces) {
    const numFaceId = bridge.strToNumFaceId.get(face.id)
    if (numFaceId !== undefined) kernelFaceIds.push(numFaceId)
  }
  // Preserves vertices and edges shared with the faces that stay on the source.
  MeshTopologyService.deleteFaces(kernel, kernelFaceIds)

  const separatedSeams = (source.seamEdgeIds ?? []).filter(edgeId => {
    const parsed = parseUndirectedEdgeId(edgeId, source.vertices.map(v => v.id))
    return parsed !== null && movedVertIds.has(parsed.v1) && movedVertIds.has(parsed.v2)
  })
  const keptSeams = new Set((source.seamEdgeIds ?? []).filter(edgeId => !separatedSeams.includes(edgeId)))
  const documentIds = new Map<number, string>()
  for (const vertex of kernel.vertices.values()) if (vertex.documentId) documentIds.set(vertex.id, vertex.documentId)
  for (const edge of kernel.edges.values()) {
    const v1 = documentIds.get(edge.v1)
    const v2 = documentIds.get(edge.v2)
    edge.seam = v1 !== undefined && v2 !== undefined && keptSeams.has(undirectedEdgeId(v1, v2))
  }

  return {
    kernel,
    separated: {
      id: identity.id,
      name: identity.name,
      visible: true,
      locked: false,
      position: { ...source.position },
      rotation: { ...source.rotation },
      scale: { ...source.scale },
      materialId: source.materialId,
      shadeMode: source.shadeMode,
      autoSmoothAngle: source.autoSmoothAngle,
      // Keep the clone: it is what carries `boneWeights`, vertex `color` and face UVs.
      vertices: JSON.parse(JSON.stringify(source.vertices.filter(v => movedVertIds.has(v.id)))),
      faces: JSON.parse(JSON.stringify(movedFaces)),
      seamEdgeIds: separatedSeams
    }
  }
}
