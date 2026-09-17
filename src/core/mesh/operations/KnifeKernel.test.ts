import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createCube } from '../../geometry/Primitives'
import { MeshBridge } from '../MeshBridge'
import { KnifeKernel } from './KnifeKernel'
import { KnifeOperator } from '../../operators/knife/KnifeOperator'

describe('KnifeKernel screen follow', () => {
  it('snaps overlay angles around the last point without changing distance', () => {
    const from = new THREE.Vector2(100, 100)
    const to = new THREE.Vector2(140, 105)
    const snapped = KnifeKernel.snapScreenToAngle(from, to, 45)
    const angle = Math.atan2(snapped.y - from.y, snapped.x - from.x)
    expect(Math.abs(angle) < 1e-6 || Math.abs(Math.abs(angle) - Math.PI / 4) < 1e-6).toBe(true)
    expect(snapped.distanceTo(from)).toBeCloseTo(to.distanceTo(from), 4)
  })
})

describe('KnifeKernel on arbitrary faces', () => {
  it('pokes a face and connects two interior cuts', () => {
    const { mesh } = MeshBridge.meshObjectToEditableMesh(createCube('Cube', 2))
    const top = [...mesh.faces.values()].find((f) =>
      f.vertexIds.every((id) => (mesh.vertices.get(id)?.position.y ?? 0) > 0.5)
    )
    expect(top).toBeTruthy()
    const beforeFaces = mesh.faces.size
    KnifeKernel.applyCuts(
      mesh,
      [
        {
          world: new THREE.Vector3(0, 1, 0.35),
          screen: new THREE.Vector2(0, 0),
          targetType: 'FACE',
          faceId: top!.id,
        },
        {
          world: new THREE.Vector3(0, 1, -0.35),
          screen: new THREE.Vector2(10, 0),
          targetType: 'FACE',
          faceId: top!.id,
        },
      ],
      {
        cutThrough: false,
        camera: new THREE.PerspectiveCamera(),
        viewportRect: { left: 0, top: 0, width: 100, height: 100 },
      }
    )
    expect(mesh.faces.size).toBeGreaterThan(beforeFaces)
    expect(mesh.vertices.size).toBeGreaterThan(8)
    for (const face of mesh.faces.values()) {
      expect(face.vertexIds.length).toBeGreaterThanOrEqual(3)
      expect(face.uvs.length).toBe(face.vertexIds.length)
    }
  })

  it('supports multi-chain cutting across different faces in one call', () => {
    const { mesh } = MeshBridge.meshObjectToEditableMesh(createCube('Cube', 2))
    const faces = [...mesh.faces.values()]
    const f1 = faces[0]!
    const f2 = faces[1]!
    const beforeFaces = mesh.faces.size

    KnifeKernel.applyCuts(
      mesh,
      [
        // Chain 1 on Face 1
        [
          { world: new THREE.Vector3(0, 1, 0.4), screen: new THREE.Vector2(0, 0), targetType: 'FACE', faceId: f1.id },
          { world: new THREE.Vector3(0, 1, -0.4), screen: new THREE.Vector2(10, 0), targetType: 'FACE', faceId: f1.id },
        ],
        // Chain 2 on Face 2
        [
          { world: new THREE.Vector3(0, -1, 0.4), screen: new THREE.Vector2(0, 0), targetType: 'FACE', faceId: f2.id },
          { world: new THREE.Vector3(0, -1, -0.4), screen: new THREE.Vector2(10, 0), targetType: 'FACE', faceId: f2.id },
        ],
      ],
      {
        cutThrough: false,
        camera: new THREE.PerspectiveCamera(),
        viewportRect: { left: 0, top: 0, width: 100, height: 100 },
      }
    )

    expect(mesh.faces.size).toBeGreaterThan(beforeFaces + 2)
  })
})

describe('KnifeOperator workflow and Blender parity', () => {
  it('supports newCut (E key) to finalize a stroke and keep completed chains', () => {
    const op = new KnifeOperator()
    const { mesh } = MeshBridge.meshObjectToEditableMesh(createCube('Cube', 2))
    const camera = new THREE.PerspectiveCamera()
    const el = document.createElement('div')

    op.begin({
      mesh,
      selectedVertIds: [],
      selectedFaceIds: [],
      selectedEdgeIds: [],
      selectedMeshIds: [],
      isObjectMode: false,
      camera,
      viewportElement: el,
      pivotMode: 'MEDIAN',
      onUpdatePreview: () => {},
      onCommit: () => {},
      onCancel: () => {},
    }, { x: 100, y: 100 })

    // Add 2 points to active chain
    op.currentChain.push(
      { world: new THREE.Vector3(0, 1, 0), screen: new THREE.Vector2(100, 100), targetType: 'FACE' },
      { world: new THREE.Vector3(0, 1, 1), screen: new THREE.Vector2(120, 100), targetType: 'FACE' }
    )
    expect(op.currentChain.length).toBe(2)

    // Press 'e' (new cut)
    const newCutHandled = op.keyDown(new KeyboardEvent('keydown', { key: 'e' }))
    expect(newCutHandled).toBe(true)
    expect(op.completedChains.length).toBe(1)
    expect(op.currentChain.length).toBe(0)

    // Undo should restore chain
    op.undoPoint()
    expect(op.completedChains.length).toBe(0)
    expect(op.currentChain.length).toBe(2)
  })

  it('toggles angle snapping and cut through with A and C keys', () => {
    const op = new KnifeOperator()
    const { mesh } = MeshBridge.meshObjectToEditableMesh(createCube('Cube', 2))
    const camera = new THREE.PerspectiveCamera()
    const el = document.createElement('div')

    op.begin({
      mesh,
      selectedVertIds: [],
      selectedFaceIds: [],
      selectedEdgeIds: [],
      selectedMeshIds: [],
      isObjectMode: false,
      camera,
      viewportElement: el,
      pivotMode: 'MEDIAN',
      onUpdatePreview: () => {},
      onCommit: () => {},
      onCancel: () => {},
    }, { x: 100, y: 100 })

    expect(op.cutThrough).toBe(false)
    op.keyDown(new KeyboardEvent('keydown', { key: 'c' }))
    expect(op.cutThrough).toBe(true)

    expect(op.angleSnapping).toBe(false)
    op.keyDown(new KeyboardEvent('keydown', { key: 'a' }))
    expect(op.angleSnapping).toBe(true)
  })
})


