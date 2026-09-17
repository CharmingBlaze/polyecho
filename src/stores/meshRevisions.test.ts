import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useProjectStore } from './projectStore'
import { useHistoryStore } from './historyStore'
import { MeshBridge } from '../core/mesh/MeshBridge'
import { describeMeshChange } from '../core/mesh/MeshTransaction'

describe('per-object mesh revisions', () => {
  let pinia: ReturnType<typeof createPinia>
  beforeEach(() => { pinia = createPinia(); setActivePinia(pinia) })
  afterEach(() => disposePinia(pinia))

  it('bumps only attribute for a UV-only commit', () => {
    const project = useProjectStore()
    const id = project.activeMeshId
    const before = project.geometryRevision
    project.performBoxUnwrap()
    const rev = project.meshRevision(id)
    expect(rev).toBeTruthy()
    expect(project.geometryRevision).toBeGreaterThan(before)
    expect(rev!.attribute).toBeGreaterThan(0)
    expect(rev!.topology).toBe(0)
    expect(rev!.position).toBe(0)
  })

  it('bumps only position for a position-only vertex move', () => {
    const project = useProjectStore()
    const id = project.activeMeshId
    const document = project.activeMesh!
    const bridge = project.acquireEditableMesh(document)
    const before = bridge.mesh.createSnapshot()
    // Move a single vertex (a position-only change, not degenerate).
    bridge.mesh.vertices.values().next().value!.position.x += 0.25
    const doc = MeshBridge.editableMeshToMeshObject(
      bridge.mesh, document, bridge.numToStrVertId, bridge.numToStrFaceId,
    )
    const change = describeMeshChange(before, bridge.mesh.createSnapshot())
    const revBefore = project.geometryRevision
    project.publishEditableMesh(doc, bridge, false, change)
    expect(change.topologyChanged).toBe(false)
    expect(change.attributesChanged).toBe(false)
    expect(change.positionsChanged).toBe(true)
    expect(project.geometryRevision).toBeGreaterThan(revBefore)
    const rev = project.meshRevision(id)!
    expect(rev.position).toBeGreaterThan(0)
    expect(rev.topology).toBe(0)
    expect(rev.attribute).toBe(0)
  })

  it('bumps all three counters for a topology commit', () => {
    const project = useProjectStore()
    const id = project.activeMeshId
    project.selectedFaceIds = [project.activeMesh!.faces[0].id]
    project.performExtrude(0.5)
    const rev = project.meshRevision(id)
    expect(rev).toBeTruthy()
    expect(rev!.topology).toBeGreaterThan(0)
    expect(rev!.position).toBeGreaterThan(0)
    expect(rev!.attribute).toBeGreaterThan(0)
  })

  it('bumps nothing for a no-op kernel operation', () => {
    const project = useProjectStore()
    const id = project.activeMeshId
    project.selectedVertexIds = project.activeMesh!.vertices.map(v => v.id)
    const before = project.geometryRevision
    project.performMerge('distance', 0.0001)
    expect(project.geometryRevision).toBe(before)
    expect(project.meshRevision(id)).toBeUndefined()
  })

  it('bumps no mesh counter for object TRS', () => {
    const project = useProjectStore()
    const id = project.activeMeshId
    const before = project.geometryRevision
    project.performRotateObject('y', 90)
    expect(project.geometryRevision).toBeGreaterThan(before)
    expect(project.meshRevision(id)).toBeUndefined()
  })

  it('preview bumps counters without committing', () => {
    const project = useProjectStore()
    const id = project.activeMeshId
    const document = project.activeMesh!
    const bridge = project.acquireEditableMesh(document)
    bridge.mesh.vertices.values().next().value!.position.x += 0.3
    const preview = MeshBridge.editableMeshToMeshObject(
      bridge.mesh, document, bridge.numToStrVertId, bridge.numToStrFaceId,
    )
    const before = project.geometryRevision
    project.publishEditableMesh(preview, bridge, true)
    expect(project.geometryRevision).toBeGreaterThan(before)
    expect(project.meshRevision(id)).toBeTruthy()
  })

  it('undo/redo bumps all three counters for every object', () => {
    const project = useProjectStore()
    const history = useHistoryStore()
    const id = project.activeMeshId
    project.selectedFaceIds = [project.activeMesh!.faces[0].id]
    project.performExtrude(0.5)
    const afterExtrude = project.meshRevision(id)!
    history.undo()
    const rev = project.meshRevision(id)!
    expect(rev.topology).toBeGreaterThan(afterExtrude.topology)
    expect(rev.position).toBeGreaterThan(afterExtrude.position)
    expect(rev.attribute).toBeGreaterThan(afterExtrude.attribute)
  })
})