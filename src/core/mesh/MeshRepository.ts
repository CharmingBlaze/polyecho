import type { MeshObject } from '../../types/mesh'
import { MeshBridge } from './MeshBridge'
import type { MeshSnapshot } from './MeshKernel'

export type MeshBridgeData = ReturnType<typeof MeshBridge.meshObjectToEditableMesh>
export interface ResidentMeshSnapshot {
  objectId: string
  mesh: MeshSnapshot
  strToNumVertId: [string, number][]
  numToStrVertId: [number, string][]
  strToNumFaceId: [string, number][]
  numToStrFaceId: [number, string][]
}

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

  /** Development guard: an editor commit must register the exact resident projection. */
  assertPublished(document: MeshObject, bridge: MeshBridgeData): void {
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'production') return
    const entry = this.entries.get(document.id)
    if (!entry || entry.bridge !== bridge || entry.signature !== signature(document)) {
      throw new Error(`Resident mesh commit was not published for ${document.id}`)
    }
  }

  /** In-memory history payload; never serialized into a project file. */
  capture(): ResidentMeshSnapshot[] {
    return [...this.entries].map(([objectId, entry]) => ({
      objectId,
      mesh: entry.bridge.mesh.createSnapshot(),
      strToNumVertId: [...entry.bridge.strToNumVertId],
      numToStrVertId: [...entry.bridge.numToStrVertId],
      strToNumFaceId: [...entry.bridge.strToNumFaceId],
      numToStrFaceId: [...entry.bridge.numToStrFaceId],
    }))
  }

  /** Restore resident identity before the next acquire can reconcile from the document. */
  restore(snapshots: ResidentMeshSnapshot[], documents: readonly MeshObject[]): void {
    const docs = new Map(documents.map(document => [document.id, document]))
    const keep = new Set<string>()
    for (const snapshot of snapshots) {
      const document = docs.get(snapshot.objectId)
      if (!document) continue
      keep.add(snapshot.objectId)
      const existing = this.entries.get(snapshot.objectId)
      const bridge = existing?.bridge ?? MeshBridge.meshObjectToEditableMesh(document)
      bridge.mesh.restoreSnapshot(snapshot.mesh)
      bridge.strToNumVertId = new Map(snapshot.strToNumVertId)
      bridge.numToStrVertId = new Map(snapshot.numToStrVertId)
      bridge.strToNumFaceId = new Map(snapshot.strToNumFaceId)
      bridge.numToStrFaceId = new Map(snapshot.numToStrFaceId)
      this.entries.set(snapshot.objectId, {
        bridge,
        signature: signature(document),
        held: existing?.held === true,
      })
    }
    for (const [id, entry] of this.entries) if (!keep.has(id) && !entry.held) this.entries.delete(id)
  }

  retain(objectIds: Iterable<string>): void {
    const keep = new Set(objectIds)
    for (const [id, entry] of this.entries) {
      if (!keep.has(id) && !entry.held) this.entries.delete(id)
    }
  }

  clear(): void { this.entries.clear() }
}
