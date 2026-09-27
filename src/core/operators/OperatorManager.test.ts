import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { OperatorManager, inspectorClickRestartsModal, inspectorTargetInterruptsModal, modalCommitsOnUiInterrupt } from './OperatorManager'
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
  it('routes a rejected commit through cancel exactly once', () => {
    const mgr = new OperatorManager(), op = new FakeOp()
    let commits = 0, cancels = 0
    const ctx = stubContext(() => commits++, () => cancels++)
    ctx.validateCommit = () => false
    mgr.start(op, ctx, { x: 0, y: 0 })
    mgr.handleKeyDown(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(commits).toBe(0)
    expect(cancels).toBe(1)
    expect(op.cancelled).toBe(1)
    expect(mgr.activeOperator).toBeNull()
    expect(mgr.state.value.active).toBe(false)
    mgr.confirm()
    expect(cancels).toBe(1)
  })
  it('releases modal state when Enter confirms inside the operator', () => {
    const mgr = new OperatorManager(), op = new FakeOp()
    let commits = 0
    mgr.start(op, stubContext(() => { commits++ }, () => {}), { x: 0, y: 0 })
    mgr.handleKeyDown(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(commits).toBe(1)
    expect(mgr.activeOperator).toBeNull()
    expect(mgr.state.value.active).toBe(false)
    mgr.confirm()
    expect(commits).toBe(1)
  })
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

describe('inspector modal commit', () => {
  it('treats drag tools as ready to commit and leaves multi-step tools open', () => {
    expect(modalCommitsOnUiInterrupt('Bisect')).toBe(true)
    expect(modalCommitsOnUiInterrupt('Edge Slide')).toBe(true)
    expect(modalCommitsOnUiInterrupt('Move')).toBe(true)
    expect(modalCommitsOnUiInterrupt('Knife')).toBe(false)
    expect(modalCommitsOnUiInterrupt('Loop Cut')).toBe(false)
    expect(modalCommitsOnUiInterrupt('Poly Draw')).toBe(false)
    expect(modalCommitsOnUiInterrupt('')).toBe(false)
  })

  it('interrupts on inspector controls except cancel, and only swallows modal-tool buttons', () => {
    const host = document.createElement('div')
    const tool = document.createElement('button')
    tool.setAttribute('data-modal-tool', 'bisect')
    const cancel = document.createElement('button')
    cancel.setAttribute('data-modal-action', 'cancel')
    const apply = document.createElement('button')
    const confirm = document.createElement('button')
    confirm.setAttribute('data-modal-action', 'confirm')
    host.append(tool, cancel, apply, confirm)

    expect(inspectorTargetInterruptsModal(tool)).toBe(true)
    expect(inspectorTargetInterruptsModal(apply)).toBe(true)
    expect(inspectorTargetInterruptsModal(cancel)).toBe(false)
    expect(inspectorTargetInterruptsModal(confirm)).toBe(false)
    expect(inspectorTargetInterruptsModal(host)).toBe(false)
    expect(inspectorClickRestartsModal(tool)).toBe(true)
    expect(inspectorClickRestartsModal(apply)).toBe(false)
  })
})
