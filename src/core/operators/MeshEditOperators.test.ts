import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { createCube } from '../geometry/Primitives'
import { MeshBridge } from '../mesh/MeshBridge'
import { MeshValidator } from '../mesh/MeshValidator'
import type { OperatorContext } from './ModalOperator'
import { EdgeSlideOperator, OffsetEdgeLoopOperator, VertexSlideOperator } from './MeshEditOperators'

function viewport(): HTMLElement {
  const element = document.createElement('div')
  element.getBoundingClientRect = () => ({
    x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600,
    toJSON: () => ({}),
  })
  return element
}

function context(): OperatorContext {
  const { mesh } = MeshBridge.meshObjectToEditableMesh(createCube('Cube', 2))
  const camera = new THREE.PerspectiveCamera(50, 4 / 3, 0.1, 100)
  camera.position.set(8, 8, 8)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  return {
    mesh,
    selectedVertIds: [],
    selectedFaceIds: [],
    selectedEdgeIds: [],
    selectedMeshIds: [],
    isObjectMode: false,
    camera,
    viewportElement: viewport(),
    pivotMode: 'MEDIAN',
    onUpdatePreview: vi.fn(),
    onCommit: vi.fn(),
    onCancel: vi.fn(),
  }
}

describe('mesh slide operators', () => {
  it('edge slide previews valid positions and cancel restores the snapshot', () => {
    const ctx = context()
    ctx.selectedEdgeIds = [[...ctx.mesh.edges.keys()][0]!]
    const before = ctx.mesh.createSnapshot()
    const op = new EdgeSlideOperator()
    op.begin(ctx, { x: 400, y: 300 })
    op.pointerMove(new PointerEvent('pointermove', { clientX: 450, clientY: 300 }))
    expect(ctx.mesh.createSnapshot()).not.toEqual(before)
    expect(MeshValidator.validate(ctx.mesh).valid).toBe(true)
    op.cancel()
    expect(ctx.mesh.createSnapshot()).toEqual(before)
    expect(ctx.onCancel).toHaveBeenCalledOnce()
  })

  it('vertex slide confirms a position-only valid edit', () => {
    const ctx = context()
    const vertexId = [...ctx.mesh.vertices.keys()][0]!
    ctx.selectedVertIds = [vertexId]
    const before = ctx.mesh.vertices.get(vertexId)!.position.clone()
    const op = new VertexSlideOperator()
    op.begin(ctx, { x: 400, y: 300 })
    op.pointerMove(new PointerEvent('pointermove', { clientX: 440, clientY: 300 }))
    expect(ctx.mesh.vertices.get(vertexId)!.position.equals(before)).toBe(false)
    expect(MeshValidator.validate(ctx.mesh).valid).toBe(true)
    op.confirm()
    expect(ctx.onCommit).toHaveBeenCalledWith('Vertex Slide')
  })

  it('offset edge loop keeps a valid mesh and commits once', () => {
    const ctx = context()
    ctx.selectedEdgeIds = [[...ctx.mesh.edges.keys()][0]!]
    const op = new OffsetEdgeLoopOperator()
    op.begin(ctx, { x: 400, y: 300 })
    op.pointerMove(new PointerEvent('pointermove', { clientX: 430, clientY: 300 }))
    expect(MeshValidator.validate(ctx.mesh).valid).toBe(true)
    op.confirm()
    expect(ctx.onCommit).toHaveBeenCalledWith('Offset Edge Loop')
  })
})
