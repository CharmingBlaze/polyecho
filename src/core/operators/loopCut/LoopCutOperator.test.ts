import { afterEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { LoopCutOperator, LoopCutState } from './LoopCutOperator'
import { operatorManager } from '../OperatorManager'
import { MeshBridge } from '../../mesh/MeshBridge'
import { EditableMesh } from '../../mesh/MeshKernel'
import { createCube } from '../../geometry/Primitives'
import type { OperatorContext } from '../ModalOperator'

function setup() {
  const {mesh}=MeshBridge.meshObjectToEditableMesh(createCube('Cube',2))
  const camera=new THREE.OrthographicCamera(-2,2,2,-2,0.1,20)
  camera.position.z=5;camera.updateMatrixWorld()
  const el=document.createElement('div')
  el.getBoundingClientRect=()=>({left:0,top:0,width:600,height:600,right:600,bottom:600,x:0,y:0,toJSON:()=>({})})
  const ctx: OperatorContext={mesh,camera,viewportElement:el,selectedVertIds:[],selectedEdgeIds:[],selectedFaceIds:[],selectedMeshIds:[],isObjectMode:false,pivotMode:'MEDIAN',onUpdatePreview:vi.fn(),onCommit:vi.fn(),onCancel:vi.fn()}
  const onCommit=ctx.onCommit, onCancel=ctx.onCancel
  const op=new LoopCutOperator()
  operatorManager.start(op,ctx,{x:160,y:300})
  return {op,ctx,onCommit,onCancel}
}
afterEach(()=>operatorManager.cancel())
describe('Loop Cut interaction',()=>{
  it('locks a ring on the first click and cancels without changing the mesh',()=>{
    const {op,ctx,onCancel}=setup(), before=ctx.mesh.createSnapshot()
    expect(op.ringEdgeIds).toHaveLength(4)
    op.handlePointerDown(0)
    expect(op.loopState).toBe(LoopCutState.SLIDING)
    const edge=op.hoveredEdgeId
    op.pointerMove(new PointerEvent('pointermove',{clientX:420,clientY:250}))
    expect(op.hoveredEdgeId).toBe(edge)
    expect(ctx.mesh.createSnapshot()).toEqual(before)
    op.keyDown(new KeyboardEvent('keydown',{key:'Escape'}))
    expect(ctx.mesh.createSnapshot()).toEqual(before)
    expect(onCancel).toHaveBeenCalledOnce()
  })
  it('types multiple cuts and right-click applies them centered with selected new edges',()=>{
    const {op,ctx,onCommit}=setup()
    op.keyDown(new KeyboardEvent('keydown',{key:'3'}))
    expect(op.cutCount).toBe(3)
    op.advance()
    op.handlePointerDown(2)
    expect(onCommit).toHaveBeenCalledOnce()
    expect(ctx.selectedEdgeIds).toHaveLength(12)
    expect(ctx.mesh.faces.size).toBe(18)
  })
  it('accepts an exact slide factor and keeps dense cuts distinct at the limits',()=>{
    const {op,ctx}=setup()
    op.setCutCount(64);op.advance()
    op.keyDown(new KeyboardEvent('keydown',{key:'1'}))
    expect(op.previewSegments).toHaveLength(256)
    const ys=new Set(op.previewSegments.map(s=>s.p1.y.toFixed(6)))
    expect(ys.size).toBe(64)
    op.confirm()
    expect(ctx.selectedEdgeIds).toHaveLength(256)
    expect([...ctx.mesh.faces.values()].every(f=>f.vertexIds.length===4)).toBe(true)
  })
  it('tracks the pointer across the ring before the click', () => {
    const { op } = setup()
    const mark = () => op.previewSegments.map(s => `${s.p1.x.toFixed(2)}:${s.p2.x.toFixed(2)}:${s.p1.y.toFixed(2)}`).join('|')
    op.pointerMove(new PointerEvent('pointermove', { clientX: 200, clientY: 180 }))
    expect(op.ringEdgeIds.length).toBeGreaterThan(0)
    const first = mark()
    op.pointerMove(new PointerEvent('pointermove', { clientX: 420, clientY: 180 }))
    expect(op.hoveredEdgeId).not.toBeNull()
    expect(mark()).not.toBe(first)
  })
  it('finds a ring on an even n-gon', () => {
    const mesh = new EditableMesh()
    const ids: number[] = []
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3
      ids.push(mesh.addVertex(new THREE.Vector3(Math.cos(a), Math.sin(a), 0)).id)
    }
    mesh.addFace(ids)
    mesh.recalculateNormals()
    const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 20)
    camera.position.z = 5
    camera.updateMatrixWorld()
    const el = document.createElement('div')
    el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 600, right: 600, bottom: 600, x: 0, y: 0, toJSON: () => ({}) })
    const ctx: OperatorContext = {
      mesh, camera, viewportElement: el,
      selectedVertIds: [], selectedEdgeIds: [], selectedFaceIds: [], selectedMeshIds: [],
      isObjectMode: false, pivotMode: 'MEDIAN',
      onUpdatePreview: vi.fn(), onCommit: vi.fn(), onCancel: vi.fn(),
    }
    const op = new LoopCutOperator()
    operatorManager.start(op, ctx, { x: 300, y: 300 })
    expect(op.ringEdgeIds).toHaveLength(2)
    expect(op.previewSegments).toHaveLength(1)
    op.confirm()
    expect(ctx.mesh.faces.size).toBe(2)
    expect([...ctx.mesh.faces.values()].every(f => f.vertexIds.length >= 3)).toBe(true)
  })
})
