import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { PolyDrawOperator } from './PolyDrawOperator'
import { EditableMesh } from '../mesh/MeshKernel'
import { MeshValidator } from '../mesh/MeshValidator'
import type { OperatorContext } from './ModalOperator'

function setup() {
  const camera = new THREE.OrthographicCamera(-3, 3, 3, -3, 0.1, 100)
  camera.position.z = 10; camera.updateMatrixWorld()
  const viewport = document.createElement('div')
  viewport.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 600, height: 600, right: 600, bottom: 600, toJSON() {} })
  const ctx: OperatorContext = { mesh: new EditableMesh(), camera, viewportElement: viewport,
    selectedVertIds: [], selectedEdgeIds: [], selectedFaceIds: [], selectedMeshIds: [],
    isObjectMode: true, pivotMode: 'MEDIAN', viewportKind: 'front',
    onUpdatePreview: vi.fn(), onCommit: vi.fn(), onCancel: vi.fn() }
  const op = new PolyDrawOperator()
  op.begin(ctx, { x: 300, y: 300 })
  op.points = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => new THREE.Vector3(x, y, 0))
  op.closeFromHud()
  op.setOption('depth', 2)
  return { op, ctx }
}

describe('Poly Draw live options', () => {
  it('centers and tapers from the original shape without accumulating changes', () => {
    const { op, ctx } = setup()
    op.setOption('centered', true)
    op.setOption('taper', 0.5)
    const positions = [...ctx.mesh.vertices.values()].map(v => v.position)
    expect(Math.min(...positions.map(p => p.z))).toBe(-1)
    expect(Math.max(...positions.map(p => p.z))).toBe(1)
    expect(positions.filter(p => p.z === 1).every(p => Math.abs(p.x) === 0.5)).toBe(true)
    op.setOption('taper', 1)
    expect([...ctx.mesh.vertices.values()].every(v => Math.abs(v.position.x) === 1)).toBe(true)
    expect(MeshValidator.validate(ctx.mesh).valid).toBe(true)
  })

  it('rebuilds bevels without accumulating geometry, and removes them at zero', () => {
    const { op, ctx } = setup()
    const originalFaces = ctx.mesh.faces.size
    op.setOption('bevel', 0.1)
    expect(op.optionsError).toBe('')
    expect(ctx.mesh.faces.size).toBeGreaterThan(originalFaces)
    const count = ctx.mesh.faces.size
    op.setOption('bevel', 0.15)
    expect(ctx.mesh.faces.size).toBe(count)
    expect([...ctx.mesh.edges.values()].every(edge => edge.faceIds.length === 2)).toBe(true)
    op.setOption('segments', 3)
    op.setOption('profile', 0.5)
    expect(op.optionsError).toBe('')
    expect(MeshValidator.validate(ctx.mesh).valid).toBe(true)
    op.setOption('bevel', 0)
    expect(ctx.mesh.faces.size).toBe(originalFaces)
  })

  it('holds depth during pointer movement, commits once, and cancels cleanly', () => {
    const { op, ctx } = setup()
    op.pointerMove({ clientX: 400, clientY: 450, shiftKey: false, ctrlKey: false, altKey: false } as PointerEvent)
    expect(op.options.depth).toBe(2)
    op.confirm()
    expect(ctx.onCommit).toHaveBeenCalledOnce()
    const other = setup()
    other.op.setOption('bevel', 0.1)
    other.op.cancel()
    expect(other.ctx.mesh.faces.size).toBe(0)
    expect(other.ctx.mesh.vertices.size).toBe(0)
    expect(other.ctx.onCancel).toHaveBeenCalledOnce()
  })
})
