import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { createCube } from '../core/geometry/Primitives'
import { MeshBridge } from '../core/mesh/MeshBridge'
import { ExtrudeKernel } from '../core/mesh/operations/ExtrudeKernel'
import { KnifeOperator } from '../core/operators/knife/KnifeOperator'
import { MoveOperator } from '../core/operators/MoveOperator'
import { ProjectStorage } from '../core/storage/ProjectStorage'
import { useAnimationStore } from './animationStore'
import { useHistoryStore } from './historyStore'
import { useProjectStore } from './projectStore'
import { useToolStore } from './toolStore'

describe('historyStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('undo restores a mesh vertex after recordState', () => {
    const project = useProjectStore()
    const history = useHistoryStore()
    const mesh = project.activeMesh
    if (!mesh) throw new Error('expected default cube')
    const startX = mesh.vertices[0].position.x
    history.recordState('Move Vertex')
    mesh.vertices[0].position.x = startX + 3
    project.markGeometryUpdated()
    history.undo()
    expect(project.activeMesh?.vertices[0].position.x).toBe(startX)
  })

  it('undo restores pixels and bumps textureRevision', () => {
    const project = useProjectStore()
    const history = useHistoryStore()
    const buf = project.pixelBuffer
    const before = buf.getPixelHex(0, 0)
    const rev = project.textureRevision
    history.recordState('Paint Pixel')
    buf.drawBrush(0, 0, '#ff0000', 1, 1, 'square', true)
    project.markTextureUpdated()
    expect(project.textureRevision).toBeGreaterThan(rev)
    expect(buf.getPixelHex(0, 0).toLowerCase()).toBe('#ff0000')
    history.undo()
    expect(project.pixelBuffer.getPixelHex(0, 0).toLowerCase()).toBe(before.toLowerCase())
    expect(project.textureRevision).toBeGreaterThan(rev)
  })

  it('pushAction undoes to a snapshot captured before mutation', () => {
    const project = useProjectStore()
    const history = useHistoryStore()
    const mesh = project.activeMesh
    if (!mesh) throw new Error('expected default cube')
    const startX = mesh.vertices[0].position.x
    const baseline = history.captureSnapshot('Grab')
    mesh.vertices[0].position.x = startX + 4
    project.markGeometryUpdated()
    history.pushAction({
      description: 'Grab',
      timestamp: Date.now(),
      snapshot: baseline,
      undo: () => history.applySnapshot(baseline),
      redo: () => history.applySnapshot(baseline)
    })
    expect(project.activeMesh?.vertices[0].position.x).toBe(startX + 4)
    history.undo()
    expect(project.activeMesh?.vertices[0].position.x).toBe(startX)
  })

  it('markDirty makes an empty history stack count as unsaved', () => {
    const history = useHistoryStore()
    history.clearHistory()
    expect(history.isDirty()).toBe(false)
    history.markDirty()
    expect(history.isDirty()).toBe(true)
    history.markClean()
    expect(history.isDirty()).toBe(false)
  })

  it('tracks dirty until markClean', () => {
    const history = useHistoryStore()
    expect(history.isDirty()).toBe(false)
    history.recordState('Edit')
    expect(history.isDirty()).toBe(true)
    history.markClean()
    expect(history.isDirty()).toBe(false)
    history.undo()
    expect(history.isDirty()).toBe(true)
    history.clearHistory()
    expect(history.isDirty()).toBe(false)
  })

  it('restoreAutosaveSession drops the old undo stack so undo cannot revive the default cube', async () => {
    const project = useProjectStore()
    const history = useHistoryStore()
    const animation = useAnimationStore()
    const defaultName = project.activeMesh?.name
    history.recordState('Before Restore')
    project.activeMesh!.name = 'MutatedDefault'
    project.markGeometryUpdated()

    const recovered = createCube('RecoveredCube', 2)
    vi.spyOn(ProjectStorage, 'loadProject').mockResolvedValue({
      id: 'current_autosave',
      name: 'Recovered_Project',
      updatedAt: Date.now(),
      meshes: [recovered],
      materials: JSON.parse(JSON.stringify(project.materials)),
      activePalette: JSON.parse(JSON.stringify(project.activePalette)),
      textures: [],
      armature: JSON.parse(JSON.stringify(animation.armature))
    })

    const ok = await project.restoreAutosaveSession()
    expect(ok).toBe(true)
    expect(project.projectName).toBe('Recovered_Project')
    expect(project.activeMesh?.name).toBe('RecoveredCube')
    expect(history.undoStack.length).toBe(0)
    expect(project.showRecoveryBanner).toBe(false)
    expect(history.isDirty()).toBe(true)

    history.undo()
    expect(project.activeMesh?.name).toBe('RecoveredCube')
    expect(project.activeMesh?.name).not.toBe(defaultName)
    expect(project.activeMesh?.name).not.toBe('MutatedDefault')
  })

  it('modal extrude commit undoes to the snapshot taken before the first preview', () => {
    const project = useProjectStore()
    const history = useHistoryStore()
    const mesh = project.activeMesh
    if (!mesh) throw new Error('expected default cube')
    const startFaces = mesh.faces.length
    const startVerts = mesh.vertices.length
    const faceId = mesh.faces[0].id

    const baseline = history.captureSnapshot('Extrude', { includeTextures: false })
    const bridge = MeshBridge.meshObjectToEditableMesh(mesh)
    const faceNum = bridge.strToNumFaceId.get(faceId)
    if (faceNum == null) throw new Error('expected numeric face id')
    ExtrudeKernel.extrudeFaces(bridge.mesh, [faceNum])
    const updated = MeshBridge.editableMeshToMeshObject(
      bridge.mesh,
      mesh,
      bridge.numToStrVertId,
      bridge.numToStrFaceId
    )
    project.replaceMesh(updated)
    history.pushAction({
      description: 'Extrude',
      timestamp: Date.now(),
      snapshot: baseline,
      undo: () => history.applySnapshot(baseline),
      redo: () => history.applySnapshot(baseline)
    })

    expect(project.activeMesh?.faces.length).toBeGreaterThan(startFaces)
    expect(project.activeMesh?.vertices.length).toBeGreaterThan(startVerts)
    history.undo()
    expect(project.activeMesh?.faces.length).toBe(startFaces)
    expect(project.activeMesh?.vertices.length).toBe(startVerts)
    expect(project.activeMesh?.faces.some(f => f.id === faceId)).toBe(true)
  })

  it('subdivide records one history step that undo and redo round-trip', () => {
    const project = useProjectStore()
    const history = useHistoryStore()
    const tool = useToolStore()
    tool.selectMode = 'object'
    const mesh = project.activeMesh
    if (!mesh) throw new Error('expected default cube')
    const faces = mesh.faces.length
    const verts = mesh.vertices.length
    const n = history.undoStack.length
    project.performSubdivide('object')
    expect(history.undoStack.length).toBe(n + 1)
    expect(history.undoStack[history.undoStack.length - 1]?.description).toBe('Subdivide')
    expect(project.activeMesh?.faces.length).toBeGreaterThan(faces)
    expect(project.activeMesh?.vertices.length).toBeGreaterThan(verts)
    history.undo()
    expect(project.activeMesh?.faces.length).toBe(faces)
    expect(project.activeMesh?.vertices.length).toBe(verts)
    history.redo()
    expect(project.activeMesh?.faces.length).toBeGreaterThan(faces)
    expect(project.activeMesh?.vertices.length).toBeGreaterThan(verts)
  })

  it('edit-mode face subdivide undoes and redoes the selection', () => {
    const project = useProjectStore()
    const history = useHistoryStore()
    const mesh = project.activeMesh
    if (!mesh) throw new Error('expected default cube')
    const faceId = mesh.faces[0].id
    const faces = mesh.faces.length
    project.selectedFaceIds = [faceId]
    project.performSubdivide('face')
    expect(project.activeMesh?.faces.length).toBeGreaterThan(faces)
    history.undo()
    expect(project.activeMesh?.faces.length).toBe(faces)
    expect(project.selectedFaceIds).toEqual([faceId])
    history.redo()
    expect(project.activeMesh?.faces.length).toBeGreaterThan(faces)
  })

  it('project recordState skips texture clones; recordPixels keeps them', () => {
    const project = useProjectStore()
    const history = useHistoryStore()
    project.recordState('Extrude Face(s)')
    const meshSnap = history.undoStack[history.undoStack.length - 1]?.snapshot
    expect(meshSnap?.textures).toHaveLength(0)
    project.recordPixels('Pixel Paint')
    const paintSnap = history.undoStack[history.undoStack.length - 1]?.snapshot
    expect(paintSnap?.textures.length).toBeGreaterThan(0)
  })

  it('offsetMeshOrigin can skip a second history entry while scrubbing', () => {
    const project = useProjectStore()
    const history = useHistoryStore()
    const mesh = project.activeMesh
    if (!mesh) throw new Error('expected default cube')
    const startX = mesh.position.x
    project.recordState('Edit Origin')
    const n = history.undoStack.length
    project.offsetMeshOrigin(mesh.id, 0.25, 0, 0, 'Edit Origin X', { record: false })
    expect(history.undoStack.length).toBe(n)
    history.undo()
    expect(project.activeMesh?.position.x).toBeCloseTo(startX, 5)
  })

  it('addChildBone records one history entry from the store', () => {
    const history = useHistoryStore()
    const animation = useAnimationStore()
    animation.addRootBone()
    const afterRoot = history.undoStack.length
    const rootId = animation.selectedBoneId
    if (!rootId) throw new Error('expected root bone')
    animation.addChildBone(rootId)
    expect(history.undoStack.length).toBe(afterRoot + 1)
    expect(history.undoStack[history.undoStack.length - 1]?.description).toBe('Add Child Bone')
  })

  it('mesh-only undo keeps the live pixel buffer and textureRevision', () => {
    const project = useProjectStore()
    const history = useHistoryStore()
    const mesh = project.activeMesh
    if (!mesh) throw new Error('expected default cube')
    const buf = project.pixelBuffer
    const rev = project.textureRevision
    const startX = mesh.vertices[0].position.x
    history.recordState('Move Vertex')
    mesh.vertices[0].position.x = startX + 2
    project.markGeometryUpdated()
    history.undo()
    expect(project.activeMesh?.vertices[0].position.x).toBe(startX)
    expect(project.textureRevision).toBe(rev)
    expect(project.pixelBuffer).toBe(buf)
  })

  it('modal grab commit undoes to the snapshot taken before the first preview', () => {
    const project = useProjectStore()
    const history = useHistoryStore()
    const mesh = project.activeMesh
    if (!mesh) throw new Error('expected default cube')
    const startX = mesh.vertices[0].position.x

    const baseline = history.captureSnapshot('Grab', { includeTextures: false })
    const bridge = MeshBridge.meshObjectToEditableMesh(mesh)
    const vertNum = bridge.strToNumVertId.get(mesh.vertices[0].id)
    if (vertNum == null) throw new Error('expected numeric vert id')

    const camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.1, 100)
    camera.position.set(8, 8, 8)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()
    const viewport = document.createElement('div')
    viewport.getBoundingClientRect = () => ({
      x: 0, y: 0, left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, toJSON: () => ({})
    })
    const op = new MoveOperator()
    op.begin({
      mesh: bridge.mesh,
      selectedVertIds: [vertNum],
      selectedFaceIds: [],
      selectedEdgeIds: [],
      selectedMeshIds: [],
      isObjectMode: false,
      camera,
      viewportElement: viewport,
      pivotMode: 'MEDIAN',
      onUpdatePreview: () => {},
      onCommit: () => {},
      onCancel: () => {}
    } as any, { x: 400, y: 300 })
    op.keyDown(new KeyboardEvent('keydown', { key: 'x' }))
    op.keyDown(new KeyboardEvent('keydown', { key: '1' }))

    const updated = MeshBridge.editableMeshToMeshObject(
      bridge.mesh,
      mesh,
      bridge.numToStrVertId,
      bridge.numToStrFaceId
    )
    project.replaceMesh(updated)
    history.pushAction({
      description: 'Grab',
      timestamp: Date.now(),
      snapshot: baseline,
      undo: () => history.applySnapshot(baseline),
      redo: () => history.applySnapshot(baseline)
    })

    expect(project.activeMesh?.vertices[0].position.x).toBeCloseTo(startX + 1, 4)
    history.undo()
    expect(project.activeMesh?.vertices[0].position.x).toBeCloseTo(startX, 4)
  })

  it('selection record-before undo restores the previous vertex selection', () => {
    const project = useProjectStore()
    const history = useHistoryStore()
    const mesh = project.activeMesh
    if (!mesh) throw new Error('expected default cube')
    const first = mesh.vertices[0].id
    const second = mesh.vertices[1].id
    project.selectedVertexIds = [first]
    const buf = project.pixelBuffer
    history.recordState('Box Select Vertices', { includeTextures: false })
    project.selectedVertexIds = [second]
    history.undo()
    expect(project.selectedVertexIds).toEqual([first])
    expect(project.pixelBuffer).toBe(buf)
  })

  it('a texture-less snapshot does not wipe pixels on apply', () => {
    const project = useProjectStore()
    const history = useHistoryStore()
    const buf = project.pixelBuffer
    const count = project.textures.length
    const snap = history.captureSnapshot('Mesh Edit', { includeTextures: false })
    expect(snap.textures).toHaveLength(0)
    project.pixelBuffer.drawBrush(0, 0, '#00ff00', 1, 1, 'square', true)
    project.markTextureUpdated()
    history.applySnapshot(snap)
    expect(project.textures.length).toBe(count)
    expect(project.pixelBuffer).toBe(buf)
    expect(project.pixelBuffer.getPixelHex(0, 0).toLowerCase()).toBe('#00ff00')
  })

  it('import-style record-before undo restores the previous mesh count', () => {
    const project = useProjectStore()
    const history = useHistoryStore()
    const mesh = project.activeMesh
    if (!mesh) throw new Error('expected default cube')
    const count = project.meshes.length
    const sourceId = mesh.id
    project.recordPixels('Import OBJ (cube.obj)')
    const cloned = JSON.parse(JSON.stringify(mesh))
    cloned.id = 'imported_cube'
    cloned.name = 'ImportedCube'
    project.meshes.push(cloned)
    project.activeMeshId = cloned.id
    project.markGeometryUpdated()
    expect(project.meshes.length).toBe(count + 1)
    history.undo()
    expect(project.meshes.length).toBe(count)
    expect(project.meshes.some(m => m.id === 'imported_cube')).toBe(false)
    expect(project.activeMeshId).toBe(sourceId)
  })

  it('modifier edits undo to the snapshot taken before the toggle', () => {
    const project = useProjectStore()
    const history = useHistoryStore()
    project.addModifier('mirror')
    const mesh = project.activeMesh
    if (!mesh?.mirror) throw new Error('expected mirror modifier')
    const axisX = mesh.mirror.axisX
    project.recordState('Edit Modifier')
    mesh.mirror.axisX = !axisX
    project.markGeometryUpdated()
    history.undo()
    expect(project.activeMesh?.mirror?.axisX).toBe(axisX)
  })

  it('modal knife commit undoes to the snapshot taken before the cut', () => {
    const project = useProjectStore()
    const history = useHistoryStore()
    const mesh = project.activeMesh
    if (!mesh) throw new Error('expected default cube')
    const startFaces = mesh.faces.length
    const startVerts = mesh.vertices.length
    const face = mesh.faces[0]

    const baseline = history.captureSnapshot('Knife', { includeTextures: false })
    const bridge = MeshBridge.meshObjectToEditableMesh(mesh)
    const vA = bridge.strToNumVertId.get(face.vertexIds[0])
    const vB = bridge.strToNumVertId.get(face.vertexIds[2])
    if (vA == null || vB == null) throw new Error('expected numeric vert ids')

    const camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.1, 100)
    camera.position.set(8, 8, 8)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()
    const viewport = document.createElement('div')
    viewport.getBoundingClientRect = () => ({
      x: 0, y: 0, left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, toJSON: () => ({})
    })
    const op = new KnifeOperator()
    op.begin({
      mesh: bridge.mesh,
      selectedVertIds: [],
      selectedFaceIds: [],
      selectedEdgeIds: [],
      selectedMeshIds: [],
      isObjectMode: false,
      camera,
      viewportElement: viewport,
      pivotMode: 'MEDIAN',
      onUpdatePreview: () => {},
      onCommit: () => {},
      onCancel: () => {}
    } as any, { x: 400, y: 300 })

    const a = bridge.mesh.vertices.get(vA)
    const b = bridge.mesh.vertices.get(vB)
    if (!a || !b) throw new Error('expected knife endpoints')
    op.points = [
      { world: a.position.clone(), screen: new THREE.Vector2(), targetType: 'VERTEX', vertexId: vA },
      { world: b.position.clone(), screen: new THREE.Vector2(), targetType: 'VERTEX', vertexId: vB }
    ]
    op.confirm()

    const updated = MeshBridge.editableMeshToMeshObject(
      bridge.mesh,
      mesh,
      bridge.numToStrVertId,
      bridge.numToStrFaceId
    )
    project.replaceMesh(updated)
    history.pushAction({
      description: 'Knife',
      timestamp: Date.now(),
      snapshot: baseline,
      undo: () => history.applySnapshot(baseline),
      redo: () => history.applySnapshot(baseline)
    })

    expect(project.activeMesh?.faces.length).toBeGreaterThan(startFaces)
    expect(project.activeMesh?.vertices.length).toBeGreaterThanOrEqual(startVerts)
    history.undo()
    expect(project.activeMesh?.faces.length).toBe(startFaces)
    expect(project.activeMesh?.vertices.length).toBe(startVerts)
  })

  it('material edit record-before undo restores the previous color', () => {
    const project = useProjectStore()
    const history = useHistoryStore()
    const mat = project.materials[0]
    if (!mat) throw new Error('expected default material')
    const color = mat.color
    project.recordState('Edit Material')
    mat.color = '#ff00ff'
    project.markGeometryUpdated()
    history.undo()
    expect(project.materials[0]?.color).toBe(color)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})
