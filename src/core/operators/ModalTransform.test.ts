import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createCube } from '../geometry/Primitives'
import { MeshBridge } from '../mesh/MeshBridge'
import { MoveOperator } from './MoveOperator'
import { RotateOperator } from './RotateOperator'
import { ScaleOperator } from './ScaleOperator'
import type { OperatorContext } from './ModalOperator'

function fakeViewport(): HTMLElement {
  const el = document.createElement('div')
  el.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    width: 800,
    height: 600,
    right: 800,
    bottom: 600,
    toJSON: () => ({})
  })
  return el
}

function editContext(selectedVertIds: number[]): OperatorContext {
  const { mesh } = MeshBridge.meshObjectToEditableMesh(createCube('Cube', 2))
  const camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.1, 100)
  camera.position.set(8, 8, 8)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  return {
    mesh,
    selectedVertIds,
    selectedFaceIds: [],
    selectedEdgeIds: [],
    selectedMeshIds: [],
    isObjectMode: false,
    camera,
    viewportElement: fakeViewport(),
    pivotMode: 'MEDIAN',
    onUpdatePreview: () => {},
    onCommit: () => {},
    onCancel: () => {}
  }
}

function key(key: string, init: KeyboardEventInit = {}) {
  return new KeyboardEvent('keydown', { key, ...init })
}

describe('modal G/R/S numeric evaluate', () => {
  it('moves a vertex 1 unit on X when G then X then 1', () => {
    const ctx = editContext([])
    const vertId = [...ctx.mesh.vertices.keys()][0]
    ctx.selectedVertIds = [vertId]
    const start = ctx.mesh.vertices.get(vertId)!.position.clone()
    const op = new MoveOperator()
    op.begin(ctx, { x: 400, y: 300 })
    op.keyDown(key('x'))
    op.keyDown(key('1'))
    const after = ctx.mesh.vertices.get(vertId)!.position
    expect(after.x).toBeCloseTo(start.x + 1, 4)
    expect(after.y).toBeCloseTo(start.y, 4)
    expect(after.z).toBeCloseTo(start.z, 4)
  })

  it('scales two verts by 2 from the median', () => {
    const ctx = editContext([])
    const ids = [...ctx.mesh.vertices.keys()].slice(0, 2)
    ctx.selectedVertIds = ids
    const a0 = ctx.mesh.vertices.get(ids[0])!.position.clone()
    const b0 = ctx.mesh.vertices.get(ids[1])!.position.clone()
    const mid = a0.clone().add(b0).multiplyScalar(0.5)
    const op = new ScaleOperator()
    op.begin(ctx, { x: 400, y: 300 })
    op.keyDown(key('2'))
    const a1 = ctx.mesh.vertices.get(ids[0])!.position
    const b1 = ctx.mesh.vertices.get(ids[1])!.position
    expect(a1.distanceTo(mid)).toBeCloseTo(a0.distanceTo(mid) * 2, 4)
    expect(b1.distanceTo(mid)).toBeCloseTo(b0.distanceTo(mid) * 2, 4)
  })

  it('rotates 90° around Z', () => {
    const ctx = editContext([])
    const ids = [...ctx.mesh.vertices.keys()].slice(0, 2)
    ctx.selectedVertIds = ids
    const a0 = ctx.mesh.vertices.get(ids[0])!.position.clone()
    const b0 = ctx.mesh.vertices.get(ids[1])!.position.clone()
    const mid = a0.clone().add(b0).multiplyScalar(0.5)
    const op = new RotateOperator()
    op.begin(ctx, { x: 400, y: 300 })
    op.keyDown(key('z'))
    op.keyDown(key('9'))
    op.keyDown(key('0'))
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2)
    const expectA = a0.clone().sub(mid).applyQuaternion(q).add(mid)
    const expectB = b0.clone().sub(mid).applyQuaternion(q).add(mid)
    expect(ctx.mesh.vertices.get(ids[0])!.position.distanceTo(expectA)).toBeLessThan(1e-4)
    expect(ctx.mesh.vertices.get(ids[1])!.position.distanceTo(expectB)).toBeLessThan(1e-4)
  })
})

describe('object-mode G/R/S', () => {
  function objectContext() {
    const cube = createCube('Cube', 2)
    cube.position = { x: 1, y: 0, z: 0 }
    cube.rotation = { x: 0, y: 0, z: 0 }
    cube.scale = { x: 1, y: 0.4, z: 1 }
    const { mesh } = MeshBridge.meshObjectToEditableMesh(cube)
    const camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.1, 100)
    camera.position.set(8, 8, 8)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()
    return {
      cube,
      mesh,
      ctx: {
        mesh,
        selectedVertIds: [...mesh.vertices.keys()],
        selectedFaceIds: [],
        selectedEdgeIds: [],
        selectedMeshIds: [cube.id],
        isObjectMode: true,
        camera,
        viewportElement: fakeViewport(),
        pivotMode: 'MEDIAN' as const,
        allMeshes: [cube],
        targetMeshId: cube.id,
        onUpdatePreview: () => {},
        onCommit: () => {},
        onCancel: () => {},
      } satisfies OperatorContext
    }
  }

  it('G moves MeshObject.position and leaves local verts', () => {
    const { cube, mesh, ctx } = objectContext()
    const vertId = [...mesh.vertices.keys()][0]
    const local = mesh.vertices.get(vertId)!.position.clone()
    const op = new MoveOperator()
    op.begin(ctx, { x: 400, y: 300 })
    op.keyDown(key('x'))
    op.keyDown(key('1'))
    expect(cube.position.x).toBeCloseTo(2)
    expect(cube.scale.y).toBeCloseTo(0.4)
    expect(mesh.vertices.get(vertId)!.position.x).toBeCloseTo(local.x)
    expect(mesh.vertices.get(vertId)!.position.y).toBeCloseTo(local.y)
  })

  it('S scales MeshObject.scale around the origin', () => {
    const { cube, mesh, ctx } = objectContext()
    const vertId = [...mesh.vertices.keys()][0]
    const local = mesh.vertices.get(vertId)!.position.clone()
    const op = new ScaleOperator()
    op.begin(ctx, { x: 400, y: 300 })
    op.keyDown(key('2'))
    expect(cube.scale.x).toBeCloseTo(2)
    expect(cube.scale.y).toBeCloseTo(0.8)
    expect(cube.position.x).toBeCloseTo(1)
    expect(mesh.vertices.get(vertId)!.position.distanceTo(local)).toBeLessThan(1e-6)
  })

  it('R rotates MeshObject.rotation and keeps verts', () => {
    const { cube, mesh, ctx } = objectContext()
    const vertId = [...mesh.vertices.keys()][0]
    const local = mesh.vertices.get(vertId)!.position.clone()
    const op = new RotateOperator()
    op.begin(ctx, { x: 400, y: 300 })
    op.keyDown(key('z'))
    op.keyDown(key('9'))
    op.keyDown(key('0'))
    expect(cube.rotation.z).toBeCloseTo(90)
    expect(cube.position.x).toBeCloseTo(1)
    expect(mesh.vertices.get(vertId)!.position.distanceTo(local)).toBeLessThan(1e-6)
  })
})
