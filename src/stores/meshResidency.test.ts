import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useProjectStore } from './projectStore'
import { useHistoryStore } from './historyStore'
import { MeshBridge } from '../core/mesh/MeshBridge'
import { MeshValidator } from '../core/mesh/MeshValidator'
import { ProjectSerializer } from '../core/project/ProjectSerializer'
import { getMeshEdges } from '../core/geometry/EdgeUtils'

describe('project kernel lifecycle', () => {
  let pinia: ReturnType<typeof createPinia>
  beforeEach(() => { pinia = createPinia(); setActivePinia(pinia) })
  afterEach(() => disposePinia(pinia))

  it('extrudes on the resident kernel and round-trips undo, redo, selection, weights and project data', () => {
    const project = useProjectStore(), history = useHistoryStore()
    project.activeMesh!.vertices.forEach(v => { v.boneWeights = { root: 1 }; v.color = '#ff8040' })
    const before = JSON.parse(JSON.stringify(project.activeMesh!))
    const initial = project.acquireEditableMesh(project.activeMesh!)
    project.selectedFaceIds = [project.activeMesh!.faces[0].id]
    const result = project.performExtrude(0.5)
    expect(result?.success).toBe(true)
    const after = JSON.parse(JSON.stringify(project.activeMesh!))
    const acquired = project.acquireEditableMesh(project.activeMesh!)
    expect(acquired.mesh).toBe(initial.mesh)
    expect(MeshValidator.validate(acquired.mesh).valid).toBe(true)
    expect(project.selectedFaceIds.every(id => after.faces.some((f: { id: string }) => f.id === id))).toBe(true)
    expect(project.selectedVertexIds.every(id => after.vertices.some((v: { id: string }) => v.id === id))).toBe(true)
    expect(after.vertices.every((v: { boneWeights: unknown }) => JSON.stringify(v.boneWeights) === '{"root":1}')).toBe(true)
    history.undo()
    expect(project.activeMesh).toEqual(before)
    expect(project.acquireEditableMesh(project.activeMesh!).mesh).toBe(initial.mesh)
    history.redo()
    expect(project.activeMesh).toEqual(after)
    expect(MeshValidator.validate(project.acquireEditableMesh(project.activeMesh!).mesh).valid).toBe(true)
    const parsed = ProjectSerializer.deserialize(JSON.stringify({
      version: '1.0', appName: 'PSXModeller', meshes: [after], materials: [],
      activePalette: { id: 'p', name: 'P', colors: ['#ffffff'] }, armature: { bones: [], clips: [] },
    }))
    const roundtrip = MeshBridge.meshObjectToEditableMesh(parsed.meshes[0])
    expect(MeshValidator.validate(roundtrip.mesh).valid).toBe(true)
    expect(parsed.meshes[0].vertices).toEqual(after.vertices)
  })

  it('rejects invalid extrusion without history, selection or document changes', () => {
    const project = useProjectStore(), history = useHistoryStore()
    project.selectedFaceIds = [project.activeMesh!.faces[0].id]
    const before = JSON.stringify(project.activeMesh)
    const selection = [...project.selectedFaceIds]
    const result = project.performExtrude(NaN)
    expect(result?.success).toBe(false)
    expect(project.meshEditError?.reason).toBeTruthy()
    expect(JSON.stringify(project.activeMesh)).toBe(before)
    expect(project.selectedFaceIds).toEqual(selection)
    expect(history.isDirty()).toBe(false)
  })

  it('restores a canceled preview without losing vertex attributes or edge IDs', () => {
    const project = useProjectStore()
    const document = project.activeMesh!
    document.vertices[0].boneWeights = { root: 1 }
    document.seamEdgeIds = [getMeshEdges(document)[0].id]
    const bridge = project.acquireEditableMesh(document)
    const before = bridge.mesh.createSnapshot()
    bridge.mesh.vertices.values().next().value!.position.x += 0.3
    const preview = MeshBridge.editableMeshToMeshObject(bridge.mesh, document, bridge.numToStrVertId, bridge.numToStrFaceId)
    const revision = project.geometryRevision
    project.publishEditableMesh(preview, bridge, true)
    expect(project.geometryRevision).toBeGreaterThan(revision)
    bridge.mesh.restoreSnapshot(before)
    project.publishEditableMesh(MeshBridge.editableMeshToMeshObject(bridge.mesh, document, bridge.numToStrVertId, bridge.numToStrFaceId), bridge)
    expect(project.acquireEditableMesh(project.activeMesh!).mesh.createSnapshot()).toEqual(before)
    expect(project.activeMesh!.seamEdgeIds).toEqual(document.seamEdgeIds)
    expect(project.activeMesh!.vertices[0].boneWeights).toEqual({ root: 1 })
  })
})
