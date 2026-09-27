import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createCube } from '../geometry/Primitives'
import { MeshBridge } from '../mesh/MeshBridge'
import { EditableMesh } from '../mesh/MeshKernel'
import { BridgeOperator } from './BridgeOperator'
import type { OperatorContext } from './ModalOperator'

function context(mesh: EditableMesh, edgeIds: number[]): OperatorContext {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100)
  camera.position.set(4, 4, 4)
  camera.lookAt(0, 0, 0)
  const el = document.createElement('div')
  el.getBoundingClientRect = () => ({
    x: 0, y: 0, left: 0, top: 0, width: 400, height: 400, right: 400, bottom: 400, toJSON: () => ({})
  })
  return {
    mesh,
    selectedVertIds: [],
    selectedFaceIds: [],
    selectedEdgeIds: edgeIds,
    selectedMeshIds: [],
    isObjectMode: false,
    camera,
    viewportElement: el,
    pivotMode: 'MEDIAN',
    onUpdatePreview: () => {},
    onCommit: () => {},
    onCancel: () => {}
  }
}

function openBoxWithLid() {
  const { mesh } = MeshBridge.meshObjectToEditableMesh(createCube('Cube', 2))
  let top = [...mesh.faces.values()][0]!
  const height = (faceId: number) => {
    const face = mesh.faces.get(faceId)!
    return face.vertexIds.reduce((sum, id) => sum + mesh.vertices.get(id)!.position.y, 0)
  }
  for (const face of mesh.faces.values()) {
    if (height(face.id) > height(top.id)) top = face
  }
  const rim = [...top.vertexIds]
  mesh.removeFace(top.id)
  const lid = rim.map(id => {
    const p = mesh.vertices.get(id)!.position.clone()
    p.y += 1
    return mesh.addVertex(p).id
  })
  mesh.addFace(lid)
  const boundary = [...mesh.edges.values()].filter(e => e.faceIds.length === 1).map(e => e.id)
  return { mesh, boundary, faces: mesh.faces.size }
}

describe('BridgeOperator', () => {
  it('previews a strip and commits one selection of new faces', () => {
    const { mesh, boundary, faces } = openBoxWithLid()
    const ctx = context(mesh, boundary)
    let committed = 0
    ctx.onCommit = () => { committed++ }
    const op = new BridgeOperator(1, 0)
    op.begin(ctx, { x: 40, y: 40 })
    expect(mesh.faces.size).toBe(faces + 4)
    expect(op.statusText).toContain('Segments: 1')
    op.pointerMove({ clientX: 40 + 56, clientY: 40 } as PointerEvent)
    expect(mesh.faces.size).toBe(faces + 12)
    expect(op.statusText).toContain('Segments: 3')
    op.confirm()
    expect(committed).toBe(1)
    expect(ctx.selectedFaceIds).toHaveLength(12)
  })

  it('drops a bad loop pair without committing', () => {
    const { mesh, faces } = openBoxWithLid()
    const ctx = context(mesh, [mesh.edges.values().next().value!.id])
    let cancelled = 0
    let committed = 0
    ctx.onCancel = () => { cancelled++ }
    ctx.onCommit = () => { committed++ }
    const op = new BridgeOperator()
    op.begin(ctx, { x: 10, y: 10 })
    expect(mesh.faces.size).toBe(faces)
    expect(op.statusText).toContain('two edge loops')
    op.confirm()
    expect(cancelled).toBe(1)
    expect(committed).toBe(0)
    expect(mesh.faces.size).toBe(faces)
  })

  it('scroll changes the twist of an intermediate ring', () => {
    const { mesh, boundary } = openBoxWithLid()
    const ctx = context(mesh, boundary)
    const op = new BridgeOperator(2, 0)
    op.begin(ctx, { x: 20, y: 20 })
    const before = [...mesh.vertices.values()].map(v => v.position.clone())
    op.wheel(new WheelEvent('wheel', { deltaY: -100 }))
    const after = [...mesh.vertices.values()]
    const moved = after.some((v, i) => before[i] && v.position.distanceTo(before[i]!) > 1e-4)
    expect(moved).toBe(true)
    expect(op.statusText).toContain('Twist: 1')
  })
})
