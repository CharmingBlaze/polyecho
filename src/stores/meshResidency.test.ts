import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Matrix4, Vector3 } from 'three'
import { useProjectStore } from './projectStore'
import { useHistoryStore } from './historyStore'
import { MeshBridge } from '../core/mesh/MeshBridge'
import { MeshValidator } from '../core/mesh/MeshValidator'
import { ProjectSerializer } from '../core/project/ProjectSerializer'
import { getMeshEdges, undirectedEdgeId } from '../core/geometry/EdgeUtils'
import { createCube } from '../core/geometry/Primitives'
import { applyGizmoComponentPositions } from '../core/transform/GizmoComponentDrag'

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

  it('pokes on the resident kernel and keeps the same instance', () => {
    const project = useProjectStore()
    const beforeFaces = project.activeMesh!.faces.length
    const initial = project.acquireEditableMesh(project.activeMesh!)
    project.selectedFaceIds = [project.activeMesh!.faces[0].id]
    const result = project.performPokeFaces()
    expect(result?.success).toBe(true)
    expect(project.acquireEditableMesh(project.activeMesh!).mesh).toBe(initial.mesh)
    expect(project.activeMesh!.faces.length).toBeGreaterThan(beforeFaces)
  })

  it('auto-merges on the resident kernel without adding a history entry', () => {
    const project = useProjectStore(), history = useHistoryStore()
    const initial = project.acquireEditableMesh(project.activeMesh!)
    const verts = [...initial.mesh.vertices.values()]
    expect(verts.length).toBeGreaterThan(1)
    const a = verts[0]!, b = verts[verts.length - 1]!
    b.position.x = a.position.x
    b.position.y = a.position.y
    b.position.z = a.position.z
    project.publishEditableMesh(
      MeshBridge.editableMeshToMeshObject(initial.mesh, project.activeMesh!, initial.numToStrVertId, initial.numToStrFaceId),
      initial,
    )
    const historyLen = history.undoStack.length
    const vertexCount = project.activeMesh!.vertices.length
    const result = project.performAutoMerge(project.activeMeshId, 0.0001)
    expect(result?.success).toBe(true)
    expect(project.acquireEditableMesh(project.activeMesh!).mesh).toBe(initial.mesh)
    expect(history.undoStack.length).toBe(historyLen)
    expect(project.activeMesh!.vertices.length).toBeLessThan(vertexCount)
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

  it('marks seams on the resident kernel without a second history entry', () => {
    const project = useProjectStore(), history = useHistoryStore()
    const document = project.activeMesh!
    const edgeId = getMeshEdges(document)[0].id
    const initial = project.acquireEditableMesh(document)
    project.selectedEdgeIds = [edgeId]
    const marked = project.markSelectedEdgesAsSeam()
    expect(marked?.success).toBe(true)
    expect(project.acquireEditableMesh(project.activeMesh!).mesh).toBe(initial.mesh)
    expect(project.activeMesh!.seamEdgeIds).toContain(edgeId)
    expect([...initial.mesh.edges.values()].some(e => e.seam)).toBe(true)
    expect(history.undoStack.map(entry => entry.description)).toEqual(['Mark Seam'])
    const cleared = project.clearAllSeams()
    expect(cleared?.success).toBe(true)
    expect(project.activeMesh!.seamEdgeIds ?? []).toEqual([])
    expect([...initial.mesh.edges.values()].some(e => e.seam)).toBe(false)
    expect(history.undoStack.map(entry => entry.description)).toEqual(['Mark Seam', 'Clear All Seams'])
    history.undo()
    expect(project.activeMesh!.seamEdgeIds).toContain(edgeId)
    expect(project.acquireEditableMesh(project.activeMesh!).mesh).toBe(initial.mesh)
  })

  it('joins into the resident primary kernel and keeps weights and remapped seams', () => {
    const project = useProjectStore()
    const primary = project.activeMesh!
    primary.vertices.forEach(v => { v.boneWeights = { root: 1 } })
    const primarySeams = primary.seamEdgeIds?.length ?? 0

    const other = createCube('Joined', 2)
    other.position.x = 5
    other.vertices.forEach(v => { v.boneWeights = { arm: 1 } })
    other.seamEdgeIds = [getMeshEdges(other)[0].id]
    project.meshes.push(other)
    project.selectedMeshIds = [primary.id, other.id]
    const initial = project.acquireEditableMesh(primary)

    project.performJoinMeshes()

    const joined = project.activeMesh!
    expect(project.meshes.map(m => m.id)).toEqual([primary.id])
    expect(joined.id).toBe(primary.id)
    expect(joined.vertices.length).toBe(initial.mesh.vertices.size)
    expect(MeshValidator.validate(initial.mesh).valid).toBe(true)
    // Identity: the primary still edits the same kernel instance.
    expect(project.acquireEditableMesh(joined).mesh).toBe(initial.mesh)

    // Weights from both objects reach the kernel, not just the document projection.
    const weights = [...initial.mesh.vertices.values()].map(v => JSON.stringify(v.boneWeights ?? null))
    expect(weights.filter(w => w === '{"root":1}').length).toBe(primary.vertices.filter(v => v.boneWeights?.arm === undefined).length)
    expect(weights.filter(w => w === '{"arm":1}').length).toBe(other.vertices.length)
    // The other object's translation is baked and its vertices keep their weights.
    const merged = joined.vertices.filter(v => v.boneWeights?.arm === 1)
    const offsetX = other.position.x - primary.position.x
    expect(merged).toHaveLength(other.vertices.length)
    expect(merged.map(v => v.position.x)).toEqual(other.vertices.map(v => v.position.x + offsetX))

    // The other object's seam is remapped onto the joined ids and lives on the kernel.
    const documentIds = new Map([...initial.mesh.vertices.values()].map(v => [v.id, v.documentId ?? '']))
    const seamEdges = [...initial.mesh.edges.values()].filter(e => e.seam)
    expect(seamEdges).toHaveLength(primarySeams + 1)
    const remapped = seamEdges.filter(e => documentIds.get(e.v1)!.startsWith('v_join_') && documentIds.get(e.v2)!.startsWith('v_join_'))
    expect(remapped).toHaveLength(1)
    expect(joined.seamEdgeIds).toHaveLength(primarySeams + 1)
    // The bridge maps know the new ids, so a later kernel operation can translate them.
    const edge = remapped[0]!
    expect(initial.strToNumVertId.get(documentIds.get(edge.v1)!)).toBe(edge.v1)
  })

  it('separates faces into a new kernel and moves and prunes seams with them', () => {
    const project = useProjectStore()
    const source = project.activeMesh!

    // A second island inside the source object: no other face uses its vertices.
    const island = createCube('Island', 2)
    const islandVertIds = new Map<string, string>()
    for (const v of island.vertices) {
      const id = `v_island_${v.id}`
      islandVertIds.set(v.id, id)
      source.vertices.push({ ...v, id, position: { ...v.position, x: v.position.x + 5 } })
    }
    const islandFaceIds: string[] = []
    for (const f of island.faces) {
      const id = `f_island_${f.id}`
      islandFaceIds.push(id)
      source.faces.push({ ...f, id, vertexIds: f.vertexIds.map(vid => islandVertIds.get(vid)!), uvs: f.uvs.map(uv => ({ ...uv })) })
    }
    const face = island.faces[0]
    const seam = undirectedEdgeId(islandVertIds.get(face.vertexIds[0])!, islandVertIds.get(face.vertexIds[1])!)
    source.seamEdgeIds = [seam]
    source.vertices.forEach(v => { v.boneWeights = { root: 1 } })

    const initial = project.acquireEditableMesh(source)
    const sourceFaceCount = source.faces.length - island.faces.length
    project.selectedFaceIds = [...islandFaceIds]
    project.performSeparateMesh()

    expect(project.meshes).toHaveLength(2)
    const separated = project.meshes.find(m => m.id === project.activeMeshId)!
    const remaining = project.meshes.find(m => m.id === source.id)!
    expect(separated.id).not.toBe(source.id)
    expect(separated.name).toBe(`${source.name}_Separated`)

    // Source kernel identity survives; its document no longer lists the moved seams or verts.
    expect(project.acquireEditableMesh(remaining).mesh).toBe(initial.mesh)
    expect(initial.mesh.faces.size).toBe(sourceFaceCount)
    expect(initial.mesh.vertices.size).toBe(remaining.vertices.length)
    expect(remaining.vertices.some(v => v.id.startsWith('v_island_'))).toBe(false)
    expect(remaining.seamEdgeIds ?? []).toEqual([])
    expect([...initial.mesh.edges.values()].some(e => e.seam)).toBe(false)

    // The separated object carries the seam and the moved weights on its own kernel.
    expect(separated.vertices.every(v => v.boneWeights?.root === 1)).toBe(true)
    expect(separated.faces.map(f => f.id).sort()).toEqual([...islandFaceIds].sort())
    expect(separated.seamEdgeIds).toEqual([seam])
    const separatedBridge = project.acquireEditableMesh(separated)
    expect(MeshValidator.validate(separatedBridge.mesh).valid).toBe(true)
    expect([...separatedBridge.mesh.edges.values()].some(e => e.seam)).toBe(true)
  })

  it('does not re-import a held kernel when the document drifts', () => {
    const project = useProjectStore()
    const document = project.activeMesh!
    const held = project.holdEditableMesh(document)
    const v0 = document.vertices[0]
    const numId = held.strToNumVertId.get(v0.id)!
    const kernelX = held.mesh.vertices.get(numId)!.position.x
    held.mesh.vertices.get(numId)!.position.x += 0.4
    v0.position.x += 50
    expect(project.acquireEditableMesh(document).mesh).toBe(held.mesh)
    expect(held.mesh.vertices.get(numId)!.position.x).toBe(kernelX + 0.4)
    project.releaseEditableMesh(document.id)
    expect(project.acquireEditableMesh(document).mesh.vertices.get(numId)!.position.x).toBe(v0.position.x)
  })

  it('keeps a held kernel through a gizmo-style preview publish', () => {
    const project = useProjectStore()
    const document = project.activeMesh!
    const held = project.holdEditableMesh(document)
    const v0 = document.vertices[0]!
    const numId = held.strToNumVertId.get(v0.id)!
    applyGizmoComponentPositions({
      bridge: held,
      targetVertIds: new Set([v0.id]),
      startWorld: new Map([[v0.id, new Vector3(v0.position.x, v0.position.y, v0.position.z)]]),
      deltaMatrix: new Matrix4().makeTranslation(0.25, 0, 0),
      worldInverse: new Matrix4(),
    })
    const preview = MeshBridge.editableMeshToMeshObject(held.mesh, document, held.numToStrVertId, held.numToStrFaceId)
    project.publishEditableMesh(preview, held, true, {
      topologyChanged: false,
      positionsChanged: true,
      attributesChanged: false,
      createdVertices: [],
      deletedVertices: [],
      createdEdges: [],
      deletedEdges: [],
      createdFaces: [],
      deletedFaces: [],
    })
    expect(project.acquireEditableMesh(project.activeMesh!).mesh).toBe(held.mesh)
    expect(held.mesh.vertices.get(numId)!.position.x).toBeCloseTo(v0.position.x + 0.25)
    project.publishEditableMesh(
      MeshBridge.editableMeshToMeshObject(held.mesh, project.activeMesh!, held.numToStrVertId, held.numToStrFaceId),
      held,
      false,
      {
        topologyChanged: false,
        positionsChanged: true,
        attributesChanged: false,
        createdVertices: [],
        deletedVertices: [],
        createdEdges: [],
        deletedEdges: [],
        createdFaces: [],
        deletedFaces: [],
      },
    )
    project.releaseEditableMesh(document.id)
  })
})
