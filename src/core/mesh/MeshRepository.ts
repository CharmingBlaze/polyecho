import type { MeshObject } from '../../types/mesh'
import { MeshBridge } from './MeshBridge'

export type MeshBridgeData = ReturnType<typeof MeshBridge.meshObjectToEditableMesh>

type RepoEntry = { bridge: MeshBridgeData; signature: string; held: boolean }

function signature(document: MeshObject): string {
  // Selection and object transforms are editor state, not kernel mutations.
  return JSON.stringify([
    document.vertices.map(v => [v.id, v.position, v.color, v.boneWeights]),
    document.faces.map(f => [f.id, f.vertexIds, f.uvs, f.materialIndex]), document.seamEdgeIds,
  ])
}

/** Per-project, non-reactive residency. Legacy document edits enter only at this boundary. */
export class MeshRepository {
  private entries = new Map<string, RepoEntry>()

  acquire(document: MeshObject): MeshBridgeData {
    const existing = this.entries.get(document.id)
    // One owner until release: a held kernel is not re-imported even if the document drifted.
    if (existing?.held) return existing.bridge
    const key = signature(document)
    if (existing?.signature === key) return existing.bridge
    const bridge = MeshBridge.meshObjectToEditableMesh(document, existing?.bridge)
    if (existing) {
      // Keep references held by services live across undo, load, and legacy edits.
      existing.bridge.mesh.restoreSnapshot(bridge.mesh.createSnapshot())
      bridge.mesh = existing.bridge.mesh
    }
    this.entries.set(document.id, { bridge, signature: key, held: false })
    return bridge
  }

  /** Acquire and mark exclusive. `acquire` will not restore from the document until `release`. */
  hold(document: MeshObject): MeshBridgeData {
    const bridge = this.acquire(document)
    const entry = this.entries.get(document.id)
    if (entry) entry.held = true
    return bridge
  }

  release(objectId: string): void {
    const entry = this.entries.get(objectId)
    if (entry) entry.held = false
  }

  isHeld(objectId: string): boolean {
    return this.entries.get(objectId)?.held === true
  }

  /** Register a projection of this exact kernel; previews must not re-import it. */
  publish(document: MeshObject, bridge: MeshBridgeData): void {
    for (const [id, value] of bridge.numToStrVertId) bridge.strToNumVertId.set(value, id)
    for (const [id, value] of bridge.numToStrFaceId) bridge.strToNumFaceId.set(value, id)
    const held = this.entries.get(document.id)?.held === true
    this.entries.set(document.id, { bridge, signature: signature(document), held })
  }

  retain(objectIds: Iterable<string>): void {
    const keep = new Set(objectIds)
    for (const [id, entry] of this.entries) {
      if (!keep.has(id) && !entry.held) this.entries.delete(id)
    }
  }

  clear(): void { this.entries.clear() }
}
