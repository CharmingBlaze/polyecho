import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { EditableMesh } from '../mesh/MeshKernel'
import { PolyBuildOperator } from './PolyBuildOperator'
import type { OperatorContext } from './ModalOperator'

function setup() {
  const mesh = new EditableMesh()
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100)
  camera.position.set(0, 0, 5)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  const viewportElement = document.createElement('div')
  Object.defineProperty(viewportElement, 'clientWidth', { value: 600 })
  Object.defineProperty(viewportElement, 'clientHeight', { value: 600 })
  viewportElement.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 600, height: 600, right: 600, bottom: 600, toJSON: () => ({}) })
  const ctx: OperatorContext = {
    mesh, camera, viewportElement, selectedVertIds: [], selectedFaceIds: [],
    selectedEdgeIds: [], selectedMeshIds: [], isObjectMode: false,
    pivotMode: 'MEDIAN', viewportKind: 'persp',
    onUpdatePreview: vi.fn(), onCommit: vi.fn(), onCancel: vi.fn()
  }
  const op = new PolyBuildOperator()
  op.begin(ctx, { x: 300, y: 300 })
  const add = (x: number, y: number, z = 0) => ({ vertId: mesh.addVertex(new THREE.Vector3(x, y, z)).id, isNew: true })
  return { mesh, ctx, op, add }
}

describe('Poly Build connected patches', () => {
  it('continues a quad strip with two more corners and cancels the whole session', () => {
    const { mesh, op, add, ctx } = setup()
    op.continueStrip = true
    op.chain = [add(0, 0), add(1, 0), add(1, 1), add(0, 1)]
    const lastEdge = op.chain.slice(-2).map(p => p.vertId).reverse()
    expect(op.fillFromHud()).toBe(true)
    expect(op.chain.map(p => p.vertId)).toEqual(lastEdge)
    op.chain.push(add(1, 2), add(0, 2))
    expect(op.fillFromHud()).toBe(true)
    expect(mesh.faces.size).toBe(2)
    expect(mesh.vertices.size).toBe(6)
    expect([...mesh.edges.values()].filter(e => e.faceIds.length === 2)).toHaveLength(1)
    op.cancel()
    expect(mesh.faces.size).toBe(0)
    expect(mesh.vertices.size).toBe(0)
    expect(ctx.onCancel).toHaveBeenCalledOnce()
  })

  it('fills a patch across different depths', () => {
    const { mesh, op, add } = setup()
    op.chain = [add(0, 0), add(1, 0), add(1, 1, 0.5), add(0, 1)]
    expect(op.fillFromHud()).toBe(true)
    expect(mesh.faces.size).toBe(2)
    expect(op.chain).toHaveLength(0)
  })

  it('keeps an invalid outline editable when Enter is pressed', () => {
    const { mesh, op, add, ctx } = setup()
    op.chain = [add(0, 0), add(1, 1), add(0, 1), add(1, 0)]
    op.keyDown(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(mesh.faces.size).toBe(0)
    expect(op.chain).toHaveLength(4)
    expect(op.statusText).toContain('crosses')
    expect(ctx.onCommit).not.toHaveBeenCalled()
  })
})
