import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { EditableMesh } from '../mesh/MeshKernel'
import type { OperatorContext } from './ModalOperator'
import { BlockoutSketchOperator } from './BlockoutSketchOperator'

function context(): OperatorContext {
  const camera = new THREE.PerspectiveCamera(50, 4 / 3, 0.1, 100)
  camera.position.set(4, 4, 4)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  const viewportElement = document.createElement('div')
  viewportElement.getBoundingClientRect = () => ({
    x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600,
    toJSON: () => ({}),
  })
  return {
    mesh: new EditableMesh(),
    selectedVertIds: [],
    selectedFaceIds: [],
    selectedEdgeIds: [],
    selectedMeshIds: [],
    isObjectMode: false,
    camera,
    viewportElement,
    pivotMode: 'MEDIAN',
    previewGroup: new THREE.Group(),
    onUpdatePreview: vi.fn(),
    onCommit: vi.fn(),
    onCancel: vi.fn(),
  }
}

describe('BlockoutSketchOperator lifecycle', () => {
  it('cancels an unchanged sketch and restores its initial snapshot', () => {
    const ctx = context()
    const before = ctx.mesh.createSnapshot()
    const op = new BlockoutSketchOperator()
    op.begin(ctx, { x: 400, y: 300 })
    op.finishFromHud()
    expect(ctx.mesh.createSnapshot()).toEqual(before)
    expect(ctx.onCommit).not.toHaveBeenCalled()
    expect(ctx.onCancel).toHaveBeenCalledOnce()
  })

  it('Escape cancels without leaving preview geometry', () => {
    const ctx = context()
    const op = new BlockoutSketchOperator()
    op.begin(ctx, { x: 400, y: 300 })
    op.keyDown(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(ctx.previewGroup!.children).toHaveLength(0)
    expect(ctx.onCancel).toHaveBeenCalledOnce()
  })
})
