import { afterEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { LoopCutOperator, LoopCutState } from './LoopCutOperator'
import { operatorManager } from '../OperatorManager'
import { MeshBridge } from '../../mesh/MeshBridge'
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
})
