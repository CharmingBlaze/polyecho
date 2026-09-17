import type { MeshObject } from '../../types/mesh'
import { MeshBridge } from './MeshBridge'

export type MeshBridgeData = ReturnType<typeof MeshBridge.meshObjectToEditableMesh>

function signature(document: MeshObject): string {
  // Selection and object transforms are editor state, not kernel mutations.
  return JSON.stringify([
    document.vertices.map(v => [v.id, v.position, v.color, v.boneWeights]),
    document.faces.map(f => [f.id, f.vertexIds, f.uvs, f.materialIndex]), document.seamEdgeIds,
  ])
}

/** Per-project, non-reactive residency. Legacy document edits enter only at this boundary. */
export class MeshRepository {
  private entries = new Map<string, { bridge: MeshBridgeData; signature: string }>()

  acquire(document: MeshObject): MeshBridgeData {
    const key = signature(document)
    const existing = this.entries.get(document.id)
    if (existing?.signature === key) return existing.bridge
    const bridge = MeshBridge.meshObjectToEditableMesh(document, existing?.bridge)
    if (existing) {
      // Keep references held by services live across undo, load, and legacy edits.
      existing.bridge.mesh.restoreSnapshot(bridge.mesh.createSnapshot())
      bridge.mesh = existing.bridge.mesh
    }
    this.entries.set(document.id, { bridge, signature: key })
    return bridge
  }

  /** Register a projection of this exact kernel; previews must not re-import it. */
  publish(document: MeshObject, bridge: MeshBridgeData): void {
    for (const [id, value] of bridge.numToStrVertId) bridge.strToNumVertId.set(value, id)
    for (const [id, value] of bridge.numToStrFaceId) bridge.strToNumFaceId.set(value, id)
    this.entries.set(document.id, { bridge, signature: signature(document) })
  }

  retain(objectIds: Iterable<string>): void {
    const keep = new Set(objectIds)
    for (const id of this.entries.keys()) if (!keep.has(id)) this.entries.delete(id)
  }

  clear(): void { this.entries.clear() }
}
