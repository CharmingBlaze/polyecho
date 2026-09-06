import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { OperatorManager } from './OperatorManager'
import { ModalOperator, type OperatorContext } from './ModalOperator'

class FakeOp extends ModalOperator {
  readonly name = 'FakeGrab'
  confirmed = 0
  cancelled = 0

  begin(ctx: OperatorContext) {
    this.ctx = ctx
    this.statusText = 'FakeGrab'
  }

  evaluate() {}
  updateStatus() {
    this.statusText = this.name
  }

  confirm() {
    this.confirmed++
    this.ctx.onCommit(this.name)
  }

  cancel() {
    this.cancelled++
    this.ctx.onCancel()
  }
}

function stubContext(onCommit: () => void, onCancel: () => void): OperatorContext {
  return {
    mesh: {} as OperatorContext['mesh'],
    selectedVertIds: [],
    selectedFaceIds: [],
    selectedEdgeIds: [],
    selectedMeshIds: [],
    isObjectMode: true,
    camera: new THREE.PerspectiveCamera(),
    viewportElement: document.createElement('div'),
    pivotMode: 'MEDIAN',
    onUpdatePreview: () => {},
    onCommit,
    onCancel
  }
}

describe('OperatorManager', () => {
  it('cancels the running operator when another starts, then confirm finishes', () => {
    const mgr = new OperatorManager()
    const first = new FakeOp()
    const second = new FakeOp()
    let commits = 0
    let cancels = 0
    const ctx = stubContext(() => { commits++ }, () => { cancels++ })

    mgr.start(first, ctx, { x: 0, y: 0 })
    expect(mgr.state.value.active).toBe(true)
    expect(mgr.state.value.operatorName).toBe('FakeGrab')

    mgr.start(second, ctx, { x: 1, y: 1 })
    expect(first.cancelled).toBe(1)
    expect(mgr.activeOperator).toBe(second)

    mgr.confirm()
    expect(second.confirmed).toBe(1)
    expect(commits).toBe(1)
    expect(mgr.state.value.active).toBe(false)
    expect(cancels).toBe(1)
  })
})
