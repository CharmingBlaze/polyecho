import { afterEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { ShapeDrawOperator } from './ShapeDrawOperator'
import { EditableMesh } from '../mesh/MeshKernel'
import type { OperatorContext } from './ModalOperator'
import type { ShapeRecipe } from '../shapeDraw/ShapeRecipe'

const source = (): ShapeRecipe => ({ version: 1, points: [{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }],
  origin: { x: 0, y: 0, z: 0 }, axisU: { x: 1, y: 0, z: 0 }, axisV: { x: 0, y: 1, z: 0 }, depth: 1, roundness: 0.8, density: 0, style: 'rounded' })
let active: ShapeDrawOperator | undefined
function setup(recipe = source()) {
  const viewport = document.createElement('div')
  viewport.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 600, height: 600, right: 600, bottom: 600, toJSON() {} })
  const camera = new THREE.OrthographicCamera(-3, 3, 3, -3, 0.1, 100)
  camera.position.z = 10; camera.updateMatrixWorld()
  const ctx: OperatorContext = { mesh: new EditableMesh(), selectedVertIds: [], selectedFaceIds: [], selectedEdgeIds: [], selectedMeshIds: [], isObjectMode: true,
    camera, viewportElement: viewport, pivotMode: 'MEDIAN', viewportKind: 'front', previewGroup: new THREE.Group(), snapGrid: false,
    onUpdatePreview: vi.fn(), onCommit: vi.fn(), onCancel: vi.fn() }
  const op = new ShapeDrawOperator(recipe); op.begin(ctx, { x: 300, y: 300 }); active = op
  return { op, ctx }
}
afterEach(() => { active?.cancel(); active = undefined })
describe('Shape Draw editing lifecycle', () => {
  it('reopens a copy and cancels without mutating its saved recipe', () => {
    const r = source(), { op, ctx } = setup(r)
    op.setParameter('depth', 2)
    expect(r.depth).toBe(1)
    expect(op.canFinish).toBe(true)
    op.cancel()
    expect(ctx.onCommit).not.toHaveBeenCalled()
    expect(ctx.previewGroup!.children).toHaveLength(0)
  })
  it('groups a continuous parameter gesture into one undo and redo', () => {
    const { op } = setup()
    op.beginParameterGesture(); op.setParameter('depth', 1.5); op.setParameter('depth', 2); op.endParameterGesture()
    op.history(); expect(op.recipe.depth).toBe(1); expect(op.canUndo).toBe(false)
    op.history(true); expect(op.recipe.depth).toBe(2)
  })
  it('retains valid preview but prevents accepting an invalid recipe', () => {
    const { op, ctx } = setup(), count = ctx.mesh.faces.size
    op.setParameter('depth', -1)
    expect(ctx.mesh.faces.size).toBe(count)
    expect(op.canFinish).toBe(false)
    op.history(); expect(op.canFinish).toBe(true)
  })
  it('edits an added loft section independently and restores it with undo', () => {
    const r = source(); r.kind = 'loft'; r.sections = [{ at: 1, points: structuredClone(r.points) }]
    const { op } = setup(r)
    op.addSection(); expect(op.recipe.sections).toHaveLength(2)
    op.scaleSection(0.5)
    expect(op.points[0].x).toBe(-0.5); expect(op.recipe.points[0].x).toBe(-1)
    op.history(); expect(op.recipe.sections![0].points[0].x).toBe(-1)
  })
})
